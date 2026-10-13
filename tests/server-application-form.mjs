import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {loadDefaultContent,validateContent,contentDigest} from '../server/content-schema.mjs';
import {openContentStore} from '../server/content-store.mjs';
import {renderContentPage} from '../server/content-render.mjs';
import {createApplicationsWorkbook} from '../server/export.mjs';
import {openStore} from '../server/storage.mjs';
import * as intake from '../server/intake.mjs';
const model=await import('../server/application-form.mjs').catch(()=>({}));
const pure=await import('../public/assets/js/application-fields.js').catch(()=>({}));
const id='field-11111111-1111-4111-8111-111111111111';
const option='option-22222222-2222-4222-8222-222222222222';
function custom(type='text'){assert.equal(typeof pure.createCustomField,'function');return pure.createCustomField(type,{id,label:'Номер паспорта'});}
async function config(fields){const c=await loadDefaultContent();c.applicationForm={version:1,fields};return c;}
const invalid=e=>e.status===400;
const system={courseId:'drone',consent:'true',consentVersion:'test',contentRevision:'2',website:''};
const options=content=>({form:model.resolveFormFields(content),consentVersion:'test',contentRevision:2});
const pdf=field=>({field,mime:'application/pdf',name:field+'.pdf',data:Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')});
test('old content gains deterministic references without changing original or digest',async()=>{
 const c=await loadDefaultContent();delete c.applicationForm;const old=structuredClone(c),normalized=validateContent(c);
 assert.equal(normalized.applicationForm?.fields.length,10);assert.deepEqual(c,old);
 assert.deepEqual(normalized.applicationForm,model.defaultApplicationForm());assert.equal(contentDigest(c),contentDigest(normalized));
});
test('old store read leaves bytes revisions dirty and history untouched',async t=>{
 const dir=await mkdtemp(path.join('output','form-old-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let store=await openContentStore({dir});await store.close();const file=path.join(dir,'content-state.json'),raw=JSON.parse(await readFile(file,'utf8'));
 for(const item of [raw.draft,raw.published,...raw.history])delete item.content.applicationForm;
 const before=JSON.stringify(raw);await writeFile(file,before);store=await openContentStore({dir});t.after(()=>store.close());
 assert.equal(store.getDraft().content.applicationForm?.fields.length,10);assert.equal(store.getDraft().revision,1);assert.equal(store.getDraft().dirty,false);assert.equal(await readFile(file,'utf8'),before);
});
test('strict form shape rejects invalid IDs extra keys rules duplicates and file count',async()=>{
 const field=custom();assert.ok(model.validateApplicationForm({version:1,fields:[field]}));
 const cases=[{...field,id:'courseId'},{...field,script:'x'},{...field,rules:{format:'regex',minLength:0,maxLength:20}},{...field,enabled:'true'},{...field,label:'<b>x</b>'}];
 for(const f of cases)assert.throws(()=>model.validateApplicationForm({version:1,fields:[f]}),invalid);
 assert.throws(()=>model.validateApplicationForm({version:1,fields:[field,field]}),invalid);
 assert.throws(()=>model.validateApplicationForm({version:1,fields:Array.from({length:5},()=>pure.createCustomField('file'))}),invalid);
 assert.throws(()=>model.validateApplicationForm({version:1,fields:[{id:'email',kind:'builtin',enabled:true,required:true,type:'text'}]}),invalid);
});
test('all scalar rules preserve strings and false and validate optional nonempty values',()=>{
 let f=custom();f.rules={format:'digits',minLength:6,maxLength:6};assert.deepEqual(pure.validateFieldValue(f,'000123'),{ok:true,value:'000123'});assert.equal(pure.validateFieldValue(f,'00123').ok,false);
 f=custom('email');assert.equal(pure.validateFieldValue(f,'wrong').ok,false);assert.equal(pure.validateFieldValue(f,'').ok,true);
 f=custom('checkbox');assert.deepEqual(pure.validateFieldValue(f,undefined),{ok:true,value:false});f.required=true;assert.equal(pure.validateFieldValue(f,false).ok,false);
 f=custom('number');assert.deepEqual(pure.validateFieldValue(f,'0'),{ok:true,value:'0'});assert.equal(pure.validateFieldValue(f,'Infinity').ok,false);assert.equal(pure.validateFieldValue(f,'1000000000001').ok,false);
 f=custom('date');assert.equal(pure.validateFieldValue(f,'2025-02-29').ok,false);assert.equal(pure.validateFieldValue(f,'2024-02-29').ok,true);
 f=custom('select');f.rules.options=[{id:option,label:'Первый'}];assert.equal(pure.validateFieldValue(f,option).ok,true);assert.equal(pure.validateFieldValue(f,'Первый').ok,false);assert.equal(pure.formatFieldValue(f,option),'Первый');
 f=custom('textarea');assert.equal(pure.validateFieldValue(f,'x'.repeat(4001)).ok,false);
 f=custom('tel');assert.equal(pure.validateFieldValue(f,'abc').ok,false);
});
test('enabled empty options allowed only in draft and builtin aliases are canonical',async()=>{
 const f=custom('radio');model.validateApplicationForm({version:1,fields:[f]});assert.throws(()=>model.validateApplicationForm({version:1,fields:[f]},{forPublication:true}),invalid);
 const c=await loadDefaultContent(),meta=model.formBuiltinMetadata().find(f=>f.id==='lastName');assert.ok(meta.aliases.label);
 c.fields[meta.aliases.label]='Фамилия участника';assert.equal(model.resolveFormFields(c)[0].label,'Фамилия участника');
 assert.ok(model.formManagedBindingIds().has(meta.aliases.label));
});
test('collection changes require confirmation but order and presentation do not',async t=>{
 const store=await openContentStore({dir:'output/form-memory',persist:false});t.after(()=>store.close());let d=store.getDraft(),version=d.content.settings.intake.consentVersion;
 d.content.applicationForm.fields.reverse();d=await store.saveDraft(d.content,d.revision);await store.publish(d.revision);assert.equal(store.getPublished().content.settings.intake.consentVersion,version);
 d=store.getDraft();d.content.applicationForm.fields.push(custom());d=await store.saveDraft(d.content,d.revision);await assert.rejects(store.publish(d.revision),e=>e.code==='DOCUMENTS_CONFIRMATION_REQUIRED');await store.publish(d.revision,{documentsConfirmed:true});assert.notEqual(store.getPublished().content.settings.intake.consentVersion,version);
});
test('submission snapshots reject unknown hidden scalar and files and preserve server labels',async()=>{
 const f=custom();f.required=true;f.rules={format:'digits',minLength:6,maxLength:6};const c=await config([f]);assert.equal(typeof intake.validateSubmission,'function');
 const accepted=intake.validateSubmission({...system,[id]:'000123'},[],options(c));assert.equal(accepted.fields.formValues[id],'000123');assert.equal(accepted.fields.lastName,'');assert.equal(accepted.fields.formSnapshot.fields[0].label,f.label);
 f.label='Другое';assert.equal(accepted.fields.formSnapshot.fields[0].label,'Номер паспорта');
 for(const bad of [{...system},{...system,[id]:'123'},{...system,[id]:'000123',email:'x@example.test'}])assert.throws(()=>intake.validateSubmission(bad,[],options(c)),invalid);
 assert.throws(()=>intake.validateSubmission({...system,[id]:'000123'},[pdf('snilsFile')],options(c)),invalid);
 const upload=custom('file');upload.required=true;const fc=await config([upload]);const a=intake.validateSubmission(system,[{...pdf(id),fileLabel:'attacker'}],options(fc));assert.equal(a.files[0].fileLabel,upload.label);assert.equal(a.fields.formValues[id],true);
 assert.throws(()=>intake.validateSubmission(system,[],options(fc)),invalid);assert.throws(()=>intake.validateSubmission(system,[pdf(id),pdf(id)],options(fc)),invalid);
 upload.rules.accept=['png'];const onlyPng=await config([upload]);assert.throws(()=>intake.validateSubmission(system,[pdf(id)],options(onlyPng)),invalid);
});
test('encrypted storage preserves snapshot and file label after configuration removal',async t=>{
 const dir=await mkdtemp(path.join('output','form-app-')),key=randomBytes(32);const store=await openStore(dir,key);t.after(async()=>{store.close();await rm(dir,{recursive:true,force:true});});
 const f=custom('file'),c=await config([f]);const a=intake.validateSubmission(system,[pdf(id)],options(c));const appId=await store.save(a.fields,a.files);c.applicationForm.fields=[];
 const app=store.get(appId);assert.equal(app.formSnapshot.fields[0].label,f.label);assert.equal(app.documents[0].fileLabel,f.label);assert.equal(app.formValues[id],true);
 const bytes=await readFile(path.join(dir,'applications.sqlite'));assert.equal(bytes.includes(Buffer.from(f.label)),false);
});
test('SSR preserves default names selectors and authored bindings; reorder uses IDs',async()=>{
 const c=await loadDefaultContent(),template=await readFile('public/index.html','utf8');let html=renderContentPage({content:c,template,revision:8});let d=parseHTML(html).document;
 assert.equal(d.querySelector('.form-grid--three .field:first-child input').name,'lastName');const boot=JSON.parse(d.querySelector('#site-content').textContent);assert.equal(boot.applicationForm?.fields.length,10);assert.equal(d.querySelector('[name="contentRevision"]').value,'8');
 const meta=model.formBuiltinMetadata().find(f=>f.id==='education');c.fields[meta.aliases.label]='Ваше образование';c.applicationForm.fields.reverse();c.applicationForm.fields.push(custom());html=renderContentPage({content:c,template,revision:9});d=parseHTML(html).document;
 assert.equal(d.querySelector('.form-grid .field').dataset.fieldId,'educationFile');assert.equal(d.querySelector('label[for="education"]').childNodes[0].textContent.trim(),'Ваше образование');assert.ok(d.querySelector('[name="'+id+'"]'));assert.ok(d.querySelector('[name="consent"]'));assert.ok(d.querySelector('#change-course'));assert.equal(d.querySelectorAll('[name="courseId"]').length,1);
});
test('Excel uses historical values labels option text and literal zero false formula strings',()=>{
 const f=custom(),check={...custom('checkbox'),id:'field-33333333-3333-4333-8333-333333333333'},select={...custom('select'),id:'field-44444444-4444-4444-8444-444444444444',rules:{options:[{id:option,label:'Старый вариант'}]}};
 const rows=[{id:'old',createdAt:'2026-01-01',formSnapshot:{version:1,fields:[f,check,select]},formValues:{[id]:'000123',[check.id]:false,[select.id]:option}},{id:'new',createdAt:'2026-02-01',formSnapshot:{version:1,fields:[{...f,label:'Новая подпись'}]},formValues:{[id]:'=1+1'}}];
 const sheet=createApplicationsWorkbook(rows).worksheets[0];assert.equal(sheet.columnCount,17);assert.equal(sheet.getCell('O1').value,'Новая подпись');assert.equal(sheet.getCell('O2').value,'000123');assert.equal(sheet.getCell('P2').value,'Нет');assert.equal(sheet.getCell('Q2').value,'Старый вариант');assert.equal(sheet.getCell('O3').value,'=1+1');assert.equal(sheet.getCell('O3').type,3);assert.equal(sheet.autoFilter.to,'Q3');assert.equal(createApplicationsWorkbook([{id:'legacy'}]).worksheets[0].columnCount,14);
});
test('Excel more than 256 extra IDs uses complete normalized worksheet',()=>{
 const rows=Array.from({length:257},(_,i)=>{const f=custom();f.id='field-'+i;return {id:String(i),formSnapshot:{version:1,fields:[f]},formValues:{[f.id]:'0'}};});
 const workbook=createApplicationsWorkbook(rows);assert.equal(workbook.worksheets.length,2);const sheet=workbook.worksheets[1];assert.equal(sheet.rowCount,258);assert.equal(sheet.getCell('E258').value,'0');assert.equal(workbook.worksheets[0].columnCount,15);
});

import {Readable} from 'node:stream';
import {createApp} from '../server/app.mjs';
import {setupAdmin,totp} from '../server/security.mjs';
async function multipart(data,form){const request=new Request('http://localhost/',{method:'POST',body:data});const req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};return intake.parseMultipart(req,{form});}
test('multipart accepts zero through four configured files and exact scalar/file byte limits',async()=>{
 for(let count=0;count<=4;count++){
  const definitions=Array.from({length:count},()=>pure.createCustomField('file'));const data=new FormData();data.append('website','');for(const f of definitions)data.append(f.id,new Blob([pdf(f.id).data],{type:'application/pdf'}),'a.pdf');assert.equal((await multipart(data,definitions)).files.length,count);
 }
 const f=custom('file'),data=new FormData(),buffer=Buffer.alloc(pure.FORM_LIMITS.fileBytes,32);buffer.write('%PDF-1.4');buffer.write('%%EOF',buffer.length-5);data.append(id,new Blob([buffer],{type:'application/pdf'}),'exact.pdf');assert.equal((await multipart(data,[f])).files[0].data.length,buffer.length);
 const exact=new FormData();exact.append('value','x'.repeat(pure.FORM_LIMITS.scalarBytes));assert.equal((await multipart(exact,[])).fields.value.length,pure.FORM_LIMITS.scalarBytes);
});
test('multipart rejects duplicates oversized scalar parts and hidden files',async()=>{
 const duplicate=new FormData();duplicate.append('value','x');duplicate.append('value','y');await assert.rejects(multipart(duplicate,[]),invalid);
 const long=new FormData();long.append('value','x'.repeat(pure.FORM_LIMITS.scalarBytes+1));await assert.rejects(multipart(long,[]),invalid);
 const hidden=custom('file');hidden.enabled=false;const data=new FormData();data.append(id,new Blob([pdf(id).data],{type:'application/pdf'}),'a.pdf');await assert.rejects(multipart(data,[hidden]),invalid);
 const tooMany=new FormData();for(let i=0;i<51;i++)tooMany.append('a'+i,'x');await assert.rejects(multipart(tooMany,[]),invalid);
});
test('all legacy text aliases follow their own controls after reorder and shared icons stay unmanaged',async()=>{
 const c=await loadDefaultContent(),meta=model.formBuiltinMetadata();const values=new Map();
 for(const builtin of meta)for(const [role,binding]of Object.entries(builtin.aliases)){const value=role==='marker'?'!':'Текст '+builtin.id+' '+role;c.fields[binding]=value;values.set(binding,value);}
 c.applicationForm.fields.reverse();const html=renderContentPage({content:c,template:await readFile('public/index.html','utf8')}),d=parseHTML(html).document;
 for(const builtin of meta){const field=d.querySelector('[data-field-id="'+builtin.id+'"]');assert.ok(field.textContent.includes(values.get(builtin.aliases.label)));if(builtin.aliases.placeholder){const control=field.querySelector('[name]');assert.equal(control.tagName==='SELECT'?control.querySelector('option').textContent:control.getAttribute('placeholder'),values.get(builtin.aliases.placeholder));}for(const role of ['hint','uploadLabel','marker'])if(builtin.aliases[role])assert.ok(field.textContent.includes(values.get(builtin.aliases[role])));}
 const {contentDefinitions}=await import('../server/content-routes.mjs');const defs=contentDefinitions();assert.ok(defs.fields.filter(b=>b.kind==='icon').every(b=>!model.formManagedBindingIds().has(b.id)));assert.equal(defs.applicationForm.builtins.length,10);
});
test('configuration limits bounds optional builtins and all boolean/choice types are strict',async()=>{
 const reject=fields=>assert.throws(()=>model.validateApplicationForm({version:1,fields}),invalid);
 reject(Array.from({length:41},()=>pure.createCustomField('text')));
 for(const type of ['date','number']){const f=custom(type);f.rules={min:type==='date'?'2025-02-30':NaN,max:null};reject([f]);f.rules={min:type==='date'?'2025-03-01':5,max:type==='date'?'2025-02-28':4};reject([f]);}
 const f=custom('select');f.rules.options=[{id:option,label:'Один'},{id:option,label:'Два'}];reject([f]);
 for(const [key,limit]of [['label',500],['hint',2000],['placeholder',500]])reject([{...custom(),[key]:'a'.repeat(limit+1)}]);
 const c=await config([{id:'snils',kind:'builtin',enabled:true,required:false}]);assert.equal(intake.validateSubmission(system,[],options(c)).fields.snils,'');assert.throws(()=>intake.validateSubmission({...system,snils:'000'},[],options(c)),invalid);
 const b=custom('checkbox');assert.equal(pure.validateFieldValue(b,'0').ok,false);assert.equal(pure.validateFieldValue(b,'false').value,false);
 const r=custom('radio');r.required=true;r.rules.options=[{id:option,label:'Вариант'}];assert.equal(pure.validateFieldValue(r,option).ok,true);assert.equal(pure.validateFieldValue(r,undefined).ok,false);
});
test('HTTP published form config, stale revision under mutation gate, private snapshots and restart',async t=>{
 const dir=await mkdtemp(path.join('output','form-http-')),key=randomBytes(32),secret=randomBytes(20);await setupAdmin(dir,key,'form-editor','synthetic-form-password-852!',secret);let app,origin,cookie='',csrf='';
 const start=async()=>{app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;};
 const stop=async()=>{await new Promise(r=>app.server.close(r));await app.close();app=null;};
 const req=async(url,opts={})=>{const res=await fetch(origin+url,{...opts,headers:{cookie,origin,'x-csrf-token':csrf,...opts.headers}});if(res.headers.getSetCookie().length)cookie=res.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');return res;};
 const login=async()=>{csrf=(await(await req('/api/csrf')).json()).token;const res=await req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'form-editor',password:'synthetic-form-password-852!',otp:totp(secret)})});assert.equal(res.status,200);csrf=(await res.json()).csrfToken;};
 t.after(async()=>{if(app)await stop();await rm(dir,{recursive:true,force:true});});await start();await login();const {store,media}=await app.getContentServices();let draft=store.getDraft();const field=custom();field.required=true;field.rules={format:'digits',minLength:6,maxLength:6};draft.content.applicationForm.fields=[field];draft.content.settings.intake.deadline='';draft=await store.saveDraft(draft.content,draft.revision);
 assert.equal((await(await req('/api/config')).json()).applicationForm.fields.length,10);await media.publish(draft.revision,{documentsConfirmed:true});let published=store.getPublished();
 const form=()=>{const data=new FormData();for(const [k,v]of Object.entries({...system,contentRevision:String(published.revision),consentVersion:published.content.settings.intake.consentVersion,[id]:'000123'}))data.append(k,v);return data;};
 const response=await req('/api/applications',{method:'POST',body:form()});assert.equal(response.status,201,await response.clone().text());const applicationId=(await response.json()).id;
 const detail=await(await req('/api/admin/applications/'+applicationId)).json();assert.equal(detail.formValues[id],'000123');assert.equal(detail.lastName,'');assert.equal(detail.formSnapshot.fields[0].label,'Номер паспорта');assert.ok(!JSON.stringify(await(await req('/api/config')).json()).includes('000123'));
 const compact=await(await req('/api/admin/applications')).json();assert.ok(!JSON.stringify(compact).includes('000123'));
 // Simulate a publication at the existing mutation gate after parsing/validation.
 const run=media.withMutation;let changed=false;media.withMutation=async operation=>{if(!changed){changed=true;let next=store.getDraft();next.content.applicationForm.fields=[];next=await store.saveDraft(next.content,next.revision);await media.publish(next.revision,{documentsConfirmed:true});}return run(operation);};
 const stale=await req('/api/applications',{method:'POST',body:form()});assert.equal(stale.status,409);assert.equal((await stale.json()).code,'CONTENT_CHANGED');media.withMutation=run;
 assert.equal((await(await req('/api/admin/applications')).json()).total,1);const snapshot=(await(await req('/api/admin/applications/'+applicationId)).json()).formSnapshot;await stop();await start();
 const stored=await openStore(dir,key);try{assert.deepEqual(stored.get(applicationId).formSnapshot,snapshot);assert.equal(stored.get(applicationId).formValues[id],'000123');}finally{stored.close();}
 assert.equal((await(await req('/api/config')).json()).applicationForm.fields.length,0);
});
test('shared consent shape ignores presentation and ordering but includes labels rules and enabled collection',async()=>{
 assert.equal(typeof pure.formConsentShape,'function');const c=await loadDefaultContent(),a=model.resolveFormFields(c);const before=pure.formConsentShape(a),moved=structuredClone(a).reverse();moved[0].hint='Другая подсказка';moved[0].placeholder='Другой пример';assert.deepEqual(pure.formConsentShape(moved),before);
 moved[0].label='Другая подпись';assert.notDeepEqual(pure.formConsentShape(moved),before);assert.notDeepEqual(pure.formConsentShape(a.slice(1)),before);
 const metadata=model.formBuiltinMetadata();assert.equal(typeof pure.resolveFormDefinitions,'function');assert.deepEqual(pure.resolveFormDefinitions(c,metadata),a);assert.deepEqual(model.formCollectionSignature(c),before);
 const alias=metadata[0].aliases.label;c.fields[alias]='Другая фамилия';assert.notDeepEqual(pure.formConsentShape(pure.resolveFormDefinitions(c,metadata)),before);
});
test('resolved builtin aliases obey the same public label hint and placeholder limits',async()=>{
 const c=await loadDefaultContent(),metadata=model.formBuiltinMetadata();for(const [role,max]of [['label',500],['hint',2000],['placeholder',500]]){
  const target=metadata.find(f=>f.aliases[role]);const copy=structuredClone(c);copy.fields[target.aliases[role]]='x'.repeat(max+1);assert.throws(()=>validateContent(copy),invalid);
 }
});
test('multipart gives stale rendered revision precedence over removed file schema',async()=>{
 const data=new FormData();data.append('contentRevision','2');data.append('snilsFile',new Blob([pdf('snilsFile').data],{type:'application/pdf'}),'old.pdf');
 const request=new Request('http://localhost/',{method:'POST',body:data}),req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};
 await assert.rejects(intake.parseMultipart(req,{form:[],contentRevision:3}),e=>e.code==='CONTENT_CHANGED');
});
test('multipart accepts exactly fifty scalar parts plus four files',async()=>{
 const data=new FormData(),definitions=Array.from({length:4},()=>pure.createCustomField('file'));for(let i=0;i<50;i++)data.append('value'+i,'x');for(const f of definitions)data.append(f.id,new Blob([pdf(f.id).data],{type:'application/pdf'}),'a.pdf');const result=await multipart(data,definitions);assert.equal(Object.keys(result.fields).length,50);assert.equal(result.files.length,4);
});
test('preview multipart keeps the explicit forbidden-intake response',async()=>{
 const data=new FormData();data.append('contentRevision','preview');data.append('submissionContext','preview');const request=new Request('http://localhost/',{method:'POST',body:data}),req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};await assert.rejects(intake.parseMultipart(req,{form:[],contentRevision:3}),e=>e.status===403&&e.code==='PREVIEW_INTAKE_DISABLED');
});
test('semantic text formats cannot configure impossible name or SNILS lengths',()=>{
 for(const rules of [{format:'name',minLength:81,maxLength:2000},{format:'snils',minLength:12,maxLength:14},{format:'snils',minLength:0,maxLength:10}])assert.throws(()=>model.validateApplicationForm({version:1,fields:[{...custom(),rules}]}),invalid);
 assert.throws(()=>model.validateApplicationForm({version:1,fields:[{...custom(),required:true,rules:{format:'plain',minLength:0,maxLength:0}}]},{forPublication:true}),invalid);
 const f=custom();f.rules={format:'snils',minLength:11,maxLength:11};model.validateApplicationForm({version:1,fields:[f]});assert.deepEqual(pure.validateFieldValue(f,'112-233-445 95'),{ok:true,value:'11223344595'});assert.deepEqual(pure.validateFieldValue(f,'11223344595'),{ok:true,value:'11223344595'});
});
