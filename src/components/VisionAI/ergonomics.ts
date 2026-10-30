/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Ergonomía "honesta" para Vision AI.
 *
 * La ergonomía estimada con una sola cámara y un modelo de pose (MediaPipe) es una
 * herramienta de TAMIZAJE, no un dictamen:
 *  - Un estudio independiente (PLoS One, 2025) sobre una herramienta comercial de este tipo
 *    encontró baja concordancia con evaluadores humanos (κ ≈ 0.15–0.35): aceptable en tronco,
 *    pobre o incluso negativa en cuello, muñeca y antebrazo.
 *  - Murugan et al. (2024): la vista lateral (perfil) da el menor error en los ángulos.
 *
 * Por eso este módulo expone, además de la puntuación:
 *  1. Una confianza por segmento (visibilidad de los landmarks × fiabilidad conocida del
 *     segmento × factor según la vista de la cámara).
 *  2. Una estimación de la vista (lateral / oblicua / frontal).
 *  3. REBA (Hignett & McAtamney, 2000) junto al RULA existente.
 *
 * Nada de esto equivale a una evaluación ergonómica normativa; los resultados deben
 * confirmarse con un evaluador cuando la confianza sea baja.
 */
import type {
  Landmark, ErgoSegment, ConfidenceLevel, SegmentConfidence, SegmentConfidenceMap,
  CameraView, ViewEstimate, RebaRisk, RebaResult,
} from './types';

// ── Índices de MediaPipe Pose (33 landmarks, lado = lado del PROPIO operario) ──
export const POSE_IDX = {
  nose: 0,
  izquierdo: { ear: 7,  shoulder: 11, elbow: 13, wrist: 15, pinky: 17, index: 19, hip: 23, knee: 25, ankle: 27 },
  derecho:   { ear: 8,  shoulder: 12, elbow: 14, wrist: 16, pinky: 18, index: 20, hip: 24, knee: 26, ankle: 28 },
} as const;

type Side = 'izquierdo' | 'derecho';

/**
 * Relación ancho/alto del video. Los landmarks vienen normalizados (x ÷ ancho, y ÷ alto),
 * así que los ángulos se calculan con x × aspecto. CameraFeed pide 640×480 → 4:3.
 */
export const DEFAULT_ASPECT = 4 / 3;

/**
 * Fiabilidad conocida de cada segmento con cámara única (prior 0–1).
 * Valores ordinales elegidos a partir de la evidencia citada arriba (tronco el más fiable;
 * cuello, antebrazo y muñeca los menos). No son coeficientes publicados: son un orden de
 * magnitud para el semáforo y pueden recalibrarse con datos propios.
 */
export const SEGMENT_RELIABILITY: Record<ErgoSegment, number> = {
  tronco:    0.90,
  brazo:     0.75,
  piernas:   0.70,
  cuello:    0.50,
  antebrazo: 0.50,
  muneca:    0.40,
};

/** Penalización por vista: los ángulos de flexión son del plano sagital y se ven mejor de perfil. */
export const VIEW_FACTOR: Record<CameraView, number> = {
  lateral:     1.00,
  oblicua:     0.85,
  desconocida: 0.80,
  frontal:     0.65,
};

/** Tope de confianza para un segmento no medido que se asume neutro. */
const ASSUMED_CONFIDENCE = 0.1;
/** Visibilidad mínima para considerar que un landmark se "ve". */
const MIN_VISIBLE = 0.5;

export const SEGMENT_LABEL: Record<ErgoSegment, string> = {
  cuello: 'Cuello', tronco: 'Tronco', brazo: 'Brazo superior',
  antebrazo: 'Antebrazo', muneca: 'Muñeca', piernas: 'Piernas',
};

// ── Geometría 2D ──────────────────────────────────────────────────────────────
interface V2 { x: number; y: number }

const P = (lm: Landmark, aspect: number): V2 => ({ x: lm.x * aspect, y: lm.y });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const midpoint = (a: V2, b: V2): V2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const norm = (v: V2) => Math.hypot(v.x, v.y);
const cross = (a: V2, b: V2) => a.x * b.y - a.y * b.x;

