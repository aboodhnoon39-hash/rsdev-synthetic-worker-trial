from pathlib import Path
import sys,os,json,socket,site
if sys.platform!='linux' or sys.version_info[:3]!=(3,12,14):raise RuntimeError('pinned-linux-python-required')
sys.path.insert(0,'/opt/openhands');sys.dont_write_bytecode=True;site.addsitedir('/opt/openhands')
os.environ.update({'HOME':'/cache','LITELLM_LOCAL_MODEL_COST_MAP':'True','LITELLM_TELEMETRY':'False','OTEL_SDK_DISABLED':'true','DO_NOT_TRACK':'1','OPENHANDS_SUPPRESS_BANNER':'1'})
original=socket.socket.connect
def local_only(self,address):
 if not isinstance(address,tuple) or address[0] not in ['127.0.0.1','::1']:raise PermissionError('external-network-disabled')
 return original(self,address)
socket.socket.connect=local_only
from openhands.sdk import Agent,LLM,Conversation
from openhands.sdk.mcp.config import MCPServer
info=json.loads(Path('/cache/ENDPOINT.json').read_text());assert info['provider']=='openhands' and info['aiInference'] is False;port=info['port'];events=[]
llm=LLM(model='openai/qwen3:4b',base_url=f'http://127.0.0.1:{port}/v1',api_key='local-no-secret',usage_id='rsdev-explicit-neutral-mock',num_retries=0,max_output_tokens=512,temperature=0.7,top_p=0.8)
agent=Agent(llm=llm,tools=[],include_default_tools=[],mcp_config={'rsdev':MCPServer(url=f'http://127.0.0.1:{port}/mcp')},filter_tools_regex=r'^(read|edit|write)$',system_prompt='Explicit neutral mock only. Use native scoped tools to read, edit and reread. Preserve protected tests. No commands or other tools.')
conversation=Conversation(agent=agent,workspace='/task',persistence_dir='/cache/conversation',callbacks=[lambda e:events.append(e.model_dump(mode='json'))],visualizer=None,max_iteration_per_run=6,delete_on_close=False)
try:
 conversation.send_message('Exercise the explicit neutral mock protocol. No real AI inference or repair qualification.');conversation.run()
finally:
 conversation.close();Path('/output/openhands-SDK-EVENTS.json').write_text(json.dumps(events))
