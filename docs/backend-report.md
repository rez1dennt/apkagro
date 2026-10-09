# Backend implementation report

Status: DONE_WITH_CONCERNS. Implemented and tested locally; production intake remains intentionally disabled until the operator completes configuration. No real administrator, password, TOTP enrollment, application encryption key, `.env`, or production records were created by the agent. Automated tests generate and remove synthetic credentials and data in isolated temporary directories.

## Run and setup

Node.js 22.21.0 or later. Local preview:

```powershell
npm ci --ignore-scripts
npm start
```

Open `http://127.0.0.1:3000/`, admin screen `/admin`. No configuration is needed for preview. No encryption key is silently generated; preview does not create a data store. `GET /api/config` reports intake disabled. The server binds only to loopback.

For an operator-controlled local setup, create a private `.env` from `.env.example`, supply `APP_DATA_KEY` as the base64 encoding of **32 cryptographically random bytes** obtained locally through a secret manager, and run:

```powershell
npm run setup:admin
```

The CLI requires an interactive local terminal, prompts for a 3–64 character username and a unique 16–128 character password, hides password and OTP input, creates the enrollment locally, displays the secret/otpauth URI only to that terminal, and requires a valid authenticator code before writing credentials. Protect that terminal. No demonstration or default credential exists. Wait for the next 30-second authenticator code after enrollment: the enrollment code is already consumed. Stop the server before replacing enrollment; restart after setup. There is no web-based enrollment or MFA bypass. Local recovery is replacement through the CLI after authenticating to the host.

Set `APP_INTAKE_ENABLED=true` only after enrollment and configuration. `APP_DATA_DIR` can select an absolute private storage path. The default is project `data/`, excluded from static serving. Filesystem modes 0700/0600 are requested; on Windows enforce equivalent private NTFS ACLs explicitly because POSIX mode bits do not replace Windows ACL configuration.

## Production gate

Production refuses startup unless all of the following are configured:

- `NODE_ENV=production`.
- `APP_ORIGIN` is an exact HTTPS origin, without a path or trailing slash; the approved public host is preserved by the proxy.
- `APP_HOST` is loopback and `APP_TRUSTED_PROXY` is exactly `127.0.0.1` or `::1`. Use a TLS reverse proxy on the same host, preserve the approved Host, and set `X-Forwarded-Proto: https`. The proxy **must strip/overwrite client-supplied `X-Real-IP` and `X-Forwarded-For`**, writing exactly one `X-Real-IP` value with the actual client IPv4 or IPv6 address observed by the proxy. Do not forward an incoming client IP header unchanged. The app verifies the socket peer and HTTPS indicator before trusting its fixed `X-Real-IP` contract. Missing, duplicate, comma-separated, invalid, port-bearing, zone-bearing or IPv4-mapped values fail closed with HTTP 400 / `PROXY_CLIENT_IP`; ordinary IPv6 is canonicalized so alternate spellings share a budget. `X-Forwarded-For` is never used as a rate-limit identity. Keep this private port inaccessible to external clients.
- A valid `APP_DATA_KEY`, existing enrolled administrator, and successful decryption of the stored TOTP secret.
- `APP_SCANNER_COMMAND` is an existing absolute path to a ClamAV-compatible `clamscan` executable. Each validated application payload and each document is sent over stdin with arguments `--no-summary -`, without a shell or plaintext temporary file. Exit 0 means clean; 1 rejects; any other exit, spawn error or 30-second timeout fails closed.
- `APP_LEGALS_READY=true`, set only after approved operator information, privacy notice, consent wording, retention/deletion process and eligibility requirements are in place.

Actual hosting location, jurisdiction, operator contacts, infrastructure permissions, scanner installation/signature updates, TLS configuration and legal readiness are **not inferred or configured** by this implementation. Verify the scanner with its official test procedures before opening intake. Production startup checks configuration/executable access, not the correctness or freshness of the malware database. Production proxy-header/transport checks and per-client budgets were exercised locally with a simulated TLS proxy using actual loopback HTTP requests and the approved public Host. Deployed TLS and live malware-scanner acceptance have not been exercised here.

