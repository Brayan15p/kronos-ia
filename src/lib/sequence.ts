/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Secuencia del método: detecta pasos omitidos, fuera de orden, repetidos o demasiado cortos en
// cada ciclo y mide si esas desviaciones van de la mano con los defectos. Es la base para pasar
// de medir el tiempo a prevenir defectos (poka-yoke de método).
//
// Convenciones de Kronos (no de una norma):
// - El orden estándar es el orden de los pasos configurados.
// - "Omitido" solo cuando el observador lo marcó (modo secuencia observada). Un paso sin tiempo
//   en medio del ciclo es "sin registro" (posible omisión): puede ser un olvido del observador.
//   Si faltan solo los últimos pasos, el ciclo se guardó a medias y no se cuenta como desviación.
// - "Muy corto": dura menos del 25 % de la mediana del paso (mediana ≥ 2 s y ≥ 5 lecturas).
// - La relación con los defectos es una asociación (prueba exacta de Fisher), no una causa.
import type { CycleRecord, DefectRecord, StepConfig } from "@/context/TimeStudyContext";

export const SHORT_FRACTION = 0.25;
export const SHORT_MIN_MEDIAN_S = 2;
export const SHORT_MIN_SAMPLES = 5;
export const SIGNIFICANCE = 0.05;

export type DeviationKind = "omitido" | "fuera-de-orden" | "repetido" | "muy-corto" | "sin-registro";

export const DEVIATION_LABEL: Record<DeviationKind, string> = {
  omitido: "Omitido",
  "fuera-de-orden": "Fuera de orden",
  repetido: "Repetido",
  "muy-corto": "Muy corto",
  "sin-registro": "Sin registro",
};

export interface Deviation {
  kind: DeviationKind;
  stepNumber: number;
  /** Explicación corta, p. ej. "hecho antes que el paso 2". */
  detail: string;
}

export interface SequenceToken {
  stepNumber: number;
  /** Posición en el orden estándar (0 = primer paso); −1 si el paso ya no existe. */
  position: number;
  duration: number;
  status: "ok" | "fuera-de-orden" | "repetido" | "muy-corto";
}

export interface CycleSequence {
  cycleId: string;
  operatorId: number;
  operatorName: string;
  cycleNumber: number;
  /** El ciclo se registró con el modo de secuencia observada (el orden es el real). */
  observedOrder: boolean;
  tokens: SequenceToken[];
  deviations: Deviation[];
  /** Tiene alguna desviación confirmada (omitido, fuera de orden, repetido o muy corto). */
  deviated: boolean;
  /** El ciclo terminó antes del último paso (registro parcial, no cuenta como desviación). */
  incomplete: boolean;
  defective: boolean;
}

/** Desviaciones que cuentan para el análisis ("sin registro" no, porque puede ser del observador). */
export const CONFIRMED: DeviationKind[] = ["omitido", "fuera-de-orden", "repetido", "muy-corto"];

const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mediana de cada paso con todas las lecturas válidas del estudio. */
export function stepMedians(cycles: CycleRecord[]): Map<number, { median: number; n: number }> {
  const by = new Map<number, number[]>();
  for (const c of cycles) {
    for (const t of c.steps ?? []) {
      if (!(Number.isFinite(t.duration) && t.duration > 0)) continue;
      const list = by.get(t.stepNumber) ?? [];
      list.push(t.duration);
      by.set(t.stepNumber, list);
    }
  }
  return new Map([...by].map(([k, xs]) => [k, { median: median(xs), n: xs.length }]));
}

/**
 * Pasos que rompen el orden: los que no están en la subsecuencia creciente más larga de
 * posiciones estándar (mínimo número de pasos que habría que mover para recuperar el orden).
 */
export function outOfOrderIndices(positions: number[]): Set<number> {
  const n = positions.length;
  if (n === 0) return new Set();
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  // Al empatar se prefiere el predecesor más reciente y la subsecuencia que termina más tarde:
  // así queda marcado el paso que se adelantó, no los que siguieron el método después de él.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (positions[j] >= positions[i]) continue;
      if (len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      } else if (len[j] + 1 === len[i]) {
        prev[i] = j;
      }
    }
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (len[i] >= len[end]) end = i;
  const keep = new Set<number>();
  for (let i = end; i !== -1; i = prev[i]) keep.add(i);
  const out = new Set<number>();
  for (let i = 0; i < n; i++) if (!keep.has(i)) out.add(i);
  return out;
}

