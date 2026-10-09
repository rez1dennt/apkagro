const {chromium}=require(process.env.PLAYWRIGHT_MODULE||require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');const path=require('node:path');
const output=path.resolve(__dirname,'../output/qa');
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
async function art(page){return page.evaluate(()=>{const el=document.querySelector('.application__landscape'),s=getComputedStyle(el),h=el.getBoundingClientRect().height;return{height:h,size:s.backgroundSize,position:s.backgroundPosition,pixels:s.backgroundSize.split(',').slice(1).map(layer=>{const value=layer.trim().split(/\s+/).at(-1);return value.endsWith('%')?parseFloat(value)*h/100:parseFloat(value);}),y:scrollY};});}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});try{
const context=await browser.newContext();const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
if(await page.locator('#cookie-banner').count()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(280);}
const before=await art(page);await page.locator('#consent').check();await page.locator('#consent').uncheck();const after=await art(page);
const diagnosis=await page.evaluate(()=>({heights:[...document.querySelectorAll('.benefit')].map(el=>el.getBoundingClientRect().height),aside:{radius:getComputedStyle(document.querySelector('.hero__aside')).borderTopLeftRadius,clip:getComputedStyle(document.querySelector('.hero__aside')).clipPath},ministry:document.querySelectorAll('.ministry').length,cookie:Boolean(document.querySelector('#cookie-banner'))}));
console.log(JSON.stringify({diagnosis,before,after}));
check(parseFloat(diagnosis.aside.radius)>=20&&diagnosis.aside.clip==='none','callout has soft corners without angular polygon');
check(Math.max(...diagnosis.heights)-Math.min(...diagnosis.heights)<=1,'all four desktop benefits share height');
check(after.height===before.height,'consent validation does not change section height');check(after.pixels.every((value,index)=>Math.abs(value-before.pixels[index])<=1),'form error does not resize background images');
check(diagnosis.ministry===0,'Ministry branding removed');check(diagnosis.cookie,'cookie notice exists');
await page.evaluate(()=>localStorage.removeItem('apk:cookie-notice:v1'));await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});await page.waitForSelector('#cookie-banner.is-visible');
const geometry=await page.evaluate(()=>({y:scrollY,x:document.querySelector('.header .brand').getBoundingClientRect().x}));
await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(280);check(await page.locator('#cookie-banner').isHidden(),'cookie notice closes after transition');
check(await page.evaluate(()=>scrollY)===geometry.y,'cookie close preserves scroll');check(Math.abs(await page.locator('.header .brand').evaluate(el=>el.getBoundingClientRect().x)-geometry.x)<=1,'cookie close preserves header position');
await page.reload({waitUntil:'networkidle'});check(await page.locator('#cookie-banner').isHidden(),'cookie acknowledgement persists across reload');
await page.locator('[data-cookie-open]').click();await page.waitForSelector('#cookie-banner.is-visible');check(await page.locator('#cookie-acknowledge').isVisible(),'footer can reopen notice');
await page.locator('#cookie-dismiss').click();await page.waitForTimeout(280);check(await page.locator('[data-cookie-open]').evaluate(el=>document.activeElement===el),'reopening restores focus to footer');
for(const width of [1440,1280,1024,768,360,320]){
 await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 const cards=await page.locator('.benefit').evaluateAll(elements=>elements.map(el=>({h:el.getBoundingClientRect().height,y:el.getBoundingClientRect().top})));
 if(width>=1200)check(await page.evaluate(()=>document.querySelector('.hero__features').getBoundingClientRect().right+16<=document.querySelector('.hero__aside').getBoundingClientRect().left),`callout does not overlap hero features at ${width}`);
 const rows=new Map();for(const card of cards){const key=Math.round(card.y);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(card.h);}for(const heights of rows.values())check(Math.max(...heights)-Math.min(...heights)<=1,`equal benefit heights at ${width}`);
 const a=await art(page);await page.locator('#consent').check();await page.locator('#consent').uncheck();const b=await art(page);check(a.height===b.height&&a.pixels.every((v,i)=>Math.abs(v-b.pixels[i])<=1),`stable art and form at ${width}`);
 await page.locator('[data-cookie-open]').click();await page.waitForSelector('#cookie-banner.is-visible');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`cookie no overflow at ${width}`);
 const box=await page.locator('#cookie-banner').boundingBox();check(box.x>=0&&box.x+box.width<=width,`cookie fits viewport ${width}`);
 if(width<=360)check(box.height<=185,`compact cookie notice at ${width}`);
 if([1440,360,320].includes(width))await page.screenshot({path:path.join(output,`soft-cookie-${width}.png`),fullPage:true});
 await page.locator('#cookie-dismiss').click();await page.waitForTimeout(280);
}
for(const route of ['/privacy/','/consent/','/operator/']){await page.goto('http://127.0.0.1:3000'+route,{waitUntil:'networkidle'});check(await page.locator('.ministry').count()===0,`no Ministry on ${route}`);check(await page.locator('#cookie-banner').count()===1,`shared notice on ${route}`);}
await page.goto('http://127.0.0.1:3000/privacy/#cookies',{waitUntil:'networkidle'});check(await page.locator('#cookies').count()===1,'cookie policy link resolves to section');
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-cookie-open]').click();await page.waitForSelector('#cookie-banner.is-visible');await page.locator('#cookie-acknowledge').press('Escape');await page.waitForTimeout(20);check(await page.locator('#cookie-banner').isHidden(),'Escape and reduced motion close notice');
check(errors.length===0,'no UI runtime errors');
const denied=await browser.newContext({viewport:{width:320,height:900}});await denied.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});const p=await denied.newPage();await p.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});await p.waitForSelector('#cookie-banner.is-visible');
await p.locator('.menu-toggle').click();await p.waitForTimeout(280);check(await p.locator('#cookie-banner').evaluate(el=>el.inert),'notice controls inert while burger is open');check(await p.evaluate(()=>Boolean(document.elementFromPoint(100,800)?.closest('#mobile-menu'))),'burger covers cookie notice');await p.locator('.menu-toggle').press('Escape');await p.waitForTimeout(280);check(await p.locator('#cookie-banner').evaluate(el=>!el.inert),'notice accessible again after burger closes');
await p.locator('#cookie-acknowledge').click();await p.waitForTimeout(280);check(await p.locator('#cookie-banner').isHidden(),'notice works when browser storage blocked');await denied.close();
console.log(`${checks} soft-corner/card/background/cookie checks passed.`);
}finally{await browser.close();}})().catch(error=>{console.error(error.stack);process.exitCode=1;});
