import {courses as originalCourses} from './courses.js?v=20261013-custom-icons';
import {CONSENT_VERSION} from './organization.js?v=20261013-custom-icons';
import {lookupMessage} from './content-format.js?v=20261013-custom-icons';
export const siteContent=(()=>{try{return JSON.parse(document.querySelector('#site-content')?.textContent||'null');}catch{return null;}})();
export const courses=siteContent?Object.fromEntries(siteContent.programs.map(p=>[p.id,p])):Object.fromEntries(Object.entries(originalCourses).map(([id,p])=>[id,{...p,id,originalFrame:['flowers','wine','cider'].includes(id),preserveDescription:true,status:'published',modalImage:`/assets/images/${p.image}.webp`,alt:p.title,hours:72,format:'Онлайн',priceText:'Бесплатно',buttonLabel:'Выбрать программу',disclaimer:p.suppliedAnnotation?'':'Учебный план и условия участия можно уточнить у координатора.'}]));
export const consentVersion=siteContent?.intake.consentVersion??CONSENT_VERSION;
export const message=(source,vars)=>lookupMessage(source,siteContent?.messages,siteContent?.messageKeys,vars);
export const canSelect=id=>Boolean(courses[id]&&courses[id].status==='published');

export const previewMessage='Предпросмотр содержимого. Отправка заявок отключена.';
export const closedMessage='Приём заявок ещё не открыт. Пожалуйста, свяжитесь с организатором.';
