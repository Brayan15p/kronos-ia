/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CycleRecord, DefectRecord, OperatorConfig, QualityCheck, StepConfig } from "@/context/TimeStudyContext";
import type { ErgoEvaluation } from "@/lib/sgsst";
import { buildMatrix } from "@/lib/sgsst";
import {
  allowanceItems, associateDefects, buildStandardWork, criteriaByStep, defaultAllowances, emptySOP, findStepEdit, keywords,
  loadSOP, observationStats, parseSOP, requiredObservations, saveSOP, serializeSOP, standardTime, stationSafety, totalAllowance,
  upsertStepEdit, SOP_STORAGE_KEY, type SOPDocument, type SOPInput,
} from "@/lib/sop";

// Registra el texto que realmente se dibuja en el PDF (por debajo del envoltorio de texto seguro).
const drawn = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/pdf", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pdf")>();
  return {
    ...real,
    withPdfSafeText: <T extends import("jspdf").jsPDF>(doc: T): T => {
      const text = doc.text.bind(doc);
      doc.text = ((t: string | string[], ...rest: unknown[]) => {
        drawn.push(...(Array.isArray(t) ? t : [t]));
        return (text as (...a: unknown[]) => T)(t, ...rest);
      }) as T["text"];
      return real.withPdfSafeText(doc);
    },
  };
});

// ── Datos sintéticos ─────────────────────────────────────────────────────────────

const STEPS: StepConfig[] = [
  { number: 1, name: "Corte del papel", emoji: "✂️" },
  { number: 2, name: "Formación del cuello", emoji: "🦢" },
  { number: 3, name: "Formación de la cola", emoji: "🪶" },
];
const OPERATORS: OperatorConfig[] = [
  { id: 1, name: "Ana", hourlyCost: 15000 },
  { id: 2, name: "Beto", hourlyCost: 15000 },
];

let seq = 0;
function cycle(operatorId: number, stepDurations: number[]): CycleRecord {
  seq++;
  return {
    id: `c${seq}`,
    operatorId,
    operatorName: OPERATORS.find((o) => o.id === operatorId)?.name ?? `Op ${operatorId}`,
    cycleNumber: seq,
    duration: stepDurations.reduce((a, b) => a + b, 0),
    steps: stepDurations.map((d, k) => ({ stepNumber: k + 1, stepName: STEPS[k]?.name ?? `Paso ${k + 1}`, duration: d, timestamp: new Date(0) })),
    timestamp: new Date(Date.UTC(2026, 0, 1, 8, seq)),
    qualityPass: true,
    defects: [],
    notes: "",
  };
}

const defect = (cycleId: string, type: string, severity: DefectRecord["severity"] = "leve", description = ""): DefectRecord => ({
  id: `d-${cycleId}-${type}`, cycleId, operatorId: 1, type, severity, description, timestamp: new Date(0),
});

function evaluation(over: Partial<ErgoEvaluation> = {}): ErgoEvaluation {
  return {
    id: "e1", puesto: "Ensamble 1", operario: "", fecha: "2026-10-01", rulaAvg: 3, rulaMax: 4, rebaAvg: 4, rebaMax: 5,
    confianza: 0.7, vista: "lateral", notas: "", origen: "vision-ai", muestras: 30, cicloSeg: 90, horasExposicion: 8,
    createdAt: "2026-10-01T10:00:00Z", ...over,
  };
}

function input(over: Partial<SOPInput> = {}): SOPInput {
  return {
    steps: STEPS, operators: OPERATORS, cycles: [], defects: [], qualityChecks: [], targetCycleTime: 30,
    evaluations: [], matrixRows: [], doc: emptySOP(), ...over,
  };
}

beforeEach(() => {
  drawn.length = 0;
  localStorage.clear();
});

// ── Tiempo estándar ──────────────────────────────────────────────────────────────

