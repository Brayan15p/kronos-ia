import React from "react";
import { Brain, TrendingUp, Users, AlertTriangle, Award } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const CHART_COLORS = ["hsl(185,100%,50%)", "hsl(265,80%,62%)", "hsl(155,70%,45%)", "hsl(40,95%,55%)", "hsl(0,80%,58%)"];

const FatigueDetection: React.FC = () => {
  const { cycles, operators, steps } = useTimeStudy();
  const CRANE_STEPS = steps;

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(230,22%,9%,0.95)",
      border: "1px solid hsla(230,16%,28%,0.3)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "11px",
    },
  };

  // Fatigue: check if times increase over cycles (per operator)
  const fatigueData = operators.map((op) => {
    const opCycles = cycles.filter((c) => c.operatorId === op.id).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (opCycles.length < 3) return { operator: op.name, trend: 0, fatigued: false, data: [] };

    const data = opCycles.map((c, i) => ({ cycle: i + 1, time: Number(c.duration.toFixed(1)) }));
    // Linear regression slope
    const n = data.length;
    const sumX = data.reduce((s, d) => s + d.cycle, 0);
    const sumY = data.reduce((s, d) => s + d.time, 0);
    const sumXY = data.reduce((s, d) => s + d.cycle * d.time, 0);
    const sumX2 = data.reduce((s, d) => s + d.cycle * d.cycle, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return {
      operator: op.name,
      trend: Number(slope.toFixed(3)),
      fatigued: slope > 0.5,
      data,
    };
  });

  // Training / Skill Gap: compare step averages between operators
  const skillGapData = CRANE_STEPS.map((step) => {
    const entry: any = { step: `P${step.number}`, name: step.name };
    operators.forEach((op) => {
      const times = cycles
        .filter((c) => c.operatorId === op.id)
        .flatMap((c) => c.steps)
        .filter((s) => s.stepNumber === step.number)
        .map((s) => s.duration);
      entry[op.name] = times.length > 0 ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)) : 0;
    });
    return entry;
  });

  // Find skill gaps (biggest difference between operators per step)
  const gaps = CRANE_STEPS.map((step) => {
    const opTimes = operators.map((op) => {
      const times = cycles
        .filter((c) => c.operatorId === op.id)
        .flatMap((c) => c.steps)
        .filter((s) => s.stepNumber === step.number)
        .map((s) => s.duration);
      return { op: op.name, avg: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0 };
    }).filter((o) => o.avg > 0);

    if (opTimes.length < 2) return null;
    const sorted = opTimes.sort((a, b) => a.avg - b.avg);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];
    const diff = slowest.avg - fastest.avg;
    return { step: step.name, stepNum: step.number, fastest: fastest.op, slowest: slowest.op, diff: Number(diff.toFixed(1)), emoji: step.emoji };
  }).filter(Boolean).sort((a: any, b: any) => b.diff - a.diff);

  // Std Dev per cycle for fatigue detection
  const stdDevPerCycle = cycles.map((c, i) => {
    const times = c.steps.map((s) => s.duration);
    if (times.length === 0) return { cycle: i + 1, stdDev: 0, operator: c.operatorName };
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / times.length;
    return { cycle: i + 1, stdDev: Number(Math.sqrt(variance).toFixed(2)), operator: c.operatorName };
  });

  if (cycles.length === 0) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
        <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-display font-bold text-foreground mb-2">Sin datos de fatiga</h3>
        <p className="text-sm text-muted-foreground">Registra múltiples ciclos para detectar patrones de fatiga operativa</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Fatigue Alerts */}
      <div className="grid md:grid-cols-2 gap-4">
        {fatigueData.map((fd) => (
          <div key={fd.operator} className={`glass-card p-5 ${fd.fatigued ? "border-warning/30" : "border-success/20"}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-display font-bold text-foreground">{fd.operator}</h4>
              {fd.fatigued ? (
                <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Fatiga detectada
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-success/20 text-success font-medium flex items-center gap-1">
                  <Award className="w-3 h-3" /> Estable
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Tendencia: <span className={`font-mono font-bold ${fd.trend > 0.5 ? "text-warning" : fd.trend < -0.5 ? "text-success" : "text-foreground"}`}>
                {fd.trend > 0 ? "+" : ""}{fd.trend}s/ciclo
              </span>
            </p>
            {fd.data.length > 0 && (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={fd.data}>
                  <XAxis dataKey="cycle" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <Tooltip {...tooltipStyle} />
                  <Line type="monotone" dataKey="time" stroke={fd.fatigued ? "hsl(40,95%,55%)" : "hsl(185,100%,50%)"} strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      {/* Skill Gap Comparison */}
      {operators.length >= 2 && gaps.length > 0 && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            Brecha de Habilidades (Skill Gap) — ¿Dónde capacitar?
          </h4>
          <div className="space-y-2">
            {(gaps as any[]).slice(0, 5).map((g: any) => (
              <div key={g.stepNum} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/20">
                <span className="text-lg">{g.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium">{g.step}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-success">{g.fastest}</span> es <span className="font-mono font-bold text-warning">{g.diff}s</span> más rápido que <span className="text-destructive">{g.slowest}</span>
                  </p>
                </div>
                <div className="text-xs font-mono text-accent font-bold">Paso {g.stepNum}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operator comparison by step */}
      {operators.length >= 2 && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">Comparación por Paso (seg)</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={skillGapData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="step" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              {operators.map((op, i) => (
                <Bar key={op.id} dataKey={op.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Std Dev over time */}
      {stdDevPerCycle.length > 1 && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">
            📈 Desviación Estándar por Ciclo (Indicador de Fatiga)
          </h4>
          <p className="text-xs text-muted-foreground mb-3">Un aumento en la variabilidad indica fatiga operativa o pérdida de concentración</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stdDevPerCycle}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="cycle" tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="stdDev" name="σ (seg)" radius={[3, 3, 0, 0]}>
                {stdDevPerCycle.map((d, i) => (
                  <Cell key={i} fill={d.stdDev > 3 ? "hsl(0,80%,58%)" : d.stdDev > 1.5 ? "hsl(40,95%,55%)" : "hsl(185,100%,50%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default FatigueDetection;
