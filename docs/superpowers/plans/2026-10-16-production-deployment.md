# Production Deployment Implementation Plan

**Goal:** Deploy the current site to the owner-provided Ubuntu VPS, preserve the primary admin enrollment, connect three domains, and deliver a verified Russian client manual.

**Architecture:** One unprivileged Node.js service behind local Nginx and HTTPS; SQLite and encrypted uploads in a private state directory; resident ClamAV scanning with automatic signatures; protected local backups and a separate private recovery package. Canonical origin is https://xn----8sbegcgafin8chbjtk.xn--p1ai (возрождение-агро.рф); aliases vozrojdenie-agro.ru and vozrojdenie-agro.online redirect with path/query preserved.

**Constraints:** Preserve all unrelated local changes, existing client CMS content, the original admin password hash and TOTP seed. Never publish credentials, QR, private state, backups, SSH credentials or environment files. Do not import synthetic applications into the new production database. Do not alter mail DNS records without inventory. Keep SSH access available. No infrastructure compliance claim substitutes for technical checks.

## Tasks

- [x] Audit VPS, pin SSH host key, inspect current source and primary enrollment; identify DNS failure.
- [x] Install and verify Node.js, Nginx, Certbot, ClamAV, firewall, security updates and backup tools.
- [x] Correct REG.RU delegation/zones and point apex/www records for all three domains to the supplied server; mail setup explicitly deferred by the owner. The `.ru` registry delegation is still pending externally; see verification record.
- [x] Prepare reproducible service/proxy/backup configurations and an exact source release, excluding local demo hooks and private state.
- [x] Import current published/draft CMS and required media; migrate the primary admin using a new production data key and unchanged TOTP seed/password hash.
- [x] Run the unprivileged production service, validate scanner clean/reject/failure behavior, enable HTTPS for verified domains, then enable intake.
- [x] Verify public routes, live aliases, secure cookies, MFA login, denied anonymous private endpoints, synthetic five-file submission/download/export/status flow, draft/preview/publish/history and media; remove only exact owned synthetic state and preserve the original content/account.
- [x] Configure daily recoverable backups, exercise isolated restore/startup, physically reboot and verify automatic services, renewal and firewall. Save the initial private recovery package locally after explicit owner approval; no external recurring backup destination was provided.
- [x] Produce and render the 14-page client manual and separate private access card; decode the rendered original QR and compare it with the primary account.
- [x] Complete independent configuration review and capture final evidence. Only nonsecret operations/docs files are selected for Git; unrelated local demo work remains untouched.
- [ ] Confirm public `.ru` parent delegation, six-name certificate and `.ru` HTTPS redirects. The installed one-time finalizer retries this and disables itself after successful verification.

Evidence and remaining external dependencies: [production verification](../../production-deployment-verification-2026-10-16.md).
