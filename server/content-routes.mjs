import Busboy from 'busboy';
import {readFile} from 'node:fs/promises';
import {HttpError} from './intake.mjs';
import {loadDefaultContent} from './content-schema.mjs';

const bindings=JSON.parse(await readFile(new URL('../content/content-bindings.json',import.meta.url),'utf8'));
const seed=await loadDefaultContent(),uploadCounts=new WeakMap();
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const mediaPath=new RegExp('^/api/admin/media/('+uuid+')(?:/(file))?$'),publicPath=new RegExp('^/media/('+uuid+')\\.(webp|pdf|docx)$');
const jsonDefault=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
function exact(value,required,optional=[]){if(Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new HttpError(400,'Некорректные поля запроса.','INVALID_REQUEST');}
async function readJson(req){if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??''))throw new HttpError(400,'Некорректный формат запроса.');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>512*1024)throw new HttpError(413,'Запрос превышает 512 КиБ.','CONTENT_BODY_TOO_LARGE');chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new HttpError(400,'Не удалось прочитать запрос.');}}
function parseUpload(req){return new Promise((resolve,reject)=>{
 let parser;try{parser=Busboy({headers:req.headers,preservePath:true,defParamCharset:'utf8',limits:{files:1,fields:2,parts:4,fileSize:10*1024*1024+1,fieldSize:2000,headerPairs:50}});}catch{req.resume();reject(new HttpError(400,'Некорректная форма загрузки.'));return;}
 let error=null,total=0,file=null;const fields=Object.create(null),fail=(message,status=400)=>{error??=new HttpError(status,message,'INVALID_MEDIA');};
 const size=chunk=>{total+=chunk.length;if(total>10*1024*1024+16384){fail('Форма загрузки слишком большая.',413);req.unpipe(parser);parser.destroy(error);req.resume();}};
 const abort=()=>parser.destroy(new HttpError(400,'Загрузка прервана.','INVALID_MEDIA'));
 req.on('data',size);req.once('aborted',abort);req.once('error',abort);
 const cleanup=()=>{req.removeListener('data',size);req.removeListener('aborted',abort);req.removeListener('error',abort);};
 parser.on('field',(name,value,info)=>{if(!['title','alt'].includes(name)||Object.hasOwn(fields,name)||info.nameTruncated||info.valueTruncated)fail('Неизвестное, повторное или слишком длинное поле.');else fields[name]=value;});
 parser.on('file',(name,stream,info)=>{stream.on('error',()=>fail('Не удалось загрузить файл.'));stream.on('limit',()=>fail('Размер файла превышает 10 МиБ.',413));if(name!=='file'||file){fail('Допустим ровно один файл.');stream.resume();return;}file={name:info.filename,mime:info.mimeType,data:null};const chunks=[];let length=0;stream.on('data',chunk=>{length+=chunk.length;if(!error&&length<=10*1024*1024)chunks.push(chunk);});stream.on('end',()=>{if(!error)file.data=Buffer.concat(chunks);});});
 for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>fail('В форме слишком много полей или файлов.'));
 parser.on('error',e=>{cleanup();reject(e instanceof HttpError?e:new HttpError(400,'Не удалось прочитать форму.','INVALID_MEDIA'));});
 parser.on('close',()=>{cleanup();if(error)return reject(error);if(!file?.data)return reject(new HttpError(400,'Прикрепите один файл.','INVALID_MEDIA'));resolve({...file,title:fields.title??'',alt:fields.alt??''});});req.pipe(parser);
});}

export function contentDefinitions(){
 const labels={navigation:'Навигация',benefits:'Преимущества',steps:'Шаги поступления',faqs:'Вопросы и ответы',programs:'Программы обучения',pages:'Информационные страницы',extraSections:'Дополнительные секции'};
 const limits={navigation:30,benefits:50,steps:50,faqs:100,programs:100,pages:100,extraSections:50};
 return {schemaVersion:1,fields:structuredClone(bindings),groups:[...new Set(bindings.map(b=>b.group))].map(id=>({id,label:id})),collections:Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,{label,maxItems:limits[key],fields:Object.keys(key==='navigation'?seed.navigation.desktop[0]:seed[key][0]??{id:'',type:'',title:'',body:'',image:'',alt:'',imageFocus:{},buttonLabel:'',buttonUrl:'',items:[]}),...(key==='programs'?{statuses:['published','draft','closed','archived']}:{})}])),settings:structuredClone(seed.settings),documents:Object.keys(seed.documents),seo:Object.keys(seed.seo),messages:Object.keys(seed.messages),sectionTemplates:['text','image','cta','faq','cards','gallery'],limits:{jsonBytes:512*1024,fileBytes:10*1024*1024,imagePixels:24_000_000,history:20}};
}

