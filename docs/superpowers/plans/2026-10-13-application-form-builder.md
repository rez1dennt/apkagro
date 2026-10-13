# Application form builder implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the client change collected applicant fields, including passport numbers, through a tested CMS constructor with immutable historical answers.
**Architecture:** Extend current schemaVersion1 with deterministic backwards-compatible form references/config. Share scalar rules across Node/browser, render by permanent field IDs, store accepted definition/value snapshots inside existing encrypted payloads; reuse draft/preview/publication/history and existing authentication.
**Tech Stack:** Existing Node22.21+, vanilla HTML/CSS/modules, Busboy, LinkeDOM, ExcelJS, SQLite/AES-GCM, bundled Playwright. No new dependency.

## Global Constraints

- Binding spec `docs/superpowers/specs/2026-10-13-application-form-builder-design.md`. User explicitly authorized proceeding while away; no between-task confirmation.
- Existing schemaVersion1/default fields/history/apps remain compatible; opening an old store does not rewrite it. Stable builtin IDs, no random migration IDs. No reset of root content, media, credentials, participant data or `.env`.
- Max40 config fields;4 active file fields;10MiB/file;41MiB multipart;50 scalar parts/54 total/16KiB scalar part. Labels500/hints2000/placeholders500; text2000/textarea4000;50 options/500 label; finite numbers abs≤1e12. New field/option UUIDv4 names strictly validated; no arbitrary regex/JS/HTML.
- Protect course/consent/CSRF/revision/honeypot/preview system controls. Standard personal fields can be disabled/removed/restored; their semantic types/validators remain fixed. Optional nonempty values are validated. Unknown/hidden/duplicate values/files rejected. Preserve scanner queue/upload concurrency/auth/Origin/CSRF/CSP/lock ordering.
- Keep existing10 builtin fields and DOM names/IDs/default appearance. Builtin text slots in content.fields remain canonical aliases; no conflicting duplicate label source. Preserve existing custom upload icons. Draft→protected preview→explicit publication,20-version history.
- Accepted formSnapshot/formValues and file labels encrypted with existing payload/files; no public responses or logs. Historic views/export use their snapshot. Excel14 legacy cols retained, extra IDs appended; >256 extra cols uses normalized extra worksheet. Strings including 000123/false/0/formula text preserved.
- 1440/1024/768/360/320;12/20/40 fields and all types/long text, original catalogs/icons/pages. No overflow hiding as a fix. Ordinary pointer/keyboard tests and screenshot inspection.
- Worktree `C:/Users/bahti/.codex/worktrees/application-form-builder/евгений заказ лендинг`, branch codex/application-form-builder, basec3a8d4e9179293a60c8a317710b00048affd0c71. Root/live services must remain unchanged during implementation. No implementation agents in parallel. Commit task-owned source/tests/docs only; reports under ignored output.

### Task 1: Model, compatibility, SSR, intake and historical export

**Files:** create `public/assets/js/application-fields.js`, `server/application-form.mjs`, `server/application-form-render.mjs`, `tests/server-application-form.mjs`; modify `content/site.json`, `server/content-schema.mjs`, `server/content-store.mjs`, `server/content-render.mjs`, `server/content-routes.mjs`, `server/intake.mjs`, `server/app.mjs`, `server/storage.mjs`, `server/export.mjs`; focused changes to existing tests if their contract expands.

**Interfaces:**
- Public `FORM_LIMITS`, `createCustomField(type,{id,label}={})`, `validateFieldValue(definition,value,{today}={})`→`{ok:true,value}|{ok:false,message}`, `formatFieldValue(definition,value)`→plain string. Resolved definitions have id,type,label,hint,placeholder,enabled,required,rules, plus readonly builtin DOM/autocomplete metadata.
- Server `defaultApplicationForm()`→deterministic10builtin refs; `validateApplicationForm(form,{forPublication})`; `resolveFormFields(content,{includeDisabled=false}={})`; `formBuiltinMetadata()`→builtin type/presets/alias control metadata; `formManagedBindingIds()`→set of owned textual control bindings. Node model must not import content-schema/intake in a cycle.
- `renderApplicationForm({document,content,preview})` updates only ordinary controls, preserves system controls/default IDs/aliases/global icons; content renderer calls after text binding application. Browser bootstrap has `applicationForm:{version:1,fields:resolved enabled definitions}` and fixed rendered contentRevision. Public API config supplies published effective form only.
- `parseMultipart(req,{form}={})` bounded parsing; `validateSubmission(fields,files,options)`→`{fields,files}` with normalized values, immutable snapshot and server file labels. `validateFields` stays backward-compatible when directly called without form. App validates before scanner and again under existing media mutation gate before save.

