/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Paquete SG-SST Colombia: lógica pura (sin React) de la matriz de peligros, la propuesta
 * de niveles a partir de los datos medidos, el plan de acción y la exportación a CSV.
 *
 * Fuente principal: ICONTEC, GTC 45:2012 «Guía para la identificación de los peligros y la
 * valoración de los riesgos en seguridad y salud ocupacional» (segunda actualización, 2012-06-20).
 *   - Tabla 2: nivel de deficiencia (ND)        - Tabla 3: nivel de exposición (NE)
 *   - Tablas 4 y 5: nivel de probabilidad (NP = ND × NE) y su interpretación
 *   - Tabla 6: nivel de consecuencias (NC)      - Tablas 7 y 8: nivel de riesgo (NR = NP × NC)
 *   - Tabla 9: aceptabilidad del riesgo         - Anexo C: ND cualitativo de peligros higiénicos
 *     y biomecánicos (postura, movimiento repetitivo, ruido, iluminación).
 * Jerarquía de controles: GTC 45 §2.4 y Decreto 1072 de 2015, art. 2.2.4.6.24.
 *
 * Los textos de las tablas se transcriben de la guía; los marcados «VERIFICAR» conviene
 * cotejarlos con la edición impresa. La conversión de RULA/REBA/lux/dB a ND y de horas a NE
 * es una CONVENCIÓN DE KRONOS (no está en la GTC 45): solo propone valores que el
 * profesional SST revisa y puede cambiar.
 */
import {
  REGULATIONS, getLuxCompliance, getDbCompliance, calculateLEQ,
  type EnvironmentalReading,
} from "@/context/SSTContext";
import type { CameraView, SessionSnapshot } from "@/components/VisionAI/types";

/** Nota de alcance: se repite en la interfaz, el PDF y el CSV. No usar «cumple» ni «certificado». */
export const SCOPE_NOTE =
  "Herramienta de apoyo para el SG-SST. No reemplaza la evaluación de un profesional en SST con licencia vigente ni constituye certificado de cumplimiento.";

/** Aclaración sobre el origen de RULA/REBA (tamizaje con una sola cámara). */
export const CAMERA_NOTE =
  "RULA (McAtamney y Corlett, 1993) y REBA (Hignett y McAtamney, 2000) se estiman con una sola cámara: son un tamizaje, no una evaluación ergonómica normativa. Revise la confianza de cada evaluación y confirme con un evaluador cuando sea media o baja.";

export const GTC45_SOURCE = "GTC 45:2012 (ICONTEC), segunda actualización";

/** Estado de una lectura frente a la referencia usada en Kronos (sin la palabra «cumple»). */
export const LEVEL_TEXT = { ok: "Dentro de la referencia", warning: "Cerca del límite", critical: "Fuera de la referencia" } as const;

// ── Tablas de la GTC 45 ──────────────────────────────────────────────────────

export type NDValue = 10 | 6 | 2 | 0;
export type NEValue = 4 | 3 | 2 | 1;
export type NCValue = 100 | 60 | 25 | 10;

/**
 * Tabla 2. La guía dice para «Bajo»: «No se asigna valor». Kronos usa 0 como convención
 * numérica (práctica habitual en matrices colombianas), lo que da NP = 0 y NR = 0 (nivel IV).
 */
export const ND_OPTIONS: { value: NDValue; code: string; label: string; desc: string }[] = [
  { value: 10, code: "MA", label: "Muy alto", desc: "Se ha(n) detectado peligro(s) que determina(n) como posible la generación de incidentes o consecuencias muy significativas, o la eficacia del conjunto de medidas preventivas existentes respecto al riesgo es nula o no existe, o ambos." },
  { value: 6, code: "A", label: "Alto", desc: "Se ha(n) detectado algún(os) peligro(s) que pueden dar lugar a consecuencias significativa(s), o la eficacia del conjunto de medidas preventivas existentes es baja, o ambos." },
  { value: 2, code: "M", label: "Medio", desc: "Se han detectado peligros que pueden dar lugar a consecuencias poco significativas o de menor importancia, o la eficacia del conjunto de medidas preventivas existentes es moderada, o ambos." },
  { value: 0, code: "B", label: "Bajo", desc: "No se ha detectado consecuencia alguna, o la eficacia del conjunto de medidas preventivas existentes es alta, o ambos. El riesgo está controlado. (La guía no asigna valor; Kronos usa 0.)" },
];

/** Tabla 3. */
export const NE_OPTIONS: { value: NEValue; code: string; label: string; desc: string }[] = [
  { value: 4, code: "EC", label: "Continua", desc: "La situación de exposición se presenta sin interrupción o varias veces con tiempo prolongado durante la jornada laboral." },
  { value: 3, code: "EF", label: "Frecuente", desc: "La situación de exposición se presenta varias veces durante la jornada laboral por tiempos cortos." },
  { value: 2, code: "EO", label: "Ocasional", desc: "La situación de exposición se presenta alguna vez durante la jornada laboral y por un periodo de tiempo corto." },
  { value: 1, code: "EE", label: "Esporádica", desc: "La situación de exposición se presenta de manera eventual." },
];

