import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {openStore} from '../server/storage.mjs';
import {dataKey} from '../server/security.mjs';
const proof=JSON.parse(await readFile(new URL('../output/qa/live-intake-proof.json',import.meta.url),'utf8'));
assert.equal(proof.synthetic,true);assert.match(proof.id,/^[0-9a-f-]{36}$/);
const key=dataKey(process.env.APP_DATA_KEY);assert.ok(key);
const dir=path.resolve(process.env.APP_DATA_DIR||'data');const store=await openStore(dir,key);
try{
 const application=store.get(proof.id);assert.ok(application,'application is persisted in current store');
 assert.equal(application.lastName,'Тестовая');assert.equal(application.firstName,'Проверка');assert.equal(application.email,'test-intake@example.test');assert.equal(application.courseId,'flowers');assert.equal(application.documents.length,2);assert.equal(application.status,'new');
 assert.ok(store.list().some(a=>a.id===proof.id),'same list used by admin contains the application');
 for(const doc of application.documents){const bytes=await readFile(path.join(dir,'files',doc.id+'.enc'));assert.equal(bytes.includes(Buffer.from('TEST DOCUMENT')),false);const decrypted=await store.document(doc.id);assert.ok(decrypted.data.includes(Buffer.from('TEST DOCUMENT - NO PERSONAL DATA')));}
 console.log(JSON.stringify({persisted:true,availableInAdmin:true,encryptedDocuments:2,id:proof.id,synthetic:true}));
}finally{store.close();}