- [ ] RED meaningful model/migration/intake/snapshot/Excel tests first. Example:
```js
const field=createCustomField('text',{id:'field-11111111-1111-4111-8111-111111111111',label:'Номер паспорта'});
field.rules={format:'digits',minLength:6,maxLength:6};
draft.content.applicationForm.fields.push(field);
const saved=await store.saveDraft(draft.content,draft.revision);
await media.publish(saved.revision,{documentsConfirmed:true});
const definitions=resolveFormFields(store.getPublished().content);
assert.deepEqual(validateFieldValue(definitions.at(-1),'000123'),{ok:true,value:'000123'});
assert.equal(validateFieldValue(definitions.at(-1),'00123').ok,false);
```
- [ ] Run `node --test tests/server-application-form.mjs`, retain expected RED. Build backwards-compatible references and strict custom shape/rules; aliases determined against known original template/registries, preserving current authored labels/placeholders/options/hints/markers. Publish active select/radio requires options. Include form's meaningful collection digest in existing document/consent confirmation, cosmetic reorder excluded.
- [ ] Implement SSR and bootstrap with stable field IDs; retain original default layout/selectors and system container positions. Hidden/control-only binding aliases must not overwrite new constructed labels during browser hydration. Managed text fields move to form metadata; existing icon fields remain usable. Reordered/new controls use generic `.field` styles/data-field-id, not selector order.
- [ ] Implement strict scalar/file request validation, signed publication consistency, scanner and queue invariants, server-labelled snapshots and encrypted files. Example snapshot assertions:
```js
const app=storage.get(id);
assert.equal(app.formValues[field.id],'000123');
assert.equal(app.formSnapshot.fields.find(x=>x.id===field.id).label,'Номер паспорта');
await renameAndRemoveInFixture(field.id);
assert.equal(storage.get(id).formValues[field.id],'000123');
```
- [ ] Extend workbook with stable new-ID columns using each row's historical formatter, dynamic autoFilter width and snapshot fallback for old records. >256 extra columns normalized worksheet, no dropping values. Keep default14 unchanged. Test strings, checkbox false, zero, XSS labels and formula-like literal strings; test missing FIO does not synthesize personal data.
- [ ] Run focused new and existing intake/content/render/export/storage suites, full `npm test` once after final change, `npm run verify`, diff-check. Write `output/form-builder/task-1-report.md` with commands/RED/GREEN/results/commit/warnings/deferred frontend checks, commit owned files and leave clean. Report exact finalized interfaces/alias metadata for Task2.

### Task 2: Admin constructor and public interaction

**Files:** create `public/assets/js/admin-content-form.js`, `public/assets/js/application-form.js`, `tests/frontend-application-form.mjs`; modify `public/assets/js/admin-content.js`, `admin-content-fields.js`, `admin.js`, `site.js`, `site-content.js`, necessary shared field/form modules/CSS, actual public/admin/legal HTML/import markers, `docs/content-admin-user-guide.md`; adapt affected existing browser helpers to8tabs/new generic validation.

**Interfaces:** consumes Task1 model/metadata/resolved SSR/bootstrap/validateFieldValue/formatFieldValue. `renderFormEditor(host,{state,definitions,onChange})` edits canonical refs/custom fields and builtin alias paths without overwriting unrelated content. `attachApplicationForm(form,{definitions,revision,translate})` provides `validateAll()`, `clearErrors()`, `updateAvailability(config)` and clean disposal, preserving existing site submit/course/success flows.

