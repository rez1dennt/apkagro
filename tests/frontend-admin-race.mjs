import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../public/assets/js/admin.js', import.meta.url), 'utf8'))
  .replace("import { courses } from './courses.js';", 'const courses = {};')
  .replace(/import \{ enhanceStatusSelects, syncStatusSelect, closeStatusSelects \} from '[^']+';/, 'const enhanceStatusSelects = () => {}; const syncStatusSelect = () => {}; const closeStatusSelects = () => {};')
  .replace(/restoreSession\(\);\s*$/, '');

function fixture() {
  const nodes = new Map();
  const element = () => ({
    hidden: false, open: false, value: '', textContent: '', dataset: {}, children: [],
    classList: { add() {}, remove() {} },
    addEventListener() {}, append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute() {}, removeAttribute() {}, querySelector() { return element(); },
    focus() {}, close() { this.open = false; }
  });
  const document = {
    hidden: false, activeElement: null, documentElement: element(),
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll() { return []; }, createElement: element, addEventListener() {}
  };
  document.querySelector('#status-filter').value = 'all';
  let settle;
  const response = new Promise(resolve => { settle = resolve; });
  // A late completion can outlive cancellation; exercise the UI's generation guard.
  const context = vm.createContext({
    document, window: { addEventListener() {} }, fetch: () => response,
    FormData, URL, AbortController, DOMException,
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout, console
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return { document, context, run, settle };
}

test('late successful admin poll cannot restore application data after logout', async () => {
  const f = fixture();
  f.run('setScreen(true); globalThis.pendingPoll = loadApplications(true); setScreen(false);');
  f.settle({
    ok: true, status: 200,
    json: async () => ({ applications: [{
      id: 'synthetic-race-test', lastName: 'Synthetic', firstName: 'Reviewer',
      email: 'review@example.invalid', phone: '123', status: 'new',
      createdAt: '2026-10-09T10:00:00Z', courseId: 'test'
    }] })
  });
  await f.context.pendingPoll;
  assert.equal(f.document.querySelector('#dashboard-screen').hidden, true);
  assert.equal(f.run('applications.length'), 0, 'Late response restored private application state after logout');
  assert.equal(f.document.querySelector('#applications-table-body').children.length, 0, 'Late response restored private table rows after logout');
});

test('late unauthorized admin poll cannot invalidate a newer authenticated UI', async () => {
  const f = fixture();
  f.run('setScreen(true); globalThis.pendingPoll = loadApplications(true); setScreen(false); csrfToken = "synthetic-new-session"; setScreen(true);');
  f.settle({ ok: false, status: 401, json: async () => ({ error: 'Synthetic expired previous session' }) });
  await f.context.pendingPoll;
  assert.equal(f.document.querySelector('#dashboard-screen').hidden, false, 'Old 401 hid the newly authenticated dashboard');
  assert.equal(f.run('csrfToken'), 'synthetic-new-session', 'Old 401 cleared the new session token');
  assert.equal(f.document.querySelector('#login-error').textContent, '', 'Old request wrote an obsolete login error');
});
