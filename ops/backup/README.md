# Production backups and recovery

These files support Ubuntu 26, Node.js 22 and restic 0.18.1. The application service is `apkagro.service`, its immutable release is `/opt/apkagro/current -> /opt/apkagro/releases/<commit>`, and its entire mutable state is `/var/lib/apkagro`. Run operational commands as root. No command in this document needs to display a password, application data, QR code, or an environment file.

The daily timer runs at 03:15 UTC with up to 10 minutes of random delay and catches up after a missed run. The restic repository is encrypted and deduplicated. Retention keeps seven daily, four weekly and three monthly snapshots for host `apkagro-production`, tag `apkagro`, grouped by host and tags. Each category keeps periods containing a snapshot; this does not manufacture missing backups or guarantee three months of history on the first day.

**The default repository is on the same VPS. It cannot recover from loss of the VPS, its disk, or an attacker deleting both application and backups. An external scheduled destination has not been supplied.** Keep the separately delivered private recovery package and its password in a different trusted location. Do not claim offsite protection until an independent destination has been configured, tested and monitored.

## Installation

From the reviewed source tree, on the server as root:

```bash
install -d -o root -g root -m 0700 /etc/apkagro /var/backups/apkagro /var/backups/apkagro/metadata /var/cache/apkagro-restic /run/apkagro-backup
install -d -o root -g root -m 0755 /usr/local/lib/apkagro-backup
install -o root -g root -m 0644 ops/backup/common.sh ops/backup/verify-restored.mjs /usr/local/lib/apkagro-backup/
install -o root -g root -m 0750 ops/backup/apkagro-backup ops/backup/apkagro-backup-status ops/backup/apkagro-restore /usr/local/sbin/
install -o root -g root -m 0644 ops/backup/apkagro-backup.service ops/backup/apkagro-backup.timer ops/backup/apkagro-backup-alert.service /etc/systemd/system/
# Install the example ONLY for the first setup; preserve an existing configuration.
test -e /etc/apkagro/backup.env || install -o root -g root -m 0600 ops/backup/backup.env.example /etc/apkagro/backup.env
umask 077
# NEVER regenerate this password for an existing repository.
test -e /etc/apkagro/restic-password || openssl rand -base64 48 > /etc/apkagro/restic-password
chown root:root /etc/apkagro/backup.env /etc/apkagro/restic-password /etc/apkagro/site.env
chmod 0600 /etc/apkagro/backup.env /etc/apkagro/restic-password /etc/apkagro/site.env
set -a
source /etc/apkagro/backup.env
set +a
# Run init only when setting up a NEW repository, never to fix a failed existing one.
restic init
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/apkagro-backup.service /etc/systemd/system/apkagro-backup.timer /etc/systemd/system/apkagro-backup-alert.service
```

The password file must contain a strong restic repository password, not `APP_DATA_KEY`. The latter is a separate AES key in `/etc/apkagro/site.env` and is included inside the encrypted snapshot. A copied restic repository is unusable without its repository password; keep a separate private copy of that password. The operational configuration is trusted shell syntax and must remain root-owned mode 0600. Never run `set -x`, `env`, `cat site.env`, or paste secret files into a journal or support ticket.

Before the first run, ensure `/opt/apkagro/releases/<commit>/RELEASE` and `/etc/apkagro/release-id` both contain the full commit ID matching the current symlink. Keep the exact source archive `/opt/apkagro/artifacts/<commit>.tar.gz`, created from the reviewed tracked source without `.env`, private state, logs, dependencies or recovery packages. A reproducible tracked-source archive can be generated at release build time with `git archive --format=tar.gz --output=<commit>.tar.gz <commit>`. The archived release includes `package.json`, `package-lock.json`, `server/`, `content/`, `public/` and its build/runtime scripts; production dependencies are reinstalled with `npm ci --omit=dev` on recovery. Preserve the original archive rather than rebuilding it under the same commit name from uncommitted files.

The initial application archive `49b87b1fc700352a7aac962dd263c72b16b64599.tar.gz` predates the production operations files. It must stay unchanged. Backup instead captures the **installed** scanner, Nginx configuration/includes, intake gate, ClamAV configuration, application service, backup configuration, backup scripts/units and domain-finalization script/service/timer/template into `metadata/runtime-root/` with their original paths. `metadata/runtime-files.json` records all 23 required files, SHA256, owner/group and original mode for each file. The backup fails before stopping the application if any required installed file is missing, empty, a symlink, not owned by root, or writable by group/others. Deploy all these operational files before the initial backup. The protected metadata tree uses root ownership, directory mode 0700 and file mode 0600 regardless of the originals' eventual installation modes.

