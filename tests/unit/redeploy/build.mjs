// Production programs are changed only by explicit dependency/asset identities.
import fs from 'node:fs';
import crypto from 'node:crypto';
import '../router-v5-3/build.mjs';
export const out = 'tests/unit/redeploy/.build';
export const owner = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
fs.mkdirSync(out, {recursive:true});
const names={market:'markets-sbtc-stx-jing-v6-5','market-sbtc-usdcx':'markets-sbtc-usdcx-jing-v6-5','market-stx-usdcx':'markets-stx-usdcx-jing-v6-4',router:'swap-router-sbtc-stx-jing-v5-6','z-batch':'jing-settle-batch-v2'};
const local = n => `'${owner}.${names[n]??n}`;
const bindings = {
 "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait": '.sip-010-trait.sip-010-trait',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle": local('oracle'),
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1": local('oracle'),
 "'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle": local('dia'),
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3": local('miner-oracle'),
 "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token": local('token'),
 "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2": local('asset-stx'),
 "'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx": local('usdcx'),
 '"sbtc-token"': '"token"', '"usdcx-token"': '"token"',
};
const routerMeta = JSON.parse(fs.readFileSync('tests/unit/router-v5-3/.build/source.json')).sources.router;
Object.assign(bindings, Object.fromEntries(Object.entries(routerMeta.substitutions).map(([a,b])=>[a,b.replaceAll('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',owner).replace(`${owner}.market`,`${owner}.${names.market}`)])));
for(const [pair,pools] of [['sbtc-usdcx',['v-1-bps-10','v-1-bps-1','v-2-bps-10']],['stx-usdcx',['v-1-bps-10','v-1-bps-4','v-1-bps-1']]])
 pools.forEach((version,i)=>bindings[`'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-${pair}-${version}`]=local(i?`dlmm-${i+1}`:'dlmm'));
