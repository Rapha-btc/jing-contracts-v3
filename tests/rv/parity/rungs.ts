// Native Rendezvous campaigns; only dependency rewrites and append-only test entrypoints.
import '../../unit/redeploy/build.mjs';
import {boot,simnet,owner,accounts,names} from '../../unit/redeploy/lab';
import {profiles,type Pair} from '../../unit/redeploy/parity/profiles';
import {Cl} from '@stacks/transactions';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {checkInvariants}=require('../../../node_modules/@stacks/rendezvous/dist/invariant.js');
const {getFunctionsFromContractInterfaces}=require('../../../node_modules/@stacks/rendezvous/dist/shared.js');
const pair=process.argv[2] as Pair,side=process.argv[3];
assert.ok(pair in profiles);assert.ok(side==='buy'||side==='sell');
const runs=Number(process.argv[4]??500),seed=20261116,p=profiles[pair],x=side==='sell';
const addresses=[...accounts.values()],market=names[p.market],ladder=`jing-ladder-${pair}-v1`;
const rungName=(s:string)=>`jing-${s}-${p.rungAsset}-10${p.suffix}`,rung=rungName(side);
const universe=[...addresses,...['buy','sell'].map(s=>`${owner}.${rungName(s)}`)];
const principal=(name:string)=>Cl.contractPrincipal(owner,names[name]??name);
const value=(v:any):any=>v.type==='ok'||v.type==='some'?value(v.value):v.type==='uint'?BigInt(v.value):v.type==='tuple'?Object.fromEntries(Object.entries(v.value).map(([k,a])=>[k,value(a)])):v.value;
const marketExtra=`
(define-constant RV-PEOPLE (list ${universe.map(a=>"'"+a).join(' ')}))
(define-private (rv-unique (who principal) (acc (list 50 principal)))
 (if (is-some (index-of? acc who)) acc (unwrap-panic (as-max-len? (append acc who) u50))))
${['x','y'].map(s=>`
(define-private (rv-live-${s} (who principal)) (> (get-token-${s}-deposit (var-get current-cycle) who) u0))
(define-read-only (rv-list-${s})
 (let ((book (get-token-${s}-depositors (var-get current-cycle))))
  (and (is-eq (len book) (len (filter rv-live-${s} RV-PEOPLE)))
       (is-eq (len book) (len (filter rv-live-${s} book)))
       (is-eq (len book) (len (fold rv-unique book (list)))))))`).join('\n')}
(define-read-only (rv-state-valid)
 (and (>= (var-get max-staleness) u40) (<= (var-get max-staleness) u80)
      (>= (var-get settle-max-staleness) u20) (<= (var-get settle-max-staleness) u40)
      (rv-list-x) (rv-list-y)))`;
const rungExtra=`
(define-map context (string-ascii 100) {called:uint})
(define-public (update-context (function-name (string-ascii 100)) (called uint)) (ok (map-set context function-name {called:called})))
(define-read-only (invariant-market) (contract-call? .${market} rv-state-valid))
(define-public (rv-set-staleness (raw uint) (settle bool))
 (if settle (contract-call? .${market} set-settle-max-staleness (mod raw u100))
            (contract-call? .${market} set-max-staleness (mod raw u100))))
(define-public (rv-oracle-refresh)
 (contract-call? .dia configure u${p.mid} 0))
(define-public (rv-trade (raw uint))
 (let ((amount (+ u1 (mod raw u${x?p.yAmount:p.xAmount}))))
  (contract-call? .${market} swap amount u${x?p.mid*2n:p.mid/2n} 0x00 .${p.x} "token" .usdcx "token" ${!x})))`;
