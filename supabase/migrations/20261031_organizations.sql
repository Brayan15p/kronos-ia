-- © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA.
-- Cuentas en la nube: organización → plantas → estudios, con roles.
--
-- Cada estudio guarda el estudio de tiempos completo como JSON (el mismo formato versionado del
-- respaldo de la app: src/lib/studyBackup.ts). Solo métricas: el video nunca sale del dispositivo.
-- Control de concurrencia optimista: cada actualización sube "version"; el cliente actualiza con
-- "where version = <la que leyó>" y, si no afecta filas, sabe que otra persona guardó antes.
--
-- Roles: owner (administra miembros y la organización), editor (crea y edita plantas y
-- estudios), viewer (solo lectura). Las funciones security definer fijan search_path vacío.
--
-- Portátil: funciona en Neon (Neon Auth + Data API) y en Supabase. Lo que cambia entre ambos
-- queda aislado en kronos_uid(), kronos_user_id_by_email() y kronos_user_email().

-- Usuario autenticado de la petición: Neon expone auth.user_id(), Supabase auth.uid() y
-- PostgREST el JWT en request.jwt.claims.
create or replace function public.kronos_uid() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if to_regprocedure('auth.user_id()') is not null then
    execute 'select auth.user_id()::text' into v;
  elsif to_regprocedure('auth.uid()') is not null then
    execute 'select auth.uid()::text' into v;
  else
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  end if;
  return nullif(v, '')::uuid;
end $$;

-- Usuarios y correos: neon_auth.user en Neon, auth.users en Supabase.
create or replace function public.kronos_user_id_by_email(p_email text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid;
begin
  if to_regclass('neon_auth.user') is not null then
    execute 'select id::uuid from neon_auth."user" where lower(email) = lower(btrim($1)) limit 1' into v using p_email;
  elsif to_regclass('auth.users') is not null then
    execute 'select id from auth.users where lower(email) = lower(btrim($1)) limit 1' into v using p_email;
  end if;
  return v;
end $$;

create or replace function public.kronos_user_email(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if to_regclass('neon_auth.user') is not null then
    execute 'select email::text from neon_auth."user" where id::text = $1::text' into v using p_user;
  elsif to_regclass('auth.users') is not null then
    execute 'select email::text from auth.users where id = $1' into v using p_user;
  end if;
  return v;
end $$;

do $$ begin
  create type public.org_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  country     text not null default 'CO' check (country ~ '^[A-Z]{2}$'),  -- ISO 3166-1 alfa-2
  created_by  uuid default public.kronos_uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null,  -- id del proveedor de cuentas (Neon Auth o Supabase Auth)
  role        public.org_role not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members(user_id);

create table if not exists public.plants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  city        text not null default '',
  created_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index if not exists plants_org_idx on public.plants(org_id);

create table if not exists public.studies (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  plant_id    uuid,
  name        text not null check (char_length(btrim(name)) between 1 and 160),
  station     text not null default '',
  data        jsonb not null check (octet_length(data::text) <= 5000000),  -- 5 MB por estudio
  cycle_count int not null default 0,
  version     int not null default 1,
  created_by  uuid default public.kronos_uid(),
  created_at  timestamptz not null default now(),
  updated_by  uuid default public.kronos_uid(),
  updated_at  timestamptz not null default now(),
  -- la planta debe pertenecer a la misma organización que el estudio
  foreign key (plant_id, org_id) references public.plants(id, org_id) on delete set null (plant_id)
);
create index if not exists studies_org_idx on public.studies(org_id, updated_at desc);

-- Versión, autor y fecha de cada actualización los pone la base de datos, no el cliente.
create or replace function public.studies_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := public.kronos_uid();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.org_id     := old.org_id;  -- un estudio no se mueve de organización
  return new;
end $$;
drop trigger if exists studies_touch on public.studies;
create trigger studies_touch before update on public.studies
  for each row execute function public.studies_touch();

-- ── Funciones de permisos ────────────────────────────────────────────────────
create or replace function public.org_role_of(p_org uuid) returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.org_members m where m.org_id = p_org and m.user_id = public.kronos_uid()
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.org_role_of(p_org) is not null
$$;

create or replace function public.can_edit_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.org_role_of(p_org) in ('owner', 'editor'), false)
$$;

create or replace function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.org_role_of(p_org) = 'owner', false)
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;
alter table public.plants        enable row level security;
alter table public.studies       enable row level security;

drop policy if exists "org_select" on public.organizations;
drop policy if exists "org_update" on public.organizations;
drop policy if exists "org_delete" on public.organizations;
create policy "org_select" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "org_update" on public.organizations for update to authenticated using (public.is_org_owner(id)) with check (public.is_org_owner(id));
create policy "org_delete" on public.organizations for delete to authenticated using (public.is_org_owner(id));
-- Las organizaciones se crean con create_organization(), que también registra al dueño.

