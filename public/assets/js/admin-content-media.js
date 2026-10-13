import {el,button,dialog,confirmAction,privateUrl} from './admin-content-ui.js?v=20261013-custom-icons';
import {labels,sectionLabels} from './admin-content-fields.js?v=20261013-custom-icons';

export function describeUsage(location,content){
 const parts=location.path.replace(/\[(\d+)\]/g,'.$1').split('.');
 const source={draft:'Черновик',published:'На сайте',history:'История'}[location.source]||'Версия';
 let name='Содержимое сайта';
 if(['programs','pages','benefits','steps','faqs','extraSections'].includes(parts[0])){
  const record=content?.[parts[0]]?.[Number(parts[1])];
  name=record?.title||record?.question||{programs:'Программа',pages:'Страница',benefits:'Преимущество',steps:'Шаг',faqs:'Вопрос',extraSections:'Дополнительный раздел'}[parts[0]];
 }else if(parts[0]==='documents')name=parts[1]==='license'?'Выписка из реестра лицензий':labels[parts[1]];
 else if(parts[0]==='fields')name=sectionLabels[parts[1]]||'Тексты и изображения сайта';
 else if(parts[0]==='seo')name='Поиск и социальные сети';
 return source+' №'+location.revision+' · '+name;
}

// Metadata drafts belong to the authenticated editor, not to a disposable card.
export function createMediaLibrary({api,isActive,onError=()=>{},onDirtyChange=()=>{}}){
 let viewGeneration=0,sessionGeneration=0,records=[],activeView=null;
 const drafts=new Map();
 const dirty=draft=>draft.title!==draft.base.title||draft.alt!==draft.base.alt;
 const pendingCount=()=>[...drafts.values()].filter(dirty).length;
 const hasUnsaved=()=>pendingCount()>0||isSaving();
 const isSaving=()=>[...drafts.values()].some(draft=>draft.saving);
 const notify=()=>{activeView?.sync();onDirtyChange();};

 function mergeRecord(record,readVersions=null){
  let draft=drafts.get(record.id);
  if(!draft){
   draft={title:record.title,alt:record.alt,base:{title:record.title,alt:record.alt},version:0,saving:false,error:'',saved:false};
   drafts.set(record.id,draft);
  }else if(!draft.saving&&(!readVersions||draft.version===(readVersions.get(record.id)??0))){
   for(const key of ['title','alt']){
    if(draft[key]===draft.base[key])draft[key]=record[key];
    draft.base[key]=record[key];
   }
  }
  return draft;
 }

 async function saveMetadata(record,snapshot=null){
  const draft=drafts.get(record.id);
  if(!draft||draft.saving)return;
  const life=sessionGeneration,sent=snapshot||{title:draft.title,alt:draft.alt};
  draft.saving=true;draft.error='';notify();
  try{
   const result=await api('/api/admin/media/'+record.id,{method:'PATCH',body:JSON.stringify(sent)});
   if(life!==sessionGeneration||!isActive())return;
   if(result?.id!==record.id||typeof result.title!=='string'||typeof result.alt!=='string')throw new Error('Сервер не подтвердил сохранение подписей. Правки остались в этом окне.');
   // A response acknowledges only what was sent, never later keystrokes.
   for(const key of ['title','alt']){
    if(draft[key]===sent[key])draft[key]=result[key];
    draft.base[key]=result[key];
   }
   draft.version++;draft.saved=true;
   const current=records.find(item=>item.id===record.id);
   if(current)Object.assign(current,result);
  }catch(error){
   if(life===sessionGeneration&&isActive())draft.error=error.message;
   throw error;
  }finally{
   if(life===sessionGeneration&&isActive()){draft.saving=false;notify();}
  }
 }

 async function savePending(){
  if(isSaving())return;
  const submitted=[...drafts.entries()].filter(([,draft])=>dirty(draft)).map(([id,draft])=>({id,title:draft.title,alt:draft.alt}));
  for(const {id,title,alt}of submitted){
   const record=records.find(item=>item.id===id);
   if(!record)throw new Error('Файл недоступен в медиатеке. Его несохранённые подписи остались в этом окне.');
   await saveMetadata(record,{title,alt});
  }
 }

 async function mount(host,{kind=null,onSelect=null}={}){
  const run=++viewGeneration,life=sessionGeneration;
  const readVersions=new Map([...drafts].map(([id,draft])=>[id,draft.version]));
  host.replaceChildren();
  const intro=el('p','Иконки PNG, WebP и статический SVG — SVG до 2 МиБ и 2048 × 2048, контуры path, группы, прямоугольники, окружности, эллипсы, линии и многоугольники; цвета HEX или базовые black/white/red/green/blue. Текст, CSS, ссылки, defs, градиенты, маски и эффекты не поддерживаются. Фотографии PNG, JPEG, WebP, AVIF — до 10 МиБ и 24 мегапикселей. Документы PDF и Word — до 10 МиБ. Новые файлы доступны только после публикации.','cms-hint');
  const explanation=el('p','Подписи файлов сохраняются отдельно кнопкой «Сохранить подписи». Несохранённые подписи остаются при поиске и переходе между разделами.','cms-hint');
  const search=el('input'),upload=el('form','','cms-upload'),file=el('input'),title=el('input'),alt=el('input'),send=button('Загрузить файл'),status=el('p','','cms-hint'),grid=el('div','','cms-media-grid');
  status.setAttribute('role','status');search.type='search';search.placeholder='Найти файл по названию или описанию';search.setAttribute('aria-label','Поиск в медиатеке');
  file.type='file';file.required=true;file.accept=kind==='icon'?'.png,.webp,.svg':kind==='image'?'.png,.jpg,.jpeg,.webp,.avif':kind==='document'?'.pdf,.docx':'.png,.jpg,.jpeg,.webp,.avif,.svg,.pdf,.docx';file.setAttribute('aria-label','Файл для загрузки');
  title.placeholder='Название файла';title.setAttribute('aria-label','Название файла');title.maxLength=500;
  alt.placeholder='Описание изображения для доступности';alt.setAttribute('aria-label','Описание файла');alt.maxLength=500;send.type='submit';
  upload.append(file,title,alt,send);host.append(intro,explanation,upload,status,search,grid);
  const current=()=>run===viewGeneration&&life===sessionGeneration&&isActive()&&host.isConnected;
  const alive=()=>life===sessionGeneration&&isActive();
  const cards=new Map(),usageSnapshots=new Map(),empty=el('p','Файлы не найдены. Загрузите файл или измените поиск.','cms-empty');
  const snapshotFor=location=>{
   const key=location.source==='draft'?'draft':String(location.revision);
   if(!usageSnapshots.has(key))usageSnapshots.set(key,api(key==='draft'?'/api/admin/content':'/api/admin/content/history/'+location.revision).then(result=>result.content).catch(error=>{usageSnapshots.delete(key);throw error;}));
   return usageSnapshots.get(key);
  };

  function createCard(record){
   const draft=drafts.get(record.id),card=el('article','','cms-media-card');card.dataset.mediaId=record.id;
   if(record.kind==='image'){
    const img=el('img');img.src=privateUrl(record.url);img.alt=draft.alt;img.loading='lazy';card.append(img);
   }else card.append(el('div',record.ext.toUpperCase(),'cms-file-type'));
   const heading=el('h3'),meta=el('p',Math.ceil(record.size/1024)+' КБ'+(record.width?' · '+record.width+' × '+record.height:''),'cms-hint');
   const titleLabel=el('label','Название'),titleInput=el('input'),altLabel=el('label','Описание изображения'),altInput=el('input');
   titleInput.maxLength=altInput.maxLength=500;titleLabel.append(titleInput);altLabel.append(altInput);
   const actions=el('div','','cms-actions'),feedback=el('p','','cms-hint'),locations=el('ul','','cms-usage'),usages=el('details');feedback.setAttribute('role','status');
   for(const location of record.locations||[])locations.append(el('li',describeUsage(location,null)));
   if(!record.locations?.length)locations.append(el('li','Ещё не используется в сохранённых версиях.'));
   usages.append(el('summary',record.public?'Опубликован · где используется':'Приватный файл · где используется'),locations);
   usages.addEventListener('toggle',async()=>{
    if(!usages.open||!record.locations?.length)return;
    try{
     const names=await Promise.all(record.locations.map(async location=>describeUsage(location,await snapshotFor(location))));
     if(current())locations.replaceChildren(...names.map(name=>el('li',name)));
    }catch(error){if(current())feedback.textContent='Не удалось загрузить подробности использования. '+error.message;}
   });
   const open=el('a','Открыть файл','cms-button');open.href=privateUrl(record.url);open.target='_blank';open.rel='noopener';actions.append(open);
   const save=button('Сохранить подписи',async()=>{try{await saveMetadata(record);}catch{/* Card and global dirty state retain the failed draft. */}});
   const discard=button('Отменить правки подписей',()=>{if(draft.saving)return;draft.title=draft.base.title;draft.alt=draft.base.alt;draft.error='';notify();});
   actions.append(save,discard);
   if(onSelect)actions.append(button('Выбрать файл',()=>onSelect({...record,title:draft.title,alt:draft.alt}),'is-primary'));
   actions.append(button('Удалить файл',async()=>{
    const answer=await confirmAction('Удалить файл?',(draft.title||'Файл')+' и его несохранённые подписи будут удалены без возможности восстановления.','Удалить файл',{danger:true});
    if(!answer.confirmed||!alive())return;
    try{
     await api('/api/admin/media/'+record.id,{method:'DELETE'});
     if(alive()){records=records.filter(item=>item.id!==record.id);drafts.delete(record.id);activeView?.draw();notify();}
    }catch(error){
     if(current()){
      feedback.textContent=error.locations?.length?'Файл нужен сохранённым версиям. Удаление недоступно.':error.message;
      if(error.locations){record.locations=error.locations;locations.replaceChildren(...error.locations.map(location=>el('li',describeUsage(location,null))));usages.open=true;}
     }
    }
   },'is-danger'));
   for(const [key,input]of [['title',titleInput],['alt',altInput]])input.addEventListener('input',()=>{draft[key]=input.value;draft.error='';notify();});
   card.append(heading,meta,titleLabel,altLabel,usages,actions,feedback);
   const sync=()=>{
    heading.textContent=draft.title||'Без названия';
    // Do not replace a card or reset a selection when an unrelated operation finishes.
    for(const [key,input]of [['title',titleInput],['alt',altInput]])if(input.value!==draft[key]){
     const start=input.selectionStart,end=input.selectionEnd,focused=document.activeElement===input;
     input.value=draft[key];if(focused&&typeof input.setSelectionRange==='function')input.setSelectionRange(start,end);
    }
    save.disabled=draft.saving||!dirty(draft);discard.hidden=!dirty(draft);discard.disabled=draft.saving;
    save.setAttribute('aria-busy',String(draft.saving));
    feedback.textContent=draft.error||(draft.saving?'Сохраняем подписи…':dirty(draft)?'Есть несохранённые подписи.':draft.saved?'Подписи сохранены.':'');
   };
   sync();return {card,sync};
  }

  function draw(){
   if(!current())return;
   const ids=new Set(records.map(record=>record.id));
   for(const [id,item]of cards)if(!ids.has(id)){item.card.remove();cards.delete(id);}
   const term=search.value.toLocaleLowerCase('ru');let shown=0;
   for(const record of records){
    if(!drafts.has(record.id))mergeRecord(record);
    let item=cards.get(record.id);
    if(!item){item=createCard(record);cards.set(record.id,item);grid.append(item.card);}
    const draft=drafts.get(record.id);
    item.card.hidden=Boolean((kind&&record.kind!==(kind==='icon'?'image':kind))||![record.title,record.alt,draft.title,draft.alt,record.ext].join(' ').toLocaleLowerCase('ru').includes(term));
    if(!item.card.hidden)shown++;
   }
   empty.hidden=shown>0;if(!empty.isConnected)grid.append(empty);
  }
  activeView={draw,sync:()=>{if(current())for(const item of cards.values())item.sync();}};
  search.addEventListener('input',draw);
  upload.addEventListener('submit',async event=>{
   event.preventDefault();const selected=file.files[0];if(!selected)return;
   if(selected.size>10*1024*1024){status.textContent='Размер файла превышает 10 МиБ.';return;}
   send.disabled=true;send.setAttribute('aria-busy','true');status.textContent='Проверяем и сохраняем файл…';
   const body=new FormData();body.append('file',selected);body.append('title',title.value);body.append('alt',alt.value);
   try{
    const record=await api('/api/admin/media',{method:'POST',body});
    if(!alive())return;
    records.unshift({...record,locations:[],public:false});mergeRecord(record);activeView?.draw();notify();
    if(current()){upload.reset();status.textContent='Файл загружен. Теперь его можно выбрать.';}
   }catch(error){if(current())status.textContent=error.message;}
   finally{if(current()){send.disabled=false;send.removeAttribute('aria-busy');}}
  });
  try{
   const result=await api('/api/admin/media');
   if(current()){records=result.media;for(const record of records)mergeRecord(record,readVersions);draw();notify();}
  }catch(error){if(current()){status.textContent=error.message;onError(error);}}
 }

 function choose(kind){
  return new Promise(resolve=>{
   const d=dialog(kind==='document'?'Выбрать документ':kind==='icon'?'Выбрать свою иконку':'Выбрать изображение',{wide:true});
   d.node.addEventListener('close',()=>resolve(null));mount(d.body,{kind,onSelect:record=>{resolve(record);d.close();}});
  });
 }
 return {
  mount,choose,hasUnsaved,pendingCount,isSaving,savePending,
  clear(){sessionGeneration++;viewGeneration++;records=[];drafts.clear();activeView=null;onDirtyChange();}
 };
}
