/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Pruebas de la matemática del motor Monte Carlo (src/workers/montecarlo.worker.ts),
// base del documento docs/paper-montecarlo-kronos.md. Entradas deterministas y valores
// conocidos analíticamente; Math.random se sustituye por un PRNG con semilla.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalInv, normalCDF, lhsSample, antitheticLHS, haltonSingle, haltonQMC,
  pertSample, andersonDarling, adNormal, adLogNormal, adTriangular, percentileCI,
  sobolFirstOrder, capabilityIndices, valueAtRisk95, runSimulation, type SimInput,
} from "@/workers/montecarlo.worker";

/** PRNG Mulberry32: reproducible, uniforme en [0,1). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedRandom(seed: number) {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
}

afterEach(() => {
  vi.restoreAllMocks();
});

const baseInput: SimInput = {
  simCount: 20000, dist: "normal", effMean: 100, effStd: 10, target: 116.4485,
  tMin: 80, tMax: 130, meanShift: 0, times: [95, 100, 105],
  avgHourlyCost: 15000, qty: 1000, price: 5000, baseMean: 100, baseStd: 10,
  samplingMode: "lhs",
};

describe("módulo del worker", () => {
  it("se puede importar fuera de un Web Worker sin registrar onmessage en window", () => {
    expect(window.onmessage).toBeNull();
  });
});

describe("normalInv / normalCDF", () => {
  it("reproduce cuantiles normales conocidos", () => {
    expect(normalInv(0.5)).toBeCloseTo(0, 9);
    expect(normalInv(0.975)).toBeCloseTo(1.959963985, 7);
    expect(normalInv(0.95)).toBeCloseTo(1.644853627, 7);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232306, 7); // rama de colas (Moro)
    expect(normalInv(0.999)).toBeCloseTo(3.090232306, 7);
  });

  it("es antisimétrica y está acotada en los extremos", () => {
    for (const p of [0.01, 0.1, 0.3, 0.42, 0.45]) {
      expect(normalInv(p)).toBeCloseTo(-normalInv(1 - p), 9);
    }
    expect(normalInv(0)).toBe(-8);
    expect(normalInv(1)).toBe(8);
  });

  it("normalCDF reproduce Φ conocido (error A&S < 7.5e-8)", () => {
    const tol = 7.5e-8; // cota de error de Abramowitz & Stegun 26.2.17
    expect(Math.abs(normalCDF(0) - 0.5)).toBeLessThan(tol);
    expect(Math.abs(normalCDF(1.96) - 0.9750021049)).toBeLessThan(tol);
    expect(Math.abs(normalCDF(-1.644853627) - 0.05)).toBeLessThan(tol);
    expect(Math.abs(normalCDF(3) - 0.9986501020)).toBeLessThan(tol);
  });

  it("normalCDF(normalInv(p)) ≈ p", () => {
    for (let p = 0.001; p < 1; p += 0.0499) {
      expect(Math.abs(normalCDF(normalInv(p)) - p)).toBeLessThan(1e-7);
    }
  });
});

describe("secuencia de Halton", () => {
  it("base 2 (van der Corput): 1/2, 1/4, 3/4, 1/8, 5/8, 3/8, 7/8", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => haltonSingle(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875]);
  });

  it("base 3: 1/3, 2/3, 1/9, 4/9, 7/9", () => {
    const got = [0, 1, 2, 3, 4].map((i) => haltonSingle(i, 3));
    [1 / 3, 2 / 3, 1 / 9, 4 / 9, 7 / 9].forEach((v, i) => expect(got[i]).toBeCloseTo(v, 12));
  });

  it("sin desplazamiento, 1024 puntos caen uno en cada estrato de ancho 1/1024", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // offset = 0
    const N = 1024;
    const u = haltonQMC(N);
    const counts = new Array(N).fill(0);
    u.forEach((x) => counts[Math.floor(x * N)]++);
    expect(counts.every((c) => c === 1)).toBe(true);
  });

  it("el desplazamiento aleatorio se aplica módulo 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.3);
    const u = haltonQMC(8);
    u.forEach((x, i) => {
      expect(x).toBeCloseTo((haltonSingle(i, 2) + 0.3) % 1, 12);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });
});

describe("Latin Hypercube + antitéticas", () => {
  it("LHS deja exactamente una muestra en cada estrato", () => {
    seedRandom(7);
    const N = 500;
    const strata = Array.from(lhsSample(N), (x) => Math.floor(x * N)).sort((a, b) => a - b);
    expect(strata).toEqual(Array.from({ length: N }, (_, i) => i));
  });

  it("las variables antitéticas forman pares u, 1−u (también con N impar)", () => {
    seedRandom(11);
    const N = 101;
    const u = antitheticLHS(N);
    expect(u.length).toBe(N);
    for (let i = 0; i + 1 < N; i += 2) expect(u[i] + u[i + 1]).toBeCloseTo(1, 12);
    u.forEach((x) => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); });
  });
});

describe("Beta-PERT (aproximación normal)", () => {
  const a = 10, m = 12, b = 30;

  it("siempre queda dentro de [a, b]", () => {
    for (let i = 0; i <= 1000; i++) {
      const v = pertSample(i / 1000, a, m, b);
      expect(v).toBeGreaterThanOrEqual(a);
      expect(v).toBeLessThanOrEqual(b);
    }
  });

  it("u = 0.5 devuelve la media PERT (a + 4m + b)/6", () => {
    expect(pertSample(0.5, a, m, b)).toBeCloseTo((a + 4 * m + b) / 6, 10);
  });

  it("es monótona en u y degenera a m si b ≤ a", () => {
    let prev = -Infinity;
    for (let i = 1; i < 100; i++) {
      const v = pertSample(i / 100, a, m, b);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(pertSample(0.3, 5, 7, 5)).toBe(7);
  });
});

describe("Anderson–Darling", () => {
  const N = 200;
  const normalQuantiles = Array.from({ length: N }, (_, i) => normalInv((i + 0.5) / N));

  it("A² ≈ 0 para los cuantiles exactos de una normal", () => {
    expect(adNormal(normalQuantiles, 0, 1)).toBeLessThan(0.05);
  });

  it("acepta datos normales simulados (A² < 2.492, crítico 5% con parámetros conocidos)", () => {
    const rnd = mulberry32(2024);
    const xs = Array.from({ length: 500 }, () => 50 + 5 * normalInv(rnd())).sort((p, q) => p - q);
    expect(adNormal(xs, 50, 5)).toBeLessThan(2.492);
  });

  it("rechaza una uniforme ajustada como normal y distingue la lognormal", () => {
    const uniform = Array.from({ length: N }, (_, i) => -1.7 + (3.4 * (i + 0.5)) / N);
    expect(adNormal(uniform, 0, 1)).toBeGreaterThan(adNormal(normalQuantiles, 0, 1) + 1);

    const logn = normalQuantiles.map((z) => Math.exp(3 + 0.6 * z)); // ya ordenada
    const mean = logn.reduce((s, x) => s + x, 0) / N;
    const sd = Math.sqrt(logn.reduce((s, x) => s + (x - mean) ** 2, 0) / (N - 1));
    expect(adLogNormal(logn)).toBeLessThan(adNormal(logn, mean, sd));
    expect(adLogNormal(logn)).toBeLessThan(0.1);
  });

  it("acepta una triangular y rechaza una uniforme con el mismo rango", () => {
    // Cuantiles exactos de Tri(0, 5, 10). El soporte se estima con el mínimo y el
    // máximo muestrales, por eso A² no es ≈ 0 pero queda muy por debajo del crítico.
    const tri = Array.from({ length: N }, (_, i) => {
      const u = (i + 0.5) / N;
      return u < 0.5 ? Math.sqrt(u * 10 * 5) : 10 - Math.sqrt((1 - u) * 10 * 5);
    });
    const unif = Array.from({ length: N }, (_, i) => (10 * (i + 0.5)) / N);
    expect(adTriangular(tri, 5)).toBeLessThan(1);
    expect(adTriangular(unif, 5)).toBeGreaterThan(adTriangular(tri, 5) + 1);
  });

  it("devuelve 999 cuando no hay datos suficientes o σ = 0", () => {
    expect(andersonDarling([1, 2, 3], normalCDF)).toBe(999);
    expect(adNormal(normalQuantiles, 0, 0)).toBe(999);
  });
});

describe("intervalo de confianza de percentiles", () => {
  it("usa la aproximación binomial N·p ± 1.96·√(N·p·(1−p))", () => {
    const sorted = Float64Array.from({ length: 1000 }, (_, i) => i);
    // μ = 500, σ = √250 ≈ 15.81 → [⌊469.0⌋, ⌈531.0⌉]
    expect(percentileCI(sorted, 0.5)).toEqual([469, 531]);
  });
});

describe("índices de capacidad, nivel sigma y DPMO", () => {
  it("Cp, Cpk, Cpm y nivel sigma para μ = 52, σ = 6, objetivo (LSE) = 60", () => {
    const r = capabilityIndices(60, 52, 36, 6);
    expect(r.cp).toBeCloseTo(60 / 36, 12);       // 1.667
    expect(r.cpk).toBeCloseTo(8 / 18, 12);       // 0.444
    expect(r.cpm).toBeCloseTo(1, 12);            // τ = √(36 + 64) = 10 → 60/60
    expect(r.sigmaLevel).toBeCloseTo(4 / 3, 12);
    expect(r.sigmaSix).toBeCloseTo(4 / 3 + 1.5, 12);
    // DPMO teórico = (1 − Φ(4/3))·10⁶ ≈ 91 211
    expect(Math.abs(r.dpmoTheoretical - 91211)).toBeLessThanOrEqual(1);
  });

  it("Cpk = nivel sigma / 3 y media en el objetivo ⇒ 500 000 DPMO", () => {
    const r = capabilityIndices(100, 100, 25, 5);
    expect(r.cpk).toBe(0);
    expect(r.sigmaLevel).toBe(0);
    expect(r.dpmoTheoretical).toBe(500000);
  });

  it("4.5σ de largo plazo (6σ con corrimiento de 1.5) ⇒ ≈ 3.4 DPMO", () => {
    const r = capabilityIndices(145, 100, 100, 10);
    expect(r.sigmaSix).toBe(6);
    expect(r.dpmoTheoretical).toBe(3);
    expect(capabilityIndices(1000, 100, 100, 10).sigmaSix).toBe(6); // tope en 6
  });

  it("σ = 0 no divide por cero", () => {
    const r = capabilityIndices(60, 50, 0, 0);
    expect(Number.isFinite(r.cp)).toBe(true);
    expect(r.denomStd).toBe(1e-9);
  });
});

describe("VaR y CVaR al 95%", () => {
  it("valores exactos sobre tiempos 1…100 y utilidad lineal", () => {
    const sorted = Float64Array.from({ length: 100 }, (_, i) => i + 1);
    const profit = (t: number) => 1000 - 10 * t;
    const expected = profit(50.5);          // 495
    const worst = profit(sorted[95]);       // p95 = 96 → 40
    const { var95, cvar } = valueAtRisk95(sorted, profit, expected, worst);
    expect(var95).toBeCloseTo(455, 10);
    // Cola = tiempos 96…100 → utilidad media 20 → CVaR = 475
    expect(cvar).toBeCloseTo(475, 10);
    // Como pérdidas frente al esperado, el CVaR (promedio de la cola) es ≥ VaR
    expect(cvar).toBeGreaterThanOrEqual(var95);
  });
});

describe("Sobol de primer orden (estimador de Saltelli)", () => {
  // Para Y = q·(p − k·t·c) con entradas independientes, los índices de primer orden son exactos:
  //   S_p = (Eq)²·Var(p)/V   S_q = (EZ)²·Var(q)/V   S_t = (Eq·k·Ec)²·Var(t)/V   S_c = (Eq·k·Et)²·Var(c)/V
  // con Z = p − k·t·c y V = E[q²]·E[Z²] − (Eq·EZ)².
  function exactSobol(times: number[], price: number, qty: number, cost: number, u: number) {
    const k = 1 / 3600;
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const Et = mean(times);
    const Vt = mean(times.map((t) => (t - Et) ** 2));
    const vu = (x: number) => (x * u) ** 2 / 3; // varianza de U(x(1−u), x(1+u))
    const [Vp, Vq, Vc] = [vu(price), vu(qty), vu(cost)];
    const EZ = price - k * Et * cost;
    // E[Z²] = Var(p) + k²·Var(t·c) + (EZ)², con Var(t·c) = E[t²]E[c²] − (Et·Ec)²
    const Vtc = (Vt + Et ** 2) * (Vc + cost ** 2) - (Et * cost) ** 2;
    const EZ2 = Vp + k ** 2 * Vtc + EZ ** 2;
    const V = (Vq + qty ** 2) * EZ2 - (qty * EZ) ** 2;
    return {
      "Valor producto": (qty ** 2 * Vp) / V,
      "Volumen mensual": (EZ ** 2 * Vq) / V,
      "Tiempo ciclo": ((qty * k * cost) ** 2 * Vt) / V,
      "Costo M.O.": ((qty * k * Et) ** 2 * Vc) / V,
    } as Record<string, number>;
  }

  it("coincide con los índices analíticos del modelo de utilidad", () => {
    seedRandom(11);
    const times = Array.from({ length: 200 }, (_, i) => 60 + i); // tiempos de 60 a 259 s
    const r = sobolFirstOrder(times, 5000, 1000, 15000, 0.1, 40000);
    const exact = exactSobol(times, 5000, 1000, 15000, 0.1);
    for (const { name, si, si_pct } of r) {
      expect(Math.abs(si - exact[name])).toBeLessThan(0.03);
      expect(si_pct).toBeCloseTo(si * 100, 12);
    }
    // Ordenados de mayor a menor
    expect(r.map((x) => x.si)).toEqual([...r.map((x) => x.si)].sort((a, b) => b - a));
  });

  it("sin incertidumbre económica, todo se explica por el tiempo de ciclo", () => {
    seedRandom(3);
    const r = sobolFirstOrder([80, 90, 100, 110, 120], 5000, 1000, 15000, 0, 8000);
    expect(r[0].name).toBe("Tiempo ciclo");
    expect(r[0].si).toBeGreaterThan(0.95);
    r.slice(1).forEach((x) => expect(x.si).toBeLessThan(0.02));
  });

  it("si el tiempo es constante, su índice es ~0", () => {
    seedRandom(4);
    const r = sobolFirstOrder([100, 100, 100], 5000, 1000, 15000, 0.1, 8000);
    expect(r.find((x) => x.name === "Tiempo ciclo")!.si).toBeLessThan(0.02);
  });

  it("en una simulación completa, los índices son coherentes y suman ≈ 1 (modelo casi aditivo)", () => {
    seedRandom(5);
    const r = runSimulation({ ...baseInput, simCount: 5000 });
    expect(r.sobol).toHaveLength(4);
    const total = r.sobol.reduce((s, x) => s + x.si, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThan(1.1);
  });
});

describe("runSimulation (extremo a extremo, semilla fija)", () => {
  it("normal μ = 100, σ = 10: momentos, percentiles, P(cumple) y DPMO", () => {
    seedRandom(42);
    const progress: number[] = [];
    const r = runSimulation(baseInput, (p) => progress.push(p));

    expect(r.mean).toBeCloseTo(100, 0);
    expect(Math.abs(r.std - 10)).toBeLessThan(0.2);
    expect(Math.abs(r.p50 - 100)).toBeLessThan(0.5);
    expect(Math.abs(r.p95 - 116.4485)).toBeLessThan(0.5);
    expect(r.p5).toBeLessThan(r.p50);
    expect(r.p50).toBeLessThan(r.p95);
    expect(r.ciLow).toBeLessThan(100);
    expect(r.ciHigh).toBeGreaterThan(100);

    // objetivo = μ + 1.645σ ⇒ P(t ≤ objetivo) ≈ 0.95
    expect(Math.abs(r.probMeetTarget - 0.95)).toBeLessThan(0.005);
    expect(r.dpmo).toBe(Math.round((1 - r.probMeetTarget) * 1e6));

    // Capacidad con σ efectiva conocida
    expect(r.cp).toBeCloseTo(116.4485 / 60, 12);
    expect(r.cpk).toBeCloseTo((116.4485 - r.mean) / 30, 12);
    expect(r.sigmaLevel).toBeCloseTo(3 * r.cpk, 12);

    // Riesgo económico: utilidad decreciente en el tiempo ⇒ 0 ≤ VaR ≤ CVaR
    expect(r.var95).toBeGreaterThan(0);
    expect(r.cvar).toBeGreaterThanOrEqual(r.var95);
    expect(r.best).toBeGreaterThan(r.expected);
    expect(r.worst).toBeLessThan(r.expected);

    // Histograma y CDF cubren todos los escenarios
    expect(r.histogram.reduce((s, h) => s + h.count, 0)).toBe(baseInput.simCount);
    expect(r.cdf[r.cdf.length - 1].prob).toBe(100);

    // El progreso nunca retrocede y termina en 99 (el 100 lo pone el componente)
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    expect(progress[progress.length - 1]).toBe(99);
  });

  it("QMC Halton converge a la misma media", () => {
    seedRandom(3);
    const r = runSimulation({ ...baseInput, samplingMode: "qmc", simCount: 4096 });
    expect(Math.abs(r.mean - 100)).toBeLessThan(0.1);
    expect(Math.abs(r.std - 10)).toBeLessThan(0.2);
  });

  it("triangular: soporte [μ − 2.5σ, μ + 2.5σ] y media en la moda simétrica", () => {
    seedRandom(9);
    const r = runSimulation({ ...baseInput, dist: "triangular", effMean: 50, effStd: 4, target: 55 });
    expect(r.minT).toBeGreaterThanOrEqual(40);
    expect(r.maxT).toBeLessThanOrEqual(60);
    expect(Math.abs(r.mean - 50)).toBeLessThan(0.1);
  });

  it("PERT: todos los escenarios dentro de [t_min, t_max]", () => {
    seedRandom(13);
    const r = runSimulation({ ...baseInput, dist: "pert", effMean: 50, effStd: 6, tMin: 40, tMax: 80, target: 60 });
    expect(r.minT).toBeGreaterThanOrEqual(40);
    expect(r.maxT).toBeLessThanOrEqual(80);
  });

  it("lognormal conserva la media y la desviación objetivo", () => {
    seedRandom(17);
    const r = runSimulation({ ...baseInput, dist: "lognormal", effMean: 60, effStd: 12, target: 80 });
    expect(r.minT).toBeGreaterThan(0);
    expect(Math.abs(r.mean - 60)).toBeLessThan(0.3);
    expect(Math.abs(r.std - 12)).toBeLessThan(0.4);
    expect(r.adScores.lognormal).toBeLessThan(r.adScores.normal);
  });
});
