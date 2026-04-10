import React from "react";
import { useSST, getLuxCompliance, getDbCompliance, REGULATIONS } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { AlertTriangle, CheckCircle, Shield, TrendingUp } from "lucide-react";

const COLORS = ["#22c55e", "#eab308", "#ef4444"];

const SSTDashboard: React.FC = () => {
  const { readings, workstations } = useSST();
  const { operators } = useTimeStudy();

  const avgLux = readings.length > 0 ? readings.reduce((s, r) => s + r.lux, 0) / readings.length : 0;
  const avgDb = readings.length > 0 ? readings.reduce((s, r) => s + r.db, 0) / readings.length : 0;
  const totalPoints = workstations.reduce((s, w) => s + w.measurementPoints.length, 0);

  const luxOk = readings.filter((r) => getLuxCompliance(r.lux) === "ok").length;
  const luxWarn = readings.filter((r) => getLuxCompliance(r.lux) === "warning").length;
  const luxCrit = readings.filter((r) => getLuxCompliance(r.lux) === "critical").length;

  const dbOk = readings.filter((r) => getDbCompliance(r.db) === "ok").length;
  const dbWarn = readings.filter((r) => getDbCompliance(r.db) === "warning").length;
  const dbCrit = readings.filter((r) => getDbCompliance(r.db) === "critical").length;

  const compRate = readings.length > 0 ? ((luxOk + dbOk) / (readings.length * 2)) * 100 : 0;

  const riskScore = readings.length > 0
    ? Math.min(100, ((luxWarn + dbWarn) * 15 + (luxCrit + dbCrit) * 35) / readings.length)
    : 0;

  const luxPieData = [
    { name: "Cumple", value: luxOk },
    { name: "Advertencia", value: luxWarn },
    { name: "Crítico", value: luxCrit },
  ].filter((d) => d.value > 0);

  const dbPieData = [
    { name: "Cumple", value: dbOk },
    { name: "Advertencia", value: dbWarn },
    { name: "Crítico", value: dbCrit },
  ].filter((d) => d.value > 0);

  const byOperator = operators.map((op) => {
    const opR = readings.filter((r) => r.operatorId === op.id);
    const aLux = opR.length > 0 ? opR.reduce((s, r) => s + r.lux, 0) / opR.length : 0;
    const aDb = opR.length > 0 ? opR.reduce((s, r) => s + r.db, 0) / opR.length : 0;
    return { name: op.name, lux: Math.round(aLux), db: Math.round(aDb) };
  });

  const radarData = operators.map((op) => {
    const opR = readings.filter((r) => r.operatorId === op.id);
    const luxScore = opR.length > 0 ? (opR.filter((r) => getLuxCompliance(r.lux) === "ok").length / opR.length) * 100 : 0;
    const dbScore = opR.length > 0 ? (opR.filter((r) => getDbCompliance(r.db) === "ok").length / opR.length) * 100 : 0;
    return { name: op.name, luz: Math.round(luxScore), sonido: Math.round(dbScore), general: Math.round((luxScore + dbScore) / 2) };
  });

  if (readings.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
        <h3 className="font-display font-bold text-foreground text-lg mb-2">Dashboard SST</h3>
        <p className="text-sm text-muted-foreground">Registra mediciones ambientales en el módulo de Ambiente para ver los KPIs aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Prom. Lux</span>
          <div className="text-2xl font-bold font-mono text-yellow-400">{Math.round(avgLux)}</div>
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Prom. dB</span>
          <div className="text-2xl font-bold font-mono text-blue-400">{Math.round(avgDb)}</div>
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Cumplimiento</span>
          <div className="text-2xl font-bold font-mono" style={{ color: compRate >= 70 ? "#22c55e" : compRate >= 40 ? "#eab308" : "#ef4444" }}>
            {compRate.toFixed(0)}%
          </div>
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Riesgo</span>
          <div className="text-2xl font-bold font-mono" style={{ color: riskScore <= 30 ? "#22c55e" : riskScore <= 60 ? "#eab308" : "#ef4444" }}>
            {riskScore.toFixed(0)}
          </div>
        </div>
        <div className="glass-card p-4">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Puntos 3D</span>
          <div className="text-2xl font-bold font-mono text-primary">{totalPoints}</div>
        </div>
      </div>

      {/* Alert Banner */}
      {(luxCrit > 0 || dbCrit > 0) && (
        <div className="glass-card p-4 border border-destructive/40 bg-destructive/5 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-destructive">⚠️ Alerta de incumplimiento normativo</p>
            <p className="text-xs text-muted-foreground">
              {luxCrit > 0 && `${luxCrit} medición(es) de luz fuera de norma. `}
              {dbCrit > 0 && `${dbCrit} medición(es) de ruido exceden límite.`}
            </p>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">☀️ Cumplimiento Luz</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={luxPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {luxPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">🔊 Cumplimiento Sonido</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={dbPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {dbPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">🎯 Radar por Operario</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
              <Radar name="Luz" dataKey="luz" stroke="#eab308" fill="#eab308" fillOpacity={0.2} />
              <Radar name="Sonido" dataKey="sonido" stroke="#00d4ff" fill="#00d4ff" fillOpacity={0.2} />
              <Legend />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar by Operator */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">👷 Promedios por Operario</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={byOperator}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Legend />
            <Bar dataKey="lux" fill="#eab308" name="Prom. Lux" radius={[4, 4, 0, 0]} />
            <Bar dataKey="db" fill="#00d4ff" name="Prom. dB" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SSTDashboard;
