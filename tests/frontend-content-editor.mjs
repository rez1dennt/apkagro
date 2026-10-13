import test from 'node:test';
import assert from 'node:assert/strict';
const helpers=await import('../public/assets/js/admin-content-state.js').catch(()=>({}));
test('repeatable CRUD keeps permanent IDs, deep clones children, and reorders without loss',()=>{
 assert.equal(typeof helpers.createRecord,'function','editor record helpers exist');
 const first=helpers.createRecord('programs'), second=helpers.createRecord('programs');
 assert.match(first.id,/^[a-z0-9][a-z0-9_-]{0,63}$/);assert.notEqual(first.id,second.id);
 first.topics.push('Практика');const clone=helpers.cloneRecord(first);assert.notEqual(first.id,clone.id);clone.topics.push('Другая тема');assert.equal(first.topics.length,1);
 const block=helpers.createRecord('extraSections','cards');block.items.push(helpers.createRecord('cards'));const copy=helpers.cloneRecord(block);assert.notEqual(copy.items[0].id,block.items[0].id);
 const list=[first,second];helpers.moveRecord(list,first.id,1);assert.deepEqual(list.map(x=>x.id),[second.id,first.id]);helpers.removeRecord(list,second.id);assert.equal(list[0],first);
});
test('save acknowledgement preserves edits typed while request is pending and failure keeps local content',()=>{
 assert.equal(typeof helpers.createDraftState,'function');
 const state=helpers.createDraftState({revision:1,content:{fields:{title:'Первый'}},dirty:false});
 state.content.fields.title='Отправлено';const sent=state.snapshot();state.content.fields.title='Печатаю дальше';state.accept({...sent,revision:2,content:sent.content,dirty:true},sent.content);
 assert.equal(state.content.fields.title,'Печатаю дальше');assert.equal(state.envelope.revision,2);assert.equal(state.unsaved,true);
 const local=state.snapshot();assert.equal(local.content.fields.title,'Печатаю дальше');assert.equal(state.unsaved,true);
 state.accept({revision:3,content:local.content,dirty:true},local.content);assert.equal(state.unsaved,false);
});
test('fixed organization chips split captions without changing required template tokens',()=>{
 assert.equal(typeof helpers.splitTemplate,'function');
 const parts=helpers.splitTemplate('ИНН {{settings.organization.inn}}, лицензия {{settings.organization.license}}');
 assert.deepEqual(parts.filter(x=>x.token).map(x=>x.token),['{{settings.organization.inn}}','{{settings.organization.license}}']);
 assert.equal(parts.map(x=>x.token||x.text).join(''),'ИНН {{settings.organization.inn}}, лицензия {{settings.organization.license}}');
});
test('rich toolbar formats selected text and rejects unsafe links without changing input',async()=>{
 const rich=await import('../public/assets/js/admin-content-richtext.js').catch(()=>({}));assert.equal(typeof rich.formatSelection,'function');
 assert.equal(rich.formatSelection('Текст',0,5,'bold').value,'**Текст**');assert.equal(rich.formatSelection('Раз\nДва',0,7,'ordered').value,'1. Раз\n2. Два');
 assert.throws(()=>rich.formatSelection('Текст',0,5,'link','javascript:alert(1)'),/ссыл/);assert.equal(rich.formatSelection('Текст',0,5,'link','/privacy/').value,'[Текст](/privacy/)');
});
test('form bindings stay attached after save and all six new templates validate as incomplete drafts',async()=>{
 const initial={revision:1,content:{fields:{title:'Первый'},settings:{intake:{consentVersion:'v1'}}}};
 const state=helpers.createDraftState(initial),bound=state.content.fields;bound.title='Второй';state.accept({revision:2,content:structuredClone(state.content)},state.snapshot().content);bound.title='Третий';assert.equal(state.content.fields.title,'Третий');assert.equal(state.unsaved,true);
 const {loadDefaultContent,validateContent}=await import('../server/content-schema.mjs');for(const kind of ['text','image','cta','faq','cards','gallery']){const content=await loadDefaultContent(),record=helpers.createRecord('extraSections',kind);if(['faq','cards','gallery'].includes(kind))record.items.push(helpers.createRecord(kind));content.extraSections.push(record);content.sectionOrder.push(record.id);assert.doesNotThrow(()=>validateContent(content));}
});
test('late CMS responses after logout cannot repopulate content or a newer session',async()=>{
 const {parseHTML}=await import('linkedom'),{createContentAdmin}=await import('../public/assets/js/admin-content.js');
 const {document,window}=parseHTML('<div id="cms-root"></div><main id="applications-panel"></main><nav id="cms-navigation"></nav><select id="cms-mobile-navigation"></select>');
 Object.defineProperty(document.querySelector('#cms-mobile-navigation'),'value',{value:'',writable:true});
 const oldDocument=globalThis.document,oldWindow=globalThis.window;globalThis.document=document;globalThis.window=window;let resolve;const pending=new Promise(r=>resolve=r);let reads=0;
 try{const editor=createContentAdmin({api:()=>{reads++;return pending;}});editor.setAuthenticated(true);editor.setAuthenticated(false);resolve({revision:1,content:{fields:{secret:'late secret'}}});await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('#cms-root').textContent.includes('late secret'),false);assert.equal(document.querySelectorAll('#cms-root input,#cms-root textarea').length,0);assert.equal(reads,2,'old response cannot start a published-version request');editor.cleanup();}finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
test('an old CMS load cannot overwrite the revision of a newer authenticated session',async()=>{
 const {parseHTML}=await import('linkedom'),{createContentAdmin}=await import('../public/assets/js/admin-content.js');const {document,window}=parseHTML('<div id="cms-root"></div><main id="applications-panel"></main><nav id="cms-navigation"></nav><select id="cms-mobile-navigation"></select>');Object.defineProperty(document.querySelector('#cms-mobile-navigation'),'value',{value:'',writable:true});
 const previous={document:globalThis.document,window:globalThis.window};globalThis.document=document;globalThis.window=window;let old=true,resolve;const pending=new Promise(r=>resolve=r),fresh={revision:9,publishedRevision:9,content:{fields:{title:'Новая сессия'},settings:{intake:{consentVersion:'v9'}}}};
 try{const editor=createContentAdmin({api:url=>old?pending:Promise.resolve(url.endsWith('/definitions')?{groups:[],fields:[]}:fresh)});editor.setAuthenticated(true);editor.setAuthenticated(false);old=false;editor.setAuthenticated(true);await new Promise(r=>setImmediate(r));assert.match(document.querySelector('.cms-version').textContent,/Черновик №9/);resolve({...fresh,revision:1});await new Promise(r=>setImmediate(r));assert.match(document.querySelector('.cms-version').textContent,/Черновик №9/);editor.cleanup();}finally{globalThis.document=previous.document;globalThis.window=previous.window;}
});
test('malformed successful save response cannot corrupt the local revision or unsaved edits',()=>{
 const state=helpers.createDraftState({revision:4,content:{fields:{title:'Сохранено'}}});state.content.fields.title='Мои изменения';assert.throws(()=>state.accept({},state.snapshot().content));assert.equal(state.envelope.revision,4);assert.equal(state.content.fields.title,'Мои изменения');assert.equal(state.unsaved,true);
});
test('media usage resolves historical names from their saved revision, not current array indexes',async()=>{
 const {parseHTML}=await import('linkedom'),{createMediaLibrary}=await import('../public/assets/js/admin-content-media.js');const {document}=parseHTML('<div id="library"></div>'),previous=globalThis.document;globalThis.document=document;
 const record={id:'11111111-1111-4111-8111-111111111111',url:'/media/11111111-1111-4111-8111-111111111111.webp',kind:'image',ext:'webp',title:'Фото',alt:'',size:12,locations:[{source:'history',revision:2,path:'programs[0].image'}]};
 try{const library=createMediaLibrary({api:async url=>url==='/api/admin/media'?{media:[record]}:{content:{programs:[{title:'Прежний курс'}]}},getContent:()=>({programs:[{title:'Текущий другой курс'}]}),isActive:()=>true,onError(){}});await library.mount(document.querySelector('#library'));const usage=document.querySelector('.cms-media-card details');usage.open=true;usage.dispatchEvent(new document.defaultView.Event('toggle'));await new Promise(r=>setImmediate(r));assert.match(usage.textContent,/Прежний курс/);assert.doesNotMatch(usage.textContent,/Текущий другой курс/);library.clear();}finally{globalThis.document=previous;}
});
