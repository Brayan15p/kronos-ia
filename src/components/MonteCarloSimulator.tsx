import React, { useState, useMemo } from "react";
import { Dice5, Play, TrendingUp, TrendingDown, Target, DollarSign } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

function normalRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const MonteCarloSimulator: React.FC = () => {
  const { cycles, operators, costConfig } = useTimeStudy();
  const [simCount, setSimCount] = useState(10000);
  const [simResults, setSimResults] = useState<null | {
    scenarios: number[];
    avgTime: number;
    p5: number;
    p50: number;
    p95: number;
    probMeetTarget: number;
    expectedRevenue: number;
    worstRevenue: number;
    bestRevenue: number;
    histogram: { bin: string; count: number }[];
    costSaved: number;
    costLost: number;
  }>(null);
  const [isRunning, setIsRunning] = useState(false);

  const avgHourlyCost = operators.length > 0
    ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length
    : 15000;

  const runSimulation = () => {
    if (cycles.length < 3) return;
    setIsRunning(true);

    setTimeout(() => {
      const times = cycles.map((c) => c.duration);
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = times.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);

      const scenarios: number[] = [];
      for (let i = 0; i < simCount; i++) {
        scenarios.push(Math.max(0, normalRandom(mean, stdDev)));
      }
      scenarios.sort((a, b) => a - b);

      const p5 = scenarios[Math.floor(simCount * 0.05)];
      const p50 = scenarios[Math.floor(simCount * 0.5)];
      const p95 = scenarios[Math.floor(simCount * 0.95)];
      const avgTime = scenarios.reduce((a, b) => a + b, 0) / simCount;
      const probMeetTarget = scenarios.filter((s) => s <= costConfig.targetCycleTime).length / simCount;

      // Revenue calculations
      const costPerSecond = avgHourlyCost / 3600;
      const expectedRevenue = costConfig.monthlyProductionTarget * (costConfig.productValue - avgTime * costPerSecond);
      const worstRevenue = costConfig.monthlyProductionTarget * (costConfig.productValue - p95 * costPerSecond);
      const bestRevenue = costConfig.monthlyProductionTarget * (costConfig.productValue - p5 * costPerSecond);
      const costSaved = (mean - p5) * costPerSecond * costConfig.monthlyProductionTarget;
      const costLost = (p95 - mean) * costPerSecond * costConfig.monthlyProductionTarget;

      // Histogram
      const binCount = 30;
      const minT = scenarios[0];
      const maxT = scenarios[simCount - 1];
      const binWidth = (maxT - minT) / binCount;
      const bins: { bin: string; count: number }[] = [];
      for (let i = 0; i < binCount; i++) {
        const lo = minT + i * binWidth;
        const hi = lo + binWidth;
        const count = scenarios.filter((s) => s >= lo && s < hi).length;
        bins.push({ bin: `${lo.toFixed(0)}s`, count });
      }

      setSimResults({
        scenarios, avgTime, p5, p50, p95, probMeetTarget,
        expectedRevenue, worstRevenue, bestRevenue,
        histogram: bins, costSaved, costLost,
      });
      setIsRunning(false);
    }, 100);
  };

  const tooltipStyle = {
    contentStyle: {
      background: "hsla(230,22%,9%,0.95)",
      border: "1px solid hsla(230,16%,28%,0.3)",
      borderRadius: "8px",
      color: "hsl(210,20%,92%)",
      fontSize: "11px",
    },
  };

  const formatMoney = (n: number) => {
    if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 glow-accent">
              <Dice5 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground">Simulador Monte Carlo</h3>
              <p className="text-xs text-muted-foreground">Simula {simCount.toLocaleString()} escenarios del futuro de tu producción</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Escenarios</label>
              <select value={simCount} onChange={(e) => setSimCount(Number(e.target.value))} className="select-glass mt-0.5 text-xs">
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
                <option value={50000}>50,000</option>
              </select>
            </div>
            <button
              onClick={runSimulation}
              disabled={cycles.length < 3 || isRunning}
              className="btn-accent-glass flex items-center gap-2 disabled:opacity-40"
            >
              <Play className="w-4 h-4" /> {isRunning ? "Simulando..." : "Simular"}
            </button>
          </div>
        </div>
      </div>

      {cycles.length < 3 && (
        <div className="glass-card p-12 text-center">
          <Dice5 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-foreground mb-2">Mínimo 3 ciclos requeridos</h3>
          <p className="text-sm text-muted-foreground">El simulador necesita datos históricos para proyectar escenarios futuros</p>
        </div>
      )}

      {simResults && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card p-4 text-center">
              <Target className="w-5 h-5 text-primary mx-auto mb-2" />
              <div className="stat-value text-xl text-primary">{(simResults.probMeetTarget * 100).toFixed(1)}%</div>
              <div className="stat-label">Prob. cumplir objetivo</div>
            </div>
            <div className="glass-card p-4 text-center">
              <TrendingUp className="w-5 h-5 text-success mx-auto mb-2" />
              <div className="stat-value text-xl text-success">{formatMoney(simResults.bestRevenue)}</div>
              <div className="stat-label">Mejor escenario</div>
            </div>
            <div className="glass-card p-4 text-center">
              <DollarSign className="w-5 h-5 text-warning mx-auto mb-2" />
              <div className="stat-value text-xl text-warning">{formatMoney(simResults.expectedRevenue)}</div>
              <div className="stat-label">Ganancia esperada</div>
            </div>
            <div className="glass-card p-4 text-center">
              <TrendingDown className="w-5 h-5 text-destructive mx-auto mb-2" />
              <div className="stat-value text-xl text-destructive">{formatMoney(simResults.worstRevenue)}</div>
              <div className="stat-label">Peor escenario</div>
            </div>
          </div>

          {/* Percentile cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-success font-semibold uppercase tracking-wider mb-1">P5 (Optimista)</div>
              <div className="font-display font-bold text-2xl text-success">{simResults.p5.toFixed(1)}s</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-primary font-semibold uppercase tracking-wider mb-1">P50 (Mediana)</div>
              <div className="font-display font-bold text-2xl text-primary">{simResults.p50.toFixed(1)}s</div>
            </div>
            <div className="glass-card p-4 text-center">
              <div className="text-xs text-destructive font-semibold uppercase tracking-wider mb-1">P95 (Pesimista)</div>
              <div className="font-display font-bold text-2xl text-destructive">{simResults.p95.toFixed(1)}s</div>
            </div>
          </div>

          {/* Histogram */}
          <div className="glass-card p-5">
            <h4 className="text-sm font-display font-bold text-foreground mb-4">
              📊 Distribución de {simCount.toLocaleString()} Escenarios
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={simResults.histogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
                <XAxis dataKey="bin" tick={{ fill: "hsl(215,15%,50%)", fontSize: 9 }} interval={3} />
                <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="hsl(265,80%,62%)" fill="hsla(265,80%,62%,0.2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Savings insight */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass-card p-5 border-success/20">
              <h4 className="text-sm font-display font-bold text-success mb-2">💰 Ahorro Potencial</h4>
              <p className="text-xs text-muted-foreground mb-3">Si logras operar en el P5 (mejor escenario) vs el promedio actual</p>
              <div className="stat-value text-3xl text-success">{formatMoney(simResults.costSaved)}</div>
              <div className="stat-label">ahorro mensual estimado</div>
            </div>
            <div className="glass-card p-5 border-destructive/20">
              <h4 className="text-sm font-display font-bold text-destructive mb-2">🔥 Riesgo de Pérdida</h4>
              <p className="text-xs text-muted-foreground mb-3">Si la producción cae al P95 (peor escenario) vs el promedio actual</p>
              <div className="stat-value text-3xl text-destructive">{formatMoney(simResults.costLost)}</div>
              <div className="stat-label">pérdida mensual estimada</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MonteCarloSimulator;
