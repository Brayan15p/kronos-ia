/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React from "react";
import { Info } from "lucide-react";
import { SCOPE_NOTE } from "@/lib/sgsst";

/** Aviso de alcance del Paquete SG-SST (se muestra donde se toman o exportan decisiones). */
const ScopeNote: React.FC<{ extra?: string; className?: string }> = ({ extra, className = "" }) => (
  <div className={`flex gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-200/90 ${className}`} role="note">
    <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-400" />
    <div className="space-y-1 min-w-0">
      <p>{SCOPE_NOTE}</p>
      {extra && <p className="text-muted-foreground">{extra}</p>}
    </div>
  </div>
);

export default ScopeNote;
