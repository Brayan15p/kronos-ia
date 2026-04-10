import React, { useState } from "react";
import { useSST, getLuxCompliance, getDbCompliance, REGULATIONS } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Plus, Trash2, Sun, Volume2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

const complianceColor = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "text-green-400" : level === "warning" ? "text-yellow-400" : "text-red-400";

const complianceBg = (level: "ok" | "warning" | "critical") =>
  level === "ok" ? "bg-green-500/10 border-green-500/30" : level === "warning" ? "bg-yellow-500/10 border-yellow-500/30" : "bg-red-500/10 border-red-500/30";

const ComplianceIcon: React.FC<{ level: "ok" | "warning" | "critical" }> = ({ level }) => {
  if (level === "ok") return <CheckCircle className="w-4 h-4 text-green-400" />;
  if (level === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
};

const EnvironmentalModule: React.FC = () => {
  const { readings, addReading, removeReading } = useSST();
  const { operators } = useTimeStudy();
  const [selOp, setSelOp] = useState(operators[0]?.id ?? 0);
  const [zone, setZone] = useState("Estación Principal");
  const [lux, setLux] = useState("350");
  const [db, setDb] = useState("72");
  const [notes, setNotes] = useState("");

  const handleAdd = () => {
    const op = operators.find((o) => o.id === selOp);
    if (!op) return;
    addReading({
      id: crypto.randomUUID(),
      operatorId: selOp,
      operatorName: op.name,
      zone,
      lux: Number(lux) || 0,
      db: Number(db) || 0,
      timestamp: new Date(),
      notes,
    });
    setNotes("");
  };

  const avgLux = readings.length > 0 ? readings.reduce((s, r) => s + r.lux, 0) / readings.length : 0;
  const avgDb = readings.length > 0 ? readings.reduce((s, r) => s + r.db, 0) / readings.length : 0;
  const luxComp = getLuxCompliance(avgLux);
  const dbComp = getDbCompliance(avgDb);
  const complianceRate = readings.length > 0
    ? (readings.filter((r) => getLuxCompliance(r.lux) === "ok" && getDbCompliance(r.db) === "ok").length / readings.length * 100)
    : 0;

  const trendData = readings.map((r, i) => ({
    name: `#${i + 1}`,
    lux: r.lux,
    db: r.db,
    luxMin: REGULATIONS.lux.min,
    luxMax: REGULATIONS.lux.max,
    dbMax: REGULATIONS.db8h.max,
  }));

  const byOperator = operators.map((op) => {
    const opReadings = readings.filter((r) => r.operatorId === op.id);
    return {
      name: op.name,
      avgLux: opReadings.length > 0 ? Math.round(opReadings.reduce((s, r) => s + r.lux, 0) / opReadings.length) : 0,
      avgDb: opReadings.length > 0 ? Math.round(opReadings.reduce((s, r) => s + r.db, 0) / opReadings.length) : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`glass-card p-4 border ${complianceBg(luxComp)}`}>
          <div className="flex items-center gap-2 mb-1">
            <Sun className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Promedio Luz</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold font-mono text-foreground">{Math.round(avgLux)}</span>
            <span className="text-xs text-muted-foreground">lux</span>
            <ComplianceIcon level={luxComp} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Norma: {REGULATIONS.lux.min}-{REGULATIONS.lux.max} lux</p>
        </div>

        <div className={`glass-card p-4 border ${complianceBg(dbComp)}`}>
          <div className="flex items-center gap-2 mb-1">
            <Volume2 className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Promedio Sonido</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold font-mono text-foreground">{Math.round(avgDb)}</span>
            <span className="text-xs text-muted-foreground">dB</span>
            <ComplianceIcon level={dbComp} />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Norma: ≤{REGULATIONS.db8h.max} dB (8h)</p>
        </div>

        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Cumplimiento</span>
          <div className="text-2xl font-bold font-mono text-foreground">{complianceRate.toFixed(0)}%</div>
          <div className="w-full bg-muted rounded-full h-2 mt-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${complianceRate}%`,
                background: complianceRate >= 80 ? "hsl(var(--success))" : complianceRate >= 50 ? "hsl(var(--warning))" : "hsl(var(--destructive))",
              }}
            />
          </div>
        </div>

        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Mediciones</span>
          <div className="text-2xl font-bold font-mono text-foreground">{readings.length}</div>
          <p className="text-[10px] text-muted-foreground mt-1">{operators.length} operarios</p>
        </div>
      </div>

      {/* Input Form */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Nueva Medición
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Operario</label>
            <select value={selOp} onChange={(e) => setSelOp(Number(e.target.value))} className="input-glass mt-1">
              {operators.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Zona</label>
            <input value={zone} onChange={(e) => setZone(e.target.value)} className="input-glass mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Sun className="w-3 h-3" /> Lux
            </label>
            <input type="number" value={lux} onChange={(e) => setLux(e.target.value)} className="input-glass mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Volume2 className="w-3 h-3" /> dB
            </label>
            <input type="number" value={db} onChange={(e) => setDb(e.target.value)} className="input-glass mt-1" />
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

      {/* Charts */}
      {readings.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <h3 className="font-display font-bold text-sm text-foreground mb-3">📈 Tendencia Luz (lux)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="luxMin" stroke="none" fill="hsl(155 70% 45% / 0.08)" name="Mínimo norma" />
                <Area type="monotone" dataKey="luxMax" stroke="none" fill="hsl(155 70% 45% / 0.05)" name="Máximo norma" />
                <Area type="monotone" dataKey="lux" stroke="hsl(40 95% 55%)" fill="hsl(40 95% 55% / 0.2)" strokeWidth={2} name="Lux medido" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass-card p-5">
            <h3 className="font-display font-bold text-sm text-foreground mb-3">🔊 Tendencia Sonido (dB)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="dbMax" stroke="hsl(0 80% 58% / 0.5)" fill="hsl(0 80% 58% / 0.05)" strokeDasharray="5 5" name="Límite 85 dB" />
                <Area type="monotone" dataKey="db" stroke="hsl(185 100% 50%)" fill="hsl(185 100% 50% / 0.2)" strokeWidth={2} name="dB medido" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* By Operator Chart */}
      {byOperator.some((o) => o.avgLux > 0) && (
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">👷 Comparativa por Operario</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byOperator}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="avgLux" fill="hsl(40 95% 55%)" name="Prom. Lux" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avgDb" fill="hsl(185 100% 50%)" name="Prom. dB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Readings Table */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">📋 Historial de Mediciones</h3>
        {readings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay mediciones registradas. Agrega tu primera medición arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-2 text-muted-foreground">Operario</th>
                  <th className="text-left p-2 text-muted-foreground">Zona</th>
                  <th className="text-center p-2 text-muted-foreground">☀️ Lux</th>
                  <th className="text-center p-2 text-muted-foreground">🔊 dB</th>
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
                      <span className={`font-mono font-bold ${complianceColor(getLuxCompliance(r.lux))}`}>{r.lux}</span>
                    </td>
                    <td className="p-2 text-center">
                      <span className={`font-mono font-bold ${complianceColor(getDbCompliance(r.db))}`}>{r.db}</span>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <ComplianceIcon level={getLuxCompliance(r.lux)} />
                        <ComplianceIcon level={getDbCompliance(r.db)} />
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
            <div className="flex gap-2 mt-2">
              <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/10 text-green-400 border border-green-500/30">≤80 ✓</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">80-85 ⚠</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/30">&gt;85 ✗</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentalModule;
