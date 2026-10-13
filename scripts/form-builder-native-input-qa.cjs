/* Focused review regression: actual SSR/widget, ordinary Chromium keyboard input.
 * Uses in-memory SSR/widget fixtures and one transient synthetic app server. */
(async()=>{
 const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const {parseHTML}=await import('linkedom'),{loadDefaultContent}=await import('../server/content-schema.mjs'),{renderApplicationForm}=await import('../server/application-form-render.mjs'),{resolveFormFields}=await import('../server/application-form.mjs'),{createCustomField}=await import('../public/assets/js/application-fields.js');
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const content=await loadDefaultContent(),number=createCustomField('number',{label:'Число'}),date=createCustomField('date',{label:'Дата'}),checkbox=createCustomField('checkbox',{label:'Галочка'});
 content.applicationForm.fields=[number,date,checkbox];
 const {document}=parseHTML('<html><body><form id="application-form" novalidate><div class="form-grid"></div><button type="submit">Проверить</button><button type="button" id="test-reset">Очистить</button></form></body></html>');
 renderApplicationForm({document,content});
 const html=document.toString(),definitions=resolveFormFields(content),checks=[],states=[];
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')});
 try{
  const page=await browser.newPage({locale:'en-US'});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://form-native-input.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
   return route.fulfill({contentType:'text/javascript; charset=utf-8',body:await fs.readFile(path.join(process.cwd(),'public/assets/js',path.basename(url.pathname)),'utf8')});
  });
  const load=async()=>{await page.goto('http://form-native-input.test/');
  await page.evaluate(async definitions=>{
   const {attachApplicationForm}=await import('/application-form.js');
   const form=document.querySelector('form');window.widget=attachApplicationForm(form,{definitions});window.accepted=0;
   form.addEventListener('submit',event=>{event.preventDefault();window.lastValid=widget.validateAll();if(window.lastValid)window.accepted++;});
   document.querySelector('#test-reset').addEventListener('click',()=>{form.reset();widget.clearErrors();});
  },definitions);};await load();
  const n=page.locator('#'+number.id),d=page.locator('#'+date.id),submit=page.locator('button[type=submit]');
  const state=async(id,label)=>page.evaluate(({id,label})=>{const input=document.getElementById(id);return {label,value:input.value,badInput:input.validity.badInput,valid:window.lastValid,invalid:input.getAttribute('aria-invalid'),error:document.getElementById(id+'-error').textContent,focused:document.activeElement===input,accepted:window.accepted};},{id,label});
  for(const value of ['-','1e']){
   await n.click();await n.pressSequentially(value);await submit.click();states.push(await state(number.id,'number '+value));await load();
  }
  // Enter only the month segment; the native date is visibly incomplete.
  await d.click({position:{x:8,y:10}});await d.pressSequentially('12');await submit.click();states.push(await state(date.id,'partial date'));await load();
  console.log(JSON.stringify({phase:'native incomplete input',states},null,2));
  for(const result of states){check(result.value===''&&result.badInput,result.label+' is native badInput');check(!result.valid&&result.invalid==='true'&&Boolean(result.error)&&result.focused&&result.accepted===0,result.label+' rejects with error/focus and never accepts');}
  await submit.click();check(await page.evaluate(()=>window.lastValid),'optional empty number/date and false checkbox pass');
  await n.click();await n.pressSequentially('0');await submit.click();check(await page.evaluate(()=>window.lastValid),'optional zero passes');check(await n.inputValue()==='0','zero preserved');
  // Valid ISO date remains accepted; malformed native date above uses keyboard entry.
  await d.fill('2020-12-31');
  await submit.click();check(await d.inputValue()==='2020-12-31','regular complete date preserved');check(await page.evaluate(()=>window.lastValid),'regular complete date passes');check(await page.locator('#'+checkbox.id).isChecked()===false,'optional checkbox false preserved');
  await page.locator('#test-reset').click();check(await n.inputValue()===''&&await d.inputValue()==='','reset clears native controls');check(await page.locator('[aria-invalid=true]').count()===0,'reset clears errors');await submit.click();check(await page.evaluate(()=>window.lastValid),'optional empty after reset passes');check(errors.length===0,'no browser runtime errors');

  // Also exercise the actual site.js submit handler and HTTP boundary on a
  // transient synthetic app; an invalid attempted optional answer sends no POST.
  const {createApp}=await import('../server/app.mjs'),{setupAdmin}=await import('../server/security.mjs'),{randomBytes}=require('node:crypto');
  const output=path.resolve('output/form-builder');await fs.mkdir(output,{recursive:true});
  const dir=await fs.mkdtemp(path.join(output,'native-synthetic-')),key=randomBytes(32);
  await setupAdmin(dir,key,'native-synthetic','synthetic-native-password!',randomBytes(20));
  const app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  try{
   const origin='http://127.0.0.1:'+app.server.address().port,{store,media}=await app.getContentServices();
   let draft=store.getDraft();draft.content.applicationForm.fields=[number,date,checkbox];draft.content.settings.intake.deadline='';
   draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision,{documentsConfirmed:true});
   const actual=await browser.newPage({locale:'en-US'});actual.on('pageerror',e=>errors.push(e.message));let posts=0;
   actual.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/applications'))posts++;});
   const ready=async()=>{await actual.goto(origin);if(await actual.locator('#cookie-banner').isVisible())await actual.locator('#cookie-acknowledge').click();await actual.locator('[data-course=flowers]').click();await actual.locator('#choose-course').click();await actual.locator('#consent').check();};
   const realStates=[];
   for(const [id,value,label]of [[number.id,'-','real handler number -'],[number.id,'1e','real handler number 1e'],[date.id,'12','real handler partial date']]){
    await ready();const input=actual.locator('#'+id);await input.click(id===date.id?{position:{x:8,y:10}}:{});await input.pressSequentially(value);await actual.locator('#submit-application').click();
    const result=await input.evaluate(n=>({value:n.value,badInput:n.validity.badInput,invalid:n.getAttribute('aria-invalid'),focused:document.activeElement===n,error:document.getElementById(n.id+'-error').textContent}));
    realStates.push({label,...result});check(result.value===''&&result.badInput,label+' creates native badInput');check(result.invalid==='true'&&result.focused&&Boolean(result.error),label+' error and focus');check(posts===0,label+' blocks HTTP submission');
   }
   await ready();await actual.locator('#'+number.id).pressSequentially('0');await actual.locator('#'+date.id).fill('2020-12-31');
   const pending=actual.waitForResponse(response=>response.url().endsWith('/api/applications')&&response.request().method()==='POST');
   await actual.locator('#submit-application').click();const accepted=await pending;check(accepted.status()===201,'real handler accepts optional zero regular date and false');
   const record=await accepted.json(),{openStore}=await import('../server/storage.mjs'),acceptedStore=await openStore(dir,key);let saved;try{saved=acceptedStore.get(record.id);}finally{acceptedStore.close();}check(saved.formValues[number.id]==='0'&&saved.formValues[date.id]==='2020-12-31'&&saved.formValues[checkbox.id]===false,'real accepted values retain zero date false');
   await actual.locator('#new-application').click();check(await actual.locator('#'+number.id).inputValue()===''&&await actual.locator('#'+date.id).inputValue()==='','real new application resets fields');check(await actual.locator('[aria-invalid=true]').count()===0,'real new application clears errors');
   states.push(...realStates);await actual.close();
  }finally{
   await new Promise(r=>app.server.close(r));await app.close();
   const resolved=path.resolve(dir);assert.ok(resolved.startsWith(output+path.sep),'synthetic cleanup stays inside output');
   await fs.rm(resolved,{recursive:true,force:true});
  }
  check(errors.length===0,'real handler has no browser runtime errors');
  const report={checks:checks.length,items:checks,states,runtimeErrors:errors};await fs.mkdir('output/form-builder',{recursive:true});await fs.writeFile('output/form-builder/task-2-fix-native-browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
