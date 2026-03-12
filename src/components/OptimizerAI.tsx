import React, { useMemo } from "react";
import { Zap, Lightbulb, CheckCircle2, AlertTriangle, TrendingDown, Brain, Target } from "lucide-react";
import { useTimeStudy, CRANE_STEPS } from "@/context/TimeStudyContext";

interface Suggestion {
  type: "critical" | "improvement" | "insight";
  icon: React.ElementType;
  title: string;
  description: string;
  impact: string;
}

const OptimizerAI: React.FC = () => {
  const { cycles, defects, qualityChecks, operators, costConfig } = useTimeStudy();

  const suggestions = useMemo<Suggestion[]>(() => {
    const result: Suggestion[] = [];
    if (cycles.length < 3) return result;

    const allTimes = cycles.map((c) => c.duration);
    const mean = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
    const stdDev = Math.sqrt(allTimes.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / allTimes.length);
    const cv = (stdDev / mean) * 100; // coefficient of variation

    // High variability
    if (cv > 15) {
      result.push({
        type: "critical",
        icon: AlertTriangle,
        title: "Alta Variabilidad en el Proceso",
        description: `Coeficiente de variación del ${cv.toFixed(1)}% (σ=${stdDev.toFixed(1)}s). Esto indica falta de estandarización. El proceso no es predecible.`,
        impact: "Implementar trabajo estándar (Standard Work) con instrucciones visuales en cada estación reduce la variabilidad hasta un 40%.",
      });
    }

    // Step bottleneck detection
    const stepAvgs = CRANE_STEPS.map((step) => {
      const times = cycles.flatMap((c) => c.steps).filter((s) => s.stepNumber === step.number).map((s) => s.duration);
      return { ...step, avg: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0 };
    }).filter((s) => s.avg > 0);

    if (stepAvgs.length > 0) {
      const bottleneck = stepAvgs.reduce((max, s) => s.avg > max.avg ? s : max);
      const targetPerStep = costConfig.targetCycleTime / 12;
      if (bottleneck.avg > targetPerStep * 1.3) {
        result.push({
          type: "critical",
          icon: Target,
          title: `Cuello de Botella: ${bottleneck.name}`,
          description: `El paso ${bottleneck.number} toma ${bottleneck.avg.toFixed(1)}s promedio vs ${targetPerStep.toFixed(1)}s objetivo (${((bottleneck.avg / targetPerStep - 1) * 100).toFixed(0)}% sobre el objetivo).`,
          impact: "Aplicar análisis SMED (Single Minute Exchange of Die) al paso específico. Filmar el paso, eliminar movimientos innecesarios, redistribuir actividades.",
        });
      }
    }

    // Operator comparison
    if (operators.length >= 2) {
      const opAvgs = operators.map((op) => {
        const opCycles = cycles.filter((c) => c.operatorId === op.id);
        return { ...op, avg: opCycles.length > 0 ? opCycles.reduce((s, c) => s + c.duration, 0) / opCycles.length : 0, count: opCycles.length };
      }).filter((o) => o.count > 0);

      if (opAvgs.length >= 2) {
        const fastest = opAvgs.reduce((min, o) => o.avg < min.avg ? o : min);
        const slowest = opAvgs.reduce((max, o) => o.avg > max.avg ? o : max);
        const diff = slowest.avg - fastest.avg;
        const pctDiff = (diff / fastest.avg) * 100;

        if (pctDiff > 10) {
          result.push({
            type: "improvement",
            icon: Brain,
            title: "Transferencia de Conocimiento Requerida",
            description: `${fastest.name} es ${pctDiff.toFixed(0)}% más rápido que ${slowest.name} (${diff.toFixed(1)}s de diferencia).`,
            impact: `Programa de shadowing: ${slowest.name} observa a ${fastest.name} durante 2 turnos. Documenta las mejores prácticas del operario más eficiente.`,
          });
        }
      }
    }

    // Quality correlation
    if (qualityChecks.length > 0) {
      const failRate = (qualityChecks.filter((q) => !q.overallPass).length / qualityChecks.length) * 100;
      if (failRate > 20) {
        result.push({
          type: "critical",
          icon: AlertTriangle,
          title: "Tasa de Falla Crítica",
          description: `${failRate.toFixed(0)}% de las inspecciones fallan. Esto genera reprocesos que multiplican los costos.`,
          impact: "Implementar Poka-Yoke (mecanismos anti-error) en los pasos con más defectos. Cada defecto evitado ahorra el costo completo de un ciclo.",
        });
      }
    }

    // Defect concentration
    if (defects.length > 0) {
      const typeMap = new Map<string, number>();
      defects.forEach((d) => typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1));
      const sorted = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      const pct = (top[1] / defects.length) * 100;

      result.push({
        type: "improvement",
        icon: Lightbulb,
        title: `Defecto Pareto: "${top[0]}"`,
        description: `Representa el ${pct.toFixed(0)}% de todos los defectos (${top[1]} de ${defects.length}). Principio de Pareto: resolver este defecto eliminará la mayoría de los problemas.`,
        impact: "Aplicar 5 Porqués (5 Whys) y diagrama Ishikawa para encontrar la causa raíz. Definir contramedidas específicas.",
      });
    }

    // Learning curve
    if (cycles.length >= 6) {
      const firstHalf = cycles.slice(0, Math.floor(cycles.length / 2));
      const secondHalf = cycles.slice(Math.floor(cycles.length / 2));
      const firstAvg = firstHalf.reduce((s, c) => s + c.duration, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, c) => s + c.duration, 0) / secondHalf.length;
      const improvement = ((firstAvg - secondAvg) / firstAvg) * 100;

      if (improvement > 5) {
        result.push({
          type: "insight",
          icon: TrendingDown,
          title: "Curva de Aprendizaje Activa",
          description: `Mejora del ${improvement.toFixed(1)}% entre la primera y segunda mitad de los ciclos. El equipo está aprendiendo.`,
          impact: "Mantener la frecuencia de práctica. Documentar las técnicas que están dando resultado para institucionalizar la mejora.",
        });
      } else if (improvement < -5) {
        result.push({
          type: "critical",
          icon: AlertTriangle,
          title: "Degradación de Performance",
          description: `Los tiempos empeoraron ${Math.abs(improvement).toFixed(1)}% en la segunda mitad. Posible fatiga o pérdida de motivación.`,
          impact: "Evaluar condiciones ergonómicas, rotación de puestos, y sistema de incentivos. Considerar pausas activas cada 45 minutos.",
        });
      }
    }

    // PDCA recommendation
    result.push({
      type: "insight",
      icon: CheckCircle2,
      title: "Ciclo PDCA Recomendado",
      description: "Basado en los datos actuales, el siguiente paso de mejora continua es definir un plan de acción específico.",
      impact: "PLAN: Identificar el cuello de botella principal → DO: Implementar contramedida → CHECK: Medir 10 ciclos adicionales → ACT: Estandarizar si hay mejora, iterar si no.",
    });

    return result;
  }, [cycles, defects, qualityChecks, operators, costConfig]);

  const isUnlocked = cycles.length >= 10;

  const typeColors = {
    critical: { bg: "bg-destructive/10", border: "border-destructive/20", badge: "bg-destructive/20 text-destructive" },
    improvement: { bg: "bg-warning/10", border: "border-warning/20", badge: "bg-warning/20 text-warning" },
    insight: { bg: "bg-primary/10", border: "border-primary/20", badge: "bg-primary/20 text-primary" },
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="glass-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 glow-primary">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground">AI Optimizer — Re-Ingeniería de Procesos</h3>
            <p className="text-xs text-muted-foreground">
              {isUnlocked
                ? `${suggestions.length} sugerencias generadas basadas en ${cycles.length} ciclos de datos`
                : `Necesitas ${10 - cycles.length} ciclos más para desbloquear (${cycles.length}/10)`}
            </p>
          </div>
        </div>

        {!isUnlocked && (
          <div className="mt-4">
            <div className="w-full h-2 rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${(cycles.length / 10) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">{cycles.length}/10 ciclos completados</p>
          </div>
        )}
      </div>

      {isUnlocked && suggestions.map((s, i) => {
        const colors = typeColors[s.type];
        const Icon = s.icon;
        return (
          <div key={i} className={`glass-card p-5 ${colors.border}`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.bg} flex-shrink-0 mt-0.5`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-display font-bold text-foreground">{s.title}</h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${colors.badge}`}>
                    {s.type === "critical" ? "Crítico" : s.type === "improvement" ? "Mejora" : "Insight"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{s.description}</p>
                <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
                  <p className="text-xs text-foreground/80">
                    <span className="font-semibold text-primary">→ Acción: </span>{s.impact}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {isUnlocked && suggestions.length === 0 && (
        <div className="glass-card p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
          <h3 className="text-lg font-display font-bold text-foreground mb-2">¡Proceso Optimizado!</h3>
          <p className="text-sm text-muted-foreground">No se detectaron problemas significativos. Continúa monitoreando.</p>
        </div>
      )}
    </div>
  );
};

export default OptimizerAI;
