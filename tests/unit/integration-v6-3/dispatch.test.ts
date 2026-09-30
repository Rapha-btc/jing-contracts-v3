import {describe,expect,it} from 'vitest';
import {Cl,cvToString,type ClarityValue} from '@stacks/transactions';
import fs from 'node:fs';
import {U,P,owner,alice,bob,taker,token,stx,name,update,value,call,read,balance,specs} from './helpers';

const dispatch='jing-ladder-dispatch',dispatcher=`${owner}.${dispatch}`;
type Side=typeof specs[number];
const sum=(xs:bigint[])=>xs.reduce((a,b)=>a+b,0n);
const rungs=(s:Side)=>Array.from({length:10},(_,i)=>`jing-${s.label}-stx-spread-${(i+1)*10}`);
const principal=(r:string)=>r.includes('.')?r:`${owner}.${r}`;
const additional:{side:string,rung:string}[]=[];
const state=(r:string)=>read(r,'get-state');
const position=(r:string,who:string)=>read(r,'get-position',[Cl.principal(who)]);
const allocations=(rs:string[],amounts:bigint[])=>Cl.list(rs.map((r,i)=>Cl.tuple({rung:Cl.principal(principal(r)),amount:U(amounts[i])})));
function success(contract:string,fn:string,args:ClarityValue[]=[],who=owner){
 const receipt=call(contract,fn,args,who);
 expect(receipt.result.type,`${contract}.${fn}: ${cvToString(receipt.result)}`).toBe('ok');
 return value(receipt.result);
}
function wallets(who:string){return {sbtc:balance(true,who),stx:balance(false,who)};}
function noCustody(){expect(wallets(dispatcher)).toEqual({sbtc:0n,stx:0n});}
function backed(){
 const cycle=read('market','get-current-cycle');
 for(const s of specs){
  let liveTotal=0n,escrowTotal=0n;
  for(const r of [...rungs(s),...additional.filter(x=>x.side===s.side).map(x=>x.rung)]){
   const who=Cl.principal(principal(r));
   const live=read('market',`get-token-${s.side}-deposit`,[U(cycle),who]);
   const parked=read('market',`get-token-${s.side}-parked`,[who]);
   const pending=read('market',`get-token-${s.side}-pending-deposit`,[who])?.amount??0n;
   expect(read('jing-core-v6','get-token-equity',[s.x?token:stx,who])).toBe(live+parked);
   liveTotal+=live;escrowTotal+=live+parked+pending;
  }
  expect(read('market','get-cycle-totals',[U(cycle)])[`total-token-${s.side}`]).toBe(liveTotal);
  expect(balance(s.x,`${owner}.market`)).toBe(escrowTotal);
 }
 noCustody();
}
function supply(){
 return [...simnet.getAssetsMap()].map(([asset,holders])=>[asset,sum([...holders.values()])]).sort(([a],[b])=>String(a).localeCompare(String(b)));
}
function setupTwenty(){
 additional.length=0;
 success('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.market`)]);
 success('market','initialize',[Cl.principal(`${owner}.market`),token,stx,U(100),U(10000),U(1),U(45)]);
 for(const s of specs){
  const rs=rungs(s);
  success('jing-ladder-v1','set-canonical',[Cl.stringAscii(s.ladderSide),Cl.principal(principal(rs[0]))]);
  for(const [i,r] of rs.entries()){
   success(r,'initialize',[U((i+1)*10),Cl.bool(true)]);
   expect(read('jing-ladder-v1',s.x?'is-band-x':'is-band-y',[Cl.principal(principal(r))])).toBe(true);
  }
  expect(read('jing-ladder-v1','get-band-count',[Cl.stringAscii(s.ladderSide)])).toBe(10n);
 }
 for(const who of [alice,bob,taker])success('token','mint',[U(100000000),Cl.principal(who)]);
 noCustody();
 return supply();
}
function admit(s:Side){
 for(const r of rungs(s)){
  if(read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))]))
   success('market',`settle-token-${s.side}-deposit`,[Cl.principal(principal(r)),update,s.x?token:stx,name],taker);
  success(r,'sync',[],taker);
 }
 backed();
}
function sync(s:Side){for(const r of rungs(s))success(r,'sync',[],taker);}
function deposit(s:Side,who:string,amounts:bigint[],initial=false){
 const rs=rungs(s),before=wallets(who),claims=rs.map(r=>position(r,who));
 const result=success(dispatch,`deposit-${s.label}`,[U(sum(amounts)),allocations(rs,amounts)],who);
 expect(result.amount).toBe(sum(amounts));expect(result.rungs).toBe(10n);
 expect(result.positions).toHaveLength(10);
 expect(result['stx-paid']).toBe(sum(result.positions.map((p:any)=>p['stx-paid'])));
 expect(result['sbtc-paid']).toBe(sum(result.positions.map((p:any)=>p['sbtc-paid'])));
 expect(wallets(who)).toEqual({
  sbtc:before.sbtc-(s.x?sum(amounts):0n)+result['sbtc-paid'],
  stx:before.stx-(s.x?0n:sum(amounts))+result['stx-paid'],
 });
 for(const [i,p] of result.positions.entries()){
  expect(p.rung).toBe(principal(rs[i]));expect(p.amount).toBe(amounts[i]);
  expect(p.shares).toBeGreaterThan(0n);expect(p.epoch).toBe(state(rs[i]).epoch);
  expect(p[s.x?'stx-paid':'sbtc-paid']).toBe(claims[i][s.x?'stx':'sbtc']);
  if(initial){expect(p.shares).toBe(amounts[i]);expect(position(rs[i],who)[s.x?'sbtc':'stx']).toBe(amounts[i]);}
  expect(position(rs[i],dispatcher).shares).toBe(0n);
 }
 backed();return result;
}
function withdraw(s:Side,who:string,rs=rungs(s),oracle:ClarityValue=Cl.none()){
 const before=wallets(who),claims=rs.map(r=>position(r,who));
 const caps=claims.map(p=>p[s.x?'sbtc':'stx']+1n);
 const result=success(dispatch,`withdraw-${s.label}`,[allocations(rs,caps),oracle],who);
 expect(result.rungs).toBe(BigInt(rs.length));expect(result.withdrawn).toBe(BigInt(rs.length));
 expect(result.positions).toHaveLength(rs.length);
 expect(result.stx).toBe(sum(result.positions.map((p:any)=>p.stx)));
 expect(result.sbtc).toBe(sum(result.positions.map((p:any)=>p.sbtc)));
 expect(wallets(who)).toEqual({sbtc:before.sbtc+result.sbtc,stx:before.stx+result.stx});
 for(const [i,p] of result.positions.entries()){
  expect(p).toEqual({rung:principal(rs[i]),stx:claims[i].stx,sbtc:claims[i].sbtc});
  expect(position(rs[i],who).shares).toBe(0n);
 }
 backed();
}
function sweep(s:Side,members=1n){
 const before=rungs(s).map(r=>state(r).resting);
 // Weighted allocations are 1,2,...10 units. This input consumes the first
 // five rungs (15 units) and part of rung six at the actual spread prices.
 success('market','swap',[U((s.x?18000000n:180000n)*members),U(s.x?P*2n:P/2n),update,token,name,stx,name,Cl.bool(!s.x)],taker);
 sync(s);
 for(const [i,r] of rungs(s).entries()){
  const rest=state(r).resting;
  if(i<5){expect(rest).toBe(0n);expect(state(r).epoch).toBe(1n);}
  else if(i===5){expect(rest).toBeGreaterThan(0n);expect(rest).toBeLessThan(before[i]);}
  else expect(rest).toBe(before[i]);
 }
 backed();
}
function drained(s:Side){
 for(const r of rungs(s)){
  expect(wallets(principal(r))).toEqual({sbtc:0n,stx:0n});
  expect(state(r).members).toBe(0n);expect(state(r)['total-shares']).toBe(0n);
  expect(state(r).resting).toBe(0n);
  expect(read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))])).toBe(null);
  expect(read('jing-core-v6','get-token-equity',[s.x?token:stx,Cl.principal(principal(r))])).toBe(0n);
 }
}
const weighted=(s:Side)=>Array.from({length:10},(_,i)=>s.amount*BigInt(i+1));
function snapshot(s:Side,who=alice){
 const rs=rungs(s);
 return {wallet:wallets(who),market:wallets(`${owner}.market`),states:rs.map(state),
  claims:rs.map(r=>position(r,who)),cash:rs.map(r=>wallets(principal(r))),
  pending:rs.map(r=>read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))]))};
}
function refused(s:Side,rs:string[],amounts:bigint[],code:number,who=alice){
 const before=snapshot(s,who);
 const receipt=call(dispatch,`withdraw-${s.label}`,[allocations(rs,amounts),Cl.none()],who);
 expect(receipt.result).toEqual(Cl.error(U(code)));expect(receipt.events).toEqual([]);
 expect(snapshot(s,who)).toEqual(before);backed();
}

