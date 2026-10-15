import {inferenceProfile} from './inference-profile.mjs';
export function kimiCloudPolicy({port,model='qwen3:4b'}={}){
 if(!Number.isSafeInteger(port)||port<1024||port>65535||model!=='qwen3:4b')throw Error('reviewed-kimi-loopback-model-required');
 const config=`default_model = "rsdev"
telemetry = false
merge_all_available_skills = false
builtin_product_skills = false
[providers.rsdev]
type = "openai"
base_url = "http://127.0.0.1:${port}/v1"
api_key = "local-no-secret"
[models.rsdev]
provider = "rsdev"
model = "${model}"
max_context_size = 4096
max_output_size = 512
capabilities = ["tool_use"]
[thinking]
enabled = false
[loop_control]
max_attempts_per_step = 1
reserved_context_size = 1024
[background]
max_running_tasks = 1
keep_alive_on_exit = false
`;
 const agent=`---
name: rsdev-cloud
description: Restricted synthetic arithmetic worker
tools:
  - mcp__rsdev__read
  - mcp__rsdev__edit
  - mcp__rsdev__write
subagents: []
---
Use only the three supplied MCP tools. Read both permitted files before editing. Edit one complete exact function copied from the latest source read. Reread after each edit or rejection. Tests are immutable. No shell, network, other files, helpers or delegation. Tool results contain actual protected tests; do not claim completion without matching results.
`;
 const mcp={mcpServers:{rsdev:{command:'/usr/local/bin/node',args:['/worker/kimi-atomic-mcp.mjs'],env:{RS_KIMI_ISOLATED:'yes',RS_ZERO_SPEND_VERIFIED:'yes',RS_KIMI_PHASE_FILE:'/cache/kimi-phase.json'},enabledTools:['read','edit','write'],startupTimeoutMs:10000,toolTimeoutMs:10000}}};
 return {config,agent,mcp,args:['--model','rsdev','--agent-file','/worker/kimi-agent.md','--skills-dir','/worker/empty-skills','--output-format','stream-json'],maximumRequests:6,cliTimeoutMs:inferenceProfile(model).cliTimeoutMs,requiresVerifiedLinuxIsolation:true,automaticMerge:false};
}
