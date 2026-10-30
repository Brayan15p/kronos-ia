/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
// Nube de Kronos: cuentas, organizaciones, plantas y estudios (esquema y permisos en
// supabase/migrations/20261031_organizations.sql, válido en Neon y en Supabase).
// Proveedor: Neon (Neon Auth + Data API) si están sus variables; si no, Supabase.
// Ambos se usan con la misma API (adaptador compatible con Supabase de Neon).
// Solo viajan métricas: el estudio en el formato del respaldo, nunca video.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { parseStudy, serializeStudy, type StudyData } from "@/lib/studyBackup";

export type OrgRole = Database["public"]["Enums"]["org_role"];

export interface CloudUser { id: string; email: string }
export interface Organization { id: string; name: string; country: string; role: OrgRole }
export interface Plant { id: string; orgId: string; name: string; city: string }
export interface StudySummary {
  id: string; orgId: string; plantId: string | null; name: string; station: string;
  cycleCount: number; version: number; updatedAt: Date;
}
export interface Member { userId: string; email: string; role: OrgRole }

/** Estudio local vinculado a uno de la nube (para "Actualizar" en lugar de crear otro). */
export interface CloudLink { orgId: string; studyId: string; version: number; name: string }

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Administrador",
  editor: "Editor",
  viewer: "Lector",
};

export const canEdit = (role: OrgRole) => role === "owner" || role === "editor";

export class CloudError extends Error {}
/** Otra persona guardó una versión más nueva del estudio. */
export class CloudConflictError extends CloudError {
  constructor(public readonly latestVersion: number | null) {
    super("Otra persona guardó una versión más nueva de este estudio.");
  }
}

export type CloudProvider = "neon" | "supabase";

export const cloudProvider: CloudProvider | null =
  import.meta.env.VITE_NEON_AUTH_URL && import.meta.env.VITE_NEON_DATA_API_URL ? "neon"
  : import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? "supabase"
  : null;

export const isCloudConfigured = cloudProvider !== null;

/** Lo que Kronos usa del cliente; Neon y Supabase lo cumplen igual. */
type Client = Pick<SupabaseClient<Database>, "auth" | "from" | "rpc">;
let clientPromise: Promise<Client> | null = null;

/** El cliente se carga solo si hay configuración: sin ella, Kronos funciona en local. */
async function db(): Promise<Client> {
  if (!cloudProvider) throw new CloudError("La nube no está configurada en esta instalación.");
  clientPromise ??= cloudProvider === "neon"
    // El adaptador de Neon implementa la interfaz de auth de Supabase (tipos de su propia copia).
    ? import("@/integrations/neon/client").then((m) => m.neon as unknown as Client)
    : import("@/integrations/supabase/client").then((m) => m.supabase);
  return clientPromise;
}

function fail(error: { message: string } | null): void {
  if (error) throw new CloudError(translate(error.message));
}

/** Mensajes de Supabase Auth más comunes, en el idioma de la app. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de entrar (revisa tu bandeja).";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese correo: inicia sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (m.includes("rate limit")) return "Demasiados intentos: espera un momento y vuelve a intentar.";
  return message;
}

// ── Cuenta ──────────────────────────────────────────────────────────────────

export async function getUser(): Promise<CloudUser | null> {
  const { data } = await (await db()).auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? "" } : null;
}

export async function onAuthChange(cb: (user: CloudUser | null) => void): Promise<() => void> {
  const { data } = (await db()).auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email ?? "" } : null);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await (await db()).auth.signInWithPassword({ email: email.trim(), password });
  fail(error);
}

/** Devuelve true si la cuenta queda activa; false si hay que confirmar el correo primero. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const { data, error } = await (await db()).auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  fail(error);
  return !!data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await (await db()).auth.signOut();
  fail(error);
}

// ── Organizaciones y miembros ───────────────────────────────────────────────

export async function listOrganizations(userId: string): Promise<Organization[]> {
  const c = await db();
  const [orgs, roles] = await Promise.all([
    c.from("organizations").select("id, name, country").order("created_at"),
    c.from("org_members").select("org_id, role").eq("user_id", userId),
  ]);
  fail(orgs.error);
  fail(roles.error);
  const roleOf = new Map((roles.data ?? []).map((r) => [r.org_id, r.role]));
  return (orgs.data ?? [])
    .filter((o) => roleOf.has(o.id))
    .map((o) => ({ ...o, role: roleOf.get(o.id)! }));
}

export async function createOrganization(name: string, country: string): Promise<string> {
  const { data, error } = await (await db()).rpc("create_organization", { p_name: name, p_country: country });
  fail(error);
  return data as string;
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await (await db()).rpc("list_org_members", { p_org: orgId });
  fail(error);
  return (data ?? []).map((m) => ({ userId: m.user_id, email: m.email, role: m.role }));
}

export async function addMember(orgId: string, email: string, role: OrgRole): Promise<void> {
  const { error } = await (await db()).rpc("add_member_by_email", { p_org: orgId, p_email: email, p_role: role });
  fail(error);
}

export async function updateMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
  const { error } = await (await db()).from("org_members").update({ role }).eq("org_id", orgId).eq("user_id", userId);
  fail(error);
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const { error } = await (await db()).from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  fail(error);
}

// ── Plantas ─────────────────────────────────────────────────────────────────

export async function listPlants(orgId: string): Promise<Plant[]> {
  const { data, error } = await (await db()).from("plants").select("id, org_id, name, city").eq("org_id", orgId).order("name");
  fail(error);
  return (data ?? []).map((p) => ({ id: p.id, orgId: p.org_id, name: p.name, city: p.city }));
}

export async function createPlant(orgId: string, name: string, city: string): Promise<void> {
  const { error } = await (await db()).from("plants").insert({ org_id: orgId, name: name.trim(), city: city.trim() });
  fail(error);
}

export async function deletePlant(plantId: string): Promise<void> {
  const { error } = await (await db()).from("plants").delete().eq("id", plantId);
  fail(error);
}

// ── Estudios ────────────────────────────────────────────────────────────────

/** El estudio viaja en el mismo formato versionado del respaldo en archivo. */
export const toCloudData = (study: StudyData): Json => JSON.parse(serializeStudy(study)) as Json;
export const fromCloudData = (data: Json): StudyData => parseStudy(JSON.stringify(data));