export function isDefective(cycle: CycleRecord, defectCycleIds: Set<string>): boolean {
  return cycle.qualityPass === false || (cycle.defects?.length ?? 0) > 0 || defectCycleIds.has(cycle.id);
}

/** Analiza un ciclo contra el orden estándar. Devuelve null si no tiene tiempos por paso. */
export function analyzeCycle(
  cycle: CycleRecord,
  steps: StepConfig[],
  medians: Map<number, { median: number; n: number }>,
  defectCycleIds: Set<string> = new Set(),
): CycleSequence | null {
  const position = new Map(steps.map((s, i) => [s.number, i]));
  const name = (n: number) => steps.find((s) => s.number === n)?.name ?? `Paso ${n}`;
  const recorded = (cycle.steps ?? []).filter((t) => Number.isFinite(t.duration) && t.duration > 0);
  const omitted = new Set((cycle.omittedSteps ?? []).filter((n) => position.has(n)));
  if (recorded.length === 0 && omitted.size === 0) return null;

  const tokens: SequenceToken[] = recorded.map((t) => ({
    stepNumber: t.stepNumber, position: position.get(t.stepNumber) ?? -1, duration: t.duration, status: "ok",
  }));
  const deviations: Deviation[] = [];

  // Repetidos: segunda vez (o más) que aparece el mismo paso.
  const seen = new Set<number>();
  const firstIdx: number[] = [];
  tokens.forEach((tk, i) => {
    if (tk.position < 0) return;
    if (seen.has(tk.stepNumber)) {
      tk.status = "repetido";
      deviations.push({ kind: "repetido", stepNumber: tk.stepNumber, detail: `${name(tk.stepNumber)} se hizo otra vez (retrabajo)` });
    } else {
      seen.add(tk.stepNumber);
      firstIdx.push(i);
    }
  });

  // Fuera de orden, sobre la primera vez que aparece cada paso.
  const bad = outOfOrderIndices(firstIdx.map((i) => tokens[i].position));
  firstIdx.forEach((tokIdx, k) => {
    if (!bad.has(k)) return;
    const tk = tokens[tokIdx];
    tk.status = "fuera-de-orden";
    const before = firstIdx.slice(k + 1).map((i) => tokens[i]).find((o) => o.position < tk.position);
    const after = firstIdx.slice(0, k).map((i) => tokens[i]).reverse().find((o) => o.position > tk.position);
    const detail = after
      ? `${name(tk.stepNumber)} se hizo después de ${name(after.stepNumber)}`
      : before
        ? `${name(tk.stepNumber)} se hizo antes que ${name(before.stepNumber)}`
        : `${name(tk.stepNumber)} fuera de su lugar`;
    deviations.push({ kind: "fuera-de-orden", stepNumber: tk.stepNumber, detail });
  });

  // Muy cortos: posible paso saltado a medias o registrado de afán.
  for (const tk of tokens) {
    if (tk.status !== "ok" || tk.position < 0) continue;
    const m = medians.get(tk.stepNumber);
    if (!m || m.n < SHORT_MIN_SAMPLES || m.median < SHORT_MIN_MEDIAN_S) continue;
    if (tk.duration < SHORT_FRACTION * m.median) {
      tk.status = "muy-corto";
      deviations.push({
        kind: "muy-corto", stepNumber: tk.stepNumber,
        detail: `${name(tk.stepNumber)} duró ${tk.duration.toFixed(1)} s (mediana ${m.median.toFixed(1)} s)`,
      });
    }
  }

  // Omitidos (marcados por el observador) y pasos sin registro en medio del ciclo.
  for (const n of omitted) {
    if (!seen.has(n)) deviations.push({ kind: "omitido", stepNumber: n, detail: `${name(n)} no se hizo` });
  }
  const lastDone = Math.max(-1, ...tokens.map((t) => t.position), ...[...omitted].map((n) => position.get(n) ?? -1));
  let incomplete = false;
  steps.forEach((s, i) => {
    if (seen.has(s.number) || omitted.has(s.number)) return;
    if (i < lastDone) deviations.push({ kind: "sin-registro", stepNumber: s.number, detail: `${s.name} sin tiempo registrado` });
    else incomplete = true;
  });

  return {
    cycleId: cycle.id,
    operatorId: cycle.operatorId,
    operatorName: cycle.operatorName,
    cycleNumber: cycle.cycleNumber,
    observedOrder: cycle.sequenceMode === "observada",
    tokens,
    deviations,
    deviated: deviations.some((d) => CONFIRMED.includes(d.kind)),
    incomplete,
    defective: isDefective(cycle, defectCycleIds),
  };
}