/** Tabla 6 (daños personales). */
export const NC_OPTIONS: { value: NCValue; code: string; label: string; desc: string }[] = [
  { value: 100, code: "M", label: "Mortal o catastrófico", desc: "Muerte(s)." },
  { value: 60, code: "MG", label: "Muy grave", desc: "Lesiones o enfermedades graves irreparables (incapacidad permanente parcial o invalidez)." },
  { value: 25, code: "G", label: "Grave", desc: "Lesiones o enfermedades con incapacidad laboral temporal (ILT)." },
  { value: 10, code: "L", label: "Leve", desc: "Lesiones o enfermedades que no requieren incapacidad." },
];

export type NPLevel = "MA" | "A" | "M" | "B";

/** Tabla 5: interpretación del nivel de probabilidad. */
export const NP_INTERPRETATION: Record<NPLevel, { label: string; range: string; desc: string }> = {
  MA: { label: "Muy alto", range: "40–24", desc: "Situación deficiente con exposición continua, o muy deficiente con exposición frecuente. Normalmente la materialización del riesgo ocurre con frecuencia." },
  A: { label: "Alto", range: "20–10", desc: "Situación deficiente con exposición frecuente u ocasional, o bien situación muy deficiente con exposición ocasional o esporádica. La materialización del riesgo es posible que suceda varias veces en la vida laboral." },
  M: { label: "Medio", range: "8–6", desc: "Situación deficiente con exposición esporádica, o bien situación mejorable con exposición continuada o frecuente. Es posible que suceda el daño alguna vez." },
  B: { label: "Bajo", range: "4–2", desc: "Situación mejorable con exposición ocasional o esporádica, o situación sin anomalía destacable con cualquier nivel de exposición. No es esperable que se materialice el riesgo, aunque puede ser concebible." },
};

export type NRLevel = "I" | "II" | "III" | "IV";

/** Tablas 8 y 9: significado del nivel de riesgo y aceptabilidad. */
export const NR_INTERPRETATION: Record<NRLevel, { range: string; desc: string; aceptabilidad: string }> = {
  I: { range: "4000–600", desc: "Situación crítica. Suspender actividades hasta que el riesgo esté bajo control. Intervención urgente.", aceptabilidad: "No aceptable" },
  // VERIFICAR: la frase sobre 360 se transcribe de la Tabla 8 de la edición 2012.
  II: { range: "500–150", desc: "Corregir y adoptar medidas de control de inmediato. Sin embargo, suspenda actividades si el nivel de riesgo está por encima o igual de 360.", aceptabilidad: "No aceptable o aceptable con control específico" },
  III: { range: "120–40", desc: "Mejorar si es posible. Sería conveniente justificar la intervención y su rentabilidad.", aceptabilidad: "Mejorable" },
  IV: { range: "20", desc: "Mantener las medidas de control existentes, pero se deberían considerar soluciones mejoradas o mejoras que no supongan una carga económica importante. Se requieren comprobaciones periódicas para asegurar que el riesgo aún es aceptable.", aceptabilidad: "Aceptable" },
};

export const ndOption = (v: NDValue) => ND_OPTIONS.find((o) => o.value === v)!;
export const neOption = (v: NEValue) => NE_OPTIONS.find((o) => o.value === v)!;
export const ncOption = (v: NCValue) => NC_OPTIONS.find((o) => o.value === v)!;

export const isND = (v: unknown): v is NDValue => v === 10 || v === 6 || v === 2 || v === 0;
export const isNE = (v: unknown): v is NEValue => v === 4 || v === 3 || v === 2 || v === 1;
export const isNC = (v: unknown): v is NCValue => v === 100 || v === 60 || v === 25 || v === 10;

/** NP = ND × NE (Tabla 4). */
export const computeNP = (nd: NDValue, ne: NEValue): number => nd * ne;

/**
 * Tabla 5. Los productos posibles son 0, 2–4, 6–8, 10–20 y 24–40, así que los cortes
 * (≥ 24, ≥ 10, ≥ 6) no dejan huecos. NP = 0 (ND bajo) se interpreta como «Bajo».
 */
export function interpretNP(np: number): NPLevel {
  if (np >= 24) return "MA";
  if (np >= 10) return "A";
  if (np >= 6) return "M";
  return "B";
}

/** NR = NP × NC (Tabla 7). */
export const computeNR = (np: number, nc: NCValue): number => np * nc;

