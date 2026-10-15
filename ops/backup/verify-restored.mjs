#!/usr/bin/env node
// No application startup, network calls, or plaintext private data in output.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {createDecipheriv,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export async function verifyRestored(target){
 let db;
 try{
  const root=await realpath(target);
  if(root===path.parse(root).root)throw Error();
  const safe=async(relative)=>{
   const parts=relative.split('/');if(parts.some(p=>!p||p==='.'||p==='..'))throw Error();
   let current=root;for(const part of parts){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw Error();}
   return current;
  };
  const read=async relative=>readFile(await safe(relative));
  const json=async relative=>JSON.parse((await read(relative)).toString('utf8'));
  const state='var/lib/apkagro',metadata='var/backups/apkagro/metadata';
  const env=parseEnv((await read('etc/apkagro/site.env')).toString('utf8'));
  if(env.APP_DATA_DIR!=='/var/lib/apkagro'||!/^[A-Za-z0-9+/]{43}=$/.test(env.APP_DATA_KEY??''))throw Error();
  const key=Buffer.from(env.APP_DATA_KEY,'base64');
  const decrypt=(value,aad)=>{
   const data=Buffer.from(value);if(data.length<28)throw Error();
   const cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAAD(Buffer.from(aad));cipher.setAuthTag(data.subarray(12,28));
   return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]);
  };
  const admin=await json(state+'/admin.json');
  if(typeof admin.username!=='string'||decrypt(Buffer.from(admin.totp,'base64'),'admin-totp:'+admin.username).length<20)throw Error();
  const metadataValue=await json(metadata+'/deployment.json');
  if(metadataValue.format!==1||!/^[a-f0-9]{40,64}$/.test(metadataValue.release??''))throw Error();
  if(createHash('sha256').update(await read(metadata+'/source.tar.gz')).digest('hex')!==metadataValue.sourceSha256)throw Error();
  const requiredRuntimeFiles=new Set([
   'usr/local/bin/apkagro-scan','etc/nginx/nginx.conf','etc/nginx/conf.d/00-apkagro.conf',
   'etc/nginx/snippets/apkagro-proxy.conf','etc/nginx/snippets/apkagro-tls.conf','etc/nginx/sites-available/apkagro',
   'etc/apkagro/intake-gate.conf','etc/apkagro/backup.env','etc/clamav/clamd.conf','etc/clamav/freshclam.conf',
   'etc/systemd/system/apkagro.service','usr/local/sbin/apkagro-backup','usr/local/sbin/apkagro-backup-status',
   'usr/local/sbin/apkagro-restore','usr/local/lib/apkagro-backup/common.sh','usr/local/lib/apkagro-backup/verify-restored.mjs',
   'etc/systemd/system/apkagro-backup.service','etc/systemd/system/apkagro-backup.timer','etc/systemd/system/apkagro-backup-alert.service',
   'usr/local/sbin/apkagro-domains-finalize','etc/systemd/system/apkagro-domains-finalize.service',
   'etc/systemd/system/apkagro-domains-finalize.timer','etc/nginx/sites-available/apkagro-final'
  ]);
  const runtimeManifest=await json(metadata+'/runtime-files.json');
  if(runtimeManifest.format!==1||!Array.isArray(runtimeManifest.files)||runtimeManifest.files.length!==requiredRuntimeFiles.size)throw Error();
  for(const item of runtimeManifest.files){
   if(!requiredRuntimeFiles.delete(item.path)||item.owner!=='root'||!/^\w[\w-]*$/.test(item.group??'')||!/^[0-7]{3,4}$/.test(item.mode??'')||(parseInt(item.mode,8)&0o022)!==0)throw Error();
   const relative=metadata+'/runtime-root/'+item.path,file=await safe(relative),info=await lstat(file);
   if(!info.isFile()||info.size===0||createHash('sha256').update(await readFile(file)).digest('hex')!==item.sha256)throw Error();
  }
  if(requiredRuntimeFiles.size)throw Error();
  // All reads operate on the isolated copy. SQLite may create a transient shm here.
  await safe(state+'/applications.sqlite');
  for(const suffix of ['-wal','-shm']){try{await safe(state+'/applications.sqlite'+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}}
  db=new DatabaseSync(path.join(root,state,'applications.sqlite'),{readOnly:true});
  if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)throw Error();
  let applications=0,documents=0;
  const seen=new Set(),docRows=db.prepare('SELECT id,applicationId FROM documents').all(),byApp=new Map();
  for(const row of docRows){if(!/^[a-zA-Z0-9-]{1,100}$/.test(row.id))throw Error();if(!byApp.has(row.applicationId))byApp.set(row.applicationId,[]);byApp.get(row.applicationId).push(row.id);}
  for(const row of db.prepare('SELECT id,payload FROM applications').iterate()){
   const fields=JSON.parse(decrypt(row.payload,'application:'+row.id).toString('utf8'));
   if(!Array.isArray(fields.documents))throw Error();
   const linked=byApp.get(row.id)??[];if(linked.length!==fields.documents.length)throw Error();
   for(const doc of fields.documents){
    if(!linked.includes(doc.id)||seen.has(doc.id))throw Error();
    const bytes=decrypt(await read(state+'/files/'+doc.id+'.enc'),'document:'+doc.id);
    if(!Number.isSafeInteger(doc.size)||bytes.length!==doc.size)throw Error();seen.add(doc.id);documents++;
   }
   applications++;
  }
  if(documents!==docRows.length)throw Error();
  const content=await json(state+'/content/content-state.json'),media=await json(state+'/content/media/media.json');
  if(content.format!==1||media.format!==1||!Array.isArray(content.history)||!content.history.length||!Array.isArray(media.media))throw Error();
  const urls=new Set();
  for(const item of media.media){
   if(!/^[a-f0-9-]{36}$/.test(item.id??'')||!['png','jpg','jpeg','webp','avif','pdf','docx'].includes(item.ext)||item.url!=='/media/'+item.id+'.'+item.ext||urls.has(item.url))throw Error();
   const bytes=await read(state+'/content/media/'+item.id+'.'+item.ext);
   if(bytes.length!==item.size||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error();urls.add(item.url);
  }
  const referenceCheck=value=>{if(typeof value==='string'&&value.startsWith('/media/')&&!urls.has(value))throw Error();if(value&&typeof value==='object')for(const child of Object.values(value))referenceCheck(child);};
  for(const snapshot of [content.draft,content.published,...content.history]){
   if(!snapshot||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||!snapshot.content)throw Error();referenceCheck(snapshot.content);
  }
  return {verified:true,applications,documents,media:media.media.length,release:metadataValue.release};
 }catch{
  // Never echo ciphertext, parsed environment, admin identifiers, or SQL content.
  throw new Error('Restore verification failed: inspect the isolated copy privately.');
 }finally{db?.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{if(process.argv.length!==3)throw Error();console.log(JSON.stringify(await verifyRestored(process.argv[2])));}
 catch{console.error('Restore verification failed. No production data was changed.');process.exitCode=1;}
}
