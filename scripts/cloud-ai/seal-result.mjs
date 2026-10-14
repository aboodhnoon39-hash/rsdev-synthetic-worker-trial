import {validateAtomicEvidence} from './atomic-evidence.mjs';
import fs from 'node:fs/promises';import {validatePacket,validateResult,sha,signAIResult} from './contract.mjs';
if(process.env.RS_AI_EXECUTION_AUTHORIZED!=='yes'||process.env.GITHUB_ACTIONS!=='true')throw Error('signing-authorization-required');
const stat=await fs.lstat('received/AI-RESULT.json');if(!stat.isFile()||stat.isSymbolicLink()||stat.size>262144)throw Error('ai-result-file-size-policy');const packet=validatePacket(JSON.parse(await fs.readFile('tasks/AI-PACKET.json'))),body=JSON.parse(await fs.readFile('received/AI-RESULT.json'));if(process.env.RS_EXPECTED_AI_PACKET_SHA256!==sha(packet))throw Error('signer-packet-mismatch');
validateAtomicEvidence(body);validateResult(body,{packet,repository:process.env.GITHUB_REPOSITORY,headSHA:process.env.GITHUB_SHA,runID:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT});
await fs.writeFile('AI-BUNDLE.json',JSON.stringify(signAIResult(body,process.env.RS_AI_SIGNING_KEY)),{flag:'wx'});
