import {isDeepStrictEqual} from 'node:util';

const aliases=Object.freeze({mcp__rsdev__read:'read',mcp__rsdev__edit:'edit',mcp__rsdev__write:'write'});
export function normalizeKimiRequest(body){
 if(!body||!Array.isArray(body.tools)||body.tools.length<1||body.tools.length>3||!Array.isArray(body.messages))throw Error('kimi-request-tools-required');
 const result=structuredClone(body),seen=new Set();
 for(const tool of result.tools){const name=aliases[tool.function?.name];if(tool.type!=='function'||!name||seen.has(name))throw Error('kimi-unreviewed-tool');seen.add(name);tool.function.name=name;}
 for(const message of result.messages){for(const call of message.tool_calls??[]){const name=aliases[call.function?.name];if(!name)throw Error('kimi-message-tool-not-allowed');call.function.name=name;}}
 // The existing proxy enforces model, context, request count and canonical tool scope.
 result.stream=false;return result;
}
export function restoreKimiResponse(body){
 const result=structuredClone(body);for(const choice of result.choices??[]){for(const call of choice.message?.tool_calls??[]){const alias=Object.entries(aliases).find(([,name])=>name===call.function?.name)?.[0];if(!alias)throw Error('kimi-response-tool-not-allowed');call.function.name=alias;}}return result;
}
export function claimKimiCall(records,claimed,name,args){
 if(!['read','edit','write'].includes(name)||!Array.isArray(records)||!Array.isArray(claimed))throw Error('kimi-call-ledger-invalid');
 const ids=new Set();for(const row of records){if(row.type!=='native-call'||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.requestID!=='string'||!row.requestID)throw Error('kimi-call-ledger-invalid');ids.add(row.id);}
 const matches=records.filter(row=>!claimed.includes(row.id)&&row.name===name&&isDeepStrictEqual(JSON.parse(row.arguments),args));
 if(matches.length!==1)throw Error('kimi-native-call-unmatched-or-ambiguous');return matches[0];
}
