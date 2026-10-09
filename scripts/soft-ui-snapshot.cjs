const { chromium } = require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const browser=await chromium.launch({executablePath:require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});
 try{
  for(const width of [1440,1280,768,360,320]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
   await page.screenshot({path:`output/qa/soft-top-${width}.png`});
   await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);
   await page.locator('#about').screenshot({path:`output/qa/soft-benefits-${width}.png`});
   await page.locator('#consent').check();await page.locator('#consent').uncheck();
   await page.locator('#application').screenshot({path:`output/qa/soft-form-${width}.png`});
   if(width>=1200)console.log(JSON.stringify(await page.evaluate(()=>{const a=document.querySelector('.hero__aside').getBoundingClientRect(),f=document.querySelector('.hero__features').getBoundingClientRect();return{width:innerWidth,aside:{left:a.left,right:a.right},features:{left:f.left,right:f.right},overlap:Math.max(0,Math.min(a.right,f.right)-Math.max(a.left,f.left))};})));
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