/** Tabla 8: I 4000–600 · II 500–150 · III 120–40 · IV 20 (y 0 cuando ND es bajo). */
export function nrLevel(nr: number): NRLevel {
  if (nr >= 600) return "I";
  if (nr >= 150) return "II";
  if (nr >= 40) return "III";
  return "IV";
}

export interface RiskEvaluation {
  np: number;
  npLevel: NPLevel;
  nr: number;
  nrLevel: NRLevel;
  aceptabilidad: string;
  /** Nivel II con NR ≥ 360: la Tabla 8 indica suspender actividades. */
  suspendAt360: boolean;
}

export function evaluateRisk(nd: NDValue, ne: NEValue, nc: NCValue): RiskEvaluation {
  const np = computeNP(nd, ne);
  const nr = computeNR(np, nc);
  const level = nrLevel(nr);
  return {
    np,
    npLevel: interpretNP(np),
    nr,
    nrLevel: level,
    aceptabilidad: NR_INTERPRETATION[level].aceptabilidad,
    suspendAt360: level === "II" && nr >= 360,
  };
}

// ── Propuesta de ND / NE a partir de los datos (convención de Kronos) ────────

export interface Proposal<T> {
  value: T;
  /** Explicación legible de por qué se propone ese valor. */
  basis: string;
}

const fmt1 = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

/**
 * RULA → ND. Los niveles de acción de RULA (McAtamney y Corlett, 1993) se alinean con los
 * textos del Anexo C de la GTC 45 para «Postura»:
 *   7   «investigar y cambiar de inmediato»        → MA «deben tomarse medidas correctivas inmediatamente»
 *   5–6 «investigar y cambiar pronto»              → A  «modificar … tan pronto como sea posible»
 *   3–4 «investigar; pueden requerirse cambios»    → M  «modificación aunque no inmediata»
 *   1–2 «aceptable»                                → B  «no es necesaria ninguna acción»
 */
export function ndFromRula(score: number): NDValue {
  const s = Math.round(score);
  if (s >= 7) return 10;
  if (s >= 5) return 6;
  if (s >= 3) return 2;
  return 0;
}

/**
 * REBA → ND, con los niveles de acción de Hignett y McAtamney (2000):
 *   11–15 muy alto (actuación inmediata) → MA · 8–10 alto (pronto) → A · 4–7 medio (necesaria) → M
 *   1–3 inapreciable/bajo → B.  INCIERTO: REBA 2–3 dice «puede ser necesaria» la actuación y
 *   aquí se lleva a «Bajo»; el evaluador puede subirlo a «Medio».
 */
export function ndFromReba(score: number): NDValue {
  const s = Math.round(score);
  if (s >= 11) return 10;
  if (s >= 8) return 6;
  if (s >= 4) return 2;
  return 0;
}

const maxND = (a: NDValue, b: NDValue): NDValue => (a >= b ? a : b);

/** Postura: se toma el peor de los dos métodos, sobre los promedios de la sesión (postura mantenida). */
export function proposeNDPostura(rulaAvg: number, rebaAvg: number | null): Proposal<NDValue> {
  const byRula = ndFromRula(rulaAvg);
  let basis = `RULA prom. ${fmt1(rulaAvg)} → ND ${ndOption(byRula).label} (${byRula})`;
  if (rebaAvg == null) return { value: byRula, basis };
  const byReba = ndFromReba(rebaAvg);
  basis += `; REBA prom. ${fmt1(rebaAvg)} → ND ${ndOption(byReba).label} (${byReba}). Se toma el mayor.`;
  return { value: maxND(byRula, byReba), basis };
}

/**
 * Movimiento repetitivo según el Anexo C (VERIFICAR texto): «Alto» y «Muy alto» describen
 * movimientos rápidos y continuos de miembros superiores con «ciclos de trabajo menores a 30 s
 * ó 1 min»; «Medio» y «Bajo», movimientos lentos con pausas cortas o largas.
 * Con solo el tiempo de ciclo, Kronos propone:
 *   ciclo < 60 s → A (6)  · la diferencia con MA (ritmo «difícil de mantener», sin pausas) la decide el evaluador
 *   ciclo ≥ 60 s → M (2)  · «Bajo» exige saber que hay pausas largas, dato que Kronos no tiene
 *   sin dato     → M (2)  · marcado como «sin datos de ciclo»
 */
export const REPETITIVE_CYCLE_S = 60;

export function proposeNDRepetitivo(cycleSeconds: number | null | undefined): Proposal<NDValue> {
  if (cycleSeconds == null || !(cycleSeconds > 0)) {
    return { value: 2, basis: "Sin tiempo de ciclo: se propone Medio (2). Ajuste según el ritmo y las pausas observadas." };
  }
  if (cycleSeconds < REPETITIVE_CYCLE_S) {
    return { value: 6, basis: `Ciclo de ${fmt1(cycleSeconds)} s (< 1 min, Anexo C GTC 45) → Alto (6). Súbalo a Muy alto si el ritmo es difícil de mantener y no hay pausas.` };
  }
  return { value: 2, basis: `Ciclo de ${fmt1(cycleSeconds)} s (≥ 1 min) → Medio (2). Bájelo a Bajo si hay pausas largas.` };
}

