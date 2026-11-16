// Verify every parity deployment after testing, without rebuilding any tested file.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import '../verify-sources.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let checked=0;
for(const pair of ['sbtc-usdcx','stx-usdcx']){
 const unit=`tests/unit/parity-${pair}/.build`,u=JSON.parse(fs.readFileSync(`${unit}/source.json`));
 let source=fs.readFileSync(u.sourcePath,'utf8');assert.equal(hash(source),u.sha256,`${u.sourcePath} changed`);
 for(const [a,b] of Object.entries(u.substitutions))source=source.replaceAll(a,b);
 assert.equal(fs.readFileSync(`${unit}/market.clar`,'utf8'),source);checked++;
 for(const kind of ['integration','ladder']){
  const dir=`tests/unit/parity-${pair}-${kind}/.build`,meta=JSON.parse(fs.readFileSync(`${dir}/${kind==='ladder'?'source':'sources'}.json`));
  for(const [name,m] of Object.entries(meta.sources)){
   let expected=fs.readFileSync(m.path,'utf8');assert.equal(hash(expected),m.sha256,`${m.path} changed`);
   if(kind==='integration'){
    for(const [a,b] of Object.entries(meta.substitutions))expected=expected.replaceAll(a,b);
    assert.equal(fs.readFileSync(`${dir}/${name}.clar`,'utf8'),expected);
   }
   checked++;
  }
 }
 const version=pair==='sbtc-usdcx'?'v6-5':'v6-4',rv=`tests/rv/.build/${pair}-${version}`,meta=JSON.parse(fs.readFileSync(`${rv}/source.json`));
 let expected=fs.readFileSync(meta.source,'utf8');assert.equal(hash(expected),meta.sha256,`${meta.source} changed`);
 assert.equal(hash(fs.readFileSync(meta.coreSource)),meta.coreSha256,'RV core changed');
 for(const [a,b] of Object.entries(meta.dependencySubstitutions))expected=expected.replaceAll(a,b);
 assert.ok(fs.readFileSync(`${rv}/market.clar`,'utf8').startsWith(expected+'\n'),'RV modified production declarations');checked++;
}
console.log(`Parity source integrity: ${checked} market, rung, core, ladder, dispatch and relay targets verified.`);
