const {chromium}=require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});try{
 const page=await browser.newPage();let checks=0;
 for(const width of [1440,1024,768,360,320]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
  if(await page.locator('#cookie-banner').isVisible()){await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);}
  const field=page.locator('#snils'),error=page.locator('#snils-error');
  await field.fill('11111111111');await field.press('Tab');
  assert.equal((await field.inputValue()).replace(/\D/g,'').length,11);
  assert.match(await error.textContent(),/контрольные цифры/i,'eleven-digit checksum failure has a precise explanation');
  assert.doesNotMatch(await error.textContent(),/11 цифр/,'complete input is not described as a length error');checks+=3;
  if([1440,320].includes(width))await field.locator('..').screenshot({path:`output/qa/snils-checksum-${width}.png`});
  await field.fill('1111111111');await field.press('Tab');assert.match(await error.textContent(),/11 цифр/,'incomplete input explains required length');checks++;
  await field.fill('00000000000');await field.press('Tab');assert.match(await error.textContent(),/только из нулей/);checks++;
  await field.fill('11223344595');await field.press('Tab');assert.equal(await error.textContent(),'');assert.equal(await field.getAttribute('aria-invalid'),'false');checks+=2;
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'error copy does not overflow');checks++;
 }
 console.log(`${checks} SNILS length/checksum message and viewport checks passed.`);
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
