// Re-run historical scenarios against CURRENT source. Only test references and
// call arities are migrated. Historical expectations deliberately remain intact:
// failures require classification; this is not a green current-behavior suite.
import fs from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
const jobs = [
 ...['buy','sell','buy-peg','sell-peg'].map(r => ['verify-v6-rungs-keyless.js', { RUNG:r }, r]),
 ...['fill-lazer','push-lazer','miner-band-lazer','replace-keyless'].map(n => [`verify-v6-rungs-${n}.js`, {}, n]),
 ['verify-v6-3-deploy-bytes.js', {}, 'deploy-bytes'],
 ['verify-swap-router-v3-lazer.js', {V6:'1'}, 'router'],
];
const helper = `
import { noneCV as impactNone, someCV as impactSome } from '@stacks/transactions';
const impactCall = SimulationBuilder.prototype.addContractCall;
SimulationBuilder.prototype.addContractCall = function(p) {
 const a = [...p.function_args], f = p.function_name;
 if (p.contract_id.endsWith('.markets-sbtc-stx-jing-v6-3')) {
  if (/^deposit-token-[xy]$/.test(f) && a.length === 6) a.splice(3,1);
  if (/^set-token-[xy]-limit$/.test(f) && a.length === 3) a.pop();
  if (/^readmit-token-[xy]$/.test(f) && a.length === 4) a.splice(1,1);
 } else if (/\\.jing-(buy|sell)-stx/.test(p.contract_id)) {
  if (f==='deposit') a.splice(1);
  if (f==='push' || f==='refresh-guard') a.splice(0);
  if (f==='withdraw' && a.length===1) a.push(impactNone());
 }
 return impactCall.call(this,{...p,function_args:a});
};
`;
fs.mkdirSync('/tmp/v6-3-callers', {recursive:true});
const results=[];
for (const [file,env,jobName] of jobs) {
 if(process.argv[2] && process.argv[2]!==jobName) continue;
 const name=jobName+(process.env.IMPACT_MARKET_REF ? '-'+process.env.IMPACT_MARKET_REF : '');
 let s=fs.readFileSync(`simulations/${file}`,'utf8')
  .replace(/markets-sbtc-stx-jing-v6(?![-\w])/g,'markets-sbtc-stx-jing-v6-3')
  .replace(/jing-core-v5/g,'jing-core-v6')
  .replace(/jing-ladder(?![-\w])/g,'jing-ladder-v1')
  .replace(/swap-router-sbtc-stx-jing-v5(?![-\w])/g,'swap-router-sbtc-stx-jing-v5-3')
  .replace(/fetchLazerUpdate(?=\s*[,}])/g,'fetchLazerUpdateAny as fetchLazerUpdate')
  .replace(/SimulationBuilder.new\(\)/g,'SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" })');
 if(jobName==='router') {
  const start=s.indexOf('async function fetchLazerUpdate()'); const end=s.indexOf('\nconst routerSrc',start);
  s=s.slice(0,start)+'import { fetchLazerUpdateAny as fetchLazerUpdate } from "./_lazer.js";\n'+s.slice(end);
 }
 if(jobName==='deploy-bytes') {
  s=s.replace(/const tpl = .*?;\n/, 'const tpl = (f) => fs.readFileSync(`contracts/${f}.clar`, "utf8");\n');
  s=s.replace('for (const n of [LADDER, MARKET, ROUTER])','src["jing-core-v6"] = tpl("jing-core-v6");\n  for (const n of ["jing-core-v6", LADDER, MARKET, ROUTER])');
 }
 if(process.env.IMPACT_MARKET_REF) {
  const baseline=execFileSync('git',['show',`${process.env.IMPACT_MARKET_REF}:contracts/markets-sbtc-stx-jing-v6-3.clar`],{encoding:'utf8'});
  s=`const impactRead=fs.readFileSync.bind(fs);
fs.readFileSync=(p,...a)=>String(p).endsWith('/markets-sbtc-stx-jing-v6-3.clar') ? ${JSON.stringify(baseline)} : impactRead(p,...a);
`+s;
 }
 s=helper+'\n'+s;
 const tmp=`simulations/.impact-${name}.mjs`;
 fs.writeFileSync(tmp,s); const fd=fs.openSync(`/tmp/v6-3-callers/${name}.log`,'w');
 console.log(`Running ${name}`);
 try { const r=spawnSync(process.execPath,[tmp],{env:{...process.env,...env},stdio:['ignore',fd,fd],timeout:240000});
 results.push({name,exit:r.status,error:r.error?.message,log:`/tmp/v6-3-callers/${name}.log`});
 } finally { fs.closeSync(fd);fs.unlinkSync(tmp); }
 console.log(JSON.stringify(results.at(-1)));
 fs.writeFileSync('/tmp/v6-3-callers/summary.json',JSON.stringify(results,null,2));
}

if (results.some(r => r.exit !== 0)) process.exitCode = 1;