describe('real dispatch with ten buy and ten sell core-spread v1 rungs',()=>{
 for(const s of specs)it(`${s.label}: oversized tenth-leg full-exit request succeeds and preserves the other member`,()=>{
  const originalSupply=setupTwenty(),amounts=weighted(s),rs=rungs(s);
  const beforeAlice=wallets(alice),beforeBob=wallets(bob);
  deposit(s,alice,amounts,true);admit(s);
  deposit(s,bob,amounts);admit(s);
  const bobClaims=rs.map(r=>position(r,bob));
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  const caps=[...amounts];caps[9]=(1n<<128n)-1n;
  const result=success(dispatch,`withdraw-${s.label}`,[allocations(rs,caps),Cl.none()],alice);
  expect(result.withdrawn).toBe(10n);
  expect(result.positions).toHaveLength(10);
  expect(result.sbtc).toBe(s.x?sum(amounts):0n);
  expect(result.stx).toBe(s.x?0n:sum(amounts));
  expect(wallets(alice)).toEqual(beforeAlice);
  for(const r of rs)expect(position(r,alice).shares).toBe(0n);
  expect(rs.map(r=>position(r,bob))).toEqual(bobClaims);
  backed();
  withdraw(s,bob);drained(s);
  expect(wallets(bob)).toEqual(beforeBob);
  expect(supply()).toEqual(originalSupply);
 },120000);

 for(const s of specs)it(`${s.label}: weighted batch, five fills and a partial fill, proceeds-paying batch top-up, paused ten-rung exit`,()=>{
  const originalSupply=setupTwenty(),amounts=weighted(s),other=specs.find(x=>x.x!==s.x)!;
  deposit(s,alice,amounts,true);admit(s);
  for(const r of rungs(other))expect(state(r)['total-shares']).toBe(0n);
  sweep(s);
  const paid=deposit(s,alice,Array(10).fill(s.amount));
  expect(paid[s.x?'stx-paid':'sbtc-paid']).toBeGreaterThan(0n);
  admit(s);
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  withdraw(s,alice);drained(s);
  expect(balance(s.x,`${owner}.market`)).toBe(0n);expect(supply()).toEqual(originalSupply);
 },120000);

 it('both sides: two members fund all twenty rungs, keeper settlement, both book walks, batch top-ups and independent exits',()=>{
  const originalSupply=setupTwenty();
  for(const s of specs){deposit(s,alice,weighted(s),true);admit(s);deposit(s,bob,weighted(s),true);admit(s);}
  const book=specs.flatMap(s=>rungs(s).map(r=>state(r).resting)),cycle=read('market','get-current-cycle');
  // Positive spreads do not cross each other at the same oracle mid. A
  // keeper must not trade them against each other or advance their cycle.
  const noMatch=call('market','settle-with-refresh',[update,token,name,stx,name],taker);
  expect(noMatch.result).toEqual(Cl.error(U(1009)));expect(noMatch.events).toEqual([]);
  expect(read('market','get-current-cycle')).toBe(cycle);
  for(const s of specs)sync(s);
  expect(specs.flatMap(s=>rungs(s).map(r=>state(r).resting))).toEqual(book);
  for(const s of specs)sweep(s,2n);
  for(const s of specs){
   for(const who of [alice,bob]){
    expect(deposit(s,who,Array(10).fill(s.amount))[s.x?'stx-paid':'sbtc-paid']).toBeGreaterThan(0n);
    admit(s);
   }
  }
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  for(const s of specs){
   const bobsClaims=rungs(s).map(r=>position(r,bob));
   withdraw(s,alice);
   for(const [i,r] of rungs(s).entries()){
    const p=position(r,bob),cash=wallets(principal(r));
    expect(p.shares).toBe(bobsClaims[i].shares);
    expect(p[s.x?'sbtc':'stx']).toBe(cash[s.x?'sbtc':'stx']+state(r).resting);
    expect(p[s.x?'stx':'sbtc']).toBe(cash[s.x?'stx':'sbtc']);
   }
   withdraw(s,bob);drained(s);
  }
  expect(wallets(`${owner}.market`)).toEqual({sbtc:0n,stx:0n});expect(supply()).toEqual(originalSupply);
 },120000);

 for(const s of specs)it(`${s.label}: a tenth-leg deposit refusal rolls back all nine earlier deposits`,()=>{
  setupTwenty();const rs=rungs(s),before=wallets(alice),states=rs.map(state);
  const amounts=weighted(s);amounts[9]=1n; // Positive for dispatch, below the real rung's minimum.
  const receipt=call(dispatch,`deposit-${s.label}`,[U(sum(amounts)),allocations(rs,amounts)],alice);
  expect(receipt.result).toEqual(Cl.error(U(7005)));expect(receipt.events).toEqual([]);
  expect(wallets(alice)).toEqual(before);expect(rs.map(state)).toEqual(states);
  for(const r of rs){expect(position(r,alice).shares).toBe(0n);expect(wallets(principal(r))).toEqual({sbtc:0n,stx:0n});}
  expect(wallets(`${owner}.market`)).toEqual({sbtc:0n,stx:0n});noCustody();
 },120000);

 for(const s of specs)it(`${s.label}: a tenth-leg missing position rolls back nine earlier withdrawals`,()=>{
  setupTwenty();const rs=rungs(s),amounts=weighted(s);
  // Fund only nine registered rungs; the tenth must reject at execution time.
  success(dispatch,`deposit-${s.label}`,[U(sum(amounts.slice(0,9))),allocations(rs.slice(0,9),amounts.slice(0,9))],alice);admit(s);
  const before=wallets(alice),market=wallets(`${owner}.market`),states=rs.map(state),claims=rs.map(r=>position(r,alice));
  const receipt=call(dispatch,`withdraw-${s.label}`,[allocations(rs,amounts),Cl.none()],alice);
  expect(receipt.result).toEqual(Cl.error(U(7006)));expect(receipt.events).toEqual([]);
  expect(wallets(alice)).toEqual(before);expect(wallets(`${owner}.market`)).toEqual(market);
  expect(rs.map(state)).toEqual(states);expect(rs.map(r=>position(r,alice))).toEqual(claims);noCustody();
  withdraw(s,alice,rs.slice(0,9));drained(s);
 },120000);
});

