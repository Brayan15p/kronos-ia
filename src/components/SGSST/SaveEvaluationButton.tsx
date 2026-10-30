/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { confidenceLabel, meanCycleSeconds, summarizeSnapshots, todayLocal, VIEW_LABEL } from "@/lib/sgsst";
import { newId, sgsstActions } from "@/lib/sgsstStore";
import type { VisionSession } from "@/components/VisionAI/types";

/** Guarda el resultado de una sesión de Vision AI como evaluación del Paquete SG-SST. */
const SaveEvaluationButton: React.FC<{ session: VisionSession }> = ({ session }) => {
  const { cycles } = useTimeStudy();
  const [open, setOpen] = useState(false);
  const [puesto, setPuesto] = useState("");
  const [operario, setOperario] = useState("");
  const [notas, setNotas] = useState("");
  const summary = summarizeSnapshots(session.snapshots);

  if (!summary) return null;

  const save = () => {
    if (!puesto.trim()) {
      toast.error("Indica el puesto o estación evaluada.");
      return;
    }
    sgsstActions.addEvaluation({
      id: newId(),
      puesto: puesto.trim(),
      operario: operario.trim(),
      fecha: todayLocal(new Date(session.startTime)),
      ...summary,
      notas: notas.trim(),
      origen: "vision-ai",
      cicloSeg: meanCycleSeconds(cycles, operario),
      horasExposicion: 8,
      createdAt: new Date().toISOString(),
    });
    toast.success("Evaluación guardada en el Paquete SG-SST");
    setOpen(false);
    setNotas("");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary-glass w-full flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="w-3.5 h-3.5" /> Guardar evaluación en SG-SST
      </button>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Guardar en Paquete SG-SST</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        RULA {summary.rulaAvg} (máx. {summary.rulaMax}) · REBA {summary.rebaAvg ?? "—"} (máx. {summary.rebaMax ?? "—"}) ·
        confianza {confidenceLabel(summary.confianza)} · vista {VIEW_LABEL[summary.vista].toLowerCase()} · {summary.muestras} muestras
      </p>
      <input value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Puesto o estación (obligatorio)" className="input-glass text-xs" aria-label="Puesto o estación" />
      <input value={operario} onChange={(e) => setOperario(e.target.value)} placeholder="Operario (vacío = anónimo)" className="input-glass text-xs" aria-label="Operario" />
      <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" className="input-glass text-xs" aria-label="Notas" />
      <p className="text-[10px] text-muted-foreground">
        Tamizaje con una sola cámara: revisa la confianza antes de usarlo como evidencia.
      </p>
      <button onClick={save} className="btn-primary-glass w-full text-xs">Guardar evaluación</button>
    </div>
  );
};

export default SaveEvaluationButton;
