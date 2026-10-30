/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Prueba de humo de la interfaz del Copiloto de planta (src/components/Copilot/PlantCopilot.tsx).
import { describe, it, expect, vi, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EnvironmentalReading } from "@/context/SSTContext";

const studyState = {
  current: {
    steps: [], operators: [], cycles: [], defects: [], qualityChecks: [],
    costConfig: { productValue: 5000, targetCycleTime: 0, monthlyProductionTarget: 1000 },
  } as Record<string, unknown>,
};
const sstState = { current: { readings: [] as EnvironmentalReading[] } };

vi.mock("@/context/TimeStudyContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/context/TimeStudyContext")>()),
  useTimeStudy: () => studyState.current,
}));
vi.mock("@/context/SSTContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/context/SSTContext")>()),
  useSST: () => sstState.current,
}));

describe("PlantCopilot (render)", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  async function render() {
    const { default: PlantCopilot } = await import("@/components/Copilot/PlantCopilot");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(React.createElement(PlantCopilot)));
    return host;
  }

  it("sin datos dice exactamente qué medir primero", async () => {
    const el = await render();
    expect(el.textContent).toMatch(/Aún no hay datos para recomendar mejoras/);
    expect(el.textContent).toMatch(/Registra los primeros ciclos/);
  });

  it("con datos muestra el total estimado, el plan, las tarjetas y navega a la evidencia", async () => {
    sstState.current = {
      readings: [{ id: "r1", operatorId: 1, operatorName: "Ana", zone: "Prensa", lux: 0, db: 95, exposureHours: 8, timestamp: new Date(0), notes: "" }],
    };
    const el = await render();
    expect(el.textContent).toMatch(/Oportunidad mensual \(estimado\)/);
    expect(el.textContent).toMatch(/Plan de la semana/);
    expect(el.textContent).toMatch(/Ruido en Prensa: dosis diaria 400 %/);
    expect(el.textContent).toMatch(/riesgo\(s\) crítico\(s\) de seguridad/);

    const calc = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("¿Cómo se calculó?"))!;
    act(() => calc.click());
    expect(calc.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toMatch(/Impacto en salud: no monetizado/);

    const evidence = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Ver evidencia: Radar Ambiental"))!;
    act(() => evidence.click());
    expect(window.location.hash).toBe("#environment");

    const filter = [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Calidad ("))!;
    act(() => filter.click());
    expect(filter.getAttribute("aria-pressed")).toBe("true");
  });
});
