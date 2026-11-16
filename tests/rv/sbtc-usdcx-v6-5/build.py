"""Isolated RV target: production market, dependency substitutions only.
No queue-size reduction: reserve 48/50 seats to reach a two-public-slot queue.
"""
from pathlib import Path
import re, shutil, sys, json, hashlib
full_book = "--full-book" in sys.argv
root=Path(__file__).resolve().parents[3]; out=root/'tests/rv/.build/sbtc-usdcx-v6-5';out.mkdir(parents=True,exist_ok=True)
source=(root/'contracts/sbtc-usdcx/markets-sbtc-usdcx-jing-v6-5.clar').read_text()
s=source
subs={"'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait', '.jing-ladder-sbtc-usdcx-v1':'.mock-jing-ladder',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.mock-lazer-oracle',"'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.mock-lazer-oracle'}
subs["'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx"]='.mock-stx'
subs['"usdcx-token"']='"mock-ft"'
for a,b in subs.items():assert a in s;s=s.replace(a,b)
production_prefix=s
(out/'oracle.clar').write_text((root/'tests/rv/mock-lazer-oracle.clar').read_text().replace('(feed u45 100000000 ts)', '(feed u7 100000000 ts)'))
props=(root/'tests/rv/v6-3/properties.clar').read_text().replace('(stx-get-balance who)', '(unwrap-panic (contract-call? .mock-stx get-balance who))')
props += '''\n;; Exercise both accepted and refused bounds through production setters.
(define-public (test-staleness (raw uint) (settle bool))
 (let ((n (mod raw u100)))
  (asserts! true (err u9902))
  (if settle (is-ok (set-settle-max-staleness n)) (is-ok (set-max-staleness n)))
  (ok (and (>= (var-get max-staleness) u40) (<= (var-get max-staleness) u80)
           (>= (var-get settle-max-staleness) u20) (<= (var-get settle-max-staleness) u40)))))
(define-read-only (invariant-staleness)
 (and (>= (var-get max-staleness) u40) (<= (var-get max-staleness) u80)
      (>= (var-get settle-max-staleness) u20) (<= (var-get settle-max-staleness) u40)))
'''
for side in ['x','y']:
 props += f"""
(define-private (rv-nonzero-{side} (who principal)) (> (get-token-{side}-deposit (var-get current-cycle) who) u0))
(define-read-only (invariant-list-{side})
 (let ((book (get-token-{side}-depositors (var-get current-cycle))))
  (and (is-eq (len book) (len (filter rv-nonzero-{side} RV-ACCOUNTS)))
       (is-eq (len book) (len (filter rv-nonzero-{side} book)))
       (is-eq (len book) (len (fold rv-unique book (list)))))))
"""
if full_book:
 accounts=json.loads((root/'tests/rv/v6-3/full-book-accounts.json').read_text())
 start=props.index('(define-constant RV-ACCOUNTS ')
 end=props.index('))',start)+2
 props=props[:start]+'(define-constant RV-ACCOUNTS (list\n'+''.join("  '"+a+'\n' for a in accounts)+'))'+props[end:]

for m in re.finditer(r'\(define-public \((test-[a-z-]+)((?: \([a-z-]+ (?:uint|bool|principal)\))*)\)',props):
 name,args=m.groups();params=re.findall(r'\(([a-z-]+) ',args)
 props+=f'\n(define-public ({name.replace("test-","rv-",1)}{args}) (match ({name} {" ".join(params)}) r (ok r) e (begin (var-set rv-valid false) (ok false))))\n'
# Registration requires a deployed contract hash. runtime.mjs performs normal
# owner verification and public initialization after simnet deploys the market.
accounts=re.search(r'\(define-constant RV-ACCOUNTS \(list([\s\S]*?)\)\)',props).group(1)
s+='\n'+props
assert s[:len(production_prefix)] == production_prefix
(out/'market.clar').write_text(s)
(out/'source.json').write_text(json.dumps({
 'source':'contracts/sbtc-usdcx/markets-sbtc-usdcx-jing-v6-5.clar',
 'sha256':hashlib.sha256(source.encode()).hexdigest(),
 'dependencySubstitutions':subs,
 'productionPrefixLength':len(production_prefix),
 'coreSource':'contracts/jing-core-v6.clar',
 'coreSha256':hashlib.sha256((root/'contracts/jing-core-v6.clar').read_bytes()).hexdigest(),
 'accounts':re.findall(r'ST[A-Z0-9]+',accounts),
 'fullBook':full_book,
 'fundedAccounts':len(re.findall(r'ST[A-Z0-9]+',accounts)),
},indent=2)+'\n')
(out/'ladder.clar').write_text((root/'tests/rv/mock-jing-ladder.clar').read_text().replace('(define-data-var max-band uint u2)',f'(define-data-var max-band uint u{0 if full_book else 48})'))
(out/'core.clar').unlink(missing_ok=True)
(out/'usdcx.clar').write_text((root/'tests/rv/v6-3/strict-ft.clar').read_text().replace('(get-decimals) (ok u8)', '(get-decimals) (ok u6)'))
(root/'tests/rv/sbtc-usdcx-v6-5/settings').mkdir(exist_ok=True)
shutil.copyfile(root/'settings/Devnet.toml',root/'tests/rv/sbtc-usdcx-v6-5/settings/Devnet.toml')
manifest='[project]\nname = "rv-sbtc-usdcx-v6-5"\nauthors = []\ntelemetry = false\ncache_dir = "../../../.cache"\n'
for n,p in [('sip-010-trait','../sip-010-trait.clar'),('mock-ft','../v6-3/strict-ft.clar'),('mock-stx','../.build/sbtc-usdcx-v6-5/usdcx.clar'),('jing-core-v6','../../../contracts/jing-core-v6.clar'),('mock-lazer-oracle','../.build/sbtc-usdcx-v6-5/oracle.clar'),('mock-jing-ladder','../.build/sbtc-usdcx-v6-5/ladder.clar'),('market','../.build/sbtc-usdcx-v6-5/market.clar')]:
 manifest+=f'\n[contracts.{n}]\npath = "{p}"\nclarity_version = 5\nepoch = "3.4"\n'
(root/'tests/rv/sbtc-usdcx-v6-5/Clarinet.toml').write_text(manifest)
print('Built current sBTC/USDCx v6-5 with unchanged production declarations, real core, strict FT balances, and explicit oracle/ladder fixtures.')
