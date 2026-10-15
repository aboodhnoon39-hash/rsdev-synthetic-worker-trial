import http from 'node:http';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {startInferenceProxy} from './cloud-ai/proxy.mjs';
import {createKimiAtomicMCP} from './cloud-ai/kimi-atomic-mcp.mjs';
import {claimKimiCall} from './cloud-ai/kimi-wire.mjs';
import {sha} from './cloud-ai/contract.mjs';
import {completedNativePhase} from './cloud-ai/completion-gate.mjs';
import {codexScopedRequest,codexScopedResponse} from './codex-scoped-wire.mjs';

// The model receives only native read/edit/write schemas. SDK bookkeeping is
// removed from schemas, never converted into fabricated native tool calls.
export function openhandsScopedRequest(body){
 if(body?.model!=='openai/qwen3:4b'&&body?.model!=='qwen3:4b')throw Error('openhands-model-policy');
 if(body.stream===true||!Array.isArray(body.messages)||!Array.isArray(body.tools))throw Error('openhands-request-policy');
 const seen=new Set();
 const tools=body.tools.map(tool=>{
  const name=tool.function?.name;if(tool.type!=='function'||!['read','edit','write'].includes(name)||seen.has(name))throw Error('openhands-tool-policy');seen.add(name);
  const copy=structuredClone(tool),schema=copy.function.parameters;
  if(schema?.type!=='object'||!schema.properties?.filePath)throw Error('openhands-tool-schema');
  for(const key of ['security_risk','summary'])delete schema.properties[key];
  schema.required=(schema.required??[]).filter(key=>!['security_risk','summary'].includes(key));
  schema.additionalProperties=false;return copy;
 });
 if(!seen.has('read'))throw Error('openhands-native-read-required');
 return {model:'qwen3:4b',messages:structuredClone(body.messages),tools,stream:false,max_tokens:512};
}

export async function startModelBridge({provider,root,history,allowedFunctions,emit=()=>{},recordProtocol=async()=>{},transport,maximum=6}){
 if(!['codex','openhands'].includes(provider))throw Error('provider-required');
 const mock=typeof transport==='function';
 if(!mock&&(process.platform!=='linux'||process.versions.node!=='24.21.0'||process.env.RS_REMAINING_MODEL_AUTHORIZED!=='yes'))throw Error('authorized-pinned-linux-runtime-required');
 const events=[],ledger=[],claimed=[];let phaseCompleted=false;
 const report=event=>{events.push(event);if(event.type==='native-call')ledger.push(event);if(completedNativePhase(events))phaseCompleted=true;emit({...event,provider,...(mock?{evidenceOrigin:'mock-transport-no-inference'}:{})});};
 const handle=createKimiAtomicMCP({root,history,allowedFunctions,emit:report,resolveCall:async(request,name,args)=>{
  const row=claimKimiCall(ledger,claimed,name,args);claimed.push(row.id);report({type:'native-call-linked',callID:row.id,transportID:request.id,requestID:row.requestID});return row.id;
 }});
 const backend=await startInferenceProxy({model:'qwen3:4b',maximum,enforceRequiredRead:true,emit:report,recordProtocol,...(mock?{transport}:{}),sourceSnapshot:async()=>{
  const read=events.findLast(e=>e.type==='atomic-read'&&e.filePath==='/task/backend-limit.mjs');if(!read)return null;
  const source=await fs.readFile(root+'/backend-limit.mjs','utf8');return read.hash===sha(source)?source:null;
 },toolPolicy:async()=>({allowedFunctions,requireRead:events.findLastIndex(e=>e.type==='atomic-commit')>events.findLastIndex(e=>e.type==='atomic-read'&&e.filePath==='/task/backend-limit.mjs')})});
 const sockets=new Set();let closed=false;
 const server=http.createServer(async(req,res)=>{try{
  if(req.method==='GET'){res.writeHead(405);return res.end();}
  if(req.method==='DELETE'&&req.url==='/mcp'){res.writeHead(200);return res.end();}
  if(req.method!=='POST')throw Error('post-only');
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>128000)throw Error('bounded-native-request');}
  const body=JSON.parse(text);
  if(req.url==='/mcp'){
   if(body.method?.startsWith('notifications/')){res.writeHead(202);return res.end();}
   const reply=await handle(body);res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(reply));
  }
  if(req.url!==(provider==='codex'?'/v1/responses':'/v1/chat/completions'))throw Error('native-route-policy');
  if(phaseCompleted)throw Error('native-phase-already-complete');
  const request=provider==='codex'?codexScopedRequest(body):openhandsScopedRequest(body);
  const response=await fetch('http://127.0.0.1:'+backend.port+'/v1/chat/completions',{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(125000)});
  if(!response.ok)throw Error('model-proxy-rejected:'+await response.text());
  const reply=await response.json();
  if(provider==='codex'){res.writeHead(200,{'content-type':'text/event-stream'});res.end(codexScopedResponse(reply,{requestID:randomUUID()}).stream);}
  else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));}
 }catch(error){report({type:'native-bridge-rejected',reason:error.message});if(!res.headersSent)res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}});
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}catch(error){await backend.close();throw error;}
 return {port:server.address().port,events,claimed,count:backend.count,aiInference:!mock,close:async()=>{if(closed)return;closed=true;for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));await backend.close();}};
}
