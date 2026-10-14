// Explicitly simulated Stage One protocol; no inference and no arithmetic solution.
export function createIsolationProtocol(source='backend-limit.mjs',test='backend-limit.test.mjs') {
 const calls=[
  {name:'read',args:{filePath:'/task/'+source}},
  {name:'write',args:{filePath:'/task/'+source,content:'// native CLI write verified; not a task solution\n'}},
  {name:'edit',args:{filePath:'/task/'+source,oldString:'write verified',newString:'edit verified'}},
  {name:'write',args:{filePath:'/task/'+test,content:'must be denied'}},
  {name:'read',args:{filePath:'/etc/passwd'}},
  {name:'write',args:{filePath:'/task/not-allowed.mjs',content:'must be denied'}},
  {name:'read',args:{filePath:'/task/not-allowed.mjs'}}
 ];let step=0,requests=0,auxiliary=0;
 return {state:()=>({step,requests,auxiliary}),reply(body){
  if(body.model!=='qwen3:1.7b'||!Array.isArray(body.messages)||!['boolean','undefined'].includes(typeof body.stream))throw Error('mock-request-schema');
  const tools=body.tools??[];if(!Array.isArray(tools)||tools.some(t=>t.type!=='function'||!['read','write','edit'].includes(t.function?.name)))throw Error('mock-tool-scope');
  if(++requests>16)throw Error('mock-request-budget');
  if(!tools.length){auxiliary++;return {auxiliary:true,step,toolCalls:[],message:{role:'assistant',content:'Isolation probe'}};}
  if(new Set(tools.map(t=>t.function.name)).size!==3)throw Error('mock-native-tools-incomplete');
  const c=calls[step++],toolCalls=c?[{id:'mock-probe-'+step,type:'function',function:{name:c.name,arguments:JSON.stringify(c.args)}}]:[];
  return {auxiliary:false,step,toolCalls,message:c?{role:'assistant',content:null,tool_calls:toolCalls}:{role:'assistant',content:'The mock protocol probe is complete.'}};
 }};
}
export function respondIsolationChat(res,body,reply){
 const base={id:reply.auxiliary?'mock-auxiliary':'mock-probe',created:0,model:body.model};
 if(body.stream){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify({...base,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:reply.message.content,...(reply.toolCalls.length?{tool_calls:reply.toolCalls.map((c,index)=>({...c,index}))}:{})},finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({...base,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:reply.toolCalls.length?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');}
 else {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({...base,object:'chat.completion',choices:[{index:0,message:reply.message,finish_reason:reply.toolCalls.length?'tool_calls':'stop'}]}));}
}
