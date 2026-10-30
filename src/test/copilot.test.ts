/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Pruebas del motor del Copiloto de planta (src/lib/copilot.ts) y de la anonimización de la
// narración por IA (src/lib/copilotAi.ts). Datos sintéticos con impactos calculados a mano.
import { describe, it, expect } from "vitest";
import type { CostConfig, CycleRecord, DefectRecord, OperatorConfig, QualityCheck, StepConfig } from "@/context/TimeStudyContext";
import type { EnvironmentalReading } from "@/context/SSTContext";
import type { ActionItem, ErgoEvaluation } from "@/lib/sgsst";
import { rowId } from "@/lib/sgsst";
import type { DemandConfig } from "@/lib/lineBalance";
import {
  analyzePlant, applyOverlap, parseDemandConfig, rankOpportunities, weekPlan, opToken, resolveOperatorNames, aliasLetters,
  type CopilotReport, type CopilotSnapshot, type Opportunity, type OpportunityDraft,
} from "@/lib/copilot";
import { buildCopilotAiPayload, COPILOT_AI_LIMITS } from "@/lib/copilotAi";
import { validateCopilotPayload } from "../../api/llm-interpret";

// ── Datos sintéticos ─────────────────────────────────────────────────────────────

const STEPS3: StepConfig[] = [
  { number: 1, name: "Cortar", emoji: "✂️" },
  { number: 2, name: "Doblar", emoji: "📐" },
  { number: 3, name: "Pegar", emoji: "🧴" },
];
const STEPS2 = STEPS3.slice(0, 2);
const STEPS1 = STEPS3.slice(0, 1);

/** 36.000 COP/h → 10 COP por segundo: las cuentas a mano quedan limpias. */
const op = (id: number, name = `Op ${id}`, hourlyCost = 36000): OperatorConfig => ({ id, name, hourlyCost });

let seq = 0;
function cyc(operatorId: number, stepDurations: number[], duration?: number): CycleRecord {
  seq++;
  return {
    id: `c${seq}`,
    operatorId,
    operatorName: `Op ${operatorId}`,
    cycleNumber: seq,
    duration: duration ?? stepDurations.reduce((a, b) => a + b, 0),
    steps: stepDurations.map((d, k) => ({ stepNumber: k + 1, stepName: `Paso ${k + 1}`, duration: d, timestamp: new Date(0) })),
    timestamp: new Date(Date.UTC(2026, 0, 1, 8, seq)),
    qualityPass: true,
    defects: [],
    notes: "",
  };
}

const COST: CostConfig = { productValue: 5000, targetCycleTime: 0, monthlyProductionTarget: 1000 };

function snap(p: Partial<CopilotSnapshot> = {}): CopilotSnapshot {
  return {
    steps: [], operators: [], cycles: [], defects: [], qualityChecks: [], costConfig: COST, demand: null,
    evaluations: [], matrixOverrides: {}, plan: [], readings: [],
    ...p,
  };
}

/** Jornada de 1 h × 10 días = 36.000 s; con 1000 u/mes el takt es 36 s. */
const DEMAND_36: DemandConfig = { unitsPerMonth: 1000, daysPerMonth: 10, shiftsPerDay: 1, hoursPerShift: 1, breakMinutesPerShift: 0 };

function evaluation(p: Partial<ErgoEvaluation>): ErgoEvaluation {
  return {
    id: `e-${p.puesto ?? "x"}`, puesto: "Puesto 1", operario: "", fecha: "2026-10-01",
    rulaAvg: 3, rulaMax: 3, rebaAvg: null, rebaMax: null, confianza: null, vista: "", notas: "",
    origen: "manual", muestras: null, cicloSeg: 90, horasExposicion: 8, createdAt: "2026-10-01T08:00:00Z",
    ...p,
  };
}

let rseq = 0;
const reading = (zone: string, lux: number, db: number, hours = 8, operatorName = "Op 1"): EnvironmentalReading => ({
  id: `r${++rseq}`, operatorId: 1, operatorName, zone, lux, db, exposureHours: hours, timestamp: new Date(0), notes: "",
});

