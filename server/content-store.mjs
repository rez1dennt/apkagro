import {formCollectionSignature} from './application-form.mjs';
import {mkdir,readFile,open,rename,unlink,realpath} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from './intake.mjs';
import {loadDefaultContent,validateContent,contentDigest,referencedMedia} from './content-schema.mjs';

const owners=new Set();
const clone=value=>structuredClone(value);
const error=(status,message,code)=>new HttpError(status,message,code);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const legal=(content,slug)=>{const page=content.pages.find(page=>page.slug===slug);return {title:page.title,intro:page.intro,body:page.body};};
const consentDigest=content=>digest({form:formCollectionSignature(content),page:legal(content,'consent'),pdf:content.documents.consentPdf,word:content.documents.consentWord,policyPdf:content.documents.policyPdf,organization:content.settings.organization});
const documentDigest=content=>digest({consent:consentDigest(content),policy:legal(content,'privacy'),policyPdf:content.documents.policyPdf,contacts:content.settings.contacts,organization:content.settings.organization});
function envelope(content,revision,time,publishedRevision=revision,publishedAt=time,dirty=false){return {revision,content,updatedAt:time,publishedRevision,publishedAt,dirty};}
function validateState(value){
  if(!value||value.format!==1||Object.keys(value).sort().join()!=='draft,format,history,published'||!Array.isArray(value.history)||value.history.length<1||value.history.length>20)throw error(500,'Повреждено хранилище контента.','CONTENT_STORE_CORRUPT');
  const check=(snapshot,published=false)=>{
    if(!snapshot||Object.keys(snapshot).sort().join()!=='content,dirty,publishedAt,publishedRevision,revision,updatedAt'||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!Number.isSafeInteger(snapshot.publishedRevision)||snapshot.publishedRevision<1||snapshot.publishedRevision>snapshot.revision||typeof snapshot.dirty!=='boolean'||!Number.isFinite(Date.parse(snapshot.updatedAt))||!Number.isFinite(Date.parse(snapshot.publishedAt)))throw error(500,'Повреждено хранилище контента.','CONTENT_STORE_CORRUPT');
    return {...snapshot,content:validateContent(snapshot.content,{forPublication:published})};
  };
  const state={format:1,draft:check(value.draft),published:check(value.published,true),history:value.history.map(item=>check(item,true))};
  if(state.published.dirty||state.published.revision!==state.published.publishedRevision||state.draft.publishedRevision!==state.published.revision||state.draft.revision<state.published.revision||state.history.some((item,index)=>item.dirty||item.publishedRevision!==item.revision||index>0&&item.revision<=state.history[index-1].revision)||contentDigest(state.history.at(-1).content)!==contentDigest(state.published.content)||state.history.at(-1).revision!==state.published.revision||state.draft.dirty!==(contentDigest(state.draft.content)!==contentDigest(state.published.content)))throw error(500,'Повреждено хранилище контента.','CONTENT_STORE_CORRUPT');
  return state;
}