// App enforces trusted proxy/Host checks before dispatch. Guards are repeated here
// before getServices or reading any upload body, allowing safe standalone reuse.
export async function handleContentRoute({req,res,pathname,session,origin,csrf,store,media,getServices,json=jsonDefault,rate=()=>{}}){
 const admin=pathname==='/api/admin/content'||pathname.startsWith('/api/admin/content/')||pathname==='/api/admin/media'||pathname.startsWith('/api/admin/media/'),publicMedia=pathname.startsWith('/media/');
 if(!admin&&!publicMedia)return false;
 if(admin){if(!session)throw new HttpError(401,'Войдите в кабинет администратора.','AUTH_REQUIRED');if(!['GET','HEAD'].includes(req.method)){origin(req);csrf(req,session);}}
 if(publicMedia&&!['GET','HEAD'].includes(req.method))throw new HttpError(405,'Этот способ обращения недоступен.');
 const services=getServices?await getServices():{store,media};store=services?.store;media=services?.media;
 if(!store||!media)throw new HttpError(publicMedia?404:503,publicMedia?'Файл не найден.':'Хранилище содержимого недоступно.',publicMedia?'NOT_FOUND':'CONTENT_UNAVAILABLE');
 const fileResponse=async(value,publicOnly)=>{const file=await media.read(value,{publicOnly});if(!file)throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');const headers={'Content-Type':file.meta.mime,'Content-Length':file.data.length,'X-Content-Type-Options':'nosniff','Cache-Control':publicOnly?'public, max-age=31536000, immutable':'no-store'};if(file.meta.kind==='document')headers['Content-Disposition']='attachment; filename="'+file.meta.id+'.'+file.meta.ext+'"';res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:file.data);};
 if(publicMedia){if(!publicPath.test(pathname))throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');await fileResponse(pathname,true);return true;}
 if(pathname==='/api/admin/content'){
  if(req.method==='GET'){json(res,200,store.getDraft());return true;}
  if(req.method==='PUT'){const body=await readJson(req);exact(body,['content','expectedRevision']);json(res,200,await store.saveDraft(body.content,body.expectedRevision));return true;}
 }
 if(req.method==='GET'&&pathname==='/api/admin/content/definitions'){json(res,200,contentDefinitions());return true;}
 if(req.method==='POST'&&pathname==='/api/admin/content/publish'){const body=await readJson(req);exact(body,['expectedRevision'],['documentsConfirmed']);json(res,200,await media.publish(body.expectedRevision,{documentsConfirmed:body.documentsConfirmed??false}));return true;}
 if(req.method==='GET'&&pathname==='/api/admin/content/history'){const versions=store.history().map(({content,...summary})=>summary);json(res,200,{versions});return true;}
 const history=pathname.match(/^\/api\/admin\/content\/history\/([1-9][0-9]{0,15})$/);if(req.method==='GET'&&history){const version=store.version(Number(history[1]));if(!version)throw new HttpError(404,'Версия не найдена.','CONTENT_VERSION_NOT_FOUND');json(res,200,version);return true;}
 if(req.method==='POST'&&pathname==='/api/admin/content/restore'){const body=await readJson(req);exact(body,['revision','expectedRevision']);json(res,200,await store.restore(body.revision,body.expectedRevision));return true;}
 if(pathname==='/api/admin/media'){
  if(req.method==='GET'){json(res,200,{media:media.list()});return true;}
  if(req.method==='POST'){rate('media-upload',30,60000);const count=uploadCounts.get(media)??0;if(count>=2)throw new HttpError(429,'Медиатека занята. Повторите позже.','RATE_LIMIT');uploadCounts.set(media,count+1);try{const input=await parseUpload(req);json(res,201,await media.upload(input));}finally{uploadCounts.set(media,(uploadCounts.get(media)??1)-1);}return true;}
 }
 const item=pathname.match(mediaPath);if(item){if(item[2]&&['GET','HEAD'].includes(req.method)){await fileResponse(item[1],false);return true;}if(!item[2]&&req.method==='PATCH'){const body=await readJson(req);exact(body,['title','alt']);json(res,200,await media.update(item[1],body));return true;}if(!item[2]&&req.method==='DELETE'){json(res,200,await media.remove(item[1]));return true;}}
 throw new HttpError(404,'Страница не найдена.','NOT_FOUND');
}
