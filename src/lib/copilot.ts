/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Copiloto de planta: responde «¿qué hago el lunes?» con una lista de oportunidades de mejora
 * priorizada y valorada en pesos (COP), a partir de los datos que Kronos ya tiene.
 *
 * Motor puro (sin React ni almacenamiento): recibe una «foto» de todos los módulos y no
 * duplica sus cálculos, los reutiliza:
 *   - Estudio de tiempos (TimeStudyContext): pasos, operarios, ciclos, defectos, inspecciones.
 *   - Balanceo de línea (lib/lineBalance): takt, reparto óptimo, estaciones necesarias.
 *   - Competencias (lib/learning): curva de aprendizaje, matriz ILUO.
 *   - SG-SST (lib/sgsst + SSTContext): matriz GTC 45, plan de acción, lux, dosis de ruido.
 *   - Monte Carlo (workers/montecarlo.worker): índice de capacidad Cpk.
 *
 * Reglas:
 *   1. Todo número sale de los datos. Si falta un dato, se emite una «acción de medición» en vez
 *      de suponerlo.
 *   2. Cada impacto en COP muestra su fórmula, sus entradas y sus supuestos. La ergonomía y la
 *      SST no se monetizan («impacto en salud: no monetizado»): se priorizan por severidad.
 *   3. Orden (ver rankOpportunities):
 *        a) Seguridad crítica (NR I sin acción abierta, dosis de ruido > 100 %, postura crítica
 *           RULA ≥ 7 o REBA ≥ 11): siempre arriba, sin importar el dinero.
 *        b) Seguridad alta (NR II sin acción abierta; la GTC 45 pide «corregir y adoptar medidas
 *           de control de inmediato»).
 *        c) Oportunidades monetizadas, por impacto mensual ÷ peso del esfuerzo (S = 1, M = 2, L = 4).
 *        d) Oportunidades sin monetizar, por severidad y luego por menor esfuerzo.
 *        e) Acciones de medición, por severidad.
 *   4. El total mensual no cuenta dos veces el mismo ahorro: dentro de cada grupo de solapamiento
 *      (línea, tiempo de ciclo, calidad) solo se suma la oportunidad mayor.
 *
 * Los umbrales de este archivo (85 % de eficiencia, 10/30 ciclos, CV 20 %, etc.) son una
 * CONVENCIÓN DE KRONOS, exportados como constantes para poder ajustarlos.
 *
 * Los nombres de los operarios nunca se escriben en los textos: se usa la marca opToken(id),
 * que la interfaz resuelve con el nombre real y la narración por IA con «Operario A/B…».
 */
import type {
  CostConfig, CycleRecord, DefectRecord, OperatorConfig, QualityCheck, StepConfig,
} from "@/context/TimeStudyContext";
import { calculateDailyDose, getLuxCompliance, REGULATIONS, type EnvironmentalReading } from "@/context/SSTContext";
import {
  availableSeconds, balanceLine, lineMetrics, stationsToMeetTakt, taktTime, taskTimes,
  type DemandConfig, type Station, type TaskTime,
} from "@/lib/lineBalance";
import {
  buildSkillsReport, coefficientOfVariation, ILUO_THRESHOLDS, isValidDuration, LEARNING_MIN_CYCLES,
  MAX_PREDICTION_CYCLES, mean, median, sampleStd, type SkillsReport,
} from "@/lib/learning";
import {
  buildMatrix, HAZARDS, latestByPuesto, NR_INTERPRETATION, rowId, summarizeZones,
  type ActionItem, type ErgoEvaluation, type HazardKey, type MatrixOverride, type MatrixRow, type ZoneSummary,
} from "@/lib/sgsst";
import { capabilityIndices } from "@/workers/montecarlo.worker";

// ── Constantes ajustables (convención Kronos) ────────────────────────────────────

/** Ciclos mínimos para que una decisión sobre tiempos sea razonable. */
export const MIN_RELIABLE_CYCLES = 10;
/** Muestras a partir de las cuales la confianza es «alta» (tiempos). */
export const HIGH_CONFIDENCE_SAMPLES = 30;
/** Inspecciones para confianza «alta» y «media» en tasas de defectos (una proporción necesita más datos). */
export const QUALITY_HIGH_CONFIDENCE = 50;
export const QUALITY_MEDIUM_CONFIDENCE = 20;
/** Eficiencia de línea de referencia. */
export const LINE_EFFICIENCY_TARGET = 0.85;
/** CV a partir del cual un paso se considera irregular (el mismo límite del nivel U de la matriz ILUO). */
export const VARIABILITY_CV_LIMIT = ILUO_THRESHOLDS.U.maxCv;
/** Registros mínimos de un paso para juzgar su variabilidad (los mismos del nivel U). */
export const VARIABILITY_MIN_SAMPLES = ILUO_THRESHOLDS.U.minSamples;
/** Inspecciones mínimas por operario para comparar su tasa de defectos. */
export const QUALITY_MIN_PER_OPERATOR = 5;
/** Un operario es «foco» de calidad si su tasa supera la del resto en este factor. */
export const QUALITY_HOTSPOT_FACTOR = 1.5;
/** Dosis diaria de ruido máxima (Res. 1792/1990). */
export const NOISE_DOSE_LIMIT = 100;
/** Niveles de acción: RULA 7 / REBA ≥ 11 «cambiar de inmediato»; RULA ≥ 5 / REBA ≥ 8 «cambiar pronto». */
export const RULA_CRITICAL = 7;
export const REBA_CRITICAL = 11;
export const RULA_HIGH = 5;
export const REBA_HIGH = 8;
/** Lecturas ambientales por zona para confianza «alta» y «media». */
export const READINGS_HIGH_CONFIDENCE = 5;
export const READINGS_MEDIUM_CONFIDENCE = 3;
/** Criterio «capaz» del simulador Monte Carlo: ≥ 95 % de ciclos dentro del objetivo y Cpk ≥ 1,33. */
export const CAPABLE_SHARE = 0.95;
export const CAPABLE_CPK = 1.33;
/** Peso del esfuerzo al ordenar por impacto ÷ esfuerzo. */
export const EFFORT_WEIGHT: Record<Effort, number> = { S: 1, M: 2, L: 4 };
/** Acciones del «Plan de la semana». */
export const WEEK_PLAN_SIZE = 5;

/** Jornada por defecto del balanceo de línea (mismos valores que LineBalancing). */
export const DEFAULT_DEMAND_SHAPE = { daysPerMonth: 24, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 30 } as const;
export const LINE_BALANCE_CONFIG_KEY = "kronos_line_balance_v1";

// ── Tipos ────────────────────────────────────────────────────────────────────────

export type CopilotArea = "productividad" | "calidad" | "personas" | "ergonomia-sst";
export const AREA_LABEL: Record<CopilotArea, string> = {
  productividad: "Productividad",
  calidad: "Calidad",
  personas: "Personas",
  "ergonomia-sst": "Ergonomía y SST",
};
export const AREAS: CopilotArea[] = ["productividad", "calidad", "personas", "ergonomia-sst"];

export type Confidence = "alta" | "media" | "baja";
export type Effort = "S" | "M" | "L";
export type Severity = "critica" | "alta" | "media" | "baja";
export type PriorityTier = "seguridad-critica" | "seguridad-alta" | "economica" | "sin-monetizar" | "medicion";
export const PRIORITY_LABEL: Record<PriorityTier, string> = {
  "seguridad-critica": "Seguridad primero",
  "seguridad-alta": "Seguridad",
  economica: "Ahorro",
  "sin-monetizar": "Sin monetizar",
  medicion: "Medición",
};
const TIER_ORDER: Record<PriorityTier, number> = {
  "seguridad-critica": 0, "seguridad-alta": 1, economica: 2, "sin-monetizar": 3, medicion: 4,
};
const SEVERITY_ORDER: Record<Severity, number> = { critica: 0, alta: 1, media: 2, baja: 3 };

/** Pestañas de Kronos que muestran la evidencia (TabId de Index). */
export type CopilotTab =
  | "timer" | "steps" | "cost" | "quality" | "defects" | "line-balance" | "skills"
  | "montecarlo" | "sgsst" | "environment" | "vision-ai";

export type DetectorId =
  | "cuello-botella" | "eficiencia-linea" | "variabilidad-paso" | "operarios-estandar" | "punto-unico-falla"
  | "calidad-global" | "calidad-operario" | "gtc45-sin-accion" | "dosis-ruido" | "iluminacion"
  | "postura-critica" | "capacidad-proceso" | "medicion";

export interface ImpactInput { label: string; value: string }

export interface ImpactEstimate {
  /** COP/mes estimados; null = no monetizado (ver `note`). */
  monthlyCOP: number | null;
  formula: string;
  inputs: ImpactInput[];
  assumptions: string[];
  note: string;
  /** Oportunidades del mismo grupo comparten ahorro: solo la mayor entra al total. */
  overlapGroup: string | null;
  countedInTotal: boolean;
}

export interface Evidence { tab: CopilotTab; label: string }

export interface Opportunity {
  id: string;
  detector: DetectorId;
  kind: "mejora" | "medicion";
  area: CopilotArea;
  title: string;
  diagnosis: string;
  action: string;
  impact: ImpactEstimate;
  confidence: Confidence;
  confidenceReason: string;
  effort: Effort;
  severity: Severity;
  /** Desempate dentro de los niveles de seguridad (NR de la GTC 45 o equivalente). */
  severityScore: number;
  /** «critica»/«alta» = va arriba por seguridad, sin importar el dinero. */
  safety: "critica" | "alta" | null;
  evidence: Evidence[];
  priority: PriorityTier;
  /** Posición 1..n tras ordenar. */
  rank: number;
}

export type OpportunityDraft = Omit<Opportunity, "priority" | "rank">;

