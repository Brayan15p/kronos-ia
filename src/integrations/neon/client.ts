/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Cliente de Neon: Neon Auth (login) + Data API (consultas compatibles con PostgREST).
// Usa el adaptador compatible con Supabase, así src/lib/cloud.ts habla igual con ambos proveedores.
import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { Database } from "@/integrations/supabase/types";

export const neon = createClient<Database>({
  auth: { adapter: SupabaseAuthAdapter(), url: import.meta.env.VITE_NEON_AUTH_URL },
  dataApi: { url: import.meta.env.VITE_NEON_DATA_API_URL },
});
