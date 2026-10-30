/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import type { NRLevel } from "@/lib/sgsst";

/** Colores por nivel de riesgo GTC 45 (I crítico … IV aceptable). */
export const NR_STYLE: Record<NRLevel, string> = {
  I: "bg-red-500/15 border-red-500/40 text-red-300",
  II: "bg-orange-500/15 border-orange-500/40 text-orange-300",
  III: "bg-yellow-500/15 border-yellow-500/40 text-yellow-200",
  IV: "bg-green-500/15 border-green-500/40 text-green-300",
};
