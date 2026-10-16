import {projectFiles} from './project-task.mjs';
// This synthetic task permits arithmetic return expressions, never imports or executable side effects.
// The policy contains no expected/correct operator; correctness is decided only by protected tests.
export function validateGeneratedSource(source){
 if(typeof source==='string'&&source.startsWith('export function assertLocalToolScope(')){validateProjectSource(source);return source;}
 if(typeof source!=='string'||Buffer.byteLength(source)>20000)throw Error('source-size-policy');
 if(source.includes('\\n'))throw Error('source-literal-backslash-newline');
 const text=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'').trim(),pattern=/export\s+function\s+(add|multiply)\s*\(\s*a\s*,\s*b\s*\)\s*\{\s*return\s+([^;{}]+);?\s*\}/gy;let offset=0;const found=new Set();while(offset<text.length){pattern.lastIndex=offset;const m=pattern.exec(text);if(!m||found.has(m[1])||!m[2].trim()||! /^(?:[ab]|\d+(?:\.\d+)?|[+*/%()\s-])+$/.test(m[2]))throw Error('source-executable-side-effect-or-layout');found.add(m[1]);offset=pattern.lastIndex;while(/\s/.test(text[offset]??'')&&offset<text.length)offset++;}if(found.size!==2)throw Error('two-function-source-required');return source;
}

export function validateProjectSource(source){
 const original=projectFiles['backend-limit.mjs'],marker='const relative=',at=original.indexOf(marker)+marker.length,end=original.indexOf(';',at),prefix=original.slice(0,at),suffix=original.slice(end);
 if(typeof source!=='string'||source.length>12000||!source.startsWith(prefix)||!source.endsWith(suffix))throw Error('project-unreviewed-structure');
 const expression=source.slice(prefix.length,source.length-suffix.length),withoutStrings=expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,'');
 if(!expression.length||expression.length>800||/[^a-zA-Z0-9_().?:\s]/.test(withoutStrings)||[...withoutStrings.matchAll(/[a-zA-Z_$][a-zA-Z0-9_$]*/g)].some(m=>!['file','toLowerCase','toUpperCase','startsWith','slice','length'].includes(m[0])))throw Error('project-expression-out-of-scope');
 return source;
}
export function scopedFunctions(source){validateGeneratedSource(source);return source.startsWith('export function assertLocalToolScope(')?[source.trim()]:[...source.matchAll(/export\s+function\s+(?:add|multiply)\s*\([^)]*\)\s*\{[^}]*\}/g)].map(m=>m[0]);}
export function functionBodies(source){return Object.fromEntries(scopedFunctions(source).map(s=>[s.match(/export\s+function\s+(\w+)/)[1],s]));}
