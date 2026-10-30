/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from "react";
import { AlertTriangle, RotateCcw, EyeOff, Eye } from "lucide-react";
import {
  CONTROL_LABEL, CONTROL_TYPES, GTC45_SOURCE, NC_OPTIONS, ND_OPTIONS, NE_OPTIONS, NP_INTERPRETATION, NR_INTERPRETATION,
  type MatrixRow, type NCValue, type NDValue, type NEValue,
} from "@/lib/sgsst";
import { sgsstActions } from "@/lib/sgsstStore";
import { NR_STYLE } from "./styles";

const label = "text-[10px] text-muted-foreground uppercase tracking-wider";

const RowCard: React.FC<{ row: MatrixRow }> = ({ row: r }) => {
  const set = sgsstActions.setOverride;
  return (
    <div className={`glass-card p-4 space-y-3 ${r.excluded ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.clasificacion} · {r.lugar}</p>
          <h4 className="font-display font-bold text-sm text-foreground">{r.peligro}</h4>
          <p className="text-[11px] text-muted-foreground">{r.fuente}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${NR_STYLE[r.nrLevel]}`}>NR {r.nr} · Nivel {r.nrLevel}</span>
          <span className="text-[11px] text-muted-foreground">{r.aceptabilidad}</span>
        </div>
      </div>

      {r.lowConfidence && (
        <p className="text-[11px] text-red-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Confianza baja o sin dato en la evaluación de origen: verifique la postura con un evaluador.
        </p>
      )}
      {r.suspendAt360 && (
        <p className="text-[11px] text-orange-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> NR mayor o igual a 360: la Tabla 8 de la GTC 45 indica suspender actividades hasta controlar el riesgo.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={label}>Nivel de deficiencia (ND)</label>
          <select value={r.nd} onChange={(e) => set(r.id, { nd: Number(e.target.value) as NDValue })} className="input-glass mt-1 text-xs">
            {ND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}{o.value === r.proposed.nd ? " (propuesto)" : ""}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">{r.ndBasis}</p>
        </div>
        <div>
          <label className={label}>Nivel de exposición (NE)</label>
          <select value={r.ne} onChange={(e) => set(r.id, { ne: Number(e.target.value) as NEValue })} className="input-glass mt-1 text-xs">
            {NE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}{o.value === r.proposed.ne ? " (propuesto)" : ""}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">{r.neBasis}</p>
        </div>
        <div>
          <label className={label}>Nivel de consecuencia (NC)</label>
          <select value={r.nc} onChange={(e) => set(r.id, { nc: Number(e.target.value) as NCValue })} className="input-glass mt-1 text-xs">
            {NC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}{o.value === r.proposed.nc ? " (propuesto)" : ""}</option>)}
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">{NC_OPTIONS.find((o) => o.value === r.nc)?.desc} Efectos: {r.efectos}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>NP = {r.nd} × {r.ne} = <b className="font-mono">{r.np}</b> ({NP_INTERPRETATION[r.npLevel].label})</span>
        <span>NR = {r.np} × {r.nc} = <b className="font-mono">{r.nr}</b> (nivel {r.nrLevel})</span>
        {r.edited && <span className="text-primary">Editado por el usuario</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">{NR_INTERPRETATION[r.nrLevel].desc}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={label}>Controles existentes</label>
          <input value={r.controlesExistentes} onChange={(e) => set(r.id, { controlesExistentes: e.target.value })} className="input-glass mt-1 text-xs" placeholder="Fuente, medio o individuo" />
        </div>
        <div>
          <label className={label}>N.º expuestos</label>
          <input type="number" min={0} value={r.expuestos} onChange={(e) => set(r.id, { expuestos: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="input-glass mt-1 text-xs" />
        </div>
        <div>
          <label className={label}>Requisito legal asociado</label>
          <input value={r.requisitoLegal} onChange={(e) => set(r.id, { requisitoLegal: e.target.value })} className="input-glass mt-1 text-xs" placeholder="Por verificar con el profesional SST" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className={label}>Observaciones</label>
          <input value={r.observaciones} onChange={(e) => set(r.id, { observaciones: e.target.value })} className="input-glass mt-1 text-xs" placeholder="Opcional" />
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-primary">Medidas de intervención sugeridas (jerarquía de controles)</summary>
        <ul className="mt-2 space-y-1">
          {CONTROL_TYPES.map((k) => (
            <li key={k}><span className="text-foreground font-medium">{CONTROL_LABEL[k]}:</span> <span className="text-muted-foreground">{r.controles[k]}</span></li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-2">
        {r.edited && (
          <button onClick={() => sgsstActions.resetRiskOverride(r.id)} className="btn-secondary-glass text-xs flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Volver a la propuesta
          </button>
        )}
        <button onClick={() => set(r.id, { excluded: !r.excluded })} className="btn-secondary-glass text-xs flex items-center gap-1.5">
          {r.excluded ? <><Eye className="w-3.5 h-3.5" /> Incluir en la matriz</> : <><EyeOff className="w-3.5 h-3.5" /> No aplica</>}
        </button>
      </div>
    </div>
  );
};

const HazardMatrixSection: React.FC<{ rows: MatrixRow[] }> = ({ rows }) => {
  const active = rows.filter((r) => !r.excluded);
  return (
    <div className="space-y-4">
      <div className="glass-card p-4 md:p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-foreground">Matriz de peligros — {GTC45_SOURCE}</h3>
        <p className="text-xs text-muted-foreground">
          Postura y movimiento repetitivo por puesto (evaluación más reciente de cada uno); iluminación y ruido por zona.
          ND y NE son propuestas de Kronos a partir de los datos; NC es una propuesta por tipo de peligro. Revise y ajuste cada valor.
        </p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin filas: registre evaluaciones ergonómicas o mediciones en el Radar Ambiental.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/30">
                  {["Puesto / zona", "Peligro", "ND", "NE", "NP", "NC", "NR", "Nivel", "Aceptabilidad"].map((h) => <th key={h} className="py-2 px-1 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id} className="border-b border-border/10">
                    <td className="py-1.5 px-1 text-foreground">{r.lugar}</td>
                    <td className="py-1.5 px-1">{r.peligro}</td>
                    <td className="py-1.5 px-1 font-mono">{r.nd}</td>
                    <td className="py-1.5 px-1 font-mono">{r.ne}</td>
                    <td className="py-1.5 px-1 font-mono">{r.np} <span className="text-muted-foreground">({r.npLevel})</span></td>
                    <td className="py-1.5 px-1 font-mono">{r.nc}</td>
                    <td className="py-1.5 px-1 font-mono">{r.nr}</td>
                    <td className="py-1.5 px-1"><span className={`px-1.5 py-0.5 rounded border font-bold ${NR_STYLE[r.nrLevel]}`}>{r.nrLevel}</span></td>
                    <td className="py-1.5 px-1">{r.aceptabilidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {rows.map((r) => <RowCard key={r.id} row={r} />)}
    </div>
  );
};

export default HazardMatrixSection;
