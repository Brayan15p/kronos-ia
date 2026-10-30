/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import {
  availableSeconds, balanceLine, lineMetrics, minStations, stationRisk, stationsToMeetTakt, taktTime, taskTimes, type TaskTime,
} from "@/lib/lineBalance";
import type { CycleRecord } from "@/context/TimeStudyContext";

const task = (number: number, samples: number[]): TaskTime => {
  const m = samples.reduce((s, x) => s + x, 0) / samples.length;
  const sd = samples.length > 1 ? Math.sqrt(samples.reduce((s, x) => s + (x - m) ** 2, 0) / (samples.length - 1)) : 0;
  return { number, name: `Paso ${number}`, mean: m, sd, samples };
};
const fixed = (...means: number[]) => means.map((m, i) => task(i + 1, [m]));

/** PRNG reproducible (Mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("takt y tiempo disponible", () => {
  it("descuenta las pausas y reparte el tiempo entre la demanda", () => {
    const c = { unitsPerMonth: 1000, daysPerMonth: 24, shiftsPerDay: 1, hoursPerShift: 8, breakMinutesPerShift: 30 };
    expect(availableSeconds(c)).toBe((8 * 3600 - 30 * 60) * 24); // 648.000 s
    expect(taktTime(c)).toBeCloseTo(648, 10);
    expect(taktTime({ ...c, unitsPerMonth: 0 })).toBe(Infinity);
  });

  it("estaciones mínimas = ⌈trabajo total / takt⌉", () => {
    expect(minStations(fixed(25, 25, 25, 25), 30)).toBe(4);
    expect(minStations(fixed(30, 30), 30)).toBe(2); // exacto: no redondea de más
    expect(minStations(fixed(10), Infinity)).toBe(1);
  });
});

describe("balanceo óptimo", () => {
  it("reparte pasos iguales en partes iguales", () => {
    const st = balanceLine(fixed(5, 5, 5, 5), 2);
    expect(st.map((s) => s.mean)).toEqual([10, 10]);
  });

  it("encuentra el corte óptimo aunque no sea el más obvio", () => {
    // [9,1 | 1,1,8] = 10/10 es mejor que [9,1,1 | 1,8] = 11/9
    const st = balanceLine(fixed(9, 1, 1, 1, 8), 2);
    expect(Math.max(...st.map((s) => s.mean))).toBe(10);
  });

  it("coincide con la fuerza bruta en casos aleatorios", () => {
    const r = rng(7);
    for (let trial = 0; trial < 60; trial++) {
      const n = 2 + Math.floor(r() * 7);
      const k = 1 + Math.floor(r() * n);
      const tasks = fixed(...Array.from({ length: n }, () => 1 + Math.floor(r() * 30)));
      // fuerza bruta: todas las formas de poner k−1 cortes entre n pasos
      let bestMax = Infinity;
      const rec = (start: number, left: number, acc: number) => {
        if (left === 1) {
          bestMax = Math.min(bestMax, Math.max(acc, tasks.slice(start).reduce((s, t) => s + t.mean, 0)));
          return;
        }
        for (let end = start + 1; end <= n - left + 1; end++) {
          rec(end, left - 1, Math.max(acc, tasks.slice(start, end).reduce((s, t) => s + t.mean, 0)));
        }
      };
      rec(0, k, 0);
      const st = balanceLine(tasks, k);
      expect(st).toHaveLength(k);
      expect(st.flatMap((s) => s.tasks.map((t) => t.number))).toEqual(tasks.map((t) => t.number)); // conserva el orden
      expect(Math.max(...st.map((s) => s.mean))).toBe(bestMax);
    }
  });

  it("no crea más estaciones que pasos y suma varianzas por estación", () => {
    const st = balanceLine([task(1, [8, 10, 12]), task(2, [4, 6])], 5);
    expect(st).toHaveLength(2);
    const both = balanceLine([task(1, [8, 10, 12]), task(2, [4, 6])], 1)[0];
    expect(both.sd).toBeCloseTo(Math.sqrt(2 ** 2 + Math.SQRT2 ** 2), 10);
    expect(balanceLine([], 3)).toEqual([]);
  });
});

describe("indicadores de la línea", () => {
  it("tiempo de ciclo, eficiencia, demora, suavidad y producción", () => {
    const st = balanceLine(fixed(10, 8), 2);
    const m = lineMetrics(st, 12);
    expect(m.cycleTime).toBe(10);
    expect(m.bottleneck).toBe(1);
    expect(m.efficiency).toBeCloseTo(0.9, 10);
    expect(m.balanceDelay).toBeCloseTo(0.1, 10);
    expect(m.smoothness).toBeCloseTo(2, 10);
    expect(m.unitsPerHour).toBeCloseTo(360, 10);
    expect(m.meetsTakt).toBe(true);
    expect(lineMetrics(st, 9).meetsTakt).toBe(false);
  });
});

describe("riesgo por estación (Monte Carlo)", () => {
  it("es 0 o 1 cuando todas las combinaciones quedan del mismo lado del takt", () => {
    const [st] = balanceLine([task(1, [10, 12]), task(2, [20, 21])], 1);
    expect(stationRisk(st, 40, 2000, rng(1)).pOverTakt).toBe(0);
    expect(stationRisk(st, 25, 2000, rng(1)).pOverTakt).toBe(1);
  });

  it("estima la probabilidad de superar el takt con el remuestreo", () => {
    const [st] = balanceLine([task(1, [1, 2, 3, 4])], 1);
    const r = stationRisk(st, 2.5, 20000, rng(3));
    expect(r.pOverTakt).toBeCloseTo(0.5, 1);
    expect(r.p95).toBe(4);
  });
});

describe("tiempos por paso desde el estudio", () => {
  const cycle = (d: number, steps: [number, number][]): CycleRecord => ({
    id: String(d), operatorId: 1, operatorName: "A", cycleNumber: 1, duration: d,
    steps: steps.map(([n, t]) => ({ stepNumber: n, stepName: `P${n}`, duration: t, timestamp: new Date() })),
    timestamp: new Date(), qualityPass: true, defects: [], notes: "",
  });
  const steps = [{ number: 1, name: "Cortar", emoji: "" }, { number: 2, name: "Coser", emoji: "" }, { number: 3, name: "Sin datos", emoji: "" }];

  it("promedia cada paso y omite los que no tienen mediciones", () => {
    const t = taskTimes(steps, [cycle(30, [[1, 10], [2, 20]]), cycle(34, [[1, 12], [2, 22]])]);
    expect(t.map((x) => [x.name, x.mean])).toEqual([["Cortar", 11], ["Coser", 21]]);
  });

  it("sin tiempos por paso usa el ciclo completo como una sola tarea", () => {
    const t = taskTimes(steps, [cycle(30, []), cycle(40, [])]);
    expect(t).toHaveLength(1);
    expect(t[0].name).toBe("Ciclo completo");
    expect(t[0].mean).toBe(35);
  });
});

describe("estaciones necesarias de verdad", () => {
  it("puede necesitar más que el mínimo teórico porque los pasos no se parten", () => {
    // total 30, takt 10 → mínimo teórico 3, pero [6,6,6,6,6] no cabe en 3 estaciones de 10
    const tasks = fixed(6, 6, 6, 6, 6);
    expect(minStations(tasks, 10)).toBe(3);
    expect(stationsToMeetTakt(tasks, 10)).toEqual({ stations: 5, tooLong: [] });
  });

  it("coincide con el mínimo teórico cuando el reparto lo permite", () => {
    expect(stationsToMeetTakt(fixed(5, 5, 5, 5), 10).stations).toBe(2);
  });

  it("avisa cuando un paso solo ya supera el takt", () => {
    const r = stationsToMeetTakt(fixed(4, 12, 3), 10);
    expect(r.stations).toBeNull();
    expect(r.tooLong.map((t) => t.mean)).toEqual([12]);
  });
});
