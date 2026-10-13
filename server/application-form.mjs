import {HttpError} from './http-error.mjs';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {FIELD_TYPES,FORM_LIMITS,validDate,resolveFormDefinitions,formConsentShape} from '../public/assets/js/application-fields.js';

// Resolve positional legacy bindings once against the original checked-in template,
// never against a reordered form or by comparing translated/duplicated labels.
const bindings=JSON.parse(readFileSync(new URL('../content/content-bindings.json',import.meta.url),'utf8'));
const defaults=JSON.parse(readFileSync(new URL('../content/site-defaults.json',import.meta.url),'utf8'));
const {document}=parseHTML(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'));
const ids=['lastName','firstName','middleName','birthDate','phone','email','snils','education','snilsFile','educationFile'];
const aliasesFor=node=>{
 const result=[];for(const binding of bindings.filter(b=>!b.source&&b.kind!=='icon'))for(const target of binding.targets){if(target.file!=='index.html'||!target.selector)continue;const nodes=[...document.querySelectorAll(target.selector)].slice(0,target.all?undefined:1);if(nodes.includes(node))result.push({id:binding.id,...target});}return result;
};
const builtins=ids.map(id=>{
 const control=document.querySelector('[name="'+id+'"]'),container=control.closest('.field'),label=container.querySelector('label'),aliases={},controlBindings=[];
 for(const node of [container,...container.querySelectorAll('*')])for(const binding of aliasesFor(node)){
  let role;if(node===label)role='label';else if(node===control&&binding.attribute==='placeholder')role='placeholder';else if(node.matches('option'))role=node.value?'option:'+node.value:'placeholder';else if(node.matches('small,.field-hint'))role='hint';else if(node.matches('strong[data-file-label]'))role='uploadLabel';else if(node.matches('label>span')&&!node.classList.contains('field-hint'))role='marker';
  if(role){aliases[role]=binding.id;controlBindings.push({bindingId:binding.id,role,mode:binding.mode,attribute:binding.attribute??null,childIndex:binding.childIndex??null});}
 }
 const type=control.tagName==='SELECT'?'select':control.getAttribute('type')??'text';
 const rules=['lastName','firstName','middleName'].includes(id)?{format:'name',minLength:0,maxLength:80}:id==='snils'?{format:'snils',minLength:0,maxLength:14}:id==='birthDate'?{min:'1900-01-01',max:null}:type==='select'?{options:[...control.querySelectorAll('option')].filter(n=>n.value).map(n=>({id:n.value,label:n.textContent}))}:type==='file'?{accept:['pdf','jpg','png']}:{};
 return {id,kind:'builtin',type,domId:control.id,name:id,autocomplete:control.getAttribute('autocomplete')??'',inputmode:control.getAttribute('inputmode')??'',aliases,controlBindings,rules,defaultRequired:control.hasAttribute('required'),defaultLabel:label.childNodes[0].textContent.trim(),defaultHint:container.querySelector('small,.field-hint')?.textContent??'',defaultPlaceholder:control.getAttribute('placeholder')??control.querySelector('option[value=""]')?.textContent??'',defaultUploadLabel:container.querySelector('[data-file-label]')?.textContent??'',defaultMarker:label.querySelector('span:not(.field-hint)')?.textContent??'*'};
});
const builtinMap=new Map(builtins.map(f=>[f.id,f]));
export function defaultApplicationForm(){return {version:1,fields:builtins.map(f=>({id:f.id,kind:'builtin',enabled:true,required:f.defaultRequired}))};}
export function formBuiltinMetadata(){return structuredClone(builtins);}
export function formManagedBindingIds(){return new Set(builtins.flatMap(f=>Object.values(f.aliases)));}
const invalid=()=>{throw new HttpError(400,'Некорректная конфигурация формы.','INVALID_CONTENT');};
function exact(value,keys,optional=[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||keys.some(k=>!Object.hasOwn(value,k))||Object.keys(value).some(k=>!keys.includes(k)&&!optional.includes(k)))invalid();}
function text(value,max,min=0){if(typeof value!=='string'||value.length>max||value.trim().length<min||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||/<\/?[a-z][^>]*>/i.test(value))invalid();}
const uuid=prefix=>new RegExp('^'+prefix+'-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
export function validateApplicationForm(form,{forPublication=false}={}){
 exact(form,['version','fields']);if(form.version!==1||!Array.isArray(form.fields)||form.fields.length>FORM_LIMITS.fields)invalid();const seen=new Set();let files=0;
 for(const field of form.fields){
  if(field?.kind==='builtin'){
   exact(field,['id','kind','enabled','required'],['hint']);const meta=builtinMap.get(field.id);if(!meta)invalid();
   if(Object.hasOwn(field,'hint')){if(meta.aliases.hint)invalid();text(field.hint,FORM_LIMITS.hint);}if(field.enabled&&meta.type==='file')files++;
  }else{
   exact(field,['id','kind','type','label','hint','placeholder','enabled','required','rules']);if(field.kind!=='custom'||typeof field.id!=='string'||!uuid('field').test(field.id)||!FIELD_TYPES.includes(field.type))invalid();
   text(field.label,FORM_LIMITS.label,1);text(field.hint,FORM_LIMITS.hint);text(field.placeholder,FORM_LIMITS.placeholder);
   const r=field.rules;
   if(['text','textarea'].includes(field.type)){
    exact(r,['format','minLength','maxLength']);if(!['plain','digits','name','snils'].includes(r.format)||!Number.isInteger(r.minLength)||!Number.isInteger(r.maxLength)||r.minLength<0||r.maxLength<r.minLength||r.maxLength>FORM_LIMITS[field.type])invalid();
    if(r.format==='name'&&r.minLength>80||r.format==='snils'&&(r.minLength>11||r.maxLength<11)||forPublication&&field.enabled&&field.required&&r.maxLength<1)invalid();
   }else if(['date','number'].includes(field.type)){
    exact(r,['min','max']);for(const bound of [r.min,r.max])if(bound!==null&&(field.type==='date'?!validDate(bound):typeof bound!=='number'||!Number.isFinite(bound)||Math.abs(bound)>FORM_LIMITS.number))invalid();if(r.min!==null&&r.max!==null&&r.min>r.max)invalid();
   }else if(['select','radio'].includes(field.type)){
    exact(r,['options']);if(!Array.isArray(r.options)||r.options.length>FORM_LIMITS.options||forPublication&&field.enabled&&!r.options.length)invalid();const options=new Set();for(const o of r.options){exact(o,['id','label']);if(typeof o.id!=='string'||!uuid('option').test(o.id)||options.has(o.id))invalid();options.add(o.id);text(o.label,FORM_LIMITS.optionLabel,1);}
   }else if(field.type==='file'){
    exact(r,['accept']);if(!Array.isArray(r.accept)||!r.accept.length||new Set(r.accept).size!==r.accept.length||r.accept.some(ext=>!['pdf','jpg','png'].includes(ext)))invalid();if(field.enabled)files++;
   }else exact(r,[]);
  }
  if(typeof field.enabled!=='boolean'||typeof field.required!=='boolean'||seen.has(field.id))invalid();seen.add(field.id);
 }
 if(files>FORM_LIMITS.activeFiles)invalid();return structuredClone(form);
}
export function resolveFormFields(content,options={}){
 const applicationForm=validateApplicationForm(content.applicationForm??defaultApplicationForm());
 return resolveFormDefinitions({...content,fields:{...defaults.fields,...content.fields},applicationForm},builtins,options);
}
export function validateFormAliases(content,aliasBaseline){
 // Only the store/read caller supplies this trusted baseline, never request JSON.
 // Unchanged legacy aliases retain their original registry bound; edits use new bounds.
 for(const meta of builtins)for(const [role,id]of Object.entries(meta.aliases)){
  const limit=role==='hint'?FORM_LIMITS.hint:FORM_LIMITS.label;
  text(content.fields[id],aliasBaseline?.fields?.[id]===content.fields[id]?10000:limit);
 }
}
export function formCollectionSignature(content){return formConsentShape(resolveFormFields(content));}

// Dynamic-form errors do not change the fixed legacy CMS message-key registry.
export const FORM_MESSAGES=Object.freeze({fileCount:'В форме слишком много файлов.',unknownFile:'Неизвестный или повторный документ.',fileType:'Формат документа не соответствует полю.',requiredFiles:'Прикрепите обязательные документы.'});
