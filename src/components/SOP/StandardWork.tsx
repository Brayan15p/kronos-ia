/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck, FileDown, Loader2, BadgeCheck, ShieldAlert, GraduationCap, Lightbulb, Info, AlertTriangle,
  CheckCircle2, Pencil, ChevronDown, ChevronUp, Timer, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useTimeStudy, type StepConfig } from "@/context/TimeStudyContext";
import { useSST } from "@/context/SSTContext";
import { useSGSST } from "@/lib/sgsstStore";
import { buildMatrix, todayLocal } from "@/lib/sgsst";
import {
  RATING_MAX, RATING_MIN, SEVERITY_LABEL, SOP_METHOD_SOURCE, SOP_SCOPE_NOTE, VARIABLE_ALLOWANCES,
  buildStandardWork, loadSOP, saveSOP, upsertStepEdit,
  type AllowanceConfig, type KeyPoint, type SOPDocument, type SOPHeader, type SOPStepEdit, type SOPStepRow,
} from "@/lib/sop";

const label = "text-[10px] text-muted-foreground uppercase tracking-wider";
const n1 = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedPct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`;

const KP_STYLE: Record<KeyPoint["kind"], { icon: React.ElementType; cls: string; name: string }> = {
  calidad: { icon: BadgeCheck, cls: "text-primary", name: "Calidad" },
  seguridad: { icon: ShieldAlert, cls: "text-destructive", name: "Seguridad" },
  saber: { icon: GraduationCap, cls: "text-success", name: "Quién enseña" },
};

const LEVEL_BOX: Record<KeyPoint["level"], string> = {
  alta: "border-destructive/40 bg-destructive/10",
  media: "border-warning/40 bg-warning/10",
  info: "border-border/30 bg-muted/10",
};

const EmptyState: React.FC<{ icon: React.ElementType; title: string; children: React.ReactNode }> = ({ icon: Icon, title, children }) => (
  <div className="glass-card p-8 text-center space-y-2 max-w-lg mx-auto">
    <Icon className="w-8 h-8 text-primary mx-auto" />
    <p className="font-display font-bold text-foreground">{title}</p>
    <div className="text-sm text-muted-foreground">{children}</div>
  </div>
);

/** Valoración del ritmo: se edita como texto y se confirma al salir (así se puede escribir «95» sin saltos). */
const RatingInput: React.FC<{ value: number; stepName: string; onCommit: (v: number) => void }> = ({ value, stepName, onCommit }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft.replace(",", "."));
    if (Number.isFinite(v) && v >= RATING_MIN && v <= RATING_MAX) onCommit(Math.round(v));
    else setDraft(String(value));
  };
  return (
    <input
      type="number" min={RATING_MIN} max={RATING_MAX} step={5} value={draft}
      aria-label={`Valoración del ritmo de ${stepName} (%)`}
      className="input-glass w-16 px-2 py-1 text-xs font-mono text-right"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
};

const PctField: React.FC<{ title: string; value: number; onChange: (v: number) => void; hint?: string }> = ({ title, value, onChange, hint }) => (
  <label className="block">
    <span className={label}>{title}</span>
    <input type="number" min={0} max={100} step={0.5} value={value} className="input-glass mt-1 text-sm"
      onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
    {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
  </label>
);

// ── Suplementos ──────────────────────────────────────────────────────────────

const AllowancesCard: React.FC<{ cfg: AllowanceConfig; total: number; onChange: (c: AllowanceConfig) => void }> = ({ cfg, total, onChange }) => {
  const set = (patch: Partial<AllowanceConfig>) => onChange({ ...cfg, ...patch });
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-display font-bold text-foreground">Suplementos (tabla de la OIT)</h4>
        <span className="ml-auto text-sm font-mono font-bold text-foreground">Total {n1(total)} %</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Los suplementos cubren las necesidades personales, la fatiga y las condiciones del puesto. Se suman y se aplican
        sobre el tiempo normal: <span className="font-mono">estándar = normal × (1 + suplementos)</span>. Los constantes
        (5 % necesidades personales y 4 % fatiga básica) aplican siempre; los variables, solo si la condición existe en el
        puesto. Valores de la columna «hombres» de la tabla publicada por la OIT; esa tabla trae valores mayores para
        mujeres en algunos factores (p. ej. necesidades personales 7 %): ajuste el porcentaje si corresponde.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <PctField title="Necesidades personales %" value={cfg.personal} onChange={(v) => set({ personal: v })} />
        <PctField title="Fatiga básica %" value={cfg.fatigue} onChange={(v) => set({ fatigue: v })} />
        <PctField title="Otro suplemento %" value={cfg.extra} onChange={(v) => set({ extra: v })} hint="Ej.: calor y humedad, contingencias" />
        {cfg.extra > 0 && (
          <label className="block col-span-2 md:col-span-3">
            <span className={label}>Motivo del otro suplemento</span>
            <input value={cfg.extraLabel} onChange={(e) => set({ extraLabel: e.target.value })} className="input-glass mt-1 text-sm" placeholder="Ej.: condiciones atmosféricas" />
          </label>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {VARIABLE_ALLOWANCES.map((f) => (
          <label key={f.key} className="block" title={f.help}>
            <span className={label}>{f.label}</span>
            <select
              value={cfg.variable[f.key] ?? ""}
              className="input-glass mt-1 text-xs"
              onChange={(e) => {
                const variable = { ...cfg.variable };
                if (e.target.value) variable[f.key] = e.target.value;
                else delete variable[f.key];
                set({ variable });
              }}
            >
              <option value="">No aplica</option>
              {f.options.map((o) => <option key={o.id} value={o.id}>{o.label} · {o.value} %</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
};

// ── Seguridad del puesto ─────────────────────────────────────────────────────

const SafetyCard: React.FC<{ puesto: string; sheet: ReturnType<typeof buildStandardWork> }> = ({ puesto, sheet }) => {
  const s = sheet.safety;
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-destructive" />
        <h4 className="text-sm font-display font-bold text-foreground">Seguridad y ergonomía del puesto</h4>
      </div>
      {!puesto.trim() ? (
        <p className="text-xs text-muted-foreground">
          Escriba el puesto tal como se llama en el Paquete SG-SST para traer su última evaluación RULA/REBA y la matriz GTC 45.
        </p>
      ) : !s.evaluation && s.warnings.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No hay evaluación ergonómica para «{puesto}». Regístrela en Vision AI o en el Paquete SG-SST para incluir sus advertencias.
        </p>
      ) : (
        <>
          {s.evaluation && (
            <p className="text-xs text-muted-foreground">
              Última evaluación ({s.evaluation.fecha}): RULA {n1(s.rula)} · REBA {n1(s.reba)} ·{" "}
              {s.byExpert ? "valores del experto" : s.evaluation.origen === "vision-ai" ? "tamizaje con cámara (sin revisión de experto)" : "evaluación manual"}.
            </p>
          )}
          {s.warnings.length === 0 ? (
            <p className="text-xs text-success flex gap-1.5"><CheckCircle2 className="w-4 h-4 flex-shrink-0" />Sin advertencias de riesgo alto para este puesto.</p>
          ) : (
            <ul className="space-y-2">
              {s.warnings.map((w) => (
                <li key={w.text} className={`rounded-lg border p-2.5 text-xs text-foreground flex gap-2 ${LEVEL_BOX[w.level]}`}>
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 text-destructive" />
                  <span>{w.text}</span>
                </li>
              ))}
            </ul>
          )}
          {s.warnings.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Estas advertencias aplican a todos los pasos del puesto y van en la hoja impresa.</p>
          )}
        </>
      )}
    </div>
  );
};

// ── Fila de paso ─────────────────────────────────────────────────────────────

const KeyPoints: React.FC<{ row: SOPStepRow; hasSafety: boolean }> = ({ row, hasSafety }) => {
  const points = row.keyPoints.filter((k) => k.kind !== "seguridad");
  return (
    <ul className="space-y-1 min-w-[220px]">
      {row.edit.puntoClave.trim() && (
        <li className="flex gap-1.5 text-foreground"><Lightbulb className="w-3.5 h-3.5 flex-shrink-0 text-warning mt-0.5" aria-label="Punto clave" />{row.edit.puntoClave}</li>
      )}
      {points.map((k) => {
        const st = KP_STYLE[k.kind];
        const Icon = st.icon;
        return (
          <li key={k.text} className="flex gap-1.5">
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${st.cls}`} aria-label={st.name} />
            <span className={k.level === "alta" ? "text-destructive" : "text-muted-foreground"}>{k.text}</span>
          </li>
        );
      })}
      {hasSafety && (
        <li className="flex gap-1.5 text-muted-foreground">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-destructive" aria-label="Seguridad" />Ver advertencias del puesto.
        </li>
      )}
      {!row.edit.puntoClave.trim() && points.length === 0 && !hasSafety && <li className="text-muted-foreground/60">—</li>}
    </ul>
  );
};

