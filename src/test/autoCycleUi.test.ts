/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Flujo completo de los pasos automáticos en el panel de Vision AI, con movimiento sintético:
// enseñar el método → reconocer pasos y omisiones de cada ciclo → enviar al estudio con tiempos por paso.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CycleRecord } from "@/context/TimeStudyContext";
import type { FeatureFrame } from "@/lib/stepRecognition";
import { TEMPLATE_KEY } from "@/lib/stepRecognition";
import { STEPS, synth } from "./synthMotion";

const added: CycleRecord[] = [];
const studyState = {
  current: {
    operators: [{ id: 1, name: "Ana", hourlyCost: 15000 }],
    steps: STEPS.map((s) => ({ ...s, emoji: "" })),
    cycles: [] as CycleRecord[],
    addCycle: (c: CycleRecord) => { added.push(c); },
  },
};

vi.mock("@/context/TimeStudyContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/context/TimeStudyContext")>()),
  useTimeStudy: () => studyState.current,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("Ciclos automáticos: pasos reconocidos desde el video", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    localStorage.removeItem(TEMPLATE_KEY);
    added.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.useRealTimers();
  });

  const button = (el: HTMLElement, text: RegExp) =>
    [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? "") || text.test(b.getAttribute("aria-label") ?? ""))!;

  it("aprende el método con un ciclo de referencia y reconoce un paso omitido", async () => {
    const { default: AutoCyclePanel } = await import("@/components/VisionAI/AutoCyclePanel");
    // Trayectoria de la sesión: referencia (t = 0) y luego dos ciclos, uno completo y otro sin el paso 3.
    const ref = synth([0, 1, 2, 3], [1, 1, 1, 1], 0.02, 1, 0);
    const full = synth([0, 1, 2, 3], [1.2, 0.9, 1.1, 0.8], 0.03, 2, 20000);
    const skip = synth([0, 1, 3], [1, 1, 1], 0.03, 3, 40000);
    const all: FeatureFrame[] = [...ref.frames, ...full.frames, ...skip.frames];
    const getFrames = (a: number, b: number) => all.filter((f) => f.t >= a && f.t <= b);
    const span = (s: { frames: FeatureFrame[] }) => ({
      start: s.frames[0].t, end: s.frames[s.frames.length - 1].t,
      duration: (s.frames[s.frames.length - 1].t - s.frames[0].t) / 1000,
    });

    let cycles: { start: number; end: number; duration: number }[] = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const draw = () => act(() => root!.render(React.createElement(AutoCyclePanel, {
      status: "home", cycles, isActive: true, onCalibrate: () => {}, onClear: () => { cycles = []; }, getFrames,
    })));
    draw();

    // Enseñar: el observador marca el inicio de cada paso en el ciclo de referencia.
    vi.setSystemTime(ref.truth[0].start);
    act(() => button(host!, /Enseñar el método/).click());
    for (let i = 1; i < 4; i++) {
      vi.setSystemTime(ref.truth[i].start);
      act(() => button(host!, /Empieza «/).click());
    }
    vi.setSystemTime(ref.frames[ref.frames.length - 1].t);
    act(() => button(host!, /Terminó el ciclo/).click());
    expect(host.textContent).toMatch(/Método aprendido: 4 pasos/);
    expect(localStorage.getItem(TEMPLATE_KEY)).not.toBeNull();

    // Llegan dos ciclos detectados: se muestran sus pasos y el omitido tachado.
    cycles = [span(full), span(skip)];
    draw();
    const struck = [...host.querySelectorAll("span.line-through")].map((s) => s.textContent);
    expect(struck).toEqual(["3"]);
    expect(host.textContent).toMatch(/confianza alta/);

    // Enviar: los ciclos llegan al estudio con tiempos por paso y la omisión.
    act(() => button(host!, /Enviar al estudio/).click());
    expect(added).toHaveLength(2);
    expect(added[0].steps.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4]);
    expect(added[0].omittedSteps).toEqual([]);
    expect(added[0].stepsSource).toBe("vision");
    expect(added[1].steps.map((s) => s.stepNumber)).toEqual([1, 2, 4]);
    expect(added[1].omittedSteps).toEqual([3]);
    const sum = added[0].steps.reduce((s, x) => s + x.duration, 0);
    expect(sum).toBeCloseTo(added[0].duration, 0);
  });

  it("si los pasos del estudio cambiaron, pide volver a enseñar", async () => {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify({
      version: 1, createdAt: "", between: 1,
      steps: [{ stepNumber: 1, name: "Otro", frames: [[0, 0, 0, 0], [1, 1, 1, 1]], refDuration: 1 }],
    }));
    const { default: AutoCyclePanel } = await import("@/components/VisionAI/AutoCyclePanel");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(React.createElement(AutoCyclePanel, {
      status: "home", cycles: [], isActive: true, onCalibrate: () => {}, onClear: () => {}, getFrames: () => [],
    })));
    expect(host.textContent).toMatch(/Los pasos del estudio cambiaron/);
  });
});
