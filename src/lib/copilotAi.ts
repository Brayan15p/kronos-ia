/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
/**
 * Narración por IA del Copiloto de planta.
 *
 * Al servidor solo viaja la lista de oportunidades YA calculada (nunca ciclos, lecturas ni
 * evaluaciones), anonimizada:
 *   - las marcas de operario se convierten en «Operario A», «Operario B»… (según su orden en
 *     la lista de operarios del estudio);
 *   - además, cualquier nombre de persona conocido (operarios, operario de una evaluación
 *     ergonómica, revisor experto, operario de una lectura ambiental) que aparezca en un texto
 *     libre (p. ej. un puesto llamado como alguien) se reemplaza;
 *   - se quitan saltos de línea y caracteres de control y se recorta cada campo.
 * Los límites deben coincidir con la validación de api/llm-interpret.ts (modo «copilot»),
 * que rechaza con 400 cualquier cosa que no los cumpla.
 */
import {
  aliasLetters, resolveOperatorNames,
  type CopilotArea, type CopilotReport, type CopilotSnapshot, type Confidence, type Effort, type PriorityTier,
} from "@/lib/copilot";

export const COPILOT_AI_LIMITS = {
  maxItems: 15,
  title: 160,
  diagnosis: 600,
  action: 400,
  maxImpactCOP: 1e13,
} as const;

export interface CopilotAiItem {
  rank: number;
  area: CopilotArea;
  priority: PriorityTier;
  title: string;
  diagnosis: string;
  action: string;
  impactCOP: number | null;
  confidence: Confidence;
  effort: Effort;
}

export interface CopilotAiPayload {
  mode: "copilot";
  items: CopilotAiItem[];
}

/** Alias estable de cada operario del estudio: «Operario A», «Operario B»… */
export function operatorAliases(snapshot: Pick<CopilotSnapshot, "operators">): Map<number, string> {
  return new Map(snapshot.operators.map((o, i) => [o.id, `Operario ${aliasLetters(i)}`]));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Borra de un texto los nombres de personas que hay en los datos, en UNA sola pasada (así un
 * alias recién insertado nunca se vuelve a sustituir por el de otra persona).
 */
function nameScrubber(snapshot: CopilotSnapshot, aliases: Map<number, string>): (text: string) => string {
  const map = new Map<string, string>();
  const add = (name: string | undefined, to: string) => {
    const n = (name ?? "").trim();
    // Nombres de menos de 3 letras borrarían trozos de palabras («Al», «Jo»).
    if (n.length >= 3 && !map.has(n.toLowerCase())) map.set(n.toLowerCase(), to);
  };
  snapshot.operators.forEach((o) => add(o.name, aliases.get(o.id) ?? "Operario"));
  (snapshot.evaluations ?? []).forEach((e) => {
    add(e.operario, "Operario");
    if (e.experto) add(e.experto.revisor, "el experto");
  });
  (snapshot.readings ?? []).forEach((r) => add(r.operatorName, "Operario"));
  if (map.size === 0) return (t) => t;
  // Primero los más largos («Ana María» antes que «Ana»).
  const alternation = [...map.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${alternation})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return (text) => text.replace(re, (_, pre: string, name: string) => `${pre}${map.get(name.toLowerCase()) ?? "Operario"}`);
}

/** Un solo renglón, sin caracteres de control, recortado a `max` caracteres. */
export function cleanText(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const flat = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Construye lo que se envía a /api/llm-interpret: solo las oportunidades, anonimizadas. */
export function buildCopilotAiPayload(report: CopilotReport, snapshot: CopilotSnapshot): CopilotAiPayload {
  const aliases = operatorAliases(snapshot);
  const scrub = nameScrubber(snapshot, aliases);
  // Primero se borran los nombres del texto libre y después se resuelven las marcas de operario.
  const anon = (text: string, max: number) =>
    cleanText(resolveOperatorNames(scrub(text), (id) => aliases.get(id) ?? "Operario"), max);
  const items = report.opportunities.slice(0, COPILOT_AI_LIMITS.maxItems).map((o, i) => {
    const v = o.impact.monthlyCOP;
    return {
      rank: i + 1,
      area: o.area,
      priority: o.priority,
      title: anon(o.title, COPILOT_AI_LIMITS.title),
      diagnosis: anon(o.diagnosis, COPILOT_AI_LIMITS.diagnosis),
      action: anon(o.action, COPILOT_AI_LIMITS.action),
      impactCOP: v !== null && Number.isFinite(v) ? Math.min(COPILOT_AI_LIMITS.maxImpactCOP, Math.max(0, Math.round(v))) : null,
      confidence: o.confidence,
      effort: o.effort,
    };
  });
  return { mode: "copilot", items };
}

/**
 * Pide la narración y la entrega por fragmentos (SSE de OpenRouter reenviado por el endpoint).
 * Lanza un Error con un mensaje para el usuario si el servicio no responde bien.
 */
export async function streamCopilotNarration(
  payload: CopilotAiPayload, onToken: (t: string) => void, signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/llm-interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("No pude conectarme con la IA. Intenta de nuevo en unos segundos.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        const token = JSON.parse(raw)?.choices?.[0]?.delta?.content ?? "";
        if (typeof token === "string" && token) onToken(token);
      } catch {
        /* fragmento parcial */
      }
    }
  }
}
