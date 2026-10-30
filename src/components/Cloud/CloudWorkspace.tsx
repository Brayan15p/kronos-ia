/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cloud, CloudUpload, Building2, Factory, FolderOpen, Trash2, Users, LogOut, Loader2, Plus, ShieldCheck, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useTimeStudy } from "@/context/TimeStudyContext";
import * as cloud from "@/lib/cloud";
import type { CloudLink, CloudUser, Member, Organization, OrgRole, Plant, StudySummary } from "@/lib/cloud";

const COUNTRIES: [string, string][] = [
  ["CO", "Colombia"], ["MX", "México"], ["PE", "Perú"], ["CL", "Chile"], ["EC", "Ecuador"],
  ["AR", "Argentina"], ["BR", "Brasil"], ["US", "Estados Unidos"], ["ES", "España"],
];

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error inesperado.");
const fmtDate = (d: Date) =>
  d.toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Ejecuta una acción mostrando el error en un toast; devuelve true si salió bien. */
async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    toast.error(errorText(e));
    return false;
  }
}

// ── Inicio de sesión ────────────────────────────────────────────────────────

const AuthPanel: React.FC = () => {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await attempt(async () => {
      if (mode === "in") {
        await cloud.signIn(email, password);
      } else if (!(await cloud.signUp(email, password))) {
        toast.success("Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.");
        setMode("in");
      }
    });
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="glass-card p-6 max-w-md mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-foreground">
          {mode === "in" ? "Inicia sesión" : "Crea tu cuenta"}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Guarda tus estudios en la nube, compártelos con tu equipo y organízalos por planta.
        Solo se sincronizan métricas: el video nunca sale de tu dispositivo.
      </p>
      <div>
        <label htmlFor="cloud-email" className="text-xs text-muted-foreground">Correo</label>
        <input id="cloud-email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} className="input-glass mt-1" />
      </div>
      <div>
        <label htmlFor="cloud-password" className="text-xs text-muted-foreground">Contraseña</label>
        <input id="cloud-password" type="password" required minLength={6} value={password}
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          onChange={(e) => setPassword(e.target.value)} className="input-glass mt-1" />
      </div>
      <button type="submit" disabled={busy} className="btn-primary-glass w-full flex items-center justify-center gap-2">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {mode === "in" ? "Entrar" : "Crear cuenta"}
      </button>
      <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")}
        className="text-xs text-primary hover:underline w-full text-center">
        {mode === "in" ? "¿No tienes cuenta? Crea una" : "¿Ya tienes cuenta? Inicia sesión"}
      </button>
    </form>
  );
};

// ── Organización nueva ──────────────────────────────────────────────────────

