#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OIDC_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mm-oidc-test.XXXXXX")"
OIDC_TEST_CONTAINER="mm-oidc-test-$$"
cleanup() {
  docker rm -f "$OIDC_TEST_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$OIDC_TEST_DIR"
}
trap cleanup EXIT
export OIDC_TEST_DIR
python3 <<'PY'
import os, secrets
from pathlib import Path
p = Path(os.environ['OIDC_TEST_DIR']) / 'pg.pass'
p.write_text(secrets.token_urlsafe(32))
p.chmod(0o600)
PY
docker run -d --rm --name "$OIDC_TEST_CONTAINER" \
  --mount "type=bind,src=$OIDC_TEST_DIR,dst=/secrets,readonly" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD_FILE=/secrets/pg.pass -e POSTGRES_DB=messenger \
  -p 127.0.0.1::5432 \
  postgres@sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229 >/dev/null
OIDC_TEST_PORT="$(docker port "$OIDC_TEST_CONTAINER" 5432/tcp | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p')"
export OIDC_TEST_PORT
for attempt in {1..60}; do
  if docker exec "$OIDC_TEST_CONTAINER" pg_isready -U postgres -d messenger >/dev/null 2>&1; then break; fi
  sleep 0.5
done
OIDC_TEST_DATABASE_URL="$(python3 <<'PY'
import os
from pathlib import Path
password = (Path(os.environ['OIDC_TEST_DIR']) / 'pg.pass').read_text()
print(f"postgresql://postgres:{password}@127.0.0.1:{os.environ['OIDC_TEST_PORT']}/messenger")
PY
)"
export OIDC_TEST_DATABASE_URL
cd "$ROOT/server"
npm run build
DATABASE_URL="$OIDC_TEST_DATABASE_URL" DB_SYNCHRONIZE=false npm run migration:run:dist >/dev/null
cd "$ROOT/oidc-bridge"
npm run check
npm test
npm run test:integration