describe("tiempo estándar (método clásico)", () => {
  it("observado × ritmo = normal; normal × (1 + suplementos) = estándar (cálculo a mano)", () => {
    // 10 s × 110 % = 11 s; 11 × 1,11 = 12,21 s
    const t = standardTime(10, 110, 11);
    expect(t.normal).toBeCloseTo(11, 10);
    expect(t.standard).toBeCloseTo(12.21, 10);
    // Ritmo 100 % y sin suplementos: el estándar es el observado.
    expect(standardTime(8, 100, 0)).toEqual({ normal: 8, standard: 8 });
  });

  it("compone los suplementos de la OIT sumándolos", () => {
    expect(totalAllowance(defaultAllowances())).toBe(9); // 5 % personales + 4 % fatiga básica
    const cfg = {
      ...defaultAllowances(),
      variable: { depie: "si", postura: "muy", fuerza: "10" },
      extra: 3, extraLabel: "Calor",
    };
    // 5 + 4 + 2 (de pie) + 7 (muy incómoda) + 3 (10 kg) + 3 (otro) = 24
    expect(totalAllowance(cfg)).toBe(24);
    const items = allowanceItems(cfg);
    expect(items.map((i) => i.kind)).toEqual(["constante", "constante", "variable", "variable", "variable", "otro"]);
    expect(items.find((i) => i.kind === "otro")?.label).toBe("Calor");
    // Una opción que no existe no suma nada.
    expect(totalAllowance({ ...defaultAllowances(), variable: { ruido: "inexistente" } })).toBe(9);
  });

  it("usa la mediana como tiempo observado y reporta media, n y CV", () => {
    const cycles = [cycle(1, [10, 5, 5]), cycle(1, [11, 5, 5]), cycle(1, [12, 5, 5]), cycle(1, [30, 5, 5])];
    const s = observationStats([10, 11, 12, 30])!;
    expect(s.median).toBe(11.5);
    expect(s.mean).toBe(15.75);
    expect(s.n).toBe(4);
    expect(s.cv).toBeCloseTo(s.sd / 15.75, 12);

    const sheet = buildStandardWork(input({ cycles }));
    const r1 = sheet.rows[0];
    expect(r1.observed).toBe(11.5);
    expect(r1.stats?.mean).toBe(15.75);
    // 11,5 × 100 % × 1,09 = 12,535
    expect(r1.standard).toBeCloseTo(12.535, 10);
    // Total = Σ estándar de los pasos: (11,5 + 5 + 5) × 1,09
    expect(sheet.totals.standard).toBeCloseTo(21.5 * 1.09, 10);
  });

  it("aplica la valoración del ritmo de cada paso", () => {
    const cycles = [cycle(1, [10, 5, 5]), cycle(1, [10, 5, 5])];
    const doc = upsertStepEdit(emptySOP(), STEPS[0], { rating: 120 });
    const r1 = buildStandardWork(input({ cycles, doc })).rows[0];
    expect(r1.rating).toBe(120);
    expect(r1.normal).toBeCloseTo(12, 10);
    expect(r1.standard).toBeCloseTo(12 * 1.09, 10);
  });

  it("compara el total con el objetivo y con el ciclo medio medido", () => {
    const cycles = [cycle(1, [10, 10, 10]), cycle(1, [10, 10, 10])];
    const sheet = buildStandardWork(input({ cycles, targetCycleTime: 30 }));
    expect(sheet.totals.standard).toBeCloseTo(32.7, 10);
    expect(sheet.vsTarget?.diff).toBeCloseTo(2.7, 10);
    expect(sheet.vsTarget?.rel).toBeCloseTo(0.09, 10);
    expect(sheet.cycleMean).toBe(30);
    expect(sheet.vsCycleMean?.diff).toBeCloseTo(2.7, 10);
    expect(sheet.unitsPerHour).toBeCloseTo(3600 / 32.7, 10);
  });

  it("sin tiempos por paso trata el ciclo completo como un solo elemento", () => {
    const c = { ...cycle(1, []), duration: 40 };
    const sheet = buildStandardWork(input({ cycles: [c, { ...c, id: "x2", duration: 44 }] }));
    expect(sheet.wholeCycle).toBe(true);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].step.name).toBe("Ciclo completo");
    expect(sheet.rows[0].observed).toBe(42);
  });

  it("deja fuera del total los pasos sin datos y lo informa", () => {
    const c = cycle(1, [10, 10]); // el paso 3 nunca se midió
    const sheet = buildStandardWork(input({ cycles: [c, cycle(1, [10, 10])] }));
    expect(sheet.totals.stepsWithData).toBe(2);
    expect(sheet.totals.stepsMissing).toBe(1);
    expect(sheet.rows[2].standard).toBeNull();
  });
});

