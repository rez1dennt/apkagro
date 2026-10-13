import test from 'node:test';
import assert from 'node:assert/strict';
const helpers=await import('../public/assets/js/admin-content-state.js').catch(()=>({}));
test('program-managed modal image fields are not offered as ineffective common editor controls',async()=>{
 const {parseHTML}=await import('linkedom'),{bindingFields}=await import('../public/assets/js/admin-content-fields.js');
 const previous=globalThis.document;globalThis.document=parseHTML('<html><body></body></html>').document;
 try {
  const field={id:'placeholder',label:'Фото',group:'common',kind:'text',maxLength:100};
  const node=bindingFields({groups:[{id:'common',label:'Общее'}],fields:[{...field,managedBy:'programs'}, {...field,id:'caption'}]},{content:{fields:{placeholder:'Фото программы',caption:'Подпись'}},change(){}});
  assert.equal(node.querySelectorAll('[data-content-path="fields.placeholder"]').length,0);
  assert.equal(node.querySelectorAll('[data-content-path="fields.caption"]').length,1);
 }finally{globalThis.document=previous;}
});
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

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function editorDom(){
 const {parseHTML}=await import('linkedom');
 const {document,window}=parseHTML('<body><div id="cms-root"></div><main id="applications-panel"></main><nav id="cms-navigation"></nav><select id="cms-mobile-navigation"></select><div id="library"></div></body>');
 const previous={document:globalThis.document,window:globalThis.window};globalThis.document=document;globalThis.window=window;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this._value||'';},set(value){this._value=value;},configurable:true});
 window.HTMLElement.prototype.setCustomValidity=function(){};window.HTMLElement.prototype.checkValidity=function(){return true;};window.HTMLElement.prototype.reset=function(){};
 window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const click=(label,scope=document)=>{const node=[...scope.querySelectorAll('button')].find(n=>n.textContent===label);assert.ok(node,'button '+label);node.click();};
 const input=(node,value)=>{assert.ok(node);node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}));};
 return {document,window,click,input,tab:key=>document.querySelector('[data-tab="'+key+'"]').click(),close(){globalThis.document=previous.document;globalThis.window=previous.window;}};
}
function editorEnvelope(){return {revision:1,publishedRevision:1,dirty:false,content:{schemaVersion:1,fields:{},navigation:{desktop:[],mobile:[],footer:[]},benefits:[],steps:[],faqs:[],programs:[],pages:[],sectionOrder:[],hiddenSections:[],extraSections:[],settings:{intake:{consentVersion:'v1'}},documents:{},seo:{title:'Сохранённый заголовок'},messages:{}}};}
const editorDefinitions={groups:[],fields:[],collections:{benefits:{label:'Преимущества'},steps:{label:'Шаги'},faqs:{label:'Вопросы'}}};
for(const operation of ['restore','reload'])test('delayed '+operation+' cannot replace edits made after confirmation',async()=>{
 const f=await editorDom(),{createContentAdmin}=await import('../public/assets/js/admin-content.js'),pending=deferred(),initial=editorEnvelope();let contentReads=0;
 const api=async(url,options={})=>{if(url.endsWith('/definitions'))return editorDefinitions;if(url.endsWith('/restore'))return pending.promise;if(url.endsWith('/history'))return {versions:[{revision:1}]};if(url==='/api/admin/content'&&options.method==='PUT')throw Object.assign(new Error('Конфликт'),{code:'CONTENT_REVISION_CONFLICT'});if(url==='/api/admin/content'&&++contentReads>1)return pending.promise;return structuredClone(initial);};
 const editor=createContentAdmin({api});try{
  editor.setAuthenticated(true);await tick();
  if(operation==='restore'){f.tab('history');await tick();f.click('Восстановить в черновик');f.click('Восстановить в черновик',f.document.querySelector('.cms-dialog'));}
  else{f.tab('settings');f.input(f.document.querySelector('[data-content-path="seo.title"]'),'Изменение до конфликта');f.click('Сохранить черновик');await tick();f.click('Загрузить актуальный черновик');f.click('Загрузить актуальный черновик',f.document.querySelector('.cms-dialog'));}
  await tick();f.tab('settings');const input=f.document.querySelector('[data-content-path="seo.title"]');f.input(input,'Новая правка во время запроса');
  const incoming=structuredClone(initial);incoming.revision=2;incoming.content.seo.title='Восстановленная версия';pending.resolve(incoming);await tick();
  assert.equal(input.isConnected,true,'completion must retain the active edited control');assert.equal(f.document.querySelector('[data-content-path="seo.title"]').value,'Новая правка во время запроса');assert.equal(editor.hasUnsaved(),true);assert.match(f.document.querySelector('.cms-version').textContent,/№2/);
 }finally{editor.cleanup();f.close();}
});
const mediaRecord=(id='11111111-1111-4111-8111-111111111111')=>({id,url:'/media/'+id+'.webp',kind:'image',ext:'webp',title:'Сохранённое фото',alt:'Сохранённое описание',size:12,locations:[]});
test('media metadata survives filtering and tab remount and participates in leave guards',async()=>{
 const f=await editorDom(),{createContentAdmin}=await import('../public/assets/js/admin-content.js'),initial=editorEnvelope(),record=mediaRecord();const editor=createContentAdmin({api:async url=>url==='/api/admin/media'?{media:[structuredClone(record)]}:url.endsWith('/definitions')?editorDefinitions:structuredClone(initial)});
 try{editor.setAuthenticated(true);await tick();f.tab('media');await tick();f.input(f.document.querySelector('.cms-media-card label input'),'Мой несохранённый заголовок');const search=f.document.querySelector('input[type=search]');f.input(search,'Нет совпадений');f.input(search,'');assert.equal(f.document.querySelector('.cms-media-card label input').value,'Мой несохранённый заголовок');assert.equal(editor.hasUnsaved(),true);
  f.tab('applications');f.tab('media');await tick();assert.equal(f.document.querySelector('.cms-media-card label input').value,'Мой несохранённый заголовок');
  const leaving=editor.confirmLeave();await tick();assert.ok(f.document.querySelector('.cms-dialog'),'media changes must warn on logout');f.click('Закрыть',f.document.querySelector('.cms-dialog .cms-actions'));assert.equal(await leaving,false);
  const event=new f.window.Event('beforeunload',{cancelable:true});f.window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
  f.tab('settings');f.click('Сохранить черновик');await tick();assert.match(f.document.querySelector('.cms-status').textContent,/подписи.*не сохранены/i,'content save must not claim to save media metadata');
 }finally{editor.cleanup();f.close();}
});
test('media upload/delete refresh retain metadata input nodes and PATCH reconciles only submitted values',async()=>{
 const f=await editorDom(),{createMediaLibrary}=await import('../public/assets/js/admin-content-media.js'),patch=deferred(),upload=deferred(),record=mediaRecord(),other=mediaRecord('22222222-2222-4222-8222-222222222222');let records=[record],submitted,patchCalls=0;
 const library=createMediaLibrary({api:async(url,options={})=>{if(options.method==='PATCH'){submitted=JSON.parse(options.body);patchCalls++;return patchCalls===1?patch.promise:{...record,...submitted};}if(options.method==='POST')return upload.promise;if(options.method==='DELETE'){records=[record];return {deleted:true};}return {media:structuredClone(records)};},isActive:()=>true,onError(){}});
 try{await library.mount(f.document.querySelector('#library'));const original=f.document.querySelector('.cms-media-card label input');f.input(original,'Отправляемое название');
  const file=f.document.querySelector('input[type=file]');Object.defineProperty(file,'files',{value:[new File(['synthetic'],'new.png',{type:'image/png'})]});f.document.querySelector('.cms-upload').dispatchEvent(new f.window.Event('submit',{cancelable:true}));records=[other,record];upload.resolve(other);await tick();assert.ok(f.document.querySelector('[data-media-id="'+record.id+'"] label input')===original,'upload must not replace focused metadata inputs');assert.equal(original.value,'Отправляемое название');
  f.click('Удалить файл',f.document.querySelector('[data-media-id="'+other.id+'"]'));f.click('Удалить файл',f.document.querySelector('.cms-dialog'));await tick();assert.ok(f.document.querySelector('[data-media-id="'+record.id+'"] label input')===original,'deleting another file must preserve input nodes');
  f.click('Сохранить подписи',f.document.querySelector('[data-media-id="'+record.id+'"]'));await tick();f.input(original,'Допечатано во время PATCH');const altInput=f.document.querySelectorAll('[data-media-id="'+record.id+'"] label input')[1];f.input(altInput,'Описание во время PATCH');patch.resolve({...record,...submitted});await tick();assert.equal(original.value,'Допечатано во время PATCH');assert.equal(altInput.value,'Описание во время PATCH');assert.equal(library.hasUnsaved(),true);
  await library.mount(f.document.querySelector('#library'));assert.equal(f.document.querySelector('.cms-media-card label input').value,'Допечатано во время PATCH');assert.equal(library.hasUnsaved(),true);await library.savePending();assert.equal(library.hasUnsaved(),false,'explicit metadata save acknowledges the remaining edits');
 }finally{library.clear();f.close();}
});
test('malformed media PATCH acknowledgement keeps the pending title and alt',async()=>{
 const f=await editorDom(),{createMediaLibrary}=await import('../public/assets/js/admin-content-media.js'),record=mediaRecord();const library=createMediaLibrary({api:async(url,options={})=>options.method==='PATCH'?{}:{media:[record]},isActive:()=>true});
 try{await library.mount(f.document.querySelector('#library'));const inputs=f.document.querySelectorAll('.cms-media-card label input');f.input(inputs[0],'Мой заголовок');f.input(inputs[1],'Моё описание');f.click('Сохранить подписи');await tick();assert.equal(inputs[0].value,'Мой заголовок');assert.equal(inputs[1].value,'Моё описание');assert.equal(library.hasUnsaved(),true);}finally{library.clear();f.close();}
});
