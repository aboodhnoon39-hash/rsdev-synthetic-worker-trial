import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {captionsToSrt} from '../lib/transcription.mjs';
// The ASR exporter joins token strings verbatim; edited words have no token spaces.
export const reviewWordsToSrt=words=>captionsToSrt(words.map(w=>({...w,text:' '+w.text.trim()}))).srt;
export function validateReviewWords(words,{count=68,durationMs=42492}={}){
 if(!Array.isArray(words)||words.length!==count)throw Error('عدد الكلمات يجب أن يبقى '+count+'؛ تقسيم الكلمات غير مدعوم في هذه المرحلة.');
 return words.map((w,i)=>{
  if(!w||Object.keys(w).some(k=>!['text','startMs','endMs','auditoryReviewed'].includes(k)))throw Error('حقول كلمة غير مدعومة.');
  if(typeof w.text!=='string'||!w.text.trim()||w.text.length>200||/[\u0000-\u001f\ufffd]/u.test(w.text))throw Error('نص غير صالح للكلمة '+(i+1));
  if(!Number.isInteger(w.startMs)||!Number.isInteger(w.endMs)||w.startMs<0||w.endMs<=w.startMs||w.endMs>durationMs)throw Error('الكلمة '+(i+1)+': مدة صفرية أو حدود غير صالحة.');
  if(i&&w.startMs<words[i-1].endMs)throw Error('تداخل توقيت عند الكلمة '+(i+1));
  if(typeof w.auditoryReviewed!=='boolean')throw Error('علامة المراجعة غير صالحة.');
  return {text:w.text.trim(),startMs:w.startMs,endMs:w.endMs,auditoryReviewed:w.auditoryReviewed};
 });
}
export function createReviewStore(dir){
 const folder=path.join(dir,'editable-review'),pointer=path.join(folder,'current.json');
 let queue=Promise.resolve();
 const load=async()=>{
  let pointerText;
  try{pointerText=await fs.readFile(pointer,'utf8');}
  catch(e){if(e.code!=='ENOENT')throw e;return {revision:'initial',status:'draft',approved:false,applied:false,words:validateReviewWords((JSON.parse(await fs.readFile(path.join(dir,'candidate-word-timings.json'),'utf8'))).map(w=>({text:w.text,startMs:w.startMs,endMs:w.endMs,auditoryReviewed:false}))),reviewedCount:0};}
  const p=JSON.parse(pointerText);if(!/^[a-f0-9-]{36}$/.test(p.revision))throw Error('مرجع نسخة الحفظ غير صالح؛ لا يُستبدل تلقائيًا.');
  try{return JSON.parse(await fs.readFile(path.join(folder,p.revision,'draft.json'),'utf8'));}
  catch{throw Error('نسخة الحفظ مفقودة أو غير قابلة للقراءة؛ احتفظ بالملفات ولا تبدأ مسودة جديدة فوقها.');}
 };
 const save=input=>{const task=queue.then(async()=>{
  const current=await load();if(input.baseRevision!==current.revision)throw Object.assign(Error('تعارض حفظ: أعد تحميل النسخة الحالية؛ لم تُستبدل تعديلات أخرى.'),{status:409});
  const words=validateReviewWords(input.words);const revision=randomUUID(),out=path.join(folder,revision);
  await fs.mkdir(out,{recursive:true});
  const draft={revision,status:'draft',approved:false,applied:false,reviewedCount:words.filter(w=>w.auditoryReviewed).length,savedAt:new Date().toISOString(),words};
  await fs.writeFile(path.join(out,'draft.json'),JSON.stringify(draft,null,2),{flag:'wx'});
  await fs.writeFile(path.join(out,'captions-NOT-APPROVED.srt'),reviewWordsToSrt(words),{flag:'wx'});
  const temp=path.join(folder,revision+'.pointer');await fs.writeFile(temp,JSON.stringify({revision}),{flag:'wx'});await fs.rename(temp,pointer);
  return draft;
 });queue=task.catch(()=>{});return task;};
 const prepare=async baseRevision=>{
  const state=await load();if(state.revision==='initial'||baseRevision!==state.revision)throw Error('احفظ المسودة الحالية أولًا؛ لا يمكن تجهيز تعديل غير محفوظ.');
  const project=path.dirname(dir),raw=await fs.readFile(path.join(project,'edit.json'),'utf8'),edit=JSON.parse(raw);
  edit.captions={status:'draft',mode:'words',grouping:'compact',presentation:'pill',words:validateReviewWords(state.words).map(({text,startMs,endMs})=>({text,startMs,endMs,confidence:null}))};
  const out=path.join(folder,state.revision,'horizontal-preview-edit-'+randomUUID()+'.json');
  await fs.writeFile(out,JSON.stringify(edit,null,2),{flag:'wx'});
  return {file:path.relative(project,out),status:'draft',approved:false,applied:false,sourceEditSha256:createHash('sha256').update(raw).digest('hex'),width:edit.source.width,height:edit.source.height,duration:edit.source.totalFrames/edit.source.fps};
 };
 return {load,save,prepare};
}
