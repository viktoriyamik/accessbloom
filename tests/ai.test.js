import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichReport} from '../server/ai.js';
import {createDemo} from '../server/demo.js';

test('AI enriches only supported IDs and marks recommendations as AI-generated',async()=>{
 const original=globalThis.fetch;
 try{
  const sample=createDemo();const id=sample.issues[0].id;
  globalThis.fetch=async(url,opts)=>{assert.match(String(url),/\/v1\/responses$/);assert.equal(JSON.parse(opts.body).input[0].content[0].type,'input_text');return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({summary:'One issue has evidence.',strengths:[],priorities:['Fix contrast'],issues:[{id,explanation:'Some readers cannot see it.',recommendation:'Increase contrast.',fix:'color: #333'}, {id:'invented-issue-id',explanation:'fabricated',recommendation:'faked'}]})}]}]})};};
  const updated=await enrichReport(sample,null,{apiKey:'test',model:'fake'});
  assert.equal(updated.aiStatus,'completed');assert.equal(updated.issues[0].recommendation,'Increase contrast.');assert.equal(updated.issues.filter(x=>x.recommendation==='faked').length,0);assert.equal(updated.issues[0].confidence,'ai-suggested');
 }finally{globalThis.fetch=original;}
});
test('provider failures keep automated evidence intact',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>({ok:false,status:503});const r=createDemo(),out=await enrichReport(r,null,{apiKey:'test',model:'fake'});assert.equal(out.aiStatus,'failed');assert.equal(out.issues.length,5);assert.match(out.aiSummary,/unavailable/);}finally{globalThis.fetch=original;}
});