const byId = (r: CopilotReport, id: string) => r.opportunities.find((o) => o.id === id);
const byDetector = (r: CopilotReport, d: Opportunity["detector"]) => r.opportunities.filter((o) => o.detector === d);

/** Recorre todo el informe: ningún número NaN/Infinity ni textos «NaN»/«∞». */
function assertAllFinite(value: unknown, path = "report"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  } else if (typeof value === "string") {
    expect(/NaN|Infinity|∞|undefined/.test(value), `${path}: «${value}»`).toBe(false);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertAllFinite(v, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([k, v]) => assertAllFinite(v, `${path}.${k}`));
  }
}

// ── Detectores de productividad ──────────────────────────────────────────────────

describe("cuello de botella y eficiencia de línea", () => {
  // 3 pasos constantes 30/50/20 s, 2 operarios (= 2 estaciones), takt 36 s.
  const cycles = Array.from({ length: 10 }, (_, i) => cyc(i % 2 ? 2 : 1, [30, 50, 20]));
  const report = analyzePlant(snap({ steps: STEPS3, operators: [op(1), op(2)], cycles, demand: DEMAND_36 }));

  it("cuello de botella: (70 − 36) s × 1000 u × 2 estaciones × 10 COP/s = 680.000", () => {
    const b = byId(report, "cuello-botella")!;
    expect(b).toBeDefined();
    // Mejor reparto en 2 estaciones: E1 = [30], E2 = [50, 20] = 70 s.
    expect(b.impact.monthlyCOP).toBeCloseTo(34 * 1000 * 2 * 10, 6);
    expect(b.area).toBe("productividad");
    expect(b.evidence.map((e) => e.tab)).toContain("line-balance");
    // El paso 2 (50 s) supera el takt por sí solo: hay que dividirlo o duplicarlo.
    expect(b.action).toMatch(/Paso 2 · Doblar/);
    expect(b.action).toMatch(/divídelo/);
    expect(b.confidence).toBe("media"); // 10 registros por paso
  });

  it("eficiencia < 85 %: (2 × 70 − 100 ÷ 0,85) × 1000 × 10 COP/s", () => {
    const e = byId(report, "eficiencia-linea")!;
    expect(e).toBeDefined();
    expect(e.impact.monthlyCOP).toBeCloseTo((140 - 100 / 0.85) * 1000 * 10, 6);
    expect(e.title).toMatch(/71 %/);
  });

  it("no suma dos veces el ahorro de la línea: el total toma el mayor del grupo", () => {
    expect(byId(report, "cuello-botella")!.impact.countedInTotal).toBe(true);
    expect(byId(report, "eficiencia-linea")!.impact.countedInTotal).toBe(false);
    expect(byId(report, "eficiencia-linea")!.impact.note).toMatch(/no se suma al total/);
    expect(report.totalMonthlyCOP).toBeCloseTo(680000, 6);
  });

  it("sin costo por hora no inventa pesos y pide medirlo", () => {
    const r = analyzePlant(snap({ steps: STEPS3, operators: [op(1, "A", 0), op(2, "B", 0)], cycles, demand: DEMAND_36 }));
    const b = byId(r, "cuello-botella")!;
    expect(b.impact.monthlyCOP).toBeNull();
    expect(b.priority).toBe("sin-monetizar");
    expect(byId(r, "medicion:sin-costo")).toBeDefined();
    expect(r.totalMonthlyCOP).toBe(0);
  });

  it("si la línea cumple el takt no hay cuello de botella", () => {
    const easy = { ...DEMAND_36, unitsPerMonth: 100 }; // takt 360 s
    const r = analyzePlant(snap({ steps: STEPS3, operators: [op(1), op(2)], cycles, demand: easy }));
    expect(byId(r, "cuello-botella")).toBeUndefined();
  });

  it("demanda sin configurar: baja la confianza y pide confirmarla", () => {
    const r = analyzePlant(snap({ steps: STEPS3, operators: [op(1), op(2)], cycles, demand: null, costConfig: { ...COST, monthlyProductionTarget: 50000 } }));
    expect(byId(r, "cuello-botella")!.confidence).toBe("baja");
    expect(byId(r, "medicion:sin-demanda")).toBeDefined();
  });
});

