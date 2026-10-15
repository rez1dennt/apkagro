import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,rename,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {verifyRestored} from './verify-restored.mjs';
import {encrypt} from '../../server/security.mjs';

async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'apkagro-restore-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const state=path.join(root,'var/lib/apkagro'),meta=path.join(root,'var/backups/apkagro/metadata');
 await Promise.all([mkdir(path.join(state,'files'),{recursive:true}),mkdir(path.join(state,'content/media'),{recursive:true}),mkdir(meta,{recursive:true}),mkdir(path.join(root,'etc/apkagro'),{recursive:true})]);
 const key=randomBytes(32),id='app-fixture',doc='doc-fixture';
 await writeFile(path.join(root,'etc/apkagro/site.env'),'APP_DATA_KEY='+key.toString('base64')+'\nAPP_DATA_DIR=/var/lib/apkagro\n');
 await writeFile(path.join(state,'admin.json'),JSON.stringify({username:'test-admin',totp:encrypt(randomBytes(20),key,'admin-totp:test-admin').toString('base64')}));
 const db=new DatabaseSync(path.join(state,'applications.sqlite'));db.exec('PRAGMA foreign_keys=ON; CREATE TABLE applications (id TEXT PRIMARY KEY,payload BLOB); CREATE TABLE documents (id TEXT PRIMARY KEY,applicationId TEXT REFERENCES applications(id));');
 db.prepare('INSERT INTO applications VALUES(?,?)').run(id,encrypt(Buffer.from(JSON.stringify({documents:[{id:doc,size:7}]})),key,'application:'+id));db.prepare('INSERT INTO documents VALUES(?,?)').run(doc,id);db.close();
 await writeFile(path.join(state,'files',doc+'.enc'),encrypt(Buffer.from('fixture'),key,'document:'+doc));
 const mediaId='10000000-0000-4000-8000-000000000000',url='/media/'+mediaId+'.png',data=Buffer.from('fake-image');
 const content={example:url},snapshot={revision:1,publishedRevision:1,dirty:false,content};
 await writeFile(path.join(state,'content/content-state.json'),JSON.stringify({format:1,draft:snapshot,published:snapshot,history:[snapshot]}));
 await writeFile(path.join(state,'content/media/media.json'),JSON.stringify({format:1,media:[{id:mediaId,ext:'png',url,size:data.length,sha256:createHash('sha256').update(data).digest('hex')}]}));
 await writeFile(path.join(state,'content/media',mediaId+'.png'),data);
 const archive=Buffer.from('source-archive-fixture');await writeFile(path.join(meta,'source.tar.gz'),archive);
 await writeFile(path.join(meta,'deployment.json'),JSON.stringify({format:1,release:'a'.repeat(40),sourceSha256:createHash('sha256').update(archive).digest('hex')}));
 const runtimeFiles=[
  'usr/local/bin/apkagro-scan','etc/nginx/nginx.conf','etc/nginx/conf.d/00-apkagro.conf',
  'etc/nginx/snippets/apkagro-proxy.conf','etc/nginx/snippets/apkagro-tls.conf','etc/nginx/sites-available/apkagro',
  'etc/apkagro/intake-gate.conf','etc/apkagro/backup.env','etc/clamav/clamd.conf','etc/clamav/freshclam.conf',
  'etc/systemd/system/apkagro.service','usr/local/sbin/apkagro-backup','usr/local/sbin/apkagro-backup-status',
  'usr/local/sbin/apkagro-restore','usr/local/lib/apkagro-backup/common.sh','usr/local/lib/apkagro-backup/verify-restored.mjs',
  'etc/systemd/system/apkagro-backup.service','etc/systemd/system/apkagro-backup.timer','etc/systemd/system/apkagro-backup-alert.service',
  'usr/local/sbin/apkagro-domains-finalize','etc/systemd/system/apkagro-domains-finalize.service',
  'etc/systemd/system/apkagro-domains-finalize.timer','etc/nginx/sites-available/apkagro-final'
 ];
 const files=[];
 for(const file of runtimeFiles){const target=path.join(meta,'runtime-root',file),value=Buffer.from('synthetic-runtime-fixture: '+file+'\n');await mkdir(path.dirname(target),{recursive:true,mode:0o700});await writeFile(target,value,{mode:0o600});files.push({path:file,mode:'600',owner:'root',group:'root',sha256:createHash('sha256').update(value).digest('hex')});}
 await writeFile(path.join(meta,'runtime-files.json'),JSON.stringify({format:1,files}),{mode:0o600});
 return {root,state,meta,key,doc};
}
test('verifies SQLite, encrypted records, TOTP, media, source digest and CMS references without exposing content',async t=>{const f=await fixture(t);assert.deepEqual(await verifyRestored(f.root),{verified:true,applications:1,documents:1,media:1,release:'a'.repeat(40)});});
test('wrong recovered key fails authenticated decryption',async t=>{const f=await fixture(t);await writeFile(path.join(f.root,'etc/apkagro/site.env'),'APP_DATA_KEY='+randomBytes(32).toString('base64')+'\nAPP_DATA_DIR=/var/lib/apkagro\n');await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('a missing encrypted attachment fails recovery',async t=>{const f=await fixture(t);await rm(path.join(f.state,'files',f.doc+'.enc'));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('a corrupt media file fails recovery',async t=>{const f=await fixture(t);await writeFile(path.join(f.state,'content/media/10000000-0000-4000-8000-000000000000.png'),'damaged');await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('modified source archive fails its deployment digest',async t=>{const f=await fixture(t);await writeFile(path.join(f.meta,'source.tar.gz'),'bad archive');await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('SQLite damage fails before being used as recovery data',async t=>{const f=await fixture(t);await writeFile(path.join(f.state,'applications.sqlite'),randomBytes(1024));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('a changed admin identity fails the TOTP authentication binding',async t=>{const f=await fixture(t);const admin=JSON.parse(await readFile(path.join(f.state,'admin.json'),'utf8'));admin.username='invalid';await writeFile(path.join(f.state,'admin.json'),JSON.stringify(admin));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('tampered attachment ciphertext fails authenticated decryption',async t=>{const f=await fixture(t);const file=path.join(f.state,'files',f.doc+'.enc'),bytes=await readFile(file);bytes[bytes.length-1]^=1;await writeFile(file,bytes);await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('CMS references to missing media fail recovery',async t=>{const f=await fixture(t);const file=path.join(f.state,'content/content-state.json'),value=JSON.parse(await readFile(file,'utf8'));value.draft.content.example='/media/20000000-0000-4000-8000-000000000000.png';await writeFile(file,JSON.stringify(value));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('symlinked media directories cannot redirect verification outside its snapshot path',async t=>{const f=await fixture(t);const media=path.join(f.state,'content/media'),other=path.join(f.root,'outside-media');await rename(media,other);await symlink(other,media,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('a missing installed scanner fails recovery even when application data is intact',async t=>{const f=await fixture(t);await rm(path.join(f.meta,'runtime-root/usr/local/bin/apkagro-scan'));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('altered runtime configuration fails its captured hash',async t=>{const f=await fixture(t);await writeFile(path.join(f.meta,'runtime-root/etc/nginx/snippets/apkagro-tls.conf'),'changed');await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
test('an incomplete runtime manifest cannot silently omit a required ClamAV configuration',async t=>{const f=await fixture(t);const manifest=path.join(f.meta,'runtime-files.json'),value=JSON.parse(await readFile(manifest,'utf8'));value.files=value.files.filter(file=>file.path!=='etc/clamav/clamd.conf');await writeFile(manifest,JSON.stringify(value));await assert.rejects(()=>verifyRestored(f.root),/verification/i);});