/** Ángulo sin signo entre dos vectores, en grados (0–180). */
function angleBetween(u: V2, v: V2): number {
  const m = norm(u) * norm(v);
  if (m === 0) return 0;
  const c = Math.min(1, Math.max(-1, (u.x * v.x + u.y * v.y) / m));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Ángulo interior en b del triángulo a-b-c (grados). */
const angleAt = (a: V2, b: V2, c: V2) => angleBetween(sub(a, b), sub(c, b));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Visibilidad y confianza ───────────────────────────────────────────────────

/** Visibilidad de un landmark. Sin dato (p. ej. datos sintéticos) se asume 1; ausente = 0. */
export function landmarkVisibility(lm: Landmark | undefined): number {
  if (!lm) return 0;
  return typeof lm.visibility === 'number' ? clamp(lm.visibility, 0, 1) : 1;
}

function minVisibility(pose: Landmark[], idx: readonly number[]): number {
  return Math.min(...idx.map(i => landmarkVisibility(pose[i])));
}

/**
 * Convierte la visibilidad cruda de MediaPipe (0–1) en un factor 0–1 discriminante:
 * ≤ 0.3 → 0 (probablemente ocluido), ≥ 0.9 → 1, lineal en medio.
 */
export function visibilityScore(v: number): number {
  return clamp((v - 0.3) / 0.6, 0, 1);
}

export function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= 0.6) return 'alta';
  if (value >= 0.35) return 'media';
  return 'baja';
}

/** Visibilidad (mínima) de los landmarks que definen cada segmento. */
export function segmentVisibilities(pose: Landmark[], side: Side): Record<ErgoSegment, number> {
  const L = POSE_IDX.izquierdo, R = POSE_IDX.derecho, S = POSE_IDX[side];
  const N = POSE_IDX.nose;
  return {
    // Cuello y tronco usan puntos medios: basta con que se vea bien UN lado (de perfil,
    // el hombro/cadera lejanos quedan ocluidos y no deben castigar la vista recomendada).
    cuello:    Math.max(minVisibility(pose, [N, L.shoulder]), minVisibility(pose, [N, R.shoulder])),
    tronco:    Math.max(minVisibility(pose, [L.shoulder, L.hip]), minVisibility(pose, [R.shoulder, R.hip])),
    brazo:     minVisibility(pose, [S.shoulder, S.elbow]),
    antebrazo: minVisibility(pose, [S.shoulder, S.elbow, S.wrist]),
    muneca:    minVisibility(pose, [S.elbow, S.wrist, S.index]),
    piernas:   Math.max(minVisibility(pose, [L.hip, L.knee, L.ankle]), minVisibility(pose, [R.hip, R.knee, R.ankle])),
  };
}

/** Confianza de un segmento = prior de fiabilidad × visibilidad × factor de vista. */
export function segmentConfidence(segment: ErgoSegment, visibility: number, view: CameraView, assumed = false): SegmentConfidence {
  let value = SEGMENT_RELIABILITY[segment] * visibilityScore(visibility) * VIEW_FACTOR[view];
  if (assumed) value = Math.min(value, ASSUMED_CONFIDENCE);
  value = Math.round(value * 100) / 100;
  return { value, level: confidenceLevel(value), visibility: Math.round(visibility * 100) / 100, ...(assumed ? { assumed: true } : {}) };
}

export function computeSegmentConfidences(
  pose: Landmark[],
  side: Side,
  view: CameraView,
  assumed: Partial<Record<ErgoSegment, boolean>> = {},
): SegmentConfidenceMap {
  const vis = segmentVisibilities(pose, side);
  const out = {} as SegmentConfidenceMap;
  (Object.keys(vis) as ErgoSegment[]).forEach(seg => {
    out[seg] = segmentConfidence(seg, vis[seg], view, !!assumed[seg]);
  });
  return out;
}

/** Promedio de confianza de los segmentos indicados (por defecto, los cinco de RULA). */
export function overallConfidence(
  map: SegmentConfidenceMap,
  segments: ErgoSegment[] = ['cuello', 'tronco', 'brazo', 'antebrazo', 'muneca'],
): number {
  const avg = segments.reduce((s, k) => s + map[k].value, 0) / segments.length;
  return Math.round(avg * 100) / 100;
}

// ── Vista de la cámara ────────────────────────────────────────────────────────

