import assert from 'node:assert/strict';
import {totp} from '../server/security.mjs';
import {catalogFixture,catalogWidths} from './catalog-fixtures.mjs';
export async function runCatalogRegressions({page,origin,store,publish,original,check,snap,geometry,result,secret}) {
 const addCase=name=>result.cases.push({name,measurements:{}});
 const photos=async label=>{
  check(await page.locator('.program-card__photo > img').evaluateAll(ns=>ns.every(n=>n.complete&&n.naturalWidth>0)),label+' photos loaded');
  check(await page.locator('.program-card__photo').evaluateAll(ns=>ns.every(n=>{const image=n.querySelector('img'),a=n.getBoundingClientRect(),b=image.getBoundingClientRect();return Math.abs(a.height-b.height)<1&&Math.abs(a.width-b.width)<1&&Math.abs(a.width/a.height-1.5)<.02;})),label+' all photos fill unchanged3:2 frames');
 };
 // Realistic additional rows retain the normal category overlays and image frames.
 await publish(catalogFixture(original,{short:true}));
 for(const width of catalogWidths){
  const name='friendly-12-'+width;addCase(name);await page.setViewportSize({width,height:900});await page.goto(origin,{waitUntil:'networkidle'});await photos(name);check(await page.locator('.program-category--flow').count()===0,name+' short category overlay retained');await page.locator('#programs').scrollIntoViewIfNeeded();await snap(name+'-catalog');await geometry('#program-list',name+'-catalog');
 }
 await publish(original);
 for(const width of catalogWidths){
  const name='original-7-'+width;addCase(name);await page.setViewportSize({width,height:900});await page.goto(origin,{waitUntil:'networkidle'});check(await page.locator('.program-card').count()===7,name+' seven original cards');await photos(name);await page.locator('#programs').scrollIntoViewIfNeeded();await snap(name+'-catalog');await geometry('#program-list',name+'-catalog');
  if(width===1440||width===320)for(const program of original.programs){await page.locator('[data-course="'+program.id+'"].program-card').click();await page.locator('#course-dialog[open]').waitFor();await page.waitForFunction(()=>document.querySelector('#dialog-image').complete&&document.querySelector('#dialog-image').naturalWidth>0);check(await page.locator('#dialog-image').getAttribute('src')===program.modalImage,name+' original modal photo '+program.id);await geometry('#course-dialog',name+'-dialog-'+program.id);await snap(name+'-dialog-'+program.id,page.locator('#course-dialog'));await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});}
 }
 for(const [name,statuses]of [['empty',[]],['closed',['closed','closed']],['archived',['archived']],['mixed',['draft','published','closed','archived','published']]]){
  const content=structuredClone(original);content.settings.intake.deadline='';content.programs=statuses.map((status,i)=>({...structuredClone(original.programs[0]),id:'status-'+i,status}));await publish(content);await page.goto(origin,{waitUntil:'networkidle'});assert.deepEqual(await page.locator('.program-card').evaluateAll(ns=>ns.map(n=>n.dataset.course)),statuses.flatMap((s,i)=>['published','closed'].includes(s)?['status-'+i]:[]));
  for(const p of content.programs.filter(p=>['published','closed'].includes(p.status))){await page.locator('[data-course="'+p.id+'"].program-card').click();check(await page.locator('#choose-course').isDisabled()===(p.status==='closed'),name+' real disabled selection '+p.id);await page.keyboard.press('Escape');await page.locator('#course-dialog').waitFor({state:'hidden'});}
  const config=await(await page.request.get(origin+'/api/config')).json();check(config.enabled===statuses.includes('published'),name+' actual intake availability');
 }
 // Actual intake acceptance rechecks publication and archival rather than trusting rendered CSS state.
 const intake=structuredClone(original);intake.settings.intake.deadline='';await publish(intake);
 let config=await(await page.request.get(origin+'/api/config')).json();const csrf=(await(await page.request.get(origin+'/api/csrf')).json()).token;
 const submit=async snapshot=>{
  const fields={courseId:intake.programs[0].id,lastName:'Иванов',firstName:'Иван',middleName:'',birthDate:'1990-01-01',phone:'+79267908090',email:'catalog@example.test',snils:'11223344595',education:'professional',consent:'true',consentVersion:snapshot.consentVersion,contentRevision:String(snapshot.contentRevision)};
  const multipart={...fields,snilsFile:{name:'snils.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')},educationFile:{name:'education.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nsynthetic\n%%EOF')}};
  return page.request.post(origin+'/api/applications',{headers:{origin,'x-csrf-token':csrf},multipart});
 };
 let response=await submit(config);check(response.status()===201,'fresh actual intake accepted201: '+await response.text());
 intake.programs[0].title+=' (новая редакция)';await publish(intake);response=await submit(config);check(response.status()===409,'stale actual intake rejected409');check((await response.json()).code==='CONTENT_CHANGED','stale actual intake specific contract');
 intake.programs[0].status='archived';await publish(intake);config=await(await page.request.get(origin+'/api/config')).json();response=await submit(config);check(response.status()===400,'archived actual intake rejected400');
 // Main, all legal routes and a custom page share the measured bounded header and menu.
 const long=catalogFixture(original,{count:20,mode:'token'});long.pages.push({...structuredClone(original.pages[0]),id:'catalog-page',slug:'catalog-page',title:'Дополнительная страница',intro:'Описание',body:'Текст страницы',status:'published'});await publish(long);
 for(const width of catalogWidths)for(const route of ['/privacy/','/consent/','/operator/','/catalog-page/']){
  const name='header-'+route.split('/')[1]+'-'+width;addCase(name);await page.setViewportSize({width,height:900});await page.goto(origin+route,{waitUntil:'networkidle'});await geometry('.header',name);check(await page.locator('.header__cta').getAttribute('aria-label')===long.fields['header.text-60704e28bc4c'],name+' complete accessible caption');check(await page.locator('.header').evaluate(n=>n.getBoundingClientRect().height<=70),name+' fixed header height');await snap(name,page.locator('.header'));await page.locator('.menu-toggle').click();await geometry('#mobile-menu',name+'-menu');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.documentElement.classList.contains('is-locked'));
 }
 for(const width of [959,960,1440,320,1440]){await page.setViewportSize({width,height:900});await page.waitForFunction(()=>document.querySelector('.header').classList.contains('header--compact'));check(await page.locator('.menu-toggle').isVisible(),'long header fit stable at'+width);}
 // Authenticate only against the owned synthetic editor; long native inputs may scroll internally.
 await page.goto(origin+'/admin/');await page.locator('#admin-username').fill('catalog-editor');await page.locator('#admin-password').fill('synthetic-catalog-password!');await page.locator('#admin-otp').fill(totp(secret));await page.locator('#login-submit').click();await page.locator('#dashboard-screen').waitFor({state:'visible'});
 const programsTab=async()=>{if(await page.locator('#cms-mobile-navigation').isVisible())await page.locator('#cms-mobile-navigation').selectOption('programs');else await page.getByRole('button',{name:'Программы',exact:true}).click();};
 await programsTab();check(await page.locator('.cms-record').count()===22,'editor keeps20visible+2hidden records');await page.locator('.cms-record').first().locator(':scope > summary').click();
 for(const width of catalogWidths){const name='editor-long-20-'+width;addCase(name);await page.setViewportSize({width,height:900});await geometry('.cms-root',name);await snap(name);}
}
