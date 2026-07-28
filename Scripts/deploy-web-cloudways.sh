#!/usr/bin/env bash

# Deploy the production web bundle to the Cloudways Messenger directory.
#
# Usage:
#   ./Scripts/deploy-web-cloudways.sh
#
# You can override the connection details without editing this file:
#   DEPLOY_HOST=... DEPLOY_USER=... ./Scripts/deploy-web-cloudways.sh

set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_DIR/web"

DEPLOY_HOST="${DEPLOY_HOST:-164.92.182.43}"
DEPLOY_USER="${DEPLOY_USER:-master_qpbugepnam}"
DEPLOY_TARGET="${DEPLOY_TARGET:-/home/1634854.cloudwaysapps.com/fsvyssbckk/public_html/Mobile-Messenger-IOS/web/dist}"
PUBLIC_URL="${PUBLIC_URL:-https://phpstack-1634854-6489525.cloudwaysapps.com/messenger/}"
REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
# SSH adds a temporary suffix while creating a control socket. macOS's default
# $TMPDIR is deeply nested and can exceed the Unix socket path limit, so use
# the deliberately short /tmp path here.
TMP_DIR="$(mktemp -d /tmp/mmd.XXXXXX)"
SSH_SOCKET="$TMP_DIR/s"
SSH_OPTIONS=(
  -o ControlMaster=auto
  -o ControlPersist=5m
  -o "ControlPath=$SSH_SOCKET"
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)

cleanup() {
  ssh "${SSH_OPTIONS[@]}" -O exit "$REMOTE" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

for command in node npm ssh rsync curl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command is missing: $command" >&2
    exit 1
  }
done

echo "Building the web app..."
cd "$WEB_DIR"
npm ci
npm run build
test -f "$WEB_DIR/dist/index.html"

echo "Connecting to $DEPLOY_HOST..."
# This opens one SSH connection. With password authentication, enter the
# server password once; rsync and scp reuse this same connection.
ssh "${SSH_OPTIONS[@]}" "$REMOTE" \
  "test -d '$DEPLOY_TARGET' && test -w '$DEPLOY_TARGET'"

echo "Uploading assets..."
# Cloudways allows this account to replace files but not to change directory
# timestamps. Do not preserve metadata; only static file contents matter here.
rsync -rz --no-times --omit-dir-times --delete --exclude=index.html \
  -e "ssh ${SSH_OPTIONS[*]}" \
  "$WEB_DIR/dist/" "$REMOTE:$DEPLOY_TARGET/"

# Publish index.html last so it never points at JavaScript files that have not
# been uploaded yet. Use rsync rather than scp: this Cloudways account accepts
# rsync over SSH but restricts SFTP/scp writes in this directory.
rsync -rz --no-times --omit-dir-times \
  -e "ssh ${SSH_OPTIONS[*]}" \
  "$WEB_DIR/dist/index.html" "$REMOTE:$DEPLOY_TARGET/index.html"

echo "Verifying the public page..."
curl -fsSIL --max-time 30 "$PUBLIC_URL" >/dev/null

echo
echo "Deployment complete: $PUBLIC_URL"