const NewOrgForm: React.FC<{ onCreated: (id: string) => void; compact?: boolean }> = ({ onCreated, compact }) => {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("CO");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    let id = "";
    if (await attempt(async () => { id = await cloud.createOrganization(name, country); })) {
      toast.success(`Organización "${name.trim()}" creada`);
      setName("");
      onCreated(id);
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className={compact ? "flex flex-wrap gap-2" : "glass-card p-6 max-w-md mx-auto space-y-3"}>
      {!compact && (
        <>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="font-display font-bold text-foreground">Crea tu organización</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            La empresa o consultora donde se hacen los estudios. Luego podrás añadir plantas e invitar a tu equipo.
          </p>
        </>
      )}
      <input aria-label="Nombre de la organización" placeholder="Ej: Confecciones Andina SAS" required minLength={2}
        value={name} onChange={(e) => setName(e.target.value)} className="input-glass flex-1 min-w-[12rem]" />
      <select aria-label="País" value={country} onChange={(e) => setCountry(e.target.value)} className="input-glass w-auto">
        {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <button type="submit" disabled={busy} className="btn-primary-glass flex items-center gap-1.5 text-sm">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear
      </button>
    </form>
  );
};

// ── Estudio actual: guardar o actualizar ────────────────────────────────────

const CurrentStudyCard: React.FC<{
  org: Organization; plants: Plant[]; link: CloudLink | null;
  onSaved: (link: CloudLink) => void; onUnlink: () => void;
}> = ({ org, plants, link, onSaved, onUnlink }) => {
  const study = useTimeStudy();
  const [name, setName] = useState("");
  const [station, setStation] = useState("");
  const [plantId, setPlantId] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = cloud.canEdit(org.role);
  const linkedHere = link && link.orgId === org.id ? link : null;

  const snapshot = () => ({
    steps: study.steps, operators: study.operators, cycles: study.cycles,
    defects: study.defects, qualityChecks: study.qualityChecks, costConfig: study.costConfig,
  });

  const saveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await attempt(async () => {
      const created = await cloud.createStudy({
        orgId: org.id, plantId: plantId || null, name, station, study: snapshot(),
      });
      onSaved(created);
      toast.success(`Estudio "${created.name}" guardado en la nube`);
      setName(""); setStation("");
    });
    setBusy(false);
  };

  const update = async () => {
    if (!linkedHere) return;
    if (study.cycles.length === 0 && !window.confirm(
      "El estudio local no tiene ciclos. ¿Seguro que quieres reemplazar la versión de la nube con un estudio vacío?",
    )) return;
    setBusy(true);
    try {
      onSaved(await cloud.updateStudy(linkedHere, snapshot()));
      toast.success("Estudio actualizado en la nube");
    } catch (e) {
      if (e instanceof cloud.CloudConflictError && e.latestVersion !== null && window.confirm(
        `Otra persona guardó la versión ${e.latestVersion} mientras trabajabas. ` +
        "¿Quieres sobrescribirla con tu versión? (Cancelar para no cambiar nada y abrir la de la nube desde la lista.)",
      )) {
        await attempt(async () => {
          onSaved(await cloud.updateStudy({ ...linkedHere, version: e.latestVersion! }, snapshot()));
          toast.success("Estudio sobrescrito con tu versión");
        });
      } else if (!(e instanceof cloud.CloudConflictError)) {
        toast.error(errorText(e));
      }
    }
    setBusy(false);
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CloudUpload className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold text-foreground">Estudio actual</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {study.cycles.length} ciclos · {study.operators.length} operarios · {study.steps.length} pasos
        </span>
      </div>

      {linkedHere && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xs text-foreground flex-1 min-w-[12rem]">
            Vinculado a <strong>{linkedHere.name}</strong> (versión {linkedHere.version}).
          </p>
          {editable && (
            <button onClick={update} disabled={busy} className="btn-primary-glass flex items-center gap-1.5 text-xs">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Actualizar en la nube
            </button>
          )}
          <button onClick={onUnlink} className="btn-secondary-glass text-xs">Desvincular</button>
        </div>
      )}

      {editable ? (
        <form onSubmit={saveNew} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input aria-label="Nombre del estudio" placeholder="Nombre del estudio (ej: Camiseta – Línea 1)" required
            value={name} onChange={(e) => setName(e.target.value)} className="input-glass sm:col-span-2" />
          <input aria-label="Estación o puesto" placeholder="Estación o puesto (opcional)"
            value={station} onChange={(e) => setStation(e.target.value)} className="input-glass" />
          <select aria-label="Planta" value={plantId} onChange={(e) => setPlantId(e.target.value)} className="input-glass">
            <option value="">Sin planta</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="submit" disabled={busy} className="btn-secondary-glass sm:col-span-2 flex items-center justify-center gap-1.5 text-sm">
            <CloudUpload className="w-4 h-4" /> Guardar como estudio nuevo
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Tu rol es Lector: puedes abrir estudios, pero no guardarlos.</p>
      )}
    </div>
  );
};

// ── Miembros ────────────────────────────────────────────────────────────────

const MembersPanel: React.FC<{ org: Organization; me: CloudUser }> = ({ org, me }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("editor");
  const isOwner = org.role === "owner";

  const refresh = useCallback(() => {
    attempt(async () => setMembers(await cloud.listMembers(org.id)));
  }, [org.id]);
  useEffect(refresh, [refresh]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await attempt(() => cloud.addMember(org.id, email, role))) {
      toast.success(`${email.trim()} ahora es ${cloud.ROLE_LABEL[role]}`);
      setEmail("");
      refresh();
    }
  };

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold text-foreground">Equipo</h3>
      </div>
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/10">
            <span className="flex-1 truncate text-foreground">{m.email}{m.userId === me.id && " (tú)"}</span>
            {isOwner && m.userId !== me.id ? (
              <>
                <select aria-label={`Rol de ${m.email}`} value={m.role} className="input-glass w-auto text-xs py-1"
                  onChange={async (e) => {
                    if (await attempt(() => cloud.updateMemberRole(org.id, m.userId, e.target.value as OrgRole))) refresh();
                  }}>
                  {(Object.keys(cloud.ROLE_LABEL) as OrgRole[]).map((r) => <option key={r} value={r}>{cloud.ROLE_LABEL[r]}</option>)}
                </select>
                <button aria-label={`Quitar a ${m.email}`} title="Quitar del equipo" className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (window.confirm(`¿Quitar a ${m.email} de ${org.name}?`) &&
                        await attempt(() => cloud.removeMember(org.id, m.userId))) refresh();
                  }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="text-muted-foreground">{cloud.ROLE_LABEL[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input type="email" required aria-label="Correo del nuevo miembro" placeholder="correo@empresa.com"
            value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass flex-1 min-w-[10rem] text-xs" />
          <select aria-label="Rol del nuevo miembro" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}
            className="input-glass w-auto text-xs">
            {(Object.keys(cloud.ROLE_LABEL) as OrgRole[]).map((r) => <option key={r} value={r}>{cloud.ROLE_LABEL[r]}</option>)}
          </select>
          <button type="submit" className="btn-secondary-glass text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Agregar</button>
          <p className="w-full text-[11px] text-muted-foreground">La persona debe haber creado su cuenta en Kronos antes.</p>
        </form>
      )}
    </div>
  );
};