export async function listStudies(orgId: string): Promise<StudySummary[]> {
  const { data, error } = await (await db())
    .from("studies")
    .select("id, org_id, plant_id, name, station, cycle_count, version, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });
  fail(error);
  return (data ?? []).map((s) => ({
    id: s.id, orgId: s.org_id, plantId: s.plant_id, name: s.name, station: s.station,
    cycleCount: s.cycle_count, version: s.version, updatedAt: new Date(s.updated_at),
  }));
}

export async function loadStudy(studyId: string): Promise<{ study: StudyData; version: number; name: string; orgId: string }> {
  const { data, error } = await (await db())
    .from("studies").select("data, version, name, org_id").eq("id", studyId).single();
  fail(error);
  return { study: fromCloudData(data!.data), version: data!.version, name: data!.name, orgId: data!.org_id };
}

export async function createStudy(input: {
  orgId: string; plantId: string | null; name: string; station: string; study: StudyData;
}): Promise<CloudLink> {
  const { data, error } = await (await db())
    .from("studies")
    .insert({
      org_id: input.orgId, plant_id: input.plantId, name: input.name.trim(), station: input.station.trim(),
      data: toCloudData(input.study), cycle_count: input.study.cycles.length,
    })
    .select("id, version")
    .single();
  fail(error);
  return { orgId: input.orgId, studyId: data!.id, version: data!.version, name: input.name.trim() };
}

/**
 * Actualiza un estudio solo si nadie lo cambió desde `expectedVersion` (concurrencia optimista).
 * Si otra persona guardó antes, lanza CloudConflictError con la versión más reciente.
 */
export async function updateStudy(link: CloudLink, study: StudyData): Promise<CloudLink> {
  const c = await db();
  const { data, error } = await c
    .from("studies")
    .update({ data: toCloudData(study), cycle_count: study.cycles.length })
    .eq("id", link.studyId)
    .eq("version", link.version)
    .select("version");
  fail(error);
  if (!data || data.length === 0) {
    const latest = await c.from("studies").select("version").eq("id", link.studyId).maybeSingle();
    if (!latest.data) throw new CloudError("El estudio ya no existe en la nube (¿lo eliminaron?).");
    throw new CloudConflictError(latest.data.version);
  }
  return { ...link, version: data[0].version };
}

export async function deleteStudy(studyId: string): Promise<void> {
  const { error } = await (await db()).from("studies").delete().eq("id", studyId);
  fail(error);
}

// ── Vínculo local ───────────────────────────────────────────────────────────

const LINK_KEY = "kronos_cloud_link_v1";

export function readLink(): CloudLink | null {
  try {
    const raw = localStorage.getItem(LINK_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<CloudLink>) : null;
    return v && typeof v.studyId === "string" && typeof v.orgId === "string" && typeof v.version === "number"
      ? (v as CloudLink)
      : null;
  } catch {
    return null; // almacenamiento no disponible
  }
}

export function writeLink(link: CloudLink | null): void {
  try {
    if (link) localStorage.setItem(LINK_KEY, JSON.stringify(link));
    else localStorage.removeItem(LINK_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}