describe("paso con mayor variabilidad", () => {
  it("exceso medio sobre la mediana × unidades × costo/s", () => {
    // Paso 1: [10,10,10,10,20,30] → mediana 10, exceso medio (0+0+0+0+10+20)/6 = 5 s; paso 2 constante.
    const p1 = [10, 10, 10, 10, 20, 30];
    const cycles = p1.map((d, i) => cyc(i % 2 ? 2 : 1, [d, 20]));
    const r = analyzePlant(snap({ steps: STEPS2, operators: [op(1), op(2)], cycles }));
    const v = byDetector(r, "variabilidad-paso");
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("variabilidad-paso:1");
    expect(v[0].impact.monthlyCOP).toBeCloseTo(5 * 1000 * 10, 6);
    expect(v[0].effort).toBe("S");
    expect(v[0].confidence).toBe("baja"); // 6 registros
  });

  it("pasos estables (CV ≤ 20 %) no generan oportunidad", () => {
    const cycles = Array.from({ length: 8 }, (_, i) => cyc(1, [10 + (i % 2), 20]));
    const r = analyzePlant(snap({ steps: STEPS2, operators: [op(1)], cycles }));
    expect(byDetector(r, "variabilidad-paso")).toHaveLength(0);
  });
});

describe("operarios por encima del estándar y capacidad", () => {
  // Estándar 100 s. Op 1: 10 ciclos de 120 s (no mejora). Op 2: 10 ciclos de 90 s (ya cumple).
  const cycles = [
    ...Array.from({ length: 10 }, () => cyc(1, [], 120)),
    ...Array.from({ length: 10 }, () => cyc(2, [], 90)),
  ];
  const r = analyzePlant(snap({ operators: [op(1), op(2)], cycles, costConfig: { ...COST, targetCycleTime: 100 } }));

  it("(120 − 100) s × 1000 u × 50 % de los ciclos × 10 COP/s = 100.000 y proyección", () => {
    const o = byId(r, "operarios-estandar")!;
    expect(o).toBeDefined();
    expect(o.area).toBe("personas");
    expect(o.impact.monthlyCOP).toBeCloseTo(20 * 1000 * 0.5 * 10, 6);
    expect(o.diagnosis).toContain(opToken(1));
    expect(o.diagnosis).not.toContain(opToken(2));
    expect(o.diagnosis).toMatch(/no muestra mejora/);
    expect(o.action).toMatch(/reentrena/);
  });

  it("proyecta los ciclos que faltan cuando el operario mejora", () => {
    // Curva de Wright del 90 % desde 150 s: T_n = 150·n^log2(0,9).
    const b = Math.log2(0.9);
    const learning = Array.from({ length: 8 }, (_, i) => cyc(3, [], 150 * Math.pow(i + 1, b)));
    const r2 = analyzePlant(snap({ operators: [op(3)], cycles: learning, costConfig: { ...COST, targetCycleTime: 100 } }));
    const o = byId(r2, "operarios-estandar")!;
    // n tal que 150·n^b ≤ 100 → n = ⌈(100/150)^(1/b)⌉
    const expected = Math.ceil(Math.pow(100 / 150, 1 / b));
    expect(o.diagnosis).toContain(`ciclo ${expected}`);
  });

  it("capacidad: exceso medio sobre el objetivo × unidades × costo/s, en el mismo grupo que operarios", () => {
    const c = byId(r, "capacidad-proceso")!;
    expect(c).toBeDefined();
    // 10 de 20 ciclos exceden en 20 s → exceso medio 10 s.
    expect(c.impact.monthlyCOP).toBeCloseTo(10 * 1000 * 10, 6);
    expect(c.title).toMatch(/50 %/);
    expect(c.evidence.map((e) => e.tab)).toContain("montecarlo");
    // Ambos valen 100.000 y comparten grupo: el total cuenta solo uno.
    expect(r.totalMonthlyCOP).toBeCloseTo(100000, 6);
  });
});