const StepEditor: React.FC<{ edit: SOPStepEdit; onChange: (patch: Partial<SOPStepEdit>) => void }> = ({ edit, onChange }) => {
  const field = (key: "metodo" | "puntoClave" | "herramientas" | "foto", title: string, placeholder: string) => (
    <label className="block">
      <span className={label}>{title}</span>
      <textarea rows={2} value={edit[key]} placeholder={placeholder} className="input-glass mt-1 text-xs resize-y"
        onChange={(e) => onChange({ [key]: e.target.value })} />
    </label>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
      {field("metodo", "Descripción del método", "Qué hace el operario, en orden y con qué mano")}
      {field("puntoClave", "Punto clave", "Lo que hace el paso bien hecho, seguro o más fácil")}
      {field("herramientas", "Herramientas / EPP", "Ej.: bisturí, regla metálica, guantes anticorte")}
      {field("foto", "Foto o ayuda visual (nota)", "Ej.: foto 3 del tablero, vista superior de la pieza")}
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────────────────────

/** Hoja de trabajo estándar (SOP) del puesto a partir de las mediciones de Kronos. */
const StandardWork: React.FC = () => {
  const { steps, operators, cycles, defects, qualityChecks, costConfig } = useTimeStudy();
  const { readings } = useSST();
  const sg = useSGSST();
  const [doc, setDoc] = useState<SOPDocument>(loadSOP);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => saveSOP(doc), [doc]);

  const matrixRows = useMemo(
    () => buildMatrix({ evaluations: sg.evaluations, readings, overrides: sg.matrixOverrides }),
    [sg.evaluations, sg.matrixOverrides, readings],
  );
  const sheet = useMemo(() => buildStandardWork({
    steps, operators, cycles, defects, qualityChecks, targetCycleTime: costConfig.targetCycleTime,
    evaluations: sg.evaluations, matrixRows, doc,
  }), [steps, operators, cycles, defects, qualityChecks, costConfig.targetCycleTime, sg.evaluations, matrixRows, doc]);
  const puestos = useMemo(
    () => [...new Set(sg.evaluations.map((e) => e.puesto.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [sg.evaluations],
  );

  const setHeader = (patch: Partial<SOPHeader>) => setDoc((d) => ({ ...d, header: { ...d.header, ...patch } }));
  const editStep = (step: StepConfig, patch: Partial<SOPStepEdit>) => setDoc((d) => upsertStepEdit(d, step, patch));
  const hasSafety = sheet.safety.warnings.length > 0;

  const exportPDF = async () => {
    setBusy(true);
    try {
      // jsPDF solo se descarga cuando se exporta.
      const { buildStandardWorkPdf } = await import("@/lib/sopPdf");
      const header = { ...doc.header, fecha: doc.header.fecha || todayLocal() };
      buildStandardWorkPdf({ header, sheet }).save(`kronos_hoja_trabajo_estandar_${todayLocal()}.pdf`);
      toast.success("Hoja de trabajo estándar generada");
    } catch {
      toast.error("No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  };

  const text = (key: keyof SOPHeader, title: string, placeholder = "", type = "text", list?: string) => (
    <label className="block min-w-0">
      <span className={label}>{title}</span>
      <input type={type} value={doc.header[key]} placeholder={placeholder} list={list} className="input-glass mt-1 text-sm"
        onChange={(e) => setHeader({ [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Encabezado del puesto */}
      <div className="glass-card p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20 flex-shrink-0">
              <BookOpenCheck className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-foreground">Trabajo estándar</h3>
              <p className="text-xs text-muted-foreground">
                Hoja de trabajo estándar del puesto: tiempos estándar por paso, puntos clave y quién puede enseñar.
              </p>
            </div>
          </div>
          <button className="btn-primary-glass flex items-center gap-2" onClick={exportPDF} disabled={busy || !sheet.hasData}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Exportar PDF
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {text("proceso", "Proceso", "Ej.: Ensamble de grulla")}
          {text("puesto", "Puesto / estación", "Como en el Paquete SG-SST", "text", "sop-puestos")}
          {text("version", "Versión", "1")}
          {text("fecha", "Fecha", "", "date")}
          {text("elaboro", "Elaboró", "Analista")}
          {text("aprobo", "Aprobó", "Supervisor")}
        </div>
        <datalist id="sop-puestos">{puestos.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className={label}>Tiempos medidos de</span>
            <select value={doc.operatorId ?? ""} className="input-glass mt-1 text-sm"
              onChange={(e) => setDoc((d) => ({ ...d, operatorId: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Todos los operarios</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <p className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">
            La calidad, las competencias y la seguridad usan todo el estudio; este filtro solo cambia los tiempos.
          </p>
        </div>
        <div className="flex gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-200/90" role="note">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-400" />
          <p>{SOP_SCOPE_NOTE}</p>
        </div>
      </div>

      {!sheet.hasData ? (
        <EmptyState icon={Timer} title="Aún no hay tiempos para el trabajo estándar">
          <p>
            Registre ciclos con el Cronómetro por pasos, la Entrada manual o Vision AI. Con los tiempos de cada paso Kronos calcula
            el tiempo observado, normal y estándar, cuántas observaciones faltan y los puntos clave de calidad, seguridad y entrenamiento.
          </p>
          {cycles.length > 0 && doc.operatorId != null && <p className="mt-2">Revise el filtro de operario: no hay ciclos válidos para él.</p>}
        </EmptyState>
      ) : (
        <>
          {sheet.wholeCycle && (
            <div className="glass-card p-4 flex gap-3 border-warning/40">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
              <p className="text-sm text-foreground">
                Los ciclos no traen tiempos por paso (por ejemplo, detectados automáticamente): el ciclo completo se trata como un
                solo elemento. Use el Cronómetro por pasos para obtener la hoja paso a paso.
              </p>
            </div>
          )}

          {/* Indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { k: "Observado (suma)", v: `${n1(sheet.totals.observed)} s`, h: "Suma de las medianas por paso" },
              { k: "Normal (suma)", v: `${n1(sheet.totals.normal)} s`, h: "Observado × valoración del ritmo" },
              { k: "Suplementos", v: `${n1(sheet.allowancePct)} %`, h: "Suma de los suplementos aplicados" },
              { k: "Tiempo estándar", v: `${n1(sheet.totals.standard)} s`, h: "Normal × (1 + suplementos), sumado por paso" },
              { k: "Objetivo", v: sheet.target ? `${n1(sheet.target)} s` : "—", h: "Tiempo de ciclo objetivo del estudio" },
              { k: "Ciclo medio medido", v: sheet.cycleMean ? `${n1(sheet.cycleMean)} s` : "—", h: `${sheet.cycleCount} ciclos, sin suplementos` },
              { k: "Unidades / hora", v: sheet.unitsPerHour ? n1(sheet.unitsPerHour) : "—", h: "Al tiempo estándar" },
            ].map((t) => (
              <div key={t.k} className="glass-card p-3" title={t.h}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.k}</p>
                <p className="text-lg font-mono font-bold text-foreground mt-1">{t.v}</p>
              </div>
            ))}
          </div>

          <div className={`glass-card p-4 flex items-start gap-3 ${sheet.vsTarget && sheet.vsTarget.diff > 0 ? "border-amber-500/40" : "border-emerald-500/30"}`}>
            {sheet.vsTarget && sheet.vsTarget.diff > 0
              ? <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
            <div className="text-sm text-foreground space-y-1">
              {sheet.vsTarget && sheet.target ? (
                <p>
                  El tiempo estándar ({n1(sheet.totals.standard)} s) está {sheet.vsTarget.diff > 0 ? "por encima" : "por debajo"} del
                  objetivo ({n1(sheet.target)} s) en {n1(Math.abs(sheet.vsTarget.diff))} s ({signedPct(sheet.vsTarget.rel)}).
                  {sheet.vsTarget.diff > 0 && " Revise el método de los pasos más largos o el objetivo antes de publicar la hoja."}
                </p>
              ) : <p>Defina el tiempo de ciclo objetivo en el estudio para comparar.</p>}
              {sheet.vsCycleMean && sheet.cycleMean && (
                <p className="text-muted-foreground">
                  Frente al ciclo medio medido ({n1(sheet.cycleMean)} s): {signedPct(sheet.vsCycleMean.rel)}. La diferencia esperada viene
                  de los suplementos y la valoración del ritmo.
                </p>
              )}
              {sheet.totals.stepsMissing > 0 && (
                <p className="text-muted-foreground">{sheet.totals.stepsMissing} paso(s) sin observaciones no suman al total.</p>
              )}
              {sheet.insufficientSteps.length > 0 && (
                <p className="text-warning">
                  Pasos con observaciones insuficientes para ±5 % con 95 % de confianza: {sheet.insufficientSteps.join(", ")}. Tome más lecturas.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2"><AllowancesCard cfg={doc.allowances} total={sheet.allowancePct} onChange={(allowances) => setDoc((d) => ({ ...d, allowances }))} /></div>
            <SafetyCard puesto={doc.header.puesto} sheet={sheet} />
          </div>

          {/* Tabla de pasos */}
          <div className="glass-card p-4 md:p-5 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-display font-bold text-foreground">Pasos del trabajo estándar</h4>
              <span className="text-xs text-muted-foreground">tiempos en segundos · edite el ritmo y, con el lápiz, el método y los puntos clave</span>
            </div>
            <div className="relative overflow-x-auto -mx-4 md:mx-0">
              <table className="w-full min-w-[920px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/30">
                    <th className="py-2 px-2">Paso</th>
                    <th className="py-2 px-2 text-right" title="Observaciones / observaciones necesarias para ±5 % con 95 % de confianza">n / n req.</th>
                    <th className="py-2 px-2 text-right">Observado (mediana)</th>
                    <th className="py-2 px-2 text-right">Ritmo %</th>
                    <th className="py-2 px-2 text-right">Normal</th>
                    <th className="py-2 px-2 text-right">Supl.</th>
                    <th className="py-2 px-2 text-right">Estándar</th>
                    <th className="py-2 px-2">Puntos clave</th>
                    <th className="py-2 px-2"><span className="sr-only">Editar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((r) => {
                    const isOpen = open === r.step.number;
                    const short = r.stats && (r.sufficient === false || r.stats.n < 2);
                    return (
                      <React.Fragment key={r.step.number}>
                        <tr className="border-b border-border/20 align-top">
                          <td className="py-2 px-2 min-w-[160px]">
                            <p className="font-semibold text-foreground">{r.step.number}. {r.step.name}</p>
                            {r.edit.metodo.trim() && <p className="text-muted-foreground mt-0.5 whitespace-pre-line">{r.edit.metodo}</p>}
                            {r.edit.herramientas.trim() && <p className="text-muted-foreground mt-0.5">Herramientas / EPP: {r.edit.herramientas}</p>}
                          </td>
                          <td className={`py-2 px-2 text-right font-mono whitespace-nowrap ${short ? "text-warning" : "text-foreground"}`}>
                            {r.stats ? <>{r.stats.n} / {r.required ?? "—"}{short && <span className="block text-[10px]">faltan obs.</span>}</> : <span className="text-muted-foreground">sin datos</span>}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-foreground">
                            {r.stats ? (
                              <>
                                {n1(r.observed)}
                                <span className="block text-[10px] text-muted-foreground">media {n1(r.stats.mean)} · CV {Number.isFinite(r.stats.cv) ? Math.round(r.stats.cv * 100) : 0} %</span>
                              </>
                            ) : "—"}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <RatingInput value={r.rating} stepName={r.step.name} onCommit={(rating) => editStep(r.step, { rating })} />
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-foreground">{n1(r.normal)}</td>
                          <td className="py-2 px-2 text-right font-mono text-muted-foreground">{n1(r.allowancePct)} %</td>
                          <td className="py-2 px-2 text-right font-mono font-bold text-foreground">{n1(r.standard)}</td>
                          <td className="py-2 px-2"><KeyPoints row={r} hasSafety={hasSafety} /></td>
                          <td className="py-2 px-2">
                            <button type="button" className="btn-secondary-glass p-1.5 flex items-center gap-1" aria-expanded={isOpen}
                              aria-label={`${isOpen ? "Cerrar" : "Editar"} método y puntos clave de ${r.step.name}`}
                              onClick={() => setOpen(isOpen ? null : r.step.number)}>
                              <Pencil className="w-3.5 h-3.5" />{isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-border/20 bg-muted/10">
                            <td colSpan={9}>
                              {/* En móvil el editor queda fijo a la izquierda y del ancho de la pantalla, no del de la tabla. */}
                              <div className="sticky left-0 w-[min(100%,calc(100vw-2rem))]">
                                <StepEditor edit={r.edit} onChange={(patch) => editStep(r.step, patch)} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/40 font-semibold text-foreground">
                    <td className="py-2 px-2">Total ({sheet.totals.stepsWithData} de {sheet.rows.length} pasos con datos)</td>
                    <td />
                    <td className="py-2 px-2 text-right font-mono">{n1(sheet.totals.observed)}</td>
                    <td />
                    <td className="py-2 px-2 text-right font-mono">{n1(sheet.totals.normal)}</td>
                    <td className="py-2 px-2 text-right font-mono text-muted-foreground">{n1(sheet.allowancePct)} %</td>
                    <td className="py-2 px-2 text-right font-mono">{n1(sheet.totals.standard)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-warning" />Punto clave escrito</span>
              {(["calidad", "seguridad", "saber"] as const).map((k) => {
                const Icon = KP_STYLE[k].icon;
                return <span key={k} className="flex items-center gap-1"><Icon className={`w-3.5 h-3.5 ${KP_STYLE[k].cls}`} />{KP_STYLE[k].name}</span>;
              })}
            </div>
          </div>

          {(sheet.unlinkedDefects.length > 0 || sheet.generalCriteria.length > 0) && (
            <div className="glass-card p-5 space-y-2">
              <div className="flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-display font-bold text-foreground">Calidad del producto (no asociada a un paso)</h4>
              </div>
              <ul className="text-xs space-y-1 text-muted-foreground">
                {sheet.unlinkedDefects.map((d) => (
                  <li key={`d-${d.type}`}>Defecto «{d.type}»: {d.count} registro(s), peor severidad {SEVERITY_LABEL[d.worst]}.</li>
                ))}
                {sheet.generalCriteria.map((c) => (
                  <li key={`c-${c.name}`}>Criterio «{c.name}»{c.fails > 0 ? `: no se logró en ${c.fails} de ${c.checks} inspecciones.` : "."}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="glass-card p-5 space-y-2 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5 text-foreground font-semibold"><Info className="w-4 h-4 text-primary" />Cómo se calcula</p>
            <p>
              <span className="font-mono">Observado</span> = mediana de las observaciones del paso (más robusta que la media ante interrupciones;
              la media y el CV se muestran al lado). <span className="font-mono">Normal = observado × ritmo / 100</span> (100 % = ritmo normal de
              un operario calificado). <span className="font-mono">Estándar = normal × (1 + suplementos / 100)</span>.
            </p>
            <p>
              Observaciones necesarias para ±5 % con 95 % de confianza: <span className="font-mono">n′ = (40·√(n·Σx² − (Σx)²) / Σx)²</span>.
            </p>
            <p>
              Puntos clave sugeridos: defectos asociados al paso por su nombre o porque el paso se alargó ≥ 25 % en esos ciclos; criterios de
              inspección que nombran el paso; RULA ≥ 5 o REBA ≥ 8 (se prefiere la revisión del experto) y filas GTC 45 en nivel I o II;
              quién enseña = operarios en nivel O de la matriz ILUO. Son sugerencias, no causas comprobadas.
            </p>
            <p>{SOP_METHOD_SOURCE}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default StandardWork;
