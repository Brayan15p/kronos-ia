#!/usr/bin/env bash
# © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md
# Aplica las migraciones en un Postgres temporal y ejecuta las pruebas de permisos de
# supabase/tests/ dos veces: imitando a Supabase (auth.uid(), auth.users, rol anon) y a Neon
# (auth.user_id(), neon_auth.user, rol anonymous). Requiere Postgres 15+.
#   bash scripts/test-db.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}"
DIR="$(mktemp -d /var/tmp/kronos-pg.XXXX)"
PORT="${PG_PORT:-54329}"
RUN=(); [ "$(id -u)" = 0 ] && { chown postgres "$DIR"; RUN=(su postgres -c); }
run() { if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { run "$BIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "$BIN/initdb -D $DIR/data -A trust -U postgres" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=' -l $DIR/log -w start" >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -c "create role anon; create role anonymous; create role authenticated;"

USERS="('11111111-1111-1111-1111-111111111111', 'duena@planta.co'),
  ('22222222-2222-2222-2222-222222222222', 'editor@planta.co'),
  ('33333333-3333-3333-3333-333333333333', 'lector@planta.co'),
  ('44444444-4444-4444-4444-444444444444', 'ajeno@otra.co')"
CLAIM="nullif(current_setting('request.jwt.claim.sub', true), '')"

status=0
for provider in supabase neon; do
  echo "── $provider ──"
  "${PSQL[@]}" -c "create database kronos_$provider"
  DB=("${PSQL[@]}" -d "kronos_$provider")
  if [ "$provider" = supabase ]; then
    "${DB[@]}" <<SQL
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as \$\$ select ($CLAIM)::uuid \$\$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values $USERS;
SQL
    migrations=("$ROOT"/supabase/migrations/*.sql)
    anon_role=anon
  else
    "${DB[@]}" <<SQL
create schema auth;
create function auth.user_id() returns text language sql stable as \$\$ select $CLAIM \$\$;
create schema neon_auth;
create table neon_auth."user" (id uuid primary key, email text, "createdAt" timestamptz default now());
grant usage on schema auth to anonymous, authenticated;
grant usage on schema public to anonymous, authenticated;
insert into neon_auth."user" (id, email) values $USERS;
SQL
    # En Neon solo hace falta el esquema de organizaciones (las tablas antiguas no se usan).
    migrations=("$ROOT"/supabase/migrations/20261031_organizations.sql)
    anon_role=anonymous
  fi

  # Dos pasadas: aplicar de nuevo una migración no debe fallar (se aplican a mano en Neon).
  for pass in 1 2; do
    for f in "${migrations[@]}"; do
      if ! out="$("${DB[@]}" -f "$f" 2>&1)"; then
        echo "$out" | grep -v NOTICE; echo "FALLO al aplicar $(basename "$f") (pasada $pass)"; exit 1
      fi
      [ $pass = 1 ] && echo "migración aplicada: $(basename "$f")"
    done
  done
  echo "migraciones re-aplicadas sin error"

  for t in "$ROOT"/supabase/tests/*.test.sql; do
    out="$("${DB[@]}" -v anon_role="$anon_role" -f "$t" 2>&1)" || status=1
    echo "$out" | sed 's/^psql:[^:]*:[0-9]*: //' | grep -E "ok:|FALLO|ERROR" || true
  done
done
[ $status = 0 ] && echo "Pruebas de base de datos: OK" || echo "Pruebas de base de datos: FALLARON"
exit $status
