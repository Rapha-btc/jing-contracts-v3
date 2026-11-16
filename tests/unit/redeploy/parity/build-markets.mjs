import fs from 'node:fs';
import {oracleSource} from './oracle.mjs';
import crypto from 'node:crypto';
// Generated fixtures only; production declarations are preserved byte for byte
// except for the dependency and token identities recorded in source.json.
for(const [pair,version] of [['sbtc-usdcx','6-5'],['stx-usdcx','6-4']].filter(([pair])=>pair===(process.env.PARITY_PAIR??'sbtc-usdcx'))){
 const dir=`tests/unit/parity-${pair}`,out=`${dir}/.build`,native=pair==='stx-usdcx';
 fs.mkdirSync(out,{recursive:true});fs.rmSync(`${out}/lcov.info`,{force:true});fs.mkdirSync(`${dir}/settings`,{recursive:true});
 fs.copyFileSync('settings/Devnet.toml',`${dir}/settings/Devnet.toml`);
 const sourcePath=`contracts/${pair}/markets-${pair}-jing-v${version}.clar`;
 const substitutions={
  "'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait":'.sip-010-trait.sip-010-trait',
  "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle":'.oracle',
  "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1":'.oracle',
  "'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx":'.usdcx',
  '"usdcx-token"':'"token"',
  [`.jing-ladder-${pair}-v1`]:'.jing-ladder-v1',
  ...(native?{"'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2":'.token'}:{}),
 };
 const source=fs.readFileSync(sourcePath,'utf8');let generated=source;
 for(const [a,b] of Object.entries(substitutions))generated=generated.replaceAll(a,b);
 fs.writeFileSync(`${out}/market.clar`,generated);
 const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 const corePath='contracts/jing-core-v6.clar';
 fs.writeFileSync(`${out}/source.json`,JSON.stringify({sourcePath,sha256:sha(source),substitutions,corePath,coreSha256:sha(fs.readFileSync(corePath))},null,2)+'\n');
 fs.writeFileSync(`${out}/ladder.clar`,fs.readFileSync('tests/rv/mock-jing-ladder.clar','utf8')+'\n(define-public (set-max-band (n uint)) (ok (var-set max-band n)))\n');
 fs.writeFileSync(`${out}/oracle.clar`,oracleSource(pair));
 if(native)fs.writeFileSync(`${out}/token.clar`,fs.readFileSync('tests/rv/mock-wstx.clar','utf8')+'\n(define-public (mint (n uint) (who principal)) (if (is-eq who tx-sender) (ok true) (stx-transfer? n tx-sender who)))\n');
 fs.writeFileSync(`${out}/usdcx.clar`,fs.readFileSync('tests/unit/v6-3/token.clar','utf8').replace('(get-decimals) (ok u8)','(get-decimals) (ok u6)'));
 let caller=fs.readFileSync('tests/unit/v6-3/registered-depositor.clar','utf8').replaceAll('.wrong-token','.usdcx').replaceAll('(with-stx amount)','(with-ft .usdcx "token" amount)').replaceAll('(stx-transfer? amount tx-sender current-contract)','(contract-call? .usdcx transfer amount tx-sender current-contract none)').replaceAll('(stx-transfer? amount current-contract owner)','(contract-call? .usdcx transfer amount current-contract owner none)');
 if(native)caller=caller.replaceAll('(with-ft .token "token" amount)','(with-stx amount)');
 fs.writeFileSync(`${out}/registered-depositor.clar`,caller);
 let manifest=fs.readFileSync('tests/unit/v6-3/Clarinet.toml','utf8').replace('name = "unit-v6-3"',`name = "parity-${pair}"`).replaceAll('path = "token.clar"','path = "../v6-3/token.clar"').replace('path = "oracle.clar"','path = ".build/oracle.clar"');
 if(native)manifest=manifest.replace('[contracts.token]\npath = "../v6-3/token.clar"','[contracts.token]\npath = ".build/token.clar"');
 manifest+='\n[contracts.usdcx]\npath = ".build/usdcx.clar"\nclarity_version = 5\nepoch = "3.4"\n';
 fs.writeFileSync(`${dir}/Clarinet.toml`,manifest);
}