describe("punto único de falla (ILUO)", () => {
  it("detecta el paso que depende de una persona y propone a quien entrenar", () => {
    const cycles = [
      ...Array.from({ length: 10 }, () => cyc(1, [10])), // O: estable y de referencia
      ...Array.from({ length: 3 }, () => cyc(2, [20])),  // I: el doble de la referencia
    ];
    const r = analyzePlant(snap({ steps: STEPS1, operators: [op(1), op(2), op(3)], cycles }));
    const s = byId(r, "punto-unico-falla")!;
    expect(s).toBeDefined();
    expect(s.diagnosis).toContain(`Paso 1 · Cortar (${opToken(1)})`);
    expect(s.action).toContain(`${opToken(1)} entrena a ${opToken(2)}`);
    expect(s.impact.monthlyCOP).toBeNull();
    expect(s.impact.note).toMatch(/no monetizado/);
    expect(s.priority).toBe("sin-monetizar");
  });
});

// ── Calidad ──────────────────────────────────────────────────────────────────────

describe("calidad y focos de defectos", () => {
  const cycles = [
    ...Array.from({ length: 10 }, () => cyc(1, [], 100)),
    ...Array.from({ length: 10 }, () => cyc(2, [], 100)),
  ];
  // Op 1: 5 de 10 fallan; op 2: 1 de 10.
  const failing = new Set([...cycles.slice(0, 5), cycles[10]].map((c) => c.id));
  const checks: QualityCheck[] = cycles.map((c) => ({
    id: `q-${c.id}`, cycleId: c.id, operatorId: c.operatorId, overallPass: !failing.has(c.id),
    criteria: [{ name: "Sin rasgaduras", passed: !failing.has(c.id) }], timestamp: new Date(0),
  }));
  const defects: DefectRecord[] = cycles.slice(0, 3).map((c) => ({
    id: `d-${c.id}`, cycleId: c.id, operatorId: 1, type: "Rasgadura del papel", severity: "moderado", description: "", timestamp: new Date(0),
  }));
  const r = analyzePlant(snap({ operators: [op(1), op(2)], cycles, qualityChecks: checks, defects }));

  it("tasa × unidades × valor del producto = 30 % × 1000 × 5000", () => {
    const q = byId(r, "calidad-global")!;
    expect(q.impact.monthlyCOP).toBeCloseTo(0.3 * 1000 * 5000, 6);
    expect(q.diagnosis).toMatch(/Rasgadura del papel/);
    expect(q.confidence).toBe("media"); // 20 inspecciones
  });

  it("foco por operario: (50 % − 10 %) × 1000 × 50 % × 5000, sin sumarse dos veces", () => {
    const h = byId(r, "calidad-operario:1")!;
    expect(h).toBeDefined();
    expect(h.impact.monthlyCOP).toBeCloseTo(0.4 * 1000 * 0.5 * 5000, 6);
    expect(h.impact.countedInTotal).toBe(false);
    expect(r.totalMonthlyCOP).toBeCloseTo(1500000, 6);
  });

  it("sin inspecciones ni defectos pide medir la calidad", () => {
    const r2 = analyzePlant(snap({ operators: [op(1)], cycles }));
    expect(byDetector(r2, "calidad-global")).toHaveLength(0);
    expect(byId(r2, "medicion:sin-calidad")).toBeDefined();
  });
});

// ── Ergonomía y SST ──────────────────────────────────────────────────────────────

