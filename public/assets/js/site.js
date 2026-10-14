import {initResponsiveContent} from './content-responsive.js?v=20261014-contacts';
import './cookie-notice.js?v=20261014-contacts';
import {courses,siteContent,consentVersion,message as translate,canSelect,previewMessage,closedMessage} from './site-content.js?v=20261014-contacts';
import {formatHours,replaceCaption,previewPhotoPlaceholder,renderContentField} from './content-format.js?v=20261014-contacts';
import { savedApplication } from './form-logic.js?v=20261014-contacts';
import {attachApplicationForm,staleFormMessage} from './application-form.js?v=20261014-contacts';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const delay = () => motion.matches ? 0 : 220;
const locks = new Set();
function lockScroll(owner) { locks.add(owner); document.documentElement.classList.add('is-locked'); }
function unlockScroll(owner) { locks.delete(owner); if (!locks.size) document.documentElement.classList.remove('is-locked'); }
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#mobile-menu');
let menuOpen = false;
let menuTimer;
function setMenu(open) {
  if (!menu || !menuButton) return;
  clearTimeout(menuTimer); menuOpen = open;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', translate(open ? 'Закрыть меню' : 'Открыть меню'));
  menu.classList.toggle('is-open', open); menu.inert = !open;
  document.querySelector('main').inert = open; document.querySelector('footer').inert = open;
  if (open) { lockScroll('menu'); menu.querySelector('a')?.focus({ preventScroll: true }); }
  else { menuTimer = setTimeout(() => unlockScroll('menu'), delay()); menuButton.focus({ preventScroll: true }); }
}
menuButton?.addEventListener('click', () => setMenu(!menuOpen));
menu?.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  event.preventDefault(); setMenu(false);
  setTimeout(() => document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth' }), delay() + 10);
});
document.addEventListener('keydown', event => {
  if (!menuOpen) return;
  if (event.key === 'Escape') setMenu(false);
  if (event.key === 'Tab') {
    const elements = [menuButton, ...menu.querySelectorAll('a')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
initResponsiveContent({onHeaderModeChange: compact => { if (!compact && menuOpen) setMenu(false); }});

const dialogOpeners = new WeakMap();
function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  dialogOpeners.set(dialog, opener || document.activeElement);
  dialog.classList.remove('is-closing'); lockScroll(dialog.id); dialog.showModal();
}
function closeDialog(dialog, returnFocus = true) {
  if (!dialog?.open || dialog.classList.contains('is-closing')) return;
  dialog.classList.add('is-closing');
  setTimeout(() => {
    dialog.close(); dialog.classList.remove('is-closing'); unlockScroll(dialog.id);
    if (returnFocus) dialogOpeners.get(dialog)?.focus({ preventScroll: true });
  }, delay());
}
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('.dialog-close,.dialog-dismiss').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog);
  });
});
document.querySelectorAll('.accordion details').forEach(details => {
  const summary = details.querySelector('summary'), content = details.querySelector('.accordion__content');
  let animation, targetOpen = details.open;
  summary.addEventListener('click', event => {
    event.preventDefault(); targetOpen = !targetOpen;
    const wasOpen = details.open, currentHeight = wasOpen ? content.getBoundingClientRect().height : 0;
    animation?.cancel();
    summary.setAttribute('aria-expanded', String(targetOpen));
    details.classList.toggle('is-closing', !targetOpen);
    if (motion.matches) { details.open = targetOpen; details.classList.remove('is-closing'); return; }
    details.open = true;
    const fullHeight = content.getBoundingClientRect().height;
    animation = content.animate([
      { height: `${currentHeight}px`, paddingBottom: wasOpen ? '17px' : '0px', opacity: wasOpen ? 1 : 0 },
      { height: `${targetOpen ? fullHeight : 0}px`, paddingBottom: targetOpen ? '17px' : '0px', opacity: targetOpen ? 1 : 0 }
    ], { duration: delay(), easing: 'cubic-bezier(.22,.61,.36,1)' });
    animation.onfinish = () => { details.open = targetOpen; details.classList.remove('is-closing'); animation = null; };
  });
});