/**
 * Iluminación: se usa la misma clasificación que el resto de Kronos (getLuxCompliance en
 * SSTContext, referencia 300–500 lux de la Res. 2400/1979 para trabajo fino):
 *   dentro de 300–500 → B (0) · 200–299 o 501–700 (advertencia) → M (2) · fuera de eso → A (6).
 * «Muy alto» no se propone a partir del lux: el Anexo C lo describe con sombras evidentes y
 * dificultad para leer, algo que solo puede juzgar quien observa el puesto.
 */
export function proposeNDIluminacion(avgLux: number): Proposal<NDValue> {
  const level = getLuxCompliance(avgLux);
  const ref = `${REGULATIONS.lux.min}–${REGULATIONS.lux.max} lux (${REGULATIONS.lux.label})`;
  if (level === "ok") return { value: 0, basis: `${Math.round(avgLux)} lux dentro de la referencia ${ref} → Bajo (0).` };
  if (level === "warning") return { value: 2, basis: `${Math.round(avgLux)} lux cerca de la referencia ${ref} → Medio (2).` };
  return { value: 6, basis: `${Math.round(avgLux)} lux lejos de la referencia ${ref} → Alto (6).` };
}

/**
 * Límite de la Res. 1792/1990 tal como lo usa Kronos (REGULATIONS en SSTContext) para las
 * horas de exposición: > 4 h → 85 dB; > 2 h → 90 dB; ≤ 2 h → 95 dB (no se extrapola por
 * debajo de 2 h porque esos valores no están en el código).
 */
export function noiseLimitForHours(hours: number): number {
  if (hours > 4) return REGULATIONS.db8h.max;
  if (hours > 2) return REGULATIONS.db4h.max;
  return REGULATIONS.db2h.max;
}

/**
 * Ruido (nivel equivalente LEQ de la zona):
 *   ≤ 80 dB → B (0) · 81–85 dB → M (2)  (mismos cortes que getDbCompliance)
 *   > 85 dB pero ≤ límite para las horas de exposición → A (6)
 *   > límite para las horas de exposición → MA (10)
 */
export function proposeNDRuido(leq: number, hours: number): Proposal<NDValue> {
  const level = getDbCompliance(leq);
  const limit = noiseLimitForHours(hours);
  const l = fmt1(leq);
  if (level === "ok") return { value: 0, basis: `LEQ ${l} dB ≤ 80 dB → Bajo (0).` };
  if (level === "warning") return { value: 2, basis: `LEQ ${l} dB entre 80 y ${REGULATIONS.db8h.max} dB → Medio (2).` };
  if (leq <= limit) return { value: 6, basis: `LEQ ${l} dB > ${REGULATIONS.db8h.max} dB, dentro del límite de ${limit} dB para ${fmt1(hours)} h (Res. 1792/1990) → Alto (6).` };
  return { value: 10, basis: `LEQ ${l} dB supera el límite de ${limit} dB para ${fmt1(hours)} h (Res. 1792/1990) → Muy alto (10).` };
}

/**
 * Horas de exposición en la jornada → NE. CONVENCIÓN DE KRONOS (la Tabla 3 es cualitativa):
 *   ≥ 4 h (media jornada o más) → Continua (4) · ≥ 2 h → Frecuente (3) · > 0 h → Ocasional (2)
 *   0 o sin dato → Esporádica (1).
 */
export function proposeNE(hours: number | null | undefined): Proposal<NEValue> {
  const h = hours ?? 0;
  if (h >= 4) return { value: 4, basis: `${fmt1(h)} h/jornada → Continua (4).` };
  if (h >= 2) return { value: 3, basis: `${fmt1(h)} h/jornada → Frecuente (3).` };
  if (h > 0) return { value: 2, basis: `${fmt1(h)} h/jornada → Ocasional (2).` };
  return { value: 1, basis: "Sin horas de exposición → Esporádica (1). Ajuste el valor." };
}

// ── Peligros cubiertos y controles sugeridos ────────────────────────────────

export type HazardKey = "postura" | "repetitivo" | "iluminacion" | "ruido";
export type ControlType = "eliminacion" | "sustitucion" | "ingenieria" | "administrativo" | "epp";

export const CONTROL_TYPES: ControlType[] = ["eliminacion", "sustitucion", "ingenieria", "administrativo", "epp"];

export const CONTROL_LABEL: Record<ControlType, string> = {
  eliminacion: "Eliminación",
  sustitucion: "Sustitución",
  ingenieria: "Controles de ingeniería",
  administrativo: "Controles administrativos",
  epp: "EPP",
};

