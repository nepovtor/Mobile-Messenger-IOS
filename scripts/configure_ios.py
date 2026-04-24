import os
import sys
from pathlib import Path
from urllib.parse import urlparse

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 scripts/configure_ios.py <xcconfig_path>")

url = os.environ["NEW_URL"].rstrip("/")
parsed = urlparse(url)

if parsed.scheme != "https" or not parsed.netloc:
    raise SystemExit("Expected https tunnel URL")

config_path = Path(sys.argv[1])
config_path.parent.mkdir(parents=True, exist_ok=True)
config_path.write_text(
    "PUBLIC_API_SCHEME = https\n"
    f"PUBLIC_API_HOST = {parsed.netloc}\n"
    "PUBLIC_API_PREFIX = api\n"
    f"PUBLIC_WS_HOST = {parsed.netloc}\n"
)

print(f"Configured iOS debug public endpoint: {url}/api")