describe("GTC 45, ruido, iluminación y postura", () => {
  // RULA 6 manual, 8 h: ND 6 × NE 4 × NC 25 = 600 → NR I. Repetitivo sin ciclo: 2 × 4 × 25 = 200 → NR II.
  const ev = evaluation({ puesto: "Mesa A", rulaAvg: 6, rulaMax: 6, cicloSeg: null });

  it("NR I y II sin acción en el plan generan tarjetas de seguridad", () => {
    const r = analyzePlant(snap({ evaluations: [ev] }));
    const postura = byId(r, `gtc45:${rowId("postura", "Mesa A")}`)!;
    const repet = byId(r, `gtc45:${rowId("repetitivo", "Mesa A")}`)!;
    expect(postura.priority).toBe("seguridad-critica");
    expect(postura.diagnosis).toMatch(/NR 600/);
    expect(postura.impact.monthlyCOP).toBeNull();
    expect(postura.impact.note).toMatch(/no monetizado/);
    expect(repet.priority).toBe("seguridad-alta");
    // Postura alta (RULA 6) sin revisión de experto → acción de medición.
    expect(byId(r, "medicion:revision-experto")).toBeDefined();
  });

  it("una acción abierta en el plan retira la tarjeta; una cerrada la mantiene", () => {
    const action = (estado: ActionItem["estado"]): ActionItem => ({
      id: "a1", accion: "Ajustar altura", peligro: "Postura — Mesa A", tipoControl: "ingenieria",
      responsable: "", fechaLimite: "", estado, origenFilaId: rowId("postura", "Mesa A"), nivelRiesgo: "I",
    });
    const open = analyzePlant(snap({ evaluations: [ev], plan: [action("pendiente")] }));
    expect(byId(open, `gtc45:${rowId("postura", "Mesa A")}`)).toBeUndefined();
    const closed = analyzePlant(snap({ evaluations: [ev], plan: [action("cerrada")] }));
    expect(byId(closed, `gtc45:${rowId("postura", "Mesa A")}`)!.diagnosis).toMatch(/cerrada/);
  });

  it("dosis de ruido > 100 %: 95 dB × 8 h = 400 % (Res. 1792/1990), seguridad crítica sin duplicar la fila", () => {
    const r = analyzePlant(snap({ readings: [reading("Prensa", 0, 95)] }));
    const n = byId(r, `dosis-ruido:${rowId("ruido", "Prensa")}`)!;
    expect(n.title).toMatch(/400 %/);
    expect(n.priority).toBe("seguridad-critica");
    expect(n.impact.monthlyCOP).toBeNull();
    expect(byId(r, `gtc45:${rowId("ruido", "Prensa")}`)).toBeUndefined();
  });

  it("iluminación fuera de rango: 150 lux → NR II sin acción → seguridad alta", () => {
    const r = analyzePlant(snap({ readings: [reading("Ensamble", 150, 0)] }));
    const l = byId(r, `iluminacion:${rowId("iluminacion", "Ensamble")}`)!;
    expect(l.title).toMatch(/insuficiente/);
    expect(l.severity).toBe("alta");
    expect(l.priority).toBe("seguridad-alta");
    expect(l.effort).toBe("S");
  });

  it("iluminación cerca del rango y con dosis normal no se marca como seguridad", () => {
    const r = analyzePlant(snap({ readings: [reading("Bodega", 250, 70)] }));
    const l = byDetector(r, "iluminacion")[0];
    expect(l.severity).toBe("media");
    expect(l.safety).toBeNull();
    expect(byDetector(r, "dosis-ruido")).toHaveLength(0);
  });

  it("postura crítica (RULA 7) va arriba y pide confirmar con experto", () => {
    const crit = evaluation({ puesto: "Mesa B", rulaAvg: 7, rulaMax: 7, origen: "vision-ai", confianza: 0.8 });
    const r = analyzePlant(snap({ evaluations: [crit] }));
    const p = byId(r, `postura-critica:${rowId("postura", "Mesa B")}`)!;
    expect(p.rank).toBe(1);
    expect(p.priority).toBe("seguridad-critica");
    expect(p.action).toMatch(/revisión de experto/);
    expect(byId(r, `gtc45:${rowId("postura", "Mesa B")}`)).toBeUndefined();
    expect(byId(r, "medicion:revision-experto")).toBeUndefined(); // ya lo pide la tarjeta crítica
  });
});

// ── Regla de orden ───────────────────────────────────────────────────────────────

function draft(p: Partial<OpportunityDraft> & { id: string }): OpportunityDraft {
  return {
    detector: "medicion", kind: "mejora", area: "productividad", title: p.id, diagnosis: "", action: "",
    impact: { monthlyCOP: null, formula: "", inputs: [], assumptions: [], note: "", overlapGroup: null, countedInTotal: false },
    confidence: "media", confidenceReason: "", effort: "M", severity: "media", severityScore: 0, safety: null, evidence: [],
    ...p,
  };
}
const money = (v: number, group: string | null = null) =>
  ({ monthlyCOP: v, formula: "", inputs: [], assumptions: [], note: "", overlapGroup: group, countedInTotal: false });

