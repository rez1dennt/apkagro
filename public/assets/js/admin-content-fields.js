import {parseCustomIcon,customIconValue,renderContentIcon} from './content-icons.js?v=20261016-date-input';
import {el,button,confirmAction,privateUrl} from './admin-content-ui.js?v=20261016-date-input';
import {richText} from './admin-content-richtext.js?v=20261016-date-input';
import {createRecord,cloneRecord,moveRecord,removeRecord,splitTemplate} from './admin-content-state.js?v=20261016-date-input';
import {safeContentUrl} from './content-format.js?v=20261016-date-input';
import {contentFieldContract,robotsChoices} from './content-field-contract.js?v=20261016-date-input';
export const labels={title:'Заголовок',label:'Подпись ссылки',url:'Адрес ссылки',body:'Основной текст',question:'Вопрос',answer:'Ответ',icon:'Пиктограмма',image:'Изображение',modalImage:'Фото в подробном описании',alt:'Описание изображения',imageFocus:'Фокус изображения',modalFocus:'Фокус фото в описании',cardTitle:'Короткое название на карточке',category:'Категория',hours:'Продолжительность, часы',format:'Формат обучения',priceText:'Стоимость / бесплатное обучение',description:'Описание',topics:'Темы обучения — каждая с новой строки',disclaimer:'Условия и дополнительное пояснение',buttonLabel:'Текст кнопки',buttonUrl:'Адрес кнопки',status:'Статус',slug:'Адрес страницы',intro:'Вводный текст',seo:'Поиск и социальные сети',items:'Элементы раздела',caption:'Подпись фотографии',email:'Электронная почта',phone:'Телефон для звонка',phoneLabel:'Телефон для отображения',name:'Полное название организации',shortName:'Краткое название организации',address:'Адрес организации',ogrn:'ОГРН',inn:'ИНН',license:'Номер лицензии',licenseDate:'Дата лицензии',licensingAuthority:'Лицензирующий орган',registryUrl:'Ссылка на реестр лицензий',enabled:'Приём заявок открыт',deadline:'Последний день приёма (до 23:59 по Москве)',deadlineLabel:'Подпись срока приёма',consentVersion:'Действующая версия согласия',consentPdf:'Согласие — PDF',consentWord:'Согласие — Word',policyPdf:'Политика конфиденциальности — PDF',ogTitle:'Заголовок при отправке ссылки',ogDescription:'Описание при отправке ссылки',ogType:'Тип сайта',ogImage:'Изображение при отправке ссылки',robots:'Индексация поисковиками',themeColor:'Цвет интерфейса браузера',contacts:'Контакты',organization:'Организация и реквизиты',colors:'Фирменные цвета',intake:'Приём заявок',ink:'Основной текст',muted:'Второстепенный текст',forest:'Основной зелёный', 'forest-deep':'Тёмный зелёный',olive:'Оливковый',gold:'Золотой','gold-light':'Светлый золотой','gold-dark':'Тёмный золотой',paper:'Фон страницы',cream:'Дополнительный фон',white:'Светлая поверхность',line:'Границы',input:'Фон полей',danger:'Ошибки',success:'Успешные действия','icon-secondary':'Второй цвет пиктограмм'};
export const templateLabels={text:'Текст',image:'Текст с фотографией',cta:'Призыв к действию',faq:'Вопросы и ответы',cards:'Карточки',gallery:'Галерея'};
export const sectionLabels={hero:'Первый экран',about:'Почему это важно',programs:'Программы',steps:'Как поступить',application:'Заявка',faq:'Вопросы и ответы',closing:'Заключительный блок'};
const icons={arrow:'Стрелка',chevron:'Раскрытие',close:'Закрыть',check:'Галочка',building:'Организация',document:'Документ',laptop:'Онлайн',cap:'Образование',mail:'Почта',upload:'Загрузка',download:'Скачивание',phone:'Телефон',lock:'Защита',info:'Информация',calendar:'Календарь',search:'Поиск',logout:'Выход',leaf:'Лист',sprout:'Росток',tractor:'Трактор',support:'Поддержка',drone:'Дрон',grapes:'Виноград',wheat:'Пшеница','course-catalog':'Каталог программ','application-form':'Форма заявки',cheese:'Сыр'};
const statuses={published:'Показывать на сайте',draft:'Черновик',closed:'Показывать без приёма заявок',archived:'Архив'};
export function fieldControl({value,label,path,kind='text',onChange,chooseMedia,content,maxLength=10000,minLength=0,readOnly=false,choices=null}){
 const wrap=el('div','','cms-field'),heading=el('label',label),id='cms-input-'+crypto.randomUUID();heading.htmlFor=id;wrap.append(heading);let input;
 const changed=next=>{onChange(next);};
 if(kind==='focus'){
  const pair=el('div','','cms-focus');for(const [key,name]of[['x','По горизонтали, %'],['y','По вертикали, %']])pair.append(fieldControl({value:value[key],label:name,path:path+'.'+key,kind:'number',onChange:next=>{value[key]=next;changed({...value});},maxLength:100}));wrap.append(pair);heading.removeAttribute('for');return wrap;
 }
 if(kind==='template'){
  heading.removeAttribute('for');const parts=splitTemplate(value),row=el('div','','cms-template');for(const [i,part]of parts.entries())if(part.token){const key=part.token.match(/organization\.(\w+)/)?.[1],chip=el('span',key?(labels[key]+': '+content.settings.organization[key]):'Номер заявки','cms-chip');chip.title='Подставляется автоматически';row.append(chip);}else{const caption=el('input');caption.value=part.text;caption.setAttribute('aria-label',label+' — текст '+(i+1));caption.dataset.contentPath=path+'.caption'+i;caption.addEventListener('input',()=>{part.text=caption.value;changed(parts.map(p=>p.token||p.text).join(''));});row.append(caption);}wrap.append(row);return wrap;
 }
 if(kind==='boolean'){input=el('input');input.type='checkbox';input.checked=value;input.addEventListener('change',()=>changed(input.checked));wrap.classList.add('cms-field--check');}
 else if(choices||kind==='icon'||kind==='status'){
  input=el('select');const entries=choices||Object.entries(kind==='icon'?{...(contentFieldContract(path).optionalIcon?{'':'Без пиктограммы'}:{}),...icons}:statuses);for(const [key,name] of entries){const option=el('option',name);option.value=key;input.append(option);}const custom=kind==='icon'&&parseCustomIcon(value);if(custom){const option=el('option','Собственная иконка');option.value=value;input.append(option);}input.value=value;input.addEventListener('change',()=>changed(input.value));
 }else{
  input=el(['rich','multiline','topics'].includes(kind)?'textarea':'input');if(input.tagName==='INPUT')input.type=kind==='number'?'number':kind==='color'?'color':kind==='date'?'date':'text';input.value=kind==='topics'?value.join('\n'):value;input.maxLength=maxLength;input.minLength=minLength;if(kind==='number'){input.min=path.endsWith('.hours')?'1':'0';input.max=String(maxLength);input.step='1';}if(input.tagName==='TEXTAREA')input.rows=kind==='rich'?8:3;input.addEventListener('input',()=>{const next=kind==='number'?input.valueAsNumber:kind==='topics'?input.value.split('\n'):input.value;input.setCustomValidity('');if(typeof next==='string'&&/<\/?[a-z][^>]*>/i.test(next))input.setCustomValidity('Используйте текст и доступные кнопки оформления вместо HTML.');if(kind==='url'&&next&&!safeContentUrl(next))input.setCustomValidity('Проверьте адрес ссылки.');changed(next);});
 }
 input.id=id;input.dataset.contentPath=path;input.disabled=readOnly;input.setAttribute('aria-label',label);wrap.append(kind==='rich'?richText(input):input);
 if(kind==='image'||kind==='document'){
  const preview=el(kind==='image'?'img':'a','','cms-asset-preview');const refresh=()=>{preview.hidden=!input.value;if(kind==='image'){preview.src=input.value?privateUrl(input.value):'';preview.alt='Предпросмотр выбранного изображения';}else{preview.href=privateUrl(input.value);preview.textContent='Открыть выбранный документ';preview.target='_blank';preview.rel='noopener';}};refresh();input.addEventListener('change',refresh);input.addEventListener('input',refresh);wrap.append(preview,button('Выбрать или загрузить файл',async()=>{const selected=await chooseMedia(kind);if(selected){input.value=selected.url;changed(selected.url);refresh();}}));
 }
 if(kind==='icon'){
  let selected=parseCustomIcon(value),preview=document.createElementNS('http://www.w3.org/2000/svg','svg');preview.classList.add('icon','cms-icon-preview');preview.setAttribute('aria-hidden','true');wrap.append(preview);
  const row=el('div','','cms-icon-choice'),name=el('span',selected?'Собственная иконка: '+selected.url.split('/').at(-1):'Встроенная пиктограмма','cms-icon-name'),mode=el('select');mode.setAttribute('aria-label','Режим цвета иконки');
  for(const [key,label]of [['text','Цвет текста'],['original','Исходные цвета']]){const option=el('option',label);option.value=key;mode.append(option);}mode.value=selected?.mode||'text';
  const refresh=()=>{selected=parseCustomIcon(input.value);mode.disabled=!selected||readOnly;mode.value=selected?.mode||'text';preview=renderContentIcon(preview,input.value,{resolveUrl:privateUrl});preview.hidden=!input.value;};
  input.addEventListener('change',()=>{name.textContent=parseCustomIcon(input.value)?'Собственная иконка':'Встроенная пиктограмма';refresh();});
  const choose=button('Выбрать или загрузить свою иконку',async()=>{const previous=input.value;const file=await chooseMedia('icon');if(!file||!wrap.isConnected||input.value!==previous)return;const next=customIconValue(file.url,mode.value);let option=[...input.options].find(o=>o.value.startsWith('custom:'));if(!option){option=el('option','Собственная иконка');input.append(option);}option.value=next;input.value=next;name.textContent=file.title||file.url.split('/').at(-1);changed(next);refresh();});choose.disabled=readOnly;
  mode.addEventListener('change',()=>{if(!selected)return;const next=customIconValue(selected.url,mode.value),option=[...input.options].find(o=>o.value===input.value);option.value=next;input.value=next;changed(next);refresh();});row.append(choose,name,mode);wrap.append(row);refresh();
 }

 if(readOnly)wrap.append(el('small','Формируется автоматически.','cms-hint'));return wrap;
}
function propertyKind(key,value,path){
 if(contentFieldContract(path).format==='markdown')return 'rich';
 if(typeof value==='boolean')return 'boolean';
 if(typeof value==='number')return 'number';
 if(key==='imageFocus'||key==='modalFocus')return 'focus';
 if(['image','modalImage','ogImage'].includes(key)||path==='seo.icon')return 'image';
 if(key==='icon')return 'icon';
 if(key==='status')return 'status';
 if(key==='topics')return 'topics';
 if(key==='deadline')return 'date';
 if(key==='themeColor'||path.startsWith('settings.colors.'))return 'color';
 if(/Url$/.test(key)||key==='url')return 'url';
 return 'text';
}
export function objectFields(record,path,ctx,{builtin=false}={}){
 const box=el('div','','cms-fields');
 for(const [key,value] of Object.entries(record)){
  if(['id','type','items'].includes(key)||(path==='settings.organization'&&['email','phone'].includes(key)))continue;
  if(key==='seo'){
   const group=el('details','','cms-subgroup');
   group.append(el('summary',labels.seo),objectFields(value,path+'.seo',ctx));box.append(group);continue;
  }
  const fieldPath=path+'.'+key,contract=contentFieldContract(fieldPath),kind=propertyKind(key,value,fieldPath);
  const choices=key==='robots'?robotsChoices:key==='status'&&path.startsWith('pages')?Object.entries(statuses).filter(([status])=>status!=='closed'):null;
  const maxLength=contract.maxLength??(key==='hours'?10000:key==='topics'?20000:kind==='color'?7:2048);
  box.append(fieldControl({
   value,label:labels[key]||'Текст',path:fieldPath,kind,content:ctx.content,chooseMedia:ctx.chooseMedia,
   onChange:next=>{record[key]=next;ctx.change();},maxLength,
   readOnly:['consentVersion','ogType'].includes(key)||(builtin&&['slug','status'].includes(key)),choices
  }));
 }
 return box;
}
export function collectionEditor(list,kind,path,ctx,{title,limit=100,template=null}={}){
 const section=el('section','','cms-collection'),heading=el('div','','cms-section-heading'),listBox=el('div','','cms-record-list'),add=button('Добавить '+({programs:'программу',pages:'страницу',navigation:'ссылку',benefits:'преимущество',steps:'шаг',faqs:'вопрос',faq:'вопрос',cards:'карточку',gallery:'фотографию'}[kind]||'элемент'),()=>{const record=createRecord(kind,template);list.push(record);ctx.change();render(record.id);listBox.lastElementChild?.querySelector('input,textarea')?.focus({preventScroll:true});});heading.append(el('h3',title||''),add);section.append(heading,listBox);
 function render(openId=null){add.disabled=list.length>=limit;listBox.replaceChildren();for(const [index,record]of list.entries()){
  const builtin=kind==='pages'&&['privacy','consent','operator'].includes(record.id),item=el('details','','cms-record'),summary=el('summary'),name=el('span',record.title||record.question||record.label||record.caption||'Элемент '+(index+1));item.dataset.recordId=record.id;item.open=record.id===openId;summary.append(name,el('small',record.status?statuses[record.status]:String(index+1)));const actions=el('div','','cms-actions');
  for(const [label,direction]of[['Выше',-1],['Ниже',1]]){const move=button(label,()=>{moveRecord(list,record.id,direction);ctx.change();render(record.id);listBox.querySelector(`[data-record-id="${record.id}"] summary`)?.focus({preventScroll:true});});move.disabled=index+direction<0||index+direction>=list.length;actions.append(move);}
  const clone=button('Дублировать',()=>{const duplicated=cloneRecord(record);if(kind==='pages')duplicated.status='draft';list.splice(index+1,0,duplicated);ctx.change();render(duplicated.id);});clone.disabled=list.length>=limit;actions.append(clone);
  if(!builtin){actions.append(button('Удалить',async()=>{const answer=await confirmAction('Удалить элемент?',(record.title||record.question||record.label||'Этот элемент')+' будет удалён из черновика. Действующий сайт изменится после публикации.','Удалить из черновика',{danger:true});if(answer.confirmed){removeRecord(list,record.id);ctx.change();render();}},'is-danger'));}
  if(kind==='programs')actions.append(button(record.status==='archived'?'Вернуть в черновики':'В архив',()=>{record.status=record.status==='archived'?'draft':'archived';ctx.change();render(record.id);}));
  const inner=el('div','','cms-record-body');inner.append(actions,el('small','Постоянный идентификатор: '+record.id,'cms-hint'),objectFields(record,path+'.'+record.id,ctx,{builtin}));if(record.items&&['faq','cards','gallery'].includes(record.type))inner.append(collectionEditor(record.items,record.type,path+'.'+record.id+'.items',ctx,{title:'Элементы раздела',limit:record.type==='cards'?50:100}));inner.addEventListener('input',()=>name.textContent=record.title||record.question||record.label||record.caption||'Элемент '+(index+1));item.append(summary,inner);listBox.append(item);
 }if(!list.length)listBox.append(el('p','Пока пусто. Добавьте первый элемент.','cms-empty'));}render();return section;
}
export function bindingFields(definitions,ctx){const fragment=el('div','','cms-binding-groups');for(const group of definitions.groups){const fields=definitions.fields.filter(f=>!f.source&&!f.managedBy&&f.group===group.id);if(!fields.length)continue;const details=el('details','','cms-group');details.open=group===definitions.groups[0];details.append(el('summary',group.label));const grid=el('div','','cms-fields');for(const f of fields){const value=ctx.content.fields[f.id],friendlyLabel=f.label.length>80&&f.label.includes('Доступное название (')?f.label.split(' (')[0]:f.label,kind=splitTemplate(value).some(x=>x.token)?'template':f.kind==='background'?'image':f.kind==='text'?'multiline':f.kind;const control=fieldControl({value,label:friendlyLabel,path:'fields.'+f.id,kind,maxLength:f.maxLength,minLength:f.minLength,content:ctx.content,chooseMedia:ctx.chooseMedia,onChange:next=>{ctx.content.fields[f.id]=next;ctx.change();}});control.dataset.search=f.label.toLocaleLowerCase('ru');grid.append(control);}details.append(grid);fragment.append(details);}return fragment;}
