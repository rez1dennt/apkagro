import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const git=(args)=>{
  const result=spawnSync('git',args,{encoding:null,maxBuffer:32*1024*1024});
  if(result.status!==0)throw new Error('Git inspection failed.');
  return result.stdout;
};
const files=git(['ls-files','--cached','-z']).toString().split('\0').filter(Boolean);
if(!files.length)throw new Error('No staged files to audit.');
const forbidden=/(^|\/)(?:data|output|node_modules|\.serena|\.codex|\.agents|\.vscode|\.idea|private-access|\.server-test-[^/]*|\.browser-test-[^/]*)(?:\/|$)|(?:^|\/)\.env(?:$|\.)|\.(?:db(?:-[^/]*)?|sqlite3?(?:-[^/]*)?|enc|pem|key|p12|pfx)$|(?:authenticator-qr|qr-code)\./i;
const fingerprints=[];
try{
  const env=await readFile(new URL('../.env',import.meta.url),'utf8');
  for(const line of env.split(/\r?\n/)){
    const match=line.match(/^([A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*)=(.+)$/i);
    if(match&&match[2].trim().length>=16){const value=match[2].trim().replace(/^['"]|['"]$/g,'');fingerprints.push(Buffer.from(value));if(match[1]==='APP_DATA_KEY')fingerprints.push(Buffer.from(Buffer.from(value,'base64').toString('hex')));}
  }
}catch(error){if(error.code!=='ENOENT')throw error;}
try{
  const enrollment=JSON.parse(await readFile(new URL('../data/admin.json',import.meta.url),'utf8'));
  function collect(value,sensitive=false){
    if(typeof value==='string'&&sensitive&&value.length>=16)fingerprints.push(Buffer.from(value));
    else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))collect(child,sensitive||/password|hash|salt|secret|totp|key/i.test(key));
  }
  collect(enrollment);
}catch(error){if(error.code!=='ENOENT')throw error;}
const patterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /gh[pousr]_[A-Za-z0-9_]{30,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /otpauth:\/\/[^\s"']*[?&]secret=[A-Z2-7]{16,}/
];
const findings=[];let totalBytes=0;
for(const file of files){
  if(file!=='.env.example'&&forbidden.test(file)){findings.push({file,reason:'private/runtime path'});continue;}
  const bytes=git(['show',':'+file]);totalBytes+=bytes.length;
  if(fingerprints.some(secret=>bytes.includes(secret)))findings.push({file,reason:'matches local private credential material'});
  if(patterns.some(pattern=>pattern.test(bytes.toString('utf8'))))findings.push({file,reason:'possible embedded credential'});
  if(bytes.length>10*1024*1024)findings.push({file,reason:'unexpected large file'});
}
for(const value of fingerprints)value.fill(0);
console.log(JSON.stringify({stagedFiles:files.length,totalBytes,privateMaterialCompared:fingerprints.length,findings},null,2));
if(findings.length)process.exitCode=1;
