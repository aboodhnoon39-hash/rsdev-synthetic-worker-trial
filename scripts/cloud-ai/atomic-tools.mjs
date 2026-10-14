import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {SOURCE,TEST,sha} from './contract.mjs';
import {validateGeneratedSource} from './source-policy.mjs';

// This executor accepts native tool arguments, never assistant text or shell commands.
export function createAtomicTools({root='/task',history='/output/last-good',node='/usr/local/bin/node',emit=()=>{},beforeCommit=async()=>{}}={}) {
 let queue=Promise.resolve(),readHash=null,nodeVersion=null;const attempted=new Set();
 const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 async function scoped(filePath,writing=false){
  const allowed=[SOURCE,TEST];const name=filePath?.startsWith('/task/')?filePath.slice(6):filePath;
  if(!allowed.includes(name)||writing&&name!==SOURCE)throw Error('tool-out-of-scope: only source may be changed; tests are protected');
  const target=path.join(root,name),s=await fs.lstat(target);
  if(!s.isFile()||s.isSymbolicLink()||await fs.realpath(target)!==path.join(await fs.realpath(root),name))throw Error('tool-path-not-regular');return target;
 }
 const syntax=source=>{const r=spawnSync(node,['--input-type=module','--check'],{input:source,encoding:'utf8',timeout:5000,maxBuffer:32000,env:{PATH:path.dirname(node)}});if(r.status!==0)throw Error('syntax-invalid: '+(r.stderr||r.error?.message||'parser failed').slice(0,3000));};
 const execute=(name,args,context={})=>serial(async()=>{
  let temp;const fingerprint=sha({name,filePath:args.filePath,nameArgs:name==='write'?{content:args.content}:{oldString:args.oldString,newString:args.newString}});try{
   const target=await scoped(args.filePath,name!=='read'),current=await fs.readFile(target,'utf8');
   if(name==='read'){if(path.basename(target)===SOURCE)readHash=sha(current);emit({type:'atomic-read',filePath:args.filePath,hash:sha(current),callID:context.callID});return current;}
   if(!['edit','write'].includes(name))throw Error('tool-not-available');
   if(attempted.has(fingerprint))throw Error('repeated-edit: identical request already attempted; reread and change the actual edit');
   if(readHash!==sha(current))throw Error('read-current-source-first: source changed or has not been read');
   attempted.add(fingerprint);
   let candidate;
   if(name==='edit'){
    if(typeof args.oldString!=='string'||!args.oldString.length||typeof args.newString!=='string')throw Error('edit-arguments-invalid');
    if(args.oldString===args.newString)throw Error('no-op: oldString and newString are identical');
    const count=current.split(args.oldString).length-1;if(count!==1){readHash=null;throw Error('oldString-mismatch-or-ambiguous: '+count+' exact matches; read the current source again and use the COMPLETE exact exported target function as oldString');}
    const completeFunctions=[...current.matchAll(/export\s+function\s+(?:add|multiply)\s*\([^)]*\)\s*\{[^}]*\}/g)].map(m=>m[0]);
    if(!completeFunctions.includes(args.oldString)){readHash=null;throw Error('full-function-oldString-required: read the current source again; copy the COMPLETE exact exported target function, not a shared return expression');}
    candidate=current.replace(args.oldString,args.newString);
   }else candidate=args.content;
   if(typeof candidate!=='string'||candidate===current)throw Error('no-op: content did not change');
   if(candidate.includes('\\n'))throw Error('literal-backslash-n: use actual newline characters, not escaped text');
   if(!nodeVersion){const version=spawnSync(node,['--version'],{encoding:'utf8',timeout:5000,env:{PATH:path.dirname(node)}}),actualVersion=version.stdout?.trim();if(version.status!==0||!/^v24\./.test(actualVersion??''))throw Error('executor-node24-required');nodeVersion=actualVersion;}
   syntax(candidate);validateGeneratedSource(candidate);
   const functions=s=>Object.fromEntries([...s.matchAll(/export\s+function\s+(add|multiply)\s*\([^)]*\)\s*\{([^}]*)\}/g)].map(m=>[m[1],m[2]]));
   const before=functions(current),after=functions(candidate);if(Object.keys(before).filter(n=>before[n]!==after[n]).length!==1)throw Error('one-function-per-step: change one bug, then read and test');
   const protectedBefore=sha(await fs.readFile(await scoped(TEST)));
   await fs.mkdir(history,{recursive:true});await fs.writeFile(path.join(history,sha(current)+'.mjs'),current,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});
   temp=path.join(root,'.candidate-'+randomUUID()+'.mjs');await fs.writeFile(temp,candidate,{flag:'wx'});
   await beforeCommit();if(context.abort?.aborted)throw Error('tool-interrupted-before-commit');
   if(sha(await fs.readFile(target))!==sha(current)||sha(await fs.readFile(await scoped(TEST)))!==protectedBefore)throw Error('concurrent-change-before-commit');
   await fs.rename(temp,target);temp=null;readHash=null;
   // Fixed argv, protected tests, no model supplied command. Host Docker retest is authoritative.
   const r=spawnSync(node,['--test','--test-isolation=none','--test-reporter=tap',path.join(root,TEST)],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:60000,env:{PATH:path.dirname(node)}});
   emit({type:'atomic-commit',callID:context.callID,nodeVersion,beforeSHA256:sha(current),sourceSHA256:sha(candidate),testSHA256:protectedBefore,testExitCode:r.status,tap:r.stdout,automaticMerge:false});
   return JSON.stringify({status:'committed-pending-review',nodeVersion,sourceSHA256:sha(candidate),testExitCode:r.status,tap:r.stdout,error:r.stderr||r.error?.message||null,next:'Read current source again. Copy the complete exact target function from that read before a different edit; diagnose these actual test failures.',signedSuccess:false,automaticMerge:false});
  }catch(e){emit({type:'atomic-rejected',callID:context.callID,name,reason:e.message,fingerprint,unchanged:true});throw e;}finally{if(temp)await fs.unlink(temp).catch(()=>{});}
 });return {execute};
}
