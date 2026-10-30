/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * PDF «Hoja de trabajo estándar» (A4 horizontal, imprimible): encabezado del puesto, nota de
 * alcance, suplementos, advertencias de seguridad, tabla de pasos con tiempos y puntos clave,
 * totales, método y firmas. Solo usa las fuentes estándar de jsPDF (WinAnsi): todo el texto,
 * también el que escribe el usuario, pasa por `pdfText` para no dejar caracteres basura.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { lastTableY, pdfSafeText, withPdfSafeText } from "@/lib/pdf";
import { SOP_METHOD_SOURCE, SOP_SCOPE_NOTE, SEVERITY_LABEL, type SOPHeader, type SOPSheet } from "@/lib/sop";

const HEAD: [number, number, number] = [0, 150, 180];
const TEXT: [number, number, number] = [40, 40, 50];
const MUTED: [number, number, number] = [110, 115, 125];

/** Caracteres extra de WinAnsi (CP1252) fuera de Latin-1. */
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

/** Texto que las fuentes estándar pueden dibujar: reemplaza símbolos y quita emojis y similares. */
export function pdfText(s: string): string {
  return [...pdfSafeText(s)]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch);
    })
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const n1 = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? "-" : x.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (x: number) => `${x > 0 ? "+" : ""}${n1(x)}`;
const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`;

export interface SOPPdfData {
  header: SOPHeader;
  sheet: SOPSheet;
  generatedAt?: Date;
}

export function buildStandardWorkPdf({ header, sheet, generatedAt }: SOPPdfData): jsPDF {
  const doc = withPdfSafeText(new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }));
  const when = generatedAt ?? new Date();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;

  const paragraph = (text: string, y: number, size = 8.5, color: [number, number, number] = TEXT) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(text), W - 2 * M);
    if (y + lines.length * size * 0.42 > H - 14) {
      doc.addPage("a4", "landscape");
      y = 16;
    }
    doc.text(lines, M, y);
    return y + lines.length * size * 0.42 + 2.5;
  };
  const heading = (text: string, y: number) => {
    if (y > H - 30) {
      doc.addPage("a4", "landscape");
      y = 16;
    }
    doc.setFontSize(10.5);
    doc.setTextColor(...TEXT);
    doc.text(pdfText(text), M, y);
    return y + 5;
  };

  // ── Título y encabezado del puesto ──
  doc.setFontSize(16);
  doc.setTextColor(...TEXT);
  doc.text("Hoja de trabajo estándar", M, 15);
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Instructivo de operación del puesto · KRONOS IA", M, 20.5);

  const v = (s: string) => pdfText(s) || "(sin diligenciar)";
  autoTable(doc, {
    startY: 24,
    margin: { left: M, right: M },
    body: [
      ["Proceso", v(header.proceso), "Puesto / estación", v(header.puesto), "Versión", v(header.version), "Fecha", v(header.fecha)],
      ["Elaboró", v(header.elaboro), "Aprobó", v(header.aprobo), "Tiempo objetivo", sheet.target ? `${n1(sheet.target)} s` : "-",
        "Generado", when.toLocaleDateString("es-CO")],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.6, textColor: TEXT },
    columnStyles: { 0: { fontStyle: "bold" }, 2: { fontStyle: "bold" }, 4: { fontStyle: "bold" }, 6: { fontStyle: "bold" } },
  });

  // ── Nota de alcance ──
  let y = lastTableY(doc) + 6;
  doc.setFontSize(8.5);
  const scope = doc.splitTextToSize(SOP_SCOPE_NOTE, W - 2 * M - 8);
  doc.setDrawColor(200, 120, 0);
  doc.setFillColor(255, 247, 230);
  doc.rect(M, y - 4, W - 2 * M, scope.length * 3.8 + 3.5, "FD");
  doc.setTextColor(120, 60, 0);
  doc.text(scope, M + 4, y);
  y += scope.length * 3.8 + 4;

  // ── Suplementos ──
  y = paragraph(
    `Suplementos (OIT, aditivos sobre el tiempo normal): ${sheet.allowances.map((a) => `${a.label} ${n1(a.value)} %`).join("; ")}. ` +
    `Total ${n1(sheet.allowancePct)} %.` +
    (sheet.wholeCycle ? " Sin tiempos por paso: el ciclo completo se trata como un solo elemento." : ""),
    y, 8, TEXT,
  );

  // ── Seguridad del puesto ──
  if (sheet.safety.warnings.length) {
    y = heading("Advertencias de seguridad y ergonomía del puesto (aplican a todos los pasos)", y + 1);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      body: sheet.safety.warnings.map((w) => [w.level === "alta" ? "ALTA" : "MEDIA", pdfText(w.text)]),
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.5, textColor: TEXT },
      columnStyles: { 0: { cellWidth: 16, fontStyle: "bold", halign: "center" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 0) {
          d.cell.styles.fillColor = d.cell.raw === "ALTA" ? [248, 180, 180] : [253, 224, 150];
        }
      },
    });
    y = lastTableY(doc) + 5;
  }

  // ── Tabla de pasos ──
  const hasSafety = sheet.safety.warnings.length > 0;
  const body = sheet.rows.map((r) => {
    const kp: string[] = [];
    if (r.edit.puntoClave.trim()) kp.push(`Punto clave: ${r.edit.puntoClave.trim()}`);
    for (const k of r.keyPoints) {
      if (k.kind === "calidad") kp.push(`Calidad: ${k.text}`);
      if (k.kind === "saber") kp.push(`Quién enseña: ${k.text}`);
    }
    if (hasSafety) kp.push("Seguridad: ver advertencias del puesto.");
    const name = `${r.step.number}. ${r.step.name}` + (r.edit.metodo.trim() ? `\n${r.edit.metodo.trim()}` : "");
    const nCell = r.stats
      ? `${r.stats.n} / ${r.required ?? "-"}${r.sufficient === false || r.stats.n < 2 ? "\nfaltan obs." : ""}`
      : "sin datos";
    const obs = r.stats ? `${n1(r.observed)}\nmedia ${n1(r.stats.mean)}\nCV ${Math.round((Number.isFinite(r.stats.cv) ? r.stats.cv : 0) * 100)} %` : "-";
    return [
      pdfText(name), nCell, obs, `${r.rating} %`, n1(r.normal), `${n1(r.allowancePct)} %`, n1(r.standard),
      pdfText(kp.join("\n")) || "-", pdfText(r.edit.herramientas) || "-", pdfText(r.edit.foto) || "-",
    ];
  });
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 14 },
    head: [["Paso y método", "n / n req.", "Observado (mediana, s)", "Ritmo", "Normal (s)", "Supl.", "Estándar (s)", "Puntos clave", "Herramientas / EPP", "Foto / ayuda visual"]],
    body,
    foot: [[
      `Total (${sheet.totals.stepsWithData} de ${sheet.rows.length} pasos con datos)`, "", n1(sheet.totals.observed), "",
      n1(sheet.totals.normal), "", n1(sheet.totals.standard), "", "", "",
    ]],
    theme: "grid",
    rowPageBreak: "avoid",
    showFoot: "lastPage",
    headStyles: { fillColor: HEAD, fontSize: 7.5 },
    footStyles: { fillColor: [230, 240, 245], textColor: TEXT, fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 1.5, textColor: TEXT, valign: "top" },
    columnStyles: {
      0: { cellWidth: 48 }, 1: { cellWidth: 15, halign: "center" }, 2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 13, halign: "right" }, 4: { cellWidth: 16, halign: "right" }, 5: { cellWidth: 13, halign: "right" },
      6: { cellWidth: 17, halign: "right", fontStyle: "bold" }, 7: { cellWidth: 70 }, 8: { cellWidth: 31 }, 9: { cellWidth: 28 },
    },
  });
  y = lastTableY(doc) + 6;

  // ── Totales y comparación ──
  y = heading("Resultado", y);
  const lines: string[] = [`Tiempo estándar del ciclo: ${n1(sheet.totals.standard)} s` +
    (sheet.unitsPerHour ? ` (${n1(sheet.unitsPerHour)} unidades por hora al estándar).` : ".")];
  if (sheet.vsTarget && sheet.target) {
    lines.push(`Frente al tiempo objetivo (${n1(sheet.target)} s): ${signed(sheet.vsTarget.diff)} s (${pct(sheet.vsTarget.rel)}).`);
  }
  if (sheet.vsCycleMean && sheet.cycleMean) {
    lines.push(`Frente al ciclo medio medido (${n1(sheet.cycleMean)} s en ${sheet.cycleCount} ciclos, sin suplementos): ${signed(sheet.vsCycleMean.diff)} s (${pct(sheet.vsCycleMean.rel)}).`);
  }
  if (sheet.totals.stepsMissing > 0) lines.push(`${sheet.totals.stepsMissing} paso(s) sin observaciones no suman al total.`);
  if (sheet.insufficientSteps.length) {
    lines.push(`Pasos con menos observaciones de las necesarias para +/-5 % con 95 % de confianza: ${sheet.insufficientSteps.join(", ")}. Tome más lecturas antes de fijar el estándar.`);
  }
  y = paragraph(lines.join(" "), y);

  // ── Calidad a nivel de proceso ──
  if (sheet.unlinkedDefects.length || sheet.generalCriteria.length) {
    y = heading("Calidad del producto (no asociada a un paso)", y + 1);
    const q: string[] = [
      ...sheet.unlinkedDefects.map((d) => `Defecto «${d.type}»: ${d.count} registro(s), peor severidad ${SEVERITY_LABEL[d.worst]}.`),
      ...sheet.generalCriteria.map((c) => `Criterio «${c.name}»` + (c.fails ? `: no se logró en ${c.fails} de ${c.checks} inspecciones.` : ".")),
    ];
    y = paragraph(q.join(" "), y, 8);
  }

  // ── Método ──
  y = heading("Método de cálculo", y + 1);
  y = paragraph(
    "Tiempo observado = mediana de las observaciones del paso (se muestran también la media y el coeficiente de variación). " +
    "Tiempo normal = observado x valoración del ritmo / 100. Tiempo estándar = normal x (1 + suplementos / 100). " +
    "Tiempo estándar del ciclo = suma de los tiempos estándar de los pasos. " +
    "Observaciones necesarias (n req.) para +/-5 % con 95 % de confianza: n' = (40 x raíz(n x suma de x^2 - (suma de x)^2) / suma de x)^2. " +
    "Puntos clave sugeridos por Kronos: defectos asociados al paso por su nombre o porque el paso se alargó en los ciclos defectuosos; " +
    "criterios de inspección que nombran el paso; RULA desde 5 o REBA desde 8 (prefiriendo la revisión del experto) y filas GTC 45 en nivel I o II; " +
    "quién enseña = operarios en nivel O de la matriz ILUO. Son sugerencias para el analista, no hallazgos causales.",
    y, 7.5, MUTED,
  );
  y = paragraph(SOP_METHOD_SOURCE, y, 7.5, MUTED);

  // ── Firmas ──
  if (y > H - 32) {
    doc.addPage("a4", "landscape");
    y = 20;
  }
  y += 12;
  doc.setDrawColor(150, 150, 150);
  doc.setTextColor(...TEXT);
  doc.setFontSize(8.5);
  const sigW = 80;
  [[M, "Elaboró", header.elaboro], [W / 2 + 10, "Aprobó (supervisor)", header.aprobo]].forEach(([x, label, name]) => {
    doc.line(x as number, y, (x as number) + sigW, y);
    doc.text(`${label}: ${pdfText(name as string) || "________________"}`, x as number, y + 4.5);
  });

  // ── Pie de página ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(`Kronos IA · Hoja de trabajo estándar · ${header.puesto || header.proceso || "puesto sin nombre"} · v${header.version || "1"}`), M, H - 6);
    doc.text(`Página ${p} de ${pages}`, W - M, H - 6, { align: "right" });
  }
  return doc;
}