// ── Espacio de trabajo ──────────────────────────────────────────────────────

const Workspace: React.FC<{ user: CloudUser }> = ({ user }) => {
  const { replaceStudy, cycles } = useTimeStudy();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
  const [plants, setPlants] = useState<Plant[]>([]);
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [plantFilter, setPlantFilter] = useState("");
  const [newPlant, setNewPlant] = useState({ name: "", city: "" });
  const [link, setLink] = useState<CloudLink | null>(cloud.readLink);
  const [busyStudy, setBusyStudy] = useState<string | null>(null);

  const org = orgs?.find((o) => o.id === orgId) ?? null;

  const loadOrgs = useCallback(async (select?: string) => {
    await attempt(async () => {
      const list = await cloud.listOrganizations(user.id);
      setOrgs(list);
      setOrgId((cur) => select ?? (list.some((o) => o.id === cur) ? cur : link?.orgId && list.some((o) => o.id === link.orgId) ? link.orgId : list[0]?.id ?? ""));
    });
  }, [user.id, link?.orgId]);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const loadOrgData = useCallback(async () => {
    if (!orgId) return;
    await attempt(async () => {
      const [p, s] = await Promise.all([cloud.listPlants(orgId), cloud.listStudies(orgId)]);
      setPlants(p);
      setStudies(s);
    });
  }, [orgId]);
  useEffect(() => { loadOrgData(); }, [loadOrgData]);

  const saveLink = (l: CloudLink | null) => {
    setLink(l);
    cloud.writeLink(l);
    loadOrgData();
  };

  const openStudy = async (s: StudySummary) => {
    if (cycles.length > 0 && !window.confirm(
      `Se reemplazará el estudio local (${cycles.length} ciclos) por "${s.name}". ` +
      "Si no lo has guardado, descarga antes un respaldo. ¿Continuar?",
    )) return;
    setBusyStudy(s.id);
    await attempt(async () => {
      const loaded = await cloud.loadStudy(s.id);
      replaceStudy(loaded.study);
      saveLink({ orgId: loaded.orgId, studyId: s.id, version: loaded.version, name: loaded.name });
      toast.success(`Abierto "${loaded.name}" (versión ${loaded.version})`);
    });
    setBusyStudy(null);
  };

  const removeStudy = async (s: StudySummary) => {
    if (!window.confirm(`¿Eliminar "${s.name}" de la nube para todo el equipo? No se puede deshacer.`)) return;
    if (await attempt(() => cloud.deleteStudy(s.id))) {
      if (link?.studyId === s.id) saveLink(null);
      else loadOrgData();
      toast.success("Estudio eliminado");
    }
  };

  const addPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    if (await attempt(() => cloud.createPlant(org.id, newPlant.name, newPlant.city))) {
      setNewPlant({ name: "", city: "" });
      loadOrgData();
    }
  };

  const plantName = useMemo(() => new Map(plants.map((p) => [p.id, p.name])), [plants]);
  const visibleStudies = plantFilter ? studies.filter((s) => s.plantId === plantFilter) : studies;

  if (orgs === null) {
    return <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (orgs.length === 0 || !org) return <NewOrgForm onCreated={(id) => loadOrgs(id)} />;

  const editable = cloud.canEdit(org.role);

  return (
    <div className="space-y-4">
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <Building2 className="w-5 h-5 text-primary" />
        {orgs.length > 1 ? (
          <select aria-label="Organización" value={orgId} onChange={(e) => setOrgId(e.target.value)} className="input-glass w-auto font-semibold">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <span className="font-display font-bold text-foreground">{org.name}</span>
        )}
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> {cloud.ROLE_LABEL[org.role]}
        </span>
        <details className="ml-auto">
          <summary className="text-xs text-muted-foreground cursor-pointer">Nueva organización</summary>
          <div className="mt-2"><NewOrgForm compact onCreated={(id) => loadOrgs(id)} /></div>
        </details>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <CurrentStudyCard org={org} plants={plants} link={link} onSaved={saveLink} onUnlink={() => saveLink(null)} />

          <div className="glass-card p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-display font-bold text-foreground">Estudios del equipo</h3>
              <select aria-label="Filtrar por planta" value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)}
                className="input-glass w-auto text-xs ml-auto">
                <option value="">Todas las plantas</option>
                {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {visibleStudies.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Aún no hay estudios guardados aquí.</p>
            ) : (
              <ul className="divide-y divide-border/20">
                {visibleStudies.map((s) => (
                  <li key={s.id} className="py-2.5 flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[12rem]">
                      <p className="text-sm text-foreground font-medium">
                        {s.name}{link?.studyId === s.id && <span className="ml-2 text-[10px] text-primary">● abierto</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {[s.plantId && plantName.get(s.plantId), s.station].filter(Boolean).join(" · ") || "Sin planta"}
                        {" · "}{s.cycleCount} ciclos · v{s.version} · {fmtDate(s.updatedAt)}
                      </p>
                    </div>
                    <button onClick={() => openStudy(s)} disabled={busyStudy === s.id} className="btn-secondary-glass text-xs flex items-center gap-1">
                      {busyStudy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />} Abrir
                    </button>
                    {editable && (
                      <button onClick={() => removeStudy(s)} aria-label={`Eliminar ${s.name}`} title="Eliminar"
                        className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-display font-bold text-foreground">Plantas</h3>
            </div>
            {plants.length === 0 && <p className="text-xs text-muted-foreground">Sin plantas todavía.</p>}
            <ul className="space-y-1">
              {plants.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/10">
                  <span className="flex-1 text-foreground">{p.name}</span>
                  {p.city && <span className="text-muted-foreground">{p.city}</span>}
                  {editable && (
                    <button aria-label={`Eliminar planta ${p.name}`} title="Eliminar planta" className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (window.confirm(`¿Eliminar la planta "${p.name}"? Sus estudios se conservan sin planta.`) &&
                            await attempt(() => cloud.deletePlant(p.id))) loadOrgData();
                      }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <form onSubmit={addPlant} className="flex flex-wrap gap-2">
                <input aria-label="Nombre de la planta" placeholder="Planta" required value={newPlant.name}
                  onChange={(e) => setNewPlant({ ...newPlant, name: e.target.value })} className="input-glass flex-1 min-w-[7rem] text-xs" />
                <input aria-label="Ciudad" placeholder="Ciudad" value={newPlant.city}
                  onChange={(e) => setNewPlant({ ...newPlant, city: e.target.value })} className="input-glass flex-1 min-w-[6rem] text-xs" />
                <button type="submit" className="btn-secondary-glass text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Agregar</button>
              </form>
            )}
          </div>
          <MembersPanel org={org} me={user} />
        </div>
      </div>
    </div>
  );
};

/** Nube y equipo: cuentas, organización → plantas → estudios, con roles. */
const CloudWorkspace: React.FC = () => {
  const [user, setUser] = useState<CloudUser | null | undefined>(undefined);

  useEffect(() => {
    if (!cloud.isCloudConfigured) return;
    let unsubscribe: (() => void) | undefined;
    let active = true;
    cloud.getUser().then((u) => active && setUser(u)).catch(() => active && setUser(null));
    cloud.onAuthChange((u) => setUser(u)).then((un) => { if (active) unsubscribe = un; else un(); });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  if (!cloud.isCloudConfigured) {
    return (
      <div className="glass-card p-6 max-w-lg mx-auto text-sm text-muted-foreground space-y-2">
        <p className="font-display font-bold text-foreground">La nube no está configurada</p>
        <p>Kronos funciona en este navegador y puedes usar Respaldo / Restaurar para mover estudios entre equipos.
          Para trabajar en equipo, configura las variables de Supabase (ver README).</p>
      </div>
    );
  }
  if (user === undefined) {
    return <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!user) return <AuthPanel />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>{user.email}</span>
        <button onClick={() => attempt(cloud.signOut)} className="btn-secondary-glass text-xs flex items-center gap-1">
          <LogOut className="w-3.5 h-3.5" /> Salir
        </button>
      </div>
      <Workspace user={user} />
    </div>
  );
};

export default CloudWorkspace;
