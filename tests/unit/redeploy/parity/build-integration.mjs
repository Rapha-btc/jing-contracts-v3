import fs from 'node:fs';
import {oracleSource} from './oracle.mjs';
import crypto from 'node:crypto';
const pair=process.env.PARITY_PAIR??'sbtc-usdcx',native=pair==='stx-usdcx',dir=`tests/unit/parity-${pair}-integration`,out=`${dir}/.build`;
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(`${dir}/settings`,{recursive:true});
fs.rmSync(`${out}/lcov.info`,{force:true});
fs.copyFileSync('settings/Devnet.toml',`${dir}/settings/Devnet.toml`);
const owner='ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const substitutions={
 "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.oracle',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.oracle',
 "'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle":`'${owner}.miner-oracle`,
 "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token":`'${owner}.token`,
 "'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx":`'${owner}.usdcx`,
 '"sbtc-token"':'"token"','"usdcx-token"':'"token"',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-5":`'${owner}.market`,
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-sbtc-usdcx-v1":`'${owner}.jing-ladder-v1`,
 '.jing-ladder-sbtc-usdcx-v1':'.jing-ladder-v1',
};
if(native){
 for(const key of Object.keys(substitutions))if(key.includes('markets-sbtc-usdcx-jing-v6-5')){substitutions[key.replace('markets-sbtc-usdcx-jing-v6-5','markets-stx-usdcx-jing-v6-4')]=substitutions[key];delete substitutions[key];}
 for(const key of Object.keys(substitutions))if(key.includes('jing-ladder-sbtc-usdcx-v1')){substitutions[key.replace('jing-ladder-sbtc-usdcx-v1','jing-ladder-stx-usdcx-v1')]=substitutions[key];delete substitutions[key];}
 substitutions["'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2"]=`'${owner}.token`;
}
const paths={
 'jing-core-v6':'contracts/jing-core-v6.clar','jing-ladder-v1':`contracts/${pair}/jing-ladder-${pair}-v1.clar`,
 'markets-sbtc-usdcx-jing-v6-5':`contracts/${pair}/markets-${pair}-jing-v6-5.clar`,
 'jing-rung-deposit-trait':'contracts/jing-rung-deposit-trait.clar',
 'jing-ladder-dispatch':`contracts/${pair}/jing-ladder-dispatch-${pair}.clar`,
 'jing-ladder-relay':`contracts/${pair}/jing-ladder-dispatch-${pair}-relay.clar`,
 'jing-buy-sbtc-bps-v2':`contracts/${pair}/jing-buy-sbtc-bps-v2.clar`,
 'jing-sell-sbtc-bps-v2':`contracts/${pair}/jing-sell-sbtc-bps-v2.clar`,
};
if(native){
 delete paths['markets-sbtc-usdcx-jing-v6-5'];paths['markets-stx-usdcx-jing-v6-4']='contracts/stx-usdcx/markets-stx-usdcx-jing-v6-4.clar';
 for(const side of ['buy','sell']){delete paths[`jing-${side}-sbtc-bps-v2`];paths[`jing-${side}-stx-usdc-bps`]=`contracts/stx-usdcx/jing-${side}-stx-usdc-bps.clar`;}
}
const sources={},sha=s=>crypto.createHash('sha256').update(s).digest('hex');
for(const [name,path] of Object.entries(paths)){
 const source=fs.readFileSync(path,'utf8');let generated=source;
 for(const [a,b] of Object.entries(substitutions))generated=generated.replaceAll(a,b);
 fs.writeFileSync(`${out}/${name}.clar`,generated);sources[name]={path,sha256:sha(source),generatedSha256:sha(generated)};
}
fs.writeFileSync(`${out}/sources.json`,JSON.stringify({sources,substitutions},null,2)+'\n');
fs.writeFileSync(`${out}/oracle.clar`,oracleSource(pair));
fs.writeFileSync(`${out}/miner-oracle.clar`, `(define-data-var mid uint u${native?10000000000n:1000000000000n})
(define-data-var available bool true)
(define-public (set-mid (n uint)) (ok (var-set mid n)))
(define-public (set-available (v bool)) (ok (var-set available v)))
(define-read-only (get-value (key (string-ascii 32)))
 (ok {value:(if (var-get available) (var-get mid) u0),timestamp:(* stacks-block-time u1000)}))
`);
fs.writeFileSync(`${out}/usdcx.clar`,fs.readFileSync('tests/unit/v6-3/token.clar','utf8').replace('(get-decimals) (ok u8)','(get-decimals) (ok u6)'));
let manifest='[project]\nname = "parity-integration-sbtc-usdcx"\nauthors = []\ntelemetry = false\ncache_dir = "../../../.cache"\n';
const entries={'sip-010-trait':'../../rv/sip-010-trait.clar',token:'../v6-3/token.clar',usdcx:'.build/usdcx.clar',oracle:'.build/oracle.clar','miner-oracle':'.build/miner-oracle.clar'};
for(const [name] of Object.entries(paths))if(!name.includes('-bps'))entries[name.startsWith('markets-')?'market':name]=`.build/${name}.clar`;
for(const side of ['buy','sell'])for(const bps of [0,10,20,25,30,40,50,60,70,80,90,100])entries[`jing-${side}-${native?'stx-usdc':'sbtc'}-${bps}${native?'':'-v2'}`]=`.build/jing-${side}-${native?'stx-usdc-bps':'sbtc-bps-v2'}.clar`;
if(native){
 fs.writeFileSync(`${out}/token.clar`,fs.readFileSync('tests/rv/mock-wstx.clar','utf8')+'\n(define-public (mint (n uint) (who principal)) (if (is-eq who tx-sender) (ok true) (stx-transfer? n tx-sender who)))\n');entries.token='.build/token.clar';
}
manifest=manifest.replace("parity-integration-sbtc-usdcx",`parity-integration-${pair}`);
for(const [name,path] of Object.entries(entries))manifest+=`\n[contracts.${name}]\npath = "${path}"\nclarity_version = ${native&&['token','sip-010-trait'].includes(name)?4:5}\nepoch = "${native&&['token','sip-010-trait'].includes(name)?'3.3':'3.4'}"\n`;
fs.writeFileSync(`${dir}/Clarinet.toml`,manifest);
