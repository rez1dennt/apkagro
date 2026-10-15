# Production service and release operations

The production application is the committed Node.js server, behind Nginx and HTTPS. Its canonical origin is `https://xn----8sbegcgafin8chbjtk.xn--p1ai` (возрождение-агро.рф). `www` and the two aliases `vozrojdenie-agro.ru` and `vozrojdenie-agro.online` redirect with status 308, preserving path/query. Every HTTPS name needs a valid certificate before its TLS virtual host is enabled.

The first deployment uses Ubuntu 26.04, distribution Node.js 22.22.1, Nginx 1.28.3, ClamAV 1.5.4 and restic 0.18.1. System packages were updated before launch. Source release `49b87b1fc700352a7aac962dd263c72b16b64599` is an exact Git archive; local synthetic-demo hooks and private state are excluded. The files in this directory and `../backup` are installed separately and captured verbatim in encrypted backup metadata. Do not relabel an archive of uncommitted files with an existing source commit.

## Paths and permissions

| Path | Purpose | Access |
|---|---|---|
| `/opt/apkagro/releases/<commit>` | Source plus `npm ci --omit=dev` dependencies, `RELEASE` file | root-owned, readable/executable, app cannot write |
| `/opt/apkagro/current` | Active immutable release symlink | root-managed |
| `/opt/apkagro/artifacts/<commit>.tar.gz` | Original source archive | root-owned |
| `/var/lib/apkagro` | Account, encrypted applications/files, CMS/history/media | apkagro:apkagro, directories 0700, files 0600 |
| `/etc/apkagro/site.env` | Runtime origin, private state directory and AES key | root:root 0600; systemd reads it before dropping privileges |
| `/etc/apkagro/intake-gate.conf` | First-release intake isolation | root-only; keep a nonempty open-state comment after QA |
| `/etc/clamav/{clamd,freshclam}.conf` | Resident scanner and signed update source | root:clamav 0640 |
| `/var/lib/clamav` | Verified public signature databases | clamav-owned; application cannot write |

The app user `apkagro` has no interactive shell and is a supplementary member of `clamav` for the local daemon socket, mode 0660. The Node listener binds only to `127.0.0.1:3000`. The firewall permits SSH, HTTP and HTTPS; preserve verified SSH access when changing it. Fail2ban handles SSH failures. Do not disable root/password access or rotate owner credentials without an agreed alternative.

## Install configuration

Install `apkagro.service` at `/etc/systemd/system/apkagro.service`. Install `apkagro-proxy.conf` and `apkagro-tls.conf` under `/etc/nginx/snippets/`; install `apkagro-http.conf` as `/etc/nginx/conf.d/00-apkagro.conf`. Set `server_tokens off;` **once** in the existing `http` block of `/etc/nginx/nginx.conf` (Ubuntu already contains that directive).

The HTTP-only vhost supports ACME before TLS exists. Use the webroot `/var/www/letsencrypt` for all names. Install the final HTTPS vhost only after its certificate covers every listed TLS server name. Put an executable hook in `/etc/letsencrypt/renewal-hooks/deploy/` that runs `nginx -t` and then `systemctl reload nginx`; enable `certbot.timer` and exercise `certbot renew --dry-run`.

For the first deployment, REG.RU's `.ru` parent still served the previous nameservers after the managed zone and `.рф`/`.online` delegation had updated. The transitional TLS vhost covers only names with verified DNS/certificates. Install `nginx-https.conf` as the inactive template `/etc/nginx/sites-available/apkagro-final`, `apkagro-domains-finalize` under `/usr/local/sbin/` (0750), and its service/timer under `/etc/systemd/system/`. Create `/var/lib/apkagro-operations` root-owned 0700 before enabling the hardened service. This one-time deployment job checks all six DNS answers against the owner's IP, expands the certificate, verifies every SAN with `openssl -checkhost`, validates/reloads the full vhost and tests all alias redirects over locally resolved genuine TLS. It disables its timer after success. It never changes registrar/mail records, accounts, application state or secrets. Status is `/var/lib/apkagro-operations/domains.json`; `waiting-for-dns` remains an incomplete external input, not a readiness claim. Inspect persistent delays using REG.RU and the authoritative parent delegation. Normal certificate renewal continues independently through Certbot after finalization.

