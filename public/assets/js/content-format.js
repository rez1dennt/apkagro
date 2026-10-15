// Pure shared formatting used by SSR, the public dialogs and editor previews.
import {contentFieldContract} from './content-field-contract.js?v=20261016-education-files';
export function renderContentField(value, path) {
  return contentFieldContract(path).format === 'markdown' ? renderMarkdown(value) : escapeHtml(value);
}
// System copy for authenticated unfinished drafts; never part of the public message schema.
export const previewPhotoPlaceholder = 'Фото не добавлено';
export function formatHours(hours) {
  const lastTwo = hours % 100, last = hours % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? 'часов' : last === 1 ? 'час' : last >= 2 && last <= 4 ? 'часа' : 'часов';
  return `${hours} ${noun}`;
}

// Change only caption text; trusted SVG children retain their edited icon choices.
export function replaceCaption(node, text) {
  if (!node) return;
  const captions = [...node.childNodes].filter(child => child.nodeType === 3);
  if (captions.length) {
    captions[0].textContent = text + (node.querySelector('svg,.content-icon') ? ' ' : '');
    captions.slice(1).forEach(child => child.remove());
  } else node.prepend(node.ownerDocument.createTextNode(text + ' '));
}
export const refreshRequiredMessage='Обновите страницу и повторите отправку.';
export const previewSubmissionMessage='Предпросмотр содержимого. Отправка заявок отключена.';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeContentUrl(value) {
  if (typeof value !== 'string' || /[\s<>"'\\\x00-\x1f]/.test(value)) return false;
  let decoded=value;try { for(let i=0;i<4;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;} } catch { return false; }
  if (/[\\\x00-\x1f]/.test(decoded) || decoded.split(/[/?#]/).some(x=>x==='.'||x==='..')) return false;
  if (/^\/(?!\/)/.test(value) || /^#[a-zA-Z][\w-]*$/.test(value)) return !decoded.startsWith('//');
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value) || /^tel:\+?[\d()-]+$/.test(value)) return true;
  try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password; } catch { return false; }
}
function inline(text, depth=0) {
  if(depth>5)return escapeHtml(text);
  const tokens=/\\([\\`*_{}\[\]()#+.!>-])|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;
  let result='',start=0;for(const m of text.matchAll(tokens)){result+=escapeHtml(text.slice(start,m.index));
    if(m[1])result+=escapeHtml(m[1]);
    else if(m[2])result+=safeContentUrl(m[3])?`<a href="${escapeHtml(m[3])}">${inline(m[2],depth+1)}</a>`:escapeHtml(m[0]);
    else if(m[4]||m[5])result+=`<strong>${inline(m[4]||m[5],depth+1)}</strong>`;
    else result+=`<em>${inline(m[6]||m[7],depth+1)}</em>`;start=m.index+m[0].length;
  }return result+escapeHtml(text.slice(start));
}
export function renderMarkdown(value) {
  const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');let out='',paragraph=[],items=[],list='';
  const flushP=()=>{if(paragraph.length){out+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}};
  const flushL=()=>{if(items.length){out+=`<${list}>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</${list}>`;items=[];list='';}};
  for(const line of lines){const heading=line.match(/^ {0,3}(#{1,6})\s+(.+)$/),item=line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
    if(!line.trim()){flushP();flushL();}else if(heading){flushP();flushL();const n=Math.max(2,heading[1].length);out+=`<h${n}>${inline(heading[2])}</h${n}>`;}
    else if(item){flushP();const type=item[1]?'ul':'ol';if(list&&list!==type)flushL();list=type;items.push(item[2]);}else{flushL();paragraph.push(line.trim());}
  }flushP();flushL();return out;
}
export function replaceLiterals(text, replacements) {
  const pairs=[...new Map(replacements.filter(([from])=>from)).entries()].sort((a,b)=>b[0].length-a[0].length);
  if(!pairs.length)return String(text);const map=new Map(pairs),pattern=new RegExp(pairs.map(([s])=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
  return String(text).replace(pattern,source=>map.get(source));
}
export function lookupMessage(source, messages={}, keys={}, variables={}) {
  const text=messages[keys[source]]??source;return text.replace(/\{([a-zA-Z]+)\}/g,(full,key)=>Object.hasOwn(variables,key)?String(variables[key]):full);
}
