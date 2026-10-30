/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, beforeEach } from "vitest";
import {
  computeNP, interpretNP, computeNR, nrLevel, evaluateRisk, NR_INTERPRETATION,
  ndFromRula, ndFromReba, proposeNDPostura, proposeNDRepetitivo, proposeNDIluminacion, proposeNDRuido,
  noiseLimitForHours, proposeNE, buildMatrix, seedActionPlan, withCurrentLevels, latestByPuesto, summarizeSnapshots, meanCycleSeconds,
  csvCell, toCSV, matrixToCSV, planToCSV, MATRIX_CSV_HEADERS, SCOPE_NOTE,
  type ErgoEvaluation, type NDValue, type NEValue, type NCValue, type ActionItem, type MatrixRow,
} from "@/lib/sgsst";
import { parseSGSST, setSGSST, getSGSST, reloadSGSST, emptyState, SGSST_STORAGE_KEY } from "@/lib/sgsstStore";
import { buildSGSSTPdf } from "@/lib/sgsstPdf";
import { SSTProvider, useSST, type EnvironmentalReading } from "@/context/SSTContext";
import type { SessionSnapshot } from "@/components/VisionAI/types";

const evaluation = (over: Partial<ErgoEvaluation> = {}): ErgoEvaluation => ({
  id: "e1", puesto: "Ensamble 2", operario: "", fecha: "2026-10-30",
  rulaAvg: 7, rulaMax: 7, rebaAvg: null, rebaMax: null, confianza: 0.7, vista: "lateral", notas: "",
  origen: "vision-ai", muestras: 12, cicloSeg: 25, horasExposicion: 8, createdAt: "2026-10-30T15:00:00Z",
  ...over,
});

const reading = (over: Partial<EnvironmentalReading> = {}): EnvironmentalReading => ({
  id: Math.random().toString(36), operatorId: 1, operatorName: "Ana", zone: "Área de Ensamble",
  lux: 400, db: 70, exposureHours: 8, timestamp: new Date("2026-10-30T10:00:00Z"), notes: "", ...over,
});

// ── GTC 45: NP ──────────────────────────────────────────────────────────────

describe("GTC 45 — nivel de probabilidad (Tablas 4 y 5)", () => {
  it("reproduce la Tabla 4 completa (NP = ND × NE y su interpretación)", () => {
    const table: Record<number, [number, string][]> = {
      10: [[40, "MA"], [30, "MA"], [20, "A"], [10, "A"]],
      6: [[24, "MA"], [18, "A"], [12, "A"], [6, "M"]],
      2: [[8, "M"], [6, "M"], [4, "B"], [2, "B"]],
    };
    const nes: NEValue[] = [4, 3, 2, 1];
    for (const [nd, cells] of Object.entries(table)) {
      cells.forEach(([np, level], i) => {
        expect(computeNP(Number(nd) as NDValue, nes[i])).toBe(np);
        expect(interpretNP(np)).toBe(level);
      });
    }
  });

  it("respeta los cortes de la Tabla 5 (40–24 MA, 20–10 A, 8–6 M, 4–2 B) y trata ND bajo (0) como Bajo", () => {
    expect(interpretNP(40)).toBe("MA");
    expect(interpretNP(24)).toBe("MA");
    expect(interpretNP(20)).toBe("A");
    expect(interpretNP(10)).toBe("A");
    expect(interpretNP(8)).toBe("M");
    expect(interpretNP(6)).toBe("M");
    expect(interpretNP(4)).toBe("B");
    expect(interpretNP(2)).toBe("B");
    expect(interpretNP(computeNP(0, 4))).toBe("B");
  });
});

// ── GTC 45: NR ──────────────────────────────────────────────────────────────

