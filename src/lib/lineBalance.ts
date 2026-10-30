/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Balanceo de línea: takt, estaciones mínimas, asignación óptima de pasos a estaciones
// y riesgo de que cada estación supere el takt (Monte Carlo sobre los tiempos medidos).
import type { CycleRecord, StepConfig } from "@/context/TimeStudyContext";

export interface TaskTime {
  number: number;
  name: string;
  mean: number;      // s
  sd: number;        // s (muestral)
  samples: number[]; // observaciones (s), para el remuestreo
}

export interface DemandConfig {
  unitsPerMonth: number;
  daysPerMonth: number;
  shiftsPerDay: number;
  hoursPerShift: number;
  breakMinutesPerShift: number; // pausas, almuerzo y pausas activas, no productivas
}

/** Clave de localStorage donde el balanceo guarda la demanda y los turnos (la usa también el gemelo digital). */
export const LINE_BALANCE_CONFIG_KEY = "kronos_line_balance_v1";

/** Lee la demanda y los turnos guardados; si no hay nada, usa la meta mensual del estudio de costos. */
export function loadDemandConfig(fallbackUnits: number): DemandConfig {
  const base: DemandConfig = { unitsPerMonth: fallbackUnits, daysPerMonth: 24, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 30 };
  try {
    const raw = localStorage.getItem(LINE_BALANCE_CONFIG_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<DemandConfig>) } : base;
  } catch {
    return base; // almacenamiento no disponible
  }
}

export interface Station {
  index: number;
  tasks: TaskTime[];
  mean: number;
  sd: number;
}

export interface StationRisk {
  pOverTakt: number; // probabilidad de que un ciclo de la estación supere el takt
  p95: number;       // s
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sampleSd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Segundos productivos al mes. */
export function availableSeconds(c: DemandConfig): number {
  const perShift = Math.max(0, c.hoursPerShift * 3600 - c.breakMinutesPerShift * 60);
  return perShift * c.shiftsPerDay * c.daysPerMonth;
}

/** Takt (s por unidad): el ritmo al que hay que producir para cumplir la demanda. */
export function taktTime(c: DemandConfig): number {
  return c.unitsPerMonth > 0 ? availableSeconds(c) / c.unitsPerMonth : Infinity;
}

/**
 * Tiempo de cada paso a partir de los ciclos con tiempos por paso. Si ningún ciclo los tiene
 * (p. ej. ciclos automáticos de Vision AI), el proceso entero se trata como una sola tarea.
 */
export function taskTimes(steps: StepConfig[], cycles: CycleRecord[]): TaskTime[] {
  const tasks = steps
    .map((s) => {
      const samples = cycles.flatMap((c) => c.steps).filter((t) => t.stepNumber === s.number && t.duration > 0)
        .map((t) => t.duration);
      return { number: s.number, name: s.name, mean: samples.length ? mean(samples) : 0, sd: sampleSd(samples), samples };
    })
    .filter((t) => t.samples.length > 0);
  if (tasks.length > 0) return tasks;
  const durations = cycles.map((c) => c.duration).filter((d) => d > 0);
  return durations.length
    ? [{ number: 1, name: "Ciclo completo", mean: mean(durations), sd: sampleSd(durations), samples: durations }]
    : [];
}

/** Mínimo teórico de estaciones para no superar el takt. */
export function minStations(tasks: TaskTime[], takt: number): number {
  const total = tasks.reduce((s, t) => s + t.mean, 0);
  if (!(takt > 0) || !Number.isFinite(takt) || total === 0) return 1;
  return Math.max(1, Math.ceil(total / takt - 1e-9));
}

const buildStation = (index: number, tasks: TaskTime[]): Station => ({
  index,
  tasks,
  mean: tasks.reduce((s, t) => s + t.mean, 0),
  sd: Math.sqrt(tasks.reduce((s, t) => s + t.sd ** 2, 0)), // pasos independientes
});

/**
 * Reparte los pasos, en su orden, en `k` estaciones minimizando la estación más lenta
 * (programación dinámica exacta; los pasos de un proceso manual son secuenciales).
 */
export function balanceLine(tasks: TaskTime[], k: number): Station[] {
  const n = tasks.length;
  if (n === 0) return [];
  const m = Math.max(1, Math.min(Math.floor(k), n));
  const prefix = [0];
  for (const t of tasks) prefix.push(prefix[prefix.length - 1] + t.mean);
  const seg = (i: number, j: number) => prefix[j] - prefix[i]; // pasos [i, j)

  // best[s][j]: mejor máximo usando s estaciones para los primeros j pasos
  const best = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let s = 1; s <= m; s++) {
    for (let j = s; j <= n; j++) {
      for (let i = s - 1; i < j; i++) {
        const v = Math.max(best[s - 1][i], seg(i, j));
        if (v < best[s][j] - 1e-12) {
          best[s][j] = v;
          cut[s][j] = i;
        }
      }
    }
  }
  const bounds: [number, number][] = [];
  for (let s = m, j = n; s > 0; s--) {
    const i = cut[s][j];
    bounds.unshift([i, j]);
    j = i;
  }
  return bounds.map(([i, j], idx) => buildStation(idx + 1, tasks.slice(i, j)));
}

