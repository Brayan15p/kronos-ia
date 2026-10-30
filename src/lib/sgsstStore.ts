/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Almacén del Paquete SG-SST (evaluaciones, ajustes de la matriz, plan de acción y portada).
 *
 * Vive en su propia clave de localStorage y no toca la de SSTContext (`kronos_sst_v1`), así que
 * los datos ambientales ya guardados siguen cargando igual. Es un store externo
 * (useSyncExternalStore) y no un Context: Vision AI y el módulo SG-SST lo comparten sin
 * necesidad de envolver la app en otro proveedor.
 */
import { useSyncExternalStore } from "react";
import {
  isNC, isND, isNE, CONTROL_TYPES,
  type ActionItem, type ActionStatus, type ControlType, type ErgoEvaluation, type ExpertValidation, type MatrixOverride, type NRLevel,
} from "@/lib/sgsst";
import type { CameraView } from "@/components/VisionAI/types";

export const SGSST_STORAGE_KEY = "kronos_sgsst_v1";
export const SGSST_VERSION = 1;

export interface CoverInfo {
  empresa: string;
  planta: string;
  responsable: string;
  /** AAAA-MM-DD */
  fecha: string;
}

export interface SGSSTState {
  version: number;
  cover: CoverInfo;
  evaluations: ErgoEvaluation[];
  matrixOverrides: Record<string, MatrixOverride>;
  plan: ActionItem[];
}

export const emptyCover = (): CoverInfo => ({ empresa: "", planta: "", responsable: "", fecha: "" });

export const emptyState = (): SGSSTState => ({
  version: SGSST_VERSION,
  cover: emptyCover(),
  evaluations: [],
  matrixOverrides: {},
  plan: [],
});

// ── Lectura tolerante: datos viejos, incompletos o dañados nunca rompen el módulo ──

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const VIEWS: (CameraView | "")[] = ["lateral", "oblicua", "frontal", "desconocida", ""];
const STATUSES: ActionStatus[] = ["pendiente", "en-curso", "cerrada"];
const NR_LEVELS: NRLevel[] = ["I", "II", "III", "IV"];

const inRange = (v: unknown, lo: number, hi: number): number | null => {
  const n = num(v);
  return n != null && n >= lo && n <= hi ? n : null;
};

/** Revisión del experto: si falta o está dañada se descarta (la evaluación sigue cargando sin ella). */
export function parseExpertValidation(v: unknown): ExpertValidation | null {
  if (!isObj(v)) return null;
  const rula = inRange(v.rula, 1, 7);
  const reba = inRange(v.reba, 1, 15);
  if (rula == null || reba == null) return null;
  return {
    rula,
    reba,
    rulaCamara: inRange(v.rulaCamara, 1, 7),
    rebaCamara: inRange(v.rebaCamara, 1, 15),
    revisor: str(v.revisor),
    fecha: str(v.fecha),
    nota: str(v.nota),
    campos: Array.isArray(v.campos) ? v.campos.filter((c): c is string => typeof c === "string") : [],
  };
}

function parseEvaluation(v: unknown): ErgoEvaluation | null {
  if (!isObj(v)) return null;
  const rulaAvg = num(v.rulaAvg);
  if (!str(v.id) || !str(v.puesto).trim() || rulaAvg == null) return null;
  const vista = str(v.vista) as CameraView | "";
  const experto = parseExpertValidation(v.experto);
  return {
    id: str(v.id),
    puesto: str(v.puesto),
    operario: str(v.operario),
    fecha: str(v.fecha),
    rulaAvg,
    rulaMax: num(v.rulaMax) ?? rulaAvg,
    rebaAvg: num(v.rebaAvg),
    rebaMax: num(v.rebaMax) ?? num(v.rebaAvg),
    confianza: num(v.confianza),
    vista: VIEWS.includes(vista) ? vista : "",
    notas: str(v.notas),
    origen: v.origen === "vision-ai" ? "vision-ai" : "manual",
    muestras: num(v.muestras),
    cicloSeg: num(v.cicloSeg),
    horasExposicion: num(v.horasExposicion) ?? 8,
    createdAt: str(v.createdAt),
    // Solo se añade si existe: las evaluaciones antiguas quedan idénticas a como se guardaron.
    ...(experto ? { experto } : {}),
  };
}

function parseOverride(v: unknown): MatrixOverride | null {
  if (!isObj(v)) return null;
  const o: MatrixOverride = {};
  if (isND(v.nd)) o.nd = v.nd;
  if (isNE(v.ne)) o.ne = v.ne;
  if (isNC(v.nc)) o.nc = v.nc;
  if (typeof v.controlesExistentes === "string") o.controlesExistentes = v.controlesExistentes;
  const exp = num(v.expuestos);
  if (exp != null && exp >= 0) o.expuestos = Math.round(exp);
  if (typeof v.requisitoLegal === "string") o.requisitoLegal = v.requisitoLegal;
  if (typeof v.observaciones === "string") o.observaciones = v.observaciones;
  if (typeof v.excluded === "boolean") o.excluded = v.excluded;
  return o;
}