export interface CopilotSnapshot {
  steps: StepConfig[];
  operators: OperatorConfig[];
  cycles: CycleRecord[];
  defects: DefectRecord[];
  qualityChecks: QualityCheck[];
  costConfig: CostConfig;
  /** Demanda guardada en Balanceo de línea; null si nunca se configuró. */
  demand: DemandConfig | null;
  evaluations: ErgoEvaluation[];
  matrixOverrides: Record<string, MatrixOverride>;
  plan: ActionItem[];
  readings: EnvironmentalReading[];
}

export interface CopilotReport {
  opportunities: Opportunity[];
  weekPlan: Opportunity[];
  /** Suma de lo monetizado sin doble conteo (COP/mes, estimado). */
  totalMonthlyCOP: number;
  monetizedCount: number;
  safetyCount: number;
  measurementCount: number;
  /** false: no hay ni ciclos ni datos de SST; la interfaz muestra qué medir primero. */
  hasData: boolean;
}

// ── Utilidades ───────────────────────────────────────────────────────────────────

const isPos = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const finiteOr = (x: number, d = 0) => (Number.isFinite(x) ? x : d);

const fmt = (x: number, d = 1) =>
  finiteOr(x).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const sec = (x: number) => `${fmt(x)} s`;
const pct = (x: number, d = 0) => `${fmt(x * 100, d)} %`;
const int = (x: number) => Math.round(finiteOr(x)).toLocaleString("es-CO");
/** «$ 1.234.567» (pesos colombianos sin decimales). */
export const formatCOP = (x: number) => `$ ${int(x)}`;

/** Marca de operario: la interfaz la cambia por el nombre y la IA por un alias. */
export const opToken = (id: number) => `⟦op:${id}⟧`;
const OP_TOKEN_RE = /⟦op:(-?\d+)⟧/g;

/** Sustituye las marcas de operario por el texto que devuelva `nameOf`. */
export function resolveOperatorNames(text: string, nameOf: (id: number) => string): string {
  return text.replace(OP_TOKEN_RE, (_, id: string) => nameOf(Number(id)));
}

/** «A», «B», …, «Z», «AA», «AB»… */
export function aliasLetters(index: number): string {
  let i = Math.max(0, Math.floor(index));
  let s = "";
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function countConfidence(n: number, high = HIGH_CONFIDENCE_SAMPLES, medium = MIN_RELIABLE_CYCLES): Confidence {
  if (n >= high) return "alta";
  if (n >= medium) return "media";
  return "baja";
}
const downgrade = (c: Confidence): Confidence => (c === "alta" ? "media" : "baja");

/** «1 estación», «3 estaciones». */
const plural = (n: number, one: string, many: string) => `${int(n)} ${Math.round(n) === 1 ? one : many}`;

const stepLabel = (t: { number: number; name: string }) => `Paso ${t.number} · ${t.name}`;
const stationLabel = (s: Station) => `E${s.index} (pasos ${s.tasks.map((t) => t.number).join(", ")})`;

/** Lee la demanda guardada por Balanceo de línea. `configured` = el usuario la guardó alguna vez. */
export function parseDemandConfig(raw: string | null, fallbackUnits: number): { demand: DemandConfig; configured: boolean } {
  const base: DemandConfig = { unitsPerMonth: isPos(fallbackUnits) ? fallbackUnits : 0, ...DEFAULT_DEMAND_SHAPE };
  if (!raw) return { demand: base, configured: false };
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (!d || typeof d !== "object") return { demand: base, configured: false };
    const pick = (k: keyof DemandConfig) => (typeof d[k] === "number" && Number.isFinite(d[k]) && (d[k] as number) >= 0 ? (d[k] as number) : base[k]);
    return {
      demand: {
        unitsPerMonth: pick("unitsPerMonth"),
        daysPerMonth: pick("daysPerMonth"),
        shiftsPerDay: pick("shiftsPerDay"),
        hoursPerShift: pick("hoursPerShift"),
        breakMinutesPerShift: pick("breakMinutesPerShift"),
      },
      configured: true,
    };
  } catch {
    return { demand: base, configured: false };
  }
}

// ── Contexto común a los detectores ──────────────────────────────────────────────

interface Ctx {
  s: CopilotSnapshot;
  /** Ciclos con duración válida y solo tiempos por paso válidos. */
  cycles: CycleRecord[];
  /** Ciclos de operarios registrados (los demás no tienen costo ni nombre). */
  knownCycles: CycleRecord[];
  /** Meta mensual de producción (Fuga de Dinero): base de los impactos en COP. */
  units: number | null;
  target: number | null;
  productValue: number | null;
  /** Costo medio de mano de obra por segundo (operarios con costo > 0). */
  costPerSec: number | null;
  avgHourly: number | null;
  hourlyOf: Map<number, number>;
  demand: DemandConfig;
  demandConfigured: boolean;
  tasks: TaskTime[];
  hasStepData: boolean;
  skills: SkillsReport;
  rows: MatrixRow[];
  zones: ZoneSummary[];
  latestEvals: ErgoEvaluation[];
}

function buildCtx(s: CopilotSnapshot): Ctx {
  const stepNumbers = new Set(s.steps.map((st) => st.number));
  const cycles = (s.cycles ?? [])
    .filter((c) => c && isValidDuration(c.duration))
    .map((c) => ({ ...c, steps: (Array.isArray(c.steps) ? c.steps : []).filter((t) => t && isValidDuration(t.duration)) }));
  const opIds = new Set(s.operators.map((o) => o.id));
  const knownCycles = cycles.filter((c) => opIds.has(c.operatorId));
  const hourlyOf = new Map(s.operators.filter((o) => isPos(o.hourlyCost)).map((o) => [o.id, o.hourlyCost]));
  const hourly = [...hourlyOf.values()];
  const avgHourly = hourly.length ? mean(hourly) : null;
  const target = isPos(s.costConfig?.targetCycleTime) ? s.costConfig.targetCycleTime : null;
  const fallbackUnits = isPos(s.costConfig?.monthlyProductionTarget) ? s.costConfig.monthlyProductionTarget : 0;
  const demand = s.demand ?? { unitsPerMonth: fallbackUnits, ...DEFAULT_DEMAND_SHAPE };
  return {
    s,
    cycles,
    knownCycles,
    units: isPos(s.costConfig?.monthlyProductionTarget) ? s.costConfig.monthlyProductionTarget : null,
    target,
    productValue: isPos(s.costConfig?.productValue) ? s.costConfig.productValue : null,
    costPerSec: avgHourly !== null ? avgHourly / 3600 : null,
    avgHourly,
    hourlyOf,
    demand,
    demandConfigured: s.demand !== null,
    tasks: taskTimes(s.steps, cycles),
    hasStepData: cycles.some((c) => c.steps.some((t) => stepNumbers.has(t.stepNumber))),
    skills: buildSkillsReport({ steps: s.steps, operators: s.operators, cycles: knownCycles, targetCycleTime: target ?? 0 }),
    rows: buildMatrix({ evaluations: s.evaluations, readings: s.readings, overrides: s.matrixOverrides }).filter((r) => !r.excluded),
    zones: summarizeZones(s.readings),
    latestEvals: latestByPuesto(s.evaluations),
  };
}

const NO_MONEY_COST = "Falta el costo por hora de los operarios: regístralo para monetizar esta oportunidad.";
const HEALTH_NOTE = "Impacto en salud: no monetizado. La GTC 45 valora el riesgo, no su costo; se prioriza por severidad.";

function impact(p: Partial<ImpactEstimate> & Pick<ImpactEstimate, "monthlyCOP" | "formula">): ImpactEstimate {
  const v = p.monthlyCOP;
  return {
    inputs: [],
    assumptions: [],
    note: "",
    overlapGroup: null,
    countedInTotal: false,
    ...p,
    monthlyCOP: v === null || v === undefined || !Number.isFinite(v) ? null : Math.max(0, v),
  };
}

function healthImpact(extra = ""): ImpactEstimate {
  return impact({ monthlyCOP: null, formula: "No aplica: riesgo para la salud, no se convierte a pesos.", note: (HEALTH_NOTE + " " + extra).trim() });
}

// ── Línea (cuello de botella y eficiencia) ───────────────────────────────────────

interface LineSetup {
  takt: number;
  k: number;
  line: Station[];
  metrics: ReturnType<typeof lineMetrics>;
  needed: ReturnType<typeof stationsToMeetTakt>;
}

function lineSetup(ctx: Ctx): LineSetup | null {
  if (!ctx.hasStepData || ctx.tasks.length === 0) return null;
  const takt = taktTime(ctx.demand);
  if (!isPos(takt)) return null;
  const k = Math.min(Math.max(1, ctx.s.operators.length), ctx.tasks.length);
  const line = balanceLine(ctx.tasks, k);
  return { takt, k, line, metrics: lineMetrics(line, takt), needed: stationsToMeetTakt(ctx.tasks, takt) };
}

function demandAssumption(ctx: Ctx): string {
  const d = ctx.demand;
  const shape = `${d.daysPerMonth} días/mes, ${d.shiftsPerDay} turno(s) de ${fmt(d.hoursPerShift)} h y ${int(d.breakMinutesPerShift)} min de pausas`;
  return ctx.demandConfigured
    ? `Demanda y jornada de Balanceo de línea: ${int(d.unitsPerMonth)} u/mes, ${shape}.`
    : `La demanda no se ha configurado en Balanceo de línea: se usan la meta mensual (${int(d.unitsPerMonth)} u) y la jornada por defecto (${shape}).`;
}

