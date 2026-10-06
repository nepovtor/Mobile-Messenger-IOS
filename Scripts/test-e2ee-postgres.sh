#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
TEST_HOST="${E2EE_TEST_PGHOST:-127.0.0.1}"
TEST_PORT="${E2EE_TEST_PGPORT:-5432}"
TEST_USER="${E2EE_TEST_PGUSER:-$(id -un)}"

if [[ "${TEST_HOST}" != "127.0.0.1" && "${TEST_HOST}" != "localhost" ]]; then
  echo "Refusing non-local PostgreSQL host" >&2
  exit 1
fi
if [[ ! "${TEST_PORT}" =~ ^[0-9]{1,5}$ || ! "${TEST_USER}" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "Invalid test PostgreSQL port or user" >&2
  exit 1
fi
TEST_DATABASE="mm_ci_e2ee_$(date +%s)_$$"
export PGHOST="${TEST_HOST}" PGPORT="${TEST_PORT}" PGUSER="${TEST_USER}"

cleanup() {
  PGDATABASE=postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 \
    --command="DROP DATABASE IF EXISTS \"${TEST_DATABASE}\" WITH (FORCE)" >/dev/null
}
trap cleanup EXIT
PGDATABASE=postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --command="CREATE DATABASE \"${TEST_DATABASE}\"" >/dev/null
export E2EE_TEST_DATABASE_URL="postgresql://${TEST_USER}@${TEST_HOST}:${TEST_PORT}/${TEST_DATABASE}?sslmode=disable"
cd "${ROOT}/server"
npm run build
DATABASE_URL="${E2EE_TEST_DATABASE_URL}" DB_SYNCHRONIZE=false npm run migration:run:dist >/dev/null
node --require ts-node/register --test test/postgres-plaintext-boundary.integration.ts
