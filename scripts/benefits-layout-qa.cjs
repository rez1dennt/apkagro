const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||path.join(os.homedir(),'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});
 let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
  if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
  await page.locator('.benefit > img').evaluateAll(images=>Promise.all(images.map(async image=>{image.loading='eager';await image.decode();})));
  for(const width of [1440,1325,1280,1279,1200,1199,1100,1024,960,959,768,760,759,700,699,540,390,360,320]){
   await page.setViewportSize({width,height:900});await page.locator('#about').scrollIntoViewIfNeeded();
   const cards=await page.locator('.benefit').evaluateAll(cards=>cards.map(card=>{
    const box=card.getBoundingClientRect(),heading=card.querySelector('h3').getBoundingClientRect(),copy=card.querySelector('p').getBoundingClientRect(),icon=card.querySelector('.benefit-icon').getBoundingClientRect();
    const text=[];
    for(const element of card.querySelectorAll('h3,p')){
     const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node;
     while(node=walker.nextNode()){if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);text.push(...Array.from(range.getClientRects()).filter(rect=>rect.width>0).map(rect=>({left:rect.left,right:rect.right})));}
    }
    return{left:box.left,top:box.top,bottom:box.bottom,width:box.width,headingTop:heading.top,copyTop:copy.top,iconGap:heading.top-icon.bottom,safeText:text.every(rect=>rect.left>=box.left+18&&rect.right<=box.right-18)};
   }));
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no page overflow ${width}`);
   check(cards.length===4&&cards.every(card=>card.safeText),`text has breathing room at both card edges ${width}`);
   check(cards.every(card=>card.iconGap>=8),`icons sit above headings ${width}`);
   const rows=[];for(const card of cards){let row=rows.find(row=>Math.abs(row[0].top-card.top)<1);if(!row){row=[];rows.push(row);}row.push(card);}
   check(rows.every(row=>['bottom','headingTop','copyTop'].every(property=>Math.max(...row.map(card=>card[property]))-Math.min(...row.map(card=>card[property]))<1)),`cards and text align within rows ${width}`);
   if(width<=699)check(rows.length===4&&cards.every(card=>Math.abs(card.left-cards[0].left)<1),`one benefit card per mobile row ${width}`);
   if(width>=700&&width<=959)check(rows.length===2&&rows.every(row=>row.length===2),`two comfortable tablet columns ${width}`);
   const practical=page.locator('.benefit').nth(2),before=await practical.boundingBox();await practical.hover();await page.waitForTimeout(250);const after=await practical.boundingBox();
   check(Math.abs(before.width-after.width)<1&&Math.abs(before.height-after.height)<1,`stable benefit hover ${width}`);
   if([1440,1325,768,360,320].includes(width)){
    const overlays=page.locator('.header,.skip-link');
    const displays=await overlays.evaluateAll(elements=>elements.map(element=>{const display=element.style.display;element.style.display='none';return display;}));
    try{await page.locator('#about').screenshot({path:`output/qa/benefits-after-${width}.png`});}
    finally{await overlays.evaluateAll((elements,displays)=>elements.forEach((element,index)=>{element.style.display=displays[index];}),displays);}
   }
   if(width===320)await practical.screenshot({path:'output/qa/benefit-practical-after-320.png'});
  }
  check(errors.length===0,'no runtime errors');console.log(`${checks} benefit spacing / responsive checks passed.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
