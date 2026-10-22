import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const port=46590;
test('Public demo and owner-protected endpoints with HTTP security headers',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'accessbloom-http-'));
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('../',import.meta.url).pathname,env:{...process.env,PORT:String(port),BASE_PATH:'/accessbloom',HOST:'127.0.0.1',SCAN_ACCESS_TOKEN:'a'.repeat(32),DATA_DIR:dir,OPENAI_API_KEY:'',SCAN_ALLOWED_HOSTS:'vik.ooo'},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<30;i++){await sleep(80);try{const res=await fetch(`http://127.0.0.1:${port}/accessbloom/api/health`);if(res.ok){ready=true;break;}}catch{}}
  assert.equal(ready,true,'server starts');
  const demo=await fetch(`http://127.0.0.1:${port}/accessbloom/api/demo`);assert.equal(demo.status,200);assert.match(demo.headers.get('content-security-policy'),/frame-ancestors 'none'/);const data=await demo.json();assert.equal(data.issues.length,5);
  const without=await fetch(`http://127.0.0.1:${port}/accessbloom/api/reports`);assert.equal(without.status,401);
  const withAuth=await fetch(`http://127.0.0.1:${port}/accessbloom/api/reports`,{headers:{Authorization:'Bearer '+'a'.repeat(32)}});assert.equal(withAuth.status,200);assert.deepEqual(await withAuth.json(),[]);
  const page=await fetch(`http://127.0.0.1:${port}/accessbloom/`);assert.match(await page.text(),/AccessBloom/);
  const traversal=await fetch(`http://127.0.0.1:${port}/accessbloom/../../.env`);assert.equal(traversal.status,404);
 }finally{child.kill('SIGTERM');await sleep(100);rmSync(dir,{recursive:true,force:true});}
});
