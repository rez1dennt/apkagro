import {renderMarkdown,safeContentUrl} from './content-format.js?v=20261014-contacts';
import {el,button,dialog} from './admin-content-ui.js?v=20261014-contacts';
export function formatSelection(value,start,end,format,url=''){
 const selected=value.slice(start,end)||'Текст';let text=selected;
 if(format==='bold')text='**'+selected+'**';
 if(format==='italic')text='*'+selected+'*';
 if(format==='heading')text='## '+selected;
 if(format==='paragraph')text='\n\n'+selected+'\n\n';
 if(format==='bullet'||format==='ordered')text=selected.split('\n').map((line,i)=>(format==='bullet'?'- ':(i+1)+'. ')+line).join('\n');
 if(format==='link'){if(!safeContentUrl(url))throw new Error('Укажите безопасный адрес ссылки.');text='['+selected+']('+url+')';}
 return {value:value.slice(0,start)+text+value.slice(end),start,end:start+text.length};
}
export function richText(input){const wrapper=el('div','','cms-rich'),toolbar=el('div','','cms-rich-toolbar'),preview=el('div','','cms-rich-preview');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Форматирование текста');preview.hidden=true;const redraw=()=>preview.innerHTML=renderMarkdown(input.value);input.addEventListener('input',redraw);
 for(const [label,kind] of [['Абзац','paragraph'],['Заголовок','heading'],['Жирный','bold'],['Курсив','italic'],['• Список','bullet'],['1. Список','ordered'],['Ссылка','link']])toolbar.append(button(label,()=>{const start=input.selectionStart,end=input.selectionEnd;const apply=url=>{const result=formatSelection(input.value,start,end,kind,url);input.value=result.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus({preventScroll:true});input.setSelectionRange(result.start,result.end);};if(kind!=='link')return apply();const d=dialog('Вставить ссылку'),label=el('label','Адрес ссылки'),address=el('input'),error=el('p','','cms-error');address.type='text';address.placeholder='https://… или /privacy/';label.append(address);d.body.append(label,error);d.actions.prepend(button('Вставить ссылку',()=>{try{apply(address.value.trim());d.close();}catch(e){error.textContent=e.message;}},'is-primary'));address.focus();}));
 const toggle=button('Показать оформление',()=>{preview.hidden=!preview.hidden;toggle.setAttribute('aria-pressed',String(!preview.hidden));toggle.textContent=preview.hidden?'Показать оформление':'Скрыть оформление';redraw();});toggle.setAttribute('aria-pressed','false');toolbar.append(toggle);wrapper.append(toolbar,input,preview,el('small','Выделите текст и выберите оформление. Можно вставлять обычный текст; HTML не выполняется.','cms-hint'));return wrapper;
}
