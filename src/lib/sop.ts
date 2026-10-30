/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Trabajo estándar (SOP): hoja de trabajo estándar / instructivo de operación de un puesto a
 * partir de lo que Kronos ya midió. Funciones puras (sin React) más la persistencia propia.
 *
 * Método clásico del estudio de tiempos:
 *   tiempo observado (TO) = mediana de las observaciones del paso (se informan media, n y CV)
 *   tiempo normal   (TN) = TO × valoración del ritmo / 100            (100 % = ritmo normal)
 *   tiempo estándar (TE) = TN × (1 + suplementos / 100)
 *   tiempo estándar del ciclo = Σ TE de los pasos
 * Fuentes:
 *   - G. Kanawaty (dir.), OIT, «Introducción al estudio del trabajo», 4.ª ed. (1992; ed. en
 *     español 1996), caps. de valoración del ritmo, suplementos y cálculo del tiempo tipo.
 *   - A. Freivalds y B. Niebel, «Ingeniería industrial: métodos, estándares y diseño del
 *     trabajo» (13.ª ed., McGraw-Hill), caps. de estudio de tiempos, calificación y holguras
 *     (reproduce la tabla de suplementos recomendados por la OIT).
 * Los suplementos se suman (porcentajes aditivos sobre el tiempo normal), como en la tabla de
 * la OIT.
 *
 * Suficiencia estadística (Niebel; Kanawaty, método estadístico): observaciones necesarias para
 * un error de ±5 % con 95 % de confianza:
 *   n' = ( 40 · √( n·Σx² − (Σx)² ) / Σx )²
 * (40 = z/k ≈ 2 / 0,05). Se redondea hacia arriba.
 *
 * El uso de la MEDIANA como tiempo observado (en vez de la media) es una CONVENCIÓN DE KRONOS:
 * protege el estándar de atípicos (interrupciones, reinicios del cronómetro) sin tener que
 * depurar a mano; el analista ve la media y el CV al lado para decidir.
 *
 * Los puntos clave (calidad, seguridad, quién puede enseñar) se derivan de los datos con reglas
 * de Kronos documentadas abajo: son sugerencias para el analista, no hallazgos causales.
 */
import type { CycleRecord, DefectRecord, OperatorConfig, QualityCheck, StepConfig } from "@/context/TimeStudyContext";
import { taskTimes } from "@/lib/lineBalance";
import { assessCompetency, coefficientOfVariation, isValidDuration, mean, median, sampleStd } from "@/lib/learning";
import { NR_INTERPRETATION, latestByPuesto, slug, type ErgoEvaluation, type MatrixRow } from "@/lib/sgsst";

// ── Notas de alcance ─────────────────────────────────────────────────────────────

/** Se repite en la interfaz y el PDF. No usar «cumple» ni «certificado». */
export const SOP_SCOPE_NOTE =
  "Los tiempos de esta hoja se derivan de las mediciones registradas en Kronos IA. Valídelos con el supervisor del proceso antes de usarlos para entrenar, programar o pagar.";

export const SOP_METHOD_SOURCE =
  "Método: OIT, Introducción al estudio del trabajo (Kanawaty, 4.ª ed.) y Freivalds y Niebel, Ingeniería industrial: métodos, estándares y diseño del trabajo.";

// ── Valoración y suficiencia ─────────────────────────────────────────────────────

export const DEFAULT_RATING = 100;
/** Rango aceptado para la valoración del ritmo (%). Fuera de él se vuelve al 100 %. */
export const RATING_MIN = 50;
export const RATING_MAX = 150;
/** z/k para ±5 % con 95 % de confianza (≈ 2 / 0,05). */
export const SUFFICIENCY_FACTOR = 40;

/**
 * Asociación por tiempo de un defecto a un paso (convención Kronos): en el ciclo defectuoso,
 * el paso cuyo tiempo más se aleja por encima de su mediana, si lo hace en al menos un 25 %.
 */
export const DEFECT_TIME_EXCESS = 0.25;

/** Niveles de acción de RULA (McAtamney y Corlett, 1993) y REBA (Hignett y McAtamney, 2000). */
export const RULA_HIGH = 5;      // 5–6: investigar y cambiar pronto
export const RULA_VERY_HIGH = 7; // 7: investigar y cambiar de inmediato
export const REBA_HIGH = 8;      // 8–10: riesgo alto, actuar pronto
export const REBA_VERY_HIGH = 11; // 11–15: riesgo muy alto, actuar de inmediato

// ── Suplementos (tabla de la OIT) ────────────────────────────────────────────────

