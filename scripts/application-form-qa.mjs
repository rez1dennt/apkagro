import {monitorBrowser} from './browser-resource-monitor.mjs';
/** Synthetic form-builder stress QA. No .env, live server or participant data. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Readable,PassThrough} from 'node:stream';
import http from 'node:http';
import {createApp} from '../server/app.mjs';
import {setupAdmin,totp} from '../server/security.mjs';
import {createCustomField,FIELD_TYPES,FORM_LIMITS} from '../public/assets/js/application-fields.js';
import {resolveFormFields,validateApplicationForm,formBuiltinMetadata} from '../server/application-form.mjs';
import {parseMultipart,validateSubmission,createScannerGuard,scanBuffer} from '../server/intake.mjs';
import {measureContent} from './catalog-fixtures.mjs';
import {openStore} from '../server/storage.mjs';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('output/form-builder/task-3-browser');await mkdir(output,{recursive:true});
const dir=await mkdtemp(path.join(output,'owned-fixture-')),key=randomBytes(32),secret=randomBytes(20);
const result={source:process.env.QA_SOURCE_COMMIT||'working tree',checks:[],cases:[],screenshots:[],runtimeErrors:[],consoleErrors:[],failedRequests:[],cleanup:false};
const functionalOnly=process.argv.includes('--functional-only');
let app,browser,origin,store,media,page,admin;
const check=(value,label)=>{assert.ok(value,label);result.checks.push(label);};
const persist=()=>writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));
const start=async()=>{app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+app.server.address().port;({store,media}=await app.getContentServices());result.ownedPorts??=[];result.ownedPorts.push(app.server.address().port);};
const stop=async()=>{if(app?.server.listening)await new Promise(r=>app.server.close(r));await app?.close();app=null;};
const publish=async content=>{const draft=store.getDraft();const saved=await store.saveDraft(content,draft.revision);return media.publish(saved.revision,{documentsConfirmed:true});};
const snap=async(name,p=page,locator=null)=>{const file=path.join(output,name+'.png');await(locator||p).screenshot({path:file});result.screenshots.push(file);};
const geometry=async(p,scope,label)=>{const m=await p.evaluate(measureContent,scope);m.intentionalOverflow=m.issues.filter(x=>x.node==='div.cms-preview-viewport'&&x.own&&!x.outside&&!x.verticalClip&&!x.textOutside);m.issues=m.issues.filter(x=>!m.intentionalOverflow.includes(x));if(m.intentionalOverflow.length)check(await p.locator('.cms-preview-frame').evaluate(n=>n.getBoundingClientRect().width<=n.parentElement.clientWidth+1),label+' scaled preview visually fits');result.cases.push({name:label,geometry:m});await persist();if(m.issues.length)await snap(label+'-geometry-failure',p,p.locator(scope));check(m.documentWidth<=m.viewport,label+' document fits');check(!m.issues.length,label+' nested geometry '+JSON.stringify(m.issues.slice(0,3)));};
const monitors=[];const monitor=p=>{p.setDefaultTimeout(12000);const monitoring=monitorBrowser(p,result);monitors.push(monitoring);return monitoring;};
const tab=async id=>{if(await admin.locator('#cms-mobile-navigation').isVisible())await admin.locator('#cms-mobile-navigation').selectOption(id);else await admin.locator('#cms-navigation button').nth(['applications','content','programs','form','media','pages','settings','history'].indexOf(id)).click();};
const ready=async()=>{await page.goto(origin,{waitUntil:'networkidle'});if(await page.locator('#cookie-banner').isVisible())await page.locator('#cookie-acknowledge').click();await page.locator('[data-course=flowers]').click();await page.locator('#choose-course').click();await page.locator('#consent').check();};
const pdf=Buffer.from('%PDF-1.4\nsynthetic QA fixture\n%%EOF');
const files={pdf:{name:'owned.pdf',mimeType:'application/pdf',buffer:pdf}};
const multipart=async(data,definitions)=>{const request=new Request('http://fixture.test/',{method:'POST',body:data});const req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};return parseMultipart(req,{form:definitions});};
const bad=e=>e.status===400;
const syntheticText=(name,n,mode)=>mode==='token'?'Ж'.repeat(n):(name+' — '+('дополнительные сведения об участии и обучении '.repeat(100))).slice(0,n).trim();
function fixture(original,count,mode){
 const c=structuredClone(original);c.applicationForm.fields=Array.from({length:count},(_,i)=>{
  const f=createCustomField(FIELD_TYPES[i%FIELD_TYPES.length],{label:syntheticText('Поле '+(i+1),mode==='natural'?80:500,mode)});
  f.hint=syntheticText('Пояснение к полю',mode==='natural'?160:2000,mode);f.placeholder=syntheticText('Введите ответ',mode==='natural'?35:500,mode);
  if(['select','radio'].includes(f.type))f.rules.options=[{id:'option-'+randomUUID(),label:syntheticText('Выбор участника',mode==='natural'?80:500,mode)},{id:'option-'+randomUUID(),label:syntheticText('Другой вариант',mode==='natural'?80:500,mode)}];
  if(f.type==='number')f.rules={min:-0.25,max:1.75};
  return f;
 });return c;
}
async function fillTypes(definitions){
 for(const f of definitions){const input=page.locator('#'+f.id);switch(f.type){
 case'text':await input.click();await input.pressSequentially('000123');break;
 case'textarea':await input.fill('Первая строка\nВторая строка');break;
 case'email':await input.fill('synthetic@example.test');break;
 case'tel':await input.click();await input.pressSequentially('+442079460123');break;
 case'date':await input.fill('2024-02-29');break;
 case'number':await input.click();await input.pressSequentially('0.5');break;
 case'select':await input.selectOption(f.rules.options[0].id);break;
 case'radio':await page.locator('.field[data-field-id="'+f.id+'"] input').first().click();await page.keyboard.press('ArrowRight');break;
 case'checkbox':break;
 case'file':await input.setInputFiles(files.pdf);break;
 }}
}
try{
 await setupAdmin(dir,key,'stress-editor','synthetic-stress-password!',secret);await start();const original=structuredClone(store.getDraft().content);original.settings.intake.deadline='';
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')});
 // Inject failures in a separate owned browser page to verify the monitor itself.
 const probePage=await browser.newPage(),probeResult={runtimeErrors:[],consoleErrors:[],failedRequests:[],httpErrors:[]},probeMonitor=monitorBrowser(probePage,probeResult);
 await probePage.goto(origin);await probePage.route(origin+'/__qa-monitor/**',route=>route.fulfill({status:route.request().url().endsWith('/api500')?500:route.request().url().endsWith('/probe')?403:404,body:'Synthetic monitor probe'}));
 probeMonitor.expectHttpError({url:origin+'/__qa-monitor/probe',method:'POST',status:403});
 await probePage.evaluate(async()=>{for(const [url,method]of [['/asset.js','GET'],['/api404','GET'],['/api500','GET'],['/probe','POST'],['/probe','GET']])await fetch('/__qa-monitor'+url,{method});});
 probeMonitor.finish();check(probeResult.httpErrors.length===4,'monitor catches injected asset/API 404/500 and wrong-method probe');check(probeResult.consoleErrors.length===0,'monitor reconciles only observed resource console duplicates');await probePage.close();
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});admin=await context.newPage();page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const adminMonitor=monitor(admin);monitor(page);
 await admin.goto(origin+'/admin/');await admin.locator('#admin-username').fill('stress-editor');await admin.locator('#admin-password').fill('synthetic-stress-password!');await admin.locator('#admin-otp').fill(totp(secret));await admin.locator('#login-submit').click();await admin.locator('#dashboard-screen').waitFor({state:'visible'});await tab('form');await admin.getByText('Черновик загружен.',{exact:true}).waitFor();
 // Real confirmation layers at every width, including protected preview POST.
 if(!functionalOnly){
  const middle=admin.locator('[data-form-id=middleName]');await middle.locator(':scope>summary').click();await middle.getByLabel('Обязательное',{exact:true}).check();
  const saved=admin.waitForResponse(r=>r.url().endsWith('/api/admin/content')&&r.request().method()==='PUT');await admin.getByRole('button',{name:'Сохранить черновик',exact:true}).click();check((await saved).status()===200,'editor saves synthetic collection change');
  for(const width of [1440,1024,768,360,320]){
   await admin.setViewportSize({width,height:900});await tab('form');
   const opener=admin.getByRole('button',{name:'Добавить поле',exact:true});await opener.scrollIntoViewIfNeeded();const beforeScroll=await admin.evaluate(()=>scrollY);await opener.click();await geometry(admin,'.cms-dialog','add-dialog-'+width);await snap('add-dialog-'+width,admin);await admin.keyboard.press('Escape');check(await opener.evaluate(n=>n===document.activeElement),'add cancel returns focus '+width);check(Math.abs(await admin.evaluate(()=>scrollY)-beforeScroll)<=1,'add cancel restores scroll '+width);
   const card=admin.locator('[data-form-id=lastName]');if(!await card.evaluate(n=>n.open))await card.locator(':scope>summary').click();await card.getByRole('button',{name:'Удалить поле',exact:true}).click();await geometry(admin,'.cms-dialog','delete-dialog-'+width);await snap('delete-dialog-'+width,admin);await admin.keyboard.press('Escape');check(await card.count()===1,'delete cancellation keeps field '+width);
   await admin.getByRole('button',{name:'Предпросмотр',exact:true}).click();await admin.frameLocator('.cms-preview-frame').locator('#application-form').waitFor();await geometry(admin,'.cms-dialog','preview-dialog-'+width);await snap('preview-dialog-'+width,admin);const preview=admin.frames().find(f=>f.url().includes('/admin/preview/'));adminMonitor.expectHttpError({url:origin+'/api/preview-applications',method:'POST',status:403});check(await preview.evaluate(async()=>{const r=await fetch('/api/preview-applications',{method:'POST'});return r.status;})===403,'actual preview POST denied '+width);await admin.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
   await admin.getByRole('button',{name:'Опубликовать',exact:true}).click();check(await admin.getByRole('dialog').locator('input[type=checkbox]').count()===1,'data change publication checkbox '+width);await geometry(admin,'.cms-dialog','publication-dialog-'+width);await snap('publication-dialog-'+width,admin);await admin.keyboard.press('Escape');
  }
 }
 // Constructor type choices exercised through ordinary editor dialogs.
 if(!functionalOnly){
  await tab('form');
  for(const type of FIELD_TYPES){await admin.getByRole('button',{name:'Добавить поле',exact:true}).click();const dialog=admin.getByRole('dialog');await dialog.getByLabel('Тип или шаблон').selectOption(type);await dialog.getByRole('button',{name:'Добавить в черновик',exact:true}).click();check(await admin.locator('.cms-form-record').last().getAttribute('data-form-id').then(id=>/^field-[0-9a-f-]{36}$/.test(id)),'editor constructor adds '+type);}
  check(await admin.locator('.cms-form-record').count()===20,'editor adds all ten types to original ten');await snap('editor-all-types-320',admin);
  const pending=admin.waitForResponse(r=>r.url().endsWith('/api/admin/content')&&r.request().method()==='PUT');await admin.getByRole('button',{name:'Сохранить черновик',exact:true}).click();check((await pending).status()===200,'all type draft permits empty select/radio options');
 }
 // Each real pane and mobile navigation, not merely a DOM count.
 for(const width of functionalOnly?[]:[1440,1024,768,360,320]){await admin.setViewportSize({width,height:900});for(const id of ['applications','content','programs','form','media','pages','settings','history']){await tab(id);if(id==='history')await admin.locator('.cms-history').first().waitFor();await geometry(admin,'.cms-workspace','pane-'+id+'-'+width);await snap('pane-'+id+'-'+width,admin);}}
 // Unchanged default IDs/order: short captions keep the original touch target;
 // authored long builtin captions/hints must grow rather than clip.
 for(const mode of functionalOnly?[]:['default','long-builtin']){
  const c=structuredClone(original);
  if(mode==='long-builtin')for(const meta of formBuiltinMetadata().filter(x=>x.type==='file'))for(const role of ['label','hint','uploadLabel'])if(meta.aliases[role])c.fields[meta.aliases[role]]=syntheticText(role,role==='hint'?2000:500,'token');
  await publish(c);
  for(const width of [1440,1024,768,360,320]){await page.setViewportSize({width,height:900});await ready();await geometry(page,'#application-form',mode+'-'+width);await page.locator('.field[data-field-id=snilsFile]').scrollIntoViewIfNeeded();await snap(mode+'-'+width);await snap(mode+'-upload-'+width,page,page.locator('.field[data-field-id=snilsFile]'));if(mode==='long-builtin')check(await page.locator('.field[data-field-id=snilsFile] .upload-zone strong').evaluate(n=>n.scrollHeight<=n.clientHeight+1),mode+' caption not clamped '+width);if(mode==='default'&&width<=360)check(await page.locator('#snils-file').locator('..').evaluate(n=>Math.abs(n.getBoundingClientRect().height-parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-upload-target')))<=1),mode+' original upload target '+width);}
 }
 const focused=process.argv.includes('--focused');
 for(const [mode,counts]of functionalOnly?[]:focused?[['token',[12]]]:[['token',[12,20,40]],['natural',[20]]])for(const count of counts){
  const c=fixture(original,count,mode);await publish(c);await admin.reload();await admin.locator('#dashboard-screen').waitFor({state:'visible'});await tab('form');await admin.getByText('Черновик загружен.',{exact:true}).waitFor();
  for(const width of focused?[320]:[1440,1024,768,360,320]){
   const label=mode+'-'+count+'-'+width;console.log('Checking '+label);await page.setViewportSize({width,height:900});await admin.setViewportSize({width,height:900});await ready();await page.locator('#application-form').scrollIntoViewIfNeeded();
   await geometry(page,'#application-form',label+'-public');await snap(label+'-public');await snap(label+'-upload',page,page.locator('.field[data-field-id="'+c.applicationForm.fields[9].id+'"]'));
   await tab('form');const cards=admin.locator('.cms-form-record');check(await cards.count()===count,label+' editor stable field count');
   // Expand each kind at each width; ordinary click exposes long labels/options/rules.
   for(let i=0;i<10;i++){const card=cards.nth(i);await card.locator(':scope>summary').click();const above=await card.getByRole('button',{name:'Выше',exact:true}).boundingBox(),below=await card.getByRole('button',{name:'Ниже',exact:true}).boundingBox();if(Math.abs(above.y-below.y)>1)await snap(label+'-split-order-actions',admin,card.locator('.cms-record-body'));check(Math.abs(above.y-below.y)<=1,label+' adjacent order buttons '+i);await geometry(admin,'[data-form-id="'+c.applicationForm.fields[i].id+'"]',label+'-editor-'+i);if(i===0||i===7||i===9){await card.scrollIntoViewIfNeeded();await snap(label+'-editor-'+i,admin);await snap(label+'-editor-card-'+i,admin,card);}await card.locator(':scope>summary').click();}
   // Keyboard from the first scalar to the next; computed focus indicator measured.
   const first=page.locator('#'+c.applicationForm.fields[0].id);await first.click();await page.keyboard.press('Tab');check(await page.locator('#'+c.applicationForm.fields[1].id).evaluate(n=>n===document.activeElement),label+' logical Tab focus');
   check(await page.locator('#'+c.applicationForm.fields[1].id).evaluate(n=>{const s=getComputedStyle(n);return s.outlineStyle!=='none'||s.boxShadow!=='none';}),label+' visible keyboard focus');
   // Optional nonempty email is locally invalid; screenshot error and focus on each width.
   const email=c.applicationForm.fields[2];await page.locator('#'+email.id).fill('wrong');await page.locator('#submit-application').click();check(await page.locator('#'+email.id).getAttribute('aria-invalid')==='true',label+' optional email validation');check(await page.locator('#'+email.id).evaluate(n=>n===document.activeElement),label+' error focus');await geometry(page,'#application-form',label+'-error');await snap(label+'-error');
  }
 }
 if(!focused){
 // All ten types, ordinary input, radio arrow keys, fractional bounds and international tel.
 const all=fixture(original,10,'natural');await publish(all);await page.setViewportSize({width:320,height:900});await ready();await fillTypes(all.applicationForm.fields);
 check(await page.locator('#'+all.applicationForm.fields[3].id).inputValue()==='+442079460123','custom international telephone remains unmasked');
 check(await page.locator('#'+all.applicationForm.fields[5].id).inputValue()==='0.5','fractional number inside configured bounds');
 const acceptedPromise=page.waitForResponse(r=>r.url().endsWith('/api/applications')&&r.request().method()==='POST');await page.locator('#submit-application').click();const accepted=await acceptedPromise;check(accepted.status()===201,'all ten types real HTTP acceptance '+await accepted.text());const acceptedId=(await accepted.json()).id;
 await page.locator('#application-success').waitFor({state:'visible'});check(await page.locator('#application-success').evaluate(n=>n===document.activeElement),'all types success focus');await snap('all-types-success-320');
 const detail=await(await admin.request.get(origin+'/api/admin/applications/'+acceptedId)).json();check(detail.formValues[all.applicationForm.fields[0].id]==='000123','all types leading zero string');check(detail.formValues[all.applicationForm.fields[8].id]===false,'unchecked custom checkbox stored false');check(detail.formValues[all.applicationForm.fields[5].id]==='0.5','fractional string stored');check(detail.formValues[all.applicationForm.fields[7].id]===all.applicationForm.fields[7].rules.options[1].id,'radio ArrowRight chooses second option');
 const doc=detail.documents[0];check((await page.request.get(origin+'/api/admin/documents/'+doc.id)).status()===401,'protected download denies public browser');const download=await admin.request.get(origin+'/api/admin/documents/'+doc.id);check(download.status()===200&&Buffer.from(await download.body()).equals(pdf),'authenticated original document bytes');
 const historical=structuredClone(detail.formSnapshot),changed=structuredClone(all);changed.applicationForm.fields[0].label='Переименовано после приёма';changed.applicationForm.fields[1].enabled=false;changed.applicationForm.fields.splice(7,1);const beforeRevision=store.getPublished().revision;await publish(changed);
 const after=await(await admin.request.get(origin+'/api/admin/applications/'+acceptedId)).json();check(JSON.stringify(after.formSnapshot)===JSON.stringify(historical),'rename hide delete leave snapshot immutable');
 const exported=await admin.request.get(origin+'/api/admin/export');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await exported.body());check(workbook.worksheets[0].getRow(2).values.includes('000123'),'Excel historic leading zeros');check(workbook.worksheets[0].getRow(2).values.includes('Нет'),'Excel false caption');
 await admin.reload();await admin.locator('#dashboard-screen').waitFor({state:'visible'});await tab('history');const restore=admin.locator('.cms-history').filter({has:admin.getByRole('heading',{name:'Публикация №'+beforeRevision,exact:true})});await restore.getByRole('button',{name:'Восстановить в черновик'}).click();await snap('history-restore-dialog-320',admin);await admin.getByRole('dialog').getByRole('button',{name:'Восстановить в черновик',exact:true}).click();await admin.locator('.cms-status').filter({hasText:'восстановлена'}).waitFor();check(store.getDraft().content.applicationForm.fields.length===10,'history restores original ten-type draft');check(store.getPublished().content.applicationForm.fields.length===9,'restore leaves public collection unchanged');
 const draftBefore=store.getDraft(),publishedBefore=store.getPublished();await stop();await start();check(JSON.stringify(store.getDraft())===JSON.stringify(draftBefore),'cold restart preserves draft');check(JSON.stringify(store.getPublished())===JSON.stringify(publishedBefore),'cold restart preserves publication');const cold=await openStore(dir,key);try{check(JSON.stringify(cold.get(acceptedId).formSnapshot)===JSON.stringify(historical),'cold restart preserves encrypted snapshot');}finally{cold.close();}
 // A fresh server resets its rate counters; login is unnecessary for synthetic visitor acceptance.
 const image=sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}});files.png={name:'owned.png',mimeType:'image/png',buffer:await image.clone().png().toBuffer()};files.jpg={name:'owned.jpeg',mimeType:'image/jpeg',buffer:await image.clone().jpeg().toBuffer()};
 for(let count=0;count<=4;count++){
  const c=structuredClone(original);c.applicationForm.fields=Array.from({length:count},(_,i)=>{const f=createCustomField('file',{label:'Документ '+(i+1)});f.required=i%2===0;f.rules.accept=[['pdf','png','jpg'][i%3]];return f;});await publish(c);await ready();
  for(const [i,f]of c.applicationForm.fields.entries())await page.locator('#'+f.id).setInputFiles(files[['pdf','png','jpg'][i%3]]);
  await geometry(page,'#application-form','files-'+count+'-320');await snap('files-'+count+'-320');const pending=page.waitForResponse(r=>r.url().endsWith('/api/applications'));await page.locator('#submit-application').click();check((await pending).status()===201,'browser accepts '+count+' configured files and per-field rules');
 }
 // Untouched native file controls: one optional, mixed required/optional, all optional.
 for(const mode of ['one-optional','mixed','several-optional']){
  const c=structuredClone(original),optional=()=>createCustomField('file',{label:'Необязательный документ'});
  c.applicationForm.fields=mode==='one-optional'?[optional()]:mode==='mixed'?[{id:'snilsFile',kind:'builtin',enabled:true,required:true},optional(),optional(),optional()]:[{id:'snilsFile',kind:'builtin',enabled:true,required:false},{id:'educationFile',kind:'builtin',enabled:true,required:false},optional(),optional()];
  await publish(c);await ready();const defs=resolveFormFields(c);if(mode==='mixed')await page.locator('[name="snilsFile"]').setInputFiles(files.pdf);
  const untouched=await page.locator('input[type=file]').evaluateAll(nodes=>nodes.filter(node=>node.files.length===0).length);check(untouched===defs.filter(f=>!f.required).length,mode+' optional controls untouched');
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/applications')&&r.request().method()==='POST');await page.locator('#submit-application').click();const response=await pending;check(response.status()===201,mode+' ordinary site.js submission '+await response.text());await page.locator('#application-success').waitFor({state:'visible'});
  const appId=(await response.json()).id,acceptedStore=await openStore(dir,key);try{const saved=acceptedStore.get(appId);for(const f of defs)check(saved.formValues[f.id]===f.required,mode+' stored file presence '+f.id);check(saved.documents.length===defs.filter(f=>f.required).length,mode+' stored attachment count');}finally{acceptedStore.close();}
  await snap('untouched-'+mode+'-320');
 }
 // Actual local file errors with native file selection: mismatch and size bound.
 const fileContent=structuredClone(original),f=createCustomField('file',{label:'Только PDF'});f.required=true;f.rules.accept=['pdf'];fileContent.applicationForm.fields=[f];await publish(fileContent);await ready();await page.locator('#'+f.id).setInputFiles(files.png);await page.locator('#submit-application').click();check(await page.locator('#'+f.id).getAttribute('aria-invalid')==='true','browser rejects configured PNG mismatch');await snap('file-format-error-320');
 const huge=Buffer.alloc(FORM_LIMITS.fileBytes+1,32);huge.write('%PDF-1.4');huge.write('%%EOF',huge.length-5);await page.locator('#'+f.id).setInputFiles({name:'oversize.pdf',mimeType:'application/pdf',buffer:huge});await page.locator('#submit-application').click();check(await page.locator('#'+f.id).getAttribute('aria-invalid')==='true','browser rejects 10 MiB plus one');await snap('file-size-error-320');
 const definitions=resolveFormFields(fileContent);const system={courseId:'flowers',contentRevision:String(store.getPublished().revision),consent:'true',consentVersion:store.getPublished().content.settings.intake.consentVersion,website:''};const opts={form:definitions,programs:store.getPublished().content.programs,consentVersion:system.consentVersion,contentRevision:store.getPublished().revision};
 for(const [label,fixture]of Object.entries({mime:{...files.pdf,mimeType:'image/png'},extension:{...files.pdf,name:'wrong.png'},signature:{...files.pdf,buffer:Buffer.from('bad')},size:{...files.pdf,buffer:huge}})){
  const data=new FormData();data.append(f.id,new Blob([fixture.buffer],{type:fixture.mimeType}),fixture.name);await assert.rejects(multipart(data,definitions),bad);check(true,'multipart rejects '+label+' mismatch');
 }
 const exact=Buffer.alloc(FORM_LIMITS.fileBytes,32);exact.write('%PDF-1.4');exact.write('%%EOF',exact.length-5);const exactData=new FormData();exactData.append(f.id,new Blob([exact],{type:'application/pdf'}),'exact.pdf');check((await multipart(exactData,definitions)).files[0].data.length===FORM_LIMITS.fileBytes,'exact 10 MiB accepted');
 for(const [label,mutate]of [['unknown',x=>x.unknown='x'],['hidden',x=>x.email='x@example.test'],['prototype',x=>Object.defineProperty(x,'__proto__',{value:'x',enumerable:true})]]){const values={...system};mutate(values);assert.throws(()=>validateSubmission(values,[{field:f.id,mime:'application/pdf',name:'a.pdf',data:pdf}],opts),bad);check(true,'server rejects '+label+' scalar');}
 for(const count of [40,41]){const config={version:1,fields:Array.from({length:count},()=>createCustomField('text'))};if(count===40)validateApplicationForm(config);else assert.throws(()=>validateApplicationForm(config),bad);check(true,'configured '+count+' field bound');}
 for(const count of [4,5]){const config={version:1,fields:Array.from({length:count},()=>createCustomField('file'))};if(count===4)validateApplicationForm(config);else assert.throws(()=>validateApplicationForm(config),bad);check(true,'active '+count+' file bound');}
 const duplicate=new FormData();duplicate.append('x','1');duplicate.append('x','2');await assert.rejects(multipart(duplicate,[]),bad);check(true,'multipart duplicate scalar rejected');
 const largeReq=Readable.from([Buffer.alloc(FORM_LIMITS.multipartBytes+1,32)]);largeReq.headers={'content-type':'multipart/form-data; boundary=owned'};await assert.rejects(parseMultipart(largeReq,{form:[]}),bad);check(true,'41 MiB request plus one rejected');
 for(const kind of ['aborted','error']){const req=new PassThrough();req.headers={'content-type':'multipart/form-data; boundary=owned'};const outcome=assert.rejects(parseMultipart(req,{form:[]}),bad);req.write('--owned\r\nContent-Disposition: form-data; name="x"\r\n\r\n');if(kind==='aborted'){req.emit('aborted');req.destroy();}else req.destroy(new Error('Owned synthetic disconnect'));await outcome;check(true,'multipart '+kind+' safely rejected');}
 // Hold two actual HTTP multipart bodies open, then verify the app's upload
 // concurrency gate rejects the third rather than allocating another buffer.
 const csrfInfo=await(await page.request.get(origin+'/api/csrf')).json(),visitorCookies=(await page.context().cookies(origin)).map(x=>x.name+'='+x.value).join('; ');
 let requestCount=0,received;const twoRequests=new Promise(r=>received=r);const onRequest=req=>{if(req.headers['x-owned-qa']==='held-upload'&&++requestCount===2)received();};app.server.on('request',onRequest);
 const held=Array.from({length:2},()=>{const req=http.request(origin+'/api/applications',{method:'POST',headers:{origin,cookie:visitorCookies,'x-csrf-token':csrfInfo.token,'x-owned-qa':'held-upload','content-type':'multipart/form-data; boundary=owned-held'}},response=>response.resume());req.on('error',()=>{});req.write('--owned-held\r\nContent-Disposition: form-data; name="website"\r\n\r\n');return req;});
 try{await twoRequests;await new Promise(r=>setImmediate(r));const third=await page.request.post(origin+'/api/applications',{headers:{origin,'x-csrf-token':csrfInfo.token},multipart:{website:''}});check(third.status()===429,'actual HTTP two uploads cap rejects third');}finally{app.server.removeListener('request',onRequest);for(const req of held)req.destroy();}
 await new Promise(r=>setImmediate(r));check((await page.request.get(origin+'/api/config')).status()===200,'server remains alive after held upload disconnects');
 await assert.rejects(scanBuffer(path.join(dir,'missing-owned-scanner.exe'),pdf),e=>e.status===503);check(true,'scanner unavailable fails closed');
 let release;const guard=createScannerGuard({maxPending:2,scan:()=>new Promise(r=>{release=r;})});const first=guard.scan('owned',pdf);await Promise.resolve();const second=guard.scan('owned',pdf);await assert.rejects(guard.scan('owned',pdf),e=>e.status===429);release();await first;await Promise.resolve();release();await second;await guard.close();await assert.rejects(guard.scan('owned',pdf),e=>e.status===503);check(true,'scanner queue bounded serialized and closed');
 // Default education/student controls and required middleName caption preserved.
 const builtin=structuredClone(original);builtin.applicationForm.fields.find(x=>x.id==='middleName').required=true;await publish(builtin);await ready();check(!(await page.locator('.field[data-field-id=middleName]>label').textContent()).includes('если есть'),'required builtin middleName caption');await page.locator('#education').selectOption('student');check(await page.locator('#education').inputValue()==='student','default student choice remains');check(await page.locator('#snils-file').isVisible()&&await page.locator('#education-file').isVisible(),'default two documents remain visible');
 await page.locator('#snils').click();await page.locator('#snils').pressSequentially('11223344595');check(await page.locator('#snils').inputValue()==='112-233-445 95','builtin masked ordinary eleven digits');
 // History length limit through service; no public/store rewrites outside owned fixture.
 for(let i=0;i<21;i++){const c=structuredClone(original);c.applicationForm.fields=[createCustomField('text',{label:'История '+i})];await publish(c);}check(store.history().length===20,'form publications retain exactly 20 history versions');
 }
 for(const monitoring of monitors)monitoring.finish();check(!result.httpErrors?.length,'no unexpected HTTP errors '+JSON.stringify(result.httpErrors));check(!result.runtimeErrors.length,'no runtime errors');check(!result.consoleErrors.length,'no unexpected console errors');check(!result.failedRequests.length,'no failed resource requests');
 console.log(JSON.stringify({checks:result.checks.length,cases:result.cases.length,screenshots:result.screenshots.length,runtimeErrors:result.runtimeErrors,consoleErrors:result.consoleErrors,failedRequests:result.failedRequests,httpErrors:result.httpErrors},null,2));
}catch(error){result.failure={message:error.message,stack:error.stack};if(page)await snap('failure-public').catch(()=>{});if(admin)await snap('failure-admin',admin).catch(()=>{});throw error;
}finally{
 await browser?.close();await stop();key.fill(0);secret.fill(0);const resolved=path.resolve(dir);assert.equal(path.dirname(resolved),output);assert.ok(path.basename(resolved).startsWith('owned-fixture-'));await rm(resolved,{recursive:true,force:true});result.cleanup=true;result.cleanedPath=resolved;await persist();
}
