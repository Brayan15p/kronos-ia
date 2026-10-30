/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass, ShieldAlert, CalendarCheck, ChevronDown, ExternalLink, Sparkles, Ruler, Info, Loader2, Coins,
} from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { useSST } from "@/context/SSTContext";
import { useSGSST } from "@/lib/sgsstStore";
import {
  analyzePlant, parseDemandConfig, resolveOperatorNames, formatCOP, AREA_LABEL, AREAS, PRIORITY_LABEL,
  LINE_BALANCE_CONFIG_KEY, EFFORT_WEIGHT,
  type CopilotArea, type CopilotSnapshot, type Confidence, type Effort, type Opportunity,
} from "@/lib/copilot";
import { buildCopilotAiPayload, streamCopilotNarration } from "@/lib/copilotAi";

const EFFORT_LABEL: Record<Effort, string> = {
  S: "Esfuerzo bajo (días, sin inversión)",
  M: "Esfuerzo medio (semanas, entrenamiento o rediseño)",
  L: "Esfuerzo alto (proyecto, personas o inversión)",
};

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  alta: "bg-success/15 text-success border-success/40",
  media: "bg-warning/15 text-warning border-warning/40",
  baja: "bg-destructive/15 text-destructive border-destructive/40",
};

const PRIORITY_STYLE: Record<Opportunity["priority"], string> = {
  "seguridad-critica": "bg-destructive/20 text-destructive border-destructive/50",
  "seguridad-alta": "bg-destructive/10 text-destructive border-destructive/30",
  economica: "bg-success/15 text-success border-success/40",
  "sin-monetizar": "bg-muted/40 text-muted-foreground border-border",
  medicion: "bg-primary/15 text-primary border-primary/40",
};

function readDemandRaw(): string | null {
  try {
    return localStorage.getItem(LINE_BALANCE_CONFIG_KEY);
  } catch {
    return null; // almacenamiento no disponible
  }
}

const Pill: React.FC<{ className: string; title?: string; children: React.ReactNode }> = ({ className, title, children }) => (
  <span title={title} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}>
    {children}
  </span>
);

const goTo = (tab: string) => { window.location.hash = tab; };

const ImpactPill: React.FC<{ o: Opportunity }> = ({ o }) => {
  const v = o.impact.monthlyCOP;
  if (v === null || v <= 0) {
    return <Pill className="bg-muted/40 text-muted-foreground border-border">{o.kind === "medicion" ? "Medición" : "No monetizado"}</Pill>;
  }
  return (
    <Pill className="bg-success/15 text-success border-success/40 font-mono" title={o.impact.countedInTotal ? "Incluido en el total" : "Se solapa con otra oportunidad: no se suma al total"}>
      ≈ {formatCOP(v)}/mes{o.impact.countedInTotal ? "" : " *"}
    </Pill>
  );
};

