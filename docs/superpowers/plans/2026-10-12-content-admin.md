# Full content administration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Follow TDD, task review and final review; execute continuously without additional user approval gates.

**Goal:** Implement every requirement in the approved content-admin design: all public content, programs/modals, media, pages/documents, draft/preview/publication, revision history, existing applications and exports.

**Architecture:** A versioned content document is persisted independently from encrypted applications. A trusted binding registry connects the existing HTML to editable content; repeatable components have typed data. One shared server renderer serves published or authenticated draft content. The existing administrative session protects all CMS operations.

**Tech Stack:** Node.js 22.21.0+, native SQLite/filesystem, HTML/CSS/JavaScript, existing Busboy/ExcelJS, LinkeDOM for trusted-template parsing, Sharp for bounded image decoding and WebP optimization. No external CMS or remote editor CDN.

## Global Constraints

- Approved specification: `docs/superpowers/specs/2026-10-12-content-admin-design.md`; implement its entire scope.
- Node.js 22.21.0+; preserve TOTP, sessions, CSRF/Origin, encrypted application storage and race-safe admin requests.
- Draft → authenticated preview → atomic publication; saving never changes the live website.
- Keep last 20 published versions. Restore into draft only. Persist across restart and reject stale optimistic revisions.
- Images PNG/JPEG/WebP/AVIF ≤10 MiB and ≤24 megapixels; public documents PDF/DOCX ≤10 MiB. Never allow uploaded SVG/HTML/executables or path traversal.
- Draft media is private. Published/media-history references protect deletion. Participant documents are separate from CMS media.
- Programs automatically populate cards, modals, selection, server validation, applications and Excel; archive/relabel never alters historical application snapshots.
- All public text/assets/links/metadata and repeating blocks are editable, including form labels/copy, cookie copy and complete legal pages.
- Only approved structured formatting; no executable HTML, JS URLs, arbitrary CSS selectors or scripts in user content.
- Existing UI/adaptive components are retained. Test 1440, 768, 360 and 320 pixels; no mobile word concatenation or horizontal overflow.
- GitHub Pages remains an honest static design preview, with no fake CMS persistence or fake authentication.
- No secrets, `.env`, QR codes, runtime content, private applications or uploaded media in Git. Runtime artifacts under ignored `output/` or `data/`.
- Work only in `C:/Users/bahti/.codex/worktrees/content-admin/евгений заказ лендинг`, branch `codex/content-admin`. Root checkout's demo changes are unrelated and must remain intact.

## Shared content contract

The schema uses `schemaVersion: 1`; editable text can be plain text or restricted Markdown (paragraphs, lists, emphasis and validated links). Do not store untrusted HTML. Limits and structural validation are centralized.

```js
// Content document; concrete initial values come from the existing public site.
{
  schemaVersion: 1,
  fields: { 'hero.title': 'Постройте будущее\nв агропромышленном\nкомплексе' },
  navigation: { desktop: [], mobile: [], footer: [] },
  benefits: [], steps: [], faqs: [], programs: [], pages: [],
  sectionOrder: ['hero','about','programs','steps','application','faq','closing'],
  hiddenSections: [], extraSections: [],
  settings: { contacts: {}, organization: {}, colors: {}, intake: {} },
  documents: {}, seo: {}, messages: {}
}
```

`fields` keys and rendering targets are declared by a trusted checked-in registry `content/content-bindings.json`. Each entry has `id`, human Russian `label`, `group`, `kind`, `targets` and validation bounds. Client input cannot change selectors or attribute names. Include every existing text node, editable image/icon/background, link and metadata value not already governed by typed collections/settings. Store initial full legal content and all seven supplied course annotations without abridgment. Provide a coverage inventory so omitted content is detectable.

Collection records use permanent lowercase ASCII IDs (`[a-z0-9][a-z0-9_-]{0,63}`); URLs reject credentials, JS/data schemes and unsafe encoded paths. Existing `/assets/` and `/documents/` references remain valid. New media references are `/media/<UUID>.<validated extension>`.

Programs have `id,title,cardTitle,category,icon,image,modalImage,alt,imageFocus,modalFocus,hours,format,priceText,description,topics,disclaimer,buttonLabel,status`. Status: `published`, `draft`, `closed`, `archived`. Published is visible and selectable, closed is visible without enrollment, draft/archived are hidden publicly. Original seven programs default to published, 72 hours, online, free. Focus positions are bounded numeric percentages; no untrusted CSS strings.

Pages have `id,slug,title,intro,body,seo,status`; built-in slugs privacy/consent/operator cannot be removed or collide. New pages reject admin/api/assets/documents/media and duplicate slugs.

