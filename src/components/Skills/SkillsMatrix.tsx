/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { GraduationCap, TrendingDown, Target, AlertTriangle, ShieldAlert, Info, Users, CheckCircle2, Grid2x2 } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildSkillsReport, wrightTime, ILUO_LABELS, ILUO_ORDER, ILUO_THRESHOLDS, LEARNING_MIN_CYCLES, RECENT_WINDOW,
  OUTLIER_MODIFIED_Z, PLATEAU_MAX_REL_SLOPE, REGRESSION_MIN_INCREASE, REFERENCE_LABELS,
  type CompetencyCell, type IluoLevel, type OperatorLearning, type StepReference, type TrainingAlert,
} from "@/lib/learning";

const tooltipStyle = {
  contentStyle: {
    background: "hsla(230,22%,9%,0.95)",
    border: "1px solid hsla(230,16%,28%,0.3)",
    borderRadius: "8px",
    color: "hsl(210,20%,92%)",
    fontSize: "11px",
  },
};

const num = (x: number, d = 1) => x.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Colores por nivel; el nivel también se muestra con la letra y un cuadrado ILUO (no solo color). */
const LEVEL_STYLE: Record<IluoLevel, string> = {
  I: "bg-destructive/15 text-destructive border-destructive/40",
  L: "bg-warning/15 text-warning border-warning/40",
  U: "bg-primary/15 text-primary border-primary/40",
  O: "bg-success/15 text-success border-success/40",
};

/** Cuadrado ILUO clásico: se rellena un cuarto por nivel (I = ¼, L = ½, U = ¾, O = completo). */
const IluoGlyph: React.FC<{ level: IluoLevel }> = ({ level }) => {
  const filled = ILUO_ORDER.indexOf(level) + 1;
  // orden de relleno: arriba-izq, arriba-der, abajo-der, abajo-izq
  const order = [0, 1, 3, 2];
  return (
    <span aria-hidden="true" className="grid grid-cols-2 gap-px w-2.5 h-2.5 shrink-0">
      {[0, 1, 2, 3].map((q) => (
        <span key={q} className={`rounded-[1px] ${order.indexOf(q) < filled ? "bg-current" : "bg-current opacity-20"}`} />
      ))}
    </span>
  );
};

const IluoBadge: React.FC<{ level: IluoLevel; className?: string }> = ({ level, className = "" }) => (
  <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold font-mono ${LEVEL_STYLE[level]} ${className}`}>
    <IluoGlyph level={level} />
    {level}
  </span>
);

function referenceText(ref: StepReference, operatorName: (id: number) => string): string {
  if (ref.reference === null || ref.source === null) return "Sin referencia (faltan datos)";
  const who = ref.referenceOperatorId !== null ? `: ${operatorName(ref.referenceOperatorId)}` : "";
  return `${num(ref.reference)} s (${REFERENCE_LABELS[ref.source]}${who})`;
}

const MatrixCell: React.FC<{ cell: CompetencyCell; operator: string; step: string; reference: string }> = ({ cell, operator, step, reference }) => {
  if (cell.level === null) {
    return <span className="text-muted-foreground/60" aria-label={`${operator}, ${step}: sin registros`}>—</span>;
  }
  const lines = [
    `${ILUO_LABELS[cell.level]} (${cell.level})`,
    `Repeticiones: ${cell.n}`,
    `Tiempo medio: ${num(cell.mean)} s · CV ${Number.isFinite(cell.cv) ? pct(cell.cv) : "—"}`,
    `Referencia: ${reference}`,
    cell.ratio !== null ? `Razón vs referencia: ${pct(cell.ratio)}` : "Razón vs referencia: —",
  ];
  const next = cell.missingForNext.length ? `Para subir de nivel necesita: ${cell.missingForNext.join("; ")}.` : "Nivel máximo.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${operator}, ${step}: ${lines.join(". ")}. ${next}`}
        >
          <IluoBadge level={cell.level} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs space-y-0.5">
        <p className="font-semibold">{operator} · {step}</p>
        {lines.map((l) => <p key={l}>{l}</p>)}
        <p className="text-muted-foreground pt-1">{next}</p>
      </TooltipContent>
    </Tooltip>
  );
};

