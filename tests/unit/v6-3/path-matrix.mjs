import fs from 'node:fs';
import crypto from 'node:crypto';
import {inventory,responseFrames} from './path-inventory.mjs';
const dir='tests/unit/v6-3', sourcePath='contracts/markets-sbtc-stx-jing-v6-3.clar';
const source=fs.readFileSync(sourcePath,'utf8'), sha256=crypto.createHash('sha256').update(source).digest('hex');
const coverage=JSON.parse(fs.readFileSync(`${dir}/.build/coverage.json`));
if(coverage.sha256!==sha256)throw Error('Stale market coverage');
if(crypto.createHash('sha256').update(fs.readFileSync(coverage.core.source)).digest('hex')!==coverage.core.sha256)throw Error('Stale core coverage');
const {functions,arms}=inventory(source);
let currentName='';
const records=fs.readFileSync(`${dir}/.build/lcov.info`,'utf8').split('end_of_record').map(r=>{const n=r.match(/TN:(.*)/);if(n)currentName=n[1];return r+`\nEVIDENCE_TEST:${currentName}\n`;}).filter(r=>r.split('\n').some(l=>l.startsWith('SF:')&&l.endsWith('/tests/unit/v6-3/.build/market.clar'))).map(r=>{
 const name=r.match(/EVIDENCE_TEST:(.*)/)?.[1];const branches=new Map([...r.matchAll(/^BRDA:(\d+),(\d+),(\d+),([\d-]+)$/gm)].map(m=>[`${m[1]},${m[2]},${m[3]}`,Number(m[4])||0]));
 const fn=new Set([...r.matchAll(/^FNDA:(\d+),(.+)$/gm)].filter(m=>Number(m[1])>0).map(m=>m[2]));
 return {name,branches,fn};
}).filter(r=>r.name);
const evidence=fs.readFileSync(`${dir}/.build/path-evidence.jsonl`,'utf8').trim().split('\n').filter(Boolean).map(s=>{const r=JSON.parse(s);return {...r,frames:responseFrames(r.trace)};});
const uniq=a=>[...new Set(a)];
const stxerArea=fn=>/walk|execute-fill|cross-remainder|swap-result/.test(fn)?'swap-walk':/cap-|get-taker|gross-up/.test(fn)?'capacity':/seat|park|top-|side-full/.test(fn)?'full-side':/filter-|distribute-|roll-and|execute-settlement|settle-with|prune|settle-token-.-limit/.test(fn)?'settlement-edges':'errors-admin';
const sameTest=(lcov,title)=>lcov.split('__').slice(1).join(' > ')===title;
const result=arms.map(a=>{
 const failed= a.op!=='asserts!'?[]:records.filter(r=>(r.branches.get(`${a.errorLine},0,1`)??0)>0).map(r=>({test:r.name,method:'LCOV failure operand',rollback:'not attributed',kind:evidence.some(e=>sameTest(r.name,e.test)&&e.kind==='private'&&e.fn===a.function&&e.outcome.startsWith('err '))?'private':'not attributed'}));
 for(const e of evidence.filter(e=>e.outcome.startsWith('err '))){
  if(a.op==='try!'&&a.operand.children&&e.frames.some(f=>f.line===a.operand.line&&f.result==='err'))failed.push({test:e.test,method:'SDK operand call returned err',rollback:e.rollback??'events only',entry:e.fn,kind:e.kind});
 }
 // An as-contract? expression propagates its inner try! early return. Do not
 // generalize this to arbitrary caught errors, folds or native transfers.
 const execution=records.filter(r=>r.fn.has(a.function)).map(r=>r.name);
 return {...a,operand:undefined,failed:uniq(failed.map(x=>JSON.stringify(x))).map(x=>JSON.parse(x)),executionTests:uniq(execution),stxer:{scenario:`simulations/verify-v6-3-${stxerArea(a.function)}.js`,status:'related scenario; current-source per-arm trace attribution pending'}};
});
for(const a of result.filter(a=>a.op==='try!')){
 const original=arms.find(x=>x.id===a.id);
 if(original.operand.children?.[0]?.atom!=='as-contract?')continue;
 for(const child of result.filter(b=>b.line>a.line&&b.endLine<=a.endLine))for(const e of child.failed)a.failed.push({...e,method:'nested try! in as-contract? propagates error'});
}
const summary={sha256,core:coverage.core,functions:functions.length,errorExits:result.length,negativeWitnesses:result.filter(a=>a.failed.length).length,withoutNegativeWitness:result.filter(a=>!a.failed.length).length,byOperator:Object.fromEntries(['asserts!','unwrap!','unwrap-err!','try!'].map(op=>[op,{total:result.filter(a=>a.op===op).length,negativeWitnesses:result.filter(a=>a.op===op&&a.failed.length).length}]))};

// Store test names once. A function executing is not a witness of every exit.
const testNames=uniq(result.flatMap(a=>[...a.executionTests,...a.failed.map(e=>e.test)])).sort();
const ids=new Map(testNames.map((name,i)=>[name,`T${i+1}`]));
const tests=Object.fromEntries(testNames.map(name=>[ids.get(name),name]));
const compact=result.map(a=>({...a,failed:a.failed.map(e=>({...e,test:ids.get(e.test)})),executionTests:a.executionTests.map(t=>ids.get(t))}));
fs.writeFileSync(`${dir}/.build/path-matrix.json`,JSON.stringify({summary,tests,arms:compact},null,2)+'\n');
const lines=[
 '# v6-3 error-exit matrix', '',
 `Market SHA-256: \`${sha256}\`.`, '',
 `Inventory: **${summary.errorExits} explicit error-exit sites**, with a conservative negative witness for **${summary.negativeWitnesses}**. **${summary.withoutNegativeWitness} have no attributed negative witness**.`, '',
 'These counts describe witness attribution, **not failing tests**.', '',
 'These are error exits (`asserts!`, `unwrap!`, `try!`), not all control-flow branches. Missing witnesses do not prove a path is reachable or untested. No site is excluded from the denominator.', '',
 'A witness is either Clarinet LCOV execution of an assertion’s error operand or an SDK trace showing that the immediate operand call returned an error in a test that checked the public/private result. Native operations, `unwrap!`, and folds are not guessed from the final error code. Private helper witnesses do not establish public reachability.', '',
 'The real core runs in this suite. Artificial selective logger failures are excluded. Stxer links identify related scenarios only: they are **not per-arm coverage evidence**. Source-matched Stxer trace attribution remains separate.', '',
 'Regenerate after a passing full suite with `node tests/unit/v6-3/path-matrix.mjs`. Full test attribution and rollback details are in `.build/path-matrix.json`.', '',
 '| Source line | Function | Exit | Negative witness | Related Stxer scenario |',
 '| ---: | --- | --- | --- | --- |',
 ...compact.map(a=>`| [${a.line}](../../../contracts/markets-sbtc-stx-jing-v6-3.clar#L${a.line}) | ${a.function} | \`${a.op}\` | ${a.failed.length?`[${a.failed[0].test}](#${a.failed[0].test.toLowerCase()})${a.failed[0].kind==='private'?' (private)':''}`:'unattributed'} | [${stxerArea(a.function)}](../../../${a.stxer.scenario}) |`),
 '', '## Witness test catalog', '',
 ...uniq(compact.flatMap(a=>a.failed.map(e=>e.test))).flatMap(id=>[`<a id="${id.toLowerCase()}"></a>**${id}**: ${tests[id]}`, '']), '',
];
fs.writeFileSync(`${dir}/PATHS.md`,lines.join('\n').trimEnd()+'\n');
console.log(JSON.stringify(summary,null,2));
