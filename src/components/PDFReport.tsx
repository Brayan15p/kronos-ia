import React from "react";
import { FileDown, Lightbulb } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type for autotable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: Record<string, unknown>) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const PDFReport: React.FC = () => {
  const { cycles, defects, qualityChecks } = useTimeStudy();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const generateSuggestions = () => {
    const suggestions: string[] = [];
    const op1 = cycles.filter((c) => c.operatorId === 1);
    const op2 = cycles.filter((c) => c.operatorId === 2);
    const op1Avg = op1.length > 0 ? op1.reduce((s, c) => s + c.duration, 0) / op1.length : 0;
    const op2Avg = op2.length > 0 ? op2.reduce((s, c) => s + c.duration, 0) / op2.length : 0;
    const qualityRate = qualityChecks.length > 0
      ? (qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100
      : 100;

    if (Math.abs(op1Avg - op2Avg) > 10) {
      const faster = op1Avg < op2Avg ? "Operario 1" : "Operario 2";
      const slower = op1Avg >= op2Avg ? "Operario 1" : "Operario 2";
      suggestions.push(
        `${faster} es significativamente más rápido. Se recomienda que ${faster} capacite a ${slower} en su técnica de plegado.`
      );
    }

    if (qualityRate < 80) {
      suggestions.push(
        "La tasa de calidad está por debajo del 80%. Se recomienda implementar un estándar visual (poka-yoke) para guiar los pliegues críticos."
      );
    }

    if (defects.length > 0) {
      const defectMap = new Map<string, number>();
      defects.forEach((d) => defectMap.set(d.type, (defectMap.get(d.type) ?? 0) + 1));
      const topDefect = Array.from(defectMap.entries()).sort((a, b) => b[1] - a[1])[0];
      suggestions.push(
        `El defecto más frecuente es "${topDefect[0]}" (${topDefect[1]} ocurrencias). Aplicar análisis de causa raíz (5 por qués) para eliminarlo.`
      );
    }

    const allTimes = cycles.map((c) => c.duration);
    if (allTimes.length >= 3) {
      const stdDev = Math.sqrt(allTimes.reduce((s, t) => s + Math.pow(t - (allTimes.reduce((a, b) => a + b, 0) / allTimes.length), 2), 0) / allTimes.length);
      if (stdDev > 5) {
        suggestions.push(
          `Alta variabilidad en tiempos (σ=${stdDev.toFixed(1)}s). Estandarizar el método de trabajo con instrucciones paso a paso.`
        );
      }
    }

    if (cycles.length > 3) {
      const last3 = cycles.slice(-3);
      const first3 = cycles.slice(0, 3);
      const last3Avg = last3.reduce((s, c) => s + c.duration, 0) / 3;
      const first3Avg = first3.reduce((s, c) => s + c.duration, 0) / 3;
      if (last3Avg < first3Avg) {
        suggestions.push(
          "Se observa una tendencia de mejora (curva de aprendizaje). Continuar con la práctica para consolidar los tiempos."
        );
      }
    }

    suggestions.push(
      "Implementar ciclos PDCA (Planificar-Hacer-Verificar-Actuar) para mejora continua del proceso de plegado."
    );

    return suggestions;
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(0, 188, 175);
    doc.text("Reporte de Estudio de Tiempos", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Proceso: Fabricación de Grulla de Origami`, pageWidth / 2, 28, { align: "center" });
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-ES")}`, pageWidth / 2, 34, { align: "center" });

    let y = 45;

    // Summary
    const totalCycles = cycles.length;
    const avgTime = totalCycles > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / totalCycles : 0;
    const bestTime = totalCycles > 0 ? Math.min(...cycles.map((c) => c.duration)) : 0;
    const qualityRate = qualityChecks.length > 0
      ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100)
      : 0;

    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text("Resumen Ejecutivo", 14, y);
    y += 8;

    doc.autoTable({
      startY: y,
      head: [["Métrica", "Valor"]],
      body: [
        ["Total de Ciclos", totalCycles.toString()],
        ["Tiempo Promedio", formatTime(avgTime)],
        ["Mejor Tiempo", formatTime(bestTime)],
        ["Total Defectos", defects.length.toString()],
        ["Tasa de Calidad", `${qualityRate}%`],
        ["Inspecciones Realizadas", qualityChecks.length.toString()],
      ],
      theme: "striped",
      headStyles: { fillColor: [0, 160, 150] },
      styles: { fontSize: 9 },
    });

    y = doc.lastAutoTable.finalY + 12;

    // Cycles table
    if (cycles.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("Registro de Tiempos", 14, y);
      y += 8;

      doc.autoTable({
        startY: y,
        head: [["#", "Operario", "Ciclo", "Tiempo", "Hora"]],
        body: cycles.map((c, i) => [
          (i + 1).toString(),
          c.operatorName,
          `#${c.cycleNumber}`,
          formatTime(c.duration),
          c.timestamp.toLocaleTimeString("es-ES"),
        ]),
        theme: "striped",
        headStyles: { fillColor: [0, 160, 150] },
        styles: { fontSize: 8 },
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // Defects
    if (defects.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("Registro de Defectos", 14, y);
      y += 8;

      doc.autoTable({
        startY: y,
        head: [["Tipo", "Severidad", "Operario", "Descripción"]],
        body: defects.map((d) => [d.type, d.severity.toUpperCase(), `Op. ${d.operatorId}`, d.description || "-"]),
        theme: "striped",
        headStyles: { fillColor: [200, 60, 60] },
        styles: { fontSize: 8 },
      });

      y = doc.lastAutoTable.finalY + 12;
    }

    // Suggestions
    if (y > 220) { doc.addPage(); y = 20; }
    const suggestions = generateSuggestions();
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text("Sugerencias de Mejora Continua", 14, y);
    y += 8;

    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    suggestions.forEach((s, i) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const lines = doc.splitTextToSize(`${i + 1}. ${s}`, pageWidth - 28);
      doc.text(lines, 14, y);
      y += lines.length * 5 + 3;
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generado por TimeStudy App - Mejora Continua", pageWidth / 2, 290, { align: "center" });

    doc.save(`reporte_tiempos_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const suggestions = generateSuggestions();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
              <FileDown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Generar Reporte PDF</h3>
              <p className="text-xs text-muted-foreground">Incluye tiempos, calidad, defectos y sugerencias</p>
            </div>
          </div>
          <button
            onClick={generatePDF}
            disabled={cycles.length === 0}
            className="btn-primary-glass flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" /> Descargar PDF
          </button>
        </div>

        {/* Preview suggestions */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-warning" />
            <h4 className="text-sm font-semibold text-foreground">Sugerencias de Mejora</h4>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
              <span className="text-xs font-mono text-primary font-bold mt-0.5">{i + 1}.</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PDFReport;