describe("GTC 45 — nivel de riesgo (Tablas 7, 8 y 9)", () => {
  it("reproduce la Tabla 7 para todos los NP posibles y los cuatro NC", () => {
    const nps = [40, 30, 24, 20, 18, 12, 10, 8, 6, 4, 2];
    const expected: Record<NCValue, string[]> = {
      100: ["I", "I", "I", "I", "I", "I", "I", "I", "I", "II", "II"],
      60: ["I", "I", "I", "I", "I", "I", "I", "II", "II", "II", "III"],
      25: ["I", "I", "I", "II", "II", "II", "II", "II", "II", "III", "III"],
      10: ["II", "II", "II", "II", "II", "III", "III", "III", "III", "III", "IV"],
    };
    for (const nc of [100, 60, 25, 10] as NCValue[]) {
      nps.forEach((np, i) => expect(`${np}×${nc}:${nrLevel(computeNR(np, nc))}`).toBe(`${np}×${nc}:${expected[nc][i]}`));
    }
  });

  it("respeta los cortes de la Tabla 8 (I ≥ 600, II 150–500, III 40–120, IV 20)", () => {
    expect(nrLevel(4000)).toBe("I");
    expect(nrLevel(600)).toBe("I");
    expect(nrLevel(599)).toBe("II");
    expect(nrLevel(500)).toBe("II");
    expect(nrLevel(150)).toBe("II");
    expect(nrLevel(149)).toBe("III");
    expect(nrLevel(120)).toBe("III");
    expect(nrLevel(40)).toBe("III");
    expect(nrLevel(39)).toBe("IV");
    expect(nrLevel(20)).toBe("IV");
    expect(nrLevel(0)).toBe("IV");
  });

  it("asigna la aceptabilidad de la Tabla 9 y avisa cuando NR II ≥ 360", () => {
    expect(NR_INTERPRETATION.I.aceptabilidad).toBe("No aceptable");
    expect(NR_INTERPRETATION.II.aceptabilidad).toBe("No aceptable o aceptable con control específico");
    expect(NR_INTERPRETATION.III.aceptabilidad).toBe("Mejorable");
    expect(NR_INTERPRETATION.IV.aceptabilidad).toBe("Aceptable");

    const r = evaluateRisk(6, 1, 60); // NP 6 × 60 = 360
    expect(r).toMatchObject({ np: 6, npLevel: "M", nr: 360, nrLevel: "II", suspendAt360: true });
    expect(evaluateRisk(2, 4, 25)).toMatchObject({ nr: 200, nrLevel: "II", suspendAt360: false });
    expect(evaluateRisk(10, 4, 100)).toMatchObject({ nr: 4000, nrLevel: "I", aceptabilidad: "No aceptable", suspendAt360: false });
    expect(evaluateRisk(0, 4, 100)).toMatchObject({ np: 0, nr: 0, nrLevel: "IV", aceptabilidad: "Aceptable" });
  });
});

// ── Propuesta de ND / NE ────────────────────────────────────────────────────

describe("propuesta de ND y NE a partir de los datos", () => {
  it("RULA → ND por niveles de acción (1–2 B, 3–4 M, 5–6 A, 7 MA)", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(ndFromRula)).toEqual([0, 0, 2, 2, 6, 6, 10]);
    expect(ndFromRula(4.4)).toBe(2); // promedios: se redondea al nivel de acción más cercano
    expect(ndFromRula(6.5)).toBe(10);
  });

  it("REBA → ND por niveles de acción (1–3 B, 4–7 M, 8–10 A, 11–15 MA)", () => {
    expect([1, 3, 4, 7, 8, 10, 11, 15].map(ndFromReba)).toEqual([0, 0, 2, 2, 6, 6, 10, 10]);
  });

  it("postura toma el peor de RULA y REBA", () => {
    expect(proposeNDPostura(3, 9).value).toBe(6);
    expect(proposeNDPostura(7, 2).value).toBe(10);
    expect(proposeNDPostura(4, null).value).toBe(2);
    expect(proposeNDPostura(3, 9).basis).toMatch(/Se toma el mayor/);
  });

  it("movimiento repetitivo según el tiempo de ciclo (< 1 min → Alto)", () => {
    expect(proposeNDRepetitivo(25).value).toBe(6);
    expect(proposeNDRepetitivo(59.9).value).toBe(6);
    expect(proposeNDRepetitivo(60).value).toBe(2);
    expect(proposeNDRepetitivo(null).value).toBe(2);
    expect(proposeNDRepetitivo(0).basis).toMatch(/Sin tiempo de ciclo/);
  });

  it("iluminación con la misma clasificación de SSTContext (300–500 lux)", () => {
    expect([300, 400, 500].map((l) => proposeNDIluminacion(l).value)).toEqual([0, 0, 0]);
    expect([200, 299, 501, 700].map((l) => proposeNDIluminacion(l).value)).toEqual([2, 2, 2, 2]);
    expect([150, 199, 701, 900].map((l) => proposeNDIluminacion(l).value)).toEqual([6, 6, 6, 6]);
  });

  it("ruido con los límites de la Res. 1792/1990 usados en Kronos", () => {
    expect([8, 4.5, 4, 3, 2, 1].map(noiseLimitForHours)).toEqual([85, 85, 90, 90, 95, 95]);
    expect(proposeNDRuido(80, 8).value).toBe(0);
    expect(proposeNDRuido(83, 8).value).toBe(2);
    expect(proposeNDRuido(85, 8).value).toBe(2);
    expect(proposeNDRuido(85.5, 8).value).toBe(10); // supera 85 dB en 8 h
    expect(proposeNDRuido(88, 4).value).toBe(6);  // > 85 pero dentro de 90 dB para 4 h
    expect(proposeNDRuido(90, 4).value).toBe(6);
    expect(proposeNDRuido(91, 4).value).toBe(10);
    expect(proposeNDRuido(95, 2).value).toBe(6);
    expect(proposeNDRuido(96, 1).value).toBe(10);
  });

  it("NE por horas de exposición en la jornada", () => {
    expect([8, 4, 3.9, 2, 1.5, 0.25, 0].map((h) => proposeNE(h).value)).toEqual([4, 4, 3, 3, 2, 2, 1]);
    expect(proposeNE(null).value).toBe(1);
  });
});

