"""Remap external principals, preserving both router implementations verbatim."""
from pathlib import Path
import re,hashlib,json,shutil
here=Path(__file__).resolve().parent;root=here.parents[1];out=here/'.build'
(out/'contracts').mkdir(parents=True,exist_ok=True);(out/'settings').mkdir(exist_ok=True)
files={p.stem:p.read_text() for p in (here/'mocks').glob('*.clar')};hashes={}
for pair,name in [('sbtc-stx','swap-router-sbtc-stx-jing-v6-1'),('sbtc-usdcx','swap-router-sbtc-usdcx-jing-v6')]:
 p=root/'contracts'/pair/(name+'.clar');raw=p.read_bytes();hashes[str(p.relative_to(root))]=hashlib.sha256(raw).hexdigest();s=raw.decode()
 def bind(m):
  name=m[1]
  if name=='sbtc-token':return '.sbtc'
  if name=='usdcx':return '.usdcx'
  if name in ['wstx','token-stx-v-1-2']:return '.wstx'
  if name.startswith('markets-'):return '.market'
  if name.startswith('dlmm-'):return '.dlmm'
  if name.startswith('clmm-'):return '.zest'
  if name.startswith(('xyk-','univ2-')):return '.cp'
  raise ValueError(name)
 s=re.sub(r"'[A-Z0-9]+\.([a-zA-Z0-9_-]+)",bind,s)
 files[name]=s
manifest='[project]\nname="router-nov27"\ntelemetry=false\ncache_dir=".cache"\n[repl.analysis]\npasses=[]\n'
for n,s in files.items():
 (out/'contracts'/f'{n}.clar').write_text(s)
 manifest+=f'\n[contracts.{n}]\npath="contracts/{n}.clar"\nclarity_version=6\nepoch="4.0"\n'
(out/'Clarinet.toml').write_text(manifest);shutil.copyfile(root/'settings/Devnet.toml',out/'settings/Devnet.toml')
(out/'source-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
