import fs from 'node:fs';
import crypto from 'node:crypto';
export const dir='tests/unit/integration-v6-3';
export const out=`${dir}/.build`;
export const rungFiles=['jing-buy-stx-core-spread-v1','jing-sell-stx-core-spread-v1'];
export const substitutions={
 "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.oracle',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.oracle',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3":'.market',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-v1":'.jing-ladder-v1',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3":'.miner-oracle',
 "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token":'.token',
 "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2":'.asset-stx',
 '"sbtc-token"':'"token"',
};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.mkdirSync(out,{recursive:true});
for(const file of ['lcov.info','results.json','coverage.json'])fs.rmSync(`${out}/${file}`,{force:true});
fs.mkdirSync(`${dir}/settings`,{recursive:true});
fs.copyFileSync('settings/Devnet.toml',`${dir}/settings/Devnet.toml`);
const sources={};
for(const name of ['markets-sbtc-stx-jing-v6-3','jing-core-v6','jing-ladder-v1',...rungFiles]){
 const path=`contracts/${name}.clar`,source=fs.readFileSync(path,'utf8');
 let generated=source;
 // Core and ladder run byte-identically. Only market/rung dependency identities change.
 if(name!=='jing-core-v6'&&name!=='jing-ladder-v1')for(const [from,to] of Object.entries(substitutions))generated=generated.replaceAll(from,to);
 fs.writeFileSync(`${out}/${name}.clar`,generated);
 sources[name]={path,sha256:sha(source),generatedSha256:sha(generated)};
}
fs.writeFileSync(`${out}/sources.json`,JSON.stringify({sources,substitutions},null,2)+'\n');
