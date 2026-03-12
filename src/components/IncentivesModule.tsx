import React from "react";
import { TrendingUp, Award, Users, Target, Star } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";

const IncentivesModule: React.FC = () => {
  const { cycles, defects, qualityChecks, operators, costConfig } = useTimeStudy();

  const operatorScores = operators.map((op) => {
    const opCycles = cycles.filter((c) => c.operatorId === op.id);
    const opDefects = defects.filter((d) => d.operatorId === op.id);
    const opQuality = qualityChecks.filter((q) => q.operatorId === op.id);

    const cycleCount = opCycles.length;
    const avgTime = cycleCount > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / cycleCount : 0;
    const bestTime = cycleCount > 0 ? Math.min(...opCycles.map((c) => c.duration)) : 0;
    const qualityRate = opQuality.length > 0
      ? (opQuality.filter((q) => q.overallPass).length / opQuality.length) * 100
      : 100;
    const defectRate = cycleCount > 0 ? (opDefects.length / cycleCount) * 100 : 0;

    // Composite score (0-100)
    const timeScore = costConfig.targetCycleTime > 0
      ? Math.max(0, Math.min(100, (1 - (avgTime - costConfig.targetCycleTime) / costConfig.targetCycleTime) * 100))
      : 50;
    const qualityScore = qualityRate;
    const defectScore = Math.max(0, 100 - defectRate * 20);
    const consistencyBonus = cycleCount >= 5 ? 10 : 0;

    const totalScore = Math.min(100, (timeScore * 0.4 + qualityScore * 0.3 + defectScore * 0.2 + consistencyBonus));

    // Improvement over time
    let improvement = 0;
    if (opCycles.length >= 4) {
      const firstHalf = opCycles.slice(0, Math.floor(opCycles.length / 2));
      const secondHalf = opCycles.slice(Math.floor(opCycles.length / 2));
      const firstAvg = firstHalf.reduce((s, c) => s + c.duration, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, c) => s + c.duration, 0) / secondHalf.length;
      improvement = ((firstAvg - secondAvg) / firstAvg) * 100;
    }

    // Benchmark: industry avg for manual assembly ~180s, best ~90s
    const industryAvg = 180;
    const benchmarkPct = avgTime > 0 ? ((industryAvg - avgTime) / industryAvg) * 100 : 0;

    return {
      ...op,
      cycleCount,
      avgTime,
      bestTime,
      qualityRate,
      defectCount: opDefects.length,
      totalScore: Number(totalScore.toFixed(1)),
      improvement: Number(improvement.toFixed(1)),
      benchmarkPct: Number(benchmarkPct.toFixed(1)),
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-success";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-warning";
    return "text-destructive";
  };

  const getStars = (score: number) => {
    if (score >= 90) return 5;
    if (score >= 75) return 4;
    if (score >= 60) return 3;
    if (score >= 40) return 2;
    return 1;
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (cycles.length === 0) {
    return (
      <div className="glass-card p-12 text-center animate-fade-in">
        <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-display font-bold text-foreground mb-2">Sistema de Incentivos</h3>
        <p className="text-sm text-muted-foreground">Registra ciclos para calcular el rendimiento de cada operario</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-warning/10 border border-warning/20">
            <Award className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">Sistema de Incentivos Basado en Datos</h3>
            <p className="text-xs text-muted-foreground">Performance-Linked Pay + Benchmark Sectorial</p>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {operatorScores.map((op, rank) => (
          <div key={op.id} className={`glass-card p-5 ${rank === 0 ? "border-warning/30 glow-accent" : ""}`}>
            <div className="flex items-start gap-4">
              {/* Rank */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-xl flex-shrink-0 ${
                rank === 0 ? "bg-warning/20 text-warning" : rank === 1 ? "bg-muted/40 text-muted-foreground" : "bg-muted/20 text-muted-foreground"
              }`}>
                #{rank + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="font-display font-bold text-foreground">{op.name}</h4>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: getStars(op.totalScore) }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 text-warning fill-warning" />
                      ))}
                    </div>
                  </div>
                  <div className={`text-3xl font-display font-bold ${getScoreColor(op.totalScore)}`}>
                    {op.totalScore}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <div className="text-xs text-muted-foreground">Promedio</div>
                    <div className="font-mono font-bold text-sm text-foreground">{formatTime(op.avgTime)}</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <div className="text-xs text-muted-foreground">Calidad</div>
                    <div className="font-mono font-bold text-sm text-success">{op.qualityRate.toFixed(0)}%</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <div className="text-xs text-muted-foreground">Mejora</div>
                    <div className={`font-mono font-bold text-sm ${op.improvement > 0 ? "text-success" : op.improvement < 0 ? "text-destructive" : "text-foreground"}`}>
                      {op.improvement > 0 ? "+" : ""}{op.improvement}%
                    </div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-muted/20">
                    <div className="text-xs text-muted-foreground">vs Industria</div>
                    <div className={`font-mono font-bold text-sm ${op.benchmarkPct > 0 ? "text-success" : "text-destructive"}`}>
                      {op.benchmarkPct > 0 ? "+" : ""}{op.benchmarkPct}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Benchmark note */}
      <div className="glass-card p-4 border-primary/20">
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-semibold">📊 Benchmark Sectorial:</span> El promedio de la industria para ensamblaje manual es ~180s por unidad.
          Los valores "vs Industria" indican si el operario está por encima (+) o por debajo (-) del benchmark.
        </p>
      </div>
    </div>
  );
};

export default IncentivesModule;
