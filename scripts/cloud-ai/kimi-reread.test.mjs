// Recorded failure replay and mocked transport only. No new model/cloud qualification.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {startKimiProxy} from './kimi-proxy.mjs';import {completedNativePhase} from './completion-gate.mjs';
import {createKimiAtomicMCP} from './kimi-atomic-mcp.mjs';import {claimKimiCall} from './kimi-wire.mjs';
const recordedRequest=JSON.parse(await fs.readFile(new URL('./fixtures/kimi-38726412495-final-request.json',import.meta.url)));
const recordedReply=JSON.parse(await fs.readFile(new URL('./fixtures/kimi-38726412495-final-response.json',import.meta.url)));
const wire={...recordedRequest,tools:recordedRequest.tools.map(tool=>({...tool,function:{...tool.function,name:'mcp__rsdev__'+tool.function.name}}))};
wire.messages=structuredClone(recordedRequest.messages);for(const message of wire.messages)for(const call of message.tool_calls??[])call.function.name='mcp__rsdev__'+call.function.name;
const readReply=(filePath='/task/backend-limit.mjs')=>({id:'explicit-mock-correction',choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'explicit-mock-native-read',type:'function',function:{name:'read',arguments:JSON.stringify({filePath})}}]},finish_reason:'tool_calls'}]});
async function harness(t,{transport,maximum=6,requireRead=true}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-reread-')),ledger=path.join(dir,'calls.jsonl'),events=[],protocol=[];
 const proxy=await startKimiProxy({ledger,model:'qwen3:4b',maximum,toolPolicy:async()=>({requireRead}),emit:e=>events.push(e),recordProtocol:async e=>protocol.push(structuredClone(e)),transport});
 t.after(async()=>{await proxy.close();await fs.rm(dir,{recursive:true,force:true});});
 const request=()=>fetch('http://127.0.0.1:'+proxy.port+'/v1/chat/completions',{method:'POST',body:JSON.stringify(wire)});
 return {proxy,events,protocol,request,ledger};
}
test('recorded premature final answer is withheld; one mocked correction preserves actual read id and full inference audit',async t=>{
 let calls=0;const h=await harness(t,{transport:async()=>++calls===1?structuredClone(recordedReply):readReply()});
 const r=await h.request();assert.equal(r.status,200);const reply=await r.json();assert.equal(reply.choices[0].message.tool_calls[0].id,'explicit-mock-native-read');assert.equal(h.proxy.count(),2);
 assert.equal(h.events.filter(e=>e.type==='required-source-reread-missing').length,1);assert.equal(h.events.filter(e=>e.type==='native-call').length,1);assert.equal(h.events.filter(e=>e.type==='inference-complete').length,h.proxy.count());
 assert.equal(h.protocol.length,4);assert.notEqual(h.protocol[0].requestID,h.protocol[2].requestID);assert.match(h.protocol[0].body.messages.at(-1).content,/Verification is still pending/);assert.match(h.protocol[2].body.messages.at(-1).content,/last correction opportunity/);
 assert.deepEqual(h.protocol[2].body.tools.map(x=>x.function.name),['read']);assert.equal('tool_choice' in h.protocol[2].body,false);
 const records=(await fs.readFile(h.ledger,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(records.length,1);assert.equal(records[0].requestID,h.protocol[2].requestID);
 // A proxy call is not execution evidence; only the actual MCP read can finish a phase.
 assert.equal(completedNativePhase(h.events),false);
});
test('two recorded prose responses fail closed without fabricating a read or repeatedly retrying',async t=>{
 const h=await harness(t,{transport:async()=>structuredClone(recordedReply)}),r=await h.request();assert.equal(r.status,403);assert.match(await r.text(),/required-source-reread-missing/);assert.equal(h.proxy.count(),2);assert.equal(await fs.readFile(h.ledger,'utf8'),'');
});
test('correction uses original request budget and cannot extend exhausted allowance',async t=>{
 const h=await harness(t,{maximum:1,transport:async()=>structuredClone(recordedReply)}),r=await h.request();assert.equal(r.status,403);assert.match(await r.text(),/budget/);assert.equal(h.proxy.count(),1);assert.equal(await fs.readFile(h.ledger,'utf8'),'');
});
test('reading protected tests cannot replace required source reread',async t=>{
 const h=await harness(t,{transport:async()=>readReply('/task/backend-limit.test.mjs')}),r=await h.request();assert.equal(r.status,403);assert.match(await r.text(),/required-source-reread-target/);assert.equal(await fs.readFile(h.ledger,'utf8'),'');
});
test('assistant text resembling a tool call remains prose and cannot satisfy reread',async t=>{
 const response=structuredClone(recordedReply);response.choices[0].message.content=JSON.stringify(readReply().choices[0].message.tool_calls);
 const h=await harness(t,{transport:async()=>response}),r=await h.request();assert.equal(r.status,403);assert.equal(await fs.readFile(h.ledger,'utf8'),'');
});
test('normal completion without pending commit remains unchanged and consumes one request',async t=>{
 const h=await harness(t,{requireRead:false,transport:async()=>structuredClone(recordedReply)}),r=await h.request();assert.equal(r.status,200);assert.equal(h.proxy.count(),1);assert.equal(h.protocol[0].body.messages.length,recordedRequest.messages.length);
});
test('recorded commit plus mocked correction requires actual filesystem MCP reread before completion gate opens',async t=>{
 let calls=0;const h=await harness(t,{transport:async()=>++calls===1?structuredClone(recordedReply):readReply()});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-recorded-commit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=await fs.realpath(dir);
 const partial=JSON.parse(await fs.readFile(new URL('./fixtures/kimi-38726412495-partial.json',import.meta.url)));for(const[n,s]of Object.entries(partial.files))await fs.writeFile(path.join(root,n),s);
 const events=(await fs.readFile(new URL('./fixtures/kimi-38726412495-phase2-events.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(completedNativePhase(events),false);
 const r=await h.request();assert.equal(r.status,200);const native=(await r.json()).choices[0].message.tool_calls[0],args=JSON.parse(native.function.arguments);
 const handle=createKimiAtomicMCP({root,history:path.join(root,'history'),allowedFunctions:['multiply'],emit:e=>events.push(e),resolveCall:async(request,name,arguments_)=>{
  const rows=(await fs.readFile(h.ledger,'utf8')).trim().split('\n').map(JSON.parse);return claimKimiCall(rows,[],name,arguments_).id;
 }});
 const result=await handle({jsonrpc:'2.0',id:77,method:'tools/call',params:{name:'read',arguments:args}});assert.equal(result.result.isError,false);assert.equal(result.result.content[0].text,partial.files['backend-limit.mjs']);assert.equal(events.at(-1).callID,native.id);assert.equal(completedNativePhase(events),true);
});
