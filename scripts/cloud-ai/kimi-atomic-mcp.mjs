import {summarizeFailureTAP} from "./phase-progress.mjs";
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createAtomicTools} from './atomic-tools.mjs';
import {claimKimiCall} from './kimi-wire.mjs';
export const KIMI_ATOMIC_TOOLS=['read','edit','write'];
export function createKimiAtomicMCP({root,history,node=process.execPath,emit=()=>{},allowedFunctions=['add'],resolveCall=async request=>String(request.id)}){
 if(!path.isAbsolute(root)||!path.isAbsolute(history))throw Error('absolute-isolated-paths-required');
 if(!Array.isArray(allowedFunctions)||allowedFunctions.length!==1||!['add','multiply'].includes(allowedFunctions[0]))throw Error('kimi-one-phase-function-required');
 const executor=createAtomicTools({root,history,node,emit,allowedFunctions});
 const filePath={type:'string',enum:['/task/backend-limit.mjs']},strings={oldString:{type:'string'},newString:{type:'string'}};
 const tools=[{name:'read',description:'Read a permitted synthetic file.',inputSchema:{type:'object',properties:{filePath:{type:'string',enum:['/task/backend-limit.mjs','/task/backend-limit.test.mjs']}},required:['filePath'],additionalProperties:false}},{name:'edit',description:'Replace exactly one complete function copied from the latest source read. Reread after editing.',inputSchema:{type:'object',properties:{filePath,...strings},required:['filePath','oldString','newString'],additionalProperties:false}},{name:'write',description:'Write the permitted source, changing exactly one function; then reread.',inputSchema:{type:'object',properties:{filePath,content:{type:'string'}},required:['filePath','content'],additionalProperties:false}}];
 return async request=>{
  if(!request||request.jsonrpc!=='2.0'||typeof request.method!=='string')throw Error('invalid-jsonrpc');
  if(request.id===undefined){if(['notifications/initialized','notifications/cancelled'].includes(request.method))return null;throw Error('notification-not-allowed');}
  let result;
  if(request.method==='initialize'){const version=request.params?.protocolVersion;if(!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(version))throw Error('mcp-version-unreviewed');result={protocolVersion:version==='2025-11-25'?'2025-06-18':version,capabilities:{tools:{listChanged:false}},serverInfo:{name:'rsdev-atomic',version:'1.0.0'}};}
  else if(request.method==='ping')result={};
  else if(request.method==='tools/list')result={tools};
  else if(request.method==='tools/call'){
   const name=request.params?.name,args=request.params?.arguments;
   if(!KIMI_ATOMIC_TOOLS.includes(name)||!args||typeof args!=='object'||Array.isArray(args))throw Error('tool-not-allowed');
   const schema=tools.find(t=>t.name===name).inputSchema;
   if(Object.keys(args).some(k=>!Object.hasOwn(schema.properties,k))||schema.required.some(k=>typeof args[k]!=='string'))throw Error('tool-arguments-invalid');
   emit({type:'mcp-native-tool-request',id:request.id,name,arguments:args});
   const callID=await resolveCall(request,name,args);
   try{let content=await executor.execute(name,args,{callID});if(name!=='read'){const value=JSON.parse(content);const diagnostics=summarizeFailureTAP(value.tap);delete value.tap;content=JSON.stringify({...value,diagnostics,fullTAPEvidence:'atomic-commit event'});}result={content:[{type:'text',text:content}],isError:false};}catch(e){result={content:[{type:'text',text:e.message}],isError:true};}
   emit({type:'tool-event',tool:name,callID,status:result.isError?'error':'completed',input:args,...(result.isError?{error:result.content[0].text}:{output:result.content[0].text})});
  }else throw Error('mcp-method-not-allowed');
  return {jsonrpc:'2.0',id:request.id,result};
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.platform!=='linux'||process.env.RS_KIMI_ISOLATED!=='yes'||process.env.RS_ZERO_SPEND_VERIFIED!=='yes')throw Error('isolated-linux-kimi-required');
 const emit=e=>{queue=queue.then(()=>fs.appendFile('/output/KIMI-ATOMIC-EVENTS.jsonl',JSON.stringify({...e,at:new Date().toISOString()})+'\n'));};let queue=Promise.resolve();
 if(process.env.RS_KIMI_PHASE_FILE!=='/cache/kimi-phase.json')throw Error('kimi-owned-phase-file-required');
 const phase=JSON.parse(await fs.readFile('/cache/kimi-phase.json','utf8'));
 const claimed=[];
 const resolveCall=async(request,name,args)=>{const records=(await fs.readFile('/cache/kimi-native-calls.jsonl','utf8')).split('\n').filter(Boolean).map(JSON.parse),row=claimKimiCall(records,claimed,name,args);claimed.push(row.id);emit({type:'kimi-mcp-call-linked',transportID:request.id,callID:row.id,requestID:row.requestID});return row.id;};
 const handle=createKimiAtomicMCP({root:'/task',history:'/output/last-good',emit,allowedFunctions:phase.allowedFunctions??[],resolveCall});let pending='',requests=Promise.resolve();
 process.stdin.on('data',chunk=>{pending+=chunk;if(Buffer.byteLength(pending)>262144){process.exitCode=1;process.stdin.destroy();return;}const lines=pending.split('\n');pending=lines.pop();for(const line of lines.filter(Boolean))requests=requests.then(async()=>{let request;try{request=JSON.parse(line);const reply=await handle(request);await queue;if(reply)process.stdout.write(JSON.stringify(reply)+'\n');}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request?.id??null,error:{code:-32600,message:e.message}})+'\n');}});});
 process.stdin.on('end',()=>{requests.then(()=>queue).catch(()=>{process.exitCode=1;});});
}
