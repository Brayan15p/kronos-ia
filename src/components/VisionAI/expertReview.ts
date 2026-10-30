/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Revisión del experto: corrección manual de RULA y REBA (lógica pura, sin React).
 *
 * La cámara única da un TAMIZAJE: los ángulos de muñeca, cuello y antebrazo tienen baja
 * concordancia con evaluadores humanos y varios factores de los métodos no se pueden observar
 * (giro de muñeca, hombro elevado, abducción, apoyo del brazo, uso muscular, carga, agarre,
 * actividad, giro e inclinación lateral). Aquí un ergónomo:
 *  1. corrige los ángulos medidos de cada segmento,
 *  2. completa los factores de ajuste que la cámara no ve, y
 *  3. obtiene RULA (McAtamney y Corlett, 1993) y REBA (Hignett y McAtamney, 2000) recalculados
 *     con LAS MISMAS funciones y tablas de ergonomics.ts (no se duplican tablas).
 * El valor del experto es el que debe usarse para decidir; el de la cámara queda como referencia.
 *
 * Además guarda cada par (cámara, experto) en localStorage para medir la concordancia
 * (diferencia absoluta media y % de acuerdo exacto) en la validación de campo.
 */
import type { CameraView, ErgoSegment, PostureScore, RebaRisk } from './types';
import {
  SEGMENT_LABEL,
  rulaUpperArmScore, rulaLowerArmScore, rulaWristScore, rulaNeckScore, rulaTrunkScore, rulaFromComponents,
  rebaTrunkScore, rebaNeckScore, rebaLegsScore, rebaUpperArmScore, rebaLowerArmScore, rebaWristScore, rebaFromComponents,
  type RulaComponents, type RebaComponents,
} from './ergonomics';
import { toCSV, SCOPE_NOTE, type CsvValue, type ExpertValidation } from '@/lib/sgsst';

// ── Entradas: ángulos por segmento ───────────────────────────────────────────

/** Orden de presentación de los segmentos en la revisión. */
export const REVIEW_SEGMENTS: ErgoSegment[] = ['tronco', 'cuello', 'brazo', 'antebrazo', 'muneca', 'piernas'];

/**
 * Ángulos (°) del lado evaluado:
 *  - tronco: respecto a la vertical; positivo = flexión, negativo = extensión.
 *  - cuello: respecto al eje del tronco; positivo = flexión, negativo = extensión.
 *  - brazo: respecto al eje del tronco; positivo = flexión, negativo = extensión.
 *  - antebrazo: flexión de codo (0 = brazo estirado).
 *  - muneca: flexión o extensión respecto al antebrazo (se usa el valor absoluto).
 *  - piernas: flexión de rodilla.
 * null = no observado: se puntúa como postura neutra (igual que hace la cámara).
 */
export type PostureAngles = Record<ErgoSegment, number | null>;

export interface SegmentMeta {
  /** Qué mide el ángulo (texto corto para la interfaz). */
  hint: string;
  min: number;
  max: number;
  /** Admite valores negativos (extensión). */
  signed: boolean;
  /** Bandas rápidas: valor representativo de cada banda del método. */
  bands: { label: string; value: number }[];
}