// ── Suficiencia estadística ──────────────────────────────────────────────────────

describe("observaciones necesarias (±5 %, 95 %)", () => {
  it("aplica n' = (40·√(nΣx² − (Σx)²) / Σx)² sobre un conjunto calculado a mano", () => {
    // x = 10, 12, 11, 9, 13: n = 5, Σx = 55, Σx² = 615
    // nΣx² − (Σx)² = 3075 − 3025 = 50; 40·√50 / 55 = 5,1426…; al cuadrado 26,446… → 27
    expect(requiredObservations([10, 12, 11, 9, 13])).toBe(27);
    // Sin dispersión basta una observación; con menos de 2 no se puede calcular.
    expect(requiredObservations([10, 10, 10])).toBe(1);
    expect(requiredObservations([10])).toBeNull();
  });

  it("marca los pasos con menos observaciones de las necesarias", () => {
    const data = [[10, 5, 5], [12, 5, 5], [11, 5, 5], [9, 5, 5], [13, 5, 5]];
    const sheet = buildStandardWork(input({ cycles: data.map((d) => cycle(1, d)) }));
    expect(sheet.rows[0].required).toBe(27);
    expect(sheet.rows[0].sufficient).toBe(false);
    expect(sheet.rows[1].sufficient).toBe(true);
    expect(sheet.insufficientSteps).toEqual([1]);
  });
});

// ── Puntos clave ─────────────────────────────────────────────────────────────────

