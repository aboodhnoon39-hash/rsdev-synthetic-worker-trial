import {SYSTEM_INSTRUCTIONS} from './cloud-ai/inference-profile.mjs';
export function nativePolicy(provider,port,prompt){
 if(!['codex','openhands'].includes(provider)||!Number.isInteger(port)||port<1||port>65535||typeof prompt!=='string'||!prompt)throw Error('native-phase-policy');
 if(provider==='openhands')return {executable:'/usr/local/bin/python3.12',args:['/worker/openhands-model-guest.py'],files:{'/cache/MODEL-ENDPOINT.json':JSON.stringify({port,prompt,provider})}};
 const catalog={models:[{slug:'qwen3:4b',display_name:'Pinned local Qwen3 4B',description:'Isolated synthetic qualification',default_reasoning_level:'none',supported_reasoning_levels:[],shell_type:'disabled',visibility:'hide',supported_in_api:true,priority:0,base_instructions:SYSTEM_INSTRUCTIONS,support_verbosity:false,apply_patch_tool_type:'freeform',truncation_policy:{mode:'tokens',limit:4000},context_window:4096,experimental_supported_tools:[],input_modalities:['text']}]};
 const config=`model="qwen3:4b"
model_provider="rsbroker"
approval_policy="never"
sandbox_mode="read-only"
web_search="disabled"
model_catalog_json="/cache/models.json"
[model_providers.rsbroker]
name="Pinned local Qwen3 4B"
base_url="http://127.0.0.1:${port}/v1"
wire_api="responses"
requires_openai_auth=false
request_max_retries=0
stream_max_retries=0
supports_websockets=false
[mcp_servers.rsdev]
url="http://127.0.0.1:${port}/mcp"
enabled_tools=["read","edit","write"]
[mcp_servers.rsdev.tools.read]
approval_mode="approve"
[mcp_servers.rsdev.tools.edit]
approval_mode="approve"
[mcp_servers.rsdev.tools.write]
approval_mode="approve"
[features]
multi_agent=false
goals=false
plugins=false
`;
 return {executable:'/opt/codex/codex',args:['exec','--model','qwen3:4b','--ephemeral','--json','--sandbox','read-only','--skip-git-repo-check','--cd','/task',prompt],files:{'/cache/models.json':JSON.stringify(catalog),'/cache/codex/config.toml':config}};
}
