# Backend review — 2026-10-09

Scope: `docs/backend-brief.md`, supplied `docs/backend-review-package.txt`, current `server/*.mjs`, `scripts/setup-admin.mjs`, server tests, package configuration and environment example. Current source takes precedence over the package. The final focused re-review additionally read `docs/backend-report.md`, the revised upload/proxy code, `tests/server-upload-errors.mjs` and proxy/liveness regressions in `tests/server-security.mjs`. No implementation edits were made.

## Verdict

**Final specification verdict: PASS for the reviewed backend implementation.** Both Important findings are resolved. Mandatory password plus TOTP, encrypted private storage, authenticated document/XLSX endpoints, CSRF, session expiry, validation and production readiness gates are present. No authentication bypass or plaintext PII exposure was found. Production activation still depends on the documented operator-controlled deployment/legal/scanner/key/admin prerequisites; this verdict does not certify those external prerequisites.

**Final code-quality verdict: PASS with a minor maintainability note.** The revised error paths and trusted-client-address helper address the reported root causes. No residual exploitable gap was identified in the focused re-review. Existing dense one-line handlers remain harder to audit and should be formatted during later maintenance.

No open Critical or Important finding remains in this review.

## Resolved Important findings (original evidence retained)

### 1. RESOLVED — rejected file streams could crash the process

Final review: `server/intake.mjs:35-40` installs stream `error` and `limit` listeners before unknown/duplicate field checks, `resume()` and every early return. Request `error` and `aborted` events also destroy the parser through a handled path at line 30. Reviewer reran `node --test tests/server-upload-errors.mjs`: **4 passed, 0 failed, exit 0**. These isolated child-process cases cover unknown/duplicate fields, abort and request errors without an uncaught-exception suppressor. Implementer HTTP regressions additionally assert HTTP 400 followed by a successful config request. The original crash is closed.

Historical pre-fix finding follows; its line numbers refer to that earlier source.

Location: `server/intake.mjs:32`, the early return for an unknown or duplicate file field.

The file callback resumes and returns from rejected streams before registering their `error` handler. Busboy emits `Unexpected end of form` on the individual file stream when such a multipart body is truncated. The parser's own `error` handler does not consume that separate stream error. Node therefore raises an uncaught exception and ordinarily exits. An unauthenticated visitor can obtain the normal public CSRF cookie/token, submit a permitted same-origin request containing an unknown file field, and end the request without its closing boundary. This takes down the whole service when intake is enabled.

Reproduced directly with `Readable.from()` supplying a multipart part named `unexpectedFile`, filename `file.pdf`, and an unterminated body. An observation-only `uncaughtException` listener printed `UNCAUGHT: Unexpected end of form`; the promise also rejected with the expected HTTP 400. The latter does not prevent the former.

Fix: install an error listener on **every** emitted file stream immediately, before field validation or any early return. Preserve proper parser/request teardown. Add regression coverage for truncated unknown and duplicate file fields and aborted uploads; verify the server remains alive and the request fails safely.

### 2. RESOLVED — production visitors shared the same rate-limit identity

Final review: `server/app.mjs:14-29` now obtains exactly one `X-Real-IP` value from `headersDistinct` after verifying the trusted socket peer. Values are validated as single IPv4/IPv6 addresses; missing, duplicate, comma-separated, port/zone-bearing and mapped forms fail closed. Ordinary IPv6 spellings are canonicalized. The production request path verifies HTTPS proxy transport before calling the helper; development retains socket identity and ignores supplied forwarding headers. The resulting address feeds CSRF, login-IP and intake budgets at lines 61, 65 and 75. Username limits and global login/upload concurrency remain independent. The deployment report explicitly requires the proxy to strip/overwrite client-supplied forwarding headers.

The inspected regressions exhaust one proxy client's intake, login and CSRF allowances and verify another client retains each allowance; they also send genuinely missing headers, repeated header lines and malformed values, and demonstrate that direct development clients cannot rotate `X-Real-IP` to evade limits. Implementer evidence records the full **30/30 passing** run, exit 0. No loopback suite was rerun by the reviewer. The shared proxy budget is closed under the documented proxy-header contract.

Historical pre-fix finding follows; its line numbers refer to that earlier source.

Location: `server/app.mjs:40`, together with production proxy enforcement at line 37 and rate limits at lines 44, 48 and 58.