function detectBottleneck(ctx: Ctx, ls: LineSetup | null): OpportunityDraft[] {
  if (!ls || ls.metrics.meetsTakt) return [];
  const { takt, k, line, metrics, needed } = ls;
  const st = line[metrics.bottleneck - 1];
  if (!st) return [];
  const gap = metrics.cycleTime - takt;
  const units = ctx.demand.unitsPerMonth;
  const longest = st.tasks.reduce((a, b) => (b.mean > a.mean ? b : a));
  const monthly = ctx.costPerSec !== null ? gap * units * k * ctx.costPerSec : null;
  const availH = availableSeconds(ctx.demand) / 3600;

  let action: string;
  let effort: Effort;
  if (needed.tooLong.length > 0) {
    const t = needed.tooLong.reduce((a, b) => (b.mean > a.mean ? b : a));
    action = `${stepLabel(t)} dura ${sec(t.mean)} y supera por sí solo el takt (${sec(takt)}): divídelo en dos operaciones o duplica esa estación en paralelo. Mientras tanto, la brecha se cubre con horas extra.`;
    effort = "M";
  } else if (needed.stations !== null && needed.stations > k) {
    const plan = balanceLine(ctx.tasks, needed.stations).map(stationLabel).join(" · ");
    action = `Con ${plural(needed.stations, "estación", "estaciones")} el reparto cumple el takt (${plan}). Si no puedes sumar personas, quita ${sec(gap)} a ${stationLabel(st)} empezando por ${stepLabel(longest)} (${sec(longest.mean)}).`;
    effort = "L";
  } else {
    action = `Quita ${sec(gap)} a ${stationLabel(st)}, empezando por ${stepLabel(longest)} (${sec(longest.mean)}).`;
    effort = "M";
  }
  const n = Math.min(...st.tasks.map((t) => t.samples.length));
  let confidence = countConfidence(n);
  if (!ctx.demandConfigured) confidence = downgrade(confidence);

  return [{
    id: "cuello-botella",
    detector: "cuello-botella",
    kind: "mejora",
    area: "productividad",
    title: `Cuello de botella: ${stationLabel(st)} va ${sec(gap)} por encima del takt`,
    diagnosis: `Takt ${sec(takt)} (${int(units)} u/mes en ${fmt(availH)} h productivas). Con ${k} operario(s) como estaciones, el mejor reparto posible deja ${stationLabel(st)} en ${sec(metrics.cycleTime)}: la línea saca ${fmt(metrics.unitsPerHour)} u/h y la demanda pide ${fmt(3600 / takt)} u/h. El paso más largo de esa estación es ${stepLabel(longest)} (${sec(longest.mean)}).`,
    action,
    impact: impact({
      monthlyCOP: monthly,
      formula: "(tiempo de la estación cuello de botella − takt) × unidades/mes × estaciones × costo de mano de obra por segundo",
      inputs: [
        { label: "Estación cuello de botella", value: sec(metrics.cycleTime) },
        { label: "Takt", value: sec(takt) },
        { label: "Brecha por unidad", value: sec(gap) },
        { label: "Unidades/mes (demanda)", value: int(units) },
        { label: "Estaciones (operarios)", value: String(k) },
        { label: "Costo M.O. por segundo", value: ctx.costPerSec !== null ? `${formatCOP(ctx.costPerSec * 3600)}/h ÷ 3600` : "sin dato" },
      ],
      assumptions: [
        "La brecha se cubre con horas extra de toda la línea a tarifa ordinaria (con recargos el costo real es mayor).",
        "Una estación por operario registrado y el mejor reparto posible de los pasos en su orden (Balanceo de línea).",
        demandAssumption(ctx),
      ],
      note: monthly === null ? NO_MONEY_COST : "",
      overlapGroup: "linea",
    }),
    confidence,
    confidenceReason: `${n} registro(s) en el paso con menos datos de la estación${ctx.demandConfigured ? "" : "; demanda sin configurar"}.`,
    effort,
    severity: "alta",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "line-balance", label: "Balanceo de línea" }],
  }];
}

function detectLineEfficiency(ctx: Ctx, ls: LineSetup | null): OpportunityDraft[] {
  if (!ls || ls.k < 2) return [];
  const { k, metrics, needed, takt, line } = ls;
  if (!(metrics.efficiency < LINE_EFFICIENCY_TARGET) || !isPos(metrics.cycleTime)) return [];
  const work = line.reduce((s, st) => s + st.mean, 0);
  const paid = k * metrics.cycleTime;
  const recoverable = paid - work / LINE_EFFICIENCY_TARGET;
  if (!(recoverable > 0)) return [];
  const units = ctx.demand.unitsPerMonth;
  const monthly = ctx.costPerSec !== null ? recoverable * units * ctx.costPerSec : null;
  const slack = line.filter((st) => st.index !== metrics.bottleneck).sort((a, b) => a.mean - b.mean).slice(0, 2);

  let action: string;
  if (needed.stations !== null && needed.stations < k) {
    const plan = balanceLine(ctx.tasks, needed.stations).map(stationLabel).join(" · ");
    action = `La demanda se cumple con ${plural(needed.stations, "estación", "estaciones")}: reasigna ${plural(k - needed.stations, "operario", "operarios")} a otra tarea y reparte así: ${plan}.`;
  } else {
    const longest = ctx.tasks.reduce((a, b) => (b.mean > a.mean ? b : a));
    action = `El reparto ya es el mejor posible con pasos indivisibles: divide ${stepLabel(longest)} (${sec(longest.mean)}) o pasa elementos de trabajo a las estaciones con holgura (${slack.map((s) => `E${s.index}: ${sec(s.mean)}`).join(", ")}).`;
  }
  const n = Math.min(...ctx.tasks.map((t) => t.samples.length));
  let confidence = countConfidence(n);
  if (!ctx.demandConfigured) confidence = downgrade(confidence);

  return [{
    id: "eficiencia-linea",
    detector: "eficiencia-linea",
    kind: "mejora",
    area: "productividad",
    title: `Eficiencia de línea ${pct(metrics.efficiency)} (referencia ${pct(LINE_EFFICIENCY_TARGET)})`,
    diagnosis: `Por unidad se pagan ${k} × ${sec(metrics.cycleTime)} = ${sec(paid)} de línea y el trabajo real suma ${sec(work)}: ${sec(paid - work)} por unidad son espera. El ritmo lo marca E${metrics.bottleneck} (${sec(metrics.cycleTime)}; takt ${sec(takt)}).`,
    action,
    impact: impact({
      monthlyCOP: monthly,
      formula: `(estaciones × tiempo de ciclo − trabajo total ÷ ${fmt(LINE_EFFICIENCY_TARGET, 2)}) × unidades/mes × costo de mano de obra por segundo`,
      inputs: [
        { label: "Estaciones × tiempo de ciclo", value: `${k} × ${sec(metrics.cycleTime)} = ${sec(paid)}` },
        { label: "Trabajo total por unidad", value: sec(work) },
        { label: "Tiempo pagado con 85 % de eficiencia", value: sec(work / LINE_EFFICIENCY_TARGET) },
        { label: "Recuperable por unidad", value: sec(recoverable) },
        { label: "Unidades/mes (demanda)", value: int(units) },
        { label: "Costo M.O. por segundo", value: ctx.costPerSec !== null ? `${formatCOP(ctx.costPerSec * 3600)}/h ÷ 3600` : "sin dato" },
      ],
      assumptions: [
        `Se toma ${pct(LINE_EFFICIENCY_TARGET)} como eficiencia alcanzable (convención Kronos); solo se cuenta el tiempo ocioso por encima de ese nivel.`,
        "La línea se paga al ritmo de su estación más lenta; una estación por operario registrado.",
        demandAssumption(ctx),
      ],
      note: monthly === null ? NO_MONEY_COST : "",
      overlapGroup: "linea",
    }),
    confidence,
    confidenceReason: `${n} registro(s) en el paso con menos datos${ctx.demandConfigured ? "" : "; demanda sin configurar"}.`,
    effort: "M",
    severity: "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "line-balance", label: "Balanceo de línea" }],
  }];
}

// ── Variabilidad por paso ─────────────────────────────────────────────────────────

function detectStepVariability(ctx: Ctx): OpportunityDraft[] {
  if (!ctx.hasStepData) return [];
  const candidates = ctx.tasks
    .filter((t) => t.samples.length >= VARIABILITY_MIN_SAMPLES && isPos(t.mean))
    .map((t) => ({ t, cv: coefficientOfVariation(t.samples) }))
    .filter((c) => Number.isFinite(c.cv));
  if (candidates.length === 0) return [];
  const worst = candidates.reduce((a, b) => (b.cv > a.cv ? b : a));
  if (!(worst.cv > VARIABILITY_CV_LIMIT)) return [];
  const { t, cv } = worst;
  const med = median(t.samples);
  const excess = mean(t.samples.map((x) => Math.max(0, x - med)));
  const units = ctx.units;
  const monthly = ctx.costPerSec !== null && units !== null ? excess * units * ctx.costPerSec : null;
  const ref = ctx.skills.matrix.stepSummaries.find((ss) => ss.step.number === t.number)?.reference;
  const model = ref && ref.source === "mejor-operario" && ref.referenceOperatorId !== null
    ? ` Toma como modelo a ${opToken(ref.referenceOperatorId)}, el más rápido entre los estables en este paso.`
    : "";

  return [{
    id: `variabilidad-paso:${t.number}`,
    detector: "variabilidad-paso",
    kind: "mejora",
    area: "productividad",
    title: `${stepLabel(t)}: el paso más irregular (CV ${pct(cv)})`,
    diagnosis: `${t.samples.length} registros: media ${sec(t.mean)}, mediana ${sec(med)}, desviación ${sec(sampleStd(t.samples))}. Las ejecuciones más lentas que la mediana añaden en promedio ${sec(excess)} por unidad.`,
    action: `Estandariza el método del paso: documenta la secuencia, deja materiales y herramientas al alcance y usa una ayuda visual en el puesto.${model}`,
    impact: impact({
      monthlyCOP: monthly,
      formula: "promedio de (tiempo − mediana del paso, solo si es positivo) × unidades/mes × costo de mano de obra por segundo",
      inputs: [
        { label: "Exceso medio sobre la mediana", value: `${sec(excess)}/unidad` },
        { label: "Unidades/mes (meta)", value: units !== null ? int(units) : "sin dato" },
        { label: "Costo M.O. por segundo", value: ctx.costPerSec !== null ? `${formatCOP(ctx.costPerSec * 3600)}/h ÷ 3600` : "sin dato" },
      ],
      assumptions: [
        "Cota superior: supone que el método estándar elimina las ejecuciones más lentas que la mediana actual.",
        `Se compara solo pasos con ≥ ${VARIABILITY_MIN_SAMPLES} registros; CV límite ${pct(VARIABILITY_CV_LIMIT)} (nivel U de Competencias).`,
      ],
      note: monthly === null ? (units === null ? "Falta la meta mensual de producción para monetizar." : NO_MONEY_COST) : "",
      overlapGroup: "tiempo-ciclo",
    }),
    confidence: countConfidence(t.samples.length),
    confidenceReason: `${t.samples.length} registro(s) del paso.`,
    effort: "S",
    severity: "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "skills", label: "Competencias" }, { tab: "line-balance", label: "Balanceo de línea" }],
  }];
}