export interface HazardInfo {
  clasificacion: "Biomecánico" | "Físico";
  descripcion: string;
  efectos: string;
  /** NC propuesto: CONVENCIÓN DE KRONOS (peor consecuencia razonable); el profesional lo valida. */
  ncDefault: NCValue;
  /** Norma citada ya en el código de Kronos; vacío si no hay una que el código respalde. */
  requisitoLegal: string;
  controles: Record<ControlType, string>;
}

export const HAZARDS: Record<HazardKey, HazardInfo> = {
  postura: {
    clasificacion: "Biomecánico",
    descripcion: "Postura (prolongada, mantenida, forzada)",
    efectos: "Desórdenes musculoesqueléticos de cuello, espalda y miembros superiores; fatiga muscular.",
    ncDefault: 25,
    requisitoLegal: "",
    controles: {
      eliminacion: "Rediseñar el método para eliminar el movimiento o la tarea que obliga a la postura forzada.",
      sustitucion: "Sustituir herramientas o útiles por otros que permitan trabajar con muñeca, cuello y tronco en posición neutra.",
      ingenieria: "Ajustar la altura de la superficie de trabajo, acercar los alcances, usar soportes o posicionadores de pieza.",
      administrativo: "Pausas activas, rotación de tareas, capacitación en higiene postural e inclusión en el PVE osteomuscular.",
      epp: "No aplica como control principal para el riesgo biomecánico.",
    },
  },
  repetitivo: {
    clasificacion: "Biomecánico",
    descripcion: "Movimiento repetitivo de miembros superiores",
    efectos: "Desórdenes musculoesqueléticos de miembro superior (p. ej., tendinitis, síndrome del túnel carpiano).",
    ncDefault: 25,
    requisitoLegal: "",
    controles: {
      eliminacion: "Eliminar operaciones que no agregan valor para reducir el número de movimientos por ciclo.",
      sustitucion: "Sustituir operaciones manuales por herramientas asistidas o automatizadas.",
      ingenieria: "Balancear la línea y rediseñar la estación para repartir los movimientos entre ambas manos y reducir alcances.",
      administrativo: "Pausas programadas, rotación entre tareas con distinta exigencia y seguimiento en el PVE osteomuscular.",
      epp: "No aplica como control principal para el riesgo biomecánico.",
    },
  },
  iluminacion: {
    clasificacion: "Físico",
    descripcion: "Iluminación (luz visible por deficiencia o exceso)",
    efectos: "Fatiga visual, cefalea y mayor probabilidad de errores e incidentes.",
    ncDefault: 10,
    requisitoLegal: REGULATIONS.lux.label,
    controles: {
      eliminacion: "No aplica habitualmente.",
      sustitucion: "Sustituir luminarias por otras de mayor rendimiento o temperatura de color adecuada a la tarea.",
      ingenieria: "Redistribuir luminarias, añadir iluminación localizada en el puesto y controlar deslumbramientos.",
      administrativo: "Programa de mantenimiento y limpieza de luminarias y mediciones periódicas de iluminancia.",
      epp: "No aplica.",
    },
  },
  ruido: {
    clasificacion: "Físico",
    descripcion: "Ruido (continuo o intermitente)",
    efectos: "Hipoacusia neurosensorial, interferencia en la comunicación, estrés y fatiga.",
    ncDefault: 60,
    requisitoLegal: REGULATIONS.db8h.label.replace(/ - 8h$/, ""),
    controles: {
      eliminacion: "Eliminar o reubicar la fuente de ruido lejos de los puestos ocupados.",
      sustitucion: "Sustituir equipos por otros de menor emisión sonora.",
      ingenieria: "Encerramientos, silenciadores, materiales absorbentes y mantenimiento de la fuente.",
      administrativo: "Limitar el tiempo de exposición, señalizar las zonas y hacer seguimiento auditivo según el criterio del médico laboral.",
      epp: "Protección auditiva seleccionada según el nivel medido, con entrenamiento en su uso.",
    },
  },
};

// ── Evaluaciones ergonómicas ────────────────────────────────────────────────

export type EvalOrigin = "vision-ai" | "manual";

export interface ErgoEvaluation {
  id: string;
  puesto: string;
  /** Vacío = anónimo. */
  operario: string;
  /** AAAA-MM-DD */
  fecha: string;
  rulaAvg: number;
  rulaMax: number;
  rebaAvg: number | null;
  rebaMax: number | null;
  /** Confianza ergonómica promedio 0–1 (null si no se midió). */
  confianza: number | null;
  vista: CameraView | "";
  notas: string;
  origen: EvalOrigin;
  muestras: number | null;
  /** Tiempo de ciclo de la tarea (s), para el peligro de movimiento repetitivo. */
  cicloSeg: number | null;
  /** Horas por jornada en la tarea evaluada. */
  horasExposicion: number;
  createdAt: string;
}

