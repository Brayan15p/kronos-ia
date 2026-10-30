/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useMemo, useState } from "react";
import { ListOrdered, AlertTriangle, CheckCircle2, Info, Shuffle } from "lucide-react";
import { useTimeStudy } from "@/context/TimeStudyContext";
import {
  buildSequenceReport, DEVIATION_LABEL, SHORT_FRACTION, type CycleSequence, type DeviationKind, type SequenceToken,
} from "@/lib/sequence";

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const pValue = (p: number) => (p < 0.001 ? "p < 0,001" : `p = ${p.toFixed(3).replace(".", ",")}`);

const KIND_ORDER: DeviationKind[] = ["omitido", "fuera-de-orden", "repetido", "muy-corto", "sin-registro"];

const TOKEN_CLS: Record<SequenceToken["status"], string> = {
  ok: "bg-success/15 border-success/40 text-success",
  "fuera-de-orden": "bg-warning/15 border-warning/50 text-warning",
  repetido: "bg-accent/15 border-accent/50 text-accent",
  "muy-corto": "bg-warning/10 border-warning/40 text-warning",
};

const SequenceChips: React.FC<{ seq: CycleSequence }> = ({ seq }) => {
  const omitted = seq.deviations.filter((d) => d.kind === "omitido");
  return (
    <div className="flex flex-wrap gap-1">
      {seq.tokens.map((t, i) => (
        <span key={i} title={`${DEVIATION_LABEL[t.status as DeviationKind] ?? "En orden"} · ${t.duration.toFixed(1)} s`}
          className={`min-w-[1.75rem] text-center px-1.5 py-0.5 rounded border text-[11px] font-mono ${TOKEN_CLS[t.status]}`}>
          {t.stepNumber}
        </span>
      ))}
      {omitted.map((d) => (
        <span key={`o${d.stepNumber}`} title="Omitido"
          className="min-w-[1.75rem] text-center px-1.5 py-0.5 rounded border text-[11px] font-mono bg-destructive/10 border-destructive/40 text-destructive line-through">
          {d.stepNumber}
        </span>
      ))}
    </div>
  );
};