Production accepts only traffic arriving from the configured loopback TLS proxy, but the client IP is always `req.socket.remoteAddress`. Consequently every public visitor uses the proxy's loopback address: all visitors share 10 intake attempts per hour, 10 login attempts per 15 minutes and 120 CSRF requests per minute. Ten invalid public submissions exhaust the entire site's intake quota for an hour; unrelated legitimate applicants also exhaust it during normal use. Public requests can similarly exhaust the administrator login IP quota.

Fix: derive a validated client address from a single explicitly configured proxy header only when the socket peer is the configured trusted proxy. Require the reverse proxy to overwrite that header rather than forward arbitrary client-supplied values. Keep direct/untrusted forwarded headers ignored. Add tests that two distinct clients through the trusted proxy receive independent IP budgets, and that a direct client cannot spoof its rate-limit identity. Keep username-based login throttling and global concurrency bounds separately.

## Minor findings

- Several existing handlers in `server/app.mjs` and `server/storage.mjs` remain compressed into long physical lines. Format and split the main handlers into named helpers to make rejection, cleanup and state transitions reviewable. The newly changed file-error and proxy-address paths are readable blocks. This is a maintenance concern, not an additional exploit.
- The previously absent operations/test report is now present and reviewed. That documentation issue is closed. Deployment still requires real operator/legal approval, scanner installation and production key/admin configuration.

## Specification checks

| Area | Review result |
| --- | --- |
| Credentials | CLI-only setup, 16–128-character password, scrypt N=131072/r=8/p=1; no built-in credentials; random TOTP enrollment secret |
| MFA | SHA-1 RFC6238 TOTP, bounded clock window, durable consumed counter; in-process login serialization prevents concurrent reuse |
| At-rest privacy | AES-256-GCM with random nonces and record-specific authenticated data; application payloads and document bytes encrypted; filenames generated; private storage by default outside `public/` |
| Sessions | Server-side hashed random tokens, rotation on login, invalidation on logout, 30-minute idle and 8-hour absolute expiry; HttpOnly/SameSite=Strict and production Secure cookies |
| CSRF/origin | Exact Origin and bound pre-auth/session token checks; mutations protected; no permissive CORS |
| Intake | Explicitly disabled by default; requires configured key/admin; validates course, names, date, phone, email, SNILS, education and current consent; no invented adult-only eligibility |
| Uploads | Two required fields, one file each, per-file and total bounds, extension/MIME/signature checks, randomized storage names; every emitted file stream has an error handler before any early return |
| Private downloads | Authentication precedes document access; fixed safe attachment names; no-store/nosniff; canonical public containment and dotfile rejection |
| XLSX | Real ExcelJS workbook; explicit string cell values prevent formula objects from user content; authenticated attachment endpoint |
| Production | Requires HTTPS origin, key, configured admin, loopback trusted TLS proxy, legal readiness and scanner; scanner errors reject intake |
| Abuse controls | Body/header/time/concurrency limits present; trusted single validated client address gives independent production client budgets, with separate username and global concurrency limits |

## Verification evidence and limits

- Final re-review read the security/crypto test source and new regressions. The implementer's current report records `npm test`: 30 tests passed, 0 failed, exit 0; syntax checks also exited 0. This is attributed implementer evidence, not a reviewer rerun of the broad suite.
- Reviewer independently reran `node --test tests/server-upload-errors.mjs` after the fix: 4 tests passed, 0 failed, exit 0 (364.1561 ms).
- A targeted HTTP test attempt (`node --test --test-name-pattern="exact ten MiB" tests/server-security.mjs`) failed at the fixture's first loopback `fetch` in this execution environment, before the actual boundary assertion. Its Node process was stopped. This is not evidence that the boundary check failed.
- The implementer changed the Busboy threshold to 10 MiB + 1 byte during review. A separate direct parser probe against that current version accepted exactly 10 MiB. The initially suspected off-by-one is therefore **not an open finding**.
- The original malformed unknown-file probe reproduced an uncaught stream exception without network access. The final isolated process tests now safely reject all four malformed/error cases, closing Important finding 1.
- The original shared proxy identity was established directly from the code. New actual-loopback proxy tests and inspected client-address validation cover independent budgets and spoof resistance, closing Important finding 2.
- Review covers the backend code, not frontend rendering, deployed proxy configuration, antivirus effectiveness, legal correctness or OS access-control setup.
