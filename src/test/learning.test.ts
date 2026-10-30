/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CycleRecord, OperatorConfig, StepConfig } from "@/context/TimeStudyContext";
import {
  analyzeLearningCurve, assessCompetency, buildSkillsReport, cyclesToReach, detectOutliers, detectPlateau,
  detectRegression, exponentFromLearningRate, fitWright, iluoLevel, learningRateFromExponent, missingForNextLevel,
  operatorCycles, trainingAlerts, wrightTime, ILUO_THRESHOLDS, LEARNING_MIN_CYCLES, MAX_PREDICTION_CYCLES,
} from "@/lib/learning";

// ── Datos sintéticos ─────────────────────────────────────────────────────────────

/** Serie exacta de Wright para n = 1..count. */
const wrightSeries = (t1: number, rate: number, count: number) =>
  Array.from({ length: count }, (_, i) => wrightTime(t1, exponentFromLearningRate(rate), i + 1));

/** Generador pseudoaleatorio determinista (LCG) y normal estándar por Box–Muller. */
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** Valores alrededor de `v` alternando ±d (CV controlado y determinista). */
const around = (v: number, d: number, count: number) => Array.from({ length: count }, (_, k) => v * (1 + (k % 2 ? -d : d)));

let cycleSeq = 0;
function cycle(operatorId: number, duration: number, stepDurations: number[] = [], minute = cycleSeq): CycleRecord {
  cycleSeq++;
  return {
    id: `c${cycleSeq}`,
    operatorId,
    operatorName: `Op ${operatorId}`,
    cycleNumber: cycleSeq,
    duration,
    steps: stepDurations.map((d, k) => ({ stepNumber: k + 1, stepName: `Paso ${k + 1}`, duration: d, timestamp: new Date(0) })),
    timestamp: new Date(Date.UTC(2026, 0, 1, 8, minute)),
    qualityPass: true,
    defects: [],
    notes: "",
  };
}

/** Ciclos de un operario a partir de una lista de tiempos por paso para cada paso. */
function cyclesFromSteps(operatorId: number, perStep: number[][]): CycleRecord[] {
  const count = perStep[0].length;
  return Array.from({ length: count }, (_, k) => {
    const sd = perStep.map((s) => s[k]);
    return cycle(operatorId, sd.reduce((a, b) => a + b, 0), sd);
  });
}

const STEPS3: StepConfig[] = [
  { number: 1, name: "Cortar", emoji: "✂️" },
  { number: 2, name: "Doblar", emoji: "📐" },
  { number: 3, name: "Pegar", emoji: "🧴" },
];
const OPS: OperatorConfig[] = [
  { id: 1, name: "Ana", hourlyCost: 15000 },
  { id: 2, name: "Beto", hourlyCost: 15000 },
  { id: 3, name: "Caro", hourlyCost: 15000 },
];

// ── 1. Ajuste de Wright ─────────────────────────────────────────────────────────

describe("Curva de Wright — ajuste log–log", () => {
  it("recupera T1 y b exactos de datos sin ruido", () => {
    const b = exponentFromLearningRate(0.85);
    const r = analyzeLearningCurve(wrightSeries(100, 0.85, 20));
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.fit.t1).toBeCloseTo(100, 8);
    expect(r.fit.b).toBeCloseTo(b, 10);
    expect(r.fit.learningRate).toBeCloseTo(0.85, 10);
    expect(r.fit.r2).toBeCloseTo(1, 10);
    expect(r.outlierCount).toBe(0);
    expect(r.fit.nUsed).toBe(20);
  });

  it("recupera T1 y b aproximados con ruido multiplicativo (log-normal, σ = 4 %)", () => {
    const normal = rng(42);
    const durations = wrightSeries(120, 0.8, 60).map((t) => t * Math.exp(0.04 * normal()));
    const r = analyzeLearningCurve(durations);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(Math.abs(r.fit.b - exponentFromLearningRate(0.8))).toBeLessThan(0.03);
    expect(Math.abs(r.fit.t1 / 120 - 1)).toBeLessThan(0.08);
    expect(Math.abs(r.fit.learningRate - 0.8)).toBeLessThan(0.02);
    expect(r.fit.r2).toBeGreaterThan(0.8);
    expect(r.outlierCount).toBeLessThanOrEqual(1);
  });

  it("fitWright directo (sin depuración) y casos degenerados", () => {
    const pts = wrightSeries(50, 0.9, 6).map((d, i) => ({ n: i + 1, duration: d }));
    expect(fitWright(pts)!.learningRate).toBeCloseTo(0.9, 10);
    expect(fitWright([{ n: 1, duration: 10 }])).toBeNull();
    // tiempo constante: b = 0, tasa 100 %, R² = 1 por convención
    const flat = fitWright([1, 2, 3, 4].map((n) => ({ n, duration: 30 })))!;
    expect(flat.b).toBeCloseTo(0, 12);
    expect(flat.learningRate).toBeCloseTo(1, 12);
    expect(flat.r2).toBe(1);
  });
});

