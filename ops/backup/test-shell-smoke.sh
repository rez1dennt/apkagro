#!/bin/bash
set -euo pipefail
common=${1:-$(dirname "$0")/common.sh}
common=$(realpath "$common")
# A fresh process must not inherit RUN and mask readonly assignment-order bugs.
env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /bin/bash -c '
 source "$1"
 [[ $RUN == /run/apkagro-backup ]]
 [[ $RESTART == /run/apkagro-backup/restart-required ]]
 [[ $METADATA == /var/backups/apkagro/metadata ]]
' _ "$common"
printf 'Fresh-shell backup initialization passed.\n'
