// Reviewed candidate protocol adapter only. It never executes tools or parses prose as a call.
const namespace='mcp__rsdev',names=['read','edit','write'],source='/task/backend-limit.mjs',tests='/task/backend-limit.test.mjs';
function check(name,raw){
 const args=typeof raw==='string'?JSON.parse(raw):raw;
 if(!names.includes(name)||!args||typeof args!=='object'||Array.isArray(args))throw Error('native-tool-arguments');
 const keys={read:['filePath'],edit:['filePath','oldString','newString'],write:['filePath','content']}[name];
 if(Object.keys(args).sort().join()!==keys.sort().join()||keys.some(k=>typeof args[k]!=='string'))throw Error('native-tool-arguments');
 if(![source,...(name==='read'?[tests]:[])].includes(args.filePath))throw Error('native-tool-scope');return args;
}
export function codexScopedRequest(body){
 if(body?.model!=='qwen3:4b'||body.stream!==true||!Array.isArray(body.input)||body.input.length>30||body.instructions!==undefined&&body.instructions!==null&&typeof body.instructions!=='string'||body.previous_response_id||body.store===true)throw Error('codex-request-policy');
 const group=(body.tools??[]).filter(t=>t.type==='namespace'&&t.name===namespace);if(group.length!==1)throw Error('codex-scoped-namespace-required');
 const seen=new Set(),tools=group[0].tools.map(t=>{
  if(t.type!=='function'||!names.includes(t.name)||seen.has(t.name)||t.parameters?.type!=='object')throw Error('codex-scoped-tool-policy');seen.add(t.name);
  return {type:'function',function:{name:t.name,description:t.description??'',parameters:structuredClone(t.parameters)}};
 });if(!seen.has('read'))throw Error('codex-native-read-required');
 const messages=[{role:'system',content:body.instructions??''}],pending=new Map();
 for(const item of body.input){
  if((item.type??'message')==='message'){
   if(!['user','assistant','system','developer'].includes(item.role))throw Error('codex-message-role');const content=typeof item.content==='string'?item.content:item.content?.map(c=>{if(!['input_text','output_text'].includes(c.type)||typeof c.text!=='string')throw Error('codex-text-only');return c.text;}).join('\n');if(typeof content!=='string')throw Error('codex-message-content');messages.push({role:item.role==='developer'?'system':item.role,content});
  }else if(item.type==='function_call'){
   if(item.namespace!==namespace||typeof item.call_id!=='string'||!item.call_id||pending.has(item.call_id))throw Error('codex-call-identity');check(item.name,item.arguments);pending.set(item.call_id,item.name);
   const call={id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments}},last=messages.at(-1);
   // Responses emits each parallel function call as a separate item. Chat
   // requires one assistant turn containing the full set of parallel calls.
   if(last?.role==='assistant'&&Array.isArray(last.tool_calls))last.tool_calls.push(call);
   else messages.push({role:'assistant',content:null,tool_calls:[call]});
  }else if(item.type==='function_call_output'){
   if(!pending.has(item.call_id))throw Error('codex-unmatched-result');pending.delete(item.call_id);messages.push({role:'tool',tool_call_id:item.call_id,content:typeof item.output==='string'?item.output:JSON.stringify(item.output)});
  }else if(item.type==='reasoning'){
   if(item.encrypted_content)throw Error('codex-encrypted-history-unsupported');
  }else throw Error('codex-input-policy');
 }
 if(pending.size)throw Error('codex-missing-native-result');
 if(Buffer.byteLength(JSON.stringify({messages,tools}))>10000)throw Error('codex-context-budget');
 return {model:'qwen3:4b',messages,tools,stream:false,max_tokens:512,temperature:0.7,top_p:0.8,reasoning_effort:'none'};
}
export function codexScopedResponse(reply,{requestID}){
 if(typeof requestID!=='string'||!requestID)throw Error('codex-request-id');const message=reply?.choices?.[0]?.message;
 if(message?.role!=='assistant')throw Error('codex-model-response');
 const calls=message.tool_calls??[],ids=new Set(),output=[];
 for(const call of calls){
  if(call.type!=='function'||typeof call.id!=='string'||!call.id||ids.has(call.id))throw Error('codex-native-call-id');ids.add(call.id);check(call.function?.name,call.function?.arguments);
  output.push({id:'fc-'+call.id,call_id:call.id,type:'function_call',name:call.function.name,namespace,arguments:call.function.arguments,status:'completed'});
 }
 if(!calls.length&&reply.choices[0].finish_reason==='length')throw Error('codex-truncated-prose');
 if(!calls.length)output.push({id:'message-'+requestID,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:message.content??'',annotations:[]}]});
 const response={id:requestID,object:'response',created_at:Math.floor(Date.now()/1000),model:'qwen3:4b',status:'completed',output,usage:{input_tokens:reply.usage?.prompt_tokens??0,output_tokens:reply.usage?.completion_tokens??0,total_tokens:reply.usage?.total_tokens??0}};
 const events=[{type:'response.created',response:{...response,status:'in_progress',output:[]}}];
 output.forEach((item,output_index)=>{
  events.push({type:'response.output_item.added',output_index,item:{...item,...(item.type==='function_call'?{arguments:''}:{})}});
  if(item.type==='function_call')events.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index,delta:item.arguments},{type:'response.function_call_arguments.done',item_id:item.id,output_index,arguments:item.arguments});
  events.push({type:'response.output_item.done',output_index,item});
 });events.push({type:'response.completed',response});
 return {response,stream:events.map((event,sequence_number)=>'event: '+event.type+'\ndata: '+JSON.stringify({...event,sequence_number})+'\n\n').join('')};
}