describe("Tasa de aprendizaje", () => {
  it("tasa = 2^b y b = log2(tasa)", () => {
    expect(learningRateFromExponent(-1)).toBe(0.5);
    expect(learningRateFromExponent(0)).toBe(1);
    expect(learningRateFromExponent(-0.2345)).toBeCloseTo(0.85, 3);
    expect(exponentFromLearningRate(0.8)).toBeCloseTo(-0.321928, 6);
    expect(learningRateFromExponent(exponentFromLearningRate(0.73))).toBeCloseTo(0.73, 12);
  });

  it("al duplicar las repeticiones el tiempo se multiplica por la tasa", () => {
    const b = exponentFromLearningRate(0.85);
    expect(wrightTime(100, b, 2)).toBeCloseTo(85, 10);
    expect(wrightTime(100, b, 4)).toBeCloseTo(72.25, 10);
    expect(wrightTime(100, b, 8) / wrightTime(100, b, 4)).toBeCloseTo(0.85, 12);
  });
});

// ── 2. Avance al estándar ───────────────────────────────────────────────────────

describe("Ciclos para alcanzar el estándar", () => {
  const b80 = exponentFromLearningRate(0.8);

  it("cyclesToReach resuelve T1·n^b = estándar", () => {
    expect(cyclesToReach(100, b80, 64)).toBe(4); // 100·0,8² = 64 en n = 4
    expect(cyclesToReach(100, b80, 51.2)).toBe(8); // 0,8³ en n = 8
    expect(cyclesToReach(100, b80, 60)).toBe(5); // n = 4 da 64 > 60; n = 5 da 59,6
    expect(cyclesToReach(100, b80, 120)).toBe(1); // ya por debajo desde el inicio
    expect(cyclesToReach(100, 0, 60)).toBeNull(); // sin aprendizaje
    expect(cyclesToReach(100, 0.1, 60)).toBeNull(); // empeora
    expect(cyclesToReach(100, b80, 0)).toBeNull(); // sin estándar
  });

  it("predice el ciclo y los ciclos restantes cuando aún no lo alcanza", () => {
    const r = analyzeLearningCurve(wrightSeries(100, 0.8, 6), 40);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    // 0,8^k = 0,4 → k = 4,106 duplicaciones → n = 2^4,106 = 17,2 → ciclo 18
    expect(r.standard!.status).toBe("predicted");
    expect(r.standard!.reached).toBe(false);
    expect(r.standard!.predictedCycle).toBe(18);
    expect(r.standard!.cyclesRemaining).toBe(12);
  });

  it("detecta que ya alcanzó el estándar (mediana móvil de los últimos 5) y desde cuándo", () => {
    const r = analyzeLearningCurve(wrightSeries(100, 0.8, 20), 70);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.standard!.reached).toBe(true);
    expect(r.standard!.status).toBe("reached");
    expect(r.standard!.window).toBe(5);
    // la ventana que termina en el ciclo 6 tiene mediana = ciclo 4 = 64 ≤ 70; la del ciclo 5, 70,2
    expect(r.standard!.firstReachedAt).toBe(6);
    expect(r.standard!.cyclesRemaining).toBe(0);
  });

  it("sin tendencia de mejora → not-improving; tendencia muy lenta → fuera de horizonte", () => {
    const worse = analyzeLearningCurve([50, 52, 54, 56, 58, 60], 40);
    expect(worse.kind === "fit" && worse.standard!.status).toBe("not-improving");
    expect(worse.kind === "fit" && worse.standard!.predictedCycle).toBeNull();

    const slow = analyzeLearningCurve(wrightSeries(100, 0.99, 10), 50);
    expect(slow.kind === "fit" && slow.standard!.status).toBe("beyond-horizon");
    expect(cyclesToReach(100, exponentFromLearningRate(0.99), 50)!).toBeGreaterThan(MAX_PREDICTION_CYCLES);
  });

  it("si el modelo ya 'debería' estar en el estándar pero la mediana real no, predice el siguiente ciclo", () => {
    // tendencia fuerte pero los últimos ciclos se quedan justo por encima del estándar
    const r = analyzeLearningCurve([100, 70, 55, 45, 41, 41, 41, 41, 41], 40);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.standard!.reached).toBe(false);
    expect(r.standard!.predictedCycle).toBeGreaterThanOrEqual(10);
  });

  it("sin estándar (≤ 0) no calcula el avance", () => {
    const r = analyzeLearningCurve(wrightSeries(100, 0.8, 6), 0);
    expect(r.kind === "fit" && r.standard).toBeNull();
  });
});