export type VariableAllowanceKey =
  | "depie" | "postura" | "fuerza" | "iluminacion" | "atencion" | "ruido" | "tensionMental" | "monotonia" | "tedio";

export interface AllowanceOption {
  id: string;
  label: string;
  /** % sobre el tiempo normal. */
  value: number;
}

export interface VariableAllowance {
  key: VariableAllowanceKey;
  label: string;
  help: string;
  options: AllowanceOption[];
}

/**
 * Suplementos constantes y variables de la tabla de la OIT tal como la reproducen Kanawaty y
 * Freivalds y Niebel (columna «hombres»). La tabla publicada trae valores mayores para mujeres en
 * algunos factores (necesidades personales 7 %, de pie 4 %, postura ligeramente incómoda 1 %,
 * incómoda 3 %, levantamiento de pesos y tedio físico); el analista puede ajustar los porcentajes.
 *
 * VERIFICAR con la edición impresa:
 *   - «Uso de fuerza»: los escalones en kg (2,5 … 25 kg) son la versión métrica que circula de la
 *     tabla; Niebel la presenta en libras y los valores intermedios pueden diferir en ±1 punto.
 *   - «Condiciones atmosféricas» (calor y humedad, 0–100 % según el poder refrigerante del
 *     catatermómetro de Kata) NO se incluye: depende de una tabla aparte que Kronos no mide.
 *     Use «Otro suplemento» si aplica.
 */
export const VARIABLE_ALLOWANCES: VariableAllowance[] = [
  {
    key: "depie", label: "Trabajo de pie", help: "El operario trabaja de pie todo el ciclo.",
    options: [{ id: "no", label: "No", value: 0 }, { id: "si", label: "Sí, de pie", value: 2 }],
  },
  {
    key: "postura", label: "Postura anormal", help: "Inclinarse, agacharse, estirarse o trabajar acostado.",
    options: [
      { id: "ligera", label: "Ligeramente incómoda", value: 0 },
      { id: "incomoda", label: "Incómoda (inclinado)", value: 2 },
      { id: "muy", label: "Muy incómoda (acostado, estirado)", value: 7 },
    ],
  },
  {
    key: "fuerza", label: "Uso de fuerza (peso levantado)", help: "Levantar, tirar o empujar; peso o fuerza equivalente.",
    options: [
      { id: "0", label: "Ninguno", value: 0 },
      { id: "2.5", label: "2,5 kg", value: 0 },
      { id: "5", label: "5 kg", value: 1 },
      { id: "10", label: "10 kg", value: 3 },
      { id: "12.5", label: "12,5 kg", value: 4 },
      { id: "15", label: "15 kg", value: 6 },
      { id: "17.5", label: "17,5 kg", value: 8 },
      { id: "20", label: "20 kg", value: 10 },
      { id: "22.5", label: "22,5 kg", value: 12 },
      { id: "25", label: "25 kg", value: 14 },
    ],
  },
  {
    key: "iluminacion", label: "Iluminación deficiente", help: "Respecto a lo recomendado para la tarea.",
    options: [
      { id: "ligera", label: "Ligeramente por debajo", value: 0 },
      { id: "bastante", label: "Bastante por debajo", value: 2 },
      { id: "muy", label: "Absolutamente insuficiente", value: 5 },
    ],
  },
  {
    key: "atencion", label: "Concentración intensa", help: "Trabajo de precisión o que exige mucha atención visual.",
    options: [
      { id: "fino", label: "Trabajo bastante fino", value: 0 },
      { id: "preciso", label: "Fino o de gran precisión", value: 2 },
      { id: "muy", label: "Muy fino o de muy gran precisión", value: 5 },
    ],
  },
  {
    key: "ruido", label: "Ruido", help: "Tipo de ruido en el puesto.",
    options: [
      { id: "continuo", label: "Continuo", value: 0 },
      { id: "intermitente", label: "Intermitente y fuerte", value: 2 },
      { id: "muy", label: "Intermitente y muy fuerte", value: 5 },
      { id: "estridente", label: "Estridente y fuerte", value: 5 },
    ],
  },
  {
    key: "tensionMental", label: "Tensión mental", help: "Complejidad del proceso o amplitud de la atención.",
    options: [
      { id: "bastante", label: "Proceso bastante complejo", value: 1 },
      { id: "complejo", label: "Complejo o atención dividida", value: 4 },
      { id: "muy", label: "Muy complejo", value: 8 },
    ],
  },
  {
    key: "monotonia", label: "Monotonía (mental)", help: "Repetición de la misma tarea mental.",
    options: [
      { id: "baja", label: "Baja", value: 0 },
      { id: "media", label: "Media", value: 1 },
      { id: "alta", label: "Alta", value: 4 },
    ],
  },
  {
    key: "tedio", label: "Tedio (físico)", help: "Repetición del mismo movimiento físico.",
    options: [
      { id: "algo", label: "Algo aburrido", value: 0 },
      { id: "aburrido", label: "Aburrido", value: 2 },
      { id: "muy", label: "Muy aburrido", value: 5 },
    ],
  },
];

