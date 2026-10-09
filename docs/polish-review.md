# Polish review — 9 October 2026

Read-only source review against `docs/superpowers/plans/2026-10-09-polish.md`: input masks, local enrollment helper, shared font/theme/refinement CSS, SVG sprite, landing/admin integration, legal-page builder, and relevant public JS. No `.env`, `data/`, `output/private-access/`, QR image or secret value was read or printed. The provisioning script was inspected, not executed. Browser interaction and screenshot QA belong to the main agent; its reported nine keyboard-mask regressions were not independently rerun here. No broad backend tests were rerun.

## Strengths

- `public/assets/js/input-masks.js:20–34` explicitly intercepts Backspace/Delete at punctuation and removes the nearest digit in the intended direction. Ordinary digit edits and selected-range deletion retain normal browser behavior before formatting. `:36–52` restores the caret by digit count rather than forcing it to the end, supports national/Russian country-code normalization, and avoids rewriting composing input.
- The landing uses the shared mask functions (`site.js:167–168`). The existing API validation and saved-response check remain authoritative. Optional patronymic values are now validated without requiring an empty value (`site.js:143,161,181`), and a new form preserves the chosen course rather than the last preview (`:203`). The export catch now displays errors on the visible login/dashboard screen (`admin.js:45`).
- `theme.css:1–7,25–26` supplies a local WOFF2 with the requested declared family, Esqadero FF CY 4F. Landing, admin and generated legal pages include it and shared refinement CSS. This source review confirms integration, not independent internal font metadata or rendered glyph fidelity. The supplied license text is retained; its unresolved web-use terms are recorded in the plan rather than described as cleared.
- `icons-v2.svg` uses local vector symbols with detail and secondary accents, without script, external assets or dynamically inserted HTML. New category/footer icons have decorative `aria-hidden` markers. Existing meaningful text labels, native dialog names, keyboard paths, focus styles and reduced-motion rules remain in source.
- `scripts/provision-local-admin.mjs:8–12` requires an explicit creation flag, refuses production and refuses existing configuration/enrollment. Config/QR writes use `wx`, so ordinary existing files are not overwritten. It generates a long random password, creates the QR locally, and invokes the existing password hashing/encrypted-TOTP enrollment. The generated configuration explicitly keeps intake and legal readiness false. Fixed destinations are outside `public/`, and `.gitignore` excludes `.env`, `data/` and `output/`. No MFA bypass or plaintext TOTP output was introduced.

## Critical / Important

No Critical or Important defect identified in the reviewed polish changes. Visual quality, actual font loading, responsive geometry and live mask behavior remain subject to the main agent's browser evidence. This finding does not assert that production legal, hosting or scanner prerequisites have been completed.

## Minor follow-ups

1. **Provisioning cleanup covers enrollment failure only.** `scripts/provision-local-admin.mjs:17–22` creates the QR, README and `.env` before entering its cleanup `try`. If README/config creation fails, the newly created QR can remain and its exclusive-create path prevents a clean retry; the catch also leaves its newly written README behind. Wrap the whole creation transaction in cleanup, tracking only files successfully created by this invocation. Never remove an existing/concurrently created file. This does not affect the reported successful one-time enrollment.

2. **Private Windows ACLs are an external prerequisite of the helper.** `scripts/provision-local-admin.mjs:17–21` requests POSIX modes but does not apply owner-only NTFS ACLs. The main agent reports separately applying private ACLs to the current artifacts, so this is a helper portability/reuse gap, not evidence that the current QR is exposed. Document that requirement or enforce it before writing secrets if this becomes a reusable Windows provisioner. The fixed lexical paths also presume normal trusted project directories; avoid claiming protection against pre-existing directory junctions without canonical containment checks.

3. **Duplicate refinement rules obscure the final values.** `public/assets/css/refinement.css:9–13,18` repeats mobile heading-size and admin-grid rules already present elsewhere in the same file. Consolidate the final overrides after browser QA so later changes cannot silently diverge. No current runtime defect follows from the identical repeated values.

4. **Mask undo/IME/caret coverage can be broadened later.** The nine reported keyboard scenarios cover the requested separator deletion, repeated clearing, selection and paste cases. They do not assert caret positions, native undo/redo or composition-end behavior. This is a future regression-coverage improvement; no defect in those paths was reproduced in this read-only source review.

## Verification and verdicts

`node --check` exited 0 for `public/assets/js/input-masks.js`, `public/assets/js/site.js`, `scripts/provision-local-admin.mjs`, and `scripts/build-legals.mjs`. No private artifact inspection or account reprovisioning was needed.

**Specification:** Acceptable in the reviewed source. The requested local font/icon integration, separator-deletion mechanism and explicitly requested local administrator preparation are implemented without reopening intake. Actual rendered font/design fidelity and responsive interactions require the separate browser QA result.

**Code quality:** Acceptable with Minor follow-ups. Safe local assets, preserved browser semantics, unchanged API/MFA protections and ordinary non-overwrite guards are appropriate. Improve failed-provision recovery and reusable Windows permission enforcement before treating the helper as a general deployment tool.