// ── 3. Datos insuficientes y no válidos ────────────────────────────────────────

describe("Datos insuficientes, duraciones no válidas y atípicos", () => {
  it(`con menos de ${LEARNING_MIN_CYCLES} ciclos devuelve null con motivo`, () => {
    const r = analyzeLearningCurve([100, 90, 80]);
    expect(r.kind).toBe("insufficient");
    if (r.kind !== "insufficient") return;
    expect(r.validCount).toBe(3);
    expect(r.reason).toMatch(/al menos 4 ciclos/);
  });

  it("descarta duraciones no positivas o no finitas y lo explica", () => {
    const r = analyzeLearningCurve([100, 0, -5, 90, Number.NaN, 80, Infinity]);
    expect(r.kind).toBe("insufficient");
    if (r.kind !== "insufficient") return;
    expect(r.validCount).toBe(3);
    expect(r.reason).toMatch(/descartaron 4/);
    expect(r.points.filter((p) => !p.valid)).toHaveLength(4);
  });

  it("un ciclo no válido conserva su número de repetición (n) en el ajuste", () => {
    const exact = wrightSeries(100, 0.8, 6);
    const withGap = [exact[0], 0, ...exact.slice(2)];
    const r = analyzeLearningCurve(withGap);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.fit.t1).toBeCloseTo(100, 8);
    expect(r.fit.learningRate).toBeCloseTo(0.8, 10);
    expect(r.fit.nUsed).toBe(5);
  });

  it("marca un atípico hacia arriba (interrupción) y lo excluye del ajuste", () => {
    const d = wrightSeries(100, 0.85, 20);
    d[9] *= 4;
    const r = analyzeLearningCurve(d);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.outlierCount).toBe(1);
    expect(r.points[9].outlier).toBe(true);
    expect(r.points[0].outlier).toBe(false); // el primer ciclo (el más lento) no es atípico
    expect(r.fit.t1).toBeCloseTo(100, 6);
    expect(r.fit.learningRate).toBeCloseTo(0.85, 8);
  });

  it("marca un atípico hacia abajo (paso omitido)", () => {
    const d = wrightSeries(100, 0.85, 15);
    d[11] *= 0.3;
    const flags = detectOutliers(d.map((duration, i) => ({ n: i + 1, duration })));
    expect(flags.filter(Boolean)).toHaveLength(1);
    expect(flags[11]).toBe(true);
  });

  it(`descarta como mucho el 20 % de los ciclos y nunca deja menos de ${LEARNING_MIN_CYCLES}`, () => {
    const d = wrightSeries(100, 0.85, 10);
    [2, 4, 6, 8].forEach((i) => { d[i] *= 3 + i; }); // 4 atípicos en 10 ciclos
    const flags = detectOutliers(d.map((duration, i) => ({ n: i + 1, duration })));
    expect(flags.filter(Boolean)).toHaveLength(2); // floor(10 · 0,2)
    expect(flags[8] && flags[6]).toBe(true); // los más extremos
    expect(detectOutliers([10, 9, 50, 8].map((duration, i) => ({ n: i + 1, duration }))).some(Boolean)).toBe(false);
  });
});

