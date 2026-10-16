import fs from 'node:fs/promises';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
import {guestEnvironment} from './cloud-ai/policy.mjs';import {inferenceProfile} from './cloud-ai/inference-profile.mjs';import {guestDeadlineMs} from './cloud-ai/execution-budget.mjs';import {verifyModelStore} from './cloud-ai/model-store.mjs';import {waitForPinnedOllama} from './cloud-ai/proxy.mjs';import {completedNativePhase} from './cloud-ai/completion-gate.mjs';import {assertNativePhaseProgress} from './cloud-ai/phase-progress.mjs';import {FILES,sha} from './cloud-ai/contract.mjs';
import {startModelBridge} from './model-bridge.mjs';import {nativePolicy} from './native-policy.mjs';
if(process.platform!=='linux'||process.versions.node!=='24.21.0'||process.env.RS_REMAINING_MODEL_AUTHORIZED!=='yes')throw Error('authorized-pinned-linux-required');
const input=JSON.parse(await fs.readFile('/input/PHASE.json','utf8'));
if(!['codex','openhands'].includes(input.provider)||input.model!=='qwen3:4b'||input.modelLock?.name!==input.model||input.modelLock?.manifestSHA256!==input.modelManifestSHA256||input.allowedFunctions?.length!==1||!['add','multiply','assertLocalToolScope'].includes(input.allowedFunctions[0]))throw Error('reviewed-native-phase-required');
const events=[],started=performance.now(),profile=inferenceProfile(input.model),env={...guestEnvironment({contextTokens:profile.contextTokens}),CODEX_HOME:'/cache/codex',PYTHONPATH:'/opt/openhands',PYTHONDONTWRITEBYTECODE:'1',LITELLM_LOCAL_MODEL_COST_MAP:'True',OTEL_SDK_DISABLED:'true',DO_NOT_TRACK:'1'};
let bridge,agent,ollama,watch,timer,completedTimer,completedSnapshot,completed=false,raw='',stderr='',peakRSSBytes=0,watchFailure;
const cpu=async()=>Number((await fs.readFile('/sys/fs/cgroup/cpu.stat','utf8')).match(/^usage_usec (\d+)/m)?.[1]??0),cpuStart=await cpu();
const stopAgent=signal=>{if(agent?.pid)try{process.kill(-agent.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};
const emit=event=>{events.push(event);process.stdout.write(JSON.stringify({...event,at:new Date().toISOString()})+'\n');if(!completed&&completedNativePhase(events)){completed=true;completedSnapshot=events.slice();completedTimer=setTimeout(()=>stopAgent('SIGTERM'),200);}};
const resources=async()=>({peakRSSBytes,elapsedMs:performance.now()-started,cgroupPeakBytes:Number((await fs.readFile('/sys/fs/cgroup/memory.peak','utf8')).trim()),cpuUsageUsec:await cpu()-cpuStart});
const files=async()=>Object.fromEntries(await Promise.all(FILES.map(async n=>[n,await fs.readFile('/task/'+n,'utf8')])));
try{
 emit({type:'model-store-verified',proof:await verifyModelStore({root:'/models',lock:input.modelLock})});
 await fs.copyFile('/input/'+FILES[0],'/task/'+FILES[0]);const before=await fs.readFile('/task/'+FILES[0],'utf8');if(sha(await fs.readFile('/task/'+FILES[1],'utf8'))!==input.testSHA256)throw Error('protected-test-mount-mismatch');
 await fs.mkdir('/cache/codex',{recursive:true});await fs.mkdir('/output/protocol');
 ollama=spawn('/usr/local/bin/ollama',['serve'],{env,stdio:['ignore','ignore','ignore']});const health=await waitForPinnedOllama({expectedModelDigest:input.modelManifestSHA256,expectedModelName:input.model,emit});
 const executable=input.provider==='codex'?'/opt/codex/codex':'/usr/local/bin/python3.12',version=spawnSync(executable,['--version'],{env,encoding:'utf8',timeout:10000});
 if(version.status!==0||!version.stdout.includes(input.provider==='codex'?'0.162.0-alpha.17.2':'3.12.14'))throw Error('native-runtime-version');
 emit({type:'runtime',provider:input.provider,nodeVersion:process.versions.node,ollamaVersion:health.version,...(input.provider==='codex'?{codexVersion:'0.162.0-alpha.17.2'}:{openhandsVersion:'1.54.0',pythonVersion:'3.12.14'})});
 bridge=await startModelBridge({provider:input.provider,root:'/task',history:'/output/last-good',allowedFunctions:input.allowedFunctions,maximum:6,emit,recordProtocol:async({requestID,kind,body})=>fs.writeFile('/output/protocol/'+kind+'-'+requestID+'.json',JSON.stringify(body),{flag:'wx'})});
 const policy=nativePolicy(input.provider,bridge.port,input.prompt);for(const[name,data]of Object.entries(policy.files)){await fs.mkdir(path.dirname(name),{recursive:true});await fs.writeFile(name,data,{flag:'wx'});}
 agent=spawn(policy.executable,policy.args,{cwd:'/task',env,detached:true,stdio:['ignore','pipe','pipe']});agent.stdout.on('data',b=>{raw+=b;if(Buffer.byteLength(raw)>262144)stopAgent('SIGKILL');});agent.stderr.on('data',b=>{stderr=(stderr+b).slice(-64000);});
 let polling=false;watch=setInterval(()=>{if(polling)return;polling=true;(async()=>{let rss=0;for(const pid of (await fs.readdir('/proc')).filter(p=>/^\d+$/.test(p))){const status=await fs.readFile('/proc/'+pid+'/status','utf8').catch(()=>'');rss+=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]??0)*1024;}peakRSSBytes=Math.max(peakRSSBytes,rss);})().catch(e=>{watchFailure=e;stopAgent('SIGKILL');}).finally(()=>polling=false);},100);
 timer=setTimeout(()=>stopAgent('SIGKILL'),guestDeadlineMs(input.model,input.phaseTimeoutMs,performance.now()-started));
 const termination=await new Promise((resolve,reject)=>{agent.once('error',reject);agent.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});clearInterval(watch);clearTimeout(timer);clearTimeout(completedTimer);while(polling)await new Promise(r=>setTimeout(r,10));
 await fs.writeFile('/output/NATIVE-CLI.jsonl',raw);await fs.writeFile('/output/NATIVE-STDERR.log',stderr);if(watchFailure)throw watchFailure;
 if(!completed||!completedNativePhase(completedSnapshot))throw Error('verified-native-edit-reread-required');
 const after=await files();if(sha(after[FILES[1]])!==input.testSHA256)throw Error('protected-tests-changed');assertNativePhaseProgress({before,after:after[FILES[0]],events});
 const result={files:after,events:completedSnapshot,aiInference:true,exitCode:termination.exitCode,agentTermination:{...termination,reason:'verified-native-write-and-reread'},modelRequests:bridge.count(),resources:await resources()};
 await fs.writeFile('/output/PHASE-RESULT.json',JSON.stringify(result));emit({type:'phase-finished',resources:result.resources});
}catch(error){
 await fs.writeFile('/output/PARTIAL-CHECKPOINT.json',JSON.stringify({status:'partial-unaccepted',reason:error.message,files:await files().catch(()=>null),automaticRetry:false,automaticMerge:false}));emit({type:'phase-failed',reason:error.message});throw error;
}finally{clearInterval(watch);clearTimeout(timer);clearTimeout(completedTimer);stopAgent('SIGKILL');ollama?.kill('SIGKILL');await bridge?.close();}
