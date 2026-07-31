#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
SERVER_ROOT="${REPOSITORY_ROOT}/server"

MIGRATION_PGHOST="${MIGRATION_PGHOST:-127.0.0.1}"
MIGRATION_PGPORT="${MIGRATION_PGPORT:-5432}"
MIGRATION_PGUSER="${MIGRATION_PGUSER:-postgres}"
MIGRATION_PGPASSWORD="${MIGRATION_PGPASSWORD:-}"
CLEAN_DATABASE="${MIGRATION_CLEAN_DATABASE:-mm_ci_migration_clean}"
LEGACY_DATABASE="${MIGRATION_LEGACY_DATABASE:-mm_ci_migration_legacy}"
RUN_SUPABASE_DB_LINT="${RUN_SUPABASE_DB_LINT:-false}"

for database_name in "${CLEAN_DATABASE}" "${LEGACY_DATABASE}"; do
  if [[ ! "${database_name}" =~ ^mm_ci_migration_[a-z0-9_]+$ ]]; then
    printf 'Refusing unsafe migration test database name: %s\n' "${database_name}" >&2
    exit 1
  fi
done

export PGHOST="${MIGRATION_PGHOST}"
export PGPORT="${MIGRATION_PGPORT}"
export PGUSER="${MIGRATION_PGUSER}"
export PGPASSWORD="${MIGRATION_PGPASSWORD}"

