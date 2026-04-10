import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { summary } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Eres un experto en Seguridad y Salud en el Trabajo (SST) con especialidad en ingeniería industrial y ergonomía ambiental en Colombia. 

Analiza los datos ambientales proporcionados y genera recomendaciones detalladas basadas en:
- Resolución 2400 de 1979 (iluminación: 300-500 lux para trabajo fino)
- Resolución 1792 de 1990 (ruido: ≤85 dB para 8 horas)
- GTC 45 (identificación de peligros)
- Decreto 1072 de 2015 (SG-SST)

Estructura tu respuesta así:
## Diagnóstico General
## Riesgos Identificados
## Recomendaciones de Iluminación
## Recomendaciones de Ruido
## Plan de Acción Prioritario
## Estimación de Costos de Mejora
## Impacto en Productividad

Sé específico con cantidades, costos en COP, plazos, y normativa aplicable. Incluye cálculos de ROI cuando sea posible.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analiza estos datos ambientales de la planta de producción de grullas de origami:\n\n${JSON.stringify(summary, null, 2)}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido, intenta de nuevo en unos minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Agrega fondos en Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "Error del servicio de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const recommendations = data.choices?.[0]?.message?.content || "No se generaron recomendaciones.";

    return new Response(JSON.stringify({ recommendations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SST recommendations error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