export const SEGMENT_META: Record<ErgoSegment, SegmentMeta> = {
  tronco: {
    hint: 'vs. vertical · negativo = extensión', min: -90, max: 180, signed: true,
    bands: [
      { label: 'Erguido', value: 0 }, { label: 'Ext. 0–20°', value: -10 }, { label: 'Ext. > 20°', value: -30 },
      { label: '0–20°', value: 10 }, { label: '20–60°', value: 40 }, { label: '> 60°', value: 75 },
    ],
  },
  cuello: {
    hint: 'vs. tronco · negativo = extensión', min: -90, max: 90, signed: true,
    bands: [
      { label: '0–10°', value: 5 }, { label: '10–20°', value: 15 }, { label: '> 20°', value: 30 }, { label: 'Extensión', value: -15 },
    ],
  },
  brazo: {
    hint: 'vs. tronco · negativo = extensión', min: -90, max: 180, signed: true,
    bands: [
      { label: '±20°', value: 0 }, { label: 'Ext. > 20°', value: -30 }, { label: '20–45°', value: 30 },
      { label: '45–90°', value: 70 }, { label: '> 90°', value: 110 },
    ],
  },
  antebrazo: {
    hint: 'flexión de codo · 0 = estirado', min: 0, max: 180, signed: false,
    bands: [{ label: '60–100°', value: 80 }, { label: '< 60°', value: 30 }, { label: '> 100°', value: 120 }],
  },
  muneca: {
    hint: 'flexión/extensión vs. antebrazo', min: 0, max: 90, signed: false,
    bands: [{ label: 'Neutra', value: 0 }, { label: '0–15°', value: 10 }, { label: '> 15°', value: 30 }],
  },
  piernas: {
    hint: 'flexión de rodilla', min: 0, max: 180, signed: false,
    bands: [{ label: 'Rectas', value: 0 }, { label: '30–60°', value: 45 }, { label: '> 60°', value: 75 }],
  },
};

// ── Entradas: factores de ajuste que la cámara no observa ───────────────────

/**
 * Factores de ajuste de RULA y REBA. Los valores por defecto son los MISMOS supuestos que usa
 * la cámara (todo neutro y sin carga), así que sin cambios el resultado coincide con la cámara.
 * Las observaciones posturales (hombro, giro, inclinación, apoyo) son comunes a ambos métodos.
 */
export interface ExpertFactors {
  /** Hombro elevado → RULA brazo +1; REBA brazo +1. */
  shoulderRaised: boolean;
  /** Brazo en abducción (o rotado) → RULA brazo +1; REBA brazo +1. */
  armAbducted: boolean;
  /** Brazo apoyado o postura a favor de la gravedad → RULA brazo −1; REBA brazo −1. */
  armSupported: boolean;
  /** Antebrazo cruza la línea media o trabaja hacia el lado → RULA antebrazo +1. */
  lowerArmMidline: boolean;
  /** Desviación radial/cubital de la muñeca → RULA muñeca +1; REBA muñeca +1. */
  wristDeviated: boolean;
  /** Giro de muñeca RULA: 1 = rango medio, 2 = en o cerca del final del rango (REBA muñeca +1). */
  wristTwist: number;
  /** Cuello girado → RULA cuello +1; REBA cuello +1 (giro o inclinación, una sola vez). */
  neckTwisted: boolean;
  /** Cuello inclinado lateralmente → RULA cuello +1; REBA cuello +1 (giro o inclinación). */
  neckSideBent: boolean;
  /** Tronco girado → RULA tronco +1; REBA tronco +1 (giro o inclinación, una sola vez). */
  trunkTwisted: boolean;
  /** Tronco inclinado lateralmente → RULA tronco +1; REBA tronco +1 (giro o inclinación). */
  trunkSideBent: boolean;
  /** Piernas/pies sin apoyo equilibrado (un pie, postura inestable) → RULA piernas 2; REBA piernas +1. */
  legsUnsupported: boolean;
  /** RULA uso muscular: 1 = postura estática > 1 min o repetida ≥ 4 veces/min. */
  muscleUse: number;
  /** RULA fuerza/carga: 0 < 2 kg intermitente · 1 2–10 kg intermitente · 2 2–10 kg estática o repetida · 3 > 10 kg o golpes. */
  rulaForce: number;
  /** REBA carga/fuerza: 0 < 5 kg · 1 5–10 kg · 2 > 10 kg · +1 golpes o fuerza brusca (máx. 3). */
  rebaLoad: number;
  /** REBA agarre: 0 bueno · 1 regular · 2 malo · 3 inaceptable. */
  coupling: number;
  /** REBA actividad: +1 por cada condición (estática > 1 min, repeticiones > 4/min, cambios bruscos o base inestable). */
  activity: number;
}

export type FactorKey = keyof ExpertFactors;

