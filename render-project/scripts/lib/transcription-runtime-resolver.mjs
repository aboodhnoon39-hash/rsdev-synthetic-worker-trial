import fs from 'node:fs';
import path from 'node:path';
export function localRuntimeForProject(runtime,root){
 const realRoot=fs.realpathSync(root);
 const inside=dir=>{try{const rel=path.relative(realRoot,fs.realpathSync(dir));return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}catch{return false;}};
 if(runtime.directory&&inside(runtime.directory))return runtime;
 if(!/^b\d+$/.test(runtime.releaseTag??''))throw Error('لا يوجد إصدار Whisper محلي معروف؛ لا تنزيل تلقائي.');
 const directory=path.join(root,'Tools','whisper-'+runtime.releaseTag),executable=path.join(directory,'Release','whisper-cli.exe');
 if(!inside(directory)||!fs.existsSync(executable))throw Error('Whisper المحلي غير موجود داخل نسخة التطوير؛ إعداد السجل يشير إلى نسخة أخرى.');
 // The caller verifies every expected binary hash before executing this local copy.
 return {...runtime,directory,executable};
}