/** Secuencia del método: pasos omitidos, fuera de orden, repetidos o muy cortos, y su relación con los defectos. */
const SequenceAnalysis: React.FC = () => {
  const { steps, cycles, defects } = useTimeStudy();
  const report = useMemo(() => buildSequenceReport(steps, cycles, defects), [steps, cycles, defects]);
  const [onlyDeviated, setOnlyDeviated] = useState(true);
  const usable = report.conforming + report.deviated;

  if (report.analyzed.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-2 max-w-lg mx-auto">
        <ListOrdered className="w-8 h-8 text-primary mx-auto" />
        <p className="font-display font-bold text-foreground">Aún no hay ciclos con tiempos por paso</p>
        <p className="text-sm text-muted-foreground">
          Registra ciclos con el cronómetro por pasos. Activa <strong>Secuencia observada</strong> para marcar el paso que el
          operario hace de verdad: así Kronos detecta pasos omitidos o hechos fuera de orden.
        </p>
      </div>
    );
  }

  const top = report.findings[0];
  const listed = report.analyzed.filter((a) => (onlyDeviated ? a.deviations.length > 0 : true)).slice(-30).reverse();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-5 flex flex-wrap items-start gap-3">
        <ListOrdered className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-display font-bold text-foreground">Secuencia del método</h3>
          <p className="text-xs text-muted-foreground">
            Compara el orden en que se hizo cada ciclo con el método estándar y mide si saltarse o alterar un paso va de la
            mano con más defectos.
          </p>
        </div>
      </div>

      {report.observedOrderCycles === 0 && report.visionCycles === 0 && (
        <div className="glass-card p-4 flex items-start gap-3 border-primary/30">
          <Shuffle className="w-5 h-5 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground">
            Ningún ciclo se registró con <strong>Secuencia observada</strong> ni con pasos de Vision AI. El cronómetro normal sigue
            el orden estándar, así que aquí solo pueden aparecer pasos muy cortos, repetidos o sin tiempo. Actívala en el
            Cronómetro, o enseña el método en Vision AI, para registrar las omisiones.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Ciclos revisados", value: String(usable), hint: `${report.observedOrderCycles} con secuencia observada · ${report.visionCycles} por Vision AI` },
          { label: "Siguen el método", value: usable ? pct(report.conformingRate) : "—", hint: `${report.conforming} de ${usable} ciclos` },
          { label: "Con desviaciones", value: String(report.deviated), hint: "Omitido, fuera de orden, repetido o muy corto" },
          { label: "Defectos si se desvían", value: report.deviated ? pct(report.overall.rateWith) : "—", hint: `${report.overall.withDevDefective} de ${report.overall.withDev} ciclos` },
          { label: "Defectos si siguen el método", value: report.conforming ? pct(report.overall.rateWithout) : "—", hint: `${report.overall.withoutDefective} de ${report.overall.without} ciclos` },
        ].map((k) => (
          <div key={k.label} className="glass-card p-3" title={k.hint}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className="text-lg font-mono font-bold text-foreground mt-1">{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className={`glass-card p-4 flex items-start gap-3 ${top ? "border-warning/40" : "border-border/30"}`} aria-live="polite">
        {top ? <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />}
        <div className="text-sm text-foreground space-y-1">
          {top ? (
            <>
              <p>
                Cuando el paso <strong>{top.stepNumber}. {top.name}</strong> no se hace como dice el método, salen con defecto{" "}
                <strong>{pct(top.association.rateWith)}</strong> de los ciclos ({top.association.withDevDefective} de {top.association.withDev});
                cuando se sigue, {pct(top.association.rateWithout)} ({top.association.withoutDefective} de {top.association.without}).
                {" "}{pValue(top.association.pValue)}.
              </p>
              <p className="text-xs text-muted-foreground">
                Es una asociación, no una causa comprobada. Siguiente paso: un poka-yoke o una verificación en ese paso, y medir
                de nuevo en 2 semanas.
              </p>
            </>
          ) : report.deviated === 0 ? (
            <p>Todos los ciclos revisados siguen el método estándar.</p>
          ) : (
            <p>
              Hay {report.deviated} ciclos con desviaciones, pero con estos datos no hay evidencia de que vayan de la mano con más
              defectos ({pValue(report.overall.pValue)}). Registra la calidad de cada ciclo para poder saberlo.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 xl:col-span-2 overflow-x-auto">
          <h4 className="text-sm font-display font-bold text-foreground mb-3">Por paso</h4>
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium pb-2">Paso</th>
                {KIND_ORDER.map((k) => <th key={k} className="text-right font-medium pb-2">{DEVIATION_LABEL[k]}</th>)}
                <th className="text-right font-medium pb-2">Defectos si se desvía</th>
              </tr>
            </thead>
            <tbody>
              {report.steps.map((s) => {
                const a = s.association;
                return (
                  <tr key={s.stepNumber} className="border-t border-border/20">
                    <td className="py-2 text-foreground">{s.stepNumber}. {s.name}</td>
                    {KIND_ORDER.map((k) => (
                      <td key={k} className={`py-2 text-right font-mono ${s.counts[k] ? "text-foreground" : "text-muted-foreground/50"}`}>
                        {s.counts[k] || "·"}
                      </td>
                    ))}
                    <td className={`py-2 text-right font-mono ${a.significant ? "text-warning font-bold" : "text-muted-foreground"}`}
                      title={a.withDev ? `${a.withDevDefective}/${a.withDev} vs ${a.withoutDefective}/${a.without} · ${pValue(a.pValue)}` : "Sin desviaciones"}>
                      {a.withDev ? `${pct(a.rateWith)} vs ${pct(a.rateWithout)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="glass-card p-5 space-y-3">
          <h4 className="text-sm font-display font-bold text-foreground">Por operario</h4>
          <ul className="space-y-2">
            {report.operators.map((o) => (
              <li key={o.operatorId} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">{o.operatorName}</span>
                  <span className="font-mono text-muted-foreground">{o.deviated} de {o.cycles} · {pct(o.rate)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div className={`h-full rounded-full ${o.rate > 0.2 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.max(2, o.rate * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            Una tasa alta no es una falla de la persona: suele señalar un método poco claro, falta de entrenamiento o un puesto
            que invita al atajo.
          </p>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-display font-bold text-foreground">Ciclos</h4>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={onlyDeviated} onChange={(e) => setOnlyDeviated(e.target.checked)} className="accent-primary" />
            Solo con desviaciones
          </label>
        </div>
        {listed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún ciclo con desviaciones.</p>
        ) : (
          <ul className="divide-y divide-border/20">
            {listed.map((a) => (
              <li key={a.cycleId} className="py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">#{a.cycleNumber}</span>
                  <span className="text-foreground">{a.operatorName}</span>
                  {a.defective && <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive text-[10px]">con defecto</span>}
                  {a.observedOrder && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">secuencia observada</span>}
                  {a.fromVision && <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">Vision AI</span>}
                </div>
                <SequenceChips seq={a} />
                {a.deviations.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">{a.deviations.map((d) => d.detail).join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground flex gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Fuera de orden = pasos que habría que mover para recuperar el orden estándar. Muy corto = menos del{" "}
          {SHORT_FRACTION * 100} % de la mediana del paso. "Sin registro" (paso sin tiempo en medio del ciclo) puede ser un olvido del
          observador y no entra en el análisis. Ciclos sin tiempos por paso: {report.withoutSteps}; guardados a medias: {report.incomplete}.
          La relación con los defectos usa la prueba exacta de Fisher (p &lt; 0,05).
        </p>
      </div>
    </div>
  );
};

export default SequenceAnalysis;
