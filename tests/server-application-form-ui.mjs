import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {createCustomField} from '../public/assets/js/application-fields.js';
import {setupAdmin} from '../server/security.mjs';
test('HTTP application errors identify trusted field IDs without values or attacker keys',async t=>{
 const dir=await mkdtemp(path.join('output','form-ui-http-')),key=randomBytes(32);await setupAdmin(dir,key,'synthetic-ui','synthetic-only-ui-password!',randomBytes(20));const app=await createApp({dataDir:dir,key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));await app.close();await rm(dir,{recursive:true,force:true});});const origin='http://127.0.0.1:'+app.server.address().port,{store,media}=await app.getContentServices(),field=createCustomField('text',{label:'Номер паспорта'});field.rules={format:'digits',minLength:6,maxLength:6};let draft=store.getDraft();draft.content.applicationForm.fields=[field];draft.content.settings.intake.deadline='';draft=await store.saveDraft(draft.content,draft.revision);await media.publish(draft.revision,{documentsConfirmed:true});const config=await(await fetch(origin+'/api/config')).json(),csrfResponse=await fetch(origin+'/api/csrf'),cookie=csrfResponse.headers.getSetCookie().map(c=>c.split(';')[0]).join('; '),csrf=(await csrfResponse.json()).token;
 const submit=async(id,value)=>{const body=new FormData();for(const [name,v]of Object.entries({courseId:'drone',contentRevision:String(config.contentRevision),consent:'true',consentVersion:config.consentVersion,[id]:value}))body.append(name,v);return fetch(origin+'/api/applications',{method:'POST',body,headers:{origin,cookie,'x-csrf-token':csrf}});};
 const response=await submit(field.id,'12ab34');assert.equal(response.status,400);const error=await response.json();assert.equal(typeof error.fieldErrors?.[field.id],'string');assert.equal(JSON.stringify(error).includes('12ab34'),false);const unknown=await(await submit('attacker','private-value')).json();assert.equal(unknown.fieldErrors,undefined);assert.equal(JSON.stringify(unknown).includes('private-value'),false);
});
