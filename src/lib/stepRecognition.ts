/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Pasos automáticos desde el video: reconoce en qué paso del método está el operario a partir
// de la trayectoria de las manos, sin cronometrista.
//
// 1. Enseñar: en un ciclo de referencia el observador marca dónde empieza cada paso. Cada paso
//    queda como una plantilla (trayectoria de las muñecas remuestreada a RATE_HZ).
// 2. Reconocer: cada ciclo nuevo se alinea contra la cadena de plantillas con DTW (tolera hacer
//    un paso más rápido o más lento). La cadena va en orden y permite saltarse pasos pagando una
//    penalización: si forzar un paso cuesta más que saltarlo, el paso queda como omitido.
//
// Medido con ciclos sintéticos (100 por nivel, src/test/stepRecognition.test.ts genera el movimiento):
// con ruido ≤ 0,1 ancho de hombro y pasos de 0,6× a 1,6× del ritmo de referencia: 0 omisiones falsas,
// 100 % de omisiones detectadas y error medio de 0,12 s por paso. Con ruido 0,25 sigue sin inventar
// omisiones pero detecta ~50 % y la confianza baja a "media". Un paso hecho más de 2× más rápido
// que la referencia puede salir como omitido (permitir 3× bajaba la detección al ~55 %).
//
// Límites (honestos): solo reconoce el orden estándar (no detecta pasos fuera de orden), depende
// de que el método se distinga por dónde van las manos y de una cámara fija; falta validarlo con
// video real de planta.

export type Feature = [number, number, number, number]; // muñeca izq. (x, y), muñeca der. (x, y)

export interface FeatureFrame {
  t: number; // ms
  f: Feature;
}

export interface StepTemplate {
  stepNumber: number;
  name: string;
  /** Trayectoria remuestreada a RATE_HZ (al menos 2 puntos). */
  frames: Feature[];
  /** Duración en el ciclo de referencia (s). */
  refDuration: number;
}

export interface MethodTemplate {
  version: 1;
  createdAt: string;
  steps: StepTemplate[];
  /** Escala de distancia entre pasos distintos: base de la penalización por saltar y de la confianza. */
  between: number;
}

export interface RecognizedStep {
  stepNumber: number;
  start: number; // ms
  end: number;   // ms
  duration: number; // s
}

export interface Recognition {
  steps: RecognizedStep[];
  omitted: number[];
  /** Costo medio por fotograma de la alineación (menor = más parecido a la referencia). */
  meanCost: number;
  confidence: "alta" | "media" | "baja";
}

export const RATE_HZ = 5;
/** Saltar un paso cuesta SKIP_FACTOR × distancia entre pasos × fotogramas mínimos del paso. */
export const SKIP_FACTOR = 0.5;
const MIN_STEP_FRAMES = 2;

type Pt = { x: number; y: number } | null | undefined;

const dist = (a: Feature, b: Feature) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);

/**
 * Rasgo de un fotograma: las dos muñecas relativas al centro de los hombros y en "anchos de
 * hombro", para que no importe tanto dónde quedó la cámara. Si falta una mano se usa la última
 * posición conocida (o la otra mano); si no hay ninguna, el fotograma no sirve.
 */
export function frameFeature(
  leftWrist: Pt, rightWrist: Pt, leftShoulder: Pt, rightShoulder: Pt, last: Feature | null,
): Feature | null {
  if (!leftWrist && !rightWrist) return null;
  let cx = 0.5, cy = 0.5, scale = 1;
  if (leftShoulder && rightShoulder) {
    cx = (leftShoulder.x + rightShoulder.x) / 2;
    cy = (leftShoulder.y + rightShoulder.y) / 2;
    scale = Math.max(0.05, Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y));
  }
  const norm = (p: { x: number; y: number }) => [(p.x - cx) / scale, (p.y - cy) / scale] as const;
  const l = leftWrist ? norm(leftWrist) : last ? [last[0], last[1]] as const : rightWrist ? norm(rightWrist) : null;
  const r = rightWrist ? norm(rightWrist) : last ? [last[2], last[3]] as const : leftWrist ? norm(leftWrist) : null;
  if (!l || !r) return null;
  return [l[0], l[1], r[0], r[1]];
}

