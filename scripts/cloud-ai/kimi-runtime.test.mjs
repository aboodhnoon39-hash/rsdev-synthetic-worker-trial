import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {verifyKimiRuntime} from './kimi-runtime.mjs';import {sha} from './contract.mjs';
test('Kimi runtime refuses corrupt, extra, duplicate and escaping files before any CLI launch',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kimi-runtime-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const root=await fs.realpath(dir),text='official synthetic marker';await fs.writeFile(path.join(root,'main.mjs'),text);
 const manifest={name:'@moonshot-ai/kimi-code',version:'2.1.1',archiveRevalidated:true,files:[{path:'main.mjs',bytes:Buffer.byteLength(text),sha256:sha(text)}]};const run=m=>verifyKimiRuntime({root,manifest:m,expectedSHA256:sha(m)});
 assert.equal((await run(manifest)).verifiedFiles,1);await fs.writeFile(path.join(root,'main.mjs'),'tamper');await assert.rejects(run(manifest),/mismatch/);await fs.writeFile(path.join(root,'main.mjs'),text);await fs.writeFile(path.join(root,'extra'),'x');await assert.rejects(run(manifest),/extra/);await fs.unlink(path.join(root,'extra'));
 await assert.rejects(run({...manifest,files:[...manifest.files,...manifest.files]}),/path/);for(const p of ['../outside','/absolute','main\\file'])await assert.rejects(run({...manifest,files:[{...manifest.files[0],path:p}]}),/path/);await assert.rejects(verifyKimiRuntime({root,manifest,expectedSHA256:'0'.repeat(64)}),/pin/);await assert.rejects(run({...manifest,archiveRevalidated:false}),/pin/);
});
