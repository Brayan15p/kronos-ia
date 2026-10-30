/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Vercel Edge Function — OpenRouter proxy con streaming SSE + chat multi-turn
// Mantiene la API key server-side: nunca expuesta al cliente.
export const config = { runtime: "edge" };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Cadena de modelos — fallback automático si 429. Se puede sustituir (p. ej. por modelos
// de pago, más fiables y sin retención de datos) con la variable LLM_MODELS="modelo1,modelo2".
const DEFAULT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
];

const MAX_HISTORY = 12;          // mensajes de la conversación que se reenvían al modelo
const MAX_MESSAGE_CHARS = 2000;  // longitud máxima de cada mensaje
const MAX_LABEL_CHARS = 60;      // nombres de factores que se interpolan en el prompt

// Solo la propia app (producción, previews de Vercel y desarrollo local) puede usar el
// endpoint desde un navegador; así otra web no puede gastar la API key. ALLOWED_ORIGINS
// (lista separada por comas) añade dominios propios.
const ORIGIN_PATTERNS = [
  /^https:\/\/kronos-ia\.vercel\.app$/,
  /^https:\/\/kronos-[a-z0-9-]+-brayan15ps-projects\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // peticiones sin navegador (curl, tests)
  const extra = (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return extra.includes(origin) || ORIGIN_PATTERNS.some(re => re.test(origin));
}

function corsHeaders(origin: string | null): Record<string, string> {
  return origin && isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function json(status: number, data: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Solo turnos user/assistant con texto: el cliente no puede inyectar mensajes de sistema. */
export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is ChatMessage =>
      !!m && typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" && m.content.trim() !== "")
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

const label = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_LABEL_CHARS) : "N/A");

function buildSystemPrompt(data: Record<string, unknown>): string {
  const {
    cpk, ppk, sigmaSix, dpmo, probMeetTarget,
    mean, std, target, verdict,
    expected, var95, cvar, improvementMonthly,
    sobol, tornado,
  } = data as {
    cpk: number; ppk: number; sigmaSix: number; dpmo: number; probMeetTarget: number;
    mean: number; std: number; target: number; verdict: string;
    expected: number; var95: number; cvar: number; improvementMonthly: number;
    sobol: { name: string; si_pct: number }[];
    tornado: { name: string; range: number }[];
  };

  const verdictLabel =
    verdict === "capaz" ? "CAPAZ" :
    verdict === "aceptable" ? "ACEPTABLE con margen de mejora" :
    "NO CAPAZ — riesgo alto";

  const col = (n: number) => n.toLocaleString("es-CO");

  return `Eres el asesor de IA de KRONOS.AI, experto en ingeniería industrial y procesos de manufactura manual.

DATOS DEL PROCESO ANALIZADO:
• Veredicto: ${verdictLabel} | Cpk=${(+cpk).toFixed(2)} | Ppk=${(+ppk).toFixed(2)} | ${(+sigmaSix).toFixed(1)}σ
• Ciclos fallando: ${col(+dpmo)} DPMO (de cada millón, ${col(+dpmo)} superan el objetivo)
• Cumplimiento: ${((+probMeetTarget)*100).toFixed(1)}% | μ=${(+mean).toFixed(0)}s | σ=${(+std).toFixed(0)}s | Objetivo=${(+target).toFixed(0)}s
• Utilidad esperada: $${col(+expected)}/mes | Riesgo VaR: $${col(+var95)} | CVaR: $${col(+cvar)}
• Mejora potencial vs línea base: $${col(+improvementMonthly)}/mes
• Factor que más afecta rentabilidad: ${label(sobol?.[0]?.name)} (${sobol?.[0]?.si_pct?.toFixed(0) ?? "?"}% de la varianza)
• Mayor palanca económica: ${label(tornado?.[0]?.name)} (rango $${col(+(tornado?.[0]?.range ?? 0))})

REGLAS ESTRICTAS:
- Responde SIEMPRE en español
- Máximo 4 oraciones por respuesta — sé conciso y directo
- Lenguaje de planta, no académico — como si hablaras con el supervisor
- Sin fórmulas, sin mencionar nombres de índices (di "capacidad del proceso" no "Cpk")
- Sin disclaimers, sin mencionar que eres IA
- Primera respuesta: usa 3 emojis de bullet (🔴🟡🟢) según severidad + 1 acción concreta
- Respuestas siguientes: directo al punto, máximo 3 frases`;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return json(403, { error: "Origen no permitido" }, null);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, origin);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return json(500, { error: "OPENROUTER_API_KEY no configurada en Vercel env vars." }, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body inválido" }, origin);
  }
  if (!body || typeof body !== "object") return json(400, { error: "Body inválido" }, origin);

  const systemPrompt = buildSystemPrompt(body);
  // Historial de conversación del cliente + mensaje inicial si es primera vez
  const history = sanitizeHistory(body.messages);
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...(history.length === 0
      ? [{ role: "user", content: "Analiza el proceso y dame el diagnóstico." }]
      : history),
  ];

  const models = (process.env.LLM_MODELS ?? "").split(",").map(s => s.trim()).filter(Boolean);

  // Intenta cada modelo en orden — si hay 429 (rate-limit) pasa al siguiente
  let lastError = "";
  for (const model of models.length ? models : DEFAULT_MODELS) {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://kronos-ia.vercel.app",
        "X-Title": "KRONOS.AI Industrial Intelligence",
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (upstream.status === 429) {
      lastError = `${model} rate-limited`;
      continue; // probar siguiente modelo
    }

    if (!upstream.ok) {
      // El detalle se queda en los logs del servidor; al cliente solo un mensaje genérico.
      console.error("OpenRouter error", model, upstream.status, await upstream.text());
      return json(502, { error: "El servicio de IA respondió con un error." }, origin);
    }

    // Stream SSE directo al cliente con el modelo que respondió
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        ...corsHeaders(origin),
        "X-Model-Used": model,
      },
    });
  }

  // Todos los modelos fallaron
  return json(503, { error: `Todos los modelos están ocupados (${lastError}). Intenta en unos segundos.` }, origin);
}
