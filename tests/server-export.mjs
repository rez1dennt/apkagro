import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationsWorkbook } from '../server/export.mjs';
import ExcelJS from 'exceljs';

test('application export uses Russian labels and keeps identifiers as text', async()=>{
 const workbook=createApplicationsWorkbook([{id:'test-id',createdAt:'2026-10-09T10:15:00Z',status:'review',courseId:'flowers',lastName:'Тестовый',firstName:'Участник',middleName:'',birthDate:'2000-01-02',phone:'+79991234567',email:'=test@example.test',snils:'01223344595',education:'student',consentVersion:'2026-10-09',consentAt:'2026-10-09T10:15:00Z'}]);
 const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
 const sheet=loaded.getWorksheet('Заявки');
 assert.deepEqual(sheet.getRow(1).values.slice(1),['Номер заявки','Дата подачи (МСК)','Статус','Программа обучения','Фамилия','Имя','Отчество','Дата рождения','Телефон','Электронная почта','СНИЛС','Уровень образования','Версия согласия','Дата согласия (МСК)']);
 const row=sheet.getRow(2);assert.equal(row.getCell(2).value,'09.10.2026 13:15');assert.equal(row.getCell(3).value,'На проверке');assert.equal(row.getCell(4).value,'Декоративное цветоводство');assert.equal(row.getCell(8).value,'02.01.2000');assert.equal(row.getCell(10).value,'=test@example.test');assert.equal(row.getCell(11).value,'01223344595');assert.equal(row.getCell(12).value,'Студент 4-го курса и старше');
 sheet.eachRow(r=>r.eachCell(c=>assert.notEqual(c.type,ExcelJS.ValueType.Formula)));
 assert.equal(sheet.views[0].ySplit,1);assert.ok(sheet.autoFilter);assert.equal(sheet.getRow(1).font.bold,true);
});