admin_psql() {
  PGDATABASE=postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

database_psql() {
  local database_name="$1"
  shift
  PGDATABASE="${database_name}" psql --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

run_for_database() {
  local database_name="$1"
  shift
  env \
    -u DATABASE_URL \
    PGHOST="${PGHOST}" \
    PGPORT="${PGPORT}" \
    PGUSER="${PGUSER}" \
    PGPASSWORD="${PGPASSWORD}" \
    PGDATABASE="${database_name}" \
    DOTENV_CONFIG_PATH=/dev/null \
    DB_SYNCHRONIZE=false \
    "$@"
}

drop_test_databases() {
  admin_psql --command="drop database if exists \"${CLEAN_DATABASE}\" with (force)" >/dev/null
  admin_psql --command="drop database if exists \"${LEGACY_DATABASE}\" with (force)" >/dev/null
}

restore_held_migrations() {
  if [[ -n "${MIGRATION_HOLD_DIRECTORY:-}" && -d "${MIGRATION_HOLD_DIRECTORY}" ]]; then
    find "${MIGRATION_HOLD_DIRECTORY}" -maxdepth 1 -type f -exec mv {} \
      "${SERVER_ROOT}/dist/database/migrations/" \;
    rmdir "${MIGRATION_HOLD_DIRECTORY}"
  fi
}

cleanup() {
  restore_held_migrations
  drop_test_databases
}

trap cleanup EXIT

command -v psql >/dev/null 2>&1 || {
  printf 'psql is required for migration smoke tests.\n' >&2
  exit 1
}

drop_test_databases
admin_psql --command="create database \"${CLEAN_DATABASE}\"" >/dev/null
admin_psql --command="create database \"${LEGACY_DATABASE}\"" >/dev/null

cd "${SERVER_ROOT}"
npm run build

printf 'Testing clean database migration up/down/up...\n'
run_for_database "${CLEAN_DATABASE}" npm run migration:run:dist
run_for_database "${CLEAN_DATABASE}" npm run migration:revert:dist
run_for_database "${CLEAN_DATABASE}" npm run migration:run:dist

database_psql "${CLEAN_DATABASE}" <<'SQL'
do $assertions$
begin
  if to_regclass('public.encrypted_message_envelopes') is null then
    raise exception 'opaque envelope table is missing after clean migration';
  end if;
  if exists (select 1 from public.admins where login = 'admin') then
    raise exception 'predictable administrator was created';
  end if;
end
$assertions$;
SQL

admin_psql <<'SQL'
do $roles$
begin
  if to_regrole('anon') is null then
    execute 'create role anon nologin';
  end if;
  if to_regrole('authenticated') is null then
    execute 'create role authenticated nologin';
  end if;
end
$roles$;
SQL

database_psql "${CLEAN_DATABASE}" \
  --file="${REPOSITORY_ROOT}/supabase/migrations/20260731082242_backend_owned_public_tables_default_deny.sql"

database_psql "${CLEAN_DATABASE}" <<'SQL'
do $assertions$
declare
  unprotected_tables text;
begin
  select string_agg(quote_ident(c.relname), ', ' order by c.relname)
  into unprotected_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname <> 'migrations'
    and not c.relrowsecurity;

  if unprotected_tables is not null then
    raise exception 'backend tables without RLS: %', unprotected_tables;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'migrations'
      and (
        has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege(
          'authenticated',
          c.oid,
          'SELECT,INSERT,UPDATE,DELETE'
        )
      )
  ) then
    raise exception 'Data API roles retain privileges on backend tables';
  end if;
end
$assertions$;
SQL

if [[ "${RUN_SUPABASE_DB_LINT}" == "true" ]] \
  && command -v supabase >/dev/null 2>&1 \
  && [[ -z "${PGPASSWORD}" ]]; then
  supabase db lint \
    --db-url "postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${CLEAN_DATABASE}?sslmode=disable" \
    --schema public \
    --level warning \
    --fail-on error
else
  printf '%s\n' \
    'Supabase CLI lint skipped. Set RUN_SUPABASE_DB_LINT=true against a Supabase PostgreSQL instance with plpgsql_check installed.'
fi

printf 'Testing migration of an existing legacy database...\n'
MIGRATION_HOLD_DIRECTORY="$(mktemp -d)"
find dist/database/migrations -maxdepth 1 -type f \
  -name '20260731*.js' -exec mv {} "${MIGRATION_HOLD_DIRECTORY}/" \;

run_for_database "${LEGACY_DATABASE}" npm run migration:run:dist

database_psql "${LEGACY_DATABASE}" <<'SQL'
insert into public.users (
  id, method, contact, phone, display_name
) values
  ('10000000-0000-0000-0000-000000000001', 'phone', '+15550000001', '+15550000001', 'Legacy Alice'),
  ('10000000-0000-0000-0000-000000000002', 'phone', '+15550000002', '+15550000002', 'Legacy Bob');

insert into public.chats (
  id, title
) values (
  '20000000-0000-0000-0000-000000000001', 'Legacy direct chat'
);

insert into public.chat_participants (
  id, chat_id, user_id
) values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002'
  );

insert into public.messages (
  id, chat_id, author_id, client_message_id, kind, text, status
) values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'text',
  'legacy migration sentinel',
  'sent'
);

insert into public.contacts (
  id, owner_user_id, contact_user_id
) values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);
SQL

restore_held_migrations
unset MIGRATION_HOLD_DIRECTORY
run_for_database "${LEGACY_DATABASE}" npm run migration:run:dist

database_psql "${LEGACY_DATABASE}" <<'SQL'
do $assertions$
begin
  if not exists (
    select 1
    from public.messages
    where id = '40000000-0000-0000-0000-000000000001'
      and is_legacy
      and text = 'legacy migration sentinel'
  ) then
    raise exception 'legacy message was lost or incorrectly relabelled';
  end if;

  if not exists (
    select 1
    from public.contact_requests
    where pair_key =
      '10000000-0000-0000-0000-000000000001:10000000-0000-0000-0000-000000000002'
      and status = 'accepted'
  ) then
    raise exception 'legacy contact was not migrated';
  end if;

  if to_regclass('public.encrypted_message_envelopes') is null then
    raise exception 'opaque envelope table is missing after legacy migration';
  end if;
end
$assertions$;
SQL

printf 'Migration smoke tests passed.\n'
