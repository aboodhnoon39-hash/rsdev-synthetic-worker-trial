import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {startKimiProxy} from './kimi-proxy.mjs';import {summarizeFailureTAP} from './phase-progress.mjs';
test('recorded protected diagnostics retain all counts while removing verbose stacks',async()=>{
 const tap=await fs.readFile(new URL('./fixtures/actual-failure.tap',import.meta.url),'utf8'),summary=summarizeFailureTAP(tap);assert.ok(summary.length<tap.length/3);assert.match(summary,/# fail 6/);assert.match(summary,/expected=5; actual=-1/);assert.equal(summary.includes('node:internal'),false);
});
test('queued MCP state is ingested before proxy chooses tools; post-commit request offers source reread only',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-sync-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let committed=false,sent;
 const proxy=await startKimiProxy({ledger:path.join(dir,'ledger.jsonl'),model:'qwen3:4b',emit:()=>{},beforeRequest:async()=>{committed=true;},toolPolicy:async()=>({requireRead:committed}),transport:async body=>{sent=body;return {id:'mock',model:body.model,choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'mock-read',type:'function',function:{name:'read',arguments:JSON.stringify({filePath:'/task/backend-limit.mjs'})}}]},finish_reason:'tool_calls'}]};}});t.after(()=>proxy.close());
 const tools=['read','edit','write'].map(name=>({type:'function',function:{name:'mcp__rsdev__'+name,parameters:{type:'object',properties:{filePath:{type:'string'},oldString:{type:'string'},newString:{type:'string'}}}}}));
 const response=await fetch('http://127.0.0.1:'+proxy.port+'/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'qwen3:4b',messages:[{role:'user',content:'mock synchronization probe'}],tools})});assert.equal(response.status,200);await response.text();assert.deepEqual(sent.tools.map(t=>t.function.name),['read']);assert.deepEqual(sent.tools[0].function.parameters.properties.filePath.enum,['/task/backend-limit.mjs']);
});
