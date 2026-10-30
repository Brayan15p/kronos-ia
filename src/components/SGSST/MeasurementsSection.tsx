/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from "react";
import { Sun, Volume2 } from "lucide-react";
import { REGULATIONS, getDbCompliance, getLuxCompliance, type ComplianceLevel, type EnvironmentalReading } from "@/context/SSTContext";
import { LEVEL_TEXT, noiseLimitForHours, type ZoneSummary } from "@/lib/sgsst";

const levelClass = (l: ComplianceLevel) => (l === "ok" ? "text-green-400" : l === "warning" ? "text-yellow-400" : "text-red-400");
const fmt1 = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-CO", { maximumFractionDigits: 1 }));

const MeasurementsSection: React.FC<{ zones: ZoneSummary[]; readings: EnvironmentalReading[] }> = ({ zones, readings }) => {
  const sorted = [...readings].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return (
    <div className="space-y-4">
      <div className="glass-card p-4 md:p-5 space-y-2">
        <h3 className="font-display font-bold text-sm text-foreground">Referencias usadas</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li className="flex gap-2"><Sun className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" /> Iluminancia {REGULATIONS.lux.min}–{REGULATIONS.lux.max} lux ({REGULATIONS.lux.label}). La referencia depende del tipo de tarea: confirme la aplicable con el profesional SST.</li>
          <li className="flex gap-2"><Volume2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" /> Ruido: {REGULATIONS.db8h.max} dB para 8 h, {REGULATIONS.db4h.max} dB para 4 h y {REGULATIONS.db2h.max} dB para 2 h (Res. 1792/1990). Por zona se usa el nivel equivalente (LEQ) ponderado por las horas de exposición.</li>
        </ul>
        <p className="text-[11px] text-muted-foreground">Las lecturas se registran en el Radar Ambiental con el equipo del usuario; Kronos no verifica su calibración.</p>
      </div>

      <div className="glass-card p-4 md:p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">Resumen por zona</h3>
        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hay mediciones. Regístralas en «Radar Ambiental».</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/30">
                  {["Zona", "Lecturas lux", "Lux prom.", "Estado lux", "Lecturas dB", "dB prom.", "LEQ", "h/jornada", "Límite", "Estado ruido"].map((h) => <th key={h} className="py-2 px-1 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => {
                  const limit = noiseLimitForHours(z.avgHours);
                  const luxL = z.avgLux == null ? null : getLuxCompliance(z.avgLux);
                  const dbL = z.leq == null ? null : z.leq > limit ? "critical" : getDbCompliance(z.leq);
                  return (
                    <tr key={z.zone} className="border-b border-border/10">
                      <td className="py-1.5 px-1 text-foreground">{z.zone}</td>
                      <td className="py-1.5 px-1 font-mono">{z.luxReadings}</td>
                      <td className="py-1.5 px-1 font-mono">{z.avgLux == null ? "—" : Math.round(z.avgLux)}</td>
                      <td className={`py-1.5 px-1 ${luxL ? levelClass(luxL) : ""}`}>{luxL ? LEVEL_TEXT[luxL] : "—"}</td>
                      <td className="py-1.5 px-1 font-mono">{z.dbReadings}</td>
                      <td className="py-1.5 px-1 font-mono">{fmt1(z.avgDb)}</td>
                      <td className="py-1.5 px-1 font-mono">{fmt1(z.leq)}</td>
                      <td className="py-1.5 px-1 font-mono">{fmt1(z.avgHours)}</td>
                      <td className="py-1.5 px-1 font-mono">{z.leq == null ? "—" : `${limit} dB`}</td>
                      <td className={`py-1.5 px-1 ${dbL ? levelClass(dbL) : ""}`}>
                        {z.leq == null ? "—" : z.leq > limit ? "Supera el límite" : LEVEL_TEXT[getDbCompliance(z.leq)]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="glass-card p-4 md:p-5">
          <h3 className="font-display font-bold text-sm text-foreground mb-3">Lecturas ({sorted.length})</h3>
          <div className="overflow-x-auto scroll-thin max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/30">
                  {["Fecha", "Zona", "Operario", "Lux", "dB", "Exp. (h)", "Notas"].map((h) => <th key={h} className="py-2 px-1 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-b border-border/10">
                    <td className="py-1.5 px-1 font-mono whitespace-nowrap">{new Date(r.timestamp).toLocaleString("es-CO")}</td>
                    <td className="py-1.5 px-1">{r.zone}</td>
                    <td className="py-1.5 px-1">{r.operatorName}</td>
                    <td className={`py-1.5 px-1 font-mono ${r.lux > 0 ? levelClass(getLuxCompliance(r.lux)) : ""}`}>{r.lux > 0 ? r.lux : "—"}</td>
                    <td className={`py-1.5 px-1 font-mono ${r.db > 0 ? levelClass(getDbCompliance(r.db)) : ""}`}>{r.db > 0 ? r.db : "—"}</td>
                    <td className="py-1.5 px-1 font-mono">{r.exposureHours}</td>
                    <td className="py-1.5 px-1 text-muted-foreground">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeasurementsSection;
