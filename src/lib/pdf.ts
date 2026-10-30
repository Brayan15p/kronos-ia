/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import type jsPDF from "jspdf";

/** jspdf-autotable deja la última tabla dibujada en `doc.lastAutoTable`, pero no la tipa. */
type DocWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

/** Coordenada Y donde terminó la última tabla de autoTable (para seguir escribiendo debajo). */
export function lastTableY(doc: jsPDF): number {
  return (doc as DocWithAutoTable).lastAutoTable.finalY;
}
