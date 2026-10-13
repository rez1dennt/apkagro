import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile, mkdir, rename, access} from 'node:fs/promises';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {courses} from '../public/assets/js/courses.js';

const root = path.resolve('.');
const invalid = error => error.status === 400;
const conflict = error => error.status === 409;
test('reference guards validate saves and restores before acknowledging state',async t=>{
 const {store}=await fixture(t);let validated=0,reject=false;
 const detach=store.attachReferenceGuard({run:operation=>operation(),async validate(){validated++;if(reject)throw new Error('Missing selected file');}});
 let draft=store.getDraft();draft.content.fields['hero.title']='Сохранённое';draft=await store.saveDraft(draft.content,draft.revision);await store.publish(draft.revision);
 draft.content.fields['hero.title']='Следующий черновик';draft=await store.saveDraft(draft.content,draft.revision);reject=true;const before=store.getDraft();
 await assert.rejects(store.restore(1,before.revision),/Missing selected file/);assert.deepEqual(store.getDraft(),before);
 reject=false;await store.restore(1,before.revision);assert.equal(validated,4);detach();
});
test('intro and disclaimer validate approved links and track media while SEO remains plain',async()=>{
 const {loadDefaultContent,validateContent,referencedMedia}=await modules(),c=await loadDefaultContent(),url='/media/11111111-1111-4111-8111-111111111111.pdf';
 c.pages[0].intro='**Важное** [Документ]('+url+')';c.programs[0].disclaimer='Условия\n\n- [Документ]('+url+')';
 assert.ok(referencedMedia(c).has(url));assert.ok(referencedMedia(c,{publicOnly:true}).has(url));
 for(const field of [c.pages[0],c.programs[0]]){const key='intro'in field?'intro':'disclaimer',original=field[key];field[key]='[Опасная ссылка](javascript:alert)';assert.throws(()=>validateContent(c),invalid);field[key]=original;}
 c.pages[0].intro='';c.programs[0].disclaimer='';c.seo.description='[Буквальный текст]('+url+')';assert.ok(!referencedMedia(c).has(url));assert.equal(validateContent(c).seo.description,c.seo.description);
});
async function modules() {
  return {...await import('../server/content-schema.mjs'), ...await import('../server/content-store.mjs')};
}
async function fixture(t, persist = true) {
  const api = await modules();
  const dir = await mkdtemp(path.join(root, 'output', 'content-test-'));
  const defaults = await api.loadDefaultContent();
  const store = await api.openContentStore({dir, defaults, persist});
  t.after(async () => {await store.close(); await rm(dir, {recursive:true, force:true});});
  return {api, dir, defaults, store};
}

test('seed preserves all supplied annotations, legal text and trusted coverage', async () => {
  const {loadDefaultContent, validateContent} = await modules();
  const seed = await loadDefaultContent();
  assert.equal(seed.programs.length, 7);
  for (const program of seed.programs) {
    assert.equal(program.description, courses[program.id].description);
    assert.equal(program.title, courses[program.id].title);
    assert.deepEqual([program.status,program.hours,program.format,program.priceText], ['published',72,'Онлайн','Бесплатно']);
  }
  for (const slug of ['privacy','consent','operator']) {
    const {document} = parseHTML(await readFile(path.join(root, 'public', slug, 'index.html'), 'utf8'));
    const page = seed.pages.find(page => page.slug === slug);
    for (const element of document.querySelectorAll('.legal-body p,.legal-body li,.legal-body h2,.legal-body dt,.legal-body dd')) {
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      // Markdown syntax is removed only for this fidelity comparison.
      const plain = page.body.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').replace(/\\([\\\[\]*_])/g,'$1').replace(/\s+/g,' ');
      assert.ok(plain.includes(text), `${slug}: ${text}`);
    }
  }
  for (const key of ['hero.title','hero.description','application.title','closing.title']) assert.ok(seed.fields[key]);
  assert.ok(seed.fields['hero.title'].includes('\n'));
  const bindings = JSON.parse(await readFile(path.join(root,'content/content-bindings.json'),'utf8'));
  assert.deepEqual(Object.keys(seed.fields).sort(), bindings.filter(binding=>!binding.source).map(binding=>binding.id).sort());
  assert.ok(bindings.some(binding=>binding.source==='settings.organization.name' && binding.targets.some(target=>target.mode==='markdown-alias')));
  assert.ok(bindings.some(binding=>binding.source==='documents.consentPdf' && binding.targets.some(target=>target.file==='consent/index.html')));
  assert.ok(bindings.find(binding=>binding.source==='settings.organization.name').targets.some(target=>target.transform==='footer-name'));
  assert.ok(bindings.some(binding=>binding.kind==='background'));
  assert.ok(Object.values(seed.messages).includes('Введите СНИЛС полностью — 11 цифр.'));
  assert.ok(Object.values(seed.messages).includes('Контрольное число СНИЛС не совпадает.'));
  assert.ok(Object.values(seed.messages).includes('Заявка получена. Организатор свяжется с вами.'));
  assert.ok(bindings.some(binding=>binding.targets.some(target=>target.selector==='.program-card__badge use')));
  assert.deepEqual(seed.programs.find(program=>program.id==='cider').modalFocus, {x:50,y:35});
  assert.deepEqual(validateContent(seed),seed);
  seed.fields['hero.title']='changed';
  assert.notEqual((await loadDefaultContent()).fields['hero.title'],'changed');
});

