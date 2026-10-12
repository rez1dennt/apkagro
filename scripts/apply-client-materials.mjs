import {readFile,writeFile} from 'node:fs/promises';
import {organizationFooter} from './organization-markup.mjs';
import {CONSENT_VERSION} from '../public/assets/js/organization.js';
import {courses} from '../public/assets/js/courses.js';

const target=new URL('../public/index.html',import.meta.url);
let html=await readFile(target,'utf8');
html=html.replace(/<section class="footer__organization"[\s\S]*?<\/section>/,'');
html=html.replace('<div class="footer__bottom">',organizationFooter+'<div class="footer__bottom">');
html=html.replace(/name="consentVersion" value="[^"]+"/,`name="consentVersion" value="${CONSENT_VERSION}"`);
html=html.replace(/site\.js\?v=[^"']+/g,'site.js?v=20261012-course-materials');
html=html.replace(/<dialog class="notice-dialog" id="notice-dialog"[\s\S]*?<\/dialog>/g,'');
html=html.replace('Предварительная аннотация. Утверждённый учебный план и условия участия уточняйте у координатора.','Учебный план и условия участия можно уточнить у координатора.');
if(!html.includes('/assets/css/materials.css'))html=html.replace('</head>','<link rel="stylesheet" href="/assets/css/materials.css?v=20261011-materials"></head>');
html=html.replace(/materials\.css\?v=[^"']+/g,'materials.css?v=20261012-modal-290');
html=html.replace(/src="\/assets\/images\/(flowers|wine|cider)\.webp"/g,(_,id)=>`src="/assets/images/${id}-client.webp"`);
html=html.replace('alt="Цветовод в цветущем саду"','alt="Цветущая клумба с декоративными культурами"')
 .replace('alt="Спелый виноград на лозе"','alt="Специалист винодельческого хозяйства с гроздью винограда"')
 .replace('alt="Яблоки и золотистый сидр"','alt="Сидродел с яблоками в производственном помещении"');
html=html.replace('и виноградарства <span','и виноторговли <span')
 .replace('Управление сидродельческим проектом: от идеи<br>до масштабирования <span','Управление сидродельческим проектом <span');
html=html.replace('>Растениеводство</span>','>Цветоводство</span>')
 .replace('>Виноградарство</span>','>Виноделие</span>')
 .replace('>Управление проектом</span>','>Сидроделие</span>');
const newMaterials={
 drone:{category:'БАС',icon:'drone',alt:'Беспилотный аппарат над сельскохозяйственным полем'},
 nutrition:{category:'Рационы питания',icon:'leaf',alt:'Разнообразные блюда для сбалансированного рациона'},
 bread:{category:'Хлебопечение',icon:'wheat',alt:'Свежий хлеб на столе с зерном'},
 cheese:{category:'Сыроделие',icon:'cheese',alt:'Сыр с характерными отверстиями крупным планом'}
};
for(const [id,material] of Object.entries(newMaterials)){
 const course=courses[id];
 const card=`<button class="program-card" type="button" data-course="${id}" aria-haspopup="dialog"><span class="program-card__photo"><img src="/assets/images/${course.image}.webp" width="1024" height="1024" alt="${material.alt}" loading="lazy"><span class="program-category"><svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg?v=20261012-course-materials#${material.icon}"></use></svg>${material.category}</span><span class="program-card__badge" hidden>Выбрана <svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#check"></use></svg></span><span class="program-card__more">О программе <svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#arrow"></use></svg></span></span><span class="program-card__body"><span class="circle"></span><span>${course.title} <span class="course-hours">(72 часа)</span></span></span><span class="program-card__footer"><span>Онлайн · 72 часа</span><span>Подробнее <svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#arrow"></use></svg></span></span></button>`;
 const existing=new RegExp(`<button class="program-card"[^>]*data-course="${id}"[\\s\\S]*?</button>`);
 if(existing.test(html))html=html.replace(existing,card);
 else html=html.replace(/(<div class="program-grid"[^>]*>[\s\S]*?)(\s*<\/div>)/,`$1\n          ${card}$2`);
}
html=html.replace('<h3>О чём программа</h3>','<h3 id="dialog-topics-heading">О чём программа</h3>');
if(!html.includes('class="course-dialog__media"'))html=html.replace(/<img id="dialog-image"[^>]*>/,'<div class="course-dialog__media">$&</div>');
html=html.replace(/^[ \t]+(?=\r?$)/gm,'');
// Mobile styles hide selected line breaks; preserve the word separator when they disappear.
html=html.replace(/(\S)(<br\b[^>]*>)/g,'$1 $2');
await writeFile(target,html,'utf8');
console.log('Updated landing with organization footer, consent edition and client photos.');
