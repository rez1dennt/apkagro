import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
test('scanner guard accepts padded current CVD epoch and fails closed on invalid/stale databases',{skip:process.platform==='win32'},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'apkagro-scanner-regression-'));
 try{
  const database=path.join(directory,'daily.cvd'),stub=path.join(directory,'stub'),wrapper=path.join(directory,'scanner');
  await writeFile(stub,'#!/bin/sh\nif [ "$1" = --version ]; then printf "ClamAV test/1/current\\n"; fi\nexit 0\n',{mode:0o700});
  const source=await readFile(new URL('./apkagro-scan',import.meta.url),'utf8');
  await writeFile(wrapper,source.replace('database=/var/lib/clamav/daily.cvd','database='+database).replaceAll('/usr/bin/clamdscan',stub),{mode:0o700});
  const run=(args=['--no-summary','-'])=>spawnSync('/bin/bash',[wrapper,...args],{input:'synthetic scanner input',encoding:'utf8'}).status;
  assert.equal(run(),2,'missing database');
  const now=Math.floor(Date.now()/1000);
  const header=epoch=>('ClamAV-VDB:01 Jan 2026 00-00 +0000:1:1:90:digest:signature:builder:'+epoch).padEnd(512,' ');
  for(const epoch of [now,now-1000]){await writeFile(database,header(epoch));assert.equal(run(),0,'padded recent epoch');}
  for(const epoch of [now-259201,now+3601,'malformed']){await writeFile(database,header(epoch));assert.equal(run(),2,'stale/future/invalid epoch');}
  assert.equal(run(['--file','unexpected']),2,'only expected stdin contract accepted');
  await writeFile(database,header(now));
  await writeFile(stub,'#!/bin/sh\nprintf "ClamAV test/0/old\\n"\nexit 0\n',{mode:0o700});
  assert.equal(run(),2,'daemon must actually have the verified current daily version');
 }finally{await rm(directory,{recursive:true,force:true});}
});
