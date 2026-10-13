# Собственные иконки и устойчивость каталога — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the client to upload and reuse PNG/WebP/SVG icons throughout the CMS and verify large catalogs and long content without layout failures.

**Architecture:** Extend the existing immutable media pipeline and icon field contract, preserving existing schemaVersion1 and built-in icon values. Share canonical custom-icon parsing/rendering across validation, editor, SSR and browser dialog rendering. Run synthetic catalog fixtures independently of the live demo data.

**Tech Stack:** Node22.21+, ES modules, existing Saxes/Sharp/LinkeDOM, vanilla HTML/CSS/JS, bundled Playwright/Chromium.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-10-13-custom-icons-catalog-design.md`; input formats PNG, WebP and SVG; color modes «Цвет текста» and «Исходные цвета».
- Preserve draft → protected preview → explicit publication and 20-version history. Existing schemaVersion1 and built-in icon strings remain compatible.
- User SVG is never served or inserted as SVG markup. Reject scripts/events, HTML, DTD, external/local resources and unsupported syntax before decoder invocation. Output is immutable transparent WebP kind=image through the existing scanner/queue/reference protections.
- Raster images retain existing10MiB/24MP constraints. SVG maximum2MiB, intrinsic dimensions/viewBox each no greater than2048, maximum2048 elements/depth32; reject unbounded numeric/geometry input. Render inside512×512, preserving transparency/aspect ratio. Error messages identify unsupported SVG instead of silently removing icon contents.
- No external custom icon URL; canonical `/media/<uuid>.webp` only, with image metadata required for publication. Existing raster media remains reusable.
- Shared values: built-in string remains unchanged; custom value `custom:text:/media/<uuid>.webp` or `custom:original:/media/<uuid>.webp`. Never treat an arbitrary URL as an icon. All references, private preview requests and history protections resolve the underlying URL.
- Preserve current SVG wrapper classes, sizing, decorative ARIA and control names; custom text-color icon inherits currentColor on light/dark backgrounds. No new theme or unrelated redesign.
- Existing limit100 programs; test100 accepted and101 rejected. Browser fixtures12/20 visible programs at1440/1024/768/360/320, including long names/links/buttons and mixed statuses.
- Use the existing attached managed worktree at `C:/Users/bahti/.codex/worktrees/content-admin/евгений заказ лендинг`, branch codex/content-admin, basec7d11996c1c1940fa4eda0db18bf1161f4958931. Do not edit live root, its data, credentials or ngrok during implementation.
- Keep new code in readable modules; no dependencies or runtime credentials in Git. Do not change/delete user drafts, existing publication or participant data. Restart only the owned demo service after verified integration and preserve its current data.

### Task 1: End-to-end custom icon upload, selection and rendering

**Files:**
- Create `public/assets/js/content-icons.js`, `server/content-svg.mjs`, `tests/server-content-icons.mjs`, `tests/frontend-content-icons.mjs`, `scripts/content-icons-qa.mjs`.
- Modify `server/content-media.mjs`, `server/content-schema.mjs`, `server/content-render.mjs`, `public/assets/js/admin-content-fields.js`, `public/assets/js/admin-content-media.js`, `public/assets/js/site-content.js`, `public/assets/js/site.js` as required by actual call sites.
- Add custom icon styles in a focused `public/assets/css/content-icons.css` or the existing appropriate stylesheet without changing unrelated layout.
- Update actual public/admin/legal entry references and all browser imports to one consistent release marker, adapting current release verification scripts; update `docs/content-admin-user-guide.md`.

**Interfaces:**
- Shared `parseCustomIcon(value)` returns null for a non-custom value, otherwise `{url, mode:'text'|'original'}` only for exact canonical syntax. Malformed custom values must be rejected by schema.
- Shared `customIconValue(url, mode='text')` returns the canonical custom string and rejects invalid input. A shared DOM rendering helper preserves the SVG wrapper attributes/class/ARIA and uses only an image/mask of the safe raster URL, never uploaded XML markup.
- `prepareStaticSvg(data)` returns sanitized bounded SVG bytes or throws a clear INVALID_MEDIA HttpError. It must not invoke Sharp until parsing and security/complexity validation finish. Media processor returns existing immutable image metadata/WebP.
- All content icon locations include bound common fields, programs, benefits, steps and extra-section cards. SEO favicon remains the existing image field, not the icon-mode field.

- [ ] Write meaningful RED tests for upload, validation, references, deleted media, publication kind checks, SSR/common icons and dynamic dialog icons. Include representative adversarial SVG payloads.

```js
const file = await media.upload({data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#112233"/></svg>'),name:'icon.svg',mime:'image/svg+xml',title:'Мой значок',alt:'Значок'});
assert.equal(file.kind,'image');
assert.equal(file.ext,'webp');
draft.content.programs[0].icon='custom:text:'+file.url;
await store.saveDraft(draft.content,draft.revision);
await assert.rejects(media.remove(file.id), error=>error.code==='MEDIA_REFERENCED');
```

- [ ] Run `node --test tests/server-content-icons.mjs tests/frontend-content-icons.mjs`, record the expected missing-feature failures before implementation.
- [ ] Implement parser, strict SVG validation/conversion, content/media reference integration, shared safe renderer and editor upload/choice/mode control. In the editor keep the native built-in selector and add a clearly named custom upload/choice control, selected file preview/name and color-mode control. Ensure optional empty icons and return to built-in choices work.
- [ ] Run the new tests plus affected schema/media/API/render/editor suites. Required SVG negatives: DTD/entity, script, foreignObject, onload, external image/use, relative local resource, CSS URLs, invalid XML, oversized dimensions/elements and disguised MIME; original supported valid geometry remains visible.
- [ ] Run `scripts/content-icons-qa.mjs` on an isolated real HTTP app: actual editor upload, preview modes on light/dark, assign a common icon and program, save/preview/publish/reload, dynamic program modal, repeat use, protected unpublished media, restore and reference-protected deletion. Exercise keyboard/cancel/errors and320px. Save screenshots and open them for visual review.
- [ ] Update guide with actual button labels/accepted SVG restrictions. Run `npm run verify` and relevant Pages build checks. Commit only task-owned files and write `output/custom-icons/task-1-report.md` with RED/GREEN commands, test counts, screenshots, commits, concerns and deferred cross-task checks.

### Task 2: Large catalog and long-content verification with targeted fixes

**Files:**
- Create `scripts/content-catalog-qa.mjs`, `tests/frontend-content-catalog.mjs`; modify only confirmed affected layout/runtime files, normally `public/assets/css/materials.css`, `public/assets/css/soft-ui.css` or existing appropriate stylesheet.
- Update `docs/content-admin-verification.md` with actual new results/limits.

**Interfaces:**
- Consumes current createApp with `origin:'http://127.0.0.1:0',testDynamicOrigin:true`, `app.getContentServices()` and existing store/media publication methods. DataDir must be a fresh owned temp dir; close app/server/browser and delete only that owned fixture in finally.
- Uses canonical built-in icons for independent catalog scenarios; final regression also covers custom icons from Task1. Does not change the live ngrok demo catalog or user content.

- [ ] Create isolated fixtures and run them against the existing layout before fixing anything. Include both natural long Russian text and maximum valid long tokens without spaces in card title/category, detailed title/body/topics, CTA label, navigation labels, FAQ and contacts.

```js
draft.content.programs = Array.from({length:12},(_,i)=>({...draft.content.programs[0],id:'catalog-'+i,title:'Программа '+i+' — '+('длинное название '.repeat(12)),cardTitle:'Название '+i+' '+('продолжение '.repeat(12)),category:'Категория '+i,status:'published'}));
draft.content.settings.intake.deadline='';
await media.publish((await store.saveDraft(draft.content,draft.revision)).revision,{documentsConfirmed:true});
assert.equal(await page.locator('.program-card').count(),12);
```

- [ ] Browser matrix12/20×1440/1024/768/360/320: exact count, unique ordered IDs, whole-page and nested geometry/scroll overflow, card text/footer/category/button boundaries; open all dialogs and select each eligible program on at least one wide and one narrow width, verify selected ID/title, ESC and scroll restoration. Screenshot each catalog plus long dialog/form/header at all widths and view them.
- [ ] Verify max100/101, empty/closed/archived/mixed statuses; existing7 and current photos remain functional. Check stale/archived selection handling with existing server acceptance contract rather than merely CSS selectors.
- [ ] If failures exist, document concrete cause, create reproducible regression assertions and make narrow fixes. Keep long text readable; no disabling errors, hiding overflow globally or truncating all titles to conceal a defect.
- [ ] Repeat only affected checks after fixes, then full `npm test`, `npm run verify`, audit and necessary original public/Pages browser regressions. Write `output/custom-icons/task-2-report.md` with exact failures/fixes/results and commit task-owned files.

### Release controller steps

- [ ] Each task receives fresh scoped implementation and spec+quality review, then the strongest final whole-branch review reads both tasks and actual evidence. Resolve all Critical/Important findings; record and triage Minor findings.
- [ ] Integrate by safe fast-forward with the root's known intakePolicy hook and local demo files preserved. Do not stage runtime data or secret files. Fresh root verification appropriate to integrated changes precedes ordinary push.
- [ ] Restart only the owned demo Node process safely, awaiting async close; keep existing dataDir/credentials/QR. Existing ngrok still points gateway3001. Check that existing user drafts survive, updated JS is revalidated and actual SVG upload/custom icon works via HTTPS without changing user content.
- [ ] Save honest release report, instructions and actual working admin URL. Static Pages remains a source-design preview, not the dynamic CMS.
