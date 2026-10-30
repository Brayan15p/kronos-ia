/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Curva de aprendizaje y matriz de competencias (ILUO) por operario.
 *
 * Funciones puras (sin React ni estado) para:
 *  1. Ajustar la curva de aprendizaje de Wright a los tiempos de ciclo de cada operario:
 *       T_n = T1 · n^b      (n = número de repetición del operario, 1, 2, 3…)
 *     por mínimos cuadrados en escala log–log: ln T_n = ln T1 + b · ln n.
 *     Tasa de aprendizaje = 2^b: cada vez que se duplican las repeticiones el tiempo
 *     pasa a ser ese porcentaje del anterior (0,85 → "curva del 85 %").
 *     Fuente: T. P. Wright (1936), "Factors affecting the cost of airplanes",
 *     Journal of the Aeronautical Sciences 3(4):122–128.
 *  2. Estimar en qué ciclo el operario alcanza el tiempo estándar (costConfig.targetCycleTime)
 *     y detectar mesetas y retrocesos.
 *  3. Clasificar a cada operario en cada paso según la convención ILUO de las matrices de
 *     habilidades lean/japonesas: I (en entrenamiento), L (opera con supervisión),
 *     U (opera de forma autónoma y estable), O (puede enseñar).
 *  4. Generar alertas de entrenamiento (retroceso, pasos sin nadie autónomo, dependencia
 *     de una sola persona).
 *
 * IMPORTANTE: los umbrales numéricos de este archivo (muestras mínimas, razón de tiempo,
 * coeficiente de variación, ventanas, etc.) son una CONVENCIÓN DE KRONOS, no un estándar
 * publicado. La escala ILUO define los niveles de forma cualitativa; aquí se traducen a
 * criterios medibles para que la clasificación sea reproducible. Están como constantes
 * exportadas para poder ajustarlos.
 */
import type { CycleRecord, OperatorConfig, StepConfig } from "@/context/TimeStudyContext";

// ── Constantes ajustables (convención Kronos) ────────────────────────────────────

/** Ciclos válidos mínimos para ajustar la curva de aprendizaje. */
export const LEARNING_MIN_CYCLES = 4;

/**
 * Detección de atípicos sobre los residuos log–log de un ajuste robusto (Theil–Sen):
 * se marca un ciclo si su puntuación z modificada |0,6745·(r − mediana) / MAD| supera 3,5.
 * Regla de Iglewicz y Hoaglin (1993), "How to Detect and Handle Outliers", ASQC.
 */
export const OUTLIER_MODIFIED_Z = 3.5;
/** Como máximo se descarta esta fracción de los ciclos como atípicos (los más extremos). */
export const OUTLIER_MAX_FRACTION = 0.2;

/** Ventana de ciclos recientes para mediana móvil, meseta y retroceso. */
export const RECENT_WINDOW = 5;
/** Meseta: |pendiente| de la ventana reciente ≤ 1 % del tiempo medio por ciclo. */
export const PLATEAU_MAX_REL_SLOPE = 0.01;
/** Retroceso: la mediana de la ventana reciente supera en ≥ 15 % a la de la ventana anterior. */
export const REGRESSION_MIN_INCREASE = 0.15;
/** Ciclos mínimos en la ventana anterior para comparar un retroceso. */
export const REGRESSION_MIN_PREVIOUS = 3;
/** Más allá de este número de ciclo la predicción no se informa ("fuera de horizonte"). */
export const MAX_PREDICTION_CYCLES = 1000;

export type IluoLevel = "I" | "L" | "U" | "O";
export const ILUO_ORDER: readonly IluoLevel[] = ["I", "L", "U", "O"];

export const ILUO_LABELS: Record<IluoLevel, string> = {
  I: "En entrenamiento",
  L: "Opera con supervisión",
  U: "Autónomo y estable",
  O: "Puede enseñar",
};

