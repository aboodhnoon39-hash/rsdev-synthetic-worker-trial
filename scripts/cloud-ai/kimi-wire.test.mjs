import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeKimiRequest,restoreKimiResponse,claimKimiCall} from './kimi-wire.mjs';
test('Kimi names map both ways without changing model tool ids or arguments',()=>{
 const args=JSON.stringify({filePath:'/task/backend-limit.mjs'}),body={model:'qwen3:4b',stream:true,tools:[{type:'function',function:{name:'mcp__rsdev__read',parameters:{}}}],messages:[{role:'assistant',tool_calls:[{id:'llm-12',type:'function',function:{name:'mcp__rsdev__read',arguments:args}}]},{role:'tool',tool_call_id:'llm-12',content:'source'}]};
 const b=normalizeKimiRequest(body);assert.equal(b.stream,false);assert.equal(b.tools[0].function.name,'read');assert.equal(b.messages[0].tool_calls[0].id,'llm-12');assert.equal(b.messages[1].tool_call_id,'llm-12');assert.equal(body.tools[0].function.name,'mcp__rsdev__read');
 const reply=restoreKimiResponse({choices:[{message:{role:'assistant',tool_calls:[{id:'llm-13',function:{name:'edit',arguments:args}}]}}]});assert.equal(reply.choices[0].message.tool_calls[0].function.name,'mcp__rsdev__edit');assert.equal(reply.choices[0].message.tool_calls[0].id,'llm-13');
});
test('shell tools, duplicate aliases and forged historical calls are rejected',()=>{
 const request=names=>({tools:names.map(name=>({type:'function',function:{name}})),messages:[]});
 for(const names of [['Bash'],['read'],['mcp__rsdev__read','mcp__rsdev__read'],[]])assert.throws(()=>normalizeKimiRequest(request(names)));
 assert.throws(()=>normalizeKimiRequest({...request(['mcp__rsdev__read']),messages:[{role:'assistant',tool_calls:[{function:{name:'Bash'}}]}]}));assert.throws(()=>restoreKimiResponse({choices:[{message:{tool_calls:[{function:{name:'shell'}}]}}]}));
});
test('MCP transport id cannot masquerade as a model call; ledger claims match exact actual arguments once',()=>{
 const args={filePath:'/task/backend-limit.mjs'},row={type:'native-call',requestID:'inference-1',id:'real-model-call-7',name:'read',arguments:JSON.stringify(args)};
 assert.equal(claimKimiCall([row],[],'read',args).id,'real-model-call-7');
 for(const [records,claimed,name,input] of [[[],[],'read',args],[[row],['real-model-call-7'],'read',args],[[row],[],'write',args],[[row],[],'read',{...args,command:'shell'}],[[row,{...row,id:'another'}],[],'read',args],[[row,row],[],'read',args]])assert.throws(()=>claimKimiCall(records,claimed,name,input));
});
