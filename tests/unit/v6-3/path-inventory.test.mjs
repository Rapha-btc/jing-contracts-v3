import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inventory,responseFrames} from './path-inventory.mjs';

test('inventory ignores comments and quoted operator names and preserves source spans',()=>{
 const source=';; (try! fake)\n(define-public (go)\n (begin (print "(unwrap! fake)") (asserts! true (err u1)) (try! (other))))';
 const got=inventory(source);
 assert.equal(got.functions.length,1);
 assert.deepEqual(got.arms.map(a=>a.op),['asserts!','try!']);
 assert.equal(got.arms[0].line,3);
 assert.equal(got.arms[0].expression,'(asserts! true (err u1))');
});
test('each current market error exit has a unique source identity',()=>{
 const got=inventory(fs.readFileSync('contracts/markets-sbtc-stx-jing-v6-3.clar','utf8'));
 assert.equal(got.functions.length,137);
 assert.equal(got.arms.length,296);
 assert.equal(new Set(got.arms.map(a=>a.id)).size,296);
});
test('trace returns are associated with the calling operand, not its parent or sibling',()=>{
 const trace=['├── ( outer )  market:10:1','│   ├── ( child )  market:20:2','│   │   └── (err u1)','│   └── (ok true)','├── ( sibling )  market:30:1','│   └── (ok true)'].join('\n');
 assert.deepEqual(responseFrames(trace).map(f=>[f.line,f.result]),[[20,'err'],[10,'ok'],[30,'ok']]);
});
test('native error text without a call frame is not attributed to a source line',()=>{
 assert.deepEqual(responseFrames('└── (err u1)'),[]);
});
