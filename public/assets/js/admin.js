import { courses } from './courses.js?v=20261012-course-materials';
import { enhanceStatusSelects, syncStatusSelect, closeStatusSelects } from './status-select.js?v=20261009-controls';
let csrfToken = null, applications = [], currentId = null, opener = null;
let pollTimer = null, loading = false;
let authGeneration = 0;
const pendingRequests = new Set();
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (!document.hidden && !$('#dashboard-screen').hidden && !$('#application-detail').open) loadApplications(true);
  }, 15000);
}
const statuses = { new: 'Новая', review: 'На проверке', accepted: 'Подтверждена', rejected: 'Отклонена' };
const $ = selector => document.querySelector(selector);
enhanceStatusSelects();
const formatDate = value => value ? new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
function showError(selector,message) { const box=$(selector); box.textContent=message; box.hidden=!message; }
function setScreen(authenticated) {
  closeStatusSelects({immediate:true});
  authGeneration++;
  for(const controller of pendingRequests)controller.abort();
  pendingRequests.clear();loading=false;
  $('#login-screen').hidden=authenticated; $('#dashboard-screen').hidden=!authenticated;
  if(authenticated)startPolling();
  else { stopPolling();applications=[]; $('#applications-table-body').replaceChildren(); $('#detail-fields').replaceChildren(); $('#detail-documents').replaceChildren(); }
}
async function api(url, options = {}) {
  const generation=authGeneration,controller=new AbortController();pendingRequests.add(controller);
  try{
    const response = await fetch(url,{credentials:'same-origin',cache:'no-store',...options,signal:controller.signal,headers:{...(options.body instanceof FormData ? {} : options.body ? {'Content-Type':'application/json'} : {}),...(options.method && options.method!=='GET' && csrfToken ? {'X-CSRF-Token':csrfToken} : {}),...options.headers}});
    const result = await response.json().catch(()=>({}));
    if(generation!==authGeneration)throw new DOMException('Устаревший запрос отменён.','AbortError');
    if (!response.ok) { if (response.status===401 && url!=='/api/admin/login') { closeDetail(); csrfToken=null; setScreen(false); showError('#login-error','Сессия завершена. Войдите ещё раз.'); } throw new Error(result.error || 'Не удалось выполнить запрос. Попробуйте ещё раз.'); }
    return result;
  }finally{pendingRequests.delete(controller);}
}
async function preauth() { csrfToken=(await api('/api/csrf')).token; }
async function restoreSession() { try { const session=await api('/api/admin/session'); if(session.authenticated) {csrfToken=session.csrfToken;setScreen(true);await loadApplications();} else await preauth(); } catch(error) {showError('#login-error',error.message);} }
$('#admin-login-form').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('#login-submit');button.disabled=true;button.setAttribute('aria-busy','true');button.querySelector('span').textContent='Проверяем…';showError('#login-error','');
  try {await preauth();const data=new FormData(event.target);const result=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:data.get('username'),password:data.get('password'),otp:data.get('otp')})});csrfToken=result.csrfToken;event.target.reset();setScreen(true);await loadApplications();}
  catch(error){$('#admin-password').value='';$('#admin-otp').value='';showError('#login-error',error.message);}
  finally{button.disabled=false;button.removeAttribute('aria-busy');button.querySelector('span').textContent='Войти в кабинет';}
});
$('#logout-button').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:JSON.stringify({})});csrfToken=null;setScreen(false);await preauth();}catch(error){showError('#dashboard-error',error.message);}});
function textElement(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
function renderApplications(){
  const query=$('#application-search').value.toLocaleLowerCase('ru').trim(),filter=$('#status-filter').value;
  const filtered=applications.filter(a=>(filter==='all'||a.status===filter)&&[a.lastName,a.firstName,a.middleName,a.email,a.phone].join(' ').toLocaleLowerCase('ru').includes(query));
  $('#stat-total').textContent=applications.length;
  for(const status of ['new','review','accepted'])$(`#stat-${status}`).textContent=applications.filter(a=>a.status===status).length;
  $('#applications-table-body').replaceChildren(...filtered.map(a=>{
    const tr=document.createElement('tr'),name=document.createElement('td');name.append(textElement('strong',[a.lastName,a.firstName,a.middleName].filter(Boolean).join(' ')),textElement('small',a.education==='student'?'Студент 4-го курса и старше':'Профессиональное образование'));
    const course=textElement('td',courses[a.courseId]?.title||a.courseId,'course-cell');
    const contact=document.createElement('td');contact.className='contact-cell';for(const [label,href] of [[a.email,'mailto:'+encodeURIComponent(a.email)],[a.phone,'tel:'+String(a.phone).replace(/[^+\d]/g,'')]]){const link=textElement('a',label);link.href=href;contact.append(link);}
    const date=textElement('td',formatDate(a.createdAt));const status=document.createElement('td');status.append(textElement('span',statuses[a.status]||a.status,`status-badge status-badge--${Object.hasOwn(statuses,a.status)?a.status:'new'}`));
    const action=document.createElement('td'),button=textElement('button','Открыть →','table-open');button.type='button';button.dataset.applicationId=a.id;button.addEventListener('click',()=>openDetail(a.id,button));action.append(button);tr.append(name,course,contact,date,status,action);return tr;
  }));
  $('#admin-empty').hidden=Boolean(filtered.length);$('#admin-empty h2').textContent=applications.length?'Ничего не найдено':'Заявок пока нет';$('#admin-empty p').textContent=applications.length?'Измените поиск или выберите другой статус.':'Новые заявки появятся здесь автоматически.';$('#table-caption').textContent=`Показано: ${filtered.length} из ${applications.length}`;
}
async function loadApplications(background=false){
  if(loading||$('#dashboard-screen').hidden)return;
  const generation=authGeneration;
  loading=true;const button=$('#refresh-button');button.disabled=true;
  if(!background)$('#table-caption').textContent='Загружаем заявки…';
  showError('#dashboard-error','');
  try{
    const result=await api('/api/admin/applications'+(background?'?poll=1':''));
    if(generation!==authGeneration||$('#dashboard-screen').hidden)return;
    const next=(result.applications||[]).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    if(!background||JSON.stringify(next)!==JSON.stringify(applications)){
      const focusedId=document.activeElement?.dataset.applicationId;
      const oldIds=new Set(applications.map(a=>a.id)),arrived=next.filter(a=>!oldIds.has(a.id)).length;
      applications=next;renderApplications();
      if(focusedId)[...document.querySelectorAll('.table-open')].find(el=>el.dataset.applicationId===focusedId)?.focus({preventScroll:true});
      $('#admin-live-status').textContent=background&&arrived?'Поступили новые заявки. Список обновлён.':'Список обновляется автоматически каждые 15 секунд.';
    }
  }catch(error){if(error.name!=='AbortError'&&generation===authGeneration)showError($('#dashboard-screen').hidden?'#login-error':'#dashboard-error',error.message);}finally{if(generation===authGeneration){button.disabled=false;loading=false;}}
}
$('#application-search').addEventListener('input',renderApplications);$('#status-filter').addEventListener('change',renderApplications);$('#refresh-button').addEventListener('click',()=>loadApplications());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#dashboard-screen').hidden&&!$('#application-detail').open)loadApplications(true);});
window.addEventListener('pagehide',stopPolling);
window.addEventListener('pageshow',()=>{if(!$('#dashboard-screen').hidden)startPolling();});
$('#export-button').addEventListener('click',async()=>{
  const button=$('#export-button');button.disabled=true;button.setAttribute('aria-busy','true');showError('#dashboard-error','');
  try{const response=await fetch('/api/admin/export',{credentials:'same-origin',cache:'no-store'});if(!response.ok){const result=await response.json().catch(()=>({}));if(response.status===401){setScreen(false);await preauth();}throw new Error(result.error||'Не удалось выгрузить таблицу.');}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Заявки-Кадры-в-АПК-${new Date().toISOString().slice(0,10)}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){showError($('#login-screen').hidden ? '#dashboard-error' : '#login-error',error.message);}finally{button.disabled=false;button.removeAttribute('aria-busy');}
});
function svgIcon(id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('icon');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href',`/assets/icons-v2.svg#${id}`);svg.append(use);return svg;}
async function openDetail(id,button){
  button.disabled=true;showError('#dashboard-error','');
  try{const a=await api('/api/admin/applications/'+encodeURIComponent(id));currentId=id;opener=button;$('#detail-title').textContent=[a.lastName,a.firstName,a.middleName].filter(Boolean).join(' ');$('#detail-reference').textContent=`${a.reference||a.id} · ${formatDate(a.createdAt)}`;
    const fields=[['Программа',courses[a.courseId]?.title||a.courseId],['Дата рождения',a.birthDate?new Date(a.birthDate+'T00:00:00').toLocaleDateString('ru-RU'):'—'],['Телефон',a.phone],['Электронная почта',a.email],['СНИЛС',a.snils],['Образование',a.education==='student'?'Студент 4-го курса и старше':'Среднее профессиональное / высшее'],['Согласие',`Версия ${a.consentVersion||'—'}, ${formatDate(a.consentAt||a.createdAt)}`]];
    $('#detail-fields').replaceChildren(...fields.flatMap(([label,value])=>[textElement('dt',label),textElement('dd',value||'—')]));
    $('#detail-documents').replaceChildren(...(a.documents||[]).map(doc=>{const link=document.createElement('a');link.href='/api/admin/documents/'+encodeURIComponent(doc.id);link.setAttribute('download','');const span=document.createElement('span');span.append(textElement('strong',doc.field==='snilsFile'?'Копия СНИЛС':'Документ об образовании'),textElement('small',`${doc.name} · ${Math.ceil(doc.size/1024)} КБ`));link.append(svgIcon('download'),span);return link;}));
    $('#detail-status').value=a.status;syncStatusSelect($('#detail-status'));showError('#detail-error','');$('#detail-status-message').textContent='';const dialog=$('#application-detail');dialog.classList.remove('is-closing');document.documentElement.classList.add('is-locked');dialog.showModal();
  }catch(error){showError('#dashboard-error',error.message);}finally{button.disabled=false;}
}
function closeDetail(){const dialog=$('#application-detail');if(!dialog.open)return;closeStatusSelects({immediate:true});dialog.close();document.documentElement.classList.remove('is-locked');currentId=null;$('#detail-fields').replaceChildren();$('#detail-documents').replaceChildren();opener?.focus({preventScroll:true});}
$('#close-detail').addEventListener('click',closeDetail);$('#application-detail').addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
$('#application-detail').addEventListener('click',event=>{const dialog=event.currentTarget;if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDetail();});
$('#status-form').addEventListener('submit',async event=>{event.preventDefault();if(!currentId)return;const button=$('#save-status');button.disabled=true;showError('#detail-error','');try{await api('/api/admin/applications/'+encodeURIComponent(currentId),{method:'PATCH',body:JSON.stringify({status:$('#detail-status').value})});$('#detail-status-message').textContent='Статус сохранён.';await loadApplications();}catch(error){showError('#detail-error',error.message);}finally{button.disabled=false;}});
restoreSession();
