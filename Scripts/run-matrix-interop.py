#!/usr/bin/env python3
"""Disposable loopback TLS Synapse + official JS/Swift SDK acceptance fixture.
No production configuration, data, accounts or credentials are read.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import ssl
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request


def free_port():
    with socket.socket() as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--simulator')
    parser.add_argument('--web-only', action='store_true')
    parser.add_argument('--diagnostics-dir', type=Path)
    args = parser.parse_args()
    if not args.web_only and not args.simulator:
        parser.error('Specify --simulator or the fixture-only --web-only check')
    repo = Path(__file__).resolve().parents[1]
    children = []
    with tempfile.TemporaryDirectory(prefix='mm-matrix-interop-') as temporary:
        root = Path(temporary)
        os.chmod(root, 0o700)
        certificate = root / 'localhost.pem'
        private_key = root / 'localhost.key'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
                        '-keyout', str(private_key), '-out', str(certificate)], check=True, capture_output=True)
        private_key.chmod(0o600)
        certificate.chmod(0o600)
        # The pinned Swift FFI consumes DER certificate bytes. Node/Python use PEM.
        sdk_certificate = root / 'localhost.der'
        subprocess.run(['openssl', 'x509', '-in', str(certificate), '-outform', 'DER',
                        '-out', str(sdk_certificate)], check=True, capture_output=True)
        sdk_certificate.chmod(0o600)
        port = free_port()
        homeserver = f'https://localhost:{port}'
        secret = secrets.token_urlsafe(32)
        config = {
            'server_name': 'localhost', 'public_baseurl': homeserver + '/', 'report_stats': False,
            'pid_file': str(root / 'synapse.pid'), 'signing_key_path': str(root / 'signing.key'),
            'media_store_path': str(root / 'media'),
            'database': {'name': 'sqlite3', 'args': {'database': str(root / 'synapse.db')}},
            'listeners': [{'port': port, 'type': 'http', 'tls': True, 'bind_addresses': ['127.0.0.1'],
                           'resources': [{'names': ['client'], 'compress': False}]}],
            'tls_certificate_path': str(certificate), 'tls_private_key_path': str(private_key),
            'enable_registration': False, 'registration_shared_secret': secret,
            'macaroon_secret_key': secrets.token_urlsafe(32), 'form_secret': secrets.token_urlsafe(32),
            'federation_domain_whitelist': [], 'trusted_key_servers': [],
            'rc_login': {name: {'per_second': 100, 'burst_count': 100} for name in ['address', 'account', 'failed_attempts']},
            'rc_message': {'per_second': 100, 'burst_count': 200},
            'rc_admin_redaction': {'per_second': 100, 'burst_count': 100},
        }
        config_file = root / 'homeserver.json'
        config_file.write_text(json.dumps(config))
        config_file.chmod(0o600)
        registration_file = root / 'registration.secret'
        registration_file.write_text(secret)
        registration_file.chmod(0o600)
        manifest = root / 'manifest.json'
        state_file = root / 'result.json'
        synapse_log = (root / 'synapse.log').open('w')
        peer_log = (root / 'peer.log').open('w')
        try:
            server = subprocess.Popen([sys.executable, '-m', 'synapse.app.homeserver', '--config-path', str(config_file)],
                                      cwd=root, stdout=synapse_log, stderr=subprocess.STDOUT)
            children.append(server)
            context = ssl.create_default_context(cafile=str(certificate))
            for _ in range(120):
                if server.poll() is not None:
                    raise RuntimeError('Disposable Synapse exited; inspect the local fixture log without uploading credentials')
                try:
                    with urllib.request.urlopen(homeserver + '/_matrix/client/versions', context=context, timeout=1) as response:
                        if response.status == 200:
                            break
                except Exception:
                    time.sleep(0.25)
            else:
                raise RuntimeError('Disposable Synapse startup timed out')
            env = {**os.environ, 'NODE_EXTRA_CA_CERTS': str(certificate), 'MATRIX_INTEROP_HOMESERVER': homeserver,
                   'MATRIX_INTEROP_REGISTRATION_FILE': str(registration_file), 'MATRIX_INTEROP_MANIFEST': str(manifest),
                   'MATRIX_INTEROP_CERTIFICATE': str(sdk_certificate), 'MATRIX_INTEROP_RESULT': str(state_file)}
            peer = subprocess.Popen(['node', 'scripts/matrix-interop-peer.mjs'], cwd=repo / 'web', env=env,
                                    stdout=peer_log, stderr=subprocess.STDOUT)
            children.append(peer)
            for _ in range(300):
                if peer.poll() is not None:
                    raise RuntimeError('JavaScript peer failed during setup')
                if manifest.exists():
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError('JavaScript peer setup timed out')
            if args.web_only:
                subprocess.run(['node', 'scripts/matrix-interop-driver.mjs'], cwd=repo / 'web', env=env, check=True)
            else:
                subprocess.run(['xcodebuild', '-project', 'MobileMessengerIOS.xcodeproj', '-scheme', 'MobileMessengerIOS',
                                '-destination', 'id=' + args.simulator, '-only-testing:MobileMessengerIOSTests/MatrixInteroperabilityTests',
                                'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-',
                                'CODE_SIGN_STYLE=Manual', 'test'], cwd=repo, check=True,
                               env={**env, 'TEST_RUNNER_MATRIX_INTEROP_MANIFEST': str(manifest)})
            if not state_file.exists() or json.loads(state_file.read_text()).get('completed') is not True:
                raise RuntimeError('The SDK driver did not complete the interop assertions; a skipped XCTest is not acceptance')
            print('Official SDK interop acceptance passed (' + ('JS fixture self-check' if args.web_only else 'iOS Simulator ↔ JS') + ').')
        except Exception:
            if args.diagnostics_dir:
                args.diagnostics_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
                for name in ['peer.log', 'synapse.log', 'result.json']:
                    if (root / name).exists():
                        target = args.diagnostics_dir / name
                        shutil.copyfile(root / name, target)
                        target.chmod(0o600)
            # Logs can contain synthetic credentials. Keep them out of CI output.
            # Print only the explicitly scrubbed fixture error, never raw SDK errors.
            if state_file.exists():
                result = json.loads(state_file.read_text())
                if result.get('failureCode'):
                    print('Fixture diagnostic: ' + str(result['failureCode']), file=sys.stderr)
            raise
        finally:
            for child in reversed(children):
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait()
            synapse_log.close()
            peer_log.close()


if __name__ == '__main__':
    main()