/** Umbrales del cociente ancho de hombros / largo del torso. */
export const VIEW_THRESHOLDS = { frontal: 0.45, lateral: 0.25 } as const;

/**
 * Estima si la cámara ve al operario de lado, de frente u oblicuo.
 *
 * De frente, la distancia horizontal entre hombros es ~0.6–0.8 veces el largo del torso
 * (hombros→caderas); de perfil, los hombros se superponen y el cociente tiende a 0.
 * No se usa la coordenada z de MediaPipe porque es ruidosa con una sola cámara.
 */
export function estimateCameraView(pose: Landmark[], aspect = DEFAULT_ASPECT): ViewEstimate {
  const L = POSE_IDX.izquierdo, R = POSE_IDX.derecho;
  const ls = pose?.[L.shoulder], rs = pose?.[R.shoulder], lh = pose?.[L.hip], rh = pose?.[R.hip];
  if (!ls || !rs || !lh || !rh) return { view: 'desconocida', ratio: 0 };
  // Si ninguno de los hombros se ve, no hay base para opinar.
  if (Math.max(landmarkVisibility(ls), landmarkVisibility(rs)) < 0.3) return { view: 'desconocida', ratio: 0 };

  const shMid = midpoint(P(ls, aspect), P(rs, aspect));
  const hipMid = midpoint(P(lh, aspect), P(rh, aspect));
  const torso = norm(sub(shMid, hipMid));
  if (torso < 0.05) return { view: 'desconocida', ratio: 0 };

  const ratio = Math.round((Math.abs(ls.x - rs.x) * aspect / torso) * 100) / 100;
  const view: CameraView =
    ratio >= VIEW_THRESHOLDS.frontal ? 'frontal' :
    ratio < VIEW_THRESHOLDS.lateral  ? 'lateral' : 'oblicua';
  return { view, ratio };
}

// ── REBA (Hignett & McAtamney, 2000) ─────────────────────────────────────────
//
// Fuente: Hignett S, McAtamney L. "Rapid Entire Body Assessment (REBA)".
// Applied Ergonomics 2000; 31(2): 201–205. Tablas A, B y C transcritas de la hoja de
// puntuación REBA ampliamente reproducida a partir de ese artículo.
// Nota de verificación: las tablas son monótonas (comprobado en las pruebas). Las celdas
// que más varían entre reproducciones y conviene cotejar con el original si se requiere
// exactitud son la fila Cuello=3/Tronco=1 de la Tabla A (3,3,5,6) y la fila A=1 de la
// Tabla C (…,6,7,7,7). No hay otras celdas dudosas conocidas.

/** Tabla A [cuello 1–3][tronco 1–5][piernas 1–4]. */
export const REBA_TABLE_A: readonly (readonly (readonly number[])[])[] = [
  [ // Cuello 1
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [2, 4, 5, 6],
    [3, 5, 6, 7],
    [4, 6, 7, 8],
  ],
  [ // Cuello 2
    [1, 2, 3, 4],
    [3, 4, 5, 6],
    [4, 5, 6, 7],
    [5, 6, 7, 8],
    [6, 7, 8, 9],
  ],
  [ // Cuello 3
    [3, 3, 5, 6],
    [4, 5, 6, 7],
    [5, 6, 7, 8],
    [6, 7, 8, 9],
    [7, 8, 9, 9],
  ],
];

/** Tabla B [antebrazo 1–2][brazo 1–6][muñeca 1–3]. */
export const REBA_TABLE_B: readonly (readonly (readonly number[])[])[] = [
  [ // Antebrazo 1
    [1, 2, 2],
    [1, 2, 3],
    [3, 4, 5],
    [4, 5, 5],
    [6, 7, 8],
    [7, 8, 8],
  ],
  [ // Antebrazo 2
    [1, 2, 3],
    [2, 3, 4],
    [4, 5, 5],
    [5, 6, 7],
    [7, 8, 8],
    [8, 9, 9],
  ],
];

/** Tabla C [puntuación A 1–12][puntuación B 1–12]. */
export const REBA_TABLE_C: readonly (readonly number[])[] = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

const ci = (v: number, max: number) => clamp(Math.round(v), 1, max) - 1;

export function rebaTableA(trunk: number, neck: number, legs: number): number {
  return REBA_TABLE_A[ci(neck, 3)][ci(trunk, 5)][ci(legs, 4)];
}

