import {createApp} from './app.mjs';
import {dataKey} from './security.mjs';
const production=process.env.NODE_ENV==='production';
try{
 const host=process.env.APP_HOST??'127.0.0.1',port=Number(process.env.PORT??3000);
 if(!['127.0.0.1','::1'].includes(host))throw new Error('APP_HOST must be loopback; use an HTTPS reverse proxy for remote access');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 const app=await createApp({production,key:dataKey(process.env.APP_DATA_KEY),dataDir:process.env.APP_DATA_DIR,origin:process.env.APP_ORIGIN??`http://${host==='::1'?'[::1]':host}:${port}`,intakeEnabled:process.env.APP_INTAKE_ENABLED==='true',scannerCommand:process.env.APP_SCANNER_COMMAND,legalsReady:process.env.APP_LEGALS_READY==='true',trustedProxy:process.env.APP_TRUSTED_PROXY});
 app.server.listen(port,host,()=>console.log(`Server listening on ${host}:${port}. Intake requires explicit configuration.`));
 const stop=()=>app.server.close(()=>{app.close();process.exit(0);});process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(e){console.error('Startup refused:',e.message);process.exitCode=1;}