export const DEFAULT_FACTORS: ExpertFactors = {
  shoulderRaised: false, armAbducted: false, armSupported: false, lowerArmMidline: false,
  wristDeviated: false, wristTwist: 1,
  neckTwisted: false, neckSideBent: false, trunkTwisted: false, trunkSideBent: false,
  legsUnsupported: false,
  muscleUse: 0, rulaForce: 0, rebaLoad: 0, coupling: 0, activity: 0,
};

export interface FactorMeta {
  label: string;
  method: 'RULA' | 'REBA' | 'RULA y REBA';
  /** Opciones (factores numéricos); ausente = sí/no. */
  options?: { value: number; label: string }[];
}

export const FACTOR_META: Record<FactorKey, FactorMeta> = {
  shoulderRaised:  { label: 'Hombro elevado', method: 'RULA y REBA' },
  armAbducted:     { label: 'Brazo en abducción o rotado', method: 'RULA y REBA' },
  armSupported:    { label: 'Brazo apoyado (o a favor de la gravedad)', method: 'RULA y REBA' },
  lowerArmMidline: { label: 'Antebrazo cruza la línea media o trabaja hacia el lado', method: 'RULA' },
  wristDeviated:   { label: 'Muñeca con desviación radial/cubital', method: 'RULA y REBA' },
  wristTwist: {
    label: 'Giro de muñeca', method: 'RULA y REBA',
    options: [{ value: 1, label: 'Rango medio' }, { value: 2, label: 'Final del rango' }],
  },
  neckTwisted:     { label: 'Cuello girado', method: 'RULA y REBA' },
  neckSideBent:    { label: 'Cuello inclinado lateralmente', method: 'RULA y REBA' },
  trunkTwisted:    { label: 'Tronco girado', method: 'RULA y REBA' },
  trunkSideBent:   { label: 'Tronco inclinado lateralmente', method: 'RULA y REBA' },
  legsUnsupported: { label: 'Piernas sin apoyo equilibrado (un pie, inestable)', method: 'RULA y REBA' },
  muscleUse: {
    label: 'Uso muscular', method: 'RULA',
    options: [{ value: 0, label: 'No' }, { value: 1, label: 'Estática > 1 min o 4 o más rep./min' }],
  },
  rulaForce: {
    label: 'Fuerza / carga', method: 'RULA',
    options: [
      { value: 0, label: '< 2 kg intermitente' }, { value: 1, label: '2–10 kg intermitente' },
      { value: 2, label: '2–10 kg estática o repetida' }, { value: 3, label: '> 10 kg o golpes' },
    ],
  },
  rebaLoad: {
    label: 'Carga / fuerza', method: 'REBA',
    options: [
      { value: 0, label: '< 5 kg' }, { value: 1, label: '5–10 kg' }, { value: 2, label: '> 10 kg' },
      { value: 3, label: '> 10 kg con golpes o fuerza brusca' },
    ],
  },
  coupling: {
    label: 'Agarre', method: 'REBA',
    options: [{ value: 0, label: 'Bueno' }, { value: 1, label: 'Regular' }, { value: 2, label: 'Malo' }, { value: 3, label: 'Inaceptable' }],
  },
  activity: {
    label: 'Actividad', method: 'REBA',
    options: [{ value: 0, label: 'Ninguna condición' }, { value: 1, label: '1 condición' }, { value: 2, label: '2 condiciones' }, { value: 3, label: '3 condiciones' }],
  },
};

export const FACTOR_KEYS = Object.keys(DEFAULT_FACTORS) as FactorKey[];

// ── Cálculo (reutiliza las funciones y tablas de ergonomics.ts) ─────────────

const bit = (x: boolean) => (x ? 1 : 0);
const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
const abs0 = (v: number | null) => Math.abs(v ?? 0);
const isExt = (v: number | null) => (v ?? 0) < 0;
/** Codo sin dato → centro de la banda neutra 60–100°. */
const ELBOW_NEUTRAL = 80;

