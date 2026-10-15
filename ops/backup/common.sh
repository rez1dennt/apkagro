#!/bin/bash
# Installed root:root 0644 at /usr/local/lib/apkagro-backup/common.sh.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
readonly SERVICE=apkagro.service ROOT=/var/backups/apkagro
readonly STATUS=$ROOT/status.json METADATA=$ROOT/metadata
readonly RUN=/run/apkagro-backup
readonly RESTART=$RUN/restart-required
readonly CONFIG=/etc/apkagro/backup.env

die(){ printf 'apkagro-backup: %s\n' "$1" >&2; exit 1; }
secure_file(){
 [[ -f "$1" && ! -L "$1" ]] || die 'A required protected file is missing or is a symlink.'
 [[ "$(stat -c '%u:%a' "$1")" == '0:600' ]] || die 'Protected files must be root-owned mode 0600.'
}
require_root(){ [[ $EUID == 0 ]] || die 'Run as root.'; }
load_config(){
 require_root
 secure_file "$CONFIG"
 # Only the root-owned configuration is sourced; application site.env is never sourced.
 set -a; source "$CONFIG"; set +a
 : "${RESTIC_REPOSITORY:?Missing repository}" "${RESTIC_PASSWORD_FILE:?Missing password file}"
 secure_file "$RESTIC_PASSWORD_FILE"
 : "${BACKUP_SECONDS:=180}" "${MAINTENANCE_SECONDS:=600}" "${RESTORE_SECONDS:=1800}"
 : "${MIN_FREE_BYTES:=1073741824}" "${BACKUP_HOST:=apkagro-production}"
 for setting in BACKUP_SECONDS MAINTENANCE_SECONDS RESTORE_SECONDS MIN_FREE_BYTES; do
  [[ ${!setting} =~ ^[0-9]+$ ]] && (( ${!setting} > 0 )) || die 'Invalid numeric backup configuration.'
 done
 ((BACKUP_SECONDS<=300&&MAINTENANCE_SECONDS<=900&&RESTORE_SECONDS<=7200)) || die 'Timeout exceeds the supported safety bounds.'
 [[ $BACKUP_HOST =~ ^[A-Za-z0-9._-]+$ ]] || die 'Invalid backup host label.'
 install -d -o root -g root -m 0700 "$ROOT" "$RUN" "$METADATA" /var/cache/apkagro-restic
 export RESTIC_CACHE_DIR=/var/cache/apkagro-restic
}
record_status(){
 # Values are fixed internal identifiers, RFC3339 timestamps, or validated snapshot hex.
 local temporary last=''
 if [[ -f $ROOT/last-success ]]; then read -r last < "$ROOT/last-success" || true; fi
 temporary=$(mktemp "$ROOT/.status.XXXXXXXX")
 printf '{"state":"%s","at":"%s","last_success":"%s"}\n' "$1" "$(date --utc +%FT%TZ)" "$last" > "$temporary"
 chmod 0600 "$temporary"; mv -f -- "$temporary" "$STATUS"
}
recover_service(){
 [[ -f $RESTART ]] || return 0
 printf 'apkagro-backup: restoring the previously active application service.\n' >&2
 timeout --signal=TERM --kill-after=5s 45s systemctl start "$SERVICE" && systemctl is-active --quiet "$SERVICE" || {
  record_status restart-failed
  printf 'apkagro-backup: CRITICAL: service restart failed; restart-required marker retained.\n' >&2
  return 1
 }
 rm -f -- "$RESTART"
}
