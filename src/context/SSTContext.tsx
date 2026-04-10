import React, { createContext, useContext, useState, useCallback } from "react";

export interface EnvironmentalReading {
  id: string;
  operatorId: number;
  operatorName: string;
  zone: string;
  lux: number;
  db: number;
  timestamp: Date;
  notes: string;
}

export interface MeasurementPoint3D {
  id: string;
  label: string;
  position: [number, number, number];
  lux: number;
  db: number;
  operatorId: number;
}

export interface WorkstationConfig {
  id: number;
  operatorId: number;
  operatorName: string;
  zone: string;
  measurementPoints: MeasurementPoint3D[];
}

// Colombian regulation limits
export const REGULATIONS = {
  lux: { min: 300, max: 500, label: "Res. 2400/1979 - Trabajo fino" },
  db8h: { max: 85, label: "Res. 1792/1990 - 8h" },
  db4h: { max: 90, label: "Res. 1792/1990 - 4h" },
  db2h: { max: 95, label: "Res. 1792/1990 - 2h" },
};

export type ComplianceLevel = "ok" | "warning" | "critical";

export const getLuxCompliance = (lux: number): ComplianceLevel => {
  if (lux >= REGULATIONS.lux.min && lux <= REGULATIONS.lux.max) return "ok";
  if (lux >= 200 && lux < 300) return "warning";
  if (lux > 500 && lux <= 700) return "warning";
  return "critical";
};

export const getDbCompliance = (db: number): ComplianceLevel => {
  if (db <= 80) return "ok";
  if (db <= REGULATIONS.db8h.max) return "warning";
  return "critical";
};

interface SSTState {
  readings: EnvironmentalReading[];
  workstations: WorkstationConfig[];
  addReading: (reading: EnvironmentalReading) => void;
  removeReading: (id: string) => void;
  addWorkstation: (ws: WorkstationConfig) => void;
  removeWorkstation: (id: number) => void;
  addMeasurementPoint: (wsId: number, point: MeasurementPoint3D) => void;
  updateMeasurementPoint: (wsId: number, pointId: string, lux: number, db: number) => void;
  removeMeasurementPoint: (wsId: number, pointId: string) => void;
  clearSST: () => void;
}

const SSTContext = createContext<SSTState | null>(null);

export const useSST = () => {
  const ctx = useContext(SSTContext);
  if (!ctx) throw new Error("useSST must be within SSTProvider");
  return ctx;
};

export const SSTProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [readings, setReadings] = useState<EnvironmentalReading[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationConfig[]>([]);

  const addReading = useCallback((r: EnvironmentalReading) => {
    setReadings((prev) => [...prev, r]);
  }, []);

  const removeReading = useCallback((id: string) => {
    setReadings((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const addWorkstation = useCallback((ws: WorkstationConfig) => {
    setWorkstations((prev) => [...prev, ws]);
  }, []);

  const removeWorkstation = useCallback((id: number) => {
    setWorkstations((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const addMeasurementPoint = useCallback((wsId: number, point: MeasurementPoint3D) => {
    setWorkstations((prev) =>
      prev.map((w) =>
        w.id === wsId ? { ...w, measurementPoints: [...w.measurementPoints, point] } : w
      )
    );
  }, []);

  const updateMeasurementPoint = useCallback((wsId: number, pointId: string, lux: number, db: number) => {
    setWorkstations((prev) =>
      prev.map((w) =>
        w.id === wsId
          ? {
              ...w,
              measurementPoints: w.measurementPoints.map((p) =>
                p.id === pointId ? { ...p, lux, db } : p
              ),
            }
          : w
      )
    );
  }, []);

  const removeMeasurementPoint = useCallback((wsId: number, pointId: string) => {
    setWorkstations((prev) =>
      prev.map((w) =>
        w.id === wsId
          ? { ...w, measurementPoints: w.measurementPoints.filter((p) => p.id !== pointId) }
          : w
      )
    );
  }, []);

  const clearSST = useCallback(() => {
    setReadings([]);
    setWorkstations([]);
  }, []);

  return (
    <SSTContext.Provider
      value={{
        readings, workstations,
        addReading, removeReading,
        addWorkstation, removeWorkstation,
        addMeasurementPoint, updateMeasurementPoint, removeMeasurementPoint,
        clearSST,
      }}
    >
      {children}
    </SSTContext.Provider>
  );
};
