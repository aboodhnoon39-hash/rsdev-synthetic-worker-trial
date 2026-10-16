import fs from 'node:fs/promises';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {ROOT} from './project-paths.mjs';
import {renderNativeReview} from '../dev-app/render-native-review.mjs';
import {editManifestSchema} from '../../engine/src/prepared-edit/schema.ts';
import {validateMediaAssets} from './review-media-assets.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileHash(file){const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');}
export async function rendererRevision(){
 const h=createHash('sha256');
 async function walk(folder){for(const item of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(folder,item.name);if(item.isDirectory())await walk(file);else if(item.isFile()){h.update(path.relative(ROOT,file));h.update(await fs.readFile(file));}}}
 await walk(path.join(ROOT,'engine/src'));await walk(path.join(ROOT,'engine/public/fonts'));
 for(const rel of ['scripts/dev-app/render-native-review.mjs','scripts/dev-app/native-audio.mjs']){h.update(rel);h.update(await fs.readFile(path.join(ROOT,rel)));}return h.digest('hex');
}
export function createNativeRenderJobs(manifestPath,{render=renderNativeReview,revision=rendererRevision}={}){
 let current=null,queue=Promise.resolve();
 const dir=path.dirname(path.join(ROOT,manifestPath));
 const snapshot=()=>current?structuredClone(current):{status:'idle',progress:0};
 const busy=()=>current?.status==='running';
 const safeResult=r=>r?.file&&path.resolve(r.file).startsWith(path.join(dir,'renders')+path.sep);
 async function startSerial(seconds,expectedManifest){
  if(seconds!==null&&(!Number.isFinite(seconds)||seconds<.1||seconds>30))throw Error('اختر معاينة من 0.1 إلى 30 ثانية.');
  if(busy())return snapshot();
  const raw=await fs.readFile(path.join(ROOT,manifestPath));
  const edit=editManifestSchema.parse(JSON.parse(raw));
  if(expectedManifest&&JSON.stringify(editManifestSchema.parse(expectedManifest))!==JSON.stringify(edit))throw Error('احفظ تعديلاتك أولًا؛ المعاينة تستخدم آخر نسخة محفوظة.');
  if(edit.id!==manifestPath.split('/')[1])throw Error('هوية المشروع غير مطابقة.');
  await validateMediaAssets(edit);
  const source=path.resolve(ROOT,edit.source.path);
  if(!source.startsWith(dir+path.sep)||await fileHash(source)!==edit.source.sha256)throw Error('المصدر تغير أو لا ينتمي للمشروع.');
  const renderRevision=await revision();const fingerprint=hash(Buffer.concat([raw,Buffer.from(String(seconds)),Buffer.from(renderRevision)]));
  if(!current){const saved=await fs.readFile(path.join(dir,'native-render-job.json'),'utf8').then(JSON.parse).catch(()=>null);if(saved?.status==='done'&&safeResult(saved.result))current=saved;}
  if(current?.status==='done'&&current.fingerprint===fingerprint&&safeResult(current.result)){
   const outputHash=await fileHash(current.result.file).catch(()=>null);
   if(outputHash&&outputHash===current.outputHash)return {...snapshot(),cached:true};
  }
  current={id:randomUUID(),status:'running',progress:0,fingerprint,seconds,renderRevision};
  const job=current;
  (async()=>{try{job.result=await render(edit.id,{seconds,draftEdit:manifestPath,onProgress:p=>{job.progress=p;}});job.outputHash=await fileHash(job.result.file);job.status='done';job.progress=100;}catch(e){job.status='failed';job.error=e.message;}await fs.writeFile(path.join(dir,'native-render-job.json'),JSON.stringify(job,null,2));})().catch(e=>{job.status='failed';job.error=e.message;});
  return snapshot();
 }
 const start=(seconds=3,expectedManifest)=>{const next=queue.then(()=>startSerial(seconds,expectedManifest));queue=next.catch(()=>{});return next;};
 const file=()=>current?.status==='done'&&safeResult(current.result)?current.result.file:null;
 return {start,snapshot,busy,file};
}
