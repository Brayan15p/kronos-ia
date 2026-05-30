-- KRONOS.AI — Migración cloud (Supabase)
-- Ejecutar en: https://supabase.com/dashboard/project/xjftxmmyjvzqtxhlpzoa/sql/new

-- ─── Estudio de tiempos ───────────────────────────────────────────────────────

create table if not exists public.operators (
  id         bigserial primary key,
  name       text        not null,
  hourly_cost numeric(12,2) not null default 15000,
  created_at timestamptz not null default now()
);

create table if not exists public.steps_config (
  id         bigserial primary key,
  number     int         not null,
  name       text        not null,
  emoji      text        not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.cost_config (
  id                         bigserial primary key,
  product_value              numeric(14,2) not null default 5000,
  target_cycle_time          numeric(10,2) not null default 120,
  monthly_production_target  int           not null default 1000,
  updated_at                 timestamptz   not null default now()
);

create table if not exists public.cycles (
  id              uuid        primary key default gen_random_uuid(),
  operator_id     bigint      references public.operators(id) on delete set null,
  operator_name   text        not null,
  cycle_number    int         not null,
  duration        numeric(12,3) not null,
  steps           jsonb       not null default '[]',
  quality_pass    boolean     not null default true,
  defects         text[]      not null default '{}',
  notes           text        not null default '',
  recorded_at     timestamptz not null default now()
);

create table if not exists public.defects (
  id          uuid        primary key default gen_random_uuid(),
  cycle_id    uuid        references public.cycles(id) on delete cascade,
  operator_id bigint      references public.operators(id) on delete set null,
  type        text        not null,
  severity    text        not null check (severity in ('leve','moderado','critico')),
  description text        not null default '',
  recorded_at timestamptz not null default now()
);

create table if not exists public.quality_checks (
  id          uuid        primary key default gen_random_uuid(),
  cycle_id    uuid        references public.cycles(id) on delete cascade,
  operator_id bigint      references public.operators(id) on delete set null,
  criteria    jsonb       not null default '[]',
  overall_pass boolean    not null default true,
  recorded_at timestamptz not null default now()
);

-- ─── SST ─────────────────────────────────────────────────────────────────────

create table if not exists public.sst_readings (
  id             uuid        primary key default gen_random_uuid(),
  operator_id    bigint      references public.operators(id) on delete set null,
  operator_name  text        not null,
  zone           text        not null,
  lux            numeric(8,1) not null,
  db             numeric(6,1) not null,
  exposure_hours numeric(5,2) not null default 8,
  notes          text        not null default '',
  recorded_at    timestamptz not null default now()
);

-- ─── Índices para consultas frecuentes ───────────────────────────────────────

create index if not exists cycles_operator_id_idx    on public.cycles(operator_id);
create index if not exists cycles_recorded_at_idx    on public.cycles(recorded_at desc);
create index if not exists defects_cycle_id_idx      on public.defects(cycle_id);
create index if not exists sst_readings_operator_idx on public.sst_readings(operator_id);
create index if not exists sst_readings_zone_idx     on public.sst_readings(zone);

-- ─── Row Level Security — acceso público anon (sin auth, como está hoy la app) ──
-- Si más adelante añades autenticación, reemplaza por políticas de usuario.

alter table public.operators      enable row level security;
alter table public.steps_config   enable row level security;
alter table public.cost_config    enable row level security;
alter table public.cycles         enable row level security;
alter table public.defects        enable row level security;
alter table public.quality_checks enable row level security;
alter table public.sst_readings   enable row level security;

-- Políticas: lectura y escritura para la clave anon (sin login requerido)
do $$
declare
  t text;
begin
  foreach t in array array[
    'operators','steps_config','cost_config',
    'cycles','defects','quality_checks','sst_readings'
  ] loop
    execute format('
      create policy if not exists "anon_all" on public.%I
        for all to anon using (true) with check (true);
    ', t);
  end loop;
end $$;
