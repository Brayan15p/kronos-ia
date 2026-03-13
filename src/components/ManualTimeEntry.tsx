import React, { useState, useRef } from "react";
import { Plus, Upload, Edit2, Trash2, Check, X, Clock, FileUp } from "lucide-react";
import { useTimeStudy, CycleRecord, StepTiming } from "@/context/TimeStudyContext";

const parseTimeInput = (val: string): number => {
  // Accept formats: "45", "1:30", "1:30.50"
  const parts = val.split(":");
  if (parts.length === 1) return parseFloat(parts[0]) || 0;
  const mins = parseInt(parts[0]) || 0;
  const secParts = parts[1].split(".");
  const secs = parseInt(secParts[0]) || 0;
  const ms = secParts[1] ? parseInt(secParts[1]) / 100 : 0;
  return mins * 60 + secs + ms;
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
};

const ManualTimeEntry: React.FC = () => {
  const { operators, steps, cycles, addCycle, removeCycle, updateCycle } = useTimeStudy();
  const [selectedOp, setSelectedOp] = useState<number>(operators[0]?.id ?? 0);
  const [manualStepTimes, setManualStepTimes] = useState<string[]>(steps.map(() => ""));
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const [editStepTimes, setEditStepTimes] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedOperator = operators.find((o) => o.id === selectedOp);
  const opCycles = cycles.filter((c) => c.operatorId === selectedOp);

  // Reset manual times when steps change
  React.useEffect(() => {
    setManualStepTimes(steps.map(() => ""));
  }, [steps.length]);

  const handleManualAdd = () => {
    if (!selectedOperator) return;
    const stepTimings: StepTiming[] = steps.map((step, i) => ({
      stepNumber: step.number,
      stepName: step.name,
      duration: parseTimeInput(manualStepTimes[i] || "0"),
      timestamp: new Date(),
    }));
    const total = stepTimings.reduce((s, t) => s + t.duration, 0);
    if (total <= 0) return;
    const cycle: CycleRecord = {
      id: crypto.randomUUID(),
      operatorId: selectedOp,
      operatorName: selectedOperator.name,
      cycleNumber: opCycles.length + 1,
      duration: total,
      steps: stepTimings,
      timestamp: new Date(),
      qualityPass: true,
      defects: [],
      notes: "Entrada manual",
    };
    addCycle(cycle);
    setManualStepTimes(steps.map(() => ""));
  };

  const startEditCycle = (cycle: CycleRecord) => {
    setEditingCycleId(cycle.id);
    setEditStepTimes(steps.map((step) => {
      const found = cycle.steps.find((s) => s.stepNumber === step.number);
      return found ? formatTime(found.duration) : "0";
    }));
  };

  const saveEditCycle = () => {
    if (!editingCycleId) return;
    const newSteps: StepTiming[] = steps.map((step, i) => ({
      stepNumber: step.number,
      stepName: step.name,
      duration: parseTimeInput(editStepTimes[i] || "0"),
      timestamp: new Date(),
    }));
    updateCycle(editingCycleId, { steps: newSteps });
    setEditingCycleId(null);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOperator) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      // Skip header if it starts with non-numeric
      const startIdx = lines[0] && isNaN(parseFloat(lines[0].split(",")[0].split(";")[0])) ? 1 : 0;
      const newCycles: CycleRecord[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(/[,;]/).map((c) => c.trim());
        const stepTimings: StepTiming[] = steps.map((step, j) => ({
          stepNumber: step.number,
          stepName: step.name,
          duration: parseTimeInput(cols[j] || "0"),
          timestamp: new Date(),
        }));
        const total = stepTimings.reduce((s, t) => s + t.duration, 0);
        if (total > 0) {
          newCycles.push({
            id: crypto.randomUUID(),
            operatorId: selectedOp,
            operatorName: selectedOperator.name,
            cycleNumber: opCycles.length + newCycles.length + 1,
            duration: total,
            steps: stepTimings,
            timestamp: new Date(),
            qualityPass: true,
            defects: [],
            notes: "Importado CSV",
          });
        }
      }
      if (newCycles.length > 0) {
        newCycles.forEach((c) => addCycle(c));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-display font-bold text-foreground">Entrada Manual de Tiempos</p>
            <p className="text-xs text-muted-foreground">Agrega, edita y elimina ciclos manualmente o importa CSV</p>
          </div>
        </div>

        {/* Operator selector */}
        <div className="flex gap-2 items-center flex-wrap">
          <label className="text-xs text-muted-foreground">Operario:</label>
          <select
            value={selectedOp}
            onChange={(e) => setSelectedOp(Number(e.target.value))}
            className="input-glass text-xs py-1.5 w-44"
          >
            {operators.map((op) => (
              <option key={op.id} value={op.id}>{op.name}</option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-secondary-glass flex items-center gap-1.5 text-xs ml-auto"
          >
            <FileUp className="w-3.5 h-3.5" /> Importar CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVUpload} />
        </div>

        {/* Manual entry form */}
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Nuevo ciclo — Tiempos por paso (seg o mm:ss.ms)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {steps.map((step, i) => (
              <div key={step.number} className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground truncate block">{step.emoji} {step.name}</label>
                <input
                  value={manualStepTimes[i] || ""}
                  onChange={(e) => {
                    const arr = [...manualStepTimes];
                    arr[i] = e.target.value;
                    setManualStepTimes(arr);
                  }}
                  placeholder="ej: 15 o 1:30"
                  className="input-glass text-xs py-1"
                />
              </div>
            ))}
          </div>
          <button onClick={handleManualAdd} className="btn-primary-glass flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Agregar Ciclo Manual
          </button>
        </div>
      </div>

      {/* Cycles list with edit/delete */}
      {opCycles.length > 0 && (
        <div className="glass-card p-5 space-y-3 animate-fade-in">
          <p className="text-sm font-display font-bold text-foreground">
            Ciclos de {selectedOperator?.name} ({opCycles.length})
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto scroll-thin">
            {opCycles.map((cycle) => (
              <div key={cycle.id} className="rounded-lg bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">#{cycle.cycleNumber}</span>
                    <span className="text-xs font-mono text-foreground font-bold">{formatTime(cycle.duration)}</span>
                    <span className="text-[10px] text-muted-foreground">{cycle.steps.length} pasos</span>
                    {cycle.notes && <span className="text-[10px] text-accent">{cycle.notes}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {editingCycleId === cycle.id ? (
                      <>
                        <button onClick={saveEditCycle} className="text-success hover:text-success/80 p-1"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingCycleId(null)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-3.5 h-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEditCycle(cycle)} className="text-muted-foreground hover:text-primary p-1"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeCycle(cycle.id)} className="text-destructive/50 hover:text-destructive p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </div>

                {/* Step details — editable or readonly */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                  {editingCycleId === cycle.id
                    ? steps.map((step, i) => (
                        <div key={step.number} className="space-y-0.5">
                          <span className="text-[9px] text-muted-foreground truncate block">{step.emoji} {step.name}</span>
                          <input
                            value={editStepTimes[i] || ""}
                            onChange={(e) => {
                              const arr = [...editStepTimes];
                              arr[i] = e.target.value;
                              setEditStepTimes(arr);
                            }}
                            className="input-glass text-[10px] py-0.5 font-mono"
                          />
                        </div>
                      ))
                    : cycle.steps.map((st, i) => (
                        <div key={i} className="flex items-center gap-1 text-[10px] py-0.5 px-1.5 rounded bg-muted/10">
                          <span className="text-muted-foreground truncate">{steps[i]?.emoji || "•"} {st.stepName}</span>
                          <span className="font-mono text-primary ml-auto">{formatTime(st.duration)}</span>
                        </div>
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualTimeEntry;