describe("regla de prioridad", () => {
  const drafts = [
    draft({ id: "A-grande-L", impact: money(1_000_000), effort: "L" }),   // 1.000.000 / 4 = 250.000
    draft({ id: "B-medio-S", impact: money(600_000), effort: "S" }),      // 600.000 / 1
    draft({ id: "C-nr1", safety: "critica", severity: "critica", severityScore: 600, area: "ergonomia-sst" }),
    draft({ id: "C2-nr1-mayor", safety: "critica", severity: "critica", severityScore: 1200, area: "ergonomia-sst" }),
    draft({ id: "D-medir", kind: "medicion", severity: "alta", effort: "S" }),
    draft({ id: "E-sin-dinero", severity: "alta" }),
    draft({ id: "F-nr2", safety: "alta", severity: "alta", severityScore: 200, area: "ergonomia-sst" }),
  ];

  it("seguridad primero (sin importar el dinero), luego impacto ÷ esfuerzo, sin monetizar y medición", () => {
    const ranked = rankOpportunities(drafts);
    expect(ranked.map((o) => o.id)).toEqual(["C2-nr1-mayor", "C-nr1", "F-nr2", "B-medio-S", "A-grande-L", "E-sin-dinero", "D-medir"]);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ranked[0].priority).toBe("seguridad-critica");
    expect(ranked[3].priority).toBe("economica");
    expect(ranked[6].priority).toBe("medicion");
  });

  it("plan de la semana: 5 primeras; una medición urgente reemplaza a la última no-seguridad", () => {
    const plan = weekPlan(rankOpportunities(drafts));
    expect(plan).toHaveLength(5);
    expect(plan.map((o) => o.id)).toEqual(["C2-nr1-mayor", "C-nr1", "F-nr2", "B-medio-S", "D-medir"]);
  });

  it("el total suma una sola vez por grupo de solapamiento", () => {
    const { total, opportunities } = applyOverlap(rankOpportunities([
      draft({ id: "x", impact: money(300, "g") }),
      draft({ id: "y", impact: money(500, "g") }),
      draft({ id: "z", impact: money(100) }),
    ]));
    expect(total).toBe(600);
    expect(opportunities.find((o) => o.id === "x")!.impact.countedInTotal).toBe(false);
  });

  it("en un caso real, el NR I queda por encima de un ahorro de 1,5 millones", () => {
    const cycles = Array.from({ length: 20 }, (_, i) => cyc(1, [], 100 + i));
    const checks: QualityCheck[] = cycles.map((c, i) => ({
      id: `q-${c.id}`, cycleId: c.id, operatorId: 1, overallPass: i >= 6, criteria: [], timestamp: new Date(0),
    }));
    const r = analyzePlant(snap({
      operators: [op(1)], cycles, qualityChecks: checks,
      evaluations: [evaluation({ puesto: "Mesa A", rulaAvg: 6, cicloSeg: null })],
    }));
    expect(r.opportunities[0].priority).toBe("seguridad-critica");
    const q = byId(r, "calidad-global")!;
    expect(q.impact.monthlyCOP).toBeCloseTo(0.3 * 1000 * 5000, 6);
    expect(q.rank).toBeGreaterThan(2);
  });
});

// ── Datos faltantes ──────────────────────────────────────────────────────────────

