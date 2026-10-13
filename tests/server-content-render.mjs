import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {loadDefaultContent,validateContent} from '../server/content-schema.mjs';
import {lookupMessage} from '../public/assets/js/content-format.js';
import * as format from '../public/assets/js/content-format.js';
const renderer = await import('../server/content-render.mjs').catch(()=>({}));
const template=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
test('canonical contacts keep exact hrefs and plain labels in all legal render modes',async()=>{
 const c=await loadDefaultContent();c.settings.contacts.email='new@example.test';c.settings.contacts.phone='+79991234567';c.settings.contacts.phoneLabel='+7 999 123-45-67';
 for(const route of ['/','/privacy/','/operator/','/consent/'])for(const edited of [false,true])for(const preview of [false,true]){
  const copy=structuredClone(c),slug=route.split('/')[1];if(edited&&slug)copy.pages.find(p=>p.slug===slug).body+='\n\nДополнительный абзац.';
  const source=route==='/'?template:await readFile(new URL('../public/'+slug+'/index.html',import.meta.url),'utf8');
  const d=parseHTML(renderer.renderContentPage({content:copy,template:source,route,preview})).document;
  const emails=[...d.querySelectorAll('a[href^="mailto:"]')];assert.ok(emails.length);
  for(const a of emails){assert.equal(a.getAttribute('href'),'mailto:new@example.test');assert.ok(!a.textContent.includes('mailto:'));}
  for(const a of d.querySelectorAll('a[href^="tel:"]'))assert.equal(a.getAttribute('href'),'tel:+79991234567');
  assert.equal(d.querySelector('.footer__contacts a[href^="mailto:"]').textContent.trim(),'new@example.test');
  assert.equal(d.querySelector('.footer__contacts a[href^="tel:"]').textContent.trim(),'+7 999 123-45-67');
 }
});
test('legal intro has the same safe structured rendering as its editor',async()=>{
 const c=await loadDefaultContent();c.pages[0].intro='**Важное** [Условия](/consent/)\n\n- Первый пункт';
 const source=await readFile(new URL('../public/privacy/index.html',import.meta.url),'utf8');
 for(const preview of [true,false]){const d=parseHTML(renderer.renderContentPage({content:c,template:source,route:'/privacy/',preview})).document;assert.equal(d.querySelector('.legal-intro strong')?.textContent,'Важное');assert.equal(d.querySelector('.legal-intro li')?.textContent,'Первый пункт');assert.match(d.querySelector('.legal-intro a')?.getAttribute('href'),/consent\//);}
});
test('private preview system copy does not change the persisted public message schema',async()=>{
 const oldDocument=await loadDefaultContent();delete oldDocument.messages['site-b2625983c82a'];
 assert.doesNotThrow(()=>validateContent(oldDocument));
});
test('Moscow deadline includes its final day and closes at midnight UTC+3',async()=>{
 const c=await loadDefaultContent();c.settings.intake.deadline='2026-10-31';
 assert.equal(renderer.contentIntakeEnabled(c,new Date('2026-10-31T20:59:59.999Z')),true);
 assert.equal(renderer.contentIntakeEnabled(c,new Date('2026-10-31T21:00:00.000Z')),false);
});
test('private incomplete program preview has intentional title and photo placeholders',async()=>{
 const c=await loadDefaultContent();c.programs.push({...c.programs[0],id:'empty-course',status:'draft',title:'',cardTitle:'',image:'',modalImage:'',description:'',topics:[]});
 const d=parseHTML(renderer.renderContentPage({content:c,template,preview:true})).document;
 assert.equal(d.querySelectorAll('img[src=""]').length,0);
 assert.match(d.querySelector('[data-course="empty-course"]').textContent,/Название программы не заполнено/);
 assert.match(d.querySelector('[data-course="empty-course"]').textContent,/Фото не добавлено/);
});
test('hidden section projects out authored navigation and CTA links and restores them without changing content',async()=>{
 const c=await loadDefaultContent();c.hiddenSections=['application','programs'];const original=structuredClone(c);
 let d=parseHTML(renderer.renderContentPage({content:c,template})).document;
 assert.equal(d.querySelectorAll('a[href="#application"],a[href="#programs"]').length,0);
 const legal=await readFile(new URL('../public/privacy/index.html',import.meta.url),'utf8');
 d=parseHTML(renderer.renderContentPage({content:c,template:legal,route:'/privacy/'})).document;
 assert.equal(d.querySelectorAll('header a[href="/#application"],footer a[href="/#programs"]').length,0);
 assert.deepEqual(c,original);c.hiddenSections=[];
 assert.ok(parseHTML(renderer.renderContentPage({content:c,template})).document.querySelector('a[href="#application"]'));
});
test('Russian hours agree and common modal caption is an effective fallback',async()=>{
 assert.equal(typeof format.formatHours,'function');
 for(const [hours,label]of [[1,'1 час'],[2,'2 часа'],[11,'11 часов'],[108,'108 часов'],[21,'21 час']])assert.equal(format.formatHours(hours),label);
 const c=await loadDefaultContent();c.fields['other.text-083dd138ad9a']='Общий выбор';c.programs[1].buttonLabel='Особый выбор';
 const boot=JSON.parse(parseHTML(renderer.renderContentPage({content:c,template})).document.querySelector('#site-content').textContent);
 assert.equal(boot.programs[0].buttonLabel,'Общий выбор');assert.equal(boot.programs[1].buttonLabel,'Особый выбор');
});
test('renderer exposes safe SSR and theme interfaces',()=>{assert.equal(typeof renderer.renderContentPage,'function');assert.equal(typeof renderer.renderContentCss,'function');});
test('SSR renders new programs, collections, metadata, aliases and keeps private records out',async()=>{
 const c=await loadDefaultContent();c.fields['hero.title']='Новые знания\nдля всех';c.seo.title='Новый сайт';c.settings.contacts.email='usersacracorona@yandex.ru';
 c.programs.push({...c.programs[0],id:'new-course',title:'Новая программа',cardTitle:'Новая карточка'});c.programs[0].status='draft';c.programs[0].title='PRIVATE';
 c.benefits.reverse();c.faqs.push({id:'new-faq',question:'Новый вопрос?',answer:'**Ответ** и [ссылка](/consent/)'});
 const html=renderer.renderContentPage({content:c,template,route:'/'}),d=parseHTML(html).document;
 assert.equal(d.title,'Новый сайт');assert.match(d.querySelector('h1').textContent,/Новые знания\s+для всех/);assert.ok(d.querySelector('[data-course="new-course"]'));assert.equal(d.querySelector('[data-course="drone"]'),null);assert.ok(!html.includes('PRIVATE'));assert.match(html,/usersacracorona@yandex.ru/);assert.ok(!html.includes('useruser'));assert.equal(d.querySelectorAll('#faq details').length,5);assert.equal(d.querySelectorAll('h1').length,1);
 const b=JSON.parse(d.querySelector('#site-content').textContent);assert.equal(b.programs.length,7);assert.equal(b.programs.at(-1).id,'new-course');
 c.hiddenSections=['programs'];const hidden=renderer.renderContentPage({content:c,template,route:'/'});assert.equal(parseHTML(hidden).document.querySelector('#programs'),null);assert.equal(JSON.parse(parseHTML(hidden).document.querySelector('#site-content').textContent).programs.length,0);
});
test('preview includes program drafts; page body headings and Markdown are safe',async()=>{
 const c=await loadDefaultContent();c.programs[0].status='draft';const h=renderer.renderContentPage({content:c,template,route:'/',preview:true});assert.ok(parseHTML(h).document.querySelector('[data-course="drone"]'));assert.equal(JSON.parse(parseHTML(h).document.querySelector('#site-content').textContent).intake.enabled,false);
 c.pages.push({...c.pages[0],id:'new-page',slug:'new-page',title:'Новая страница',body:'# Подзаголовок\n\n**Важное** и [ссылка](/privacy/)\n\n- Один\n- Два'});
 const legal=await readFile(new URL('../public/privacy/index.html',import.meta.url),'utf8');const d=parseHTML(renderer.renderContentPage({content:c,template:legal,route:'/new-page/'})).document;assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('h1').textContent,'Новая страница');assert.match(d.querySelector('.legal-body').innerHTML,/<h2>Подзаголовок<\/h2>/);
});
test('generated theme excludes hidden media and respects numeric image focus',async()=>{
 const c=await loadDefaultContent();c.programs[0].imageFocus={x:12,y:34};c.programs[1].status='draft';c.programs[1].modalImage='/media/11111111-1111-4111-8111-111111111111.webp';c.settings.colors.forest='#123456';const css=renderer.renderContentCss({content:c});assert.match(css,/--forest:#123456/);assert.match(css,/12% 34%/);assert.ok(!css.includes('11111111-'));assert.ok(!css.includes('max-height:'));
});
test('typed collections preserve surrounding design and section visibility owns the hero',async()=>{const c=await loadDefaultContent();let d=parseHTML(renderer.renderContentPage({content:c,template})).document;assert.ok(d.querySelector('.about__intro'),'benefit replacement must preserve its intro sibling');c.hiddenSections=['hero'];d=parseHTML(renderer.renderContentPage({content:c,template})).document;assert.equal(d.querySelector('.hero'),null);assert.equal(d.querySelectorAll('h1').length,1);assert.equal(d.querySelector('link[as="image"]'),null);});
test('every registered field is rendered, including mixed nodes, attributes and CSS occurrences',async()=>{
 const c=await loadDefaultContent(),bindings=JSON.parse(await readFile(new URL('../content/content-bindings.json',import.meta.url),'utf8')),markers=[];
 for(const [i,b]of bindings.entries()){if(b.source||b.kind==='icon')continue;const marker='cmsmarker'+i;markers.push({b,marker});c.fields[b.id]=b.kind==='text'?marker+' '+(c.fields[b.id].match(/\{\{[^}]+\}\}/g)||[]).join(' '):'/assets/'+marker+'.webp';}
 const outputs={};for(const file of ['index.html','privacy/index.html','consent/index.html','operator/index.html'])outputs[file]=renderer.renderContentPage({content:c,template:await readFile(new URL('../public/'+file,import.meta.url),'utf8'),route:file==='index.html'?'/':'/'+file.replace('index.html','')});
 for(const file of renderer.contentCssFiles)outputs[file]=renderer.renderContentCss({content:c,file});
 const missing=markers.filter(({b,marker})=>!b.targets.some(t=>outputs[t.file]?.includes(marker))).map(({b})=>b.id);assert.deepEqual(missing,[]);
});
test('typed extras support all six templates, ordering and hidden/private CSS ownership',async()=>{
 const c=await loadDefaultContent();const base={body:'**Текст**',image:'/assets/images/harvest.webp',alt:'Фото',imageFocus:{x:25,y:75},buttonLabel:'Перейти',buttonUrl:'/privacy/',items:[]};
 c.extraSections=['text','image','cta','faq','cards','gallery'].map(type=>({...base,id:'extra-'+type,type,title:'Заголовок '+type,items:type==='faq'?[{id:'answer',title:'Вопрос',body:'Ответ'}]:type==='cards'?[{...base,id:'card',title:'Карточка',icon:'leaf',items:undefined}]:type==='gallery'?[{id:'picture',image:base.image,alt:'Галерея',imageFocus:base.imageFocus,caption:'Подпись'}]:[]}));delete c.extraSections[4].items[0].items;
 c.sectionOrder=[...c.extraSections.map(s=>s.id),...c.sectionOrder];const d=parseHTML(renderer.renderContentPage({content:c,template})).document;assert.equal(d.querySelector('main > section').id,'extra-text');assert.equal(d.querySelectorAll('.cms-section').length,6);assert.equal(d.querySelector('#extra-gallery figcaption').textContent,'Подпись');assert.ok(d.querySelector('#extra-cards .button'));assert.ok(d.querySelector('#extra-faq details'));
});
test('default legal layout applies overlapping canonical aliases once and keeps original document layout',async()=>{const c=await loadDefaultContent();c.settings.contacts.email='usersacracorona@yandex.ru';const legal=await readFile(new URL('../public/privacy/index.html',import.meta.url),'utf8'),html=renderer.renderContentPage({content:c,template:legal,route:'/privacy/'});assert.ok(!html.includes('useruser'));assert.equal(parseHTML(html).document.querySelectorAll('.document-downloads').length,1);assert.ok(parseHTML(html).document.querySelector('.legal-body h2'));});
test('mandatory organization placeholders do not rescan inserted canonical values',async()=>{const c=await loadDefaultContent();c.settings.organization.license+=' SUFFIX';const d=parseHTML(renderer.renderContentPage({content:c,template})).document;assert.ok(!d.querySelector('.footer').textContent.includes('SUFFIX SUFFIX'));assert.match(d.querySelector('.footer').textContent,/SUFFIX/);});
test('original three photos retain approved crops; replacement photos use the new bounded frame',async()=>{const c=await loadDefaultContent();const bootstrap=()=>JSON.parse(parseHTML(renderer.renderContentPage({content:c,template})).document.querySelector('#site-content').textContent);for(const id of ['wine','flowers','cider'])assert.equal(bootstrap().programs.find(p=>p.id===id).originalFrame,true);c.programs.find(p=>p.id==='wine').modalImage='/assets/images/harvest.webp';assert.equal(bootstrap().programs.find(p=>p.id==='wine').originalFrame,false);assert.equal(bootstrap().programs.find(p=>p.id==='drone').originalFrame,false);});
test('browser and server resolve their own independently editable messages for identical source copy',async()=>{const c=await loadDefaultContent(),source='Проверьте адрес электронной почты.';const siteKey=Object.keys(c.messages).find(k=>k.startsWith('site-')&&c.messages[k]===source),serverKey=Object.keys(c.messages).find(k=>k.startsWith('intake-')&&c.messages[k]===source);assert.ok(siteKey&&serverKey);c.messages[siteKey]='Браузерная подсказка';c.messages[serverKey]='Серверная подсказка';const b=JSON.parse(parseHTML(renderer.renderContentPage({content:c,template})).document.querySelector('#site-content').textContent);assert.equal(lookupMessage(source,b.messages,b.messageKeys),'Браузерная подсказка');assert.equal(renderer.contentMessage(c,source),'Серверная подсказка');});
test('multi-block benefit Markdown remains valid DOM',async()=>{const c=await loadDefaultContent();c.benefits[0].body='Первый абзац\n\nВторой абзац\n\n- Пункт';const d=parseHTML(renderer.renderContentPage({content:c,template})).document;assert.equal(d.querySelectorAll('.benefit:first-of-type .benefit__content > div p').length,2);assert.equal(d.querySelector('.benefit:first-of-type .benefit__content > div li').textContent,'Пункт');});
