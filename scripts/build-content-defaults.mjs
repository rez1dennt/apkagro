import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {courses} from '../public/assets/js/courses.js';
import {organization, publicDocuments, CONSENT_VERSION} from '../public/assets/js/organization.js';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const text=node=>[...node.childNodes].map(child=>child.nodeType===3?child.textContent:child.localName==='br'?'\n':child.localName==='svg'?'':text(child)).join('').trim();
const icon=node=>node.querySelector('use')?.getAttribute('href')?.split('#')[1]??'info';
const groups={hero:'Первый экран',about:'О проекте',programs:'Программы',steps:'Как поступить',application:'Заявка',faq:'Вопросы',closing:'Заключительный блок',header:'Шапка',footer:'Подвал',cookie:'Cookie',legal:'Документы',other:'Общие элементы'};
const sections=['hero','about','programs','steps','application','faq','closing'];
function sectionFor(node){if(node?.closest('.course-dialog'))return 'programs';const section=node?.closest(sections.map(id=>'.'+id).join(','));return section?sections.find(id=>section.classList.contains(id)):null;}
function group(node){if(node.closest('.cookie-notice'))return 'cookie';if(node.closest('.legal-main'))return 'legal';for(const name of Object.keys(groups))if(node.closest('.'+name))return name;return 'other';}
function selector(node){if(node.id)return '#'+node.id;const parent=node.parentElement;if(!parent)return node.localName;return selector(parent)+' > '+node.localName+':nth-child('+([...parent.children].indexOf(node)+1)+')';}
function markdown(node){
  if(node.nodeType===3)return node.textContent.replace(/[\\\[\]*_]/g,'\\$&');
  const tag=node.localName;if(tag==='svg')return '';if(tag==='br')return '\n';
  const body=[...node.childNodes].map(markdown).join(node.classList?.contains('document-downloads')?'\n\n':'');
  if(tag==='a')return '['+body.trim()+']('+node.getAttribute('href')+')';
  if(['strong','b','h2','h3','dt'].includes(tag))return '**'+body.trim()+'**'+(['h2','h3','dt'].includes(tag)?'\n\n':'');
  if(['em','i'].includes(tag))return '*'+body.trim()+'*';
  if(tag==='li')return '- '+body.trim()+'\n';
  if(['p','div','ul','ol','dl','dd'].includes(tag))return body.trim()+'\n\n';
  return body;
}