Envelopes: `{revision,content,updatedAt,publishedRevision,publishedAt,dirty}`. Initial draft/published versions contain the seeded site. Save increments draft revision. Publish atomically promotes an exact validated draft and resets dirty state. Consent text/file changes create a new consent version; policy/consent publication requires explicit document consistency confirmation when changed.

## Task 1: Complete seed, schema and versioned content store

**Create:** `content/site-defaults.json`, `content/content-bindings.json`, `docs/content-coverage.md`, `scripts/build-content-defaults.mjs`, `server/content-schema.mjs`, `server/content-store.mjs`, `tests/server-content-store.mjs`.
**Modify:** package manifests to add LinkeDOM only; use current official docs, run npm audit. Do not modify app routes or public rendering in this task.

**Consumes:** existing `public/index.html`, three legal pages, `courses.js`, organization module and current CSS/assets as authoritative initial content.
**Produces:**

```js
// content-schema.mjs
export async function loadDefaultContent(); // returns independent Content clone
export function validateContent(content); // validates and returns canonical clone; HttpError 400 on invalid
export function publicPrograms(content); // visible published/closed records
export function selectablePrograms(content); // published records only
export function referencedMedia(content); // Set of normalized media URLs
export function contentDigest(content); // stable digest
// content-store.mjs
export async function openContentStore({ dir, defaults, persist = true });
// store methods: getDraft(), getPublished(), history(), version(revision), references()
// async: saveDraft(content, expectedRevision), publish(expectedRevision, {documentsConfirmed=false}),
// restore(revision, expectedRevision), close(). Returns immutable/independent envelopes.
```

- [ ] RED: create real filesystem tests for seed fidelity, draft isolation, restart, stale-save conflicts, simultaneous saves, publish/rollback, 20-version retention, malformed schemas/URLs/prototype keys, immutable caller data, consent versioning and document confirmations. Tests must fail for missing behavior, not merely test implementation text.
- [ ] Implement a reproducible default-content extractor and trusted binding registry. Inspect all visible text and image/background/link/meta surfaces; special collections are explicitly inventoried instead of omitted. Preserve user documents and exact supplied annotations. Media focus uses initial meaningful existing crop.
- [ ] Implement bounded schema validation: complete required structure, exact trusted field keys/types, allowed icons, unique IDs/slugs, sizes/counts/strings/URLs, reserved names, color hex values, formatting rules. Avoid unconstrained recursive object acceptance.
- [ ] Persist atomically with serialized mutations and expected revisions, using one process-owned store; publication state/history must survive failure and restart. `persist:false` must never create data directories (existing unauthenticated preview contract).
- [ ] GREEN: run focused tests; run full `npm test`, `npm run verify`, `git diff --check`. Self-review and commit task-owned files.

**Concrete test sequence:**

```js
const store = await openContentStore({dir,defaults});
const draft = store.getDraft();
draft.content.fields['hero.title'] = 'Черновой заголовок';
await store.saveDraft(draft.content,draft.revision);
assert.notEqual(store.getPublished().content.fields['hero.title'],'Черновой заголовок');
await assert.rejects(store.saveDraft(draft.content,draft.revision), e => e.status===409);
await store.publish(store.getDraft().revision,{documentsConfirmed:true});
assert.equal(store.getPublished().content.fields['hero.title'],'Черновой заголовок');
```

## Task 2: Media library and authenticated CMS APIs

**Create:** `server/content-media.mjs`, `server/content-routes.mjs`, `tests/server-content-media.mjs`, `tests/server-content-api.mjs`.
**Modify:** `server/app.mjs`, package manifests (Sharp); minimal reusable auth/request helpers if required. Preserve all existing routes and limits.

**Produces:** `openContentMedia({dir,store,scannerCommand})` with list/upload/update/remove/read and usage checks; `handleContentRoute({req,res,pathname,session,origin,csrf,store,media,...})` returns handled boolean. Auth/proxy checks stay enforced by existing app.

API contract:

```text
GET /api/admin/content                 -> draft envelope
GET /api/admin/content/definitions     -> editor field/group/collection definitions
PUT /api/admin/content                 {content,expectedRevision} -> saved envelope
POST /api/admin/content/publish        {expectedRevision,documentsConfirmed} -> published envelope
GET /api/admin/content/history         -> {versions:[summary]}
GET /api/admin/content/history/:rev     -> version envelope
POST /api/admin/content/restore        {revision,expectedRevision} -> new draft
GET /api/admin/media                   -> {media:[metadata]}
POST /api/admin/media                  multipart(file,title,alt) -> metadata
PATCH /api/admin/media/:id             {title,alt} -> metadata
DELETE /api/admin/media/:id            -> deletion or 409 usage locations
GET /api/admin/media/:id/file          -> authenticated draft/public file
GET /media/:id.ext                    -> published-referenced file or 404
```

