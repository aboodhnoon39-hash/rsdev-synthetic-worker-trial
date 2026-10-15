import fs from 'node:fs/promises';import path from 'node:path';import {sha} from './contract.mjs';
export async function verifyKimiRuntime({root,manifest,expectedSHA256}){
 if(!/^[a-f0-9]{64}$/.test(expectedSHA256??'')||sha(manifest)!==expectedSHA256||manifest.name!=='@moonshot-ai/kimi-code'||manifest.version!=='2.1.1'||manifest.archiveRevalidated!==true||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('kimi-runtime-manifest-pin');
 const base=await fs.realpath(root),seen=new Set();
 for(const item of manifest.files){if(typeof item.path!=='string'||item.path.includes('\\')||item.path.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(item.path)||seen.has(item.path)||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256??''))throw Error('kimi-runtime-manifest-path');seen.add(item.path);const file=path.join(base,item.path),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await fs.realpath(file)!==file||stat.size!==item.bytes||sha(await fs.readFile(file))!==item.sha256)throw Error('kimi-runtime-file-mismatch:'+item.path);}
 async function inventory(folder){for(const item of await fs.readdir(folder,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('kimi-runtime-link');const file=path.join(folder,item.name);if(item.isDirectory())await inventory(file);else if(!seen.has(path.relative(base,file).replaceAll('\\','/')))throw Error('kimi-runtime-extra-file');}}
 await inventory(base);return {version:'2.1.1',verifiedFiles:seen.size,manifestSHA256:expectedSHA256,aiInference:false};
}
