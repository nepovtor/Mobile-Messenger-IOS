#!/usr/bin/env python3
"""Generate an isolated staging stack. Never reads production .env or data."""
import argparse
import json
import os
import re
import secrets
import subprocess
from pathlib import Path

IP = '164.92.182.43'
DOMAINS = {service: f'{service}-staging.164-92-182-43.sslip.io' for service in ('matrix', 'mas', 'oidc')}
PROVIDER = '01K6Y0TP000000000000000001'
WEB_CLIENT = '01K6Y0TP000000000000000002'
ADMIN_CLIENT = '01K6Y0TP000000000000000003'
PG_IMAGE = 'postgres@sha256:16bc17c64a573ef34162af9298258d1aec548232985b33ed7b1eac33ba35c229'
MAS_IMAGE = 'ghcr.io/element-hq/matrix-authentication-service@sha256:e089f1048a1d4a9a492ed17b9fe759100f1bd619407b001f5927928d88b780c4'
SYNAPSE_IMAGE = 'ghcr.io/element-hq/synapse@sha256:6b84a7bbac36f080b2d2e51e0289cf1b08b349598ea44a558df38d558f2c2311'

def generate(destination: Path, repository: Path):
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', str(destination)):
        raise ValueError('Use an absolute ASCII path without spaces or shell characters')
    if destination.resolve().is_relative_to(repository.resolve()):
        raise ValueError('Staging credentials must be generated outside the repository')
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    def write(name, content):
        path = destination / name
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not isinstance(content, str):
            content = json.dumps(content, indent=2) + '\n'
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
    def env(name, values):
        write(name, '\n'.join(f'{key}={value}' for key, value in values.items()) + '\n')
    random = lambda: secrets.token_urlsafe(32)
    passwords = {role: random() for role in ('postgres', 'messenger', 'synapse', 'mas', 'oidc')}
    shared, upstream, admin, matrix = (random() for _ in range(4))
    key = subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072'], check=True, capture_output=True).stdout.decode()
    # The bridge requires a JWK. Generate it with its pinned Node dependency,
    # with the private PEM on stdin; neither arguments nor stdout contain it.
    jwk = subprocess.run(['node', '--input-type=module', '-e', "import {createPrivateKey} from 'node:crypto'; let s=''; for await (const c of process.stdin) s+=c; process.stdout.write(JSON.stringify({keys:[{...createPrivateKey(s).export({format:'jwk'}),kid:'staging-initial',alg:'RS256',use:'sig'}]}));"], input=key, text=True, capture_output=True, check=True).stdout
    write('postgres/password', passwords['postgres'])
    init = []
    for role in ('messenger', 'synapse', 'mas', 'oidc'):
        init.append(f"CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '{passwords[role]}'; CREATE DATABASE {role} OWNER {role} TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'; REVOKE CONNECT ON DATABASE {role} FROM PUBLIC; GRANT CONNECT ON DATABASE {role} TO {role};")
    write('postgres/initialize.sql', '\n'.join(init) + '\n')
    write('backend/admin.secret', admin)
    env('backend/runtime.env', {
        'NODE_ENV': 'production', 'PORT': 8080, 'DATABASE_URL': f"postgresql://messenger:{passwords['messenger']}@postgres:5432/messenger",
        'DB_SYNCHRONIZE': 'false', 'JWT_ACCESS_CURRENT_KEY_ID': 'staging-initial', 'JWT_ACCESS_PREVIOUS_KEY_ID': 'staging-previous',
        'JWT_ACCESS_CURRENT_SECRET': random(), 'JWT_ACCESS_PREVIOUS_SECRET': random(), 'OTP_PEPPER': random(), 'REFRESH_TOKEN_PEPPER': random(), 'LOG_IP_HASH_KEY': random(),
        'JWT_ISSUER': 'mobile-messenger-isolated-staging', 'JWT_AUDIENCE': 'mobile-messenger-isolated-staging', 'JWT_ACCESS_EXPIRES_IN': '10m', 'JWT_REFRESH_EXPIRES_IN': '1d',
        'COOKIE_SECURE': 'true', 'COOKIE_SAME_SITE': 'strict', 'CORS_ORIGINS': 'https://' + DOMAINS['matrix'], 'WS_ORIGINS': 'https://' + DOMAINS['matrix'], 'WEB_APP_URL': 'https://' + DOMAINS['matrix'],
        'E2EE_ENABLED': 'true', 'E2EE_REQUIRED': 'true', 'LEGACY_MESSAGES_READ_ENABLED': 'true', 'AUTH_ENABLE_DEMO_ACCOUNTS': 'false', 'AUTH_ALLOW_TEST_CODE': 'false', 'CHAT_ENABLE_DEMO_SEEDING': 'false', 'PASSWORD_LOGIN_ENABLED': 'false',
        # OTP is intentionally unavailable until an isolated sandbox provider is supplied.
        'VERIFICATION_PROVIDER': 'sms', 'SMS_PROVIDER': 'twilio',
        'OIDC_BRIDGE_ENABLED': 'true', 'OIDC_BRIDGE_SHARED_SECRET': shared,
        'MATRIX_ENABLED': 'true', 'MATRIX_HOMESERVER_URL': 'https://' + DOMAINS['matrix'], 'MATRIX_SERVER_NAME': DOMAINS['matrix'], 'MATRIX_ISSUER_URL': 'https://' + DOMAINS['mas'],
        'MATRIX_WEB_CLIENT_ID': WEB_CLIENT, 'MATRIX_MAS_CLIENT_ID': ADMIN_CLIENT, 'MATRIX_MAS_ADMIN_URL': 'https://' + DOMAINS['mas'] + ':18443', 'MATRIX_MAS_CLIENT_SECRET_FILE': '/secrets/admin.secret',
        # Legacy media has no backing storage in this synthetic staging. Nginx
        # does not publish its API. Encrypted media belongs to Synapse instead.
        'S3_ENDPOINT': 'https://' + DOMAINS['matrix'] + '/disabled-legacy-media', 'S3_TLS_ENABLED': 'true', 'S3_ACCESS_KEY': random(), 'S3_SECRET_KEY': random(), 'S3_BUCKET': 'disabled-legacy-media-staging', 'S3_REGION': 'isolated-staging',
    })
    for name, value in [('client.secret', upstream), ('bridge.secret', shared), ('storage.secret', random()), ('cookies.json', [random()]), ('jwks.json', jwk), ('database', f"postgresql://oidc:{passwords['oidc']}@postgres:5432/oidc")]:
        write('oidc/' + name, value)
    env('oidc/runtime.env', {
        'NODE_ENV': 'production', 'OIDC_ISSUER': 'https://' + DOMAINS['oidc'], 'OIDC_BIND_HOST': '0.0.0.0', 'OIDC_PORT': 3000,
        'OIDC_CLIENT_ID': 'mobile-messenger-mas', 'OIDC_REDIRECT_URI': 'https://' + DOMAINS['mas'] + '/upstream/callback/' + PROVIDER,
        'OIDC_BACKEND_URL': 'http://backend:8080/api', 'OIDC_TRUSTED_PROXY_IP': '172.30.245.1',
        **{f'{name}_FILE': '/secrets/' + filename for name, filename in [('OIDC_CLIENT_SECRET', 'client.secret'), ('OIDC_BRIDGE_SHARED_SECRET', 'bridge.secret'), ('OIDC_STORAGE_KEY', 'storage.secret'), ('OIDC_COOKIE_KEYS', 'cookies.json'), ('OIDC_JWKS', 'jwks.json'), ('OIDC_DATABASE_URL', 'database')]},
    })
    # Bridge backend traffic uses a dedicated Docker network, not the internet.
    # Production URL validation remains HTTPS-only; a private TLS relay is
    # configured below rather than weakening its endpoint checks.
    oidc_env = (destination/'oidc/runtime.env').read_text().replace('http://backend:8080/api', 'https://' + DOMAINS['matrix'] + '/internal-oidc/api')
    (destination/'oidc/runtime.env').write_text(oidc_env)
    write('mas/config.json', {
        'http': {'public_base': 'https://' + DOMAINS['mas'], 'issuer': 'https://' + DOMAINS['mas'], 'trusted_proxies': ['172.30.245.1/32'], 'listeners': [
            {'name': 'web', 'resources': [{'name': name} for name in ('discovery', 'human', 'oauth', 'compat', 'health', 'assets')], 'binds': [{'address': '0.0.0.0:8080'}]},
            {'name': 'internal', 'resources': [{'name': 'adminapi'}], 'binds': [{'address': '0.0.0.0:8081'}]},
        ]},
        'database': {'uri': f"postgresql://mas:{passwords['mas']}@postgres:5432/mas"},
        'matrix': {'homeserver': DOMAINS['matrix'], 'endpoint': 'http://synapse:8008', 'secret': matrix},
        'secrets': {'encryption': secrets.token_hex(32), 'keys': [{'key': subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:3072'], check=True, capture_output=True).stdout.decode()}]}, 'passwords': {'enabled': False},
        'policy': {'data': {'admin_clients': [ADMIN_CLIENT]}},
        'clients': [{'client_id': WEB_CLIENT, 'client_auth_method': 'none', 'redirect_uris': ['https://' + DOMAINS['matrix'] + '/e2ee/callback']}, {'client_id': ADMIN_CLIENT, 'client_auth_method': 'client_secret_basic', 'client_secret': admin}],
        'upstream_oauth2': {'providers': [{'id': PROVIDER, 'issuer': 'https://' + DOMAINS['oidc'], 'client_id': 'mobile-messenger-mas', 'client_secret': upstream, 'token_endpoint_auth_method': 'client_secret_basic', 'scope': 'openid profile', 'pkce_method': 'always', 'fetch_userinfo': True, 'additional_authorization_parameters': {'prompt': 'login'}, 'claims_imports': {'skip_confirmation': True, 'localpart': {'action': 'require', 'template': '{{ user.preferred_username }}', 'on_conflict': 'fail'}, 'displayname': {'action': 'require', 'template': '{{ user.preferred_username }}'}, 'email': {'action': 'ignore'}}}]},
    })
    write('synapse/config.json', {
        'server_name': DOMAINS['matrix'], 'public_baseurl': 'https://' + DOMAINS['matrix'] + '/', 'pid_file': '/tmp/synapse.pid', 'report_stats': False, 'enable_registration': False,
        'federation_domain_whitelist': [], 'trusted_key_servers': [], 'listeners': [{'port': 8008, 'type': 'http', 'tls': False, 'x_forwarded': True, 'bind_addresses': ['0.0.0.0'], 'resources': [{'names': ['client'], 'compress': False}]}],
        'database': {'name': 'psycopg2', 'args': {'user': 'synapse', 'password': passwords['synapse'], 'database': 'synapse', 'host': 'postgres', 'port': 5432, 'cp_min': 1, 'cp_max': 5}},
        'signing_key_path': '/data/staging.signing.key', 'media_store_path': '/data/media', 'macaroon_secret_key': random(), 'form_secret': random(),
        'matrix_authentication_service': {'enabled': True, 'endpoint': 'http://mas:8080/', 'secret': matrix}, 'max_upload_size': '25M',
    })
    hosts = [domain + ':172.30.245.1' for domain in DOMAINS.values()]
    common = {'restart': 'unless-stopped', 'security_opt': ['no-new-privileges:true'], 'cap_drop': ['ALL'], 'logging': {'driver': 'local', 'options': {'max-size': '10m', 'max-file': '3'}}}
    services = {
        'postgres': {'image': PG_IMAGE, 'environment': {'POSTGRES_PASSWORD_FILE': '/secrets/password', 'POSTGRES_INITDB_ARGS': '--locale=C --encoding=UTF8'}, 'volumes': ['./postgres:/secrets:ro', './postgres/initialize.sql:/docker-entrypoint-initdb.d/initialize.sql:ro', 'postgres-data:/var/lib/postgresql/data'], 'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -U postgres'], 'interval': '5s', 'timeout': '3s', 'retries': 20}, 'cap_drop': [], 'shm_size': '256m'},
        'backend': {'build': {'context': str(repository/'server')}, 'env_file': ['./backend/runtime.env'], 'user': '1000:1000', 'ports': ['127.0.0.1:18300:8080'], 'volumes': ['./backend:/secrets:ro'], 'extra_hosts': hosts, 'depends_on': {'postgres': {'condition': 'service_healthy'}}},
        'oidc': {'build': {'context': str(repository/'oidc-bridge')}, 'env_file': ['./oidc/runtime.env'], 'user': '1000:1000', 'ports': ['127.0.0.1:18090:3000'], 'volumes': ['./oidc:/secrets:ro'], 'extra_hosts': hosts, 'depends_on': {'postgres': {'condition': 'service_healthy'}}},
        'mas': {'image': MAS_IMAGE, 'command': ['server', '-c', '/secrets/config.json'], 'user': '1000:1000', 'ports': ['127.0.0.1:18080:8080', '127.0.0.1:18081:8081'], 'volumes': ['./mas:/secrets:ro'], 'extra_hosts': hosts, 'depends_on': {'postgres': {'condition': 'service_healthy'}}},
        'synapse': {'image': SYNAPSE_IMAGE, 'environment': {'SYNAPSE_CONFIG_PATH': '/secrets/config.json', 'UID': '1000', 'GID': '1000'}, 'ports': ['127.0.0.1:18008:8008'], 'volumes': ['./synapse:/secrets:ro', 'synapse-data:/data'], 'depends_on': {'postgres': {'condition': 'service_healthy'}}, 'cap_drop': []},
    }
    for i, (name, spec) in enumerate(services.items(), 11):
        services[name] = {**common, **spec, 'networks': {'staging': {'ipv4_address': f'172.30.245.{i}'}}}
    write('compose.json', {'name': 'mm-matrix-isolated-staging', 'services': services, 'networks': {'staging': {'ipam': {'config': [{'subnet': '172.30.245.0/24', 'gateway': '172.30.245.1'}]}}}, 'volumes': {'postgres-data': {}, 'synapse-data': {}}})
    nginx(destination, write)
    print('Generated isolated staging files. Credentials were not printed.')

def nginx(destination, write):
    acme = '/var/lib/mm-matrix-staging-acme'
    http = f'''server {{
    listen 80;
    server_name {' '.join(DOMAINS.values())};
    access_log off;
    location ^~ /.well-known/acme-challenge/ {{ root {acme}; try_files $uri =404; }}
    location / {{ return 301 https://$host$request_uri; }}
}}
'''
    write('nginx-http.conf', http)
    proxy = '''proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Forwarded "";
        proxy_read_timeout 90s;'''
    servers = []
    for name, port in [('matrix', 18008), ('mas', 18080), ('oidc', 18090)]:
        domain = DOMAINS[name]
        routes = f'location / {{ {proxy} proxy_pass http://127.0.0.1:{port}; }}'
        if name == 'matrix':
            routes = f'''location ~ ^/_matrix/client/[^/]+/(login|logout|refresh)$ {{ {proxy} proxy_pass http://127.0.0.1:18080; }}
    location ^~ /_matrix/federation/ {{ return 404; }}
    location ^~ /_synapse/admin/ {{ return 404; }}
    location ^~ /internal-oidc/api/auth/oidc/ {{ allow 172.30.245.13; deny all; {proxy} proxy_pass http://127.0.0.1:18300/api/auth/oidc/; }}
    location /internal-oidc/ {{ return 404; }}
    location ^~ /api/matrix/ {{ {proxy} proxy_pass http://127.0.0.1:18300; }}
    location /api/ {{ return 404; }}
    {routes}'''
        elif name == 'mas':
            routes = 'location ^~ /api/admin/ { return 404; }\n    ' + routes
        servers.append(f'''server {{
    listen 443 ssl;
    server_name {domain};
    ssl_certificate /etc/letsencrypt/live/mm-matrix-isolated-staging/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mm-matrix-isolated-staging/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log off;
    add_header Referrer-Policy no-referrer always;
    add_header X-Content-Type-Options nosniff always;
    add_header Strict-Transport-Security "max-age=86400" always;
    client_max_body_size 25M;
    allow 127.0.0.1;
    allow {IP};
    allow 172.30.245.0/24;
    # Add individual test IPs here; never enable public user traffic.
    deny all;
    {routes}
}}
''')
    servers.append(f'''server {{
    # This listener exists only on the staging bridge and loopback.
    listen 172.30.245.1:18443 ssl;
    listen 127.0.0.1:18443 ssl;
    server_name {DOMAINS['mas']};
    ssl_certificate /etc/letsencrypt/live/mm-matrix-isolated-staging/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mm-matrix-isolated-staging/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log off;
    allow 172.30.245.12;
    deny all;
    location /api/admin/v1/ {{ {proxy} proxy_pass http://127.0.0.1:18081; }}
    location / {{ return 404; }}
}}
''')
    write('nginx-tls.conf', http + '\n'.join(servers))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    generate(args.output.resolve(), Path(__file__).resolve().parents[2])
