import fs from 'node:fs/promises';
import {summarizeFailureTAP} from './phase-progress.mjs';
import {z} from './vendor-zod/index.js';
import {createAtomicTools} from './atomic-tools.mjs';
export default async function AtomicNativePlugin({directory}){
 if(process.platform==='linux'&&directory!=='/task')throw Error('atomic-plugin-directory-mismatch');
 const replay=process.platform==='win32'?{root:directory,history:directory+'/../last-good',node:process.env.RS_ATOMIC_REPLAY_NODE}:{};
 if(process.platform==='win32'&&!replay.node)throw Error('explicit-local-replay-node-required');
 const phase=process.platform==='linux'?JSON.parse(await fs.readFile('/input/PHASE.json','utf8')):{};
 const allowedFunctions=phase.allowedFunctions??['add','multiply'];if(!Array.isArray(allowedFunctions)||allowedFunctions.some(n=>!['add','multiply'].includes(n)))throw Error('phase-function-policy');
 const executor=createAtomicTools({...replay,allowedFunctions,emit:e=>process.stdout.write(JSON.stringify(e)+'\n')});
 const filePath=z.string();return {tool:Object.fromEntries(['read','write','edit'].map(name=>[name,{
  description:'Restricted atomic native '+name+'. After ANY completed edit, including when all tests pass, the NEXT action MUST be native read of /task/backend-limit.mjs before ending. Read current source before editing. Rejects unsafe, stale, no-op, repeated and multi-function edits. Returns actual protected test diagnostics.',
  args:name==='read'?{filePath}:name==='write'?{filePath,content:z.string()}:{filePath,oldString:z.string().describe('The COMPLETE exact exported target function copied from the latest real read, including function name, parameters, braces and return; never a shared return expression.'),newString:z.string().describe('The same complete function with one arithmetic bug changed; preserve its name and parameters.')},
  execute:async(args,context)=>{const output=await executor.execute(name,args,context);if(name==='read')return output;const value=JSON.parse(output),diagnostics=summarizeFailureTAP(value.tap);delete value.tap;return JSON.stringify({...value,diagnostics,fullTAPEvidence:'atomic-commit event'});}
 }]))};
}
