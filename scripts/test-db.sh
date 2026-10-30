#!/usr/bin/env bash
# © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md
# Aplica todas las migraciones en un Postgres temporal (con un esquema auth mínimo que imita
# a Supabase) y ejecuta las pruebas de permisos de supabase/tests/. Requiere Postgres 15+.
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

"${PSQL[@]}" <<'SQL'
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'duena@planta.co'),
  ('22222222-2222-2222-2222-222222222222', 'editor@planta.co'),
  ('33333333-3333-3333-3333-333333333333', 'lector@planta.co'),
  ('44444444-4444-4444-4444-444444444444', 'ajeno@otra.co');
SQL

for f in "$ROOT"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -f "$f" 2>&1 | grep -v NOTICE || true
  echo "migración aplicada: $(basename "$f")"
done

status=0
for t in "$ROOT"/supabase/tests/*.test.sql; do
  out="$("${PSQL[@]}" -f "$t" 2>&1)" || status=1
  echo "$out" | sed 's/^psql:[^:]*:[0-9]*: //' | grep -E "ok:|FALLO|ERROR" || true
done
[ $status = 0 ] && echo "Pruebas de base de datos: OK" || echo "Pruebas de base de datos: FALLARON"
exit $status
