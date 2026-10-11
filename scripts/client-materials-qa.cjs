const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const wineDetails=image=>{
 const style=getComputedStyle(image),width=image.clientWidth,height=image.clientHeight;
 const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight);
 const [x,y]=style.objectPosition.split(' ').map(value=>parseFloat(value)/100);
 const visibleWidth=width/scale,visibleHeight=height/scale;
 const left=(image.naturalWidth-visibleWidth)*x,top=(image.naturalHeight-visibleHeight)*y;
 // Reference points in the supplied photo: head, whole face, grape cluster and holding hand.
 const visible=[{x:400,y:50},{x:310,y:110},{x:470,y:315},{x:615,y:565},{x:610,y:620},{x:613,y:710}].every(point=>point.x>=left&&point.x<=left+visibleWidth&&point.y>=top&&point.y<=top+visibleHeight);
 return{visible,fit:style.objectFit,transform:style.transform};
};
(async()=>{
 const {courses}=await import(pathToFileURL(path.join(process.cwd(),'public/assets/js/courses.js')));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});
 let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1440,768,360,320]){
   await page.setViewportSize({width,height:900});
   for(const route of ['/','/privacy/','/consent/','/operator/']){
    await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'networkidle'});
    if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
    const footer=page.locator('.footer__organization'),text=await footer.innerText();
    check(text.includes('1207700044310')&&text.includes('7707437711')&&text.includes('Л035-01298-77/07267658'),`organization and license ${route}/${width}`);
    check(!text.includes('Евстафьев')&&!text.includes('Введенского'),`organization replaces personal footer details ${route}/${width}`);
    check(await footer.locator('a[href="https://islod.obrnadzor.gov.ru/view/322690"]').count()===1,`direct registry link ${route}/${width}`);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${route}/${width}`);
    check(await page.locator('.legal-version,[data-document-placeholder],#notice-dialog').count()===0,`no unfinished document controls ${route}/${width}`);
    check(!/подлежит утверждению|будет добавлена|должны быть утверждены|проект документа|В текущей сборке|Предварительная аннотация/.test(await page.locator('body').textContent()),`no draft or build notices ${route}/${width}`);
    if(route==='/'){
     check(await page.locator('.program-card__photo').evaluateAll(frames=>frames.every(frame=>Math.abs(frame.clientHeight-frame.querySelector('img').clientHeight)<=1)),`program images fill their frames ${width}`);
     check(await page.locator('.program-card').evaluateAll(cards=>{
      const rows=[];
      for(const card of cards){const top=card.getBoundingClientRect().top,bottom=card.querySelector('.program-card__footer').getBoundingClientRect().bottom;let row=rows.find(row=>Math.abs(row.top-top)<1);if(!row){row={top,bottoms:[]};rows.push(row);}row.bottoms.push(bottom);}
      return rows.every(row=>Math.max(...row.bottoms)-Math.min(...row.bottoms)<1);
     }),`program actions align within each row ${width}`);
    }
    if(route==='/'&&[1440,320].includes(width))await footer.screenshot({path:`output/qa/organization-footer-${width}.png`});
    if(route==='/'&&[1440,320].includes(width)){
     const defaultModalImageHeight=await page.locator('#dialog-image').evaluate(image=>parseFloat(getComputedStyle(image).height));
     for(const id of ['flowers','wine','cider']){
      const card=page.locator(`.program-card[data-course="${id}"]`);
      check((await card.locator('img').getAttribute('src')).endsWith(`/${id}-client.webp`),`client card photo ${id}/${width}`);
      if(id==='wine'){
       await card.hover();await page.waitForTimeout(450);
       const details=await card.locator('img').evaluate(wineDetails);
       check(details.visible&&details.fit==='cover'&&details.transform==='none',`head, face, grapes and hands visible in wine card ${width}`);
      }
      if(id==='cider'){
       await card.hover();await page.waitForTimeout(450);
       const photo=await card.locator('.program-card__photo').evaluate(el=>{const image=el.querySelector('img'),style=getComputedStyle(image);return{height:el.getBoundingClientRect().height,referenceHeight:document.querySelector('[data-course="bread"] .program-card__photo').getBoundingClientRect().height,fit:style.objectFit,transform:style.transform};});
       check(Math.abs(photo.height-photo.referenceHeight)<1&&photo.fit==='cover'&&photo.transform==='none',`natural cider crop in shared frame, including hover ${width}`);
      }
      await card.screenshot({path:`output/qa/client-card-${id}-${width}.png`});
      await card.click();await page.waitForSelector('#course-dialog[open]');await page.waitForTimeout(250);
      check(await page.locator('#dialog-description').textContent()===courses[id].description,`full annotation ${id}/${width}`);
      check(await page.locator('#dialog-topics').isHidden()&&await page.locator('.course-dialog__disclaimer').isHidden(),`no provisional topics ${id}/${width}`);
      check((await page.locator('#dialog-image').getAttribute('src')).endsWith(`/${id}-client.webp`),`client modal photo ${id}/${width}`);
      if(id==='wine')check((await page.locator('#dialog-image').evaluate(wineDetails)).visible,`head, face, grapes and hands visible in wine modal ${width}`);
      if(id==='cider')check(await page.locator('#dialog-image').evaluate((image,height)=>Math.abs(image.getBoundingClientRect().height-height)<1&&getComputedStyle(image).objectFit==='cover',defaultModalImageHeight),`natural cider crop inside original modal frame ${width}`);
      await page.locator('#course-dialog').screenshot({path:`output/qa/client-modal-${id}-${width}.png`});
      await page.keyboard.press('Escape');await page.waitForTimeout(270);
     }
     const wineCard=page.locator('.program-card[data-course="wine"]');
     await wineCard.click();await page.waitForSelector('#course-dialog[open]');
     await page.locator('#choose-course').click();await page.locator('#course-dialog').waitFor({state:'hidden'});
     check(await page.locator('#course-id').inputValue()==='wine',`wine selected for application ${width}`);
     check(await wineCard.locator('.program-card__badge').isVisible(),`selected wine badge ${width}`);
     check(await wineCard.evaluate(card=>{const a=card.querySelector('.program-category').getBoundingClientRect(),b=card.querySelector('.program-card__badge').getBoundingClientRect();return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;}),`wine labels do not overlap ${width}`);
     if(width===1440)await page.locator('.program-grid').screenshot({path:'output/qa/program-grid-roomier-1440.png'});
    }
   }
  }
  await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
  for(const width of [360,390,414,540,699,700,768]){
   await page.setViewportSize({width,height:900});
   const card=page.locator('.program-card[data-course="wine"]');
   await card.hover();await page.waitForTimeout(450);
   const details=await card.locator('img').evaluate(wineDetails);
   check(details.visible&&details.fit==='cover'&&details.transform==='none',`wine card details at breakpoint ${width}`);
   check(await card.locator('.program-card__photo').evaluate(frame=>Math.abs(frame.getBoundingClientRect().height-document.querySelector('[data-course="bread"] .program-card__photo').getBoundingClientRect().height)<1),`matching wine and neighboring card frames ${width}`);
   await card.click();await page.waitForSelector('#course-dialog[open]');await page.waitForTimeout(250);
   check((await page.locator('#dialog-image').evaluate(wineDetails)).visible,`wine modal details at breakpoint ${width}`);
   check(await page.locator('#dialog-image').evaluate(image=>Math.abs(image.getBoundingClientRect().height-image.parentElement.getBoundingClientRect().height)<1&&getComputedStyle(image).objectFit==='cover'),`wine image fills modal frame ${width}`);
   if(width===414)await page.locator('#course-dialog').screenshot({path:'output/qa/client-modal-wine-414.png'});
   await page.keyboard.press('Escape');await page.waitForTimeout(270);
  }
  await page.goto('http://127.0.0.1:3000/consent/',{waitUntil:'networkidle'});
  for(const file of ['consent.pdf','consent.docx','privacy-policy.pdf']){
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator(`.document-downloads a[href="/documents/${file}"]`).click()]);
   check(await download.failure()===null,`public download ${file}`);
  }
  check(errors.length===0,'no runtime errors');console.log(`${checks} client materials / public document checks passed.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