export interface IluoThreshold {
  /** Muestras (repeticiones del paso) mínimas para poder certificar el nivel. */
  minSamples: number;
  /** Razón máxima tiempo medio / tiempo de referencia del paso. */
  maxRatio: number;
  /** Coeficiente de variación máximo (σ / media) del paso. */
  maxCv: number;
}

/**
 * Umbrales ILUO (convención Kronos, ajustables). Un nivel se otorga si se cumplen los tres
 * criterios (límites inclusivos); se asigna el nivel más alto alcanzado y, si no se cumple
 * ni L, el nivel es I. Los umbrales son anidados (O ⊂ U ⊂ L), por lo que la muestra mínima
 * también actúa como tope: con < 3 muestras solo I, con < 5 a lo sumo L, con < 10 a lo sumo U.
 */
export const ILUO_THRESHOLDS: Record<Exclude<IluoLevel, "I">, IluoThreshold> = {
  L: { minSamples: 3, maxRatio: 1.5, maxCv: 0.35 },
  U: { minSamples: 5, maxRatio: 1.2, maxCv: 0.2 },
  O: { minSamples: 10, maxRatio: 1.1, maxCv: 0.1 },
};

/** Tolerancia numérica para que los límites inclusivos no fallen por redondeo. */
const EPS = 1e-9;

// ── Estadística básica ───────────────────────────────────────────────────────────