export interface SessionSummary {
  rulaAvg: number;
  rulaMax: number;
  rebaAvg: number | null;
  rebaMax: number | null;
  confianza: number | null;
  vista: CameraView | "";
  muestras: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Resume las muestras de una sesión de Vision AI para guardarla como evaluación. */
export function summarizeSnapshots(snaps: SessionSnapshot[]): SessionSummary | null {
  if (snaps.length === 0) return null;
  const rula = snaps.map((s) => s.rula);
  const reba = snaps.map((s) => s.reba).filter((v): v is number => typeof v === "number");
  const conf = snaps.map((s) => s.ergoConfidence).filter((v): v is number => typeof v === "number");
  const counts = new Map<CameraView, number>();
  for (const s of snaps) if (s.view) counts.set(s.view, (counts.get(s.view) ?? 0) + 1);
  // La vista «desconocida» solo gana si no hay ninguna otra.
  const known = [...counts.entries()].filter(([v]) => v !== "desconocida").sort((a, b) => b[1] - a[1]);
  const vista: CameraView | "" = known[0]?.[0] ?? (counts.has("desconocida") ? "desconocida" : "");
  return {
    rulaAvg: round1(avg(rula)),
    rulaMax: Math.max(...rula),
    rebaAvg: reba.length ? round1(avg(reba)) : null,
    rebaMax: reba.length ? Math.max(...reba) : null,
    confianza: conf.length ? Math.round(avg(conf) * 100) / 100 : null,
    vista,
    muestras: snaps.length,
  };
}

export const VIEW_LABEL: Record<CameraView | "", string> = {
  lateral: "Lateral",
  oblicua: "Oblicua",
  frontal: "Frontal",
  desconocida: "Desconocida",
  "": "—",
};

/** Mismos cortes que confidenceLevel() de VisionAI/ergonomics.ts. */
export function confidenceLabel(c: number | null): string {
  if (c == null) return "sin dato";
  const pct = `${Math.round(c * 100)} %`;
  if (c >= 0.6) return `${pct} (alta)`;
  if (c >= 0.35) return `${pct} (media)`;
  return `${pct} (baja)`;
}

// ── Matriz de peligros ──────────────────────────────────────────────────────

export interface MatrixOverride {
  nd?: NDValue;
  ne?: NEValue;
  nc?: NCValue;
  controlesExistentes?: string;
  expuestos?: number;
  requisitoLegal?: string;
  observaciones?: string;
  excluded?: boolean;
}

export interface MatrixRow extends RiskEvaluation {
  id: string;
  hazard: HazardKey;
  clasificacion: string;
  peligro: string;
  efectos: string;
  /** Puesto (biomecánicos) o zona (físicos). */
  lugar: string;
  fuente: string;
  ndBasis: string;
  neBasis: string;
  proposed: { nd: NDValue; ne: NEValue; nc: NCValue };
  nd: NDValue;
  ne: NEValue;
  nc: NCValue;
  controlesExistentes: string;
  expuestos: number;
  requisitoLegal: string;
  observaciones: string;
  excluded: boolean;
  /** true si el usuario cambió ND, NE o NC respecto a la propuesta. */
  edited: boolean;
  /** Confianza baja o sin dato en la evaluación de origen. */
  lowConfidence: boolean;
  controles: Record<ControlType, string>;
}

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sin-nombre";

export const rowId = (hazard: HazardKey, lugar: string) => `${hazard}:${slug(lugar)}`;

function makeRow(
  hazard: HazardKey, lugar: string, fuente: string,
  nd: Proposal<NDValue>, ne: Proposal<NEValue>, expuestos: number, lowConfidence: boolean,
  overrides: Record<string, MatrixOverride>,
): MatrixRow {
  const info = HAZARDS[hazard];
  const id = rowId(hazard, lugar);
  const o = overrides[id] ?? {};
  const proposed = { nd: nd.value, ne: ne.value, nc: info.ncDefault };
  const fnd = o.nd ?? proposed.nd;
  const fne = o.ne ?? proposed.ne;
  const fnc = o.nc ?? proposed.nc;
  return {
    id, hazard,
    clasificacion: info.clasificacion,
    peligro: info.descripcion,
    efectos: info.efectos,
    lugar, fuente,
    ndBasis: nd.basis, neBasis: ne.basis,
    proposed,
    nd: fnd, ne: fne, nc: fnc,
    ...evaluateRisk(fnd, fne, fnc),
    controlesExistentes: o.controlesExistentes ?? "",
    expuestos: o.expuestos ?? expuestos,
    requisitoLegal: o.requisitoLegal ?? info.requisitoLegal,
    observaciones: o.observaciones ?? "",
    excluded: o.excluded ?? false,
    edited: fnd !== proposed.nd || fne !== proposed.ne || fnc !== proposed.nc,
    lowConfidence,
    controles: info.controles,
  };
}

/** Evaluación más reciente de cada puesto (por fecha y luego por momento de registro). */
export function latestByPuesto(evals: ErgoEvaluation[]): ErgoEvaluation[] {
  const map = new Map<string, ErgoEvaluation>();
  for (const e of evals) {
    const k = slug(e.puesto);
    const cur = map.get(k);
    if (!cur || `${e.fecha}|${e.createdAt}` > `${cur.fecha}|${cur.createdAt}`) map.set(k, e);
  }
  return [...map.values()].sort((a, b) => a.puesto.localeCompare(b.puesto, "es"));
}

export interface ZoneSummary {
  zone: string;
  luxReadings: number;
  dbReadings: number;
  avgLux: number | null;
  avgDb: number | null;
  leq: number | null;
  avgHours: number;
  operators: number;
}

/** Agrupa las lecturas por zona. Las lecturas en 0 son de zonas que no miden esa magnitud. */
export function summarizeZones(readings: EnvironmentalReading[]): ZoneSummary[] {
  const zones = [...new Set(readings.map((r) => r.zone))];
  return zones.map((zone) => {
    const zr = readings.filter((r) => r.zone === zone);
    const lux = zr.filter((r) => r.lux > 0);
    const db = zr.filter((r) => r.db > 0);
    return {
      zone,
      luxReadings: lux.length,
      dbReadings: db.length,
      avgLux: lux.length ? avg(lux.map((r) => r.lux)) : null,
      avgDb: db.length ? avg(db.map((r) => r.db)) : null,
      leq: db.length ? calculateLEQ(db.map((r) => ({ db: r.db, exposureHours: r.exposureHours }))) : null,
      avgHours: zr.length ? avg(zr.map((r) => r.exposureHours)) : 0,
      operators: new Set(zr.map((r) => r.operatorId)).size,
    };
  });
}

export interface MatrixInput {
  evaluations: ErgoEvaluation[];
  readings: EnvironmentalReading[];
  overrides: Record<string, MatrixOverride>;
}

/** Construye la matriz: postura y movimiento repetitivo por puesto; iluminación y ruido por zona. */
export function buildMatrix({ evaluations, readings, overrides }: MatrixInput): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const e of latestByPuesto(evaluations)) {
    const fuente = `Evaluación ${e.origen === "vision-ai" ? "Vision AI" : "manual"} del ${e.fecha}` +
      (e.origen === "vision-ai" ? `, confianza ${confidenceLabel(e.confianza)}` : "");
    const low = e.origen === "vision-ai" && (e.confianza == null || e.confianza < 0.35);
    const ne = proposeNE(e.horasExposicion);
    rows.push(makeRow("postura", e.puesto, fuente, proposeNDPostura(e.rulaAvg, e.rebaAvg), ne, 1, low, overrides));
    rows.push(makeRow("repetitivo", e.puesto, fuente, proposeNDRepetitivo(e.cicloSeg), ne, 1, false, overrides));
  }
  for (const z of summarizeZones(readings)) {
    const ne = proposeNE(z.avgHours);
    const expuestos = Math.max(1, z.operators);
    if (z.avgLux != null) {
      rows.push(makeRow("iluminacion", z.zone, `${z.luxReadings} lectura(s) de iluminancia`, proposeNDIluminacion(z.avgLux), ne, expuestos, false, overrides));
    }
    if (z.leq != null) {
      rows.push(makeRow("ruido", z.zone, `${z.dbReadings} lectura(s) de nivel sonoro`, proposeNDRuido(z.leq, z.avgHours), ne, expuestos, false, overrides));
    }
  }
  return rows;
}