export interface AllowanceConfig {
  /** Necesidades personales (%, OIT: 5 % hombres). */
  personal: number;
  /** Fatiga básica (%, OIT: 4 %). */
  fatigue: number;
  /** Opción elegida por factor variable; ausente = no aplica. */
  variable: Partial<Record<VariableAllowanceKey, string>>;
  /** Suplemento adicional libre (%), p. ej. condiciones atmosféricas o contingencias. */
  extra: number;
  extraLabel: string;
}

export const defaultAllowances = (): AllowanceConfig => ({ personal: 5, fatigue: 4, variable: {}, extra: 0, extraLabel: "" });

export interface AllowanceItem {
  kind: "constante" | "variable" | "otro";
  label: string;
  value: number;
}

/** Desglose de los suplementos que aplican (los de 0 % de los factores variables también se listan). */
export function allowanceItems(cfg: AllowanceConfig): AllowanceItem[] {
  const items: AllowanceItem[] = [
    { kind: "constante", label: "Necesidades personales", value: cfg.personal },
    { kind: "constante", label: "Fatiga básica", value: cfg.fatigue },
  ];
  for (const v of VARIABLE_ALLOWANCES) {
    const opt = v.options.find((o) => o.id === cfg.variable[v.key]);
    if (opt) items.push({ kind: "variable", label: `${v.label}: ${opt.label}`, value: opt.value });
  }
  if (cfg.extra > 0) items.push({ kind: "otro", label: cfg.extraLabel.trim() || "Otro suplemento", value: cfg.extra });
  return items;
}

/** Suplemento total (%): suma de los componentes (método aditivo de la OIT). */
export const totalAllowance = (cfg: AllowanceConfig): number => allowanceItems(cfg).reduce((s, i) => s + i.value, 0);

// ── Estadística por paso ─────────────────────────────────────────────────────────

export interface ObservationStats {
  n: number;
  mean: number;
  median: number;
  sd: number;
  /** σ / media. */
  cv: number;
  min: number;
  max: number;
}

export function observationStats(xs: readonly number[]): ObservationStats | null {
  const v = xs.filter(isValidDuration);
  if (v.length === 0) return null;
  return {
    n: v.length, mean: mean(v), median: median(v), sd: sampleStd(v), cv: coefficientOfVariation(v),
    min: Math.min(...v), max: Math.max(...v),
  };
}

/**
 * Observaciones necesarias para ±5 % con 95 % de confianza (fórmula de Niebel, ver arriba).
 * null con menos de 2 observaciones válidas (no hay dispersión que medir).
 */
export function requiredObservations(xs: readonly number[]): number | null {
  const v = xs.filter(isValidDuration);
  if (v.length < 2) return null;
  const n = v.length;
  const sum = v.reduce((a, b) => a + b, 0);
  const sumSq = v.reduce((a, b) => a + b * b, 0);
  const disc = Math.max(0, n * sumSq - sum * sum); // ≥ 0 salvo redondeo
  const req = ((SUFFICIENCY_FACTOR * Math.sqrt(disc)) / sum) ** 2;
  return Math.max(1, Math.ceil(req - 1e-9));
}

/** TN = TO × ritmo / 100;  TE = TN × (1 + suplementos / 100). */
export function standardTime(observed: number, ratingPct: number, allowancePct: number): { normal: number; standard: number } {
  const normal = observed * (ratingPct / 100);
  return { normal, standard: normal * (1 + allowancePct / 100) };
}

export const clampRating = (r: unknown): number =>
  typeof r === "number" && Number.isFinite(r) && r >= RATING_MIN && r <= RATING_MAX ? r : DEFAULT_RATING;

// ── Texto: palabras clave para asociar defectos y criterios a pasos ─────────────

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "en", "con", "sin", "y", "o", "a", "al", "por", "para", "un", "una", "sus", "su",
  "sup", "inf", "que", "se", "mal", "muy",
]);

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras significativas (≥ 3 letras, sin tildes, plural simple recortado). */
export function keywords(s: string): string[] {
  return [...new Set(
    normalize(s).split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)),
  )];
}