export function rebaTableB(upperArm: number, lowerArm: number, wrist: number): number {
  return REBA_TABLE_B[ci(lowerArm, 2)][ci(upperArm, 6)][ci(wrist, 3)];
}

export function rebaTableC(scoreA: number, scoreB: number): number {
  return REBA_TABLE_C[ci(scoreA, 12)][ci(scoreB, 12)];
}

/** Niveles de acción REBA: 1 inapreciable · 2–3 bajo · 4–7 medio · 8–10 alto · 11–15 muy alto. */
export function rebaRiskLevel(score: number): RebaRisk {
  if (score <= 1) return 'inapreciable';
  if (score <= 3) return 'bajo';
  if (score <= 7) return 'medio';
  if (score <= 10) return 'alto';
  return 'muy alto';
}

export const REBA_RISK_INFO: Record<RebaRisk, { label: string; action: string; color: string }> = {
  'inapreciable': { label: 'Inapreciable', action: 'No es necesaria actuación',   color: '#22d3ee' },
  'bajo':         { label: 'Bajo',         action: 'Puede ser necesaria',         color: '#34d399' },
  'medio':        { label: 'Medio',        action: 'Es necesaria',                color: '#fbbf24' },
  'alto':         { label: 'Alto',         action: 'Es necesaria pronto',         color: '#fb923c' },
  'muy alto':     { label: 'Muy alto',     action: 'Actuación inmediata',         color: '#f43f5e' },
};

/**
 * Puntuaciones que la cámara NO puede observar. Por defecto valen 0:
 *  - load: carga/fuerza (0: < 5 kg; 1: 5–10 kg; 2: > 10 kg; +1 golpes o fuerza brusca).
 *  - coupling: calidad del agarre (0 bueno … 3 inaceptable).
 *  - activity: +1 por cada condición (postura estática > 1 min, repeticiones > 4/min,
 *    cambios posturales rápidos e importantes).
 * Asumir 0 puede SUBESTIMAR el riesgo; el evaluador debe completarlas.
 */
export interface RebaExtras { load?: number; coupling?: number; activity?: number }

export interface RebaComponents { trunk: number; neck: number; legs: number; upperArm: number; lowerArm: number; wrist: number }

/** Combina las puntuaciones parciales con las Tablas A, B y C. */
export function rebaFromComponents(c: RebaComponents, extras: RebaExtras = {}) {
  const load = clamp(Math.round(extras.load ?? 0), 0, 3);
  const coupling = clamp(Math.round(extras.coupling ?? 0), 0, 3);
  const activity = clamp(Math.round(extras.activity ?? 0), 0, 3);
  const scoreA = rebaTableA(c.trunk, c.neck, c.legs) + load;
  const scoreB = rebaTableB(c.upperArm, c.lowerArm, c.wrist) + coupling;
  const tableC = rebaTableC(scoreA, scoreB);
  const score = clamp(tableC + activity, 1, 15);
  return { score, risk: rebaRiskLevel(score), scoreA, scoreB, tableC };
}

// Puntuaciones parciales a partir de ángulos (sin los ajustes no observables).
export function rebaTrunkScore(angle: number, extension = false): number {
  // "Erguido" con tolerancia de 5° por ruido de la estimación de pose.
  if (angle <= 5) return 1;
  if (angle <= 20) return 2;
  if (extension || angle <= 60) return 3;
  return 4;
}

export function rebaNeckScore(angle: number): number {
  // 0–20° de flexión → 1; > 20° de flexión o extensión → 2. (+1 por giro/inclinación lateral: no medido.)
  return angle <= 20 ? 1 : 2;
}

export function rebaLegsScore(kneeFlexion: number | null): number {
  // Base 1 = apoyo bilateral (asumido: el apoyo unilateral no se detecta). +1 rodilla 30–60°, +2 > 60°.
  if (kneeFlexion == null) return 1;
  return 1 + (kneeFlexion > 60 ? 2 : kneeFlexion >= 30 ? 1 : 0);
}