- [ ] RED: unauthorized read/write, missing CSRF/cross-origin rejection, bounded JSON/multipart, image spoof/oversize/pixel/decode failure, unexpected fields, same-name immutable asset IDs, private draft bytes, public bytes only after publish, referenced deletion denial, unused deletion, PNG/JPEG/WebP/AVIF auto-orientation/optimization, valid/invalid PDF/DOCX, traversal and injected filenames, persistence.
- [ ] Use Sharp with input pixel cap, cache disabled/bounded, concurrency 1 and serialized expensive media processing. Strip metadata and generate correctly oriented WebP ≤1920px without enlarging or distorting originals. Fully decode images before accepting. Validate DOCX container structure without unbounded extraction; validate PDF content and signature; scanners fail closed when configured.
- [ ] Keep CMS media under private content data, separate from participant encrypted files. Never expose arbitrary filenames or directory listings. Only referenced published/history assets have public access. Document responses have attachment/nosniff headers.
- [ ] API JSON body budget ≤512 KiB; original auth endpoints keep their 8 KiB budget. Enforce authentication/Origin/CSRF before parsing upload bodies. Backstop unresolved asset references at publication, not just in UI.
- [ ] Integrate optional content store lazily: no disk creation in anonymous preview; actual admin store persists. Expose store/media to integration tests only through app options or returned app internals without leaking credentials. Close resources.
- [ ] GREEN: focused then full tests/verify/audit/diff; self-review and commit.

## Task 3: Live renderer, pages, dynamic catalog and historical applications

**Create:** `server/content-render.mjs`, `public/assets/js/site-content.js`, `tests/server-content-render.mjs`, `tests/server-content-courses.mjs`.
**Modify:** `server/app.mjs`, `server/intake.mjs`, `server/export.mjs`, `public/assets/js/site.js`, `public/assets/js/cookie-notice.js`, static builder/tests as needed.

**Consumes:** schema/store/media from Tasks 1–2. **Produces:** cached-by-revision `renderContentPage({content,template,route,preview,consentVersion})`, bounded theme CSS, bootstrap content readable by frontend, fully rendered HTML with correct metadata.

- [ ] RED: every binding reflects edited data on rendered public HTML; no editable content gaps; rich formatting escapes executable content; repeated benefits/steps/FAQs/navigation/programs and custom section templates add/reorder/hide correctly; new legal/custom page slug works; theme/image focus; copied phone/email/organization updates everywhere; published only; preview authentication and no real intake.
- [ ] Render by modifying trusted parsed templates and using safe typed factories; never inject raw user HTML. Markdown emphasis/lists/links are validated and rendered safely. All dynamic titles/copy preserve word spaces and mobile natural wrapping. Page `<title>`, description, OG and one h1 update consistently. Keep approved visual classes and static assets.
- [ ] Deliver bootstrap via escaped inert JSON/template and external modules; honor existing CSP without unsafe-inline. Theme stylesheet is same-origin generated CSS from whitelisted registry/selectors/values only. Preview `/admin/preview/` and `/admin/preview/:slug/` requires session, has no-store/noindex, can be embedded same-origin only; all other frame restrictions remain. New consent versions must reach form and server validation together.
- [ ] Change `validateFields(fields, {programs,consentVersion}={})` compatibly; app accepts only current selectable published program IDs. Before saving, add immutable server-authored `courseSnapshot` and `consentSnapshot`. Existing stored applications resolve old titles from original catalog; admin API includes snapshot metadata. Excel prefers snapshot title, then supplied current catalog, then original fallback.
- [ ] Site modules obtain courses/metadata from rendered bootstrap; static fallback remains. Cards use event delegation or refreshed bindings. Course metadata/photos/description/topics/buttons/enrollment reflect current program; closed courses explain availability without sending a request. Form copy/settings deadlines/messages are live. Cookie copy is rendered from content.
- [ ] Update Pages builder to render initial defaults and strip real intake/API/auth as before. Keep original 7-course Pages QA defaults. Never read private local content or user uploads in CI.
- [ ] GREEN: focused/full server tests, static checks, original course/mobile/browser QA with isolated synthetic data. Add render-to-browser proofs for new course/edited legal page; self-review and commit.

