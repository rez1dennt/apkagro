import { readFile, writeFile } from 'node:fs/promises';
const file=new URL('../tests/server-security.mjs',import.meta.url);let source=await readFile(file,'utf8');
if(!source.includes("getCell('A1').value,'Номер заявки'"))source=source.replace('let found=false;workbook.eachSheet',"assert.equal(workbook.worksheets[0].getCell('A1').value,'Номер заявки');assert.equal(workbook.worksheets[0].getCell('C2').value,'На проверке');assert.match(workbook.worksheets[0].getCell('D2').value,/БАС/);let found=false;workbook.eachSheet");
await writeFile(file,source);