// ── Operarios por encima del tiempo estándar ─────────────────────────────────────

function detectOperatorsBelowStandard(ctx: Ctx): OpportunityDraft[] {
  if (ctx.target === null) return [];
  const total = ctx.knownCycles.length;
  if (total === 0) return [];
  const regressed = new Set(ctx.skills.alerts.filter((a) => a.kind === "regresion").map((a) => a.operatorId));
  const rows = ctx.skills.learning.flatMap((l) => {
    const r = l.result;
    if (r.kind !== "fit" || !r.standard || r.standard.reached) return [];
    const gap = r.standard.recentMedian - r.standard.standard;
    if (!(gap > 0)) return [];
    const count = ctx.knownCycles.filter((c) => c.operatorId === l.operator.id).length;
    const share = count / total;
    const hourly = ctx.hourlyOf.get(l.operator.id) ?? null;
    const monthly = hourly !== null && ctx.units !== null ? gap * ctx.units * share * (hourly / 3600) : null;
    let projection: string;
    // Una curva del 100 % o más no es aprendizaje: aunque el modelo «llegue», no se proyecta.
    const improving = r.fit.learningRate < 1;
    const status = r.standard.status === "predicted" && !improving ? "not-improving" : r.standard.status;
    if (status === "predicted" && r.standard.cyclesRemaining !== null) {
      projection = `al ritmo actual llegaría al estándar en ~${plural(r.standard.cyclesRemaining, "ciclo", "ciclos")} más (ciclo ${int(r.standard.predictedCycle ?? 0)}; curva del ${pct(r.fit.learningRate)})`;
    } else if (status === "beyond-horizon") {
      projection = `a este ritmo tardaría más de ${int(MAX_PREDICTION_CYCLES)} ciclos`;
    } else {
      projection = "su curva no muestra mejora con la práctica: no llegará solo";
    }
    if (regressed.has(l.operator.id)) projection += "; además muestra retroceso reciente";
    return [{ id: l.operator.id, gap, share, count, hourly, monthly, recent: r.standard.recentMedian, projection, status }];
  }).sort((a, b) => b.gap - a.gap);
  if (rows.length === 0) return [];

  const monetized = rows.filter((r) => r.monthly !== null);
  const monthly = monetized.length ? monetized.reduce((s, r) => s + (r.monthly ?? 0), 0) : null;
  const first = rows[0];
  const stuck = rows.filter((r) => r.status !== "predicted");
  const trainers = [...new Set(ctx.skills.matrix.stepSummaries.flatMap((s) => s.trainers))].filter((id) => !rows.some((r) => r.id === id));
  const coach = trainers.length ? ` con ${opToken(trainers[0])} (nivel O en Competencias) como instructor` : "";
  const minCount = Math.min(...rows.map((r) => r.count));

  return [{
    id: "operarios-estandar",
    detector: "operarios-estandar",
    kind: "mejora",
    area: "personas",
    title: `${rows.length} operario(s) por encima del tiempo estándar (${sec(ctx.target)})`,
    diagnosis: rows.map((r) => `${opToken(r.id)}: mediana reciente ${sec(r.recent)} (+${sec(r.gap)}); ${r.projection}.`).join(" "),
    action: `Acompañamiento en el puesto para ${opToken(first.id)} (el más lejos del estándar)${coach}, empezando por los pasos donde está en nivel I o L.` +
      (stuck.length ? ` Para ${stuck.map((r) => opToken(r.id)).join(", ")} la práctica sola no basta: revisa método y reentrena.` : ""),
    impact: impact({
      monthlyCOP: monthly,
      formula: "Σ por operario (mediana reciente − tiempo estándar) × unidades/mes × participación en los ciclos × costo/h ÷ 3600",
      inputs: [
        { label: "Tiempo estándar", value: sec(ctx.target) },
        { label: "Unidades/mes (meta)", value: ctx.units !== null ? int(ctx.units) : "sin dato" },
        ...rows.map((r) => ({
          label: opToken(r.id),
          value: `+${sec(r.gap)} × ${pct(r.share)} de los ciclos × ${r.hourly !== null ? `${formatCOP(r.hourly)}/h` : "sin costo"} = ${r.monthly !== null ? formatCOP(r.monthly) : "—"}`,
        })),
      ],
      assumptions: [
        "La participación de cada operario en la producción del mes es la misma que en los ciclos registrados.",
        "Mediana de los últimos 5 ciclos válidos (Competencias) frente al tiempo estándar de Fuga de Dinero.",
      ],
      note: monthly === null ? (ctx.units === null ? "Falta la meta mensual de producción para monetizar." : NO_MONEY_COST) :
        monetized.length < rows.length ? "Algunos operarios no tienen costo por hora y no se suman." : "",
      overlapGroup: "tiempo-ciclo",
    }),
    confidence: countConfidence(minCount),
    confidenceReason: `El operario con menos datos tiene ${minCount} ciclo(s).`,
    effort: "M",
    severity: "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "skills", label: "Competencias" }],
  }];
}

// ── Punto único de falla (ILUO) ──────────────────────────────────────────────────

function detectSinglePointOfFailure(ctx: Ctx): OpportunityDraft[] {
  const { matrix } = ctx.skills;
  if (!matrix.hasStepData || ctx.s.operators.length < 2) return [];
  const items = matrix.stepSummaries.flatMap((ss, j) => {
    if (ss.operatorsWithData === 0 || ss.autonomous.length > 1) return [];
    const col = matrix.cells.map((row) => row[j]);
    const learners = col.filter((c) => c.level === "I" || c.level === "L")
      .sort((a, b) => (a.ratio ?? Infinity) - (b.ratio ?? Infinity));
    const candidate = learners[0]?.operatorId ?? col.find((c) => c.n === 0)?.operatorId ?? null;
    const samples = col.reduce((s, c) => s + c.n, 0);
    return [{ step: ss.step, owner: ss.autonomous[0] ?? null, candidate, samples }];
  });
  if (items.length === 0) return [];
  const none = items.filter((i) => i.owner === null);
  const one = items.filter((i) => i.owner !== null);
  const parts: string[] = [];
  if (none.length) parts.push(`Nadie opera de forma autónoma (U/O): ${none.map((i) => stepLabel(i.step)).join(", ")}.`);
  if (one.length) parts.push(`Dependen de una sola persona: ${one.map((i) => `${stepLabel(i.step)} (${opToken(i.owner as number)})`).join(", ")}.`);
  const plan = items.map((i) => {
    const who = i.candidate !== null ? opToken(i.candidate) : "un segundo operario";
    return i.owner !== null ? `${stepLabel(i.step)}: ${opToken(i.owner)} entrena a ${who}` : `${stepLabel(i.step)}: estandariza el método y entrena a ${who}`;
  });
  const minSamples = Math.min(...items.map((i) => i.samples));

  return [{
    id: "punto-unico-falla",
    detector: "punto-unico-falla",
    kind: "mejora",
    area: "personas",
    title: `${items.length} paso(s) sin respaldo: si falta una persona, la línea se detiene`,
    diagnosis: parts.join(" "),
    action: `Entrenamiento cruzado (el candidato es quien está más cerca del nivel U): ${plan.join("; ")}.`,
    impact: impact({
      monthlyCOP: null,
      formula: "No monetizado.",
      note: "Riesgo de continuidad: no monetizado (Kronos no tiene el ausentismo ni el costo de una parada para estimarlo).",
    }),
    confidence: countConfidence(minSamples),
    confidenceReason: `${minSamples} registro(s) en el paso con menos datos.`,
    effort: "M",
    severity: none.length ? "alta" : "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "skills", label: "Competencias" }],
  }];
}

// ── Calidad ──────────────────────────────────────────────────────────────────────

interface QualityStats {
  inspected: Set<string>;
  failed: Set<string>;
  source: "inspecciones" | "defectos";
}

function qualityStats(ctx: Ctx): QualityStats | null {
  const ids = new Set(ctx.cycles.map((c) => c.id));
  const checks = (ctx.s.qualityChecks ?? []).filter((q) => ids.has(q.cycleId));
  const defectCycles = new Set((ctx.s.defects ?? []).map((d) => d.cycleId).filter((id) => ids.has(id)));
  const flagged = new Set(ctx.cycles.filter((c) => c.qualityPass === false).map((c) => c.id));
  if (checks.length === 0 && defectCycles.size === 0 && flagged.size === 0) return null;
  const failed = new Set<string>([...defectCycles, ...flagged, ...checks.filter((q) => !q.overallPass).map((q) => q.cycleId)]);
  if (checks.length > 0) {
    const inspected = new Set<string>([...checks.map((q) => q.cycleId), ...failed]);
    return { inspected, failed, source: "inspecciones" };
  }
  return { inspected: ids, failed, source: "defectos" };
}

