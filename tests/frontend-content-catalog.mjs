import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {loadDefaultContent,validateContent} from '../server/content-schema.mjs';
import {openContentStore} from '../server/content-store.mjs';
import {renderContentPage} from '../server/content-render.mjs';
import {catalogFixture} from '../scripts/catalog-fixtures.mjs';
import {wrapCaption} from '../public/assets/js/content-responsive.js';
const original=await loadDefaultContent(),template=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
for(const mode of ['natural','token'])for(const count of [12,20])test(`${mode} ${count} boundary catalog preserves order, separate card/full titles and public states`,()=>{
 const c=catalogFixture(original,{count,mode}),d=parseHTML(renderContentPage({content:c,template})).document;
 assert.deepEqual([...d.querySelectorAll('.program-card')].map(n=>n.dataset.course),Array.from({length:count},(_,i)=>'catalog-'+i));
 assert.equal([...d.querySelector('.program-card__body > span:last-child').childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),c.programs[0].cardTitle);
 const boot=JSON.parse(d.querySelector('#site-content').textContent);assert.equal(boot.programs[0].title,c.programs[0].title);assert.equal(boot.programs[3].status,'closed');assert.equal(boot.programs.length,count);
});
test('saved catalog accepts exactly100 records and rejects101 without changing the saved revision',async()=>{
 const store=await openContentStore({dir:'unused',persist:false});try{const d=store.getDraft(),c=catalogFixture(original,{count:100,short:true});const saved=await store.saveDraft(c,d.revision);assert.equal(saved.content.programs.length,100);c.programs.push({...c.programs[0],id:'max-100'});await assert.rejects(()=>store.saveDraft(c,saved.revision),e=>e.code==='INVALID_CONTENT');assert.equal(store.getDraft().revision,saved.revision);}finally{await store.close();}
});
for(const [name,statuses]of [['empty',[]],['closed',['closed','closed']],['archived',['archived']],['mixed',['draft','published','closed','archived','published']]])test(`${name} public catalog exposes exactly eligible visible records`,()=>{
 const c=structuredClone(original);c.programs=statuses.map((status,i)=>({...structuredClone(original.programs[0]),id:'status-'+i,status}));validateContent(c,{forPublication:true});const d=parseHTML(renderContentPage({content:c,template})).document;
 assert.deepEqual([...d.querySelectorAll('.program-card')].map(n=>n.dataset.course),statuses.flatMap((s,i)=>['published','closed'].includes(s)?['status-'+i]:[]));
});
test('bounded header caption preserves full accessible copy and existing custom icon nodes',()=>{
 const d=parseHTML('<html><body><a class="header__cta">Полная подпись <span class="icon content-icon content-icon--text" aria-hidden="true"></span></a></body></html>').document,n=d.querySelector('a'),icon=n.querySelector('.icon');wrapCaption(n,'header__caption');wrapCaption(n,'header__caption');assert.equal(n.querySelectorAll('.header__caption').length,1);assert.equal(n.textContent,'Полная подпись ');assert.equal(n.querySelector('.icon'),icon);assert.equal(icon.getAttribute('aria-hidden'),'true');
});
