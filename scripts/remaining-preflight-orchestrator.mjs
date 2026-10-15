import fs from 'node:fs/promises';import {spawn,spawnSync} from 'node:child_process';
if(process.platform!=='linux'||process.versions.node!=='24.21.0')throw Error('pinned-linux-node-required');const provider=process.argv[2];if(!['codex','openhands'].includes(provider))throw Error('provider-required');
const environment={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/cache',TMPDIR:'/tmp',PYTHONDONTWRITEBYTECODE:'1',CODEX_HOME:'/cache/codex',LITELLM_LOCAL_MODEL_COST_MAP:'True',OTEL_SDK_DISABLED:'true',DO_NOT_TRACK:'1'};
let bridge,agent;const logs={bridge:'',agent:'',stderr:''};let reason;
try{
 bridge=spawn(process.execPath,['/worker/remaining-preflight-server.mjs',provider],{env:environment,stdio:['ignore','pipe','pipe']});bridge.stdout.on('data',b=>logs.bridge+=b);bridge.stderr.on('data',b=>logs.stderr+=b);
 let ready=false;for(let i=0;i<100;i++){try{await fs.access('/cache/ENDPOINT.json');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,50));}if(!ready)throw Error('native-bridge-startup-failed');
 const executable=provider==='codex'?'/opt/codex/codex':'/usr/local/bin/python3.12';const version=spawnSync(executable,['--version'],{env:environment,encoding:'utf8',timeout:10000});if(version.status!==0||!version.stdout.includes(provider==='codex'?'0.162.0-alpha.17.2':'3.12.14'))throw Error('native-runtime-version');
 const args=provider==='codex'?['exec','--model','qwen3:4b','--ephemeral','--json','--sandbox','read-only','--skip-git-repo-check','--cd','/task','Explicit neutral mock only. Exercise read, edit and reread using supplied scoped MCP tools. No commands, helpers or other files.']:['/worker/remaining-openhands-guest.py'];
 agent=spawn(executable,args,{cwd:'/task',env:environment,stdio:['ignore','pipe','pipe']});agent.stdout.on('data',b=>{logs.agent+=b;if(logs.agent.length>262144)agent.kill('SIGKILL');});agent.stderr.on('data',b=>{logs.stderr=(logs.stderr+b).slice(-64000);});
 const timer=setTimeout(()=>{reason='native-agent-deadline';agent.kill('SIGKILL');},150000);const termination=await new Promise((resolve,reject)=>{agent.on('error',reject);agent.on('close',(exitCode,signal)=>resolve({exitCode,signal}));});clearTimeout(timer);if(reason||termination.exitCode!==0)throw Error(reason??'native-agent-failed');
 const result=JSON.parse(await fs.readFile('/output/'+provider+'-NATIVE-PREFLIGHT.json'));if(result.status!=='passed'||result.aiInference!==false||result.modelRequests!==0||result.nativeCallIDs.length!==4)throw Error('neutral-native-edit-reread-unproven');
 await fs.writeFile('/output/'+provider+'-GUEST-SUCCESS.json',JSON.stringify({...result,nativeVersion:version.stdout.trim(),termination,actualAIQualified:false}));
}finally{
 agent?.kill('SIGKILL');bridge?.kill('SIGTERM');if(bridge)await new Promise(resolve=>bridge.exitCode!==null?resolve():bridge.once('close',resolve));await fs.writeFile('/output/'+provider+'-PROCESS-LOGS.json',JSON.stringify(logs));
}
