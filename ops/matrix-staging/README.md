# Isolated TLS staging (not deployed)

The owner approved these temporary test endpoints on `164.92.182.43`:

- `matrix-staging.164-92-182-43.sslip.io` — Synapse
- `mas-staging.164-92-182-43.sslip.io` — MAS
- `oidc-staging.164-92-182-43.sslip.io` — OTP OIDC bridge

The server name is **temporary and immutable**. Never migrate real users into
this homeserver or reuse its signing keys/volumes for production. Production
requires a new homeserver on an owned domain. No production traffic, databases,
accounts, backups, credentials or existing virtual hosts are used here.

## Current deployment blocker

SSH access to `master_qpbugepnam@164.92.182.43` was verified with the owner's
credentials. Read-only checks found Debian 12, the existing Nginx/root-owned
configuration and active application listeners. Docker/Podman are absent and
`sudo -l` explicitly rejects this account. The prepared stack therefore cannot
be deployed by this account: it requires Docker and administrative control over
new Nginx virtual hosts/certificate renewal. A separate VM with those capabilities
or an administrator-managed installation is needed. No package, virtual host,
production database or service was changed remotely; no certificate was requested.
The supplied credential is never written into the repository or configuration.


## Generated configuration

Run on a Linux host with an unused `172.30.245.0/24` Docker subnet, Docker Compose,
Node.js 22+, OpenSSL, Nginx and Certbot. Use the checked-out repository as the build
source. The output must be outside the repository and must not already exist:

```sh
python3 ops/matrix-staging/generate.py --output /srv/mm-matrix-staging
```

This creates distinct PostgreSQL databases and nonsuperuser owners, isolated
volumes, independent random credentials, separate bridge/MAS RSA signing keys,
strict UUID localpart import, disabled password/registration/demo login,
nonpublic MAS admin API and loopback published ports. The NestJS replica enables
`E2EE_REQUIRED=true` and the durable revocation worker. The public Nginx hosts
allow only loopback, the host and the dedicated staging Docker network by
default. Add individual integration tester IPs explicitly. OIDC/admin API tokens,
callback queries and OTP request paths are excluded from Nginx access logs.
Do not broaden the allowlist to enable user traffic.

File ownership matters on Linux. The generated files are mode 0600 and directories
0700. After reviewing the generated files, assign the service directories:

```sh
sudo chown -R 999:999 /srv/mm-matrix-staging/postgres
sudo chown -R 1000:1000 /srv/mm-matrix-staging/backend /srv/mm-matrix-staging/oidc /srv/mm-matrix-staging/mas /srv/mm-matrix-staging/synapse
```

Verify the pinned PostgreSQL image's `id postgres` before using UID 999. Host
root/deployment access is needed for configuration; do not make secrets readable
to everyone to work around a permission error. Never run `docker compose config`
without `--quiet` in captured logs: rendered env values contain credentials.

The OTP provider is deliberately unavailable until a **sandbox-only** SMS
provider is configured in `backend/runtime.env`. There are no demo accounts or
fixed OTPs. Legacy S3 has no backing storage and its endpoints are not published;
Matrix encrypted attachments use Synapse media. This is a release gate, not a
functional SMS/media deployment claim. The Web callback is registered for future
product integration; no Web/iOS OIDC UI is deployed by this configuration.

## TLS without changing the existing site

1. Inspect DNS and existing listeners/configuration. The three A records must
   resolve to `164.92.182.43`; inspect AAAA records too. Ensure temporary sslip.io
   issuance is permitted and certificate rate limits are not exhausted.
2. Add `nginx-http.conf` as a **new**, uniquely named staging virtual-host file,
   create `/var/lib/mm-matrix-staging-acme`, then run `nginx -t` and reload only
   if the test succeeds. Keep the existing Cloudways application virtual host.
3. Request a named certificate with the webroot plugin. First use Let's Encrypt's
   test environment with `--dry-run`, then issue once without it. Supply the
   operator's actual ACME contact address; no email is assumed by this project:

```sh
sudo certbot certonly --webroot -w /var/lib/mm-matrix-staging-acme \
  --cert-name mm-matrix-isolated-staging \
  -d matrix-staging.164-92-182-43.sslip.io \
  -d mas-staging.164-92-182-43.sslip.io \
  -d oidc-staging.164-92-182-43.sslip.io \
  --dry-run
```

4. Start only the dedicated PostgreSQL service to create its Docker network:

```sh
sudo docker compose -f /srv/mm-matrix-staging/compose.json config --quiet
sudo docker compose -f /srv/mm-matrix-staging/compose.json up -d postgres
sudo docker compose -f /srv/mm-matrix-staging/compose.json build backend oidc
sudo docker compose -f /srv/mm-matrix-staging/compose.json run --rm backend node node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run
sudo docker compose -f /srv/mm-matrix-staging/compose.json run --rm oidc node src/migrate.mjs
```

5. Replace **only the new staging** virtual-host file with `nginx-tls.conf`, test
   with `nginx -t`, then reload. Its private admin listener binds the staging
   gateway `172.30.245.1:18443` and loopback only, and permits the backend's IP
   `172.30.245.12`. The public MAS host rejects `/api/admin/`; Synapse rejects
   admin/federation routes. The bridge reaches only its secret-protected OTP
   boundary via a TLS relay allowed exclusively from `172.30.245.13`.
6. Start `backend oidc mas synapse`. Configure Certbot's deploy hook to run
   `nginx -t && systemctl reload nginx`; check `certbot renew --dry-run` and the
   system's renewal timer. Never stop the production web server for issuance.
7. Run `verify-tls.sh` from an allowlisted test address. Check issuer/JWKS,
   Matrix auth metadata, denied admin/legacy/federation routes, OTP callback,
   encrypted event bodies, revocation, and backup/restore with **synthetic**
   accounts. A full iOS↔Web acceptance test remains required.

The local verification script checks certificate hostname/trust/expiry using
ordinary HTTPS; it never uses `curl -k`, obtains tokens or creates user accounts.
Staging backups must be encrypted separately; a restore must replay pending
revocations before admitting login. Database snapshots must not silently revive
finished sessions or consumed OIDC grants.

## Validation

```sh
python3 -m unittest discover -s ops/matrix-staging -p 'test_*.py'
Scripts/test-matrix-lifecycle.sh
node oidc-bridge/scripts/matrix-stack-smoke.mjs
```

`ops/matrix-staging/validate-local.sh` additionally runs Compose validation,
the pinned MAS configuration checker, the pinned Synapse configuration loader and
Nginx syntax checking with a disposable self-signed certificate. Only the host's
private bridge listen address is omitted inside the validation container. This
certificate is not deployed or used for client trust. The original configuration
must still pass the target host's `nginx -t`.

The first command validates isolation, permissions, identity/credential separation,
proxy restrictions and the bridge's real production config validator. The other
commands use disposable databases/services. This is not an independent audit.

References: [Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html),
[MAS 1.26 reverse proxy configuration](https://github.com/element-hq/matrix-authentication-service/blob/v1.26.0/docs/setup/reverse-proxy.md),
[MAS 1.26 admin API](https://github.com/element-hq/matrix-authentication-service/blob/v1.26.0/docs/topics/admin-api.md).
