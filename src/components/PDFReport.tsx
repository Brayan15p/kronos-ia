import React from "react";
import { FileDown, Lightbulb } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PDFReport: React.FC = () => {
  const { cycles, defects, qualityChecks, operators, costConfig } = useTimeStudy();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const generateSuggestions = () => {
    const suggestions: string[] = [];

    // Operator comparison
    if (operators.length >= 2) {
      const opAvgs = operators.map((op) => {
        const opCycles = cycles.filter((c) => c.operatorId === op.id);
        return { name: op.name, avg: opCycles.length > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / opCycles.length : 0, count: opCycles.length };
      }).filter((o) => o.count > 0);

      if (opAvgs.length >= 2) {
        const sorted = opAvgs.sort((a, b) => a.avg - b.avg);
        if (sorted[sorted.length - 1].avg - sorted[0].avg > 10) {
          suggestions.push(`${sorted[0].name} es el más eficiente. Programa shadowing para que los demás adopten sus técnicas.`);
        }
      }
    }

    // Quality
    const qualityRate = qualityChecks.length > 0
      ? (qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100 : 100;
    if (qualityRate < 80) {
      suggestions.push("Tasa de calidad por debajo del 80%. Implementar Poka-Yoke en los pasos con más defectos.");
    }

    // Defects
    if (defects.length > 0) {
      const typeMap = new Map<string, number>();
      defects.forEach((d) => typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1));
      const top = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1])[0];
      suggestions.push(`Defecto más frecuente: "${top[0]}" (${top[1]}x). Aplicar 5 Porqués para causa raíz.`);
    }

    // Step bottleneck
    const stepAvgs = CRANE_STEPS.map((step) => {
      const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
      return { ...step, avg: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0 };
    }).filter((s) => s.avg > 0);

    if (stepAvgs.length > 0) {
      const bottleneck = stepAvgs.reduce((max, s) => s.avg > max.avg ? s : max);
      suggestions.push(`Cuello de botella: Paso ${bottleneck.number} (${bottleneck.name}) — ${bottleneck.avg.toFixed(1)}s promedio. Priorizar mejora aquí.`);
    }

    // Cost
    const avgHourlyCost = operators.length > 0 ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length : 15000;
    const avgTime = cycles.length > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / cycles.length : 0;
    const excess = Math.max(0, avgTime - costConfig.targetCycleTime);
    if (excess > 0) {
      const monthlyLoss = excess * (avgHourlyCost / 3600) * costConfig.monthlyProductionTarget;
      suggestions.push(`Pérdida mensual estimada: $${(monthlyLoss / 1000).toFixed(0)}K COP por exceder el tiempo objetivo en ${excess.toFixed(1)}s/ciclo.`);
    }

    suggestions.push("Implementar ciclos PDCA para mejora continua. Medir → Analizar → Mejorar → Estandarizar.");
    return suggestions;
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(22);
    doc.setTextColor(0, 200, 220);
    doc.text("NEXORA.AI — Reporte de Inteligencia Industrial", pageWidth / 2, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text("Proceso: Grulla de Origami (12 pasos)", pageWidth / 2, 28, { align: "center" });
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-ES")} | Operarios: ${operators.length} | Ciclos: ${cycles.length}`, pageWidth / 2, 34, { align: "center" });

    let y = 45;

    // Summary
    const totalCycles = cycles.length;
    const avgTime = totalCycles > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / totalCycles : 0;
    const bestTime = totalCycles > 0 ? Math.min(...cycles.map((c) => c.duration)) : 0;
    const qualityRate = qualityChecks.length > 0
      ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100) : 0;

    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text("Resumen Ejecutivo", 14, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [["Métrica", "Valor"]],
      body: [
        ["Total Ciclos", totalCycles.toString()],
        ["Tiempo Promedio", formatTime(avgTime)],
        ["Mejor Tiempo", formatTime(bestTime)],
        ["Defectos", defects.length.toString()],
        ["Tasa Calidad", `${qualityRate}%`],
        ["Operarios", operators.length.toString()],
      ],
      theme: "striped",
      headStyles: { fillColor: [0, 180, 200] },
      styles: { fontSize: 9 },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // Cycles
    if (cycles.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.setTextColor(60, 60, 60);
      doc.text("Registro de Tiempos", 14, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [["#", "Operario", "Ciclo", "Pasos", "Tiempo Total", "Hora"]],
        body: cycles.map((c, i) => [
          (i + 1).toString(),
          c.operatorName,
          `#${c.cycleNumber}`,
          `${c.steps.length}/12`,
          formatTime(c.duration),
          c.timestamp.toLocaleTimeString("es-ES"),
        ]),
        theme: "striped",
        headStyles: { fillColor: [0, 180, 200] },
        styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Defects
    if (defects.length > 0) {
      if (y > 230) { doc.addPage(); y = 20; }
      doc.setFontSize(14);
      doc.text("Defectos", 14, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        head: [["Tipo", "Severidad", "Operario", "Descripción"]],
        body: defects.map((d) => [d.type, d.severity.toUpperCase(), `Op. ${d.operatorId}`, d.description || "-"]),
        theme: "striped",
        headStyles: { fillColor: [200, 60, 60] },
        styles: { fontSize: 8 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // Suggestions
    if (y > 210) { doc.addPage(); y = 20; }
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

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generado por NEXORA.AI — Industrial Intelligence Platform", pageWidth / 2, 290, { align: "center" });

    doc.save(`nexora_reporte_${new Date().toISOString().slice(0, 10)}.pdf`);
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
              <h3 className="font-display font-bold text-foreground">Reporte PDF Ejecutivo</h3>
              <p className="text-xs text-muted-foreground">Incluye tiempos, costos, calidad, defectos y sugerencias AI</p>
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

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-warning" />
            <h4 className="text-sm font-display font-bold text-foreground">Sugerencias de Mejora</h4>
          </div>
          {suggestions.map((s, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
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
