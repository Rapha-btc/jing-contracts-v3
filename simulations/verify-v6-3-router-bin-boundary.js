// Replay the exact pre-index-242 fork state, replace ONLY the router code with
// the current working-tree bytes, and repeat the failing public transaction.
// Boundary accumulator checks use real pool balances; no storage is patched.
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {createSimulationSession,getSimulationResult,submitSimulationSteps,callContract} from 'stxer';
import {uintCV,noneCV,cvToString,deserializeCV} from '@stacks/transactions';
const ORIGINAL='1ac1ad538ad102792f868d918b1c4fd9';
const DEP='SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const ROUTER=`${DEP}.swap-router-sbtc-stx-jing-v5-3`;
const USER='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
let sid,checks=0,passed=0;
function check(label,actual,want){checks++;const good=typeof want==='function'?want(actual):actual===want;if(good)passed++;console.log(`${good?'ok  ':'FAIL'} ${checks}. ${label}: ${actual}`);if(!good)throw new Error(`${passed}/${checks} checks green; https://stxer.xyz/simulations/mainnet/${sid}`);}
async function ev(label,code,want){const r=await submitSimulationSteps(sid,{steps:[{Eval:[DEP,'',ROUTER,code]}]});const value=r.steps[0].Eval?.Ok?cvToString(deserializeCV(r.steps[0].Eval.Ok)):JSON.stringify(r.steps[0]);check(label,value,want);return value;}
const wallet=`{stx:(stx-get-balance '${USER}),sbtc:(contract-call? SBTC get-balance '${USER})}`;
async function main(){
 const original=await getSimulationResult(ORIGINAL);
 check('original index 242 fails at bin walk',original.steps[242].Result.Transaction.Ok.vm_error,v=>v.includes('UnwrapFailure')&&v.includes('dlmm-bin-step'));
 sid=await createSimulationSession({block_height:original.metadata.block_height,block_hash:original.metadata.block_hash});
 console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
 // Transaction nonces and signed oracle bytes are replayed at the same block.
 for(let i=0;i<242;i+=40){
  const prior=original.steps.slice(i,Math.min(i+40,242));
  const steps=prior.map(s=>s.Transaction?{Transaction:s.Transaction}:s.Eval?{Eval:s.Eval}:(()=>{throw new Error(`Unsupported original step ${i}`)})());
  const result=await submitSimulationSteps(sid,{steps});
  // stxer 'costs' is server processing metadata; compare receipts and VM state
  // effects, excluding that nondeterministic counter.
  const stable=r=>JSON.stringify(r,(key,value)=>key==='costs'?undefined:value);
  check(`exact replay ${i}..${i+steps.length-1}`,result.steps.every((r,j)=>isDeepStrictEqual(JSON.parse(stable(r)),JSON.parse(stable(prior[j].Result)))),true);
 }
 const patched=await submitSimulationSteps(sid,{steps:[{SetContractCode:[ROUTER,fs.readFileSync(new URL('../contracts/swap-router-sbtc-stx-jing-v5-3.clar',import.meta.url),'utf8'),5]}]});
 check('install amended router in fork',JSON.stringify(patched.steps[0]),v=>!v.includes('"Err"'));
 await ev('exact boundary state','(get active-bin-id (unwrap-panic (contract-call? DLMM_POOL get-pool)))','500');
 const before=await ev('wallet before reported call',wallet,v=>v.startsWith('(tuple'));
 const args=[uintCV(1000),uintCV(20000000000000n),noneCV(),uintCV(27000000000000n),uintCV(1)];
 const tx=await callContract(sid,{sender:USER,contract:ROUTER,functionName:'smart-swap-sbtc-for-stx',functionArgs:args,fee:0});
 check('reported public call has no VM error',tx.vmError,null);
 check('reported public call fills at the edge',tx.result,'(ok (tuple (dlmm-in u1000) (dlmm-out u2398110) (jing-in u0) (jing-ok false) (jing-out u0) (out u2398110) (unsold u0) (velar-in u0) (velar-out u0) (xyk-in u0) (xyk-out u0)))');
 const sbtc=BigInt(before.match(/sbtc \(ok u(\d+)/)[1]),stx=BigInt(before.match(/stx u(\d+)/)[1]);
 const after=await ev('successful edge fill exact wallet deltas',wallet,`(tuple (sbtc (ok u${sbtc-1000n})) (stx u${stx+2398110n}))`);
 const refused=await callContract(sid,{sender:USER,contract:ROUTER,functionName:'smart-swap-sbtc-for-stx',functionArgs:[...args.slice(0,4),uintCV(999999999999999n)],fee:0});
 check('impossible min-out has no VM error',refused.vmError,null);
 check('impossible min-out returns normal error',refused.result,'(err u3002)');
 await ev('min-out rollback preserves exact wallet',wallet,after);
 check('min-out refusal has no committed events',refused.receipt.events.length,0);
 for(const up of [true,false]){
  const edge=up?500:-500,near=up?499:-499,threshold=up?'u999999999999999999':'u0';
  const acc=b=>`{bin:${b},up:${up},threshold:${threshold},initial-price:(get initial-price p),bin-step:(get bin-step p),fee:u50,cap:u7,done:false}`;
  const contribution=b=>`(let ((price (unwrap-panic (contract-call? DLMM_CORE get-bin-price (get initial-price p) (get bin-step p) ${b}))) (bal (unwrap-panic (contract-call? DLMM_POOL get-bin-balances (to-uint (+ ${b} 500))))))
    (/ (* ${up?'(/ (+ (* (get x-balance bal) price) u99999999) u100000000)':'(/ (+ (* (get y-balance bal) u100000000) (- price u1)) price)'} u10000) u9950))`;
  await ev(`${edge}: include edge exactly once, retain bin, mark done`,`(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool))) (a ${acc(edge)}) (r (dlmm-bin-step u0 a)))
    (and (is-eq (get bin r) ${edge}) (get done r) (is-eq (get cap r) (+ u7 ${contribution(edge)})) (is-eq (dlmm-bin-step u1 r) r)))`,'true');
  await ev(`${near}: ordinary step advances to edge, next step stops`,`(let ((p (unwrap-panic (contract-call? DLMM_POOL get-pool))) (a ${acc(near)}) (r (dlmm-bin-step u0 a)) (end (fold dlmm-bin-step DLMM_WALK_BINS r)))
    (and (is-eq (get bin r) ${edge}) (not (get done r)) (is-eq (get bin end) ${edge}) (get done end)
      (is-eq (get cap end) (+ u7 ${contribution(near)} ${contribution(edge)}))))`,'true');
 }
 console.log(`${passed}/${checks} checks green`);
 fs.writeFileSync('simulations/fixtures/router-v5-3-bin-boundary-fixed.json',JSON.stringify({simulation:`https://stxer.xyz/simulations/mainnet/${sid}`,original:ORIGINAL,checks,passed,result:tx.result,vmError:tx.vmError},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
