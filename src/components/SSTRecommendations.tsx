import React, { useState } from "react";
import { useSST, getLuxCompliance, getDbCompliance } from "@/context/SSTContext";
import { useTimeStudy } from "@/context/TimeStudyContext";
import { Brain, Loader2, Lightbulb, DollarSign, Shield, AlertTriangle, Zap, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SSTRecommendations: React.FC = () => {
  const { readings, workstations } = useSST();
  const { operators } = useTimeStudy();
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<string>("");
  const [error, setError] = useState("");

  const analyze = async () => {
    if (readings.length === 0) {
      setError("Registra al menos una medición ambiental primero.");
      return;
    }
    setLoading(true);
    setError("");
    setRecommendations("");

    const summary = {
      totalReadings: readings.length,
      operators: operators.map((op) => {
        const opR = readings.filter((r) => r.operatorId === op.id);
        return {
          name: op.name,
          readings: opR.length,
          avgLux: opR.length > 0 ? Math.round(opR.reduce((s, r) => s + r.lux, 0) / opR.length) : 0,
          avgDb: opR.length > 0 ? Math.round(opR.reduce((s, r) => s + r.db, 0) / opR.length) : 0,
          luxCompliance: opR.length > 0 ? opR.filter((r) => getLuxCompliance(r.lux) === "ok").length / opR.length : 0,
          dbCompliance: opR.length > 0 ? opR.filter((r) => getDbCompliance(r.db) === "ok").length / opR.length : 0,
        };
      }),
      measurementPoints3D: workstations.reduce((s, w) => s + w.measurementPoints.length, 0),
      zones: [...new Set(readings.map((r) => r.zone))],
    };

    try {
      const resp = await supabase.functions.invoke("sst-recommendations", {
        body: { summary },
      });

      if (resp.error) {
        setError(resp.error.message || "Error al conectar con IA");
        setLoading(false);
        return;
      }

      setRecommendations(resp.data?.recommendations || "No se generaron recomendaciones.");
    } catch (e: any) {
      setError(e.message || "Error inesperado");
    }
    setLoading(false);
  };

  const luxCrit = readings.filter((r) => getLuxCompliance(r.lux) === "critical").length;
  const dbCrit = readings.filter((r) => getDbCompliance(r.db) === "critical").length;
  const issues = luxCrit + dbCrit;

  // Static actionable recommendations
  const staticRecs = [
    { icon: Lightbulb, title: "Reducir ruido en zonas críticas", impact: "+12%", gain: "$150.000 COP", desc: "Instalar paneles acústicos en zonas con >85 dB", color: "#38bdf8" },
    { icon: Zap, title: "Programar pausa activa en 20 min", impact: "-18%", gain: "$90.000 COP", desc: "Reduce errores y fatiga visual/muscular", color: "#a855f7" },
    { icon: TrendingUp, title: "Optimizar iluminación LED 5000K", impact: "+15%", gain: "$120.000 COP", desc: "Mejorar lux en estaciones fuera de norma", color: "#eab308" },
    { icon: Shield, title: "Rotar operarios en zonas ruidosas", impact: "-25%", gain: "$200.000 COP", desc: "Reducir exposición acumulada y dosis diaria", color: "#22c55e" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6 border border-primary/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 border border-primary/30">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-foreground text-lg">Motor de Decisiones IA</h3>
              <p className="text-xs text-muted-foreground">Recomendaciones accionables con impacto económico estimado</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <span className="px-3 py-1 rounded-full text-xs bg-muted/30 border border-border/30 text-foreground">
              📊 {readings.length} mediciones
            </span>
            <span className="px-3 py-1 rounded-full text-xs bg-muted/30 border border-border/30 text-foreground">
              👷 {operators.length} operarios
            </span>
            {issues > 0 && (
              <span className="px-3 py-1 rounded-full text-xs bg-destructive/10 border border-destructive/30 text-destructive">
                ⚠️ {issues} alertas críticas
              </span>
            )}
          </div>

          <button onClick={analyze} disabled={loading} className="btn-primary-glass flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            {loading ? "Analizando con IA..." : "Generar Recomendaciones IA"}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card p-4 border border-destructive/40 bg-destructive/5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Static Actionable Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {staticRecs.map((rec, i) => {
          const Icon = rec.icon;
          return (
            <div
              key={i}
              className="glass-card p-5 border border-border/30 hover:border-primary/40 transition-all hover:scale-[1.02] cursor-default group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${rec.color}20`, border: `1px solid ${rec.color}40` }}>
                  <Icon className="w-5 h-5" style={{ color: rec.color }} />
                </div>
                <div className="flex-1">
                  <h4 className="font-display font-bold text-sm text-foreground group-hover:text-primary transition-colors">{rec.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{rec.desc}</p>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-xs font-bold px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400">
                      Impacto: {rec.impact} productividad
                    </span>
                    <span className="text-xs font-bold font-mono text-primary flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> {rec.gain}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* AI Recommendations */}
      {recommendations && (
        <div className="glass-card p-6 border border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-foreground">Análisis IA Personalizado</h3>
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            {recommendations.split("\n").map((line, i) => {
              if (line.startsWith("##")) return <h3 key={i} className="text-foreground font-display font-bold mt-4 mb-2">{line.replace(/##\s*/, "")}</h3>;
              if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="text-sm text-muted-foreground ml-4">{line.slice(2)}</li>;
              if (line.startsWith("**")) return <p key={i} className="text-sm font-bold text-foreground">{line.replace(/\*\*/g, "")}</p>;
              if (line.trim() === "") return <br key={i} />;
              return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
            })}
          </div>
        </div>
      )}

      {/* Quick Tips */}
      <div className="glass-card p-5">
        <h3 className="font-display font-bold text-sm text-foreground mb-3">💡 Guía Rápida SST</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              <span className="text-xs font-bold text-foreground">Iluminación</span>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1">
              <li>• LED 5000K para trabajo fino</li>
              <li>• Posicionar luces a 45° del plano</li>
              <li>• Evitar reflejos y sombras</li>
              <li>• Medir cada 3 meses</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-foreground">Ruido</span>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1">
              <li>• Paneles acústicos en paredes</li>
              <li>• EPP auditivo &gt;85 dB obligatorio</li>
              <li>• Rotar operarios zonas ruidosas</li>
              <li>• Audiometrías semestrales</li>
            </ul>
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className="text-xs font-bold text-foreground">Ahorro</span>
            </div>
            <ul className="text-[11px] text-muted-foreground space-y-1">
              <li>• Cumplimiento evita multas</li>
              <li>• Mejor ambiente = +15% productividad</li>
              <li>• EPP reduce ausentismo 40%</li>
              <li>• ROI mejoras: 3-6 meses</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SSTRecommendations;