The parent directory `/etc/apkagro` must be accessible to the application service if its sandbox needs it, but all individual credential files remain root-only; systemd reads the app environment as root before dropping privileges.

## Initial backup, restore drill and enablement

```bash
systemctl start apkagro-backup.service
apkagro-backup-status
systemctl status apkagro.service --no-pager
set -a; source /etc/apkagro/backup.env; set +a
restic snapshots --host "$BACKUP_HOST" --tag apkagro
restic check --read-data
apkagro-restore latest
# Enable recurring backups only after the initial backup and isolated restore pass.
systemctl enable --now apkagro-backup.timer
systemctl list-timers --all apkagro-backup.timer
```

`apkagro-restore` prints `RESTORE_TARGET=/var/backups/apkagro/restore.<random>` before doing any work and preserves this directory on success or failure. It does not overwrite production or start/stop the app. Inspect the directory privately. The restore contains the following original absolute paths underneath its new target:

```text
restore.<random>/
  etc/apkagro/site.env                 # includes recovered APP_DATA_KEY
  etc/apkagro/release-id
  var/lib/apkagro/
    admin.json                        # original enrollment, encrypted TOTP
    applications.sqlite               # and WAL/SHM if present in the snapshot
    files/*.enc                       # all encrypted attachments
    content/content-state.json        # published, draft and history
    content/media/media.json
    content/media/<id>.<ext>
  var/backups/apkagro/metadata/
    deployment.json                   # release SHA, source archive SHA256
    source.tar.gz                     # exact source release, without node_modules
    apkagro.service
    nginx-apkagro                      # if this vhost exists
    backup-tools/                     # installed scripts and backup unit files
    runtime-files.json                # required paths, hashes, original owner/group/mode
    runtime-root/                     # protected copies of the installed runtime files
      usr/local/bin/apkagro-scan
      usr/local/sbin/apkagro-{backup,backup-status,restore}
      usr/local/sbin/apkagro-domains-finalize
      usr/local/lib/apkagro-backup/{common.sh,verify-restored.mjs}
      etc/nginx/nginx.conf
      etc/nginx/conf.d/00-apkagro.conf
      etc/nginx/snippets/{apkagro-proxy.conf,apkagro-tls.conf}
      etc/nginx/sites-available/apkagro
      etc/nginx/sites-available/apkagro-final
      etc/apkagro/{intake-gate.conf,backup.env}
      etc/clamav/{clamd.conf,freshclam.conf}
      etc/systemd/system/apkagro.service
      etc/systemd/system/apkagro-backup{.service,.timer,-alert.service}
      etc/systemd/system/apkagro-domains-finalize{.service,.timer}
  snapshot.json                       # drill metadata, outside restored snapshot
  restore.log                         # private restic diagnostics for the drill
```

`restic restore --verify` rereads restored files. The independent Node verifier opens only the isolated copy and checks SQLite integrity/foreign keys, authenticates the recovered TOTP using the recovered AES key, decrypts every application and linked attachment, checks attachment lengths and record bindings, hashes every CMS media file, checks CMS references and verifies the source archive digest. It requires the full runtime manifest and verifies every captured scanner/tool/configuration file against its hash; it rejects missing files, duplicate/unknown manifest entries and unsafe recorded ownership/modes. A final tar/gzip listing reads the archive without extracting or executing its code. The verifier prints counts and release SHA, never plaintext personal data or secrets. It rejects symlinks in paths it reads. These checks do not replace an isolated startup/browser smoke test using that release and recovered state. Preserve the original WAL with the database; do not copy only the `.sqlite` file from a live application.

For the full drill, extract the verified source archive into a **new private source directory**, install dependencies for the matching Node version, and launch only on a spare loopback port with `APP_DATA_DIR` pointing to the restored copy. Override `APP_INTAKE_ENABLED=false`, scanner settings as appropriate, and the loopback port; do not bind a public port, publish a recovery admin session, or run background processes against production state. Check the published page, draft/history and media through that isolated app. Stop the drill process before any promotion. Remove only the exact temporary recovery directories after recording the test result; the supplied scripts deliberately perform no recursive deletion or automatic promotion.

## Consistency and availability

The backup takes `/run/lock/apkagro-backup.lock` for its complete run. It also takes `/run/lock/apkagro-operations.lock` before inspecting release/state and keeps it until the service has restarted. Every deploy, source symlink switch, state import and production restore must take the same operations lock. Application processes must be the only writers to the private state outside these locked maintenance operations.

