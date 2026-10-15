import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createKimiAtomicMCP} from './kimi-atomic-mcp.mjs';
import {kimiCloudPolicy} from './kimi-policy.mjs';
import {inferenceProfile} from './inference-profile.mjs';
import {completedNativePhase} from './completion-gate.mjs';
import {assertNativePhaseProgress} from './phase-progress.mjs';
import {cloudAIFiles} from './fixture.mjs';
import {assertTap} from './contract.mjs';

test('installed Kimi protocol version negotiates the supported MCP version without extra capabilities',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-negotiate-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const handle=createKimiAtomicMCP({root:await fs.realpath(dir),history:path.join(dir,'history')});
 const reply=await handle({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
 assert.equal(reply.result.protocolVersion,'2025-06-18');assert.deepEqual(reply.result.capabilities,{tools:{listChanged:false}});
 await assert.rejects(handle({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'unknown'}}),/unreviewed/);
 for(const allowedFunctions of [[],['add','multiply'],['shell']])assert.throws(()=>createKimiAtomicMCP({root:dir,history:dir,allowedFunctions}),/one-phase-function/);
 assert.equal(kimiCloudPolicy({port:11435}).cliTimeoutMs,inferenceProfile('qwen3:4b').cliTimeoutMs);
});

// Scripted native tool arguments exercise real filesystem/test execution, not model inference.
test('two Kimi MCP phases enforce scope, protected tests and correlated completion evidence',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-cycle-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const root=await fs.realpath(dir);for(const[n,s]of Object.entries(cloudAIFiles))await fs.writeFile(path.join(root,n),s);
 let id=0;const source='/task/backend-limit.mjs',testFile='/task/backend-limit.test.mjs';
 const badAdd='export function add(a, b) { return a - b; }',goodAdd='export function add(a, b) { return a + b; }';
 const badMultiply='export function multiply(a, b) { return a + b; }',goodMultiply='export function multiply(a, b) { return a * b; }';
 for(const [fn,beforeFunction,afterFunction,expectedPass] of [['add',badAdd,goodAdd,3],['multiply',badMultiply,goodMultiply,6]]){
  const events=[],before=await fs.readFile(path.join(root,'backend-limit.mjs'),'utf8');
  const handle=createKimiAtomicMCP({root,history:path.join(root,'history'),allowedFunctions:[fn],emit:e=>events.push(e)});
  const call=async(name,args)=>handle({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}});
  const content=r=>r.result.content[0].text;
  const edit={filePath:source,oldString:beforeFunction,newString:afterFunction};
  assert.equal((await call('edit',edit)).result.isError,true);
  assert.equal(content(await call('read',{filePath:source})),before);
  assert.equal((await call('write',{filePath:testFile,content:'tampered'})).result.isError,true);
  assert.equal((await call('read',{filePath:'/task/../secret'})).result.isError,true);
  if(fn==='add'){
   const forbidden=await call('edit',{filePath:source,oldString:badMultiply,newString:goodMultiply});
   assert.equal(forbidden.result.isError,true);assert.match(content(forbidden),/phase-function-not-allowed/);
   assert.equal(await fs.readFile(path.join(root,'backend-limit.mjs'),'utf8'),before);
  }
  const edited=await call('edit',edit);assert.equal(edited.result.isError,false,content(edited));
  const receipt=JSON.parse(content(edited)),counts=assertTap(receipt.tap,{passing:expectedPass===6});
  assert.equal(counts.pass,expectedPass);assert.equal(receipt.testExitCode,expectedPass===6?0:1);
  assert.equal(completedNativePhase(events),false);
  await call('read',{filePath:testFile});assert.equal(completedNativePhase(events),false);
  await call('read',{filePath:source});assert.equal(completedNativePhase(events),true);
  const after=await fs.readFile(path.join(root,'backend-limit.mjs'),'utf8');assertNativePhaseProgress({before,after,events});
  const commit=events.find(e=>e.type==='atomic-commit');assert.ok(events.some(e=>e.type==='tool-event'&&e.tool==='edit'&&e.callID===commit.callID&&e.status==='completed'));
  assert.equal(completedNativePhase(events.filter(e=>!(e.type==='tool-event'&&e.tool==='edit'&&e.callID===commit.callID))),false);
  assert.equal(await fs.readFile(path.join(root,'backend-limit.test.mjs'),'utf8'),cloudAIFiles['backend-limit.test.mjs']);
 }
});