## Task 4: Complete client-facing editor UI

**Create:** `public/assets/js/admin-content.js`, `admin-content-fields.js`, `admin-content-media.js`, `admin-content-richtext.js`, `public/assets/css/admin-content.css`, focused frontend helpers tests and `scripts/content-admin-browser-qa.cjs`.
**Modify:** `public/admin.html`, `public/assets/js/admin.js`; no separate login/backend bypass.

**Consumes:** CMS APIs and definitions; old admin `api` wrapper with CSRF/abort/authGeneration. **Produces:** `createContentAdmin({api,onUnauthorized})` returning `setAuthenticated(authenticated)` and cleanup. Applications and content panels share session lifecycle; late requests after logout cannot restore draft/user data.

- [ ] RED: helper tests for repeatable CRUD/permanent IDs, clone IDs, reorder and dirty-state preservation; browser acceptance for authenticated UI flow on isolated app. Use meaningful interactions, not source-text mirrors.
- [ ] Create full-width shell/sidebar/top bar with tabs from approved spec, using existing theme. Preserve working applications/status/detail/Excel. Show draft/published revision/time and unsaved state. Add mobile navigation and compact responsive controls, native accessible forms/dialogs, keyboard focus, reduced motion.
- [ ] Group editable fields by human Russian labels, search, text/image/link/icon controls; support all typed collections and custom templates. Include add/delete/move controls for navigation, benefits, steps, FAQs, programs, pages and sections. Programs expose all schema fields, separate image/modal image, focus, descriptions/topics/status; validate before save.
- [ ] Rich text supports toolbar for paragraph/headings/emphasis/bullets/numbered lists/links using restricted Markdown storage. Editing/preview never executes pasted HTML. File chooser can upload or select library assets, preview private files through authenticated routes, edit title/alt, search and show usage/deletion feedback. No raw selectors/JSON-only interface as substitute for editor.
- [ ] Save draft with expected revision; show explicit saved/failed/conflict states. Conflict UI offers download of local unsaved JSON and reload latest; user changes are retained until they choose. Preview opens actual protected route, selectable desktop/tablet/mobile widths. Publish confirmation summarizes changed groups and document consistency; only success activates published state. History preview/restore creates draft and requires explicit later publish.
- [ ] Guard leaving with unsaved work. Cancel pending writes/reads on logout and prevent late render. Do not refresh draft while applications poll. Do not clear current input/focus on background operations. Maintain one session/token channel.
- [ ] GREEN: new browser QA creates program + separate modal image, rich description, edits every main content group/settings/SEO/contacts/menus/labels, adds custom block/page, uploads images/documents, verifies private draft, saves/reloads, publishes, submits synthetic application, downloads Excel, archives/renames, restores history, validates logout/CSRF/conflict; test desktop/768/360/320 and console/network/overflow. Full tests/static checks; self-review and commit.

## Task 5: Final integration, coverage audit, release and client instructions

**Modify:** necessary task-owned fixes, `scripts/verify.mjs`, QA scripts, README, `docs/content-admin-user-guide.md`, `docs/content-admin-verification.md`.

- [ ] Audit default binding coverage against public DOM, CSS background/icon/media assets, runtime form copy and all source pages; resolve every omitted visible content field. Test repeatable data changes and genuinely new programs instead of editing only static defaults.
- [ ] Run isolated end-to-end full suite and browser matrix with real local HTTP API, current Node/Sharp. Include valid/invalid uploads, publish race, history persistence, new consent stale-form rejection and safe Excel preservation. Test Pages actual built artifact without backend promises.
- [ ] Follow website-release-qa and verification-before-completion; independent whole-branch review of complete commit range, resolve all Important/Critical issues with covering tests. Check npm audit --omit=dev and private-material Git audit before integration.
- [ ] Client instructions: same login/TOTP, choose content/program tab, edit/upload, Save draft, Preview, Publish, restore previous version. Explain server persistence/backup and static Pages limits precisely.
- [ ] Integrate into root checkout preserving pre-existing demo changes. Normal main push authorized by session; no force/reset or private/runtime data. Verify remote commit/deployment. Restart local real server only after identifying owned process and preserving data; protect temporary synthetic gateway. Demonstrate working CMS locally or through the already-isolated synthetic demo when safely possible.

## Progress and recovery

Controller maintains ignored `output/content-admin/progress.md`, task briefs/reports, and uniquely named diff packages. Record task base/head SHAs and both review verdicts. Completed tasks are not re-dispatched after compaction. Reviewer reads its task brief/report/diff and does not repeat already-reported passing tests unless a new concern requires it.
