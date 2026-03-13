import React, { useMemo } from "react";
import { DollarSign, TrendingDown, AlertTriangle, Target, Flame, ArrowDown, Clock, Users, Zap, BarChart3 } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line } from "recharts";

const CHART_COLORS = [
  "hsl(0,80%,58%)", "hsl(40,95%,55%)", "hsl(265,80%,62%)",
  "hsl(185,100%,50%)", "hsl(155,70%,45%)", "hsl(320,80%,55%)",
];

const formatMoney = (val: number) => {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const CostAnalysis: React.FC = () => {
  const { cycles, operators, costConfig, updateCostConfig, steps } = useTimeStudy();

  const analysis = useMemo(() => {
    const avgHourlyCost = operators.length > 0
      ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length
      : 15000;
    const costPerSecond = avgHourlyCost / 3600;
    const targetPerStep = costConfig.targetCycleTime / steps.length;

    const stepAvgs = steps.map((step) => {
      const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      const best = times.length > 0 ? Math.min(...times) : 0;
      const worst = times.length > 0 ? Math.max(...times) : 0;
      const excess = Math.max(0, avg - targetPerStep);
      const costLoss = excess * costPerSecond;
      const savingPotential = (avg - best) * costPerSecond;
      return {
        step: `P${step.number}`,
        name: step.name,
        emoji: step.emoji,
        number: step.number,
        avg: Number(avg.toFixed(1)),
        best: Number(best.toFixed(1)),
        worst: Number(worst.toFixed(1)),
        target: Number(targetPerStep.toFixed(1)),
        excess: Number(excess.toFixed(1)),
        costLoss: Number(costLoss.toFixed(0)),
        savingPotential: Number(savingPotential.toFixed(0)),
        samples: times.length,
      };
    });

    const totalAvgCycleTime = cycles.length > 0
      ? cycles.reduce((s, c) => s + c.duration, 0) / cycles.length
      : 0;
    const excessPerCycle = Math.max(0, totalAvgCycleTime - costConfig.targetCycleTime);
    const costLossPerCycle = excessPerCycle * costPerSecond;
    const monthlyCostLoss = costLossPerCycle * costConfig.monthlyProductionTarget;
    const annualCostLoss = monthlyCostLoss * 12;
    const totalStepLoss = stepAvgs.reduce((s, st) => s + st.costLoss, 0);
    const totalSavingPotential = stepAvgs.reduce((s, st) => s + st.savingPotential, 0);

    // Per-operator cost
    const operatorCosts = operators.map((op) => {
      const opCycles = cycles.filter((c) => c.operatorId === op.id);
      const avgCycle = opCycles.length > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / opCycles.length : 0;
      const excess = Math.max(0, avgCycle - costConfig.targetCycleTime);
      const loss = excess * (op.hourlyCost / 3600);
      return { name: op.name, avgTime: avgCycle, excess, loss: Number(loss.toFixed(0)), cycles: opCycles.length };
    });

    // Trend: cost loss over cycles
    const trendData = cycles.map((c, i) => {
      const excess = Math.max(0, c.duration - costConfig.targetCycleTime);
      const loss = excess * costPerSecond;
      return { cycle: i + 1, loss: Number(loss.toFixed(0)), duration: Number(c.duration.toFixed(1)) };
    });

    // Top 3 costliest steps
    const top3 = [...stepAvgs].sort((a, b) => b.costLoss - a.costLoss).slice(0, 3);

    // Pie data for cost distribution
    const pieData = stepAvgs
      .filter((s) => s.costLoss > 0)
      .map((s) => ({ name: `${s.emoji} ${s.name}`, value: s.costLoss }));

    return {
      avgHourlyCost, costPerSecond, stepAvgs, totalAvgCycleTime,
      excessPerCycle, costLossPerCycle, monthlyCostLoss, annualCostLoss,
      totalStepLoss, totalSavingPotential, operatorCosts, trendData, top3, pieData,
    };
  }, [cycles, operators, costConfig, steps]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Valor Producto (COP)</label>
            <input type="number" value={costConfig.productValue}
              onChange={(e) => updateCostConfig({ productValue: Number(e.target.value) })}
              className="input-glass mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Tiempo Objetivo (seg)</label>
            <input type="number" value={costConfig.targetCycleTime}
              onChange={(e) => updateCostConfig({ targetCycleTime: Number(e.target.value) })}
              className="input-glass mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Producción Mensual</label>
            <input type="number" value={costConfig.monthlyProductionTarget}
              onChange={(e) => updateCostConfig({ monthlyProductionTarget: Number(e.target.value) })}
              className="input-glass mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Costo/Hora Prom.</label>
            <div className="input-glass mt-1 flex items-center text-sm text-foreground font-mono">
              ${analysis.avgHourlyCost.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="glass-card p-4 text-center border-l-2 border-l-warning/60">
          <Flame className="w-5 h-5 text-warning mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-warning">{formatMoney(analysis.costLossPerCycle)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pérdida/Ciclo</div>
        </div>
        <div className="glass-card p-4 text-center border-l-2 border-l-destructive/60">
          <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-destructive">{formatMoney(analysis.monthlyCostLoss)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pérdida Mensual</div>
        </div>
        <div className="glass-card p-4 text-center border-l-2 border-l-destructive/40">
          <ArrowDown className="w-5 h-5 text-destructive/80 mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-destructive/80">{formatMoney(analysis.annualCostLoss)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Pérdida Anual</div>
        </div>
        <div className="glass-card p-4 text-center border-l-2 border-l-accent/60">
          <AlertTriangle className="w-5 h-5 text-accent mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-accent">{analysis.top3[0]?.step || "—"}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Paso + Costoso</div>
        </div>
        <div className="glass-card p-4 text-center border-l-2 border-l-success/60">
          <Zap className="w-5 h-5 text-success mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-success">{formatMoney(analysis.totalSavingPotential)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ahorro Potencial</div>
        </div>
        <div className="glass-card p-4 text-center border-l-2 border-l-primary/60">
          <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
          <div className="text-lg font-bold font-mono text-primary">{analysis.excessPerCycle.toFixed(1)}s</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Exceso/Ciclo</div>
        </div>
      </div>

      {cycles.length > 0 ? (
        <>
          {/* Top 3 cuellos de botella */}
          {analysis.top3.length > 0 && (
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-destructive" />
                🔥 Top 3 Cuellos de Botella (Mayor fuga de dinero)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {analysis.top3.map((s, i) => (
                  <div key={s.step} className={`rounded-lg p-4 border ${
                    i === 0 ? "bg-destructive/5 border-destructive/20" : i === 1 ? "bg-warning/5 border-warning/20" : "bg-muted/20 border-border/20"
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{s.emoji}</span>
                      <div>
                        <p className="text-xs font-bold text-foreground">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">{s.step} · {s.samples} muestras</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">Promedio</span>
                        <p className="font-mono text-foreground font-bold">{s.avg}s</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Objetivo</span>
                        <p className="font-mono text-muted-foreground">{s.target}s</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Exceso</span>
                        <p className={`font-mono font-bold ${s.excess > 0 ? "text-warning" : "text-success"}`}>
                          {s.excess > 0 ? `+${s.excess}s` : "✓ OK"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pérdida</span>
                        <p className="font-mono text-destructive font-bold">${s.costLoss}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar chart: cost loss per step */}
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-3">
                💸 Fuga por Paso (COP)
              </h4>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analysis.stepAvgs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
                  <XAxis dataKey="step" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="costLoss" fill="hsl(40,95%,55%)" radius={[4, 4, 0, 0]} name="Pérdida COP" />
                  <Bar dataKey="savingPotential" fill="hsl(155,70%,45%)" radius={[4, 4, 0, 0]} name="Ahorro Potencial" opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie chart: cost distribution */}
            {analysis.pieData.length > 0 && (
              <div className="glass-card p-5">
                <h4 className="text-sm font-display font-bold text-foreground mb-3">
                  🥧 Distribución de Pérdidas
                </h4>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={analysis.pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                      paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false} style={{ fontSize: 10 }}>
                      {analysis.pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2 justify-center">
                  {analysis.pieData.map((d, i) => (
                    <span key={i} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Trend line */}
          {analysis.trendData.length > 1 && (
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-3">
                📉 Tendencia de Pérdida por Ciclo
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analysis.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
                  <XAxis dataKey="cycle" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="loss" stroke="hsl(0,80%,58%)" fill="hsla(0,80%,58%,0.15)" name="Pérdida COP" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-operator cost */}
          {analysis.operatorCosts.length > 0 && (
            <div className="glass-card p-5">
              <h4 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-accent" />
                Pérdida por Operario
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {analysis.operatorCosts.map((op) => (
                  <div key={op.name} className="rounded-lg bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{op.name}</span>
                      <span className="text-[10px] text-muted-foreground">{op.cycles} ciclos</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground">T. Prom.</span>
                        <p className="font-mono text-foreground">{formatTime(op.avgTime)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Exceso</span>
                        <p className={`font-mono ${op.excess > 0 ? "text-warning" : "text-success"}`}>
                          {op.excess > 0 ? `+${op.excess.toFixed(1)}s` : "✓"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Pérdida</span>
                        <p className="font-mono text-destructive font-bold">${op.loss}</p>
                      </div>
                    </div>
                    {/* Mini bar showing excess */}
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${op.excess > 0 ? "bg-destructive/60" : "bg-success/60"}`}
                        style={{ width: `${Math.min(100, (op.avgTime / (costConfig.targetCycleTime * 1.5)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full detail table */}
          <div className="glass-card p-5 overflow-x-auto">
            <h4 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Detalle Completo por Paso
            </h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/30">
                  <th className="text-left py-2 px-2">Paso</th>
                  <th className="text-right py-2 px-2">Mejor</th>
                  <th className="text-right py-2 px-2">Promedio</th>
                  <th className="text-right py-2 px-2">Peor</th>
                  <th className="text-right py-2 px-2">Objetivo</th>
                  <th className="text-right py-2 px-2">Exceso</th>
                  <th className="text-right py-2 px-2">Pérdida</th>
                  <th className="text-right py-2 px-2">Ahorro Pot.</th>
                </tr>
              </thead>
              <tbody>
                {analysis.stepAvgs.map((s) => (
                  <tr key={s.step} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                    <td className="py-2 px-2 text-foreground">{s.emoji} {s.name}</td>
                    <td className="py-2 px-2 text-right font-mono text-success">{s.best}s</td>
                    <td className="py-2 px-2 text-right font-mono text-foreground font-bold">{s.avg}s</td>
                    <td className="py-2 px-2 text-right font-mono text-destructive/70">{s.worst}s</td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">{s.target}s</td>
                    <td className={`py-2 px-2 text-right font-mono ${s.excess > 0 ? "text-warning font-bold" : "text-success"}`}>
                      {s.excess > 0 ? `+${s.excess}s` : "✓"}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono ${s.costLoss > 0 ? "text-destructive font-bold" : "text-success"}`}>
                      {s.costLoss > 0 ? `$${s.costLoss}` : "$0"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-success/80">
                      {s.savingPotential > 0 ? `$${s.savingPotential}` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border/30 font-bold">
                  <td className="py-2 px-2 text-foreground">TOTAL</td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-2"></td>
                  <td className="py-2 px-2 text-right font-mono text-warning">{analysis.excessPerCycle.toFixed(1)}s</td>
                  <td className="py-2 px-2 text-right font-mono text-destructive">${analysis.totalStepLoss}</td>
                  <td className="py-2 px-2 text-right font-mono text-success">${analysis.totalSavingPotential}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Resumen ejecutivo */}
          <div className="glass-card p-5 border border-warning/20 bg-warning/5">
            <h4 className="text-sm font-display font-bold text-warning mb-2 flex items-center gap-2">
              ⚠️ Resumen Ejecutivo de Pérdidas
            </h4>
            <div className="text-xs text-foreground/80 space-y-1">
              <p>• Cada ciclo pierde <strong className="text-warning">{formatMoney(analysis.costLossPerCycle)}</strong> por encima del objetivo de {costConfig.targetCycleTime}s.</p>
              <p>• Con {costConfig.monthlyProductionTarget.toLocaleString()} unidades/mes, la pérdida mensual es <strong className="text-destructive">{formatMoney(analysis.monthlyCostLoss)}</strong> y anual <strong className="text-destructive">{formatMoney(analysis.annualCostLoss)}</strong>.</p>
              {analysis.top3[0] && (
                <p>• El paso más costoso es <strong className="text-accent">{analysis.top3[0].emoji} {analysis.top3[0].name}</strong> con <strong className="text-destructive">${analysis.top3[0].costLoss}</strong> de pérdida/ciclo.</p>
              )}
              <p>• Potencial de ahorro si todos los pasos alcanzaran su mejor tiempo: <strong className="text-success">{formatMoney(analysis.totalSavingPotential)}/ciclo</strong>.</p>
            </div>
          </div>
        </>
      ) : (
        <div className="glass-card p-12 text-center">
          <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-foreground mb-2">Sin datos de costos</h3>
          <p className="text-sm text-muted-foreground">Registra ciclos para ver el análisis de fuga de dinero</p>
        </div>
      )}
    </div>
  );
};

export default CostAnalysis;