/** Puntuaciones parciales RULA con los factores de ajuste del método. */
export function rulaComponentsFrom(a: PostureAngles, f: ExpertFactors): RulaComponents {
  return {
    // Brazo: banda por ángulo; +1 hombro elevado, +1 abducción, −1 apoyado (rango 1–6).
    upperArm: clampInt(rulaUpperArmScore(abs0(a.brazo), isExt(a.brazo)) + bit(f.shoulderRaised) + bit(f.armAbducted) - bit(f.armSupported), 1, 6),
    // Antebrazo: 60–100° → 1, fuera → 2; +1 si cruza la línea media o trabaja hacia el lado (1–3).
    lowerArm: clampInt(rulaLowerArmScore(a.antebrazo ?? ELBOW_NEUTRAL) + bit(f.lowerArmMidline), 1, 3),
    // Muñeca: neutra 1, 0–15° 2, > 15° 3; +1 desviación (1–4).
    wrist: clampInt(rulaWristScore(a.muneca == null ? null : Math.abs(a.muneca)) + bit(f.wristDeviated), 1, 4),
    wristTwist: clampInt(f.wristTwist, 1, 2),
    // Cuello: 0–10° 1, 10–20° 2, > 20° 3, extensión 4; +1 giro, +1 inclinación lateral (1–6).
    neck: clampInt(rulaNeckScore(abs0(a.cuello), isExt(a.cuello)) + bit(f.neckTwisted) + bit(f.neckSideBent), 1, 6),
    // Tronco: erguido 1, 0–20° 2, 20–60° 3, > 60° 4; +1 giro, +1 inclinación lateral (1–6).
    trunk: clampInt(rulaTrunkScore(abs0(a.tronco)) + bit(f.trunkTwisted) + bit(f.trunkSideBent), 1, 6),
    // Piernas: apoyadas y equilibradas 1; si no, 2.
    legs: f.legsUnsupported ? 2 : 1,
  };
}

/** Puntuaciones parciales REBA con los factores de ajuste del método. */
export function rebaComponentsFrom(a: PostureAngles, f: ExpertFactors): RebaComponents {
  return {
    // Tronco: erguido 1, 0–20° 2, 20–60° o ext. > 20° 3, > 60° 4; +1 si girado o inclinado (1–5).
    trunk: clampInt(rebaTrunkScore(abs0(a.tronco), isExt(a.tronco)) + bit(f.trunkTwisted || f.trunkSideBent), 1, 5),
    // Cuello: 0–20° 1, > 20° o extensión 2; +1 si girado o inclinado (1–3).
    neck: clampInt(rebaNeckScore(abs0(a.cuello), isExt(a.cuello)) + bit(f.neckTwisted || f.neckSideBent), 1, 3),
    // Piernas: apoyo bilateral 1, unilateral/inestable 2; +1 rodilla 30–60°, +2 > 60° (1–4).
    legs: clampInt(rebaLegsScore(a.piernas) + bit(f.legsUnsupported), 1, 4),
    // Brazo: igual que RULA (1–6).
    upperArm: clampInt(rebaUpperArmScore(abs0(a.brazo), isExt(a.brazo)) + bit(f.shoulderRaised) + bit(f.armAbducted) - bit(f.armSupported), 1, 6),
    lowerArm: rebaLowerArmScore(a.antebrazo ?? ELBOW_NEUTRAL),
    // Muñeca: 0–15° 1, > 15° 2; +1 si desviada o girada (giro al final del rango) (1–3).
    wrist: clampInt(rebaWristScore(a.muneca == null ? null : Math.abs(a.muneca)) + bit(f.wristDeviated || f.wristTwist >= 2), 1, 3),
  };
}

export interface RulaRecalc {
  score: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  components: RulaComponents;
  tableA: number; tableB: number; scoreC: number; scoreD: number;
}

export interface RebaRecalc {
  score: number;
  risk: RebaRisk;
  components: RebaComponents;
  scoreA: number; scoreB: number; tableC: number;
}

export function recalcRULA(a: PostureAngles, f: ExpertFactors = DEFAULT_FACTORS): RulaRecalc {
  const components = rulaComponentsFrom(a, f);
  return { ...rulaFromComponents(components, { muscleUse: f.muscleUse, forceLoad: f.rulaForce }), components };
}