- [ ] RED pure/editor/widget tests: add passport preset, change label/requirement, move/hide/delete/restore builtin, unique IDs for copies/options, optional false/0/empty values, unsaved/change-generation/conflict behavior. Example:
```js
const passport=createCustomField('text',{label:'Номер паспорта'});
passport.rules={format:'digits',minLength:6,maxLength:6};
assert.equal(validateFieldValue(passport,'000123').value,'000123');
assert.equal(validateFieldValue(passport,'12ab34').ok,false);
```
- [ ] Add eighth `form` navigation pane «Форма заявки» in sidebar/mobile control. Add ordinary field cards with primary title/type/required/visibility, label/hint/placeholder, type-appropriate constraints/options/formats; existing up/down/remove confirmations and focus. Separate add dialog allows standard field restoration or custom types/presets. IDs/system fields never editable. Builtin aliases appear once through form editor; no duplicate competing labels. Types/semantic validators of builtin remain readonly. Use same tokens/inputs/checkbox/radio patterns; disabled/loading/errors/cancel/reduced motion and320px.
- [ ] Public field UX uses canonical data-field-id and shared validation. Attach phone/SNILS masks by semantic metadata, numeric keyboard for digit text, valid date bounds, file drop/selection/count/format/errors and generic radio/checkbox validation. Focus first error; optional nonempty validated. Handle server field errors by stable ID; values never go to localStorage. Keep existing default form interactions intact.
- [ ] Freeze rendered form revision. `updateAvailability(config)` marks changed revision as stale rather than replacing hidden revision on old controls; submit rejects/requests reload without losing current in-window input. Preview remains unsubmitted. Clear all generated field errors/files on new-application reset.
- [ ] Application detail uses immutable snapshot/formatFieldValue; default old fallback and protected document labels. Empty name/education list fallback neutral, no fabricated education. No new PII in list payloads beyond established summary/contact behavior.
- [ ] Advance all actual entry/import references consistently to `20261013-form-builder`; update static verification/Pages adaptations if contract matches change. Preserve icon UUID extraction/CSP fixes. Run focused tests, relevant browser/editor/public/Pages scenarios, full tests after final source change, verify/diff-check. Write `output/form-builder/task-2-report.md`, commit owned changes and leave clean.

### Task 3: Comprehensive synthetic browser verification and narrow fixes

**Files:** create `scripts/application-form-qa.mjs`; add meaningful behavior regressions to relevant form/backend/frontend suites; update `docs/content-admin-verification.md`; only confirmed narrow product fixes. No root/live state changes.

**Interfaces:** random-port createApp `origin:'http://127.0.0.1:0',testDynamicOrigin:true`, owned temporary data/public fixtures, real MFA with synthetic secret, store/media through existing services. Close app/server/browser and clean only verified owned fixture directory in finally.

- [ ] Actual editor flow: add required passport number; invalid5letters/length fails locally/server;000123 survives save/reload/preview/publication/intake/detail/Excel. Add series0001, optional text and unchecked checkbox; rename/delete/hide after acceptance and prove old snapshot unchanged; restore history and cold restart. Publication confirmation for data changes, preview POST denied, stale publication409, unknown/hidden/duplicate/prototype fields rejected.
- [ ] All types and file0/1/2/3/4, required/optional and MIME/signature/extension/size bounds, request cap, abort/disconnect/scanner fail/queue guards and protected downloads; disabled field values not accepted.40fields allowed41rejected;4active files allowed5rejected. Existing default2 required files/student controls stay functional.
- [ ] 12/20/40 fields on1440/1024/768/360/320 with long labels/hints/options/buttons, nested geometry, keyboard focus/actual ordinary clicks/validation errors, file/dialog/menu/Cookie scroll restoration. All8panes/new add/remove/preview/publication confirmations screenshots opened. Existing7/programs/correct photos/icons and legal/custom Pages regressions retained. Capture natural20-field example for client.
- [ ] Run only affected failing/fix cases during iteration, then final full `npm test`, verify, audit, public/Pages/icon regressions and diff-check. Record exact final counts/errors/screenshots and browser/runtime limitations in `output/form-builder/task-3-report.md`; commit owned tests/fixes/docs, clean tree. Independent scoped gate and strongest whole-branch gate follow.

### Release controller

- [ ] Fresh task reviewer after each recorded base..head; no simultaneous implementers. Resolve Critical/Important, record Minor for strongest final review. Full package from c3 base, no hidden previous work.
- [ ] Preserve root's exact local app hook and6demo files, private data/QR/key. Feature modifies server/app.mjs, so back up and reverse only known local hook before guarded ff, then restore adapted hook before root tests. Root docs copies backed up/moved only after equal-content check. No broad reset/stash/clean.
- [ ] Update only local synthetic demo helpers/policy for dynamic definitions, deterministic fake values and exact synthetic PDF/PNG/JPG bytes; all extra participant values protected from real-data submission. Keep backups of original helpers. New caller policy context may be passed from root hook without committing private demo infrastructure.
- [ ] Fresh root full tests/verify/audit/diff-check, ordinary push/remote SHA/Actions/artifact proof. Graceful shutdown only metadata-owned demo process, consistent data backup, same credentials/origin/ports/ngrok; migration must not rewrite legacy persisted snapshots on open. Actual8tab/new-field HTTPS verification uses only owned temporary unsaved editor inputs/media and isolated synthetic fixtures; do not publish/replace user live draft for QA. Verify persisted user data before/after restart and actual frontend masks/loads.
- [ ] Save final report/user instruction/client answer. Source ready for VPS; do not claim Linux/SSH deployment until credentials/host supplied and actual server setup/test completed.

