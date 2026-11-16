import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir='tests/unit/redeploy/.build';
const meta=JSON.parse(fs.readFileSync(`${dir}/sources.json`,'utf8'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const owner='ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
for(const [name,entry] of Object.entries(meta.sources)){
 const source=fs.readFileSync(entry.path,'utf8');
 assert.equal(hash(source),entry.sha256,`${entry.path} changed; rebuild and rerun`);
 let expected=source;
 for(const [from,to] of Object.entries(meta.bindings).sort(([a],[b])=>b.length-a.length))expected=expected.replaceAll(from,to);
 expected=expected.replaceAll(`'${owner}.`,'.').replaceAll("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.",'.');
 const actual=fs.readFileSync(`${dir}/${name}.clar`,'utf8');
 assert.equal(actual,expected,`${name}: changes beyond dependency substitutions`);
 assert.equal(hash(actual),entry.generatedSha256,`${name}: generated hash mismatch`);
}
console.log(`Source integrity: ${Object.keys(meta.sources).length} production copies verified; dependency/asset substitutions only.`);