export function recalcREBA(a: PostureAngles, f: ExpertFactors = DEFAULT_FACTORS): RebaRecalc {
  const components = rebaComponentsFrom(a, f);
  return { ...rebaFromComponents(components, { load: f.rebaLoad, coupling: f.coupling, activity: f.activity }), components };
}

// ── De la postura medida a las entradas ─────────────────────────────────────

const signedAngle = (v: number, ext?: boolean) => (ext && v > 0 ? -v : v);

/** Ángulos medidos por la cámara (lado analizado por RULA), con signo de extensión. */
export function measuredAnglesFromPosture(p: PostureScore): PostureAngles {
  return {
    tronco: signedAngle(p.trunkAngle, p.extension?.trunk),
    cuello: signedAngle(p.neckAngle, p.extension?.neck),
    brazo: signedAngle(p.upperArmAngle, p.extension?.upperArm),
    antebrazo: p.forearmAngle,
    muneca: p.rulaDetail?.wristAssumed ? null : p.wristAngle,
    piernas: p.reba ? p.reba.angles.knee : null,
  };
}

/** Confianza 0–1 por segmento en el momento de la medición (vacío si no hay dato). */
export function confidenceFromPosture(p: PostureScore): Partial<Record<ErgoSegment, number>> {
  const out: Partial<Record<ErgoSegment, number>> = {};
  const map = p.confidence;
  if (!map) return out;
  for (const s of REVIEW_SEGMENTS) {
    // Piernas: la confianza de RULA no la mide; se toma la de REBA si existe.
    const c = s === 'piernas' ? (p.reba?.confidence.piernas ?? map.piernas) : map[s];
    if (c) out[s] = c.value;
  }
  return out;
}

/**
 * Peor postura de la sesión, para revisarla («postura crítica»). Primero las de confianza
 * media o alta (≥ 0,35: un fotograma ruidoso no debe ganar), luego mayor RULA, mayor REBA
 * y mayor confianza.
 */
