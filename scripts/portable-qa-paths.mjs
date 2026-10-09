import {readdir,readFile,writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url);
const runtime="require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')";
const browser="require('node:path').join(require('node:os').homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe')";
let changed=0;
for(const file of await readdir(dir)){
 if(!file.endsWith('.cjs'))continue;
 const url=new URL(file,dir),source=await readFile(url,'utf8');
 let next=source.replace(/'C:\/Users\/[^/']+\/\.cache\/codex-runtimes\/codex-primary-runtime\/dependencies\/node\/node_modules\/playwright'/g,runtime)
 .replace(/'C:\/Users\/[^/']+\/AppData\/Local\/ms-playwright\/chromium-1234\/chrome-win64\/chrome\.exe'/g,browser);
 if(next!==source){await writeFile(url,next);changed++;}
}
console.log(`QA runtime paths now derive from the current user's home directory in ${changed} scripts.`);
