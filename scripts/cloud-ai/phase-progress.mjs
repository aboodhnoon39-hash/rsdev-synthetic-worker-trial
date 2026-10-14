import {assertTap,sha} from './contract.mjs';
// This only checks evidence. Assistant text is never parsed or executed as a tool.
export function assertNativePhaseProgress({before,after,events}){
 const writes=events.filter(e=>e.type==='tool-event'&&['edit','write'].includes(e.tool)&&e.status==='completed');
 const commits=events.filter(e=>e.type==='atomic-commit');
 if(!writes.length||!commits.length)throw Error('native-write-not-observed');
 if(sha(before)===sha(after))throw Error('native-write-no-source-change');
 if(writes.length!==commits.length||writes.some(w=>!commits.some(c=>c.callID===w.callID)))throw Error('native-write-commit-mismatch');
 const last=commits.at(-1),position=events.indexOf(last);
 if(last.sourceSHA256!==sha(after)||!events.slice(position+1).some(e=>e.type==='atomic-read'&&e.hash===last.sourceSHA256))throw Error('native-write-reread-missing');
 return true;
}
export function compactFailureTAP(tap){
 const counts=assertTap(tap,{passing:false}),lines=tap.split(/\r?\n/);
 // Keep actual case names, assertions and values; omit only timings and stacks.
 const kept=lines.filter(line=>/^(?:TAP version|# Subtest:|(?:not )?ok \d|1\.\.\d|# (?:tests|pass|fail|cancelled|skipped|todo)\b)/.test(line)||/^\s*(?:error:|Expected values|code:|name:|expected:|actual:|operator:|[+-]?\d+(?:\.\d+)? !==)/.test(line));
 const result=kept.join('\n')+'\n';const check=assertTap(result,{passing:false});if(JSON.stringify(check)!==JSON.stringify(counts)||result.length>12000)throw Error('compact-tap-invalid');return result;
}
export function summarizeFailureTAP(tap){
 const counts=assertTap(tap,{passing:false}),failures=[];for(const block of tap.split(/^# Subtest: /m).slice(1)){const name=block.split(/\r?\n/)[0];if(!/^not ok /m.test(block))continue;const actual=block.match(/^\s+actual: (.+)\r?$/m)?.[1]?.trim(),expected=block.match(/^\s+expected: (.+)\r?$/m)?.[1]?.trim(),code=block.match(/^\s+code: (.+)\r?$/m)?.[1]?.trim();if(!actual||!expected)throw Error('failure-assertion-summary-missing');failures.push({name,expected,actual,...(code?{code}: {})});}if(failures.length!==counts.fail)throw Error('failure-summary-count-mismatch');
 return Object.entries(counts).map(([key,value])=>'# '+key+' '+value).join('\n')+'\n'+failures.map(f=>f.name+': expected='+f.expected+'; actual='+f.actual+'; '+(f.code??'')).join('\n');
}
