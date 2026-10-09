import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

function probe(kind){
 const source=`
  import {Readable,PassThrough} from 'node:stream';
  import {parseMultipart} from './server/intake.mjs';
  const kind=${JSON.stringify(kind)};
  const part=(field)=>'--boundary\\r\\nContent-Disposition: form-data; name="'+field+'"; filename="file.pdf"\\r\\nContent-Type: application/pdf\\r\\n\\r\\n%PDF-1.4\\n%%EOF';
  const body=kind==='duplicate'?part('snilsFile')+'\\r\\n'+part('snilsFile'):part('unexpectedFile');
  const req=['aborted','request-error'].includes(kind)?new PassThrough():Readable.from([Buffer.from(body)]);
  req.headers={'content-type':'multipart/form-data; boundary=boundary'};
  const result=parseMultipart(req).then(()=>{throw new Error('Malformed form accepted');},e=>{if(e.status!==400)throw e;});
  if(kind==='aborted'){req.write(body);setImmediate(()=>{req.emit('aborted');req.destroy();});}
  if(kind==='request-error'){req.write(body);setImmediate(()=>req.destroy(new Error('Synthetic disconnected upload')));}
  await result;
  await new Promise(resolve=>setImmediate(resolve));
  console.log('safe rejection');
 `;
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',source],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));});
}
for(const kind of ['unknown','duplicate','aborted','request-error'])test(`malformed ${kind} file stream is safely rejected without process crash`,async()=>{const result=await probe(kind);assert.equal(result.code,0,result.stderr);assert.match(result.stdout,/safe rejection/);});
