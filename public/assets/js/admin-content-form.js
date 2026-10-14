import {el,button,dialog,confirmAction} from './admin-content-ui.js?v=20261014-contacts';
import {createCustomField,FIELD_TYPES,FORM_LIMITS,resolveFormDefinitions,formConsentShape} from './application-fields.js?v=20261014-contacts';
export const typeLabels={text:'Текст',textarea:'Длинный текст',email:'Электронная почта',tel:'Телефон',date:'Дата',number:'Число',select:'Список',radio:'Один вариант',checkbox:'Галочка',file:'Файл'};
export function createPreset(name){const field=createCustomField('text',{label:name==='passportSeries'?'Серия паспорта':'Номер паспорта'});const length=name==='passportSeries'?4:6;field.rules={format:'digits',minLength:length,maxLength:length};return field;}
export function copyFormField(field){if(field.kind!=='custom')throw new TypeError('Стандартное поле нельзя копировать.');const copy=structuredClone(field);copy.id='field-'+crypto.randomUUID();if(copy.rules.options)for(const option of copy.rules.options)option.id='option-'+crypto.randomUUID();return copy;}
export function restoreBuiltin(content,meta){const fields=content.applicationForm.fields;if(fields.some(f=>f.id===meta.id))throw new TypeError('Поле уже добавлено.');fields.push({id:meta.id,kind:'builtin',enabled:true,required:meta.defaultRequired});}
export function collectionChanged(before,after,builtins){return JSON.stringify(formConsentShape(resolveFormDefinitions(before,builtins)))!==JSON.stringify(formConsentShape(resolveFormDefinitions(after,builtins)));}
export function formEditorError(content,builtins,{forPublication=false}={}){
 for(const field of resolveFormDefinitions(content,builtins,{includeDisabled:true})){
  if(field.kind!=='custom')continue;const r=field.rules,fail=(message,role)=>({id:field.id,message:'«'+field.label+'»: '+message,role});
  if(['text','textarea'].includes(field.type)){
   if(r.minLength>r.maxLength)return fail('Минимум символов не может превышать максимум.','minLength');
   if(r.format==='name'&&r.minLength>80)return fail('Для имени минимум должен быть не больше 80 символов.','minLength');
   if(r.format==='snils'&&(r.minLength>11||r.maxLength<11))return fail('Длина СНИЛС должна допускать 11 цифр.','minLength');
   if(forPublication&&field.enabled&&field.required&&r.maxLength===0)return fail('Обязательное поле должно допускать хотя бы один символ.','maxLength');
  }
  if(['date','number'].includes(field.type)&&r.min!==null&&r.max!==null&&r.min>r.max)return fail('Минимальное значение не может превышать максимальное.','min');
  if(forPublication&&field.enabled&&['select','radio'].includes(field.type)&&!r.options.length)return fail('Добавьте хотя бы один вариант ответа перед публикацией.','options');
 }
 return null;
}
export function renderFormEditor(host,{state,definitions,onChange}){
 const content=state.content,builtins=definitions.applicationForm.builtins,metaMap=new Map(builtins.map(f=>[f.id,f]));
 content.applicationForm??={version:1,fields:builtins.map(f=>({id:f.id,kind:'builtin',enabled:true,required:f.defaultRequired}))};
 const fields=content.applicationForm.fields,list=el('div','','cms-form-list'),status=el('p','','cms-hint'),count=el('p','','cms-hint');status.setAttribute('role','status');
 host.append(el('p','Добавьте только данные, необходимые для участия. Сохраните черновик, проверьте предпросмотр и опубликуйте изменения. Старые заявки сохраняют свои поля и ответы.','cms-hint'),count,button('Добавить поле',addDialog,'is-primary'),status,list);
 const changed=()=>{count.textContent=`Полей: ${fields.length} из ${FORM_LIMITS.fields} · На сайте: ${fields.filter(f=>f.enabled).length}`;onChange();};
 const fileCount=()=>resolveFormDefinitions(content,builtins).filter(f=>f.type==='file').length;
 function control(body,label,value,change,{type='text',role='',maxLength,min,max,choices,step,required=false}={}){
  const row=el('label','','cms-field'),caption=el('span',label),input=el(choices?'select':type==='textarea'?'textarea':'input');
  caption.id='cms-form-label-'+crypto.randomUUID();input.setAttribute('aria-labelledby',caption.id);
  if(!choices&&type!=='textarea')input.type=type;if(choices)for(const [v,text]of choices){const o=el('option',text);o.value=v;input.append(o);}input.value=value??'';
  if(type==='checkbox')input.checked=Boolean(value);if(maxLength!==undefined)input.maxLength=maxLength;if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);input.required=required;if(step)input.step=step;if(role)input.dataset.formRole=role;
  input.addEventListener(type==='checkbox'||choices?'change':'input',()=>{change(type==='checkbox'?input.checked:input.value,input);});
  if(type==='checkbox'){row.className='cms-check';row.append(input,caption);}else row.append(caption,input);body.append(row);return input;
 }
 function draw(focusId){
  list.replaceChildren();count.textContent=`Полей: ${fields.length} из ${FORM_LIMITS.fields} · На сайте: ${fields.filter(f=>f.enabled).length}`;
  if(!fields.length)list.append(el('p','Полей пока нет. Выбор программы и согласие остаются в форме. Добавьте нужные поля.','cms-empty'));
  const resolved=new Map(resolveFormDefinitions(content,builtins,{includeDisabled:true}).map(f=>[f.id,f]));
  for(const [index,field]of fields.entries()){
   const meta=metaMap.get(field.id),definition=resolved.get(field.id),card=el('details','','cms-record cms-form-record'),summary=el('summary'),title=el('span'),badge=el('small','','cms-hint'),body=el('div','','cms-record-body'),actions=el('div','','cms-actions'),toggles=el('div','','cms-actions');card.dataset.formId=field.id;
   const caption=()=>{title.textContent=resolveFormDefinitions(content,builtins,{includeDisabled:true}).find(f=>f.id===field.id).label;badge.textContent=`${typeLabels[definition.type]} · ${field.required?'Обязательное':'Необязательное'} · ${field.enabled?'Показывается':'Скрыто'}`;};caption();summary.append(title,badge);
   control(toggles,'Показывать поле',field.enabled,(value,input)=>{if(value&&definition.type==='file'&&fileCount()>=FORM_LIMITS.activeFiles){input.checked=false;status.textContent='Одновременно можно показывать не больше четырёх файлов.';return;}field.enabled=value;changed();caption();},{type:'checkbox',role:'enabled'});
   control(toggles,'Обязательное',field.required,value=>{field.required=value;changed();caption();},{type:'checkbox',role:'required'});
   for(const [label,offset]of[['Выше',-1],['Ниже',1]]){const b=button(label,()=>{const next=index+offset;fields.splice(index,1);fields.splice(next,0,field);changed();draw(field.id);});b.disabled=index+offset<0||index+offset>=fields.length;actions.append(b);}
   if(field.kind==='custom')actions.append(button('Копировать',()=>{if(fields.length>=FORM_LIMITS.fields||definition.type==='file'&&field.enabled&&fileCount()>=FORM_LIMITS.activeFiles){status.textContent='Достигнут предел полей или файлов. Сначала удалите или скройте лишние.';return;}const copy=copyFormField(field);fields.splice(index+1,0,copy);changed();draw(copy.id);}));
   actions.append(button('Удалить поле',async()=>{const answer=await confirmAction('Удалить поле?',`«${definition.label}» будет удалено из черновика. Ответы в старых заявках сохранятся.${meta?' Стандартное поле можно добавить снова.':''}`,'Удалить поле',{danger:true});if(answer.confirmed&&card.isConnected&&state.content===content){fields.splice(fields.indexOf(field),1);changed();draw(fields[Math.min(index,fields.length-1)]?.id);}},'is-danger'));
   body.append(toggles,actions,el('p',meta?'Стандартное поле. Тип и проверка закреплены; подписи используют общие тексты сайта.':'Тип: '+typeLabels[field.type],'cms-hint'));
   const grid=el('div','','cms-fields');body.append(grid);
   const edit=(role,label,value,maxLength,type='text')=>control(grid,label,value,next=>{const alias=meta?.aliases[role];if(alias)content.fields[alias]=next;else if(!meta||role==='hint')field[role]=next;else return;changed();if(role==='label')caption();},{role,maxLength,type,required:role==='label'});
   edit('label','Подпись поля',definition.label,FORM_LIMITS.label);edit('hint','Подсказка',definition.hint,FORM_LIMITS.hint,'textarea');
   if((!meta||meta.aliases.placeholder)&&!['checkbox','radio','file'].includes(definition.type))edit('placeholder','Пример или приглашение',definition.placeholder,FORM_LIMITS.placeholder);
   if(meta?.aliases.marker)edit('marker','Отметка обязательного поля',definition.marker,FORM_LIMITS.label);
   if(meta?.aliases.uploadLabel)edit('uploadLabel','Приглашение выбрать файл',definition.uploadLabel,FORM_LIMITS.label);
   if(meta?.rules.options)for(const option of definition.rules.options)edit('option:'+option.id,'Подпись варианта',option.label,FORM_LIMITS.optionLabel);
   if(!meta){
    const rules=field.rules;
    if(['text','textarea'].includes(field.type)){
     control(grid,'Допустимые символы',rules.format,value=>{rules.format=value;changed();},{role:'format',choices:[['plain','Любой текст'],['digits','Только цифры'],['name','Имя'],['snils','СНИЛС']]});
     for(const key of ['minLength','maxLength'])control(grid,key==='minLength'?'Минимум символов':'Максимум символов',rules[key],value=>{rules[key]=value===''?0:Number(value);changed();},{role:key,type:'number',min:0,max:FORM_LIMITS[field.type]});
    }
    if(['date','number'].includes(field.type))for(const key of ['min','max'])control(grid,key==='min'?'Минимальное значение':'Максимальное значение',rules[key],value=>{rules[key]=value===''?null:field.type==='number'?Number(value):value;changed();},{role:key,type:field.type,step:field.type==='number'?'any':undefined,...(field.type==='number'?{min:-FORM_LIMITS.number,max:FORM_LIMITS.number}:{})});
    if(rules.options){const choices=el('section','','cms-form-options');body.append(choices);const optionsDraw=()=>{choices.replaceChildren(el('h3','Варианты ответа'));for(const option of rules.options){const row=el('div','','cms-actions');control(row,'Подпись варианта',option.label,value=>{option.label=value;changed();},{maxLength:FORM_LIMITS.optionLabel,required:true});row.append(button('Удалить вариант',async()=>{const answer=await confirmAction('Удалить вариант?','Он исчезнет из нового состава формы. Старые ответы сохранят свою подпись.','Удалить вариант',{danger:true});if(answer.confirmed&&card.isConnected){rules.options.splice(rules.options.indexOf(option),1);changed();optionsDraw();}},'is-danger'));choices.append(row);}const add=button('Добавить вариант',()=>{rules.options.push({id:'option-'+crypto.randomUUID(),label:'Новый вариант'});changed();optionsDraw();choices.querySelector('.cms-actions:last-of-type input')?.focus();});add.dataset.formRole='options';add.disabled=rules.options.length>=FORM_LIMITS.options;choices.append(add,el('p','Добавьте хотя бы один вариант перед публикацией.','cms-hint'));};optionsDraw();}
    if(field.type==='file'){const formats=el('div','','cms-actions');body.append(el('p','Один файл до 10 МБ. Допустимые форматы:','cms-hint'),formats);for(const [ext,label]of [['pdf','PDF'],['jpg','JPG / JPEG'],['png','PNG']])control(formats,label,rules.accept.includes(ext),(value,input)=>{if(!value&&rules.accept.length===1){input.checked=true;status.textContent='Оставьте хотя бы один допустимый формат.';return;}rules.accept=value?[...rules.accept,ext]:rules.accept.filter(v=>v!==ext);changed();},{type:'checkbox'});}
   }
   card.append(summary,body);list.append(card);if(focusId===field.id){card.open=true;summary.focus();}
  }
 }
 function addDialog(){
  const d=dialog('Добавить поле'),group=el('div','','cms-fields'),kind=el('select'),row=el('label','','cms-field');row.append(el('span','Тип или шаблон'),kind);group.append(row);
  for(const [value,label]of [['passportNumber','Номер паспорта — 6 цифр'],['passportSeries','Серия паспорта — 4 цифры'],...FIELD_TYPES.map(type=>[type,typeLabels[type]]),...builtins.filter(meta=>!fields.some(f=>f.id===meta.id)).map(meta=>['builtin:'+meta.id,'Вернуть: '+(content.fields[meta.aliases.label]??meta.defaultLabel)])]){const o=el('option',label);o.value=value;kind.append(o);}kind.value='passportNumber';
  d.body.append(el('p','Новые поля необязательны. При необходимости включите обязательность в карточке. Системные элементы защищены.','cms-hint'),group);const error=el('p','','cms-error');error.setAttribute('role','alert');d.body.append(error);
  const add=button('Добавить в черновик',()=>{if(!host.isConnected||state.content!==content){d.close();return;}if(fields.length>=FORM_LIMITS.fields){error.textContent='В форме может быть не больше 40 полей, включая скрытые.';return;}const value=kind.value,meta=metaMap.get(value.replace('builtin:',''));if((value==='file'||meta?.type==='file')&&fileCount()>=FORM_LIMITS.activeFiles){error.textContent='Сначала скройте один из четырёх файлов.';return;}let field;if(value.startsWith('builtin:')){restoreBuiltin(content,meta);field=fields.at(-1);}else{field=value.startsWith('passport')?createPreset(value):createCustomField(value,{label:typeLabels[value]});fields.push(field);}changed();d.close();draw(field.id);},'is-primary');d.actions.prepend(add);kind.focus();
 }
 draw();return {dispose(){list.replaceChildren();}};
}
