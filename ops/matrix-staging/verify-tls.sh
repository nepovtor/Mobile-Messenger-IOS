#!/usr/bin/env bash
set -euo pipefail
matrix='https://matrix-staging.164-92-182-43.sslip.io'
mas='https://mas-staging.164-92-182-43.sslip.io'
oidc='https://oidc-staging.164-92-182-43.sslip.io'
for origin in "$matrix" "$mas" "$oidc"; do
  # Ordinary TLS validation; output contains no cookies or bearer credentials.
  curl --silent --show-error --connect-timeout 8 --max-time 20 --output /dev/null "$origin/"
done
curl --silent --show-error --fail --max-time 20 "$matrix/_matrix/client/versions" | python3 -c 'import json,sys; assert json.load(sys.stdin)["versions"]'
for origin in "$mas" "$oidc"; do
  curl --silent --show-error --fail --max-time 20 "$origin/.well-known/openid-configuration" | python3 -c 'import json,sys; from urllib.parse import urlparse; d=json.load(sys.stdin); assert d["issuer"].rstrip("/")==sys.argv[1]; assert urlparse(d["jwks_uri"]).scheme=="https"; assert "S256" in d["code_challenge_methods_supported"]' "$origin"
done
for url in "$mas/api/admin/v1/users" "$matrix/_synapse/admin/v1/server_version" "$matrix/_matrix/federation/v1/version" "$matrix/api/media/upload-url"; do
  status="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "$url")"
  [[ "$status" == 404 || "$status" == 403 ]] || { echo 'A private route is exposed' >&2; exit 1; }
done
echo 'TLS, issuer, discovery and public route restrictions passed.'
