import {renderApplicationForm} from './application-form-render.mjs';
import {resolveFormFields} from './application-form.mjs';
import {renderContentIcon,parseCustomIcon} from '../public/assets/js/content-icons.js';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {validateContent,loadDefaultContent,referencedMedia} from './content-schema.mjs';
import {replaceLiterals,lookupMessage,formatHours,replaceCaption,previewPhotoPlaceholder,renderContentField} from '../public/assets/js/content-format.js';

const bindings=JSON.parse(readFileSync(new URL('../content/content-bindings.json',import.meta.url),'utf8'));
const defaults=await loadDefaultContent();
const sourceCss=Object.fromEntries([...new Set(bindings.flatMap(b=>b.targets.filter(t=>t.mode==='css-url').map(t=>t.file)))].map(file=>[file,readFileSync(new URL('../public/'+file,import.meta.url),'utf8')]));
export const contentCssFiles=Object.keys(sourceCss);
const previewMedia=value=>String(value).replace(/\/media\/([0-9a-f-]{36})\.(?:webp|png|jpe?g|avif|pdf|docx)/g,'/api/admin/media/$1/file');
const sourceKeys=Object.fromEntries(Object.entries(defaults.messages).map(([key,value])=>[value,key]));
const browserMessageKeys={...sourceKeys,...Object.fromEntries(Object.entries(defaults.messages).filter(([key])=>key.startsWith('site-')).map(([key,value])=>[value,key]))};
const get=(obj,path)=>path.split('.').reduce((o,k)=>o?.[k],obj);
const visible=(target,hidden)=>(target.sections??[target.section]).some(section=>section===null||!hidden.has(section));
const variables=(text,content)=>String(text).replace(/\{\{(settings\.organization\.\w+)\}\}/g,(_,key)=>get(content,key)??'');
function replacement(binding,target,content){
  let value=get(content,binding.source);
  if(value===binding.defaultValue)return target.sourceText;
  if(target.transform==='footer-name')value=value.replace(/[„“]/g,'');
  // Attribute targets replace the bare value inside an existing href. Markdown
  // URL targets include the scheme in sourceText, so replace the whole URL there.
  const prefix=target.mode==='markdown-alias'?(target.prefix??''):'';
  return prefix+value;
}
function aliasPairs(content,filter){return bindings.filter(b=>b.source).flatMap(b=>b.targets.filter(filter).map(t=>[t.sourceText,replacement(b,t,content)]));}
export function effectivePage(content,page){return {...page,body:replaceLiterals(variables(page.body,content),aliasPairs(content,t=>t.mode==='markdown-alias'&&t.pageId===page.id))};}
export function resolvedMessages(content){return Object.fromEntries(Object.entries(content.messages).map(([key,value])=>[key,replaceLiterals(value,aliasPairs(content,t=>t.mode==='message-alias'&&t.messageKey===key))]));}
export function contentMessage(content,source,vars){return lookupMessage(source,resolvedMessages(content),sourceKeys,vars);}
export function contentPrograms(content,{preview=false}={}){return content.hiddenSections.includes('programs')?[]:content.programs.filter(p=>preview?p.status!=='archived':['published','closed'].includes(p.status));}
export function contentIntakeEnabled(content, now = new Date()) {
  // The entered date remains open through 23:59:59.999 Moscow time (UTC+3).
  const moscowDay = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return content.settings.intake.enabled && !content.hiddenSections.includes('application')
    && contentPrograms(content).some(program => program.status === 'published')
    && (!content.settings.intake.deadline || moscowDay <= content.settings.intake.deadline);
}
export function applicationSnapshots(content,courseId,{revision=null}={}) {
  const program=contentPrograms(content).find(p=>p.id===courseId&&p.status==='published');if(!program)return null;
  const consent=effectivePage(content,content.pages.find(p=>p.slug==='consent'));
  return {courseSnapshot:structuredClone({...program,revision}),consentSnapshot:structuredClone({version:content.settings.intake.consentVersion,revision,title:consent.title,intro:consent.intro,body:consent.body,organization:content.settings.organization,documents:content.documents})};
}
export function renderContentCss({content,preview=false,file=null}) {
  const c=validateContent(content),hidden=new Set(c.hiddenSections);
  if(file){if(!Object.hasOwn(sourceCss,file))return null;let occurrence=0;const targets=bindings.flatMap(b=>b.targets.filter(t=>t.mode==='css-url'&&t.file===file).map(t=>({binding:b,...t})));
    const css=sourceCss[file].replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,(full,quote,url)=>{if(/\.(?:woff2?|ttf|otf)(?:[?#]|$)/.test(url))return full;const index=occurrence++;const target=targets.find(t=>t.occurrence===index);if(!target)return full;const value=visible(target,hidden)?c.fields[target.binding.id]:'';return value?'url('+JSON.stringify(value)+')':'none';});return preview?previewMedia(css):css;
  }
  let css=':root{'+Object.entries(c.settings.colors).map(([k,v])=>`--${k}:${v}`).join(';')+'}\n';
  const focus=(selector,f)=>`${selector.endsWith(' img')?selector+':not([aria-hidden="true"])':selector}{object-position:${f.x}% ${f.y}% !important}\n`;
  for(const p of contentPrograms(c,{preview})){css+=focus(`.program-card[data-course="${p.id}"] img`,p.imageFocus);css+=focus(`#course-dialog[data-course="${p.id}"] #dialog-image`,p.modalFocus);}
  if(!hidden.has('about'))for(const b of c.benefits)css+=focus(`[data-content-id="${b.id}"] > img`,b.imageFocus);
  for(const section of c.extraSections.filter(s=>!hidden.has(s.id))){css+=focus(`#${section.id} > .container > img`,section.imageFocus);for(const item of section.items)if(item.imageFocus)css+=focus(`#${section.id} [data-content-id="${item.id}"] img`,item.imageFocus);}
  // External rules preserve strict style-src CSP and expose only visible public resources.
  const iconUrls=new Set(),allowedIconUrls=referencedMedia(c,{publicOnly:!preview});
  function collectIcons(value){
    if(typeof value==='string'){
      const icon=parseCustomIcon(value);
      if(icon?.mode==='text'&&allowedIconUrls.has(icon.url))iconUrls.add(icon.url);
    }else if(value&&typeof value==='object')Object.values(value).forEach(collectIcons);
  }
  collectIcons(c);
  for(const url of iconUrls)css+='.content-icon-file-'+url.split('/').at(-1).slice(0,-5)+'{--content-icon-url:url("'+url+'")}\n';
  return preview?previewMedia(css):css;
}
function multiline(document,node,text){if(!node)return;node.replaceChildren();String(text).split('\n').forEach((part,i)=>{if(i){node.append(document.createTextNode(' '),document.createElement('br'));}node.append(document.createTextNode(part.trim()));});}
const replaceText = replaceCaption;
function rich(node,text,fieldPath){
  if(!node)return;
  const html=renderContentField(text,fieldPath);
  const singleParagraph=/^<p>(?:(?!<\/?p>|<(?:ul|ol|h[2-6])>)[\s\S])*<\/p>$/.test(html);
  if(node.tagName==='P'&&singleParagraph){node.innerHTML=html.slice(3,-4);return;}
  if(node.tagName==='P'){
    const block=node.ownerDocument.createElement('div');
    for(const attribute of node.attributes)block.setAttribute(attribute.name,attribute.value);
    node.replaceWith(block);node=block;
  }
  node.innerHTML=html;
}

function programBootstrap(content, program, preview) {
  const original = defaults.programs.find(item => item.id === program.id);
  const standard = defaults.programs[0];
  const field = id => content.fields['other.text-' + id];
  const common = (key, id) => program[key].trim() === standard[key].trim() ? field(id).trim() : program[key];
  return {
    ...program,
    title: program.title || (preview ? 'Название программы не заполнено' : ''),
    description: program.description || (preview ? 'Описание программы ещё не заполнено.' : ''),
    hoursLabel: program.hours === 72 ? field('1db1c090f064') : formatHours(program.hours),
    format: common('format', '1e052b1d9eb0'),
    priceText: common('priceText', 'a3d0eae4c33c'),
    buttonLabel: common('buttonLabel', '083dd138ad9a'),
    disclaimer: common('disclaimer', 'a94ec463c8ec'),
    disclaimerPlain: program.disclaimer.trim() === standard.disclaimer.trim(),
    originalFrame: ['flowers','wine','cider'].includes(program.id) && original?.modalImage === program.modalImage,
    preserveDescription: original?.description === program.description,
    hideDefaultDisclaimer: original?.disclaimer === program.disclaimer && field('a94ec463c8ec') === defaults.fields['other.text-a94ec463c8ec']
  };
}

export function renderContentPage({content,template,route='/',preview=false,consentVersion,revision=null,historyRevision=null,themeUrl,cssPrefix}) {
  const c=validateContent(content),hidden=new Set(c.hiddenSections),main=route==='/'||route==='/index.html';
  const slug=route.replace(/^\/+|\/+$/g,'').replace(/\/index\.html$/,'');const page=main?null:c.pages.find(p=>p.slug===slug&&(p.status==='published'||preview&&p.status==='draft'));if(!main&&!page)return null;
  const file=main?'index.html':['privacy','consent','operator'].includes(slug)?slug+'/index.html':'privacy/index.html';
  const {document:d}=parseHTML(template),q=s=>d.querySelector(s),make=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  // Capture targets before any mutation: selectors are checked-in positional template addresses.
  const targets=bindings.flatMap(binding=>binding.targets.filter(t=>t.file===file&&!['css-url','markdown-alias','message-alias'].includes(t.mode)).flatMap(target=>[...d.querySelectorAll(target.selector)].slice(0,target.all?undefined:1).map(node=>({binding,target,node}))));
  for(const {binding:b,target:t,node}of targets.filter(x=>!x.binding.source)){
    if(!visible(t,hidden)){if(!node.closest('main'))node.remove();continue;}const value=variables(c.fields[b.id],c);
    if(b.kind==='icon'){renderContentIcon(node,value,{inlineStyle:false});continue;}
    if(t.mode==='attribute')node.setAttribute(t.attribute,(t.prefix??'')+value);
    else if(t.mode==='text-node'){const child=node.childNodes[t.childIndex];if(child?.nodeType===3)child.textContent=(t.leadingSpace?' ':'')+value+(t.trailingSpace?' ':'');}
    else multiline(d,node,value);
  }
  const aliasNodes=new Map();for(const {binding,target,node}of targets.filter(x=>x.binding.source)){const key=target.mode==='attribute'?target.attribute:'text';if(!aliasNodes.has(node))aliasNodes.set(node,new Map());const map=aliasNodes.get(node);if(!map.has(key))map.set(key,[]);map.get(key).push([target.sourceText,replacement(binding,target,c)]);}
  for(const [node,attrs]of aliasNodes)for(const [key,pairs]of attrs){if(!main&&node.closest('.legal-body'))continue;if(key!=='text')node.setAttribute(key,replaceLiterals(node.getAttribute(key)??'',pairs));else for(const child of node.childNodes)if(child.nodeType===3)child.textContent=replaceLiterals(child.textContent,pairs);}
  for(const [name,selector]of Object.entries({desktop:'.header .nav',mobile:'#mobile-menu nav',footer:'.footer__nav'})){const nav=q(selector);if(!nav)continue;const original=[...nav.children];nav.replaceChildren();for(const [i,item]of c.navigation[name].entries()){if(hidden.has(item.url.replace(/^\/?#/,'')))continue;const a=(original[i]??original[0])?.cloneNode(true)??make('a');a.href=!main&&item.url.startsWith('#')?'/'+item.url:item.url;replaceText(a,item.label+(a.querySelector('svg')?' ':''));nav.append(a);}}
  if(main)renderApplicationForm({document:d,content:c,preview});
  const icon=(node,value)=>{const wrapper=node?.querySelector('svg,.content-icon');if(wrapper)renderContentIcon(wrapper,value,{inlineStyle:false});};
  if(main){
    const benefit=q('.benefit'),parent=benefit?.parentNode;if(parent){const model=benefit.cloneNode(true);parent.querySelectorAll('.benefit').forEach(n=>n.remove());for(const item of c.benefits){const n=model.cloneNode(true);n.dataset.contentId=item.id;multiline(d,n.querySelector('h3'),item.title);rich(n.querySelector('p'),item.body,'benefits.'+item.id+'.body');icon(n,item.icon);const img=n.querySelector('img');img.src=item.image;img.alt=item.alt;parent.append(n);}}
    const list=q('.step-list'),step=list?.firstElementChild?.cloneNode(true);if(list&&step){list.replaceChildren();for(const [i,item]of c.steps.entries()){const n=step.cloneNode(true);n.querySelector('.step-number').textContent=i+1;multiline(d,n.querySelector('h3'),item.title);rich(n.querySelector('p'),item.body,'steps.'+item.id+'.body');icon(n,item.icon);list.append(n);}}
    const faq=q('#faq .accordion'),faqModel=faq?.firstElementChild?.cloneNode(true);if(faq&&faqModel){faq.replaceChildren();for(const item of c.faqs){const n=faqModel.cloneNode(true);replaceText(n.querySelector('summary'),item.question);rich(n.querySelector('.accordion__content'),item.answer,'faqs.'+item.id+'.answer');faq.append(n);}}
    const cards = [...d.querySelectorAll('.program-card')];
    const grid = cards[0]?.parentNode, models = new Map(cards.map(node => [node.dataset.course, node]));
    if (grid) {
      grid.replaceChildren();
      for (const program of contentPrograms(c, {preview})) {
        const card = (models.get(program.id) ?? cards[0]).cloneNode(true);
        card.dataset.course = program.id;
        const img = card.querySelector('img');
        if (preview && !program.image) img.replaceWith(make('span', 'cms-photo-placeholder', previewPhotoPlaceholder));
        else { img.src = program.image; img.alt = program.alt; }
        icon(card.querySelector('.program-category'), program.icon);
        replaceText(card.querySelector('.program-category'), program.category);
        const title = card.querySelector('.program-card__body > span:last-child');
        multiline(d, title, program.cardTitle || (preview ? 'Название программы не заполнено' : ''));
        title.append(d.createTextNode(' '), make('span', 'course-hours', `(${formatHours(program.hours)})`));
        card.querySelector('.program-card__footer > span').textContent = program.format + ' · ' + formatHours(program.hours);
        grid.append(card);
      }
    }
    const deadline=q('.application__deadline');if(deadline)deadline.textContent=c.settings.intake.deadlineLabel;
    const sectionNodes=new Map(['hero','about','programs','steps','application','faq','closing'].map(id=>[id,q(['hero','closing'].includes(id)?'.'+id:'#'+id)]));
    for(const section of c.extraSections){const n=make('section','section cms-section');n.id=section.id;const container=make('div','container');n.append(container);container.append(make('h2','',section.title));const body=make('div','body-copy');rich(body,section.body,'extraSections.'+section.id+'.body');container.append(body);
      const photo=(item,cls='')=>{const img=make('img',cls);img.src=item.image;img.alt=item.alt;img.loading='lazy';return img;};const button=item=>{const a=make('a','button button--green',item.buttonLabel);a.href=item.buttonUrl;return a;};
      if(section.type==='image'&&section.image)container.append(photo(section));if(section.type==='cta')container.append(button(section));
      if(section.type==='faq'){const accordion=make('div','accordion');for(const item of section.items){const detail=make('details'),summary=make('summary','',item.title),answer=make('div','accordion__content');rich(answer,item.body,'extraSections.'+section.id+'.items.'+item.id+'.body');detail.append(summary,answer);accordion.append(detail);}container.append(accordion);}
      if(['cards','gallery'].includes(section.type)){const group=make('div','cms-grid');for(const item of section.items){const entry=make(section.type==='gallery'?'figure':'article','benefit');entry.dataset.contentId=item.id;if(item.image)entry.append(photo(item));const body=make('div','benefit__content');if(section.type==='gallery')body.append(make('figcaption','',item.caption));else{body.append(make('h3','',item.title));const copy=make('div');rich(copy,item.body,'extraSections.'+section.id+'.items.'+item.id+'.body');body.append(copy);if(item.icon){const svg=d.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const use=d.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/assets/icons-v2.svg#'+item.icon);svg.append(use);body.prepend(svg);renderContentIcon(svg,item.icon,{inlineStyle:false});}if(item.buttonUrl)body.append(button(item));}entry.append(body);group.append(entry);}container.append(group);}sectionNodes.set(section.id,n);
    }
    const mainNode=q('main');for(const id of c.sectionOrder){const n=sectionNodes.get(id);if(n){if(hidden.has(id))n.remove();else mainNode.append(n);}}
    if(hidden.has('programs'))q('#course-dialog')?.remove();
    if(!q('h1')){const h=make('h1','visually-hidden',c.seo.title);mainNode.prepend(h);}
  } else {
    q('h1').textContent=page.title;
    rich(q('.legal-intro'),page.intro,'pages.'+page.id+'.intro');
    const body=q('.legal-body');
    if(page.body===defaults.pages.find(item=>item.id===page.id)?.body){
      // Plain text and URLs have independent replacement maps. Never insert a
      // URL scheme into a visible email caption in the preserved legal layout.
      const textPairs=aliasPairs(c,target=>target.mode==='markdown-alias'&&target.pageId===page.id&&!target.prefix);
      const urlPairs=aliasPairs(c,target=>target.mode==='markdown-alias'&&target.pageId===page.id);
      const visit=node=>{
        for(const child of node.childNodes){
          if(child.nodeType===3)child.textContent=replaceLiterals(child.textContent,textPairs);
          else visit(child);
        }
      };
      visit(body);
      for(const link of body.querySelectorAll('a[href]'))link.href=replaceLiterals(link.getAttribute('href'),urlPairs);
    }else rich(body,effectivePage(c,page).body,'pages.'+page.id+'.body');
  }
  // Project visibility onto known site navigation and CTA controls, never legal prose.
  for (const link of d.querySelectorAll('a[href]')) {
    if (link.closest('.legal-body')) continue;
    const section = link.getAttribute('href').match(/^(?:\/|\/index\.html)?#([a-z0-9_-]+)$/)?.[1];
    if (section && hidden.has(section)) link.remove();
  }
  const seo=page?.seo??c.seo;d.title=seo.title;const meta=(attr,key,value)=>{let n=q(`meta[${attr}="${key}"]`);if(!n){n=make('meta');n.setAttribute(attr,key);d.head.append(n);}n.setAttribute('content',value);};
  meta('name','description',seo.description);meta('name','robots',preview?'noindex,nofollow':seo.robots);meta('name','theme-color',c.seo.themeColor);for(const [key,value]of Object.entries({title:seo.ogTitle,description:seo.ogDescription,type:seo.ogType,image:seo.ogImage}))meta('property','og:'+key,value);q('link[rel="icon"]')?.setAttribute('href',c.seo.icon);
  const query=(preview?historyRevision:revision)!==null?'?revision='+(preview?historyRevision:revision):'';const prefix=cssPrefix??(preview?'/admin/preview/styles/':'/assets/content/');for(const link of d.querySelectorAll('link[rel="stylesheet"]')){const file=link.getAttribute('href').split('?')[0].slice(1);if(contentCssFiles.includes(file))link.href=prefix+file.split('/').at(-1)+query;}
  const theme=make('link');theme.rel='stylesheet';theme.href=themeUrl??prefix+'theme.css'+query;d.head.append(theme);
  const boot=make('script');boot.id='site-content';boot.type='application/json';boot.textContent=JSON.stringify({revision,preview,applicationForm:{version:1,fields:resolveFormFields(c)},programs:contentPrograms(c,{preview}).map(program=>programBootstrap(c,program,preview)),intake:{...c.settings.intake,enabled:!preview&&contentIntakeEnabled(c),consentVersion:consentVersion??c.settings.intake.consentVersion},messages:resolvedMessages(c),messageKeys:browserMessageKeys}).replace(/custom:(text|original):\/media\//g,'custom:$1:\\u002fmedia\\u002f').replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');d.body.append(boot);
  const form=q('#application-form');
  if(form&&preview){form.setAttribute('action','/api/preview-applications');form.setAttribute('method','post');form.setAttribute('enctype','multipart/form-data');const context=make('input');context.type='hidden';context.name='submissionContext';context.value='preview';form.append(context);}
  if(form&&(revision!==null||preview)){const input=make('input');input.type='hidden';input.name='contentRevision';input.value=preview?'preview':String(revision);form.append(input);}
  const consent=q('[name="consentVersion"]');if(consent)consent.value=consentVersion??c.settings.intake.consentVersion;
  if(preview){d.documentElement.dataset.contentPreview='true';for(const a of d.querySelectorAll('a[href]')){const href=a.getAttribute('href');if(href==='/'||c.pages.some(p=>href==='/'+p.slug+'/'))a.href='/admin/preview'+href+query;}}
  return preview?previewMedia(d.toString()):d.toString();
}