Repository access, free space, environment permissions, source metadata and archive copying are checked before stopping the app. The service must reach `inactive`/`failed` with `MainPID=0`; only then does restic read the complete private directory and environment while all application writers are quiesced. The snapshot is bounded by `BACKUP_SECONDS=180` (hard maximum 300), plus up to 5 seconds to terminate a stuck restic process. Stopping and starting each have a 45 second budget plus a 5 second kill grace. Failed or incomplete snapshots, including restic exit code 3, fail the job and are never treated as a success. Before stopping an active service, a private marker records restart intent. Bash EXIT and signal traps attempt to restart it on every later error; the systemd `ExecStopPost` recovery command also attempts a restart if the shell was forcibly killed. A previously inactive/failed service is never started by a normal backup.

There is a short planned daily outage during the bounded snapshot. If the dataset grows beyond the snapshot budget, the backup fails and the app resumes. Do not silently increase the outage indefinitely: move to a tested filesystem snapshot/staging design with enough disk capacity, or explicitly revise the maintenance window. A service that itself cannot start is reported as a critical failure, with the restart marker retained for intervention. No software can guarantee restart after a power failure or a broken application; the application unit's boot enablement handles normal host reboot.

After the app resumes, the operations lock is released and retention/prune and repository metadata checks run with their own time limits. Restic's repository locks remain enabled; scripts never pass `--no-lock` or automatically `unlock`. A crashed operation can leave a stale restic lock. Confirm that no restic process is using this repository before manually using `restic unlock`; do not use `unlock --remove-all` as routine maintenance. A failed prune/check leaves the backup service failed even when a snapshot was created. Run a periodic full `restic check --read-data` and repeat the isolated restore after meaningful changes, particularly changes to encryption, schema or deployment layout.

Snapshots first receive only the tag `apkagro-pending`. Only a fully successful snapshot with the service resumed is retagged as `apkagro`, making it eligible for normal restore selection and retention. An aborted/incomplete snapshot can remain pending for incident review; the restore tool never selects it. Pending snapshots are not automatically deleted. If repeated failures accumulate, privately inspect `restic snapshots --host "$BACKUP_HOST" --tag apkagro-pending`, resolve the failure and remove explicitly selected obsolete pending IDs through a reviewed `restic forget` operation. Never retag an incomplete snapshot to bypass the check.

The free space guard reserves 1 GiB by default in addition to an estimated full new private dataset and two source archive copies, checks the staging/cache/local repository filesystems, and fails before stopping the app when capacity is low. Deduplication is not used as an excuse to assume zero growth. The restic prune operation limits repacking to 256 MiB per run. Capacity and restore time must still be reviewed as data grows.

## Monitoring and failure recovery

```bash
apkagro-backup-status
systemctl status apkagro-backup.service apkagro-backup.timer --no-pager
journalctl -u apkagro-backup.service -u apkagro-backup-alert.service --since '2 days ago' --no-pager
# Root-only log; inspect privately, never publish the whole file.
less /var/backups/apkagro/last-run.log
```

Status is nonsecret JSON with phase, timestamps, age, systemd job result and a health boolean. It exits nonzero after a failed/interrupted job (including configuration/lock failures before snapshotting) or when no successful completed backup exists within 36 hours. During a run it may show an in-progress phase while the previous success remains recent. This command is suitable for an approved external monitor. Journal messages and an `OnFailure` unit generate a local `daemon.alert` record, without source data or credentials. No external email/SMS/webhook destination was supplied, so there is no promise of external notification. The root-only diagnostic log and JSON snapshot progress file are replaced on each run; the journal retains generic job results.

If a restart failed, first inspect `systemctl status apkagro.service` and the application's journal, fix the reported cause, then run:

```bash
/usr/local/sbin/apkagro-backup recover
systemctl is-active apkagro.service
systemctl reset-failed apkagro-backup.service
systemctl start apkagro-backup.service
apkagro-backup-status
```

Do not remove `/run/apkagro-backup/restart-required` to hide a failure. Recovery clears it only after an active service is confirmed. If an intentional maintenance window supersedes restart intent, inspect the incident and resolve the marker explicitly as root; this is an operator decision, never an automatic fallback.

## Production recovery decision

