import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,open,rename,unlink,realpath,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {inflateRawSync,inflateSync} from 'node:zlib';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {DOMParser} from 'linkedom';
import {HttpError,createScannerGuard} from './intake.mjs';
import {referencedMedia,validateContent} from './content-schema.mjs';

sharp.cache(false);sharp.concurrency(1);
const MAX_FILE=10*1024*1024,MAX_PIXELS=24_000_000,MAX_RECORDS=1000,MAX_BYTES=512*1024*1024;
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
const bindings=JSON.parse(await readFile(new URL('../content/content-bindings.json',import.meta.url),'utf8'));
const owners=new Set(),sharedScanner=createScannerGuard();
const fail=(message='Некорректный медиафайл.',code='INVALID_MEDIA')=>{throw new HttpError(400,message,code);};
function queue(max=4){let tail=Promise.resolve(),pending=0,closed=false;return {async run(fn){if(closed)throw new HttpError(503,'Медиатека закрыта.','MEDIA_CLOSED');if(pending>=max)throw new HttpError(429,'Медиатека занята. Повторите позже.','RATE_LIMIT');pending++;const job=tail.then(fn);tail=job.catch(()=>{});try{return await job;}finally{pending--; }},async close(){closed=true;await tail;}};}
// Global processing queue also bounds expensive decoders if several apps share a process.
const processing=queue(4);
function labels(value,keys=['title','alt']){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Неизвестное поле медиафайла.');for(const key of ['title','alt'])if(typeof value[key]!=='string'||value[key].length>500||/[\x00-\x1f\x7f]/.test(value[key])||/<\/?[a-z]/i.test(value[key]))fail('Некорректная подпись медиафайла.');return {title:value.title.trim(),alt:value.alt.trim()};}
function xml(data,root){
 const source=data.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(source))fail();
 const stack=[];let cursor=0,count=0,roots=0;
 for(const match of source.matchAll(/<(?:!--[\s\S]*?--|!\[CDATA\[[\s\S]*?\]\]|\?[\s\S]*?\?|(?:"[^"]*"|'[^']*'|[^'"<>])*)>/g)){
  const gap=source.slice(cursor,match.index);if(gap.includes('<')||!stack.length&&gap.trim())fail();cursor=match.index+match[0].length;if(++count>100000)fail();
  const tag=match[0];if(tag.startsWith('<?')||tag.startsWith('<!--'))continue;if(tag.startsWith('<![CDATA[')){if(!stack.length)fail();continue;}
  const closing=tag.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);if(closing){if(stack.pop()!==closing[1])fail();continue;}
  const opening=tag.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/);if(!opening)fail();
  let attrs=opening[2];const names=new Set();while(attrs.trim()){const attr=attrs.match(/^\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"<]*"|'[^'<]*')/);if(!attr||names.has(attr[1]))fail();names.add(attr[1]);attrs=attrs.slice(attr[0].length);}
  if(!stack.length&&++roots!==1)fail();if(!opening[3])stack.push(opening[1]);if(stack.length>256)fail();
 }
 if(stack.length||roots!==1||source.slice(cursor).trim())fail();
 const doc=new DOMParser().parseFromString(source,'text/xml');if(!doc.documentElement||doc.documentElement.localName.split(':').at(-1)!==root||doc.querySelector('parsererror'))fail();return source;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function docx(data){
 // Read central directory first, then inflate one bounded entry at a time, never extract paths.
 let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||data.readUInt16LE(end+4)||data.readUInt16LE(end+6)||end+22+data.readUInt16LE(end+20)!==data.length)fail();
 const count=data.readUInt16LE(end+10),size=data.readUInt32LE(end+12),offset=data.readUInt32LE(end+16);if(!count||count>200||count!==data.readUInt16LE(end+8)||offset+size!==end)fail();
 let cursor=offset,total=0;const names=new Set(),required=new Map();
 for(let i=0;i<count;i++){
  if(cursor+46>end||data.readUInt32LE(cursor)!==0x02014b50)fail();
  const flags=data.readUInt16LE(cursor+8),method=data.readUInt16LE(cursor+10),crc=data.readUInt32LE(cursor+16),compressed=data.readUInt32LE(cursor+20),length=data.readUInt32LE(cursor+24),n=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),local=data.readUInt32LE(cursor+42);
  if(cursor+46+n+extra+comment>end)fail();const name=data.subarray(cursor+46,cursor+46+n).toString('utf8');cursor+=46+n+extra+comment;
  if(!name||names.has(name)||name.includes('\\')||name.startsWith('/')||/[\x00-\x1f]/.test(name)||name.split('/').some(x=>x==='..'||x==='.')||flags&1||![0,8].includes(method)||length>12*1024*1024||(total+=length)>32*1024*1024||/vbaProject|activeX|embeddings|\.exe$/i.test(name))fail();names.add(name);
  if(local+30>offset||data.readUInt32LE(local)!==0x04034b50||data.readUInt16LE(local+6)!==flags||data.readUInt16LE(local+8)!==method)fail();const ln=data.readUInt16LE(local+26),le=data.readUInt16LE(local+28),start=local+30+ln+le;
  if(data.subarray(local+30,local+30+ln).toString('utf8')!==name||start+compressed>offset)fail();const input=data.subarray(start,start+compressed),output=method===0?input:inflateRawSync(input,{maxOutputLength:Math.min(length+1,12*1024*1024+1)});
  if(output.length!==length||crc32(output)!==crc)fail();
  if(['[Content_Types].xml','_rels/.rels','word/document.xml'].includes(name))required.set(name,output);
  if(name.endsWith('.rels')&&/TargetMode\s*=\s*["']External["']/i.test(output.toString('utf8')))fail('Внешние ресурсы DOCX не поддерживаются.');
 }
 if(cursor!==end||required.size!==3)fail();const contentTypes=xml(required.get('[Content_Types].xml'),'Types'),rels=xml(required.get('_rels/.rels'),'Relationships');xml(required.get('word/document.xml'),'document');
 if(!contentTypes.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')||!rels.includes('officeDocument')||!rels.includes('word/document.xml'))fail();
}
async function pdf(data){
 const text=data.toString('latin1');if(!/^%PDF-1\.[0-7][\r\n]/.test(text)||!/(?:\r?\n)%%EOF\s*$/.test(text)||!/startxref\s+\d+\s+%%EOF\s*$/.test(text))fail();
 const names=value=>value.replace(/\/[^\s()[\]<>/%]+/g,name=>name.replace(/#([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))));
 if(/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|Encrypt)\b/.test(names(text)))fail('Активный или зашифрованный PDF не поддерживается.');
 // Bound all deflated streams before pdf-lib parses object streams. Other object-stream filters are rejected.
 let total=0;for(const match of text.matchAll(/<<(?:[^<>]|<<[^<>]*>>)*>>\s*stream(?:\r\n|\r|\n)/g)){
  const start=match.index+match[0].length,end=text.indexOf('endstream',start);if(end<0)fail();
  const dictionary=names(match[0]);if(/\/ObjStm\b/.test(dictionary)&&!/\/FlateDecode\b/.test(dictionary))fail();
  if(/\/FlateDecode\b/.test(dictionary)){let input=data.subarray(start,end);const filters=[...dictionary.matchAll(/\/(ASCII85Decode|ASCIIHexDecode|FlateDecode|[A-Za-z]+Decode)\b/g)].map(m=>m[1]);for(const filter of filters){if(filter==='ASCII85Decode')input=ascii85(input);else if(filter==='ASCIIHexDecode'){const hex=input.toString('ascii').replace(/\s/g,'').replace(/>$/,'');if(!/^[a-f0-9]*$/i.test(hex))fail();input=Buffer.from(hex.length%2?hex+'0':hex,'hex');}else if(filter==='FlateDecode')input=inflateSync(input,{maxOutputLength:16*1024*1024});else fail('Фильтр PDF не поддерживается.');}if((total+=input.length)>32*1024*1024)fail();}
 }
 const parsed=await PDFDocument.load(data,{updateMetadata:false,throwOnInvalidObject:true});if(parsed.getPageCount()<1||parsed.getPageCount()>2000)fail();parsed.getPages();
}
function ascii85(data){const source=data.toString('ascii').replace(/\s/g,'').replace(/^<~/,'').replace(/~>$/,'');const output=[],group=[];const append=length=>{let value=0;for(const digit of group)value=value*85+digit;if(value>0xffffffff)fail();for(let i=0;i<length;i++)output.push(Math.floor(value/256**(3-i))&255);group.length=0;};for(const char of source){if(char==='z'){if(group.length)fail();output.push(0,0,0,0);continue;}const digit=char.charCodeAt(0)-33;if(digit<0||digit>84)fail();group.push(digit);if(group.length===5)append(4);}if(group.length===1)fail();if(group.length){const length=group.length-1;while(group.length<5)group.push(84);append(length);}return Buffer.from(output);}
async function prepare(input,scannerCommand,scanner){
 labels(input,['data','name','mime','title','alt']);const {data,name,mime}=input;
 if(!Buffer.isBuffer(data)||!data.length)fail();if(data.length>MAX_FILE)throw new HttpError(413,'Размер файла превышает 10 МиБ.','MEDIA_TOO_LARGE');
 if(typeof name!=='string'||!name||name.length>200||name!==path.basename(name)||/[\\/\x00-\x1f\x7f]/.test(name))fail('Некорректное имя файла.');const ext=path.extname(name).slice(1).toLowerCase();if(!Object.hasOwn(types,ext)||types[ext]!==mime)fail('Формат файла не соответствует содержимому.');
 if(scannerCommand)await scanner.scan(scannerCommand,data);
 try{
  if(ext==='pdf'){await pdf(data);return {data,ext,mime,kind:'document',width:null,height:null};}
  if(ext==='docx'){docx(data);return {data,ext,mime,kind:'document',width:null,height:null};}
  const settings={limitInputPixels:MAX_PIXELS,failOn:'warning',animated:false};const metadata=await sharp(data,settings).metadata();const expected=ext==='jpg'?'jpeg':ext;
  if((ext==='avif'?metadata.format!=='heif'||metadata.compression!=='av1':metadata.format!==expected)||!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS||(metadata.pages??1)>1)fail();
  // Explicit full raw decode prevents a resize/shrink-on-load from hiding corrupt source pixels.
  await sharp(data,settings).raw().toBuffer();
  const result=await sharp(data,settings).autoOrient().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer({resolveWithObject:true});
  if(result.data.length>MAX_FILE)fail();return {data:result.data,ext:'webp',mime:'image/webp',kind:'image',width:result.info.width,height:result.info.height};
 }catch(e){if(e instanceof HttpError)throw e;fail('Не удалось декодировать файл.');}
}
function contentLocations(content){const found=new Map();const add=(url,p)=>{if(!found.has(url))found.set(url,[]);found.get(url).push(p);};function visit(value,p){if(typeof value==='string'){if(value.startsWith('/media/'))add(value,p);for(const match of value.matchAll(/\]\((\/media\/[^)]+)\)/g))add(match[1],p);}else if(Array.isArray(value))value.forEach((item,i)=>visit(item,p+'['+i+']'));else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))visit(item,p?p+'.'+key:key);}visit(content,'');return found;}
function publicationResources(content){
 const live=referencedMedia(content,{publicOnly:true}),resources=new Map([...live].map(url=>[url,null])),hidden=new Set(content.hiddenSections);
 const add=(url,kind)=>{if(url)resources.set(url,kind);};
 for(const binding of bindings.filter(b=>!b.source))if(['image','background','url'].includes(binding.kind)&&binding.targets.some(t=>(t.sections??[t.section]).some(section=>section===null||!hidden.has(section)))){const url=content.fields[binding.id];if(['image','background'].includes(binding.kind))add(url,'image');else if(/^\/(assets|documents)\//.test(url))add(url,null);}
 if(!hidden.has('about'))content.benefits.forEach(b=>add(b.image,'image'));
 if(!hidden.has('programs'))content.programs.filter(p=>['published','closed'].includes(p.status)).forEach(p=>{add(p.image,'image');add(p.modalImage,'image');});
 content.extraSections.filter(s=>!hidden.has(s.id)).forEach(s=>{add(s.image,'image');s.items.forEach(item=>add(item.image,'image'));});
 Object.values(content.documents).forEach(url=>add(url,'document'));add(content.seo.icon,'image');add(content.seo.ogImage,'image');content.pages.filter(p=>p.status==='published').forEach(p=>add(p.seo.ogImage,'image'));
 const generic=url=>{if(/^\/(assets|documents|media)\//.test(url)&&!resources.has(url))add(url,null);};
 Object.values(content.navigation).flat().forEach(item=>generic(item.url));generic(content.settings.organization.registryUrl);
 const sections=content.extraSections.filter(s=>!hidden.has(s.id));sections.forEach(s=>{generic(s.buttonUrl);s.items.forEach(item=>generic(item.buttonUrl??''));});
 const bodies=[...content.pages.filter(p=>p.status==='published').map(p=>p.body),...(!hidden.has('about')?content.benefits.map(b=>b.body):[]),...(!hidden.has('steps')?content.steps.map(s=>s.body):[]),...(!hidden.has('faq')?content.faqs.map(f=>f.answer):[]),...(!hidden.has('programs')?content.programs.filter(p=>['published','closed'].includes(p.status)).map(p=>p.description):[]),...sections.flatMap(s=>[s.body,...s.items.map(item=>item.body)])];
 for(const body of bodies.filter(b=>typeof b==='string'))for(const match of body.matchAll(/\]\(([^)]+)\)/g))generic(match[1]);
 return resources;
}

export async function openContentMedia({dir,store,scannerCommand='',scanner=sharedScanner,publicDir=fileURLToPath(new URL('../public/',import.meta.url))}={}){
 const directory=path.resolve(dir),filename=path.join(directory,'media.json');await mkdir(directory,{recursive:true,mode:0o700});const canonical=await realpath(directory),owner=process.platform==='win32'?canonical.toLowerCase():canonical;if(owners.has(owner))throw new HttpError(409,'Медиатека уже открыта.','MEDIA_OWNED');owners.add(owner);
 const mutation=queue(8),uploads=new Set();let records=[],closed=false,closePromise=null;
 const write=async(next)=>{const temporary=filename+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify({format:1,media:next}));await handle.sync();await handle.close();handle=null;await rename(temporary,filename);}finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}};
 try{
  const raw=await readFile(filename);if(raw.length>8*1024*1024)fail();const data=JSON.parse(raw);if(data.format!==1||Object.keys(data).sort().join()!=='format,media'||!Array.isArray(data.media)||data.media.length>MAX_RECORDS)fail();const seen=new Set();let total=0;
  for(const item of data.media){
   if(!item||Object.keys(item).sort().join()!=='alt,createdAt,ext,height,id,kind,mime,sha256,size,title,url,width'||!idPattern.test(item.id)||seen.has(item.id)||!['webp','pdf','docx'].includes(item.ext)||item.mime!==types[item.ext]||item.kind!==(item.ext==='webp'?'image':'document')||item.url!=='/media/'+item.id+'.'+item.ext||!Number.isSafeInteger(item.size)||item.size<1||item.size>MAX_FILE||(total+=item.size)>MAX_BYTES||!Number.isFinite(Date.parse(item.createdAt))||!/^[0-9a-f]{64}$/.test(item.sha256))fail();
   if(item.kind==='image'&&(!Number.isSafeInteger(item.width)||!Number.isSafeInteger(item.height)||item.width<1||item.height<1||item.width>1920||item.height>1920)||item.kind==='document'&&(item.width!==null||item.height!==null))fail();
   labels({title:item.title,alt:item.alt});seen.add(item.id);
  }records=data.media;
 }catch(e){if(e.code!=='ENOENT'){owners.delete(owner);throw new HttpError(500,'Повреждён индекс медиатеки.','MEDIA_CORRUPT');}}
 const active=()=>{if(closed)throw new HttpError(503,'Медиатека закрыта.','MEDIA_CLOSED');};
 const get=value=>records.find(item=>item.id===value||item.url===value);
 let referenceCache=null;
 const referenceIndex=()=>{const draft=store.getDraft(),published=store.getPublished(),key=draft.revision+':'+published.revision;if(referenceCache?.key===key)return referenceCache;const snapshots=[{source:'draft',...draft},{source:'published',...published},...store.history().map(v=>({source:'history',...v}))],all=new Map(),publicUrls=new Set();for(const snapshot of snapshots){for(const [url,paths]of contentLocations(snapshot.content)){if(!all.has(url))all.set(url,[]);all.get(url).push(...paths.map(p=>({source:snapshot.source,revision:snapshot.revision,path:p})));}if(snapshot.source!=='draft')for(const url of referencedMedia(snapshot.content,{publicOnly:true}))publicUrls.add(url);}return referenceCache={key,all,publicUrls};};
 const usages=url=>structuredClone(referenceIndex().all.get(url)??[]);
 const publiclyReferenced=url=>referenceIndex().publicUrls.has(url);
 const read=async(value,{publicOnly=false}={})=>{active();const meta=get(value);if(!meta||publicOnly&&!publiclyReferenced(meta.url))return null;let data;try{data=await readFile(path.join(directory,meta.id+'.'+meta.ext));}catch(e){if(e.code==='ENOENT')return null;throw e;}if(data.length!==meta.size||createHash('sha256').update(data).digest('hex')!==meta.sha256)throw new HttpError(500,'Повреждено содержимое медиатеки.','MEDIA_CORRUPT');return {meta:structuredClone(meta),data};};
 const api={
  list(){active();const index=referenceIndex();return structuredClone(records).map(meta=>({...meta,locations:structuredClone(index.all.get(meta.url)??[]),public:index.publicUrls.has(meta.url)}));},
  usage(value){active();const meta=get(value);return meta?usages(meta.url):[];},
  upload(input){active();if(Buffer.isBuffer(input?.data)&&input.data.length>MAX_FILE)return Promise.reject(new HttpError(413,'Размер файла превышает 10 МиБ.','MEDIA_TOO_LARGE'));const captured={...input,data:Buffer.isBuffer(input?.data)?Buffer.from(input.data):input?.data};const job=processing.run(async()=>{const prepared=await prepare(captured,scannerCommand,scanner);return mutation.run(async()=>{if(records.length>=MAX_RECORDS||records.reduce((sum,m)=>sum+m.size,0)+prepared.data.length>MAX_BYTES)throw new HttpError(413,'Достигнут лимит медиатеки.','MEDIA_CAPACITY');const id=randomUUID(),meta={id,url:'/media/'+id+'.'+prepared.ext,ext:prepared.ext,mime:prepared.mime,kind:prepared.kind,width:prepared.width,height:prepared.height,size:prepared.data.length,sha256:createHash('sha256').update(prepared.data).digest('hex'),...labels(captured,['data','name','mime','title','alt']),createdAt:new Date().toISOString()};const target=path.join(directory,id+'.'+meta.ext);let handle;try{handle=await open(target,'wx',0o600);await handle.writeFile(prepared.data);await handle.sync();await handle.close();handle=null;await write([...records,meta]);records.push(meta);}catch(e){await handle?.close().catch(()=>{});await unlink(target).catch(()=>{});throw e;}return structuredClone(meta);});});uploads.add(job);job.then(()=>uploads.delete(job),()=>uploads.delete(job));return job;},
  update(id,value){active();const captions=labels(value);return mutation.run(async()=>{const previous=get(id);if(!previous)throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');const meta={...previous,...captions},next=records.map(r=>r.id===id?meta:r);await write(next);records=next;return structuredClone(meta);});},
  remove(id){active();return mutation.run(async()=>{const meta=get(id);if(!meta)throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');const used=usages(meta.url);if(store.references().has(meta.url)||used.length){const error=new HttpError(409,'Файл используется в содержимом сайта.','MEDIA_REFERENCED');error.locations=used;throw error;}const next=records.filter(r=>r.id!==id);await write(next);records=next;await unlink(path.join(directory,id+'.'+meta.ext)).catch(e=>{if(e.code!=='ENOENT')throw e;});return {deleted:true,id};});},
  read,
  withMutation(operation){active();return mutation.run(operation);},
  publish(expectedRevision,options={}){active();return mutation.run(async()=>{const draft=store.getDraft();if(draft.revision!==expectedRevision)throw new HttpError(409,'Черновик изменён.','CONTENT_REVISION_CONFLICT');const content=validateContent(draft.content,{forPublication:true});for(const [url,kind] of publicationResources(content)){
    if(url.startsWith('/media/')){const file=await read(url);if(!file)throw new HttpError(400,'Не найден медиафайл: '+url,'CONTENT_MEDIA_MISSING');if(kind&&file.meta.kind!==kind)throw new HttpError(400,'Неверный тип медиафайла: '+url,'CONTENT_MEDIA_TYPE');}
    else if(/^\/(assets|documents)\//.test(url)){const candidate=path.resolve(publicDir,'.'+url.split(/[?#]/)[0]);let real;try{real=await realpath(candidate);const base=await realpath(publicDir),info=await stat(real);if(!real.startsWith(base+path.sep)||!info.isFile())throw new Error();}catch{throw new HttpError(400,'Не найден файл: '+url,'CONTENT_MEDIA_MISSING');}const ext=path.extname(real).slice(1).toLowerCase();if(kind==='document'&&!['pdf','docx'].includes(ext)||kind==='image'&&!['png','jpg','jpeg','webp','avif','svg','ico'].includes(ext))throw new HttpError(400,'Неверный тип файла: '+url,'CONTENT_MEDIA_TYPE');}
   }return store.publish(expectedRevision,options);});},
  async close(){if(closePromise)return closePromise;closed=true;closePromise=(async()=>{await Promise.allSettled([...uploads]);await mutation.close();owners.delete(owner);})();return closePromise;}
 };
 return api;
}
