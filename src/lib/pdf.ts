/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import type jsPDF from "jspdf";

/** jspdf-autotable deja la última tabla dibujada en `doc.lastAutoTable`, pero no la tipa. */
type DocWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

/** Coordenada Y donde terminó la última tabla de autoTable (para seguir escribiendo debajo). */
export function lastTableY(doc: jsPDF): number {
  return (doc as DocWithAutoTable).lastAutoTable.finalY;
}

// Las fuentes estándar de jsPDF (Helvetica, WinAnsi) no tienen flechas ni símbolos matemáticos:
// sin reemplazo salen como caracteres basura en el PDF.
const PDF_REPLACEMENTS: [RegExp, string][] = [
  [/→/g, "->"], [/←/g, "<-"], [/≥/g, ">="], [/≤/g, "<="], [/≠/g, "!="], [/−/g, "-"],
  [/≈/g, "~"], [/√/g, "raíz "], [/[²]/g, "2"], [/✅|✔/g, "OK"], [/⚠️?/g, "!"],
];

/** Reemplaza los caracteres que las fuentes estándar de jsPDF no pueden dibujar. */
export function pdfSafeText(s: string): string {
  return PDF_REPLACEMENTS.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

/**
 * Aplica pdfSafeText a todo el texto del documento, incluido el de las tablas de autoTable
 * (que dibuja y parte las líneas con doc.text y doc.splitTextToSize).
 */
export function withPdfSafeText<T extends jsPDF>(doc: T): T {
  const clean = (t: unknown): unknown =>
    typeof t === "string" ? pdfSafeText(t) : Array.isArray(t) ? t.map(clean) : t;
  const text = doc.text.bind(doc);
  const split = doc.splitTextToSize.bind(doc);
  doc.text = ((t: unknown, ...rest: unknown[]) => text(clean(t) as string, ...(rest as [number, number]))) as T["text"];
  // autoTable también le pasa listas de líneas, no solo texto.
  doc.splitTextToSize = ((t: unknown, ...rest: unknown[]) => split(clean(t) as string, ...(rest as [number]))) as T["splitTextToSize"];
  return doc;
}
