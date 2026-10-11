const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [320,360,390,414,540,699,700,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
  if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
  const geometry=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
   const faq=document.querySelector('.faq-contact'),body=document.querySelector('.course-dialog__body'),style=getComputedStyle(body);
   return{benefitWidth:document.querySelector('.about__grid').getBoundingClientRect().width,programWidth:document.querySelector('.program-grid').getBoundingClientRect().width,benefits:[...document.querySelectorAll('.benefit')].map(rect),programs:[...document.querySelectorAll('.program-card')].map(rect),uploads:[...document.querySelectorAll('.upload-zone')].map(rect),faq:{textBottom:Math.max(faq.querySelector('h3').getBoundingClientRect().bottom,faq.querySelector('p').getBoundingClientRect().bottom),buttonTop:faq.querySelector('.button').getBoundingClientRect().top},modal:{paddingTop:parseFloat(style.paddingTop),paddingLeft:parseFloat(style.paddingLeft)}};
  });
  if(width===320)console.log(JSON.stringify({width,geometry}));
  if(width<700){
   check(geometry.benefits.every(r=>Math.abs(r.x-geometry.benefits[0].x)<=1&&Math.abs(r.width-geometry.benefitWidth)<=1),`full-width benefit column at ${width}`);
   check(geometry.programs.every(r=>Math.abs(r.x-geometry.programs[0].x)<=1&&Math.abs(r.width-geometry.programWidth)<=1),`full-width program column at ${width}`);
   check(geometry.faq.buttonTop>=geometry.faq.textBottom+8,`FAQ button below text at ${width}`);
   check(Math.abs(geometry.uploads[0].y-geometry.uploads[1].y)<=1&&Math.abs(geometry.uploads[0].height-geometry.uploads[1].height)<=1,`upload zones aligned at ${width}`);
   check(geometry.modal.paddingLeft<=18&&geometry.modal.paddingTop<=18,`compact course modal at ${width}`);
   const pdf=Buffer.from('%PDF-1.4\nSynthetic layout fixture\n%%EOF');await page.locator('#snils-file').setInputFiles({name:'synthetic-'+('long-document-name-'.repeat(7))+'.pdf',mimeType:'application/pdf',buffer:pdf});await page.locator('#education-file').dispatchEvent('change');
   const uploads=await page.locator('.upload-zone').evaluateAll(elements=>elements.map(el=>({y:el.getBoundingClientRect().y,height:el.getBoundingClientRect().height,scroll:el.scrollHeight,client:el.clientHeight})));check(Math.abs(uploads[0].y-uploads[1].y)<=1&&Math.abs(uploads[0].height-uploads[1].height)<=1,`long filename / one error preserves alignment ${width}`);check(uploads.every(r=>r.scroll<=r.client+1),`upload text fits target ${width}`);
   if([320,390].includes(width)){await page.locator('.benefit').first().screenshot({path:`output/qa/mobile-benefit-${width}.png`});await page.locator('.program-card[data-course="drone"]').screenshot({path:`output/qa/mobile-program-${width}.png`});await page.locator('.faq-contact').screenshot({path:`output/qa/mobile-faq-${width}.png`});await page.locator('.form-grid--two').screenshot({path:`output/qa/mobile-uploads-${width}.png`});}
  }else{check(Math.abs(geometry.benefits[0].y-geometry.benefits[1].y)<=1,`tablet/desktop benefits retain grid ${width}`);check(Math.abs(geometry.programs[0].y-geometry.programs[1].y)<=1,`tablet/desktop programs retain grid ${width}`);}
  const courses=width===320?['drone','flowers','wine','bread','cider','nutrition']:['flowers'];
  for(const id of courses){
   const card=page.locator(`.program-card[data-course="${id}"]`);await card.scrollIntoViewIfNeeded();const y=await page.evaluate(()=>scrollY);await card.click();await page.waitForSelector('#course-dialog[open]');await page.waitForTimeout(250);
   if(width<700){const modal=await page.locator('#course-dialog').boundingBox();check(width-modal.width<=40,`compact outer modal gutters ${id}/${width}: ${modal.width}`);}
   check(await page.locator('#course-dialog .dialog-close').isVisible(),`close reachable ${id}/${width}`);
   await page.locator('#choose-course').scrollIntoViewIfNeeded();const button=await page.locator('#choose-course').boundingBox();check(button.x>=0&&button.x+button.width<=width&&button.y>=0&&button.y+button.height<=900,`course action fits viewport ${id}/${width}`);
   if(id==='flowers'&&[320,390].includes(width)){await page.locator('#course-dialog').evaluate(el=>{el.scrollTop=0;});await page.screenshot({path:`output/qa/mobile-modal-${width}.png`});}
   await page.keyboard.press('Escape');await page.waitForTimeout(270);check(Math.abs(await page.evaluate(()=>scrollY)-y)<=1,`course scroll restored ${id}/${width}`);
  }
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow ${width}`);
 }
 check(errors.length===0,'no runtime errors');console.log(`${checks} mobile cards/FAQ/modal/uploads checks passed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
