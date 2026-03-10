import React, { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useTimeStudy, DefectRecord } from "@/context/TimeStudyContext";

const DEFECT_TYPES = [
  "Pliegue desalineado",
  "Rasgadura del papel",
  "Asimetría en alas",
  "Base inestable",
  "Cuello mal formado",
  "Cola irregular",
  "Acabado deficiente",
  "Proporciones incorrectas",
];

const SEVERITY_COLORS = {
  leve: "bg-warning/20 text-warning",
  moderado: "bg-accent/20 text-accent",
  critico: "bg-destructive/20 text-destructive",
};

const DefectsModule: React.FC = () => {
  const { cycles, defects, addDefect } = useTimeStudy();
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [defectType, setDefectType] = useState("");
  const [severity, setSeverity] = useState<"leve" | "moderado" | "critico">("leve");
  const [description, setDescription] = useState("");

  const saveDefect = () => {
    if (!selectedCycleId || !defectType) return;
    const cycle = cycles.find((c) => c.id === selectedCycleId);
    if (!cycle) return;

    const defect: DefectRecord = {
      id: crypto.randomUUID(),
      cycleId: selectedCycleId,
      operatorId: cycle.operatorId,
      type: defectType,
      severity,
      description,
      timestamp: new Date(),
    };
    addDefect(defect);
    setDefectType("");
    setDescription("");
  };

  const defectsByType = DEFECT_TYPES.map((type) => ({
    type,
    count: defects.filter((d) => d.type === type).length,
  })).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="glass-card p-6 space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Registro de Defectos</h3>
            <p className="text-xs text-muted-foreground">Categorización de fallas</p>
          </div>
        </div>
        <div className="glass-card px-3 py-1.5">
          <span className="text-xs text-muted-foreground">Total: </span>
          <span className="font-mono font-bold text-destructive">{defects.length}</span>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Ciclo</label>
          <select
            value={selectedCycleId}
            onChange={(e) => setSelectedCycleId(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Seleccionar --</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.operatorName} - Ciclo #{c.cycleNumber}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Tipo de defecto</label>
          <select
            value={defectType}
            onChange={(e) => setDefectType(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Seleccionar --</option>
            {DEFECT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Severidad</label>
          <div className="flex gap-2 mt-1">
            {(["leve", "moderado", "critico"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold uppercase transition-all ${
                  severity === s ? SEVERITY_COLORS[s] + " border border-current/20" : "bg-muted/30 text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalle del defecto..."
            className="w-full mt-1 px-3 py-2 rounded-lg bg-muted/50 border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none h-16"
          />
        </div>
      </div>

      <button
        onClick={saveDefect}
        disabled={!selectedCycleId || !defectType}
        className="btn-danger-glass w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-4 h-4" /> Registrar Defecto
      </button>

      {/* Pareto-style summary */}
      {defectsByType.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pareto de defectos</p>
          {defectsByType.map((d) => {
            const pct = defects.length > 0 ? (d.count / defects.length) * 100 : 0;
            return (
              <div key={d.type} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{d.type}</span>
                  <span className="font-mono text-foreground">{d.count} ({Math.round(pct)}%)</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-destructive/70 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DefectsModule;
