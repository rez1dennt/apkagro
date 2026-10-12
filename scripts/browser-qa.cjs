const { chromium } = require(process.env.PLAYWRIGHT_MODULE || require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const { mkdtemp, rm, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output','qa');
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
async function dimensions(page){return page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.position!=='fixed'&&s.visibility!=='hidden'&&r.width>0&&(r.right>innerWidth+1||r.left< -1)&&!el.closest('dialog,.admin-table-scroll,.honeypot');}).slice(0,8).map(el=>`${el.tagName}.${el.className}`)}));}
async function run(){
  const {courses}=await import('../public/assets/js/courses.js');
  await mkdir(output,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});
  const errors=[],broken=[];
  const context=await browser.newContext();const page=await context.newPage();
  // Cookie-specific opening, storage and dismissal are covered by ui-fixes-qa.cjs.
  await context.addInitScript(()=>localStorage.setItem('apk:cookie-notice:v1',JSON.stringify({version:1,time:Date.now()})));
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/api/'))broken.push(`${response.status()} ${response.url()}`);});
  let fixtureDir,app;
  try{
    const preview='http://127.0.0.1:3000';
    const previewIntake=(await(await context.request.get(preview+'/api/config')).json()).enabled;
    for(const route of ['/','/privacy/','/consent/','/operator/','/admin']){
      for(const width of [1440,1024,768,360,320]){
        await page.setViewportSize({width,height:900});await page.goto(preview+route,{waitUntil:'networkidle'});
        const size=await dimensions(page);check(size.scrollWidth<=size.width,`${route} overflow at ${width}: ${JSON.stringify(size)}`);
        check(await page.locator('h1').count()===1,`${route} one h1 at ${width}`);
        const images=await page.evaluate(()=>[...document.images].filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));check(!images.length,`${route} broken images: ${images}`);
        if(route==='/'){check(await page.locator('.program-card[data-course]').count()===Object.keys(courses).length,'all catalog courses');check(await page.locator('.header').evaluate(el=>getComputedStyle(el).position==='fixed'),'fixed header');const benefit=await page.locator('.benefit').first().boundingBox();check(benefit.width>=(width<700?120:width<960?130:140),'benefit cards retain readable columns');check(await page.evaluate(()=>[...document.fonts].some(face=>face.family.replaceAll('"','')==='Esqadero FF CY 4F'&&face.status==='loaded')),'requested local font actually loaded');}
        if(route==='/'&&[1440,360,320].includes(width))await page.screenshot({path:path.join(output,`landing-${width}.png`),fullPage:true});
        if(route==='/admin'&&width===1440)await page.screenshot({path:path.join(output,'admin-login.png'),fullPage:true});
        if(route==='/operator/'&&width===360)await page.screenshot({path:path.join(output,'operator-360.png'),fullPage:true});
      }
    }
    for(const width of [1440,360,320]){
      await page.setViewportSize({width,height:900});await page.goto(preview,{waitUntil:'networkidle'});
      const card=page.locator('.program-card[data-course="flowers"]');await card.scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>({y:scrollY,x:document.querySelector('.header .brand').getBoundingClientRect().x}));
      await card.click();check(await page.locator('#course-dialog').evaluate(el=>el.open),'course modal opens');
      check(await page.locator('#dialog-title').textContent()==='Декоративное цветоводство','correct course copy');
      await page.keyboard.press('Escape');await page.waitForTimeout(280);
      const after=await page.evaluate(()=>({y:scrollY,x:document.querySelector('.header .brand').getBoundingClientRect().x}));
      check(Math.abs(after.y-before.y)<=1,`dialog scroll restored at ${width}`);check(Math.abs(after.x-before.x)<=1,`dialog header width stable at ${width}`);
      check(await card.evaluate(el=>document.activeElement===el),'dialog focus returned');
      await card.click();await page.locator('#choose-course').click();await page.waitForTimeout(300);
      check(await page.locator('#course-id').inputValue()==='flowers','course selected into form');check(await card.getAttribute('class').then(x=>x.includes('is-selected')),'selected card state');
      await page.locator('#submit-application').click();check((await page.locator('#form-status').textContent()).includes(previewIntake?'Проверьте':'не отправлены'),'empty or disabled form never claims transmission');
      const faq=page.locator('#faq summary').first();await faq.click();check(await page.locator('#faq details').first().getAttribute('open')!==null,'FAQ opens');await page.waitForTimeout(280);await faq.click();check(await page.locator('#faq details').first().getAttribute('open')!==null,'FAQ stays rendered during close animation');await page.waitForTimeout(280);check(await page.locator('#faq details').first().getAttribute('open')===null,'FAQ closes after animation');
      if(width<700){
        await page.evaluate(()=>scrollTo({top:800,behavior:'instant'}));
        const y=await page.evaluate(()=>scrollY);const x=await page.locator('.header__inner').evaluate(el=>el.getBoundingClientRect().x);
        await page.locator('.menu-toggle').click();check(await page.locator('.menu-toggle').getAttribute('aria-expanded')==='true','burger expands');
        await page.keyboard.press('Escape');await page.waitForTimeout(280);check(Math.abs(await page.evaluate(()=>scrollY)-y)<=1,'burger restores scroll');check(Math.abs(await page.locator('.header__inner').evaluate(el=>el.getBoundingClientRect().x)-x)<=1,'burger header stable');
        await page.locator('.menu-toggle').click();await page.locator('#mobile-menu a[href="#faq"]').click();
        await page.waitForFunction(()=>{const top=document.querySelector('#faq').getBoundingClientRect().top,padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),limit=document.documentElement.scrollHeight-innerHeight;return Math.abs(scrollY-Math.min(limit,Math.max(0,scrollY+top-padding)))<=2;},{},{timeout:5000});
        check(await page.locator('.menu-toggle').getAttribute('aria-expanded')==='false','burger closes through link');check(!await page.evaluate(()=>document.documentElement.classList.contains('is-locked')),'burger unlocks');
        const anchor=await page.evaluate(()=>{const top=document.querySelector('#faq').getBoundingClientRect().top,padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),limit=document.documentElement.scrollHeight-innerHeight;return{top,y:scrollY,expected:Math.min(limit,Math.max(0,scrollY+top-padding))};});
        check(anchor.top>=63&&Math.abs(anchor.y-anchor.expected)<=2,`FAQ anchor clears header or reaches page end: ${JSON.stringify(anchor)}`);
      }
    }
    await page.goto(preview+'/privacy/',{waitUntil:'networkidle'});
    const [policyDownload]=await Promise.all([page.waitForEvent('download'),page.locator('a[href="/documents/privacy-policy.pdf"]').first().click()]);
    check(await policyDownload.failure()===null,'public privacy policy PDF downloads');
    const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:320,height:800}}),reducedPage=await reduced.newPage();await reducedPage.goto(preview,{waitUntil:'networkidle'});await reducedPage.locator('.menu-toggle').click();await reducedPage.keyboard.press('Escape');await reducedPage.waitForTimeout(50);check(!await reducedPage.evaluate(()=>document.documentElement.classList.contains('is-locked')),'reduced motion menu unlocks');await reduced.close();

    // Isolated, synthetic full-stack exercise. These credentials never configure the preview/real deployment.
    const { createApp }=await import('../server/app.mjs');const { setupAdmin,totp }=await import('../server/security.mjs');
    fixtureDir=await mkdtemp(path.join(root,'.browser-test-'));const key=randomBytes(32),secret=randomBytes(20),password=randomBytes(24).toString('base64url');
    await setupAdmin(fixtureDir,key,'browser-test-admin',password,secret);app=await createApp({dataDir:fixtureDir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${app.server.address().port}`;await page.setViewportSize({width:1440,height:1000});await page.goto(origin,{waitUntil:'networkidle'});
    await page.locator('.program-card[data-course="cheese"]').click();await page.locator('#choose-course').click();await page.waitForTimeout(300);
    await page.locator('#submit-application').click();check(await page.locator('[aria-invalid="true"]').count()>0,'live form required validation');
    for(const [selector,value]of Object.entries({'#last-name':'Тестовый','#first-name':'Участник','#middle-name':'Тестович','#birth-date':'1990-01-01','#phone':'+79991234567','#email':'synthetic@example.test','#snils':'11223344595'}))await page.locator(selector).fill(value);
    await page.locator('#education').selectOption('professional');
    const pdf=Buffer.from('%PDF-1.4\nSynthetic QA document, no personal data\n%%EOF');
    await page.locator('#snils-file').setInputFiles({name:'synthetic-snils.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('#education-file').setInputFiles({name:'synthetic-education.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('#consent').check();
    await page.locator('#middle-name').fill('123');await page.locator('#submit-application').click();check(await page.locator('#middle-name').getAttribute('aria-invalid')==='true','optional patronymic validates nonempty values');await page.locator('#middle-name').fill('');
    await page.route(origin+'/api/applications',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><h1>Proxy fallback</h1>'}));
    await page.locator('#submit-application').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('не подтвердил'));
    check(await page.locator('#application-success').isHidden(),'HTML HTTP 200 cannot show saved-success UI');
    await page.unroute(origin+'/api/applications');
    await page.locator('#submit-application').click();await page.waitForSelector('#application-success:not([hidden])');check((await page.locator('#success-reference').textContent()).includes('Номер заявки:'),'real synthetic submission confirms reference');
    await page.locator('.program-card[data-course="flowers"]').click();await page.keyboard.press('Escape');await page.waitForTimeout(280);await page.locator('#new-application').click();check(await page.locator('#course-id').inputValue()==='cheese','reset restores chosen course instead of last preview');check(await page.locator('#form-status').isHidden(),'reset clears previous form status');
    await page.goto(origin+'/admin',{waitUntil:'networkidle'});await page.locator('#admin-username').fill('browser-test-admin');await page.locator('#admin-password').fill(password);await page.locator('#admin-otp').fill(totp(secret));await page.locator('#login-submit').click();await page.waitForSelector('#dashboard-screen:not([hidden])');await page.waitForSelector('.table-open');check(await page.locator('#stat-total').textContent()==='1','admin sees synthetic application');check((await page.locator('.course-cell').innerText()).includes('Сыроделие'),'admin shows cheesemaking title');
    await page.screenshot({path:path.join(output,'admin-synthetic.png'),fullPage:true});await page.locator('.table-open').click();await page.waitForSelector('#application-detail[open]');check((await page.locator('#detail-fields').textContent()).includes('11223344595'),'admin sees decrypted SNILS');check(await page.locator('#detail-documents a').count()===2,'two authenticated documents');
    const documentHref=await page.locator('#detail-documents a').first().getAttribute('href');const documentResponse=await context.request.get(origin+documentHref);check(documentResponse.status()===200,'document download authenticated');check((await documentResponse.body()).equals(pdf),'decrypted document bytes match');
    await page.locator('#detail-status-trigger').click();await page.locator('#detail-status-options').getByRole('option',{name:'На проверке',exact:true}).click();await page.locator('#save-status').click();await page.waitForFunction(()=>document.querySelector('#detail-status-message').textContent.includes('сохранён'));check(await page.locator('#stat-review').textContent()==='1','status persists in admin table');await page.locator('#close-detail').click();
    const focusedId=await page.locator('.table-open').first().getAttribute('data-application-id');await page.locator('.table-open').first().focus();
    const visitor=await browser.newContext(),csrf=(await(await visitor.request.get(origin+'/api/csrf')).json()).token;
    const incoming=await visitor.request.post(origin+'/api/applications',{headers:{Origin:origin,'X-CSRF-Token':csrf},multipart:{courseId:'flowers',lastName:'Тестовый',firstName:'Новый',middleName:'',birthDate:'2000-01-02',phone:'+79990000000',email:'incoming@example.test',snils:'11223344595',education:'professional',consent:'true',consentVersion:(await(await page.request.get(origin+'/api/config')).json()).consentVersion,_csrf:csrf,snilsFile:{name:'synthetic-snils.pdf',mimeType:'application/pdf',buffer:pdf},educationFile:{name:'synthetic-education.pdf',mimeType:'application/pdf',buffer:pdf}}});
    check(incoming.status()===201,'second visitor submits while admin stays open');const incomingId=(await incoming.json()).id;
    await page.waitForFunction(()=>document.querySelector('#stat-total').textContent==='2',null,{timeout:22000});
    check(await page.locator(`[data-application-id="${incomingId}"]`).count()===1,'new application appears without manual refresh');check(await page.evaluate(id=>document.activeElement?.dataset.applicationId===id,focusedId),'auto refresh preserves focused application');
    await visitor.close();await page.screenshot({path:path.join(output,'admin-auto-arrival.png'),fullPage:true});
    const downloadPromise=page.waitForEvent('download');await page.locator('#export-button').click();const download=await downloadPromise;const exportPath=path.join(output,'synthetic-export.xlsx');await download.saveAs(exportPath);const ExcelJS=require('exceljs'),workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(exportPath);check(workbook.worksheets[0].rowCount===3,'real Excel header and two synthetic rows');check(workbook.worksheets[0].getCell('A1').value==='Номер заявки','Russian Excel headers');check(workbook.worksheets[0].getCell('D2').value==='Декоративное цветоводство','Russian Excel program titles');check(workbook.worksheets[0].getCell('D3').value==='Сыроделие','cheesemaking title in downloaded Excel');
    await page.locator('#logout-button').click();await page.waitForSelector('#login-screen:not([hidden])');const anonymous=await context.request.get(origin+documentHref);check(anonymous.status()===401,'private download denied after logout');
    check(!errors.length,`browser runtime errors: ${errors.join('; ')}`);check(!broken.length,`missing resources: ${broken.join('; ')}`);
    const report={checks,layouts:25,routes:['/','/privacy/','/consent/','/operator/','/admin'],widths:[1440,1024,768,360,320],runtimeErrors:errors,missingResources:broken,syntheticIntegration:['application','MFA login','document download','status update','XLSX export','logout denial']};await writeFile(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();if(app){await new Promise(resolve=>app.server.close(resolve));app.close();}if(fixtureDir)await rm(fixtureDir,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