function parseAction(v: unknown): ActionItem | null {
  if (!isObj(v) || !str(v.id)) return null;
  const tipo = str(v.tipoControl) as ControlType;
  const estado = str(v.estado) as ActionStatus;
  const nivel = str(v.nivelRiesgo) as NRLevel;
  const a: ActionItem = {
    id: str(v.id),
    accion: str(v.accion),
    peligro: str(v.peligro),
    tipoControl: CONTROL_TYPES.includes(tipo) ? tipo : "administrativo",
    responsable: str(v.responsable),
    fechaLimite: str(v.fechaLimite),
    estado: STATUSES.includes(estado) ? estado : "pendiente",
  };
  if (typeof v.origenFilaId === "string") a.origenFilaId = v.origenFilaId;
  if (NR_LEVELS.includes(nivel)) a.nivelRiesgo = nivel;
  return a;
}

/** Convierte lo guardado (de cualquier versión anterior o incompleto) al estado actual. */
export function parseSGSST(raw: string | null): SGSSTState {
  if (!raw) return emptyState();
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (!isObj(d)) return emptyState();
  const cover = isObj(d.cover) ? d.cover : {};
  const overrides: Record<string, MatrixOverride> = {};
  if (isObj(d.matrixOverrides)) {
    for (const [k, v] of Object.entries(d.matrixOverrides)) {
      const o = parseOverride(v);
      if (o) overrides[k] = o;
    }
  }
  const list = <T,>(v: unknown, f: (x: unknown) => T | null): T[] =>
    Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : [];
  return {
    version: SGSST_VERSION,
    cover: {
      empresa: str(cover.empresa),
      planta: str(cover.planta),
      responsable: str(cover.responsable),
      fecha: str(cover.fecha),
    },
    evaluations: list(d.evaluations, parseEvaluation),
    matrixOverrides: overrides,
    plan: list(d.plan, parseAction),
  };
}

// ── Store externo ───────────────────────────────────────────────────────────

function readStorage(): string | null {
  try {
    return localStorage.getItem(SGSST_STORAGE_KEY);
  } catch {
    return null;
  }
}

let state: SGSSTState = parseSGSST(readStorage());
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getSGSST = (): SGSSTState => state;

export function setSGSST(update: (s: SGSSTState) => SGSSTState): void {
  state = update(state);
  try {
    localStorage.setItem(SGSST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento no disponible: el estado sigue en memoria */
  }
  emit();
}

/** Vuelve a leer localStorage (otra pestaña cambió los datos, o en pruebas). */
export function reloadSGSST(): void {
  state = parseSGSST(readStorage());
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SGSST_STORAGE_KEY) reloadSGSST();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Acciones (funciones puras sobre el store, usables también fuera de React).
export const sgsstActions = {
  setCover: (patch: Partial<CoverInfo>) => setSGSST((s) => ({ ...s, cover: { ...s.cover, ...patch } })),
  addEvaluation: (e: ErgoEvaluation) => setSGSST((s) => ({ ...s, evaluations: [...s.evaluations, e] })),
  updateEvaluation: (id: string, patch: Partial<ErgoEvaluation>) =>
    setSGSST((s) => ({ ...s, evaluations: s.evaluations.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
  removeEvaluation: (id: string) => setSGSST((s) => ({ ...s, evaluations: s.evaluations.filter((e) => e.id !== id) })),
  setOverride: (rowId: string, patch: MatrixOverride) =>
    setSGSST((s) => ({ ...s, matrixOverrides: { ...s.matrixOverrides, [rowId]: { ...s.matrixOverrides[rowId], ...patch } } })),
  resetRiskOverride: (rowId: string) =>
    setSGSST((s) => {
      const { nd: _nd, ne: _ne, nc: _nc, ...rest } = s.matrixOverrides[rowId] ?? {};
      return { ...s, matrixOverrides: { ...s.matrixOverrides, [rowId]: rest } };
    }),
  addActions: (items: ActionItem[]) => setSGSST((s) => ({ ...s, plan: [...s.plan, ...items] })),
  updateAction: (id: string, patch: Partial<ActionItem>) =>
    setSGSST((s) => ({ ...s, plan: s.plan.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  removeAction: (id: string) => setSGSST((s) => ({ ...s, plan: s.plan.filter((a) => a.id !== id) })),
};

/** Estado del Paquete SG-SST, sincronizado entre componentes y pestañas del navegador. */
export function useSGSST(): SGSSTState {
  return useSyncExternalStore(subscribe, getSGSST, getSGSST);
}
