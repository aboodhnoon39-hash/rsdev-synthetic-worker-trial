import {validateMediaAssets} from '../lib/review-media-assets.mjs';
import {nativeAudioFilter,nativeAudioUnchanged} from './native-audio.mjs';
import {compileEdit} from '../../engine/src/prepared-edit/timeline.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'engine/package.json'));
const {bundle}=require('@remotion/bundler');
const {selectComposition,renderMedia}=require('@remotion/renderer');
function run(exe,args){return new Promise((resolve,reject)=>{const c=spawn(exe,args,{windowsHide:true,cwd:root});let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err=(err+b).slice(-16000));c.on('error',reject);c.on('close',code=>code===0?resolve(out):reject(Error(err)));});}
export function validateNativeReviewOperations(edit){
 if(edit.nativeOperations?.some(o=>o.toFrame>compileEdit(edit).durationInFrames))throw Error('عملية خارج مدة المسودة.');
}
export async function renderNativeReview(id,{seconds,draftEdit,onProgress=()=>{}}={}){
 if(!/^app-[0-9]+-[a-f0-9]{6}$/.test(id))throw Error('Invalid managed project');
 const dir=path.join(root,'Projects',id),editFile=draftEdit?path.resolve(root,draftEdit):path.join(dir,'edit.json');
 if(draftEdit&&(!editFile.startsWith(dir+path.sep)||!editFile.endsWith('.json')))throw Error('مسودة المراجعة يجب أن تكون داخل المشروع نفسه.');
 const raw=await fs.readFile(editFile,'utf8');const {editManifestSchema}=await import('../../engine/src/prepared-edit/schema.ts');const edit=editManifestSchema.parse(JSON.parse(raw));
 if(edit.scenes.some(s=>s.family!=='statement')||edit.sounds.length||edit.camera.length)throw Error('الجرافيكس والصوت والكاميرا غير المدعومة لا يمكن تجاهلها في الرندر.');
 if(edit.captions.words.length){
  if(!draftEdit||edit.captions.status!=='draft')throw Error('الكابشن متاح هنا لمسودة مستقلة غير معتمدة فقط.');
  const {validateReviewWords}=await import('./caption-review-store.mjs');
  validateReviewWords(edit.captions.words.map(w=>({text:w.text,startMs:w.startMs,endMs:w.endMs,auditoryReviewed:false})),{count:edit.captions.words.length,durationMs:Math.floor(edit.source.totalFrames/edit.source.fps*1000)});
 }
 if(!edit.nativeEditor&&(edit.segments.length!==1||edit.segments[0].fromFrame!==0||edit.segments[0].toFrame!==edit.source.totalFrames))throw Error('مسار المعاينة هذا يدعم الفيديو الكامل دون قص فقط.');
 await validateMediaAssets(edit);validateNativeReviewOperations(edit);const source=path.resolve(root,edit.source.path);if(!source.startsWith(dir+path.sep))throw Error('Source must belong to project');
 const sha=createHash('sha256');for await(const chunk of (await import('node:fs')).createReadStream(source))sha.update(chunk);if(sha.digest('hex')!==edit.source.sha256)throw Error('Source fingerprint changed');
 const out=path.join(dir,'renders','native-review-'+randomUUID());await fs.mkdir(path.join(out,'public'),{recursive:true});
 await fs.writeFile(path.join(out,'edit-snapshot.json'),raw);await fs.copyFile(source,path.join(out,'public/plate.mp4'));
 for(const asset of edit.nativeEditor?.assets??[]){const dest=path.join(out,'public',asset.src);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(root,asset.path),dest);}
 for(const layer of edit.nativeEditor?.layers??[]){if(!layer.subjectMask)continue;const mask=layer.subjectMask;if(!mask.prefix.startsWith('_masks/'+edit.id+'/')||!/^_masks\/[a-z0-9-]+\/[a-f0-9]{64}$/.test(mask.prefix))throw Error('قناع خارج المشروع.');const sourceFolder=await fs.realpath(path.join(root,'engine/public',mask.prefix));const base=await fs.realpath(path.join(root,'engine/public/_masks',edit.id));if(!sourceFolder.startsWith(base+path.sep))throw Error('مسار القناع غير آمن.');const dest=path.join(out,'public',mask.prefix);await fs.mkdir(dest,{recursive:true});for(let i=0;i<mask.count;i++){const name='mask-'+String(i).padStart(6,'0')+'.png',file=await fs.realpath(path.join(sourceFolder,name));if(!file.startsWith(sourceFolder+path.sep))throw Error('ملف قناع خارج مجلده.');await fs.copyFile(file,path.join(dest,name));}}
 if(edit.visualStory||edit.nativeEditor?.layers.some(l=>l.typography))await fs.cp(path.join(root,'engine/public/fonts'),path.join(out,'public/fonts'),{recursive:true,errorOnExist:true});
 const inputProps={edit,plate:{src:'plate.mp4',width:edit.source.width,height:edit.source.height},guides:false};
 const browserExecutable=path.join(root,"browser/chrome-headless-shell-linux64/chrome-headless-shell");
 const serveUrl=await bundle({entryPoint:path.join(root,'engine/src/dev-app/NativeReviewRoot.tsx'),publicDir:path.join(out,'public')});
 const composition=await selectComposition({serveUrl,id:'NativeReview',inputProps,browserExecutable});
 const frames=seconds?Math.min(composition.durationInFrames,Math.round(seconds*composition.fps)):composition.durationInFrames;
 await renderMedia({serveUrl,composition,inputProps,browserExecutable,codec:'h264',outputLocation:path.join(out,'picture.mp4'),concurrency:1,offthreadVideoThreads:1,offthreadVideoCacheSizeInBytes:96*1024*1024,frameRange:[0,frames-1],onProgress:p=>onProgress(Math.round(p.progress*100),{renderedFrames:p.renderedFrames,encodedFrames:p.encodedFrames,totalFrames:frames})});
 const assetInputs={},extraInputs=[];for(const t of edit.nativeEditor?.mediaTracks??[]){if(t.kind==='audio'&&!t.muted&&t.assetId&&assetInputs[t.assetId]===undefined){const asset=edit.nativeEditor.assets.find(a=>a.id===t.assetId);assetInputs[t.assetId]=2+extraInputs.length/2;extraInputs.push('-i',path.join(root,asset.path));}}
 const gain=edit.nativeOperations?.find(o=>o.kind==='gain')?.value??1;const file=path.join(out,'review.mp4');await run(path.join(require('@remotion/compositor-linux-x64-gnu').dir,'ffmpeg'),['-hide_banner','-loglevel','error','-i',path.join(out,'picture.mp4'),'-i',source,...extraInputs,...(edit.nativeEditor&&!nativeAudioUnchanged(edit,gain)?['-filter_complex',nativeAudioFilter(edit,gain,assetInputs),'-map','0:v:0','-map','[voice]','-c:v','copy','-c:a','aac','-b:a','192k']:['-map','0:v:0','-map','1:a:0?','-c:v','copy',...(gain===1?['-c:a','copy']:['-af',`volume=${gain}`,'-c:a','aac','-b:a','192k'])]),'-t',String(frames/composition.fps),'-movflags','+faststart','-n',file]);
 const probe=JSON.parse(await run(path.join(require('@remotion/compositor-linux-x64-gnu').dir,'ffprobe'),['-v','error','-show_streams','-show_format','-of','json',file]));const v=probe.streams.find(s=>s.codec_type==='video');
 if(v.width!==edit.source.width||v.height!==edit.source.height||Number(v.nb_frames)!==frames)throw Error('Rendered dimensions/frame count mismatch');
 const result={file,editFile,frames,width:v.width,height:v.height,duration:probe.format.duration,audio:probe.streams.some(s=>s.codec_type==='audio'),captionWords:edit.captions.words.length,captionStatus:edit.captions.status,speechTimingVerified:false,reviewOnly:true,ai:false,probe};await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){renderNativeReview(process.argv[2],{seconds:Number(process.argv[3])||undefined,onProgress:p=>console.log('progress',p)}).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