// ── 4. Meseta y retroceso ───────────────────────────────────────────────────────

describe("Meseta y retroceso", () => {
  it("detecta meseta cuando la pendiente reciente es ≈ 0", () => {
    const r = analyzeLearningCurve([100, 80, 70, 62, 60, 60.2, 59.9, 60.1, 60], 50);
    expect(r.kind).toBe("fit");
    if (r.kind !== "fit") return;
    expect(r.plateau!.plateau).toBe(true);
    expect(Math.abs(r.plateau!.relativeSlope)).toBeLessThanOrEqual(0.01);
  });

  it("no hay meseta mientras sigue mejorando; sin ventana completa devuelve null", () => {
    const p = detectPlateau([100, 90, 80, 70, 60].map((duration, i) => ({ n: i + 1, duration })));
    expect(p!.plateau).toBe(false);
    expect(p!.relativeSlope).toBeCloseTo(-10 / 80, 10);
    expect(detectPlateau([1, 2, 3, 4].map((n) => ({ n, duration: 10 })))).toBeNull();
  });

  it("detecta retroceso (mediana reciente ≥ 15 % sobre la anterior) con límite inclusivo", () => {
    const reg = detectRegression([60, 60, 61, 59, 60, 75, 76, 74, 75, 77])!;
    expect(reg.detected).toBe(true);
    expect(reg.change).toBeCloseTo(0.25, 10);
    expect(detectRegression([100, 100, 100, 100, 100, 115, 115, 115, 115, 115])!.detected).toBe(true);
    expect(detectRegression([100, 100, 100, 100, 100, 114, 114, 114, 114, 114])!.detected).toBe(false);
    expect(detectRegression([100, 100, 100, 115, 115, 115, 115])).toBeNull(); // < 5 + 3 ciclos
    // un operario que mejora no retrocede
    expect(detectRegression(wrightSeries(100, 0.85, 12))!.detected).toBe(false);
  });
});

// ── 5. Umbrales ILUO ────────────────────────────────────────────────────────────

