import fs from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {guestEnvironment} from './policy.mjs';
import {inferenceProfile} from './inference-profile.mjs';
import {guestDeadlineMs} from './execution-budget.mjs';
import {verifyModelStore} from './model-store.mjs';
import {waitForPinnedOllama} from './proxy.mjs';
import {startKimiProxy} from './kimi-proxy.mjs';
import {kimiCloudPolicy} from './kimi-policy.mjs';
import {completedNativePhase} from './completion-gate.mjs';
import {assertNativePhaseProgress} from './phase-progress.mjs';
import {FILES,sha} from './contract.mjs';

export async function runKimiGuest({input:providedInput,mockTransport}={}){
 if(process.platform!=='linux'||process.versions.node!=='24.21.0')throw Error('pinned-linux-node-required');
 const input=providedInput??JSON.parse(await fs.readFile('/input/PHASE.json','utf8')),mock=typeof mockTransport==='function';
 if(input.provider!=='kimi'||input.model!=='qwen3:4b'||!Array.isArray(input.allowedFunctions)||input.allowedFunctions.length!==1||!['add','multiply'].includes(input.allowedFunctions[0]))throw Error('kimi-phase-policy-required');
 const started=performance.now(),events=[],emit=e=>{const row={at:new Date().toISOString(),...e,...(mock?{evidenceOrigin:'mock-model-no-inference'}:{})};events.push(row);process.stdout.write(JSON.stringify(row)+'\n');};
 const profile=inferenceProfile(input.model),env={...guestEnvironment({contextTokens:profile.contextTokens}),KIMI_CODE_HOME:'/cache/kimi',DO_NOT_TRACK:'1',KIMI_SHELL_PATH:'/bin/bash'};
 let ollama,agent,proxy,watch,timer,evidenceCompleted=false,raw='',stderr='',peakRSSBytes=0,offset=0,busy=false,watchFailure;
 const cpu=async()=>Number((await fs.readFile('/sys/fs/cgroup/cpu.stat','utf8')).match(/^usage_usec (\d+)/m)?.[1]??0),cpuStart=await cpu();
 const resources=async()=>({peakRSSBytes,elapsedMs:performance.now()-started,cgroupPeakBytes:Number((await fs.readFile('/sys/fs/cgroup/memory.peak','utf8')).trim()),cpuUsageUsec:await cpu()-cpuStart});
 const stopAgent=signal=>{if(agent?.pid)try{process.kill(-agent.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}};
 const savePartial=async reason=>{const files=Object.fromEntries(await Promise.all(FILES.map(async n=>[n,await fs.readFile('/task/'+n,'utf8')])));await fs.writeFile('/output/PARTIAL-CHECKPOINT.json',JSON.stringify({status:'partial-unaccepted',provider:'kimi',reason,files,hashes:Object.fromEntries(FILES.map(n=>[n,sha(files[n])])),automaticRetry:false,automaticMerge:false,requiresReconciliation:true}));};
 const poll=async()=>{
  if(busy)return;busy=true;try{
   const pids=(await fs.readdir('/proc')).filter(p=>/^\d+$/.test(p));let rss=0;for(const pid of pids){const status=await fs.readFile('/proc/'+pid+'/status','utf8').catch(()=>'');rss+=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]??0)*1024;}peakRSSBytes=Math.max(peakRSSBytes,rss);
   const text=await fs.readFile('/output/KIMI-ATOMIC-EVENTS.jsonl','utf8').catch(error=>{if(error.code==='ENOENT')return '';throw error;});
   const complete=text.lastIndexOf('\n')+1;if(complete<offset)throw Error('kimi-event-log-truncated');const lines=text.slice(offset,complete).split('\n').filter(Boolean);offset=complete;
   for(const line of lines){const event=JSON.parse(line);emit(event);if(event.type==='atomic-commit')await savePartial('completed-native-write');if(completedNativePhase(events)){evidenceCompleted=true;stopAgent('SIGTERM');}}
  }finally{busy=false;}
 };
 try{
  if(!mock){if(input.modelLock?.name!==input.model||input.modelLock.manifestSHA256!==input.modelManifestSHA256)throw Error('model-store-pin-required');emit({type:'model-store-verified',proof:await verifyModelStore({root:'/models',lock:input.modelLock})});}
  if(mock)await fs.writeFile('/task/'+FILES[0],input.source);else await fs.copyFile('/input/'+FILES[0],'/task/'+FILES[0]);await fs.mkdir('/cache/kimi',{recursive:true});await fs.mkdir('/cache/empty-skills');await fs.mkdir('/output/protocol');await fs.writeFile('/cache/kimi-phase.json',JSON.stringify(input),{flag:'wx'});
  let health={version:null};if(!mock){ollama=spawn('/usr/local/bin/ollama',['serve'],{env,stdio:['ignore','ignore','ignore']});health=await waitForPinnedOllama({expectedModelDigest:input.modelManifestSHA256,expectedModelName:input.model,emit});}
  const cli='/opt/kimi/dist/main.mjs',version=spawnSync(process.execPath,[cli,'--version'],{env,encoding:'utf8',timeout:10000});if(version.status!==0||version.stdout.trim()!=='2.1.1')throw Error('kimi-runtime-version-mismatch');emit({type:'runtime',provider:'kimi',kimiVersion:'2.1.1',ollamaVersion:health.version,nodeVersion:process.versions.node});
  proxy=await startKimiProxy({ledger:'/cache/kimi-native-calls.jsonl',beforeRequest:async()=>{while(busy)await new Promise(resolve=>setTimeout(resolve,1));await poll();},model:input.model,maximum:input.maximumRequests??6,emit,...(mock?{transport:mockTransport}:{}),sourceSnapshot:async()=>{const read=events.findLast(e=>e.type==='atomic-read'&&e.filePath==='/task/'+FILES[0]);if(!read)return null;const source=await fs.readFile('/task/'+FILES[0],'utf8');return read.hash===sha(source)?source:null;},toolPolicy:async()=>({allowedFunctions:input.allowedFunctions,requireRead:events.findLastIndex(e=>e.type==='atomic-commit')>events.findLastIndex(e=>e.type==='atomic-read'&&e.filePath==='/task/'+FILES[0])}),recordProtocol:async({requestID,kind,body})=>fs.writeFile('/output/protocol/'+kind+'-'+requestID+'.json',JSON.stringify(body),{flag:'wx'})});
  const policy=kimiCloudPolicy({port:proxy.port});await fs.writeFile('/cache/kimi/config.toml',policy.config);await fs.writeFile('/cache/kimi-agent.md',policy.agent);await fs.writeFile('/cache/kimi/mcp.json',JSON.stringify(policy.mcp));
  const args=policy.args.map(value=>value==='/worker/kimi-agent.md'?'/cache/kimi-agent.md':value==='/worker/empty-skills'?'/cache/empty-skills':value);
  agent=spawn(process.execPath,[cli,...args,'--prompt',input.prompt],{cwd:'/task',env,detached:true,stdio:['ignore','pipe','pipe']});
  agent.stdout.on('data',chunk=>{raw+=chunk;if(Buffer.byteLength(raw)>262144)stopAgent('SIGKILL');});agent.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-64000);});
  watch=setInterval(()=>poll().catch(error=>{watchFailure=error;stopAgent('SIGKILL');}),100);
  timer=setTimeout(()=>stopAgent('SIGKILL'),guestDeadlineMs(input.model,input.phaseTimeoutMs,performance.now()-started));
  const termination=await new Promise((resolve,reject)=>{agent.once('error',reject);agent.once('close',(exitCode,signal)=>resolve({exitCode,signal}));});clearInterval(watch);clearTimeout(timer);while(busy)await new Promise(resolve=>setTimeout(resolve,10));await poll();
  await fs.writeFile('/output/KIMI-CLI.jsonl',raw);if(watchFailure)throw watchFailure;if(termination.exitCode!==0&&!evidenceCompleted)throw Error('kimi-cli-exit:'+JSON.stringify(termination)+':'+stderr.slice(-3000));
  const files=Object.fromEntries(await Promise.all(FILES.map(async n=>[n,await fs.readFile('/task/'+n,'utf8')])));if(sha(files[FILES[1]])!==input.testSHA256)throw Error('protected-tests-changed');assertNativePhaseProgress({before:mock?input.source:await fs.readFile('/input/'+FILES[0],'utf8'),after:files[FILES[0]],events});
  const result={files,events,aiInference:!mock,exitCode:termination.exitCode,agentTermination:{...termination,reason:evidenceCompleted?'verified-native-write-and-reread':'natural-cli-exit'},modelRequests:mock?0:proxy.count(),mockRequests:mock?proxy.count():0,resources:await resources()};await fs.writeFile(mock?'/output/KIMI-MOCK-PHASE-RESULT.json':'/output/PHASE-RESULT.json',JSON.stringify(result));emit({type:'phase-finished',resources:result.resources});return result;
 }catch(error){await savePartial('phase-failed').catch(()=>{});emit({type:'phase-failed',reason:error.message,resources:await resources().catch(()=>null)});throw error;}
 finally{clearInterval(watch);clearTimeout(timer);stopAgent('SIGKILL');ollama?.kill('SIGKILL');await proxy?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runKimiGuest();
