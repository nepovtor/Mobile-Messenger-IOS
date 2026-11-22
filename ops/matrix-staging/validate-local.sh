#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MATRIX_CONFIG_TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mm-staging-config.XXXXXX")"
trap 'rm -rf "$MATRIX_CONFIG_TEST_DIR"' EXIT
python3 "$ROOT/ops/matrix-staging/generate.py" --output "$MATRIX_CONFIG_TEST_DIR/config"
docker compose -f "$MATRIX_CONFIG_TEST_DIR/config/compose.json" config --quiet
mas='ghcr.io/element-hq/matrix-authentication-service@sha256:e089f1048a1d4a9a492ed17b9fe759100f1bd619407b001f5927928d88b780c4'
docker run --rm --mount "type=bind,src=$MATRIX_CONFIG_TEST_DIR/config/mas,dst=/secrets,readonly" "$mas" config -c /secrets/config.json check
synapse='ghcr.io/element-hq/synapse@sha256:6b84a7bbac36f080b2d2e51e0289cf1b08b349598ea44a558df38d558f2c2311'
docker run --rm --entrypoint python --tmpfs /data --mount "type=bind,src=$MATRIX_CONFIG_TEST_DIR/config/synapse,dst=/secrets,readonly" "$synapse" -c 'from synapse.config.homeserver import HomeServerConfig; from signedjson.key import generate_signing_key, write_signing_keys; write_signing_keys(open("/data/staging.signing.key", "w"), [generate_signing_key("staging")]); HomeServerConfig.load_config("Staging config check", ["--config-path", "/secrets/config.json"]); print("Synapse configuration accepted")'
# A temporary self-signed certificate checks only Nginx syntax. It is never
# deployed, trusted by a client or represented as a Lets Encrypt certificate.
mkdir -p "$MATRIX_CONFIG_TEST_DIR/certs"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=local-config-test.invalid' -keyout "$MATRIX_CONFIG_TEST_DIR/certs/privkey.pem" -out "$MATRIX_CONFIG_TEST_DIR/certs/fullchain.pem" >/dev/null 2>&1
# The isolated validation container has no host Docker-gateway address. Use
# loopback for that one listen directive; all security/routing directives remain
# identical. The target host must separately pass nginx -t on the original file.
sed 's/listen 172.30.245.1:18443 ssl;/# host staging gateway listener/' "$MATRIX_CONFIG_TEST_DIR/config/nginx-tls.conf" > "$MATRIX_CONFIG_TEST_DIR/config/nginx-validation.conf"
docker run --rm --mount "type=bind,src=$MATRIX_CONFIG_TEST_DIR/config/nginx-validation.conf,dst=/etc/nginx/conf.d/default.conf,readonly" --mount "type=bind,src=$MATRIX_CONFIG_TEST_DIR/certs,dst=/etc/letsencrypt/live/mm-matrix-isolated-staging,readonly" nginx@sha256:9bf97bd7714f5e24c1ccd545ecb9eb5435cb6d109c97cebb15e7e455e0239edb nginx -t
echo 'Compose, MAS, Synapse and Nginx accepted the generated staging configuration.'
