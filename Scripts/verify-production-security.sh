#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

cd "${REPOSITORY_ROOT}"

fail() {
  printf 'security verification failed: %s\n' "$1" >&2
  exit 1
}

tracked_production_files=(
  "server/docker-compose.yml"
  "server/production.env.example"
)

for required_file in "${tracked_production_files[@]}"; do
  [[ -f "${required_file}" ]] || fail "missing ${required_file}"
done

if git ls-files --error-unmatch server/.env.production >/dev/null 2>&1; then
  fail "server/.env.production must never be tracked"
fi

if git grep -n -I -E \
  '(minioadmin|admin@example\.com|POSTGRES_PASSWORD:[[:space:]]*\$\{[^}]*:-|PGADMIN_DEFAULT_PASSWORD:[[:space:]]*\$\{[^}]*:-)' \
  -- "${tracked_production_files[@]}"; then
  fail "production configuration contains a default credential or fallback"
fi

if git grep -n -I -E 'ADMIN_(LOGIN|PASSWORD)' \
  -- "${tracked_production_files[@]}"; then
  fail "administrator credentials must be provisioned through the CLI, not env"
fi

if rg -q '^[[:space:]]+(postgres|pgadmin|minio):[[:space:]]*$' \
  server/docker-compose.yml; then
  fail "production Compose must use managed Postgres/S3 and must not expose admin infrastructure"
fi

rg -q '127\.0\.0\.1:\$\{PORT' server/docker-compose.yml ||
  fail "backend port must bind to loopback for the host reverse proxy"
rg -q 'read_only:[[:space:]]+true' server/docker-compose.yml ||
  fail "production backend filesystem must be read-only"
rg -q 'no-new-privileges:true' server/docker-compose.yml ||
  fail "production backend must set no-new-privileges"

required_production_variables=(
  DATABASE_URL
  JWT_ACCESS_CURRENT_KEY_ID
  JWT_ACCESS_CURRENT_SECRET
  JWT_ACCESS_PREVIOUS_KEY_ID
  JWT_ACCESS_PREVIOUS_SECRET
  JWT_ISSUER
  JWT_AUDIENCE
  JWT_ACCESS_EXPIRES_IN
  JWT_REFRESH_EXPIRES_IN
  OTP_PEPPER
  REFRESH_TOKEN_PEPPER
  LOG_IP_HASH_KEY
  CORS_ORIGINS
  WS_ORIGINS
  S3_ENDPOINT
  S3_ACCESS_KEY
  S3_SECRET_KEY
  S3_BUCKET
  S3_REGION
  S3_TLS_ENABLED
  E2EE_ENABLED
  E2EE_REQUIRED
)

for variable_name in "${required_production_variables[@]}"; do
  if ! rg -q "^${variable_name}=" server/production.env.example; then
    fail "${variable_name} is absent from server/production.env.example"
  fi
done

rg -q '^E2EE_REQUIRED=true$' server/production.env.example ||
  fail "production must reject plaintext messages"
rg -q '^DB_SYNCHRONIZE=false$' server/production.env.example ||
  fail "production must use migrations"
rg -q '^AUTH_ENABLE_DEMO_ACCOUNTS=false$' server/production.env.example ||
  fail "demo accounts must be disabled"
rg -q '^AUTH_ALLOW_TEST_CODE=false$' server/production.env.example ||
  fail "test OTP codes must be disabled"
rg -q '^COOKIE_SECURE=true$' server/production.env.example ||
  fail "production cookies must be Secure"

if rg -n \
  '(^|[[:space:]])(plaintext|text|preview|fileName|file_name)[!?]?:' \
  server/src/entities/encrypted-message.entity.ts \
  server/src/entities/encrypted-message-envelope.entity.ts \
  server/src/entities/encrypted-attachment.entity.ts; then
  fail "opaque delivery entities contain a plaintext field"
fi

if rg -n -i '\bdecrypt[A-Za-z0-9_]*\b' \
  server/src/entities/encrypted-message.entity.ts \
  server/src/entities/encrypted-message-envelope.entity.ts \
  server/src/modules/devices; then
  fail "backend opaque-delivery code must not contain decryption capability"
fi

rg -q 'GENERIC_ALERT_BODY' server/src/modules/push/apns-push.provider.ts ||
  fail "APNs must use a generic notification body"
rg -q 'message.available' server/src/modules/push/push.service.ts ||
  fail "push delivery must announce availability without plaintext"

printf 'Production security invariants verified.\n'