const OpportunityCard: React.FC<{ o: Opportunity; t: (s: string) => string }> = ({ o, t }) => {
  const [open, setOpen] = useState(false);
  const safety = o.priority === "seguridad-critica" || o.priority === "seguridad-alta";
  const detailsId = `copilot-calc-${o.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <li className={`glass-card p-4 space-y-3 ${safety ? "border-destructive/40" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono border ${safety ? "bg-destructive/15 text-destructive border-destructive/40" : "bg-primary/10 text-primary border-primary/30"}`}>
          {o.rank}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill className={PRIORITY_STYLE[o.priority]}>
              {safety && <ShieldAlert className="w-3 h-3" aria-hidden="true" />}
              {PRIORITY_LABEL[o.priority]}
            </Pill>
            <Pill className="bg-secondary/40 text-foreground/80 border-border">{AREA_LABEL[o.area]}</Pill>
          </div>
          <h3 className="font-display font-bold text-sm text-foreground leading-snug break-words">{t(o.title)}</h3>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed break-words">{t(o.diagnosis)}</p>
      <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
        <p className="text-[11px] uppercase tracking-wider text-primary font-semibold mb-0.5">Siguiente paso</p>
        <p className="text-xs text-foreground leading-relaxed break-words">{t(o.action)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ImpactPill o={o} />
        <Pill className={CONFIDENCE_STYLE[o.confidence]} title={t(o.confidenceReason)}>Confianza {o.confidence}</Pill>
        <Pill className="bg-secondary/40 text-foreground/80 border-border" title={EFFORT_LABEL[o.effort]}>Esfuerzo {o.effort}</Pill>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary-glass !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          ¿Cómo se calculó?
        </button>
        {o.evidence.map((e) => (
          <button key={e.tab} type="button" className="btn-secondary-glass !px-2.5 !py-1.5 text-xs inline-flex items-center gap-1" onClick={() => goTo(e.tab)}>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Ver evidencia: {e.label}
          </button>
        ))}
      </div>

      {open && (
        <div id={detailsId} className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-2 text-xs">
          <p><span className="text-muted-foreground">Fórmula: </span><span className="text-foreground">{t(o.impact.formula)}</span></p>
          {o.impact.inputs.length > 0 && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {o.impact.inputs.map((i, k) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border/30 py-0.5 min-w-0">
                  <dt className="text-muted-foreground break-words">{t(i.label)}</dt>
                  <dd className="font-mono text-foreground text-right break-words">{t(i.value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {o.impact.monthlyCOP !== null && o.impact.monthlyCOP > 0 && (
            <p><span className="text-muted-foreground">Resultado: </span><span className="font-mono font-semibold text-success">{formatCOP(o.impact.monthlyCOP)} al mes (estimado)</span></p>
          )}
          {o.impact.assumptions.length > 0 && (
            <div>
              <p className="text-muted-foreground">Supuestos:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-foreground/90">
                {o.impact.assumptions.map((a, k) => <li key={k}>{t(a)}</li>)}
              </ul>
            </div>
          )}
          {o.impact.note && <p className="text-warning">{t(o.impact.note)}</p>}
          <p className="text-muted-foreground">Confianza {o.confidence}: {t(o.confidenceReason)}</p>
        </div>
      )}
    </li>
  );
};

type AiState = { status: "idle" | "loading" | "done" | "error"; text: string; error: string };

/** Copiloto de planta: plan de mejora priorizado y valorado en pesos a partir de todos los módulos. */
const PlantCopilot: React.FC = () => {
  const study = useTimeStudy();
  const { readings } = useSST();
  const sgsst = useSGSST();
  const [demandRaw, setDemandRaw] = useState<string | null>(readDemandRaw);
  const [area, setArea] = useState<CopilotArea | "todas">("todas");
  const [ai, setAi] = useState<AiState>({ status: "idle", text: "", error: "" });
  const abortRef = useRef<AbortController | null>(null);

  // La demanda vive en localStorage (Balanceo de línea): se relee al volver a esta pestaña.
  useEffect(() => {
    const refresh = () => setDemandRaw(readDemandRaw());
    window.addEventListener("hashchange", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("storage", refresh);
      abortRef.current?.abort();
    };
  }, []);

  const snapshot: CopilotSnapshot = useMemo(() => {
    const parsed = parseDemandConfig(demandRaw, study.costConfig.monthlyProductionTarget);
    return {
      steps: study.steps,
      operators: study.operators,
      cycles: study.cycles,
      defects: study.defects,
      qualityChecks: study.qualityChecks,
      costConfig: study.costConfig,
      demand: parsed.configured ? parsed.demand : null,
      evaluations: sgsst.evaluations,
      matrixOverrides: sgsst.matrixOverrides,
      plan: sgsst.plan,
      readings,
    };
  }, [study.steps, study.operators, study.cycles, study.defects, study.qualityChecks, study.costConfig, demandRaw, sgsst, readings]);

  const report = useMemo(() => analyzePlant(snapshot), [snapshot]);

  const nameOf = useCallback(
    (id: number) => study.operators.find((o) => o.id === id)?.name ?? `Operario ${id}`,
    [study.operators],
  );
  const t = useCallback((s: string) => resolveOperatorNames(s, nameOf), [nameOf]);

  const visible = area === "todas" ? report.opportunities : report.opportunities.filter((o) => o.area === area);
  const counts = useMemo(() => {
    const c = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<CopilotArea, number>;
    report.opportunities.forEach((o) => { c[o.area]++; });
    return c;
  }, [report.opportunities]);
  const safetyFirst = report.opportunities.filter((o) => o.priority === "seguridad-critica");

  const explain = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAi({ status: "loading", text: "", error: "" });
    try {
      await streamCopilotNarration(
        buildCopilotAiPayload(report, snapshot),
        (tok) => setAi((s) => ({ ...s, text: s.text + tok })),
        ctrl.signal,
      );
      setAi((s) => ({ ...s, status: "done" }));
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setAi({ status: "error", text: "", error: e instanceof Error ? e.message : "No pude conectarme con la IA." });
    }
  };

  // Sin datos: decir exactamente qué medir primero.
  if (!report.hasData) {
    const firstSteps = report.opportunities.filter((o) => o.kind === "medicion");
    return (
      <div className="glass-card p-6 sm:p-8 space-y-4 max-w-2xl mx-auto animate-fade-in">
        <div className="text-center space-y-2">
          <Compass className="w-9 h-9 text-primary mx-auto" aria-hidden="true" />
          <h2 className="font-display font-bold text-lg text-foreground">Copiloto de planta</h2>
          <p className="text-sm text-muted-foreground">
            Aún no hay datos para recomendar mejoras. El copiloto no supone cifras: primero hay que medir. En este orden:
          </p>
        </div>
        <ol className="space-y-2">
          {firstSteps.map((o, i) => (
            <li key={o.id} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
              <span className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary border border-primary/30 text-xs font-bold font-mono flex items-center justify-center">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t(o.title)}</p>
                <p className="text-xs text-muted-foreground">{t(o.action)}</p>
              </div>
              {o.evidence[0] && (
                <button type="button" className="btn-secondary-glass !px-2.5 !py-1.5 text-xs shrink-0" onClick={() => goTo(o.evidence[0].tab)}>
                  Ir
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl mx-auto">
      {/* Encabezado */}
      <section className="glass-card p-5 sm:p-6 space-y-4" aria-labelledby="copilot-title">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0">
              <Compass className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 id="copilot-title" className="font-display font-bold text-lg text-foreground">Copiloto de planta</h2>
              <p className="text-xs text-muted-foreground">¿Qué hago el lunes? Mejoras priorizadas con los datos de todos los módulos.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-accent-glass inline-flex items-center justify-center gap-2 self-start"
            onClick={explain}
            disabled={ai.status === "loading" || report.opportunities.length === 0}
          >
            {ai.status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            Explicar con IA
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="stat-label flex items-center gap-1"><Coins className="w-3.5 h-3.5" aria-hidden="true" /> Oportunidad mensual (estimado)</p>
            <p className="stat-value text-success text-2xl sm:text-3xl">{formatCOP(report.totalMonthlyCOP)}</p>
            <p className="text-[11px] text-muted-foreground">
              Suma de {report.monetizedCount} oportunidad(es) monetizada(s) sin contar dos veces el mismo ahorro. COP/mes.
            </p>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="stat-label flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" /> Seguridad</p>
            <p className="stat-value text-destructive text-2xl sm:text-3xl">{report.safetyCount}</p>
            <p className="text-[11px] text-muted-foreground">Riesgos que van primero, sin importar el dinero.</p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="stat-label flex items-center gap-1"><Ruler className="w-3.5 h-3.5" aria-hidden="true" /> Por medir</p>
            <p className="stat-value text-primary text-2xl sm:text-3xl">{report.measurementCount}</p>
            <p className="text-[11px] text-muted-foreground">Datos que faltan para decidir con confianza.</p>
          </div>
        </div>

        {safetyFirst.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {safetyFirst.length} riesgo(s) crítico(s) de seguridad: se atienden antes que cualquier ahorro.
            </span>
          </div>
        )}

        {(ai.status !== "idle") && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-1" aria-live="polite">
            <p className="text-[11px] uppercase tracking-wider text-accent font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Explicación de la IA
            </p>
            {ai.status === "error"
              ? <p className="text-xs text-destructive">{ai.error}</p>
              : <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ai.text || "Pensando…"}</p>}
            <p className="text-[10px] text-muted-foreground">
              Solo se envían las oportunidades calculadas, sin nombres (Operario A, B…). Las cifras válidas son las de las tarjetas.
            </p>
          </div>
        )}
      </section>

      {/* Plan de la semana */}
      {report.weekPlan.length > 0 && (
        <section className="glass-card p-5 space-y-3" aria-labelledby="copilot-week">
          <h3 id="copilot-week" className="font-display font-bold text-foreground flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary" aria-hidden="true" /> Plan de la semana
          </h3>
          <ol className="space-y-2">
            {report.weekPlan.map((o, i) => (
              <li key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border/50 p-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="shrink-0 w-6 h-6 rounded-md bg-primary/10 text-primary border border-primary/30 text-xs font-bold font-mono flex items-center justify-center">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground break-words">{t(o.title)}</p>
                    <p className="text-xs text-muted-foreground break-words">{t(o.action)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end pl-9 sm:pl-0">
                  <Pill className={PRIORITY_STYLE[o.priority]}>{PRIORITY_LABEL[o.priority]}</Pill>
                  <ImpactPill o={o} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Filtro por área */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por área">
        {(["todas", ...AREAS] as const).map((a) => {
          const active = area === a;
          const n = a === "todas" ? report.opportunities.length : counts[a];
          return (
            <button
              key={a}
              type="button"
              aria-pressed={active}
              onClick={() => setArea(a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${active ? "bg-primary/15 text-primary border-primary/40" : "bg-secondary/30 text-muted-foreground border-border hover:text-foreground"}`}
            >
              {a === "todas" ? "Todas" : AREA_LABEL[a]} ({n})
            </button>
          );
        })}
      </div>

      {/* Tarjetas ordenadas */}
      {visible.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-muted-foreground">
          No hay oportunidades en esta área con los datos actuales.
        </div>
      ) : (
        <ol className="space-y-3">
          {visible.map((o) => <OpportunityCard key={o.id} o={o} t={t} />)}
        </ol>
      )}

      <div className="glass-card p-4 text-[11px] text-muted-foreground space-y-1">
        <p className="flex items-center gap-1 font-semibold text-foreground/80"><Info className="w-3.5 h-3.5" aria-hidden="true" /> Cómo se ordena</p>
        <p>
          1) Seguridad primero: riesgos GTC 45 de nivel I sin acción, dosis de ruido sobre 100 % y posturas críticas; luego nivel II sin acción.
          2) Ahorros, por impacto mensual ÷ esfuerzo (S = {EFFORT_WEIGHT.S}, M = {EFFORT_WEIGHT.M}, L = {EFFORT_WEIGHT.L}).
          3) Lo no monetizado por severidad. 4) Mediciones pendientes. Los valores son estimados con los datos registrados;
          el asterisco (*) marca ahorros que se solapan con otro y no se suman al total. La ergonomía y la SST no se monetizan.
        </p>
      </div>
    </div>
  );
};

export default PlantCopilot;
