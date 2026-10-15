// Explicit transport simulations; no actual model inference or source repair.
import test from 'node:test';import assert from 'node:assert/strict';import {startInferenceProxy,scopedInferenceTools} from './cloud-ai/proxy.mjs';
const tools=['read','edit','write'].map(name=>({type:'function',function:{name,description:'Scoped native tool',parameters:{type:'object',properties:{filePath:{type:'string'},...(name==='edit'?{oldString:{type:'string'},newString:{type:'string'}}:name==='write'?{content:{type:'string'}}:{})},required:['filePath']}}}));
const post=proxy=>fetch('http://127.0.0.1:'+proxy.port+'/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'qwen3:4b',messages:[{role:'user',content:'Explicit protocol fixture only; change one permitted function.'}],tools})});
const prose=()=>({choices:[{message:{role:'assistant',content:'The unchanged source means the operation completed successfully.'},finish_reason:'stop'}]});
const write=()=>({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'actual-correction-response-id',type:'function',function:{name:'edit',arguments:JSON.stringify({filePath:'/task/backend-limit.mjs',oldString:'export function add(a, b) { return a - b; }',newString:'export function add(a, b) { return a - b + 0; }'})}}]},finish_reason:'tool_calls'}]});
test('premature success prose is replaced only by a new counted native model response',async()=>{
 const events=[],requests=[];let count=0;const p=await startInferenceProxy({model:'qwen3:4b',maximum:6,enforceRequiredWrite:true,emit:e=>events.push(e),toolPolicy:async()=>({allowedFunctions:['add'],requireWrite:true}),transport:async b=>{requests.push(b);return ++count===1?prose():write();}});
 try{const r=await post(p);assert.equal(r.status,200);const answer=await r.json();assert.equal(answer.choices[0].message.tool_calls[0].id,'actual-correction-response-id');assert.equal(p.count(),2);assert.equal(events.filter(e=>e.type==='inference-complete').length,2);assert.equal(events.filter(e=>e.type==='native-call').length,1);assert.ok(requests[1].messages.some(m=>m.content?.includes('No source change was committed')));assert.deepEqual(requests[0].tools.map(t=>t.function.name),['edit','write']);}finally{await p.close();}
});
test('repeated premature prose fails after the bounded correction with no native calls invented',async()=>{
 const events=[];const p=await startInferenceProxy({model:'qwen3:4b',maximum:6,enforceRequiredWrite:true,emit:e=>events.push(e),toolPolicy:async()=>({requireWrite:true}),transport:async()=>prose()});
 try{const r=await post(p);assert.equal(r.status,403);assert.match(await r.text(),/required-native-write-missing/);assert.equal(p.count(),2);assert.equal(events.filter(e=>e.type==='native-call').length,0);}finally{await p.close();}
});
test('correction cannot exceed the original request budget',async()=>{
 const p=await startInferenceProxy({model:'qwen3:4b',maximum:1,enforceRequiredWrite:true,emit:()=>{},toolPolicy:async()=>({requireWrite:true}),transport:async()=>prose()});
 try{const r=await post(p);assert.equal(r.status,403);assert.match(await r.text(),/route-or-budget/);assert.equal(p.count(),1);}finally{await p.close();}
});
test('required progress rejects another read instead of silently treating it as a write',async()=>{
 const p=await startInferenceProxy({model:'qwen3:4b',enforceRequiredWrite:true,emit:()=>{},toolPolicy:async()=>({requireWrite:true}),transport:async()=>({choices:[{message:{role:'assistant',tool_calls:[{id:'still-read',type:'function',function:{name:'read',arguments:'{"filePath":"/task/backend-limit.mjs"}'}}]}}]})});
 try{const r=await post(p);assert.equal(r.status,403);assert.match(await r.text(),/required-native-write-call/);}finally{await p.close();}
});
test('fresh-read mode and write mode preserve mutually scoped native capabilities',()=>{
 assert.deepEqual(scopedInferenceTools(tools,{requireRead:true}).map(t=>t.function.name),['read']);assert.deepEqual(scopedInferenceTools(tools,{requireWrite:true}).map(t=>t.function.name),['edit','write']);
});
