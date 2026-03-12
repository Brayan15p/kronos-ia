import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Activity, TrendingDown, Target, Clock, Users, AlertTriangle } from "lucide-react";
import { useTimeStudy, CRANE_STEPS } from "@/context/TimeStudyContext";

const CHART_COLORS = ["hsl(185,100%,50%)", "hsl(265,80%,62%)", "hsl(40,95%,55%)", "hsl(0,80%,58%)", "hsl(155,70%,45%)"];

const Dashboard: React.FC = () => {
  const { cycles, defects, qualityChecks, operators, costConfig } = useTimeStudy();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const totalCycles = cycles.length;
  const avgTime = totalCycles > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / totalCycles : 0;
  const bestTime = totalCycles > 0 ? Math.min(...cycles.map((c) => c.duration)) : 0;
  const qualityRate = qualityChecks.length > 0
    ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100)
    : 0;

  // Cycle trend data
  const cycleChartData = cycles.map((c, i) => ({
    cycle: i + 1,
    time: Number(c.duration.toFixed(1)),
    operator: c.operatorName,
  }));

  // Operator comparison
  const opComparison = operators.map((op) => {
    const opCycles = cycles.filter((c) => c.operatorId === op.id);
    const avg = opCycles.length > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / opCycles.length : 0;
    return { name: op.name, promedio: Number(avg.toFixed(1)), ciclos: opCycles.length };
  });

  // Step avg across all
  const stepData = CRANE_STEPS.map((step) => {
    const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    return { step: `P${step.number}`, avg: Number(avg.toFixed(1)), name: step.name };
  });

  // Defect pie
  const defectTypeMap = new Map<string, number>();
  defects.forEach((d) => defectTypeMap.set(d.type, (defectTypeMap.get(d.type) ?? 0) + 1));
  const defectPieData = Array.from(defectTypeMap.entries()).map(([name, value]) => ({ name, value }));

  const severityData = [
    { name: "Leve", value: defects.filter((d) => d.severity === "leve").length },
    { name: "Moderado", value: defects.filter((d) => d.severity === "moderado").length },
    { name: "Crítico", value: defects.filter((d) => d.severity === "critico").length },
  ].filter((d) => d.value > 0);
  const severityColors = ["hsl(40,95%,55%)", "hsl(265,80%,62%)", "hsl(0,80%,58%)"];

  // Cost KPIs
  const avgHourlyCost = operators.length > 0 ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length : 15000;
  const costPerSecond = avgHourlyCost / 3600;
  const excessPerCycle = Math.max(0, avgTime - costConfig.targetCycleTime);
  const monthlyCostLoss = excessPerCycle * costPerSecond * costConfig.monthlyProductionTarget;

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(230,22%,9%,0.95)",
      border: "1px solid hsla(230,16%,28%,0.3)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "11px",
    },
  };

  if (totalCycles === 0) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
        <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-display font-bold text-foreground mb-2">Sin datos aún</h3>
        <p className="text-sm text-muted-foreground">Registra ciclos de tiempo para ver las estadísticas</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="glass-card p-4 text-center">
          <Clock className="w-4 h-4 text-primary mx-auto mb-1.5" />
          <div className="stat-value text-xl text-primary">{formatTime(avgTime)}</div>
          <div className="stat-label text-[10px]">Promedio</div>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingDown className="w-4 h-4 text-success mx-auto mb-1.5" />
          <div className="stat-value text-xl text-success">{formatTime(bestTime)}</div>
          <div className="stat-label text-[10px]">Mejor</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Activity className="w-4 h-4 text-accent mx-auto mb-1.5" />
          <div className="stat-value text-xl text-foreground">{totalCycles}</div>
          <div className="stat-label text-[10px]">Ciclos</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Target className="w-4 h-4 text-warning mx-auto mb-1.5" />
          <div className="stat-value text-xl text-warning">{qualityRate}%</div>
          <div className="stat-label text-[10px]">Calidad</div>
        </div>
        <div className="glass-card p-4 text-center">
          <AlertTriangle className="w-4 h-4 text-destructive mx-auto mb-1.5" />
          <div className="stat-value text-xl text-destructive">{defects.length}</div>
          <div className="stat-label text-[10px]">Defectos</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Users className="w-4 h-4 text-primary mx-auto mb-1.5" />
          <div className="stat-value text-xl text-foreground">${(monthlyCostLoss / 1000).toFixed(0)}K</div>
          <div className="stat-label text-[10px]">Pérdida/Mes</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">Tendencia de Tiempos</h4>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={cycleChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="cycle" tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="time" stroke="hsl(185,100%,50%)" fill="hsla(185,100%,50%,0.1)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">Comparación Operarios</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={opComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="promedio" fill="hsl(185,100%,50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Step analysis */}
      {stepData.some((s) => s.avg > 0) && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">Tiempo Promedio por Paso (12 pasos)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stepData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="step" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="avg" name="Promedio (s)" radius={[3, 3, 0, 0]}>
                {stepData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Defects charts */}
      {defects.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass-card p-5">
            <h4 className="text-sm font-display font-bold text-foreground mb-4">Distribución de Defectos</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={defectPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {defectPieData.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-card p-5">
            <h4 className="text-sm font-display font-bold text-foreground mb-4">Severidad de Defectos</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {severityData.map((_, i) => (<Cell key={i} fill={severityColors[i % severityColors.length]} />))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
