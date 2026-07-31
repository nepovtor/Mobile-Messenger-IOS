#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPOSITORY_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"
LOG_DIRECTORY="${REPOSITORY_ROOT}/server/logs"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
CONFIRMATION="${1:-}"
ARCHIVE_PATH="${2:-}"

if [[ ! "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  printf 'RETENTION_DAYS must be a positive integer.\n' >&2
  exit 1
fi

if [[ ! -d "${LOG_DIRECTORY}" || -L "${LOG_DIRECTORY}" ]]; then
  printf 'Expected a real log directory at %s\n' "${LOG_DIRECTORY}" >&2
  exit 1
fi

if [[ -z "${ARCHIVE_PATH}" ]]; then
  printf 'Usage: RETENTION_DAYS=30 %s --confirm /absolute/path/log-backup.tar.gz\n' "$0" >&2
  exit 1
fi

case "${ARCHIVE_PATH}" in
  /*) ;;
  *)
    printf 'Archive path must be absolute.\n' >&2
    exit 1
    ;;
esac

if [[ "${ARCHIVE_PATH}" == "${LOG_DIRECTORY}"/* ]]; then
  printf 'Archive must be stored outside the source log directory.\n' >&2
  exit 1
fi

if [[ -e "${ARCHIVE_PATH}" ]]; then
  printf 'Refusing to overwrite existing archive: %s\n' "${ARCHIVE_PATH}" >&2
  exit 1
fi

printf 'Files eligible for removal after backup:\n'
find "${LOG_DIRECTORY}" -xdev -type f -mtime "+${RETENTION_DAYS}" -print

if [[ "${CONFIRMATION}" != "--confirm" ]]; then
  printf 'Dry run only. Pass --confirm and an absolute archive path to continue.\n'
  exit 0
fi

umask 077
tar --create --gzip --file "${ARCHIVE_PATH}" --directory "${LOG_DIRECTORY}" .

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${ARCHIVE_PATH}" >"${ARCHIVE_PATH}.sha256"
else
  shasum -a 256 "${ARCHIVE_PATH}" >"${ARCHIVE_PATH}.sha256"
fi

tar --list --gzip --file "${ARCHIVE_PATH}" >/dev/null
find "${LOG_DIRECTORY}" -xdev -type f -mtime "+${RETENTION_DAYS}" -delete

printf 'Archived logs to %s and removed only files older than %s days.\n' \
  "${ARCHIVE_PATH}" "${RETENTION_DAYS}"
