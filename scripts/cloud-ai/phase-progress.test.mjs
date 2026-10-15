import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {assertNativePhaseProgress,compactFailureTAP} from './phase-progress.mjs';import {sha,assertTap} from './contract.mjs';import {openCodeConfig} from './policy.mjs';
const evidence=fileURLToPath(new URL('./fixtures/recorded-phase-progress/',import.meta.url)); // Historical synthetic OpenCode regression only.
test('recorded run: native reads followed by JSON text do not qualify as a native write',async()=>{
 const events=(await fs.readFile(evidence+'/phase-1/TRACE.jsonl','utf8')).trim().split('\n').map(JSON.parse),reads=events.filter(e=>e.type==='tool-event'&&e.tool==='read');assert.equal(reads.length,2);const source=reads[0].output;
 const response=JSON.parse(await fs.readFile(evidence+'/phase-1/output/protocol/response-d76d0874-c08c-4697-b3f1-1ed5bdb96ab2.json'));assert.ok(response.choices[0].message.content.includes('"name": "edit"'));assert.equal(response.choices[0].message.tool_calls,undefined);
 assert.throws(()=>assertNativePhaseProgress({before:source,after:source,events}),/native-write-not-observed/);
});
test('phase progress requires changed source, matched commit and latest reread',()=>{
 const before='baseline',after='changed',events=[{type:'tool-event',tool:'edit',status:'completed',callID:'1'},{type:'atomic-commit',callID:'1',sourceSHA256:sha(after)},{type:'atomic-read',hash:sha(after)}];assert.equal(assertNativePhaseProgress({before,after,events}),true);
 assert.throws(()=>assertNativePhaseProgress({before:after,after,events}),/no-source-change/);assert.throws(()=>assertNativePhaseProgress({before,after,events:events.slice(0,2)}),/reread/);assert.throws(()=>assertNativePhaseProgress({before,after,events:[{...events[0],callID:'2'},...events.slice(1)]}),/commit-mismatch/);
});
test('recorded real failing TAP is compacted without losing case names or assertion values',async()=>{
 const request=JSON.parse(await fs.readFile(evidence+'/phase-2/output/protocol/request-6582ff81-12ed-4bc9-baec-df2f136ef6af.json')),system=request.messages[0].content,start=system.indexOf('TAP version 13'),end=system.indexOf('\nYou are powered');const raw=system.slice(start,end),compact=compactFailureTAP(raw);
 assert.deepEqual(assertTap(compact,{passing:false}),assertTap(raw,{passing:false}));assert.ok(compact.length<raw.length/3);for(const name of ['add positives','add negative','add zero','multiply positives','multiply negative','multiply zero'])assert.ok(compact.includes(name));for(const value of ['expected: 5','actual: -1','expected: -6','actual: 1'])assert.ok(compact.includes(value));assert.equal(compact.includes('node:internal'),false);
});
test('phase user diagnostics are not duplicated in agent system configuration',()=>{const prompt='unique-phase-error-239718';assert.equal(openCodeConfig(1234,prompt).agent.cloudfix.prompt.includes(prompt),false);});