describe("Niveles ILUO — límites de cada umbral", () => {
  const { L, U, O } = ILUO_THRESHOLDS;

  it("O: n ≥ 10, razón ≤ 1,10, CV ≤ 0,10 (inclusivo)", () => {
    expect(iluoLevel({ n: O.minSamples, ratio: O.maxRatio, cv: O.maxCv })).toBe("O");
    expect(iluoLevel({ n: O.minSamples, ratio: O.maxRatio + 0.001, cv: O.maxCv })).toBe("U");
    expect(iluoLevel({ n: O.minSamples, ratio: O.maxRatio, cv: O.maxCv + 0.001 })).toBe("U");
    expect(iluoLevel({ n: O.minSamples - 1, ratio: 1, cv: 0 })).toBe("U");
  });

  it("U: n ≥ 5, razón ≤ 1,20, CV ≤ 0,20", () => {
    expect(iluoLevel({ n: U.minSamples, ratio: U.maxRatio, cv: U.maxCv })).toBe("U");
    expect(iluoLevel({ n: U.minSamples, ratio: U.maxRatio + 0.001, cv: U.maxCv })).toBe("L");
    expect(iluoLevel({ n: U.minSamples, ratio: U.maxRatio, cv: U.maxCv + 0.001 })).toBe("L");
    expect(iluoLevel({ n: U.minSamples - 1, ratio: 1, cv: 0 })).toBe("L");
  });

  it("L: n ≥ 3, razón ≤ 1,50, CV ≤ 0,35; si no, I", () => {
    expect(iluoLevel({ n: L.minSamples, ratio: L.maxRatio, cv: L.maxCv })).toBe("L");
    expect(iluoLevel({ n: L.minSamples, ratio: L.maxRatio + 0.001, cv: 0 })).toBe("I");
    expect(iluoLevel({ n: L.minSamples, ratio: 1, cv: L.maxCv + 0.001 })).toBe("I");
    expect(iluoLevel({ n: 20, ratio: null, cv: 0 })).toBe("I");
    expect(iluoLevel({ n: 20, ratio: 1, cv: Number.NaN })).toBe("I");
  });

  it("muestra mínima: un desempeño perfecto con pocas repeticiones queda topado", () => {
    expect(iluoLevel({ n: 1, ratio: 1, cv: 0 })).toBe("I");
    expect(iluoLevel({ n: 2, ratio: 1, cv: 0 })).toBe("I");
    expect(iluoLevel({ n: 4, ratio: 1, cv: 0 })).toBe("L");
    expect(iluoLevel({ n: 9, ratio: 1, cv: 0 })).toBe("U");
    expect(iluoLevel({ n: 10, ratio: 1, cv: 0 })).toBe("O");
  });

  it("explica qué falta para el siguiente nivel", () => {
    expect(missingForNextLevel({ n: 4, ratio: 1.3, cv: 0.25 }, "L")).toEqual([
      "al menos 5 repeticiones (tiene 4)",
      "tiempo ≤ 120 % de la referencia (está en 130 %)",
      "variabilidad (CV) ≤ 20 % (está en 25 %)",
    ]);
    expect(missingForNextLevel({ n: 12, ratio: 1, cv: 0.05 }, "O")).toEqual([]);
  });
});

// ── 6. Matriz de competencias y alertas ─────────────────────────────────────────