test('saving isolates published content and rejects stale and simultaneous writes', async t => {
  const {store} = await fixture(t);
  const draft = store.getDraft();
  draft.content.fields['hero.title']='Черновой заголовок';
  const saved=await store.saveDraft(draft.content,draft.revision);
  assert.equal(saved.revision,draft.revision+1);
  assert.equal(saved.dirty,true);
  assert.notEqual(store.getPublished().content.fields['hero.title'],'Черновой заголовок');
  await assert.rejects(store.saveDraft(draft.content,draft.revision),conflict);
  const outcomes=await Promise.allSettled([store.saveDraft(saved.content,saved.revision),store.saveDraft(saved.content,saved.revision)]);
  assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
  assert.equal(outcomes.find(outcome=>outcome.status==='rejected').reason.status,409);
});

test('an unchanged saved draft still publishes its exact revision without changing consent edition', async t => {
  const {store}=await fixture(t);const draft=store.getDraft();
  const unchanged=await store.saveDraft(draft.content,draft.revision);assert.equal(unchanged.dirty,false);
  const published=await store.publish(unchanged.revision);
  assert.equal(published.revision,unchanged.revision);
  assert.equal(published.content.settings.intake.consentVersion,draft.content.settings.intake.consentVersion);
  const reordered=store.getDraft();reordered.content.settings.organization=Object.fromEntries(Object.entries(reordered.content.settings.organization).reverse());
  await store.saveDraft(reordered.content,reordered.revision);await store.publish(store.getDraft().revision);
});

test('publishing exact revisions, restart and restoring history preserve live state', async t => {
  const {store,api,dir,defaults} = await fixture(t);
  const baseline=store.getPublished();
  const changed=store.getDraft(); changed.content.fields['hero.title']='Опубликованный заголовок';
  await store.saveDraft(changed.content,changed.revision);
  await assert.rejects(store.publish(changed.revision),conflict);
  const published=await store.publish(store.getDraft().revision);
  assert.equal(published.content.fields['hero.title'],'Опубликованный заголовок');
  assert.equal(store.getDraft().dirty,false);
  await store.restore(baseline.revision,store.getDraft().revision);
  assert.equal(store.getDraft().content.fields['hero.title'],baseline.content.fields['hero.title']);
  assert.equal(store.getPublished().content.fields['hero.title'],'Опубликованный заголовок');
  await store.close();
  const restarted=await api.openContentStore({dir,defaults});
  t.after(()=>restarted.close());
  assert.equal(restarted.getDraft().dirty,true);
  assert.equal(restarted.getPublished().revision,published.revision);
  assert.equal(restarted.history().length,2);
});