// ── Estadística ───────────────────────────────────────────────────────────────────

const logFact = (() => {
  const cache = [0];
  return (n: number) => {
    for (let i = cache.length; i <= n; i++) cache[i] = cache[i - 1] + Math.log(i);
    return cache[n];
  };
})();

/**
 * Prueba exacta de Fisher (bilateral) para la tabla 2×2 [[a, b], [c, d]]: suma la probabilidad
 * de todas las tablas con los mismos totales que son tan o menos probables que la observada.
 */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = a + b + c + d;
  if (n === 0 || r1 === 0 || r2 === 0 || c1 === 0 || c1 === n) return 1;
  const logP = (x: number) =>
    logFact(r1) + logFact(r2) + logFact(c1) + logFact(n - c1) - logFact(n) -
    logFact(x) - logFact(r1 - x) - logFact(c1 - x) - logFact(r2 - c1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

export interface Association {
  /** Ciclos con la desviación y cuántos de ellos salieron con defecto. */
  withDev: number;
  withDevDefective: number;
  /** Ciclos sin la desviación y cuántos salieron con defecto. */
  without: number;
  withoutDefective: number;
  rateWith: number;
  rateWithout: number;
  pValue: number;
  /** Diferencia significativa (p < 0,05) y en la dirección de "desviarse empeora la calidad". */
  significant: boolean;
}

export function association(withDev: number, withDevDefective: number, without: number, withoutDefective: number): Association {
  const rateWith = withDev > 0 ? withDevDefective / withDev : 0;
  const rateWithout = without > 0 ? withoutDefective / without : 0;
  const pValue = fisherExact(withDevDefective, withDev - withDevDefective, withoutDefective, without - withoutDefective);
  return {
    withDev, withDevDefective, without, withoutDefective, rateWith, rateWithout, pValue,
    significant: pValue < SIGNIFICANCE && rateWith > rateWithout,
  };
}

// ── Reporte del estudio ───────────────────────────────────────────────────────────

export interface StepSequenceStats {
  stepNumber: number;
  name: string;
  /** Ciclos analizados en los que el paso pudo evaluarse (no cuenta los ciclos a medias). */
  cycles: number;
  counts: Record<DeviationKind, number>;
  /** Ciclos con alguna desviación confirmada de este paso / ciclos analizados. */
  deviationRate: number;
  association: Association;
}

export interface OperatorSequenceStats {
  operatorId: number;
  operatorName: string;
  cycles: number;
  deviated: number;
  rate: number;
}

export interface SequenceReport {
  analyzed: CycleSequence[];
  /** Ciclos sin tiempos por paso (p. ej. ciclos automáticos de Vision AI): no se pueden revisar. */
  withoutSteps: number;
  incomplete: number;
  conforming: number;
  deviated: number;
  conformingRate: number;
  /** Cuántos ciclos se registraron con el orden real (modo secuencia observada). */
  observedOrderCycles: number;
  overall: Association;
  steps: StepSequenceStats[];
  operators: OperatorSequenceStats[];
  /** Pasos cuya desviación va de la mano con más defectos (significativo), de mayor a menor efecto. */
  findings: StepSequenceStats[];
}

const emptyCounts = (): Record<DeviationKind, number> =>
  ({ omitido: 0, "fuera-de-orden": 0, repetido: 0, "muy-corto": 0, "sin-registro": 0 });

export function buildSequenceReport(steps: StepConfig[], cycles: CycleRecord[], defects: DefectRecord[] = []): SequenceReport {
  const medians = stepMedians(cycles);
  const defectIds = new Set(defects.map((d) => d.cycleId));
  const analyzed: CycleSequence[] = [];
  let withoutSteps = 0;
  for (const c of cycles) {
    const a = analyzeCycle(c, steps, medians, defectIds);
    if (a) analyzed.push(a);
    else withoutSteps++;
  }
  // Los ciclos a medias sin desviaciones no dicen nada del método: se reportan aparte.
  const usable = analyzed.filter((a) => !(a.incomplete && !a.deviated));
  const deviated = usable.filter((a) => a.deviated);
  const conforming = usable.length - deviated.length;

  const overall = association(
    deviated.length, deviated.filter((a) => a.defective).length,
    conforming, usable.filter((a) => !a.deviated && a.defective).length,
  );

  const stepStats: StepSequenceStats[] = steps.map((s) => {
    const counts = emptyCounts();
    let withDev = 0, withDevDef = 0, without = 0, withoutDef = 0;
    for (const a of usable) {
      const devs = a.deviations.filter((d) => d.stepNumber === s.number);
      devs.forEach((d) => { counts[d.kind]++; });
      const has = devs.some((d) => CONFIRMED.includes(d.kind));
      if (has) { withDev++; if (a.defective) withDevDef++; } else { without++; if (a.defective) withoutDef++; }
    }
    return {
      stepNumber: s.number, name: s.name, cycles: usable.length, counts,
      deviationRate: usable.length ? withDev / usable.length : 0,
      association: association(withDev, withDevDef, without, withoutDef),
    };
  });

  const byOp = new Map<number, OperatorSequenceStats>();
  for (const a of usable) {
    const o = byOp.get(a.operatorId) ?? { operatorId: a.operatorId, operatorName: a.operatorName, cycles: 0, deviated: 0, rate: 0 };
    o.cycles++;
    if (a.deviated) o.deviated++;
    byOp.set(a.operatorId, o);
  }
  const operators = [...byOp.values()].map((o) => ({ ...o, rate: o.cycles ? o.deviated / o.cycles : 0 }))
    .sort((x, y) => y.rate - x.rate);

  const findings = stepStats.filter((s) => s.association.significant)
    .sort((x, y) => (y.association.rateWith - y.association.rateWithout) - (x.association.rateWith - x.association.rateWithout));

  return {
    analyzed,
    withoutSteps,
    incomplete: analyzed.filter((a) => a.incomplete && !a.deviated).length,
    conforming,
    deviated: deviated.length,
    conformingRate: usable.length ? conforming / usable.length : 0,
    observedOrderCycles: analyzed.filter((a) => a.observedOrder).length,
    overall,
    steps: stepStats,
    operators,
    findings,
  };
}

// ── Apoyo al cronómetro en modo secuencia observada ─────────────────────────────

/** Siguiente paso pendiente después de `from` (índice); si no hay, el primero pendiente; si no, −1. */
export function nextPendingIndex(steps: StepConfig[], done: Set<number>, from: number): number {
  for (let i = from + 1; i < steps.length; i++) if (!done.has(steps[i].number)) return i;
  for (let i = 0; i < steps.length; i++) if (!done.has(steps[i].number)) return i;
  return -1;
}

/** Desviaciones del ciclo en curso para avisar en vivo (sin "muy corto": aún no hay contexto). */
export function liveDeviations(steps: StepConfig[], observed: number[], omitted: number[]): Deviation[] {
  const pseudo: CycleRecord = {
    id: "en-curso", operatorId: 0, operatorName: "", cycleNumber: 0, duration: 0,
    steps: observed.map((n) => ({ stepNumber: n, stepName: "", duration: 1, timestamp: new Date(0) })),
    timestamp: new Date(0), qualityPass: true, defects: [], notes: "", omittedSteps: omitted, sequenceMode: "observada",
  };
  return analyzeCycle(pseudo, steps, new Map())?.deviations.filter((d) => d.kind !== "sin-registro") ?? [];
}
