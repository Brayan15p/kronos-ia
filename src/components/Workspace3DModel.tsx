import React, { useState, useRef } from "react";
import { useSST, getLuxCompliance, getDbCompliance, type MeasurementPoint3D } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Plus, Trash2, Sun, Volume2, MousePointer2 } from "lucide-react";
import operarioImg from "@/assets/operario-origami.png";

const compToColor = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "#22c55e" : level === "warning" ? "#eab308" : "#ef4444";

const Workspace3DModel: React.FC = () => {
  const { operators } = useTimeStudy();
  const { workstations, addWorkstation, addMeasurementPoint, updateMeasurementPoint, removeMeasurementPoint } = useSST();
  const [selOp, setSelOp] = useState(operators[0]?.id ?? 0);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [newLux, setNewLux] = useState("350");
  const [newDb, setNewDb] = useState("72");
  const [editLux, setEditLux] = useState("");
  const [editDb, setEditDb] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  let ws = workstations.find((w) => w.operatorId === selOp);

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    let wsId = ws?.id;
    if (!ws) {
      const op = operators.find((o) => o.id === selOp);
      wsId = Date.now();
      addWorkstation({
        id: wsId,
        operatorId: selOp,
        operatorName: op?.name || "Operario",
        zone: "Estación Principal",
        measurementPoints: [],
      });
    }
    const pointId = crypto.randomUUID();
    addMeasurementPoint(wsId!, {
      id: pointId,
      label: `Punto ${(ws?.measurementPoints.length ?? 0) + 1}`,
      position: [Math.round(x * 10) / 10, Math.round(y * 10) / 10, 0],
      lux: Number(newLux) || 350,
      db: Number(newDb) || 72,
      operatorId: selOp,
    });
    setPlacingMode(false);
  };

  const handleUpdatePoint = () => {
    if (!ws || !selectedPoint) return;
    updateMeasurementPoint(ws.id, selectedPoint, Number(editLux) || 0, Number(editDb) || 0);
    setSelectedPoint(null);
  };

  const handleDeletePoint = () => {
    if (!ws || !selectedPoint) return;
    removeMeasurementPoint(ws.id, selectedPoint);
    setSelectedPoint(null);
  };

  ws = workstations.find((w) => w.operatorId === selOp);
  const points = ws?.measurementPoints ?? [];
  const selPointData = points.find((p) => p.id === selectedPoint);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Operario</label>
            <select value={selOp} onChange={(e) => { setSelOp(Number(e.target.value)); setSelectedPoint(null); }} className="input-glass mt-1">
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Sun className="w-3 h-3" /> Lux</label>
            <input type="number" value={newLux} onChange={(e) => setNewLux(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Volume2 className="w-3 h-3" /> dB</label>
            <input type="number" value={newDb} onChange={(e) => setNewDb(e.target.value)} className="input-glass mt-1 w-24" />
          </div>
          <button
            onClick={() => setPlacingMode(!placingMode)}
            className={`mt-5 flex items-center gap-2 text-xs ${placingMode ? "btn-primary-glass" : "btn-secondary-glass"}`}
          >
            <Plus className="w-4 h-4" /> {placingMode ? "Click en la imagen..." : "Colocar Punto"}
          </button>
          <div className="mt-5 text-xs text-muted-foreground">
            {points.length} puntos {placingMode && <span className="text-primary">· 🎯 Haz clic sobre la imagen del operario</span>}
          </div>
        </div>
      </div>

      {/* Interactive Image */}
      <div
        ref={containerRef}
        className={`glass-card overflow-hidden rounded-xl relative select-none ${placingMode ? "cursor-crosshair" : "cursor-default"}`}
        style={{ height: 520, background: "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 50%, hsl(var(--muted)) 100%)" }}
        onClick={handleImageClick}
      >
        <img
          src={operarioImg}
          alt="Operario en estación de trabajo"
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />

        {/* Measurement points overlay */}
        {points.map((point) => {
          const luxLevel = getLuxCompliance(point.lux);
          const dbLevel = getDbCompliance(point.db);
          const worst = luxLevel === "critical" || dbLevel === "critical" ? "critical" : luxLevel === "warning" || dbLevel === "warning" ? "warning" : "ok";
          const color = compToColor(worst);
          const isSelected = selectedPoint === point.id;

          return (
            <div
              key={point.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${point.position[0]}%`, top: `${point.position[1]}%` }}
              onClick={(e) => {
                e.stopPropagation();
                if (isSelected) {
                  setSelectedPoint(null);
                } else {
                  setSelectedPoint(point.id);
                  setEditLux(String(point.lux));
                  setEditDb(String(point.db));
                }
              }}
            >
              {/* Pulse ring */}
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-30"
                style={{ background: color, width: 28, height: 28, margin: "-6px" }}
              />
              {/* Point */}
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-lg cursor-pointer transition-transform hover:scale-150"
                style={{
                  background: color,
                  boxShadow: `0 0 12px ${color}80, 0 0 24px ${color}40`,
                  transform: isSelected ? "scale(1.5)" : undefined,
                }}
              />
              {/* Tooltip */}
              <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 glass-card px-3 py-2 text-[10px] min-w-[120px] pointer-events-none transition-opacity z-10 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.3)" }}
              >
                <p className="font-bold text-foreground text-center">{point.label}</p>
                <div className="flex justify-between mt-1">
                  <span style={{ color: "#facc15" }}>☀️ {point.lux} lux</span>
                  <span style={{ color: "#38bdf8" }}>🔊 {point.db} dB</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Placing mode indicator */}
        {placingMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-card px-4 py-2 flex items-center gap-2 z-10 border border-primary/40">
            <MousePointer2 className="w-4 h-4 text-primary animate-bounce" />
            <span className="text-xs text-primary font-semibold">Haz clic para colocar punto de medición</span>
          </div>
        )}
      </div>

      {/* Edit selected point */}
      {selPointData && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-bold text-sm text-foreground">{selPointData.label}</h3>
            <div className="flex-1 grid grid-cols-2 gap-3 min-w-[200px]">
              <div>
                <label className="text-xs text-muted-foreground">☀️ Lux</label>
                <input type="number" value={editLux} onChange={(e) => setEditLux(e.target.value)} className="input-glass mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">🔊 dB</label>
                <input type="number" value={editDb} onChange={(e) => setEditDb(e.target.value)} className="input-glass mt-1" />
              </div>
            </div>
            <button onClick={handleUpdatePoint} className="btn-primary-glass text-xs mt-4">Actualizar</button>
            <button onClick={handleDeletePoint} className="btn-secondary-glass text-xs mt-4 text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Points Summary */}
      {points.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="font-display font-bold text-sm text-foreground mb-2">📍 Puntos de Medición</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {points.map((p) => {
              const worst = getLuxCompliance(p.lux) === "critical" || getDbCompliance(p.db) === "critical" ? "critical"
                : getLuxCompliance(p.lux) === "warning" || getDbCompliance(p.db) === "warning" ? "warning" : "ok";
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPoint(p.id); setEditLux(String(p.lux)); setEditDb(String(p.db)); }}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${
                    selectedPoint === p.id ? "border-primary bg-primary/10" : "border-border/30 bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: compToColor(worst) }} />
                    <p className="font-semibold text-foreground">{p.label}</p>
                  </div>
                  <p className="text-yellow-400 font-mono">{p.lux} lux</p>
                  <p className="text-blue-400 font-mono">{p.db} dB</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace3DModel;
