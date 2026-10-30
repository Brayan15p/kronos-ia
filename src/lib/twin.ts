/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Gemelo digital del proceso: simula escenarios "¿y si…?" sobre los tiempos medidos antes de
// tocar la planta. Reutiliza el balanceo de línea y simula la línea completa con Monte Carlo
// (la estación más lenta de cada ciclo marca el ritmo).
import {
  availableSeconds, balanceLine, stationsToMeetTakt, taktTime, type DemandConfig, type TaskTime,
} from "@/lib/lineBalance";

export interface Scenario {
  /** Cambio porcentual del tiempo de cada paso (−20 = 20 % más rápido), por número de paso. */
  stepChangePct: Record<number, number>;
  /** Reducción de la variabilidad (0–90 %): acerca cada observación a la media del paso. */
  variabilityReductionPct: number;
  /** Estaciones (operarios en línea); null = las necesarias para cumplir el takt. */
  stations: number | null;
  demandChangePct: number;
  shiftsPerDay: number;
  hoursPerShift: number;
  hourlyCost: number;   // COP por hora por operario
  unitPrice: number;    // COP por unidad (valor que aporta cada unidad)
}

export interface TwinResult {
  takt: number;
  stations: number;
  stationTimes: number[];    // media por estación (s)
  cycleTime: number;         // media de la estación más lenta (s)
  lineCycleP95: number;      // p95 del ciclo de la línea (s), simulado
  pLate: number;             // probabilidad de que un ciclo de la línea supere el takt
  capacityPerMonth: number;  // unidades que la línea puede hacer al mes
  demand: number;
  unitsPerMonth: number;     // min(demanda, capacidad)
  meetsDemand: boolean;
  labourCostPerMonth: number;
  labourCostPerUnit: number;
  revenuePerMonth: number;
  marginPerMonth: number;    // ingresos − mano de obra (antes de materiales y gastos)
  efficiency: number;
}

export interface TwinBase {
  tasks: TaskTime[];
  demand: DemandConfig;
  hourlyCost: number;
  unitPrice: number;
}

/** PRNG reproducible (Mulberry32): el mismo escenario siempre da los mismos números. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function baseScenario(base: TwinBase): Scenario {
  return {
    stepChangePct: {},
    variabilityReductionPct: 0,
    stations: null,
    demandChangePct: 0,
    shiftsPerDay: base.demand.shiftsPerDay,
    hoursPerShift: base.demand.hoursPerShift,
    hourlyCost: base.hourlyCost,
    unitPrice: base.unitPrice,
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Aplica las palancas a los tiempos de cada paso (las observaciones se escalan y se concentran). */
export function applyScenarioToTasks(tasks: TaskTime[], s: Scenario): TaskTime[] {
  const shrink = 1 - clamp(s.variabilityReductionPct, 0, 90) / 100;
  return tasks.map((t) => {
    const factor = Math.max(0.05, 1 + (s.stepChangePct[t.number] ?? 0) / 100);
    const samples = t.samples.map((x) => (t.mean + (x - t.mean) * shrink) * factor);
    const mean = t.mean * factor;
    return { ...t, mean, sd: t.sd * shrink * factor, samples };
  });
}

