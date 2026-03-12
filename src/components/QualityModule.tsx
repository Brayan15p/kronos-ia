import React, { useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { useTimeStudy, QualityCheck } from "@/context/TimeStudyContext";

const QUALITY_CRITERIA = [
  "Pliegues simétricos",
  "Alas bien definidas",
  "Base estable",
  "Cuello y cabeza formados",
  "Cola definida",
  "Sin rasgaduras",
  "Proporciones correctas",
  "Acabado limpio",
];

const QualityModule: React.FC = () => {
  const { cycles, qualityChecks, addQualityCheck } = useTimeStudy();
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(QUALITY_CRITERIA.map((c) => [c, false]))
  );

  const uncheckedCycles = cycles.filter(
    (c) => !qualityChecks.some((q) => q.cycleId === c.id)
  );

  const toggleCheck = (name: string) => {
    setChecks((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const saveCheck = () => {
    if (!selectedCycleId) return;
    const cycle = cycles.find((c) => c.id === selectedCycleId);
    if (!cycle) return;

    const criteria = QUALITY_CRITERIA.map((name) => ({ name, passed: checks[name] }));
    const overallPass = criteria.every((c) => c.passed);

    const qc: QualityCheck = {
      id: crypto.randomUUID(),
      cycleId: selectedCycleId,
      operatorId: cycle.operatorId,
      criteria,
      overallPass,
      timestamp: new Date(),
    };
    addQualityCheck(qc);
    setSelectedCycleId("");
    setChecks(Object.fromEntries(QUALITY_CRITERIA.map((c) => [c, false])));
  };

  const passRate = qualityChecks.length > 0
    ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100)
    : 0;

  return (
    <div className="glass-card p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-success/10 border border-success/20">
            <ClipboardCheck className="w-5 h-5 text-success" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Control de Calidad</h3>
            <p className="text-xs text-muted-foreground">Inspección de grulla de origami</p>
          </div>
        </div>
        <div className="glass-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Tasa: </span>
          <span className="font-mono font-bold text-success">{passRate}%</span>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Seleccionar ciclo</label>
        <select
          value={selectedCycleId}
          onChange={(e) => setSelectedCycleId(e.target.value)}
          className="select-glass mt-1"
        >
          <option value="">-- Seleccionar --</option>
          {uncheckedCycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.operatorName} - Ciclo #{c.cycleNumber}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {QUALITY_CRITERIA.map((name) => (
          <button
            key={name}
            onClick={() => toggleCheck(name)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
              checks[name]
                ? "bg-success/10 border border-success/30"
                : "bg-muted/20 border border-transparent hover:border-border/30"
            }`}
          >
            {checks[name] ? (
              <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className={checks[name] ? "text-foreground" : "text-muted-foreground"}>{name}</span>
          </button>
        ))}
      </div>

      <button
        onClick={saveCheck}
        disabled={!selectedCycleId}
        className="btn-primary-glass w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Guardar Inspección
      </button>

      {qualityChecks.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Últimas inspecciones</p>
          {qualityChecks.slice(-5).reverse().map((q) => {
            const cycle = cycles.find((c) => c.id === q.cycleId);
            const passCount = q.criteria.filter((c) => c.passed).length;
            return (
              <div key={q.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/20">
                <span className="text-muted-foreground">{cycle?.operatorName} #{cycle?.cycleNumber}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{passCount}/{q.criteria.length}</span>
                  {q.overallPass ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/20 text-success font-medium">OK</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/20 text-destructive font-medium">FALLA</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QualityModule;
