"""Isolated RV target: production market, dependency substitutions only.
No queue-size reduction: reserve 48/50 seats to reach a two-public-slot queue.
"""
from pathlib import Path
import re, subprocess, shutil, sys, json, hashlib
full_book = "--full-book" in sys.argv
root=Path(__file__).resolve().parents[3]; out=root/'tests/rv/.build/v6-3';out.mkdir(parents=True,exist_ok=True)
source=(root/'contracts/markets-sbtc-stx-jing-v6-3.clar').read_text()
s=source
subs={"'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait', '.jing-core-v6':'.mock-jing-core','.jing-ladder-v1':'.mock-jing-ladder',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.mock-lazer-oracle',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.mock-lazer-oracle'}
for a,b in subs.items():assert a in s;s=s.replace(a,b)
production_prefix=s
props=(root/'tests/rv/v6-3/properties.clar').read_text()
if full_book:
 accounts=json.loads((root/'tests/rv/v6-3/full-book-accounts.json').read_text())
 start=props.index('(define-constant RV-ACCOUNTS ')
 end=props.index('))',start)+2
 props=props[:start]+'(define-constant RV-ACCOUNTS (list\n'+''.join("  '"+a+'\n' for a in accounts)+'))'+props[end:]
 props+='\n(define-read-only (invariant-all) (rv-all))\n'

for m in re.finditer(r'\(define-public \((test-[a-z-]+)((?: \([a-z-]+ (?:uint|bool|principal)\))*)\)',props):
 name,args=m.groups();params=re.findall(r'\(([a-z-]+) ',args)
 props+=f'\n(define-public ({name.replace("test-","rv-",1)}{args}) (match ({name} {" ".join(params)}) r (ok r) e (begin (var-set rv-valid false) (ok false))))\n'
# Initialize through the real public functions rather than rewriting production
# state declarations. Only test helpers and this explicit prelude are appended.
bootstrap='''
(unwrap-panic (initialize .market .mock-ft .mock-ft u100 u10000 u1 u45))
(unwrap-panic (set-treasury .mock-jing-ladder))
(unwrap-panic (sync-seat-count))
(unwrap-panic (set-distance-slots u0))
'''
accounts=re.search(r'\(define-constant RV-ACCOUNTS \(list([\s\S]*?)\)\)',props).group(1)
for account in re.findall(r'ST[A-Z0-9]+',accounts):
 bootstrap+=f"(unwrap-panic (contract-call? .mock-ft mint u100000000000000 '{account}))\n"
s+='\n'+props+bootstrap
assert s[:len(production_prefix)] == production_prefix
(out/'market.clar').write_text(s)
(out/'source.json').write_text(json.dumps({
 'source':'contracts/markets-sbtc-stx-jing-v6-3.clar',
 'sha256':hashlib.sha256(source.encode()).hexdigest(),
 'dependencySubstitutions':subs,
 'productionPrefixLength':len(production_prefix),
 'fullBook':full_book,
 'fundedAccounts':len(re.findall(r'ST[A-Z0-9]+',accounts)),
},indent=2)+'\n')
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
for n,p in [('sip-010-trait','../sip-010-trait.clar'),('mock-ft','strict-ft.clar'),('mock-jing-core','../.build/v6-3/core.clar'),('mock-lazer-oracle','../mock-lazer-oracle.clar'),('mock-jing-ladder','../.build/v6-3/ladder.clar'),('market','../.build/v6-3/market.clar')]:
 manifest+=f'\n[contracts.{n}]\npath = "{p}"\nclarity_version = 5\nepoch = "3.4"\n'
(root/'tests/rv/v6-3/Clarinet.toml').write_text(manifest)
print('Built current v6-3 with unchanged production declarations, public initialization, strictly funded FT, and explicit oracle/core/ladder mocks.')
