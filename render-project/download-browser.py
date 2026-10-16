from pathlib import Path,PurePosixPath
import json,hashlib,urllib.request,zipfile,stat,os
root=Path(__file__).resolve().parent;pin=json.loads((root/'BROWSER-PIN.json').read_text());assert pin['url']=='https://storage.googleapis.com/chrome-for-testing-public/149.0.7790.0/linux64/chrome-headless-shell-linux64.zip'
dest=root/'browser-download.zip';digest=hashlib.sha256();size=0
with urllib.request.urlopen(pin['url'],timeout=60) as response,dest.open('xb') as out:
 while True:
  data=response.read(1024*1024)
  if not data:break
  size+=len(data);assert size<=pin['bytes'];digest.update(data);out.write(data)
assert size==pin['bytes'] and digest.hexdigest()==pin['sha256']
target=root/'browser';target.mkdir();total=0
with zipfile.ZipFile(dest) as archive:
 assert len(archive.infolist())<1000
 for member in archive.infolist():
  name=PurePosixPath(member.filename);assert not name.is_absolute() and '..' not in name.parts and '\\' not in member.filename and ':' not in member.filename
  mode=member.external_attr>>16;assert not stat.S_ISLNK(mode)
  path=target.joinpath(*name.parts);assert path.resolve().is_relative_to(target.resolve())
  if member.is_dir():path.mkdir(parents=True,exist_ok=True);continue
  total+=member.file_size;assert total<600*1024**2 and member.file_size<400*1024**2
  path.parent.mkdir(parents=True,exist_ok=True)
  with archive.open(member) as source,path.open('xb') as output:
   while True:
    chunk=source.read(1024*1024)
    if not chunk:break
    output.write(chunk)
  os.chmod(path,0o755 if mode&0o111 else 0o644)
print('Pinned browser downloaded and every archive path validated')