Use `site.env.example` as a template, never as a populated secret file in Git. Generate a fresh 32-byte production key privately. Preserve the primary administrator password hash, salt and TOTP seed when migrating; decrypt and re-encrypt only the seed with its unchanged AAD `admin-totp:<username>`. Keep the original QR separate from general instructions. Import current CMS/history/media; do not import synthetic application databases or demo gateway hooks.

The proxy overwrites Host, X-Real-IP and X-Forwarded-Proto, removes client-supplied forwarding headers, streams bounded uploads and does not record query strings or request bodies. The app remains responsible for sessions, MFA replay protection, CSRF, per-field validation, scanner rejection and encrypted storage. Nginx rejects backslashes before location selection because Node URL parsing otherwise treats a literal backslash as a slash.

## Scanner

Install `apkagro-scan` root-owned mode 0755 at `/usr/local/bin/apkagro-scan` and use it for `APP_SCANNER_COMMAND`. It accepts only the application's stdin contract; requires a correctly shaped daily CVD header built within 72 hours, rejects future timestamps beyond one hour, requires the running daemon to report the same daily version, and propagates ClamAV clean/infected/unavailable status. Missing, old or unavailable databases fail closed.

The official CDN returned HTTP 403 from this server's region. `freshclam-mirror.conf` uses a public Russian mirror through native **DatabaseMirror** mode: complete CVD files have their embedded digital signature verified before replacement, then are load-tested. Do not use unsigned CLD/PrivateMirror or disable verification. During the source change, the old CDN cooldown state was preserved privately; the server does not retry that blocked source. Verify all initial CVD files with `sigtool --info`, requiring `Verification OK.` and successful exit. Run `clamav-daemon` and `clamav-freshclam` automatically. Set `EnableVersionCommand yes` on the protected local-only daemon so the wrapper can check its loaded database version; no TCP listener is enabled. Check a clean stream and the standard harmless EICAR signature.

Documentation: [official mirror configuration](https://docs.clamav.net/appendix/CvdPrivateMirror.html), [CVD signatures](https://docs.clamav.net/manual/Signatures.html), [mirror operator](https://mirror.truenetwork.ru/.info/).

## First-release acceptance and opening intake

Initially `/etc/apkagro/intake-gate.conf` contains `allow 127.0.0.1; deny all;` so synthetic submissions run only through the local TLS proxy. The site and protected admin UI can still be inspected externally. Verify both normal and literal/encoded-backslash paths from a disallowed source.

Take and verify an initial backup before synthetic QA. Keep all private application/session credentials in memory during QA, passed through protected stdin or the normal HTTPS login form. Never upload a plaintext password/TOTP file to the server. Test draft/preview/publication/history, large catalogs, custom media/icons, editable form fields, five education documents plus SNILS, each download, status changes, Excel and anonymous denial. Clean only exact owned synthetic UUIDs after verifying their reserved synthetic payload and document ownership; quarantine their encrypted rows/files privately. Preserve every other application, the current administrator/TOTP counter, published content and real editorial changes. Remove only explicitly identified QA-only history/media with no remaining references. Do not restore the entire live state to an older baseline as routine QA cleanup; whole-state disaster recovery is a separate operator-reviewed operation described in the backup guide.

After successful QA, the open gate must remain **nonempty** because backup inventory validates every required configuration:

```bash
printf '# Intake opened after production acceptance.\n' > /etc/apkagro/intake-gate.conf
chmod 0600 /etc/apkagro/intake-gate.conf
nginx -t
systemctl reload nginx
```

Run a final backup and isolated restore **after opening intake**, not only before it. Check service restart/reboot recovery, HTTPS/certificate renewal, all domains and private-file denial. See [backup installation and recovery](../backup/README.md). These local encrypted backups require a separately stored private recovery package; an external recurring backup destination and external notification recipient have not been provided.

## Updates and operational checks

Coordinate deployment/state migration with `flock /run/lock/apkagro-operations.lock`; backups use the same lock. Create a new immutable release directory, install locked production dependencies, verify it, then switch the symlink and restart the service. Preserve existing private state and its encryption key. For migrations requiring a state change, take a paired backup first and retain an explicit rollback state/key/release. Do not overwrite existing state as part of an install script.

```bash
systemctl status apkagro clamav-daemon clamav-freshclam --no-pager
nginx -t
apkagro-backup-status
systemctl list-timers --all apkagro-backup.timer certbot.timer
journalctl -u apkagro --since '1 hour ago' --no-pager
```

Do not paste secret environments, QR images, private files or database payloads into logs/support messages. The general client manual contains no credentials; access and owner recovery files are delivered privately.
