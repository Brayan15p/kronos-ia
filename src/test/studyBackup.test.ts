/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect } from "vitest";
import { parseStudy, serializeStudy, StudyBackupError, type StudyData } from "@/lib/studyBackup";
import { PROCESS_TEMPLATES } from "@/lib/processTemplates";

const study: StudyData = {
  steps: PROCESS_TEMPLATES[1].steps,
  operators: [{ id: 1, name: "Ana", hourlyCost: 15000 }],
  cycles: [{
    id: "c1", operatorId: 1, operatorName: "Ana", cycleNumber: 1, duration: 12.5,
    steps: [{ stepNumber: 1, stepName: "Unir hombros", duration: 12.5, timestamp: new Date("2026-10-30T10:00:00Z") }],
    timestamp: new Date("2026-10-30T10:00:12Z"), qualityPass: true, defects: [], notes: "",
  }],
  defects: [{
    id: "d1", cycleId: "c1", operatorId: 1, type: "Costura", severity: "leve", description: "",
    timestamp: new Date("2026-10-30T10:01:00Z"),
  }],
  qualityChecks: [],
  costConfig: { productValue: 5000, targetCycleTime: 330, monthlyProductionTarget: 1000 },
};

describe("respaldo del estudio", () => {
  it("ida y vuelta conserva los datos y revive las fechas", () => {
    const back = parseStudy(serializeStudy(study));
    expect(back).toEqual(study);
    expect(back.cycles[0].timestamp).toBeInstanceOf(Date);
    expect(back.cycles[0].steps[0].timestamp).toBeInstanceOf(Date);
  });

  it("acepta también el estado plano guardado en el navegador", () => {
    expect(parseStudy(JSON.stringify(study)).cycles).toHaveLength(1);
  });

  it("rechaza archivos ajenos, dañados o incompletos con un mensaje claro", () => {
    expect(() => parseStudy("{no es json")).toThrow(StudyBackupError);
    expect(() => parseStudy(JSON.stringify({ format: "otra-app", data: study }))).toThrow(/no es un respaldo/);
    expect(() => parseStudy(JSON.stringify({ format: "kronos-study", version: 99, data: study }))).toThrow(/más nueva/);
    const { cycles: _omit, ...partial } = study;
    expect(() => parseStudy(JSON.stringify(partial))).toThrow(/cycles/);
    expect(() => parseStudy(JSON.stringify({ ...study, cycles: [{ ...study.cycles[0], timestamp: "ayer" }] }))).toThrow(/Fecha/);
  });
});

describe("plantillas de proceso", () => {
  it("tienen ids únicos, pasos numerados desde 1 y tiempo objetivo positivo", () => {
    const ids = PROCESS_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of PROCESS_TEMPLATES) {
      expect(t.targetCycleTime).toBeGreaterThan(0);
      expect(t.steps.map((s) => s.number)).toEqual(t.steps.map((_, i) => i + 1));
    }
  });
});