describe("datos faltantes → acciones de medición", () => {
  it("sin datos: solo mediciones, empezando por los ciclos", () => {
    const r = analyzePlant(snap());
    expect(r.hasData).toBe(false);
    expect(r.opportunities.every((o) => o.kind === "medicion")).toBe(true);
    expect(r.opportunities[0].id).toBe("medicion:sin-ciclos");
    expect(byId(r, "medicion:sin-ambiente")).toBeDefined();
    expect(byId(r, "medicion:sin-ergonomia")).toBeDefined();
    expect(r.totalMonthlyCOP).toBe(0);
  });

  it("ciclos sin tiempos por paso y menos de 10 ciclos", () => {
    const r = analyzePlant(snap({ operators: [op(1)], cycles: [cyc(1, [], 100), cyc(1, [], 110)] }));
    expect(byId(r, "medicion:sin-pasos")).toBeDefined();
    expect(byId(r, "medicion:pocos-ciclos")!.title).toMatch(/hay 2/);
    expect(byId(r, "medicion:sin-estandar")).toBeDefined();
    expect(byDetector(r, "cuello-botella")).toHaveLength(0);
  });

  it("valor del producto en 0 con defectos: pide el valor en vez de suponerlo", () => {
    const cycles = Array.from({ length: 10 }, () => cyc(1, [], 100));
    const checks: QualityCheck[] = cycles.map((c, i) => ({ id: `q${i}`, cycleId: c.id, operatorId: 1, overallPass: i > 2, criteria: [], timestamp: new Date(0) }));
    const r = analyzePlant(snap({ operators: [op(1)], cycles, qualityChecks: checks, costConfig: { ...COST, productValue: 0 } }));
    expect(byId(r, "calidad-global")!.impact.monthlyCOP).toBeNull();
    expect(byId(r, "medicion:sin-valor")).toBeDefined();
  });

  it("parseDemandConfig: sin guardar → no configurada; valores dañados → por defecto", () => {
    expect(parseDemandConfig(null, 500)).toEqual({ demand: { unitsPerMonth: 500, daysPerMonth: 24, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 30 }, configured: false });
    const p = parseDemandConfig(JSON.stringify({ unitsPerMonth: 2000, hoursPerShift: "x", shiftsPerDay: -1 }), 500);
    expect(p.configured).toBe(true);
    expect(p.demand).toEqual({ unitsPerMonth: 2000, daysPerMonth: 24, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 30 });
    expect(parseDemandConfig("{roto", 500).configured).toBe(false);
  });
});

// ── Ningún NaN ni Infinity ───────────────────────────────────────────────────────