export interface LineMetrics {
  cycleTime: number;       // s: la estación más lenta marca el ritmo
  bottleneck: number;      // índice de la estación cuello de botella
  efficiency: number;      // 0–1: trabajo total / (estaciones × tiempo de ciclo)
  balanceDelay: number;    // 0–1: tiempo ocioso relativo
  smoothness: number;      // índice de suavidad √Σ(máx − tᵢ)²
  unitsPerHour: number;
  meetsTakt: boolean;
}

export function lineMetrics(stations: Station[], takt: number): LineMetrics {
  const k = stations.length;
  const total = stations.reduce((s, st) => s + st.mean, 0);
  const cycleTime = Math.max(0, ...stations.map((s) => s.mean));
  const bottleneck = stations.reduce((b, s) => (s.mean > (stations[b - 1]?.mean ?? -1) ? s.index : b), 1);
  const efficiency = k > 0 && cycleTime > 0 ? total / (k * cycleTime) : 0;
  return {
    cycleTime,
    bottleneck,
    efficiency,
    balanceDelay: k > 0 && cycleTime > 0 ? 1 - efficiency : 0,
    smoothness: Math.sqrt(stations.reduce((s, st) => s + (cycleTime - st.mean) ** 2, 0)),
    unitsPerHour: cycleTime > 0 ? 3600 / cycleTime : 0,
    meetsTakt: cycleTime <= takt + 1e-9,
  };
}

/**
 * Riesgo por estación con Monte Carlo: en cada iteración toma, para cada paso, una de sus
 * observaciones reales al azar (bootstrap) y suma la estación. Así respeta la forma real de
 * la distribución (sesgo, colas) sin suponer normalidad.
 */
export function stationRisk(station: Station, takt: number, iterations = 5000, rand: () => number = Math.random): StationRisk {
  if (station.tasks.length === 0) return { pOverTakt: 0, p95: 0 };
  const sums = new Float64Array(iterations);
  let over = 0;
  for (let it = 0; it < iterations; it++) {
    let s = 0;
    for (const t of station.tasks) s += t.samples[Math.floor(rand() * t.samples.length)];
    sums[it] = s;
    if (s > takt) over++;
  }
  sums.sort();
  return { pOverTakt: over / iterations, p95: sums[Math.min(iterations - 1, Math.floor(0.95 * iterations))] };
}

export interface StationsNeeded {
  /** Menor número de estaciones cuyo reparto real cumple el takt, o null si es imposible. */
  stations: number | null;
  /** Pasos que por sí solos superan el takt: hay que dividirlos o duplicar la estación. */
  tooLong: TaskTime[];
}

/**
 * El mínimo teórico ⌈total/takt⌉ no siempre alcanza: los pasos no se pueden partir, así que el
 * reparto real puede necesitar una estación más. Busca el menor número que sí cumple.
 */
export function stationsToMeetTakt(tasks: TaskTime[], takt: number): StationsNeeded {
  const tooLong = tasks.filter((t) => t.mean > takt + 1e-9);
  if (tasks.length === 0 || tooLong.length > 0 || !(takt > 0)) return { stations: null, tooLong };
  for (let k = minStations(tasks, takt); k <= tasks.length; k++) {
    if (Math.max(...balanceLine(tasks, k).map((s) => s.mean)) <= takt + 1e-9) return { stations: k, tooLong };
  }
  return { stations: null, tooLong };
}