/**
 * Palabras clave propias de cada paso. Se descartan las genéricas: las que aparecen en más de un
 * tercio de los pasos (p. ej. «pliegue» en un proceso de doblado), porque no distinguen ninguno.
 */
function stepKeywords(steps: readonly StepConfig[]): Map<number, Set<string>> {
  const per = steps.map((s) => keywords(s.name));
  const freq = new Map<string, number>();
  per.forEach((ws) => ws.forEach((w) => freq.set(w, (freq.get(w) ?? 0) + 1)));
  const limit = Math.max(1, Math.floor(steps.length / 3));
  return new Map(steps.map((s, i) => [s.number, new Set(per[i].filter((w) => (freq.get(w) ?? 0) <= limit))]));
}

/** Pasos cuyo nombre comparte una palabra clave distintiva con el texto (o que lo citan como «paso N»). */
function stepsMentioned(text: string, steps: readonly StepConfig[], kw: Map<number, Set<string>>): number[] {
  const words = keywords(text);
  const explicit = [...normalize(text).matchAll(/paso\s*(\d+)/g)].map((m) => Number(m[1]));
  return steps
    .filter((s) => explicit.includes(s.number) || words.some((w) => kw.get(s.number)?.has(w)))
    .map((s) => s.number);
}

// ── Calidad: defectos y criterios ────────────────────────────────────────────────

export type Severity = DefectRecord["severity"];
const SEVERITY_RANK: Record<Severity, number> = { leve: 0, moderado: 1, critico: 2 };
export const SEVERITY_LABEL: Record<Severity, string> = { leve: "leve", moderado: "moderado", critico: "crítico" };

export interface DefectLink {
  type: string;
  count: number;
  worst: Severity;
  /**
   * «texto»: el nombre del defecto menciona el paso; «tiempo»: el paso se alargó en los ciclos
   * defectuosos; «proceso»: no se pudo asociar a un paso.
   */
  basis: "texto" | "tiempo" | "proceso";
}

export interface DefectAssociation {
  byStep: Map<number, DefectLink[]>;
  /** Defectos que no se pudieron asociar a ningún paso. */
  unlinked: DefectLink[];
}

function addLink(list: DefectLink[], d: DefectRecord, basis: DefectLink["basis"]) {
  const cur = list.find((l) => l.type === d.type);
  if (!cur) {
    list.push({ type: d.type, count: 1, worst: d.severity, basis });
    return;
  }
  cur.count++;
  if (SEVERITY_RANK[d.severity] > SEVERITY_RANK[cur.worst]) cur.worst = d.severity;
  if (basis === "texto") cur.basis = "texto";
}

const sortLinks = (l: DefectLink[]) =>
  l.sort((a, b) => SEVERITY_RANK[b.worst] - SEVERITY_RANK[a.worst] || b.count - a.count || a.type.localeCompare(b.type, "es"));

/**
 * Asocia cada defecto a pasos (convención Kronos, no causal):
 *  1. por texto: el tipo o la descripción del defecto comparte una palabra distintiva con el
 *     nombre del paso («Cuello mal formado» → «Formación del cuello»), o dice «paso N»;
 *  2. si no, por tiempo: en el ciclo del defecto, el paso que más superó su mediana, si la
 *     superó en al menos DEFECT_TIME_EXCESS (un paso que se alarga suele indicar reproceso).
 */
export function associateDefects(
  steps: readonly StepConfig[], cycles: readonly CycleRecord[], defects: readonly DefectRecord[],
): DefectAssociation {
  const kw = stepKeywords(steps);
  const medians = new Map<number, number>();
  for (const s of steps) {
    const xs = cycles.flatMap((c) => c.steps ?? []).filter((t) => t.stepNumber === s.number && isValidDuration(t.duration)).map((t) => t.duration);
    if (xs.length) medians.set(s.number, median(xs));
  }
  const byCycle = new Map(cycles.map((c) => [c.id, c]));
  const byStep = new Map<number, DefectLink[]>();
  const unlinked: DefectLink[] = [];
  const push = (n: number, d: DefectRecord, basis: DefectLink["basis"]) => {
    if (!byStep.has(n)) byStep.set(n, []);
    addLink(byStep.get(n)!, d, basis);
  };

  for (const d of defects) {
    const mentioned = stepsMentioned(`${d.type} ${d.description ?? ""}`, steps, kw);
    if (mentioned.length) {
      mentioned.forEach((n) => push(n, d, "texto"));
      continue;
    }
    let best: { n: number; excess: number } | null = null;
    for (const t of byCycle.get(d.cycleId)?.steps ?? []) {
      const m = medians.get(t.stepNumber);
      if (!m || !isValidDuration(t.duration)) continue;
      const excess = t.duration / m - 1;
      if (!best || excess > best.excess) best = { n: t.stepNumber, excess };
    }
    if (best && best.excess >= DEFECT_TIME_EXCESS - 1e-9) push(best.n, d, "tiempo");
    else addLink(unlinked, d, "proceso");
  }
  byStep.forEach(sortLinks);
  sortLinks(unlinked);
  return { byStep, unlinked };
}

