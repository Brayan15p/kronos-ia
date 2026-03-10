import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Activity, TrendingDown, Target, Clock } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";

const CHART_COLORS = ["hsl(175,80%,50%)", "hsl(260,70%,60%)", "hsl(38,90%,55%)", "hsl(0,72%,55%)", "hsl(150,60%,45%)"];

const Dashboard: React.FC = () => {
  const { cycles, defects, qualityChecks } = useTimeStudy();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Stats
  const totalCycles = cycles.length;
  const avgTime = totalCycles > 0 ? cycles.reduce((s, c) => s + c.duration, 0) / totalCycles : 0;
  const bestTime = totalCycles > 0 ? Math.min(...cycles.map((c) => c.duration)) : 0;
  const qualityRate = qualityChecks.length > 0
    ? Math.round((qualityChecks.filter((q) => q.overallPass).length / qualityChecks.length) * 100)
    : 0;

  // Cycle times by operator
  const op1Cycles = cycles.filter((c) => c.operatorId === 1);
  const op2Cycles = cycles.filter((c) => c.operatorId === 2);

  const cycleChartData = Array.from(
    { length: Math.max(op1Cycles.length, op2Cycles.length) },
    (_, i) => ({
      cycle: i + 1,
      "Operario 1": op1Cycles[i]?.duration ?? null,
      "Operario 2": op2Cycles[i]?.duration ?? null,
    })
  );

  // Defects by type
  const defectTypeMap = new Map<string, number>();
  defects.forEach((d) => {
    defectTypeMap.set(d.type, (defectTypeMap.get(d.type) ?? 0) + 1);
  });
  const defectPieData = Array.from(defectTypeMap.entries()).map(([name, value]) => ({ name, value }));

  // Severity distribution
  const severityData = [
    { name: "Leve", value: defects.filter((d) => d.severity === "leve").length },
    { name: "Moderado", value: defects.filter((d) => d.severity === "moderado").length },
    { name: "Crítico", value: defects.filter((d) => d.severity === "critico").length },
  ].filter((d) => d.value > 0);

  const severityColors = ["hsl(38,90%,55%)", "hsl(260,70%,60%)", "hsl(0,72%,55%)"];

  // Operator comparison
  const op1Avg = op1Cycles.length > 0 ? op1Cycles.reduce((s, c) => s + c.duration, 0) / op1Cycles.length : 0;
  const op2Avg = op2Cycles.length > 0 ? op2Cycles.reduce((s, c) => s + c.duration, 0) / op2Cycles.length : 0;

  const comparisonData = [
    { name: "Operario 1", promedio: Number(op1Avg.toFixed(1)), ciclos: op1Cycles.length },
    { name: "Operario 2", promedio: Number(op2Avg.toFixed(1)), ciclos: op2Cycles.length },
  ];

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(220,18%,12%,0.9)",
      border: "1px solid hsla(220,14%,30%,0.4)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "12px",
    },
  };

  if (totalCycles === 0) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
        <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Sin datos aún</h3>
        <p className="text-sm text-muted-foreground">Registra ciclos de tiempo para ver las estadísticas</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <Clock className="w-5 h-5 text-primary mx-auto mb-2" />
          <div className="stat-value text-2xl text-primary">{formatTime(avgTime)}</div>
          <div className="stat-label">Tiempo Promedio</div>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingDown className="w-5 h-5 text-success mx-auto mb-2" />
          <div className="stat-value text-2xl text-success">{formatTime(bestTime)}</div>
          <div className="stat-label">Mejor Tiempo</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Activity className="w-5 h-5 text-accent mx-auto mb-2" />
          <div className="stat-value text-2xl text-foreground">{totalCycles}</div>
          <div className="stat-label">Total Ciclos</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Target className="w-5 h-5 text-warning mx-auto mb-2" />
          <div className="stat-value text-2xl text-warning">{qualityRate}%</div>
          <div className="stat-label">Tasa Calidad</div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Cycle Times Line Chart */}
        <div className="glass-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Tiempos por Ciclo (seg)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={cycleChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(220,14%,30%,0.3)" />
              <XAxis dataKey="cycle" tick={{ fill: "hsl(215,12%,55%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215,12%,55%)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="Operario 1" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="Operario 2" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Operator Comparison */}
        <div className="glass-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-4">Comparación Operarios</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(220,14%,30%,0.3)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(215,12%,55%)", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(215,12%,55%)", fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="promedio" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      {defects.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Distribución de Defectos</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={defectPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {defectPieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-card p-5">
            <h4 className="text-sm font-semibold text-foreground mb-4">Severidad de Defectos</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {severityData.map((_, i) => (
                    <Cell key={i} fill={severityColors[i % severityColors.length]} />
                  ))}
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
