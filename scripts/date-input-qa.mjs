import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {setupAdmin} from '../server/security.mjs';
import {createCustomField} from '../public/assets/js/application-fields.js';
const require=createRequire(import.meta.url),{webkit,chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('output/date-input');await mkdir(output,{recursive:true});const dir=await mkdtemp(path.join(output,'owned-regression-')),result={checks:0,cases:[],errors:[],iosThemeModel:'https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/ios/RenderThemeIOS.mm#L456'};
let app,browser;const check=(value,label)=>{assert.ok(value,label);result.checks++;};
try{
 const key=randomBytes(32);await setupAdmin(dir,key,'qa-date',randomBytes(24).toString('base64url'),randomBytes(20));
 app=await createApp({dataDir:dir,key,origin:'http://127.0.0.1:0',testDynamicOrigin:true,intakeEnabled:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
 const {store,media}=await app.getContentServices();
 for(const variant of ['original','custom-date']){
  if(variant==='custom-date'){const draft=store.getDraft();draft.content.applicationForm.fields.push(createCustomField('date',{label:'Дата документа'}));const saved=await store.saveDraft(draft.content,draft.revision);await media.publish(saved.revision,{documentsConfirmed:true});}
  for(const [engineName,engine]of [['webkit',webkit],['chromium',chromium]]){
   browser=await engine.launch({headless:true,...(engineName==='chromium'?{executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')}:{})});
   const context=await browser.newContext({...devices['iPhone 13'],locale:'ru-RU'}),page=await context.newPage();page.on('pageerror',error=>result.errors.push(error.message));
   for(const iosTheme of [false,true])for(const width of [393,360,320,768,1280]){
    await page.setViewportSize({width,height:844});await page.goto(origin,{waitUntil:'networkidle'});if(await page.locator('#cookie-banner').isVisible())await page.locator('#cookie-acknowledge').click();
    if(iosTheme){
     // Desktop WebKit is not iOS WebKit. Model only the documented native-theme
     // content-box adjustment when appearance remains enabled (WebKit #301648).
     await page.locator('.field input[type=date]').evaluateAll(inputs=>{for(const input of inputs)if(getComputedStyle(input).appearance!=='none')input.style.boxSizing='content-box';});
    }
    for(const state of ['empty','filled','invalid']){
     for(const input of await page.locator('.field input[type=date]').all()){
      await input.fill(state==='empty'?'':state==='filled'?'1990-10-16':'2099-10-16');await input.blur();await input.scrollIntoViewIfNeeded();
      const geometry=await input.evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('.field').getBoundingClientRect(),neighbor=document.querySelector('#first-name').getBoundingClientRect(),style=getComputedStyle(n);return {id:n.id,width:r.width,height:r.height,parentWidth:p.width,right:r.right,parentRight:p.right,left:r.left,parentLeft:p.left,neighborHeight:neighbor.height,type:n.getAttribute('type'),nativeType:n.type,value:n.value,appearance:style.appearance,boxSizing:style.boxSizing,invalid:n.getAttribute('aria-invalid'),viewport:innerWidth,pageWidth:document.documentElement.scrollWidth};});
      const label=[variant,engineName,iosTheme?'ios-theme-model':'native',width,state,geometry.id].join('-');result.cases.push({label,geometry});
      if((width===393||width===320)&&variant==='original')await input.locator('..').screenshot({path:path.join(output,(process.env.QA_PHASE??'final')+'-'+label+'.png')});
      check(geometry.right<=geometry.parentRight+1&&geometry.left>=geometry.parentLeft-1,label+' fits its own column');
      check(Math.abs(geometry.height-geometry.neighborHeight)<=1,label+' matches neighboring control height');
      check(geometry.pageWidth<=geometry.viewport,label+' page has no horizontal overflow');check(geometry.type==='date',label+' retains date input semantics');
      if(geometry.id==='birth-date'&&state==='invalid')check(geometry.invalid==='true',label+' rejects a future birth date');
     }
    }
   }
   await browser.close();browser=null;
  }
 }
 check(result.errors.length===0,'no runtime errors');console.log(JSON.stringify({checks:result.checks,cases:result.cases.length,errors:result.errors}));
}catch(error){result.failure=error.message;throw error;}
finally{await writeFile(path.join(output,(process.env.QA_PHASE??'final')+'-results.json'),JSON.stringify(result,null,2));await browser?.close();if(app){await new Promise(r=>app.server.close(r));await app.close();}assert.equal(path.dirname(dir),output);assert.ok(path.basename(dir).startsWith('owned-regression-'));await rm(dir,{recursive:true,force:true});}
