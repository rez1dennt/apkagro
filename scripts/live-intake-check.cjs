const {chromium}=require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const {writeFile}=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'),headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('http://127.0.0.1:3000/',{waitUntil:'networkidle'});
 assert.equal((await(await page.request.get('http://127.0.0.1:3000/api/config')).json()).enabled,true);
 await page.locator('#cookie-acknowledge').click();await page.waitForTimeout(250);
 await page.locator('[data-course="flowers"]').click();await page.locator('#choose-course').click();await page.waitForTimeout(250);
 for(const [id,value]of Object.entries({'last-name':'Тестовая','first-name':'Проверка','middle-name':'Сайта','birth-date':'2000-01-02',phone:'79990000000',email:'test-intake@example.test',snils:'11223344595'}))await page.locator('#'+id).fill(value);
 await page.locator('#education').selectOption('professional');
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\n% TEST DOCUMENT - NO PERSONAL DATA\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
 for(const id of ['snils-file','education-file'])await page.locator('#'+id).setInputFiles({name:'TEST-no-personal-data-'+id+'.pdf',mimeType:'application/pdf',buffer:pdf});
 await page.locator('#consent').check();const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/applications')&&r.request().method()==='POST');await page.locator('#submit-application').click();const response=await responsePromise,result=await response.json();assert.equal(response.status(),201,result.error);assert.match(result.id,/^[0-9a-f-]{36}$/);await page.waitForSelector('#application-success:not([hidden])');
 await writeFile('output/qa/live-intake-proof.json',JSON.stringify({id:result.id,submittedAt:new Date().toISOString(),synthetic:true,status:response.status()},null,2));
 await page.screenshot({path:'output/qa/live-intake-success.png'});console.log(JSON.stringify({saved:true,id:result.id,status:response.status(),synthetic:true}));
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
