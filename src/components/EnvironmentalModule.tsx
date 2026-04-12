import React, { useState, useMemo } from "react";
import { useSST, getLuxCompliance, getDbCompliance, REGULATIONS, calculateLEQ, calculateDailyDose, type MeasureType } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Plus, Trash2, Sun, Volume2, AlertTriangle, CheckCircle, XCircle, Settings2, MapPin } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

const complianceColor = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "text-green-400" : level === "warning" ? "text-yellow-400" : "text-red-400";

const complianceBg = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "bg-green-500/10 border-green-500/30" : level === "warning" ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30";

const ComplianceIcon: React.FC<{ level: "ok" | "warning" | "critical" }> = ({ level }) => {
  if (level === "ok") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (level === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
};

const heatColor = (value: number, min: number, max: number) => {
  const norm = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (norm <= 0.5) {
    const g = Math.round(200 + norm * 110);
    return `rgb(${Math.round(norm * 2 * 234)}, ${g}, 50)`;
  }
  const r = 234;
  const g = Math.round(200 - (norm - 0.5) * 2 * 200);
  return `rgb(${r}, ${g}, 50)`;
};

const MEASURE_TYPE_LABELS: Record<MeasureType, string> = {
  lux: "Solo Luz",
  db: "Solo Sonido",
  both: "Ambos",
};

const EnvironmentalModule: React.FC = () => {
  const { readings, addReading, removeReading, zones, addZone, updateZone, removeZone } = useSST();
  const { operators } = useTimeStudy();
  const [selOp, setSelOp] = useState(operators[0]?.id ?? 0);
  const [zone, setZone] = useState(zones[0]?.name ?? "Estación Principal");
  const [lux, setLux] = useState("350");
  const [db, setDb] = useState("72");
  const [exposureHours, setExposureHours] = useState("8");
  const [notes, setNotes] = useState("");
  const [showZoneConfig, setShowZoneConfig] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneSamples, setNewZoneSamples] = useState("5");
  const [newZoneMeasureType, setNewZoneMeasureType] = useState<MeasureType>("both");

  const selectedZoneConfig = zones.find((z) => z.name === zone);
  const zoneMeasureType = selectedZoneConfig?.measureType ?? "both";

  const handleAdd = () => {
    const op = operators.find((o) => o.id === selOp);
    if (!op) return;
    addReading({
      id: crypto.randomUUID(),
      operatorId: selOp,
      operatorName: op.name,
      zone,
      lux: zoneMeasureType === "db" ? 0 : Number(lux) || 0,
      db: zoneMeasureType === "lux" ? 0 : Number(db) || 0,
      exposureHours: Number(exposureHours) || 8,
      timestamp: new Date(),
      notes,
    });
    setNotes("");
  };

  const handleAddZone = () => {
    if (!newZoneName.trim()) return;
    addZone({ id: crypto.randomUUID(), name: newZoneName.trim(), requiredSamples: Number(newZoneSamples) || 5, measureType: newZoneMeasureType });
    setNewZoneName("");
    setNewZoneSamples("5");
    setNewZoneMeasureType("both");
  };

  const avgLux = readings.length > 0 ? readings.reduce((s, r) => s + r.lux, 0) / readings.length : 0;
  const avgDb = readings.length > 0 ? readings.reduce((s, r) => s + r.db, 0) / readings.length : 0;
  const luxComp = getLuxCompliance(avgLux);
  const dbComp = getDbCompliance(avgDb);
  const complianceRate = readings.length > 0
    ? (readings.filter((r) => getLuxCompliance(r.lux) === "ok" && getDbCompliance(r.db) === "ok").length / readings.length * 100)
    : 0;

  const leq = calculateLEQ(readings.map((r) => ({ db: r.db, exposureHours: r.exposureHours })));
  const totalExposure = readings.length > 0 ? readings.reduce((s, r) => s + r.exposureHours, 0) / readings.length : 8;
  const dailyDose = calculateDailyDose(leq, totalExposure);

  const zoneOperatorData = useMemo(() => {
    const uniqueZones = [...new Set(readings.map((r) => r.zone))];
    return uniqueZones.map((z) => {
      const zoneReadings = readings.filter((r) => r.zone === z);
      const zoneConfig = zones.find((zc) => zc.name === z);
      const byOp = operators.map((op) => {
        const opR = zoneReadings.filter((r) => r.operatorId === op.id);
        return {
          operator: op.name,
          operatorId: op.id,
          avgLux: opR.length > 0 ? Math.round(opR.reduce((s, r) => s + r.lux, 0) / opR.length) : 0,
          avgDb: opR.length > 0 ? Math.round(opR.reduce((s, r) => s + r.db, 0) / opR.length) : 0,
          leq: calculateLEQ(opR.map((r) => ({ db: r.db, exposureHours: r.exposureHours }))),
          count: opR.length,
          required: zoneConfig?.requiredSamples ?? 5,
        };
      }).filter((d) => d.count > 0);

      return {
        zone: z,
        measureType: zoneConfig?.measureType ?? "both",
        avgLux: Math.round(zoneReadings.reduce((s, r) => s + r.lux, 0) / zoneReadings.length),
        avgDb: Math.round(zoneReadings.reduce((s, r) => s + r.db, 0) / zoneReadings.length),
        count: zoneReadings.length,
        required: zoneConfig?.requiredSamples ?? 5,
        byOperator: byOp,
      };
    });
  }, [readings, operators, zones]);

  const heatmapLuxData = zoneOperatorData.filter((z) => z.measureType !== "db").map((z) => ({
    zone: z.zone, value: z.avgLux, compliance: getLuxCompliance(z.avgLux),
  }));

  const heatmapDbData = zoneOperatorData.filter((z) => z.measureType !== "lux").map((z) => ({
    zone: z.zone, value: z.avgDb, compliance: getDbCompliance(z.avgDb),
  }));

  const zoneBarData = zoneOperatorData.map((z) => ({
    name: z.zone.length > 15 ? z.zone.slice(0, 15) + "…" : z.zone,
    lux: z.measureType !== "db" ? z.avgLux : 0,
    db: z.measureType !== "lux" ? z.avgDb : 0,
    luxOk: getLuxCompliance(z.avgLux) === "ok" ? 1 : 0,
    dbOk: getDbCompliance(z.avgDb) === "ok" ? 1 : 0,
    measureType: z.measureType,
  }));

  const trendData = readings.map((r, i) => ({
    name: `#${i + 1}`, lux: r.lux, db: r.db,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className={`glass-card p-3 border ${complianceBg(luxComp)}`}>
          <div className="flex items-center gap-1 mb-1">
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Prom. Lux</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xl font-bold font-mono text-foreground">{Math.round(avgLux)}</span>
            <ComplianceIcon level={luxComp} />
          </div>
        </div>
        <div className={`glass-card p-3 border ${complianceBg(dbComp)}`}>
          <div className="flex items-center gap-1 mb-1">
            <Volume2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-muted-foreground uppercase">Prom. dB</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xl font-bold font-mono text-foreground">{Math.round(avgDb)}</span>
            <ComplianceIcon level={dbComp} />
          </div>
        </div>
        <div className={`glass-card p-3 border ${complianceBg(getDbCompliance(leq))}`}>
          <span className="text-[10px] text-muted-foreground uppercase">LEQ diario</span>
          <div className="text-xl font-bold font-mono text-foreground">{leq > 0 ? leq.toFixed(1) : "—"} <span className="text-xs text-muted-foreground">dB</span></div>
        </div>
        <div className={`glass-card p-3 border ${dailyDose > 100 ? "bg-red-500/10 border-red-500/30" : dailyDose > 50 ? "bg-yellow-500/10 border-yellow-500/30" : "bg-green-500/10 border-green-500/30"}`}>
          <span className="text-[10px] text-muted-foreground uppercase">Dosis Diaria</span>
          <div className="text-xl font-bold font-mono text-foreground">{dailyDose > 0 ? dailyDose.toFixed(0) : "—"}%</div>
          <p className="text-[9px] text-muted-foreground">{dailyDose > 100 ? "⚠ Excede límite" : "Dentro de norma"}</p>
        </div>
        <div className="glass-card p-3">
          <span className="text-[10px] text-muted-foreground uppercase">Cumplimiento</span>
          <div className="text-xl font-bold font-mono text-foreground">{complianceRate.toFixed(0)}%</div>
          <div className="w-full bg-muted rounded-full h-1.5 mt-1">
            <div className="h-1.5 rounded-full transition-all" style={{
              width: `${complianceRate}%`,
              background: complianceRate >= 80 ? "#22c55e" : complianceRate >= 50 ? "#eab308" : "#ef4444",
            }} />
          </div>
        </div>
        <div className="glass-card p-3">
          <span className="text-[10px] text-muted-foreground uppercase">Mediciones</span>
          <div className="text-xl font-bold font-mono text-foreground">{readings.length}</div>
          <p className="text-[9px] text-muted-foreground">{zoneOperatorData.length} zonas</p>
        </div>
      </div>

      {/* Input Form */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Nueva Medición
          {zoneMeasureType !== "both" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 text-primary">
              {MEASURE_TYPE_LABELS[zoneMeasureType]}
            </span>
          )}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Operario</label>
            <select value={selOp} onChange={(e) => setSelOp(Number(e.target.value))} className="input-glass mt-1">
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Zona</label>
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="input-glass mt-1">
              {zones.map((z) => <option key={z.id} value={z.name}>{z.name} ({MEASURE_TYPE_LABELS[z.measureType]})</option>)}
            </select>
          </div>
          {zoneMeasureType !== "db" && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Sun className="w-3 h-3" /> Lux</label>
              <input type="number" value={lux} onChange={(e) => setLux(e.target.value)} className="input-glass mt-1" />
            </div>
          )}
          {zoneMeasureType !== "lux" && (
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Volume2 className="w-3 h-3" /> dB</label>
              <input type="number" value={db} onChange={(e) => setDb(e.target.value)} className="input-glass mt-1" />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Exp. (h)</label>
            <input type="number" value={exposureHours} onChange={(e) => setExposureHours(e.target.value)} className="input-glass mt-1" min="0.5" max="12" step="0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Notas</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" className="input-glass mt-1" />
          </div>
        </div>
        <button onClick={handleAdd} className="btn-primary-glass mt-3 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Registrar Medición
        </button>
      </div>

      {/* Zone Config */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Configuración de Zonas
          </h3>
          <button onClick={() => setShowZoneConfig(!showZoneConfig)} className="btn-secondary-glass text-xs flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> {showZoneConfig ? "Cerrar" : "Editar"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {zones.map((z) => {
            const zd = zoneOperatorData.find((zz) => zz.zone === z.name);
            const progress = zd ? Math.min(100, (zd.count / z.requiredSamples) * 100) : 0;
            return (
              <div key={z.id} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground">{z.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/40 border border-border/30 text-muted-foreground">
                      {z.measureType === "lux" ? "☀️" : z.measureType === "db" ? "🔊" : "☀️🔊"}
                    </span>
                    <span className={`text-[10px] font-mono ${progress >= 100 ? "text-green-400" : "text-yellow-400"}`}>
                      {zd?.count ?? 0}/{z.requiredSamples}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                  <div className="h-1.5 rounded-full transition-all" style={{
                    width: `${progress}%`,
                    background: progress >= 100 ? "#22c55e" : "#eab308",
                  }} />
                </div>
                {zd && (
                  <div className="flex gap-3 text-[10px]">
                    {z.measureType !== "db" && <span className="text-yellow-400 font-mono">☀️ {zd.avgLux} lux</span>}
                    {z.measureType !== "lux" && <span className="text-blue-400 font-mono">🔊 {zd.avgDb} dB</span>}
                  </div>
                )}
                {zd && zd.byOperator.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {zd.byOperator.map((bo) => (
                      <div key={bo.operatorId} className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{bo.operator}</span>
                        <div className="flex gap-2">
                          {z.measureType !== "db" && <span className={complianceColor(getLuxCompliance(bo.avgLux))}>{bo.avgLux} lux</span>}
                          {z.measureType !== "lux" && <span className={complianceColor(getDbCompliance(bo.avgDb))}>{bo.avgDb} dB</span>}
                          {z.measureType !== "lux" && <span className="text-muted-foreground">LEQ:{bo.leq.toFixed(0)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showZoneConfig && (
          <div className="mt-4 space-y-3 p-3 rounded-lg bg-muted/10 border border-border/30">
            <div className="space-y-2">
              {zones.map((z) => (
                <div key={z.id} className="flex items-center gap-2">
                  <input
                    value={z.name}
                    onChange={(e) => updateZone(z.id, { name: e.target.value })}
                    className="input-glass flex-1 text-xs"
                  />
                  <select
                    value={z.measureType}
                    onChange={(e) => updateZone(z.id, { measureType: e.target.value as MeasureType })}
                    className="input-glass w-32 text-xs"
                  >
                    <option value="both">☀️🔊 Ambos</option>
                    <option value="lux">☀️ Solo Luz</option>
                    <option value="db">🔊 Solo Sonido</option>
                  </select>
                  <input
                    type="number"
                    value={z.requiredSamples}
                    onChange={(e) => updateZone(z.id, { requiredSamples: Number(e.target.value) || 1 })}
                    className="input-glass w-20 text-xs"
                    min="1"
                  />
                  <span className="text-[10px] text-muted-foreground">muestras</span>
                  <button onClick={() => removeZone(z.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="Nueva zona" className="input-glass flex-1 text-xs" />
              <select value={newZoneMeasureType} onChange={(e) => setNewZoneMeasureType(e.target.value as MeasureType)} className="input-glass w-32 text-xs">
                <option value="both">Ambos</option>
                <option value="lux">Solo Luz</option>
                <option value="db">Solo Sonido</option>
              </select>
              <input type="number" value={newZoneSamples} onChange={(e) => setNewZoneSamples(e.target.value)} className="input-glass w-20 text-xs" min="1" />
              <button onClick={handleAddZone} className="btn-primary-glass text-xs"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Heatmaps */}
      {zoneOperatorData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {heatmapLuxData.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="font-display font-bold text-sm text-foreground mb-3">🗺️ Mapa de Calor — Luz por Zona</h3>
              <div className="space-y-2">
                {heatmapLuxData.map((h) => (
                  <div key={h.zone} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate">{h.zone}</span>
                    <div className="flex-1 h-8 rounded-lg relative overflow-hidden" style={{ background: heatColor(h.value, 100, 800) }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white drop-shadow-lg">{h.value} lux</span>
                      </div>
                    </div>
                    <ComplianceIcon level={h.compliance} />
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-2">
                  <div className="h-3 flex-1 rounded" style={{ background: "linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 100%)" }} />
                  <span className="text-[9px] text-muted-foreground">100</span>
                  <span className="text-[9px] text-muted-foreground ml-auto">800 lux</span>
                </div>
              </div>
            </div>
          )}
          {heatmapDbData.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="font-display font-bold text-sm text-foreground mb-3">🗺️ Mapa de Calor — Sonido por Zona</h3>
              <div className="space-y-2">
                {heatmapDbData.map((h) => (
                  <div key={h.zone} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-32 truncate">{h.zone}</span>
                    <div className="flex-1 h-8 rounded-lg relative overflow-hidden" style={{ background: heatColor(h.value, 50, 100) }}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-white drop-shadow-lg">{h.value} dB</span>
                      </div>
                    </div>
                    <ComplianceIcon level={h.compliance} />
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-2">
                  <div className="h-3 flex-1 rounded" style={{ background: "linear-gradient(90deg, #22c55e 0%, #eab308 50%, #ef4444 100%)" }} />
                  <span className="text-[9px] text-muted-foreground">50</span>
                  <span className="text-[9px] text-muted-foreground ml-auto">100 dB</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Zone bar charts */}
      {zoneBarData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {zoneBarData.some((z) => z.measureType !== "db") && (
            <div className="glass-card p-5">
              <h3 className="font-display font-bold text-sm text-foreground mb-3">☀️ Promedio Lux por Zona</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={zoneBarData.filter((z) => z.measureType !== "db")}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="lux" name="Prom. Lux" radius={[4, 4, 0, 0]}>
                    {zoneBarData.filter((z) => z.measureType !== "db").map((entry, i) => (
                      <Cell key={i} fill={entry.luxOk ? "#22c55e" : getLuxCompliance(entry.lux) === "warning" ? "#eab308" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-[10px] text-muted-foreground mt-1">Norma: {REGULATIONS.lux.min}-{REGULATIONS.lux.max} lux</div>
            </div>
          )}
          {zoneBarData.some((z) => z.measureType !== "lux") && (
            <div className="glass-card p-5">
              <h3 className="font-display font-bold text-sm text-foreground mb-3">🔊 Promedio dB por Zona</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={zoneBarData.filter((z) => z.measureType !== "lux")}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="db" name="Prom. dB" radius={[4, 4, 0, 0]}>
                    {zoneBarData.filter((z) => z.measureType !== "lux").map((entry, i) => (
                      <Cell key={i} fill={entry.dbOk ? "#22c55e" : getDbCompliance(entry.db) === "warning" ? "#eab308" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="text-[10px] text-muted-foreground mt-1">Límite: ≤{REGULATIONS.db8h.max} dB (8h)</div>
            </div>
          )}
        </div>
      )}

      {/* Trend Charts */}
      {readings.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="font-display font-bold text-sm text-foreground mb-3">📈 Tendencia Luz (lux)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="lux" stroke="#eab308" fill="rgba(234,179,8,0.2)" strokeWidth={2} name="Lux" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-card p-5">
            <h3 className="font-display font-bold text-sm text-foreground mb-3">🔊 Tendencia Sonido (dB)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="db" stroke="#38bdf8" fill="rgba(56,189,248,0.2)" strokeWidth={2} name="dB" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Readings Table */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">📋 Historial de Mediciones</h3>
        {readings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay mediciones registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-muted-foreground">Operario</th>
                  <th className="text-left p-2 text-muted-foreground">Zona</th>
                  <th className="text-center p-2 text-muted-foreground">☀️ Lux</th>
                  <th className="text-center p-2 text-muted-foreground">🔊 dB</th>
                  <th className="text-center p-2 text-muted-foreground">Exp. (h)</th>
                  <th className="text-center p-2 text-muted-foreground">Estado</th>
                  <th className="text-left p-2 text-muted-foreground">Hora</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...readings].reverse().map((r) => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="p-2 text-foreground">{r.operatorName}</td>
                    <td className="p-2 text-muted-foreground">{r.zone}</td>
                    <td className="p-2 text-center">
                      <span className={`font-mono font-bold ${complianceColor(getLuxCompliance(r.lux))}`}>{r.lux || "—"}</span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`font-mono font-bold ${complianceColor(getDbCompliance(r.db))}`}>{r.db || "—"}</span>
                    </td>
                    <td className="p-2 text-center text-muted-foreground font-mono">{r.exposureHours}h</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.lux > 0 && <ComplianceIcon level={getLuxCompliance(r.lux)} />}
                        {r.db > 0 && <ComplianceIcon level={getDbCompliance(r.db)} />}
                      </div>
                    </td>
                    <td className="p-2 text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="p-2">
                      <button onClick={() => removeReading(r.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Regulation Reference */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">📜 Normativa de Referencia</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="font-semibold text-foreground mb-1">☀️ Iluminación — Res. 2400/1979</p>
            <p className="text-muted-foreground">Trabajo fino / ensamble: <span className="text-yellow-400 font-mono">300–500 lux</span></p>
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30">300-500 ✓</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">200-300 / 500-700 ⚠</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30">&lt;200 / &gt;700 ✗</span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="font-semibold text-foreground mb-1">🔊 Ruido — Res. 1792/1990</p>
            <p className="text-muted-foreground">8h: <span className="text-blue-400 font-mono">≤85 dB</span> · 4h: ≤90 dB · 2h: ≤95 dB</p>
            <p className="text-muted-foreground mt-1">LEQ = Nivel equivalente continuo diario</p>
            <p className="text-muted-foreground">Dosis = (Texposición / Tpermitido) × 100%</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentalModule;