export interface CriterionStat {
  name: string;
  checks: number;
  fails: number;
  steps: number[];
}

/** Criterios de inspección con su tasa de falla y los pasos a los que se refieren (por texto). */
export function criteriaByStep(steps: readonly StepConfig[], checks: readonly QualityCheck[]): CriterionStat[] {
  const kw = stepKeywords(steps);
  const map = new Map<string, CriterionStat>();
  for (const q of checks) {
    for (const c of q.criteria ?? []) {
      const name = c.name.trim();
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, checks: 0, fails: 0, steps: stepsMentioned(name, steps, kw) });
      const s = map.get(name)!;
      s.checks++;
      if (!c.passed) s.fails++;
    }
  }
  return [...map.values()].sort((a, b) => b.fails / b.checks - a.fails / a.checks || a.name.localeCompare(b.name, "es"));
}

// ── Seguridad y ergonomía del puesto ─────────────────────────────────────────────

export type KeyPointKind = "calidad" | "seguridad" | "saber";

export interface KeyPoint {
  kind: KeyPointKind;
  text: string;
  /** «alta» = actuar pronto; «media» = atención; «info» = referencia. */
  level: "alta" | "media" | "info";
}

export interface StationSafety {
  evaluation: ErgoEvaluation | null;
  rula: number | null;
  reba: number | null;
  /** true si RULA/REBA vienen de la revisión del experto (se prefieren a la cámara). */
  byExpert: boolean;
  warnings: KeyPoint[];
}

const fmt1 = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

/**
 * Advertencias de seguridad del puesto: evaluación ergonómica más reciente del puesto (con la
 * revisión del experto si existe) y filas de la matriz GTC 45 del puesto en nivel de riesgo I o II.
 * Solo se advierte desde RULA ≥ 5 o REBA ≥ 8 (niveles de acción «cambiar pronto» de los métodos).
 */
export function stationSafety(station: string, evaluations: readonly ErgoEvaluation[], rows: readonly MatrixRow[]): StationSafety {
  const key = slug(station);
  const none: StationSafety = { evaluation: null, rula: null, reba: null, byExpert: false, warnings: [] };
  if (!station.trim()) return none;
  const ev = latestByPuesto([...evaluations]).find((e) => slug(e.puesto) === key) ?? null;
  const warnings: KeyPoint[] = [];
  let rula: number | null = null;
  let reba: number | null = null;
  const byExpert = !!ev?.experto;
  if (ev) {
    rula = ev.experto ? ev.experto.rula : ev.rulaAvg;
    reba = ev.experto ? ev.experto.reba : ev.rebaAvg;
    const origin = ev.experto
      ? `validado por experto${ev.experto.revisor.trim() ? ` (${ev.experto.revisor.trim()})` : ""}`
      : ev.origen === "vision-ai" ? "tamizaje con cámara, sin revisión de experto" : "evaluación manual";
    const parts: string[] = [];
    let level: KeyPoint["level"] | null = null;
    if (rula != null && rula >= RULA_HIGH) {
      parts.push(`RULA ${fmt1(rula)}`);
      level = rula >= RULA_VERY_HIGH ? "alta" : "media";
    }
    if (reba != null && reba >= REBA_HIGH) {
      parts.push(`REBA ${fmt1(reba)}`);
      if (reba >= REBA_VERY_HIGH) level = "alta";
      else level = level ?? "media";
    }
    if (parts.length && level) {
      warnings.push({
        kind: "seguridad",
        level,
        text: `Postura de riesgo ${level === "alta" ? "muy alto" : "alto"}: ${parts.join(", ")} (${origin}, ${ev.fecha}). ` +
          (level === "alta" ? "Cambiar el método o el puesto de inmediato; " : "Cambiar pronto; ") +
          "mientras tanto, ajuste altura y alcance, alterne tareas y haga pausas activas.",
      });
    }
  }
  for (const r of rows) {
    if (r.excluded || slug(r.lugar) !== key || (r.nrLevel !== "I" && r.nrLevel !== "II")) continue;
    warnings.push({
      kind: "seguridad",
      level: r.nrLevel === "I" ? "alta" : "media",
      text: `GTC 45, ${r.clasificacion.toLowerCase()} (${r.peligro}): NR ${r.nr}, nivel ${r.nrLevel}, ${NR_INTERPRETATION[r.nrLevel].aceptabilidad.toLowerCase()}.` +
        (r.controlesExistentes.trim() ? ` Controles: ${r.controlesExistentes.trim()}.` : ""),
    });
  }
  return { evaluation: ev, rula, reba, byExpert, warnings };
}

