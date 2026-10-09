import Busboy from 'busboy';
import path from 'node:path';
import {spawn} from 'node:child_process';
export class HttpError extends Error {constructor(status,message,code='INVALID_REQUEST'){super(message);this.status=status;this.code=code;}}
const invalid=message=>new HttpError(400,message);
const allowed=new Set(['courseId','lastName','firstName','middleName','birthDate','phone','email','snils','education','consent','consentVersion','website','_csrf']);
export function validateFields(fields){
 for(const key of Object.keys(fields))if(!allowed.has(key))throw invalid('В форме есть неизвестное поле.');
 if(fields.website)throw invalid('Не удалось принять заявку.');
 if(!['drone','flowers','wine','bread','cider','nutrition'].includes(fields.courseId))throw invalid('Выберите программу обучения.');
 const name=/^[\p{L}][\p{L}\p{M} '-]{0,79}$/u;
 if(!name.test(fields.lastName??'')||!name.test(fields.firstName??'')||(fields.middleName&&!name.test(fields.middleName)))throw invalid('Проверьте фамилию, имя и отчество.');
 const date=new Date(fields.birthDate+'T00:00:00.000Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fields.birthDate??'')||Number.isNaN(+date)||date.toISOString().slice(0,10)!==fields.birthDate||date>new Date()||date<new Date('1900-01-01'))throw invalid('Укажите корректную дату рождения.');
 if(!/^\+?[0-9 ()-]{10,24}$/.test(fields.phone??''))throw invalid('Проверьте номер телефона.');
 const digits=fields.phone.replace(/\D/g,'');if(digits.length<10||digits.length>15)throw invalid('Проверьте номер телефона.');
 if(!/^[^\s@<>\x00-\x1f]{1,64}@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(fields.email??'')||fields.email.length>254)throw invalid('Проверьте адрес электронной почты.');
 const snils=(fields.snils??'').replace(/[ -]/g,'');if(!/^\d{11}$/.test(snils)||/^0+$/.test(snils))throw invalid('Проверьте номер СНИЛС.');
 if(Number(snils.slice(0,9))>1001998){let sum=snils.slice(0,9).split('').reduce((s,c,i)=>s+Number(c)*(9-i),0);let check=sum%101;if(check===100)check=0;if(check!==Number(snils.slice(9)))throw invalid('Контрольное число СНИЛС не совпадает.');}
 if(!['professional','student'].includes(fields.education))throw invalid('Выберите уровень образования.');
 if(fields.consent!=='true'||fields.consentVersion!=='2026-10-09')throw invalid('Для отправки требуется актуальное согласие на обработку данных.');
 return Object.fromEntries(['courseId','lastName','firstName','middleName','birthDate','phone','email','education','consent','consentVersion'].map(k=>[k,fields[k]??'']).concat([['snils',snils]]));
}
function identify(data){if(data.subarray(0,5).toString()==='%PDF-'&&data.subarray(-1024).includes(Buffer.from('%%EOF')))return ['application/pdf','.pdf'];if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.subarray(-12).includes(Buffer.from('IEND')))return ['image/png','.png'];if(data[0]===255&&data[1]===216&&data[2]===255&&data.at(-2)===255&&data.at(-1)===217)return ['image/jpeg','.jpg'];throw invalid('Прикрепите PDF, JPG или PNG с корректным содержимым.');}
export function parseMultipart(req){return new Promise((resolve,reject)=>{
 // Busboy emits limit when size reaches its configured threshold, so reserve one byte.
 let parser;try{parser=Busboy({headers:req.headers,defParamCharset:'utf8',limits:{fileSize:10*1024*1024+1,files:2,fields:14,fieldSize:1024,parts:16,headerPairs:100}});}catch{req.resume();reject(invalid('Не удалось прочитать форму.'));return;}
 const fields=Object.create(null),files=[],seen=new Set();let error=null,total=0;const fail=message=>{error??=invalid(message);};
 const sizeHandler=chunk=>{total+=chunk.length;if(total>21*1024*1024){fail('Общий размер формы слишком большой.');req.unpipe(parser);parser.destroy(error);req.resume();}};
 req.on('data',sizeHandler);req.once('aborted',()=>parser.destroy(invalid('Загрузка прервана.')));req.once('error',()=>parser.destroy(invalid('Загрузка прервана.')));
 parser.on('field',(name,value,info)=>{if(Object.hasOwn(fields,name)||info.valueTruncated||info.nameTruncated)fail('Некорректное или слишком длинное поле формы.');else fields[name]=value.trim();});
 parser.on('file', (field, stream, info) => {
  // A rejected stream can still emit an error when Busboy detects truncation or abort.
  // Register on every stream before any field validation, resume or early return.
  stream.on('error', () => fail('Не удалось загрузить документ.'));
  stream.on('limit', () => fail('Каждый файл должен быть не больше 10 МБ.'));
  if (!['snilsFile', 'educationFile'].includes(field) || seen.has(field)) {
   fail('Допустим один документ СНИЛС и один документ об образовании.');
   stream.resume();
   return;
  }
  seen.add(field);
  const chunks = [];
  let size = 0;
  stream.on('data', chunk => {
   size += chunk.length;
   if (!error && size <= 10 * 1024 * 1024) chunks.push(chunk);
  });
  stream.on('end', () => {
   if (error) return;
   try {
    const data = Buffer.concat(chunks);
    const [mime, ext] = identify(data);
    const sourceExt = path.extname(info.filename ?? '').toLowerCase();
    const extensions = mime === 'image/jpeg' ? ['.jpg', '.jpeg'] : [ext];
    if (info.mimeType !== mime || !extensions.includes(sourceExt)) {
     throw invalid('Формат документа не соответствует его содержимому.');
    }
    files.push({field, mime, name: field + ext, data});
   } catch (e) { error = e; }
  });
 });
 for(const event of ['filesLimit','fieldsLimit','partsLimit'])parser.on(event,()=>fail('В форме слишком много полей или файлов.'));
 parser.on('error',e=>{req.removeListener('data',sizeHandler);reject(e instanceof HttpError?e:invalid('Не удалось прочитать форму.'));});
 parser.on('close',()=>{req.removeListener('data',sizeHandler);if(error)reject(error);else if(files.length!==2)reject(invalid('Прикрепите оба обязательных документа.'));else resolve({fields,files});});req.pipe(parser);
 });}
export async function scanBuffer(command,data){return new Promise((resolve,reject)=>{const child=spawn(command,['--no-summary','-'],{shell:false,windowsHide:true,stdio:['pipe','ignore','ignore']});const timer=setTimeout(()=>{child.kill();reject(new HttpError(503,'Проверка документов временно недоступна.','SCANNER_UNAVAILABLE'));},30000);child.on('error',()=>{clearTimeout(timer);reject(new HttpError(503,'Проверка документов временно недоступна.','SCANNER_UNAVAILABLE'));});child.stdin.on('error',()=>{});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else reject(new HttpError(code===1?400:503,code===1?'Проверка документа обнаружила угрозу.':'Проверка документов временно недоступна.','SCAN_REJECTED'));});child.stdin.end(data);});}
