import {describe,expect,it} from 'vitest';
import {Cl,cvToString,type ClarityValue} from '@stacks/transactions';
import {U,P,owner,alice,bob,taker,token,stx,name,update,value,call,read,balance,specs} from './helpers';

const dispatch='jing-ladder-dispatch',dispatcher=`${owner}.${dispatch}`;
type Side=typeof specs[number];
const sum=(xs:bigint[])=>xs.reduce((a,b)=>a+b,0n);
const rungs=(s:Side)=>Array.from({length:10},(_,i)=>`jing-${s.label}-stx-spread-${(i+1)*10}`);
const principal=(r:string)=>`${owner}.${r}`;
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
  for(const r of rungs(s)){
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
function withdraw(s:Side,who:string,rs=rungs(s)){
 const before=wallets(who),claims=rs.map(r=>position(r,who));
 const caps=claims.map(p=>p[s.x?'sbtc':'stx']+1n);
 const result=success(dispatch,`withdraw-${s.label}`,[allocations(rs,caps),Cl.none()],who);
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
  expect(state(r).members).toBe(0n);expect(state(r)['total-shares']).toBe(0n);
  expect(state(r).resting).toBe(0n);
  expect(read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(principal(r))])).toBe(null);
  expect(read('jing-core-v6','get-token-equity',[s.x?token:stx,Cl.principal(principal(r))])).toBe(0n);
 }
}
const weighted=(s:Side)=>Array.from({length:10},(_,i)=>s.amount*BigInt(i+1));

describe('real dispatch with ten buy and ten sell core-spread v1 rungs',()=>{
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
   expect(rungs(s).map(r=>position(r,bob))).toEqual(bobsClaims);
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