// ── Documento editable y persistencia ────────────────────────────────────────────

export const SOP_STORAGE_KEY = "kronos_sop_v1";
export const SOP_VERSION = 1;

export interface SOPHeader {
  proceso: string;
  puesto: string;
  version: string;
  /** AAAA-MM-DD */
  fecha: string;
  elaboro: string;
  aprobo: string;
}

export interface SOPStepEdit {
  stepNumber: number;
  /** Nombre del paso cuando se editó: identifica la fila aunque los pasos se renumeren. */
  stepName: string;
  rating: number;
  metodo: string;
  puntoClave: string;
  herramientas: string;
  foto: string;
}

export interface SOPDocument {
  version: number;
  header: SOPHeader;
  allowances: AllowanceConfig;
  steps: SOPStepEdit[];
  /** Operario cuyos tiempos se usan; null = todos. */
  operatorId: number | null;
}

export const emptyHeader = (): SOPHeader => ({ proceso: "", puesto: "", version: "1", fecha: "", elaboro: "", aprobo: "" });

export const emptySOP = (): SOPDocument => ({
  version: SOP_VERSION, header: emptyHeader(), allowances: defaultAllowances(), steps: [], operatorId: null,
});

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const pctIn = (v: unknown, d: number, max = 100) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : d);

function parseAllowances(v: unknown): AllowanceConfig {
  const d = defaultAllowances();
  if (!isObj(v)) return d;
  const variable: AllowanceConfig["variable"] = {};
  if (isObj(v.variable)) {
    for (const f of VARIABLE_ALLOWANCES) {
      const id = v.variable[f.key];
      // Opciones que ya no existen se descartan (no inventan un porcentaje).
      if (typeof id === "string" && f.options.some((o) => o.id === id)) variable[f.key] = id;
    }
  }
  return {
    personal: pctIn(v.personal, d.personal),
    fatigue: pctIn(v.fatigue, d.fatigue),
    variable,
    extra: pctIn(v.extra, 0),
    extraLabel: str(v.extraLabel),
  };
}

function parseStepEdit(v: unknown): SOPStepEdit | null {
  if (!isObj(v)) return null;
  const n = v.stepNumber;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) return null;
  return {
    stepNumber: n,
    stepName: str(v.stepName),
    rating: clampRating(v.rating),
    metodo: str(v.metodo),
    puntoClave: str(v.puntoClave),
    herramientas: str(v.herramientas),
    foto: str(v.foto),
  };
}

/** Lee lo guardado (cualquier versión anterior, incompleto o dañado) sin romper el módulo. */
export function parseSOP(raw: string | null): SOPDocument {
  if (!raw) return emptySOP();
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return emptySOP();
  }
  if (!isObj(d)) return emptySOP();
  const h = isObj(d.header) ? d.header : {};
  const base = emptyHeader();
  const op = d.operatorId;
  return {
    version: SOP_VERSION,
    header: {
      proceso: str(h.proceso), puesto: str(h.puesto), version: str(h.version, base.version),
      fecha: str(h.fecha), elaboro: str(h.elaboro), aprobo: str(h.aprobo),
    },
    allowances: parseAllowances(d.allowances),
    steps: Array.isArray(d.steps) ? d.steps.map(parseStepEdit).filter((x): x is SOPStepEdit => x !== null) : [],
    operatorId: typeof op === "number" && Number.isInteger(op) ? op : null,
  };
}

export const serializeSOP = (doc: SOPDocument): string => JSON.stringify({ ...doc, version: SOP_VERSION });

export function loadSOP(): SOPDocument {
  try {
    return parseSOP(localStorage.getItem(SOP_STORAGE_KEY));
  } catch {
    return emptySOP(); // almacenamiento no disponible
  }
}

export function saveSOP(doc: SOPDocument): void {
  try {
    localStorage.setItem(SOP_STORAGE_KEY, serializeSOP(doc));
  } catch {
    /* almacenamiento lleno o no disponible: el documento sigue en memoria */
  }
}

const blankEdit = (step: StepConfig): SOPStepEdit => ({
  stepNumber: step.number, stepName: step.name, rating: DEFAULT_RATING, metodo: "", puntoClave: "", herramientas: "", foto: "",
});

