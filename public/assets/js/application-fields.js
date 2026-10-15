// Shared pure field rules. Never evaluate configured code, markup or expressions.
export const FORM_LIMITS=Object.freeze({fields:40,activeFiles:4,uploadedFiles:8,fileBytes:10*1024*1024,multipartBytes:81*1024*1024,scalarParts:50,parts:58,scalarBytes:16*1024,label:500,hint:2000,placeholder:500,text:2000,textarea:4000,options:50,optionLabel:500,number:1e12});
export const maxFilesForField=definition=>definition.kind==='builtin'&&definition.id==='educationFile'?5:1;
export const fileCountMessage=limit=>limit===1?'Выберите один файл для этого поля.':`Для этого поля можно прикрепить не больше ${limit} файлов.`;
export const FIELD_TYPES=Object.freeze(['text','textarea','email','tel','date','number','select','radio','checkbox','file']);
export function createCustomField(type,{id,label='Новое поле'}={}){
 if(!FIELD_TYPES.includes(type))throw new TypeError('Неизвестный тип поля.');
 const rules=['text','textarea'].includes(type)?{format:'plain',minLength:0,maxLength:FORM_LIMITS[type]}:['date','number'].includes(type)?{min:null,max:null}:['select','radio'].includes(type)?{options:[]}:type==='file'?{accept:['pdf','jpg','png']}:{};
 return {id:id??'field-'+globalThis.crypto.randomUUID(),kind:'custom',type,label,hint:'',placeholder:'',enabled:true,required:false,rules};
}
export function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
export function validateFieldValue(definition,value,{today=new Date().toISOString().slice(0,10)}={}){
 const {type,required,rules={}}=definition,fail=message=>({ok:false,message}),ok=value=>({ok:true,value});
 if(type==='checkbox'||type==='file'){
  if(value!==undefined&&value!==''&&![true,false,'true','false'].includes(value))return fail('Некорректное значение.');
  const checked=value===true||value==='true';return required&&!checked?fail(type==='file'?'Прикрепите документ.':'Подтвердите выбор.'):ok(checked);
 }
 if(value===undefined)value='';if(typeof value!=='string')return fail('Некорректное значение.');value=value.trim();
 if(!value)return required?fail('Заполните поле.'):ok('');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))return fail('Недопустимые символы.');
 if(type==='text'||type==='textarea'){
  if(rules.format==='digits'&&!/^\d+$/.test(value))return fail('Введите только цифры.');
  if(rules.format==='name'&&!/^[\p{L}][\p{L}\p{M} '-]{0,79}$/u.test(value))return fail('Проверьте имя.');
  if(rules.format==='snils'){
   const digits=value.replace(/[ -]/g,'');if(!/^\d{11}$/.test(digits)||/^0+$/.test(digits))return fail('Проверьте номер СНИЛС.');
   if(Number(digits.slice(0,9))>1001998){let check=digits.slice(0,9).split('').reduce((s,c,i)=>s+Number(c)*(9-i),0)%101;if(check===100)check=0;if(check!==Number(digits.slice(9)))return fail('Контрольное число СНИЛС не совпадает.');}value=digits;
  }
  if(value.length<(rules.minLength??0)||value.length>(rules.maxLength??FORM_LIMITS[type]))return fail('Проверьте длину значения.');
 }else if(type==='email'){
  if(value.length>254||!/^[^\s@<>\x00-\x1f]{1,64}@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(value))return fail('Проверьте адрес электронной почты.');
 }else if(type==='tel'){
  const digits=value.replace(/\D/g,'');if(!/^\+?[0-9 ()-]{10,24}$/.test(value)||digits.length<10||digits.length>15)return fail('Проверьте номер телефона.');
 }else if(type==='date'){
  if(!validDate(value)||(rules.min&&value<rules.min)||(rules.max&&value>rules.max)||(definition.id==='birthDate'&&value>today))return fail('Укажите корректную дату.');
 }else if(type==='number'){
  if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>FORM_LIMITS.number||(rules.min!==null&&rules.min!==undefined&&Number(value)<rules.min)||(rules.max!==null&&rules.max!==undefined&&Number(value)>rules.max))return fail('Проверьте число.');
 }else if(type==='select'||type==='radio'){
  if(!rules.options?.some(option=>option.id===value))return fail('Выберите вариант из списка.');
 }else return fail('Неизвестный тип поля.');
 return ok(value);
}
export function formatFieldValue(definition,value){
 if(value===undefined||value===null||value==='')return '';
 if(definition.type==='checkbox')return value===true||value==='true'?'Да':'Нет';
 if(definition.type==='file')return value===true||value==='true'?'Прикреплён':'Не прикреплён';
 if(['select','radio'].includes(definition.type))return definition.rules?.options?.find(option=>option.id===value)?.label??String(value);
 return String(value);
}
// Pure resolver shared by the editor and server. Metadata is the trusted builtin
// registry returned by /api/admin/content/definitions, never a submitted schema.
export function resolveFormDefinitions(content,builtins,{includeDisabled=false}={}){
 const registry=new Map(builtins.map(field=>[field.id,field]));
 const fields=content.applicationForm?.fields??builtins.map(f=>({id:f.id,kind:'builtin',enabled:true,required:f.defaultRequired}));
 return fields.filter(f=>includeDisabled||f.enabled).map(field=>{
  if(field.kind==='custom')return structuredClone(field);
  const meta=registry.get(field.id);if(!meta)throw new TypeError('Неизвестное стандартное поле.');
  const read=(role,fallback)=>meta.aliases[role]?content.fields?.[meta.aliases[role]]??fallback:fallback;
  const rules=structuredClone(meta.rules);if(rules.options)rules.options=rules.options.map(o=>({...o,label:read('option:'+o.id,o.label)}));
  return {...field,type:meta.type,label:read('label',meta.defaultLabel).trim(),hint:read('hint',field.hint??meta.defaultHint),placeholder:read('placeholder',meta.defaultPlaceholder),rules,domId:meta.domId,name:meta.name,autocomplete:meta.autocomplete,inputmode:meta.inputmode,uploadLabel:read('uploadLabel',meta.defaultUploadLabel),marker:read('marker',meta.defaultMarker)};
 });
}
export function formConsentShape(resolvedFields){
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
 return resolvedFields.filter(f=>f.enabled).map(({id,type,label,required,rules})=>{
  const copy=structuredClone(rules);if(copy.options)copy.options.sort((a,b)=>a.id.localeCompare(b.id));
  return {id,type,label,required,rules:stable(copy)};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