test('publication retains exactly the last twenty versions and media references', async t => {
  const {store,api} = await fixture(t);
  const media='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.webp';
  for(let index=0;index<22;index++) {
    const draft=store.getDraft(); draft.content.fields['hero.title']='Заголовок '+index;
    draft.content.programs[0].image=index===3?media:'/assets/images/drone-client.webp';
    await store.saveDraft(draft.content,draft.revision); await store.publish(store.getDraft().revision);
  }
  assert.equal(store.history().length,20);
  assert.equal(store.version(1),null);
  assert.ok(store.references().has(media));
  assert.deepEqual([...api.referencedMedia(store.getPublished().content)],[]);
});

test('caller mutations and deterministic digest do not affect stored snapshots', async t => {
  const {store,api} = await fixture(t);
  const draft=store.getDraft(); const canonical=api.validateContent(draft.content);
  canonical.programs[0].title='Другой'; assert.notEqual(draft.content.programs[0].title,'Другой');
  const original=api.contentDigest(draft.content);
  const reordered=Object.fromEntries(Object.entries(draft.content).reverse());
  assert.equal(api.contentDigest(reordered),original);
  const saved=await store.saveDraft(draft.content,draft.revision);
  draft.content.fields['hero.title']='bad'; saved.content.fields['hero.title']='bad';
  store.history()[0].content.fields['hero.title']='bad';
  assert.notEqual(store.getDraft().content.fields['hero.title'],'bad');
  assert.notEqual(store.version(1).content.fields['hero.title'],'bad');
});

test('schema rejects malformed structures, prototype keys, untrusted HTML and unsafe URLs', async () => {
  const {loadDefaultContent,validateContent} = await modules();
  const defaults=await loadDefaultContent();
  const mutations=[
    value=>value.schemaVersion=2,
    value=>value.fields.unknown='bad',
    value=>delete value.fields['hero.title'],
    value=>value.fields['hero.title']='<script>alert(1)</script>',
    value=>value.programs.push({...value.programs[0]}),
    value=>value.programs[0].icon='evil',
    value=>value.programs[0].imageFocus.x=101,
    value=>value.programs[0].image='data:image/png;base64,AA==',
    value=>value.programs[0].image='/media/../../secret.png',
    value=>value.programs[0].image='/assets/%252e%252e/secret.png',
    value=>value.programs[0].image='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.svg',
    value=>value.programs[0].image='/assets/images/hero.webp?x=);background:red',
    value=>value.navigation.desktop[0].url='https://user:pass@example.com',
    value=>value.navigation.desktop[0].url='javascript:alert(1)',
    value=>value.navigation.desktop[0].url='//evil.example/a',
    value=>value.navigation.desktop[0].url='/%2e%2e/private',
    value=>value.navigation.desktop[0].url='/api/private',
    value=>value.pages.pop(),
    value=>value.pages.push({...value.pages[0],id:'custom',slug:'admin'}),
    value=>value.pages.push({...value.pages[0],id:'custom'}),
    value=>value.pages[0].body+='\n[x](javascript:alert(1))',
    value=>value.pages[0].body+='\n![x](https://example.com/a.png)',
    value=>value.settings.colors.forest='red;display:none',
    value=>value.settings.intake.enabled='true',
    value=>value.extraSections=Array(51).fill({}),
    value=>value.sectionOrder.push('hero'),
    value=>value.programs[0].description='a'.repeat(20001),
    value=>Object.defineProperty(value.fields,'__proto__',{value:{polluted:true},enumerable:true}),
    value=>value.settings.organization={...value.settings.organization,constructor:'bad'},
    value=>Object.setPrototypeOf(value.settings.contacts,{polluted:true})
  ];
  for(const mutate of mutations) {const value=structuredClone(defaults); mutate(value); assert.throws(()=>validateContent(value),invalid,mutate.toString());}
});

test('program visibility and selection use current content without changing seeded records', async () => {
  const {loadDefaultContent,publicPrograms,selectablePrograms}=await modules();
  const defaults=await loadDefaultContent();
  defaults.programs[0].status='closed'; defaults.programs[1].status='archived'; defaults.programs[2].status='draft';
  assert.equal(publicPrograms(defaults).length,5); assert.equal(selectablePrograms(defaults).length,4);
  publicPrograms(defaults)[0].title='bad'; assert.notEqual(defaults.programs[0].title,'bad');
});

