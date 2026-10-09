import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {encrypt,decrypt} from './security.mjs';

export async function openStore(dir,key){
 await mkdir(path.join(dir,'files'),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path.join(dir,'applications.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL,status TEXT NOT NULL,payload BLOB NOT NULL); CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY,applicationId TEXT NOT NULL REFERENCES applications(id)); CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY,time TEXT,event TEXT,reference TEXT);');
 const unpack=row=>row?{...JSON.parse(decrypt(row.payload,key,'application:'+row.id).toString()),id:row.id,createdAt:row.createdAt,status:row.status}:null;
 const get=id=>unpack(db.prepare('SELECT * FROM applications WHERE id=?').get(id));
 const audit=(event,reference='')=>db.prepare('INSERT INTO audit(time,event,reference) VALUES(?,?,?)').run(new Date().toISOString(),event,reference);
 return {
  async save(fields,files){const id=randomUUID(),createdAt=new Date().toISOString();const documents=[];const written=[];try{for(const file of files){const documentId=randomUUID();await writeFile(path.join(dir,'files',documentId+'.enc'),encrypt(file.data,key,'document:'+documentId),{mode:0o600,flag:'wx'});written.push(documentId);documents.push({id:documentId,name:file.name,mime:file.mime,size:file.data.length,field:file.field});}db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO applications VALUES(?,?,?,?)').run(id,createdAt,'new',encrypt(Buffer.from(JSON.stringify({...fields,consentAt:createdAt,reference:id,documents})),key,'application:'+id));for(const doc of documents)db.prepare('INSERT INTO documents VALUES(?,?)').run(doc.id,id);audit('application.created',id);db.exec('COMMIT');return id;}catch(e){try{db.exec('ROLLBACK');}catch{}for(const doc of written)await unlink(path.join(dir,'files',doc+'.enc')).catch(()=>{});throw e;}},
  list:()=>db.prepare('SELECT * FROM applications ORDER BY createdAt DESC').all().map(unpack),get,
  update(id,status){const info=db.prepare('UPDATE applications SET status=? WHERE id=?').run(status,id);if(info.changes)audit('application.status',id);return Boolean(info.changes);},
  async document(id){const row=db.prepare('SELECT applicationId FROM documents WHERE id=?').get(id);if(!row)return null;const app=get(row.applicationId),meta=app.documents.find(doc=>doc.id===id);return {meta,data:decrypt(await readFile(path.join(dir,'files',id+'.enc')),key,'document:'+id)};},
  audit,close:()=>db.close()
 };
}
