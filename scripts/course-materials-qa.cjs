const qaBase=process.env.QA_BASE_URL||'http://127.0.0.1:3000';
const path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const updates={drone:'БАС',nutrition:'Рационы питания',bread:'Хлебопечение',cheese:'Сыроделие'};
const normalize=text=>text.replace(/\s+/g,' ').trim();

(async()=>{
 const {courses}=await import('../public/assets/js/courses.js');
 let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
 const referenceFile=path.join(process.cwd(),'output/qa/new-annotations.json');
 try{
  const reference=JSON.parse(await fs.readFile(referenceFile,'utf8'));
  for(const id of Object.keys(updates)){
   check(normalize(courses[id].title)===normalize(reference[id].title),`${id} title matches supplied DOCX`);
   check(normalize(courses[id].description)===normalize(reference[id].description),`${id} all paragraphs match supplied DOCX`);
   check(courses[id].description.split('\n\n').length===reference[id].description.split('\n\n').length,`${id} paragraph breaks retained`);
  }
 }catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.mkdir('output/qa',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  for(const width of [1440,768,360,320]){
   await page.setViewportSize({width,height:900});
   await page.goto(qaBase+'/?v=20261012-course-materials',{waitUntil:'networkidle'});
   if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
   check(await page.locator('.program-card').count()===Object.keys(courses).length,`every course has one card ${width}`);
   for(const [id,label] of Object.entries(updates)){
    const card=page.locator(`.program-card[data-course="${id}"]`);
    check((await card.locator('.program-category').textContent()).trim()===label,`correct category ${id}/${width}`);
    check((await card.locator('img').getAttribute('src')).endsWith(`/${id}-client.webp`),`new card image ${id}/${width}`);
    check(await card.locator('img').evaluate(image=>image.naturalWidth===1024&&image.naturalHeight===1024&&getComputedStyle(image).objectFit==='cover'),`photo loaded without distortion ${id}/${width}`);
    check(await card.locator('.program-card__photo').evaluate(frame=>Math.abs(frame.clientWidth/frame.clientHeight-1.5)<.015),`shared 3:2 photo frame ${id}/${width}`);
    if([1440,320].includes(width))await card.screenshot({path:`output/qa/new-card-${id}-${width}.png`});
    await card.click();await page.waitForSelector('#course-dialog[open]');await page.waitForTimeout(250);
    check(await page.locator('#dialog-title').textContent()===courses[id].title,`correct modal title ${id}/${width}`);
    check(await page.locator('#dialog-description').textContent()===courses[id].description,`complete supplied annotation ${id}/${width}`);
    check(await page.locator('#dialog-description').evaluate(el=>getComputedStyle(el).whiteSpace==='pre-line'),`readable paragraph breaks ${id}/${width}`);
    check(await page.locator('#dialog-topics').isHidden()&&await page.locator('.course-dialog__disclaimer').isHidden(),`only supplied content ${id}/${width}`);
    check(await page.locator('#dialog-image').evaluate(image=>Math.abs(image.clientHeight-Math.min(image.clientWidth/1.5,290))<1&&getComputedStyle(image).objectFit==='cover'&&image.naturalWidth===1024),`compact modal photo in natural crop ${id}/${width}`);
    check(await page.locator('#course-dialog').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth),`no horizontal modal scroll ${id}/${width}`);
    if([1440,320].includes(width))await page.locator('#course-dialog').screenshot({path:`output/qa/new-modal-${id}-${width}.png`});
    await page.locator('#choose-course').scrollIntoViewIfNeeded();await page.locator('#choose-course').click();await page.locator('#course-dialog').waitFor({state:'hidden'});
    check(await page.locator('#course-id').inputValue()===id,`course selectable for application ${id}/${width}`);
    check(await page.locator('#selected-course-label').textContent()===courses[id].title,`selected course full name ${id}/${width}`);
   }
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no page overflow ${width}`);
  }
  check(errors.length===0,'no browser runtime errors');
  console.log(`${checks} new course annotations/photos/modal/selection checks passed.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
