/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StudyData } from "@/lib/studyBackup";

// Cliente de Supabase simulado: cada consulta registra sus filtros y devuelve la respuesta en cola.
type Resp = { data: unknown; error: { message: string } | null };
const queue: Resp[] = [];
const calls: { table: string; ops: [string, unknown[]][] }[] = [];

function builder(table: string) {
  const call = { table, ops: [] as [string, unknown[]][] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "delete", "eq", "order", "single", "maybeSingle"]) {
    b[op] = (...args: unknown[]) => { call.ops.push([op, args]); return b; };
  }
  b.then = (resolve: (r: Resp) => void) => resolve(queue.shift() ?? { data: null, error: null });
  return b;
}

const fakeClient = {
  from: (table: string) => builder(table),
  rpc: vi.fn(async () => queue.shift() ?? { data: null, error: null }),
  auth: {
    signInWithPassword: vi.fn(async () => queue.shift() ?? { data: {}, error: null }),
  },
};
vi.mock("@/integrations/supabase/client", () => ({ supabase: fakeClient }));
const neonCreateClient = vi.fn(() => fakeClient);
vi.mock("@neondatabase/neon-js", () => ({
  createClient: neonCreateClient,
  SupabaseAuthAdapter: () => "adaptador-supabase",
}));

const study: StudyData = {
  steps: [{ number: 1, name: "Cortar", emoji: "✂️" }],
  operators: [{ id: 1, name: "Ana", hourlyCost: 15000 }],
  cycles: [{
    id: "c1", operatorId: 1, operatorName: "Ana", cycleNumber: 1, duration: 10, steps: [],
    timestamp: new Date("2026-10-31T10:00:00Z"), qualityPass: true, defects: [], notes: "",
  }],
  defects: [], qualityChecks: [],
  costConfig: { productValue: 5000, targetCycleTime: 60, monthlyProductionTarget: 1000 },
};

async function loadCloud() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://demo.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "clave-publica");
  vi.resetModules();
  return import("@/lib/cloud");
}

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  localStorage.clear();
});

describe("nube: estudios", () => {
  it("el estudio viaja en el formato del respaldo y vuelve igual", async () => {
    const cloud = await loadCloud();
    expect(cloud.fromCloudData(cloud.toCloudData(study))).toEqual(study);
  });

  it("actualizar con la versión vigente devuelve la versión nueva y filtra por versión", async () => {
    const cloud = await loadCloud();
    queue.push({ data: [{ version: 4 }], error: null });
    const link = await cloud.updateStudy({ orgId: "o", studyId: "s", version: 3, name: "E" }, study);
    expect(link.version).toBe(4);
    expect(calls[0].ops).toContainEqual(["eq", ["version", 3]]);
    expect(calls[0].ops).toContainEqual(["eq", ["id", "s"]]);
  });

  it("si otra persona guardó antes, avisa el conflicto con la versión más reciente", async () => {
    const cloud = await loadCloud();
    queue.push({ data: [], error: null }, { data: { version: 7 }, error: null });
    await expect(cloud.updateStudy({ orgId: "o", studyId: "s", version: 3, name: "E" }, study))
      .rejects.toMatchObject({ latestVersion: 7 });
  });

  it("si el estudio ya no existe, lo dice en lugar de un conflicto", async () => {
    const cloud = await loadCloud();
    queue.push({ data: [], error: null }, { data: null, error: null });
    const p = cloud.updateStudy({ orgId: "o", studyId: "s", version: 3, name: "E" }, study);
    await expect(p).rejects.toThrow(/ya no existe/);
    await expect(p).rejects.not.toBeInstanceOf(cloud.CloudConflictError);
  });

  it("crear guarda el número de ciclos y devuelve el vínculo", async () => {
    const cloud = await loadCloud();
    queue.push({ data: { id: "nuevo", version: 1 }, error: null });
    const link = await cloud.createStudy({ orgId: "o", plantId: null, name: "  Línea 1 ", station: "", study });
    expect(link).toEqual({ orgId: "o", studyId: "nuevo", version: 1, name: "Línea 1" });
    const insert = calls[0].ops.find(([op]) => op === "insert")![1][0] as Record<string, unknown>;
    expect(insert.cycle_count).toBe(1);
    expect(insert.org_id).toBe("o");
  });
});

describe("nube: organizaciones y cuenta", () => {
  it("une cada organización con el rol del usuario y descarta las que no tienen rol", async () => {
    const cloud = await loadCloud();
    queue.push(
      { data: [{ id: "a", name: "A", country: "CO" }, { id: "b", name: "B", country: "MX" }], error: null },
      { data: [{ org_id: "a", role: "owner" }], error: null },
    );
    expect(await cloud.listOrganizations("u1")).toEqual([{ id: "a", name: "A", country: "CO", role: "owner" }]);
  });

  it("traduce los errores de inicio de sesión", async () => {
    const cloud = await loadCloud();
    queue.push({ data: {}, error: { message: "Invalid login credentials" } });
    await expect(cloud.signIn("a@b.co", "x")).rejects.toThrow("Correo o contraseña incorrectos.");
  });

  it("solo administradores y editores pueden editar", async () => {
    const cloud = await loadCloud();
    expect(cloud.canEdit("owner")).toBe(true);
    expect(cloud.canEdit("editor")).toBe(true);
    expect(cloud.canEdit("viewer")).toBe(false);
  });
});

describe("nube: vínculo local", () => {
  it("guarda, lee y borra el vínculo; ignora datos dañados", async () => {
    const cloud = await loadCloud();
    const link = { orgId: "o", studyId: "s", version: 2, name: "E" };
    cloud.writeLink(link);
    expect(cloud.readLink()).toEqual(link);
    cloud.writeLink(null);
    expect(cloud.readLink()).toBeNull();
    localStorage.setItem("kronos_cloud_link_v1", '{"studyId": 5}');
    expect(cloud.readLink()).toBeNull();
  });
});

describe("proveedor de la nube", () => {
  it("con variables de Neon usa Neon Auth + Data API con el adaptador compatible con Supabase", async () => {
    vi.stubEnv("VITE_NEON_AUTH_URL", "https://ep-demo.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "https://ep-demo.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1");
    vi.stubEnv("VITE_SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "clave");
    vi.resetModules();
    neonCreateClient.mockClear();
    const cloud = await import("@/lib/cloud");
    expect(cloud.cloudProvider).toBe("neon");
    queue.push({ data: [], error: null });
    await cloud.listPlants("o");
    expect(neonCreateClient).toHaveBeenCalledWith({
      auth: { adapter: "adaptador-supabase", url: "https://ep-demo.neonauth.c-2.us-east-2.aws.neon.tech/neondb/auth" },
      dataApi: { url: "https://ep-demo.apirest.c-2.us-east-2.aws.neon.tech/neondb/rest/v1" },
    });
    vi.unstubAllEnvs();
  });

  it("sin variables de Neon usa Supabase", async () => {
    vi.stubEnv("VITE_NEON_AUTH_URL", "");
    vi.stubEnv("VITE_NEON_DATA_API_URL", "");
    const cloud = await loadCloud();
    expect(cloud.cloudProvider).toBe("supabase");
    vi.unstubAllEnvs();
  });
});

describe("nube sin configurar", () => {
  it("no carga el cliente y responde con un error claro", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_NEON_AUTH_URL", "");
    vi.resetModules();
    const cloud = await import("@/lib/cloud");
    expect(cloud.isCloudConfigured).toBe(false);
    await expect(cloud.listStudies("o")).rejects.toThrow(/no está configurada/);
  });
});