export const isValidDuration = (d: number): boolean => Number.isFinite(d) && d > 0;

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Desviación estándar muestral (n − 1); 0 con menos de dos datos. */
export function sampleStd(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Coeficiente de variación σ / media (NaN si la media no es positiva). */
export function coefficientOfVariation(xs: readonly number[]): number {
  const m = mean(xs);
  return m > 0 ? sampleStd(xs) / m : NaN;
}

interface Regression { slope: number; intercept: number; r2: number }

/** Regresión lineal por mínimos cuadrados ordinarios y su R². */
export function linearRegression(xs: readonly number[], ys: readonly number[]): Regression {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  // Sin variación en y: el ajuste es perfecto si los residuos también son nulos.
  const r2 = ssTot < 1e-12 ? (ssRes < 1e-12 ? 1 : 0) : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/** Recta robusta de Theil–Sen: mediana de las pendientes entre pares (resiste atípicos). */
function theilSen(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(xs.map((x, i) => ys[i] - slope * x));
  return { slope, intercept };
}

// ── Curva de aprendizaje de Wright ───────────────────────────────────────────────

/** Tiempo esperado de la repetición n según Wright. */
export const wrightTime = (t1: number, b: number, n: number): number => t1 * Math.pow(n, b);
/** Tasa de aprendizaje a partir del exponente: 2^b (p. ej. b = −0,2345 → 0,85). */
export const learningRateFromExponent = (b: number): number => Math.pow(2, b);
/** Exponente a partir de la tasa de aprendizaje: b = log2(tasa). */
export const exponentFromLearningRate = (rate: number): number => Math.log2(rate);

export interface WrightFit {
  /** Tiempo estimado de la primera repetición (s). */
  t1: number;
  /** Exponente b (negativo = mejora con la práctica). */
  b: number;
  /** 2^b. */
  learningRate: number;
  /** R² del ajuste en escala log–log. */
  r2: number;
  /** Ciclos usados en el ajuste (válidos y no atípicos). */
  nUsed: number;
}

/** Ajuste de Wright por mínimos cuadrados en log–log, sin depuración (requiere ≥ 2 puntos válidos). */
export function fitWright(points: readonly { n: number; duration: number }[]): WrightFit | null {
  const pts = points.filter((p) => isValidDuration(p.duration) && p.n >= 1);
  if (pts.length < 2) return null;
  const { slope, intercept, r2 } = linearRegression(pts.map((p) => Math.log(p.n)), pts.map((p) => Math.log(p.duration)));
  return { t1: Math.exp(intercept), b: slope, learningRate: learningRateFromExponent(slope), r2, nUsed: pts.length };
}

/**
 * Marca atípicos (ver OUTLIER_MODIFIED_Z): ajuste robusto Theil–Sen en log–log, puntuación z
 * modificada de los residuos y, como mucho, OUTLIER_MAX_FRACTION de los puntos (los más extremos),
 * sin dejar nunca menos de LEARNING_MIN_CYCLES puntos. Devuelve un booleano por punto.
 */
export function detectOutliers(points: readonly { n: number; duration: number }[]): boolean[] {
  const flags = points.map(() => false);
  if (points.length < LEARNING_MIN_CYCLES + 1) return flags;
  const xs = points.map((p) => Math.log(p.n));
  const ys = points.map((p) => Math.log(p.duration));
  const robust = theilSen(xs, ys);
  const res = xs.map((x, i) => ys[i] - (robust.intercept + robust.slope * x));
  const med = median(res);
  // Piso del MAD: con datos exactos el MAD es 0 y cualquier desviación real es atípica.
  const mad = Math.max(median(res.map((r) => Math.abs(r - med))), 1e-6);
  const z = res.map((r) => Math.abs((0.6745 * (r - med)) / mad));
  const maxOut = Math.min(Math.floor(points.length * OUTLIER_MAX_FRACTION), points.length - LEARNING_MIN_CYCLES);
  z.map((zi, i) => ({ zi, i }))
    .filter((c) => c.zi > OUTLIER_MODIFIED_Z)
    .sort((a, b) => b.zi - a.zi)
    .slice(0, Math.max(0, maxOut))
    .forEach((c) => { flags[c.i] = true; });
  return flags;
}

/** Ciclo (entero) en que la curva T1·n^b baja hasta `standard`; null si nunca (b ≥ 0). */
export function cyclesToReach(t1: number, b: number, standard: number): number | null {
  if (!(standard > 0) || !(t1 > 0)) return null;
  if (t1 <= standard) return 1;
  if (b >= 0) return null;
  return Math.max(1, Math.ceil(Math.pow(standard / t1, 1 / b) - 1e-9));
}

export interface LearningPoint {
  /** Número de repetición del operario (posición en orden cronológico, desde 1). */
  n: number;
  duration: number;
  /** Duración finita y > 0. Las no válidas se descartan pero conservan su número de repetición. */
  valid: boolean;
  /** Atípico excluido del ajuste. */
  outlier: boolean;
}

export type StandardStatus = "reached" | "predicted" | "not-improving" | "beyond-horizon";

export interface StandardProgress {
  standard: number;
  /** Ciclos de la ventana reciente usada para la mediana móvil. */
  window: number;
  recentMedian: number;
  /** Ya alcanzado: la mediana de los últimos `window` ciclos válidos ≤ estándar. */
  reached: boolean;
  /** Primer ciclo en que la mediana móvil quedó ≤ estándar (aunque luego haya subido). */
  firstReachedAt: number | null;
  status: StandardStatus;
  /** Ciclo estimado (si aún no se alcanza): máx(predicción de Wright, último ciclo + 1). */
  predictedCycle: number | null;
  cyclesRemaining: number | null;
}

export interface PlateauInfo {
  window: number;
  /** Pendiente (s por ciclo) de la recta de la ventana reciente. */
  slopePerCycle: number;
  /** Pendiente / tiempo medio de la ventana (fracción por ciclo). */
  relativeSlope: number;
  plateau: boolean;
}

export interface RegressionInfo {
  recentMedian: number;
  previousMedian: number;
  /** Variación relativa reciente vs anterior (0,2 = +20 %). */
  change: number;
  detected: boolean;
}

export type LearningCurveResult =
  | { kind: "insufficient"; reason: string; validCount: number; points: LearningPoint[] }
  | {
      kind: "fit";
      points: LearningPoint[];
      fit: WrightFit;
      outlierCount: number;
      standard: StandardProgress | null;
      plateau: PlateauInfo | null;
      regression: RegressionInfo | null;
    };

/** Meseta: pendiente lineal de los últimos RECENT_WINDOW ciclos casi nula (ver PLATEAU_MAX_REL_SLOPE). */
export function detectPlateau(points: readonly { n: number; duration: number }[]): PlateauInfo | null {
  if (points.length < RECENT_WINDOW) return null;
  const last = points.slice(-RECENT_WINDOW);
  const { slope } = linearRegression(last.map((p) => p.n), last.map((p) => p.duration));
  const relativeSlope = slope / mean(last.map((p) => p.duration));
  return { window: RECENT_WINDOW, slopePerCycle: slope, relativeSlope, plateau: Math.abs(relativeSlope) <= PLATEAU_MAX_REL_SLOPE + EPS };
}

/** Retroceso: mediana de los últimos RECENT_WINDOW ciclos vs la de los RECENT_WINDOW anteriores. */
export function detectRegression(durations: readonly number[]): RegressionInfo | null {
  const d = durations.filter(isValidDuration);
  if (d.length < RECENT_WINDOW + REGRESSION_MIN_PREVIOUS) return null;
  const recent = d.slice(-RECENT_WINDOW);
  const previous = d.slice(Math.max(0, d.length - 2 * RECENT_WINDOW), d.length - RECENT_WINDOW);
  const recentMedian = median(recent);
  const previousMedian = median(previous);
  const change = recentMedian / previousMedian - 1;
  return { recentMedian, previousMedian, change, detected: change >= REGRESSION_MIN_INCREASE - EPS };
}

function standardProgress(valid: readonly LearningPoint[], fit: WrightFit, standard: number): StandardProgress {
  const window = Math.min(RECENT_WINDOW, valid.length);
  const durs = valid.map((p) => p.duration);
  const recentMedian = median(durs.slice(-window));
  const reached = recentMedian <= standard + EPS;
  let firstReachedAt: number | null = null;
  for (let i = window - 1; i < valid.length; i++) {
    if (median(durs.slice(i - window + 1, i + 1)) <= standard + EPS) { firstReachedAt = valid[i].n; break; }
  }
  const lastN = valid[valid.length - 1].n;
  if (reached) {
    return { standard, window, recentMedian, reached, firstReachedAt, status: "reached", predictedCycle: null, cyclesRemaining: 0 };
  }
  const raw = cyclesToReach(fit.t1, fit.b, standard);
  const base = { standard, window, recentMedian, reached, firstReachedAt };
  if (raw === null) return { ...base, status: "not-improving", predictedCycle: null, cyclesRemaining: null };
  if (raw > MAX_PREDICTION_CYCLES) return { ...base, status: "beyond-horizon", predictedCycle: null, cyclesRemaining: null };
  // Si el modelo dice que "ya debería" estar en el estándar pero la mediana real no lo está,
  // lo más pronto posible es el siguiente ciclo.
  const predictedCycle = Math.max(raw, lastN + 1);
  return { ...base, status: "predicted", predictedCycle, cyclesRemaining: predictedCycle - lastN };
}

/**
 * Analiza la curva de aprendizaje de un operario.
 * @param durations duraciones de ciclo en orden cronológico (la posición define n = 1, 2, …).
 * @param standard tiempo estándar (s); si no es > 0 no se calcula el avance al estándar.
 */
export function analyzeLearningCurve(durations: readonly number[], standard?: number): LearningCurveResult {
  const points: LearningPoint[] = durations.map((d, i) => ({ n: i + 1, duration: d, valid: isValidDuration(d), outlier: false }));
  const valid = points.filter((p) => p.valid);
  const invalidCount = points.length - valid.length;
  if (valid.length < LEARNING_MIN_CYCLES) {
    const extra = invalidCount > 0 ? ` (se descartaron ${invalidCount} con duración no válida)` : "";
    return {
      kind: "insufficient",
      validCount: valid.length,
      points,
      reason: `Se necesitan al menos ${LEARNING_MIN_CYCLES} ciclos válidos para ajustar la curva; hay ${valid.length}${extra}.`,
    };
  }
  detectOutliers(valid).forEach((isOut, i) => { valid[i].outlier = isOut; });
  const inliers = valid.filter((p) => !p.outlier);
  const fit = fitWright(inliers) as WrightFit; // inliers ≥ LEARNING_MIN_CYCLES ≥ 2
  return {
    kind: "fit",
    points,
    fit,
    outlierCount: valid.length - inliers.length,
    standard: standard !== undefined && standard > 0 ? standardProgress(valid, fit, standard) : null,
    plateau: detectPlateau(inliers),
    regression: detectRegression(valid.map((p) => p.duration)),
  };
}

/** Ciclos de un operario en orden cronológico (fecha y, a igualdad, número de ciclo). */
export function operatorCycles(cycles: readonly CycleRecord[], operatorId: number): CycleRecord[] {
  const time = (c: CycleRecord) => {
    const t = c.timestamp instanceof Date ? c.timestamp.getTime() : new Date(c.timestamp as unknown as string).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  return cycles
    .filter((c) => c.operatorId === operatorId)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => time(a.c) - time(b.c) || a.c.cycleNumber - b.c.cycleNumber || a.i - b.i)
    .map(({ c }) => c);
}

// ── Matriz de competencias ILUO ──────────────────────────────────────────────────

/**
 * Nivel ILUO de una celda (operario × paso). `ratio` = tiempo medio / referencia del paso;
 * sin referencia (null) no se puede pasar de I. Con 0 muestras no hay nivel (ver assessCompetency).
 */
export function iluoLevel(stats: { n: number; ratio: number | null; cv: number }): IluoLevel {
  const meets = (t: IluoThreshold) =>
    stats.n >= t.minSamples && stats.ratio !== null && stats.ratio <= t.maxRatio + EPS && Number.isFinite(stats.cv) && stats.cv <= t.maxCv + EPS;
  if (meets(ILUO_THRESHOLDS.O)) return "O";
  if (meets(ILUO_THRESHOLDS.U)) return "U";
  if (meets(ILUO_THRESHOLDS.L)) return "L";
  return "I";
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Qué le falta a una celda para subir al siguiente nivel (texto para el supervisor). */
export function missingForNextLevel(stats: { n: number; ratio: number | null; cv: number }, level: IluoLevel): string[] {
  if (level === "O") return [];
  const next = ILUO_ORDER[ILUO_ORDER.indexOf(level) + 1] as Exclude<IluoLevel, "I">;
  const t = ILUO_THRESHOLDS[next];
  const out: string[] = [];
  if (stats.n < t.minSamples) out.push(`al menos ${t.minSamples} repeticiones (tiene ${stats.n})`);
  if (stats.ratio === null) out.push("un tiempo de referencia para el paso");
  else if (stats.ratio > t.maxRatio + EPS) out.push(`tiempo ≤ ${pct(t.maxRatio)} de la referencia (está en ${pct(stats.ratio)})`);
  if (!(stats.cv <= t.maxCv + EPS)) out.push(`variabilidad (CV) ≤ ${pct(t.maxCv)} (está en ${Number.isFinite(stats.cv) ? pct(stats.cv) : "—"})`);
  return out;
}

/** Origen del tiempo de referencia de un paso. */
export type ReferenceSource = "mejor-operario" | "estandar" | "mejor-disponible";

export const REFERENCE_LABELS: Record<ReferenceSource, string> = {
  "mejor-operario": "mejor operario estable",
  estandar: "parte del tiempo estándar",
  "mejor-disponible": "mejor promedio disponible",
};

export interface CompetencyCell {
  operatorId: number;
  stepNumber: number;
  /** Repeticiones registradas del paso. */
  n: number;
  mean: number;
  median: number;
  sd: number;
  cv: number;
  /** Tiempo medio / referencia del paso (null sin referencia). */
  ratio: number | null;
  /** Nivel ILUO; null si el operario no tiene registros del paso. */
  level: IluoLevel | null;
  missingForNext: string[];
}

export interface StepReference {
  stepNumber: number;
  reference: number | null;
  source: ReferenceSource | null;
  /** Operario que fija la referencia (solo con "mejor-operario" o "mejor-disponible"). */
  referenceOperatorId: number | null;
}

export interface StepSummary {
  step: StepConfig;
  reference: StepReference;
  /** Operarios con al menos un registro del paso. */
  operatorsWithData: number;
  countByLevel: Record<IluoLevel, number>;
  /** Operarios en U u O. */
  autonomous: number[];
  /** Operarios en O. */
  trainers: number[];
}

export interface CompetencyMatrix {
  steps: StepConfig[];
  operators: OperatorConfig[];
  /** cells[i][j] = operario i, paso j (mismo orden que `operators` y `steps`). */
  cells: CompetencyCell[][];
  stepSummaries: StepSummary[];
  /** Hay al menos un tiempo por paso registrado. */
  hasStepData: boolean;
  /** Ciclos (de operarios conocidos) que no traen tiempos por paso (p. ej. detectados automáticamente). */
  cyclesWithoutSteps: number;
}

/**
 * Tiempo de referencia de cada paso (convención Kronos), en este orden de preferencia:
 *  1. "mejor-operario": si ≥ 2 operarios registraron el paso, la media del más rápido entre los
 *     estables (≥ ILUO_THRESHOLDS.U.minSamples muestras y CV ≤ ILUO_THRESHOLDS.U.maxCv).
 *     Compararse consigo mismo no tiene sentido, por eso hace falta un segundo operario.
 *  2. "estandar": parte del tiempo estándar del ciclo asignada al paso. Si todos los pasos
 *     configurados tienen datos, el reparto es proporcional a la mediana conjunta de cada paso;
 *     si falta alguno, se reparte por igual (estándar / nº de pasos).
 *  3. "mejor-disponible": sin estándar, la media más baja entre los operarios con ≥ L.minSamples.
 */
function stepReferences(
  steps: readonly StepConfig[],
  samples: (opIdx: number, stepIdx: number) => number[],
  opCount: number,
  operators: readonly OperatorConfig[],
  standard: number,
): StepReference[] {
  const pooledMedians = steps.map((_, j) => {
    const all: number[] = [];
    for (let i = 0; i < opCount; i++) all.push(...samples(i, j));
    return all.length ? median(all) : NaN;
  });
  const fullCoverage = pooledMedians.every((m) => Number.isFinite(m));
  const totalPooled = fullCoverage ? pooledMedians.reduce((a, b) => a + b, 0) : 0;

  return steps.map((step, j) => {
    const stats = Array.from({ length: opCount }, (_, i) => {
      const s = samples(i, j);
      return { i, n: s.length, mean: mean(s), cv: coefficientOfVariation(s) };
    }).filter((s) => s.n > 0);

    const stable = stats.filter((s) => s.n >= ILUO_THRESHOLDS.U.minSamples && s.cv <= ILUO_THRESHOLDS.U.maxCv + EPS);
    if (stats.length >= 2 && stable.length > 0) {
      const best = stable.reduce((a, b) => (b.mean < a.mean ? b : a));
      return { stepNumber: step.number, reference: best.mean, source: "mejor-operario", referenceOperatorId: operators[best.i].id };
    }
    if (standard > 0 && steps.length > 0) {
      const share = fullCoverage && totalPooled > 0 ? standard * (pooledMedians[j] / totalPooled) : standard / steps.length;
      return { stepNumber: step.number, reference: share, source: "estandar", referenceOperatorId: null };
    }
    const avail = stats.filter((s) => s.n >= ILUO_THRESHOLDS.L.minSamples);
    if (avail.length > 0) {
      const best = avail.reduce((a, b) => (b.mean < a.mean ? b : a));
      return { stepNumber: step.number, reference: best.mean, source: "mejor-disponible", referenceOperatorId: operators[best.i].id };
    }
    return { stepNumber: step.number, reference: null, source: null, referenceOperatorId: null };
  });
}

/**
 * Matriz de competencias operario × paso a partir de los tiempos por paso (StepTiming).
 * Se ignoran los ciclos de operarios que ya no están en `operators` y los tiempos no válidos.
 * Los ciclos sin tiempos por paso no aportan a la matriz (sí a la curva de aprendizaje).
 */
export function assessCompetency(
  steps: readonly StepConfig[],
  operators: readonly OperatorConfig[],
  cycles: readonly CycleRecord[],
  standard: number,
): CompetencyMatrix {
  const opIndex = new Map(operators.map((o, i) => [o.id, i]));
  const stepIndex = new Map(steps.map((s, j) => [s.number, j]));
  const grid: number[][][] = operators.map(() => steps.map(() => []));
  let cyclesWithoutSteps = 0;
  let hasStepData = false;

  for (const c of cycles) {
    const i = opIndex.get(c.operatorId);
    if (i === undefined) continue;
    if (!c.steps || c.steps.length === 0) { cyclesWithoutSteps++; continue; }
    for (const st of c.steps) {
      const j = stepIndex.get(st.stepNumber);
      if (j === undefined || !isValidDuration(st.duration)) continue;
      grid[i][j].push(st.duration);
      hasStepData = true;
    }
  }

  const references = stepReferences(steps, (i, j) => grid[i][j], operators.length, operators, standard);

  const cells: CompetencyCell[][] = operators.map((op, i) =>
    steps.map((step, j) => {
      const s = grid[i][j];
      const ref = references[j].reference;
      const m = mean(s);
      const cv = coefficientOfVariation(s);
      const ratio = s.length > 0 && ref !== null && ref > 0 ? m / ref : null;
      const stats = { n: s.length, ratio, cv };
      const level = s.length > 0 ? iluoLevel(stats) : null;
      return {
        operatorId: op.id,
        stepNumber: step.number,
        n: s.length,
        mean: m,
        median: median(s),
        sd: sampleStd(s),
        cv,
        ratio,
        level,
        missingForNext: level ? missingForNextLevel(stats, level) : [],
      };
    }),
  );

  const stepSummaries: StepSummary[] = steps.map((step, j) => {
    const col = cells.map((row) => row[j]);
    const countByLevel: Record<IluoLevel, number> = { I: 0, L: 0, U: 0, O: 0 };
    col.forEach((c) => { if (c.level) countByLevel[c.level]++; });
    return {
      step,
      reference: references[j],
      operatorsWithData: col.filter((c) => c.n > 0).length,
      countByLevel,
      autonomous: col.filter((c) => c.level === "U" || c.level === "O").map((c) => c.operatorId),
      trainers: col.filter((c) => c.level === "O").map((c) => c.operatorId),
    };
  });

  return { steps: [...steps], operators: [...operators], cells, stepSummaries, hasStepData, cyclesWithoutSteps };
}

// ── Alertas de entrenamiento ─────────────────────────────────────────────────────

export type TrainingAlertKind = "regresion" | "sin-autonomo" | "un-solo-autonomo" | "un-solo-instructor";
export type AlertSeverity = "alta" | "media" | "baja";

export interface TrainingAlert {
  kind: TrainingAlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  operatorId?: number;
  stepNumber?: number;
}

export interface OperatorLearning {
  operator: OperatorConfig;
  cycleCount: number;
  result: LearningCurveResult;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { alta: 0, media: 1, baja: 2 };

/**
 * Alertas:
 *  - "regresion" (alta): el operario empeora (ver detectRegression).
 *  - "sin-autonomo" (alta): paso con registros en el que nadie está en U u O —
 *    riesgo de dependencia: el paso solo se sostiene con supervisión.
 *  - "un-solo-autonomo" (media): exactamente una persona en U/O — punto único de falla.
 *  - "un-solo-instructor" (baja): exactamente una persona en O y al menos dos en U/O
 *    (si solo hay un U/O ya se avisa con "un-solo-autonomo").
 * Los pasos sin ningún registro no generan alertas (no hay evidencia todavía).
 */
export function trainingAlerts(matrix: CompetencyMatrix, learning: readonly OperatorLearning[]): TrainingAlert[] {
  const name = (id: number) => matrix.operators.find((o) => o.id === id)?.name ?? `Operario ${id}`;
  const alerts: TrainingAlert[] = [];

  for (const l of learning) {
    const reg = l.result.kind === "fit" ? l.result.regression : null;
    if (reg?.detected) {
      alerts.push({
        kind: "regresion",
        severity: "alta",
        operatorId: l.operator.id,
        title: `${l.operator.name}: retroceso en el tiempo de ciclo`,
        detail: `La mediana de sus últimos ${RECENT_WINDOW} ciclos (${reg.recentMedian.toFixed(1)} s) es ${pct(reg.change)} mayor que la de los anteriores (${reg.previousMedian.toFixed(1)} s). Revisa método, fatiga o cambios de material y considera reentrenamiento.`,
      });
    }
  }

  for (const s of matrix.stepSummaries) {
    if (s.operatorsWithData === 0) continue;
    const stepLabel = `Paso ${s.step.number} · ${s.step.name}`;
    if (s.autonomous.length === 0) {
      alerts.push({
        kind: "sin-autonomo",
        severity: "alta",
        stepNumber: s.step.number,
        title: `${stepLabel}: nadie lo opera de forma autónoma`,
        detail: "Riesgo de dependencia: ningún operario está en nivel U u O en este paso. Prioriza entrenamiento y estandariza el método.",
      });
    } else if (s.autonomous.length === 1) {
      const who = s.autonomous[0];
      const isTrainer = s.trainers.includes(who);
      alerts.push({
        kind: "un-solo-autonomo",
        severity: "media",
        stepNumber: s.step.number,
        operatorId: who,
        title: `${stepLabel}: depende de una sola persona`,
        detail: `Solo ${name(who)} opera este paso de forma autónoma${isTrainer ? " (y es quien puede enseñarlo)" : ""}. Si falta, el paso queda descubierto: entrena a un segundo operario.`,
      });
    } else if (s.trainers.length === 1) {
      alerts.push({
        kind: "un-solo-instructor",
        severity: "baja",
        stepNumber: s.step.number,
        operatorId: s.trainers[0],
        title: `${stepLabel}: un solo instructor`,
        detail: `Solo ${name(s.trainers[0])} está en nivel O y puede enseñar este paso. Forma un segundo instructor para no depender de una persona.`,
      });
    }
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── Informe completo ─────────────────────────────────────────────────────────────

export interface SkillsReport {
  learning: OperatorLearning[];
  matrix: CompetencyMatrix;
  alerts: TrainingAlert[];
}

/** Curva de aprendizaje por operario + matriz ILUO + alertas, listo para la interfaz. */
export function buildSkillsReport(input: {
  steps: readonly StepConfig[];
  operators: readonly OperatorConfig[];
  cycles: readonly CycleRecord[];
  targetCycleTime: number;
}): SkillsReport {
  const { steps, operators, cycles, targetCycleTime } = input;
  const learning = operators.map((operator) => {
    const own = operatorCycles(cycles, operator.id);
    return { operator, cycleCount: own.length, result: analyzeLearningCurve(own.map((c) => c.duration), targetCycleTime) };
  });
  const matrix = assessCompetency(steps, operators, cycles, targetCycleTime);
  return { learning, matrix, alerts: trainingAlerts(matrix, learning) };
}
