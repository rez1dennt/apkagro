import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../public/assets/js/admin.js', import.meta.url), 'utf8'))
  .replace(/import \{ courses \} from '[^']+';/, 'const courses = {};')
  .replace(/import \{ enhanceStatusSelects, syncStatusSelect, closeStatusSelects \} from '[^']+';/, 'const enhanceStatusSelects = () => {}; const syncStatusSelect = () => {}; const closeStatusSelects = () => {};')
  .replace(/import \{ createContentAdmin \} from '[^']+';/, 'const createContentAdmin=()=>({setAuthenticated(){},confirmLeave:async()=>true});')
  .replace(/restoreSession\(\);\s*$/, '');

function fixture() {
  const nodes = new Map();
  const element = () => ({
    hidden: false, open: false, value: '', textContent: '', dataset: {}, children: [],
    classList: { add() {}, remove() {} }, listeners: {}, attributes: {},
    addEventListener(name,handler) { this.listeners[name]=handler; }, click() { return this.listeners.click?.(); }, append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name,value) { this.attributes[name]=value; }, removeAttribute(name) { delete this.attributes[name]; }, querySelector() { return element(); },
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
test('Excel uses the shared request lifecycle and rejects a late private blob after logout',async()=>{
 const f=fixture();f.run('setScreen(true); globalThis.pendingExport = api("/api/admin/export",{responseType:"blob"}); setScreen(false);');
 f.settle({ok:true,status:200,blob:async()=>new Blob(['synthetic workbook'])});
 await assert.rejects(f.context.pendingExport,{name:'AbortError'});
});

test('actual Excel click handler cannot write errors or clear a newer export busy state',async()=>{
 const f=fixture(),resolvers=[];f.context.fetch=()=>new Promise(resolve=>resolvers.push(resolve));const button=f.document.querySelector('#export-button');
 f.run('setScreen(true)');const oldExport=button.click();f.run('setScreen(false);setScreen(true)');assert.equal(button.disabled,false,'new session resets its export control');
 const newExport=button.click();assert.equal(button.disabled,true);assert.equal(button.attributes['aria-busy'],'true');
 resolvers[0]({ok:true,status:200,blob:async()=>new Blob(['old synthetic export'])});await oldExport;
 assert.equal(f.document.querySelector('#dashboard-error').textContent,'','old callback must not show an obsolete cancellation error');assert.equal(f.document.querySelector('#login-error').textContent,'');assert.equal(button.disabled,true,'old finally must not re-enable the new request');assert.equal(button.attributes['aria-busy'],'true');
 resolvers[1]({ok:false,status:500,json:async()=>({error:'Current export failed'})});await newExport;assert.equal(f.document.querySelector('#dashboard-error').textContent,'Current export failed');assert.equal(button.disabled,false);assert.equal(button.attributes['aria-busy'],undefined);
});
