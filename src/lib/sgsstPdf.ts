/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * PDF «Paquete de evidencias SG-SST»: portada, índice, alcance y método, evaluaciones
 * ergonómicas, matriz GTC 45, mediciones ambientales, plan de acción y nota de alcance.
 * Solo usa las fuentes estándar de jsPDF (WinAnsi): se evitan símbolos como ≥ o → que no
 * se pueden representar.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { lastTableY, withPdfSafeText } from "@/lib/pdf";
import {
  SCOPE_NOTE, CAMERA_NOTE, GTC45_SOURCE, CONTROL_LABEL, STATUS_LABEL, VIEW_LABEL,
  NP_INTERPRETATION, NR_INTERPRETATION, LEVEL_TEXT, ndOption, neOption, ncOption, confidenceLabel, noiseLimitForHours,
  type ActionItem, type ErgoEvaluation, type MatrixRow, type ZoneSummary,
} from "@/lib/sgsst";
import { REGULATIONS, getLuxCompliance, getDbCompliance, type EnvironmentalReading } from "@/context/SSTContext";
import type { CoverInfo } from "@/lib/sgsstStore";

export interface SGSSTPdfData {
  cover: CoverInfo;
  evaluations: ErgoEvaluation[];
  rows: MatrixRow[];
  zones: ZoneSummary[];
  readings: EnvironmentalReading[];
  plan: ActionItem[];
  generatedAt?: Date;
}

const HEAD: [number, number, number] = [0, 150, 180];
const TEXT: [number, number, number] = [40, 40, 50];
const MUTED: [number, number, number] = [110, 115, 125];

const fmt1 = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-CO", { maximumFractionDigits: 1 }));

const NR_FILL: Record<string, [number, number, number]> = {
  I: [248, 113, 113], II: [251, 191, 36], III: [253, 224, 71], IV: [134, 239, 172],
};

