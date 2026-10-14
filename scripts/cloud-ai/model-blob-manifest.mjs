import {createHash} from 'node:crypto';
// Ollama needs the config blob as well as every model/template/license layer.
export function pinnedModelBlobs(bytes,lock){
 if(createHash('sha256').update(bytes).digest('hex')!==lock?.manifestSHA256)throw Error('immutable-manifest-mismatch');
 const manifest=JSON.parse(bytes);
 if(manifest.schemaVersion!==2||!manifest.config||!Array.isArray(manifest.layers)||manifest.layers.length<1||manifest.layers.length>16)throw Error('model-manifest-schema');
 if(!Array.isArray(lock.layers)||lock.layers.length!==manifest.layers.length||manifest.layers.some((l,i)=>['digest','size','mediaType'].some(k=>l[k]!==lock.layers[i]?.[k])))throw Error('model-layer-pin-mismatch');
 if(lock.config&&['digest','size','mediaType'].some(k=>lock.config[k]!==manifest.config[k]))throw Error('model-config-pin-mismatch');
 const descriptors=[manifest.config,...manifest.layers];
 if(manifest.config.mediaType!=='application/vnd.docker.container.image.v1+json'||manifest.config.size>16384||descriptors.some(l=>!/^sha256:[a-f0-9]{64}$/.test(l.digest??'')||!Number.isSafeInteger(l.size)||l.size<1||l.size>3*1024**3)||new Set(descriptors.map(l=>l.digest)).size!==descriptors.length||descriptors.reduce((n,l)=>n+l.size,0)>3*1024**3)throw Error('model-blob-descriptor-policy');
 return descriptors;
}