/**
 * Edición guardada de un paso: primero la del mismo número y nombre, luego la del mismo nombre
 * (el paso se renumeró al borrar otro). Si el paso se renombró, empieza en blanco.
 */
export function findStepEdit(doc: SOPDocument, step: StepConfig): SOPStepEdit {
  const name = slug(step.name);
  const hit = doc.steps.find((e) => e.stepNumber === step.number && slug(e.stepName) === name)
    ?? doc.steps.find((e) => slug(e.stepName) === name);
  return hit ? { ...hit, stepNumber: step.number, stepName: step.name } : blankEdit(step);
}

export function upsertStepEdit(doc: SOPDocument, step: StepConfig, patch: Partial<Omit<SOPStepEdit, "stepNumber" | "stepName">>): SOPDocument {
  const current = findStepEdit(doc, step);
  const name = slug(step.name);
  const others = doc.steps.filter((e) => slug(e.stepName) !== name);
  return { ...doc, steps: [...others, { ...current, ...patch, rating: clampRating(patch.rating ?? current.rating) }] };
}

// ── Hoja de trabajo estándar ─────────────────────────────────────────────────────

export interface SOPStepRow {
  step: StepConfig;
  stats: ObservationStats | null;
  /** Tiempo observado = mediana (s). */
  observed: number | null;
  rating: number;
  normal: number | null;
  allowancePct: number;
  standard: number | null;
  required: number | null;
  /** null sin datos suficientes para calcularlo (< 2 observaciones). */
  sufficient: boolean | null;
  defects: DefectLink[];
  criteria: CriterionStat[];
  trainers: string[];
  autonomous: string[];
  keyPoints: KeyPoint[];
  edit: SOPStepEdit;
}

export interface SOPSheet {
  rows: SOPStepRow[];
  /** No hay tiempos por paso: el ciclo completo se trata como un solo elemento. */
  wholeCycle: boolean;
  hasData: boolean;
  allowancePct: number;
  allowances: AllowanceItem[];
  totals: { observed: number; normal: number; standard: number; stepsWithData: number; stepsMissing: number };
  target: number | null;
  cycleMean: number | null;
  cycleCount: number;
  /** Tiempo estándar − objetivo (s) y relativo (fracción). */
  vsTarget: { diff: number; rel: number } | null;
  vsCycleMean: { diff: number; rel: number } | null;
  unitsPerHour: number | null;
  insufficientSteps: number[];
  safety: StationSafety;
  unlinkedDefects: DefectLink[];
  generalCriteria: CriterionStat[];
}

export interface SOPInput {
  steps: readonly StepConfig[];
  operators: readonly OperatorConfig[];
  cycles: readonly CycleRecord[];
  defects: readonly DefectRecord[];
  qualityChecks: readonly QualityCheck[];
  targetCycleTime: number;
  evaluations: readonly ErgoEvaluation[];
  /** Filas de la matriz GTC 45 (buildMatrix de sgsst.ts). */
  matrixRows: readonly MatrixRow[];
  doc: SOPDocument;
}

function qualityPoints(defects: DefectLink[], criteria: CriterionStat[]): KeyPoint[] {
  const out: KeyPoint[] = defects.slice(0, 3).map((d) => ({
    kind: "calidad" as const,
    level: d.worst === "critico" ? "alta" as const : d.worst === "moderado" ? "media" as const : "info" as const,
    text: `Evitar «${d.type}»: ${d.count} ${d.count === 1 ? "registro" : "registros"}, peor severidad ${SEVERITY_LABEL[d.worst]}` +
      (d.basis === "tiempo" ? " (el paso se alargó en esos ciclos)." : "."),
  }));
  for (const c of criteria) {
    out.push({
      kind: "calidad",
      level: c.fails > 0 ? "media" : "info",
      text: `Verificar «${c.name}»` + (c.fails > 0 ? `: no se logró en ${c.fails} de ${c.checks} inspecciones.` : "."),
    });
  }
  return out;
}