// ── Matriz y plan ───────────────────────────────────────────────────────────

describe("matriz de peligros", () => {
  it("genera filas por puesto y zona con la propuesta y la valoración", () => {
    const rows = buildMatrix({
      evaluations: [evaluation()],
      readings: [reading({ lux: 150, db: 70 }), reading({ lux: 160, db: 0, zone: "Área de Ensamble" })],
      overrides: {},
    });
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    // Postura: RULA 7 → ND 10, 8 h → NE 4, NC 25 → NP 40, NR 1000 (I)
    expect(by["postura:ensamble-2"]).toMatchObject({ nd: 10, ne: 4, nc: 25, np: 40, nr: 1000, nrLevel: "I", edited: false });
    // Repetitivo: ciclo 25 s → ND 6
    expect(by["repetitivo:ensamble-2"]).toMatchObject({ nd: 6, ne: 4, np: 24, nr: 600, nrLevel: "I" });
    // Iluminación: la lectura sin lux (0) no cuenta; 155 lux → ND 6, NC 10 → NR 240 (II)
    expect(by["iluminacion:area-de-ensamble"]).toMatchObject({ nd: 6, nc: 10, nr: 240, nrLevel: "II" });
    // Ruido: 70 dB → ND 0 → NR 0 (IV)
    expect(by["ruido:area-de-ensamble"]).toMatchObject({ nd: 0, nr: 0, nrLevel: "IV", aceptabilidad: "Aceptable" });
  });

  it("aplica los ajustes del usuario y marca la fila como editada", () => {
    const rows = buildMatrix({
      evaluations: [evaluation()],
      readings: [],
      overrides: { "postura:ensamble-2": { nd: 2, controlesExistentes: "Pausas activas", expuestos: 3 } },
    });
    const p = rows.find((r) => r.hazard === "postura")!;
    expect(p).toMatchObject({ nd: 2, np: 8, nr: 200, nrLevel: "II", edited: true, controlesExistentes: "Pausas activas", expuestos: 3 });
    expect(p.proposed.nd).toBe(10);
  });

  it("usa la evaluación más reciente de cada puesto y marca la confianza baja", () => {
    const older = evaluation({ id: "a", fecha: "2026-10-01", rulaAvg: 7 });
    const newer = evaluation({ id: "b", fecha: "2026-10-20", rulaAvg: 3, confianza: 0.2 });
    expect(latestByPuesto([newer, older]).map((e) => e.id)).toEqual(["b"]);
    const p = buildMatrix({ evaluations: [older, newer], readings: [], overrides: {} }).find((r) => r.hazard === "postura")!;
    expect(p.nd).toBe(2);
    expect(p.lowConfidence).toBe(true);
  });

  it("siembra el plan solo con filas de nivel I–II, sin duplicar ni incluir las excluidas", () => {
    const rows = buildMatrix({
      evaluations: [evaluation()],
      readings: [reading({ lux: 400, db: 70 })], // iluminación y ruido en nivel IV
      overrides: { "repetitivo:ensamble-2": { excluded: true } },
    });
    let n = 0;
    const ids = () => `a${++n}`;
    const seeded = seedActionPlan(rows, [], ids);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]).toMatchObject({ origenFilaId: "postura:ensamble-2", tipoControl: "ingenieria", estado: "pendiente", nivelRiesgo: "I" });
    expect(seeded[0].peligro).toContain("Ensamble 2");
    expect(seedActionPlan(rows, seeded, ids)).toHaveLength(0);
    const levelII = rows.map((r): MatrixRow => (r.hazard === "postura" ? { ...r, nrLevel: "II" } : r));
    expect(seedActionPlan(levelII, [], ids)[0].nivelRiesgo).toBe("II");
    const levelIII = rows.map((r): MatrixRow => ({ ...r, nrLevel: "III" }));
    expect(seedActionPlan(levelIII, [], ids)).toHaveLength(0);
    // Si luego se edita la fila, la acción muestra el nivel actual.
    expect(withCurrentLevels(seeded, levelII)[0].nivelRiesgo).toBe("II");
    expect(withCurrentLevels(seeded, rows)[0]).toBe(seeded[0]);
  });
});