// ── Plan de acción ──────────────────────────────────────────────────────────

export type ActionStatus = "pendiente" | "en-curso" | "cerrada";

export const STATUS_LABEL: Record<ActionStatus, string> = {
  pendiente: "Pendiente",
  "en-curso": "En curso",
  cerrada: "Cerrada",
};

export interface ActionItem {
  id: string;
  accion: string;
  /** Peligro y puesto/zona, p. ej. «Ruido — Área de Ensamble». */
  peligro: string;
  tipoControl: ControlType;
  responsable: string;
  /** AAAA-MM-DD o vacío. */
  fechaLimite: string;
  estado: ActionStatus;
  /** Fila de la matriz que originó la acción. */
  origenFilaId?: string;
  nivelRiesgo?: NRLevel;
}

/**
 * Propone una acción por cada fila con NR I o II que aún no tenga acciones.
 * Se siembra con el control de ingeniería: en estos cuatro peligros la eliminación y la
 * sustitución rara vez son viables de inmediato, y el EPP es el último recurso.
 */
export function seedActionPlan(rows: MatrixRow[], plan: ActionItem[], newId: () => string): ActionItem[] {
  const seeded = new Set(plan.map((a) => a.origenFilaId).filter(Boolean));
  return rows
    .filter((r) => !r.excluded && (r.nrLevel === "I" || r.nrLevel === "II") && !seeded.has(r.id))
    .map((r) => ({
      id: newId(),
      accion: r.controles.ingenieria,
      peligro: `${r.peligro} — ${r.lugar}`,
      tipoControl: "ingenieria" as const,
      responsable: "",
      fechaLimite: "",
      estado: "pendiente" as const,
      origenFilaId: r.id,
      nivelRiesgo: r.nrLevel,
    }));
}

