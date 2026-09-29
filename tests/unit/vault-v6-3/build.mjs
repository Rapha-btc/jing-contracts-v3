import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='tests/unit/vault-v6-3',out=`${dir}/.build`;
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(`${dir}/settings`,{recursive:true});
fs.copyFileSync('settings/Devnet.toml',`${dir}/settings/Devnet.toml`);
const replacements={
 "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.oracle',
 "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.oracle',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3":'.market',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.swap-router-sbtc-stx-jing-v5-3":'.router',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v6":'.jing-core-v6',
 "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-vault-auth":'.jing-vault-auth',
 "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token":'.token',
 "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2":'.wrong-token',
 "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2":'.mock-dlmm-router',
 "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15":'.mock-dlmm-pool',
 "'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1":'.mock-dlmm-core',
 "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2":'.mock-xyk-core',
 "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1":'.mock-xyk-pool',
 "'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070":'.mock-velar-pool',
 "'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-fees-v1_0_0-0070":'.mock-velar-fees',
 "'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx":'.wrong-token',
 '.mock-ft':'.token','.mock-wstx':'.wrong-token','"mock-ft"':'"token"','"sbtc-token"':'"token"',
};
let manifest='[project]\nname = "vault-v6-3"\nauthors = []\ntelemetry = false\ncache_dir = "../../../.cache"\n';
const sources={};
function add(name,path,patch=false){
 if(patch){const original=fs.readFileSync(path,'utf8');let source=original;
  for(const [a,b] of Object.entries(replacements))source=source.replaceAll(a,b);
  // Funded venue mocks pay 1% above each leg minimum plus two units so
  // per-leg rounding slack does not make a successful fixture miss min-out.
  if(['mock-dlmm-router','mock-xyk-core','mock-velar-pool'].includes(name))
    for(const n of ['min-dy','min-dx','amt-out-min'])
      source=source.replaceAll(`(if (> ${n} u0) ${n} u1)`,`(+ ${n} (/ ${n} u100) u2)`);
  fs.writeFileSync(`${out}/${name}.clar`,source);
  sources[name]={path,sha256:crypto.createHash('sha256').update(original).digest('hex')};path=`.build/${name}.clar`;
 }
 if(name==='vault'||name==='router')return;
 manifest+=`\n[contracts.${name}]\npath = "${path}"\nclarity_version = 5\nepoch = "3.4"\n`;
}
add('sip-010-trait','../../rv/sip-010-trait.clar');
for(const name of ['token','wrong-token'])add(name,'../v6-3/token.clar');
add('oracle','../v6-3/oracle.clar');
for(const [name,file] of Object.entries({
 'jing-core-v6':'jing-core-v6','jing-ladder-v1':'jing-ladder-v1',
 market:'markets-sbtc-stx-jing-v6-3',router:'swap-router-sbtc-stx-jing-v5-3',
 'jing-vault-auth':'jing-vault-auth',vault:'vault-sbtc-stx-v6',
}))add(name,`contracts/${file}.clar`,true);
for(const [name,file] of Object.entries({
 'mock-dlmm-core':'mock-dlmm-core','mock-dlmm-pool':'mock-dlmm-pool-v5',
 'mock-dlmm-router':'mock-dlmm-router-v5','mock-xyk-core':'mock-xyk-core-v5',
 'mock-xyk-pool':'mock-xyk-pool-v5','mock-velar-fees':'mock-velar-fees','mock-velar-pool':'mock-velar-pool',
}))add(name,`tests/rv/${file}.clar`,true);
fs.writeFileSync(`${dir}/Clarinet.toml`,manifest);
fs.writeFileSync(`${out}/sources.json`,JSON.stringify({sources,replacements},null,2)+'\n');