`APP_INTAKE_ENABLED` still defaults to false. Production gates apply even if intake is disabled. Keep one Node process for this implementation; session/rate-limit state is process-local. At the reverse proxy apply request/body limits and network-level throttling, allowlists or authentication for the admin route as appropriate. The application uses each validated actual client address for intake, login-IP and CSRF budgets; username throttling and global concurrency caps apply separately. Development uses the socket peer and ignores forwarded IP headers.

## API contract

All APIs are same-origin. Use `credentials: 'same-origin'`. No CORS wildcard is enabled. All mutations require an exact Origin and a CSRF token. Obtain the preauthentication token from `/api/csrf`; it is bound to a random HttpOnly cookie. After login use the returned session `csrfToken`. Both session and preauthentication cookies use SameSite=Strict, HttpOnly, Path=/, and Secure in production. All API and sensitive download responses use `Cache-Control: no-store`.

| Method/path | Request | Successful response |
|---|---|---|
| `GET /api/config` | none | `{enabled: boolean, consentVersion: "2026-10-09"}`; no configuration secrets |
| `GET /api/csrf` | cookie if present | `{token: string}`, creates/reuses a 30-minute preauth cookie; authenticated users get their session token |
| `POST /api/applications` | multipart with fields below; `X-CSRF-Token` header or `_csrf` form field | HTTP 201 `{id, reference: id, message}` |
| `POST /api/admin/login` | JSON `{username,password,otp}`, token header | `{authenticated:true,csrfToken}` and rotated session cookie |
| `GET /api/admin/session` | cookie | `{authenticated:boolean,csrfToken:string|null}` |
| `POST /api/admin/logout` | cookie + token header | `{authenticated:false}`; session invalidated |
| `GET /api/admin/applications` | authenticated cookie | `{applications:[{id,createdAt,courseId,lastName,firstName,middleName,email,phone,education,status}],total}` |
| `GET /api/admin/applications/:id` | authenticated cookie | full decrypted validated fields, `{id,createdAt,status,reference,consentAt,documents:[{id,name,mime,size,field}]}` |
| `PATCH /api/admin/applications/:id` | authenticated cookie + token header; JSON `{status}` | `{id,status}`; status is `new`, `review`, `accepted` or `rejected` |
| `GET /api/admin/documents/:id` | authenticated cookie | authenticated attachment download with normalized ASCII filename and nosniff |
| `GET /api/admin/export` | authenticated cookie | true `.xlsx` attachment with string cells, no formulas |

Errors have shape `{error: "human-readable Russian message", code: string}`. Common codes include `INTAKE_DISABLED` (503), `AUTH_REQUIRED` (401), `LOGIN_FAILED` (401), `CSRF` (403), `RATE_LIMIT` (429), `INVALID_REQUEST` (400), `NOT_FOUND` (404), `SCANNER_UNAVAILABLE` (503), `SCAN_REJECTED` (400/503), `HTTPS_REQUIRED` (400), `INTERNAL_ERROR` (500). A 413 response covers overlarge JSON. Login errors are generic. DELETE and an audit API are not implemented; the private DB audit holds non-PII event names, timestamps and record UUIDs only.

Application multipart fields: `courseId` (`drone`, `flowers`, `wine`, `bread`, `cider`, `nutrition`); `lastName`, `firstName`, optional/empty `middleName`; `birthDate` (valid ISO calendar date from 1900 through today); `phone`; `email`; `snils`; `education` (`professional`, `student`); `consent="true"`; `consentVersion="2026-10-09"`; empty `website` honeypot. No unconfirmed adult-only threshold is invented. Russian SNILS format/checksum is validated, respecting the historical checksum exemption for numbers up to 001-001-998. Stored SNILS is normalized to 11 digits.