const EmptyState: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="text-center py-8 px-4">
    <Icon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
    <h4 className="text-sm font-display font-bold text-foreground mb-1">{title}</h4>
    <div className="text-xs text-muted-foreground max-w-md mx-auto">{children}</div>
  </div>
);

const SEVERITY_STYLE: Record<TrainingAlert["severity"], { cls: string; icon: React.ElementType; label: string }> = {
  alta: { cls: "border-destructive/40 bg-destructive/10 text-destructive", icon: ShieldAlert, label: "Alta" },
  media: { cls: "border-warning/40 bg-warning/10 text-warning", icon: AlertTriangle, label: "Media" },
  baja: { cls: "border-primary/30 bg-primary/10 text-primary", icon: Info, label: "Baja" },
};

// ── Curva de aprendizaje ─────────────────────────────────────────────────────────

const LearningCurveCard: React.FC<{ learning: OperatorLearning[]; standard: number }> = ({ learning, standard }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    learning.find((l) => l.operator.id === selectedId) ?? learning.find((l) => l.result.kind === "fit") ?? learning[0];
  const result = selected?.result;

  const chartData = useMemo(() => {
    if (result?.kind !== "fit") return [];
    const last = result.points[result.points.length - 1].n;
    let maxN = last;
    const sp = result.standard;
    if (sp?.status === "predicted" && sp.predictedCycle !== null) maxN = Math.min(sp.predictedCycle, Math.max(2 * last, last + 10));
    const byN = new Map(result.points.map((p) => [p.n, p]));
    return Array.from({ length: maxN }, (_, i) => {
      const n = i + 1;
      const p = byN.get(n);
      return {
        n,
        real: p && p.valid && !p.outlier ? Number(p.duration.toFixed(1)) : undefined,
        atipico: p && p.valid && p.outlier ? Number(p.duration.toFixed(1)) : undefined,
        ajuste: Number(wrightTime(result.fit.t1, result.fit.b, n).toFixed(1)),
      };
    });
  }, [result]);

  return (
    <div className="glass-card p-5 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-display font-bold text-foreground">Curva de aprendizaje por operario</h4>
      </div>

      <div role="group" aria-label="Seleccionar operario" className="flex flex-wrap gap-2 mb-4">
        {learning.map((l) => {
          const active = l.operator.id === selected?.operator.id;
          return (
            <button
              key={l.operator.id}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedId(l.operator.id)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                active ? "bg-primary/15 border-primary/40 text-primary font-semibold" : "bg-muted/20 border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.operator.name} <span className="opacity-70">· {l.cycleCount} ciclos</span>
            </button>
          );
        })}
      </div>

      {!result || result.kind !== "fit" ? (
        <EmptyState icon={GraduationCap} title={`Faltan ciclos de ${selected?.operator.name ?? "este operario"}`}>
          <p>{result?.kind === "insufficient" ? result.reason : ""}</p>
          <p className="mt-1">
            Registra al menos {LEARNING_MIN_CYCLES} ciclos por operario con el cronómetro por pasos (o la entrada manual) para estimar su curva de aprendizaje.
          </p>
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3">
              <div className="stat-label text-[10px]">Tasa de aprendizaje</div>
              <div className="stat-value text-xl text-primary">{pct(result.fit.learningRate)}</div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {result.fit.b < 0
                  ? `Cada vez que duplica sus repeticiones, su tiempo baja al ${pct(result.fit.learningRate)}.`
                  : "Sin mejora con la práctica en los datos actuales."}
              </p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3">
              <div className="stat-label text-[10px]">Ajuste (R²)</div>
              <div className="stat-value text-xl text-foreground">{num(result.fit.r2, 2)}</div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {result.fit.r2 >= 0.8 ? "La curva describe bien los datos." : result.fit.r2 >= 0.5 ? "Ajuste moderado: hay variabilidad." : "Ajuste débil: mucha variabilidad o ya en meseta."}
              </p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3">
              <div className="stat-label text-[10px]">1.ª repetición estimada</div>
              <div className="stat-value text-xl text-foreground">{num(result.fit.t1)} s</div>
              <p className="text-[10px] text-muted-foreground mt-1">T1 del modelo de Wright · {result.fit.nUsed} ciclos usados</p>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3">
              <div className="stat-label text-[10px]">Tiempo estándar</div>
              {!result.standard ? (
                <p className="text-xs text-muted-foreground mt-1">Define el tiempo objetivo del ciclo en Fuga de Dinero.</p>
              ) : result.standard.reached ? (
                <>
                  <div className="stat-value text-base text-success flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Ya alcanzó el estándar</div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Mediana de los últimos {result.standard.window} ciclos: {num(result.standard.recentMedian)} s ≤ {num(result.standard.standard)} s
                    {result.standard.firstReachedAt !== null ? ` (desde el ciclo ${result.standard.firstReachedAt})` : ""}.
                  </p>
                </>
              ) : result.standard.status === "predicted" ? (
                <>
                  <div className="stat-value text-xl text-warning">≈ {result.standard.cyclesRemaining} ciclos más</div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Llegaría a {num(result.standard.standard)} s hacia el ciclo {result.standard.predictedCycle} (mediana actual {num(result.standard.recentMedian)} s).
                  </p>
                </>
              ) : (
                <>
                  <div className="stat-value text-base text-destructive">No se proyecta alcanzarlo</div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {result.standard.status === "not-improving"
                      ? "Su tiempo no baja con la práctica: revisa método y entrenamiento."
                      : "Con la tendencia actual tardaría demasiados ciclos: revisa método y entrenamiento."}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="w-full" role="img" aria-label={`Curva de aprendizaje de ${selected.operator.name}: tiempos reales, curva ajustada y línea del estándar`}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
                <XAxis dataKey="n" tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} label={{ value: "Repetición", position: "insideBottomRight", offset: -2, fill: "hsl(215,15%,50%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(215,15%,50%)", fontSize: 10 }} domain={[0, "auto"]} unit=" s" />
                <ChartTooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {standard > 0 && (
                  <ReferenceLine y={standard} ifOverflow="extendDomain" stroke="hsl(155,70%,45%)" strokeDasharray="6 4" label={{ value: "Estándar", fill: "hsl(155,70%,45%)", fontSize: 10, position: "insideTopRight" }} />
                )}
                <Line type="monotone" dataKey="ajuste" name="Curva ajustada" stroke="hsl(265,80%,62%)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="linear" dataKey="real" name="Tiempo real (s)" stroke="hsl(185,100%,50%)" strokeOpacity={0.35} strokeWidth={1} dot={{ r: 3, fill: "hsl(185,100%,50%)" }} connectNulls isAnimationActive={false} />
                {result.outlierCount > 0 && (
                  <Line type="linear" dataKey="atipico" name="Atípico (excluido)" stroke="none" dot={{ r: 4, fill: "hsl(0,80%,58%)" }} isAnimationActive={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
            {result.plateau?.plateau && (
              <span className="px-2 py-1 rounded-md border border-warning/40 bg-warning/10 text-warning">
                Meseta: en los últimos {result.plateau.window} ciclos el tiempo casi no cambia
                {result.standard && !result.standard.reached ? " — la predicción puede ser optimista" : ""}.
              </span>
            )}
            {result.regression?.detected && (
              <span className="px-2 py-1 rounded-md border border-destructive/40 bg-destructive/10 text-destructive">
                Retroceso: sus últimos ciclos son {pct(result.regression.change)} más lentos.
              </span>
            )}
            {result.outlierCount > 0 && (
              <span className="px-2 py-1 rounded-md border border-border/30 bg-muted/20 text-muted-foreground">
                {result.outlierCount} ciclo(s) atípico(s) excluido(s) del ajuste.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────────────────────────

const SkillsMatrix: React.FC = () => {
  const { steps, operators, cycles, costConfig } = useTimeStudy();
  const standard = costConfig.targetCycleTime;

  const report = useMemo(
    () => buildSkillsReport({ steps, operators, cycles, targetCycleTime: standard }),
    [steps, operators, cycles, standard],
  );
  const { matrix, alerts, learning } = report;
  const opName = (id: number) => operators.find((o) => o.id === id)?.name ?? `Operario ${id}`;

  if (operators.length === 0 || cycles.length === 0) {
    return (
      <div className="glass-card p-6 animate-fade-in">
        <EmptyState icon={GraduationCap} title={operators.length === 0 ? "Sin operarios" : "Sin ciclos registrados"}>
          <p>
            {operators.length === 0
              ? "Agrega operarios desde el menú lateral para seguir su aprendizaje."
              : `Registra al menos ${LEARNING_MIN_CYCLES} ciclos por operario con el cronómetro por pasos para ver su curva de aprendizaje y su nivel (ILUO) en cada paso.`}
          </p>
        </EmptyState>
      </div>
    );
  }

  const atStandard = learning.filter((l) => l.result.kind === "fit" && l.result.standard?.reached).length;
  const riskSteps = matrix.stepSummaries.filter((s) => s.operatorsWithData > 0 && s.autonomous.length <= 1).length;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-5 animate-fade-in">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 glow-primary shrink-0">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-foreground">Curva de aprendizaje y matriz de competencias</h3>
              <p className="text-xs text-muted-foreground">
                Quién está entrenado en cada paso, quién sigue aprendiendo y cuándo llegará al estándar. Base objetiva para entrenamiento e incentivos.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3 text-center">
              <Target className="w-4 h-4 text-success mx-auto mb-1" />
              <div className="stat-value text-lg text-success">{atStandard}/{operators.length}</div>
              <div className="stat-label text-[10px]">En el estándar</div>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3 text-center">
              <Users className="w-4 h-4 text-warning mx-auto mb-1" />
              <div className="stat-value text-lg text-warning">{riskSteps}</div>
              <div className="stat-label text-[10px]">Pasos en riesgo</div>
            </div>
            <div className="rounded-lg bg-muted/20 border border-border/20 p-3 text-center">
              <AlertTriangle className="w-4 h-4 text-destructive mx-auto mb-1" />
              <div className="stat-value text-lg text-destructive">{alerts.length}</div>
              <div className="stat-label text-[10px]">Alertas</div>
            </div>
          </div>
        </div>

        <LearningCurveCard learning={learning} standard={standard} />

        {/* Matriz ILUO */}
        <div className="glass-card p-5 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Grid2x2 className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-display font-bold text-foreground">Matriz de competencias (ILUO)</h4>
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-2 mb-4 text-[11px] text-muted-foreground" aria-label="Leyenda de niveles">
            {ILUO_ORDER.map((l) => (
              <li key={l} className="flex items-center gap-1.5">
                <IluoBadge level={l} /> {ILUO_LABELS[l]}
              </li>
            ))}
          </ul>

          {!matrix.hasStepData ? (
            <EmptyState icon={Grid2x2} title="Aún no hay tiempos por paso">
              <p>
                La matriz necesita el tiempo de cada paso. Usa el cronómetro por pasos o la entrada manual por pasos: los ciclos detectados
                automáticamente solo traen la duración total (sirven para la curva de aprendizaje, no para la matriz).
              </p>
            </EmptyState>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border/20">
                <table className="min-w-max w-full text-xs">
                  <caption className="sr-only">Nivel ILUO de cada operario en cada paso</caption>
                  <thead>
                    <tr className="bg-muted/20">
                      <th scope="col" className="sticky left-0 z-10 bg-card text-left px-3 py-2 font-semibold text-foreground">Operario</th>
                      {matrix.steps.map((s) => (
                        <th key={s.number} scope="col" className="px-2 py-2 font-semibold text-foreground text-center" title={s.name}>
                          <div>{s.emoji} P{s.number}</div>
                          <div className="text-[9px] font-normal text-muted-foreground max-w-[72px] truncate mx-auto">{s.name}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.operators.map((op, i) => (
                      <tr key={op.id} className="border-t border-border/10">
                        <th scope="row" className="sticky left-0 z-10 bg-card text-left px-3 py-2 font-medium text-foreground whitespace-nowrap">{op.name}</th>
                        {matrix.cells[i].map((cell, j) => (
                          <td key={cell.stepNumber} className="px-2 py-2 text-center">
                            <MatrixCell
                              cell={cell}
                              operator={op.name}
                              step={`Paso ${matrix.steps[j].number} (${matrix.steps[j].name})`}
                              reference={referenceText(matrix.stepSummaries[j].reference, opName)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/30 bg-muted/10">
                      <th scope="row" className="sticky left-0 z-10 bg-card text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">Autónomos (U/O)</th>
                      {matrix.stepSummaries.map((s) => (
                        <td
                          key={s.step.number}
                          className={`px-2 py-2 text-center font-mono font-bold ${
                            s.operatorsWithData === 0 ? "text-muted-foreground/50" : s.autonomous.length === 0 ? "text-destructive" : s.autonomous.length === 1 ? "text-warning" : "text-success"
                          }`}
                        >
                          {s.operatorsWithData === 0 ? "—" : s.autonomous.length}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Toca o pasa el cursor sobre cada nivel para ver los números.
                {matrix.cyclesWithoutSteps > 0 && ` ${matrix.cyclesWithoutSteps} ciclo(s) sin tiempos por paso no cuentan para la matriz.`}
              </p>
            </>
          )}
        </div>

        {/* Alertas */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-warning" />
            <h4 className="text-sm font-display font-bold text-foreground">Alertas de entrenamiento</h4>
          </div>
          {alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              Sin alertas: no hay retrocesos ni pasos que dependan de una sola persona con los datos actuales.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, k) => {
                const sev = SEVERITY_STYLE[a.severity];
                const Icon = sev.icon;
                return (
                  <li key={`${a.kind}-${a.operatorId ?? ""}-${a.stepNumber ?? ""}-${k}`} className={`flex items-start gap-3 rounded-lg border p-3 ${sev.cls}`}>
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">
                        <span className="sr-only">Prioridad {sev.label}: </span>
                        {a.title}
                      </p>
                      <p className="text-[11px] text-foreground/80 mt-0.5">{a.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <details className="glass-card p-5 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">¿Cómo se calcula?</summary>
          <div className="mt-3 space-y-2">
            <p>
              <strong className="text-foreground">Curva de aprendizaje (Wright, 1936):</strong> T<sub>n</sub> = T1 · n<sup>b</sup>, ajustada por mínimos cuadrados en escala
              logarítmica con los ciclos de cada operario en orden. Tasa de aprendizaje = 2<sup>b</sup>. Se necesitan al menos {LEARNING_MIN_CYCLES} ciclos válidos; los
              ciclos atípicos (puntuación z modificada &gt; {OUTLIER_MODIFIED_Z}, Iglewicz y Hoaglin) se excluyen del ajuste.
            </p>
            <p>
              <strong className="text-foreground">Estándar:</strong> se considera alcanzado cuando la mediana de los últimos {RECENT_WINDOW} ciclos es menor o igual al tiempo
              objetivo. Meseta: pendiente reciente ≤ {pct(PLATEAU_MAX_REL_SLOPE)} por ciclo. Retroceso: mediana reciente ≥ {pct(REGRESSION_MIN_INCREASE)} sobre la anterior.
            </p>
            <p>
              <strong className="text-foreground">Niveles ILUO</strong> (convención de Kronos, no un estándar publicado): razón = tiempo medio del paso / referencia (mejor
              operario estable o parte del estándar); CV = desviación / media.
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {(["L", "U", "O"] as const).map((l) => (
                <li key={l}>
                  <strong className="text-foreground">{l}</strong> ({ILUO_LABELS[l]}): ≥ {ILUO_THRESHOLDS[l].minSamples} repeticiones, razón ≤ {pct(ILUO_THRESHOLDS[l].maxRatio)} y CV ≤{" "}
                  {pct(ILUO_THRESHOLDS[l].maxCv)}.
                </li>
              ))}
              <li><strong className="text-foreground">I</strong> ({ILUO_LABELS.I}): no cumple aún los criterios de L.</li>
            </ul>
          </div>
        </details>
      </div>
    </TooltipProvider>
  );
};

export default SkillsMatrix;
