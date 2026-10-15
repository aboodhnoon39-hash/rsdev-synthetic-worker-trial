from pathlib import Path
import os,json,hashlib,urllib.request,tarfile,concurrent.futures
root=Path.cwd();packet=json.loads((root/'PREFLIGHT-PACKET.json').read_text());canonical=json.dumps(packet,separators=(',',':'),ensure_ascii=False).encode()
if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_RUN_ATTEMPT')!='1' or os.environ.get('RS_NATIVE_PREFLIGHT_AUTHORIZED')!='yes' or hashlib.sha256(canonical).hexdigest()!=os.environ.get('RS_EXPECTED_PREFLIGHT_PACKET_SHA256'):raise RuntimeError('specific-approval-and-exact-packet-required')
assert packet['providers']==['codex','openhands'] and packet['maxMoneyUSD']==0 and packet['aiInference'] is False and packet['maxWorkflowRuns']==1
pins=root/'pins';wheels=json.loads((pins/'OPENHANDS-LINUX-WHEELS.json').read_text());codex=json.loads((pins/'CODEX-LINUX-PIN.json').read_text());python=json.loads((pins/'PYTHON-IMAGE-PIN.json').read_text())
for name in ['OPENHANDS-LINUX-WHEELS.json','CODEX-LINUX-PIN.json','PYTHON-IMAGE-PIN.json']:
 assert hashlib.sha256((pins/name).read_bytes()).hexdigest()==packet['pins'][name]
vendor=root/'vendor';(vendor/'wheels').mkdir(parents=True);(vendor/'codex').mkdir()
def fetch(item,path):
 with urllib.request.urlopen(item['url'],timeout=30) as r:data=r.read(item['bytes']+1)
 assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256'];path.write_bytes(data)
assert len(wheels['packages'])==138 and wheels['bytes']<300*1024**2
def wheel(w):
 assert w['url'].startswith('https://files.pythonhosted.org/packages/') and '/' not in w['filename'] and '\\' not in w['filename'];fetch(w,vendor/'wheels'/w['filename'])
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(wheel,wheels['packages']))
assert codex['url']=='https://github.com/openai/codex/releases/download/rust-v0.162.0-alpha.17.2/codex-x86_64-unknown-linux-musl.tar.gz';archive=vendor/'codex.tar.gz';fetch(codex,archive)
with tarfile.open(archive) as tar:
 members=[m for m in tar.getmembers() if m.isfile()];assert len(members)==1 and members[0].name=='codex-x86_64-unknown-linux-musl';binary=tar.extractfile(members[0]).read();assert hashlib.sha256(binary).hexdigest()==codex['binarySHA256'];(vendor/'codex/codex').write_bytes(binary);(vendor/'codex/codex').chmod(0o555)
(root/'DOWNLOAD-PROOF.json').write_text(json.dumps({'officialWheelCount':138,'wheelSHA256Verified':True,'codexSHA256Verified':True,'pythonImage':python['image'],'aiInference':False,'modelDownloads':0},indent=2))