describe("robustez numérica", () => {
  it("ningún número NaN/Infinity ni textos con NaN/∞ con datos raros", () => {
    const weird: CycleRecord[] = [
      cyc(1, [NaN, 10]), cyc(1, [Infinity, 10], 50), cyc(1, [-5, 10], 5), cyc(1, [0, 0], 0),
      { ...cyc(2, [], 30), steps: undefined as unknown as CycleRecord["steps"] },
      cyc(99, [10, 10]), // operario que ya no existe
    ];
    const snapshots: CopilotSnapshot[] = [
      snap(),
      snap({ steps: STEPS2, operators: [op(1, "A", Infinity), op(2, "B", NaN)], cycles: weird, costConfig: { productValue: NaN, targetCycleTime: Infinity, monthlyProductionTarget: -10 } }),
      snap({ steps: STEPS2, operators: [], cycles: weird, demand: { unitsPerMonth: 0, daysPerMonth: 0, shiftsPerDay: 0, hoursPerShift: 0, breakMinutesPerShift: 0 } }),
      snap({ readings: [reading("Z", 0, 0, 0), reading("Y", 50, 120, 0)], evaluations: [evaluation({ rulaAvg: NaN as unknown as number })] }),
      snap({
        steps: STEPS3, operators: [op(1), op(2)], demand: DEMAND_36,
        cycles: Array.from({ length: 12 }, (_, i) => cyc(1 + (i % 2), [30 + i, 50, 20])),
        costConfig: { ...COST, targetCycleTime: 90 },
        readings: [reading("Prensa", 1200, 100)],
        evaluations: [evaluation({ puesto: "Mesa", rulaAvg: 7, rebaAvg: 12, origen: "vision-ai", confianza: null })],
      }),
    ];
    for (const s of snapshots) {
      const r = analyzePlant(s);
      assertAllFinite(r);
      for (const o of r.opportunities) {
        if (o.impact.monthlyCOP !== null) expect(o.impact.monthlyCOP).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ── Anonimización del payload de IA ──────────────────────────────────────────────

describe("payload de la narración por IA", () => {
  const operators = [op(7, "Ana María Pérez"), op(9, "Luis")];
  const snapshot = snap({
    operators,
    evaluations: [evaluation({ operario: "Carlos Gómez", experto: { rula: 4, reba: 5, rulaCamara: null, rebaCamara: null, revisor: "Dra. Marta Ruiz", fecha: "", nota: "", campos: [] } })],
    readings: [reading("Z", 400, 70, 8, "Pedro Rojas")],
  });

  function reportOf(drafts: OpportunityDraft[]): CopilotReport {
    const { opportunities, total } = applyOverlap(rankOpportunities(drafts));
    return { opportunities, weekPlan: [], totalMonthlyCOP: total, monetizedCount: 0, safetyCount: 0, measurementCount: 0, hasData: true };
  }

  it("cambia los operarios por «Operario A/B» y borra nombres de personas del texto libre", () => {
    const report = reportOf([draft({
      id: "x",
      title: `Foco de defectos: ${opToken(7)}`,
      diagnosis: `${opToken(9)} trabaja en la mesa de Luis; Ana María Pérez y Carlos Gómez revisaron con Dra. Marta Ruiz y Pedro Rojas.\nLínea nueva`,
      action: `Acompaña a ${opToken(7)}. Luisa no es Luis.`,
      impact: money(1234.6),
    })]);
    const payload = buildCopilotAiPayload(report, snapshot);
    const json = JSON.stringify(payload);
    for (const name of ["Ana", "Pérez", "Carlos", "Gómez", "Marta", "Ruiz", "Pedro", "Rojas", "⟦op"]) expect(json).not.toContain(name);
    expect(payload.items[0].title).toBe("Foco de defectos: Operario A");
    expect(payload.items[0].diagnosis).toMatch(/^Operario B trabaja en la mesa de Operario B; Operario A y Operario revisaron con el experto y Operario\. Línea nueva$/);
    expect(payload.items[0].action).toBe("Acompaña a Operario A. Luisa no es Operario B.");
    expect(payload.items[0].impactCOP).toBe(1235);
    expect(payload).toEqual({ mode: "copilot", items: [expect.objectContaining({ rank: 1, area: "productividad", confidence: "media", effort: "M" })] });
  });

  it("no confunde alias con nombres reales parecidos (una sola pasada)", () => {
    const s = snap({ operators: [op(1, "Operario B"), op(2, "Operario A")] });
    const p = buildCopilotAiPayload(reportOf([draft({ id: "x", title: `${opToken(1)} y Operario A` })]), s);
    // Op 1 (se llama «Operario B») es el primero → alias A; op 2 (se llama «Operario A») → alias B.
    expect(p.items[0].title).toBe("Operario A y Operario B");
  });

  it("respeta los límites y el servidor lo acepta", () => {
    const many = Array.from({ length: 20 }, (_, i) => draft({
      id: `o${String(i).padStart(2, "0")}`, title: "T".repeat(500), diagnosis: "D\u0000".repeat(900), action: "A".repeat(900),
      impact: money(i * 1000),
    }));
    const payload = buildCopilotAiPayload(reportOf(many), snapshot);
    expect(payload.items).toHaveLength(COPILOT_AI_LIMITS.maxItems);
    for (const it of payload.items) {
      expect(it.title.length).toBeLessThanOrEqual(COPILOT_AI_LIMITS.title);
      expect(it.diagnosis.length).toBeLessThanOrEqual(COPILOT_AI_LIMITS.diagnosis);
      expect(it.action.length).toBeLessThanOrEqual(COPILOT_AI_LIMITS.action);
      // eslint-disable-next-line no-control-regex
      expect(/[\u0000-\u001F]/.test(it.diagnosis)).toBe(false);
    }
    expect(validateCopilotPayload(JSON.parse(JSON.stringify(payload)))).not.toBeNull();
  });

  it("un informe real también pasa la validación del servidor", () => {
    const cycles = Array.from({ length: 10 }, (_, i) => cyc(i % 2 ? 9 : 7, [30, 50, 20]));
    const r = analyzePlant({ ...snapshot, steps: STEPS3, cycles, demand: DEMAND_36 });
    const payload = buildCopilotAiPayload(r, snapshot);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(validateCopilotPayload(JSON.parse(JSON.stringify(payload)))).not.toBeNull();
    expect(JSON.stringify(payload)).not.toMatch(/Ana María|Luis\b/);
  });

  it("utilidades de nombres", () => {
    expect([0, 1, 25, 26, 27].map(aliasLetters)).toEqual(["A", "B", "Z", "AA", "AB"]);
    expect(resolveOperatorNames(`${opToken(3)} y ${opToken(4)}`, (id) => `#${id}`)).toBe("#3 y #4");
  });
});
