// Linux native-runtime gate only. All model responses are scripted neutral probes.
import fs from 'node:fs/promises';import http from 'node:http';
import {createKimiAtomicMCP} from './cloud-ai/kimi-atomic-mcp.mjs';
import {claimKimiCall} from './cloud-ai/kimi-wire.mjs';import {cloudAIFiles} from './cloud-ai/fixture.mjs';import {sha,assertTap} from './cloud-ai/contract.mjs';import {completedNativePhase} from './cloud-ai/completion-gate.mjs';
import {codexScopedRequest,codexScopedResponse} from './codex-scoped-wire.mjs';
const provider=process.argv[2];if(!['codex','openhands'].includes(provider)||process.platform!=='linux'||process.versions.node!=='24.21.0')throw Error('pinned-linux-preflight-required');
await fs.mkdir('/task',{recursive:true});for(const[n,s]of Object.entries(cloudAIFiles))await fs.writeFile('/task/'+n,s);
const events=[],ledger=[],claimed=[],before=cloudAIFiles['backend-limit.mjs'],oldString=before.match(/export function add[^}]+}/)[0],newString=oldString.replace('a - b','a - b + 0');let turns=0;
const calls=[['read',{filePath:'/task/backend-limit.mjs'}],['read',{filePath:'/task/backend-limit.test.mjs'}],['edit',{filePath:'/task/backend-limit.mjs',oldString,newString}],['read',{filePath:'/task/backend-limit.mjs'}]];
const save=()=>fs.writeFile('/output/'+provider+'-MCP-EVENTS.json',JSON.stringify(events,null,2));
const handle=createKimiAtomicMCP({root:'/task',history:'/cache/history',allowedFunctions:['add'],emit:e=>events.push(e),resolveCall:async(request,name,args)=>{const row=claimKimiCall(ledger,claimed,name,args);claimed.push(row.id);events.push({type:'native-call-linked',callID:row.id,transportID:request.id});return row.id;}});
async function checkpoint(){
 const source=await fs.readFile('/task/backend-limit.mjs','utf8'),test=await fs.readFile('/task/backend-limit.test.mjs','utf8'),commits=events.filter(e=>e.type==='atomic-commit');
 const passing=commits.length===1&&completedNativePhase(events)&&source===before.replace(oldString,newString)&&test===cloudAIFiles['backend-limit.test.mjs']&&assertTap(commits[0].tap,{passing:false}).fail===6&&commits[0].testExitCode===1&&claimed.length===4;
 await fs.writeFile('/output/'+provider+'-NATIVE-PREFLIGHT.json',JSON.stringify({provider,status:passing?'passed':'incomplete',aiInference:false,modelRequests:0,mockRequests:turns,neutralEdit:true,protectedTestsUnchanged:test===cloudAIFiles['backend-limit.test.mjs'],sourceSHA256:sha(source),testSHA256:sha(test),nativeCallIDs:claimed,writeAndRereadComplete:completedNativePhase(events)}));
}
const server=http.createServer(async(req,res)=>{try{
 if(req.method==='GET'){res.writeHead(405);return res.end();}if(req.method==='DELETE'){res.writeHead(200);return res.end();}if(req.method!=='POST')throw Error('post-only');let text='';for await(const b of req){text+=b;if(text.length>128000)throw Error('bounded-request');}const body=JSON.parse(text);
 if(req.url==='/mcp'){
  if(body.method?.startsWith('notifications/')){res.writeHead(202);return res.end();}const reply=await handle(body);await save();await checkpoint();res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(reply));
 }
 const route=provider==='codex'?'/v1/responses':'/v1/chat/completions';if(req.url!==route||++turns>5)throw Error('mock-request-limit');
 const normalized=provider==='codex'?codexScopedRequest({...body,model:'qwen3:4b'}):body;await fs.writeFile('/output/'+provider+'-MOCK-REQUEST-'+turns+'.json',JSON.stringify(normalized));
 const call=calls[turns-1];if(call&&!normalized.tools.some(t=>t.function?.name===call[0]))throw Error('native-tool-schema-missing');
 const native=call?{id:'explicit-mock-'+provider+'-'+turns,type:'function',function:{name:call[0],arguments:JSON.stringify(call[1])}}:null;
 if(native)ledger.push({type:'native-call',id:native.id,requestID:'explicit-mock-request-'+turns,name:call[0],arguments:native.function.arguments});
 const reply={choices:[{index:0,message:{role:'assistant',content:call?null:'Neutral mock protocol completed; no AI inference.',...(native?{tool_calls:[native]}:{})},finish_reason:call?'tool_calls':'stop'}],id:'explicit-mock-'+turns,object:'chat.completion',created:1,model:'qwen3:4b',usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};
 await checkpoint();if(provider==='codex'){res.writeHead(200,{'content-type':'text/event-stream'});res.end(codexScopedResponse(reply,{requestID:'mock-'+turns}).stream);}else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));}
 }catch(e){await fs.writeFile('/output/'+provider+'-SERVER-ERROR.json',JSON.stringify({reason:e.message}));res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:e.message}}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
if(provider==='codex'){
 await fs.mkdir('/cache/codex',{recursive:true});const catalog={models:[{slug:'qwen3:4b',display_name:'Explicit neutral mock',description:'No AI inference',default_reasoning_level:'none',supported_reasoning_levels:[],shell_type:'disabled',visibility:'hide',supported_in_api:true,priority:0,base_instructions:'Read both files; use native scoped tools only. Follow the explicit mock protocol. No commands.',support_verbosity:false,apply_patch_tool_type:'freeform',truncation_policy:{mode:'tokens',limit:4000},context_window:4096,experimental_supported_tools:[],input_modalities:['text']}]};await fs.writeFile('/cache/models.json',JSON.stringify(catalog));
 await fs.writeFile('/cache/codex/config.toml',`model="qwen3:4b"\nmodel_provider="rsprobe"\napproval_policy="never"\nsandbox_mode="read-only"\nweb_search="disabled"\nmodel_catalog_json="/cache/models.json"\n[model_providers.rsprobe]\nname="Explicit mock"\nbase_url="http://127.0.0.1:${port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\nrequest_max_retries=0\nstream_max_retries=0\nsupports_websockets=false\n[mcp_servers.rsdev]\nurl="http://127.0.0.1:${port}/mcp"\nenabled_tools=["read","edit","write"]\n[mcp_servers.rsdev.tools.read]\napproval_mode="approve"\n[mcp_servers.rsdev.tools.edit]\napproval_mode="approve"\n[mcp_servers.rsdev.tools.write]\napproval_mode="approve"\n[features]\nmulti_agent=false\ngoals=false\nplugins=false\n`);
}
await fs.writeFile('/cache/ENDPOINT.json',JSON.stringify({port,provider,aiInference:false}));console.log('Explicit neutral native preflight ready');
setTimeout(()=>{server.closeAllConnections();server.close();},175000);
