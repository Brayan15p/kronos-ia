-- © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA.
-- Pruebas de permisos (RLS) de organizaciones, plantas y estudios. Se ejecutan con scripts/test-db.sh.

-- helpers: actuar como un usuario
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, true); execute 'set local role authenticated'; end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FALLO: %', msg; end if; raise notice 'ok: %', msg; end $$;
create table public._ids (k text primary key, v uuid);  -- guarda ids entre transacciones
grant all on public._ids to authenticated;

-- 1. La dueña crea organización, planta y estudio
begin; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into public._ids values ('org', public.create_organization('Confecciones Andina', 'co'));
with x as (insert into public.plants(org_id, name, city) select v, 'Planta Bogotá', 'Bogotá' from public._ids where k='org' returning id)
  insert into public._ids select 'plant', id from x;
with x as (insert into public.studies(org_id, plant_id, name, station, data, cycle_count)
  select (select v from public._ids where k='org'), (select v from public._ids where k='plant'), 'Camiseta básica', 'Línea 1', '{"format":"kronos-study"}', 12 returning id)
  insert into public._ids select 'study', id from x;
select pg_temp.check((select country from public.organizations) = 'CO', 'país normalizado a mayúsculas');
select pg_temp.check((select version from public.studies) = 1, 'estudio nuevo en versión 1');
select public.add_member_by_email((select v from public._ids where k='org'), 'EDITOR@planta.co', 'editor');
select public.add_member_by_email((select v from public._ids where k='org'), 'lector@planta.co', 'viewer');
select pg_temp.check((select count(*) from public.list_org_members((select v from public._ids where k='org'))) = 3, 'tres miembros con correo');
commit;

-- 2. Editor: ve y edita; la versión sube sola; no puede administrar miembros
begin; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.studies) = 1, 'editor ve el estudio');
update public.studies set data = '{"v":2}', version = 999 where version = 1;
select pg_temp.check((select version from public.studies) = 2, 'versión la pone la base de datos (2, no 999)');
select pg_temp.check((select updated_by from public.studies) = '22222222-2222-2222-2222-222222222222', 'updated_by = editor');
-- concurrencia optimista: actualizar con versión vieja no toca filas
with u as (update public.studies set name = 'pisado' where version = 1 returning 1) select pg_temp.check((select count(*) from u) = 0, 'versión vieja → conflicto (0 filas)');
commit;
begin; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin perform public.add_member_by_email((select v from public._ids where k='org'), 'ajeno@otra.co', 'owner'); raise exception 'FALLO: editor agregó miembro'; exception when insufficient_privilege then raise notice 'ok: editor no puede agregar miembros'; end $$;
commit;

-- 3. Lector: ve pero no escribe
begin; select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from public.studies) = 1, 'lector ve el estudio');
with u as (update public.studies set name = 'x' returning 1) select pg_temp.check((select count(*) from u) = 0, 'lector no puede editar');
do $$ begin insert into public.plants(org_id, name) values ((select v from public._ids where k='org'), 'x'); raise exception 'FALLO: lector creó planta'; exception when insufficient_privilege then raise notice 'ok: lector no crea plantas'; end $$;
commit;

-- 4. Ajeno: no ve nada, no puede crear en organización ajena ni insertar organizaciones directo
begin; select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) from public.organizations) = 0 and (select count(*) from public.studies) = 0 and (select count(*) from public.plants) = 0, 'ajeno no ve nada');
select pg_temp.check((select count(*) from public.list_org_members((select v from public._ids where k='org'))) = 0, 'ajeno no ve correos de miembros');
do $$ begin insert into public.studies(org_id, name, data) values ((select v from public._ids where k='org'), 'intruso', '{}'); raise exception 'FALLO: ajeno insertó estudio'; exception when insufficient_privilege then raise notice 'ok: ajeno no inserta estudios'; end $$;
do $$ begin insert into public.organizations(name) values ('directa'); raise exception 'FALLO: insert directo de organización'; exception when insufficient_privilege then raise notice 'ok: sin insert directo de organizaciones'; end $$;
-- su propia organización: planta ajena no se puede usar en su estudio
insert into public._ids values ('org2', public.create_organization('Otra SAS'));
do $$ begin insert into public.studies(org_id, plant_id, name, data) values ((select v from public._ids where k='org2'), (select v from public._ids where k='plant'), 'cruzado', '{}'); raise exception 'FALLO: planta de otra organización'; exception when foreign_key_violation then raise notice 'ok: planta de otra organización rechazada'; end $$;
commit;

-- 5. Último administrador no puede salir; puede borrar la organización completa
begin; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin delete from public.org_members where user_id = '11111111-1111-1111-1111-111111111111'; raise exception 'FALLO: salió el último dueño'; exception when raise_exception then raise notice 'ok: el último administrador no puede salir'; end $$;
commit;
begin; select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
delete from public.org_members where user_id = '33333333-3333-3333-3333-333333333333';
select pg_temp.check((select count(*) from public.studies) = 0, 'lector salió y ya no ve estudios');
commit;
begin; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
delete from public.organizations where id = (select v from public._ids where k='org');
select pg_temp.check((select count(*) from public.studies) = 0, 'borrar organización borra sus estudios');
commit;

-- 6. Anónimo sin acceso
set role :anon_role;
do $$ begin perform count(*) from public.studies; raise exception 'FALLO: anon leyó estudios'; exception when insufficient_privilege then raise notice 'ok: anónimo sin acceso'; end $$;
do $$ begin perform public.create_organization('anon'); raise exception 'FALLO: anon creó org'; exception when insufficient_privilege then raise notice 'ok: anónimo no crea organizaciones'; end $$;
reset role;