describe("puntos clave derivados de los datos", () => {
  it("descarta palabras genéricas y asocia defectos por texto", () => {
    expect(keywords("Formación de los pliegues")).toEqual(["formacion", "pliegue"]);
    const c = cycle(1, [10, 10, 10]);
    const assoc = associateDefects(STEPS, [c], [defect(c.id, "Cuello mal formado", "critico")]);
    // «formación» está en dos de tres pasos: no distingue; «cuello» sí.
    expect(assoc.byStep.get(2)).toEqual([{ type: "Cuello mal formado", count: 1, worst: "critico", basis: "texto" }]);
    expect(assoc.byStep.has(3)).toBe(false);
  });

  it("asocia por tiempo el defecto al paso que más se alargó, y si ninguno lo hizo lo deja a nivel de proceso", () => {
    const normal = [cycle(1, [10, 10, 10]), cycle(1, [10, 10, 10]), cycle(1, [10, 10, 10])];
    const slow = cycle(1, [10, 10, 15]); // paso 3: +50 % sobre su mediana
    const ok = cycle(1, [10, 10, 10]);
    const assoc = associateDefects(STEPS, [...normal, slow, ok], [
      defect(slow.id, "Acabado deficiente", "moderado"),
      defect(ok.id, "Proporciones incorrectas"),
    ]);
    expect(assoc.byStep.get(3)?.[0]).toMatchObject({ type: "Acabado deficiente", basis: "tiempo", worst: "moderado" });
    expect(assoc.unlinked).toEqual([{ type: "Proporciones incorrectas", count: 1, worst: "leve", basis: "proceso" }]);

    const sheet = buildStandardWork(input({ cycles: [...normal, slow, ok], defects: [defect(slow.id, "Acabado deficiente", "moderado")] }));
    const kp = sheet.rows[2].keyPoints.find((k) => k.kind === "calidad");
    expect(kp?.text).toContain("Acabado deficiente");
    expect(kp?.text).toContain("se alargó");
  });

  it("toma los criterios de inspección que nombran el paso y su tasa de falla", () => {
    const checks: QualityCheck[] = [1, 2, 3].map((i) => ({
      id: `q${i}`, cycleId: "c", operatorId: 1, overallPass: i !== 1, timestamp: new Date(0),
      criteria: [{ name: "Cuello y cabeza formados", passed: i !== 1 }, { name: "Acabado limpio", passed: true }],
    }));
    const stats = criteriaByStep(STEPS, checks);
    expect(stats[0]).toEqual({ name: "Cuello y cabeza formados", checks: 3, fails: 1, steps: [2] });
    expect(stats[1].steps).toEqual([]);
    const sheet = buildStandardWork(input({ cycles: [cycle(1, [10, 10, 10])], qualityChecks: checks }));
    expect(sheet.rows[1].keyPoints.some((k) => k.text.includes("no se logró en 1 de 3"))).toBe(true);
    expect(sheet.generalCriteria.map((c) => c.name)).toEqual(["Acabado limpio"]);
  });

  it("advierte postura de riesgo alto con RULA ≥ 5 y prefiere el valor del experto", () => {
    // Cámara RULA 3 (bajo), experto RULA 6 (alto): manda el experto.
    const corrected = evaluation({
      rulaAvg: 3,
      experto: { rula: 6, reba: 5, rulaCamara: 3, rebaCamara: 4, revisor: "Dra. Ruiz", fecha: "2026-10-02", nota: "", campos: [] },
    });
    const s = stationSafety("ensamble 1", [corrected], []);
    expect(s.byExpert).toBe(true);
    expect(s.rula).toBe(6);
    expect(s.warnings).toHaveLength(1);
    expect(s.warnings[0].text).toContain("RULA 6");
    expect(s.warnings[0].text).toContain("validado por experto (Dra. Ruiz)");
    expect(s.warnings[0].level).toBe("media");

    // Cámara RULA 7 (muy alto), experto RULA 2: no hay advertencia.
    const downgraded = evaluation({
      rulaAvg: 7, rebaAvg: 9,
      experto: { rula: 2, reba: 3, rulaCamara: 7, rebaCamara: 9, revisor: "Dra. Ruiz", fecha: "2026-10-02", nota: "", campos: [] },
    });
    expect(stationSafety("Ensamble 1", [downgraded], []).warnings).toEqual([]);

    // Sin experto, la cámara: RULA 7 → nivel alto (actuar de inmediato).
    const cam = stationSafety("Ensamble 1", [evaluation({ rulaAvg: 7 })], []);
    expect(cam.warnings[0].level).toBe("alta");
    expect(cam.warnings[0].text).toContain("tamizaje con cámara");
    // Otro puesto o sin puesto: nada.
    expect(stationSafety("Pintura", [evaluation({ rulaAvg: 7 })], []).warnings).toEqual([]);
    expect(stationSafety("", [evaluation({ rulaAvg: 7 })], []).evaluation).toBeNull();
  });

  it("usa la evaluación más reciente del puesto", () => {
    const old = evaluation({ id: "a", fecha: "2026-01-01", rulaAvg: 7 });
    const recent = evaluation({ id: "b", fecha: "2026-09-01", rulaAvg: 2, rebaAvg: 2 });
    expect(stationSafety("Ensamble 1", [old, recent], []).warnings).toEqual([]);
  });

  it("incluye las filas GTC 45 del puesto en nivel I o II", () => {
    const ev = evaluation({ rulaAvg: 7, rebaAvg: 12, cicloSeg: 20 });
    const rows = buildMatrix({ evaluations: [ev], readings: [], overrides: {} });
    const high = rows.filter((r) => r.nrLevel === "I" || r.nrLevel === "II");
    expect(high.length).toBeGreaterThan(0);
    const s = stationSafety("Ensamble 1", [ev], rows);
    const gtc = s.warnings.filter((w) => w.text.startsWith("GTC 45"));
    expect(gtc).toHaveLength(high.length);
    // Excluir la fila en la matriz la quita de la hoja.
    const excluded = rows.map((r) => ({ ...r, excluded: true }));
    expect(stationSafety("Ensamble 1", [ev], excluded).warnings.filter((w) => w.text.startsWith("GTC 45"))).toEqual([]);
  });

  it("propone como instructor a quien está en nivel O del paso", () => {
    // Ana: 10 repeticiones estables y rápidas (nivel O); Beto: más lento (no llega a O).
    const ana = Array.from({ length: 10 }, (_, k) => cycle(1, [10 * (1 + (k % 2 ? -0.02 : 0.02)), 10, 10]));
    const beto = Array.from({ length: 10 }, (_, k) => cycle(2, [14 * (1 + (k % 2 ? -0.02 : 0.02)), 14, 14]));
    const sheet = buildStandardWork(input({ cycles: [...ana, ...beto] }));
    expect(sheet.rows[0].trainers).toEqual(["Ana"]);
    expect(sheet.rows[0].keyPoints.find((k) => k.kind === "saber")?.text).toBe("Puede enseñarlo (nivel O): Ana.");
  });

  it("copia las advertencias del puesto en los puntos clave de cada paso", () => {
    const doc: SOPDocument = { ...emptySOP(), header: { ...emptySOP().header, puesto: "Ensamble 1" } };
    const sheet = buildStandardWork(input({ cycles: [cycle(1, [10, 10, 10])], evaluations: [evaluation({ rulaAvg: 6 })], doc }));
    expect(sheet.safety.warnings).toHaveLength(1);
    expect(sheet.rows.every((r) => r.keyPoints.some((k) => k.kind === "seguridad"))).toBe(true);
  });

  it("filtra los tiempos por operario sin cambiar calidad ni competencias", () => {
    const cycles = [cycle(1, [10, 10, 10]), cycle(1, [10, 10, 10]), cycle(2, [20, 20, 20]), cycle(2, [20, 20, 20])];
    const doc = { ...emptySOP(), operatorId: 2 };
    expect(buildStandardWork(input({ cycles, doc })).rows[0].observed).toBe(20);
    expect(buildStandardWork(input({ cycles })).rows[0].observed).toBe(15);
  });
});