function detectQuality(ctx: Ctx): OpportunityDraft[] {
  const q = qualityStats(ctx);
  if (!q || q.inspected.size === 0 || q.failed.size === 0) return [];
  const n = q.inspected.size;
  const rate = q.failed.size / n;
  const units = ctx.units;
  const value = ctx.productValue;
  const monthly = units !== null && value !== null ? rate * units * value : null;

  const defects = (ctx.s.defects ?? []).filter((d) => q.inspected.has(d.cycleId));
  const byType = new Map<string, number>();
  defects.forEach((d) => byType.set(d.type, (byType.get(d.type) ?? 0) + 1));
  const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
  const byCriterion = new Map<string, number>();
  (ctx.s.qualityChecks ?? []).filter((c) => q.inspected.has(c.cycleId))
    .forEach((c) => c.criteria.filter((x) => !x.passed).forEach((x) => byCriterion.set(x.name, (byCriterion.get(x.name) ?? 0) + 1)));
  const topCriterion = [...byCriterion.entries()].sort((a, b) => b[1] - a[1])[0];
  const critical = defects.filter((d) => d.severity === "critico").length;

  const out: OpportunityDraft[] = [];
  const focus = topType ? `«${topType[0]}» (${topType[1]} de ${defects.length} defectos)` : topCriterion ? `el criterio «${topCriterion[0]}» (${topCriterion[1]} fallos)` : null;
  let confidence = countConfidence(n, QUALITY_HIGH_CONFIDENCE, QUALITY_MEDIUM_CONFIDENCE);
  if (q.source === "defectos") confidence = downgrade(confidence);
  const sourceText = q.source === "inspecciones"
    ? "Unidades inspeccionadas en Calidad (más las que tienen defectos registrados)."
    : "No hay inspecciones de Calidad: se supone que se revisaron todos los ciclos y solo fallaron los que tienen defectos registrados.";

  out.push({
    id: "calidad-global",
    detector: "calidad-global",
    kind: "mejora",
    area: "calidad",
    title: `Tasa de defectos ${pct(rate, 1)}: ${q.failed.size} de ${n} unidades`,
    diagnosis: `${q.failed.size} de ${n} unidades revisadas fallaron.` +
      (focus ? ` Lo más frecuente: ${focus}.` : "") +
      (topCriterion && topType ? ` Criterio de inspección que más falla: «${topCriterion[0]}» (${topCriterion[1]}).` : "") +
      (critical ? ` ${critical} defecto(s) críticos.` : "") +
      " Los defectos no se registran por paso: el tipo de defecto indica dónde mirar.",
    action: focus
      ? `Ataca primero ${focus}: identifica el paso donde se origina, añade una verificación en la fuente (poka-yoke o lista de chequeo) y mide de nuevo en 2 semanas.`
      : "Identifica en qué paso se originan los fallos, añade una verificación en la fuente y mide de nuevo en 2 semanas.",
    impact: impact({
      monthlyCOP: monthly,
      formula: "tasa de defectos × unidades/mes × valor del producto",
      inputs: [
        { label: "Tasa de defectos", value: `${q.failed.size} ÷ ${n} = ${pct(rate, 1)}` },
        { label: "Unidades/mes (meta)", value: units !== null ? int(units) : "sin dato" },
        { label: "Valor del producto", value: value !== null ? formatCOP(value) : "sin dato" },
      ],
      assumptions: [
        "Cota superior: cada unidad defectuosa se pierde por su valor completo (si se reprocesa, el costo real es el del reproceso).",
        sourceText,
      ],
      note: monthly === null ? "Falta el valor del producto o la meta mensual para monetizar." : "",
      overlapGroup: "calidad",
    }),
    confidence,
    confidenceReason: `${n} unidad(es) revisada(s)${q.source === "defectos" ? " (sin inspecciones formales)" : ""}.`,
    effort: "M",
    severity: critical > 0 ? "alta" : "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "quality", label: "Calidad" }, { tab: "defects", label: "Defectos" }],
  });

  // Foco por operario
  const cycleOp = new Map(ctx.cycles.map((c) => [c.id, c.operatorId]));
  const perOp = new Map<number, { n: number; f: number }>();
  q.inspected.forEach((id) => {
    const op = cycleOp.get(id);
    if (op === undefined) return;
    const cur = perOp.get(op) ?? { n: 0, f: 0 };
    cur.n++;
    if (q.failed.has(id)) cur.f++;
    perOp.set(op, cur);
  });
  const known = new Set(ctx.s.operators.map((o) => o.id));
  const hot = [...perOp.entries()]
    .filter(([id, s]) => known.has(id) && s.n >= QUALITY_MIN_PER_OPERATOR)
    .map(([id, s]) => {
      const restN = n - s.n;
      const restF = q.failed.size - s.f;
      return { id, ...s, rate: s.f / s.n, restN, restRate: restN > 0 ? restF / restN : NaN };
    })
    .filter((h) => h.restN >= QUALITY_MIN_PER_OPERATOR && Number.isFinite(h.restRate) && h.rate > h.restRate * QUALITY_HOTSPOT_FACTOR && h.rate > h.restRate)
    .sort((a, b) => (b.rate - b.restRate) - (a.rate - a.restRate))[0];
  if (hot) {
    const share = hot.n / n;
    const monthlyHot = units !== null && value !== null ? (hot.rate - hot.restRate) * units * share * value : null;
    const opDefects = defects.filter((d) => d.operatorId === hot.id);
    const opTypes = new Map<string, number>();
    opDefects.forEach((d) => opTypes.set(d.type, (opTypes.get(d.type) ?? 0) + 1));
    const opTop = [...opTypes.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: `calidad-operario:${hot.id}`,
      detector: "calidad-operario",
      kind: "mejora",
      area: "calidad",
      title: `Foco de defectos: ${opToken(hot.id)} con ${pct(hot.rate, 1)} frente a ${pct(hot.restRate, 1)} del resto`,
      diagnosis: `${opToken(hot.id)}: ${hot.f} de ${hot.n} unidades con fallo. Resto del equipo: ${q.failed.size - hot.f} de ${hot.restN}.` +
        (opTop ? ` Su defecto más frecuente: «${opTop[0]}» (${opTop[1]}).` : ""),
      action: `Revisa el método con ${opToken(hot.id)} en el puesto${opTop ? `, empezando por «${opTop[0]}»` : ""}, compáralo con el de quien tiene menos defectos y verifica herramientas y material.`,
      impact: impact({
        monthlyCOP: monthlyHot,
        formula: "(tasa del operario − tasa del resto) × unidades/mes × participación del operario × valor del producto",
        inputs: [
          { label: "Tasa del operario", value: `${hot.f} ÷ ${hot.n} = ${pct(hot.rate, 1)}` },
          { label: "Tasa del resto", value: pct(hot.restRate, 1) },
          { label: "Participación en lo revisado", value: pct(share) },
          { label: "Unidades/mes (meta)", value: units !== null ? int(units) : "sin dato" },
          { label: "Valor del producto", value: value !== null ? formatCOP(value) : "sin dato" },
        ],
        assumptions: [
          "Si el operario igualara la tasa del resto del equipo; misma participación en la producción del mes que en lo revisado.",
          "Cada unidad defectuosa se pierde por su valor completo (cota superior).",
        ],
        note: monthlyHot === null ? "Falta el valor del producto o la meta mensual para monetizar." : "",
        overlapGroup: "calidad",
      }),
      confidence: countConfidence(hot.n, QUALITY_HIGH_CONFIDENCE, QUALITY_MEDIUM_CONFIDENCE),
      confidenceReason: `${hot.n} unidad(es) revisada(s) del operario.`,
      effort: "S",
      severity: "media",
      severityScore: 0,
      safety: null,
      evidence: [{ tab: "defects", label: "Defectos" }, { tab: "quality", label: "Calidad" }],
    });
  }
  return out;
}

// ── Capacidad frente al tiempo objetivo (Monte Carlo) ────────────────────────────

