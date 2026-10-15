import test from 'node:test';import assert from 'node:assert/strict';
import {codexScopedRequest,codexScopedResponse} from './codex-scoped-wire.mjs';
import {inferenceProfile} from './cloud-ai/inference-profile.mjs';import {executionBudget} from './cloud-ai/execution-budget.mjs';
const paths=['/task/backend-limit.mjs','/task/backend-limit.test.mjs'];
const tools=[{type:'namespace',name:'mcp__rsdev',tools:[{type:'function',name:'read',parameters:{type:'object',properties:{filePath:{type:'string'}},required:['filePath']}}]}];
const call=(i)=>({type:'function_call',call_id:'parallel-native-'+i,namespace:'mcp__rsdev',name:'read',arguments:JSON.stringify({filePath:paths[i]})});
const output=i=>({type:'function_call_output',call_id:'parallel-native-'+i,output:'actual tool result '+i});
const body=input=>({model:'qwen3:4b',stream:true,tools,input});
test('parallel Responses calls produce one assistant Chat turn followed by both matching results',()=>{
 const normalized=codexScopedRequest(body([call(0),call(1),output(0),output(1)]));const calls=normalized.messages.filter(m=>m.role==='assistant');assert.equal(calls.length,1);assert.deepEqual(calls[0].tool_calls.map(c=>c.id),['parallel-native-0','parallel-native-1']);assert.deepEqual(normalized.messages.filter(m=>m.role==='tool').map(m=>m.tool_call_id),['parallel-native-0','parallel-native-1']);
});
test('sequential tool turns are not combined across an actual result',()=>{
 const normalized=codexScopedRequest(body([call(0),output(0),call(1),output(1)]));assert.deepEqual(normalized.messages.filter(m=>m.role==='assistant').map(m=>m.tool_calls.length),[1,1]);
});
test('parallel model response roundtrip retains IDs, argument bytes and namespace',()=>{
 const native=[0,1].map(i=>({id:'parallel-native-'+i,type:'function',function:{name:'read',arguments:call(i).arguments}}));const response=codexScopedResponse({choices:[{message:{role:'assistant',tool_calls:native},finish_reason:'tool_calls'}]},{requestID:'parallel-test'});const input=response.response.output.map(({type,call_id,namespace,name,arguments:args})=>({type,call_id,namespace,name,arguments:args}));const next=codexScopedRequest(body([...input,output(0),output(1)]));assert.deepEqual(next.messages.find(m=>m.role==='assistant').tool_calls,native);assert.throws(()=>codexScopedRequest(body([...input,output(0)])),/missing-native-result/);
});
test('longer inference deadline stays below unchanged CLI, phase and workflow limits',()=>{
 const p=inferenceProfile('qwen3:4b'),b=executionBudget('qwen3:4b');assert.equal(p.inferenceTimeoutMs,180000);assert.ok(p.inferenceTimeoutMs<p.cliTimeoutMs);assert.equal(b.phaseMs,360000);assert.equal(b.probeMs,300000);assert.equal(b.workflowMs,1800000);
});
