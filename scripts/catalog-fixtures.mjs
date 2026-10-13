import {validateContent} from '../server/content-schema.mjs';
export const catalogWidths = [1440,1024,768,360,320];
export function catalogFixture(original,{count=12,mode='natural',short=false}={}) {
  const content=structuredClone(original);
  const text=(prefix,n)=>mode==='token'?'Ж'.repeat(n):(prefix+' — '+('дополнительное профессиональное обучение для устойчивого развития аграрного производства '.repeat(300))).slice(0,n).trimEnd();
  content.settings.intake.deadline='';
  content.programs=Array.from({length:count},(_,i)=>({...structuredClone(original.programs[i%original.programs.length]),id:'catalog-'+i,title:short?'Программа '+(i+1):text('Полная программа '+i,500),cardTitle:short?original.programs[i%original.programs.length].cardTitle:text('Короткое название '+i,500),category:short?original.programs[i%original.programs.length].category:text('Категория '+i,500),format:short?'Очно':text('Формат',500),priceText:short?'Бесплатно':text('Стоимость',500),buttonLabel:short?'Выбрать программу':text('Выбрать программу',500),description:short?'Обучение и практика.':text('Описание программы',mode==='token'?20000:2200),topics:[text('Тема',short?30:1000),text('Практическая тема',short?30:1000)],disclaimer:short?'':text('Условия',mode==='token'?2000:600),status:i%4===3?'closed':'published'}));
  if(!short){
    content.programs.push({...structuredClone(original.programs[0]),id:'hidden-draft',status:'draft'},{...structuredClone(original.programs[0]),id:'hidden-archived',status:'archived'});
    for(const group of Object.values(content.navigation))for(const item of group)item.label=text('Раздел навигации',200);
    content.faqs[0].question=text('Вопрос об участии',1000);content.faqs[0].answer=text('Ответ на вопрос',mode==='token'?20000:1500);
    content.settings.contacts.phoneLabel=text('Телефон для связи',100);
    content.settings.contacts.email='a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.example';
    content.fields['header.text-60704e28bc4c']=text('Подать заявку',mode==='token'?10000:200);
  }
  validateContent(content,{forPublication:true});return content;
}
// Run in the browser. Inputs deliberately scroll their own editable values.
export function measureContent(scope) {
  const root=document.querySelector(scope),issues=[];
  const id=n=>n.id?'#'+n.id:n.localName+'.'+String(n.className).trim().replaceAll(' ','.');
  for(const n of [root,...root.querySelectorAll('*')]){
    const r=n.getBoundingClientRect(),s=getComputedStyle(n),p=n.parentElement;
    if(!p||!r.width||!r.height||s.visibility==='hidden'||n.closest('svg,[aria-hidden="true"],.honeypot')||n.matches('img,input,textarea,select,.leaf-decoration'))continue;
    const pr=p.getBoundingClientRect();
    // Step connector pseudo-elements intentionally occupy the gap between cards; their text children are still measured.
    const own=n.scrollWidth>n.clientWidth+2 && s.textOverflow!=='ellipsis' && !n.matches('.step-list > li,.closing__inner');
    const outside=(r.left<pr.left-2||r.right>pr.right+2)&&!n.matches('.handwritten');
    const verticalClip=['hidden','clip'].includes(getComputedStyle(p).overflowY)&&(r.top<pr.top-2||r.bottom>pr.bottom+2);
    let textOutside=false;
    if(s.textOverflow!=='ellipsis')for(const node of n.childNodes){if(node.nodeType!==3||!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const tr of range.getClientRects())if(tr.left<r.left-2||tr.right>r.right+2)textOutside=true;}
    if(own||outside||verticalClip||textOutside)issues.push({node:id(n),parent:id(p),own,outside,verticalClip,textOutside,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,box:r.toJSON(),parentBox:pr.toJSON()});
  }
  return {documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,issues};
}
export function broadFixture(original) {
 const c=catalogFixture(original,{short:true}),token=n=>'Ж'.repeat(n);
 for(const id of ['hero.title','hero.description','about.text-de41d1cac700','about.text-8329fb520ddf','programs.text-55a1866a9a18','steps.text-a755a7192e9c','application.title','application.text-05065ba628c2','closing.title','closing.text-4c0e117815ec','closing.text-2f7447cf73a3'])c.fields[id]=token(10000);
 c.benefits[0].title=token(500);c.benefits[0].body=token(20000);c.steps[0].title=token(500);c.steps[0].body=token(20000);
 c.settings.organization.name=token(2000);c.settings.organization.address=token(2000);
 c.pages[0].title=token(500);c.pages[0].intro=token(2000);c.pages[0].body='# '+token(500)+'\n\n'+token(20000);
 const section=(id,type)=>({id,type,title:token(500),body:token(2000),image:'',alt:'',imageFocus:{x:50,y:50},buttonLabel:'',buttonUrl:'',items:[]});
 const cards=section('long-cards','cards');cards.items=[{id:'long-card',title:token(500),body:token(20000),icon:'leaf',image:original.programs[0].image,alt:'Фото',imageFocus:{x:50,y:50},buttonLabel:token(200),buttonUrl:'#application'}];
 const gallery=section('long-gallery','gallery');gallery.items=[{id:'long-image',image:original.programs[0].image,alt:'Фото',imageFocus:{x:50,y:50},caption:token(1000)}];
 c.extraSections.push(cards,gallery);c.sectionOrder.push(cards.id,gallery.id);validateContent(c,{forPublication:true});return c;
}
