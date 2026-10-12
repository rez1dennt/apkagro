import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir,open,rename,unlink,realpath,stat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {inflateRawSync,inflateSync} from 'node:zlib';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {SaxesParser} from 'saxes';
import {HttpError,createScannerGuard} from './intake.mjs';
import {referencedMedia,validateContent} from './content-schema.mjs';

sharp.cache(false);sharp.concurrency(1);
const MAX_FILE=10*1024*1024,MAX_PIXELS=24_000_000,MAX_RECORDS=1000,MAX_BYTES=512*1024*1024;
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const types={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
const bindings=JSON.parse(await readFile(new URL('../content/content-bindings.json',import.meta.url),'utf8'));
const owners=new Set(),sharedScanner=createScannerGuard();
const fail=(message='Некорректный медиафайл.',code='INVALID_MEDIA')=>{throw new HttpError(400,message,code);};
function queue(max=4){let tail=Promise.resolve(),pending=0,closed=false;return {async run(fn){if(closed)throw new HttpError(503,'Медиатека закрыта.','MEDIA_CLOSED');if(pending>=max)throw new HttpError(429,'Медиатека занята. Повторите позже.','RATE_LIMIT');pending++;const job=tail.then(fn);tail=job.catch(()=>{});try{return await job;}finally{pending--; }},async close(){closed=true;await tail;}};}
// Global processing queue also bounds expensive decoders if several apps share a process.
const processing=queue(4);
function labels(value,keys=['title','alt']){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail('Неизвестное поле медиафайла.');for(const key of ['title','alt'])if(typeof value[key]!=='string'||value[key].length>500||/[\x00-\x1f\x7f]/.test(value[key])||/<\/?[a-z]/i.test(value[key]))fail('Некорректная подпись медиафайла.');return {title:value.title.trim(),alt:value.alt.trim()};}
function xml(data){
 const parser=new SaxesParser({xmlns:true}),stack=[];let root=null,count=0;
 parser.on('error',()=>fail('Некорректный XML в DOCX.'));
 parser.on('doctype',()=>fail('DTD в DOCX не поддерживается.'));
 parser.on('opentag',tag=>{if(++count>100000||stack.length>=256)fail();const node={uri:tag.uri,local:tag.local,attrs:new Map(),children:[],text:false};for(const attr of Object.values(tag.attributes))if(attr.uri==='')node.attrs.set(attr.local,attr.value);if(stack.length)stack.at(-1).children.push(node);else if(root)fail();else root=node;stack.push(node);});
 parser.on('closetag',()=>stack.pop());
 const text=value=>{if(value.trim()&&stack.length)stack.at(-1).text=true;};parser.on('text',text);parser.on('cdata',text);
 // Text/comments never become declarations; retain only a bounded element tree.
 parser.write(new TextDecoder('utf-8',{fatal:true}).decode(data)).close();if(!root||stack.length)fail();return root;
}
const OOXML={types:'http://schemas.openxmlformats.org/package/2006/content-types',rels:'http://schemas.openxmlformats.org/package/2006/relationships',word:new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main']),office:new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument','http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument'])};
function relationshipPart(data,name){
 const root=xml(data);if(root.local!=='Relationships'||root.uri!==OOXML.rels||root.text)fail();const ids=new Set(),relations=[];
 for(const node of root.children){
  if(node.uri!==OOXML.rels||node.local!=='Relationship'||node.children.length||node.text)fail();const id=node.attrs.get('Id'),type=node.attrs.get('Type'),target=node.attrs.get('Target'),mode=node.attrs.get('TargetMode');
  if(!id||ids.has(id)||!type||!/^https?:\/\/[^\s]+$/.test(type)||!target||mode&&mode!=='Internal'||/[\\\x00-\x20?#%]/.test(target)||target.startsWith('//')||/^[a-z][a-z0-9+.-]*:/i.test(target))fail();ids.add(id);
  let base='';if(name!=='_rels/.rels'){const split=name.lastIndexOf('/_rels/');if(name.startsWith('_rels/'))base='';else if(split>0)base=name.slice(0,split);else fail('Некорректный путь части связей DOCX.');}
  const segments=(target.startsWith('/')?target.slice(1):base+'/'+target).split('/'),resolved=[];
  for(const segment of segments){if(!segment||segment==='.')continue;if(segment==='..'){if(!resolved.length)fail();resolved.pop();}else resolved.push(segment);}
  if(!resolved.length)fail();relations.push({id,type,target:resolved.join('/')});
 }return relations;
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function docx(data){
 // Read central directory first, then inflate one bounded entry at a time, never extract paths.
 let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(data.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0||data.readUInt16LE(end+4)||data.readUInt16LE(end+6)||end+22+data.readUInt16LE(end+20)!==data.length)fail();
 const count=data.readUInt16LE(end+10),size=data.readUInt32LE(end+12),offset=data.readUInt32LE(end+16);if(!count||count>200||count!==data.readUInt16LE(end+8)||offset+size!==end)fail();
 let cursor=offset,total=0;const names=new Set(),required=new Map(),relations=new Map();
 for(let i=0;i<count;i++){
  if(cursor+46>end||data.readUInt32LE(cursor)!==0x02014b50)fail();
  const flags=data.readUInt16LE(cursor+8),method=data.readUInt16LE(cursor+10),crc=data.readUInt32LE(cursor+16),compressed=data.readUInt32LE(cursor+20),length=data.readUInt32LE(cursor+24),n=data.readUInt16LE(cursor+28),extra=data.readUInt16LE(cursor+30),comment=data.readUInt16LE(cursor+32),local=data.readUInt32LE(cursor+42);
  if(cursor+46+n+extra+comment>end)fail();const name=data.subarray(cursor+46,cursor+46+n).toString('utf8');cursor+=46+n+extra+comment;
  if(!name||names.has(name)||name.includes('\\')||name.startsWith('/')||/[\x00-\x1f]/.test(name)||name.split('/').some(x=>x==='..'||x==='.')||flags&1||![0,8].includes(method)||length>12*1024*1024||(total+=length)>32*1024*1024||/vbaProject|activeX|embeddings|\.exe$/i.test(name))fail();names.add(name);
  if(local+30>offset||data.readUInt32LE(local)!==0x04034b50||data.readUInt16LE(local+6)!==flags||data.readUInt16LE(local+8)!==method)fail();const ln=data.readUInt16LE(local+26),le=data.readUInt16LE(local+28),start=local+30+ln+le;
  if(data.subarray(local+30,local+30+ln).toString('utf8')!==name||start+compressed>offset)fail();const input=data.subarray(start,start+compressed),output=method===0?input:inflateRawSync(input,{maxOutputLength:Math.min(length+1,12*1024*1024+1)});
  if(output.length!==length||crc32(output)!==crc)fail();
  if(['[Content_Types].xml','_rels/.rels','word/document.xml'].includes(name))required.set(name,output);
  if(name.endsWith('.rels'))relations.set(name,relationshipPart(output,name));
 }
 if(cursor!==end||required.size!==3)fail();const contentTypes=xml(required.get('[Content_Types].xml'));if(contentTypes.local!=='Types'||contentTypes.uri!==OOXML.types||contentTypes.text)fail();
 const parts=new Set(),extensions=new Set();let main=false;
 for(const node of contentTypes.children){if(node.uri!==OOXML.types||!['Override','Default'].includes(node.local)||node.children.length||node.text)fail();const type=node.attrs.get('ContentType');if(!type||/\s/.test(type))fail();if(node.local==='Override'){const part=node.attrs.get('PartName');if(!part||!part.startsWith('/')||parts.has(part)||!names.has(part.slice(1)))fail();parts.add(part);if(part==='/word/document.xml'&&type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')main=true;}else{const extension=node.attrs.get('Extension');if(!extension||extensions.has(extension))fail();extensions.add(extension);}}
 const office=relations.get('_rels/.rels')?.filter(r=>OOXML.office.has(r.type));if(!main||office?.length!==1||office[0].target!=='word/document.xml')fail();
 for(const list of relations.values())for(const relation of list)if(!names.has(relation.target))fail();
 const document=xml(required.get('word/document.xml'));if(document.local!=='document'||!OOXML.word.has(document.uri)||document.text||document.children.length!==1||document.children[0].local!=='body'||document.children[0].uri!==document.uri)fail();
 const body=document.children[0];if(body.text||body.children.some(node=>node.uri!==document.uri||!['p','tbl','sdt','customXml','sectPr'].includes(node.local)))fail('Неподдерживаемая структура тела DOCX.');
}
function pdfTokens(source,budget){
 let position=0;
 const white=c=>c!==undefined&&[0,9,10,12,13,32].includes(c.charCodeAt(0));
 const delimiter=c=>c===undefined||white(c)||'()<>[]{}/%'.includes(c);
 const next=()=>{
  while(position<source.length){if(white(source[position])){position++;continue;}if(source[position]==='%'){while(position<source.length&&!['\r','\n'].includes(source[position]))position++;continue;}break;}
  if(position===source.length)return null;if(++budget.tokens>250000)fail('Слишком сложная структура PDF.');
  const start=position,char=source[position++];
  if((char==='<'&&source[position]==='<')||(char==='>'&&source[position]==='>')){position++;return {type:char==='<'?'dict-open':'dict-close'};}
  if(char==='['||char===']')return {type:char==='['?'array-open':'array-close'};
  if(char==='('){let depth=1;while(position<source.length&&depth){const c=source[position++];if(c==='\\'){if(position===source.length)fail();const escaped=source[position++];if(escaped==='\r'&&source[position]==='\n')position++;}else if(c==='('){if(++depth>64)fail();}else if(c===')')depth--;}if(depth)fail();return {type:'string'};}
  if(char==='<'){while(position<source.length&&source[position]!=='>'){if(!white(source[position])&&!/[a-f0-9]/i.test(source[position]))fail();position++;}if(position===source.length)fail();position++;return {type:'string'};}
  if(char==='/'){while(!delimiter(source[position]))position++;const encoded=source.slice(start+1,position);if(encoded.length>1024||/#(?![a-f0-9]{2})/i.test(encoded))fail();const value=encoded.replace(/#([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));if(/[\x00-\x1f\x7f]/.test(value))fail();if(['JavaScript','JS','Launch','EmbeddedFile','RichMedia','Encrypt'].includes(value))fail('Активный или зашифрованный PDF не поддерживается.');return {type:'name',value};}
  if(')>}{'.includes(char))fail();while(!delimiter(source[position]))position++;const value=source.slice(start,position);if(value.length>1024)fail();if(/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)){const number=Number(value);if(!Number.isFinite(number))fail();return {type:'number',value:number,start};}return {type:'keyword',value};
 };
 const value=(first=next(),depth=0)=>{
  if(!first||depth>64)fail();
  if(first.type==='dict-open'){const entries=new Map();for(let key=next();key?.type!=='dict-close';key=next()){if(!key||key.type!=='name'||entries.has(key.value))fail();entries.set(key.value,value(next(),depth+1));}return {type:'dict',entries};}
  if(first.type==='array-open'){const items=[];for(let item=next();item?.type!=='array-close';item=next()){if(!item)fail();items.push(value(item,depth+1));}return {type:'array',items};}
  if(first.type==='number'&&Number.isSafeInteger(first.value)&&first.value>=0){const checkpoint=position,second=next(),third=second?.type==='number'?next():null;if(second?.type==='number'&&Number.isSafeInteger(second.value)&&second.value>=0&&third?.type==='keyword'&&third.value==='R')return {type:'ref',id:first.value,generation:second.value};position=checkpoint;}
  if(['number','name','string'].includes(first.type)||first.type==='keyword'&&['true','false','null'].includes(first.value))return first;
  fail('Неподдерживаемая структура PDF.');
 };
 return {next,value,get position(){return position;},set position(next){position=next;}};
}
function pdfPreflight(data){
 const source=data.toString('latin1'),budget={tokens:0},lexer=pdfTokens(source,budget);let expanded=0,objects=0,xrefs=0;
 const values=new Map(),offsets=new Map(),indexSeen=new Set(),decodedIndexes=new Map();let root=null;
 const refKey=ref=>ref.id+':'+ref.generation;
 const keyword=(token,value)=>token?.type==='keyword'&&token.value===value;
 const scalar=(dict,key)=>dict.entries.get(key);
 const integer=(value,maximum=10000)=>{if(value?.type!=='number'||!Number.isSafeInteger(value.value)||value.value<0||value.value>maximum)fail('Некорректные счётчики PDF.');return value.value;};
 const compressedObjects=(dictionary,output)=>{
  const count=integer(scalar(dictionary,'N')),first=integer(scalar(dictionary,'First'),output.length);if((objects+=count)>10000)fail('PDF превышает бюджет объектов.');
  const body=output.toString('latin1'),header=pdfTokens(body.slice(0,first),budget),offsets=[],ids=new Set();
  for(let i=0;i<count;i++){const id=integer(header.next(),100000),offset=integer(header.next(),output.length-first);if(!id||ids.has(id)||i&&offset<=offsets.at(-1))fail();ids.add(id);offsets.push(offset);}
  if(header.next())fail('Некорректный заголовок потока объектов PDF.');const objectIds=[...ids];
  const leading=pdfTokens(body.slice(first,first+(offsets[0]??output.length-first)),budget);if(leading.next())fail();
  for(let i=0;i<count;i++){const item=pdfTokens(body.slice(first+offsets[i],first+(offsets[i+1]??output.length-first)),budget),object=item.value();if(item.next())fail('Некорректная граница объекта в PDF.');values.set(objectIds[i]+':0',object);}
 };
 const xrefShape=dictionary=>{
  const size=integer(scalar(dictionary,'Size')),widths=scalar(dictionary,'W'),index=scalar(dictionary,'Index');if(!size||widths?.type!=='array'||widths.items.length!==3||index&&index.type!=='array')fail();
  const width=widths.items.reduce((sum,value)=>sum+integer(value,8),0);if(!width)fail();const entries=index?index.items:[{type:'number',value:0},{type:'number',value:size}];if(entries.length%2||entries.length>20000)fail();let count=0,end=0;
  for(let i=0;i<entries.length;i+=2){const start=integer(entries[i]),length=integer(entries[i+1]);if(start<end||start+length>size)fail();count+=length;end=start+length;}
  if((xrefs+=count)>10000)fail('PDF превышает бюджет таблиц ссылок.');return count*width;
 };
 const decode=(dictionary,input,offset)=>{
  if(decodedIndexes.has(offset))return decodedIndexes.get(offset);
  const type=scalar(dictionary,'Type');if(type&&type.type!=='name')fail('Непрямой тип потока PDF не поддерживается.');
  const objectStream=type?.value==='ObjStm',xref=type?.value==='XRef',tableLength=xref?xrefShape(dictionary):null;
  // Declared work budgets are checked before any decompression or pdf-lib parsing.
  if(objectStream){const count=integer(scalar(dictionary,'N'));integer(scalar(dictionary,'First'),16*1024*1024);if(objects+count>10000)fail('PDF превышает бюджет объектов.');}
  const filter=scalar(dictionary,'Filter');let filters=[];
  if(filter&&!(filter.type==='keyword'&&filter.value==='null')){filters=filter.type==='array'?filter.items:[filter];if(filters.length>8||filters.some(f=>f.type!=='name'))fail('Непрямые фильтры PDF не поддерживаются.');}
  const params=scalar(dictionary,'DecodeParms');if(params&&params.type==='ref'||params?.type==='array'&&params.items.some(item=>item.type==='ref'))fail('Непрямые параметры PDF не поддерживаются.');
  const remaining=32*1024*1024-expanded;if(remaining<0||remaining===0&&input.length)fail('PDF превышает бюджет декодирования.');const maximum=Math.min(16*1024*1024,remaining);
  const image=scalar(dictionary,'Subtype')?.value==='Image';
  // pdf-lib does not decode ordinary image streams while loading/page-walking.
  // Preserve opaque image codecs in supplied PDFs; never allow them for ObjStm/XRef.
  if(image&&!objectStream&&!xref&&filters.length===1&&['DCTDecode','JPXDecode','CCITTFaxDecode','JBIG2Decode','LZWDecode'].includes(filters[0].value)){if(input.length>maximum)fail();expanded+=input.length;return input;}
  let output=input;
  for(const filter of filters){if(filter.value==='ASCII85Decode')output=ascii85(output,maximum);else if(filter.value==='ASCIIHexDecode')output=asciiHex(output,maximum);else if(filter.value==='FlateDecode'){if(!maximum)fail();output=inflateSync(output,{maxOutputLength:maximum});}else fail('Фильтр PDF не поддерживается.');if(output.length>maximum)fail('PDF превышает бюджет декодирования.');}
  if(output.length>maximum)fail('PDF превышает бюджет декодирования.');expanded+=output.length;
  if(objectStream)compressedObjects(dictionary,output);if(xref&&output.length!==tableLength)fail('Некорректная длина таблицы ссылок PDF.');if(xref)decodedIndexes.set(offset,output);return output;
 };
 const streamBounds=(dictionary,position,length)=>{if(!Number.isSafeInteger(length)||length<0||length>MAX_FILE)fail();let start=position;if(source[start]==='\r')start+=source[start+1]==='\n'?2:1;else if(source[start]==='\n')start++;else fail();const end=start+length;if(end>data.length)fail();let after=end;if(source[after]==='\r')after+=source[after+1]==='\n'?2:1;else if(source[after]==='\n')after++;if(source.slice(after,after+9)!=='endstream'||source[after+9]&&!/[\x00\t\n\f\r ]/.test(source[after+9]))fail('Некорректная граница потока PDF.');return {start,end,after:after+9};};
 const indexAt=(offset,depth=0)=>{
  if(!Number.isSafeInteger(offset)||offset<0||offset>=data.length||depth>20||indexSeen.has(offset))fail('Некорректная таблица ссылок PDF.');indexSeen.add(offset);const section=pdfTokens(source.slice(offset),budget),first=section.next();let dictionary;
  if(first?.type==='keyword'&&first.value==='xref'){
   for(let entry=section.next();;entry=section.next()){
    if(entry?.type==='keyword'&&entry.value==='trailer'){dictionary=section.value();if(dictionary.type!=='dict')fail();break;}
    const start=integer(entry,100000),count=integer(section.next());if(start+count>100000||(xrefs+=count)>10000)fail();
    for(let i=0;i<count;i++){const location=integer(section.next(),data.length-1),generation=integer(section.next(),65535),status=section.next();if(status?.type!=='keyword'||!['n','f'].includes(status.value))fail();const key=(start+i)+':'+generation;if(status.value==='n'&&!offsets.has(key))offsets.set(key,location);}
   }
  }else{
   integer(first,100000);integer(section.next(),65535);if(!keyword(section.next(),'obj'))fail();dictionary=section.value();if(dictionary.type!=='dict'||scalar(dictionary,'Type')?.value!=='XRef'||!keyword(section.next(),'stream'))fail();
   const length=integer(scalar(dictionary,'Length'),MAX_FILE),bounds=streamBounds(dictionary,offset+section.position,length),end=pdfTokens(source.slice(bounds.after),budget);if(!keyword(end.next(),'endobj'))fail();const decoded=decode(dictionary,data.subarray(bounds.start,bounds.end),offset),widths=scalar(dictionary,'W').items.map(v=>integer(v,8)),index=scalar(dictionary,'Index')?.items.map(v=>integer(v))??[0,integer(scalar(dictionary,'Size'))];let cursor=0;
   for(let part=0;part<index.length;part+=2)for(let i=0;i<index[part+1];i++){const fields=widths.map(width=>{let value=0;for(let j=0;j<width;j++)value=value*256+decoded[cursor++];if(!Number.isSafeInteger(value))fail();return value;});const type=widths[0]?fields[0]:1;if(type===1){if(fields[1]>=data.length||fields[2]>65535)fail();const key=(index[part]+i)+':'+fields[2];if(!offsets.has(key))offsets.set(key,fields[1]);}else if(![0,2].includes(type))fail();}
  }
  const candidate=scalar(dictionary,'Root');if(!root&&candidate)root=candidate;if(scalar(dictionary,'XRefStm'))fail('Гибридные таблицы PDF не поддерживаются.');const previous=scalar(dictionary,'Prev');if(previous){const prior=integer(previous,data.length-1);if(prior>=offset)fail();indexAt(prior,depth+1);}
 };
 indexAt(Number(source.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1]));
 const streamLength=dictionary=>{let length=scalar(dictionary,'Length');if(length?.type==='ref'){const offset=offsets.get(refKey(length));if(offset===undefined)fail('Не найден объект длины PDF.');const target=pdfTokens(source.slice(offset),budget),id=target.next(),generation=target.next();if(id?.type!=='number'||generation?.type!=='number'||id.value!==length.id||generation.value!==length.generation||!keyword(target.next(),'obj'))fail();length=target.value();if(!keyword(target.next(),'endobj'))fail();}return integer(length,MAX_FILE);};
 // Tokens consume strings/comments atomically. Raw stream bytes are skipped only
 // after validating a direct Length and the exact endstream/endobj boundaries.
 for(let first=lexer.next();first;first=lexer.next()){
  if(['dict-open','array-open'].includes(first.type)){lexer.value(first);continue;}
  if(first.type==='keyword'&&['stream','endstream','endobj'].includes(first.value))fail('Неопознанная граница потока PDF.');
  if(first.type!=='number'||!Number.isSafeInteger(first.value)||first.value<1)continue;
  const checkpoint=lexer.position,second=lexer.next(),third=second?.type==='number'?lexer.next():null;
  if(second?.type!=='number'||!Number.isSafeInteger(second.value)||second.value<0||third?.type!=='keyword'||third.value!=='obj'){lexer.position=checkpoint;continue;}
  if(++objects>10000)fail();const object=lexer.value(),boundary=lexer.next();values.set(first.value+':'+second.value,object);
  if(boundary?.type==='keyword'&&boundary.value==='stream'){
   if(object.type!=='dict')fail();const bounds=streamBounds(object,lexer.position,streamLength(object));lexer.position=bounds.after;
   const endObject=lexer.next();if(endObject?.type!=='keyword'||endObject.value!=='endobj')fail();decode(object,data.subarray(bounds.start,bounds.end),first.start);
  }else if(boundary?.type!=='keyword'||boundary.value!=='endobj')fail('Неподдерживаемая структура объекта PDF.');
 }
 if(!objects||root?.type!=='ref')fail();const catalog=values.get(refKey(root)),pageRoot=catalog?.type==='dict'&&scalar(catalog,'Pages');if(scalar(catalog??{entries:new Map()},'Type')?.value!=='Catalog'||pageRoot?.type!=='ref')fail();
 const seen=new Set();let pages=0;
 const pageTree=(reference,parent=null,depth=0)=>{if(reference?.type!=='ref'||depth>64||seen.has(refKey(reference)))fail('Повторная или циклическая ссылка дерева страниц PDF.');seen.add(refKey(reference));const node=values.get(refKey(reference));if(node?.type!=='dict')fail();const type=scalar(node,'Type')?.value;if(parent&&refKey(scalar(node,'Parent')??{})!==refKey(parent))fail();if(type==='Page'){if(++pages>2000)fail();return 1;}if(type!=='Pages')fail();const kids=scalar(node,'Kids');if(kids?.type!=='array'||kids.items.length>2000)fail();const actual=kids.items.reduce((sum,child)=>sum+pageTree(child,reference,depth+1),0);if(integer(scalar(node,'Count'),2000)!==actual)fail();return actual;};
 if(!pageTree(pageRoot))fail();
}
async function pdf(data){
 const text=data.toString('latin1');if(!/^%PDF-1\.[0-7][\r\n]/.test(text)||!/(?:\r?\n)%%EOF\s*$/.test(text)||!/startxref\s+\d+\s+%%EOF\s*$/.test(text))fail();pdfPreflight(data);
 const parsed=await PDFDocument.load(data,{updateMetadata:false,throwOnInvalidObject:true});if(parsed.getPageCount()<1||parsed.getPageCount()>2000)fail();parsed.getPages();
}
function ascii85(data,maximum){
 if(!Number.isSafeInteger(maximum)||maximum<0)fail();const source=data.toString('ascii').replace(/\s/g,'').replace(/^<~/,'').replace(/~>$/,'');
 // A fixed byte buffer never exceeds the remaining stage budget. No decoded
 // number array is materialized, and every group checks capacity before writes.
 const output=Buffer.alloc(Math.min(maximum,source.length*4));let written=0,digits=0,value=0;
 const append=length=>{if(written+length>maximum||value>0xffffffff)fail('PDF превышает бюджет декодирования.');for(let i=0;i<length;i++)output[written++]=Math.floor(value/256**(3-i))&255;digits=0;value=0;};
 for(const char of source){if(char==='z'){if(digits)fail();append(4);continue;}const digit=char.charCodeAt(0)-33;if(digit<0||digit>84)fail();value=value*85+digit;if(++digits===5)append(4);}
 if(digits===1)fail();if(digits){const length=digits-1;while(digits++<5)value=value*85+84;append(length);}return output.subarray(0,written);
}
function asciiHex(data,maximum){
 if(!Number.isSafeInteger(maximum)||maximum<0)fail();const hex=data.toString('ascii').replace(/[\x00\t\n\f\r ]/g,'').replace(/>$/,'');
 if(!/^[a-f0-9]*$/i.test(hex))fail();if(Math.ceil(hex.length/2)>maximum)fail('PDF превышает бюджет декодирования.');return Buffer.from(hex.length%2?hex+'0':hex,'hex');
}
async function prepare(input,scannerCommand,scanner){
 labels(input,['data','name','mime','title','alt']);const {data,name,mime}=input;
 if(!Buffer.isBuffer(data)||!data.length)fail();if(data.length>MAX_FILE)throw new HttpError(413,'Размер файла превышает 10 МиБ.','MEDIA_TOO_LARGE');
 if(typeof name!=='string'||!name||name.length>200||name!==path.basename(name)||/[\\/\x00-\x1f\x7f]/.test(name))fail('Некорректное имя файла.');const ext=path.extname(name).slice(1).toLowerCase();if(!Object.hasOwn(types,ext)||types[ext]!==mime)fail('Формат файла не соответствует содержимому.');
 if(scannerCommand)await scanner.scan(scannerCommand,data);
 try{
  if(ext==='pdf'){await pdf(data);return {data,ext,mime,kind:'document',width:null,height:null};}
  if(ext==='docx'){docx(data);return {data,ext,mime,kind:'document',width:null,height:null};}
  const settings={limitInputPixels:MAX_PIXELS,failOn:'warning',animated:false};const metadata=await sharp(data,settings).metadata();const expected=ext==='jpg'?'jpeg':ext;
  if((ext==='avif'?metadata.format!=='heif'||metadata.compression!=='av1':metadata.format!==expected)||!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS||(metadata.pages??1)>1)fail();
  // Explicit full raw decode prevents a resize/shrink-on-load from hiding corrupt source pixels.
  await sharp(data,settings).raw().toBuffer();
  const result=await sharp(data,settings).autoOrient().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82,effort:4}).toBuffer({resolveWithObject:true});
  if(result.data.length>MAX_FILE)fail();return {data:result.data,ext:'webp',mime:'image/webp',kind:'image',width:result.info.width,height:result.info.height};
 }catch(e){if(e instanceof HttpError)throw e;fail('Не удалось декодировать файл.');}
}
function contentLocations(content){const found=new Map();const add=(url,p)=>{if(!found.has(url))found.set(url,[]);found.get(url).push(p);};function visit(value,p){if(typeof value==='string'){if(value.startsWith('/media/'))add(value,p);for(const match of value.matchAll(/\]\((\/media\/[^)]+)\)/g))add(match[1],p);}else if(Array.isArray(value))value.forEach((item,i)=>visit(item,p+'['+i+']'));else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value))visit(item,p?p+'.'+key:key);}visit(content,'');return found;}
function publicationResources(content){
 const live=referencedMedia(content,{publicOnly:true}),resources=new Map([...live].map(url=>[url,null])),hidden=new Set(content.hiddenSections);
 const add=(url,kind)=>{if(url)resources.set(url,kind);};
 for(const binding of bindings.filter(b=>!b.source))if(['image','background','url'].includes(binding.kind)&&binding.targets.some(t=>(t.sections??[t.section]).some(section=>section===null||!hidden.has(section)))){const url=content.fields[binding.id];if(['image','background'].includes(binding.kind))add(url,'image');else if(/^\/(assets|documents)\//.test(url))add(url,null);}
 if(!hidden.has('about'))content.benefits.forEach(b=>add(b.image,'image'));
 if(!hidden.has('programs'))content.programs.filter(p=>['published','closed'].includes(p.status)).forEach(p=>{add(p.image,'image');add(p.modalImage,'image');});
 content.extraSections.filter(s=>!hidden.has(s.id)).forEach(s=>{add(s.image,'image');s.items.forEach(item=>add(item.image,'image'));});
 Object.values(content.documents).forEach(url=>add(url,'document'));add(content.seo.icon,'image');add(content.seo.ogImage,'image');content.pages.filter(p=>p.status==='published').forEach(p=>add(p.seo.ogImage,'image'));
 const generic=url=>{if(/^\/(assets|documents|media)\//.test(url)&&!resources.has(url))add(url,null);};
 Object.values(content.navigation).flat().forEach(item=>generic(item.url));generic(content.settings.organization.registryUrl);
 const sections=content.extraSections.filter(s=>!hidden.has(s.id));sections.forEach(s=>{generic(s.buttonUrl);s.items.forEach(item=>generic(item.buttonUrl??''));});
 const bodies=[...content.pages.filter(p=>p.status==='published').map(p=>p.body),...(!hidden.has('about')?content.benefits.map(b=>b.body):[]),...(!hidden.has('steps')?content.steps.map(s=>s.body):[]),...(!hidden.has('faq')?content.faqs.map(f=>f.answer):[]),...(!hidden.has('programs')?content.programs.filter(p=>['published','closed'].includes(p.status)).map(p=>p.description):[]),...sections.flatMap(s=>[s.body,...s.items.map(item=>item.body)])];
 for(const body of bodies.filter(b=>typeof b==='string'))for(const match of body.matchAll(/\]\(([^)]+)\)/g))generic(match[1]);
 return resources;
}

export async function openContentMedia({dir,store,scannerCommand='',scanner=sharedScanner,publicDir=fileURLToPath(new URL('../public/',import.meta.url))}={}){
 const directory=path.resolve(dir),filename=path.join(directory,'media.json');await mkdir(directory,{recursive:true,mode:0o700});const canonical=await realpath(directory),owner=process.platform==='win32'?canonical.toLowerCase():canonical;if(owners.has(owner))throw new HttpError(409,'Медиатека уже открыта.','MEDIA_OWNED');owners.add(owner);
 const mutation=queue(8),uploads=new Set();let records=[],closed=false,closePromise=null;
 const write=async(next)=>{const temporary=filename+'.'+randomUUID()+'.tmp';let handle;try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify({format:1,media:next}));await handle.sync();await handle.close();handle=null;await rename(temporary,filename);}finally{await handle?.close().catch(()=>{});await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}};
 try{
  const raw=await readFile(filename);if(raw.length>8*1024*1024)fail();const data=JSON.parse(raw);if(data.format!==1||Object.keys(data).sort().join()!=='format,media'||!Array.isArray(data.media)||data.media.length>MAX_RECORDS)fail();const seen=new Set();let total=0;
  for(const item of data.media){
   if(!item||Object.keys(item).sort().join()!=='alt,createdAt,ext,height,id,kind,mime,sha256,size,title,url,width'||!idPattern.test(item.id)||seen.has(item.id)||!['webp','pdf','docx'].includes(item.ext)||item.mime!==types[item.ext]||item.kind!==(item.ext==='webp'?'image':'document')||item.url!=='/media/'+item.id+'.'+item.ext||!Number.isSafeInteger(item.size)||item.size<1||item.size>MAX_FILE||(total+=item.size)>MAX_BYTES||!Number.isFinite(Date.parse(item.createdAt))||!/^[0-9a-f]{64}$/.test(item.sha256))fail();
   if(item.kind==='image'&&(!Number.isSafeInteger(item.width)||!Number.isSafeInteger(item.height)||item.width<1||item.height<1||item.width>1920||item.height>1920)||item.kind==='document'&&(item.width!==null||item.height!==null))fail();
   labels({title:item.title,alt:item.alt});seen.add(item.id);
  }records=data.media;
 }catch(e){if(e.code!=='ENOENT'){owners.delete(owner);throw new HttpError(500,'Повреждён индекс медиатеки.','MEDIA_CORRUPT');}}
 const active=()=>{if(closed)throw new HttpError(503,'Медиатека закрыта.','MEDIA_CLOSED');};
 const get=value=>records.find(item=>item.id===value||item.url===value);
 let referenceCache=null;
 const referenceIndex=()=>{const draft=store.getDraft(),published=store.getPublished(),key=draft.revision+':'+published.revision;if(referenceCache?.key===key)return referenceCache;const snapshots=[{source:'draft',...draft},{source:'published',...published},...store.history().map(v=>({source:'history',...v}))],all=new Map(),publicUrls=new Set();for(const snapshot of snapshots){for(const [url,paths]of contentLocations(snapshot.content)){if(!all.has(url))all.set(url,[]);all.get(url).push(...paths.map(p=>({source:snapshot.source,revision:snapshot.revision,path:p})));}if(snapshot.source!=='draft')for(const url of referencedMedia(snapshot.content,{publicOnly:true}))publicUrls.add(url);}return referenceCache={key,all,publicUrls};};
 const usages=url=>structuredClone(referenceIndex().all.get(url)??[]);
 const publiclyReferenced=url=>referenceIndex().publicUrls.has(url);
 const read=async(value,{publicOnly=false}={})=>{active();const meta=get(value);if(!meta||publicOnly&&!publiclyReferenced(meta.url))return null;let data;try{data=await readFile(path.join(directory,meta.id+'.'+meta.ext));}catch(e){if(e.code==='ENOENT')return null;throw e;}if(data.length!==meta.size||createHash('sha256').update(data).digest('hex')!==meta.sha256)throw new HttpError(500,'Повреждено содержимое медиатеки.','MEDIA_CORRUPT');return {meta:structuredClone(meta),data};};
 const api={
  list(){active();const index=referenceIndex();return structuredClone(records).map(meta=>({...meta,locations:structuredClone(index.all.get(meta.url)??[]),public:index.publicUrls.has(meta.url)}));},
  usage(value){active();const meta=get(value);return meta?usages(meta.url):[];},
  upload(input){active();if(Buffer.isBuffer(input?.data)&&input.data.length>MAX_FILE)return Promise.reject(new HttpError(413,'Размер файла превышает 10 МиБ.','MEDIA_TOO_LARGE'));const captured={...input,data:Buffer.isBuffer(input?.data)?Buffer.from(input.data):input?.data};const job=processing.run(async()=>{const prepared=await prepare(captured,scannerCommand,scanner);return mutation.run(async()=>{if(records.length>=MAX_RECORDS||records.reduce((sum,m)=>sum+m.size,0)+prepared.data.length>MAX_BYTES)throw new HttpError(413,'Достигнут лимит медиатеки.','MEDIA_CAPACITY');const id=randomUUID(),meta={id,url:'/media/'+id+'.'+prepared.ext,ext:prepared.ext,mime:prepared.mime,kind:prepared.kind,width:prepared.width,height:prepared.height,size:prepared.data.length,sha256:createHash('sha256').update(prepared.data).digest('hex'),...labels(captured,['data','name','mime','title','alt']),createdAt:new Date().toISOString()};const target=path.join(directory,id+'.'+meta.ext);let handle;try{handle=await open(target,'wx',0o600);await handle.writeFile(prepared.data);await handle.sync();await handle.close();handle=null;await write([...records,meta]);records.push(meta);}catch(e){await handle?.close().catch(()=>{});await unlink(target).catch(()=>{});throw e;}return structuredClone(meta);});});uploads.add(job);job.then(()=>uploads.delete(job),()=>uploads.delete(job));return job;},
  update(id,value){active();const captions=labels(value);return mutation.run(async()=>{const previous=get(id);if(!previous)throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');const meta={...previous,...captions},next=records.map(r=>r.id===id?meta:r);await write(next);records=next;return structuredClone(meta);});},
  remove(id){active();return mutation.run(async()=>{const meta=get(id);if(!meta)throw new HttpError(404,'Файл не найден.','MEDIA_NOT_FOUND');const used=usages(meta.url);if(store.references().has(meta.url)||used.length){const error=new HttpError(409,'Файл используется в содержимом сайта.','MEDIA_REFERENCED');error.locations=used;throw error;}const next=records.filter(r=>r.id!==id);await write(next);records=next;await unlink(path.join(directory,id+'.'+meta.ext)).catch(e=>{if(e.code!=='ENOENT')throw e;});return {deleted:true,id};});},
  read,
  withMutation(operation){active();return mutation.run(operation);},
  publish(expectedRevision,options={}){active();return mutation.run(async()=>{const draft=store.getDraft();if(draft.revision!==expectedRevision)throw new HttpError(409,'Черновик изменён.','CONTENT_REVISION_CONFLICT');const content=validateContent(draft.content,{forPublication:true});for(const [url,kind] of publicationResources(content)){
    if(url.startsWith('/media/')){const file=await read(url);if(!file)throw new HttpError(400,'Не найден медиафайл: '+url,'CONTENT_MEDIA_MISSING');if(kind&&file.meta.kind!==kind)throw new HttpError(400,'Неверный тип медиафайла: '+url,'CONTENT_MEDIA_TYPE');}
    else if(/^\/(assets|documents)\//.test(url)){const candidate=path.resolve(publicDir,'.'+url.split(/[?#]/)[0]);let real;try{real=await realpath(candidate);const base=await realpath(publicDir),info=await stat(real);if(!real.startsWith(base+path.sep)||!info.isFile())throw new Error();}catch{throw new HttpError(400,'Не найден файл: '+url,'CONTENT_MEDIA_MISSING');}const ext=path.extname(real).slice(1).toLowerCase();if(kind==='document'&&!['pdf','docx'].includes(ext)||kind==='image'&&!['png','jpg','jpeg','webp','avif','svg','ico'].includes(ext))throw new HttpError(400,'Неверный тип файла: '+url,'CONTENT_MEDIA_TYPE');}
   }return store.publish(expectedRevision,options);});},
  async close(){if(closePromise)return closePromise;closed=true;closePromise=(async()=>{await Promise.allSettled([...uploads]);await mutation.close();owners.delete(owner);})();return closePromise;}
 };
 return api;
}
