/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import {
  buildTemplate, frameFeature, parseTemplate, recognizeSteps, resample, templateMatchesSteps,
  type Feature, type FeatureFrame, type MethodTemplate,
} from "@/lib/stepRecognition";
import { REF_DUR, rng, STEPS, synth } from "./synthMotion";

function reference(): MethodTemplate {
  const { frames, truth } = synth([0, 1, 2, 3], [1, 1, 1, 1], 0.01, 1);
  return buildTemplate(frames, truth.map((x) => x.start), STEPS)!;
}

describe("rasgos del fotograma", () => {
  it("mide las muñecas desde el centro de los hombros, en anchos de hombro", () => {
    const f = frameFeature({ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, null)!;
    expect(f.map((v) => +v.toFixed(6))).toEqual([-1, 1, 1, 1]);
  });
  it("si falta una mano usa la última posición conocida; sin manos no hay rasgo", () => {
    const f = frameFeature({ x: 0.5, y: 0.5 }, null, null, null, [9, 9, 7, 7])!;
    expect(f).toEqual([0, 0, 7, 7]);
    expect(frameFeature(null, null, null, null, [1, 1, 1, 1])).toBeNull();
  });
  it("remuestrea por tiempo con interpolación", () => {
    const r = resample([{ t: 0, f: [0, 0, 0, 0] }, { t: 1000, f: [10, 0, 0, 0] }], 5);
    expect(r.map((x) => x.f[0])).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe("plantilla del método", () => {
  it("guarda una trayectoria por paso con su duración de referencia", () => {
    const tpl = reference();
    expect(tpl.steps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4]);
    tpl.steps.forEach((s, i) => expect(s.refDuration).toBeCloseTo(REF_DUR[i], 1));
    expect(tpl.between).toBeGreaterThan(0.3);
  });
  it("rechaza marcas que no cuadran con los pasos", () => {
    const { frames } = synth([0, 1, 2, 3], [1, 1, 1, 1], 0.01, 1);
    expect(buildTemplate(frames, [0, 100], STEPS)).toBeNull();
    expect(buildTemplate(frames, [0, 5000, 4000, 8000], STEPS)).toBeNull();
  });
  it("se guarda y se lee, y detecta si los pasos cambiaron", () => {
    const tpl = reference();
    expect(parseTemplate(JSON.stringify(tpl))).toEqual(tpl);
    expect(parseTemplate("{roto")).toBeNull();
    expect(parseTemplate(JSON.stringify({ ...tpl, between: -1 }))).toBeNull();
    expect(templateMatchesSteps(tpl, STEPS)).toBe(true);
    expect(templateMatchesSteps(tpl, [...STEPS.slice(0, 3), { number: 4, name: "Otro" }])).toBe(false);
  });
});

describe("reconocimiento de pasos (ciclos sintéticos)", () => {
  const tpl = reference();
  const abs = (x: number) => Math.abs(x);

  it("reconoce los 4 pasos de ciclos con otro ritmo y ruido, sin omisiones falsas", () => {
    const errors: number[] = [];
    for (let seed = 10; seed < 40; seed++) {
      const { u } = rng(seed);
      const warp = [0, 1, 2, 3].map(() => 0.7 + 0.7 * u());
      const { frames, truth } = synth([0, 1, 2, 3], warp, 0.03, seed);
      const r = recognizeSteps(frames, tpl)!;
      expect(r.omitted).toEqual([]);
      expect(r.steps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4]);
      r.steps.forEach((s, i) => errors.push(abs(s.duration - (truth[i].end - truth[i].start) / 1000)));
      expect(r.confidence).not.toBe("baja");
    }
    const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
    expect(mae).toBeLessThan(0.3); // resolución de 0,2 s (5 Hz)
    expect(Math.max(...errors)).toBeLessThan(0.8);
  });

  it("detecta el paso omitido en el medio, al inicio y al final", () => {
    for (const skip of [0, 1, 2, 3]) {
      for (let seed = 50; seed < 60; seed++) {
        const done = [0, 1, 2, 3].filter((s) => s !== skip);
        const { frames } = synth(done, [1.1, 0.9, 1.2], 0.03, seed);
        const r = recognizeSteps(frames, tpl)!;
        expect(r.omitted).toEqual([skip + 1]);
        expect(r.steps.map((s) => s.stepNumber)).toEqual(done.map((s) => s + 1));
      }
    }
  });

  it("los tiempos de paso suman el ciclo y van en orden", () => {
    const { frames } = synth([0, 1, 2, 3], [1.3, 0.8, 1, 1.2], 0.02, 77, 5000);
    const r = recognizeSteps(frames, tpl)!;
    const total = r.steps.reduce((s, x) => s + x.duration, 0);
    expect(total).toBeCloseTo((frames[frames.length - 1].t - frames[0].t) / 1000, 1);
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i].start).toBe(r.steps[i - 1].end);
  });

  it("un movimiento que no se parece al método sale con confianza baja", () => {
    const { n } = rng(5);
    const frames: FeatureFrame[] = Array.from({ length: 300 }, (_, k) => ({
      t: k * 33, f: [3 + n(), -3 + n(), 3 + n(), -3 + n()] as Feature,
    }));
    expect(recognizeSteps(frames, tpl)!.confidence).toBe("baja");
  });

  it("sin fotogramas no hay resultado", () => {
    expect(recognizeSteps([], tpl)).toBeNull();
  });
});
