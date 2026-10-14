import {assertTap} from './contract.mjs';
export function validateAtomicEvidence(body){
 if(body.toolProtocolVersion!=='atomic-native-v1'||!body.phases?.length)throw Error('atomic-tool-protocol-required');
 for(const phase of body.phases??[]){const writes=phase.toolEvents.filter(e=>['edit','write'].includes(e.tool)&&e.status==='completed'),commits=phase.atomicEvents?.filter(e=>e.type==='atomic-commit')??[];
  if(!writes.length||writes.length!==commits.length)throw Error('atomic-commit-evidence-missing');
  for(const write of writes){const commit=commits.find(c=>c.callID===write.callID);if(!commit||commit.nodeVersion!=='v24.21.0'||commit.automaticMerge!==false||commit.testSHA256!==body.checkpoint['backend-limit.test.mjs'])throw Error('atomic-commit-evidence-inconsistent');const counts=assertTap(commit.tap,{passing:false});if(commit.testExitCode!==(counts.fail?1:0))throw Error('atomic-tap-exit-inconsistent');const at=phase.atomicEvents.indexOf(commit);if(!phase.atomicEvents.slice(at+1).some(e=>e.type==='atomic-read'&&e.hash===commit.sourceSHA256))throw Error('reread-after-atomic-edit-required');}
  if(commits.at(-1).sourceSHA256!==phase.sourceSHA256)throw Error('atomic-final-source-mismatch');
 }return body;
}
