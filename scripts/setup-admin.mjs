import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dataKey,setupAdmin,base32,verifyTotp} from '../server/security.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if(!process.stdin.isTTY){console.error('Admin setup requires an interactive local terminal. No credentials were written.');process.exit(1);}
const key=dataKey(process.env.APP_DATA_KEY);if(!key){console.error('Configure APP_DATA_KEY with a secret manager before setup. No key is generated automatically.');process.exit(1);}
const dir=path.resolve(process.env.APP_DATA_DIR??path.join(root,'data'));
let hidden=false;const output=new Writable({write(chunk,encoding,done){if(!hidden)process.stdout.write(chunk);done();}});
const readline=createInterface({input:process.stdin,output,terminal:true});
async function prompt(text,mask=false){process.stdout.write(text);hidden=mask;try{return await readline.question('');}finally{hidden=false;if(mask)process.stdout.write('\n');}}
try{
 const exists=await stat(path.join(dir,'admin.json')).then(()=>true,()=>false);if(exists){const confirm=await prompt('Administrator already exists. Type REPLACE to revoke existing enrollment (stop server first): ');if(confirm!=='REPLACE')throw new Error('Cancelled');}
 const username=(await prompt('Admin username (3–64 Latin letters, digits . _ -): ')).trim();
 const password=await prompt('Unique password, at least 16 characters (hidden): ',true);
 if(password.length<16||password.length>128)throw new Error('Password must contain 16–128 characters');
 if(password!==await prompt('Repeat password (hidden): ',true))throw new Error('Passwords do not match');
 const secret=randomBytes(20),encoded=base32(secret);process.stdout.write('\nSave this enrollment in a private authenticator. Do not share or screenshot it.\n');process.stdout.write(`Manual secret: ${encoded}\n`);process.stdout.write(`otpauth://totp/${encodeURIComponent('Agrarian Admin:'+username)}?secret=${encoded}&issuer=Agrarian%20Admin&algorithm=SHA1&digits=6&period=30\n`);
 const otp=await prompt('Enter current 6-digit authenticator code to confirm enrollment: ',true);const counter=verifyTotp(secret,otp);if(counter<0)throw new Error('Code did not match. Nothing saved');
 await setupAdmin(dir,key,username,password,secret,counter);secret.fill(0);process.stdout.write('Administrator saved with mandatory TOTP. Protect the data directory with OS access controls. Restart the server.\n');
}catch(e){console.error(e.message);process.exitCode=1;}finally{readline.close();}