drop policy if exists "members_select" on public.org_members;
drop policy if exists "members_update" on public.org_members;
drop policy if exists "members_delete" on public.org_members;
create policy "members_select" on public.org_members for select to authenticated using (public.is_org_member(org_id));
create policy "members_update" on public.org_members for update to authenticated
  using (public.is_org_owner(org_id) and user_id <> (select public.kronos_uid()))
  with check (public.is_org_owner(org_id));
-- El dueño saca a otros; cualquiera puede salir de una organización (menos el último dueño, ver trigger).
create policy "members_delete" on public.org_members for delete to authenticated
  using ((public.is_org_owner(org_id) and user_id <> (select public.kronos_uid())) or user_id = (select public.kronos_uid()));
-- Los miembros se agregan con add_member_by_email().

create or replace function public.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (select 1 from public.org_members m
                     where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'La organización debe tener al menos un administrador' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists keep_one_owner on public.org_members;
create trigger keep_one_owner before update or delete on public.org_members
  for each row execute function public.keep_one_owner();

drop policy if exists "plants_select" on public.plants;
drop policy if exists "plants_insert" on public.plants;
drop policy if exists "plants_update" on public.plants;
drop policy if exists "plants_delete" on public.plants;
create policy "plants_select" on public.plants for select to authenticated using (public.is_org_member(org_id));
create policy "plants_insert" on public.plants for insert to authenticated with check (public.can_edit_org(org_id));
create policy "plants_update" on public.plants for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "plants_delete" on public.plants for delete to authenticated using (public.can_edit_org(org_id));

drop policy if exists "studies_select" on public.studies;
drop policy if exists "studies_insert" on public.studies;
drop policy if exists "studies_update" on public.studies;
drop policy if exists "studies_delete" on public.studies;
create policy "studies_select" on public.studies for select to authenticated using (public.is_org_member(org_id));
create policy "studies_insert" on public.studies for insert to authenticated with check (public.can_edit_org(org_id));
create policy "studies_update" on public.studies for update to authenticated using (public.can_edit_org(org_id)) with check (public.can_edit_org(org_id));
create policy "studies_delete" on public.studies for delete to authenticated using (public.can_edit_org(org_id));

-- ── Funciones de la app ──────────────────────────────────────────────────────
create or replace function public.create_organization(p_name text, p_country text default 'CO')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if public.kronos_uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  insert into public.organizations (name, country, created_by)
    values (btrim(p_name), upper(coalesce(nullif(btrim(p_country), ''), 'CO')), public.kronos_uid())
    returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, public.kronos_uid(), 'owner');
  return v_org;
end $$;

-- La persona invitada debe haber creado su cuenta antes (así no se exponen correos ajenos).
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.org_role default 'editor')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Solo un administrador puede agregar miembros' using errcode = '42501';
  end if;
  v_user := public.kronos_user_id_by_email(p_email);
  if v_user is null then
    raise exception 'No existe una cuenta con ese correo: pídele que se registre primero' using errcode = 'P0002';
  end if;
  insert into public.org_members (org_id, user_id, role) values (p_org, v_user, p_role)
    on conflict (org_id, user_id) do update set role = excluded.role;
end $$;

-- Miembros con su correo, solo para quien pertenece a la organización.
create or replace function public.list_org_members(p_org uuid)
returns table (user_id uuid, email text, role public.org_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, coalesce(public.kronos_user_email(m.user_id), ''), m.role, m.created_at
  from public.org_members m
  where m.org_id = p_org and public.is_org_member(p_org)
  order by m.created_at
$$;

-- Permisos: solo usuarios autenticados. El rol anónimo se llama "anonymous" en Neon y "anon"
-- en Supabase; se le quita todo acceso en ambos casos.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'anonymous'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.organizations, public.org_members, public.plants, public.studies from %I', r);
      execute format('revoke execute on function public.create_organization(text, text), '
        'public.add_member_by_email(uuid, text, public.org_role), public.list_org_members(uuid) from %I', r);
    end if;
  end loop;
end $$;
revoke execute on function public.create_organization(text, text), public.add_member_by_email(uuid, text, public.org_role),
  public.list_org_members(uuid), public.kronos_user_id_by_email(text), public.kronos_user_email(uuid) from public;
grant select, insert, update, delete on public.organizations, public.org_members, public.plants, public.studies to authenticated;
grant execute on function public.create_organization(text, text), public.add_member_by_email(uuid, text, public.org_role),
  public.list_org_members(uuid), public.org_role_of(uuid), public.is_org_member(uuid), public.can_edit_org(uuid),
  public.is_org_owner(uuid), public.kronos_uid() to authenticated;