test('consent changes require confirmation and publish creates a server-authored version', async t => {
  const {store}=await fixture(t);
  const old=store.getPublished().content.settings.intake.consentVersion;
  const draft=store.getDraft(); draft.content.pages.find(page=>page.slug==='consent').body+='\n\nНовая редакция.';
  draft.content.settings.intake.consentVersion='forged';
  await store.saveDraft(draft.content,draft.revision);
  assert.equal(store.getDraft().content.settings.intake.consentVersion,old);
  await assert.rejects(store.publish(store.getDraft().revision),error=>error.status===400 && error.code==='DOCUMENTS_CONFIRMATION_REQUIRED');
  const published=await store.publish(store.getDraft().revision,{documentsConfirmed:true});
  assert.notEqual(published.content.settings.intake.consentVersion,old);
  assert.notEqual(published.content.settings.intake.consentVersion,'forged');
  const policy=store.getDraft(); policy.content.documents.policyPdf='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf';
  await store.saveDraft(policy.content,policy.revision);
  await assert.rejects(store.publish(store.getDraft().revision),error=>error.code==='DOCUMENTS_CONFIRMATION_REQUIRED');
  await store.publish(store.getDraft().revision,{documentsConfirmed:true});
  assert.notEqual(store.getPublished().content.settings.intake.consentVersion,published.content.settings.intake.consentVersion);
  const contact=store.getDraft();contact.content.settings.contacts.email='updated@example.test';
  await store.saveDraft(contact.content,contact.revision);
  await assert.rejects(store.publish(store.getDraft().revision),error=>error.code==='DOCUMENTS_CONFIRMATION_REQUIRED');
  await store.publish(store.getDraft().revision,{documentsConfirmed:true});
  const organization=store.getDraft();organization.content.settings.organization.name+=' — новая редакция';
  await store.saveDraft(organization.content,organization.revision);
  await assert.rejects(store.publish(store.getDraft().revision),error=>error.code==='DOCUMENTS_CONFIRMATION_REQUIRED');
  await store.publish(store.getDraft().revision,{documentsConfirmed:true});
  assert.notEqual(store.getPublished().content.settings.intake.consentVersion,published.content.settings.intake.consentVersion);
});

test('memory-only store never creates directories and duplicate process owners are rejected', async t => {
  const api=await modules(); const defaults=await api.loadDefaultContent();
  const dir=path.join(root,'output','does-not-exist-'+Date.now());
  const memory=await api.openContentStore({dir,defaults,persist:false});
  await memory.saveDraft(defaults,memory.getDraft().revision); await memory.publish(memory.getDraft().revision); await memory.close();
  await assert.rejects(access(dir),error=>error.code==='ENOENT');
  const {store,dir:owned}=await fixture(t);
  await assert.rejects(api.openContentStore({dir:owned,defaults}),error=>error.code==='CONTENT_STORE_OWNED');
  await store.close();
});

test('failed disk promotion leaves state unchanged and later mutations succeed', async t => {
  const {store,dir}=await fixture(t); const state=path.join(dir,'content-state.json');
  const moved=path.join(dir,'saved-state.json'); await rename(state,moved); await mkdir(state);
  const draft=store.getDraft(); draft.content.fields['hero.title']='Не сохранено';
  await assert.rejects(store.saveDraft(draft.content,draft.revision));
  assert.equal(store.getDraft().revision,draft.revision);
  await rm(state,{recursive:true}); await rename(moved,state);
  await store.saveDraft(draft.content,draft.revision);
  assert.equal(store.getDraft().content.fields['hero.title'],'Не сохранено');
  const revision=store.getPublished().revision,history=store.history().length;
  await rename(state,moved);await mkdir(state);
  await assert.rejects(store.publish(store.getDraft().revision));
  assert.equal(store.getPublished().revision,revision);assert.equal(store.history().length,history);
  await rm(state,{recursive:true});await rename(moved,state);
  await store.publish(store.getDraft().revision);
});