// ── Persistencia ─────────────────────────────────────────────────────────────────

describe("persistencia del documento", () => {
  it("tolera datos vacíos, dañados o de otro formato", () => {
    expect(parseSOP(null)).toEqual(emptySOP());
    expect(parseSOP("{no es json")).toEqual(emptySOP());
    expect(parseSOP("[1,2]")).toEqual(emptySOP());
    expect(parseSOP('"texto"')).toEqual(emptySOP());
  });

  it("carga documentos viejos o incompletos con valores por defecto", () => {
    // Sin versión, sin suplementos y con campos de tipos equivocados.
    const old = JSON.stringify({
      header: { proceso: "Grulla", puesto: 7 },
      steps: [
        { stepNumber: 2, stepName: "Formación del cuello", rating: 500, metodo: "Doblar", puntoClave: null },
        { stepNumber: "x" },
        "basura",
      ],
      allowances: { personal: 7, fatigue: -3, variable: { depie: "si", ruido: "ya-no-existe", foo: "bar" } },
      operatorId: "2",
      campoFuturo: true,
    });
    const doc = parseSOP(old);
    expect(doc.version).toBe(1);
    expect(doc.header).toEqual({ proceso: "Grulla", puesto: "", version: "1", fecha: "", elaboro: "", aprobo: "" });
    expect(doc.steps).toHaveLength(1);
    expect(doc.steps[0]).toMatchObject({ stepNumber: 2, rating: 100, metodo: "Doblar", puntoClave: "" });
    expect(doc.allowances).toEqual({ personal: 7, fatigue: 4, variable: { depie: "si" }, extra: 0, extraLabel: "" });
    expect(doc.operatorId).toBeNull();
  });

  it("conserva el documento al guardar y volver a leer", () => {
    let doc = upsertStepEdit(emptySOP(), STEPS[1], { rating: 95, puntoClave: "Alinear con la marca", herramientas: "Regla" });
    doc = { ...doc, header: { ...doc.header, proceso: "Grulla", aprobo: "Supervisor" }, operatorId: 1,
      allowances: { ...doc.allowances, variable: { postura: "incomoda" } } };
    expect(parseSOP(serializeSOP(doc))).toEqual(doc);
    saveSOP(doc);
    expect(localStorage.getItem(SOP_STORAGE_KEY)).not.toBeNull();
    expect(loadSOP()).toEqual(doc);
  });

  it("encuentra la edición de un paso aunque se haya renumerado", () => {
    const doc = upsertStepEdit(emptySOP(), STEPS[2], { puntoClave: "Cola recta" });
    // Se borró el paso 1: «Formación de la cola» pasa a ser el 2.
    const moved = findStepEdit(doc, { number: 2, name: "Formación de la cola", emoji: "" });
    expect(moved.puntoClave).toBe("Cola recta");
    expect(moved.stepNumber).toBe(2);
    // Un paso distinto con el número viejo empieza en blanco.
    expect(findStepEdit(doc, { number: 3, name: "Otro paso", emoji: "" }).puntoClave).toBe("");
    // Editar de nuevo no duplica la fila.
    expect(upsertStepEdit(doc, STEPS[2], { rating: 90 }).steps).toHaveLength(1);
  });
});