/** Remuestrea por tiempo a `hz` con interpolación lineal (los huecos se rellenan). */
export function resample(frames: FeatureFrame[], hz = RATE_HZ): FeatureFrame[] {
  if (frames.length === 0) return [];
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const t0 = sorted[0].t, t1 = sorted[sorted.length - 1].t;
  const dt = 1000 / hz;
  const out: FeatureFrame[] = [];
  let k = 0;
  for (let t = t0; t <= t1 + 1e-6; t += dt) {
    while (k < sorted.length - 2 && sorted[k + 1].t < t) k++;
    const a = sorted[k], b = sorted[Math.min(k + 1, sorted.length - 1)];
    const w = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    out.push({ t, f: a.f.map((v, i) => v + (b.f[i] - v) * w) as Feature });
  }
  return out;
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const meanFeature = (fs: Feature[]): Feature =>
  [0, 1, 2, 3].map((i) => fs.reduce((s, f) => s + f[i], 0) / fs.length) as Feature;

/**
 * Plantilla del método a partir de un ciclo de referencia.
 * @param frames     fotogramas del ciclo de referencia
 * @param boundaries inicio (ms) de cada paso, en orden; el último paso termina en el último fotograma
 */
export function buildTemplate(
  frames: FeatureFrame[], boundaries: number[], steps: { number: number; name: string }[],
): MethodTemplate | null {
  if (boundaries.length !== steps.length || steps.length === 0 || frames.length < 2) return null;
  const end = Math.max(...frames.map((f) => f.t));
  const out: StepTemplate[] = [];
  for (let i = 0; i < steps.length; i++) {
    const a = boundaries[i];
    const b = i + 1 < boundaries.length ? boundaries[i + 1] : end;
    if (!(b > a)) return null;
    const seg = frames.filter((f) => f.t >= a && f.t <= b);
    if (seg.length === 0) return null;
    let rs = resample(seg).map((x) => x.f);
    if (rs.length < MIN_STEP_FRAMES) rs = [rs[0], rs[rs.length - 1]];
    out.push({ stepNumber: steps[i].number, name: steps[i].name, frames: rs, refDuration: (b - a) / 1000 });
  }
  const means = out.map((s) => meanFeature(s.frames));
  const pairs: number[] = [];
  for (let i = 0; i < means.length; i++) for (let j = i + 1; j < means.length; j++) pairs.push(dist(means[i], means[j]));
  // Con un solo paso no hay "entre pasos": se usa la amplitud del propio movimiento.
  const spread = out.flatMap((s) => s.frames).map((f) => dist(f, means[0]));
  const between = Math.max(1e-3, pairs.length ? median(pairs) : median(spread));
  return { version: 1, createdAt: new Date().toISOString(), steps: out, between };
}

/** Penalización por saltarse cada paso. */
export function skipPenalties(tpl: MethodTemplate): number[] {
  return tpl.steps.map((s) => SKIP_FACTOR * tpl.between * Math.ceil(s.frames.length / 2));
}

/**
 * Alinea un ciclo contra la plantilla (DTW con saltos de paso) y devuelve los pasos reconocidos.
 * Movimientos por fotograma: quedarse, avanzar 1 o 2 puntos de plantilla (hasta el doble de rápido),
 * o saltar pasos completos pagando su penalización.
 */
export function recognizeSteps(cycleFrames: FeatureFrame[], tpl: MethodTemplate): Recognition | null {
  const obs = resample(cycleFrames);
  const T = obs.length;
  const S = tpl.steps.length;
  if (T === 0 || S === 0) return null;

  // Puntos de plantilla aplanados.
  const pts: Feature[] = [];
  const stepOf: number[] = [];
  const first: number[] = [];
  const last: number[] = [];
  tpl.steps.forEach((s, i) => {
    first.push(pts.length);
    s.frames.forEach((f) => { pts.push(f); stepOf.push(i); });
    last.push(pts.length - 1);
  });
  const M = pts.length;
  const pen = skipPenalties(tpl);
  const penBefore = [0];
  for (let i = 0; i < S; i++) penBefore.push(penBefore[i] + pen[i]);
  const skipCost = (from: number, to: number) => penBefore[to] - penBefore[from + 1]; // pasos from+1..to−1

  const INF = Number.POSITIVE_INFINITY;
  const D = new Float64Array(T * M).fill(INF);
  const B = new Int32Array(T * M).fill(-1);

  for (let s = 0; s < S; s++) {
    const m = first[s];
    D[m] = dist(obs[0].f, pts[m]) + penBefore[s];
  }
  for (let t = 1; t < T; t++) {
    const row = t * M, prev = (t - 1) * M;
    for (let m = 0; m < M; m++) {
      let best = INF, arg = -1;
      for (const k of [m, m - 1, m - 2]) {
        if (k < 0) continue;
        // +2 no puede saltarse un paso completo (cada paso tiene ≥ 2 puntos).
        if (stepOf[m] - stepOf[k] > 1) continue;
        const v = D[prev + k];
        if (v < best) { best = v; arg = k; }
      }
      const s = stepOf[m];
      if (m === first[s]) {
        for (let s2 = 0; s2 < s - 1; s2++) {
          const v = D[prev + last[s2]] + skipCost(s2, s);
          if (v < best) { best = v; arg = last[s2]; }
        }
      }
      if (arg >= 0) {
        D[row + m] = best + dist(obs[t].f, pts[m]);
        B[row + m] = arg;
      }
    }
  }

  let bestEnd = INF, endM = -1;
  for (let s = 0; s < S; s++) {
    const v = D[(T - 1) * M + last[s]] + (penBefore[S] - penBefore[s + 1]);
    if (v < bestEnd) { bestEnd = v; endM = last[s]; }
  }
  if (endM < 0 || !Number.isFinite(bestEnd)) return null;

  // Camino de vuelta.
  const path = new Int32Array(T);
  path[T - 1] = endM;
  for (let t = T - 1; t > 0; t--) path[t - 1] = B[t * M + path[t]];

  let pathCost = 0;
  for (let t = 0; t < T; t++) pathCost += dist(obs[t].f, pts[path[t]]);
  const meanCost = pathCost / T;

  const cycleEnd = Math.max(...cycleFrames.map((f) => f.t));
  const steps: RecognizedStep[] = [];
  for (let t = 0; t < T; t++) {
    const s = stepOf[path[t]];
    const cur = steps[steps.length - 1];
    if (!cur || cur.stepNumber !== tpl.steps[s].stepNumber) {
      if (cur) { cur.end = obs[t].t; cur.duration = (cur.end - cur.start) / 1000; }
      steps.push({ stepNumber: tpl.steps[s].stepNumber, start: obs[t].t, end: cycleEnd, duration: 0 });
    }
  }
  const lastStep = steps[steps.length - 1];
  lastStep.end = cycleEnd;
  lastStep.duration = (lastStep.end - lastStep.start) / 1000;

  const seen = new Set(steps.map((s) => s.stepNumber));
  const omitted = tpl.steps.map((s) => s.stepNumber).filter((n) => !seen.has(n));
  const ratio = meanCost / tpl.between;
  const confidence = ratio < 0.25 ? "alta" : ratio < 0.5 ? "media" : "baja";
  return { steps, omitted, meanCost, confidence };
}

// ── Guardado de la plantilla ─────────────────────────────────────────────────────

export const TEMPLATE_KEY = "kronos_step_template_v1";

const isFeature = (x: unknown): x is Feature =>
  Array.isArray(x) && x.length === 4 && x.every((v) => typeof v === "number" && Number.isFinite(v));

/** Lee una plantilla guardada; null si no hay o si está dañada. */
export function parseTemplate(raw: string | null): MethodTemplate | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as MethodTemplate;
    if (t?.version !== 1 || !Array.isArray(t.steps) || t.steps.length === 0) return null;
    if (!(typeof t.between === "number" && t.between > 0)) return null;
    const ok = t.steps.every((s) =>
      typeof s.stepNumber === "number" && typeof s.name === "string" && Array.isArray(s.frames) &&
      s.frames.length >= MIN_STEP_FRAMES && s.frames.every(isFeature) && typeof s.refDuration === "number");
    return ok ? t : null;
  } catch {
    return null;
  }
}

/** La plantilla corresponde a los pasos configurados hoy (mismos números y nombres, mismo orden). */
export function templateMatchesSteps(tpl: MethodTemplate, steps: { number: number; name: string }[]): boolean {
  return tpl.steps.length === steps.length &&
    tpl.steps.every((s, i) => s.stepNumber === steps[i].number && s.name === steps[i].name);
}