test('incomplete new draft program can save but must be completed before publication', async t => {
  const {store}=await fixture(t);const draft=store.getDraft();
  const program={...draft.content.programs[0],id:'new-course',title:'',cardTitle:'',image:'',modalImage:'',description:'',status:'published'};
  draft.content.programs.push(program);await store.saveDraft(draft.content,draft.revision);
  await assert.rejects(store.publish(store.getDraft().revision),invalid);
  const ready=store.getDraft();Object.assign(ready.content.programs.at(-1),{title:'Новая программа',cardTitle:'Новая программа',image:'/assets/images/drone-client.webp',modalImage:'/assets/images/drone-client.webp',description:'Описание программы'});
  await store.saveDraft(ready.content,ready.revision);await store.publish(store.getDraft().revision);
  assert.equal(store.getPublished().content.programs.at(-1).title,'Новая программа');
});

test('public media excludes draft programs, archived pages and hidden sections while deletion references retain them', async t => {
  const {store,api}=await fixture(t);const draft=store.getDraft();
  const privateMedia='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.webp';
  draft.content.programs[0].status='draft';draft.content.programs[0].image=privateMedia;draft.content.programs[0].modalImage=privateMedia;
  await store.saveDraft(draft.content,draft.revision);await store.publish(store.getDraft().revision);
  assert.ok(store.references().has(privateMedia));
  assert.ok(api.referencedMedia(store.getPublished().content).has(privateMedia));
  assert.equal(api.referencedMedia(store.getPublished().content,{publicOnly:true}).has(privateMedia),false);
  const sectionMedia='/media/ae72ff37-60d2-4997-bb9f-dc7cd1b5b98f.webp';
  const hidden=store.getDraft();const background=Object.keys(hidden.content.fields).find(id=>id.startsWith('background.') && hidden.content.fields[id].includes('hero.webp'));
  hidden.content.hiddenSections.push('hero');hidden.content.fields[background]=sectionMedia;
  await store.saveDraft(hidden.content,hidden.revision);await store.publish(store.getDraft().revision);
  assert.equal(api.referencedMedia(store.getPublished().content,{publicOnly:true}).has(sectionMedia),false);
});

test('incomplete page and extra section drafts persist while visible publication requires content', async t => {
  const {store}=await fixture(t);const draft=store.getDraft();
  draft.content.pages.push({id:'new-page',slug:'new-page',title:'',intro:'',body:'',seo:{...draft.content.pages[0].seo,title:'',description:'',robots:'noindex,follow'},status:'published'});
  draft.content.extraSections.push({id:'new-section',type:'image',title:'',body:'',image:'',alt:'',imageFocus:{x:50,y:50},buttonLabel:'',buttonUrl:'',items:[]});draft.content.sectionOrder.push('new-section');
  await store.saveDraft(draft.content,draft.revision);
  await assert.rejects(store.publish(store.getDraft().revision),invalid);
  const ready=store.getDraft();Object.assign(ready.content.pages.at(-1),{title:'Страница',body:'Текст страницы'});
  await store.saveDraft(ready.content,ready.revision);
  await assert.rejects(store.publish(store.getDraft().revision),invalid);
  const final=store.getDraft();Object.assign(final.content.extraSections[0],{title:'Изображение',image:'/assets/images/harvest.webp'});
  await store.saveDraft(final.content,final.revision);await store.publish(store.getDraft().revision);
});

test('consent-file change and restoration author fresh versions, corrupted state never silently resets', async t => {
  const {store,api,dir,defaults}=await fixture(t);const baseline=store.getPublished();
  const draft=store.getDraft();draft.content.documents.consentPdf='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf';
  await store.saveDraft(draft.content,draft.revision);await assert.rejects(store.publish(store.getDraft().revision),error=>error.code==='DOCUMENTS_CONFIRMATION_REQUIRED');
  await store.publish(store.getDraft().revision,{documentsConfirmed:true});const version=store.getPublished().content.settings.intake.consentVersion;
  assert.notEqual(version,baseline.content.settings.intake.consentVersion);
  await store.restore(baseline.revision,store.getDraft().revision);await store.publish(store.getDraft().revision,{documentsConfirmed:true});
  assert.notEqual(store.getPublished().content.settings.intake.consentVersion,version);assert.notEqual(store.getPublished().content.settings.intake.consentVersion,baseline.content.settings.intake.consentVersion);
  await store.close();await writeFile(path.join(dir,'content-state.json'),'{broken');
  await assert.rejects(api.openContentStore({dir,defaults}));
  assert.equal(await readFile(path.join(dir,'content-state.json'),'utf8'),'{broken');
});

