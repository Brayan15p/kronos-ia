/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import { CycleDetector, handsCentroid, type DetectedCycle, type Point } from "@/lib/cycleDetector";

const HOME: Point = { x: 0.5, y: 0.7 };
const FPS = 30;
const FRAME = 1000 / FPS;

/** Trayectoria sintética: `home` s en casa y `away` s trabajando lejos, con ruido determinista. */
function simulate(detector: CycleDetector, cycles: { home: number; away: number }[], noise = 0.02) {
  const out: DetectedCycle[] = [];
  let t = 0;
  let k = 0;
  const jitter = () => noise * Math.sin(k++ * 1.7);
  const run = (seconds: number, at: (f: number) => Point) => {
    const frames = Math.round(seconds * FPS);
    for (let f = 0; f < frames; f++) {
      const c = detector.update(t, at(f / frames));
      if (c) out.push(c);
      t += FRAME;
    }
  };
  for (const c of cycles) {
    run(c.home, () => ({ x: HOME.x + jitter(), y: HOME.y + jitter() }));
    // sale, llega a 0.3 de distancia y vuelve
    run(c.away, (p) => ({ x: HOME.x + 0.3 * Math.sin(Math.PI * p) + jitter(), y: HOME.y - 0.1 * Math.sin(Math.PI * p) }));
  }
  run(1, () => HOME);
  return out;
}

describe("CycleDetector", () => {
  it("no detecta nada sin calibrar la posición inicial", () => {
    const d = new CycleDetector();
    expect(simulate(d, [{ home: 1, away: 5 }])).toEqual([]);
    expect(d.status).toBe("uncalibrated");
  });

  it("mide ciclos repetidos con su duración real", () => {
    const d = new CycleDetector();
    d.setHome(HOME);
    const cycles = simulate(d, [
      { home: 1, away: 5 },
      { home: 1, away: 5 },
      { home: 1, away: 7 },
    ]);
    expect(cycles).toHaveLength(3);
    // El primero cuenta desde la primera salida; los siguientes de vuelta a vuelta (casa + trabajo).
    expect(cycles[1].duration).toBeCloseTo(6, 0);
    expect(cycles[2].duration).toBeCloseTo(8, 0);
    expect(cycles[0].duration).toBeLessThan(cycles[1].duration);
  });

  it("el temblor en casa no genera ciclos falsos (histéresis)", () => {
    const d = new CycleDetector();
    d.setHome(HOME);
    // ruido de ±0.09: cruza el radio de entrada pero no el de salida
    const out: DetectedCycle[] = [];
    for (let i = 0; i < 600; i++) {
      const c = d.update(i * FRAME, { x: HOME.x + 0.09 * Math.sin(i), y: HOME.y });
      if (c) out.push(c);
    }
    expect(out).toEqual([]);
  });

  it("ignora salidas muy cortas y ciclos por debajo del mínimo", () => {
    const d = new CycleDetector({ minAwayMs: 600, minCycleMs: 2000 });
    d.setHome(HOME);
    expect(simulate(d, [{ home: 1, away: 0.3 }, { home: 0.2, away: 1 }])).toEqual([]);
  });

  it("descarta el ciclo en curso si las manos desaparecen mucho tiempo", () => {
    const d = new CycleDetector({ maxGapMs: 3000 });
    d.setHome(HOME);
    let t = 0;
    d.update(t, HOME);
    d.update((t += 100), { x: 0.9, y: 0.7 }); // sale
    for (let i = 0; i < 200; i++) d.update((t += FRAME), null); // ~6,6 s sin manos
    expect(d.status).toBe("home");
    expect(d.update((t += 100), HOME)).toBeNull();
  });

  it("rechaza radios inválidos", () => {
    expect(() => new CycleDetector({ enterRadius: 0.2, exitRadius: 0.1 })).toThrow();
  });
});

describe("handsCentroid", () => {
  it("promedia las muñecas visibles", () => {
    expect(handsCentroid([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual({ x: 0.5, y: 0.5 });
    expect(handsCentroid([null, { x: 0.2, y: 0.4 }])).toEqual({ x: 0.2, y: 0.4 });
    expect(handsCentroid([null, undefined])).toBeNull();
  });
});