function detectCapability(ctx: Ctx): OpportunityDraft[] {
  if (ctx.target === null) return [];
  const d = ctx.cycles.map((c) => c.duration);
  if (d.length < 2) return [];
  const target = ctx.target;
  const m = mean(d);
  const sd = sampleStd(d);
  const over = d.filter((x) => x > target).length;
  if (over === 0) return [];
  const share = 1 - over / d.length;
  const { cpk } = capabilityIndices(target, m, sd * sd, sd);
  if (share >= CAPABLE_SHARE && cpk >= CAPABLE_CPK) return [];
  const overrun = mean(d.map((x) => Math.max(0, x - target)));
  const monthly = ctx.costPerSec !== null && ctx.units !== null ? overrun * ctx.units * ctx.costPerSec : null;
  const goalMean = target - 3 * CAPABLE_CPK * sd;
  const goalSd = (target - m) / (3 * CAPABLE_CPK);
  const goals: string[] = [];
  if (goalMean > 0) goals.push(`bajar el promedio a ${sec(goalMean)} con la variabilidad actual`);
  if (goalSd > 0) goals.push(`reducir la desviación a ${sec(goalSd)} con el promedio actual`);

  return [{
    id: "capacidad-proceso",
    detector: "capacidad-proceso",
    kind: "mejora",
    area: "productividad",
    title: `Solo ${pct(share)} de los ciclos cumplen el tiempo objetivo (${sec(target)})`,
    diagnosis: `${over} de ${d.length} ciclos superan el objetivo. Promedio ${sec(m)}, desviación ${sec(sd)}, índice de capacidad Cpk ${fmt(finiteOr(cpk), 2)} (capaz: ≥ ${fmt(CAPABLE_CPK, 2)} y ≥ ${pct(CAPABLE_SHARE)} de ciclos dentro).`,
    action: goals.length
      ? `Para que el proceso sea capaz hay que ${goals.join(" o ")}. ${goals.length > 1 ? "Simula ambas metas en Monte Carlo y ataca primero la que dependa de menos personas." : "Simula esa meta en Monte Carlo antes de comprometerla."}`
      : "Revisa el método completo: el promedio ya supera el objetivo. Simula en Monte Carlo cuánto hay que bajar el promedio.",
    impact: impact({
      monthlyCOP: monthly,
      formula: "promedio de (duración del ciclo − tiempo objetivo, solo si es positivo) × unidades/mes × costo de mano de obra por segundo",
      inputs: [
        { label: "Exceso medio sobre el objetivo", value: `${sec(overrun)}/unidad` },
        { label: "Unidades/mes (meta)", value: ctx.units !== null ? int(ctx.units) : "sin dato" },
        { label: "Costo M.O. por segundo", value: ctx.costPerSec !== null ? `${formatCOP(ctx.costPerSec * 3600)}/h ÷ 3600` : "sin dato" },
      ],
      assumptions: [
        "Todo segundo por encima del objetivo es tiempo pagado de más; los ciclos más rápidos que el objetivo no compensan.",
        "Cpk calculado como en el simulador Monte Carlo (objetivo = límite superior).",
      ],
      note: monthly === null ? (ctx.units === null ? "Falta la meta mensual de producción para monetizar." : NO_MONEY_COST) : "",
      overlapGroup: "tiempo-ciclo",
    }),
    confidence: countConfidence(d.length),
    confidenceReason: `${d.length} ciclo(s).`,
    effort: "M",
    severity: "media",
    severityScore: 0,
    safety: null,
    evidence: [{ tab: "montecarlo", label: "Monte Carlo" }, { tab: "cost", label: "Fuga de Dinero" }],
  }];
}

// ── SST: estado del plan de acción para una fila de la matriz ───────────────────

interface RowStatus { row: MatrixRow | null; open: number; closed: number }

function rowStatus(ctx: Ctx, id: string): RowStatus {
  const row = ctx.rows.find((r) => r.id === id) ?? null;
  const items = (ctx.s.plan ?? []).filter((a) => a.origenFilaId === id);
  return { row, open: items.filter((a) => a.estado !== "cerrada").length, closed: items.filter((a) => a.estado === "cerrada").length };
}

/** Seguridad derivada de la fila GTC 45: NR I/II sin acción abierta. */
function rowSafety(st: RowStatus): "critica" | "alta" | null {
  if (!st.row || st.open > 0) return null;
  if (st.row.nrLevel === "I") return "critica";
  if (st.row.nrLevel === "II") return "alta";
  return null;
}

function rowSentence(st: RowStatus): string {
  if (!st.row) return "";
  const r = st.row;
  const plan = st.open > 0 ? `${st.open} acción(es) abierta(s) en el plan` : st.closed > 0 ? `${st.closed} acción(es) cerrada(s) y el nivel sigue igual` : "sin acción en el plan";
  return ` Matriz GTC 45: NR ${int(r.nr)} → nivel ${r.nrLevel} (${NR_INTERPRETATION[r.nrLevel].aceptabilidad}); ${plan}.`;
}

const EFFORT_BY_HAZARD: Record<HazardKey, Effort> = { postura: "M", repetitivo: "M", iluminacion: "S", ruido: "L" };

function evalConfidence(e: ErgoEvaluation | undefined): { c: Confidence; why: string } {
  if (!e) return { c: "media", why: "Fila de la matriz sin evaluación asociada." };
  if (e.experto) return { c: "alta", why: "Validada por un experto." };
  if (e.origen === "manual") return { c: "media", why: "Evaluación manual sin revisión de experto." };
  if (e.confianza == null || e.confianza < 0.35) return { c: "baja", why: "Tamizaje por cámara con confianza baja y sin revisión de experto." };
  return { c: "media", why: "Tamizaje por cámara sin revisión de experto." };
}

function postureScores(e: ErgoEvaluation): { rula: number; reba: number | null; expert: boolean } {
  return e.experto
    ? { rula: e.experto.rula, reba: e.experto.reba, expert: true }
    : { rula: e.rulaAvg, reba: e.rebaAvg, expert: false };
}

// ── Postura crítica ──────────────────────────────────────────────────────────────

function detectCriticalPosture(ctx: Ctx, covered: Set<string>): OpportunityDraft[] {
  return ctx.latestEvals.flatMap((e) => {
    const p = postureScores(e);
    const rula = Math.round(p.rula);
    const reba = p.reba === null ? null : Math.round(p.reba);
    if (!(rula >= RULA_CRITICAL || (reba !== null && reba >= REBA_CRITICAL))) return [];
    const id = rowId("postura", e.puesto);
    covered.add(id);
    const st = rowStatus(ctx, id);
    const conf = evalConfidence(e);
    const scores = `RULA ${int(rula)}${reba !== null ? ` / REBA ${int(reba)}` : ""}`;
    return [{
      id: `postura-critica:${id}`,
      detector: "postura-critica" as const,
      kind: "mejora" as const,
      area: "ergonomia-sst" as const,
      title: `Postura crítica en ${e.puesto}: ${scores}`,
      diagnosis: `${p.expert ? "Revisión de experto" : `Evaluación ${e.origen === "vision-ai" ? "Vision AI" : "manual"} (promedio de la sesión)`} del ${e.fecha || "—"}: ${scores}, nivel de acción «cambiar de inmediato» (RULA ${RULA_CRITICAL} / REBA ≥ ${REBA_CRITICAL}). Exposición ${fmt(e.horasExposicion)} h/jornada.${rowSentence(st)}`,
      action: `Intervén el puesto ya: ${HAZARDS.postura.controles.ingenieria} Mientras tanto: ${HAZARDS.postura.controles.administrativo}` +
        (p.expert ? "" : " Confirma con una revisión de experto en Paquete SG-SST (la cámara es un tamizaje).") +
        (st.open === 0 ? " Registra la acción en el Plan de acción con responsable y fecha." : ""),
      impact: healthImpact(),
      confidence: conf.c,
      confidenceReason: conf.why,
      effort: "M" as const,
      severity: "critica" as const,
      severityScore: st.row?.nr ?? 0,
      safety: "critica" as const,
      evidence: [{ tab: "sgsst" as const, label: "Paquete SG-SST" }, { tab: "vision-ai" as const, label: "Vision AI" }],
    }];
  });
}

// ── Ruido: dosis diaria ──────────────────────────────────────────────────────────

function detectNoiseDose(ctx: Ctx, covered: Set<string>): OpportunityDraft[] {
  return ctx.zones.flatMap((z) => {
    if (z.leq === null || !isPos(z.leq) || !isPos(z.avgHours)) return [];
    const dose = calculateDailyDose(z.leq, z.avgHours);
    if (!(dose > NOISE_DOSE_LIMIT) || !Number.isFinite(dose)) return [];
    const id = rowId("ruido", z.zone);
    covered.add(id);
    const st = rowStatus(ctx, id);
    const allowed = 8 / Math.pow(2, (z.leq - REGULATIONS.db8h.max) / 5);
    return [{
      id: `dosis-ruido:${id}`,
      detector: "dosis-ruido" as const,
      kind: "mejora" as const,
      area: "ergonomia-sst" as const,
      title: `Ruido en ${z.zone}: dosis diaria ${pct(dose / 100)}`,
      diagnosis: `LEQ ${fmt(z.leq)} dB durante ${fmt(z.avgHours)} h/jornada (${z.dbReadings} lectura(s)). A ese nivel la Res. 1792/1990 permite ${fmt(allowed)} h (85 dB para 8 h; la mitad del tiempo por cada 5 dB más): la dosis supera el 100 %.${rowSentence(st)}`,
      action: `Control en la fuente: ${HAZARDS.ruido.controles.ingenieria} Mientras tanto: ${HAZARDS.ruido.controles.administrativo} ${HAZARDS.ruido.controles.epp}` +
        (st.open === 0 ? " Registra la acción en el Plan de acción." : ""),
      impact: healthImpact("Riesgo de pérdida auditiva."),
      confidence: countConfidence(z.dbReadings, READINGS_HIGH_CONFIDENCE, READINGS_MEDIUM_CONFIDENCE),
      confidenceReason: `${z.dbReadings} lectura(s) de nivel sonoro en la zona.`,
      effort: "L" as const,
      severity: "critica" as const,
      severityScore: st.row?.nr ?? 0,
      safety: "critica" as const,
      evidence: [{ tab: "environment" as const, label: "Radar Ambiental" }, { tab: "sgsst" as const, label: "Paquete SG-SST" }],
    }];
  });
}

// ── Iluminación fuera de rango ───────────────────────────────────────────────────

