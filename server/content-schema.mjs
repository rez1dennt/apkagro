import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {HttpError} from './intake.mjs';

const readJson=name=>JSON.parse(readFileSync(new URL('../content/'+name,import.meta.url),'utf8'));
const defaults=readJson('site-defaults.json');
const bindings=readJson('content-bindings.json').filter(binding=>!binding.source);
const icons=new Set(['icons.svg','icons-v2.svg'].flatMap(file=>[...readFileSync(new URL('../public/assets/'+file,import.meta.url),'utf8').matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(match=>match[1])));
const statuses=['published','draft','closed','archived'];
const idPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const mediaPattern=/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpe?g|webp|avif|pdf|docx)$/;
const builtin=['privacy','consent','operator'];
const reserved=new Set(['admin','api','assets','documents','media','index','admin.html']);
const fail=(where,message='Некорректное значение')=>{throw new HttpError(400,message+': '+where,'INVALID_CONTENT');};
function object(value,keys,where){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail(where);
  if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!keys.includes(key)||['__proto__','constructor','prototype'].includes(key)))fail(where,'Некорректная структура');
}
function string(value,where,max=10000,min=0){if(typeof value!=='string'||value.length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||/<\/?[a-z][^>]*>/i.test(value))fail(where);return value;}
function identifier(value,where){string(value,where,64,1);if(!idPattern.test(value)||['__proto__','constructor','prototype'].includes(value))fail(where);}
function number(value,where,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(where);}
function list(value,where,max){if(!Array.isArray(value)||value.length>max)fail(where);}
function enumValue(value,allowed,where){if(!allowed.includes(value))fail(where);}
function color(value,where){if(typeof value!=='string'||!/^#[a-f0-9]{6}$/i.test(value))fail(where);}
function focus(value,where){object(value,['x','y'],where);number(value.x,where+'.x',0,100);number(value.y,where+'.y',0,100);}
function icon(value,where){if(!icons.has(value))fail(where,'Неизвестный значок');}
function url(value,where,{image=false,document=false,empty=false}={}){
  string(value,where,2048,empty?0:1);if(empty&&value==='')return;
  if(value!==value.trim()||/[\s\\<>"'`\u007f]/.test(value)||value.startsWith('//'))fail(where,'Недопустимая ссылка');
  // Public local namespaces have canonical ASCII paths; reject encoded aliases
  // before classification so UUID/extensions and media references cannot diverge.
  if(value.startsWith('/')&&value.split(/[?#]/)[0].includes('%'))fail(where,'Используйте канонический локальный путь');
  let decoded=value;
  try{for(let i=0;i<4;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}}catch{fail(where,'Недопустимая ссылка');}
  if(/%[a-f\d]{2}/i.test(decoded)||/[\\\u0000-\u0020\u007f]/.test(decoded)||decoded.startsWith('//')||decoded.split(/[/?#]/).some(part=>part==='.'||part==='..'))fail(where,'Небезопасный путь');
  if(value.startsWith('/media/')&&!mediaPattern.test(value))fail(where,'Недопустимый медиафайл');
  if(image||document){
    if(/[(){};]/.test(value))fail(where,'Небезопасный адрес файла');
    const clean=value.split(/[?#]/)[0];
    const ext=clean.split('.').pop().toLowerCase();
    if(document){if(!['pdf','docx'].includes(ext)||!/^\/(?:documents|media)\//.test(value))fail(where,'Недопустимый документ');}
    else if(!/^\/(?:assets|media)\//.test(value)||!['png','jpg','jpeg','webp','avif','svg'].includes(ext)||ext==='svg'&&!value.startsWith('/assets/'))fail(where,'Недопустимое изображение');
    return;
  }
  if(value.startsWith('/')){if(reserved.has(decoded.split(/[/?#]/)[1])&&!/^\/(?:assets|documents|media)\//.test(decoded))fail(where,'Служебный адрес');return;}
  if(value.startsWith('#')){if(!/^#[a-zA-Z][\w-]*$/.test(value))fail(where);return;}
  let parsed;try{parsed=new URL(value);}catch{fail(where,'Недопустимая ссылка');}
  if(!['https:','http:','mailto:','tel:'].includes(parsed.protocol)||parsed.username||parsed.password)fail(where,'Недопустимая ссылка');
  if(['http:','https:'].includes(parsed.protocol)&&!parsed.hostname)fail(where);
  if(parsed.protocol==='mailto:'&&!/^mailto:[^@?]+@[^@?]+\.[^@?]+$/.test(value))fail(where);
  if(parsed.protocol==='tel:'&&!/^tel:\+?[\d()-]{3,30}$/.test(value))fail(where);
}
function markdown(value,where,max=100000){
  string(value,where,max);
  if(/!\[|```|~~~|^\s*(?:>|\|)/m.test(value)||/\][ \t]*\[|^\s*\[[^\]]+\]:/m.test(value))fail(where,'Разрешены абзацы, заголовки, списки, выделение и ссылки');
  const links=[...value.matchAll(/(?<!\\)\[([^\]\n]*)\]\(([^\s)]*)\)/g)];
  for(const match of links)url(match[2],where+'.link');
  const remainder=value.replace(/(?<!\\)\[([^\]\n]*)\]\(([^\s)]*)\)/g,'').replace(/\\[\[\]]/g,'');
  if(/\]\(/.test(remainder))fail(where,'Некорректная ссылка');
}
function records(value,where,max,keys,validate){
  list(value,where,max);const ids=new Set();
  for(const [index,record] of value.entries()){const location=where+'['+index+']';object(record,keys,location);identifier(record.id,location+'.id');if(ids.has(record.id))fail(location,'Повтор идентификатора');ids.add(record.id);validate(record,location);}
}
function seo(value,where,main=false){
  const keys=main?Object.keys(defaults.seo):['title','description','robots','ogTitle','ogDescription','ogType','ogImage'];object(value,keys,where);
  for(const key of keys){if(key==='themeColor')color(value[key],where+'.'+key);else if(key==='icon')url(value[key],where+'.icon',{image:true});else if(key==='ogImage')url(value[key],where+'.ogImage',{image:true,empty:true});else string(value[key],where+'.'+key,key==='description'||key==='ogDescription'?2000:500);}
  enumValue(value.ogType,['website'],where+'.ogType');
  enumValue(value.robots,['index,follow','noindex,follow','noindex,nofollow','index,nofollow'],where+'.robots');
}

export async function loadDefaultContent(){return structuredClone(defaults);}
export function validateContent(content,{forPublication=false}={}){
  object(content,Object.keys(defaults),'content');if(content.schemaVersion!==1)fail('schemaVersion');
  list(content.hiddenSections,'hiddenSections',57);const hidden=new Set(content.hiddenSections);
  object(content.fields,bindings.map(binding=>binding.id),'fields');
  for(const binding of bindings){const value=content.fields[binding.id],where='fields.'+binding.id;string(value,where,binding.maxLength,binding.minLength);if(binding.kind==='icon')icon(value,where);else if(['image','background'].includes(binding.kind))url(value,where,{image:true});else if(binding.kind==='url')url(value,where);
    const allowed=[...new Set(binding.targets.flatMap(target=>target.variables??[]))];const variables=[...value.matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]);if(variables.some(source=>!allowed.includes(source))||allowed.some(source=>!variables.includes(source)))fail(where,'Сохраните обязательные подстановки общих реквизитов');
  }
  object(content.navigation,['desktop','mobile','footer'],'navigation');
  for(const name of ['desktop','mobile','footer'])records(content.navigation[name],'navigation.'+name,30,['id','label','url'],(item,where)=>{string(item.label,where+'.label',200,1);url(item.url,where+'.url');});
  records(content.benefits,'benefits',50,['id','title','body','icon','image','alt','imageFocus'],(item,where)=>{const visible=forPublication&&!hidden.has('about');string(item.title,where+'.title',500,visible?1:0);markdown(item.body,where+'.body',20000);icon(item.icon,where+'.icon');url(item.image,where+'.image',{image:true,empty:!visible});string(item.alt,where+'.alt',500);focus(item.imageFocus,where+'.imageFocus');});
  records(content.steps,'steps',50,['id','title','body','icon'],(item,where)=>{string(item.title,where+'.title',500,forPublication&&!hidden.has('steps')?1:0);markdown(item.body,where+'.body',20000);icon(item.icon,where+'.icon');});
  records(content.faqs,'faqs',100,['id','question','answer'],(item,where)=>{const visible=forPublication&&!hidden.has('faq');string(item.question,where+'.question',1000,visible?1:0);markdown(item.answer,where+'.answer',20000);if(visible&&!item.answer.trim())fail(where+'.answer');});
  records(content.programs,'programs',100,Object.keys(defaults.programs[0]),(item,where)=>{
    const visible=forPublication&&!hidden.has('programs')&&['published','closed'].includes(item.status);
    for(const key of ['title','cardTitle','category','alt','format','priceText','disclaimer','buttonLabel'])string(item[key],where+'.'+key,key==='disclaimer'?2000:500,visible&&['title','cardTitle','format','buttonLabel'].includes(key)?1:0);
    markdown(item.description,where+'.description',20000);list(item.topics,where+'.topics',100);item.topics.forEach((topic,index)=>string(topic,where+'.topics['+index+']',1000));
    if(visible&&!item.description.trim())fail(where+'.description');
    icon(item.icon,where+'.icon');url(item.image,where+'.image',{image:true,empty:!visible});url(item.modalImage,where+'.modalImage',{image:true,empty:!visible});focus(item.imageFocus,where+'.imageFocus');focus(item.modalFocus,where+'.modalFocus');number(item.hours,where+'.hours',1,10000);if(!Number.isInteger(item.hours))fail(where+'.hours');enumValue(item.status,statuses,where+'.status');
  });
  records(content.pages,'pages',100,['id','slug','title','intro','body','seo','status'],(item,where)=>{identifier(item.slug,where+'.slug');if(reserved.has(item.slug))fail(where+'.slug','Служебное имя страницы');string(item.title,where+'.title',500,forPublication&&item.status==='published'?1:0);string(item.intro,where+'.intro',5000);markdown(item.body,where+'.body');if(forPublication&&item.status==='published'&&!item.body.trim())fail(where+'.body');seo(item.seo,where+'.seo');enumValue(item.status,['published','draft','archived'],where+'.status');if(builtin.includes(item.slug)&&(item.id!==item.slug||item.status!=='published'))fail(where,'Обязательная страница');});
  const slugs=content.pages.map(page=>page.slug);if(new Set(slugs).size!==slugs.length||builtin.some(slug=>!slugs.includes(slug)))fail('pages','Необходимы все обязательные страницы без повторов');
  records(content.extraSections,'extraSections',50,['id','type','title','body','image','alt','imageFocus','buttonLabel','buttonUrl','items'],(item,where)=>{
    if(defaults.sectionOrder.includes(item.id)||reserved.has(item.id))fail(where+'.id');enumValue(item.type,['text','image','cta','faq','cards','gallery'],where+'.type');string(item.title,where+'.title',500);markdown(item.body,where+'.body',20000);url(item.image,where+'.image',{image:true,empty:true});string(item.alt,where+'.alt',500);focus(item.imageFocus,where+'.imageFocus');string(item.buttonLabel,where+'.buttonLabel',200);url(item.buttonUrl,where+'.buttonUrl',{empty:true});
    const visible=forPublication&&!hidden.has(item.id);
    if(item.type==='faq')records(item.items,where+'.items',100,['id','title','body'],(entry,location)=>{string(entry.title,location+'.title',1000);markdown(entry.body,location+'.body',20000);});
    else if(item.type==='cards')records(item.items,where+'.items',50,['id','title','body','icon','image','alt','imageFocus','buttonLabel','buttonUrl'],(entry,location)=>{
      string(entry.title,location+'.title',500);markdown(entry.body,location+'.body',20000);string(entry.icon,location+'.icon',100);if(entry.icon)icon(entry.icon,location+'.icon');url(entry.image,location+'.image',{image:true,empty:true});string(entry.alt,location+'.alt',500);focus(entry.imageFocus,location+'.imageFocus');string(entry.buttonLabel,location+'.buttonLabel',200);url(entry.buttonUrl,location+'.buttonUrl',{empty:true});
      if(visible&&(!entry.title.trim()||Boolean(entry.buttonLabel.trim())!==Boolean(entry.buttonUrl)))fail(location,'Заполните заголовок и обе части кнопки карточки');
    });
    else if(item.type==='gallery')records(item.items,where+'.items',100,['id','image','alt','imageFocus','caption'],(entry,location)=>{
      url(entry.image,location+'.image',{image:true,empty:!visible});string(entry.alt,location+'.alt',500);focus(entry.imageFocus,location+'.imageFocus');string(entry.caption,location+'.caption',1000);if(visible&&!entry.alt.trim())fail(location+'.alt','Добавьте описание изображения');
    });
    else list(item.items,where+'.items',0);
    if(forPublication&&!hidden.has(item.id)){
      if(!item.title.trim())fail(where+'.title');if(item.type==='image'&&!item.image)fail(where+'.image');if(item.type==='text'&&!item.body.trim())fail(where+'.body');if(item.type==='cta'&&(!item.buttonLabel.trim()||!item.buttonUrl))fail(where+'.buttonUrl');if(item.type==='faq'&&(!item.items.length||item.items.some(entry=>!entry.title.trim()||!entry.body.trim())))fail(where+'.items');
      if(['cards','gallery'].includes(item.type)&&!item.items.length)fail(where+'.items','Добавьте хотя бы один элемент');
    }
  });
  const sections=[...defaults.sectionOrder,...content.extraSections.map(section=>section.id)];
  list(content.sectionOrder,'sectionOrder',57);if(content.sectionOrder.length!==sections.length||new Set(content.sectionOrder).size!==sections.length||sections.some(id=>!content.sectionOrder.includes(id)))fail('sectionOrder');
  list(content.hiddenSections,'hiddenSections',57);if(new Set(content.hiddenSections).size!==content.hiddenSections.length||content.hiddenSections.some(id=>!sections.includes(id)))fail('hiddenSections');
  object(content.settings,['contacts','organization','colors','intake'],'settings');
  object(content.settings.contacts,Object.keys(defaults.settings.contacts),'settings.contacts');
  string(content.settings.contacts.email,'settings.contacts.email',254,1);url('mailto:'+content.settings.contacts.email,'settings.contacts.email');string(content.settings.contacts.phone,'settings.contacts.phone',30,1);url('tel:'+content.settings.contacts.phone,'settings.contacts.phone');string(content.settings.contacts.phoneLabel,'settings.contacts.phoneLabel',100);
  object(content.settings.organization,Object.keys(defaults.settings.organization),'settings.organization');
  for(const key of Object.keys(defaults.settings.organization)){const where='settings.organization.'+key;if(key==='registryUrl')url(content.settings.organization[key],where);else string(content.settings.organization[key],where,key==='address'||key==='name'?2000:500);}
  object(content.settings.colors,Object.keys(defaults.settings.colors),'settings.colors');for(const [key,value] of Object.entries(content.settings.colors))color(value,'settings.colors.'+key);
  object(content.settings.intake,['enabled','deadline','deadlineLabel','consentVersion'],'settings.intake');
  if(typeof content.settings.intake.enabled!=='boolean')fail('settings.intake.enabled');
  const deadline=content.settings.intake.deadline;string(deadline,'settings.intake.deadline',10);if(deadline!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline))fail('settings.intake.deadline');
  string(content.settings.intake.deadlineLabel,'settings.intake.deadlineLabel',500);string(content.settings.intake.consentVersion,'settings.intake.consentVersion',100,1);if(!/^[a-zA-Z0-9_-]+$/.test(content.settings.intake.consentVersion))fail('settings.intake.consentVersion');
  object(content.documents,Object.keys(defaults.documents),'documents');for(const [key,value] of Object.entries(content.documents))url(value,'documents.'+key,{document:true});
  seo(content.seo,'seo',true);object(content.messages,Object.keys(defaults.messages),'messages');for(const [key,value] of Object.entries(content.messages))string(value,'messages.'+key,2000);
  const json=JSON.stringify(content);if(Buffer.byteLength(json)>2*1024*1024)fail('content','Размер контента превышает 2 МиБ');
  const canonical=JSON.parse(json);canonical.settings.organization.email=canonical.settings.contacts.email;canonical.settings.organization.phone=canonical.settings.contacts.phone;return canonical;
}

export function publicPrograms(content){return structuredClone(content.programs.filter(program=>['published','closed'].includes(program.status)));}
export function selectablePrograms(content){return structuredClone(content.programs.filter(program=>program.status==='published'));}
export function referencedMedia(content,{publicOnly=false}={}){
  const value=validateContent(content),references=new Set();
  const hidden=new Set(value.hiddenSections);
  if(publicOnly){value.programs=hidden.has('programs')?[]:value.programs.filter(program=>['published','closed'].includes(program.status));value.pages=value.pages.filter(page=>page.status==='published');value.benefits=hidden.has('about')?[]:value.benefits;value.steps=hidden.has('steps')?[]:value.steps;value.faqs=hidden.has('faq')?[]:value.faqs;value.extraSections=value.extraSections.filter(section=>!hidden.has(section.id));}
  const add=url=>{if(url?.startsWith('/media/'))references.add(url);};
  const visible=binding=>binding.targets.some(target=>(target.sections??[target.section]).some(section=>section===null||!hidden.has(section)));
  for(const binding of bindings)if(['image','background','url'].includes(binding.kind)&&(!publicOnly||visible(binding)))add(value.fields[binding.id]);
  for(const group of Object.values(value.navigation))group.forEach(item=>add(item.url));
  value.benefits.forEach(item=>add(item.image));value.programs.forEach(item=>{add(item.image);add(item.modalImage);});value.extraSections.forEach(item=>{add(item.image);add(item.buttonUrl);item.items.forEach(entry=>{add(entry.image);add(entry.buttonUrl);});});
  Object.values(value.documents).forEach(add);add(value.seo.icon);add(value.seo.ogImage);
  for(const page of value.pages){add(page.seo.ogImage);for(const match of page.body.matchAll(/\]\((\/media\/[^)]+)\)/g))add(match[1]);}
  for(const body of [...value.benefits.map(item=>item.body),...value.steps.map(item=>item.body),...value.faqs.map(item=>item.answer),...value.programs.map(item=>item.description),...value.extraSections.flatMap(item=>[item.body,...item.items.map(entry=>entry.body)])].filter(body=>typeof body==='string'))for(const match of body.matchAll(/\]\((\/media\/[^)]+)\)/g))add(match[1]);
  return references;
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
export function contentDigest(content){return createHash('sha256').update(JSON.stringify(stable(validateContent(content)))).digest('hex');}