export function isWorsePosture(candidate: PostureScore, current: PostureScore | null): boolean {
  if (!current) return true;
  const ok = (p: PostureScore) => (p.overallConfidence == null || p.overallConfidence >= 0.35 ? 1 : 0);
  const key = (p: PostureScore) => [ok(p), p.rula, p.reba?.score ?? 0, p.overallConfidence ?? 0];
  const a = key(candidate), b = key(current);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// ── Registro de la revisión ─────────────────────────────────────────────────

export type ReviewSource = 'actual' | 'critica';

export const REVIEW_SOURCE_LABEL: Record<ReviewSource, string> = {
  actual: 'Postura capturada',
  critica: 'Postura crítica de la sesión',
};

export interface ScorePair { rula: number; reba: number; rulaComponents: RulaComponents; rebaComponents: RebaComponents }

export interface ExpertReview {
  id: string;
  /** Puesto o estación (para el conjunto de validación). */
  puesto: string;
  reviewer: string;
  /** AAAA-MM-DD */
  date: string;
  note: string;
  /** ISO 8601 */
  createdAt: string;
  source: ReviewSource;
  view: CameraView | '';
  side: 'izquierdo' | 'derecho' | '';
  /** Ángulos de la cámara. */
  measured: PostureAngles;
  /** Confianza 0–1 de cada segmento al medir. */
  confidence: Partial<Record<ErgoSegment, number>>;
  /** Ángulos que usa el experto. */
  angles: PostureAngles;
  factors: ExpertFactors;
  overriddenAngles: ErgoSegment[];
  overriddenFactors: FactorKey[];
  /** Cámara: ángulos medidos con los supuestos por defecto. */
  camera: ScorePair;
  /** Experto: ángulos y factores corregidos. */
  expert: ScorePair;
}

export interface ExpertReviewInput {
  id: string;
  measured: PostureAngles;
  angles: PostureAngles;
  factors: ExpertFactors;
  reviewer: string;
  date: string;
  note?: string;
  puesto?: string;
  createdAt?: string;
  source?: ReviewSource;
  view?: CameraView | '';
  side?: 'izquierdo' | 'derecho' | '';
  confidence?: Partial<Record<ErgoSegment, number>>;
}

const sameAngle = (a: number | null, b: number | null) =>
  a == null || b == null ? a === b : Math.round(a) === Math.round(b);

export function overriddenAngles(measured: PostureAngles, angles: PostureAngles): ErgoSegment[] {
  return REVIEW_SEGMENTS.filter(s => !sameAngle(measured[s], angles[s]));
}

export function overriddenFactors(f: ExpertFactors): FactorKey[] {
  return FACTOR_KEYS.filter(k => f[k] !== DEFAULT_FACTORS[k]);
}

const scorePair = (a: PostureAngles, f: ExpertFactors): ScorePair => {
  const r = recalcRULA(a, f), b = recalcREBA(a, f);
  return { rula: r.score, reba: b.score, rulaComponents: r.components, rebaComponents: b.components };
};

export function createExpertReview(i: ExpertReviewInput): ExpertReview {
  const factors = { ...DEFAULT_FACTORS, ...i.factors };
  return {
    id: i.id,
    puesto: (i.puesto ?? '').trim(),
    reviewer: i.reviewer.trim(),
    date: i.date,
    note: (i.note ?? '').trim(),
    createdAt: i.createdAt ?? new Date().toISOString(),
    source: i.source ?? 'actual',
    view: i.view ?? '',
    side: i.side ?? '',
    measured: { ...i.measured },
    confidence: { ...(i.confidence ?? {}) },
    angles: { ...i.angles },
    factors,
    overriddenAngles: overriddenAngles(i.measured, i.angles),
    overriddenFactors: overriddenFactors(factors),
    camera: scorePair(i.measured, DEFAULT_FACTORS),
    expert: scorePair(i.angles, factors),
  };
}

// ── Textos ──────────────────────────────────────────────────────────────────

export const fmtAngle = (v: number | null) => (v == null ? 'no visible' : `${Math.round(v)}°`);

export function fmtFactor(k: FactorKey, v: ExpertFactors[FactorKey]): string {
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return FACTOR_META[k].options?.find(o => o.value === v)?.label ?? String(v);
}

/** Campos corregidos legibles («Muñeca: de 8° a 25°», «Hombro elevado: sí»). */
export function correctedFields(r: ExpertReview): string[] {
  return [
    ...r.overriddenAngles.map(s => `${SEGMENT_LABEL[s]}: de ${fmtAngle(r.measured[s])} a ${fmtAngle(r.angles[s])}`),
    ...r.overriddenFactors.map(k => `${FACTOR_META[k].label} (${FACTOR_META[k].method}): ${fmtFactor(k, r.factors[k])}`),
  ];
}

/** Resumen que se guarda con la evaluación del Paquete SG-SST. */
export function toExpertValidation(r: ExpertReview): ExpertValidation {
  return {
    rula: r.expert.rula,
    reba: r.expert.reba,
    rulaCamara: r.camera.rula,
    rebaCamara: r.camera.reba,
    revisor: r.reviewer,
    fecha: r.date,
    nota: r.note,
    campos: correctedFields(r),
  };
}

export const RULA_ACTION: Record<'low' | 'medium' | 'high' | 'critical', string> = {
  low: 'Aceptable',
  medium: 'Investigar',
  high: 'Cambiar pronto',
  critical: 'Cambiar ya',
};

export const EXPERT_NOTE =
  'La estimación de la cámara es un tamizaje. El valor revisado por el experto es el que debe usarse para tomar decisiones.';

// ── Conjunto de validación (localStorage) ───────────────────────────────────

export const VALIDATION_STORAGE_KEY = 'kronos_expert_validation_v1';
/** Tope de pares guardados (los más antiguos se descartan). */
export const VALIDATION_MAX = 500;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseAngles(v: unknown): PostureAngles | null {
  if (!isObj(v)) return null;
  const out = {} as PostureAngles;
  for (const s of REVIEW_SEGMENTS) out[s] = numOrNull(v[s]);
  return out;
}

function parseFactors(v: unknown): ExpertFactors {
  const f: Record<string, unknown> = { ...DEFAULT_FACTORS };
  if (!isObj(v)) return f as unknown as ExpertFactors;
  for (const k of FACTOR_KEYS) {
    const d = DEFAULT_FACTORS[k];
    const x = v[k];
    if (typeof d === 'boolean' && typeof x === 'boolean') f[k] = x;
    if (typeof d === 'number' && typeof x === 'number' && Number.isFinite(x)) f[k] = x;
  }
  return f as unknown as ExpertFactors;
}

/**
 * Lectura tolerante de una revisión guardada. Las puntuaciones se RECALCULAN desde los
 * ángulos y factores (la fuente de verdad), así un dato editado a mano no queda incoherente.
 */
export function parseExpertReview(v: unknown): ExpertReview | null {
  if (!isObj(v) || !str(v.id)) return null;
  const measured = parseAngles(v.measured);
  const angles = parseAngles(v.angles);
  if (!measured || !angles) return null;
  const conf: Partial<Record<ErgoSegment, number>> = {};
  if (isObj(v.confidence)) {
    for (const s of REVIEW_SEGMENTS) {
      const c = numOrNull(v.confidence[s]);
      if (c != null) conf[s] = c;
    }
  }
  const view = str(v.view) as CameraView | '';
  const side = str(v.side);
  return createExpertReview({
    id: str(v.id),
    measured,
    angles,
    factors: parseFactors(v.factors),
    reviewer: str(v.reviewer),
    date: str(v.date),
    note: str(v.note),
    puesto: str(v.puesto),
    createdAt: str(v.createdAt),
    source: v.source === 'critica' ? 'critica' : 'actual',
    view: (['lateral', 'oblicua', 'frontal', 'desconocida'] as string[]).includes(view) ? view : '',
    side: side === 'izquierdo' || side === 'derecho' ? side : '',
    confidence: conf,
  });
}

export function parseValidationDataset(raw: string | null): ExpertReview[] {
  if (!raw) return [];
  try {
    const d: unknown = JSON.parse(raw);
    return Array.isArray(d) ? d.map(parseExpertReview).filter((x): x is ExpertReview => x !== null) : [];
  } catch {
    return [];
  }
}

export function loadValidationDataset(): ExpertReview[] {
  try {
    return parseValidationDataset(localStorage.getItem(VALIDATION_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveValidationDataset(list: ExpertReview[]): void {
  try {
    localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Añade (o reemplaza, si ya existe el id) un par cámara/experto. Devuelve la lista nueva. */
export function addToValidationDataset(r: ExpertReview): ExpertReview[] {
  const list = loadValidationDataset().filter(x => x.id !== r.id);
  const next = [...list, r].slice(-VALIDATION_MAX);
  saveValidationDataset(next);
  return next;
}

export function removeFromValidationDataset(id: string): ExpertReview[] {
  const next = loadValidationDataset().filter(x => x.id !== id);
  saveValidationDataset(next);
  return next;
}

export function clearValidationDataset(): void {
  try {
    localStorage.removeItem(VALIDATION_STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

// ── Concordancia cámara vs experto ──────────────────────────────────────────

/**
 * Banda del método para el ángulo de un segmento, SIN factores de ajuste (la cámara no los
 * observa, así que no entran en la concordancia de ángulos): RULA para tronco, cuello, brazo,
 * antebrazo y muñeca; REBA para piernas (RULA no usa la flexión de rodilla).
 */
export function segmentBand(s: ErgoSegment, v: number | null): number {
  switch (s) {
    case 'tronco': return rulaTrunkScore(abs0(v));
    case 'cuello': return rulaNeckScore(abs0(v), isExt(v));
    case 'brazo': return rulaUpperArmScore(abs0(v), isExt(v));
    case 'antebrazo': return rulaLowerArmScore(v ?? ELBOW_NEUTRAL);
    case 'muneca': return rulaWristScore(v == null ? null : Math.abs(v));
    case 'piernas': return rebaLegsScore(v);
  }
}

export interface SegmentAgreement {
  /** Pares con ángulo de cámara y de experto. */
  n: number;
  /** Diferencia absoluta media del ángulo (°). */
  madDeg: number | null;
  /** % de pares en la misma banda del método. */
  exactPct: number | null;
}

export interface ScoreAgreement {
  n: number;
  /** Diferencia absoluta media de la puntuación final. */
  mad: number | null;
  /** % de acuerdo exacto. */
  exactPct: number | null;
  /** % de pares que difieren como mucho en 1 punto. */
  within1Pct: number | null;
  /** Diferencia media con signo (experto − cámara): > 0 = la cámara subestima. */
  meanDiff: number | null;
}

export interface AgreementSummary {
  n: number;
  segments: Record<ErgoSegment, SegmentAgreement>;
  rula: ScoreAgreement;
  reba: ScoreAgreement;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (k: number, n: number) => (n ? Math.round((k / n) * 100) : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function scoreAgreement(pairs: [number, number][]): ScoreAgreement {
  const n = pairs.length;
  const diffs = pairs.map(([c, e]) => e - c);
  const m = mean(diffs.map(Math.abs));
  const md = mean(diffs);
  return {
    n,
    mad: m == null ? null : round1(m),
    exactPct: pct(diffs.filter(d => d === 0).length, n),
    within1Pct: pct(diffs.filter(d => Math.abs(d) <= 1).length, n),
    meanDiff: md == null ? null : round1(md),
  };
}

export function agreementSummary(list: ExpertReview[]): AgreementSummary {
  const segments = {} as Record<ErgoSegment, SegmentAgreement>;
  for (const s of REVIEW_SEGMENTS) {
    const both = list.filter(r => r.measured[s] != null && r.angles[s] != null);
    const m = mean(both.map(r => Math.abs((r.angles[s] as number) - (r.measured[s] as number))));
    segments[s] = {
      n: both.length,
      madDeg: m == null ? null : round1(m),
      exactPct: pct(both.filter(r => segmentBand(s, r.measured[s]) === segmentBand(s, r.angles[s])).length, both.length),
    };
  }
  return {
    n: list.length,
    segments,
    rula: scoreAgreement(list.map(r => [r.camera.rula, r.expert.rula])),
    reba: scoreAgreement(list.map(r => [r.camera.reba, r.expert.reba])),
  };
}

// ── CSV del conjunto de validación ──────────────────────────────────────────

const fmtConf = (c: number | undefined) => (c == null ? null : Math.round(c * 100) / 100);

export const VALIDATION_CSV_HEADERS: string[] = [
  'Fecha', 'Puesto', 'Revisó', 'Vista', 'Lado', 'Postura',
  ...REVIEW_SEGMENTS.flatMap(s => [`${SEGMENT_LABEL[s]} cámara (°)`, `${SEGMENT_LABEL[s]} experto (°)`, `${SEGMENT_LABEL[s]} confianza`]),
  'RULA cámara', 'RULA experto', 'Diferencia RULA', 'REBA cámara', 'REBA experto', 'Diferencia REBA',
  'Campos corregidos', 'Nota',
];

export function validationToCSV(list: ExpertReview[]): string {
  const rows: CsvValue[][] = list.map(r => [
    r.date, r.puesto, r.reviewer, r.view, r.side, REVIEW_SOURCE_LABEL[r.source],
    ...REVIEW_SEGMENTS.flatMap(s => [r.measured[s] == null ? null : Math.round(r.measured[s] as number), r.angles[s] == null ? null : Math.round(r.angles[s] as number), fmtConf(r.confidence[s])]),
    r.camera.rula, r.expert.rula, r.expert.rula - r.camera.rula,
    r.camera.reba, r.expert.reba, r.expert.reba - r.camera.reba,
    correctedFields(r).join(' | '), r.note,
  ]);
  return toCSV(VALIDATION_CSV_HEADERS, rows, [
    'Validación de RULA/REBA: cámara (tamizaje) frente a experto',
    'Ángulos con signo: negativo = extensión. Vacío = no visible para la cámara (se asume neutro).',
    SCOPE_NOTE,
  ]);
}
