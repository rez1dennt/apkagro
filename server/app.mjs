import http from 'node:http';
import {isIP} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,realpath,stat,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {createApplicationsWorkbook} from './export.mjs';
import {loadAdmin,passwordHash,decrypt,saveAdmin,verifyTotp,token,hash,safeEqual} from './security.mjs';
import {openStore} from './storage.mjs';
import {HttpError,parseMultipart,validateFields,createScannerGuard} from './intake.mjs';
import {openContentStore} from './content-store.mjs';
import {openContentMedia} from './content-media.mjs';
import {handleContentRoute} from './content-routes.mjs';
import {loadDefaultContent} from './content-schema.mjs';
import {previewSubmissionMessage} from '../public/assets/js/content-format.js';
import {renderContentPage,renderContentCss,contentCssFiles,contentPrograms,contentIntakeEnabled,applicationSnapshots,contentMessage} from './content-render.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.json':'application/json'};
function clientAddress(req, production, trustedProxy) {
 if (!production) return req.socket.remoteAddress ?? 'unknown';
 const invalid = () => new HttpError(400, 'Некорректные данные доверенного прокси.', 'PROXY_CLIENT_IP');
 if (req.socket.remoteAddress !== trustedProxy) throw invalid();
 // Node keeps each received header separately here, so duplicate headers fail closed.
 const values = req.headersDistinct['x-real-ip'];
 if (!values || values.length !== 1) throw invalid();
 const address = values[0];
 const family = typeof address === 'string' && address.length <= 45 && !address.includes('%') ? isIP(address) : 0;
 if (!family) throw invalid();
 if (family === 4) return address;
 const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
 // Require ordinary IPv4 or IPv6, excluding mapped addresses and zone identifiers.
 if (canonical.startsWith('::ffff:')) throw invalid();
 return canonical;
}
export async function createApp(options={}){
 const {production=false,key=null,intakeEnabled=false,scannerCommand='',legalsReady=false,trustedProxy='',testDynamicOrigin=false}=options;
 const dataDir=path.resolve(options.dataDir??path.join(root,'data')),publicDir=path.resolve(options.publicDir??path.join(root,'public'));
 let origin=options.origin??'http://127.0.0.1:3000';const parsed=new URL(origin);
 if(parsed.origin!==origin||parsed.username||parsed.password)throw new Error('APP_ORIGIN must contain exact origin without path');
 if(key&&key.length!==32)throw new Error('Encryption key must contain 32 bytes');
 if(production&&(!key||parsed.protocol!=='https:'||!legalsReady||!scannerCommand||!['127.0.0.1','::1'].includes(trustedProxy)))throw new Error('Production requires key, HTTPS origin, loopback trusted TLS proxy, scanner and legals readiness');
 if(scannerCommand){if(!path.isAbsolute(scannerCommand))throw new Error('Scanner must be an absolute executable path');await access(scannerCommand);}
 let admin=await loadAdmin(dataDir,key);if(production&&!admin)throw new Error('Configure administrator before production startup');
 const store=key?await openStore(dataDir,key):null;const enabled=Boolean(intakeEnabled&&key&&admin&&(!production||(scannerCommand&&legalsReady)));
 const scanner=createScannerGuard();let contentServices=null,contentPromise=null,closing=false,appClosePromise=null;
 async function getContentServices(){
  if(closing)throw new HttpError(503,'Хранилище содержимого закрыто.','CONTENT_STORE_CLOSED');
  if(contentServices)return contentServices;if(contentPromise)return contentPromise;
  if(!key||!admin)return null;
  contentPromise=(async()=>{const contentStore=options.contentStore??await openContentStore({dir:path.join(dataDir,'content')});try{const media=options.contentMedia??await openContentMedia({dir:path.join(dataDir,'content','media'),store:contentStore,scannerCommand,scanner,publicDir});return contentServices={store:contentStore,media};}catch(e){if(!options.contentStore)await contentStore.close();throw e;}})();
  try{return await contentPromise;}finally{contentPromise=null;}
 }
 const initialContent=await loadDefaultContent(),renderCache=new Map();
 const published=async()=>{const services=await getContentServices();return services?services.store.getPublished():{revision:1,content:initialContent};};
 const cache=(key,build)=>{if(renderCache.has(key))return renderCache.get(key);if(renderCache.size>=64)renderCache.clear();const result=build();renderCache.set(key,result);return result;};
 const historicalTitle=application=>application.courseSnapshot?.title??initialContent.programs.find(p=>p.id===application.courseId)?.title??application.courseId;
 const sessions=new Map(),preauth=new Map(),rates=new Map();let loginBusy=0,uploadBusy=0;
 function cleanup(){const now=Date.now();for(const [id,s]of sessions)if(now-s.seen>30*60*1000||now-s.created>8*60*60*1000)sessions.delete(id);for(const [id,p]of preauth)if(now>p.expires)preauth.delete(id);for(const [id,r]of rates)if(now>r.until)rates.delete(id);}
 const timer=setInterval(cleanup,60000);timer.unref();
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production?'; Secure':''}`;
 const cookies=req=>Object.fromEntries((req.headers.cookie??'').split(';').map(c=>c.trim().split('=')).filter(p=>p.length===2));
 const session=(req,touch=true)=>{cleanup();const s=sessions.get(hash(cookies(req).admin_session??''));if(s&&touch)s.seen=Date.now();return s;};
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 function rate(id,max,window){cleanup();if(!rates.has(id)){if(rates.size>10000)throw new HttpError(429,'Слишком много запросов. Попробуйте позже.','RATE_LIMIT');rates.set(id,{count:0,until:Date.now()+window});}const r=rates.get(id);if(++r.count>max)throw new HttpError(429,'Слишком много попыток. Попробуйте через несколько минут.','RATE_LIMIT');}
 function checkOrigin(req){if(req.headers.origin!==origin||['cross-site','same-site'].includes(req.headers['sec-fetch-site']))throw new HttpError(403,'Обновите страницу и повторите отправку.','CSRF');}
 function checkCsrf(req,s,fieldToken){const provided=req.headers['x-csrf-token']??fieldToken;const auth=s??preauth.get(hash(cookies(req).csrf_session??''));if(!auth||!provided||!safeEqual(auth.csrf,provided)||(auth.expires&&Date.now()>auth.expires))throw new HttpError(403,'Обновите страницу и повторите отправку.','CSRF');}
 async function readJson(req){if(!(req.headers['content-type']??'').startsWith('application/json'))throw new HttpError(400,'Некорректный формат запроса.');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw new HttpError(413,'Запрос слишком большой.');chunks.push(chunk);}try{const data=JSON.parse(Buffer.concat(chunks).toString());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}catch{throw new HttpError(400,'Не удалось прочитать запрос.');}}
 async function route(req,res){
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('X-Frame-Options','DENY');
  if(testDynamicOrigin)origin=`http://127.0.0.1:${server.address().port}`;
  if(production){res.setHeader('Strict-Transport-Security','max-age=31536000');if(req.socket.remoteAddress!==trustedProxy||req.headers['x-forwarded-proto']!=='https')throw new HttpError(400,'Требуется защищённое соединение.','HTTPS_REQUIRED');}
  const currentHost=req.headers.host;if(currentHost!==new URL(origin).host)throw new HttpError(400,'Некорректный адрес запроса.');
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,origin).pathname);}catch{throw new HttpError(400,'Некорректный адрес запроса.');}
  const ip=clientAddress(req,production,trustedProxy);
  const backgroundPoll=req.method==='GET'&&pathname==='/api/admin/applications'&&new URL(req.url,origin).searchParams.get('poll')==='1';
  const s=session(req,!backgroundPoll);const isAdmin=pathname.startsWith('/api/admin/');
  if(pathname.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
   if(req.method==='GET'&&pathname==='/api/config'){const {content,revision}=await published();return json(res,200,{enabled:enabled&&contentIntakeEnabled(content),consentVersion:content.settings.intake.consentVersion,contentRevision:revision});}
  if(req.method==='GET'&&pathname==='/api/csrf'){
   rate('csrf:'+ip,120,60000);if(s)return json(res,200,{token:s.csrf});cleanup();const existing=preauth.get(hash(cookies(req).csrf_session??''));if(existing)return json(res,200,{token:existing.csrf});if(preauth.size>=5000)throw new HttpError(429,'Слишком много запросов.');const id=token(),csrf=token();preauth.set(hash(id),{csrf,expires:Date.now()+30*60*1000});res.setHeader('Set-Cookie',cookie('csrf_session',id,1800));return json(res,200,{token:csrf});
  }
  if(req.method==='GET'&&pathname==='/api/admin/session')return json(res,200,{authenticated:Boolean(s),csrfToken:s?.csrf??null});
  if(req.method==='POST'&&pathname==='/api/admin/login'){
   checkOrigin(req);checkCsrf(req,s);rate('login-ip:'+ip,10,15*60*1000);const body=await readJson(req);const username=String(body.username??'').slice(0,128);rate('login-user:'+hash(username),10,15*60*1000);
   // One scrypt verification at a time bounds RAM and serializes the durable TOTP counter update.
   if(loginBusy>=1)throw new HttpError(429,'Слишком много попыток. Попробуйте позже.','RATE_LIMIT');loginBusy++;
   try{const password=typeof body.password==='string'?body.password:'';const bounded=password.length<=128?password:'';const digest=await passwordHash(bounded,admin?.salt??Buffer.alloc(32).toString('base64'));const correct=admin&&safeEqual(username,admin.username)&&safeEqual(digest.toString('base64'),admin.passwordDigest);const counter=correct?verifyTotp(decrypt(Buffer.from(admin.totp,'base64'),key,'admin-totp:'+admin.username),body.otp,admin.lastCounter):-1;
    if(!correct||counter<0){store?.audit('login.failed');throw new HttpError(401,'Не удалось войти. Проверьте логин, пароль и одноразовый код.','LOGIN_FAILED');}
    // Recheck after asynchronous scrypt: a concurrent request cannot reuse the same step.
    if(counter<=admin.lastCounter)throw new HttpError(401,'Не удалось войти. Проверьте логин, пароль и одноразовый код.','LOGIN_FAILED');admin.lastCounter=counter;await saveAdmin(dataDir,admin);sessions.delete(hash(cookies(req).admin_session??''));preauth.delete(hash(cookies(req).csrf_session??''));const id=token(),csrf=token();sessions.set(hash(id),{csrf,created:Date.now(),seen:Date.now()});res.setHeader('Set-Cookie',[cookie('admin_session',id,8*3600),cookie('csrf_session','',0)]);store.audit('login.success');return json(res,200,{authenticated:true,csrfToken:csrf});
   }finally{loginBusy--;}
  }
  if(req.method==='POST'&&pathname==='/api/preview-applications')throw new HttpError(403,previewSubmissionMessage,'PREVIEW_INTAKE_DISABLED');
  if(req.method==='POST'&&pathname==='/api/applications'){
   const current=await published();if(!enabled||!contentIntakeEnabled(current.content))throw new HttpError(503,contentMessage(current.content,'Приём заявок ещё не открыт. Пожалуйста, свяжитесь с организатором.'),'INTAKE_DISABLED');checkOrigin(req);if(req.headers['x-csrf-token'])checkCsrf(req,s);else if(!preauth.has(hash(cookies(req).csrf_session??''))&&!s)checkCsrf(req,s);rate('intake:'+ip,10,60*60*1000);
   if(uploadBusy>=2)throw new HttpError(429,'Сервис занят. Повторите отправку немного позже.','RATE_LIMIT');uploadBusy++;try{const {fields,files}=await parseMultipart(req);checkCsrf(req,s,fields._csrf);let accepted=await published();let validated=validateFields(fields,{programs:contentPrograms(accepted.content),consentVersion:accepted.content.settings.intake.consentVersion,contentRevision:accepted.revision});if(scannerCommand){await scanner.scan(scannerCommand,Buffer.from(JSON.stringify(validated)));for(const file of files)await scanner.scan(scannerCommand,file.data);}const id=await (await getContentServices()).media.withMutation(async()=>{accepted=await published();if(!contentIntakeEnabled(accepted.content))throw new HttpError(503,contentMessage(accepted.content,'Приём заявок ещё не открыт. Пожалуйста, свяжитесь с организатором.'),'INTAKE_DISABLED');validated=validateFields(fields,{programs:contentPrograms(accepted.content),consentVersion:accepted.content.settings.intake.consentVersion,contentRevision:accepted.revision});return await store.save({...validated,...applicationSnapshots(accepted.content,validated.courseId,{revision:accepted.revision})},files);});return json(res,201,{id,reference:id,message:contentMessage(accepted.content,'Заявка получена. Организатор свяжется с вами.')});}finally{uploadBusy--;}
  }
  if(isAdmin){
   if(!s)throw new HttpError(401,'Войдите в кабинет администратора.','AUTH_REQUIRED');if(!['GET','HEAD'].includes(req.method)){checkOrigin(req);checkCsrf(req,s);}
   if(await handleContentRoute({req,res,pathname,session:s,origin:checkOrigin,csrf:checkCsrf,getServices:getContentServices,json,rate}))return;
   if(req.method==='POST'&&pathname==='/api/admin/logout'){sessions.delete(hash(cookies(req).admin_session??''));res.setHeader('Set-Cookie',cookie('admin_session','',0));store?.audit('logout');return json(res,200,{authenticated:false});}
   if(req.method==='GET'&&pathname==='/api/admin/applications'){const applications=store.list().map(app=>Object.fromEntries(['id','createdAt','courseId','lastName','firstName','middleName','email','phone','education','status'].map(k=>[k,app[k]]).concat([['courseTitle',historicalTitle(app)],['courseSnapshot',app.courseSnapshot?{id:app.courseSnapshot.id,title:app.courseSnapshot.title,revision:app.courseSnapshot.revision}:null],['consentSnapshot',app.consentSnapshot?{version:app.consentSnapshot.version,revision:app.consentSnapshot.revision}:null]])));const current=await published();const programs=new Map(contentPrograms(current.content).map(p=>[p.id,{id:p.id,title:p.title}]));for(const a of applications)if(!programs.has(a.courseId))programs.set(a.courseId,{id:a.courseId,title:a.courseSnapshot?.title??initialContent.programs.find(p=>p.id===a.courseId)?.title??a.courseId});return json(res,200,{applications,total:applications.length,programs:[...programs.values()]});}
   if(req.method==='GET'&&pathname==='/api/admin/export'){
    rate('export:'+hash(cookies(req).admin_session??''),10,60000);
    const workbook=createApplicationsWorkbook(store.list());const buffer=await workbook.xlsx.writeBuffer();store.audit('export.download');
    res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="applications.xlsx"; filename*=UTF-8''${encodeURIComponent('Заявки-Кадры-в-АПК.xlsx')}`,'Content-Length':buffer.length});
    return res.end(buffer);
   }
   const detail=pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})$/);if(detail){const app=store.get(detail[1]);if(!app)throw new HttpError(404,'Заявка не найдена.','NOT_FOUND');if(req.method==='GET')return json(res,200,{...app,courseTitle:historicalTitle(app)});if(req.method==='PATCH'){const {status}=await readJson(req);if(!['new','review','accepted','rejected'].includes(status))throw new HttpError(400,'Неизвестный статус заявки.');store.update(app.id,status);return json(res,200,{id:app.id,status});}}
   const document=pathname.match(/^\/api\/admin\/documents\/([0-9a-f-]{36})$/);if(req.method==='GET'&&document){const doc=await store.document(document[1]);if(!doc)throw new HttpError(404,'Документ не найден.','NOT_FOUND');store.audit('document.download',document[1]);res.writeHead(200,{'Content-Type':doc.meta.mime,'Content-Disposition':`attachment; filename="${doc.meta.name}"`,'Content-Length':doc.data.length});return Readable.from(doc.data).pipe(res);}
  }
  if(await handleContentRoute({req,res,pathname,session:s,origin:checkOrigin,csrf:checkCsrf,getServices:getContentServices,json}))return;
  if(pathname.startsWith('/api/'))throw new HttpError(404,'Страница не найдена.','NOT_FOUND');
  if(!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Этот способ обращения недоступен.');
  if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(segment=>segment.startsWith('.')))throw new HttpError(404,'Страница не найдена.','NOT_FOUND');
  const isPreview=pathname.startsWith('/admin/preview/');
  if(isPreview&&!s)throw new HttpError(401,'Войдите в кабинет администратора.','AUTH_REQUIRED');
  const cssMatch=pathname.match(/^\/(?:assets\/content|admin\/preview\/styles)\/(theme|site|refinement|soft-ui)\.css$/);
  const contentPath=isPreview?pathname.slice('/admin/preview'.length):pathname;
  const pageMatch=contentPath==='/'||contentPath==='/index.html'||/^\/[a-z0-9][a-z0-9_-]{0,63}\/(?:index\.html)?$/.test(contentPath);
  if(cssMatch||pageMatch&&contentPath!=='/admin/'){
   let envelope;
   if(isPreview){const services=await getContentServices();if(!services)throw new HttpError(503,'Редактор недоступен.','CONTENT_UNAVAILABLE');const params=new URL(req.url,origin).searchParams;const revision=params.get('revision');if(revision!==null&&(!/^[1-9][0-9]{0,14}$/.test(revision)||params.getAll('revision').length!==1))throw new HttpError(400,'Некорректная версия.','INVALID_CONTENT_REVISION');envelope=revision===null?services.store.getDraft():services.store.version(Number(revision));if(!envelope)throw new HttpError(404,'Версия не найдена.','CONTENT_VERSION_NOT_FOUND');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy').replace("frame-ancestors 'none'","frame-ancestors 'self'"));
   }else envelope=await published();
   // Publishing can replace server-authored consent at the same draft revision.
   // HTML and CSS therefore share both draft and publication identity.
   const key=JSON.stringify([isPreview?'preview':'public',envelope.revision,envelope.publishedRevision,envelope.publishedAt,pathname,new URL(req.url,origin).searchParams.get('revision')??'']);
   let rendered,type;
   if(cssMatch){const file=cssMatch[1]==='theme'?null:'assets/css/'+cssMatch[1]+'.css';if(file&&!contentCssFiles.includes(file))throw new HttpError(404,'Страница не найдена.','NOT_FOUND');rendered=cache(key,()=>renderContentCss({content:envelope.content,preview:isPreview,file}));type='text/css; charset=utf-8';}
   else {const slug=contentPath.split('/')[1];const templateFile=contentPath==='/'||contentPath==='/index.html'?'index.html':['privacy','consent','operator'].includes(slug)?slug+'/index.html':'privacy/index.html';const template=await readFile(path.join(publicDir,templateFile),'utf8');rendered=cache(key,()=>renderContentPage({content:envelope.content,template,route:contentPath,preview:isPreview,revision:envelope.revision,historyRevision:isPreview&&new URL(req.url,origin).searchParams.has('revision')?envelope.revision:null}));type='text/html; charset=utf-8';}
   if(rendered===null)throw new HttpError(404,'Страница не найдена.','NOT_FOUND');res.writeHead(200,{'Content-Type':type,'Cache-Control':isPreview?'no-store':'no-cache','Content-Length':Buffer.byteLength(rendered)});return res.end(req.method==='HEAD'?undefined:rendered);
  }
  const mapped=pathname==='/admin'||pathname==='/admin/'?'/admin.html':pathname.endsWith('/')?pathname+'index.html':pathname;
  const candidate=path.resolve(publicDir,'.'+mapped);if(!candidate.startsWith(publicDir+path.sep))throw new HttpError(404,'Страница не найдена.','NOT_FOUND');
  let canonical,info;try{canonical=await realpath(candidate);info=await stat(canonical);}catch{throw new HttpError(404,'Страница не найдена.','NOT_FOUND');}const publicCanonical=await realpath(publicDir);if(!canonical.startsWith(publicCanonical+path.sep)||!info.isFile()||!mime[path.extname(canonical).toLowerCase()])throw new HttpError(404,'Страница не найдена.','NOT_FOUND');
  res.writeHead(200,{'Content-Type':mime[path.extname(canonical).toLowerCase()],'Content-Length':info.size,'Cache-Control':path.extname(canonical)==='.html'?'no-cache':'public, max-age=3600'});if(req.method==='HEAD')return res.end();const stream=createReadStream(canonical);stream.on('error',()=>res.destroy());stream.pipe(res);
 }
 const server=http.createServer((req,res)=>{route(req,res).catch(e=>{if(res.headersSent)return res.destroy();if(e instanceof HttpError){if(e.status===429)res.setHeader('Retry-After','900');json(res,e.status,{error:req.url?.startsWith('/api/applications')?contentMessage(contentServices?.store.getPublished().content??initialContent,e.message):e.message,code:e.code,...(e.locations?{locations:e.locations}:{})});}else json(res,500,{error:'Сервис временно недоступен. Повторите попытку позже.',code:'INTERNAL_ERROR'});if(!req.complete)req.resume();});});
 server.requestTimeout=60000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;server.setTimeout(65000,socket=>socket.destroy());
 return {server,getContentServices,get contentStore(){return contentServices?.store??null;},get contentMedia(){return contentServices?.media??null;},close(){if(appClosePromise)return appClosePromise;closing=true;clearInterval(timer);sessions.clear();preauth.clear();appClosePromise=(async()=>{await contentPromise?.catch(()=>{});await contentServices?.media.close();await contentServices?.store.close();await scanner.close();store?.close();})();return appClosePromise;}};
}