test('seed extractor is reproducible and every public text surface is bound or typed', async () => {
  const {extractDefaultContent}=await import('../scripts/build-content-defaults.mjs');
  const extracted=await extractDefaultContent();const api=await modules();
  // The extractor retains the legacy seed; the optional form is normalized in memory.
  assert.deepEqual(api.validateContent(extracted.content),api.validateContent(await api.loadDefaultContent()));
  assert.deepEqual(extracted.bindings,JSON.parse(await readFile(path.join(root,'content/content-bindings.json'),'utf8')));
  const typed='.nav a,.mobile-menu nav a,.footer__nav a,.benefit,.step-list li,.accordion details,.program-card,.legal-body,.legal-container > h1,.legal-intro,.application__deadline';
  for(const file of ['index.html','privacy/index.html','consent/index.html','operator/index.html']){
    const {document}=parseHTML(await readFile(path.join(root,'public',file),'utf8'));
    const targets=extracted.bindings.flatMap(binding=>binding.targets).filter(target=>target.file===file);
    for(const node of document.querySelectorAll('body *')){
      if(node.closest('script,style')||node.closest(typed))continue;
      for(const [index,child] of [...node.childNodes].entries())if(child.nodeType===3&&child.textContent.trim()){
        assert.ok(targets.some(target=>target.selector && [...document.querySelectorAll(target.selector)].includes(node) && (target.mode==='text'||target.mode==='text-node'&&target.childIndex===index)),`${file}: unbound text ${child.textContent}`);
      }
    }
  }
});

test('percent-encoded local media prefixes, UUIDs and extensions cannot bypass link validation', async () => {
  const {loadDefaultContent,validateContent,referencedMedia}=await modules();const seed=await loadDefaultContent();
  const media='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf';
  for(const alias of ['/%6dedia/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf','/m%65dia/92f97b08-69b5-4a81-a476-b23a6e35cb57.exe','/media/%392f97b08-69b5-4a81-a476-b23a6e35cb57.pdf','/media/92f97b08-69b5-4a81-a476-b23a6e35cb57%2epdf','/%256dedia/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf']){
    const nav=structuredClone(seed);nav.navigation.desktop[0].url=alias;assert.throws(()=>validateContent(nav),invalid,alias);
    const legal=structuredClone(seed);legal.pages[0].body+='\n\n[Документ]('+alias+')';assert.throws(()=>validateContent(legal),invalid,alias);
  }
  seed.navigation.desktop[0].url=media;seed.pages[0].body+='\n\n[Документ]('+media+')';
  assert.ok(referencedMedia(validateContent(seed)).has(media));
});

test('trusted explicit DOM and CSS ownership keeps all hidden application/program media private', async () => {
  const {loadDefaultContent,referencedMedia}=await modules();const seed=await loadDefaultContent();
  const registry=JSON.parse(await readFile(path.join(root,'content/content-bindings.json'),'utf8'));
  const field=registry.find(binding=>binding.kind==='background'&&binding.targets.some(target=>target.selector==='.field select'));
  const leaf=registry.find(binding=>binding.kind==='background'&&binding.targets.some(target=>target.selector==='.leaf-decoration'));
  assert.ok(field&&leaf);
  const urls=['/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.webp','/media/ae72ff37-60d2-4997-bb9f-dc7cd1b5b98f.webp'];
  seed.fields[field.id]=urls[0];seed.fields[leaf.id]=urls[1];seed.hiddenSections=['application','programs'];
  const all=referencedMedia(seed),visible=referencedMedia(seed,{publicOnly:true});
  urls.forEach(url=>{assert.ok(all.has(url));assert.equal(visible.has(url),false);});
  assert.ok(field.targets.every(target=>target.section==='application'));
  assert.ok(leaf.targets.every(target=>target.section==='programs'));
  for(const binding of registry)for(const target of binding.targets)assert.ok(Object.hasOwn(target,'section'),binding.id);
});

