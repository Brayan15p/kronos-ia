import React from "react";
import { DollarSign, TrendingDown, AlertTriangle, Target } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CostAnalysis: React.FC = () => {
  const { cycles, operators, costConfig, updateCostConfig } = useTimeStudy();

  const avgHourlyCost = operators.length > 0
    ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length
    : 15000;
  const costPerSecond = avgHourlyCost / 3600;

  // Calculate avg time per step across all cycles
  const stepAvgs = CRANE_STEPS.map((step) => {
    const times = cycles
      .flatMap((c) => c.steps)
      .filter((s) => s.stepNumber === step.number)
      .map((s) => s.duration);
    const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const targetPerStep = costConfig.targetCycleTime / 12;
    const excess = Math.max(0, avg - targetPerStep);
    const costLoss = excess * costPerSecond;
    return {
      step: `P${step.number}`,
      name: step.name,
      emoji: step.emoji,
      avg: Number(avg.toFixed(1)),
      target: Number(targetPerStep.toFixed(1)),
      excess: Number(excess.toFixed(1)),
      costLoss: Number(costLoss.toFixed(0)),
    };
  });

  const totalAvgCycleTime = cycles.length > 0
    ? cycles.reduce((s, c) => s + c.duration, 0) / cycles.length
    : 0;
  const excessPerCycle = Math.max(0, totalAvgCycleTime - costConfig.targetCycleTime);
  const costLossPerCycle = excessPerCycle * costPerSecond;
  const monthlyCostLoss = costLossPerCycle * costConfig.monthlyProductionTarget;
  const totalStepLoss = stepAvgs.reduce((s, st) => s + st.costLoss, 0);

  const worstStep = stepAvgs.reduce((max, s) => s.costLoss > max.costLoss ? s : max, stepAvgs[0]);

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(230,22%,9%,0.95)",
      border: "1px solid hsla(230,16%,28%,0.3)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "11px",
    },
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Config */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-foreground mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-warning" />
          Configuración de Costos
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Valor del Producto (COP)</label>
            <input
              type="number"
              value={costConfig.productValue}
              onChange={(e) => updateCostConfig({ productValue: Number(e.target.value) })}
              className="input-glass mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Tiempo Objetivo (seg)</label>
            <input
              type="number"
              value={costConfig.targetCycleTime}
              onChange={(e) => updateCostConfig({ targetCycleTime: Number(e.target.value) })}
              className="input-glass mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Producción Mensual (unid)</label>
            <input
              type="number"
              value={costConfig.monthlyProductionTarget}
              onChange={(e) => updateCostConfig({ monthlyProductionTarget: Number(e.target.value) })}
              className="input-glass mt-1"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 text-center">
          <DollarSign className="w-5 h-5 text-warning mx-auto mb-2" />
          <div className="stat-value text-xl text-warning">${costLossPerCycle.toFixed(0)}</div>
          <div className="stat-label">Pérdida/Ciclo</div>
        </div>
        <div className="glass-card p-4 text-center">
          <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-2" />
          <div className="stat-value text-xl text-destructive">${(monthlyCostLoss / 1000).toFixed(0)}K</div>
          <div className="stat-label">Pérdida Mensual</div>
        </div>
        <div className="glass-card p-4 text-center">
          <AlertTriangle className="w-5 h-5 text-accent mx-auto mb-2" />
          <div className="stat-value text-xl text-accent">{worstStep?.step || "-"}</div>
          <div className="stat-label">Paso Más Costoso</div>
        </div>
        <div className="glass-card p-4 text-center">
          <Target className="w-5 h-5 text-primary mx-auto mb-2" />
          <div className="stat-value text-xl text-primary">${(costPerSecond * 60).toFixed(0)}</div>
          <div className="stat-label">Costo/Minuto</div>
        </div>
      </div>

      {/* Step cost breakdown chart */}
      {cycles.length > 0 && (
        <div className="glass-card p-5">
          <h4 className="text-sm font-display font-bold text-foreground mb-4">
            💸 Fuga de Dinero por Paso (COP perdidos por exceso sobre objetivo)
          </h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stepAvgs}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="step" tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="costLoss" fill="hsl(40,95%,55%)" radius={[4, 4, 0, 0]} name="Pérdida COP" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Step detail table */}
      {cycles.length > 0 && (
        <div className="glass-card p-5 overflow-x-auto">
          <h4 className="text-sm font-display font-bold text-foreground mb-3">Detalle por Paso</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-2 px-2">Paso</th>
                <th className="text-right py-2 px-2">Promedio</th>
                <th className="text-right py-2 px-2">Objetivo</th>
                <th className="text-right py-2 px-2">Exceso</th>
                <th className="text-right py-2 px-2">Pérdida</th>
              </tr>
            </thead>
            <tbody>
              {stepAvgs.map((s) => (
                <tr key={s.step} className="border-b border-border/10">
                  <td className="py-2 px-2 text-foreground">{s.emoji} {s.name}</td>
                  <td className="py-2 px-2 text-right font-mono text-foreground">{s.avg}s</td>
                  <td className="py-2 px-2 text-right font-mono text-muted-foreground">{s.target}s</td>
                  <td className={`py-2 px-2 text-right font-mono ${s.excess > 0 ? "text-warning" : "text-success"}`}>
                    {s.excess > 0 ? `+${s.excess}s` : "✓"}
                  </td>
                  <td className={`py-2 px-2 text-right font-mono ${s.costLoss > 0 ? "text-destructive" : "text-success"}`}>
                    {s.costLoss > 0 ? `$${s.costLoss}` : "$0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cycles.length === 0 && (
        <div className="glass-card p-12 text-center">
          <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-foreground mb-2">Sin datos de costos</h3>
          <p className="text-sm text-muted-foreground">Registra ciclos con el cronómetro de 12 pasos para ver el análisis de fuga de dinero</p>
        </div>
      )}
    </div>
  );
};

export default CostAnalysis;
