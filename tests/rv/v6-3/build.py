"""Isolated RV target: production market, dependency substitutions only.
No queue-size reduction: reserve 48/50 seats to reach a two-public-slot queue.
"""
from pathlib import Path
import re, subprocess, shutil, sys, json
full_book = "--full-book" in sys.argv
root=Path(__file__).resolve().parents[3]; out=root/'tests/rv/.build/v6-3';out.mkdir(parents=True,exist_ok=True)
s=(root/'contracts/markets-sbtc-stx-jing-v6-3.clar').read_text()
subs={"'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait', '.jing-core-v6':'.mock-jing-core','.jing-ladder-v1':'.mock-jing-ladder',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.mock-lazer-oracle',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.mock-lazer-oracle'}
for a,b in subs.items():assert a in s;s=s.replace(a,b)
for name,a,b in [('token-x','principal SAINT','principal .mock-ft'),('token-y','principal SAINT','principal .mock-ft'),('initialized','bool false','bool true'),('feed-id-x','uint u0','uint u1'),('feed-id-y','uint u0','uint u45'),('min-token-x-deposit','uint u0','uint u100'),('min-token-y-deposit','uint u0','uint u10000'),('seats-per-side','uint u10','uint u48'),('distance-slots','uint u10','uint u0'),('treasury','principal tx-sender','principal .mock-jing-ladder')]:
 a=f'(define-data-var {name} {a})';assert a in s,a;s=s.replace(a,f'(define-data-var {name} {b})')
props=(root/'tests/rv/v6-3/properties.clar').read_text()
if full_book:
 accounts=json.loads((root/'tests/rv/v6-3/full-book-accounts.json').read_text())
 start=props.index('(define-constant RV-ACCOUNTS ')
 end=props.index('))',start)+2
 props=props[:start]+'(define-constant RV-ACCOUNTS (list\n'+''.join("  '"+a+'\n' for a in accounts)+'))'+props[end:]
 s=s.replace('(define-data-var seats-per-side uint u48)', '(define-data-var seats-per-side uint u0)')
 props+='\n(define-read-only (invariant-all) (rv-all))\n'

for m in re.finditer(r'\(define-public \((test-[a-z-]+)((?: \([a-z-]+ (?:uint|bool|principal)\))*)\)',props):
 name,args=m.groups();params=re.findall(r'\(([a-z-]+) ',args)
 props+=f'\n(define-public ({name.replace("test-","rv-",1)}{args}) (match ({name} {" ".join(params)}) r (ok r) e (begin (var-set rv-valid false) (ok false))))\n'
s+='\n'+props;(out/'market.clar').write_text(s)
(out/'ladder.clar').write_text((root/'tests/rv/mock-jing-ladder.clar').read_text().replace('(define-data-var max-band uint u2)',f'(define-data-var max-band uint u{0 if full_book else 48})'))
core=subprocess.check_output(['python3','tests/rv/_make-mock-jing-core.py','contracts/jing-core-v6.clar'],cwd=root,text=True)
core='(define-data-var last-refund (string-ascii 12) "")\n(define-read-only (get-last-refund) (var-get last-refund))\n(define-public (reset-refund) (begin (asserts! true (err u0)) (ok (var-set last-refund ""))))\n'+core
for side in ['x','y']:
 start=core.index(f'(define-public (log-pending-refund-{side}');end=core.index('(ok true)',start)
 core=core[:end]+f'(ok (var-set last-refund reason))'+core[end+len('(ok true)'):]
(out/'core.clar').write_text(core)
(root/'tests/rv/v6-3/settings').mkdir(exist_ok=True)
shutil.copyfile(root/'settings/Devnet.toml',root/'tests/rv/v6-3/settings/Devnet.toml')
manifest='[project]\nname = "rv-v6-3"\nauthors = []\ntelemetry = false\ncache_dir = "../../../.cache"\n'
for n,p in [('sip-010-trait','../sip-010-trait.clar'),('mock-ft','../mock-ft.clar'),('mock-jing-core','../.build/v6-3/core.clar'),('mock-lazer-oracle','../mock-lazer-oracle.clar'),('mock-jing-ladder','../.build/v6-3/ladder.clar'),('market','../.build/v6-3/market.clar')]:
 manifest+=f'\n[contracts.{n}]\npath = "{p}"\nclarity_version = 5\nepoch = "3.4"\n'
(root/'tests/rv/v6-3/Clarinet.toml').write_text(manifest)
print('Built current v6-3 with local real-ledger FT, Lazer timestamp/mid stub, core logs stub, ladder stub.')
