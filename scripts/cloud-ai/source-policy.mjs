// This synthetic task permits arithmetic return expressions, never imports or executable side effects.
// The policy contains no expected/correct operator; correctness is decided only by protected tests.
export function validateGeneratedSource(source){
 if(typeof source!=='string'||Buffer.byteLength(source)>20000)throw Error('source-size-policy');
 if(source.includes('\\n'))throw Error('source-literal-backslash-newline');
 const text=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\r\n]*/g,'').trim(),pattern=/export\s+function\s+(add|multiply)\s*\(\s*a\s*,\s*b\s*\)\s*\{\s*return\s+([^;{}]+);?\s*\}/gy;let offset=0;const found=new Set();while(offset<text.length){pattern.lastIndex=offset;const m=pattern.exec(text);if(!m||found.has(m[1])||!m[2].trim()||! /^(?:[ab]|\d+(?:\.\d+)?|[+*/%()\s-])+$/.test(m[2]))throw Error('source-executable-side-effect-or-layout');found.add(m[1]);offset=pattern.lastIndex;while(/\s/.test(text[offset]??'')&&offset<text.length)offset++;}if(found.size!==2)throw Error('two-function-source-required');return source;
}
