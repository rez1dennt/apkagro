import {randomBytes} from 'node:crypto';
import {access,mkdir,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import QRCode from 'qrcode';
import {setupAdmin,base32} from '../server/security.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv.includes('--create-requested-account'))throw new Error('Explicit --create-requested-account required.');
if(process.env.NODE_ENV==='production')throw new Error('Local account preparation cannot run in production.');
const envPath=path.join(root,'.env'),dir=path.join(root,'data'),accessDir=path.join(root,'output','private-access');
const exists=async file=>access(file).then(()=>true,()=>false);
if(await exists(envPath)||await exists(path.join(dir,'admin.json')))throw new Error('Existing configuration/enrollment must not be replaced.');
const key=randomBytes(32),secret=randomBytes(20),username='admin';
const password=randomBytes(24).toString('base64url');
const uri=`otpauth://totp/${encodeURIComponent('Kadry APK:'+username)}?secret=${base32(secret)}&issuer=${encodeURIComponent('Kadry APK')}&algorithm=SHA1&digits=6&period=30`;
const qr=await QRCode.toBuffer(uri,{type:'png',errorCorrectionLevel:'M',width:360,margin:4});
await mkdir(accessDir,{recursive:true,mode:0o700});
const createdFiles=[];
async function writeExclusive(file,contents){await writeFile(file,contents,{mode:0o600,flag:'wx'});createdFiles.push(file);}
const env=`NODE_ENV=development\nAPP_HOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://127.0.0.1:3000\nAPP_INTAKE_ENABLED=false\nAPP_LEGALS_READY=false\nAPP_DATA_KEY=${key.toString('base64')}\n`;
try{
 await writeExclusive(path.join(accessDir,'authenticator-qr.png'),qr);
 await writeExclusive(path.join(accessDir,'README.txt'),'Локальный QR настройки второго фактора для admin. Откройте его на своём устройстве и добавьте в приложение-аутентификатор. Секрет не отправлялся внешним сервисам. QR не находится в public/ и не должен попадать в Git или на хостинг. После добавления удалите QR. Для входа нужны пароль и текущий шестизначный код. Приём реальных заявок оставлен выключенным. На Windows до использования задайте приватные NTFS ACL для владельца: POSIX mode не заменяет NTFS права.\n');
 await writeExclusive(envPath,env);
 await setupAdmin(dir,key,username,password,secret);
}catch(error){
 for(const file of createdFiles.reverse())await unlink(file).catch(()=>{});
 throw error;
}finally{key.fill(0);secret.fill(0);}
// The owner explicitly requested this password; keys and TOTP secret never enter tool output.
console.log(JSON.stringify({username,password,qrPath:path.join(accessDir,'authenticator-qr.png'),intakeEnabled:false}));
