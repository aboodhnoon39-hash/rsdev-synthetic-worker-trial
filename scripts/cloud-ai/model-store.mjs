import fs from 'node:fs/promises';import {createReadStream} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {pinnedModelBlobs} from './model-blob-manifest.mjs';
export async function verifyModelStore({root,lock}){
 if(!path.isAbsolute(root)||!/^qwen3:(?:4b|1\.7b)$/.test(lock?.name??''))throw Error('model-store-root-or-name');
 const manifestFile=path.join(root,'manifests/registry.ollama.ai/library',...lock.name.split(':'));
 const regular=async file=>{const stat=await fs.lstat(file).catch(e=>{if(e.code==='ENOENT')throw Error('model-store-file-missing:'+path.basename(file));throw e;});if(!stat.isFile()||stat.isSymbolicLink())throw Error('model-store-file-type');return stat;};
 await regular(manifestFile);const bytes=await fs.readFile(manifestFile),blobs=pinnedModelBlobs(bytes,lock),checks=[];
 for(const blob of blobs){const file=path.join(root,'blobs',blob.digest.replace(':','-')),stat=await regular(file);if(stat.size!==blob.size)throw Error('model-store-size-mismatch:'+blob.digest);const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==blob.digest.slice(7))throw Error('model-store-hash-mismatch:'+blob.digest);checks.push({digest:blob.digest,bytes:stat.size,verified:true});}
 return {model:lock.name,manifestSHA256:lock.manifestSHA256,blobs:checks,totalBytes:checks.reduce((n,c)=>n+c.bytes,0),aiInferenceStarted:false};
}
