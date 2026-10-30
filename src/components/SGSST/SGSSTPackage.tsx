/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, ClipboardList, ScanEye, Grid3x3, Activity, ListChecks, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSST } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import {
  CAMERA_NOTE, buildMatrix, matrixToCSV, meanCycleSeconds, planToCSV, summarizeZones, todayLocal, withCurrentLevels,
} from "@/lib/sgsst";
import { sgsstActions, useSGSST } from "@/lib/sgsstStore";
import ScopeNote from "./ScopeNote";
import EvaluationsSection from "./EvaluationsSection";
import HazardMatrixSection from "./HazardMatrixSection";
import { NR_STYLE } from "./styles";
import MeasurementsSection from "./MeasurementsSection";
import ActionPlanSection from "./ActionPlanSection";

type Section = "portada" | "evaluaciones" | "matriz" | "mediciones" | "plan";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "portada", label: "Portada", icon: Building2 },
  { id: "evaluaciones", label: "Evaluaciones", icon: ScanEye },
  { id: "matriz", label: "Matriz GTC 45", icon: Grid3x3 },
  { id: "mediciones", label: "Mediciones", icon: Activity },
  { id: "plan", label: "Plan de acción", icon: ListChecks },
];

const label = "text-[10px] text-muted-foreground uppercase tracking-wider";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const SGSSTPackage: React.FC = () => {
  const sg = useSGSST();
  const { readings } = useSST();
  const { cycles } = useTimeStudy();
  const [section, setSection] = useState<Section>("portada");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => buildMatrix({ evaluations: sg.evaluations, readings, overrides: sg.matrixOverrides }),
    [sg.evaluations, sg.matrixOverrides, readings],
  );
  const zones = useMemo(() => summarizeZones(readings), [readings]);
  const plan = useMemo(() => withCurrentLevels(sg.plan, rows), [sg.plan, rows]);
  const defaultCycle = useMemo(() => meanCycleSeconds(cycles), [cycles]);
  const active = rows.filter((r) => !r.excluded);
  const byLevel = (["I", "II", "III", "IV"] as const).map((l) => [l, active.filter((r) => r.nrLevel === l).length] as const);
  const stamp = todayLocal();

  const exportPDF = async () => {
    setBusy(true);
    try {
      // jsPDF solo se descarga cuando se exporta.
      const { buildSGSSTPdf } = await import("@/lib/sgsstPdf");
      buildSGSSTPdf({ cover: sg.cover, evaluations: sg.evaluations, rows, zones, readings, plan })
        .save(`kronos_paquete_sgsst_${stamp}.pdf`);
      toast.success("Paquete de evidencias generado");
    } catch {
      toast.error("No se pudo generar el PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/20 flex-shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-foreground text-base leading-tight">Paquete SG-SST</h2>
              <p className="text-xs text-muted-foreground">Evaluaciones ergonómicas, matriz GTC 45, mediciones y plan de acción</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportPDF} disabled={busy} className="btn-primary-glass text-xs flex items-center gap-1.5 disabled:opacity-60">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF de evidencias
            </button>
            <button onClick={() => download(`kronos_matriz_gtc45_${stamp}.csv`, matrixToCSV(rows), "text/csv;charset=utf-8")} className="btn-secondary-glass text-xs flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Matriz (Excel)
            </button>
            <button onClick={() => download(`kronos_plan_accion_${stamp}.csv`, planToCSV(plan), "text/csv;charset=utf-8")} className="btn-secondary-glass text-xs flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Plan (Excel)
            </button>
          </div>
        </div>
        <ScopeNote extra={CAMERA_NOTE} />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30"><p className="text-[10px] text-muted-foreground uppercase">Evaluaciones</p><p className="font-mono font-bold text-lg">{sg.evaluations.length}</p></div>
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30"><p className="text-[10px] text-muted-foreground uppercase">Lecturas</p><p className="font-mono font-bold text-lg">{readings.length}</p></div>
          <div className="p-2 rounded-lg bg-muted/20 border border-border/30"><p className="text-[10px] text-muted-foreground uppercase">Acciones abiertas</p><p className="font-mono font-bold text-lg">{sg.plan.filter((a) => a.estado !== "cerrada").length}</p></div>
          {byLevel.map(([l, n]) => (
            <div key={l} className={`p-2 rounded-lg border ${NR_STYLE[l]}`}><p className="text-[10px] uppercase">Riesgo nivel {l}</p><p className="font-mono font-bold text-lg">{n}</p></div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones del paquete">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const on = section === s.id;
          return (
            <button
              key={s.id} role="tab" aria-selected={on} onClick={() => setSection(s.id)}
              className={`${on ? "btn-primary-glass" : "btn-secondary-glass"} text-xs flex items-center gap-1.5 px-3 py-1.5`}
            >
              <Icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          );
        })}
      </div>

      {section === "portada" && (
        <div className="glass-card p-4 md:p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-foreground">Datos de la portada</h3>
          <p className="text-xs text-muted-foreground">Se guardan en este navegador y encabezan el PDF de evidencias.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={label}>Empresa</label><input value={sg.cover.empresa} onChange={(e) => sgsstActions.setCover({ empresa: e.target.value })} className="input-glass mt-1" placeholder="Razón social" /></div>
            <div><label className={label}>Planta / sede</label><input value={sg.cover.planta} onChange={(e) => sgsstActions.setCover({ planta: e.target.value })} className="input-glass mt-1" /></div>
            <div><label className={label}>Responsable del SG-SST</label><input value={sg.cover.responsable} onChange={(e) => sgsstActions.setCover({ responsable: e.target.value })} className="input-glass mt-1" /></div>
            <div><label className={label}>Fecha del paquete</label><input type="date" value={sg.cover.fecha} onChange={(e) => sgsstActions.setCover({ fecha: e.target.value })} className="input-glass mt-1" /></div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Contenido del PDF</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Alcance y método (GTC 45:2012 y convención de propuesta de ND/NE)</li>
              <li>Evaluaciones ergonómicas (RULA, REBA y confianza)</li>
              <li>Matriz de peligros biomecánicos y físicos</li>
              <li>Mediciones de iluminación y ruido</li>
              <li>Plan de acción</li>
              <li>Nota de alcance y espacio para la revisión del profesional SST</li>
            </ol>
          </div>
        </div>
      )}
      {section === "evaluaciones" && <EvaluationsSection evaluations={sg.evaluations} defaultCycle={defaultCycle} />}
      {section === "matriz" && <HazardMatrixSection rows={rows} />}
      {section === "mediciones" && <MeasurementsSection zones={zones} readings={readings} />}
      {section === "plan" && <ActionPlanSection plan={plan} rows={rows} />}
    </div>
  );
};

export default SGSSTPackage;