let supplyBefore:any,failure:unknown;
const stats={checks:0,successfulCalls:{} as Record<string,number>};
const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who);
const read=(c:string,f:string,a:any[]=[])=>value(simnet.callReadOnlyFn(c,f,a,owner).result);
const ok=(r:any)=>{assert.equal(r.result.type,'ok',Cl.prettyPrint(r.result));return r;};
const supply=()=>Object.fromEntries([...simnet.getAssetsMap()].map(([asset,balances]:any)=>[asset,[...balances.values()].reduce((a:bigint,b:any)=>a+b,0n)]));
const balance=(who:string,input=true)=>{const asset=p[(input?x:!x)?'x':'y'];return asset==='asset-stx'?(simnet.getAssetsMap().get('STX')?.get(who)??0n):read(asset,'get-balance',[Cl.principal(who)]);};
const reset=async()=>{
 await boot({extensions:{[p.market]:marketExtra,[rung]:rungExtra}});
 ok(call('jing-core-v6','set-verified-contract',[principal(p.market)]));
 ok(call(p.market,'initialize',[principal(p.market),principal(p.x),principal(p.y),Cl.uint(p.xMinimum),Cl.uint(p.yMinimum),...p.feeds.map(Cl.uint)]));
 ok(call('oracle','configure-feed-ids',p.feeds.map(Cl.uint)));ok(call('oracle','set-mid',[Cl.uint(p.mid)]));
 ok(call('dia','configure',[Cl.uint(p.mid),Cl.int(0)]));
 ok(call(ladder,'set-canonical',[Cl.stringAscii(x?'sel-band':'buy-band'),principal(rung)]));
 ok(call(rung,'initialize',[Cl.uint(10),Cl.bool(true)]));
 for(const who of addresses)for(const asset of [p.x,p.y])if(asset!=='asset-stx')ok(call(asset,'mint',[Cl.uint(100000000000000n),Cl.principal(who)]));
 for(const who of addresses.slice(1,3))ok(call(rung,'deposit',[Cl.uint(x?p.xAmount:p.yAmount)],who));
 ok(call(rung,'rv-trade',[Cl.uint((x?p.yAmount:p.xAmount)/2n)],addresses[3]));ok(call(rung,'sync'));
 supplyBefore=supply();
};
await reset();
const proxy=new Proxy({}, {get(_,key){
 if(key==='deployer')return owner;
 if(key==='callPublicFn')return (c:string,fn:string,args:any[],who:string)=>{
  if(failure)throw failure;
  try{
  // Withdraw starts with sync; settle that same public state before taking
  // the independent position preview, so unindexed fills are included.
  if(fn==='withdraw')ok(call(rung,'sync',[],who));
  const claim=fn==='withdraw'?read(rung,'get-position',[Cl.principal(who)]):null,cash=claim?balance(who):0n,outputCash=claim?balance(who,false):0n;
  const operator=simnet.getDataVar(market,'operator').value;
  const r=simnet.callPublicFn(c,fn,args,who);stats.checks++;
  assert.deepEqual(supply(),supplyBefore,'no native/FT tokens created or lost');
  assert.deepEqual(simnet.callReadOnlyFn(market,'rv-state-valid',[],owner).result,Cl.bool(true),'lists and staleness bounds');
  if(fn==='rv-set-staleness'){
   if(who!==operator)assert.deepEqual(r.result,Cl.error(Cl.uint(1008)),'operator-only setter');
   else {const n=BigInt(args[0].value)%100n,settle=args[1].type==='true';if(n<(settle?20n:40n)||n>(settle?40n:80n))assert.deepEqual(r.result,Cl.error(Cl.uint(1034)),'bad staleness');}
  }
  if(r.result.type==='ok'){
   stats.successfulCalls[fn]=(stats.successfulCalls[fn]??0)+1;
   if(claim){
    assert.ok(balance(who)-cash<=claim[x?'sbtc':'stx'],'withdraw input exceeds position');
    assert.ok(balance(who,false)-outputCash<=claim[x?'stx':'sbtc']+(claim.debt??0n),'withdraw proceeds exceed position and debt');
   }
  }
  return r;
  }catch(error){if((error as any)?.code==='ERR_ASSERTION')failure=error;throw error;}
 };
 const v=simnet[key];return typeof v==='function'?v.bind(simnet):v;
}});
const target=`${owner}.${rung}`,abi=simnet.getContractsInterfaces().get(target);
assert.ok(abi);
const functions=getFunctionsFromContractInterfaces(new Map([[target,abi]]));
const radio=new EventEmitter();let failures=0,passes=0;
for(const event of ['logMessage','logInfo','logFailure'])radio.on(event,(s:string)=>{console.log(s);if(s.includes('[FAIL]')||s.includes('Runtime error'))failures++;if(s.includes('[PASS]'))passes++;});
await checkInvariants(proxy,reset,[target],functions,seed,runs,undefined,true,false,radio,accounts,addresses);
if(failure)throw failure;
assert.equal(failures,0);assert.equal(passes,runs);
console.log(`RV-RUNG-RESULT ${JSON.stringify({pair,side,seed,runs,passes,failures,...stats})}`);
