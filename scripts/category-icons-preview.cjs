const {chromium}=require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{const browser=await chromium.launch({executablePath:require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});try{
 const page=await browser.newPage();
 for(const width of [1440,360,320]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
  if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
  for(const course of ['cider','nutrition'])await page.locator(`[data-course="${course}"] .program-card__photo`).screenshot({path:`output/qa/category-${course}-${width}.png`});
  console.log(JSON.stringify({width,project:await page.locator('[data-course="cider"] .program-category use').getAttribute('href'),food:await page.locator('[data-course="nutrition"] .program-category use').getAttribute('href'),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}));
 }
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
