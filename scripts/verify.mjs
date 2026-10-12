import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { courses } from '../public/assets/js/courses.js';
const root=fileURLToPath(new URL('../',import.meta.url)),publicDir=path.join(root,'public');
const failures=[];let checks=0;
async function files(dir){return(await Promise.all((await readdir(dir,{withFileTypes:true})).map(item=>item.isDirectory()?files(path.join(dir,item.name)):path.join(dir,item.name)))).flat();}
const sources=await files(publicDir);
for(const file of sources){
  if(/\.(html|css|js)$/.test(file)){
    const text=await readFile(file,'utf8');
    if(/\.js$/.test(file)){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});checks++;if(result.status!==0)failures.push(`${path.relative(root,file)} syntax: ${result.stderr}`);}
    if(/\.html$/.test(file)){checks++;if((text.match(/<h1(?:\s|>)/g)||[]).length!==1)failures.push(`${path.relative(root,file)} must contain one h1`);if(!/<html lang="ru">/.test(text)||!/<meta name="viewport"/.test(text)||!/<title>[^<]+<\/title>/.test(text))failures.push(`${path.relative(root,file)} metadata incomplete`);if(/\son(?:click|submit|load)=|<script(?![^>]*src=)[^>]*>\s*[^<\s]/i.test(text))failures.push(`${path.relative(root,file)} inline script forbidden by CSP`);}
    const references=new Set([...text.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+)|url\(['"]?(\/(?!\/)[^)'"?#]+)/g)].map(match=>match[1]||match[2]));
    for(let reference of references){if(reference==='/'||reference.startsWith('/api/'))continue;let target=path.join(publicDir,reference);if(reference==='/admin')target=path.join(publicDir,'admin.html');else if(reference.endsWith('/'))target=path.join(target,'index.html');checks++;try{await access(target);}catch{failures.push(`${path.relative(root,file)} missing ${reference}`);}}
  }
}
const main=await readFile(path.join(publicDir,'index.html'),'utf8');
const cardIds=[...main.matchAll(/<button class="program-card"[^>]*data-course="([^"]+)"/g)].map(match=>match[1]);
checks++;if(cardIds.length!==Object.keys(courses).length||new Set(cardIds).size!==cardIds.length||cardIds.some(id=>!Object.hasOwn(courses,id)))failures.push('Course cards must match the published course catalog');
checks++;if(/href="\/admin/.test(main))failures.push('Admin link must not appear on public landing');checks++;if(/id="consent"[^>]*checked/.test(main))failures.push('Consent must not be checked by default');
for(const file of (await files(path.join(root,'server'))).filter(x=>x.endsWith('.mjs'))){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});checks++;if(result.status!==0)failures.push(`${path.relative(root,file)} syntax: ${result.stderr}`);}
if(failures.length){console.error(failures.join('\n'));console.error(`${failures.length} failure(s), ${checks} checks`);process.exitCode=1;}else console.log(`${checks} static/syntax/asset checks passed; ${sources.length} public files.`);