/** Construye la hoja completa a partir del estudio de tiempos, calidad, competencias y SST. */
export function buildStandardWork(input: SOPInput): SOPSheet {
  const { steps, operators, defects, qualityChecks, doc } = input;
  const opId = doc.operatorId;
  const pool = opId != null && input.cycles.some((c) => c.operatorId === opId)
    ? input.cycles.filter((c) => c.operatorId === opId)
    : [...input.cycles];

  const tasks = taskTimes([...steps], pool);
  const hasStepSamples = pool.some((c) => (c.steps ?? []).some((t) => t.duration > 0 && steps.some((s) => s.number === t.stepNumber)));
  const wholeCycle = tasks.length > 0 && !hasStepSamples;
  const allowancePct = totalAllowance(doc.allowances);

  const elements: StepConfig[] = wholeCycle ? [{ number: 1, name: "Ciclo completo", emoji: "" }] : [...steps];
  const samplesOf = (n: number) => (wholeCycle ? tasks[0].samples : tasks.find((t) => t.number === n)?.samples ?? []);

  // Calidad y competencias usan todo el estudio (no solo el operario elegido para los tiempos).
  const assoc = associateDefects(steps, input.cycles, defects);
  const criteria = criteriaByStep(steps, qualityChecks);
  const matrix = assessCompetency(steps, operators, input.cycles, input.targetCycleTime);
  const nameOf = (id: number) => operators.find((o) => o.id === id)?.name ?? `Operario ${id}`;
  const safety = stationSafety(doc.header.puesto, input.evaluations, input.matrixRows);

  const rows: SOPStepRow[] = elements.map((step) => {
    const xs = samplesOf(step.number);
    const stats = observationStats(xs);
    const edit = findStepEdit(doc, step);
    const rating = clampRating(edit.rating);
    const t = stats ? standardTime(stats.median, rating, allowancePct) : null;
    const required = requiredObservations(xs);
    const summary = wholeCycle ? undefined : matrix.stepSummaries.find((s) => s.step.number === step.number);
    const trainers = (summary?.trainers ?? []).map(nameOf);
    const autonomous = (summary?.autonomous ?? []).filter((id) => !summary?.trainers.includes(id)).map(nameOf);
    const stepDefects = wholeCycle ? [] : assoc.byStep.get(step.number) ?? [];
    const stepCriteria = wholeCycle ? [] : criteria.filter((c) => c.steps.includes(step.number));

    const keyPoints: KeyPoint[] = [...qualityPoints(stepDefects, stepCriteria), ...safety.warnings];
    if (trainers.length) {
      keyPoints.push({ kind: "saber", level: "info", text: `Puede enseñarlo (nivel O): ${trainers.join(", ")}.` });
    } else if (autonomous.length) {
      keyPoints.push({ kind: "saber", level: "media", text: `Sin instructor en nivel O; autónomos (U): ${autonomous.join(", ")}.` });
    } else if (summary && summary.operatorsWithData > 0) {
      keyPoints.push({ kind: "saber", level: "alta", text: "Nadie lo opera aún de forma autónoma: estandarice el método antes de entrenar." });
    }

    return {
      step, stats, observed: stats?.median ?? null, rating, normal: t?.normal ?? null, allowancePct, standard: t?.standard ?? null,
      required, sufficient: required == null || !stats ? null : stats.n >= required,
      defects: stepDefects, criteria: stepCriteria, trainers, autonomous, keyPoints, edit,
    };
  });

  const withData = rows.filter((r) => r.stats);
  const sum = (f: (r: SOPStepRow) => number | null) => withData.reduce((s, r) => s + (f(r) ?? 0), 0);
  const totals = {
    observed: sum((r) => r.observed), normal: sum((r) => r.normal), standard: sum((r) => r.standard),
    stepsWithData: withData.length, stepsMissing: rows.length - withData.length,
  };
  const durations = pool.map((c) => c.duration).filter(isValidDuration);
  const cycleMean = durations.length ? mean(durations) : null;
  const target = input.targetCycleTime > 0 ? input.targetCycleTime : null;
  const cmp = (ref: number | null) => (ref && totals.standard > 0 ? { diff: totals.standard - ref, rel: totals.standard / ref - 1 } : null);

  return {
    rows,
    wholeCycle,
    hasData: withData.length > 0,
    allowancePct,
    allowances: allowanceItems(doc.allowances),
    totals,
    target,
    cycleMean,
    cycleCount: durations.length,
    vsTarget: cmp(target),
    vsCycleMean: cmp(cycleMean),
    unitsPerHour: totals.standard > 0 ? 3600 / totals.standard : null,
    insufficientSteps: rows.filter((r) => r.sufficient === false || (r.stats && r.stats.n < 2)).map((r) => r.step.number),
    safety,
    // Sin tiempos por paso, todos los defectos quedan a nivel de proceso.
    unlinkedDefects: wholeCycle ? sortLinks(defects.reduce<DefectLink[]>((l, d) => (addLink(l, d, "proceso"), l), [])) : assoc.unlinked,
    generalCriteria: wholeCycle ? criteria : criteria.filter((c) => c.steps.length === 0),
  };
}
