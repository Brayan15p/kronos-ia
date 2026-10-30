/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import type { StepConfig } from "@/context/TimeStudyContext";

export interface ProcessTemplate {
  id: string;
  name: string;
  sector: string;
  /** Tiempo de ciclo objetivo de referencia (s). Es orientativo: cada planta debe ajustarlo. */
  targetCycleTime: number;
  steps: StepConfig[];
}

const numbered = (steps: [string, string][]): StepConfig[] =>
  steps.map(([emoji, name], i) => ({ number: i + 1, name, emoji }));

/** Plantillas de procesos manuales típicos para arrancar un estudio sin configurar desde cero. */
export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: "origami",
    name: "Grulla de origami (demo)",
    sector: "Didáctico",
    targetCycleTime: 120,
    steps: numbered([
      ["✂️", "Corte del papel"],
      ["📐", "Primer pliegue diagonal"],
      ["📐", "Segundo pliegue diagonal"],
      ["🔲", "Pliegue base cuadrada"],
      ["🔺", "Pliegues laterales sup."],
      ["🌸", "Pliegue pétalo superior"],
      ["🔻", "Pliegues laterales inf."],
      ["🌸", "Pliegue pétalo inferior"],
      ["🦢", "Formación del cuello"],
      ["🪶", "Formación de la cola"],
      ["👑", "Formación de la cabeza"],
      ["🕊️", "Apertura de alas"],
    ]),
  },
  {
    id: "confeccion-camiseta",
    name: "Camiseta básica",
    sector: "Confección",
    targetCycleTime: 330,
    steps: numbered([
      ["🧵", "Unir hombros"],
      ["🧵", "Pegar cuello"],
      ["📏", "Pespuntar cuello"],
      ["👕", "Pegar mangas"],
      ["🧵", "Cerrar costados"],
      ["📏", "Dobladillo de mangas"],
      ["📏", "Dobladillo de ruedo"],
      ["🏷️", "Pegar etiqueta"],
      ["🔍", "Revisión y corte de hilos"],
    ]),
  },
  {
    id: "ensamble-electronico",
    name: "Ensamble de módulo electrónico",
    sector: "Ensamble",
    targetCycleTime: 90,
    steps: numbered([
      ["📦", "Tomar carcasa"],
      ["🔌", "Insertar tarjeta (PCB)"],
      ["🔌", "Conectar cableado"],
      ["🪛", "Atornillar (4 tornillos)"],
      ["🔲", "Colocar tapa"],
      ["🧪", "Prueba funcional"],
      ["🏷️", "Etiquetar"],
    ]),
  },
  {
    id: "empaque-pedidos",
    name: "Alistamiento y empaque de pedidos",
    sector: "Logística",
    targetCycleTime: 60,
    steps: numbered([
      ["📦", "Armar caja"],
      ["🔍", "Escanear producto"],
      ["📦", "Colocar producto"],
      ["🧰", "Agregar relleno"],
      ["✅", "Cerrar y sellar"],
      ["🏷️", "Etiquetar guía"],
      ["📋", "Paletizar"],
    ]),
  },
];

export const TEMPLATE_EMOJIS = [...new Set(PROCESS_TEMPLATES.flatMap((t) => t.steps.map((s) => s.emoji)))];