const courseDialog = document.querySelector('#course-dialog');
let displayedCourse, selectedCourseId;
document.addEventListener('click', event => {
  const button=event.target.closest('.program-card[data-course]');if(!button)return;
  const id = button.dataset.course, course = courses[id]; if (!course || !courseDialog) return;
  displayedCourse = id;
  courseDialog.dataset.course = id;courseDialog.dataset.originalFrame=String(Boolean(course.originalFrame));
  document.querySelector('#dialog-title').textContent = course.title;
  let description=document.querySelector('#dialog-description');
  if(description.tagName==='P'){
    const block=document.createElement('div');block.id=description.id;
    description.replaceWith(block);description=block;
  }
  if(course.preserveDescription)description.textContent=course.description;
  else description.innerHTML=renderContentField(course.description,'programs.'+id+'.description');
  const image = document.querySelector('#dialog-image');
  let placeholder = courseDialog.querySelector('.cms-photo-placeholder');
  if (siteContent?.preview && !course.modalImage) {
    image.hidden = true; image.removeAttribute('src');
    if (!placeholder) { placeholder = document.createElement('p'); placeholder.className = 'cms-photo-placeholder'; image.after(placeholder); }
    placeholder.textContent = previewPhotoPlaceholder;
  } else {
    placeholder?.remove(); image.hidden = false; image.src = course.modalImage; image.alt = course.alt;
  }
  const topics = document.querySelector('#dialog-topics');
  topics.replaceChildren(...course.topics.map(topic => { const item = document.createElement('li'); item.textContent = topic; return item; }));
  topics.hidden = course.topics.length === 0;
  document.querySelector('#dialog-topics-heading').hidden = topics.hidden;
  let disclaimer=document.querySelector('.course-dialog__disclaimer');
  if(disclaimer.tagName==='P'){
    const block=document.createElement('div');
    for(const attribute of disclaimer.attributes)block.setAttribute(attribute.name,attribute.value);
    disclaimer.replaceWith(block);disclaimer=block;
  }
  disclaimer.innerHTML=renderContentField(course.disclaimer,course.disclaimerPlain?'fields.other.text-a94ec463c8ec':'programs.'+id+'.disclaimer');
  disclaimer.hidden=!course.disclaimer||course.hideDefaultDisclaimer;
  document.querySelectorAll('.course-meta > span').forEach((node,i)=>replaceCaption(node,[course.hoursLabel ?? formatHours(course.hours),course.format,course.priceText][i]));
  const choose=document.querySelector('#choose-course');replaceCaption(choose,course.status==='closed'?translate(closedMessage):course.buttonLabel);choose.disabled=!canSelect(id)||!document.querySelector('#application');
  openDialog(courseDialog, button);
});
function selectCourse(id) {
  if (!canSelect(id)||!document.querySelector('#course-id')) return;
  selectedCourseId = id;
  document.querySelector('#course-id').value = id;
  document.querySelector('#selected-course-label').textContent = courses[id].title;
  document.querySelector('#change-course').textContent = translate('Изменить');
  document.querySelectorAll('.program-card[data-course]').forEach(button => {
    const selected = button.dataset.course === id; button.classList.toggle('is-selected', selected);
    button.querySelector('.program-card__badge').hidden = !selected;
  });
}
document.querySelector('#choose-course')?.addEventListener('click', () => {
  if(!canSelect(displayedCourse))return;selectCourse(displayedCourse); closeDialog(courseDialog, false);
  setTimeout(() => {
    document.querySelector('#application').scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth' });
    formWidget?.firstInput()?.focus({ preventScroll: true });
  }, delay() + 10);
});
document.querySelector('#change-course')?.addEventListener('click', () => {
  document.querySelector('#programs')?.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth' });
  document.querySelector('[data-course]')?.focus({ preventScroll: true });
});

