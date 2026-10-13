import {validateFieldValue,formatFieldValue,FORM_LIMITS} from './application-fields.js?v=20261013-form-builder';
import {legacyFormMessages} from './application-form-messages.js?v=20261013-form-builder';
import {attachMask,formatPhone,formatSnils} from './input-masks.js?v=20261013-form-builder';
export const staleFormMessage='Состав формы изменился. Обновите страницу перед отправкой. Введённые данные остаются в этом окне.';
export function inferFormDefinitions(form){return [...form.querySelectorAll('.field')].map(node=>{const input=node.querySelector('input,select,textarea');if(!input)return null;const id=input.name,type=input.tagName==='SELECT'?'select':input.type||'text';return {id,kind:'builtin',type,domId:input.id,name:id,enabled:true,required:input.required,rules:['lastName','firstName','middleName'].includes(id)?{format:'name',minLength:0,maxLength:80}:id==='snils'?{format:'snils',minLength:0,maxLength:14}:id==='birthDate'?{min:'1900-01-01',max:null}:type==='select'?{options:[...input.querySelectorAll('option')].filter(o=>o.value).map(o=>({id:o.value,label:o.textContent}))}:type==='file'?{accept:['pdf','jpg','png']}:{} };}).filter(Boolean);}
export function applicationDetailFields(application){
 if(application.formSnapshot?.fields&&application.formValues)return application.formSnapshot.fields.map(definition=>[definition.label,formatFieldValue(definition,application.formValues[definition.id])]);
 return [['Дата рождения',application.birthDate?new Date(application.birthDate+'T00:00:00').toLocaleDateString('ru-RU'):'—'],['Телефон',application.phone],['Электронная почта',application.email],['СНИЛС',application.snils],['Образование',application.education==='student'?'Студент 4-го курса и старше':application.education==='professional'?'Среднее профессиональное / высшее':'—']];
}
export function attachApplicationForm(form,{definitions=inferFormDefinitions(form),revision=null,translate=value=>value}={}){
 const removers=[],entries=[],dropErrors=new Map();let stale=false,disposed=false;
 const on=(node,type,handler)=>{node.addEventListener(type,handler);removers.push(()=>node.removeEventListener(type,handler));};
 for(const definition of definitions.filter(f=>f.enabled!==false)){
  const container=[...form.querySelectorAll('.field')].find(n=>n.dataset.fieldId===definition.id)||form.querySelector('[name="'+definition.id+'"]')?.closest('.field');if(!container)continue;
  container.dataset.fieldId=definition.id;const inputs=[...container.querySelectorAll('input,select,textarea')],input=inputs[0];if(!input)continue;
  const error=container.querySelector('.field-error')||container.querySelector('[id$="-error"]');const entry={definition,container,inputs,input,error,baseLabel:container.querySelector('.upload-zone strong')?.textContent};entries.push(entry);
  for(const control of inputs){control.dataset.fieldId=definition.id;control.required=definition.required;if(error){if(!error.id)error.id=(definition.domId??definition.id)+'-error';const ids=new Set((control.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(error.id);control.setAttribute('aria-describedby',[...ids].join(' '));}if(definition.type==='date'){if(definition.rules.min)control.min=definition.rules.min;const max=definition.id==='birthDate'?new Date().toISOString().slice(0,10):definition.rules.max;if(max)control.max=max;}if(definition.rules.format==='digits'||definition.rules.format==='snils')control.inputMode='numeric';}
  if(definition.id==='phone')removers.push(attachMask(input,formatPhone)||(()=>{}));
  if(definition.rules.format==='snils')input.maxLength=14;
  if(definition.rules.format==='snils')removers.push(attachMask(input,formatSnils)||(()=>{}));
  for(const control of inputs){on(control,'blur',()=>{if(control.value||control.getAttribute('aria-invalid')==='true')validate(entry);});on(control,'input',()=>{if(control.getAttribute('aria-invalid')==='true')validate(entry);});on(control,'change',()=>{dropErrors.delete(definition.id);updateFile(entry);validate(entry);});}
  const zone=container.querySelector('.upload-zone');if(zone){for(const type of ['dragenter','dragover'])on(zone,type,event=>{event.preventDefault();zone.classList.add('is-dragover');});for(const type of ['dragleave','drop'])on(zone,type,event=>{event.preventDefault();zone.classList.remove('is-dragover');});on(zone,'drop',event=>{const files=event.dataTransfer?.files;if(!files?.length)return;if(files.length!==1){dropErrors.set(definition.id,'Выберите один файл для этого поля.');validate(entry);return;}input.files=files;dropErrors.delete(definition.id);updateFile(entry);validate(entry);});}
 }
 const consent=form.querySelector('[name="consent"]');if(consent){const entry={definition:{id:'consent',type:'checkbox',required:true,rules:{}},container:consent.closest('.consent-field')??form,inputs:[consent],input:consent,error:form.querySelector('#consent-error')};entries.push(entry);on(consent,'change',()=>validate(entry));}
 function setError(entry,message){message=message?translate(message):'';for(const control of entry.inputs)control.setAttribute('aria-invalid',message?'true':'false');const group=entry.container.querySelector('[role=radiogroup]');if(group){group.setAttribute('aria-invalid',message?'true':'false');if(entry.error){const ids=new Set((group.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(entry.error.id);group.setAttribute('aria-describedby',[...ids].join(' '));}}if(entry.error)entry.error.textContent=message;}
 function updateFile(entry){if(entry.definition.type!=='file')return;const label=entry.container.querySelector('.upload-zone strong'),zone=entry.container.querySelector('.upload-zone'),file=entry.input.files?.[0];if(label)label.textContent=file?.name??entry.baseLabel??legacyFormMessages.upload;zone?.classList.toggle('has-file',Boolean(file));}
 function validate(entry){
  const {definition,input,inputs}=entry;let value=definition.type==='radio'?inputs.find(n=>n.checked)?.value??'':definition.type==='checkbox'?Boolean(input.checked):definition.type==='file'?Boolean(input.files?.length):input.value??'';let result=input.validity?.badInput?{ok:false,message:definition.type==='date'?'Укажите корректную дату.':'Проверьте число.'}:validateFieldValue(definition,value);
  if(definition.id==='consent'&&!value)result={ok:false,message:legacyFormMessages.consent};
  if(definition.type==='file'){
   const file=input.files?.[0],accept=definition.rules.accept??['pdf','jpg','png'],ext=file?.name.split('.').at(-1).toLowerCase(),normalized=ext==='jpeg'?'jpg':ext;
   if(dropErrors.has(definition.id))result={ok:false,message:dropErrors.get(definition.id)};
   else if(input.files?.length>1)result={ok:false,message:'Выберите один файл для этого поля.'};
   else if(file&&file.size>FORM_LIMITS.fileBytes)result={ok:false,message:legacyFormMessages.fileSize};
   else if(file&&(!accept.includes(normalized)||file.type&&file.type!==({pdf:'application/pdf',jpg:'image/jpeg',png:'image/png'}[normalized])))result={ok:false,message:'Выберите файл допустимого формата: '+accept.join(', ').toUpperCase()+'.'};
  }
  if(!result.ok&&definition.kind==='builtin'){
   if(result.message==='Заполните поле.')result.message=definition.id==='education'?legacyFormMessages.educationMissing:legacyFormMessages.required;
   else if(definition.id==='birthDate')result.message=legacyFormMessages.birthDate;
   else if(definition.rules.format==='name')result.message=legacyFormMessages.name;
   else if(definition.id==='email')result.message=legacyFormMessages.email;
   else if(definition.id==='phone')result.message=legacyFormMessages.phone;
   else if(definition.rules.format==='snils'){const digits=String(value).replace(/\D/g,'');result.message=digits.length!==11?legacyFormMessages.snilsLength:/^0+$/.test(digits)?legacyFormMessages.snilsZero:legacyFormMessages.snilsCheck;}
   else if(definition.type==='file'&&result.message==='Прикрепите документ.')result.message=legacyFormMessages.fileMissing;
   else if(definition.type==='file'&&result.message.startsWith('Выберите файл допустимого формата:'))result.message=legacyFormMessages.fileFormat;
  }
  setError(entry,result.ok?'':result.message);return result.ok;
 }
 return {validateAll(){if(disposed||stale)return false;const invalid=entries.filter(entry=>!validate(entry));invalid[0]?.input.focus();return !invalid.length;},clearErrors(){dropErrors.clear();for(const entry of entries){setError(entry,'');if(entry.definition.type==='file'){entry.input.value='';updateFile(entry);entry.container.querySelector('.upload-zone')?.classList.remove('is-dragover');}}},setServerErrors(errors){const invalid=[];for(const entry of entries){const message=errors?.[entry.definition.id];if(typeof message==='string'){setError(entry,message);invalid.push(entry);}}invalid[0]?.input.focus();},updateAvailability(config){if(revision!==null&&config.contentRevision!==undefined&&String(config.contentRevision)!==String(revision))stale=true;return {stale,enabled:Boolean(config.enabled)&&!stale,message:stale?translate(staleFormMessage):''};},get stale(){return stale;},firstInput(){return entries.find(e=>e.definition.id!=='consent')?.input??consent;},dispose(){disposed=true;for(const remove of removers)remove();}};
}
