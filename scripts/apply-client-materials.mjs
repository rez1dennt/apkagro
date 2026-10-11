import {readFile,writeFile} from 'node:fs/promises';
import {organizationFooter} from './organization-markup.mjs';
import {CONSENT_VERSION} from '../public/assets/js/organization.js';

const target=new URL('../public/index.html',import.meta.url);
let html=await readFile(target,'utf8');
html=html.replace(/<section class="footer__organization"[\s\S]*?<\/section>/,'');
html=html.replace('<div class="footer__bottom">',organizationFooter+'<div class="footer__bottom">');
html=html.replace(/name="consentVersion" value="[^"]+"/,`name="consentVersion" value="${CONSENT_VERSION}"`);
html=html.replace(/site\.js\?v=[^"']+/g,'site.js?v=20261011-public-documents');
html=html.replace(/<dialog class="notice-dialog" id="notice-dialog"[\s\S]*?<\/dialog>/g,'');
html=html.replace('Предварительная аннотация. Утверждённый учебный план и условия участия уточняйте у координатора.','Учебный план и условия участия можно уточнить у координатора.');
if(!html.includes('/assets/css/materials.css'))html=html.replace('</head>','<link rel="stylesheet" href="/assets/css/materials.css?v=20261011-materials"></head>');
html=html.replace(/materials\.css\?v=[^"']+/g,'materials.css?v=20261011-benefit-layout-v2');
html=html.replace(/src="\/assets\/images\/(flowers|wine|cider)\.webp"/g,(_,id)=>`src="/assets/images/${id}-client.webp"`);
html=html.replace('alt="Цветовод в цветущем саду"','alt="Цветущая клумба с декоративными культурами"')
 .replace('alt="Спелый виноград на лозе"','alt="Специалист винодельческого хозяйства с гроздью винограда"')
 .replace('alt="Яблоки и золотистый сидр"','alt="Сидродел с яблоками в производственном помещении"');
html=html.replace('и виноградарства <span','и виноторговли <span')
 .replace('Управление сидродельческим проектом: от идеи<br>до масштабирования <span','Управление сидродельческим проектом <span');
html=html.replace('<h3>О чём программа</h3>','<h3 id="dialog-topics-heading">О чём программа</h3>');
if(!html.includes('class="course-dialog__media"'))html=html.replace(/<img id="dialog-image"[^>]*>/,'<div class="course-dialog__media">$&</div>');
html=html.replace(/^[ \t]+(?=\r?$)/gm,'');
await writeFile(target,html,'utf8');
console.log('Updated landing with organization footer, consent edition and client photos.');
