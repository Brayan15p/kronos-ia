/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { pdfSafeText, withPdfSafeText } from "@/lib/pdf";

describe("texto seguro para PDF", () => {
  it("reemplaza lo que Helvetica no puede dibujar y conserva tildes, ñ y guiones", () => {
    expect(pdfSafeText("RULA 7 → ND ≥ 6, NR ≤ 20, 85 − 5")).toBe("RULA 7 -> ND >= 6, NR <= 20, 85 - 5");
    expect(pdfSafeText("✅ Aceptable · ⚠️ Revisar")).toBe("OK Aceptable · ! Revisar");
    expect(pdfSafeText("Ñandú – evaluación — día")).toBe("Ñandú – evaluación — día");
  });

  it("limpia el texto que llega a doc.text, también el de las tablas", () => {
    const doc = new jsPDF();
    const drawn: string[] = [];
    // Registro por debajo del envoltorio: lo que realmente se escribe en el PDF.
    const real = doc.text.bind(doc);
    doc.text = ((t: string | string[], ...rest: unknown[]) => {
      drawn.push(...(Array.isArray(t) ? t : [t]));
      return (real as (...a: unknown[]) => jsPDF)(t, ...rest);
    }) as typeof doc.text;
    withPdfSafeText(doc);

    doc.text("Nivel I → suspender", 10, 10);
    doc.text(["≥ 360", "ok"], 10, 20);
    doc.text(doc.splitTextToSize("Postura RULA 7 → ND muy alto ≥ 10", 40), 10, 30);
    autoTable(doc, { head: [["Regla"]], body: [["RULA 7 → ND 10"]] });

    expect(drawn.join(" ")).not.toMatch(/[→≥≤]/);
    expect(drawn).toContain("Nivel I -> suspender");
    expect(drawn).toContain(">= 360");
    expect(drawn.some((t) => t.includes("RULA 7 -> ND 10"))).toBe(true);
  });
});
