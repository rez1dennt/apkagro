import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {validateFields} from '../server/intake.mjs';

test('public documents are downloadable without login and consent uses the new organization edition', async () => {
  const prefix=path.join(process.cwd(), '.server-test-documents-'), dir=await mkdtemp(prefix);
  const app=await createApp({dataDir:dir, origin:'http://127.0.0.1:0', testDynamicOrigin:true});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await (await fetch(base+'/api/config')).json()).consentVersion,'2026-10-11');
    for(const [file,type,signature] of [['consent.pdf','application/pdf','%PDF'],['consent.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','PK'],['privacy-policy.pdf','application/pdf','%PDF'],['license-extract.pdf','application/pdf','%PDF']]){
      const response=await fetch(base+'/documents/'+file);
      assert.equal(response.status,200,file);assert.equal(response.headers.get('content-type'),type,file);
      assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0,8).toString().startsWith(signature),file);
    }
    const fields={courseId:'flowers',lastName:'Тестовый',firstName:'Участник',middleName:'',birthDate:'1990-01-01',phone:'+79991234567',email:'test@example.test',snils:'11223344595',education:'professional',consent:'true',consentVersion:'2026-10-11'};
    assert.equal(validateFields(fields).consentVersion,'2026-10-11');
    assert.throws(()=>validateFields({...fields,consentVersion:'2026-10-09'}),/актуальное согласие/);
  } finally {
    await new Promise(resolve=>app.server.close(resolve));app.close();
    assert.ok(path.resolve(dir).startsWith(path.resolve(prefix)));
    await rm(dir,{recursive:true,force:true});
  }
});