export function rebaUpperArmScore(angle: number, extension = false): number {
  // −20° a 20° → 1; > 20° extensión o 20–45° flexión → 2; 45–90° → 3; > 90° → 4.
  // (+1 hombro elevado, +1 abducción, −1 brazo apoyado: no medidos.)
  if (angle <= 20) return 1;
  if (extension) return 2;
  if (angle <= 45) return 2;
  if (angle <= 90) return 3;
  return 4;
}

export function rebaLowerArmScore(elbowFlexion: number): number {
  return elbowFlexion >= 60 && elbowFlexion <= 100 ? 1 : 2;
}

export function rebaWristScore(angle: number | null): number {
  // 0–15° → 1; > 15° → 2. (+1 desviación o torsión: no medido.)
  if (angle == null) return 1;
  return angle > 15 ? 2 : 1;
}

export interface RebaOptions extends RebaExtras {
  aspect?: number;
  view?: ViewEstimate;
}

/**
 * Calcula REBA desde los landmarks de pose de una sola cámara.
 *
 * - Lado analizado: el brazo con mejor visibilidad (de perfil, el brazo lejano queda ocluido).
 * - Ángulos de brazo y cuello relativos al eje del tronco (no a la vertical).
 * - Piernas: flexión de rodilla si cadera, rodilla y tobillo son visibles; si no, se asumen
 *   neutras (puntuación 1) y la confianza de piernas baja.
 * - Muñeca: ángulo entre antebrazo y mano (muñeca → punto medio índice/meñique); si la mano no
 *   es visible se asume neutra (1).
 * - Ajustes de giro, inclinación lateral, hombro elevado, abducción y apoyo no se miden.
 * - Carga, agarre y actividad = 0 salvo que se indiquen (ver RebaExtras).
 */
export function calculateREBA(pose: Landmark[], opts: RebaOptions = {}): RebaResult | null {
  if (!pose || pose.length < 25) return null;
  const aspect = opts.aspect ?? DEFAULT_ASPECT;
  const view = opts.view ?? estimateCameraView(pose, aspect);
  const L = POSE_IDX.izquierdo, R = POSE_IDX.derecho;
  const core = [POSE_IDX.nose, L.shoulder, R.shoulder, L.hip, R.hip];
  if (core.some(i => !pose[i])) return null;

  // Lado con el brazo más visible (empate → izquierdo, igual que RULA).
  const armVis = (s: Side) => minVisibility(pose, [POSE_IDX[s].shoulder, POSE_IDX[s].elbow, POSE_IDX[s].wrist]);
  const side: Side = armVis('derecho') > armVis('izquierdo') ? 'derecho' : 'izquierdo';
  const S = POSE_IDX[side];
  if (!pose[S.elbow] || !pose[S.wrist]) return null;

  const at = (i: number) => P(pose[i], aspect);
  const shMid = midpoint(at(L.shoulder), at(R.shoulder));
  const hipMid = midpoint(at(L.hip), at(R.hip));
  const nose = at(POSE_IDX.nose);
  const trunkUp = sub(shMid, hipMid);
  const trunkDown = sub(hipMid, shMid);

  // Hacia dónde mira el operario en x (solo con vista no frontal): permite distinguir
  // flexión de extensión. 0 = desconocido → se trata como flexión (criterio conservador).
  const dxFace = nose.x - shMid.x;
  const facing = view.view !== 'frontal' && Math.abs(dxFace) > 0.02 ? Math.sign(dxFace) : 0;

  // Tronco: inclinación respecto a la vertical.
  const trunkAngle = angleBetween(trunkUp, { x: 0, y: -1 });
  const trunkExt = facing !== 0 && (shMid.x - hipMid.x) * facing < 0;

  // Cuello: de perfil, oreja respecto al hombro (la nariz siempre queda adelantada);
  // de frente, nariz respecto al punto medio de hombros.
  const ear = pose[S.ear];
  const useEar = view.view !== 'frontal' && !!ear && landmarkVisibility(ear) >= MIN_VISIBLE;
  const neckVec = useEar ? sub(at(S.ear), at(S.shoulder)) : sub(nose, shMid);
  const neckAngle = angleBetween(neckVec, trunkUp);

  // Piernas: mayor flexión de rodilla entre los lados visibles.
  let knee: number | null = null;
  for (const s of ['izquierdo', 'derecho'] as Side[]) {
    const k = POSE_IDX[s];
    if (pose[k.knee] && pose[k.ankle] && minVisibility(pose, [k.hip, k.knee, k.ankle]) >= MIN_VISIBLE) {
      const flex = 180 - angleAt(at(k.hip), at(k.knee), at(k.ankle));
      knee = knee == null ? flex : Math.max(knee, flex);
    }
  }
  const legsAssumed = knee == null;

  // Brazo: ángulo entre el brazo y el eje del tronco hacia abajo.
  const armVec = sub(at(S.elbow), at(S.shoulder));
  const upperArmAngle = angleBetween(armVec, trunkDown);
  const armExt = facing !== 0 && cross(trunkDown, armVec) * facing > 0;

  // Antebrazo: flexión de codo (0 = brazo estirado).
  const elbow = 180 - angleAt(at(S.shoulder), at(S.elbow), at(S.wrist));

  // Muñeca: desviación de la mano respecto al eje del antebrazo.
  let wrist: number | null = null;
  const handIdx = [S.index, S.pinky].filter(i => !!pose[i]);
  if (handIdx.length && minVisibility(pose, [S.elbow, S.wrist, ...handIdx]) >= MIN_VISIBLE) {
    const hand = handIdx.length === 2 ? midpoint(at(S.index), at(S.pinky)) : at(handIdx[0]);
    wrist = angleBetween(sub(at(S.wrist), at(S.elbow)), sub(hand, at(S.wrist)));
  }
  const wristAssumed = wrist == null;

  const components: RebaComponents = {
    trunk: rebaTrunkScore(trunkAngle, trunkExt),
    neck: rebaNeckScore(neckAngle),
    legs: rebaLegsScore(knee),
    upperArm: rebaUpperArmScore(upperArmAngle, armExt),
    lowerArm: rebaLowerArmScore(elbow),
    wrist: rebaWristScore(wrist),
  };
  const res = rebaFromComponents(components, opts);
  const confidence = computeSegmentConfidences(pose, side, view.view, { piernas: legsAssumed, muneca: wristAssumed });

  return {
    ...res,
    components,
    angles: {
      trunk: Math.round(trunkAngle),
      neck: Math.round(neckAngle),
      knee: knee == null ? null : Math.round(knee),
      upperArm: Math.round(upperArmAngle),
      elbow: Math.round(elbow),
      wrist: wrist == null ? null : Math.round(wrist),
    },
    side,
    legsAssumed,
    wristAssumed,
    confidence,
    overallConfidence: overallConfidence(confidence, ['cuello', 'tronco', 'piernas', 'brazo', 'antebrazo', 'muneca']),
  };
}

