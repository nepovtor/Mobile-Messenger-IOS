#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNAPSE_IMAGE="ghcr.io/element-hq/synapse@sha256:6b84a7bbac36f080b2d2e51e0289cf1b08b349598ea44a558df38d558f2c2311"
MATRIX_SMOKE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mm-matrix-smoke.XXXXXX")"
MATRIX_SMOKE_CREDENTIAL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mm-matrix-credentials.XXXXXX")"
MATRIX_SMOKE_CONTAINER="mm-matrix-smoke-$$"

cleanup() {
  docker rm -f "$MATRIX_SMOKE_CONTAINER" >/dev/null 2>&1 || true
  if docker info >/dev/null 2>&1 && docker image inspect "$SYNAPSE_IMAGE" >/dev/null 2>&1; then
    docker run --rm --user 0 \
      --mount "type=bind,src=$MATRIX_SMOKE_DIR,dst=/data" \
      "$SYNAPSE_IMAGE" chown -R "$(id -u):$(id -g)" /data >/dev/null 2>&1 || true
  fi
  rm -rf "$MATRIX_SMOKE_DIR" "$MATRIX_SMOKE_CREDENTIAL_DIR"
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is required for the isolated Matrix smoke test." >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Node.js 22 or newer is required by matrix-js-sdk." >&2
  exit 1
fi

MATRIX_SMOKE_CREDENTIAL_DIR="$MATRIX_SMOKE_CREDENTIAL_DIR" python3 <<'PY'
import os
from pathlib import Path
import secrets

root = Path(os.environ["MATRIX_SMOKE_CREDENTIAL_DIR"])
for username in ("alice", "bob"):
    path = root / f"{username}.pass"
    path.write_text(secrets.token_urlsafe(32))
    path.chmod(0o600)
PY

docker run --rm \
  --mount "type=bind,src=$MATRIX_SMOKE_DIR,dst=/data" \
  -e SYNAPSE_SERVER_NAME=localhost \
  -e SYNAPSE_REPORT_STATS=no \
  "$SYNAPSE_IMAGE" generate >/dev/null

docker run -d --rm \
  --name "$MATRIX_SMOKE_CONTAINER" \
  --mount "type=bind,src=$MATRIX_SMOKE_DIR,dst=/data" \
  --mount "type=bind,src=$MATRIX_SMOKE_CREDENTIAL_DIR,dst=/creds,readonly" \
  -p 127.0.0.1::8008 \
  "$SYNAPSE_IMAGE" >/dev/null

MATRIX_SMOKE_PORT="$(docker port "$MATRIX_SMOKE_CONTAINER" 8008/tcp | sed -n 's/^127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p')"
if [[ -z "$MATRIX_SMOKE_PORT" ]]; then
  echo "Synapse did not bind a loopback port." >&2
  exit 1
fi
export MATRIX_SMOKE_HOMESERVER="http://127.0.0.1:$MATRIX_SMOKE_PORT"

python3 <<'PY'
import os
import time
import urllib.request

url = os.environ["MATRIX_SMOKE_HOMESERVER"] + "/_matrix/client/versions"
for _ in range(60):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            if response.status == 200:
                break
    except Exception:
        time.sleep(0.5)
else:
    raise SystemExit("Isolated Synapse did not become ready")
PY

for username in alice bob; do
  docker exec -u 0 "$MATRIX_SMOKE_CONTAINER" register_new_matrix_user \
    -c /data/homeserver.yaml \
    -u "$username" \
    --password-file "/creds/$username.pass" \
    --no-admin >/dev/null
done

export MATRIX_SMOKE_ALICE_PASSWORD_FILE="$MATRIX_SMOKE_CREDENTIAL_DIR/alice.pass"
export MATRIX_SMOKE_BOB_PASSWORD_FILE="$MATRIX_SMOKE_CREDENTIAL_DIR/bob.pass"
cd "$REPO_ROOT/web"
node scripts/matrix-web-smoke.mjs
