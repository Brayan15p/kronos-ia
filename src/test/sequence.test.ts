/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import type { CycleRecord, StepConfig } from "@/context/TimeStudyContext";
import {
  analyzeCycle, association, buildSequenceReport, fisherExact, liveDeviations, nextPendingIndex, outOfOrderIndices, stepMedians,
} from "@/lib/sequence";

const steps: StepConfig[] = [1, 2, 3, 4, 5].map((n) => ({ number: n, name: `P${n}`, emoji: "" }));

let id = 0;
const cycle = (order: [number, number][], extra: Partial<CycleRecord> = {}): CycleRecord => ({
  id: `c${++id}`, operatorId: 1, operatorName: "Ana", cycleNumber: id, duration: order.reduce((s, [, d]) => s + d, 0),
  steps: order.map(([n, d]) => ({ stepNumber: n, stepName: `P${n}`, duration: d, timestamp: new Date(0) })),
  timestamp: new Date(0), qualityPass: true, defects: [], notes: "", ...extra,
});
const normal = (extra: Partial<CycleRecord> = {}) => cycle([[1, 10], [2, 10], [3, 10], [4, 10], [5, 10]], extra);
const kinds = (c: CycleRecord, all = [normal(), normal(), normal(), normal(), normal()]) =>
  analyzeCycle(c, steps, stepMedians([...all, c]))!.deviations.map((d) => `${d.kind}:${d.stepNumber}`);

describe("orden: subsecuencia creciente más larga", () => {
  it("un intercambio marca un solo paso, el que se adelantó", () => {
    // 1, 3, 2, 4 → se adelantó el 3
    expect([...outOfOrderIndices([0, 2, 1, 3])]).toEqual([1]);
  });
  it("un paso hecho al final marca solo ese paso", () => {
    // 2, 3, 4, 5, 1 → el 1 quedó fuera de lugar
    expect([...outOfOrderIndices([1, 2, 3, 4, 0])]).toEqual([4]);
  });
  it("en orden no marca nada", () => {
    expect(outOfOrderIndices([0, 1, 2, 3, 4]).size).toBe(0);
    expect(outOfOrderIndices([]).size).toBe(0);
  });
});

describe("desviaciones por ciclo", () => {
  it("un ciclo en orden es conforme", () => {
    expect(kinds(normal())).toEqual([]);
  });

  it("detecta el paso fuera de orden y explica con cuál se cruzó", () => {
    const c = cycle([[1, 10], [3, 10], [2, 10], [4, 10], [5, 10]]);
    const a = analyzeCycle(c, steps, stepMedians([c]))!;
    expect(a.deviations.map((d) => d.kind)).toEqual(["fuera-de-orden"]);
    expect(a.deviations[0].stepNumber).toBe(3);
    expect(a.deviations[0].detail).toBe("P3 se hizo antes que P2");
    expect(a.deviated).toBe(true);
  });

  it("detecta repetidos (retrabajo)", () => {
    expect(kinds(cycle([[1, 10], [2, 10], [2, 10], [3, 10], [4, 10], [5, 10]]))).toEqual(["repetido:2"]);
  });

  it("un paso de menos del 25 % de su mediana es muy corto", () => {
    expect(kinds(cycle([[1, 10], [2, 2], [3, 10], [4, 10], [5, 10]]))).toEqual(["muy-corto:2"]);
    expect(kinds(cycle([[1, 10], [2, 2.6], [3, 10], [4, 10], [5, 10]]))).toEqual([]); // 26 % de 10 s
  });

  it("no marca muy corto con pocas lecturas o pasos de menos de 2 s", () => {
    const c = cycle([[1, 10], [2, 1], [3, 10], [4, 10], [5, 10]]);
    expect(analyzeCycle(c, steps, stepMedians([c, normal()]))!.deviations).toEqual([]);
  });

  it("omitido solo si lo marcó el observador; un hueco sin tiempo es 'sin registro'", () => {
    expect(kinds(cycle([[1, 10], [3, 10], [4, 10], [5, 10]], { omittedSteps: [2], sequenceMode: "observada" }))).toEqual(["omitido:2"]);
    const gap = analyzeCycle(cycle([[1, 10], [2, 0], [3, 10], [4, 10], [5, 10]]), steps, new Map())!;
    expect(gap.deviations.map((d) => d.kind)).toEqual(["sin-registro"]);
    expect(gap.deviated).toBe(false); // puede ser un olvido del observador
  });

  it("un ciclo guardado a medias no es una desviación", () => {
    const a = analyzeCycle(cycle([[1, 10], [2, 10]]), steps, new Map())!;
    expect(a.incomplete).toBe(true);
    expect(a.deviations).toEqual([]);
  });

  it("ciclos sin tiempos por paso no se analizan", () => {
    expect(analyzeCycle(cycle([]), steps, new Map())).toBeNull();
  });

  it("toma como defectuoso el ciclo con fallo de calidad, defectos o registro de defecto", () => {
    expect(analyzeCycle(normal({ qualityPass: false }), steps, new Map())!.defective).toBe(true);
    expect(analyzeCycle(normal({ defects: ["x"] }), steps, new Map())!.defective).toBe(true);
    const c = normal();
    expect(analyzeCycle(c, steps, new Map(), new Set([c.id]))!.defective).toBe(true);
    expect(analyzeCycle(normal(), steps, new Map())!.defective).toBe(false);
  });
});

