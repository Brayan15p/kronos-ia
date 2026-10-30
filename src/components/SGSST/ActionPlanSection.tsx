/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from "react";
import { Plus, Sprout, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CONTROL_LABEL, CONTROL_TYPES, STATUS_LABEL, seedActionPlan,
  type ActionItem, type ActionStatus, type ControlType, type MatrixRow,
} from "@/lib/sgsst";
import { newId, sgsstActions } from "@/lib/sgsstStore";
import { NR_STYLE } from "./styles";

const label = "text-[10px] text-muted-foreground uppercase tracking-wider";
const STATUS_STYLE: Record<ActionStatus, string> = {
  pendiente: "border-yellow-500/40",
  "en-curso": "border-primary/40",
  cerrada: "border-green-500/40 opacity-70",
};

const ActionPlanSection: React.FC<{ plan: ActionItem[]; rows: MatrixRow[] }> = ({ plan, rows }) => {
  const pending = seedActionPlan(rows, plan, () => "");

  const seed = () => {
    const items = seedActionPlan(rows, plan, newId);
    if (items.length === 0) return toast.info("No hay filas con nivel de riesgo I o II sin acciones.");
    sgsstActions.addActions(items);
    toast.success(`${items.length} acción(es) propuesta(s) desde la matriz`);
  };

  const addManual = () =>
    sgsstActions.addActions([{
      id: newId(), accion: "", peligro: "", tipoControl: "administrativo", responsable: "", fechaLimite: "", estado: "pendiente",
    }]);

  const counts = (["pendiente", "en-curso", "cerrada"] as ActionStatus[]).map((s) => [s, plan.filter((a) => a.estado === s).length] as const);

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-sm text-foreground">Plan de acción</h3>
            <p className="text-xs text-muted-foreground">
              {counts.map(([s, n]) => `${STATUS_LABEL[s]}: ${n}`).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={seed} className="btn-primary-glass text-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed" disabled={pending.length === 0}>
              <Sprout className="w-3.5 h-3.5" /> Proponer desde la matriz ({pending.length})
            </button>
            <button onClick={addManual} className="btn-secondary-glass text-xs flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Acción manual
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          «Proponer desde la matriz» crea una acción de control de ingeniería por cada fila con nivel de riesgo I o II que aún no tenga acciones.
          Complete el responsable y la fecha límite, y ajuste el tipo de control según la jerarquía.
        </p>
      </div>

      {plan.length === 0 ? (
        <div className="glass-card p-4 text-xs text-muted-foreground">Aún no hay acciones.</div>
      ) : (
        plan.map((a) => {
          const up = (patch: Partial<ActionItem>) => sgsstActions.updateAction(a.id, patch);
          return (
            <div key={a.id} className={`glass-card p-4 border-l-4 ${STATUS_STYLE[a.estado]} space-y-3`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <label className={label}>Acción</label>
                  <textarea value={a.accion} onChange={(e) => up({ accion: e.target.value })} rows={2} className="input-glass mt-1 text-xs resize-y" placeholder="Describa la acción" />
                </div>
                {a.nivelRiesgo && <span className={`mt-5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${NR_STYLE[a.nivelRiesgo]}`}>NR {a.nivelRiesgo}</span>}
                <button
                  onClick={() => window.confirm("¿Eliminar esta acción?") && sgsstActions.removeAction(a.id)}
                  className="mt-5 text-muted-foreground hover:text-destructive" aria-label="Eliminar acción"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label className={label}>Peligro / puesto</label>
                  <input value={a.peligro} onChange={(e) => up({ peligro: e.target.value })} className="input-glass mt-1 text-xs" />
                </div>
                <div>
                  <label className={label}>Tipo de control</label>
                  <select value={a.tipoControl} onChange={(e) => up({ tipoControl: e.target.value as ControlType })} className="input-glass mt-1 text-xs">
                    {CONTROL_TYPES.map((t) => <option key={t} value={t}>{CONTROL_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Responsable</label>
                  <input value={a.responsable} onChange={(e) => up({ responsable: e.target.value })} className="input-glass mt-1 text-xs" placeholder="Sin asignar" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Fecha límite</label>
                    <input type="date" value={a.fechaLimite} onChange={(e) => up({ fechaLimite: e.target.value })} className="input-glass mt-1 text-xs" />
                  </div>
                  <div>
                    <label className={label}>Estado</label>
                    <select value={a.estado} onChange={(e) => up({ estado: e.target.value as ActionStatus })} className="input-glass mt-1 text-xs">
                      {(Object.keys(STATUS_LABEL) as ActionStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default ActionPlanSection;
