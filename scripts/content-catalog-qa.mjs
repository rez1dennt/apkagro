import {runCatalogRegressions} from './catalog-regressions.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/app.mjs';
import {setupAdmin,totp} from '../server/security.mjs';
import {catalogFixture,catalogWidths,measureContent,broadFixture} from './catalog-fixtures.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('output/custom-icons/catalog');await mkdir(output,{recursive:true});
const dir=await mkdtemp(path.join(output,'owned-fixture-')),key=randomBytes(32),secret=randomBytes(20);
let app,browser;const result={cases:[],checks:[],screenshots:[],errors:[]};
const check=(value,label)=>{assert.ok(value,label);result.checks.push(label);};
try{
 await setupAdmin(dir,key,'catalog-editor','synthetic-catalog-password!',secret);
 app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+app.server.address().port;result.dynamicPort=app.server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath()});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(10000);page.on('pageerror',e=>result.errors.push(e.message));
 const {store,media}=await app.getContentServices(),original=structuredClone(store.getDraft().content);
 const publish=async content=>{const d=store.getDraft(),saved=await store.saveDraft(content,d.revision);await media.publish(saved.revision,{documentsConfirmed:true});};
 const snap=async(name,locator=null)=>{const filename=path.join(output,name+'.png');await(locator||page).screenshot({path:filename});result.screenshots.push(filename);};
 const geometry=async(scope,label)=>{const measured=await page.evaluate(measureContent,scope);result.cases.at(-1).measurements[label]=measured;await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));check(!measured.issues.length,label+' nested content overflow: '+JSON.stringify(measured.issues.slice(0,5)));check(measured.documentWidth<=measured.viewport,label+' document fits '+JSON.stringify(measured.documentWidth>measured.viewport?(await page.evaluate(measureContent,'body')).issues.slice(0,8):[]));};
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#cookie-acknowledge').click();
 const focused=process.argv.includes('--focused');
 for(const mode of (process.argv.includes('--broad-only')||process.argv.includes('--regressions-only'))?[]:focused?['token']:['natural','token'])for(const count of focused?[12]:[12,20]){
  const content=catalogFixture(original,{count,mode});await publish(content);
  for(const width of focused?[320]:catalogWidths){
   const name=mode+'-'+count+'-'+width;console.log('Checking '+name);result.cases.push({name,measurements:{}});
   await page.setViewportSize({width,height:900});await page.goto(origin,{waitUntil:'networkidle'});
   assert.deepEqual(await page.locator('.program-card').evaluateAll(ns=>ns.map(n=>n.dataset.course)),Array.from({length:count},(_,i)=>'catalog-'+i));
   await page.locator('#programs').scrollIntoViewIfNeeded();await snap(name+'-catalog');await snap(name+'-card',page.locator('.program-card').first());await snap(name+'-header',page.locator('.header'));
   for(const selector of ['#program-list','.header','.application__form-wrap','.footer__main'])await geometry(selector,name+selector);
   await page.locator('.program-card').first().click();await page.locator('#course-dialog[open]').waitFor();await geometry('#course-dialog',name+'-dialog');await snap(name+'-dialog',page.locator('#course-dialog'));
   await page.locator('#choose-course').scrollIntoViewIfNeeded();await snap(name+'-dialog-bottom',page.locator('#course-dialog'));await page.locator('#choose-course').click();await page.locator('#course-dialog').waitFor({state:'hidden'});
   await geometry('.application__form-wrap',name+'-selected-form');await page.locator('.application__form-wrap').scrollIntoViewIfNeeded();await snap(name+'-selected-form');
   if(width===1440||width===320)for(const p of content.programs.slice(0,count)){
    const opener=page.locator('.program-card[data-course="'+p.id+'"]');await opener.scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);await opener.click();await page.locator('#course-dialog[open]').waitFor();
    check(await page.locator('#dialog-title').textContent()===p.title,name+' dialog title '+p.id);check(await page.locator('#choose-course').isDisabled()===(p.status==='closed'),name+' selection status '+p.id);
    await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});check(Math.abs(await page.evaluate(()=>scrollY)-scroll)<=1,name+' Escape scroll '+p.id);check(await opener.evaluate(n=>n===document.activeElement),name+' Escape focus '+p.id);
    if(p.status==='published'){await opener.click();await page.locator('#course-dialog[open]').waitFor();await page.locator('#choose-course').click();await page.locator('#course-dialog').waitFor({state:'hidden'});check(await page.locator('#course-id').inputValue()===p.id&&await page.locator('#selected-course-label').textContent()===p.title,name+' chosen '+p.id);}
   }
   if(await page.locator('.menu-toggle').isVisible()){
    const scroll=await page.evaluate(()=>scrollY);const header=await page.locator('.header').boundingBox();await page.locator('.menu-toggle').click();await page.waitForFunction(()=>document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true');await geometry('#mobile-menu',name+'-menu');await snap(name+'-menu');
    check(await page.locator('main').evaluate(n=>n.inert),name+' menu main inert');await page.locator('#mobile-menu nav a').last().scrollIntoViewIfNeeded();check(await page.locator('#mobile-menu').evaluate(n=>n.scrollTop>0),name+' menu scrollable');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.documentElement.classList.contains('is-locked'));check(Math.abs(await page.evaluate(()=>scrollY)-scroll)<=1,name+' menu restores scroll');assert.deepEqual(await page.locator('.header').boundingBox(),header);check(await page.locator('.menu-toggle').evaluate(n=>n===document.activeElement),name+' menu restores focus');
   }
   await page.locator('#faq details').first().locator('summary').click();await page.waitForFunction(()=>document.querySelector('#faq details').open);await geometry('#faq',name+'-faq');await page.locator('#faq details').first().scrollIntoViewIfNeeded();await snap(name+'-faq');await page.locator('.footer__main').scrollIntoViewIfNeeded();await snap(name+'-footer');
  }
 }
 if(!focused&&!process.argv.includes('--regressions-only')){
  const broad=broadFixture(original);await publish(broad);
  for(const width of [1440,320]){
   const name='broad-'+width;result.cases.push({name,measurements:{}});await page.setViewportSize({width,height:900});await page.goto(origin,{waitUntil:'networkidle'});
   for(const scope of ['.hero','#about','#programs .section-heading','#steps','#application .application__intro','.closing','.footer__organization','#long-cards','#long-gallery']){await page.locator(scope).scrollIntoViewIfNeeded();await snap(name+'-'+scope.replace(/[^a-z]/g,''));await geometry(scope,name+scope);}
   await page.goto(origin+'/privacy/',{waitUntil:'networkidle'});await geometry('.legal-main',name+'-legal');await snap(name+'-legal');
  }
 }
 if(!focused&&!process.argv.includes('--broad-only'))await runCatalogRegressions({page,origin,store,publish,original,check,snap,geometry,result,secret});
 check(!result.errors.length,'no browser errors');console.log(result.cases.length+' cases and '+result.checks.length+' checks passed');
}finally{
 await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));await browser?.close();if(app?.server.listening)await new Promise(r=>app.server.close(r));await app?.close();key.fill(0);secret.fill(0);
 const resolved=path.resolve(dir);if(path.dirname(resolved)!==output||!path.basename(resolved).startsWith('owned-fixture-'))throw Error('Unexpected fixture cleanup path');await rm(resolved,{recursive:true,force:true});
}