// ── Textos para la interfaz (semáforo de confianza) ───────────────────────────

export const CONFIDENCE_COLOR: Record<ConfidenceLevel, string> = {
  alta: '#34d399',
  media: '#fbbf24',
  baja: '#f43f5e',
};

const SEGMENT_EVIDENCE_NOTE: Record<ErgoSegment, string> = {
  tronco:    'Es el segmento con mejor concordancia frente a evaluadores humanos.',
  brazo:     'Concordancia moderada; el hombro elevado y la abducción no se miden.',
  cuello:    'Baja concordancia con evaluadores humanos en estudios con una sola cámara.',
  antebrazo: 'Baja concordancia con evaluadores humanos; sensible a oclusiones.',
  muneca:    'Es la medida menos fiable con una sola cámara: confírmala en persona.',
  piernas:   'Flexión de rodilla; el apoyo sobre un solo pie no se detecta.',
};

/** Explicación breve (tooltip) del punto de confianza de un segmento. */
export function confidenceExplanation(segment: ErgoSegment, conf: SegmentConfidence): string {
  const parts = [
    `${SEGMENT_LABEL[segment]}: confianza ${conf.level} (${Math.round(conf.value * 100)}%).`,
    conf.assumed
      ? 'No se ve bien: se asume postura neutra.'
      : `Visibilidad de los puntos: ${Math.round(conf.visibility * 100)}%.`,
    SEGMENT_EVIDENCE_NOTE[segment],
  ];
  return parts.join(' ');
}

export const VIEW_LABEL: Record<CameraView, string> = {
  lateral: 'Lateral (perfil)',
  oblicua: 'Oblicua',
  frontal: 'Frontal',
  desconocida: 'Sin determinar',
};
