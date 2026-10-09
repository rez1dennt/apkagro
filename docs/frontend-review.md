# Frontend review — 9 October 2026

Scope: read-only review of `public/assets/js/site.js`, `admin.js`, `courses.js`, the landing and admin markup, legal-page markup, relevant scroll-lock CSS, and the API contract in `docs/backend-report.md`. This is a full new source review, not a Git diff. No backend suite or live sensitive-data requests were run. Responsive screenshots and real browser interaction checks are handled separately by the main agent.

## Strengths

- Course details populate the native modal and selected course field; labels, program topics, application fields, document names, and API errors use `textContent` / constructed DOM nodes, with no untrusted HTML insertion found.
- Mutations use same-origin credentials and CSRF tokens. The admin login supplies the OTP, downloads use authenticated same-origin routes, and sensitive values are not persisted in browser storage.
- Native dialogs have accessible names, close buttons, Escape handling and focus restoration. The mobile menu makes the main/footer inert, traps keyboard traversal and closes at the desktop breakpoint. Scroll locking uses a shared owner set and a stable scrollbar gutter.
- The legal pages explicitly describe drafts, unavailable approved cloud links and outstanding operator/infrastructure/retention work. They describe the actual form data, technical cookies, authenticated downloads and absent analytics without claiming infrastructure has been provisioned. This is a source-consistency assessment, not legal approval.

## Critical

No Critical frontend issue identified within this review's scope. Backend security is covered by its independent review; its test claims were not rerun here.

## Initial Important findings — all resolved

The following records the initial findings and pre-fix line locations. Focused re-review confirmed the final corrections:

- `public/assets/js/form-logic.js:11–14` now requires HTTP 201, a valid UUID record id and a nonempty reference. `site.js:179` checks it before success, keeps form contents on unexpected responses and states that saving was not confirmed.
- `public/index.html:101` now labels the patronymic “если есть” and removes `required`, matching the API.
- `public/assets/js/form-logic.js:4` now uses the inclusive historical SNILS boundary.

Independent focused verification: `node --test tests/frontend-form.mjs` exited 0 with 6 tests passed, 0 failed. The tests cover the inclusive exempt boundary, modern checksum/zero rejection, rejected HTTP 200 fallback and incomplete HTTP 201 payload, and accepted HTTP 201 with a saved record id/reference. No backend suite or broad browser QA was repeated for this re-review. No Important frontend finding remains open in the reviewed source.

1. **A non-API HTTP 200 response produces a false enrollment success.** `public/assets/js/site.js:182–185` converts failed JSON parsing to `{}` and checks only `response.ok`. A maintenance/proxy HTML page with status 200 hides the form and shows “Ваша заявка принята” with “Номер заявки: undefined”, although it is not the documented successful creation response (`docs/backend-report.md:49`: HTTP 201 with `id` and `reference`). This violates the requirement to display success only when the API really accepted the application. Require the successful creation status, JSON payload, and a nonempty valid saved-record identifier before changing the form to success. Keep the existing values/files available on unexpected responses and report a retryable error. Diagnostic evidence: executing the actual submit handler in an isolated Node VM with mocked DOM/fetch and an HTML 200 application response printed `{"formHidden":true,"successHidden":false,"reference":"Номер заявки: undefined"}`. This is a focused handler reproduction, not a browser or backend integration test.

2. **The form refuses applicants without a patronymic.** `public/index.html:101` marks `middleName` required, and `public/assets/js/site.js:133,174–175` therefore prevents empty values from reaching the API. The documented and implemented API permits absent/empty `middleName` (`docs/backend-report.md:61`; `server/intake.mjs:12,22`). Applicants who have no patronymic must fabricate data or cannot apply. Make the field optional / “Отчество, если есть”; still validate nonempty values. If an explicitly approved intake requirement really mandates a patronymic, resolve that contract discrepancy before release rather than silently requiring fictitious data.

3. **The historical SNILS exemption excludes its inclusive boundary in the browser.** `public/assets/js/site.js:121` uses `< 1001998`, whereas `server/intake.mjs:19` skips the checksum for values `<= 1001998`, as documented at `docs/backend-report.md:61`. The browser blocks valid exempt identifiers with prefix `001-001-998` unless their final digits happen to match the modern checksum. Use the same inclusive comparison. Diagnostic execution of the actual frontend `validSnils` function returned `true` for `001-001-997 00`, `false` for `001-001-998 00`, and `true` for `001-001-998 64`, confirming the mismatch.

## Minor

1. **A new application may inherit a viewed but unchosen program.** `public/assets/js/site.js:71,186–190` reuses `displayedCourse`, which tracks the last opened course modal rather than the selected form course. Select A, view B and dismiss without choosing, submit A, then return to the form: B becomes the selected program. Preserve/reset the selected program intentionally instead of treating the last preview as a selection. Reset upload-zone classes together with labels/files so stale styling does not survive. Re-review: unchanged; remains Minor because the chosen program is visible and editable before a new submission.

2. **Admin errors after an expired export session can be hidden.** `public/assets/js/admin.js:45` switches to the login screen on export HTTP 401, but its catch writes the message into `#dashboard-error` on the hidden dashboard. Show session-expiry guidance in `#login-error`, clear session state consistently with the `api()` 401 branch, and focus the login field. Re-review: unchanged; remains Minor because access is correctly revoked and the login form is visible.

3. **Dense handlers increase review/maintenance cost.** Most of `public/assets/js/admin.js` and legal/admin markup compress several logical branches into individual lines. Expanding authentication, export, detail-loading and status-saving handlers would make race handling and error paths easier to inspect. This alone is not a release blocker.

4. **Nonempty optional patronymic bypasses browser validation.** `public/assets/js/site.js:138,169` only attaches validators / validates submitted `[required]` inputs, so making `middleName` optional also skips the existing name validator for nonempty patronymics. Invalid characters are still rejected safely by `server/intake.mjs:12`, but the form shows the generic server name error instead of identifying the field before uploading files. Include optional nonempty name inputs in validation while allowing an empty value. This is Minor usability parity, not an input-security defect.

## Verdicts

**Specification:** Acceptable in the reviewed source after the three Important corrections. The intended enrollment/course/admin paths and documented accepted-input boundaries now align. Visual-reference fidelity, mobile geometry and real scroll behavior still depend on the separate browser QA evidence.

**Code quality:** Acceptable, with the recorded Minor follow-ups. Safe DOM construction, native browser semantics and the corrected saved-response checks are appropriate. No Critical or Important source-review finding remains open. Production use remains gated on the already documented hosting/scanner/operator/legal/retention work, which this review neither substitutes for nor treats as completed.