Both `snilsFile` and `educationFile` are mandatory, one file per field. PDF, JPEG and PNG only: signature/end-marker, MIME and extension must agree. SVG/HTML and extension-disguised files are rejected. Each file may be **at most 10 MiB**; the entire multipart stream is capped at 21 MiB, 2 files, 14 text fields, 16 parts and 1024 bytes per value. Duplicate or truncated fields/files and unknown fields are rejected. Original filenames are not stored; names normalize to `snilsFile.pdf`/`educationFile.pdf` or their detected image extensions. Storage uses random UUID names. Signature checks are not a full PDF/image sanitizer; production scanner checks and attachment-only downloads remain essential.

## Security and storage

- Password derivation uses Node scrypt with `N=131072`, `r=8`, `p=1`, a random 32-byte salt, 64-byte digest and 256 MiB maxmem. One derivation/login at a time bounds RAM and serializes persistence of the consumed OTP counter; additional simultaneous attempts receive 429. Hash comparisons use timing-safe equality.
- Mandatory RFC 6238 SHA-1 TOTP, 6 digits, 30-second step, at most ±1-step clock tolerance, and a persisted highest consumed step prevent replay, including after restart. Keep host time synchronized. The administrator enrollment secret is AES-256-GCM encrypted.
- Applications and document bytes use AES-256-GCM with random 96-bit nonces and authentication tags. Additional authenticated data binds each ciphertext to its record/document UUID. Names, email, phone, SNILS and original document contents do not occur in plaintext in the DB/files. Public metadata is limited to UUIDs, timestamps, status and audit event references. SQLite WAL stores encrypted payloads. Admin usernames/salt/hash are in the private credential file; never make it publicly readable.
- Document plaintext is decrypted in bounded memory and authenticated before an attachment stream is emitted. Upload buffers are bounded; at most two concurrent uploads are accepted. No plaintext upload temporary file is written.
- Sessions use random 256-bit IDs, with only SHA-256 IDs stored server-side. 30-minute idle / 8-hour absolute expiry, periodic cleanup, rotation on login, logout invalidation; a process restart revokes all sessions. Login attempts are limited per validated client IP (socket peer in development) and hashed username to 10 per 15 minutes; intake to 10 per client IP per hour; export and CSRF also have limits. Maps are capped/expired where needed.
- Credentials, request bodies, filenames, PII and passwords are not logged. Audit excludes PII and client IP. Consent version/time and a UUID reference are recorded; consent IP is not recorded.
- Static files come only from canonical-contained `public/`, from an explicit extension allowlist. Dotfiles, traversal paths, outside-root symlinks and private source paths are denied. `/admin` maps to `public/admin.html`; `/privacy/`, `/consent/`, `/operator/` map to their index pages.
- CSP allows only self scripts/styles/fonts/connections, prohibits objects, unsafe-inline, eval and frames; headers include nosniff, no-referrer, restricted Permissions-Policy and production HSTS. The application does not accept arbitrary X-Forwarded-For.

## Verification evidence

