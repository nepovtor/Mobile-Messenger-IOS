import importlib.util
import json
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('staging', Path(__file__).with_name('generate.py'))
staging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(staging)

class StagingConfigurationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='mm-staging-test-')
        cls.output = Path(cls.temporary.name) / 'config'
        cls.repo = Path(__file__).resolve().parents[2]
        staging.generate(cls.output, cls.repo)
    @classmethod
    def tearDownClass(cls): cls.temporary.cleanup()
    def json(self, path): return json.loads((self.output / path).read_text())
    def test_ports_are_loopback_and_data_is_isolated(self):
        config = self.json('compose.json')
        self.assertEqual(config['name'], 'mm-matrix-isolated-staging')
        for service in config['services'].values():
            for port in service.get('ports', []): self.assertTrue(port.startswith('127.0.0.1:'))
        self.assertFalse(any(v.get('external') for v in config['volumes'].values()))
        self.assertNotIn('ports', config['services']['postgres'])
    def test_all_generated_files_are_private(self):
        for file in self.output.rglob('*'):
            if file.is_file(): self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
    def test_identity_registration_and_admin_are_separate(self):
        mas = self.json('mas/config.json')
        self.assertEqual(mas['passwords'], {'enabled': False})
        self.assertEqual(mas['upstream_oauth2']['providers'][0]['claims_imports']['localpart']['on_conflict'], 'fail')
        self.assertNotIn('discovery_mode', mas['upstream_oauth2']['providers'][0])
        self.assertNotEqual(mas['clients'][0]['client_id'], mas['clients'][1]['client_id'])
        self.assertEqual(mas['policy']['data']['admin_clients'], [staging.ADMIN_CLIENT])
        self.assertNotEqual(mas['clients'][1]['client_secret'], mas['upstream_oauth2']['providers'][0]['client_secret'])
    def test_nginx_is_closed_to_user_traffic_and_admin_api(self):
        config = (self.output/'nginx-tls.conf').read_text()
        self.assertIn('deny all;', config)
        self.assertIn('listen 172.30.245.1:18443 ssl;', config)
        self.assertNotIn('listen 18443', config)
        self.assertIn('location ^~ /api/admin/ { return 404; }', config)
        self.assertIn('location ^~ /_synapse/admin/ { return 404; }', config)
        self.assertNotIn('proxy_add_x_forwarded_for', config)
        self.assertIn('proxy_set_header Forwarded "";', config)
        self.assertNotIn('includeSubDomains', config)
    def test_bridge_production_validator_accepts_real_https_config(self):
        env = dict(line.split('=',1) for line in (self.output/'oidc/runtime.env').read_text().splitlines())
        for key,value in env.items():
            if key.endswith('_FILE'): env[key]=str(self.output/'oidc'/Path(value).name)
        script="import {loadConfig} from './oidc-bridge/src/config.mjs'; let s=''; for await(const c of process.stdin)s+=c; loadConfig(JSON.parse(s));"
        subprocess.run(['node','--input-type=module','-e',script],cwd=self.repo,input=json.dumps(env),text=True,check=True,capture_output=True)
    def test_generator_never_overwrites_existing_credentials(self):
        with self.assertRaises(FileExistsError): staging.generate(self.output, self.repo)

if __name__=='__main__': unittest.main()
