const {chromium}=require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});try{
 const page=await browser.newPage();let checks=0;
 for(const width of [1440,1536,1920,1280,768,360,320]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
  const geometry=await page.evaluate(()=>{
   const note=document.querySelector('.application__right-note'),style=getComputedStyle(note),form=document.querySelector('.application__form-wrap').getBoundingClientRect();
   if(style.display==='none')return {hidden:true};
   const range=document.createRange();range.selectNodeContents(note.firstChild);const copy=range.getBoundingClientRect(),box=note.getBoundingClientRect();
   return{hidden:false,formRight:form.right,textLeft:copy.left,noteRight:box.right,padding:parseFloat(style.paddingLeft)};
  });
  if(width>=1400){assert.equal(geometry.hidden,false);assert.ok(geometry.textLeft>=geometry.formRight+8,JSON.stringify({width,...geometry}));assert.ok(geometry.padding>=28);checks+=3;}else{assert.equal(geometry.hidden,true);checks++;}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks++;
  if(width===1440){await page.locator('.application__right-note').screenshot({path:'output/qa/working-note.png'});await page.locator('.faq-contact').screenshot({path:'output/qa/working-faq.png'});}
 }
 console.log(`${checks} note clearance and viewport checks passed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