TDD: initial application-factory assertion failed before implementation; the full unimplemented server suite then failed its real behavior cases. Implemented routes/security/storage and reached green. Further regressions were exercised red→green for concurrent password derivation and the exact 10 MiB file boundary (Busboy's inclusive configured threshold required reserving one parser byte).

Latest full command: `npm test` (run with approved elevated loopback access because the Windows sandbox disallows fetch to a test server). Result: **30 tests, 30 passed, 0 failed**, exit 0, duration 20312.644 ms. Scenarios include anonymous list/detail/download/export denial, CSRF token and Origin rejection, generic bad-password/OTP handling, replay and persistent replay rejection, login rotation/logout, concurrency, idle/absolute session expiry, disabled preview intake, malformed upload signatures, duplicate files, disguised extensions, stale consent, invalid SNILS/date/consent, exact-size boundary and oversize, encryption roundtrip/no plaintext in files/DB, ciphertext/tag/AAD/key tampering, RFC6238 test vectors, scanner failure, valid encrypted intake/download/status update, safe true XLSX string cells, rate limits and rejection of spoofed forwarded IP, independent production proxy client budgets, missing/invalid/duplicate IP-header rejection and crash-safe malformed/aborted uploads.

`node --check server/app.mjs` and `node --check scripts/setup-admin.mjs` exited 0. `npm audit --omit=dev` exited 0 with **0 known vulnerabilities**. ExcelJS's vulnerable transitive UUID version was overridden to compatible patched CommonJS `^11.1.1`, and real workbook write/read tests pass. npm may still print deprecation notices for older ExcelJS dependencies; these are not hidden.

Node 22 prints its expected experimental `node:sqlite` warning; this is documented rather than suppressed. The implementer's successful test fixtures are removed. A reviewer's known synthetic `.server-test-TEnVPK` fixture remains locked by a stopped/retained test process; a cleanup attempt verified its exact path inside the workspace, encountered the lock and stopped. No real records are in that fixture; do not delete unrelated data to remove it. No Git operations were performed. Root handles public UI, browser QA and `scripts/verify.mjs`; this report makes no claim about those separate checks.

### Independent review corrections

Both Important findings in `docs/backend-review.md` were reproduced and addressed:

1. Every Busboy file stream gets its error/limit listeners **before** checking unknown/duplicate fields and before any `resume()`/return. Request error/abort handling also destroys the parser safely. `node --test tests/server-upload-errors.mjs` first failed three isolated child-process probes with unhandled stream errors, then exited 0 with 4/4 cases after the fix (unknown field, duplicate field, aborted request and request-stream error). Additional real HTTP cases return 400 for truncated unknown/duplicate files and then successfully serve `/api/config`, proving the process remains alive.
2. `clientAddress` in `server/app.mjs` validates the single trusted proxy header as documented above. `node --test --test-name-pattern="trusted proxy|production rejects missing, malformed|untrusted requests" tests/server-security.mjs` reproduced the shared-budget and absent-validation failures, then exited 0 with 3/3 tests after the fix. Separate intake, login-IP and CSRF budgets now survive a different client's exhausted allowance. Direct development requests cannot evade their socket-IP budget with `X-Real-IP` or arbitrary `X-Forwarded-For`. Username throttling and global concurrency remain separate.

Further command `node --test --test-name-pattern="production rejects missing, malformed|HTTP malformed" tests/server-security.mjs` exited 0 with 2/2 cases, including genuinely absent headers, repeated header lines, invalid values and server liveness after malformed uploads. The final full `npm test` result above includes all 30 cases. Sensitive new file-error and proxy-address paths were expanded into readable blocks; the existing dense handlers remain a maintenance consideration for later refactoring.

## Remaining operational work

Provision secure deployment/private host access, TLS, approved jurisdiction/storage location, backup encryption/key recovery and rotation procedures, NTFS permissions, a current scanner and its end-to-end test, finalized operator/privacy/consent documents and retention/deletion procedures; then enroll the real administrator locally and explicitly enable intake. The app has no email/SMS notifications, no browser MFA enrollment, no account recovery API, no application deletion API, no pagination and no distributed-session storage. Establish retention cleanup before handling real records. For larger scale add pagination/streamed export and shared durable rate/session state through a reviewed change. Loss of the encryption key means loss of access to protected records; keep backups and the key separately under operator control. This is a tested implementation, not an independent penetration-test or compliance certification.

Primary implementation references: [Node.js crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html), [Node.js SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), [Busboy API](https://github.com/mscdex/busboy#api), [ExcelJS value types/XLSX writing](https://github.com/exceljs/exceljs#value-types). Busboy and ExcelJS current official README documentation was fetched through Context7. `clamscan` adapter behavior should be confirmed against the scanner version provisioned by the operator.
