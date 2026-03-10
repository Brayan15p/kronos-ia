import React, { createContext, useContext, useState, useCallback } from "react";

export interface CycleRecord {
  id: string;
  operatorId: number;
  operatorName: string;
  cycleNumber: number;
  duration: number; // in seconds
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

interface TimeStudyState {
  cycles: CycleRecord[];
  defects: DefectRecord[];
  qualityChecks: QualityCheck[];
  addCycle: (cycle: CycleRecord) => void;
  removeCycle: (cycleId: string) => void;
  addDefect: (defect: DefectRecord) => void;
  addQualityCheck: (check: QualityCheck) => void;
  clearAll: () => void;
}

const TimeStudyContext = createContext<TimeStudyState | null>(null);

export const useTimeStudy = () => {
  const ctx = useContext(TimeStudyContext);
  if (!ctx) throw new Error("useTimeStudy must be within provider");
  return ctx;
};

export const TimeStudyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cycles, setCycles] = useState<CycleRecord[]>([]);
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);

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

  const clearAll = useCallback(() => {
    setCycles([]);
    setDefects([]);
    setQualityChecks([]);
  }, []);

  return (
    <TimeStudyContext.Provider value={{ cycles, defects, qualityChecks, addCycle, removeCycle, addDefect, addQualityCheck, clearAll }}>
      {children}
    </TimeStudyContext.Provider>
  );
};