export function simulateScenario(base: TwinBase, s: Scenario, iterations = 4000, seed = 2026): TwinResult {
  const demandCfg: DemandConfig = {
    ...base.demand,
    unitsPerMonth: Math.max(0, base.demand.unitsPerMonth * (1 + s.demandChangePct / 100)),
    shiftsPerDay: Math.max(0, s.shiftsPerDay),
    hoursPerShift: Math.max(0, s.hoursPerShift),
  };
  const tasks = applyScenarioToTasks(base.tasks, s);
  const takt = taktTime(demandCfg);
  const needed = stationsToMeetTakt(tasks, takt).stations ?? tasks.length;
  const k = clamp(Math.round(s.stations ?? needed), 1, Math.max(1, tasks.length));
  const line = balanceLine(tasks, k);
  const stationTimes = line.map((st) => st.mean);
  const cycleTime = Math.max(0, ...stationTimes);

  // Monte Carlo de la línea: en cada iteración se sortea cada paso y el ciclo lo marca la estación más lenta.
  const rand = seededRandom(seed);
  const lineTimes = new Float64Array(iterations);
  let late = 0;
  for (let it = 0; it < iterations; it++) {
    let worst = 0;
    for (const st of line) {
      let sum = 0;
      for (const t of st.tasks) sum += t.samples.length ? t.samples[Math.floor(rand() * t.samples.length)] : t.mean;
      if (sum > worst) worst = sum;
    }
    lineTimes[it] = worst;
    if (worst > takt) late++;
  }
  lineTimes.sort();

  const available = availableSeconds(demandCfg);
  const capacityPerMonth = cycleTime > 0 ? available / cycleTime : 0;
  const demand = demandCfg.unitsPerMonth;
  const unitsPerMonth = Math.min(demand, capacityPerMonth);
  // Se paga la jornada completa de cada operario de la línea, produzca o no.
  const paidHours = demandCfg.shiftsPerDay * demandCfg.hoursPerShift * demandCfg.daysPerMonth;
  const labourCostPerMonth = k * paidHours * s.hourlyCost;
  const revenuePerMonth = unitsPerMonth * s.unitPrice;
  const total = stationTimes.reduce((a, b) => a + b, 0);

  return {
    takt,
    stations: k,
    stationTimes,
    cycleTime,
    lineCycleP95: iterations ? lineTimes[Math.min(iterations - 1, Math.floor(0.95 * iterations))] : 0,
    pLate: iterations ? late / iterations : 0,
    capacityPerMonth,
    demand,
    unitsPerMonth,
    meetsDemand: capacityPerMonth >= demand - 1e-9,
    labourCostPerMonth,
    labourCostPerUnit: unitsPerMonth > 0 ? labourCostPerMonth / unitsPerMonth : 0,
    revenuePerMonth,
    marginPerMonth: revenuePerMonth - labourCostPerMonth,
    efficiency: k > 0 && cycleTime > 0 ? total / (k * cycleTime) : 0,
  };
}

/** Escenarios prediseñados que suelen valer la pena probar primero. */
export function presetScenarios(base: TwinBase): { id: string; label: string; description: string; scenario: Scenario }[] {
  const s0 = baseScenario(base);
  const current = simulateScenario(base, s0, 500);
  // Paso más largo de la estación cuello de botella actual.
  const k = current.stations;
  const line = balanceLine(base.tasks, k);
  const bottleneck = line.reduce((b, st) => (st.mean > b.mean ? st : b), line[0]);
  const longest = bottleneck?.tasks.reduce((a, t) => (t.mean > a.mean ? t : a), bottleneck.tasks[0]);
  return [
    {
      id: "cuello",
      label: "Atacar el cuello de botella",
      description: longest ? `"${longest.name}" 20 % más rápido (mejor método o herramienta)` : "Sin datos de pasos",
      scenario: { ...s0, stepChangePct: longest ? { [longest.number]: -20 } : {} },
    },
    {
      id: "estandarizar",
      label: "Estandarizar el método",
      description: "Variabilidad −40 % (trabajo estándar y entrenamiento)",
      scenario: { ...s0, variabilityReductionPct: 40 },
    },
    {
      id: "demanda",
      label: "Demanda +20 %",
      description: "¿Aguanta la línea un cliente nuevo?",
      scenario: { ...s0, demandChangePct: 20 },
    },
    {
      id: "turno",
      label: "Segundo turno",
      description: "Duplica el tiempo disponible sin cambiar la línea",
      scenario: { ...s0, shiftsPerDay: Math.min(3, Math.max(1, s0.shiftsPerDay) * 2), stations: k },
    },
  ];
}
