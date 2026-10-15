from pathlib import Path
import sys,os,json,socket,site
if sys.platform!='linux' or sys.version_info[:3]!=(3,12,14):raise RuntimeError('pinned-linux-python-required')
sys.dont_write_bytecode=True;site.addsitedir('/opt/openhands')
os.environ.update({'HOME':'/cache','LITELLM_LOCAL_MODEL_COST_MAP':'True','LITELLM_TELEMETRY':'False','OTEL_SDK_DISABLED':'true','DO_NOT_TRACK':'1','OPENHANDS_SUPPRESS_BANNER':'1'})
original=socket.socket.connect
def local_only(self,address):
    if not isinstance(address,tuple) or address[0] not in ['127.0.0.1','::1']:raise PermissionError('external-network-disabled')
    return original(self,address)
socket.socket.connect=local_only
from openhands.sdk import Agent,LLM,Conversation
from openhands.sdk.mcp.config import MCPServer
from importlib.metadata import version
assert version('openhands-sdk')=='1.54.0'
info=json.loads(Path('/cache/MODEL-ENDPOINT.json').read_text());assert info['provider']=='openhands';port=info['port'];events=[]
llm=LLM(model='openai/qwen3:4b',base_url=f'http://127.0.0.1:{port}/v1',api_key='local-no-secret',usage_id='rsdev-isolated-qualification',num_retries=0,max_output_tokens=512,temperature=0.7,top_p=0.8)
agent=Agent(llm=llm,tools=[],include_default_tools=[],mcp_config={'rsdev':MCPServer(url=f'http://127.0.0.1:{port}/mcp')},filter_tools_regex=r'^(read|edit|write)$',system_prompt='Read only /task/backend-limit.mjs and /task/backend-limit.test.mjs; edit only the source. Read first. Edit exactly one complete existing function copied from the latest read. Reread immediately after editing. No shell, delegation, network tools or other files. Tests are immutable.')
def record(event):
    events.append(event.model_dump(mode='json'))
    Path('/output/OPENHANDS-SDK-EVENTS.json').write_text(json.dumps(events))
conversation=Conversation(agent=agent,workspace='/task',persistence_dir='/cache/conversation',callbacks=[record],visualizer=None,max_iteration_per_run=8,delete_on_close=False)
try:
    conversation.send_message(info['prompt']);conversation.run()
finally:
    conversation.close();Path('/output/OPENHANDS-SDK-EVENTS.json').write_text(json.dumps(events))