test('typed cards and galleries save incomplete drafts, validate publication and retain hidden media', async t => {
  const {store,api}=await fixture(t);const draft=store.getDraft();
  const base={title:'Новый блок',body:'',image:'',alt:'',imageFocus:{x:50,y:50},buttonLabel:'',buttonUrl:''};
  const media='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.webp';
  draft.content.extraSections.push({id:'new-cards',type:'cards',...base,items:[{id:'card-1',title:'',body:'Описание',icon:'info',image:media,alt:'Фото карточки',imageFocus:{x:20,y:30},buttonLabel:'',buttonUrl:''}]},{id:'new-gallery',type:'gallery',...base,items:[{id:'photo-1',image:'',alt:'',imageFocus:{x:50,y:50},caption:'Подпись'}]});
  draft.content.sectionOrder.push('new-cards','new-gallery');await store.saveDraft(draft.content,draft.revision);
  await assert.rejects(store.publish(store.getDraft().revision),invalid);
  const ready=store.getDraft();ready.content.extraSections[0].items[0].title='Карточка';Object.assign(ready.content.extraSections[1].items[0],{image:media,alt:'Описание фото'});
  await store.saveDraft(ready.content,ready.revision);await store.publish(store.getDraft().revision);
  assert.ok(api.referencedMedia(store.getPublished().content,{publicOnly:true}).has(media));
  const hidden=store.getDraft();hidden.content.hiddenSections.push('new-cards','new-gallery');
  await store.saveDraft(hidden.content,hidden.revision);await store.publish(store.getDraft().revision);
  assert.ok(store.references().has(media));assert.equal(api.referencedMedia(store.getPublished().content,{publicOnly:true}).has(media),false);
  const bad=store.getDraft().content;bad.extraSections[1].items[0].imageFocus.x=101;assert.throws(()=>api.validateContent(bad),invalid);
  bad.extraSections[1].items[0].imageFocus.x=50;bad.extraSections[1].items.push({...bad.extraSections[1].items[0]});assert.throws(()=>api.validateContent(bad),invalid);
});

test('main and per-page Open Graph fields validate images and keep archived share media private', async () => {
  const {loadDefaultContent,validateContent,referencedMedia}=await modules();const seed=await loadDefaultContent();
  assert.equal(seed.seo.ogImage,'');
  for(const page of seed.pages)for(const key of ['ogTitle','ogDescription','ogImage','ogType'])assert.ok(Object.hasOwn(page.seo,key),key);
  const publicImage='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.webp',privateImage='/media/ae72ff37-60d2-4997-bb9f-dc7cd1b5b98f.webp';
  seed.seo.ogImage=publicImage;seed.pages[0].seo.ogImage=publicImage;
  seed.pages.push({...structuredClone(seed.pages[0]),id:'future',slug:'future',seo:{...seed.pages[0].seo,ogImage:privateImage},status:'archived'});
  assert.ok(referencedMedia(validateContent(seed)).has(privateImage));assert.ok(referencedMedia(seed,{publicOnly:true}).has(publicImage));assert.equal(referencedMedia(seed,{publicOnly:true}).has(privateImage),false);
  seed.pages[0].seo.ogImage='javascript:alert(1)';assert.throws(()=>validateContent(seed),invalid);
  seed.pages[0].seo.ogImage='/media/92f97b08-69b5-4a81-a476-b23a6e35cb57.pdf';assert.throws(()=>validateContent(seed),invalid);
});

test('restricted Markdown supports safe ATX headings without accepting executable or unsupported markup', async () => {
  const {loadDefaultContent,validateContent}=await modules();const seed=await loadDefaultContent();
  seed.pages[0].body='# Заголовок\n\n## Раздел\n\n### Подраздел\n\n**Жирный** и *курсив*, [ссылка](/consent/).\n\n- Пункт';
  assert.doesNotThrow(()=>validateContent(seed));
  for(const body of ['# <script>alert(1)</script>','# [ссылка](javascript:alert(1))','```js\nalert(1)\n```','> Цитата','| a | b |']){seed.pages[0].body=body;assert.throws(()=>validateContent(seed),invalid);}
});
