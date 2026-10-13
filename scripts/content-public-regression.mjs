// Owns a temporary synthetic server for the original public interaction suites.
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import os from 'node:os';
import {createApp} from '../server/app.mjs';
import {setupAdmin} from '../server/security.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const output=path.resolve('output/content-admin');await mkdir(output,{recursive:true});
const dir=await mkdtemp(path.join(output,'public-regression-')),key=randomBytes(32);
let app;
try {
 await setupAdmin(dir,key,'public-qa','synthetic-public-qa-password!',randomBytes(20));
 app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});
 await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(0,'127.0.0.1',resolve);});
 for(const script of ['browser-qa.cjs','ui-fixes-qa.cjs','client-materials-qa.cjs']) {
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['scripts/'+script],{stdio:'inherit',env:{...process.env,QA_BASE_URL:'http://127.0.0.1:'+app.server.address().port,CHROMIUM_EXECUTABLE:process.env.CHROMIUM_EXECUTABLE||chromium.executablePath()}});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(script+' exited '+code)));
  });
 }
}finally{
 if(app?.server.listening)await new Promise(resolve=>app.server.close(resolve));
 await app?.close();key.fill(0);
 const resolved=path.resolve(dir);if(!resolved.startsWith(output+path.sep))throw Error('Unexpected fixture path');
 await rm(resolved,{recursive:true,force:true});
}