// ── PDF ──────────────────────────────────────────────────────────────────────────

describe("PDF «Hoja de trabajo estándar»", () => {
  const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  const drawable = (ch: string) => {
    const c = ch.codePointAt(0) ?? 0;
    return c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch);
  };

  it("se genera en horizontal, con la nota de alcance y sin caracteres que la fuente no puede dibujar", async () => {
    const { buildStandardWorkPdf, pdfText } = await import("@/lib/sopPdf");
    expect(pdfText("Corte ✂️ ≥ 5 → ok 🦢")).toBe("Corte >= 5 -> ok");

    const cycles = [cycle(1, [10, 12, 11]), cycle(1, [12, 11, 10]), cycle(2, [11, 13, 12])];
    let doc = upsertStepEdit(emptySOP(), STEPS[0], { puntoClave: "Cortar ✂️ sobre la marca ≥ 2 mm", herramientas: "Bisturí 🔪", foto: "Foto 1 → vista superior" });
    doc = { ...doc, header: { proceso: "Grulla 🕊️", puesto: "Ensamble 1", version: "2", fecha: "2026-10-30", elaboro: "Analista", aprobo: "" } };
    const ev = evaluation({ rulaAvg: 7, rebaAvg: 12, cicloSeg: 20 });
    const sheet = buildStandardWork(input({
      cycles, doc, evaluations: [ev], matrixRows: buildMatrix({ evaluations: [ev], readings: [], overrides: {} }),
      defects: [defect(cycles[0].id, "Cuello mal formado", "critico"), defect(cycles[1].id, "Proporciones incorrectas")],
    }));
    const pdf = buildStandardWorkPdf({ header: doc.header, sheet, generatedAt: new Date(Date.UTC(2026, 9, 30)) });

    expect(pdf.internal.pageSize.getWidth()).toBeGreaterThan(pdf.internal.pageSize.getHeight());
    const all = drawn.join("\n");
    expect(all).toContain("Hoja de trabajo estándar");
    expect(all).toMatch(/Valídelos con el supervisor/);
    expect(all).toContain("Cortar sobre la marca >= 2 mm");
    expect(all).toContain("Cuello mal formado");
    expect(all).toMatch(/GTC 45/);
    const bad = [...all].filter((ch) => !drawable(ch));
    expect(bad).toEqual([]);
    expect(all).not.toMatch(/cumple|certificad/i);
    expect(pdf.output()).not.toMatch(/cumple|certificad/i);
  });
});
