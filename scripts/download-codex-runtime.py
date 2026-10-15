from pathlib import Path
import json,hashlib,os,urllib.request,tarfile
root=Path.cwd(); packet=json.loads((root/'tasks/AI-PACKET.json').read_text()); lock=json.loads((root/'RUNTIME-LOCK.json').read_text()); pins=(root/'NATIVE-RUNTIME-PINS.json').read_bytes()
def sha(value):return hashlib.sha256(json.dumps(value,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_RUN_ATTEMPT')=='1' and os.environ.get('RS_AI_EXECUTION_AUTHORIZED')=='yes'
assert packet['provider']=='codex' and packet['budget']['maxMoney']==0 and sha(packet)==os.environ.get('RS_EXPECTED_AI_PACKET_SHA256') and sha(lock)==packet['runtimeLockSHA256']
assert hashlib.sha256(pins).hexdigest()==lock['remainingNativePinsSHA256']
codex=json.loads(pins)['codex'];assert codex['url']=='https://github.com/openai/codex/releases/download/rust-v0.162.0-alpha.17.2/codex-x86_64-unknown-linux-musl.tar.gz'
with urllib.request.urlopen(codex['url'],timeout=60) as response:data=response.read(codex['bytes']+1)
assert len(data)==codex['bytes'] and hashlib.sha256(data).hexdigest()==codex['sha256']
target=root/'vendor/codex';target.mkdir();archive=target/'official.tar.gz';archive.write_bytes(data)
with tarfile.open(archive) as tar:
    members=[m for m in tar.getmembers() if m.isfile()];assert len(members)==1 and members[0].name=='codex-x86_64-unknown-linux-musl';binary=tar.extractfile(members[0]).read()
assert hashlib.sha256(binary).hexdigest()==codex['binarySHA256'];(target/'codex').write_bytes(binary);(target/'codex').chmod(0o555);archive.unlink()
(root/'DOWNLOAD-CODEX-PROOF.json').write_text(json.dumps({'status':'passed','officialArchiveSHA256':codex['sha256'],'binarySHA256':codex['binarySHA256'],'aiInference':False}))