describe("resumen de una sesión de Vision AI", () => {
  it("calcula promedios y máximos, ignora muestras sin REBA y elige la vista predominante", () => {
    const snap = (rula: number, reba?: number, conf?: number, view?: SessionSnapshot["view"]): SessionSnapshot => ({
      timestamp: 0, therblig: null, emotion: "neutral", emotionScore: 50, ear: 0.3, rula, reba, ergoConfidence: conf, view,
    });
    const s = summarizeSnapshots([
      snap(3, 4, 0.8, "lateral"), snap(5, 8, 0.6, "lateral"), snap(4, undefined, undefined, "desconocida"), snap(6, 9, 0.4, "frontal"),
    ])!;
    expect(s).toEqual({ rulaAvg: 4.5, rulaMax: 6, rebaAvg: 7, rebaMax: 9, confianza: 0.6, vista: "lateral", muestras: 4 });
    expect(summarizeSnapshots([])).toBeNull();
    expect(summarizeSnapshots([snap(2)])).toMatchObject({ rebaAvg: null, confianza: null, vista: "" });
    expect(summarizeSnapshots([snap(2, 2, 0.5, "desconocida")])!.vista).toBe("desconocida");
  });

  it("toma el ciclo medio del operario o, si no tiene, el del estudio", () => {
    const cycles = [{ duration: 20, operatorName: "Ana" }, { duration: 40, operatorName: "Luis" }];
    expect(meanCycleSeconds(cycles, "ana")).toBe(20);
    expect(meanCycleSeconds(cycles, "")).toBe(30);
    expect(meanCycleSeconds(cycles, "Pedro")).toBe(30);
    expect(meanCycleSeconds([])).toBeNull();
  });
});

// ── Persistencia ────────────────────────────────────────────────────────────

