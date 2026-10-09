import test from 'node:test';
import assert from 'node:assert/strict';
const logic=await import('../public/assets/js/form-logic.js').catch(()=>({}));
test('form helpers exist',()=>{assert.equal(typeof logic.validSnils,'function');assert.equal(typeof logic.savedApplication,'function');});
test('historical SNILS inclusive boundary is accepted',()=>assert.equal(logic.validSnils('001-001-998 00'),true));
test('current SNILS checksum is validated',()=>{assert.equal(logic.validSnils('112-233-445 95'),true);assert.equal(logic.validSnils('112-233-445 00'),false);assert.equal(logic.validSnils('000-000-000 00'),false);});
test('HTTP 200 HTML fallback cannot confirm application',()=>assert.equal(logic.savedApplication(200,{}),false));
test('HTTP 201 without persisted reference cannot confirm application',()=>{assert.equal(logic.savedApplication(201,null),false);assert.equal(logic.savedApplication(201,{id:'anything'}),false);});
test('HTTP 201 with valid persisted ID and reference confirms application',()=>assert.equal(logic.savedApplication(201,{id:'a799b98c-af22-4c34-a71c-c9bd4e97b6af',reference:'a799b98c-af22-4c34-a71c-c9bd4e97b6af'}),true));
