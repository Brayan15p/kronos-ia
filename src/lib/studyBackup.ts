/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import type {
  CostConfig, CycleRecord, DefectRecord, OperatorConfig, QualityCheck, StepConfig,
} from "@/context/TimeStudyContext";

/** Estudio completo tal como se guarda y se exporta. */
export interface StudyData {
  steps: StepConfig[];
  operators: OperatorConfig[];
  cycles: CycleRecord[];
  defects: DefectRecord[];
  qualityChecks: QualityCheck[];
  costConfig: CostConfig;
}

const FORMAT = "kronos-study";
const VERSION = 1;

export class StudyBackupError extends Error {}

/** Serializa el estudio a un JSON versionado, para respaldo o para llevarlo a otro equipo. */
export function serializeStudy(data: StudyData, now = new Date()): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: now.toISOString(), data }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const toDate = (v: unknown): Date => {
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new StudyBackupError("Fecha inválida en el archivo.");
  return d;
};

/**
 * Lee un respaldo (o el estado guardado en el navegador) y revive las fechas.
 * Valida la forma básica para no cargar un archivo ajeno o dañado.
 */
export function parseStudy(json: string): StudyData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new StudyBackupError("El archivo no es un JSON válido.");
  }
  if (!isObj(raw)) throw new StudyBackupError("Formato de respaldo no reconocido.");
  // Acepta el archivo exportado ({format, data}) o el estado plano guardado en el navegador.
  if (raw.format !== undefined && raw.format !== FORMAT) {
    throw new StudyBackupError("El archivo no es un respaldo de Kronos.");
  }
  if (typeof raw.version === "number" && raw.version > VERSION) {
    throw new StudyBackupError("El respaldo es de una versión más nueva de Kronos.");
  }
  const d = isObj(raw.data) ? raw.data : raw;

  for (const key of ["steps", "operators", "cycles", "defects", "qualityChecks"] as const) {
    if (!Array.isArray(d[key])) throw new StudyBackupError(`Falta la sección "${key}" en el respaldo.`);
  }
  if (!isObj(d.costConfig)) throw new StudyBackupError('Falta la sección "costConfig" en el respaldo.');

  const cycles = (d.cycles as CycleRecord[]).map((c) => ({
    ...c,
    timestamp: toDate(c.timestamp),
    steps: Array.isArray(c.steps) ? c.steps.map((s) => ({ ...s, timestamp: toDate(s.timestamp) })) : [],
  }));

  return {
    steps: d.steps as StepConfig[],
    operators: d.operators as OperatorConfig[],
    cycles,
    defects: (d.defects as DefectRecord[]).map((x) => ({ ...x, timestamp: toDate(x.timestamp) })),
    qualityChecks: (d.qualityChecks as QualityCheck[]).map((x) => ({ ...x, timestamp: toDate(x.timestamp) })),
    costConfig: d.costConfig as unknown as CostConfig,
  };
}
