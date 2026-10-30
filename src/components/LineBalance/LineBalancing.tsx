/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Workflow, Minus, Plus, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import {
  balanceLine, LINE_BALANCE_CONFIG_KEY, lineMetrics, loadDemandConfig, minStations, stationRisk, stationsToMeetTakt, taktTime, taskTimes,
  type DemandConfig,
} from "@/lib/lineBalance";

const CHART_COLORS = [
  "hsl(185,100%,50%)", "hsl(265,80%,62%)", "hsl(40,95%,55%)", "hsl(155,70%,45%)", "hsl(0,80%,58%)",
  "hsl(210,90%,60%)", "hsl(320,75%,60%)", "hsl(90,60%,50%)", "hsl(25,90%,55%)", "hsl(200,25%,60%)",
];
const tooltipStyle = {
  contentStyle: {
    background: "hsla(230,22%,9%,0.95)",
    border: "1px solid hsla(230,16%,28%,0.3)",
    borderRadius: "8px",
    color: "hsl(210,20%,92%)",
    fontSize: "11px",
  },
};
const fmt = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : "—");
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;

const Field: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step = 1, onChange }) => (
  <label className="block">
    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    <input type="number" min={0} step={step} value={value} className="input-glass mt-1"
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
  </label>
);

/** Balanceo de línea y yamazumi: cuántas estaciones hacen falta y cómo repartir los pasos. */
const LineBalancing: React.FC = () => {
  const { steps, cycles, costConfig } = useTimeStudy();
  const [config, setConfig] = useState<DemandConfig>(() => loadDemandConfig(costConfig.monthlyProductionTarget));
  const tasks = useMemo(() => taskTimes(steps, cycles), [steps, cycles]);
  const takt = taktTime(config);
  const minK = minStations(tasks, takt);
  // Por defecto, las estaciones que de verdad cumplen el takt (o todas si ningún reparto lo logra).
  const needed = useMemo(() => stationsToMeetTakt(tasks, takt), [tasks, takt]);
  const suggestedK = needed.stations ?? Math.max(1, tasks.length);
  const [stations, setStations] = useState<number | null>(null);
  const k = Math.min(Math.max(1, stations ?? suggestedK), Math.max(1, tasks.length));
  const plural = (n: number) => `${n} ${n === 1 ? "estación" : "estaciones"}`;

  useEffect(() => {
    try {
      localStorage.setItem(LINE_BALANCE_CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [config]);

  const line = useMemo(() => balanceLine(tasks, k), [tasks, k]);
  const metrics = useMemo(() => lineMetrics(line, takt), [line, takt]);
  const risks = useMemo(() => line.map((s) => stationRisk(s, takt)), [line, takt]);

  const chartData = useMemo(() => line.map((s) => ({
    name: `E${s.index}`,
    ...Object.fromEntries(s.tasks.map((t) => [`p${t.number}`, Number(t.mean.toFixed(2))])),
  })), [line]);

  const set = (patch: Partial<DemandConfig>) => setConfig((c) => ({ ...c, ...patch }));

  if (tasks.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-2 max-w-lg mx-auto">
        <Workflow className="w-8 h-8 text-primary mx-auto" />
        <p className="font-display font-bold text-foreground">Aún no hay tiempos para balancear</p>
        <p className="text-sm text-muted-foreground">
          Registra ciclos con el cronómetro por pasos (o con Vision AI) para calcular el takt, las estaciones
          necesarias y el reparto de trabajo.
        </p>
      </div>
    );
  }

  const singleTask = tasks.length === 1;
  const worstRisk = Math.max(...risks.map((r) => r.pOverTakt));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Workflow className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-display font-bold text-foreground">Balanceo de línea</h3>
            <p className="text-xs text-muted-foreground">
              Demanda y turnos definen el takt; los pasos medidos se reparten en estaciones para no superarlo.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Unidades / mes" value={config.unitsPerMonth} onChange={(v) => set({ unitsPerMonth: v })} />
          <Field label="Días / mes" value={config.daysPerMonth} onChange={(v) => set({ daysPerMonth: v })} />
          <Field label="Turnos / día" value={config.shiftsPerDay} onChange={(v) => set({ shiftsPerDay: v })} />
          <Field label="Horas / turno" value={config.hoursPerShift} step={0.5} onChange={(v) => set({ hoursPerShift: v })} />
          <Field label="Pausas (min / turno)" value={config.breakMinutesPerShift} onChange={(v) => set({ breakMinutesPerShift: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Takt", value: fmt(takt), hint: "Ritmo necesario para cumplir la demanda" },
          { label: "Estaciones necesarias", value: needed.stations ? String(needed.stations) : "—",
            hint: `Menor número cuyo reparto real cumple el takt (mínimo teórico ⌈trabajo/takt⌉ = ${minK})` },
          { label: "Tiempo de ciclo", value: fmt(metrics.cycleTime), hint: `Lo marca la estación E${metrics.bottleneck}` },
          { label: "Eficiencia", value: pct(metrics.efficiency), hint: "Trabajo total / (estaciones × ciclo)" },
          { label: "Unidades / hora", value: metrics.unitsPerHour.toFixed(1), hint: "Con la línea balanceada" },
          { label: "Riesgo máx.", value: pct(worstRisk), hint: "Probabilidad de que la estación más expuesta supere el takt" },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-card p-3" title={kpi.hint}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            <p className="text-lg font-mono font-bold text-foreground mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className={`glass-card p-4 flex items-start gap-3 ${metrics.meetsTakt ? "border-emerald-500/30" : "border-amber-500/40"}`}>
        {metrics.meetsTakt ? <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />}
        <p className="text-sm text-foreground">
          {metrics.meetsTakt
            ? `Con ${plural(k)} la línea cumple el takt en promedio. `
            : `Con ${plural(k)} la estación E${metrics.bottleneck} (${fmt(metrics.cycleTime)}) supera el takt (${fmt(takt)}). `}
          {needed.stations && needed.stations > minK && !singleTask &&
            `El mínimo teórico es ${plural(minK)}, pero como los pasos no se pueden partir hacen falta ${plural(needed.stations)}. `}
          {needed.tooLong.length > 0 &&
            `${needed.tooLong.map((t) => `"${t.name}" (${fmt(t.mean)})`).join(", ")} ${needed.tooLong.length === 1 ? "dura" : "duran"} más que el takt por sí solo: hay que dividir el paso, mejorar el método o poner estaciones en paralelo. `}
          {worstRisk > 0.05 && metrics.meetsTakt && `Aun así, por la variabilidad, la estación más expuesta lo supera en el ${pct(worstRisk)} de los ciclos. `}
          {singleTask
            ? "Solo hay tiempos del ciclo completo: registra tiempos por paso para poder repartir el trabajo."
            : metrics.efficiency < 0.85 && "Eficiencia por debajo del 85 %: revisa si algún paso se puede dividir o mover para emparejar las estaciones."}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 xl:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-display font-bold text-foreground">Yamazumi</h4>
            <span className="text-xs text-muted-foreground">tiempo medio por estación, apilado por paso</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Estaciones</span>
              <button aria-label="Quitar una estación" className="btn-secondary-glass p-1.5" disabled={k <= 1}
                onClick={() => setStations(k - 1)}><Minus className="w-3.5 h-3.5" /></button>
              <span className="font-mono text-foreground w-6 text-center" aria-live="polite">{k}</span>
              <button aria-label="Agregar una estación" className="btn-secondary-glass p-1.5" disabled={k >= tasks.length}
                onClick={() => setStations(k + 1)}><Plus className="w-3.5 h-3.5" /></button>
              {stations !== null && stations !== suggestedK && (
                <button className="text-xs text-primary hover:underline" onClick={() => setStations(null)}>usar sugerido</button>
              )}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215,15%,60%)" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(215,15%,60%)" }} unit=" s" />
              <Tooltip {...tooltipStyle} formatter={(v: number, key: string) => [`${v} s`, tasks.find((t) => `p${t.number}` === key)?.name ?? key]} />
              {Number.isFinite(takt) && (
                <ReferenceLine y={takt} stroke="hsl(0,80%,58%)" strokeDasharray="6 4"
                  label={{ value: `Takt ${takt.toFixed(1)} s`, fill: "hsl(0,80%,68%)", fontSize: 11, position: "insideTopRight" }} />
              )}
              {tasks.map((t, i) => (
                <Bar key={t.number} dataKey={`p${t.number}`} stackId="estacion" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5 space-y-3">
          <h4 className="text-sm font-display font-bold text-foreground">Estaciones</h4>
          <ul className="space-y-2">
            {line.map((s, i) => (
              <li key={s.index} className={`rounded-lg p-3 border ${s.index === metrics.bottleneck ? "border-amber-500/40 bg-amber-500/5" : "border-border/30 bg-muted/10"}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">E{s.index}{s.index === metrics.bottleneck && " · cuello de botella"}</span>
                  <span className="font-mono text-foreground">{fmt(s.mean)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{s.tasks.map((t) => `${t.number}. ${t.name}`).join(" · ")}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Ocio {fmt(Math.max(0, metrics.cycleTime - s.mean))} · p95 {fmt(risks[i].p95)} ·
                  supera el takt en {pct(risks[i].pOverTakt)} de los ciclos
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground flex gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Reparto óptimo respetando el orden de los pasos. El riesgo se estima con 5.000 simulaciones
            Monte Carlo sobre los tiempos medidos de cada paso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LineBalancing;