describe("persistencia y compatibilidad", () => {
  beforeEach(() => localStorage.clear());

  it("arranca vacío con datos ausentes o dañados", () => {
    expect(parseSGSST(null)).toEqual(emptyState());
    expect(parseSGSST("{no es json")).toEqual(emptyState());
    expect(parseSGSST("[1,2]")).toEqual(emptyState());
    expect(parseSGSST('"texto"')).toEqual(emptyState());
  });

  it("completa datos antiguos o parciales sin perder lo válido", () => {
    const old = {
      // sin versión, sin portada y sin plan: forma de una versión anterior
      evaluations: [
        { id: "e1", puesto: "Corte", rulaAvg: 5 },
        { id: "e2", puesto: "", rulaAvg: 3 },           // sin puesto → se descarta
        { id: "e3", puesto: "Empaque", rulaAvg: "5" },   // RULA no numérico → se descarta
        { id: "e4", puesto: "Pulido", rulaAvg: 4, rebaAvg: 6, vista: "cenital", origen: "vision-ai" },
        null,
      ],
      matrixOverrides: { "postura:corte": { nd: 7, ne: 3, nc: 60, expuestos: 2.6, excluded: "si" }, roto: 5 },
      plan: [
        { id: "p1", accion: "Elevar mesa", estado: "hecha", tipoControl: "magia", nivelRiesgo: "V" },
        { accion: "sin id" },
      ],
    };
    const s = parseSGSST(JSON.stringify(old));
    expect(s.version).toBe(1);
    expect(s.cover).toEqual({ empresa: "", planta: "", responsable: "", fecha: "" });
    expect(s.evaluations.map((e) => e.id)).toEqual(["e1", "e4"]);
    expect(s.evaluations[0]).toMatchObject({
      rulaMax: 5, rebaAvg: null, rebaMax: null, confianza: null, vista: "", origen: "manual", horasExposicion: 8, cicloSeg: null,
    });
    expect(s.evaluations[1]).toMatchObject({ rebaMax: 6, vista: "", origen: "vision-ai" });
    expect(s.matrixOverrides).toEqual({ "postura:corte": { ne: 3, nc: 60, expuestos: 3 } });
    expect(s.plan).toEqual([{ id: "p1", accion: "Elevar mesa", peligro: "", tipoControl: "administrativo", responsable: "", fechaLimite: "", estado: "pendiente" }]);
  });

  it("guarda en su propia clave sin tocar los datos ambientales de SSTContext", () => {
    const legacySST = JSON.stringify({ readings: [], zones: [{ id: "z1", name: "Zona", requiredSamples: 1, measureType: "both" }] });
    localStorage.setItem("kronos_sst_v1", legacySST);
    setSGSST((s) => ({ ...s, cover: { ...s.cover, empresa: "Confecciones Ñandú S.A.S." } }));
    expect(localStorage.getItem("kronos_sst_v1")).toBe(legacySST);
    expect(JSON.parse(localStorage.getItem(SGSST_STORAGE_KEY)!).cover.empresa).toBe("Confecciones Ñandú S.A.S.");
    localStorage.setItem(SGSST_STORAGE_KEY, JSON.stringify({ cover: { empresa: "Otra" } }));
    reloadSGSST();
    expect(getSGSST().cover.empresa).toBe("Otra");
  });

  it("SSTContext sigue cargando lecturas guardadas con la forma anterior", () => {
    localStorage.setItem("kronos_sst_v1", JSON.stringify({
      readings: [{ id: "r1", operatorId: 1, operatorName: "Ana", zone: "Corte", lux: 280, db: 88, exposureHours: 8, timestamp: "2026-10-30T10:00:00.000Z", notes: "" }],
    }));
    localStorage.setItem(SGSST_STORAGE_KEY, JSON.stringify({ evaluations: [evaluation()] }));
    const Probe = () => {
      const { readings, zones } = useSST();
      return React.createElement("p", null, `${readings.length}|${readings[0]?.timestamp instanceof Date}|${zones.length}`);
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    act(() => root.render(React.createElement(SSTProvider, null, React.createElement(Probe))));
    expect(host.textContent).toBe("1|true|3");
    act(() => root.unmount());
    // El paquete SG-SST combina esas lecturas con sus propias evaluaciones.
    reloadSGSST();
    const rows = buildMatrix({ evaluations: getSGSST().evaluations, readings: [reading({ zone: "Corte", lux: 280, db: 88 })], overrides: {} });
    expect(rows.map((r) => r.hazard).sort()).toEqual(["iluminacion", "postura", "repetitivo", "ruido"]);
  });
});

// ── Exportación ─────────────────────────────────────────────────────────────

/** Lector mínimo de CSV con «;» y comillas, para comprobar la ida y vuelta. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe("exportación CSV para Excel (es-CO)", () => {
  it("escapa separadores, comillas y saltos de línea, y neutraliza fórmulas", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('dice "hola"')).toBe('"dice ""hola"""');
    expect(csvCell("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+57 300")).toBe("'+57 300");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@SUM")).toBe("'@SUM");
    expect(csvCell("Iluminación, ruido")).toBe("Iluminación, ruido");
  });

  it("escribe números con coma decimal, booleanos en español y vacíos", () => {
    expect(csvCell(4.5)).toBe("4,5");
    expect(csvCell(-3.25)).toBe("-3,25");
    expect(csvCell(1000)).toBe("1000");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(true)).toBe("Sí");
    expect(csvCell(false)).toBe("No");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("incluye BOM UTF-8, usa CRLF y conserva tildes y eñes en la ida y vuelta", () => {
    const csv = toCSV(["Acción", "Año"], [["Señalización; zona \"A\"", 2026], ["Ruido\nde impacto", 85.5]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    expect(parseCSV(csv.slice(1))).toEqual([
      ["Acción", "Año"],
      ['Señalización; zona "A"', "2026"],
      ["Ruido\nde impacto", "85,5"],
    ]);
  });

  it("exporta la matriz con todas las columnas y sin las filas excluidas", () => {
    const rows = buildMatrix({
      evaluations: [evaluation({ notas: "x" })],
      readings: [reading({ zone: "Zona; norte", lux: 150, db: 92 })],
      overrides: { "repetitivo:ensamble-2": { excluded: true, observaciones: "no aplica" }, "postura:ensamble-2": { observaciones: 'Ver "anexo"; foto' } },
    });
    const parsed = parseCSV(matrixToCSV(rows).slice(1));
    expect(parsed[1][0]).toBe(SCOPE_NOTE);
    expect(parsed[2]).toEqual(MATRIX_CSV_HEADERS);
    const data = parsed.slice(3);
    expect(data).toHaveLength(3); // postura + iluminación + ruido (repetitivo excluido)
    data.forEach((r) => expect(r).toHaveLength(MATRIX_CSV_HEADERS.length));
    const postura = data.find((r) => r[2].startsWith("Postura"))!;
    expect(postura[MATRIX_CSV_HEADERS.indexOf("Observaciones")]).toBe('Ver "anexo"; foto');
    expect(postura[MATRIX_CSV_HEADERS.indexOf("Nivel de riesgo")]).toBe("I");
    expect(data.some((r) => r[0] === "Zona; norte")).toBe(true);
    expect(matrixToCSV(rows)).not.toMatch(/\bcumple\b/i);
  });

  it("exporta el plan de acción con etiquetas legibles", () => {
    const plan: ActionItem[] = [{
      id: "p1", accion: "Instalar paneles; revisar", peligro: "Ruido — Corte", tipoControl: "ingenieria",
      responsable: "Jefe de mantenimiento", fechaLimite: "2026-12-15", estado: "en-curso", nivelRiesgo: "II",
    }];
    const parsed = parseCSV(planToCSV(plan).slice(1));
    expect(parsed[3]).toEqual(["Instalar paneles; revisar", "Ruido — Corte", "Controles de ingeniería", "II", "Jefe de mantenimiento", "2026-12-15", "En curso"]);
  });
});

describe("PDF de evidencias", () => {
  it("genera el paquete con portada, índice y secciones, sin decir «cumple»", () => {
    const rows = buildMatrix({ evaluations: [evaluation()], readings: [reading({ lux: 150, db: 92 })], overrides: {} });
    const doc = buildSGSSTPdf({
      cover: { empresa: "Confecciones Ñandú", planta: "Bogotá", responsable: "María López", fecha: "2026-10-30" },
      evaluations: [evaluation()],
      rows,
      zones: [],
      readings: [reading()],
      plan: seedActionPlan(rows, [], () => "x"),
      generatedAt: new Date("2026-10-30T12:00:00Z"),
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(8);
    const out = doc.output();
    expect(out.startsWith("%PDF")).toBe(true);
    expect(out).not.toMatch(/\bcumple\b/i);
  });
});

describe("dosis diaria de ruido (Res. 1792/1990, intercambio de 5 dB)", () => {
  it("100 % en cada límite de la tabla y proporcional al tiempo", async () => {
    const { calculateDailyDose } = await import("@/context/SSTContext");
    expect(calculateDailyDose(85, 8)).toBeCloseTo(100, 6);
    expect(calculateDailyDose(90, 4)).toBeCloseTo(100, 6);
    expect(calculateDailyDose(95, 2)).toBeCloseTo(100, 6);
    expect(calculateDailyDose(100, 1)).toBeCloseTo(100, 6);
    expect(calculateDailyDose(85, 4)).toBeCloseTo(50, 6);
    expect(calculateDailyDose(0, 8)).toBe(0);
  });
});