1. Recover into a fresh private target and complete the checks above. Verify the intended snapshot date and release ID, not just `latest`. If recovering from compromise, use a clean host and trusted tools; backups on the compromised host are not a trust boundary.
2. Ensure the matching immutable release source, lockfile and dependencies are available, and restore the application environment containing the exact encryption key for that snapshot. Recovering an old state with a newer/different key makes TOTP and application data unusable. Do not regenerate admin enrollment or reset the original password to make a broken restore appear successful.
3. Disable the backup timer temporarily, take the shared operations lock, stop `apkagro.service`, and preserve the **entire current private state and environment** in separately named private directories/files. Keep their key and code release together. Do not merge rows, selectively delete real applications, or overwrite the live directory as part of a drill.
4. Promote the verified state as a whole using an operator-reviewed same-filesystem directory rename/swap, install its environment root:root 0600 and matching service/config, point `current` to the matching release, restore the application's ownership on the promoted state, and start the service. The user/group must match the application unit. Keep permissions at 0700 for private directories and 0600 for private data unless a file explicitly needs a more restrictive mode.
5. Verify the public site, admin MFA, applications/documents and CMS. If it fails, stop the service and roll back the **paired state + environment + release** preserved in step 3. Keep the incident evidence private. Release the lock, take a new verified backup and re-enable the timer after the recovered app passes checks.

The supplied restore tool intentionally ends before step 3. Promotion changes live production data and requires selecting an explicit recovery point and a maintenance window. Preserve a rollback copy; never automate arbitrary deletion of production applications.

On a replacement host, install the matching supported Ubuntu packages/services first: Node.js 22, Nginx, ClamAV daemon/freshclam, restic 0.18.1 and required TLS/renewal tooling. Recreate the application user and service directories as required by the captured unit. Use the verified files under `runtime-root/` and their manifest to restore their original absolute destinations with the recorded original owner/group/mode; the metadata copies are deliberately 0600 and must not be run in place. In particular, install `/usr/local/bin/apkagro-scan` as an executable accessible to the application, and preserve the ClamAV configuration group/modes required by its daemon. Recreate Nginx's enabled-site symlink after inspecting its restored includes and domain routing. Validate `nginx -t` and systemd units before reload; verify ClamAV's running socket, updated signatures and the scanner's clean/reject/failure behavior before enabling intake. Signature databases and scan/runtime sockets are regenerated by the installed services, not restored as application data. TLS certificates/private keys and ACME account files under `/etc/letsencrypt` are not part of this application snapshot: restore them from the separately secured infrastructure recovery material or reissue for the owned domains before enabling the recovered HTTPS vhost. Reinstalling the exact application archive alone does not recreate these dependencies.

`runtime-root/etc/apkagro/backup.env` may contain backend credentials and is encrypted inside restic like the application environment. Keep it private and reinstall it as root:root 0600. `/etc/apkagro/restic-password` is intentionally excluded from its own repository, so the independently retained recovery credential remains necessary to unlock the repository. External backup storage, DNS access, firewall rules and host access credentials must remain available through the separate infrastructure recovery process; this snapshot does not fabricate or expose them.

The captured `apkagro-domains-finalize` script, service, timer and `apkagro-final` Nginx template preserve the one-time transition from the working four-name HTTPS configuration to all six configured domain names when DNS becomes ready. After host recovery, inspect the recovered active vhost, current DNS answers and certificate names before deciding whether that timer still needs to run. The finalizer checks all six A records against the configured server IP, expands the certificate, installs and validates the final TLS vhost/redirects, then disables its own timer after success. Unit-file capture does not preserve systemd enablement symlinks; recreate only the enablement appropriate to the recovered DNS/TLS state. Keep the installed files after completion because they remain required recovery metadata even when the finalizer timer is disabled.

## Offsite configuration

`backup.env` exports `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE` and any backend-specific environment values to restic. To use an approved offsite destination, provision it outside the repository, set its actual URI/credentials in this 0600 file, initialize the new repository once, run a full backup and isolated restore, then enable/verify the timer. Store SSH/backend files under `/etc/apkagro`, because the backup service hides `/root` and home directories. Extend systemd writable paths only if a backend actually requires it. This replaces the configured destination; retaining both local and offsite repositories needs a separately reviewed `restic copy`/second-job policy and independent credentials, not a fabricated destination.

Official restic references used for flags and failure semantics: [backup](https://restic.readthedocs.io/en/stable/040_backup.html), [retention and prune](https://restic.readthedocs.io/en/stable/060_forget.html), [restore](https://restic.readthedocs.io/en/stable/050_restore.html), [repository checks](https://restic.readthedocs.io/en/stable/045_working_with_repos.html). Runtime validation must use the installed restic 0.18.1 help output.
