/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useState } from "react";
import { Plus, Trash2, ScanEye, PenLine } from "lucide-react";
import { toast } from "sonner";
import { CAMERA_NOTE, VIEW_LABEL, confidenceLabel, todayLocal, type ErgoEvaluation } from "@/lib/sgsst";
import { newId, sgsstActions } from "@/lib/sgsstStore";

const label = "text-[10px] text-muted-foreground uppercase tracking-wider";

/** Número opcional del formulario: vacío → null; texto no numérico → NaN (se rechaza al validar). */
const parseOpt = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));

interface Props {
  evaluations: ErgoEvaluation[];
  defaultCycle: number | null;
}

const EvaluationsSection: React.FC<Props> = ({ evaluations, defaultCycle }) => {
  const [f, setF] = useState({
    puesto: "", operario: "", fecha: todayLocal(), rulaAvg: "", rulaMax: "", rebaAvg: "", rebaMax: "",
    ciclo: defaultCycle != null ? String(defaultCycle) : "", horas: "8", notas: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const add = () => {
    const rulaAvg = parseOpt(f.rulaAvg);
    const rulaMax = parseOpt(f.rulaMax) ?? rulaAvg;
    const rebaAvg = parseOpt(f.rebaAvg);
    const rebaMax = parseOpt(f.rebaMax) ?? rebaAvg;
    const ciclo = parseOpt(f.ciclo);
    const horas = parseOpt(f.horas) ?? 8;
    if (!f.puesto.trim()) return toast.error("Indica el puesto o estación.");
    if (rulaAvg == null || !(rulaAvg >= 1 && rulaAvg <= 7) || rulaMax == null || !(rulaMax >= rulaAvg && rulaMax <= 7)) {
      return toast.error("RULA va de 1 a 7 y el máximo no puede ser menor que el promedio.");
    }
    if (rebaAvg != null && (!(rebaAvg >= 1 && rebaAvg <= 15) || rebaMax == null || !(rebaMax >= rebaAvg && rebaMax <= 15))) {
      return toast.error("REBA va de 1 a 15 y el máximo no puede ser menor que el promedio.");
    }
    if (ciclo != null && !(ciclo > 0)) return toast.error("El tiempo de ciclo debe ser mayor que 0.");
    if (!(horas >= 0 && horas <= 24)) return toast.error("Las horas por jornada van de 0 a 24.");
    sgsstActions.addEvaluation({
      id: newId(), puesto: f.puesto.trim(), operario: f.operario.trim(), fecha: f.fecha || todayLocal(),
      rulaAvg, rulaMax, rebaAvg, rebaMax: rebaAvg == null ? null : rebaMax,
      confianza: null, vista: "", notas: f.notas.trim(), origen: "manual", muestras: null,
      cicloSeg: ciclo, horasExposicion: horas, createdAt: new Date().toISOString(),
    });
    toast.success("Evaluación registrada");
    setF((p) => ({ ...p, rulaAvg: "", rulaMax: "", rebaAvg: "", rebaMax: "", notas: "" }));
  };

  const sorted = [...evaluations].sort((a, b) => `${b.fecha}${b.createdAt}`.localeCompare(`${a.fecha}${a.createdAt}`));

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 md:p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-1 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" /> Registro manual
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Para evaluaciones hechas por un evaluador. Las de Vision AI se guardan desde «Exportar sesión» con «Guardar evaluación en SG-SST».
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="col-span-2"><label className={label}>Puesto / estación</label><input value={f.puesto} onChange={set("puesto")} className="input-glass mt-1" placeholder="Ej.: Ensamble 2" /></div>
          <div className="col-span-2 md:col-span-1"><label className={label}>Operario</label><input value={f.operario} onChange={set("operario")} className="input-glass mt-1" placeholder="Anónimo" /></div>
          <div className="col-span-2 md:col-span-1"><label className={label}>Fecha</label><input type="date" value={f.fecha} onChange={set("fecha")} className="input-glass mt-1" /></div>
          <div><label className={label}>RULA prom.</label><input inputMode="decimal" value={f.rulaAvg} onChange={set("rulaAvg")} className="input-glass mt-1" placeholder="1–7" /></div>
          <div><label className={label}>RULA máx.</label><input inputMode="decimal" value={f.rulaMax} onChange={set("rulaMax")} className="input-glass mt-1" placeholder="1–7" /></div>
          <div><label className={label}>REBA prom.</label><input inputMode="decimal" value={f.rebaAvg} onChange={set("rebaAvg")} className="input-glass mt-1" placeholder="Opcional" /></div>
          <div><label className={label}>REBA máx.</label><input inputMode="decimal" value={f.rebaMax} onChange={set("rebaMax")} className="input-glass mt-1" placeholder="1–15" /></div>
          <div><label className={label}>Ciclo (s)</label><input inputMode="decimal" value={f.ciclo} onChange={set("ciclo")} className="input-glass mt-1" placeholder="Opcional" /></div>
          <div><label className={label}>h / jornada</label><input inputMode="decimal" value={f.horas} onChange={set("horas")} className="input-glass mt-1" /></div>
          <div className="col-span-2 md:col-span-4 lg:col-span-6"><label className={label}>Notas</label><input value={f.notas} onChange={set("notas")} className="input-glass mt-1" placeholder="Opcional" /></div>
        </div>
        <button onClick={add} className="btn-primary-glass mt-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Registrar evaluación</button>
      </div>

      <div className="glass-card p-4 md:p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">Evaluaciones registradas ({evaluations.length})</h3>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay evaluaciones. Guarda una sesión de Vision AI o registra una manualmente.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin -mx-1">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/30">
                  {["Fecha", "Puesto", "Operario", "Origen", "RULA prom./máx.", "REBA prom./máx.", "Confianza", "Vista", "Ciclo (s)", "Notas", ""].map((h) => (
                    <th key={h} className="py-2 px-1 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-border/10 align-top">
                    <td className="py-2 px-1 font-mono whitespace-nowrap">{e.fecha}</td>
                    <td className="py-2 px-1 text-foreground">{e.puesto}</td>
                    <td className="py-2 px-1">{e.operario || <span className="text-muted-foreground">Anónimo</span>}</td>
                    <td className="py-2 px-1">
                      <span className="inline-flex items-center gap-1">
                        {e.origen === "vision-ai" ? <><ScanEye className="w-3 h-3 text-primary" /> Vision AI</> : <><PenLine className="w-3 h-3" /> Manual</>}
                      </span>
                    </td>
                    <td className="py-2 px-1 font-mono">{e.rulaAvg} / {e.rulaMax}</td>
                    <td className="py-2 px-1 font-mono">{e.rebaAvg ?? "—"} / {e.rebaMax ?? "—"}</td>
                    <td className={`py-2 px-1 ${e.origen === "vision-ai" && (e.confianza == null || e.confianza < 0.35) ? "text-red-400" : ""}`}>
                      {e.origen === "vision-ai" ? confidenceLabel(e.confianza) : "—"}
                    </td>
                    <td className="py-2 px-1">{VIEW_LABEL[e.vista]}</td>
                    <td className="py-2 px-1 font-mono">{e.cicloSeg ?? "—"}</td>
                    <td className="py-2 px-1 text-muted-foreground max-w-[180px] break-words">{e.notas}</td>
                    <td className="py-2 px-1">
                      <button
                        onClick={() => window.confirm(`¿Eliminar la evaluación de «${e.puesto}» del ${e.fecha}?`) && sgsstActions.removeEvaluation(e.id)}
                        className="text-muted-foreground hover:text-destructive" aria-label="Eliminar evaluación"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">{CAMERA_NOTE}</p>
      </div>
    </div>
  );
};

export default EvaluationsSection;
