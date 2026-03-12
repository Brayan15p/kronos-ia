import React, { createContext, useContext, useState, useCallback } from "react";

export const CRANE_STEPS = [
  { number: 1, name: "Corte del papel", emoji: "✂️" },
  { number: 2, name: "Primer pliegue diagonal", emoji: "📐" },
  { number: 3, name: "Segundo pliegue diagonal", emoji: "📐" },
  { number: 4, name: "Pliegue base cuadrada", emoji: "🔲" },
  { number: 5, name: "Pliegues laterales sup.", emoji: "🔺" },
  { number: 6, name: "Pliegue pétalo superior", emoji: "🌸" },
  { number: 7, name: "Pliegues laterales inf.", emoji: "🔻" },
  { number: 8, name: "Pliegue pétalo inferior", emoji: "🌸" },
  { number: 9, name: "Formación del cuello", emoji: "🦢" },
  { number: 10, name: "Formación de la cola", emoji: "🪶" },
  { number: 11, name: "Formación de la cabeza", emoji: "👑" },
  { number: 12, name: "Apertura de alas", emoji: "🕊️" },
];

export interface StepTiming {
  stepNumber: number;
  stepName: string;
  duration: number;
  timestamp: Date;
}

export interface CycleRecord {
  id: string;
  operatorId: number;
  operatorName: string;
  cycleNumber: number;
  duration: number;
  steps: StepTiming[];
  timestamp: Date;
  qualityPass: boolean;
  defects: string[];
  notes: string;
}

export interface DefectRecord {
  id: string;
  cycleId: string;
  operatorId: number;
  type: string;
  severity: "leve" | "moderado" | "critico";
  description: string;
  timestamp: Date;
}

export interface QualityCheck {
  id: string;
  cycleId: string;
  operatorId: number;
  criteria: { name: string; passed: boolean }[];
  overallPass: boolean;
  timestamp: Date;
}

export interface OperatorConfig {
  id: number;
  name: string;
  hourlyCost: number;
}

export interface CostConfig {
  productValue: number;
  targetCycleTime: number;
  monthlyProductionTarget: number;
}

interface TimeStudyState {
  operators: OperatorConfig[];
  cycles: CycleRecord[];
  defects: DefectRecord[];
  qualityChecks: QualityCheck[];
  costConfig: CostConfig;
  addOperator: (name: string, hourlyCost: number) => void;
  removeOperator: (id: number) => void;
  addCycle: (cycle: CycleRecord) => void;
  removeCycle: (cycleId: string) => void;
  addDefect: (defect: DefectRecord) => void;
  addQualityCheck: (check: QualityCheck) => void;
  updateCostConfig: (config: Partial<CostConfig>) => void;
  clearAll: () => void;
}

const TimeStudyContext = createContext<TimeStudyState | null>(null);

export const useTimeStudy = () => {
  const ctx = useContext(TimeStudyContext);
  if (!ctx) throw new Error("useTimeStudy must be within provider");
  return ctx;
};

export const TimeStudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [operators, setOperators] = useState<OperatorConfig[]>([
    { id: 1, name: "Operario 1", hourlyCost: 15000 },
    { id: 2, name: "Operario 2", hourlyCost: 15000 },
  ]);
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [costConfig, setCostConfig] = useState<CostConfig>({
    productValue: 5000,
    targetCycleTime: 120,
    monthlyProductionTarget: 1000,
  });

  const addOperator = useCallback((name: string, hourlyCost: number) => {
    setOperators((prev) => {
      const maxId = prev.length > 0 ? Math.max(...prev.map((o) => o.id)) : 0;
      return [...prev, { id: maxId + 1, name, hourlyCost }];
    });
  }, []);

  const removeOperator = useCallback((id: number) => {
    setOperators((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const addCycle = useCallback((cycle: CycleRecord) => {
    setCycles((prev) => [...prev, cycle]);
  }, []);

  const removeCycle = useCallback((cycleId: string) => {
    setCycles((prev) => prev.filter((c) => c.id !== cycleId));
  }, []);

  const addDefect = useCallback((defect: DefectRecord) => {
    setDefects((prev) => [...prev, defect]);
  }, []);

  const addQualityCheck = useCallback((check: QualityCheck) => {
    setQualityChecks((prev) => [...prev, check]);
  }, []);

  const updateCostConfig = useCallback((config: Partial<CostConfig>) => {
    setCostConfig((prev) => ({ ...prev, ...config }));
  }, []);

  const clearAll = useCallback(() => {
    setCycles([]);
    setDefects([]);
    setQualityChecks([]);
  }, []);

  return (
    <TimeStudyContext.Provider
      value={{
        operators, cycles, defects, qualityChecks, costConfig,
        addOperator, removeOperator, addCycle, removeCycle,
        addDefect, addQualityCheck, updateCostConfig, clearAll,
      }}
    >
      {children}
    </TimeStudyContext.Provider>
  );
};
