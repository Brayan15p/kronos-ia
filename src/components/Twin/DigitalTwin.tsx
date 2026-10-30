/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { FlaskConical, Minus, Plus, RotateCcw, TrendingUp, TrendingDown, Info, Sparkles } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { loadDemandConfig, taskTimes } from "@/lib/lineBalance";
import { baseScenario, presetScenarios, simulateScenario, type Scenario, type TwinBase, type TwinResult } from "@/lib/twin";

const tooltipStyle = {
  contentStyle: {
    background: "hsla(230,22%,9%,0.95)",
    border: "1px solid hsla(230,16%,28%,0.3)",
    borderRadius: "8px",
    color: "hsl(210,20%,92%)",
    fontSize: "11px",
  },
};

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const secs = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : "—");
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const pp = (x: number) => `${(x * 100).toFixed(0)} pp`;
const signed = (x: number, f: (v: number) => string) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${f(Math.abs(x))}`;

interface Row {
  label: string;
  hint: string;
  get: (r: TwinResult) => number;
  format: (v: number) => string;
  /** Formato del cambio cuando difiere del valor (p. ej. puntos porcentuales). */
  formatDelta?: (v: number) => string;
  /** true: subir es bueno; false: bajar es bueno; null: neutro. */
  higherIsBetter: boolean | null;
}

const ROWS: Row[] = [
  { label: "Producción / mes", hint: "Lo que se vende: la demanda o la capacidad, lo que sea menor", get: (r) => r.unitsPerMonth, format: (v) => num.format(v), higherIsBetter: true },
  { label: "Capacidad / mes", hint: "Tiempo disponible / tiempo de ciclo de la línea", get: (r) => r.capacityPerMonth, format: (v) => num.format(v), higherIsBetter: true },
  { label: "Tiempo de ciclo", hint: "Media de la estación más lenta", get: (r) => r.cycleTime, format: secs, higherIsBetter: false },
  { label: "Riesgo de superar el takt", hint: "Ciclos simulados de la línea que superan el takt", get: (r) => r.pLate, format: pct, formatDelta: pp, higherIsBetter: false },
  { label: "Operarios en línea", hint: "Una persona por estación", get: (r) => r.stations, format: (v) => String(v), higherIsBetter: null },
  { label: "Mano de obra / unidad", hint: "Nómina de la línea / unidades producidas", get: (r) => r.labourCostPerUnit, format: (v) => cop.format(v), higherIsBetter: false },
  { label: "Margen / mes", hint: "Ingresos − mano de obra (antes de materiales y gastos generales)", get: (r) => r.marginPerMonth, format: (v) => cop.format(v), higherIsBetter: true },
  { label: "Eficiencia de la línea", hint: "Trabajo total / (estaciones × ciclo)", get: (r) => r.efficiency, format: pct, formatDelta: pp, higherIsBetter: true },
];

const Lever: React.FC<{
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
}> = ({ label, value, min, max, step, display, onChange }) => (
  <label className="block">
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{display}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
      className="w-full accent-primary mt-1" onChange={(e) => onChange(Number(e.target.value))} />
  </label>
);

/** Gemelo digital del proceso: prueba cambios en la línea con los tiempos medidos antes de tocar la planta. */
const DigitalTwin: React.FC = () => {
  const { steps, cycles, operators, costConfig } = useTimeStudy();
  const base: TwinBase = useMemo(() => {
    const hourlyCost = operators.length > 0 ? operators.reduce((s, o) => s + o.hourlyCost, 0) / operators.length : 15000;
    return {
      tasks: taskTimes(steps, cycles),
      demand: loadDemandConfig(costConfig.monthlyProductionTarget),
      hourlyCost,
      unitPrice: costConfig.productValue,
    };
  }, [steps, cycles, operators, costConfig.monthlyProductionTarget, costConfig.productValue]);

  const [scenario, setScenario] = useState<Scenario>(() => baseScenario(base));
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const presets = useMemo(() => presetScenarios(base), [base]);
  const current = useMemo(() => simulateScenario(base, baseScenario(base)), [base]);
  const result = useMemo(() => simulateScenario(base, scenario), [base, scenario]);

  const update = (patch: Partial<Scenario>) => {
    setActivePreset(null);
    setScenario((s) => ({ ...s, ...patch }));
  };
  const reset = () => {
    setActivePreset(null);
    setScenario(baseScenario(base));
  };

  if (base.tasks.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-2 max-w-lg mx-auto">
        <FlaskConical className="w-8 h-8 text-primary mx-auto" />
        <p className="font-display font-bold text-foreground">El gemelo digital necesita tiempos medidos</p>
        <p className="text-sm text-muted-foreground">
          Registra ciclos con el cronómetro por pasos (o con Vision AI). Con esos tiempos Kronos arma una copia
          virtual de la línea para probar mejoras antes de gastar un peso.
        </p>
      </div>
    );
  }

  const stationsShown = scenario.stations ?? result.stations;
  const maxStations = Math.max(1, base.tasks.length);
  const marginDelta = result.marginPerMonth - current.marginPerMonth;
  const unitsDelta = result.unitsPerMonth - current.unitsPerMonth;
  const changed = JSON.stringify(scenario) !== JSON.stringify(baseScenario(base));

  const chartData = Array.from({ length: Math.max(current.stations, result.stations) }, (_, i) => ({
    name: `E${i + 1}`,
    actual: current.stationTimes[i] !== undefined ? Number(current.stationTimes[i].toFixed(2)) : null,
    escenario: result.stationTimes[i] !== undefined ? Number(result.stationTimes[i].toFixed(2)) : null,
  }));

  const verdict = (() => {
    if (!changed) return "Mueve una palanca o elige un escenario: Kronos recalcula la línea completa con 4.000 ciclos simulados.";
    const parts: string[] = [];
    if (Math.abs(marginDelta) >= 1) parts.push(`${marginDelta > 0 ? "sube" : "baja"} el margen mensual ${cop.format(Math.abs(marginDelta))}`);
    if (Math.abs(unitsDelta) >= 1) {
      parts.push(unitsDelta > 0
        ? `produce ${num.format(unitsDelta)} unidades más al mes`
        : `pierde ${num.format(-unitsDelta)} unidades al mes`);
    } else if (result.capacityPerMonth - current.capacityPerMonth >= 1) {
      parts.push(`libera capacidad para ${num.format(result.capacityPerMonth - current.capacityPerMonth)} unidades más al mes`);
    }
    const stationsDelta = result.stations - current.stations;
    if (stationsDelta !== 0) {
      const n = Math.abs(stationsDelta);
      parts.push(`${stationsDelta > 0 ? "necesita" : "ahorra"} ${n} ${n === 1 ? "operario" : "operarios"}${stationsDelta > 0 ? " más" : ""} en línea`);
    }
    if (Math.abs(result.pLate - current.pLate) >= 0.01) parts.push(`${result.pLate < current.pLate ? "baja" : "sube"} el riesgo de no cumplir el takt de ${pct(current.pLate)} a ${pct(result.pLate)}`);
    const head = parts.length ? `Este escenario ${parts.join(", ")}.` : "Este escenario no cambia los resultados de forma apreciable.";
    const tail = result.meetsDemand ? "" : ` Ojo: la línea no alcanza la demanda (${num.format(result.capacityPerMonth)} de ${num.format(result.demand)} unidades).`;
    return head + tail;
  })();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-5 flex flex-wrap items-start gap-3">
        <FlaskConical className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-display font-bold text-foreground">Gemelo digital · ¿y si…?</h3>
          <p className="text-xs text-muted-foreground">
            Una copia virtual de tu línea hecha con los tiempos medidos. Prueba mejoras y mira su efecto en producción,
            costo y riesgo antes de tocar la planta.
          </p>
        </div>
        <button className="btn-secondary-glass text-xs flex items-center gap-1.5" onClick={reset} disabled={!changed}>
          <RotateCcw className="w-3.5 h-3.5" /> Volver a la línea actual
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {presets.map((p) => (
          <button key={p.id} aria-pressed={activePreset === p.id}
            className={`glass-card p-4 text-left transition-colors hover:border-primary/50 ${activePreset === p.id ? "border-primary/70 bg-primary/5" : ""}`}
            onClick={() => { setScenario(p.scenario); setActivePreset(p.id); }}>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" /> {p.label}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{p.description}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 space-y-4">
          <h4 className="text-sm font-display font-bold text-foreground">Palancas</h4>

          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Tiempo de cada paso</p>
            {base.tasks.map((t) => {
              const v = scenario.stepChangePct[t.number] ?? 0;
              return (
                <Lever key={t.number} label={`${t.number}. ${t.name}`} value={v} min={-50} max={50} step={5}
                  display={`${signed(v, (x) => `${x} %`)} · ${secs(t.mean * Math.max(0.05, 1 + v / 100))}`}
                  onChange={(nv) => update({ stepChangePct: { ...scenario.stepChangePct, [t.number]: nv } })} />
              );
            })}
          </div>

          <div className="space-y-3 border-t border-border/30 pt-3">
            <Lever label="Estandarizar y entrenar (menos variabilidad)" value={scenario.variabilityReductionPct} min={0} max={90} step={5}
              display={scenario.variabilityReductionPct ? `−${scenario.variabilityReductionPct} %` : "0 %"} onChange={(v) => update({ variabilityReductionPct: v })} />
            <Lever label="Demanda" value={scenario.demandChangePct} min={-50} max={100} step={5}
              display={`${signed(scenario.demandChangePct, (x) => `${x} %`)} · ${num.format(result.demand)} u/mes`}
              onChange={(v) => update({ demandChangePct: v })} />
            <Lever label="Turnos por día" value={scenario.shiftsPerDay} min={1} max={3} step={1}
              display={String(scenario.shiftsPerDay)} onChange={(v) => update({ shiftsPerDay: v })} />
            <Lever label="Horas por turno" value={scenario.hoursPerShift} min={4} max={12} step={0.5}
              display={`${scenario.hoursPerShift} h`} onChange={(v) => update({ hoursPerShift: v })} />
          </div>

          <div className="border-t border-border/30 pt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Estaciones</span>
            <button aria-label="Quitar una estación" className="btn-secondary-glass p-1.5" disabled={stationsShown <= 1}
              onClick={() => update({ stations: stationsShown - 1 })}><Minus className="w-3.5 h-3.5" /></button>
            <span className="font-mono text-foreground w-6 text-center" aria-live="polite">{stationsShown}</span>
            <button aria-label="Agregar una estación" className="btn-secondary-glass p-1.5" disabled={stationsShown >= maxStations}
              onClick={() => update({ stations: stationsShown + 1 })}><Plus className="w-3.5 h-3.5" /></button>
            {scenario.stations === null
              ? <span className="text-[11px] text-muted-foreground">automático: las necesarias para el takt</span>
              : <button className="text-xs text-primary hover:underline" onClick={() => update({ stations: null })}>automático</button>}
          </div>

          <div className="border-t border-border/30 pt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Costo hora (COP)</span>
              <input type="number" min={0} step={500} value={Math.round(scenario.hourlyCost)} className="input-glass mt-1"
                onChange={(e) => update({ hourlyCost: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor por unidad</span>
              <input type="number" min={0} step={100} value={scenario.unitPrice} className="input-glass mt-1"
                onChange={(e) => update({ unitPrice: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className={`glass-card p-4 flex items-start gap-3 ${!changed ? "" : marginDelta >= 0 && result.meetsDemand ? "border-emerald-500/30" : "border-amber-500/40"}`}>
            {marginDelta >= 0
              ? <TrendingUp className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              : <TrendingDown className="w-5 h-5 text-amber-400 flex-shrink-0" />}
            <p className="text-sm text-foreground" aria-live="polite">{verdict}</p>
          </div>

          <div className="glass-card p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-medium pb-2">Indicador</th>
                  <th className="text-right font-medium pb-2">Línea actual</th>
                  <th className="text-right font-medium pb-2">Escenario</th>
                  <th className="text-right font-medium pb-2">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const a = row.get(current);
                  const b = row.get(result);
                  const d = b - a;
                  const tiny = Math.abs(d) < 1e-6 * Math.max(1, Math.abs(a));
                  const good = row.higherIsBetter === null || tiny ? null : (d > 0) === row.higherIsBetter;
                  return (
                    <tr key={row.label} className="border-t border-border/20" title={row.hint}>
                      <td className="py-2 text-foreground">{row.label}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground">{row.format(a)}</td>
                      <td className="py-2 text-right font-mono text-foreground">{row.format(b)}</td>
                      <td className={`py-2 text-right font-mono ${good === null ? "text-muted-foreground" : good ? "text-emerald-400" : "text-amber-400"}`}>
                        {tiny ? "—" : signed(d, row.formatDelta ?? row.format)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="glass-card p-5 space-y-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-sm font-display font-bold text-foreground">Carga por estación</h4>
              <span className="text-xs text-muted-foreground">tiempo medio; la línea punteada es el takt del escenario</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsla(230,16%,28%,0.2)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215,15%,60%)" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(215,15%,60%)" }} unit=" s" />
                <Tooltip {...tooltipStyle} formatter={(v: number, key: string) => [`${v} s`, key === "actual" ? "Línea actual" : "Escenario"]} />
                <Legend formatter={(key: string) => (key === "actual" ? "Línea actual" : "Escenario")} wrapperStyle={{ fontSize: 11 }} />
                {Number.isFinite(result.takt) && (
                  <ReferenceLine y={result.takt} ifOverflow="extendDomain" stroke="hsl(0,80%,58%)" strokeDasharray="6 4"
                    label={{ value: `Takt ${result.takt.toFixed(1)} s`, fill: "hsl(0,80%,68%)", fontSize: 11, position: "insideTopRight" }} />
                )}
                <Bar dataKey="actual" fill="hsl(215,15%,45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="escenario" fill="hsl(185,100%,50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-muted-foreground flex gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              El reparto de pasos es el óptimo respetando su orden. El riesgo sale de 4.000 ciclos simulados con los tiempos
              medidos (semilla fija: el mismo escenario siempre da los mismos números). El margen no incluye materiales ni
              gastos generales; la demanda y los turnos base vienen de Balanceo de línea.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwin;
