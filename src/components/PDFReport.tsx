import React from "react";
import { FileDown, Lightbulb } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PDFReport: React.FC = () => {
  const { cycles, defects, qualityChecks, operators, costConfig, steps } = useTimeStudy();
  const CRANE_STEPS = steps;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const generateSuggestions = () => {
    const suggestions: string[] = [];

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

    const qualityRate = qualityChecks.length > 0
      ? (qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100 : 100;
    if (qualityRate < 80) {
      suggestions.push("Tasa de calidad por debajo del 80%. Implementar Poka-Yoke en los pasos con más defectos.");
    }

    if (defects.length > 0) {
      const typeMap = new Map<string, number>();
      defects.forEach((d) => typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1));
      const top = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1])[0];
      suggestions.push(`Defecto más frecuente: "${top[0]}" (${top[1]}x). Aplicar 5 Porqués para causa raíz.`);
    }

    const stepAvgs = CRANE_STEPS.map((step) => {
      const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
      return { ...step, avg: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0 };
    }).filter((s) => s.avg > 0);

    if (stepAvgs.length > 0) {
      const bottleneck = stepAvgs.reduce((max, s) => s.avg > max.avg ? s : max);
      suggestions.push(`Cuello de botella: Paso ${bottleneck.number} (${bottleneck.name}) — ${bottleneck.avg.toFixed(1)}s promedio. Priorizar mejora aquí.`);
    }

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

  // ───────────────────────── Paleta corporativa ─────────────────────────
  type RGB = [number, number, number];
  const C_BRAND: RGB = [0, 180, 200];
  const C_GREEN: RGB = [46, 204, 113];
  const C_RED: RGB = [231, 76, 60];
  const C_AMBER: RGB = [243, 156, 18];
  const C_TEXT: RGB = [90, 90, 90];
  const C_GRID: RGB = [225, 225, 225];
  const C_TRACK: RGB = [235, 238, 240];
  const C_DARK: RGB = [55, 65, 70];

  // ───────────────────────── Helpers de dibujo nativo ─────────────────────────

  /** Tarjeta con franja de color superior, título y número grande. */
  const drawStatCard = (
    doc: jsPDF, x: number, y: number, w: number, h: number,
    titulo: string, valor: string, color: RGB,
  ) => {
    doc.setFillColor(250, 251, 252);
    doc.setDrawColor(C_GRID[0], C_GRID[1], C_GRID[2]);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
    // franja de color
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x, y, w, 3, 1.5, 1.5, "F");
    doc.rect(x, y + 1.5, w, 1.5, "F");
    // título
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
    doc.text(titulo.toUpperCase(), x + w / 2, y + 9, { align: "center" });
    // valor grande
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(valor, x + w / 2, y + h - 5.5, { align: "center" });
    doc.setFont("helvetica", "normal");
  };

  /** Barra de progreso horizontal con porcentaje. */
  const drawProgressBar = (
    doc: jsPDF, x: number, y: number, w: number, pct: number, color: RGB, label?: string,
  ) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const h = 6;
    doc.setFillColor(C_TRACK[0], C_TRACK[1], C_TRACK[2]);
    doc.roundedRect(x, y, w, h, 3, 3, "F");
    if (clamped > 0) {
      doc.setFillColor(color[0], color[1], color[2]);
      const fw = Math.max((w * clamped) / 100, 3);
      doc.roundedRect(x, y, fw, h, 3, 3, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${Math.round(clamped)}%`, x + w + 3, y + 4.6);
    if (label) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      doc.text(label, x, y - 2);
    }
    doc.setFont("helvetica", "normal");
  };

  /** Medidor semicircular (gauge) para la tasa de calidad. */
  const drawGauge = (
    doc: jsPDF, cx: number, cy: number, r: number, pct: number, color: RGB, label: string,
  ) => {
    const clamped = Math.max(0, Math.min(100, pct));
    // arco de fondo (track) aproximado con segmentos
    const drawArc = (from: number, to: number, col: RGB, lw: number) => {
      doc.setDrawColor(col[0], col[1], col[2]);
      doc.setLineWidth(lw);
      const segs = 40;
      let prevX = cx + r * Math.cos(from);
      let prevY = cy - r * Math.sin(from);
      for (let i = 1; i <= segs; i++) {
        const t = from + ((to - from) * i) / segs;
        const px = cx + r * Math.cos(t);
        const py = cy - r * Math.sin(t);
        doc.line(prevX, prevY, px, py);
        prevX = px; prevY = py;
      }
    };
    drawArc(Math.PI, 0, C_TRACK, 3);
    const end = Math.PI - (Math.PI * clamped) / 100;
    drawArc(Math.PI, end, color, 3);
    doc.setLineWidth(0.2);
    // valor central
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${Math.round(clamped)}%`, cx, cy - 1, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
    doc.text(label, cx, cy + 5, { align: "center" });
  };

  /** Gráfico de barras verticales con ejes, etiquetas y resaltado de un índice. */
  const drawBarChart = (
    doc: jsPDF, x: number, y: number, w: number, h: number,
    data: { label: string; value: number; color?: RGB }[],
    opts?: { highlightIndex?: number; highlightColor?: RGB; baseColor?: RGB; unit?: string },
  ) => {
    if (data.length === 0) return;
    const baseColor = opts?.baseColor ?? C_BRAND;
    const highlightColor = opts?.highlightColor ?? C_RED;
    const unit = opts?.unit ?? "s";
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const padLeft = 4;
    const axisX = x + padLeft;
    const axisBottom = y + h;
    // ejes
    doc.setDrawColor(C_GRID[0], C_GRID[1], C_GRID[2]);
    doc.setLineWidth(0.3);
    doc.line(axisX, y, axisX, axisBottom);
    doc.line(axisX, axisBottom, x + w, axisBottom);
    doc.setLineWidth(0.2);
    const plotW = w - padLeft;
    const n = data.length;
    const slot = plotW / n;
    const barW = Math.min(slot * 0.6, 22);
    data.forEach((d, i) => {
      const cx = axisX + slot * i + slot / 2;
      const bh = (d.value / maxVal) * (h - 6);
      const bx = cx - barW / 2;
      const by = axisBottom - bh;
      const col = d.color ?? (i === opts?.highlightIndex ? highlightColor : baseColor);
      doc.setFillColor(col[0], col[1], col[2]);
      doc.roundedRect(bx, by, barW, bh, 1, 1, "F");
      // valor encima
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(col[0], col[1], col[2]);
      doc.text(`${d.value.toFixed(1)}${unit}`, cx, by - 1.5, { align: "center" });
      // etiqueta debajo
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      const lbl = doc.splitTextToSize(d.label, slot - 1);
      doc.text(lbl.slice(0, 2), cx, axisBottom + 4, { align: "center" });
    });
    doc.setFont("helvetica", "normal");
  };

  /** Dos barras comparativas (objetivo vs real) coloreadas según cumplimiento. */
  const drawComparisonBars = (
    doc: jsPDF, x: number, y: number, w: number,
    objetivo: number, real: number, labels: [string, string],
  ) => {
    const maxVal = Math.max(objetivo, real, 1);
    const barH = 8;
    const gap = 6;
    const cumple = real <= objetivo;
    const labelW = 28;
    const trackX = x + labelW;
    const trackW = w - labelW - 26;
    const rows: { lbl: string; val: number; col: RGB }[] = [
      { lbl: labels[0], val: objetivo, col: C_BRAND },
      { lbl: labels[1], val: real, col: cumple ? C_GREEN : C_RED },
    ];
    rows.forEach((row, i) => {
      const ry = y + i * (barH + gap);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      doc.text(row.lbl, x, ry + barH / 2 + 1.5);
      doc.setFillColor(C_TRACK[0], C_TRACK[1], C_TRACK[2]);
      doc.roundedRect(trackX, ry, trackW, barH, 2, 2, "F");
      const fw = Math.max((trackW * row.val) / maxVal, 2);
      doc.setFillColor(row.col[0], row.col[1], row.col[2]);
      doc.roundedRect(trackX, ry, fw, barH, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(row.col[0], row.col[1], row.col[2]);
      doc.text(formatTime(row.val), trackX + fw + 2, ry + barH / 2 + 1.5);
    });
    doc.setFont("helvetica", "normal");
  };

  /** Título de sección con un acento de color a la izquierda. */
  const sectionTitle = (doc: jsPDF, x: number, y: number, text: string) => {
    doc.setFillColor(C_BRAND[0], C_BRAND[1], C_BRAND[2]);
    doc.rect(x, y - 4, 1.6, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
    doc.text(text, x + 4, y);
    doc.setFont("helvetica", "normal");
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const M = 14; // margen
    const contentW = pageWidth - M * 2;

    // ───────── Métricas base ─────────
    const totalCycles = cycles.length;
    const avgTime = totalCycles > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / totalCycles : 0;
    const bestTime = totalCycles > 0 ? Math.min(...cycles.map((c) => c.duration)) : 0;
    const qualityRate = qualityChecks.length > 0
      ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100) : 0;
    const targetTime = costConfig.targetCycleTime;
    // cumplimiento vs objetivo (100% = igual al objetivo, <100% si lo excede)
    const compliancePct = avgTime > 0 ? Math.min(100, (targetTime / avgTime) * 100) : 0;

    const footer = () => {
      doc.setDrawColor(C_GRID[0], C_GRID[1], C_GRID[2]);
      doc.setLineWidth(0.3);
      doc.line(M, pageHeight - 12, pageWidth - M, pageHeight - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text("Generado por KRONOS.AI — Industrial Intelligence Platform", pageWidth / 2, pageHeight - 7, { align: "center" });
    };

    const ensureSpace = (need: number, currentY: number): number => {
      if (currentY + need > pageHeight - 18) {
        footer();
        doc.addPage();
        return 22;
      }
      return currentY;
    };

    // ───────── 1) Banda de cabecera corporativa ─────────
    doc.setFillColor(C_BRAND[0], C_BRAND[1], C_BRAND[2]);
    doc.rect(0, 0, pageWidth, 32, "F");
    doc.setFillColor(0, 150, 168);
    doc.rect(0, 32, pageWidth, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    doc.text("KRONOS.AI — Reporte de Inteligencia Industrial", M, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(235, 252, 255);
    doc.text("Proceso: Grulla de Origami (12 pasos)", M, 21);
    doc.setFontSize(8.5);
    doc.text(
      `Fecha: ${new Date().toLocaleDateString("es-ES")}    |    Operarios: ${operators.length}    |    Ciclos: ${cycles.length}`,
      M, 27,
    );

    let y = 44;

    // ───────── 2) Tablero ejecutivo (stat cards) ─────────
    sectionTitle(doc, M, y, "Tablero Ejecutivo");
    y += 6;
    const cards: { t: string; v: string; c: RGB }[] = [
      { t: "Tiempo Prom.", v: formatTime(avgTime), c: C_BRAND },
      { t: "Mejor Tiempo", v: formatTime(bestTime), c: C_GREEN },
      { t: "Tasa Calidad", v: `${qualityRate}%`, c: qualityRate >= 80 ? C_GREEN : C_AMBER },
      { t: "Defectos", v: defects.length.toString(), c: defects.length === 0 ? C_GREEN : C_RED },
      { t: "Ciclos", v: totalCycles.toString(), c: C_DARK },
    ];
    const cardGap = 4;
    const cardW = (contentW - cardGap * (cards.length - 1)) / cards.length;
    const cardH = 22;
    cards.forEach((cd, i) => {
      drawStatCard(doc, M + i * (cardW + cardGap), y, cardW, cardH, cd.t, cd.v, cd.c);
    });
    y += cardH + 10;

    // ───────── 3) Objetivo vs Real ─────────
    y = ensureSpace(46, y);
    sectionTitle(doc, M, y, "Objetivo vs Real");
    y += 8;
    drawComparisonBars(doc, M, y, contentW * 0.62, targetTime, avgTime, ["Objetivo", "Real (prom.)"]);
    // panel de cumplimiento a la derecha
    const panelX = M + contentW * 0.66;
    const panelW = contentW * 0.34;
    doc.setFontSize(8);
    drawProgressBar(doc, panelX, y + 4, panelW - 18, compliancePct, compliancePct >= 100 ? C_GREEN : C_AMBER, "Cumplimiento de objetivo");
    const excess = avgTime - targetTime;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
    const excessMsg = excess > 0
      ? `Excede el objetivo en ${excess.toFixed(1)}s/ciclo`
      : `Dentro del objetivo (${Math.abs(excess).toFixed(1)}s de margen)`;
    doc.text(doc.splitTextToSize(excessMsg, panelW), panelX, y + 16);
    y += 30;

    // ───────── 4) Comparativa por operario ─────────
    const opAverages = operators
      .map((op) => {
        const opCycles = cycles.filter((c) => c.operatorId === op.id);
        const avg = opCycles.length > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / opCycles.length : 0;
        return { label: op.name, value: avg, count: opCycles.length };
      })
      .filter((o) => o.count > 0);

    if (opAverages.length > 0) {
      y = ensureSpace(60, y);
      sectionTitle(doc, M, y, "Comparativa por Operario");
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      doc.text("Tiempo promedio de ciclo — verde: más eficiente · rojo: más lento", M, y);
      y += 4;
      let fastIdx = 0, slowIdx = 0;
      opAverages.forEach((o, i) => {
        if (o.value < opAverages[fastIdx].value) fastIdx = i;
        if (o.value > opAverages[slowIdx].value) slowIdx = i;
      });
      const opData = opAverages.map((o, i) => ({
        label: o.label,
        value: o.value,
        color: opAverages.length > 1 ? (i === fastIdx ? C_GREEN : i === slowIdx ? C_RED : C_BRAND) : C_BRAND,
      }));
      drawBarChart(doc, M, y, contentW, 38, opData, { unit: "s" });
      y += 50;
    }

    // ───────── 5) Tiempos por paso · cuello de botella ─────────
    const stepAverages = CRANE_STEPS
      .map((step) => {
        const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
        const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
        return { label: `P${step.number}`, value: avg, number: step.number, name: step.name };
      })
      .filter((s) => s.value > 0);

    if (stepAverages.length > 0) {
      y = ensureSpace(62, y);
      sectionTitle(doc, M, y, "Tiempos por Paso · Cuello de Botella");
      y += 4;
      let bottleneckIdx = 0;
      stepAverages.forEach((s, i) => { if (s.value > stepAverages[bottleneckIdx].value) bottleneckIdx = i; });
      const bn = stepAverages[bottleneckIdx];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      doc.text(
        `Cuello de botella: Paso ${bn.number} (${bn.name}) — ${bn.value.toFixed(1)}s promedio`,
        M, y,
      );
      y += 4;
      drawBarChart(doc, M, y, contentW, 38, stepAverages, { highlightIndex: bottleneckIdx, highlightColor: C_RED, baseColor: C_BRAND, unit: "s" });
      y += 50;
    }

    // ───────── 6) Calidad ─────────
    y = ensureSpace(48, y);
    sectionTitle(doc, M, y, "Calidad");
    y += 10;
    // gauge a la izquierda
    drawGauge(doc, M + 26, y + 16, 18, qualityRate, qualityRate >= 80 ? C_GREEN : qualityRate >= 60 ? C_AMBER : C_RED, "Tasa de calidad");
    // defectos por severidad a la derecha
    const sevX = M + 70;
    const sevW = contentW - 70;
    const sevCounts: { lbl: string; val: number; col: RGB }[] = [
      { lbl: "Leve", val: defects.filter((d) => d.severity === "leve").length, col: C_AMBER },
      { lbl: "Moderado", val: defects.filter((d) => d.severity === "moderado").length, col: [230, 126, 34] },
      { lbl: "Crítico", val: defects.filter((d) => d.severity === "critico").length, col: C_RED },
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(C_DARK[0], C_DARK[1], C_DARK[2]);
    doc.text("Defectos por severidad", sevX, y - 1);
    const maxSev = Math.max(...sevCounts.map((s) => s.val), 1);
    sevCounts.forEach((s, i) => {
      const ry = y + 4 + i * 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(C_TEXT[0], C_TEXT[1], C_TEXT[2]);
      doc.text(s.lbl, sevX, ry + 4);
      const tX = sevX + 20;
      const tW = sevW - 30;
      doc.setFillColor(C_TRACK[0], C_TRACK[1], C_TRACK[2]);
      doc.roundedRect(tX, ry, tW, 5.5, 1.5, 1.5, "F");
      if (s.val > 0) {
        doc.setFillColor(s.col[0], s.col[1], s.col[2]);
        doc.roundedRect(tX, ry, Math.max((tW * s.val) / maxSev, 2), 5.5, 1.5, 1.5, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(s.col[0], s.col[1], s.col[2]);
      doc.text(s.val.toString(), tX + tW + 3, ry + 4.2);
    });
    y += 42;

    // ───────── 7) Tablas detalladas ─────────
    y = ensureSpace(40, y);
    if (cycles.length > 0) {
      sectionTitle(doc, M, y, "Registro de Tiempos");
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

    if (defects.length > 0) {
      y = ensureSpace(40, y);
      sectionTitle(doc, M, y, "Defectos");
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

    // ───────── 8) Sugerencias de Mejora Continua ─────────
    y = ensureSpace(30, y);
    const suggestions = generateSuggestions();
    sectionTitle(doc, M, y, "Sugerencias de Mejora Continua");
    y += 8;

    suggestions.forEach((s, i) => {
      const lines = doc.splitTextToSize(s, contentW - 8);
      const blockH = lines.length * 4.6 + 5;
      y = ensureSpace(blockH, y);
      doc.setFillColor(C_AMBER[0], C_AMBER[1], C_AMBER[2]);
      doc.circle(M + 1.5, y - 1, 1.4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(`${i + 1}`, M + 1.5, y + 0.1, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(lines, M + 6, y);
      y += blockH;
    });

    // ───────── 9) Pie de página ─────────
    footer();

    doc.save(`kronos_reporte_${new Date().toISOString().slice(0, 10)}.pdf`);
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
              <p className="text-xs text-muted-foreground">Incluye gráficos comparativos, tiempos, costos, calidad, defectos y sugerencias AI</p>
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
