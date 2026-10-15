import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {startInferenceProxy} from './proxy.mjs';
import {normalizeKimiRequest,restoreKimiResponse} from './kimi-wire.mjs';

export async function startKimiProxy({ledger,emit=()=>{},...options}){
 if(typeof ledger!=='string'||!path.isAbsolute(ledger)||ledger.split(/[\\/]/).includes('..'))throw Error('kimi-absolute-ledger-required');
 fs.writeFileSync(ledger,'',{flag:'wx'});
 const backend=await startInferenceProxy({...options,emit:event=>{if(event.type==='native-call')fs.appendFileSync(ledger,JSON.stringify(event)+'\n');emit(event);}});
 const server=http.createServer(async(req,res)=>{try{
  if(req.method!=='POST'||req.url!=='/v1/chat/completions')throw Error('kimi-route-not-allowed');
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>128000)throw Error('kimi-request-too-large');}
  const original=JSON.parse(text),request=normalizeKimiRequest(original);
  const response=await fetch('http://127.0.0.1:'+backend.port+'/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(125000),headers:{'content-type':'application/json'},body:JSON.stringify(request)});
  if(!response.ok)throw Error('kimi-proxy-rejected:'+await response.text());
  const reply=restoreKimiResponse(await response.json()),message=reply.choices?.[0]?.message;if(!message)throw Error('kimi-response-message-required');
  if(original.stream){const base={id:reply.id,object:'chat.completion.chunk',created:reply.created,model:reply.model},calls=message.tool_calls??[];res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant',content:message.content??'',...(calls.length?{tool_calls:calls.map((call,index)=>({...call,index}))}:{})},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:reply.choices[0].finish_reason}],usage:reply.usage})+'\n\ndata: [DONE]\n\n');}else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(reply));}
 }catch(error){emit({type:'kimi-wire-rejected',reason:error.message});if(!res.headersSent)res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}});
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}catch(error){await backend.close();throw error;}
 return {port:server.address().port,count:backend.count,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await backend.close();}};
}