bindings["'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-router-v1"]=local('zest');
bindings["'SP2NK9P261ZN3ZG2M1DS68PCJCRDFZVFMPYA6ZEST.clmm-pool-v1"]=local('zest');
bindings["'SP1A27KFY4XERQCCRCARCYD1CC5N7M6688BSYADJ7.wstx"]=local('asset-stx');
const sources = {
 'swap-router-sbtc-usdcx-jing-v5-6':'contracts/sbtc-usdcx/swap-router-sbtc-usdcx-jing-v5-6.clar',
 'swap-router-stx-usdcx-jing-v5-5':'contracts/stx-usdcx/swap-router-stx-usdcx-jing-v5-5.clar',
 'swap-router-stx-usdcx-jing-v6':'contracts/stx-usdcx/swap-router-stx-usdcx-jing-v6.clar',
 'jing-settle-batch-sbtc-usdcx-v2':'contracts/sbtc-usdcx/jing-settle-batch-sbtc-usdcx-v2.clar',
 'jing-rung-deposit-trait':'contracts/jing-rung-deposit-trait.clar',
 'jing-core-v6':'contracts/jing-core-v6.clar',
 market:'contracts/markets-sbtc-stx-jing-v6-5.clar',
 'market-sbtc-usdcx':'contracts/sbtc-usdcx/markets-sbtc-usdcx-jing-v6-5.clar',
 'market-stx-usdcx':'contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar',
 router:'contracts/swap-router-sbtc-stx-jing-v5-6.clar',
 'z-batch':'contracts/jing-settle-batch-v2.clar',
 'jing-ladder-v1':'contracts/jing-ladder-v1.clar',
 'jing-ladder-sbtc-usdcx-v1':'contracts/sbtc-usdcx/jing-ladder-sbtc-usdcx-v1.clar',
 'jing-ladder-stx-usdcx-v1':'contracts/stx-usdcx/jing-ladder-stx-usdcx-v1.clar',
};
for (const [prod,name] of [['markets-sbtc-stx-jing-v6-5','market'],['markets-sbtc-usdcx-jing-v6-5','market-sbtc-usdcx'],['markets-stx-usdcx-jing-v6-4','market-stx-usdcx'],...Object.keys(sources).filter(n=>n.startsWith('jing-ladder')).map(n=>[n,n])]) bindings[`'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.${prod}`]=local(name);
for (const side of ['buy','sell']) {
 for (const suffix of ['-v2','']) sources[`jing-${side}-stx-10${suffix}`]=`contracts/jing-${side}-stx-rung-v3.clar`;
 for (const suffix of ['-v2','']) sources[`jing-${side}-sbtc-10${suffix}`]=`contracts/sbtc-usdcx/jing-${side}-sbtc-bps-v2.clar`;
 sources[`jing-${side}-stx-usdc-10`]=`contracts/stx-usdcx/jing-${side}-stx-usdc-bps.clar`;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const provenance = {};
for (const [name,path] of Object.entries(sources)) {
 const source=fs.readFileSync(path,'utf8');
 let generated=source;
 for (const [from,to] of Object.entries(bindings).sort(([a],[b])=>b.length-a.length)) generated=generated.replaceAll(from,to);
 generated=generated.replaceAll(`'${owner}.`,'.').replaceAll("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.",'.');
 fs.writeFileSync(`${out}/${name}.clar`,generated);
 provenance[name]={path,sha256:sha(source),generatedSha256:sha(generated)};
}

fs.writeFileSync(`${out}/dia.clar`, '(define-data-var value uint u100000000)\n(define-data-var offset int 0)\n(define-public (configure (v uint) (seconds int))\n (begin (var-set value v) (ok (var-set offset seconds))))\n(define-read-only (get-value (key (string-ascii 32)))\n (ok {value: (var-get value), timestamp: (* (to-uint (+ (to-int stacks-block-time) (var-get offset))) u1000)}))\n');
fs.writeFileSync(`${out}/venues.clar`, fs.readFileSync('tests/unit/router-v5-3/venues.clar','utf8').replace('core-address: (var-get core),','core-address: (var-get core), pool-status: true,'));
fs.writeFileSync(`${out}/zest.clar`, `(use-trait ft .sip-010-trait.sip-010-trait)
(define-read-only (get-fee-rates (pool uint) (who principal)) (if true (ok {fee-rate-x:u0,fee-rate-y:u0}) (err u5001)))
(define-public (swap-x-for-y (x <ft>) (y <ft>) (pool uint) (amount uint) (price uint) (ticks (list 32 int)) (minimum uint) (partial bool) (deadline uint))
 (if true (err u5001) (ok {dx:u0,dy:u0})))
(define-public (swap-y-for-x (x <ft>) (y <ft>) (pool uint) (amount uint) (price uint) (ticks (list 32 int)) (minimum uint) (partial bool) (deadline uint))
 (if true (err u5001) (ok {dx:u0,dy:u0})))`);
let manifest='[project]\nname = "redeploy-v6-5"\nauthors = []\ntelemetry = false\ncache_dir = "./.cache"\n';
const fixtures={
 zest:`${out}/zest.clar`,
 'sip-010-trait':'tests/rv/sip-010-trait.clar', token:'tests/unit/v6-3/token.clar', usdcx:'tests/unit/v6-3/token.clar',
 'asset-stx':'tests/rv/mock-wstx.clar',oracle:'tests/unit/v6-3/oracle.clar',dia:`${out}/dia.clar`,
 'miner-oracle':'tests/unit/integration-v6-3/miner-oracle.clar','jing-core-v6':'contracts/jing-core-v6.clar',
 'jing-rung-deposit-trait':'contracts/jing-rung-deposit-trait.clar',
 ...Object.fromEntries(['dlmm','dlmm-2','dlmm-3','xyk','velar'].map(n=>[n,`${out}/venues.clar`])),
 'dlmm-router':'tests/unit/router-v5-3/dlmm-router.clar',
 ...Object.fromEntries(Object.keys(sources).map(n=>[n,`${out}/${n}.clar`])),
};
fs.writeFileSync(`${out}/sources.json`,JSON.stringify({sources:provenance,bindings,fixtures},null,2)+'\n');
const entries={};
for(const [name,path] of Object.entries(fixtures)){
 const checked=`${out}/check-${name}.clar`;
 fs.writeFileSync(checked,fs.readFileSync(path,'utf8').replaceAll(`'${owner}.`,'.'));
 entries[name]=`\n[contracts.${names[name]??name}]\npath = "${checked}"\nclarity_version = 5\nepoch = "3.4"\n`;
}
for(const pair of ['sbtc-stx','sbtc-usdcx','stx-usdcx']){
 const selected=Object.keys(fixtures).filter(n=>{
  if(!sources[n]||['jing-core-v6','jing-rung-deposit-trait'].includes(n))return true;
  if(pair==='sbtc-stx')return ['market','router','z-batch','jing-ladder-v1'].includes(n)||/^jing-(buy|sell)-stx-10/.test(n);
  if(pair==='sbtc-usdcx')return n==='market-sbtc-usdcx'||n.includes('sbtc-usdcx')||/^jing-(buy|sell)-sbtc-10/.test(n);
  return n==='market-stx-usdcx'||n.includes('stx-usdcx')||/^jing-(buy|sell)-stx-usdc-10/.test(n);
 });
 const path=pair==='sbtc-stx'?'Clarinet-redeploy-v6-5.toml':`Clarinet-redeploy-${pair}.toml`;
 fs.writeFileSync(path,manifest.replace('name = "redeploy-v6-5"',`name = "redeploy-${pair}"`)+selected.map(n=>entries[n]).join(''));
}
