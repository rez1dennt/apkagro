import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {setupAdmin,totp} from '../server/security.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('output/content-admin/browser');await mkdir(output,{recursive:true});const dir=await mkdtemp(path.join(output,'synthetic-'));
const key=randomBytes(32),secret=randomBytes(20);await setupAdmin(dir,key,'qa-editor','synthetic-content-qa-password!',secret);
const app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath()});const page=await browser.newPage(),errors=[],failed=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.url()+':'+r.status());});const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 const protocol=await page.context().newCDPSession(page);await protocol.send('Network.enable');const assetResponses=[];
 protocol.on('Network.responseReceived',({response})=>{if(/\/assets\/.*\.(js|css)(?:\?|$)/.test(response.url))assetResponses.push(response);});
 const {store,media}=await app.getContentServices();const raster=await sharp({create:{width:600,height:100,channels:3,background:'#20351a'}}).png().toBuffer();const asset=await media.upload({data:raster,name:'wide-logo.png',mime:'image/png',title:'Логотип',alt:'Широкий логотип'});
 let draft=store.getDraft();draft.content.settings.intake.deadline='';draft.content.fields['hero.title']='Знания для аграрного будущего';const imageField=Object.keys(draft.content.fields).find(k=>k==='header.src-448dd8f0be61');draft.content.fields[imageField]=asset.url;
 draft.content.programs.push({...draft.content.programs[0],id:'qa-new',title:'Новая учебная программа',cardTitle:'Новый курс',description:'## Новые знания\n\n**Полное описание** и [условия](/privacy/).',topics:['Практика','Результат'],disclaimer:'Условия нового курса',buttonLabel:'Выбрать новый курс',image:asset.url,modalImage:asset.url,hours:108});
 draft.content.fields['other.href-10d7e1f65431']='leaf';draft.content.fields['other.text-083dd138ad9a']='Записаться на курс';draft.content.programs[1].status='closed';draft.content.pages.push({...draft.content.pages[0],id:'qa-page',slug:'qa-page',title:'Новая страница',intro:'Вводный текст',body:'# Раздел\n\nПолный **текст** новой страницы.',seo:{...draft.content.pages[0].seo,title:'Новая страница — метаданные'}});
 draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision);
 await page.goto(origin,{waitUntil:'networkidle'});
 assetResponses.length=0;await page.reload({waitUntil:'networkidle'});
 check(assetResponses.some(r=>r.url.includes('/site.js?v=20261013-content-admin')),'warm session loads current release entry');
 check(assetResponses.some(r=>r.url.includes('/content-format.js?v=20261013-content-admin')),'warm session loads current shared formatter');
 check(assetResponses.every(r=>!r.fromDiskCache&&!r.fromServiceWorker&&r.headers['Cache-Control']==='no-cache'),'warm session revalidates mutable code and styles');
 check(await page.evaluate(async()=>{const {renderMarkdown,replaceLiterals}=await import('/assets/js/content-format.js');const n=document.createElement('div');n.innerHTML=renderMarkdown('<img src=x onerror=alert(1)> [bad](javascript:alert) **ok**');return !n.querySelector('img,script,a')&&n.querySelector('strong')?.textContent==='ok'&&replaceLiterals('abc',[['abc','userabc']])==='userabc';}),'browser shared Markdown escapes executable input');
 for(const width of [1440,768,360,320]){
  await page.setViewportSize({width,height:900});await page.goto(origin,{waitUntil:'networkidle'});if(await page.locator('#cookie-banner').isVisible())await page.locator('#cookie-acknowledge').click();
  check(await page.locator('h1').textContent()==='Знания для аграрного будущего','edited hero '+width);check(await page.locator('.program-card').count()===8,'new card '+width);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow '+width);
  check(await page.locator('.header .brand img').evaluate(img=>img.complete&&img.naturalWidth===600&&getComputedStyle(img).objectFit==='contain'),'wide logo contains '+width);
  await page.locator('[data-course="qa-new"]').click();await page.locator('#course-dialog[open]').waitFor();check(await page.locator('#dialog-description strong').textContent()==='Полное описание','rich new description '+width);check(await page.locator('#dialog-image').evaluate(img=>img.clientHeight<=290&&getComputedStyle(img).objectFit==='cover'),'new modal photo max290 '+width);check(await page.locator('#course-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth),'modal overflow '+width);check(await page.locator('.course-meta svg').count()===2,'runtime keeps metadata icons '+width);
  check((await page.locator('.course-meta > span').first().textContent()).trim()==='108 часов','runtime Russian hours '+width);
  check(await page.locator('#choose-course use').getAttribute('href')==='/assets/icons-v2.svg#leaf','runtime keeps edited choose icon '+width);
  check(await page.locator('#dialog-description h2').evaluate(n=>parseFloat(getComputedStyle(n).marginBottom)>=10),'rich heading spacing '+width);
  await page.locator('#course-dialog').screenshot({path:path.join(output,'new-course-'+width+'.png')});await page.locator('#choose-course').click();check(await page.locator('#course-id').inputValue()==='qa-new','new program selected '+width);await page.locator('#course-dialog').waitFor({state:'hidden'});
  await page.locator('[data-course="flowers"]').click();await page.locator('#course-dialog[open]').waitFor();check(await page.locator('#choose-course').isDisabled(),'closed program disabled '+width);await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});
  for (const id of ['wine','cider','drone']) {
    await page.locator('[data-course="'+id+'"]').click();await page.locator('#course-dialog[open]').waitFor();
    const style=await page.locator('#dialog-description').evaluate(n=>{const s=getComputedStyle(n);return {size:s.fontSize,line:s.lineHeight,color:s.color,margin:s.marginTop};});
    check(style.size===(width<700?'13px':'14px')&&style.margin===(width<700?'14px':'19px'),'original description style '+id+' '+width);
    check((await page.locator('#choose-course').textContent()).trim()==='Записаться на курс','runtime common caption '+id+' '+width);
    await page.locator('#course-dialog').screenshot({path:path.join(output,'original-'+id+'-'+width+'.png')});
    await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});
  }
  await page.screenshot({path:path.join(output,'main-'+width+'.png'),fullPage:true});
  await page.locator('#faq details').first().locator('summary').click();check(await page.locator('#faq details').first().getAttribute('open')!==null,'FAQ opens '+width);
  if(width<1000&&await page.locator('.menu-toggle').isVisible()){await page.locator('.menu-toggle').click();check(await page.locator('.menu-toggle').getAttribute('aria-expanded')==='true','menu opens '+width);await page.keyboard.press('Escape');}
  for(const route of ['/privacy/','/consent/','/operator/','/qa-page/']){await page.goto(origin+route,{waitUntil:'networkidle'});check(await page.locator('h1').count()===1,'single h1 '+route+width);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'legal no overflow '+route+width);await page.screenshot({path:path.join(output,route.replaceAll('/','')+'-'+width+'.png'),fullPage:true});}
  check(await page.title()==='Новая страница — метаданные','page metadata '+width);await page.screenshot({path:path.join(output,'new-page-'+width+'.png'),fullPage:true});
 }
 // Visibility and intake changes are projected from publications, then restored.
 draft=store.getDraft();draft.content.hiddenSections=['programs','application'];draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision);
 await page.goto(origin,{waitUntil:'networkidle'});check(await page.locator('#programs,#application,a[href="#programs"],a[href="#application"]').count()===0,'published hidden sections remove dependent CTA and menu links');
 await page.goto(origin+'/privacy/',{waitUntil:'networkidle'});check(await page.locator('header a[href="/#application"],footer a[href="/#programs"]').count()===0,'legal shell follows known section visibility');
 draft=store.getDraft();draft.content.hiddenSections=[];draft.content.settings.intake.enabled=false;draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision);
 await page.goto(origin,{waitUntil:'networkidle'});check(await page.locator('#programs,#application').count()===2&&await page.locator('a[href="#application"]').count()>0,'unhide restores sections and authored links');check(!(await(await page.request.get(origin+'/api/config')).json()).enabled,'published intake switch closes submissions');
 draft=store.getDraft();draft.content.settings.intake.enabled=true;draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision);check((await(await page.request.get(origin+'/api/config')).json()).enabled,'published intake switch reopens submissions');
 // Authenticate using a generated one-off admin. No real keys or credentials are read.
 await page.goto(origin+'/admin/');await page.locator('#admin-username').fill('qa-editor');await page.locator('#admin-password').fill('synthetic-content-qa-password!');await page.locator('#admin-otp').fill(totp(secret));await page.locator('#login-submit').click();await page.locator('#dashboard-screen').waitFor({state:'visible'});check(await page.locator('#program-filter option[value="qa-new"]').count()===1,'dynamic admin filter');
 const privateAsset=await media.upload({data:raster,name:'draft.png',mime:'image/png',title:'Черновик',alt:'Черновик'});draft=store.getDraft();draft.content.programs.push({...draft.content.programs[0],id:'qa-draft',title:'Курс в черновике',cardTitle:'Черновик',image:privateAsset.url,modalImage:privateAsset.url,status:'draft'});draft=await store.saveDraft(draft.content,draft.revision);
 await page.goto(origin+'/admin/preview/',{waitUntil:'networkidle'});await page.locator('[data-course="qa-draft"]').click();await page.locator('#course-dialog[open]').waitFor();check(await page.locator('#dialog-image').evaluate(img=>img.complete&&img.naturalWidth===600),'private image loads in protected draft preview');check((await page.locator('#dialog-image').getAttribute('src')).startsWith('/api/admin/media/'),'private authenticated media path');await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});await page.locator('#submit-application').click();check((await page.locator('#form-status').textContent()).includes('не отправлены'),'preview cannot submit');
 await page.goto(origin+'/admin/preview/?revision=1',{waitUntil:'networkidle'});check(await page.locator('.program-card').count()===7,'historical preview initial catalog');
 check(errors.length===0,'no runtime errors: '+errors.join(', '));check(failed.length===0,'no broken requests: '+failed.join(', '));
 await writeFile(path.join(output,'results.json'),JSON.stringify({checks:checks.length,labels:checks,errors,failed},null,2));console.log(checks.length+' CMS browser checks passed.');
}finally{await browser.close();await new Promise(r=>app.server.close(r));await app.close();await rm(dir,{recursive:true,force:true});}
