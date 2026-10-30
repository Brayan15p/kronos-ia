-- © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA.
-- Seguridad de datos: reemplaza la política "anon_all" (cualquiera con la clave pública podía
-- leer, modificar y borrar todo) por acceso solo a usuarios autenticados y a sus propios datos.
--
-- Cada fila guarda su dueño en owner_id (se rellena solo con auth.uid() al insertar).
-- Las filas antiguas sin dueño quedan invisibles para la app; un administrador puede
-- asignarlas desde el panel de Supabase con:  update public.<tabla> set owner_id = '<uuid>';
--
-- Siguiente paso previsto: pasar de "dueño = usuario" a "dueño = organización" (planta),
-- con miembros y roles, sin cambiar el contrato de las tablas.

do $$
declare
  t text;
begin
  foreach t in array array[
    'operators','steps_config','cost_config',
    'cycles','defects','quality_checks','sst_readings'
  ] loop
    execute format(
      'alter table public.%I add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I(owner_id)', t || '_owner_id_idx', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('drop policy if exists "owner_select" on public.%I', t);
    execute format('drop policy if exists "owner_insert" on public.%I', t);
    execute format('drop policy if exists "owner_update" on public.%I', t);
    execute format('drop policy if exists "owner_delete" on public.%I', t);

    execute format(
      'create policy "owner_select" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner_insert" on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner_update" on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "owner_delete" on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', t);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