describe("Matriz de competencias", () => {
  // Ana: experta (12 ciclos, CV 2 %). Beto: aprendiz (6 ciclos). Caro: sin datos.
  const ana = cyclesFromSteps(1, [around(10, 0.02, 12), around(20, 0.02, 12), around(30, 0.02, 12)]);
  const beto = cyclesFromSteps(2, [around(11, 0.05, 6), around(28, 0.05, 6), around(50, 0.05, 6)]);
  const cycles = [...ana, ...beto];

  it("referencia = mejor operario estable y niveles por celda", () => {
    const m = assessCompetency(STEPS3, OPS, cycles, 60);
    expect(m.hasStepData).toBe(true);
    m.stepSummaries.forEach((s) => {
      expect(s.reference.source).toBe("mejor-operario");
      expect(s.reference.referenceOperatorId).toBe(1);
    });
    expect(m.stepSummaries[0].reference.reference).toBeCloseTo(10, 10);
    // Ana: O en todo
    expect(m.cells[0].map((c) => c.level)).toEqual(["O", "O", "O"]);
    expect(m.cells[0][0].ratio).toBeCloseTo(1, 10);
    // Beto: paso 1 razón 1,10 pero n = 6 → U; paso 2 razón 1,40 → L; paso 3 razón 1,67 → I
    expect(m.cells[1].map((c) => c.level)).toEqual(["U", "L", "I"]);
    expect(m.cells[1][1].ratio).toBeCloseTo(1.4, 10);
    expect(m.cells[1][0].cv).toBeCloseTo(0.0548, 3);
    // Caro: sin registros
    expect(m.cells[2].every((c) => c.level === null && c.n === 0)).toBe(true);
    expect(m.stepSummaries[0].countByLevel).toEqual({ I: 0, L: 0, U: 1, O: 1 });
  });

  it("alertas: un solo autónomo y un solo instructor", () => {
    const m = assessCompetency(STEPS3, OPS, cycles, 60);
    const alerts = trainingAlerts(m, []);
    const kinds = alerts.map((a) => `${a.kind}:${a.stepNumber}`);
    expect(kinds).toEqual(["un-solo-autonomo:2", "un-solo-autonomo:3", "un-solo-instructor:1"]);
    expect(alerts[0].detail).toMatch(/Solo Ana .*puede enseñarlo/);
    expect(alerts[2].operatorId).toBe(1);
  });

  it("alerta de riesgo de dependencia cuando nadie está en U/O; referencia por parte del estándar", () => {
    // Un solo operario (no se compara consigo mismo) → referencia = parte del estándar.
    const solo = cyclesFromSteps(2, [around(30, 0, 3), around(30, 0, 3)]);
    const steps2 = STEPS3.slice(0, 2);
    const m = assessCompetency(steps2, [OPS[1]], solo, 40);
    expect(m.stepSummaries[0].reference.source).toBe("estandar");
    expect(m.stepSummaries[0].reference.reference).toBeCloseTo(20, 10); // reparto proporcional 50/50
    expect(m.cells[0].map((c) => c.level)).toEqual(["L", "L"]); // razón 1,5 con 3 muestras
    const alerts = trainingAlerts(m, []);
    expect(alerts.map((a) => a.kind)).toEqual(["sin-autonomo", "sin-autonomo"]);
    expect(alerts[0].severity).toBe("alta");
    expect(alerts[0].detail).toMatch(/Riesgo de dependencia/);
  });

  it("reparto uniforme del estándar si falta algún paso; sin estándar usa el mejor disponible", () => {
    const partial = cyclesFromSteps(1, [around(10, 0, 3), around(30, 0, 3)]); // paso 3 sin datos
    const m = assessCompetency(STEPS3, [OPS[0]], partial, 60);
    expect(m.stepSummaries[0].reference.reference).toBeCloseTo(20, 10); // 60 / 3
    expect(m.stepSummaries[2].operatorsWithData).toBe(0);
    expect(trainingAlerts(m, []).some((a) => a.stepNumber === 3)).toBe(false); // sin evidencia, sin alerta

    const none = assessCompetency(STEPS3, [OPS[0]], partial, 0);
    expect(none.stepSummaries[0].reference.source).toBe("mejor-disponible");
    expect(none.cells[0][0].ratio).toBeCloseTo(1, 10);
    expect(none.stepSummaries[2].reference.source).toBeNull();
  });

  it("ciclos sin tiempos por paso: no cuentan para la matriz pero sí para la curva", () => {
    const auto = wrightSeries(100, 0.85, 8).map((d) => cycle(1, d)); // detectados automáticamente
    const report = buildSkillsReport({ steps: STEPS3, operators: OPS, cycles: auto, targetCycleTime: 60 });
    expect(report.matrix.hasStepData).toBe(false);
    expect(report.matrix.cyclesWithoutSteps).toBe(8);
    expect(report.matrix.cells.flat().every((c) => c.level === null)).toBe(true);
    expect(report.alerts.filter((a) => a.stepNumber !== undefined)).toHaveLength(0);
    const anaCurve = report.learning[0].result;
    expect(anaCurve.kind === "fit" && anaCurve.fit.learningRate).toBeCloseTo(0.85, 8);
    expect(report.learning[1].result.kind).toBe("insufficient");
  });

  it("ignora operarios eliminados, pasos desconocidos y tiempos no válidos", () => {
    const stray = [cycle(99, 30, [10, 10, 10]), cycle(1, 30, [10, -1, Number.NaN, 5])];
    const m = assessCompetency(STEPS3, OPS, stray, 60);
    expect(m.cells[0][0].n).toBe(1);
    expect(m.cells[0][1].n).toBe(0);
    expect(m.cells[0][2].n).toBe(0); // NaN descartado
  });
});

