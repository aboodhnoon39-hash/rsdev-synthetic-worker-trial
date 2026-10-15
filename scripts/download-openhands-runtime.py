from pathlib import Path
import json,hashlib,os,urllib.request,concurrent.futures
root=Path.cwd();packet=json.loads((root/'tasks/AI-PACKET.json').read_text());lock=json.loads((root/'RUNTIME-LOCK.json').read_text());native=(root/'NATIVE-RUNTIME-PINS.json').read_bytes()
sha=lambda value:hashlib.sha256(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('RS_AI_EXECUTION_AUTHORIZED')=='yes'
assert packet['provider']=='openhands' and packet['budget']['maxMoney']==0 and sha(packet)==os.environ.get('RS_EXPECTED_AI_PACKET_SHA256') and sha(lock)==packet['runtimeLockSHA256']
assert hashlib.sha256(native).hexdigest()==lock['remainingNativePinsSHA256'];pins=json.loads(native)
assert pins['provider']=='openhands' and pins['sdkVersion']=='1.54.0'
for name,digest in pins['pins'].items():assert hashlib.sha256((root/'pins'/name).read_bytes()).hexdigest()==digest
wheels=json.loads((root/'pins/OPENHANDS-LINUX-WHEELS.json').read_text());assert len(wheels['packages'])==138 and wheels['bytes']<300*1024**2
target=root/'vendor/wheels';target.mkdir()
def download(w):
    assert w['url'].startswith('https://files.pythonhosted.org/packages/') and '/' not in w['filename'] and '\\' not in w['filename']
    with urllib.request.urlopen(w['url'],timeout=60) as response:data=response.read(w['bytes']+1)
    assert len(data)==w['bytes'] and hashlib.sha256(data).hexdigest()==w['sha256'];(target/w['filename']).write_bytes(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(download,wheels['packages']))
(root/'DOWNLOAD-OPENHANDS-PROOF.json').write_text(json.dumps({'status':'passed','officialWheelsVerified':138,'sdkVersion':'1.54.0','aiInference':False}))
