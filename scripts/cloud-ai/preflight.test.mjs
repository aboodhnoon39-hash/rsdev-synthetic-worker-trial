// Actual preflight function, real package/runtime bytes, simulated Linux/CLI/resources only.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {runPreflight} from './preflight.mjs';import {verifyKimiRuntime} from './kimi-runtime.mjs';import {sha} from './contract.mjs';
const root=new URL('../../',import.meta.url),packet=JSON.parse(await fs.readFile(new URL('tasks/AI-PACKET.json',root)));
function setup(){
 const writes=[],spawns=[];let runtimeVerified=false;
 const dependencies={platform:'linux',env:{GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',RS_AI_EXECUTION_AUTHORIZED:'yes',RS_ZERO_SPEND_VERIFIED:'yes',RS_KIMI_LINUX_SUBSTITUTE_APPROVED:'yes',GITHUB_EVENT_PATH:'MOCK-EVENT.json',RS_EXPECTED_AI_PACKET_SHA256:sha(packet)},
 read:async name=>name==='MOCK-EVENT.json'?JSON.stringify({repository:{private:false,full_name:'aboodhnoon39-hash/rsdev-synthetic-worker-trial'}}):fs.readFile(new URL(name,root)),write:async(name,bytes)=>writes.push({name,bytes}),statfs:async()=>({bavail:16*1024**3,bsize:1}),spawn:(name,args)=>{spawns.push({name,args});return {status:0};},system:{freemem:()=>12*1024**3,totalmem:()=>16*1024**3,cpus:()=>[{},{}]},
 verifyRuntime:async options=>{await verifyKimiRuntime({...options,root:fileURLToPath(new URL('vendor/kimi/',root))});runtimeVerified=true;}};
 return {dependencies,writes,spawns,verified:()=>runtimeVerified};
}
test('actual packaged preflight accepts reviewed readiness and real pinned runtime with simulated resources',async()=>{
 const h=setup(),proof=await runPreflight(h.dependencies);assert.equal(h.verified(),true);assert.deepEqual(h.spawns.map(x=>x.name),['docker','zstd']);assert.equal(proof.aiExecutionStarted,false);assert.equal(h.writes[0].name,'RESOURCE-PREFLIGHT.json');
});
test('recorded failed readiness label is rejected before CLI checks or resource writes',async()=>{
 const h=setup(),read=h.dependencies.read;h.dependencies.read=async name=>name==='READINESS-GATE.json'?JSON.stringify({status:'LOCAL REPAIR VERIFIED - CLOUD TRIAL AWAITS SPECIFIC APPROVAL',localSecurityReviewed:true,requiresGitHubStageOne:true}):read(name);
 await assert.rejects(runPreflight(h.dependencies),/local-security-review-required/);assert.equal(h.spawns.length,0);assert.equal(h.writes.length,0);
});
test('preflight rejects rerun, missing authority and missing Linux substitution',async()=>{
 for(const [key,value] of [['GITHUB_RUN_ATTEMPT','2'],['RS_AI_EXECUTION_AUTHORIZED','no'],['RS_ZERO_SPEND_VERIFIED','no'],['RS_KIMI_LINUX_SUBSTITUTE_APPROVED','no']]){const h=setup();h.dependencies.env[key]=value;await assert.rejects(runPreflight(h.dependencies));assert.equal(h.spawns.length,0);assert.equal(h.writes.length,0);}
});
test('preflight rejects packet digest and runtime integrity drift before resource checks',async()=>{
 const h=setup();h.dependencies.env.RS_EXPECTED_AI_PACKET_SHA256='0'.repeat(64);await assert.rejects(runPreflight(h.dependencies),/immutable-input/);assert.equal(h.spawns.length,0);
 const x=setup();x.dependencies.verifyRuntime=async()=>{throw Error('simulated-runtime-integrity-failure');};await assert.rejects(runPreflight(x.dependencies),/runtime-integrity/);assert.equal(x.spawns.length,0);
});
test('preflight retains low-memory and failed-CLI rejections after readiness passes',async()=>{
 const h=setup();h.dependencies.system.freemem=()=>1024;await assert.rejects(runPreflight(h.dependencies),/resources-insufficient/);assert.equal(h.writes.length,1);
 const x=setup();x.dependencies.spawn=()=>({status:1});await assert.rejects(runPreflight(x.dependencies),/resources-insufficient/);assert.equal(x.writes.length,1);
});
