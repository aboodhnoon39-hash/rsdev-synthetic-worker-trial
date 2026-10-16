import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function clean(value){return JSON.parse(JSON.stringify(value).replace(/([?&]token=)[^\s"<>]+/gi,'$1[محجوب]').replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|[a-f0-9]{48})\b/g,'[محجوب]'));}
async function atomic(file,value){const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,value,'utf8');await fs.rename(tmp,file);}
export function createDevelopmentReporter({root=defaultRoot,run=exec}={}){
 const hand=path.join(root,'PROJECT-HANDOFF');let queue=Promise.resolve();
 return function recordDevelopmentPhase(event,{localOnly=false}={}){
 const operation=queue.then(async()=>{
  if(!['passed','failed','partial'].includes(event.status))throw Error('Phase status must be explicit');
  const id=randomUUID(),at=new Date().toISOString(),record=clean({...event,id,at,timezone:'America/Los_Angeles'});
  await fs.mkdir(path.join(hand,'phase-events'),{recursive:true});
  let git=null,gitError=null;
  if(!localOnly){try{git=await run(path.join(root,'Tools/git/cmd/git.exe'),['rev-parse','HEAD'],{cwd:root,windowsHide:true});}catch(error){gitError=error.code??'command-failed';}}
  record.codeCommit=git?.stdout.trim()||'غير متحقق منه';
  record.reportDiagnostics={mode:localOnly?'local-only':'runtime',git:localOnly?'not-requested':git?'passed':gitError};
  await atomic(path.join(hand,'phase-events',at.replace(/[:.]/g,'-')+'-'+id+'.json'),JSON.stringify(record,null,2));
  const history=path.join(hand,'report-history');await fs.mkdir(history,{recursive:true});
  const block=`\n\n## مرحلة موثقة: ${record.title} — ${record.status}\nالتاريخ UTC: ${at}؛ يُعرض تاريخ التقرير بتوقيت America/Los_Angeles.\nكود Git: ${record.codeCommit}\n${Object.entries(record).filter(([k])=>['accomplished','fixed','tests','failures','files','remaining','next'].includes(k)).map(([k,v])=>`${{accomplished:'المنجز',fixed:'الإصلاح',tests:'الاختبارات والدليل',failures:'الفشل',files:'الملفات',remaining:'المتبقي',next:'الخطوة التالية'}[k]}: ${typeof v==='string'?v:JSON.stringify(v)}\n`).join('')}\nلا يدل نجاح العملية وحده على مشاهدة بشرية أو اعتماد نشر.\n`;
  for(const name of ['PROJECT-STATUS-AR.md','CONTINUE-WORK-AR.md','CHANGELOG-AR.md','ERRORS-AND-TESTS-AR.md']){
   const file=path.join(hand,name);let previous='';try{previous=await fs.readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.writeFile(path.join(history,id+'-'+name),previous,{flag:'wx'});await atomic(file,previous+block);
  }
  const python=process.env.RS_REPORT_PYTHON??path.join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  if(localOnly)return {id,updated:true,comprehensiveReport:{status:'deferred',next:'Run development-report.py --refresh --local-only through the authorized shell'}};
  try{
   const result=await run(python,['-B','scripts/development-report.py'],{cwd:root,windowsHide:true,maxBuffer:1024*1024});
   return {id,updated:true,comprehensiveReport:{status:'generated'},result:JSON.parse(result.stdout)};
  }catch(error){
   const diagnostic={status:'failed',errorCode:error.code??'report-generation-failed',phaseSaved:true};
   await atomic(path.join(hand,'report-history',id+'-generation-status.json'),JSON.stringify(diagnostic,null,2));
   return {id,updated:true,comprehensiveReport:diagnostic};
  }
 });queue=operation.catch(()=>{});return operation;
 };
}
export const recordDevelopmentPhase=createDevelopmentReporter();
