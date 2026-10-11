import {CONSENT_VERSION} from '../public/assets/js/organization.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import http from 'node:http';

const moduleExists = await import('../server/app.mjs');
test('secured backend module exposes application factory',()=>assert.equal(typeof moduleExists?.createApp,'function'));

if(moduleExists){
 const {createApp}=moduleExists;
 const {setupAdmin,totp}=await import('../server/security.mjs');
 const ExcelJS=(await import('exceljs')).default;
 async function fixture(intake=true,overrides={}){
  const dir=await mkdtemp(path.join(process.cwd(),'.server-test-'));
  const key=randomBytes(32); const secret=randomBytes(20);
  await setupAdmin(dir,key,'test-admin','synthetic-unique-password-734!',secret);
  const app=await createApp({dataDir:dir,key,intakeEnabled:intake,origin:'http://127.0.0.1:0',testDynamicOrigin:true,...overrides});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  let cookie='',csrf='';
  async function req(url,options={}){
   const headers={cookie,...(overrides.production?{host:new URL(overrides.origin).host,'x-forwarded-proto':'https','x-real-ip':'198.51.100.10'}:{}),...options.headers};
   if(options.method&&options.method!=='GET'){headers.origin=overrides.production?overrides.origin:origin;headers['x-csrf-token']=csrf;}
   const requestHeaders={...headers,...options.headers};
   for(const [name,value]of Object.entries(requestHeaders))if(value===null)delete requestHeaders[name];
   let res;
   if(overrides.production){
    // Simulate a TLS proxy by connecting to loopback HTTP while preserving the public Host.
    const encoded=options.body instanceof FormData?new Request(origin+url,{method:options.method,body:options.body}):null;
    const body=encoded?Buffer.from(await encoded.arrayBuffer()):options.body;
    if(encoded)requestHeaders['content-type']=encoded.headers.get('content-type');
    res=await new Promise((resolve,reject)=>{const outgoing=http.request(origin+url,{method:options.method??'GET',headers:requestHeaders},incoming=>{const chunks=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>{const responseHeaders=new Headers();for(let i=0;i<incoming.rawHeaders.length;i+=2)responseHeaders.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode,headers:responseHeaders}));});});outgoing.on('error',reject);outgoing.end(body);});
   }else res=await fetch(origin+url,{...options,headers:requestHeaders});
   const set=res.headers.getSetCookie(); if(set.length)cookie=set.map(s=>s.split(';')[0]).join('; ');
   return res;
  }
  const cr=await req('/api/csrf');assert.equal(cr.status,200,await cr.clone().text());csrf=(await cr.json()).token;
  const login=async(otp=totp(secret),password='synthetic-unique-password-734!')=>req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test-admin',password,otp})});
  const authorize=async(otp=totp(secret))=>{const r=await login(otp);assert.equal(r.status,200);csrf=(await r.json()).csrfToken;};
  const close=async()=>{await new Promise(r=>app.server.close(r));app.close();await rm(dir,{recursive:true,force:true});};
  return {dir,key,secret,origin,req,login,authorize,close};
 }
 function form(extra={},file=Buffer.from('%PDF-1.4\nsynthetic document\n%%EOF')){
  const f=new FormData(); const fields={courseId:'drone',lastName:'Тестовый',firstName:'Тестер',middleName:'',birthDate:'1990-01-01',phone:'+79991234567',email:'synthetic@example.test',snils:'112-233-445 95',education:'professional',consent:'true',consentVersion:CONSENT_VERSION,website:'',...extra};
  for(const [k,v]of Object.entries(fields))f.append(k,v);
  f.append('snilsFile',new Blob([file],{type:'application/pdf'}),'snils.pdf');
  f.append('educationFile',new Blob([Buffer.from('%PDF-1.4\nsynthetic diploma\n%%EOF')],{type:'application/pdf'}),'diploma.pdf');return f;
 }
 test('anonymous admin routes and private paths are inaccessible',async()=>{const f=await fixture();try{for(const p of ['/api/admin/applications','/api/admin/applications/abc','/api/admin/documents/abc','/api/admin/export'])assert.equal((await f.req(p)).status,401);for(const p of ['/data/admin.json','/.env','/server/app.mjs','/%2e%2e/.env'])assert.equal((await f.req(p)).status,404);}finally{await f.close();}});
 test('CSRF and cross-origin protections fail closed',async()=>{const f=await fixture();try{assert.equal((await f.req('/api/admin/login',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'})).status,403);assert.equal((await f.req('/api/admin/login',{method:'POST',headers:{'x-csrf-token':'wrong'},body:'{}'})).status,403);}finally{await f.close();}});
 test('password and OTP required, TOTP replay prevented and logout invalidates',async()=>{
  const f=await fixture(),realNow=Date.now;let time=realNow();Date.now=()=>time;
  try{
   assert.equal((await f.login('invalid','wrong')).status,401);
   assert.equal((await f.login('invalid')).status,401);
   const otp=totp(f.secret);await f.authorize(otp);
   assert.equal((await f.req('/api/admin/session')).status,200);
   time+=30000;
   assert.equal((await f.login(otp)).status,401);
   assert.equal((await f.req('/api/admin/logout',{method:'POST'})).status,200);
   assert.equal((await f.req('/api/admin/applications')).status,401);
  }finally{Date.now=realNow;await f.close();}
 });
 test('intake configuration disabled by default',async()=>{const f=await fixture(false);try{assert.equal((await (await f.req('/api/config')).json()).enabled,false);assert.equal((await f.req('/api/applications',{method:'POST',body:form()})).status,503);}finally{await f.close();}});
 test('invalid signatures, over-size and invalid field data rejected',async()=>{const f=await fixture();try{for(const body of [form({},Buffer.from('<svg>bad</svg>')),form({},Buffer.alloc(10*1024*1024+1)),form({snils:'11223344500'}),form({birthDate:'2099-01-01'}),form({consent:'false'})])assert.equal((await f.req('/api/applications',{method:'POST',body})).status,400);}finally{await f.close();}});
 test('roundtrip encrypted application, private download and safe XLSX',async()=>{const f=await fixture();try{const r=await f.req('/api/applications',{method:'POST',body:form({email:'=test@example.test'})});assert.equal(r.status,201);const {id}=await r.json();await f.authorize();const list=await(await f.req('/api/admin/applications')).json();assert.equal(list.total,1);assert.equal(list.applications[0].id,id);const detail=await(await f.req('/api/admin/applications/'+id)).json();assert.equal(detail.snils,'11223344595');assert.equal(detail.documents.length,2);const doc=await f.req('/api/admin/documents/'+detail.documents[0].id);assert.equal(doc.status,200);assert.match(doc.headers.get('content-disposition'),/^attachment/);assert.match(await doc.text(),/%PDF/);assert.equal((await f.req('/api/admin/applications/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:'{"status":"review"}'})).status,200);const exportRes=await f.req('/api/admin/export');assert.equal(exportRes.status,200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await exportRes.arrayBuffer()));assert.equal(workbook.worksheets[0].getCell('A1').value,'Номер заявки');assert.equal(workbook.worksheets[0].getCell('C2').value,'На проверке');assert.match(workbook.worksheets[0].getCell('D2').value,/БАС/);let found=false;workbook.eachSheet(s=>s.eachRow(r=>r.eachCell(c=>{assert.notEqual(c.type,ExcelJS.ValueType.Formula);if(c.value==='=test@example.test')found=true;})));assert.equal(found,true);for(const name of await readdir(f.dir)){const statpath=path.join(f.dir,name);if(name==='files'){for(const file of await readdir(statpath)){assert.equal((await readFile(path.join(statpath,file))).includes(Buffer.from('synthetic')),false);}}else{const data=await readFile(statpath);assert.equal(data.includes(Buffer.from('Тестовый')),false);assert.equal(data.includes(Buffer.from('=test@example.test')),false);assert.equal(data.includes(Buffer.from('11223344595')),false);}}}finally{await f.close();}});
 test('production rejects missing security prerequisites',async()=>{await assert.rejects(()=>createApp({production:true,origin:'http://example.test'}));await assert.rejects(()=>createApp({production:true,origin:'https://example.test',key:randomBytes(32)}));});
 test('intake rejects duplicate files, mismatched extensions and stale consent',async()=>{const f=await fixture();try{const duplicate=form();duplicate.append('snilsFile',new Blob([Buffer.from('%PDF-1.4\n%%EOF')],{type:'application/pdf'}),'a.pdf');const disguised=form();disguised.set('snilsFile',new Blob([Buffer.from('%PDF-1.4\n%%EOF')],{type:'application/pdf'}),'image.svg');for(const body of [duplicate,disguised,form({consentVersion:'old'})])assert.equal((await f.req('/api/applications',{method:'POST',body})).status,400);}finally{await f.close();}});
 test('login throttles after bounded attempts and ignores forwarded IP',async()=>{const f=await fixture();try{for(let i=0;i<10;i++){const res=await f.req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':`1.2.3.${i}`},body:'{"username":"missing","password":"wrong","otp":"123456"}'});assert.equal(res.status,401);}assert.equal((await f.login()).status,429);}finally{await f.close();}});
 test('admin mutation requires session CSRF and restricts statuses',async()=>{const f=await fixture();try{const created=await(await f.req('/api/applications',{method:'POST',body:form()})).json();await f.authorize();assert.equal((await f.req('/api/admin/applications/'+created.id,{method:'PATCH',headers:{'content-type':'application/json','x-csrf-token':'wrong'},body:'{"status":"review"}'})).status,403);assert.equal((await f.req('/api/admin/applications/'+created.id,{method:'PATCH',headers:{'content-type':'application/json'},body:'{"status":"unknown"}'})).status,400);}finally{await f.close();}});
 test('intake requests with missing origin are rejected',async()=>{const f=await fixture();try{assert.equal((await f.req('/api/applications',{method:'POST',headers:{origin:''},body:form()})).status,403);}finally{await f.close();}});
 test('exact ten MiB boundary accepts a file and rejects one byte over',async()=>{const f=await fixture();try{const file=Buffer.alloc(10*1024*1024);file.write('%PDF-1.4\n');file.write('%%EOF',file.length-5);assert.equal((await f.req('/api/applications',{method:'POST',body:form({},file)})).status,201);const oversized=Buffer.concat([file,Buffer.from('x')]);assert.equal((await f.req('/api/applications',{method:'POST',body:form({},oversized)})).status,400);}finally{await f.close();}});
 test('preview starts without storage, key or admin and intake stays disabled',async()=>{const dir=await mkdtemp(path.join(process.cwd(),'.server-test-'));const app=await createApp({dataDir:dir,origin:'http://127.0.0.1:0',testDynamicOrigin:true,intakeEnabled:true});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{const res=await fetch(`http://127.0.0.1:${app.server.address().port}/api/config`);assert.equal((await res.json()).enabled,false);assert.deepEqual(await readdir(dir),[]);}finally{await new Promise(r=>app.server.close(r));app.close();await rm(dir,{recursive:true,force:true});}});
 test('concurrent password derivation is bounded to one and cannot reuse OTP',async()=>{const f=await fixture();try{const results=await Promise.all([f.login(),f.login()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);}finally{await f.close();}});
 test('admin session expires after idle timeout and absolute eight-hour lifetime',async()=>{const realNow=Date.now;const f=await fixture();try{await f.authorize();const start=realNow();Date.now=()=>start+31*60*1000;assert.equal((await f.req('/api/admin/applications')).status,401);}finally{Date.now=realNow;await f.close();}const g=await fixture();try{await g.authorize();const start=realNow();let advanced=0;Date.now=()=>start+advanced;for(let i=1;i<=24;i++){advanced=i*20*60*1000;assert.equal((await g.req('/api/admin/session')).status,200);}advanced=8*60*60*1000+1;assert.equal((await g.req('/api/admin/applications')).status,401);}finally{Date.now=realNow;await g.close();}});
 test('TOTP consumption survives application restart',async()=>{const f=await fixture();let second;try{const counter=totp(f.secret);await f.authorize(counter);second=await createApp({dataDir:f.dir,key:f.key,intakeEnabled:true,origin:'http://127.0.0.1:0',testDynamicOrigin:true});await new Promise(r=>second.server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${second.server.address().port}`,csrfRes=await fetch(origin+'/api/csrf'),cookie=csrfRes.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),csrf=(await csrfRes.json()).token;const res=await fetch(origin+'/api/admin/login',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({username:'test-admin',password:'synthetic-unique-password-734!',otp:counter})});assert.equal(res.status,401);}finally{if(second){await new Promise(r=>second.server.close(r));second.close();}await f.close();}});
 const productionProxy={production:true,origin:'https://approved.example',testDynamicOrigin:false,trustedProxy:'127.0.0.1',legalsReady:true,scannerCommand:process.execPath};
 test('trusted proxy client addresses receive independent intake, login and CSRF budgets',async()=>{const f=await fixture(true,productionProxy);try{
  for(let i=0;i<10;i++)assert.equal((await f.req('/api/applications',{method:'POST',body:form({snils:'invalid'})})).status,400);
  assert.equal((await f.req('/api/applications',{method:'POST',body:form({snils:'invalid'})})).status,429);
  assert.equal((await f.req('/api/applications',{method:'POST',headers:{'x-real-ip':'198.51.100.11'},body:form({snils:'invalid'})})).status,400);
  for(let i=0;i<10;i++)assert.equal((await f.req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'missing-'+i,password:'wrong',otp:'invalid'})})).status,401);
  assert.equal((await f.req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,429);
  assert.equal((await f.req('/api/admin/login',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'198.51.100.11'},body:JSON.stringify({username:'missing-other',password:'wrong',otp:'invalid'})})).status,401);
  for(let i=0;i<119;i++)assert.equal((await f.req('/api/csrf')).status,200);
  assert.equal((await f.req('/api/csrf')).status,429);
  assert.equal((await f.req('/api/csrf',{headers:{'x-real-ip':'198.51.100.11'}})).status,200);
 }finally{await f.close();}});
 test('production rejects missing, malformed or multiple proxy client addresses',async()=>{const f=await fixture(true,productionProxy);try{for(const address of [null,'', 'unknown','198.51.100.1, 198.51.100.2',['198.51.100.1','198.51.100.2'],'198.51.100.1:123','::ffff:198.51.100.1','fe80::1%eth0']){const res=await f.req('/api/config',{headers:{'x-real-ip':address}});assert.equal(res.status,400);assert.equal((await res.json()).code,'PROXY_CLIENT_IP');}assert.equal((await f.req('/api/config',{headers:{'x-real-ip':'2001:db8::1'}})).status,200);}finally{await f.close();}});
 test('untrusted requests cannot spoof client budgets with x-real-ip',async()=>{const f=await fixture();try{for(let i=0;i<10;i++)assert.equal((await f.req('/api/applications',{method:'POST',headers:{'x-real-ip':`198.51.100.${i}`},body:form({snils:'invalid'})})).status,400);assert.equal((await f.req('/api/applications',{method:'POST',headers:{'x-real-ip':'198.51.100.55'},body:form({snils:'invalid'})})).status,429);}finally{await f.close();}});
 test('HTTP malformed unknown and duplicate uploads return 400 and server remains alive',async()=>{const f=await fixture();try{const part=field=>'--boundary\r\nContent-Disposition: form-data; name="'+field+'"; filename="file.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n%%EOF';for(const body of [part('unexpectedFile'),part('snilsFile')+'\r\n'+part('snilsFile')]){assert.equal((await f.req('/api/applications',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=boundary'},body})).status,400);assert.equal((await f.req('/api/config')).status,200);}}finally{await f.close();}});
 test('background polling cannot extend administrator idle session',async()=>{const f=await fixture();const realNow=Date.now;try{await f.authorize();const start=realNow();Date.now=()=>start+29*60*1000;assert.equal((await f.req('/api/admin/applications?poll=1')).status,200);Date.now=()=>start+31*60*1000;assert.equal((await f.req('/api/admin/applications?poll=1')).status,401);}finally{Date.now=realNow;await f.close();}});
}