function detectLighting(ctx: Ctx, covered: Set<string>): OpportunityDraft[] {
  return ctx.zones.flatMap((z) => {
    if (z.avgLux === null || !isPos(z.avgLux)) return [];
    const level = getLuxCompliance(z.avgLux);
    if (level === "ok") return [];
    const id = rowId("iluminacion", z.zone);
    covered.add(id);
    const st = rowStatus(ctx, id);
    const low = z.avgLux < REGULATIONS.lux.min;
    const ref = `${REGULATIONS.lux.min}–${REGULATIONS.lux.max} lux (${REGULATIONS.lux.label})`;
    return [{
      id: `iluminacion:${id}`,
      detector: "iluminacion" as const,
      kind: "mejora" as const,
      area: "ergonomia-sst" as const,
      title: `Iluminación ${low ? "insuficiente" : "excesiva"} en ${z.zone}: ${int(z.avgLux)} lux`,
      diagnosis: `Promedio de ${z.luxReadings} lectura(s): ${int(z.avgLux)} lux; referencia ${ref}. ${level === "critical" ? "Lejos" : "Cerca"} de la referencia.${rowSentence(st)}`,
      action: (low
        ? "Añade iluminación localizada en el puesto o redistribuye luminarias hasta quedar en la referencia, y vuelve a medir."
        : "Controla el deslumbramiento (difusores, reubicar o atenuar luminarias) y vuelve a medir.") +
        (rowSafety(st) ? " Registra la acción en el Plan de acción." : ""),
      impact: healthImpact("Puede reflejarse en defectos y fatiga visual, pero no hay datos para atribuirlo."),
      confidence: countConfidence(z.luxReadings, READINGS_HIGH_CONFIDENCE, READINGS_MEDIUM_CONFIDENCE),
      confidenceReason: `${z.luxReadings} lectura(s) de iluminancia en la zona.`,
      effort: "S" as const,
      severity: (level === "critical" ? "alta" : "media") as Severity,
      severityScore: st.row?.nr ?? 0,
      safety: rowSafety(st),
      evidence: [{ tab: "environment" as const, label: "Radar Ambiental" }, { tab: "sgsst" as const, label: "Paquete SG-SST" }],
    }];
  });
}

// ── Filas GTC 45 en NR I–II sin acción abierta ───────────────────────────────────

function detectUnplannedHazards(ctx: Ctx, covered: Set<string>): OpportunityDraft[] {
  const evalByRow = new Map<string, ErgoEvaluation>();
  ctx.latestEvals.forEach((e) => {
    evalByRow.set(rowId("postura", e.puesto), e);
    evalByRow.set(rowId("repetitivo", e.puesto), e);
  });
  return ctx.rows.flatMap((r) => {
    if (covered.has(r.id) || (r.nrLevel !== "I" && r.nrLevel !== "II")) return [];
    const st = rowStatus(ctx, r.id);
    if (st.open > 0) return [];
    const e = evalByRow.get(r.id);
    const conf = r.edited ? { c: "alta" as Confidence, why: "Niveles ajustados por el profesional SST." } : evalConfidence(e);
    const zone = ctx.zones.find((z) => rowId(r.hazard, z.zone) === r.id);
    let basis = "";
    if (r.hazard === "postura" && e) {
      const p = postureScores(e);
      basis = ` ${p.expert ? "Experto" : "Cámara/manual"}: RULA ${fmt(p.rula)}${p.reba !== null ? `, REBA ${fmt(p.reba)}` : ""}.`;
    } else if (r.hazard === "repetitivo" && e) {
      basis = e.cicloSeg ? ` Ciclo de ${sec(e.cicloSeg)}.` : " Sin tiempo de ciclo en la evaluación.";
    } else if (r.hazard === "ruido" && zone?.leq != null) {
      basis = ` LEQ ${fmt(zone.leq)} dB, ${fmt(zone.avgHours)} h/jornada.`;
    } else if (r.hazard === "iluminacion" && zone?.avgLux != null) {
      basis = ` ${int(zone.avgLux)} lux.`;
    }
    const safety = rowSafety(st);
    return [{
      id: `gtc45:${r.id}`,
      detector: "gtc45-sin-accion" as const,
      kind: "mejora" as const,
      area: "ergonomia-sst" as const,
      title: `${HAZARDS[r.hazard].descripcion} en ${r.lugar}: nivel de riesgo ${r.nrLevel} sin acción en el plan`,
      diagnosis: `GTC 45: ND ${r.nd} × NE ${r.ne} × NC ${r.nc} = NR ${int(r.nr)} → nivel ${r.nrLevel} (${NR_INTERPRETATION[r.nrLevel].aceptabilidad}). ${NR_INTERPRETATION[r.nrLevel].desc}${basis}` +
        (st.closed > 0 ? ` Hay ${st.closed} acción(es) cerrada(s) y el nivel no bajó.` : ""),
      action: `${r.controles.ingenieria} Mientras tanto: ${r.controles.administrativo} Regístrala en el Plan de acción con responsable y fecha.` +
        (st.closed > 0 ? " Reevalúa el puesto para confirmar si el control funcionó." : ""),
      impact: healthImpact(),
      confidence: conf.c,
      confidenceReason: conf.why,
      effort: EFFORT_BY_HAZARD[r.hazard],
      severity: (r.nrLevel === "I" ? "critica" : "alta") as Severity,
      severityScore: r.nr,
      safety,
      evidence: [{ tab: "sgsst" as const, label: "Paquete SG-SST" }],
    }];
  });
}

// ── Acciones de medición (vacíos de datos que bloquean decisiones) ───────────────

function measurement(
  id: string, area: CopilotArea, severity: Severity, title: string, diagnosis: string, action: string,
  evidence: Evidence[], unblocks: string,
): OpportunityDraft {
  return {
    id: `medicion:${id}`,
    detector: "medicion",
    kind: "medicion",
    area,
    title,
    diagnosis,
    action,
    impact: impact({ monthlyCOP: null, formula: "No aplica: acción de medición.", note: `Desbloquea: ${unblocks}.` }),
    confidence: "alta",
    confidenceReason: "Es un hecho de los datos: falta la medición.",
    effort: "S",
    severity,
    severityScore: 0,
    safety: null,
    evidence,
  };
}

function detectDataGaps(ctx: Ctx): OpportunityDraft[] {
  const out: OpportunityDraft[] = [];
  const s = ctx.s;
  const n = ctx.cycles.length;

  if (n === 0) {
    out.push(measurement("sin-ciclos", "productividad", "alta", "Registra los primeros ciclos con el cronómetro por pasos",
      "No hay ciclos válidos: no se puede calcular takt, cuello de botella, variabilidad, competencias ni calidad.",
      `Cronometra al menos ${MIN_RELIABLE_CYCLES} ciclos por operario, marcando cada paso.`,
      [{ tab: "timer", label: "Cronómetro" }], "todas las oportunidades de productividad, personas y calidad"));
  } else {
    if (!ctx.hasStepData) {
      out.push(measurement("sin-pasos", "productividad", "alta", "Cronometra por pasos, no solo el ciclo completo",
        `Hay ${n} ciclo(s) pero ninguno trae tiempos por paso (p. ej. ciclos automáticos o manuales).`,
        "Usa el cronómetro por pasos en los próximos ciclos para ver dónde se va el tiempo.",
        [{ tab: "timer", label: "Cronómetro" }, { tab: "steps", label: "Config. Pasos" }], "cuello de botella, eficiencia de línea, variabilidad por paso y matriz ILUO"));
    }
    if (n < MIN_RELIABLE_CYCLES) {
      out.push(measurement("pocos-ciclos", "productividad", "alta", `Completa al menos ${MIN_RELIABLE_CYCLES} ciclos (hay ${n})`,
        `Con ${n} ciclo(s) los promedios y la variabilidad cambian mucho con cada dato nuevo: las cifras de este plan son de confianza baja.`,
        `Registra ${MIN_RELIABLE_CYCLES - n} ciclo(s) más antes de invertir en cambios.`,
        [{ tab: "timer", label: "Cronómetro" }], "confianza media o alta en todas las estimaciones de tiempo"));
    }
    if (ctx.target !== null) {
      const few = ctx.skills.learning.filter((l) => l.result.kind === "insufficient" && l.result.validCount > 0);
      if (few.length > 0) {
        out.push(measurement("curva-operarios", "personas", "baja", "Faltan ciclos para proyectar la curva de aprendizaje",
          `${few.map((l) => `${opToken(l.operator.id)} (${l.result.kind === "insufficient" ? l.result.validCount : 0})`).join(", ")}: se necesitan al menos ${LEARNING_MIN_CYCLES} ciclos por operario.`,
          "Registra más ciclos de esos operarios.", [{ tab: "skills", label: "Competencias" }], "la proyección de ciclos hasta el estándar"));
      }
    }
    if (ctx.avgHourly === null) {
      out.push(measurement("sin-costo", "productividad", "alta", "Registra el costo por hora de los operarios",
        "Ningún operario tiene costo por hora: los ahorros de tiempo no se pueden pasar a pesos.",
        "Añade el costo por hora (con prestaciones) de cada operario en el panel de operarios.",
        [{ tab: "cost", label: "Fuga de Dinero" }], "el valor en pesos de las oportunidades de tiempo"));
    }
    if (ctx.target === null) {
      out.push(measurement("sin-estandar", "personas", "media", "Define el tiempo estándar del ciclo",
        "Sin tiempo objetivo no se puede saber qué operarios están por debajo del estándar ni la capacidad del proceso.",
        "Fija el tiempo objetivo en Fuga de Dinero (o aplica una plantilla de proceso).",
        [{ tab: "cost", label: "Fuga de Dinero" }], "operarios frente al estándar y capacidad del proceso"));
    }
    if (ctx.units === null) {
      out.push(measurement("sin-meta", "productividad", "media", "Define la meta mensual de producción",
        "Sin unidades por mes no se puede escalar el ahorro por unidad a un valor mensual.",
        "Fija la meta mensual en Fuga de Dinero.", [{ tab: "cost", label: "Fuga de Dinero" }], "el valor mensual de las oportunidades"));
    }
    const q = qualityStats(ctx);
    if (!q) {
      out.push(measurement("sin-calidad", "calidad", "media", "Inspecciona la calidad de los ciclos",
        "No hay inspecciones ni defectos registrados: no se sabe si hay pérdidas por calidad.",
        `Inspecciona al menos ${QUALITY_MEDIUM_CONFIDENCE} unidades con la lista de Calidad y registra los defectos que aparezcan.`,
        [{ tab: "quality", label: "Calidad" }, { tab: "defects", label: "Defectos" }], "la tasa de defectos y sus focos"));
    } else if (q.failed.size > 0 && ctx.productValue === null) {
      out.push(measurement("sin-valor", "calidad", "media", "Registra el valor del producto",
        "Hay unidades defectuosas pero el valor del producto no está definido.",
        "Fija el valor del producto en Fuga de Dinero.", [{ tab: "cost", label: "Fuga de Dinero" }], "el costo de la no calidad"));
    }
    if (ctx.hasStepData && !ctx.demandConfigured) {
      out.push(measurement("sin-demanda", "productividad", "media", "Confirma la demanda y la jornada en Balanceo de línea",
        `El takt se calcula con la meta mensual y una jornada por defecto (${DEFAULT_DEMAND_SHAPE.daysPerMonth} días, ${DEFAULT_DEMAND_SHAPE.shiftsPerDay} turno de ${DEFAULT_DEMAND_SHAPE.hoursPerShift} h, ${DEFAULT_DEMAND_SHAPE.breakMinutesPerShift} min de pausas).`,
        "Revisa y ajusta la demanda, los turnos y las pausas reales.", [{ tab: "line-balance", label: "Balanceo de línea" }], "un takt fiable para el cuello de botella y la eficiencia"));
    }
  }

  // Ergonomía: posturas altas sin revisión de experto (las críticas ya lo piden en su tarjeta)
  const pending = ctx.latestEvals.filter((e) => {
    if (e.experto) return false;
    const rula = Math.round(e.rulaAvg);
    const reba = e.rebaAvg === null ? null : Math.round(e.rebaAvg);
    const critical = rula >= RULA_CRITICAL || (reba !== null && reba >= REBA_CRITICAL);
    const high = rula >= RULA_HIGH || (reba !== null && reba >= REBA_HIGH);
    const lowConf = e.origen === "vision-ai" && (e.confianza == null || e.confianza < 0.35);
    return !critical && (high || lowConf);
  });
  if (pending.length > 0) {
    out.push(measurement("revision-experto", "ergonomia-sst", "alta", `Pide revisión de experto para ${pending.length} postura(s)`,
      `${pending.map((e) => `${e.puesto} (RULA ${fmt(e.rulaAvg)}${e.rebaAvg !== null ? `, REBA ${fmt(e.rebaAvg)}` : ""})`).join(", ")}: postura alta o tamizaje de baja confianza sin validar. La cámara es un tamizaje; la decisión requiere un profesional.`,
      "Haz la revisión de experto en Paquete SG-SST antes de decidir la intervención.",
      [{ tab: "sgsst", label: "Paquete SG-SST" }], "la prioridad real del riesgo postural"));
  }
  if ((s.readings ?? []).length === 0) {
    out.push(measurement("sin-ambiente", "ergonomia-sst", "baja", "Mide iluminación y ruido en los puestos",
      "No hay lecturas de lux ni dB: no se puede evaluar iluminación ni dosis de ruido.",
      "Toma lecturas de lux y dB por zona en Radar Ambiental.", [{ tab: "environment", label: "Radar Ambiental" }], "iluminación y dosis de ruido"));
  }
  if ((s.evaluations ?? []).length === 0) {
    out.push(measurement("sin-ergonomia", "ergonomia-sst", "baja", "Evalúa la postura de los puestos",
      "No hay evaluaciones ergonómicas (RULA/REBA): no se pueden detectar posturas críticas.",
      "Graba una sesión con Vision AI por puesto y guárdala en el Paquete SG-SST.",
      [{ tab: "vision-ai", label: "Vision AI" }, { tab: "sgsst", label: "Paquete SG-SST" }], "posturas críticas y filas biomecánicas de la GTC 45"));
  }
  return out;
}

