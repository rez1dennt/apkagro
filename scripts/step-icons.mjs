import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const book=await readFile(new URL('output/icon-sources/book-open-check.svg',root),'utf8');
const form=await readFile(new URL('output/icon-sources/clipboard-pen-line.svg',root),'utf8');
const body=svg=>svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1].trim();
let bookPaths=body(book).replace('<path d="m16 12 2 2 4-4"', '<path stroke="var(--icon-secondary,currentColor)" d="m16 12 2 2 4-4"');
let formPaths=body(form).replace('<rect ', '<rect fill="var(--icon-secondary,currentColor)" fill-opacity=".16" ').replace('<path d="M21.378', '<path stroke="var(--icon-secondary,currentColor)" fill="var(--icon-secondary,currentColor)" fill-opacity=".16" d="M21.378');
const symbol=(id,paths)=>`<symbol id="${id}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width=".85" stroke-linecap="round" stroke-linejoin="round">${paths}</g></symbol>`;
let sprite=await readFile(new URL('public/assets/icons-v2.svg',root),'utf8');
for(const [id,paths]of [['course-catalog',bookPaths],['application-form',formPaths]]){
 const markup=symbol(id,paths),pattern=new RegExp(`<symbol id="${id}"[\\s\\S]*?<\\/symbol>`);
 sprite=pattern.test(sprite)?sprite.replace(pattern,markup):sprite.replace('</svg>',`${markup}\n</svg>`);
}
await writeFile(new URL('public/assets/icons-v2.svg',root),sprite);
let html=await readFile(new URL('public/index.html',root),'utf8');
html=html.replace(/<ol class="step-list">[\s\S]*?<\/ol>/,section=>{
 let index=0;return section.replace(/<li>[\s\S]*?<\/li>/g,item=>{
  const ids=['course-catalog','application-form','mail','cap'];
  return item.replace(/<svg class="icon"[^>]*><use href="[^"]+"><\/use><\/svg>/,`<svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg?v=20261009-steps#${ids[index++]}"></use></svg>`);
 });
});
await writeFile(new URL('public/index.html',root),html);
await mkdir(new URL('public/assets/licenses/',root),{recursive:true});
await writeFile(new URL('public/assets/licenses/lucide.txt',root),await readFile(new URL('output/icon-sources/lucide-LICENSE.txt',root),'utf8'));
console.log('Distinct catalogue/form icons applied; original Lucide geometry and license preserved.');