describe('dispatch exits using only buy/sell core-spread v1',()=>{
 for(const s of specs)it(`${s.label}: no top-up; withdraw unclaimed sold-out rungs, claim others directly, reject an already-removed position atomically`,()=>{
  const originalSupply=setupTwenty(),rs=rungs(s);
  deposit(s,alice,weighted(s),true);admit(s);deposit(s,bob,weighted(s),true);admit(s);
  sweep(s,2n);
  const beforeClaims=rs.map(r=>position(r,bob));
  for(const r of rs.slice(0,5)){
   // The market can refund sub-minimum input dust when the rung closes.
   // That reserve belongs to the old members and must be paid as well.
   const mine=position(r,alice)[s.x?'sbtc':'stx'],theirs=position(r,bob)[s.x?'sbtc':'stx'];
   const reserved=value(simnet.getDataVar(r,s.x?'reserved-sats':'reserved-ustx'));
   expect(mine).toBeLessThan(s.x?10n:10000n);
   expect(mine+theirs).toBeLessThanOrEqual(reserved);
   expect(reserved-mine-theirs).toBeLessThanOrEqual(1n);
   expect(position(r,alice)[s.x?'stx':'sbtc']).toBeGreaterThan(0n);
  }
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  // No top-up: all ten positions, including five closed epochs, pay normally.
  withdraw(s,alice);
  for(const [i,r] of rs.entries()){
   const p=position(r,bob),cash=wallets(principal(r));
   expect(p.shares).toBe(beforeClaims[i].shares);
   expect(p[s.x?'sbtc':'stx']).toBe(cash[s.x?'sbtc':'stx']+state(r).resting);
   expect(p[s.x?'stx':'sbtc']).toBe(cash[s.x?'stx':'sbtc']);
  }
  for(const r of rs.slice(0,5)){
   const owed=position(r,bob),before=wallets(bob);
   const paid=success(r,'claim',[],bob);
   expect(paid).toEqual({stx:owed.stx,sbtc:owed.sbtc});
   expect(wallets(bob)).toEqual({stx:before.stx+paid.stx,sbtc:before.sbtc+paid.sbtc});
   expect(position(r,bob).shares).toBe(0n);
   const again=call(r,'claim',[],bob);
   expect(again.result).toEqual(Cl.error(U(7006)));expect(again.events).toEqual([]);
   expect(wallets(bob)).toEqual({stx:before.stx+paid.stx,sbtc:before.sbtc+paid.sbtc});
  }
  // Five valid withdrawals precede a removed position: all must roll back.
  const mixed=[...rs.slice(5),rs[0]];
  refused(s,mixed,mixed.map(r=>position(r,bob)[s.x?'sbtc':'stx']+1n),7006,bob);
  withdraw(s,bob,rs.slice(5));drained(s);expect(supply()).toEqual(originalSupply);
 },120000);

 for(const s of specs)it(`${s.label}: post-trade batch exits retired and replaced rungs while replacement funds stay separate`,()=>{
  const originalSupply=setupTwenty(),rs=rungs(s);
  deposit(s,alice,weighted(s),true);admit(s);sweep(s);
  const oldClaims=rs.map(r=>position(r,alice)),oldCash=rs.map(r=>wallets(principal(r)));
  success('jing-ladder-v1','retire-band',[Cl.stringAscii(s.ladderSide),U(60)]);
  // Same generated source bytes, same spread/name, different deploying account.
  const source=fs.readFileSync(`tests/unit/integration-v6-3/.build/jing-${s.label}-stx-core-spread-v1.clar`,'utf8');
  expect(simnet.deployContract(rs[6],source,{clarityVersion:5},bob).result).toEqual(Cl.bool(true));
  const replacement=`${bob}.${rs[6]}`;additional.push({side:s.side,rung:replacement});
  success(replacement,'initialize',[U(70),Cl.bool(true)]);
  expect(read('jing-ladder-v1','get-band-count',[Cl.stringAscii(s.ladderSide)])).toBe(9n);
  for(const old of [rs[5],rs[6]]){
   expect(read('jing-ladder-v1','is-registered',[Cl.principal(principal(old))])).toBe(true);
   expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(principal(old))])).toBe(false);
   const before=snapshot(s);
   const receipt=call(dispatch,`deposit-${s.label}`,[U(s.amount*2n),allocations([rs[9],old],[s.amount,s.amount])],alice);
   expect(receipt.result).toEqual(Cl.error(U(7104)));expect(receipt.events).toEqual([]);
   expect(snapshot(s)).toEqual(before);
  }
  expect(rs.map(r=>position(r,alice))).toEqual(oldClaims);expect(rs.map(r=>wallets(principal(r)))).toEqual(oldCash);
  const bobsWallet=wallets(bob);
  success(dispatch,`deposit-${s.label}`,[U(s.amount),allocations([replacement],[s.amount])],bob);
  expect(position(replacement,bob)[s.x?'sbtc':'stx']).toBe(s.amount);
  const replacementClaim=position(replacement,bob);
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  withdraw(s,alice);drained(s);
  expect(position(replacement,bob)).toEqual(replacementClaim);
  withdraw(s,bob,[replacement]);expect(wallets(bob)).toEqual(bobsWallet);
  expect(balance(s.x,`${owner}.market`)).toBe(0n);expect(supply()).toEqual(originalSupply);
 },120000);

 for(const s of specs)it(`${s.label}: unrelated young pending top-ups do not block partial or full batch exits without an oracle`,()=>{
  const originalSupply=setupTwenty(),rs=rungs(s),other=specs.find(x=>x.x!==s.x)!,amounts=weighted(s);
  const originalAlice=wallets(alice),originalBob=wallets(bob);
  deposit(s,alice,amounts,true);admit(s);
  deposit(other,bob,weighted(other),true);admit(other);
  deposit(s,bob,amounts,true); // Intentionally do not admit: Bob's top-ups are young pending escrow.
  const pendings=rs.map(r=>read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))]));
  for(const [i,p] of pendings.entries())expect(p.amount).toBe(amounts[i]);
  const bobsClaims=rs.map(r=>position(r,bob));
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  const before=wallets(alice),half=amounts.map(n=>n/2n);
  const result=success(dispatch,`withdraw-${s.label}`,[allocations(rs,half),Cl.none()],alice);
  expect(result[s.x?'sbtc':'stx']).toBe(sum(half));expect(result[s.x?'stx':'sbtc']).toBe(0n);
  expect(balance(s.x,alice)).toBe(before[s.x?'sbtc':'stx']+sum(half));
  expect(rs.map(r=>read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))]))).toEqual(pendings);
  expect(rs.map(r=>position(r,bob))).toEqual(bobsClaims);backed();
  withdraw(s,alice);expect(wallets(alice)).toEqual(originalAlice);
  expect(rs.map(r=>position(r,bob))).toEqual(bobsClaims);
  withdraw(s,bob);withdraw(other,bob);drained(s);drained(other);
  expect(wallets(bob)).toEqual(originalBob);expect(supply()).toEqual(originalSupply);
 },120000);

 for(const s of specs)for(const recovery of ['update','timeout'] as const)it(`${s.label}: tenth-leg young escrow rolls back the batch; ${recovery} recovers all funds`,()=>{
  const originalSupply=setupTwenty(),rs=rungs(s),other=specs.find(x=>x.x!==s.x)!,amounts=weighted(s),before=wallets(alice);
  success(dispatch,`deposit-${s.label}`,[U(sum(amounts.slice(0,9))),allocations(rs.slice(0,9),amounts.slice(0,9))],alice);admit(s);
  deposit(other,bob,weighted(other),true);admit(other);
  success(dispatch,`deposit-${s.label}`,[U(amounts[9]),allocations([rs[9]],[amounts[9]])],alice);
  expect(read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(rs[9]))]).amount).toBe(amounts[9]);
  const otherClaims=rungs(other).map(r=>position(r,bob));
  refused(s,rs,amounts,7012);
  if(recovery==='timeout'){
   simnet.mineEmptyBurnBlocks(145);
   success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  }
  withdraw(s,alice,rs,recovery==='update'?Cl.some(update):Cl.none());
  expect(wallets(alice)).toEqual(before);expect(rungs(other).map(r=>position(r,bob))).toEqual(otherClaims);
  withdraw(other,bob);drained(s);drained(other);expect(supply()).toEqual(originalSupply);
 },120000);
});