// ── Orden y total ────────────────────────────────────────────────────────────────

/** Nivel de prioridad (ver la regla en el encabezado del archivo). */
export function priorityOf(d: OpportunityDraft): PriorityTier {
  if (d.safety === "critica") return "seguridad-critica";
  if (d.safety === "alta") return "seguridad-alta";
  if (d.kind === "medicion") return "medicion";
  if (d.impact.monthlyCOP !== null && d.impact.monthlyCOP > 0) return "economica";
  return "sin-monetizar";
}

/** Impacto mensual ÷ peso del esfuerzo (0 si no está monetizado). */
export const impactPerEffort = (d: OpportunityDraft) => (d.impact.monthlyCOP ?? 0) / EFFORT_WEIGHT[d.effort];

/**
 * Regla de prioridad:
 *  1. Seguridad crítica y luego seguridad alta, sin importar el dinero; dentro de cada nivel,
 *     por severidad, NR de la GTC 45 (mayor primero) y menor esfuerzo.
 *  2. Oportunidades monetizadas por impacto ÷ esfuerzo.
 *  3. Sin monetizar y 4. acciones de medición: por severidad y menor esfuerzo.
 * Empates: por id, para que el orden sea estable.
 */
export function rankOpportunities(drafts: OpportunityDraft[]): Opportunity[] {
  const withTier = drafts.map((d) => ({ ...d, priority: priorityOf(d), rank: 0 }));
  withTier.sort((a, b) => {
    const t = TIER_ORDER[a.priority] - TIER_ORDER[b.priority];
    if (t !== 0) return t;
    if (a.priority === "economica") {
      const v = impactPerEffort(b) - impactPerEffort(a);
      if (v !== 0) return v;
    }
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    if (a.priority === "seguridad-critica" || a.priority === "seguridad-alta") {
      const nr = b.severityScore - a.severityScore;
      if (nr !== 0) return nr;
    }
    const e = EFFORT_WEIGHT[a.effort] - EFFORT_WEIGHT[b.effort];
    if (e !== 0) return e;
    return a.id.localeCompare(b.id);
  });
  return withTier.map((o, i) => ({ ...o, rank: i + 1 }));
}

/**
 * Marca qué oportunidades entran al total y lo suma: dentro de un grupo de solapamiento solo
 * cuenta la de mayor impacto (las demás comparten el mismo ahorro).
 */
export function applyOverlap(opps: Opportunity[]): { opportunities: Opportunity[]; total: number } {
  const best = new Map<string, Opportunity>();
  for (const o of opps) {
    const g = o.impact.overlapGroup;
    if (!g || o.impact.monthlyCOP === null || o.impact.monthlyCOP <= 0) continue;
    const cur = best.get(g);
    if (!cur || (o.impact.monthlyCOP > (cur.impact.monthlyCOP ?? 0))) best.set(g, o);
  }
  let total = 0;
  const out = opps.map((o) => {
    const v = o.impact.monthlyCOP;
    if (v === null || v <= 0) return { ...o, impact: { ...o.impact, countedInTotal: false } };
    const g = o.impact.overlapGroup;
    const counted = !g || best.get(g)?.id === o.id;
    if (counted) total += v;
    const note = counted ? o.impact.note
      : `${o.impact.note ? o.impact.note + " " : ""}Se solapa con «${best.get(g as string)?.title ?? ""}»: no se suma al total para no contar dos veces el mismo ahorro.`.trim();
    return { ...o, impact: { ...o.impact, countedInTotal: counted, note } };
  });
  return { opportunities: out, total: finiteOr(total) };
}

/**
 * Plan de la semana: las primeras WEEK_PLAN_SIZE oportunidades. Si queda fuera una acción de
 * medición de severidad alta, sustituye a la última (medir antes de invertir).
 */
export function weekPlan(ranked: Opportunity[]): Opportunity[] {
  const plan = ranked.slice(0, WEEK_PLAN_SIZE);
  const urgentMeasure = ranked.find((o) => o.kind === "medicion" && o.severity === "alta");
  if (urgentMeasure && !plan.includes(urgentMeasure) && plan.length === WEEK_PLAN_SIZE) {
    const last = plan[plan.length - 1];
    if (last.priority !== "seguridad-critica" && last.priority !== "seguridad-alta") plan[plan.length - 1] = urgentMeasure;
  }
  return plan;
}

/** Analiza la planta y devuelve el plan priorizado. */
export function analyzePlant(snapshot: CopilotSnapshot): CopilotReport {
  const ctx = buildCtx(snapshot);
  const ls = lineSetup(ctx);
  const covered = new Set<string>();
  const drafts: OpportunityDraft[] = [
    ...detectCriticalPosture(ctx, covered),
    ...detectNoiseDose(ctx, covered),
    ...detectLighting(ctx, covered),
    ...detectUnplannedHazards(ctx, covered),
    ...detectBottleneck(ctx, ls),
    ...detectLineEfficiency(ctx, ls),
    ...detectStepVariability(ctx),
    ...detectOperatorsBelowStandard(ctx),
    ...detectSinglePointOfFailure(ctx),
    ...detectQuality(ctx),
    ...detectCapability(ctx),
    ...detectDataGaps(ctx),
  ];
  const { opportunities, total } = applyOverlap(rankOpportunities(drafts));
  return {
    opportunities,
    weekPlan: weekPlan(opportunities),
    totalMonthlyCOP: total,
    monetizedCount: opportunities.filter((o) => o.impact.monthlyCOP !== null && o.impact.monthlyCOP > 0).length,
    safetyCount: opportunities.filter((o) => o.safety !== null).length,
    measurementCount: opportunities.filter((o) => o.kind === "medicion").length,
    hasData: ctx.cycles.length > 0 || (snapshot.evaluations ?? []).length > 0 || (snapshot.readings ?? []).length > 0,
  };
}
