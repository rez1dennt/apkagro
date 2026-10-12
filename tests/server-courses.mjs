import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFields} from '../server/intake.mjs';
import {courses} from '../public/assets/js/courses.js';
import {CONSENT_VERSION} from '../public/assets/js/organization.js';
import {createApplicationsWorkbook} from '../server/export.mjs';

const fields={lastName:'Тестовый',firstName:'Участник',birthDate:'1990-01-01',phone:'+79991234567',email:'synthetic@example.test',snils:'11223344595',education:'professional',consent:'true',consentVersion:CONSENT_VERSION};

test('cheesemaking and every published course are accepted, unknown IDs are rejected',()=>{
  assert.equal(validateFields({...fields,courseId:'cheese'}).courseId,'cheese');
  assert.equal(courses.cheese.title,'Сыроделие');
  for(const courseId of Object.keys(courses))assert.equal(validateFields({...fields,courseId}).courseId,courseId);
  for(const courseId of ['unknown','constructor','__proto__','toString',''])assert.throws(()=>validateFields({...fields,courseId}),/Выберите программу/);
});

test('cheesemaking applications export the public course title',()=>{
  const workbook=createApplicationsWorkbook([{...fields,courseId:'cheese',id:'synthetic-cheese',createdAt:'2026-10-12T10:00:00Z',status:'new'}]);
  assert.equal(workbook.getWorksheet('Заявки').getRow(2).getCell(4).value,'Сыроделие');
});
