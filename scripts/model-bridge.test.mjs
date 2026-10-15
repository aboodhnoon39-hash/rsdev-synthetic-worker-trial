import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {startModelBridge,openhandsScopedRequest} from './model-bridge.mjs';
import {cloudAIFiles} from './cloud-ai/fixture.mjs';
const schemas=[['read',['filePath']],['edit',['filePath','oldString','newString']],['write',['filePath','content']]].map(([name,keys])=>({type:'function',function:{name,description:'Scoped native tool',parameters:{type:'object',properties:Object.fromEntries([...keys,'summary','security_risk'].map(key=>[key,{type:'string'}])),required:[...keys,'summary','security_risk']}}}));
const request=()=>({model:'qwen3:4b',messages:[{role:'user',content:'Read /task/backend-limit.mjs using the native tool.'}],tools:structuredClone(schemas),stream:false});
const reply=(name='read',args={filePath:'/task/backend-limit.mjs'},id='genuine-transport-call')=>({choices:[{message:{role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
async function fixture(fn){const root=await fs.mkdtemp(path.join(os.tmpdir(),'model-bridge-'));for(const[name,data]of Object.entries(cloudAIFiles))await fs.writeFile(path.join(root,name),data);let bridge;try{await fn(root,async options=>bridge=await startModelBridge({root,history:path.join(root,'history'),provider:'openhands',allowedFunctions:['add'],...options}));}finally{await bridge?.close();await fs.rm(root,{recursive:true,force:true});}}
const post=(bridge,route,body)=>fetch('http://127.0.0.1:'+bridge.port+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('production transport requires explicitly authorized pinned Linux',async()=>{await assert.rejects(startModelBridge({provider:'codex',root:process.cwd(),history:process.cwd(),allowedFunctions:['add']}),/authorized-pinned-linux/);});
test('OpenHands bookkeeping is removed from schemas without mutating SDK input',()=>{const body=request(),clean=openhandsScopedRequest(body);assert.deepEqual(clean.tools[0].function.parameters.required,['filePath']);assert.ok(body.tools[0].function.parameters.properties.summary);assert.equal(clean.model,'qwen3:4b');assert.equal(clean.max_tokens,512);});
test('OpenHands rejects unexpected tool and model',()=>{const b=request();b.tools.push({type:'function',function:{name:'terminal'}});assert.throws(()=>openhandsScopedRequest(b),/tool-policy/);assert.throws(()=>openhandsScopedRequest({...request(),model:'paid-model'}),/model-policy/);});
test('actual MCP read must match a native model call and cannot be reused',async()=>fixture(async(root,start)=>{
 const recorded=[];const b=await start({transport:async body=>{recorded.push(body);return reply();}});
 const unclaimed=await post(b,'/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read',arguments:{filePath:'/task/backend-limit.mjs'}}});assert.equal(unclaimed.status,403);
 assert.equal((await post(b,'/v1/chat/completions',request())).status,200);
 const call={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'read',arguments:{filePath:'/task/backend-limit.mjs'}}};
 const res=await post(b,'/mcp',call);assert.equal(res.status,200);assert.equal((await res.json()).result.content[0].text,cloudAIFiles['backend-limit.mjs']);
 assert.deepEqual(b.claimed,['genuine-transport-call']);assert.equal(b.aiInference,false);assert.equal(b.count(),1);
 assert.equal((await post(b,'/mcp',{...call,id:3})).status,403);assert.equal(recorded[0].tools.length,3);
 assert.equal(await fs.readFile(path.join(root,'backend-limit.test.mjs'),'utf8'),cloudAIFiles['backend-limit.test.mjs']);
}));
test('model cannot issue writes to protected tests',async()=>fixture(async(root,start)=>{
 const b=await start({transport:async()=>reply('write',{filePath:'/task/backend-limit.test.mjs',content:'changed'})});
 assert.equal((await post(b,'/v1/chat/completions',request())).status,403);assert.equal(b.claimed.length,0);assert.equal(await fs.readFile(path.join(root,'backend-limit.test.mjs'),'utf8'),cloudAIFiles['backend-limit.test.mjs']);
}));
test('prose containing JSON cannot authorize a native tool',async()=>fixture(async(root,start)=>{
 const b=await start({transport:async()=>({choices:[{message:{role:'assistant',content:JSON.stringify({name:'read',arguments:{filePath:'/task/backend-limit.mjs'}})},finish_reason:'stop'}]})});
 assert.equal((await post(b,'/v1/chat/completions',request())).status,200);
 const response=await post(b,'/mcp',{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'read',arguments:{filePath:'/task/backend-limit.mjs'}}});assert.equal(response.status,403);assert.equal(b.claimed.length,0);
}));
test('Codex Responses preserves native call identity and namespace',async()=>fixture(async(root,start)=>{
 const b=await start({provider:'codex',transport:async()=>reply()});const tools=schemas.map(t=>({type:'function',...t.function}));
 const response=await post(b,'/v1/responses',{model:'qwen3:4b',stream:true,input:[{role:'user',content:'Read source'}],tools:[{type:'namespace',name:'mcp__rsdev',tools}]});assert.equal(response.status,200);const stream=await response.text();assert.match(stream,/"namespace":"mcp__rsdev"/);assert.match(stream,/"call_id":"genuine-transport-call"/);
 assert.equal((await post(b,'/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'read',arguments:{filePath:'/task/backend-limit.mjs'}}})).status,200);
}));
test('the same request budget bounds successive model requests',async()=>fixture(async(root,start)=>{
 const b=await start({maximum:1,transport:async()=>reply()});assert.equal((await post(b,'/v1/chat/completions',request())).status,200);assert.equal((await post(b,'/v1/chat/completions',request())).status,403);assert.equal(b.count(),1);
}));