/** Actualiza el nivel de riesgo de las acciones con el de su fila de origen (si el usuario la editó después). */
export function withCurrentLevels(plan: ActionItem[], rows: MatrixRow[]): ActionItem[] {
  const level = new Map(rows.map((r) => [r.id, r.nrLevel]));
  return plan.map((a) => {
    const cur = a.origenFilaId ? level.get(a.origenFilaId) : undefined;
    return cur && cur !== a.nivelRiesgo ? { ...a, nivelRiesgo: cur } : a;
  });
}

// ── Exportación CSV (Excel en configuración regional de Colombia) ────────────

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Celda CSV con separador «;»:
 *  - números con coma decimal (Excel es-CO los lee como números);
 *  - texto que empieza por = + - @ (o tabulador/retorno) se antepone «'» para evitar la
 *    inyección de fórmulas (recomendación OWASP «CSV Injection»);
 *  - se encierra entre comillas si contiene ; " o saltos de línea, duplicando las comillas.
 */
export function csvCell(v: CsvValue): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV con BOM UTF-8 (para que Excel reconozca las tildes), «;» como separador y CRLF. */
export function toCSV(headers: string[], rows: CsvValue[][], preamble: string[] = []): string {
  const lines = [...preamble.map((p) => csvCell(p)), headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export const MATRIX_CSV_HEADERS = [
  "Proceso / zona / puesto", "Clasificación", "Peligro", "Efectos posibles", "Fuente de datos",
  "Controles existentes", "ND", "ND (interpretación)", "NE", "NE (interpretación)", "NP", "Interpretación NP",
  "NC", "NC (interpretación)", "NR", "Nivel de riesgo", "Aceptabilidad", "N.º expuestos",
  "Requisito legal asociado", "Eliminación", "Sustitución", "Controles de ingeniería",
  "Controles administrativos", "EPP", "Propuesta de ND (base)", "Propuesta de NE (base)", "Editado por el usuario", "Observaciones",
];

export function matrixToCSV(rows: MatrixRow[]): string {
  return toCSV(
    MATRIX_CSV_HEADERS,
    rows.filter((r) => !r.excluded).map((r) => [
      r.lugar, r.clasificacion, r.peligro, r.efectos, r.fuente, r.controlesExistentes,
      r.nd, ndOption(r.nd).label, r.ne, neOption(r.ne).label, r.np, NP_INTERPRETATION[r.npLevel].label,
      r.nc, ncOption(r.nc).label, r.nr, r.nrLevel, r.aceptabilidad, r.expuestos, r.requisitoLegal,
      r.controles.eliminacion, r.controles.sustitucion, r.controles.ingenieria, r.controles.administrativo, r.controles.epp,
      r.ndBasis, r.neBasis, r.edited, r.observaciones,
    ]),
    [`Matriz de peligros — metodología ${GTC45_SOURCE}`, SCOPE_NOTE],
  );
}

export const PLAN_CSV_HEADERS = ["Acción", "Peligro / puesto", "Tipo de control", "Nivel de riesgo", "Responsable", "Fecha límite", "Estado"];

export function planToCSV(plan: ActionItem[]): string {
  return toCSV(
    PLAN_CSV_HEADERS,
    plan.map((a) => [a.accion, a.peligro, CONTROL_LABEL[a.tipoControl], a.nivelRiesgo ?? "", a.responsable, a.fechaLimite, STATUS_LABEL[a.estado]]),
    ["Plan de acción SG-SST", SCOPE_NOTE],
  );
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Fecha local AAAA-MM-DD (toISOString daría el día UTC, que en Colombia cambia a las 7 p. m.). */
export function todayLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Tiempo de ciclo medio (s) del estudio de tiempos. Si se indica un operario y tiene ciclos,
 * se usan solo los suyos; si no, los de todo el estudio. null si no hay ciclos.
 */
export function meanCycleSeconds(cycles: { duration: number; operatorName?: string }[], operario = ""): number | null {
  const name = operario.trim().toLowerCase();
  const own = name ? cycles.filter((c) => (c.operatorName ?? "").trim().toLowerCase() === name) : [];
  const pool = (own.length ? own : cycles).filter((c) => c.duration > 0);
  return pool.length ? round1(avg(pool.map((c) => c.duration))) : null;
}