export function buildSGSSTPdf(data: SGSSTPdfData): jsPDF {
  const doc = withPdfSafeText(new jsPDF());
  const when = data.generatedAt ?? new Date();
  const toc: { title: string; page: number }[] = [];
  const width = () => doc.internal.pageSize.getWidth();

  const section = (title: string, orientation: "portrait" | "landscape" = "portrait") => {
    doc.addPage("a4", orientation);
    toc.push({ title, page: doc.getNumberOfPages() });
    doc.setFontSize(15);
    doc.setTextColor(...TEXT);
    doc.text(title, 14, 20);
    return 27;
  };

  const paragraph = (text: string, y: number, size = 9, color: [number, number, number] = TEXT) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, width() - 28);
    doc.text(lines, 14, y);
    return y + lines.length * size * 0.42 + 3;
  };

  // ── Portada ──
  const pw = width();
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("KRONOS IA", pw / 2, 40, { align: "center" });
  doc.setFontSize(22);
  doc.setTextColor(...TEXT);
  doc.text("Paquete de evidencias SG-SST", pw / 2, 60, { align: "center" });
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text("Peligros biomecánicos y físicos: ergonomía, iluminación y ruido", pw / 2, 70, { align: "center" });
  autoTable(doc, {
    startY: 90,
    margin: { left: 35, right: 35 },
    body: [
      ["Empresa", data.cover.empresa || "(sin diligenciar)"],
      ["Planta / sede", data.cover.planta || "(sin diligenciar)"],
      ["Responsable del SG-SST", data.cover.responsable || "(sin diligenciar)"],
      ["Fecha del paquete", data.cover.fecha || when.toISOString().slice(0, 10)],
      ["Generado", when.toLocaleString("es-CO")],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });
  let y = lastTableY(doc) + 14;
  doc.setDrawColor(200, 120, 0);
  doc.setFillColor(255, 247, 230);
  const scopeLines = doc.splitTextToSize(SCOPE_NOTE, pw - 80);
  doc.rect(35, y - 6, pw - 70, scopeLines.length * 5 + 8, "FD");
  doc.setFontSize(10);
  doc.setTextColor(120, 60, 0);
  doc.text(scopeLines, 40, y);
  y += scopeLines.length * 5 + 12;
  paragraph(`Metodología de valoración: ${GTC45_SOURCE}.`, y, 9, MUTED);

  // ── Índice (se rellena al final, cuando se conocen las páginas) ──
  doc.addPage("a4", "portrait");
  const tocPage = doc.getNumberOfPages();

  // ── 1. Alcance y método ──
  y = section("1. Alcance y método");
  y = paragraph(SCOPE_NOTE, y, 10, [120, 60, 0]);
  y = paragraph(CAMERA_NOTE, y);
  y = paragraph(
    `La matriz sigue la ${GTC45_SOURCE}: NP = ND x NE (Tablas 2 a 5), NR = NP x NC (Tablas 6 a 8) y aceptabilidad (Tabla 9). ` +
    "Los valores de ND y NE son PROPUESTAS de Kronos a partir de los datos (convención propia, no de la guía) y el profesional SST puede cambiarlos; " +
    "cada fila indica la base de su propuesta y si fue editada.",
    y,
  );
  y = paragraph(
    "Convención de propuesta de ND: Postura, RULA 7 = Muy alto, 5-6 = Alto, 3-4 = Medio, 1-2 = Bajo; REBA 11-15 = Muy alto, 8-10 = Alto, 4-7 = Medio, 1-3 = Bajo (se toma el mayor). " +
    "Movimiento repetitivo: ciclo menor a 1 min = Alto, de 1 min o más o sin dato = Medio. " +
    `Iluminación: dentro de ${REGULATIONS.lux.min}-${REGULATIONS.lux.max} lux = Bajo, 200-299 o 501-700 lux = Medio, fuera de eso = Alto. ` +
    "Ruido (LEQ): hasta 80 dB = Bajo, 81-85 dB = Medio, sobre 85 dB dentro del límite para las horas de exposición = Alto, sobre ese límite = Muy alto. " +
    "NE según horas por jornada: 4 h o más = Continua, 2 a 4 h = Frecuente, menos de 2 h = Ocasional.",
    y, 8.5, MUTED,
  );
  autoTable(doc, {
    startY: y,
    head: [["Nivel de riesgo", "Valor de NR", "Significado (Tabla 8)", "Aceptabilidad (Tabla 9)"]],
    body: (["I", "II", "III", "IV"] as const).map((l) => [l, NR_INTERPRETATION[l].range, NR_INTERPRETATION[l].desc, NR_INTERPRETATION[l].aceptabilidad]),
    theme: "grid",
    headStyles: { fillColor: HEAD },
    styles: { fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 20 }, 3: { cellWidth: 35 } },
  });

  // ── 2. Evaluaciones ergonómicas ──
  y = section("2. Evaluaciones ergonómicas", "landscape");
  if (data.evaluations.length === 0) {
    paragraph("No hay evaluaciones registradas.", y, 9, MUTED);
  } else {
    const sortedEvals = [...data.evaluations].sort((a, b) => a.fecha.localeCompare(b.fecha));
    // «cámara» = promedio (máximo) de la sesión; «experto» = postura revisada por el experto.
    const camExp = (avg: number | null, max: number | null, exp: number | undefined) =>
      `${fmt1(avg)} (máx. ${fmt1(max)}) / ${exp == null ? "—" : fmt1(exp)}`;
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Puesto", "Operario", "Origen", "RULA cámara / experto", "REBA cámara / experto", "Revisó", "Confianza", "Vista", "Ciclo (s)", "h/jornada", "Notas"]],
      body: sortedEvals.map((e) => [
        e.fecha, e.puesto, e.operario || "Anónimo", e.origen === "vision-ai" ? "Vision AI" : "Manual",
        camExp(e.rulaAvg, e.rulaMax, e.experto?.rula), camExp(e.rebaAvg, e.rebaMax, e.experto?.reba),
        e.experto ? `${e.experto.revisor || "Sin nombre"} (${e.experto.fecha})` : "Sin revisar",
        e.origen === "vision-ai" ? confidenceLabel(e.confianza) : "No aplica (manual)",
        VIEW_LABEL[e.vista], fmt1(e.cicloSeg), fmt1(e.horasExposicion), e.notas,
      ]),
      theme: "striped",
      headStyles: { fillColor: HEAD },
      styles: { fontSize: 7.5 },
    });
    y = paragraph(
      "RULA/REBA cámara: promedio de la sesión (máximo entre paréntesis). Experto: valor corregido por el experto sobre la postura revisada; " +
      "cuando existe, es el que usa la matriz GTC 45 (fila marcada como validada por experto).",
      lastTableY(doc) + 6, 7.5, MUTED,
    );
    y = paragraph(CAMERA_NOTE, y, 7.5, MUTED);
    const reviewed = sortedEvals.filter((e) => e.experto);
    if (reviewed.length) {
      doc.setFontSize(11);
      doc.setTextColor(...TEXT);
      doc.text("Revisiones del experto", 14, y + 2);
      autoTable(doc, {
        startY: y + 5,
        head: [["Fecha", "Puesto", "Revisó", "RULA cámara (postura revisada)", "RULA experto", "REBA cámara (postura revisada)", "REBA experto", "Campos corregidos", "Nota"]],
        body: reviewed.map((e) => {
          const x = e.experto!;
          return [
            x.fecha || e.fecha, e.puesto, x.revisor || "Sin nombre",
            fmt1(x.rulaCamara), fmt1(x.rula), fmt1(x.rebaCamara), fmt1(x.reba),
            x.campos.length ? x.campos.join("\n") : "Sin cambios (confirma la cámara)", x.nota,
          ];
        }),
        theme: "striped",
        headStyles: { fillColor: HEAD, fontSize: 7 },
        styles: { fontSize: 7 },
        columnStyles: { 7: { cellWidth: 70 } },
      });
    }
  }

  // ── 3. Matriz GTC 45 ──
  y = section("3. Matriz de peligros (GTC 45:2012)", "landscape");
  const rows = data.rows.filter((r) => !r.excluded);
  if (rows.length === 0) {
    paragraph("No hay filas: registre evaluaciones ergonómicas o mediciones ambientales.", y, 9, MUTED);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Puesto / zona", "Peligro", "Efectos posibles", "Controles existentes", "ND", "NE", "NP", "NC", "NR", "Nivel", "Aceptabilidad", "Exp.", "Medidas de intervención sugeridas"]],
      body: rows.map((r) => [
        r.lugar,
        `${r.clasificacion}: ${r.peligro}`,
        r.efectos,
        r.controlesExistentes || "—",
        `${r.nd} (${ndOption(r.nd).code})`,
        `${r.ne} (${neOption(r.ne).code})`,
        `${r.np} (${NP_INTERPRETATION[r.npLevel].label})`,
        `${r.nc} (${ncOption(r.nc).code})`,
        String(r.nr),
        r.nrLevel + (r.suspendAt360 ? " (NR >= 360)" : ""),
        r.aceptabilidad,
        String(r.expuestos),
        (Object.keys(CONTROL_LABEL) as (keyof typeof CONTROL_LABEL)[])
          .map((k) => `${CONTROL_LABEL[k]}: ${r.controles[k]}`).join("\n"),
      ]),
      theme: "grid",
      headStyles: { fillColor: HEAD, fontSize: 7 },
      styles: { fontSize: 6.5, cellPadding: 1.5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 24 }, 1: { cellWidth: 26 }, 2: { cellWidth: 32 }, 3: { cellWidth: 22 },
        4: { cellWidth: 11 }, 5: { cellWidth: 11 }, 6: { cellWidth: 15 }, 7: { cellWidth: 12 },
        8: { cellWidth: 11 }, 9: { cellWidth: 13 }, 10: { cellWidth: 20 }, 11: { cellWidth: 9 },
      },
      didParseCell: (h) => {
        if (h.section === "body" && h.column.index === 9) {
          const lvl = rows[h.row.index]?.nrLevel;
          if (lvl) {
            h.cell.styles.fillColor = NR_FILL[lvl];
            h.cell.styles.textColor = [20, 20, 25];
            h.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = lastTableY(doc) + 8;
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text("Base de la propuesta de ND y NE", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Puesto / zona", "Peligro", "Fuente de datos", "Base del ND propuesto", "Base del NE propuesto", "Propuesta (ND/NE/NC)", "Editado", "Requisito legal asociado", "Observaciones"]],
      body: rows.map((r) => [
        r.lugar, r.peligro, r.fuente + (r.lowConfidence ? " (confianza baja: verificar)" : ""),
        r.ndBasis, r.neBasis, `${r.proposed.nd} / ${r.proposed.ne} / ${r.proposed.nc}`,
        r.edited ? "Sí" : "No", r.requisitoLegal || "Por verificar con el profesional SST", r.observaciones,
      ]),
      theme: "striped",
      headStyles: { fillColor: HEAD, fontSize: 7 },
      styles: { fontSize: 6.5, cellPadding: 1.5 },
    });
  }

  // ── 4. Mediciones ambientales ──
  y = section("4. Mediciones ambientales", "landscape");
  y = paragraph(
    `Referencias usadas en Kronos: iluminancia ${REGULATIONS.lux.min}-${REGULATIONS.lux.max} lux (${REGULATIONS.lux.label}); ` +
    `ruido ${REGULATIONS.db8h.max} dB para 8 h, ${REGULATIONS.db4h.max} dB para 4 h y ${REGULATIONS.db2h.max} dB para 2 h (Res. 1792/1990). ` +
    "La referencia de iluminancia depende del tipo de tarea: el profesional SST debe confirmar la aplicable. Las lecturas se toman con el equipo del usuario; Kronos no verifica su calibración.",
    y, 8.5, MUTED,
  );
  if (data.zones.length === 0) {
    paragraph("No hay mediciones registradas.", y, 9, MUTED);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Zona", "Lecturas lux", "Lux prom.", "Estado lux", "Lecturas dB", "dB prom.", "LEQ (dB)", "h/jornada prom.", "Límite para esas horas", "Estado ruido"]],
      body: data.zones.map((z) => [
        z.zone, String(z.luxReadings), fmt1(z.avgLux == null ? null : Math.round(z.avgLux)),
        z.avgLux == null ? "—" : LEVEL_TEXT[getLuxCompliance(z.avgLux)],
        String(z.dbReadings), fmt1(z.avgDb), fmt1(z.leq), fmt1(z.avgHours),
        z.leq == null ? "—" : `${noiseLimitForHours(z.avgHours)} dB`,
        z.leq == null ? "—" : z.leq > noiseLimitForHours(z.avgHours) ? "Supera el límite" : LEVEL_TEXT[getDbCompliance(z.leq)],
      ]),
      theme: "striped",
      headStyles: { fillColor: HEAD },
      styles: { fontSize: 7.5 },
    });
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    y = lastTableY(doc) + 8;
    doc.text("Detalle de lecturas", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Fecha", "Zona", "Operario", "Lux", "Estado lux", "dB", "Estado dB", "Exposición (h)", "Notas"]],
      body: [...data.readings]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map((r) => [
          new Date(r.timestamp).toLocaleString("es-CO"), r.zone, r.operatorName,
          r.lux > 0 ? String(r.lux) : "—", r.lux > 0 ? LEVEL_TEXT[getLuxCompliance(r.lux)] : "—",
          r.db > 0 ? String(r.db) : "—", r.db > 0 ? LEVEL_TEXT[getDbCompliance(r.db)] : "—",
          fmt1(r.exposureHours), r.notes,
        ]),
      theme: "striped",
      headStyles: { fillColor: HEAD },
      styles: { fontSize: 7 },
    });
  }

  // ── 5. Plan de acción ──
  y = section("5. Plan de acción", "landscape");
  if (data.plan.length === 0) {
    paragraph("No hay acciones registradas.", y, 9, MUTED);
  } else {
    autoTable(doc, {
      startY: y,
      head: [["#", "Acción", "Peligro / puesto", "Tipo de control", "Nivel de riesgo", "Responsable", "Fecha límite", "Estado"]],
      body: data.plan.map((a, i) => [
        String(i + 1), a.accion, a.peligro, CONTROL_LABEL[a.tipoControl], a.nivelRiesgo ?? "—",
        a.responsable || "Sin asignar", a.fechaLimite || "Sin fecha", STATUS_LABEL[a.estado],
      ]),
      theme: "striped",
      headStyles: { fillColor: HEAD },
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 80 } },
    });
  }

  // ── 6. Nota de alcance y revisión ──
  y = section("6. Nota de alcance y revisión profesional");
  y = paragraph(SCOPE_NOTE, y, 10, [120, 60, 0]);
  y = paragraph(CAMERA_NOTE, y);
  y = paragraph(
    "Este paquete reúne evidencias generadas con Kronos IA para apoyar la gestión del riesgo. La identificación de peligros, la valoración definitiva y las medidas de intervención " +
    "deben ser revisadas y aprobadas por el profesional en SST responsable del sistema de gestión de la empresa.",
    y,
  );
  y += 18;
  doc.setDrawColor(...MUTED);
  for (const [label, detail] of [
    ["Elaboró (responsable del SG-SST)", "Nombre, cargo y fecha:"],
    ["Revisó (profesional en SST con licencia vigente)", "Nombre, n.º de licencia y fecha:"],
  ]) {
    doc.line(14, y, 110, y);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, 14, y + 5);
    doc.text(detail, 14, y + 10);
    y += 30;
  }

  // ── Índice ──
  doc.setPage(tocPage);
  doc.setFontSize(15);
  doc.setTextColor(...TEXT);
  doc.text("Índice", 14, 20);
  doc.setFontSize(11);
  toc.forEach((t, i) => {
    const ty = 34 + i * 9;
    doc.text(t.title, 18, ty);
    doc.text(String(t.page), width() - 18, ty, { align: "right" });
  });

  // ── Pie en todas las páginas ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(SCOPE_NOTE, w - 60), 14, h - 9);
    doc.text(`Kronos IA · Página ${p} de ${total}`, w - 14, h - 9, { align: "right" });
  }
  return doc;
}
