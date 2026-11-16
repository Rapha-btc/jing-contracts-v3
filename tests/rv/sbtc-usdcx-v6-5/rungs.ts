// Native RV against both current rung templates and signed-Lazer funded setup.
import {boot,Cl,DEP,M,wallet} from '../../f01-fix/lab';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {checkInvariants}=require('../../../node_modules/@stacks/rendezvous/dist/invariant.js');
const {getFunctionsFromContractInterfaces}=require('../../../node_modules/@stacks/rendezvous/dist/shared.js');
const addresses=[DEP,...Array.from({length:8},(_,i)=>wallet(i+1))];
const universe=[...addresses,`${DEP}.jing-buy-sbtc-10-v2`,`${DEP}.jing-sell-sbtc-10-v2`];
const marketExtra=`
(define-constant RV-PEOPLE (list ${universe.map(a=>"'"+a).join(' ')}))
(define-private (rv-unique (who principal) (acc (list 50 principal)))
 (if (is-some (index-of? acc who)) acc (unwrap-panic (as-max-len? (append acc who) u50))))
${['x','y'].map(side=>`
(define-private (rv-live-${side} (who principal)) (> (get-token-${side}-deposit (var-get current-cycle) who) u0))
(define-read-only (rv-list-${side})
 (let ((book (get-token-${side}-depositors (var-get current-cycle))))
  (and (is-eq (len book) (len (filter rv-live-${side} RV-PEOPLE)))
       (is-eq (len book) (len (filter rv-live-${side} book)))
       (is-eq (len book) (len (fold rv-unique book (list)))))))`).join('\n')}
(define-read-only (rv-state-valid)
 (and (>= (var-get max-staleness) u40) (<= (var-get max-staleness) u80)
      (>= (var-get settle-max-staleness) u20) (<= (var-get settle-max-staleness) u40)
      (rv-list-x) (rv-list-y)))`;
const rungExtra=()=>`
(define-map context (string-ascii 100) {called:uint})
(define-public (update-context (function-name (string-ascii 100)) (called uint)) (ok (map-set context function-name {called:called})))
(define-read-only (invariant-market) (contract-call? .${M} rv-state-valid))
(define-public (rv-set-staleness (raw uint) (settle bool))
 (if settle (contract-call? .${M} set-settle-max-staleness (mod raw u100))
            (contract-call? .${M} set-max-staleness (mod raw u100))))`;
for(const side of ['buy','sell'] as const){
 let b:any;
 const reset=async()=>{
  b=await boot({marketExtra,rungExtra});
  for(const who of addresses)b.fund(who);
  const rung=`jing-${side}-sbtc-10-v2`;
  b.ok(b.call(rung,'deposit',[Cl.uint(side==='buy'?100000000n:100000n)],addresses[1]));
  b.ok(b.swap(side,addresses[2]));b.ok(b.call(rung,'sync'));
 };
 await reset();
 const stats={checks:0};
 const proxy=new Proxy({}, {get(_,key){
  if(key==='deployer')return DEP;
  if(key==='callPublicFn')return (...args:any[])=>{
   const r=b.s.callPublicFn(...args);stats.checks++;
   assert.deepEqual(b.read(M,'rv-state-valid').result,Cl.bool(true),'market list/bounds invariant');return r;
  };
  const v=b.s[key];return typeof v==='function'?v.bind(b.s):v;
 }});
 const target=`${DEP}.jing-${side}-sbtc-10-v2`;
 // Empty sessions use a different default deployer; collect the target ABI directly.
 const abi=b.s.getContractsInterfaces().get(target);
 assert.ok(abi,'rung ABI');
 const functions=getFunctionsFromContractInterfaces(new Map([[target,abi]]));
 const radio=new EventEmitter();let failures=0,passes=0;
 for(const event of ['logMessage','logInfo','logFailure'])radio.on(event,(s:string)=>{
  console.log(s);if(s.includes('[FAIL]')||s.includes('Runtime error'))failures++;
  if(s.includes('[PASS]'))passes++;
 });
 const eligible=new Map(addresses.map((a,i)=>[`wallet_${i}`,a]));
 await checkInvariants(proxy,reset,[target],functions,20261116,500,undefined,true,false,radio,eligible,addresses);
 assert.equal(failures,0);assert.equal(passes,500);
 console.log(`RV-RUNG-RESULT ${JSON.stringify({side,runs:500,passes,failures,...stats})}`);
}