describe("prueba exacta de Fisher", () => {
  it("coincide con valores de referencia", () => {
    expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.4857142857, 8); // la dama del té
    expect(fisherExact(5, 0, 0, 5)).toBeCloseTo(2 / 252, 10);
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
    expect(fisherExact(2, 2, 0, 0)).toBe(1); // una fila vacía: sin información
  });

  it("solo es significativa si desviarse empeora la calidad", () => {
    expect(association(5, 5, 5, 0).significant).toBe(true);
    expect(association(5, 0, 5, 5).significant).toBe(false); // al revés: no es un hallazgo
    expect(association(4, 3, 4, 1).significant).toBe(false); // muestra pequeña
  });
});

describe("reporte del estudio", () => {
  it("asocia la omisión de un paso con los defectos", () => {
    const cycles = [
      ...Array.from({ length: 8 }, () => normal()),
      normal({ qualityPass: false }),
      ...Array.from({ length: 6 }, () =>
        cycle([[1, 10], [3, 10], [4, 10], [5, 10]], { omittedSteps: [2], sequenceMode: "observada", qualityPass: false })),
    ];
    const r = buildSequenceReport(steps, cycles);
    expect(r.analyzed).toHaveLength(15);
    expect(r.deviated).toBe(6);
    expect(r.conforming).toBe(9);
    expect(r.observedOrderCycles).toBe(6);
    const p2 = r.steps.find((s) => s.stepNumber === 2)!;
    expect(p2.counts.omitido).toBe(6);
    expect(p2.association.rateWith).toBe(1);
    expect(p2.association.rateWithout).toBeCloseTo(1 / 9, 10);
    expect(p2.association.pValue).toBeLessThan(0.01);
    expect(r.findings.map((f) => f.stepNumber)).toEqual([2]);
  });

  it("separa los ciclos sin pasos y los guardados a medias", () => {
    const r = buildSequenceReport(steps, [normal(), cycle([]), cycle([[1, 10]])]);
    expect(r.withoutSteps).toBe(1);
    expect(r.incomplete).toBe(1);
    expect(r.conforming).toBe(1);
    expect(r.conformingRate).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it("calcula la tasa de desviación por operario", () => {
    const r = buildSequenceReport(steps, [
      normal(), normal({ operatorId: 2, operatorName: "Luis" }),
      cycle([[2, 10], [1, 10], [3, 10], [4, 10], [5, 10]], { operatorId: 2, operatorName: "Luis" }),
    ]);
    expect(r.operators.map((o) => [o.operatorName, o.rate])).toEqual([["Luis", 0.5], ["Ana", 0]]);
  });
});

describe("cronómetro en modo secuencia observada", () => {
  it("el siguiente paso es el próximo pendiente; si no hay, vuelve al primero pendiente", () => {
    expect(nextPendingIndex(steps, new Set([1]), 0)).toBe(1);
    expect(nextPendingIndex(steps, new Set([1, 2, 4]), 1)).toBe(2);
    expect(nextPendingIndex(steps, new Set([1, 3, 4, 5]), 4)).toBe(1);
    expect(nextPendingIndex(steps, new Set([1, 2, 3, 4, 5]), 2)).toBe(-1);
  });

  it("avisa en vivo de saltos y omisiones, sin confundir pasos pendientes", () => {
    expect(liveDeviations(steps, [1, 2], [])).toEqual([]);
    expect(liveDeviations(steps, [1, 4, 2], []).map((d) => `${d.kind}:${d.stepNumber}`)).toEqual(["fuera-de-orden:4"]);
    expect(liveDeviations(steps, [1, 3], [2]).map((d) => `${d.kind}:${d.stepNumber}`)).toEqual(["omitido:2"]);
  });
});
