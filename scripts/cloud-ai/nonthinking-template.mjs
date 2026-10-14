import {createHash} from 'node:crypto';
export const ORIGINAL_TEMPLATE_SHA256='2d54db2b9bb29ce7db54fea63a891f5859603813c555b1f88b5e0994652897f9';
export function candidateNonthinkingTemplate(original){
 const hash=createHash('sha256').update(original).digest('hex');
 if(hash!==ORIGINAL_TEMPLATE_SHA256)throw Error('reviewed-template-fingerprint-required');
 const marker='<think>\n{{ end }}\n{{- end }}';
 const text=original.toString('utf8');
 if(text.split(marker).length!==2)throw Error('reviewed-assistant-prefill-required');
 return text.replace(marker,'{{ if and $.IsThinkSet (not $.Think) }}<think>\n\n</think>\n\n{{ else }}<think>\n{{ end }}\n{{ end }}\n{{- end }}');
}
export function candidateNativeToolTemplate(original){
 const fixed=candidateNonthinkingTemplate(original);
 const marker='{"type": "function", "function": {{ .Function }}}';
 if(fixed.split(marker).length!==2)throw Error('reviewed-tool-serialization-required');
 // Ollama 0.40.3 templateTool has JSON String(), its nested Function does not.
 return fixed.replace(marker,'{{ . }}');
}
export function candidateInstructToolTemplate(original){
 if(createHash('sha256').update(original).digest('hex')!=='eade0a07cac7712787bbce23d12f9306adb4781d873d1df6e16f7840fa37afec')throw Error('reviewed-instruct-template-required');
 const text=original.toString('utf8'),marker='{"type": "function", "function": {{ .Function }}}';
 if(text.includes('<think>')||text.split(marker).length!==2)throw Error('reviewed-instruct-template-layout');
 return text.replace(marker,'{{ . }}');
}
