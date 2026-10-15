import fs from 'node:fs/promises';
import {runKimiGuest} from './kimi-guest.mjs';
import {createKimiAtomicMCP} from './kimi-atomic-mcp.mjs';
import {cloudAIFiles} from './fixture.mjs';
import {assertTap,sha,SOURCE,TEST} from './contract.mjs';
import {completedNativePhase} from './completion-gate.mjs';

// Explicit mock model: a neutral arithmetic identity, never a repair solution.
export async function kimiNativePreflight(){
 const before=cloudAIFiles[SOURCE],oldString=before.match(/export function add[^}]+}/)[0],newString=oldString.replace('a - b','a - b + 0');
 const calls=[['read',{filePath:'/task/'+SOURCE}],['read',{filePath:'/task/'+TEST}],['edit',{filePath:'/task/'+SOURCE,oldString,newString}],['read',{filePath:'/task/'+SOURCE}]];let turn=0;
 const mockTransport=async request=>{const call=calls[turn++];return {id:'explicit-kimi-mock-'+turn,created:0,model:request.model,choices:[{message:{role:'assistant',content:call?null:'Mock protocol completed; no AI inference.',...(call?{tool_calls:[{id:'kimi-mock-call-'+turn,type:'function',function:{name:call[0],arguments:JSON.stringify(call[1])}}]}:{})},finish_reason:call?'tool_calls':'stop'}]};};
 const result=await runKimiGuest({input:{provider:'kimi',model:'qwen3:4b',allowedFunctions:['add'],phaseTimeoutMs:300000,maximumRequests:6,prompt:'Explicit local protocol mock; exercise only the supplied native tools. No real AI inference.',testSHA256:sha(cloudAIFiles[TEST]),source:before},mockTransport});
 const handle=createKimiAtomicMCP({root:'/task',history:'/output/denied-probe',allowedFunctions:['add']});let id=0;
 const denied=async(name,arguments_)=>{const reply=await handle({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:arguments_}});return reply.result.isError===true;};
 const protectedDenied=await denied('write',{filePath:'/task/'+TEST,content:'forbidden'}),externalDenied=await denied('read',{filePath:'/etc/passwd'});
 const commits=result.events.filter(e=>e.type==='atomic-commit'),tools=result.events.filter(e=>e.type==='tool-event');
 const checks={kimiRuntimeVersion:result.events.some(e=>e.type==='runtime'&&e.provider==='kimi'&&e.kimiVersion==='2.1.1'),kimiNativeMCPAndCompletion:result.aiInference===false&&result.modelRequests===0&&result.mockRequests>=4&&commits.length===1&&assertTap(commits[0].tap,{passing:false}).fail===6&&commits[0].testExitCode===1&&completedNativePhase(result.events.slice(0,result.events.findLastIndex(e=>e.type==='tool-event')+1))&&tools.some(e=>e.tool==='edit'&&e.callID==='kimi-mock-call-3'&&e.status==='completed'),kimiProtectedScope:protectedDenied&&externalDenied&&await fs.readFile('/task/'+SOURCE,'utf8')===before.replace(oldString,newString)&&sha(await fs.readFile('/task/'+TEST))===sha(cloudAIFiles[TEST])};
 await fs.writeFile('/output/KIMI-PREFLIGHT.json',JSON.stringify({aiInference:false,modelRequests:0,mockRequests:result.mockRequests,checks,agentTermination:result.agentTermination}));return checks;
}
