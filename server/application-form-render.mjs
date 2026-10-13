import {resolveFormFields,defaultApplicationForm} from './application-form.mjs';

export function renderApplicationForm({document:d,content,preview=false}){
 const form=d.querySelector('#application-form');if(!form)return;
 const fields=resolveFormFields(content),grids=[...form.querySelectorAll('.form-grid')],original=new Map();
 for(const field of defaultApplicationForm().fields){const node=form.querySelector('[name="'+field.id+'"]')?.closest('.field');if(node)original.set(field.id,node);}
 const make=(tag,cls,text)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const modelUpload=original.get('snilsFile')?.cloneNode(true);
 const isOriginal=fields.length===10&&fields.every((f,i)=>f.id===defaultApplicationForm().fields[i].id);
 if(!isOriginal){for(const n of original.values())n.remove();grids[0]?.classList.remove('form-grid--three');grids[0]?.classList.add('form-grid--two','form-grid--custom');}
 for(const definition of fields){
  const {id,type,required}=definition,domId=definition.domId??id;let node=original.get(id),control;
  if(node){
   control=node.querySelector('[name="'+id+'"]');
   const label=node.querySelector('label'),optionalHint=label?.querySelector('.field-hint');
   if(id==='middleName'&&required&&optionalHint?.textContent.trim()==='(если есть)')optionalHint.remove();
   const marker=label?.querySelector('span:not(.field-hint)');
   if(required&&!marker){label.append(d.createTextNode(' '),make('span','',definition.marker??'*'));}else if(!required&&marker)marker.remove();
  }else{
   node=type==='file'&&modelUpload?modelUpload.cloneNode(true):make('div','field');
   if(type==='file'&&modelUpload){
    const label=node.querySelector('label');label.replaceChildren(d.createTextNode(definition.label));if(type!=='radio')label.setAttribute('for',domId);
    const zone=node.querySelector('.upload-zone');zone.setAttribute('for',domId);
    const strong=node.querySelector('strong');strong.textContent='Выберите файл или перетащите';strong.dataset.fileLabel=domId;
    node.querySelector('small').textContent=definition.hint||'PDF, JPG, PNG до 10 МБ';control=node.querySelector('input');node.querySelector('.field-error').id=domId+'-error';
   }else{
    const label=make('label','',definition.label);if(type!=='radio')label.setAttribute('for',domId);node.append(label);
    if(type==='radio'){
     control=make('div','field-options');control.id=domId;control.setAttribute('role','radiogroup');label.id=domId+'-label';control.setAttribute('aria-labelledby',label.id);
     for(const option of definition.rules.options){const row=make('label','checkbox-label'),input=make('input');input.type='radio';input.name=id;input.id=id+'-'+option.id;input.value=option.id;if(required)input.setAttribute('required','');row.append(input,make('span','',option.label));control.append(row);}
    }else{
     control=make(type==='textarea'?'textarea':type==='select'?'select':'input');
     if(type==='select'){const empty=make('option','',definition.placeholder||'Выберите из списка');empty.value='';control.append(empty);for(const option of definition.rules.options){const o=make('option','',option.label);o.value=option.id;control.append(o);}}
     else if(type!=='textarea')control.type=['text','email','tel','date','number','checkbox'].includes(type)?type:'text';
     if(type==='checkbox'){control.value='true';label.classList.add('checkbox-label');label.prepend(control);}else node.append(control);
    }
    if(type==='radio')node.append(control);
    if(definition.hint){const hint=make('small','field-hint',definition.hint);hint.id=domId+'-hint';node.append(hint);control.setAttribute('aria-describedby',hint.id);}
    node.append(make('span','field-error'));node.querySelector('.field-error').id=domId+'-error';
   }
   if(required)node.querySelector('label').append(d.createTextNode(' '),make('span','','*'));
  }
  node.dataset.fieldId=id;control.id=domId;
  if(type!=='radio'){control.name=id;if(required)control.setAttribute('required','');else control.removeAttribute('required');}
  control.dataset.fieldId=id;
  if(definition.kind==='builtin'&&definition.hint&&!node.querySelector('small,.field-hint')){const hint=make('small','field-hint',definition.hint);hint.id=domId+'-hint';node.append(hint);control.setAttribute('aria-describedby',hint.id);}
  if(type==='file')control.setAttribute('accept',definition.rules.accept.flatMap(ext=>ext==='jpg'?['.jpg','.jpeg']:['.'+ext]).join(','));
  else if(!['select','radio','checkbox'].includes(type)&&definition.placeholder)control.setAttribute('placeholder',definition.placeholder);
  if(definition.rules.maxLength!==undefined)control.setAttribute('maxlength',definition.rules.maxLength);
  if(definition.rules.minLength)control.setAttribute('minlength',definition.rules.minLength);
  if(['date','number'].includes(type))for(const bound of ['min','max']){const value=definition.rules[bound];if(value!==null&&value!==undefined)control.setAttribute(bound,value);}
  if(type==='number')control.setAttribute('step','any');
  if(!isOriginal)(grids[0]??form).append(node);
 }
 // Field aliases are already applied by content-render before this function.
 // Ownership also tells the editor/hydrator never to reapply positional bindings.
 form.dataset.formVersion='1';if(preview)form.dataset.formPreview='true';
}