export async function extractDefaultContent(){
  const html=await readFile(path.join(root,'public/index.html'),'utf8');
  const {document}=parseHTML(html);
  const bindings=[], fields={}, coverage=[];
  const content={schemaVersion:1,fields,navigation:{desktop:[],mobile:[],footer:[]},benefits:[],steps:[],faqs:[],programs:[],pages:[],sectionOrder:['hero','about','programs','steps','application','faq','closing'],hiddenSections:[],extraSections:[],settings:{contacts:{email:organization.email,phone:organization.phone,phoneLabel:text(document.querySelector('.footer__contacts a[href^="tel:"]'))},organization:{...organization},colors:{},intake:{enabled:true,deadline:'2026-10-31',deadlineLabel:text(document.querySelector('.application__deadline')),consentVersion:CONSENT_VERSION}},documents:{...publicDocuments},seo:{},messages:{}};
  const add=(id,label,kind,value,target)=>{
    const current=bindings.find(binding=>binding.id===id);
    if(current){if(fields[id]!==value)throw new Error('Binding collision: '+id);current.targets.push(target);return;}
    fields[id]=value;bindings.push({id,label,group:target.group??'Общие элементы',kind,minLength:0,maxLength:kind==='text'?10000:2048,targets:[target]});
  };
  const aliases=[];
  const alias=(source,defaultValue,label,target)=>{
    let entry=aliases.find(entry=>entry.source===source);
    if(!entry){entry={id:source,source,defaultValue,label,group:'Реквизиты и документы',kind:'alias',minLength:0,maxLength:2048,targets:[]};aliases.push(entry);}
    entry.targets.push(target);
  };
  const sourceValues=[...Object.entries(organization).filter(([key])=>!['email','phone'].includes(key)).map(([key,value])=>({source:'settings.organization.'+key,value,variants:[value]})),...Object.entries(content.settings.contacts).map(([key,value])=>({source:'settings.contacts.'+key,value,variants:[value]})),...Object.entries(publicDocuments).map(([key,value])=>({source:'documents.'+key,value,variants:[value]}))];
  sourceValues.find(entry=>entry.source==='settings.organization.name').variants.push('Автономная некоммерческая организация «Центр предоставления социальных услуг Возрождение»','Автономной некоммерческой организации «Центр предоставления социальных услуг «Возрождение»');
  for(const [name,query] of Object.entries({desktop:'.nav',mobile:'.mobile-menu nav',footer:'.footer__nav'}))content.navigation[name]=[...document.querySelectorAll(query+' a')].map((node,index)=>({id:name+'-'+(index+1),label:text(node),url:node.getAttribute('href')}));
  content.benefits=[...document.querySelectorAll('.benefit')].map((node,index)=>({id:'benefit-'+(index+1),title:text(node.querySelector('h3')),body:text(node.querySelector('p')),icon:icon(node),image:node.querySelector('img').getAttribute('src'),alt:node.querySelector('img').getAttribute('alt'),imageFocus:{x:50,y:50}}));
  content.steps=[...document.querySelectorAll('.step-list li')].map((node,index)=>({id:'step-'+(index+1),title:text(node.querySelector('h3')),body:text(node.querySelector('p')),icon:icon(node)}));
  content.faqs=[...document.querySelectorAll('.accordion details')].map((node,index)=>({id:'faq-'+(index+1),question:text(node.querySelector('summary')),answer:text(node.querySelector('.accordion__content'))}));
  content.programs=Object.entries(courses).map(([id,course])=>{
    const node=document.querySelector('[data-course="'+id+'"]');
    const heading=node.querySelector('.program-card__body > span:last-child').cloneNode(true);heading.querySelector('.course-hours')?.remove();
    return {id,title:course.title,cardTitle:text(heading),category:text(node.querySelector('.program-category')),icon:icon(node.querySelector('.program-category')),image:node.querySelector('img').getAttribute('src'),modalImage:'/assets/images/'+course.image+'.webp',alt:node.querySelector('img').getAttribute('alt'),imageFocus:{x:50,y:id==='cider'?45:50},modalFocus:{x:50,y:id==='cider'?35:['bread','nutrition'].includes(id)?68:50},hours:72,format:'Онлайн',priceText:'Бесплатно',description:course.description,topics:[...course.topics],disclaimer:text(document.querySelector('.course-dialog__disclaimer')),buttonLabel:text(document.querySelector('#choose-course')),status:'published'};
  });
  for(const node of document.querySelectorAll('head meta[name],head meta[property]')) {
    const name=node.getAttribute('name')??node.getAttribute('property');if(['viewport','theme-color'].includes(name))continue;
    content.seo[{description:'description','og:title':'ogTitle','og:description':'ogDescription','og:type':'ogType','og:image':'ogImage',robots:'robots'}[name]??name]=node.getAttribute('content');
  }
  content.seo.title=document.title;content.seo.robots??='index,follow';content.seo.themeColor=document.querySelector('meta[name="theme-color"]').getAttribute('content');content.seo.icon=document.querySelector('link[rel="icon"]').getAttribute('href');
  content.seo.ogImage??='';
  for(const slug of ['privacy','consent','operator']){
    const {document:legal}=parseHTML(await readFile(path.join(root,'public',slug,'index.html'),'utf8'));
    const description=legal.querySelector('meta[name="description"]').getAttribute('content');
    const og=key=>legal.querySelector('meta[property="og:'+key+'"]')?.getAttribute('content');
    content.pages.push({id:slug,slug,title:text(legal.querySelector('h1')),intro:text(legal.querySelector('.legal-intro')),body:markdown(legal.querySelector('.legal-body')).trim(),seo:{title:legal.title,description,robots:legal.querySelector('meta[name="robots"]').getAttribute('content'),ogTitle:og('title')??legal.title,ogDescription:og('description')??description,ogType:og('type')??'website',ogImage:og('image')??''},status:'published'});
  }
  const typed='.nav a,.mobile-menu nav a,.footer__nav a,.benefit,.step-list li,.accordion details,.program-card,.legal-body,.legal-container > h1,.legal-intro,.application__deadline';
  const specials={'#hero-title':'hero.title','.hero__description':'hero.description','#application-title':'application.title','.closing h2':'closing.title'};
  for(const [file,doc] of [['index.html',document],...await Promise.all(['privacy','consent','operator'].map(async slug=>[slug+'/index.html',parseHTML(await readFile(path.join(root,'public',slug,'index.html'),'utf8')).document]))]){
    const consumed=new Set();
    for(const node of doc.querySelectorAll('body *')){
      // Alias only known seed literals; selector/attribute/sourceText remain trusted.
      for(const [index,child] of [...node.childNodes].entries())if(child.nodeType===3&&child.textContent.trim()){
        for(const source of sourceValues)for(const variant of source.variants)if(child.textContent.includes(variant)&&!variant.startsWith('/documents/')){
          const target={file,selector:selector(node),mode:'text-node',childIndex:index,sourceText:variant};
          if(source.source==='settings.organization.name'&&node.closest('.footer__organization'))target.transform='footer-name';
          alias(source.source,source.value,'Общее значение — '+source.source,target);
          if(node.closest('.legal-body'))alias(source.source,source.value,'Общее значение — '+source.source,{file,pageId:file.split('/')[0],mode:'markdown-alias',sourceText:variant});
          if(child.textContent.trim()===variant)consumed.add(child);
        }
      }
      for(const attribute of ['href','src'])if(node.hasAttribute(attribute)){
        const value=node.getAttribute(attribute);
        for(const source of sourceValues)for(const variant of source.variants)if(value===variant||value==='mailto:'+variant||value==='tel:'+variant){
          const prefix=value===variant?'':value.slice(0,value.length-variant.length);
          alias(source.source,source.value,'Общее значение — '+source.source,{file,selector:selector(node),mode:'attribute',attribute,sourceText:variant,prefix});
          if(node.closest('.legal-body'))alias(source.source,source.value,'Общее значение — '+source.source,{file,pageId:file.split('/')[0],mode:'markdown-alias',sourceText:value,prefix});
        }
      }
      if(node.closest('script,style')||node.closest(typed))continue;
      const query=selector(node), g=groups[group(node)];
      if(['h1','h2','h3','p','strong','small','span','a','button','summary','label','option','address'].includes(node.localName)&&[...node.children].every(child=>child.localName==='br')&&text(node)&&![...node.childNodes].some(child=>consumed.has(child))){
        const special=Object.entries(specials).find(([query])=>node.matches(query))?.[1];
        const id=special??group(node)+'.text-'+hash(query+'|'+text(node));
        const target={file,selector:query,mode:'text',multiline:true,group:g};
        add(id,g+' — '+text(node).replace(/\s+/g,' ').slice(0,90),'text',text(node),target);
        for(const child of node.childNodes)consumed.add(child);
      }
      for(const [index,child] of [...node.childNodes].entries())if(child.nodeType===3&&child.textContent.trim()&&!consumed.has(child)){
        const original=child.textContent;let value=original;const variables=[];
        for(const entry of aliases)for(const target of entry.targets)if(target.file===file&&target.selector===query&&target.childIndex===index&&value.includes(target.sourceText)){
          value=value.split(target.sourceText).join('{{'+entry.source+'}}');if(!variables.includes(entry.source))variables.push(entry.source);
        }
        add(group(node)+'.text-'+hash(query+'|'+index+'|'+original),g+' — '+original.trim().replace(/\s+/g,' ').slice(0,90),'text',value,{file,selector:query,mode:'text-node',childIndex:index,leadingSpace:/^\s/.test(original),trailingSpace:/\s$/.test(original),variables,group:g});
      }
      for(const attribute of ['href','src','alt','title','aria-label','placeholder','download'])if(node.hasAttribute(attribute)){
        if(node.localName==='input'&&node.type==='hidden')continue;
        let value=node.getAttribute(attribute), kind=['href','src'].includes(attribute)?'url':'text';
        if(aliases.some(entry=>entry.targets.some(target=>target.file===file&&target.selector===query&&target.attribute===attribute)))continue;
        const target={file,selector:query,mode:'attribute',attribute,group:g};
        if(node.localName==='use'&&attribute==='href'){kind='icon';target.prefix=value.split('#')[0]+'#';value=value.split('#')[1];}
        if(node.localName==='img'&&attribute==='src')kind='image';
        add(group(node)+'.'+attribute+'-'+hash(query+'|'+value),g+' — '+({href:'Ссылка',src:'Изображение',alt:'Описание изображения','aria-label':'Доступное название',placeholder:'Подсказка',download:'Имя документа',title:'Подсказка'}[attribute])+' ('+(text(node).replace(/\s+/g,' ').slice(0,50)||node.localName)+')',kind,value,target);
      }
    }
    // Head assets/metadata are governed by seo/page.seo; preload image follows a trusted binding.
    for(const node of doc.querySelectorAll('link[as="image"]'))add('seo.preload-'+hash(node.getAttribute('href')),'SEO — предварительно загружаемое изображение','image',node.getAttribute('href'),{file,selector:selector(node),mode:'attribute',attribute:'href',section:'hero',group:'SEO'});
    coverage.push({file,textNodes:[...doc.querySelectorAll('body *')].flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3&&child.textContent.trim())).length});
  }
  // Icons/accessible/download labels in organization blocks are presentation fields.
  for(const file of ['index.html','privacy/index.html','consent/index.html','operator/index.html']){
    const doc=file==='index.html'?document:parseHTML(await readFile(path.join(root,'public',file),'utf8')).document;
    for(const node of doc.querySelectorAll('.footer__organization use,.legal-body use')){
      const value=icon(node.parentElement),query=selector(node),prefix=node.getAttribute('href').split('#')[0]+'#';
      if(!bindings.some(binding=>binding.targets.some(target=>target.file===file&&target.selector===query&&target.attribute==='href')))add('legal.icon-'+hash(query+'|'+value),'Документы — значок '+value,'icon',value,{file,selector:query,mode:'attribute',attribute:'href',prefix,group:'Документы'});
    }
    for(const node of doc.querySelectorAll('.footer__organization [download],.legal-body [download]')){
      const value=node.getAttribute('download'),query=selector(node);if(!bindings.some(binding=>binding.targets.some(target=>target.file===file&&target.selector===query&&target.attribute==='download')))add('legal.download-'+hash(query+'|'+value),'Документы — имя скачиваемого файла '+value,'text',value,{file,selector:query,mode:'attribute',attribute:'download',group:'Документы'});
    }
  }
  // Generic card chrome and FAQ toggle icons are shared copy, independent of typed record text.
  for(const query of ['.program-card__badge','.program-card__more','.program-card__footer > span:last-child']){
    const node=document.querySelector(query);add('programs.chrome-'+hash(query),'Программы — '+text(node),'text',text(node),{file:'index.html',selector:query,mode:'text-node',childIndex:0,all:true,trailingSpace:true,group:'Программы'});
  }
  add('faq.toggle-icon','Вопросы — значок раскрытия','icon','chevron',{file:'index.html',selector:'.accordion summary use',mode:'attribute',attribute:'href',prefix:'/assets/icons-v2.svg#',all:true,group:'Вопросы'});
  for(const query of ['.program-card__badge use','.program-card__more use','.program-card__footer use','.mobile-menu nav a use']){
    const node=document.querySelector(query);if(!node)continue;const value=node.getAttribute('href').split('#')[1];
    const files=query.startsWith('.mobile-menu')?['index.html','privacy/index.html','consent/index.html','operator/index.html']:['index.html'];
    for(const file of files)add('programs.icon-'+hash(query),'Общие значки — '+({'.program-card__badge use':'выбранная программа','.program-card__more use':'описание программы','.program-card__footer use':'подробнее','.mobile-menu nav a use':'кнопка мобильного меню'}[query]),'icon',value,{file,selector:query,mode:'attribute',attribute:'href',prefix:node.getAttribute('href').split('#')[0]+'#',all:true,group:'Общие элементы'});
  }
  const theme=await readFile(path.join(root,'public/assets/css/theme.css'),'utf8');
  for(const match of theme.matchAll(/--([a-z-]+):\s*(#[a-f\d]{6})(?=\s*;)/gi))content.settings.colors[match[1]]=match[2];
  for(const file of (await readdir(path.join(root,'public/assets/css'))).filter(file=>!file.startsWith('admin'))){
    const css=await readFile(path.join(root,'public/assets/css',file),'utf8');
    let occurrence=0;
    for(const match of css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)){
      const value=match[1];if(value.includes('/fonts/'))continue;
      const before=css.slice(0,match.index), start=before.lastIndexOf('{'), previous=before.lastIndexOf('}');
      const rule=before.slice(previous+1,start).trim().split('{').pop().trim();
      add('background.'+hash(file+'|'+occurrence+++'|'+rule),'Оформление — фон '+rule.slice(0,65),'background',value,{file:'assets/css/'+file,selector:rule,mode:'css-url',sourceUrl:value,occurrence:occurrence-1,group:'Оформление'});
    }
  }
  const js=await readFile(path.join(root,'public/assets/js/site.js'),'utf8');
  for(const match of js.matchAll(/(['`])([А-ЯЁ][^'`\r\n]*?)\1/g)){
    const value=match[2];if(!/[А-Яа-яЁё]{2}/.test(value)||value.includes('${input'))continue;
    const normalized=value.replace('${result.reference}','{reference}');
    content.messages['site-'+hash(normalized)]=normalized;
  }
  const intake=await readFile(path.join(root,'server/intake.mjs'),'utf8');
  for(const match of intake.matchAll(/'([А-ЯЁ][^'\r\n]*?)'/g))content.messages['intake-'+hash(match[1])]=match[1];
  const app=await readFile(path.join(root,'server/app.mjs'),'utf8');
  // Known public response copy is extracted independently from admin/login routes.
  const publicCopy=['Приём заявок ещё не открыт. Пожалуйста, свяжитесь с организатором.','Сервис занят. Повторите отправку немного позже.','Заявка получена. Организатор свяжется с вами.','Сервис временно недоступен. Повторите попытку позже.','Обновите страницу и повторите отправку.','Слишком много запросов. Попробуйте позже.','Слишком много попыток. Попробуйте через несколько минут.'];
  for(const value of publicCopy){if(!app.includes("'"+value+"'"))throw new Error('Public response copy changed: '+value);content.messages['server-'+hash(value)]=value;}
  for(const [key,value] of Object.entries(content.messages))if(value.includes(organization.email))alias('settings.contacts.email',organization.email,'Общее значение — электронная почта в сообщениях',{mode:'message-alias',messageKey:key,sourceText:organization.email});
  const registry=[...bindings,...aliases];
  const documents={'index.html':document,...Object.fromEntries(await Promise.all(['privacy','consent','operator'].map(async slug=>[slug+'/index.html',parseHTML(await readFile(path.join(root,'public',slug,'index.html'),'utf8')).document])))};
  for(const entry of registry)for(const target of entry.targets){
    if(Object.hasOwn(target,'section'))continue;
    if(!target.selector){target.section=null;continue;}
    const doc=target.mode==='css-url'?document:documents[target.file];
    const nodes=[...doc.querySelectorAll(target.selector)];
    if(target.mode==='css-url'&&!nodes.length)throw new Error('Background selector has no public DOM owner: '+target.selector);
    const owners=[...new Set(nodes.map(sectionFor))];
    target.section=owners.length===1?owners[0]:null;
    if(owners.length>1)target.sections=owners;
  }
  return {content,bindings:registry,coverage};
}

async function build(){
  const {content,bindings,coverage}=await extractDefaultContent();
  await mkdir(path.join(root,'content'),{recursive:true});
  await writeFile(path.join(root,'content/site-defaults.json'),JSON.stringify(content,null,2)+'\n');
  await writeFile(path.join(root,'content/content-bindings.json'),JSON.stringify(bindings,null,2)+'\n');
  const lines=['# Инвентаризация редактируемого контента','', 'Источник: только public/ и опубликованные modules courses.js/organization.js. Генератор: `node scripts/build-content-defaults.mjs`. Приложение использует сохранённые JSON; генератор нужен для проверки начальной версии.','', '## Типизированные поверхности','', '| Поверхность | Контракт | Количество |','|---|---|---|',...['benefits','steps','faqs','programs','pages'].map(name=>'| '+name+' | '+name+' | '+content[name].length+' |'),'| Навигация | navigation.desktop/mobile/footer: id,label,url | '+Object.values(content.navigation).reduce((n,items)=>n+items.length,0)+' |','| Контакты и реквизиты | settings.contacts/organization | Все значения organization.js + телефон для показа |','| Документы | documents.consentPdf/consentWord/policyPdf/license | 4, исходные файлы не изменяются |','| Цвета | settings.colors (только исходные hex-токены) | '+Object.keys(content.settings.colors).length+' |','| Приём | settings.intake: enabled,deadline,deadlineLabel,consentVersion | Версия согласия создаётся сервером при публикации |','| SEO | seo и pages[].seo | title,description,ogTitle,ogDescription,ogType,robots,themeColor,icon |','| Сообщения формы | messages: site-<digest> | '+Object.keys(content.messages).length+' |','', 'Юридические страницы: полный текст `.legal-body` (заголовки как жирные абзацы, списки, ссылки, пары реквизитов), отдельно title/intro/seo. Все семь аннотаций скопированы без сокращения. Карточки: title/cardTitle/category/icon/image/modalImage/alt/focus/hours/format/price/description/topics/disclaimer/buttonLabel/status. benefits/steps/faqs содержат полный текст, картинки и значки исходных элементов.','', 'Технический каркас исключён осознанно: JS/CSS/font preload URLs, viewport/charset, DOM IDs/classes, wave path geometry, input machine names/types/options values, required/accept/maxlength, hidden CSRF/honeypot/protocol inputs. Это не пользовательский текст или управляемая медиа. Числа шагов и метаданные часов рисуются из коллекций. Общие подписи/значки карточек и раскрытия FAQ включены в реестр. Legal download links/text входят в Markdown, оформление download/icon задаётся доверенным шаблоном.','', '## Статистика исходных поверхностей','',...coverage.map(row=>'- '+row.file+': '+row.textNodes+' непустых текстовых узлов; все относятся к полям либо перечисленным типизированным поверхностям.'),'', '## Доверенный реестр полей','', 'Поле всегда имеет id,label,group,kind,minLength,maxLength,targets. Text с BR хранится с переносами строки; text-node сохраняет leadingSpace/trailingSpace, чтобы соседние узлы не склеивались. Цели file/selector/attribute находятся только в проверенном коде. Рендерить поля до пересборки коллекций. CSS-url цели задают замену sourceUrl в указанном CSS-файле; gradients/crop/адаптивные правила сохраняются. Не принимать цели из API.','', '| ID | Название для редактора | Тип | Целей |','|---|---|---|---|',...bindings.map(binding=>'| '+binding.id+' | '+binding.label.replace(/\|/g,' / ').replace(/\s+/g,' ')+' | '+binding.kind+' | '+binding.targets.length+' |'),''];
  lines.push('## Общие источники и отображение','', 'Записи реестра с `source` являются alias, не ключами `fields`. Значение берётся из пути source. `defaultValue` — канонический оригинал. Для alias с `sourceText` меняется только известный литерал; при неизменном defaultValue сохраняется исходная форма/грамматика текста. `markdown-alias` применяется до преобразования pages[pageId].body. Одинаковые markdown-alias цели дедуплицировать; длинные sourceText (mailto/tel/полное наименование) заменять раньше коротких. Метаданные source/selector/defaultValue/sourceText никогда не принимаются из запроса.','', '`transform: footer-name` сохраняет одни внешние «…» в футере: убрать внутренние „…“ из канонического name. Исходный footer sourceText не содержит вложенных кавычек; весь текст юридических страниц сохраняется в исходной редакции.','', 'Поля с target.variables содержат обязательные `{{settings.organization.*}}` подстановки вокруг редактируемых подписей («ОГРН», «Лицензия … от»). Подстановки разрешены только из перечня variables этой цели. Рендерер вставляет plain text общего значения, не HTML. settings.organization.email/phone синхронизируются валидатором с settings.contacts.','', 'Доверенная выборка публичных медиа: `referencedMedia(content,{publicOnly:true})` исключает draft/archived программы/страницы и hiddenSections. Полная выборка/история защищает файлы от удаления. Публичный bootstrap должен дополнительно фильтровать сами коллекции; полное хранилище содержит приватные будущие записи.','', 'Сохраняемый черновик может иметь незаполненные новые записи; `validateContent(content,{forPublication:true})` проверяет готовность видимого контента. Небезопасные URL, HTML, типы, размеры и структуры отклоняются при любом сохранении.','');
  lines.push('## Полный контракт дополнительных секций и Open Graph','',
    'extraSections.type: text, image, cta, faq, cards, gallery. Общие поля: id,type,title,body,image,alt,imageFocus,buttonLabel,buttonUrl,items. items — типизированная коллекция: FAQ {id,title,body}, карточки {id,title,body,icon,image,alt,imageFocus,buttonLabel,buttonUrl}, галерея {id,image,alt,imageFocus,caption}. У text/image/cta items всегда пуст. Карточки допускают отсутствие фотографии/значка; при публикации нужен заголовок и обе части заданной кнопки. Галерея при публикации требует изображение, непустой alt и числовой focus. У видимых коллекций требуется хотя бы один элемент. Лимиты: cards 50, gallery/faq 100.', '',
    'SEO главной страницы: title,description,robots,ogTitle,ogDescription,ogType,ogImage,themeColor,icon. SEO каждой страницы: title,description,robots,ogTitle,ogDescription,ogType,ogImage. ogType=website; ogImage — проверенный локальный URL изображения или пустая строка (метаданные изображения изначально отсутствуют). Исходные OG title/description сохраняются; у страниц без OG используются их исходные title/description. Медиа OG исключается из публичного набора для draft/archived страниц.', '',
    'Каждая доверенная target содержит section:string|null. Владение определяется при сборке по реальному DOM: .field select относится к application, .leaf-decoration к programs, модальный .course-dialog также к programs. Для целей, общих нескольким секциям, sections содержит полный перечень (null означает общий элемент). Runtime не выводит владение из строк селекторов. Полный набор защищает все файлы, публичный набор проверяет эти явные сведения.', '',
    'Локальные URL содержат только канонический путь: percent-encoded aliases в path отклоняются для полей, навигации, Markdown и SEO. Кодирование параметров внешних URL не превращается в локальные медиа.', '',
    'Форматирование Markdown: абзацы, маркированные/нумерованные списки, emphasis/strong, inline links и ATX headings (# .. ###### + пробел). Исполняемый HTML, изображения Markdown, блоки кода, цитаты, таблицы и reference-links запрещены. Рендерер строит элементы безопасно; в rich body исходный h1 показывается как h2, остальные уровни сохраняются для одного h1 документа.', '');
  await writeFile(path.join(root,'docs/content-coverage.md'),lines.join('\n'));
  console.log(JSON.stringify({fields:bindings.filter(binding=>!binding.source).length,aliases:bindings.filter(binding=>binding.source).length,programs:content.programs.length,pages:content.pages.length,messages:Object.keys(content.messages).length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