export async function openContentStore({dir,defaults,persist=true}){
  if(typeof persist!=='boolean'||typeof dir!=='string'||!dir)throw error(400,'Не указан каталог контента.','INVALID_CONTENT_STORE');
  const initial=validateContent(defaults??await loadDefaultContent(),{forPublication:true});
  let owner=path.resolve(dir);if(process.platform==='win32')owner=owner.toLowerCase();
  let claimed=false;
  if(persist){if(owners.has(owner))throw error(409,'Хранилище уже открыто в этом процессе.','CONTENT_STORE_OWNED');owners.add(owner);claimed=true;}
  const filename=path.join(path.resolve(dir),'content-state.json');
  const write=async state=>{
    if(!persist)return;
    const temporary=filename+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(state));await handle.sync();await handle.close();handle=null;await rename(temporary,filename);}
    finally{if(handle)await handle.close().catch(()=>{});await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  };
  let state;
  try{
    if(persist){await mkdir(path.resolve(dir),{recursive:true,mode:0o700});const canonical=await realpath(path.resolve(dir));const realOwner=process.platform==='win32'?canonical.toLowerCase():canonical;if(realOwner!==owner){if(owners.has(realOwner))throw error(409,'Хранилище уже открыто в этом процессе.','CONTENT_STORE_OWNED');owners.delete(owner);owner=realOwner;owners.add(owner);}
      try{const raw=await readFile(filename,'utf8');if(Buffer.byteLength(raw)>50*1024*1024)throw error(500,'Повреждено хранилище контента.','CONTENT_STORE_CORRUPT');state=validateState(JSON.parse(raw));}catch(e){if(e.code!=='ENOENT')throw e;}
    }
    if(!state){const now=new Date().toISOString(),snapshot=envelope(initial,1,now);state={format:1,draft:clone(snapshot),published:clone(snapshot),history:[clone(snapshot)]};await write(state);}
  }catch(e){if(claimed)owners.delete(owner);throw e;}
  let tail=Promise.resolve(),closed=false,referenceGuard=null;
  const active=()=>{if(closed)throw error(503,'Хранилище контента закрыто.','CONTENT_STORE_CLOSED');};
  const revision=expected=>{if(!Number.isSafeInteger(expected)||expected!==state.draft.revision)throw error(409,'Черновик изменён. Обновите данные и повторите действие.','CONTENT_REVISION_CONFLICT');};
  const queue=operation=>{active();const pending=tail.then(operation);tail=pending.catch(()=>{});return pending;};
  // Every reference-changing operation acquires media before the content queue.
  // Publication uses this same ordering; never acquire media from inside queue().
  const referenceQueue=operation=>referenceGuard?referenceGuard.run(()=>queue(operation)):queue(operation);
  const promote=async next=>{await write(next);state=next;};
  const save=async(content,expected)=>{
    revision(expected);const canonical=validateContent(content);canonical.settings.intake.consentVersion=state.published.content.settings.intake.consentVersion;
    await referenceGuard?.validate(canonical);
    const draft=envelope(canonical,state.draft.revision+1,new Date().toISOString(),state.published.revision,state.published.publishedAt,contentDigest(canonical)!==contentDigest(state.published.content));
    await promote({...state,draft});return clone(draft);
  };
  return {
    attachReferenceGuard(guard){
      active();
      if(referenceGuard)throw error(409,'Медиатека уже связана с хранилищем.','CONTENT_MEDIA_OWNED');
      referenceGuard=guard;
      return ()=>{if(referenceGuard===guard)referenceGuard=null;};
    },
    getDraft(){active();return clone(state.draft);},
    getPublished(){active();return clone(state.published);},
    history(){active();return clone(state.history).reverse();},
    version(value){active();return clone(state.history.find(item=>item.revision===value)??null);},
    references(){active();return new Set([state.draft,state.published,...state.history].flatMap(item=>[...referencedMedia(item.content)]));},
    async saveDraft(content,expectedRevision){const captured=validateContent(content);return referenceQueue(()=>save(captured,expectedRevision));},
    publish(expectedRevision,{documentsConfirmed=false}={}){return queue(async()=>{
      revision(expectedRevision);if(typeof documentsConfirmed!=='boolean')throw error(400,'Некорректное подтверждение документов.','INVALID_CONTENT');
      const content=validateContent(state.draft.content,{forPublication:true});
      if(documentDigest(content)!==documentDigest(state.published.content)&&!documentsConfirmed)throw error(400,'Подтвердите соответствие текста политики и согласия опубликованным файлам.','DOCUMENTS_CONFIRMATION_REQUIRED');
      if(state.draft.revision===state.published.revision)return clone(state.published);
      if(consentDigest(content)!==consentDigest(state.published.content))content.settings.intake.consentVersion=new Date().toISOString().slice(0,10)+'-r'+state.draft.revision+'-'+consentDigest(content).slice(0,12);
      else content.settings.intake.consentVersion=state.published.content.settings.intake.consentVersion;
      const published=envelope(content,state.draft.revision,new Date().toISOString());
      await promote({format:1,draft:clone(published),published,history:[...state.history,clone(published)].slice(-20)});return clone(published);
    });},
    restore(value,expectedRevision){return referenceQueue(async()=>{revision(expectedRevision);const version=state.history.find(item=>item.revision===value);if(!version)throw error(404,'Версия контента не найдена.','CONTENT_VERSION_NOT_FOUND');return save(version.content,expectedRevision);});},
    async close(){if(closed)return tail;closed=true;await tail;if(claimed){owners.delete(owner);claimed=false;}}
  };
}
