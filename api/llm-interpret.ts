// Vercel Edge Function — OpenRouter proxy con streaming SSE + chat multi-turn
// Mantiene la API key server-side: nunca expuesta al cliente.
export const config = { runtime: "edge" };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Cadena de modelos gratuitos verificados — fallback automático si 429
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
];

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
• Factor que más afecta rentabilidad: ${sobol?.[0]?.name ?? "N/A"} (${sobol?.[0]?.si_pct?.toFixed(0) ?? "?"}% de la varianza)
• Mayor palanca económica: ${tornado?.[0]?.name ?? "N/A"} (rango $${col(+(tornado?.[0]?.range ?? 0))})

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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENROUTER_API_KEY no configurada en Vercel env vars." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: Record<string, unknown> & { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = buildSystemPrompt(body);
  // Historial de conversación del cliente + mensaje inicial si es primera vez
  const history = (body.messages ?? []) as { role: string; content: string }[];
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...(history.length === 0
      ? [{ role: "user", content: "Analiza el proceso y dame el diagnóstico." }]
      : history),
  ];

  // Intenta cada modelo en orden — si hay 429 (rate-limit) pasa al siguiente
  let lastError = "";
  for (const model of MODELS) {
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
      const err = await upstream.text();
      return new Response(JSON.stringify({ error: err }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream SSE directo al cliente con el modelo que respondió
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Model-Used": model,
        "Transfer-Encoding": "chunked",
      },
    });
  }

  // Todos los modelos fallaron
  return new Response(
    JSON.stringify({ error: `Todos los modelos gratuitos están rate-limited. Último error: ${lastError}. Intenta en unos segundos.` }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
