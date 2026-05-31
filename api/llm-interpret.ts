// Vercel Edge Function — OpenRouter proxy con streaming SSE
// Mantiene la API key server-side: nunca expuesta al cliente.
export const config = { runtime: "edge" };

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Cadena de modelos gratuitos verificados en OpenRouter (2025-05-30)
// Si el primero está rate-limited (429), prueba el siguiente automáticamente
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",  // Llama — calidad alta
  "openai/gpt-oss-120b:free",                 // GPT OSS 120B — verificado disponible
  "nvidia/nemotron-3-super-120b-a12b:free",   // Nvidia Nemotron 120B
  "deepseek/deepseek-v4-flash:free",          // DeepSeek Flash
  "google/gemma-4-31b-it:free",               // Gemma 4 31B
];

function buildPrompt(data: Record<string, unknown>): string {
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
    tornado: { name: string; range: number; low: number; high: number }[];
  };

  const verdictLabel =
    verdict === "capaz" ? "CAPAZ (Cpk ≥ 1.33)" :
    verdict === "aceptable" ? "ACEPTABLE (Cpk entre 1.00 y 1.33)" :
    "NO CAPAZ (Cpk < 1.00) — riesgo alto";

  const top = sobol?.[0];
  const topTornado = tornado?.[0];

  return `Eres experto en ingeniería industrial y análisis estadístico de procesos de manufactura manual (estudio de tiempos, Six Sigma, Lean). Analiza estos resultados de simulación Monte Carlo y entrega un análisis ejecutivo en español, claro y accionable. Máximo 280 palabras.

=== DATOS DE SIMULACIÓN ===
Proceso: manufactura manual (grullas de papel)
Veredicto: ${verdictLabel}

Índices de capacidad:
• Cpk = ${(+cpk).toFixed(3)} | Ppk = ${(+ppk).toFixed(3)} | Six Sigma = ${(+sigmaSix).toFixed(2)}σ
• DPMO = ${(+dpmo).toLocaleString("es-CO")} | Cumplimiento = ${((+probMeetTarget)*100).toFixed(1)}%
• μ = ${(+mean).toFixed(1)}s | σ = ${(+std).toFixed(1)}s | Objetivo (LSC) = ${(+target).toFixed(0)}s

Riesgo financiero mensual:
• Utilidad esperada: $${(+expected).toLocaleString("es-CO")}
• VaR 95%: $${(+var95).toLocaleString("es-CO")} de pérdida potencial
• CVaR (peor 5%): $${(+cvar).toLocaleString("es-CO")}
• Mejora vs línea base: $${(+improvementMonthly).toLocaleString("es-CO")}/mes

Factor dominante (Sobol S₁): ${top?.name ?? "N/A"} → explica el ${top?.si_pct?.toFixed(1) ?? "?"}% de la varianza de utilidad
Mayor palanca (Tornado): ${topTornado?.name ?? "N/A"} → rango de impacto $${(+(topTornado?.range ?? 0)).toLocaleString("es-CO")}

=== INSTRUCCIÓN ===
Escribe exactamente 3 párrafos:
**Párrafo 1 — Estado del proceso:** Explica en lenguaje operativo qué significa el Cpk y el nivel sigma para el supervisor de planta. ¿Cuántos ciclos de cada 1.000 están fallando?
**Párrafo 2 — Riesgo prioritario:** Identifica el mayor riesgo económico y su causa estadística (menciona el factor dominante del análisis de sensibilidad).
**Párrafo 3 — Acción esta semana:** Una sola acción concreta, específica y medible que el supervisor puede ejecutar en los próximos 5 días hábiles para mover el Cpk hacia 1.33.

No uses fórmulas matemáticas en los párrafos. Sé directo. Usa lenguaje de planta, no de academia.`;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = buildPrompt(body);

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
        messages: [{ role: "user", content: prompt }],
        stream: true,
        max_tokens: 450,
        temperature: 0.35,
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
