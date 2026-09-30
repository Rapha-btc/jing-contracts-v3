import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = 'tests/unit/router-v5-3';
const out = `${dir}/.build`;
export const owner = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
export const sha = text => crypto.createHash('sha256').update(text).digest('hex');
fs.mkdirSync(out, {recursive:true});
for (const name of ['lcov.info','results.json','coverage.json']) fs.rmSync(`${out}/${name}`, {force:true});
const local = name => `'${owner}.${name}`;
const common = {"'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait": '.sip-010-trait.sip-010-trait'};
const deps = {
  market: {...common,
    "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle": '.oracle',
    "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1": '.oracle'},
  router: {
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6-3": local('market'),
    "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token": local('token'),
    '"sbtc-token"': '"token"',
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2": local('asset-stx'),
    "'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx": local('asset-stx'),
    "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2": local('dlmm'),
    "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15": local('dlmm'),
    "'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1": local('dlmm'),
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2": local('xyk'),
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1": local('xyk'),
    "'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070": local('velar'),
    "'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-fees-v1_0_0-0070": local('velar')},
  'jing-core-v6': {},
};
const paths = {market:'contracts/markets-sbtc-stx-jing-v6-3.clar',router:'contracts/swap-router-sbtc-stx-jing-v5-3.clar','jing-core-v6':'contracts/jing-core-v6.clar'};
const sources = {};
for (const [name,path] of Object.entries(paths)) {
  const source = fs.readFileSync(path,'utf8'); let generated = source;
  for (const [from,to] of Object.entries(deps[name])) {
    if (!generated.includes(from)) throw Error(`Missing substitution: ${from}`);
    generated = generated.replaceAll(from,to);
  }
  fs.writeFileSync(`${out}/${name}.clar`,generated);
  sources[name] = {path,sha256:sha(source),generatedSha256:sha(generated),substitutions:deps[name]};
}
const fixtures = ['tests/rv/sip-010-trait.clar','tests/rv/mock-wstx.clar','tests/rv/mock-jing-ladder.clar','tests/unit/v6-3/token.clar','tests/unit/v6-3/oracle.clar',`${dir}/venues.clar`];
fs.writeFileSync(`${out}/source.json`,JSON.stringify({sources,fixtures:Object.fromEntries(fixtures.map(p=>[p,sha(fs.readFileSync(p))]))},null,2)+'\n');
fs.mkdirSync(`${dir}/settings`,{recursive:true});
fs.copyFileSync('settings/Devnet.toml',`${dir}/settings/Devnet.toml`);
