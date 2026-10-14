export const SELECTED_MODEL='qwen3:4b';
export const SELECTED_MANIFEST='5f89ba1e51f6aa6294710cad300e995341b5d1a06d2c6f26af7626cb56b77929';
export const profiles=Object.freeze({
 'qwen3:1.7b':Object.freeze({model:'qwen3:1.7b',contextTokens:8192,maxOutputTokens:1024,temperature:0.6,topP:0.95,reasoningEffort:'none',inferenceTimeoutMs:90000,cliTimeoutMs:160000,maximumRequests:12,maxPromptBytes:128000}),
 'qwen3:4b':Object.freeze({model:SELECTED_MODEL,contextTokens:4096,maxOutputTokens:512,temperature:0.7,topP:0.8,reasoningEffort:'none',inferenceTimeoutMs:120000,cliTimeoutMs:170000,maximumRequests:8,maxPromptBytes:10000})
});
export function inferenceProfile(model){const p=profiles[model];if(!p)throw Error('reviewed-model-required');return p;}
export function assertPromptBudget(messages,tools,profile){const bytes=Buffer.byteLength(JSON.stringify({messages,tools}));if(bytes>profile.maxPromptBytes)throw Error('inference-context-byte-budget');return {bytes,estimatedTokens:Math.ceil(bytes/4),estimateOnly:true,contextTokens:profile.contextTokens};}
export const SYSTEM_INSTRUCTIONS='Read only /task/backend-limit.mjs and /task/backend-limit.test.mjs; edit/write only the source. Read first. Edit one complete exact function copied from the latest read, preserving its declaration. Reread after each edit or rejection. Use native tools; never JSON text, literal backslash-n, or repeated edits. Tests are immutable. No shell, network or other files.';