const form = document.querySelector('#application-form');
if (form) form.elements.consentVersion.value = consentVersion;
const formWidget=form?attachApplicationForm(form,{definitions:siteContent?.applicationForm?.fields,revision:siteContent?.revision??form.querySelector('[name=contentRevision]')?.value??null,translate}):null;
let csrfToken = null;
let config = { enabled: false };
async function refreshConfig() {
  if(siteContent?.preview){config={enabled:false};if(form)showStatus(previewMessage);return;}
  try {
    const response = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) {config = await response.json();const availability=formWidget?.updateAvailability(config);if(availability?.stale){showStatus(staleFormMessage,true);return;}}
    if (!config.enabled && form) showStatus('Приём заявок пока закрыт. Данные и документы не отправляются. Вопросы: apk@vozrojdenie-agro.ru.');
  } catch { if (form) showStatus('Нет соединения с сервером. Отправка заявки будет доступна после подключения.'); }
}
if (form) refreshConfig();
function showStatus(message, error = false) {
  const status = document.querySelector('#form-status'); if (!status) return;
  status.hidden = false; status.textContent = translate(message); status.classList.toggle('is-error', error);
}
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if(formWidget.stale){showStatus(staleFormMessage,true);return;}
  if (!config.enabled) { showStatus('Приём заявок ещё не подключён. Ваши данные и документы не отправлены. Свяжитесь с координатором: apk@vozrojdenie-agro.ru.'); return; }
  if (!canSelect(form.elements.courseId.value)) { showStatus('Сначала выберите программу обучения.',true); document.querySelector('#change-course').focus(); return; }
  if (!formWidget.validateAll()) { showStatus('Проверьте отмеченные поля формы.',true); return; }
  const button = document.querySelector('#submit-application'); button.disabled = true; button.setAttribute('aria-busy','true'); button.querySelector('span').textContent = translate('Отправляем…');
  try {
    const csrfResponse = await fetch('/api/csrf',{ credentials:'same-origin',cache:'no-store' });
    if (!csrfResponse.ok) throw new Error('Не удалось установить защищённое соединение. Попробуйте ещё раз.');
    csrfToken = (await csrfResponse.json()).token;
    const response = await fetch('/api/applications',{method:'POST',body:new FormData(form),credentials:'same-origin',headers:{'X-CSRF-Token':csrfToken}});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {formWidget.setServerErrors(result.fieldErrors??result.fields);if(result.code==='CONTENT_CHANGED'){formWidget.updateAvailability({contentRevision:'changed'});throw new Error(staleFormMessage);}throw new Error(result.error || 'Не удалось отправить заявку. Попробуйте ещё раз.');}
    if (!savedApplication(response.status, result)) throw new Error('Сервер не подтвердил сохранение заявки. Перед повторной отправкой свяжитесь с координатором.');
    form.hidden = true; const success = document.querySelector('#application-success'); success.hidden = false;
    document.querySelector('#success-reference').textContent = translate('Номер заявки: {reference}',{reference:result.reference});
    success.tabIndex = -1; success.focus({preventScroll:true}); success.scrollIntoView({behavior:motion.matches ? 'instant' : 'smooth',block:'center'});
  } catch (error) { showStatus(error.message || 'Проверьте соединение и попробуйте снова.',true); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); button.querySelector('span').textContent = translate('Отправить заявку'); }
});
document.querySelector('#new-application')?.addEventListener('click', () => {
  form.reset(); form.hidden = false; document.querySelector('#application-success').hidden = true;
  formWidget.clearErrors();
  const status = document.querySelector('#form-status'); status.hidden = true; status.textContent = ''; status.classList.remove('is-error');
  if (selectedCourseId) selectCourse(selectedCourseId);
  formWidget.firstInput()?.focus({preventScroll:true}); refreshConfig();
});