describe("Informe completo y orden cronológico", () => {
  it("ordena los ciclos de cada operario por fecha", () => {
    const a = cycle(1, 50, [], 30);
    const b = cycle(1, 70, [], 10);
    const c = cycle(2, 60, [], 20);
    expect(operatorCycles([a, b, c], 1).map((x) => x.duration)).toEqual([70, 50]);
  });

  it("genera la alerta de retroceso por operario", () => {
    const durs = [60, 60, 61, 59, 60, 75, 76, 74, 75, 77];
    const cs = durs.map((d) => cycle(2, d));
    const report = buildSkillsReport({ steps: STEPS3, operators: OPS, cycles: cs, targetCycleTime: 60 });
    const reg = report.alerts.filter((a) => a.kind === "regresion");
    expect(reg).toHaveLength(1);
    expect(reg[0].operatorId).toBe(2);
    expect(reg[0].title).toMatch(/Beto/);
    expect(reg[0].detail).toMatch(/25 %/);
  });
});

// ── 7. Render del componente ───────────────────────────────────────────────────

const studyState = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/context/TimeStudyContext", () => ({
  useTimeStudy: () => studyState.current,
}));

describe("SkillsMatrix (render)", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom no trae ResizeObserver (lo usa ResponsiveContainer de recharts)
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  async function renderWith(state: Record<string, unknown>) {
    studyState.current = { steps: STEPS3, operators: OPS, cycles: [], costConfig: { productValue: 0, targetCycleTime: 60, monthlyProductionTarget: 0 }, ...state };
    const { default: SkillsMatrix } = await import("@/components/Skills/SkillsMatrix");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(React.createElement(SkillsMatrix)));
    return host;
  }

  it("estado vacío explica qué datos faltan", async () => {
    const el = await renderWith({ cycles: [] });
    expect(el.textContent).toMatch(/Registra al menos 4 ciclos por operario con el cronómetro por pasos/);
  });

  it("con datos muestra curva, matriz ILUO accesible y alertas", async () => {
    // Ana: duración total con curva del 85 % y tiempos por paso estables (experta)
    const anaSteps = [around(10, 0.02, 12), around(20, 0.02, 12), around(30, 0.02, 12)];
    const ana = wrightSeries(90, 0.85, 12).map((d, k) => cycle(1, d, anaSteps.map((s) => s[k])));
    const beto = cyclesFromSteps(2, [around(11, 0.05, 6), around(28, 0.05, 6), around(50, 0.05, 6)]);
    const el = await renderWith({ cycles: [...ana, ...beto] });
    const text = el.textContent ?? "";
    expect(text).toMatch(/Curva de aprendizaje por operario/);
    expect(text).toMatch(/85 %/); // tasa de aprendizaje de Ana
    expect(text).toMatch(/Ya alcanzó el estándar/);
    expect(text).toMatch(/Matriz de competencias \(ILUO\)/);
    expect(text).toMatch(/Alertas de entrenamiento/);
    // celdas accesibles: el nivel está en la etiqueta, no solo en el color
    const cells = Array.from(el.querySelectorAll("td button[aria-label]")).map((b) => b.getAttribute("aria-label")!);
    expect(cells.length).toBe(6); // 2 operarios con datos × 3 pasos
    expect(cells.some((l) => /^Beto, Paso 3 .*En entrenamiento \(I\)/.test(l))).toBe(true);
    expect(cells.some((l) => /Repeticiones: 12/.test(l))).toBe(true);
    expect(el.querySelectorAll("table").length).toBe(1);

    // seleccionar a Beto (6 ciclos) cambia la curva
    const betoBtn = Array.from(el.querySelectorAll('button[aria-pressed]')).find((b) => b.textContent?.startsWith("Beto"))!;
    act(() => (betoBtn as HTMLButtonElement).click());
    expect(betoBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("sin tiempos por paso explica cómo obtenerlos", async () => {
    const auto = wrightSeries(100, 0.85, 6).map((d) => cycle(1, d));
    const el = await renderWith({ cycles: auto });
    expect(el.textContent).toMatch(/Aún no hay tiempos por paso/);
    expect(el.textContent).toMatch(/cronómetro por pasos/);
  });
});
