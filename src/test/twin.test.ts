/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import { applyScenarioToTasks, baseScenario, presetScenarios, simulateScenario, type TwinBase } from "@/lib/twin";
import type { TaskTime } from "@/lib/lineBalance";

const task = (number: number, samples: number[]): TaskTime => {
  const m = samples.reduce((s, x) => s + x, 0) / samples.length;
  const sd = Math.sqrt(samples.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, samples.length - 1));
  return { number, name: `Paso ${number}`, mean: m, sd, samples };
};

// 3 pasos fijos de 30 s → 90 s de trabajo. 1 turno de 8 h sin pausas, 25 días → 720.000 s/mes.
const base: TwinBase = {
  tasks: [task(1, [30]), task(2, [30]), task(3, [30])],
  demand: { unitsPerMonth: 12000, daysPerMonth: 25, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 0 },
  hourlyCost: 15000,
  unitPrice: 2000,
};

describe("gemelo digital: escenario base", () => {
  it("calcula takt, estaciones, capacidad, costo y margen a mano", () => {
    const r = simulateScenario(base, baseScenario(base), 500);
    expect(r.takt).toBeCloseTo(60, 10);           // 720.000 / 12.000
    expect(r.stations).toBe(2);                    // 90 s de trabajo en takt 60 → 2 estaciones (60 + 30)
    expect(r.cycleTime).toBe(60);
    expect(r.capacityPerMonth).toBeCloseTo(12000, 6);
    expect(r.meetsDemand).toBe(true);
    expect(r.pLate).toBe(0);                       // tiempos fijos: nunca supera el takt
    expect(r.labourCostPerMonth).toBe(2 * 8 * 25 * 15000); // 6.000.000
    expect(r.revenuePerMonth).toBeCloseTo(12000 * 2000, 4);
    expect(r.marginPerMonth).toBeCloseTo(24_000_000 - 6_000_000, 4);
    expect(r.labourCostPerUnit).toBeCloseTo(500, 6);
    expect(r.efficiency).toBeCloseTo(0.75, 10);    // 90 / (2 × 60)
  });
});

describe("gemelo digital: palancas", () => {
  it("más demanda sin cambiar la línea la deja corta de capacidad", () => {
    const r = simulateScenario(base, { ...baseScenario(base), demandChangePct: 50, stations: 2 }, 500);
    expect(r.demand).toBeCloseTo(18000, 6);
    expect(r.meetsDemand).toBe(false);
    expect(r.unitsPerMonth).toBeCloseTo(12000, 6); // limitada por la capacidad
  });

  it("acortar el cuello de botella sube la capacidad", () => {
    const r = simulateScenario(base, { ...baseScenario(base), stations: 2, stepChangePct: { 1: -50, 2: -50 } }, 500);
    // estaciones [15+15 | 30] → ciclo 30 s → capacidad 24.000
    expect(r.cycleTime).toBe(30);
    expect(r.capacityPerMonth).toBeCloseTo(24000, 6);
  });

  it("un segundo turno duplica el tiempo disponible y el costo de la nómina", () => {
    const s = { ...baseScenario(base), shiftsPerDay: 2, stations: 2 };
    const r = simulateScenario(base, s, 500);
    expect(r.takt).toBeCloseTo(120, 10);
    expect(r.capacityPerMonth).toBeCloseTo(24000, 6);
    expect(r.labourCostPerMonth).toBe(2 * 2 * 8 * 25 * 15000);
  });

  it("reducir la variabilidad concentra las observaciones sin cambiar la media", () => {
    const [t] = applyScenarioToTasks([task(1, [10, 20, 30])], { ...baseScenario(base), variabilityReductionPct: 50 });
    expect(t.samples).toEqual([15, 20, 25]);
    expect(t.mean).toBe(20);
    expect(t.sd).toBeCloseTo(5, 10);
  });

  it("menos variabilidad baja el riesgo de superar el takt", () => {
    // Takt 72 s (720.000 / 10.000) por encima de la media de 60 s: solo la observación de 80 s lo supera.
    const noisy: TwinBase = {
      ...base,
      tasks: [task(1, [40, 50, 60, 70, 80])],
      demand: { ...base.demand, unitsPerMonth: 10000 },
    };
    const s0 = { ...baseScenario(noisy), stations: 1 };
    const before = simulateScenario(noisy, s0, 4000);
    const after = simulateScenario(noisy, { ...s0, variabilityReductionPct: 80 }, 4000);
    expect(before.takt).toBeCloseTo(72, 10);
    expect(before.pLate).toBeGreaterThan(0.15);    // ≈ 20 %
    expect(before.pLate).toBeLessThan(0.25);
    expect(after.pLate).toBe(0);                   // 56–64 s: ya nunca supera 72 s
  });
});

describe("gemelo digital: reproducibilidad y casos límite", () => {
  it("el mismo escenario da exactamente los mismos números", () => {
    const noisy: TwinBase = { ...base, tasks: [task(1, [25, 30, 41]), task(2, [28, 35]), task(3, [20, 33, 38])] };
    const a = simulateScenario(noisy, baseScenario(noisy));
    const b = simulateScenario(noisy, baseScenario(noisy));
    expect(a).toEqual(b);
  });

  it("sin demanda no hay takt finito ni números inválidos", () => {
    const r = simulateScenario({ ...base, demand: { ...base.demand, unitsPerMonth: 0 } }, baseScenario(base), 200);
    for (const v of [r.capacityPerMonth, r.labourCostPerUnit, r.marginPerMonth, r.cycleTime]) expect(Number.isFinite(v)).toBe(true);
    expect(r.unitsPerMonth).toBe(0);
  });

  it("los escenarios prediseñados apuntan al paso más largo del cuello de botella", () => {
    const b: TwinBase = { ...base, tasks: [task(1, [10]), task(2, [50]), task(3, [20])], demand: { ...base.demand, unitsPerMonth: 9000 } };
    const presets = presetScenarios(b);
    expect(presets.map((p) => p.id)).toEqual(["cuello", "estandarizar", "demanda", "turno"]);
    expect(presets[0].scenario.stepChangePct).toEqual({ 2: -20 });
  });
});
