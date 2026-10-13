import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {monitorBrowser} from '../scripts/browser-resource-monitor.mjs';
const fixture=()=>{const page=new EventEmitter();page.setDefaultTimeout=()=>{};const result={runtimeErrors:[],consoleErrors:[],failedRequests:[],httpErrors:[]};return {page,result,monitor:monitorBrowser(page,result)};};
const response=(page,url,method,status)=>page.emit('response',{url:()=>url,status:()=>status,request:()=>({method:()=>method})});
const consoleError=(page,url,status)=>page.emit('console',{type:()=> 'error',text:()=>`Failed to load resource: the server responded with a status of ${status} ()`,location:()=>({url})});
test('browser monitor records unexpected asset and API HTTP errors',()=>{
 const {page,result}=fixture();for(const [url,status]of [['http://qa.test/assets/missing.js',404],['http://qa.test/api/config',500],['http://qa.test/api/other',404]])response(page,url,'GET',status);
 assert.equal(result.httpErrors.length,3);assert.deepEqual(result.httpErrors.map(x=>x.status),[404,500,404]);
});
test('browser monitor exempts only exact one-use endpoint method status probes',()=>{
 const {page,result,monitor}=fixture(),url='http://qa.test/api/preview-applications';monitor.expectHttpError({url,method:'POST',status:403});
 response(page,url,'GET',403);response(page,url,'POST',500);response(page,url+'?unexpected=1','POST',403);response(page,url,'POST',403);consoleError(page,url,403);response(page,url,'POST',403);
 monitor.finish();assert.equal(result.httpErrors.length,4);assert.equal(result.consoleErrors.length,0);
});
test('browser monitor keeps unmatched resource console transport and runtime errors',()=>{
 const {page,result,monitor}=fixture();consoleError(page,'http://qa.test/assets/unobserved.js',404);page.emit('requestfailed',{url:()=> 'http://qa.test/assets/offline.js',failure:()=>({errorText:'ERR_CONNECTION_RESET'})});page.emit('pageerror',new Error('Unexpected runtime'));page.emit('console',{type:()=> 'error',text:()=> 'Unexpected console',location:()=>({})});monitor.finish();assert.equal(result.consoleErrors.length,2);assert.equal(result.failedRequests.length,1);assert.deepEqual(result.runtimeErrors,['Unexpected runtime']);
});
