-- The application backend owns these tables and connects directly to Postgres.
-- They are intentionally not part of the Supabase Data API surface.
--
-- This migration is safe to apply before or after the TypeORM migrations:
-- tables which do not exist yet are skipped. The matching TypeORM migration
-- also enables RLS when it creates the E2EE tables.

begin;

do $migration$
declare
  backend_table text;
  api_role text;
  backend_tables constant text[] := array[
    'admins',
    'users',
    'phone_verification_codes',
    'telegram_links',
    'telegram_pairing_tokens',
    'chats',
    'chat_participants',
    'chat_read_state',
    'messages',
    'contacts',
    'location_shares',
    'media',
    'push_subscriptions',
    'security_audit_events',
    'auth_sessions',
    'refresh_tokens',
    'contact_requests',
    'location_permissions',
    'user_devices',
    'one_time_prekeys',
    'encrypted_messages',
    'encrypted_message_envelopes',
    'encrypted_attachments'
  ];
begin
  foreach backend_table in array backend_tables loop
    if to_regclass(format('public.%I', backend_table)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I enable row level security',
      backend_table
    );

    foreach api_role in array array['anon', 'authenticated'] loop
      if to_regrole(api_role) is not null then
        execute format(
          'revoke all privileges on table public.%I from %I',
          backend_table,
          api_role
        );
      end if;
    end loop;
  end loop;
end
$migration$;

-- Prevent future objects created by the migration role from being
-- automatically exposed. New Data API access must be reviewed and granted
-- explicitly together with ownership-scoped RLS policies.
alter default privileges in schema public
  revoke all privileges on tables from public;
alter default privileges in schema public
  revoke all privileges on sequences from public;
alter default privileges in schema public
  revoke execute on functions from public;

do $migration$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if to_regrole(api_role) is null then
      continue;
    end if;

    execute format(
      'alter default privileges in schema public revoke all privileges on tables from %I',
      api_role
    );
    execute format(
      'alter default privileges in schema public revoke all privileges on sequences from %I',
      api_role
    );
    execute format(
      'alter default privileges in schema public revoke execute on functions from %I',
      api_role
    );
  end loop;
end
$migration$;

commit;
