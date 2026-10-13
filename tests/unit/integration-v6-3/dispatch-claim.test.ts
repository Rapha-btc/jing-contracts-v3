import {describe,expect,it} from 'vitest';
import {Cl,cvToString,type ClarityValue} from '@stacks/transactions';
import {U,P,owner,alice,bob,taker,token,stx,name,update,value,call,read,balance,specs} from './helpers';

// claim-buy / claim-sell on ten real core-spread v1 rungs per side. The batch
// pays proceeds (and an old epoch's reserved input) straight to tx-sender,
// keeps every current-epoch position and resting order, and rolls back as a
// whole when one rung refuses. Guards are in dispatch-guards.test.ts.
const dispatch='jing-ladder-dispatch',dispatcher=`${owner}.${dispatch}`;
type Side=typeof specs[number];
const sum=(xs:bigint[])=>xs.reduce((a,b)=>a+b,0n);
const rungs=(s:Side)=>Array.from({length:10},(_,i)=>`jing-${s.label}-stx-spread-${(i+1)*10}`);
const pc=(r:string)=>r.includes('.')?r:`${owner}.${r}`;
const state=(r:string)=>read(r,'get-state');
const position=(r:string,who=alice)=>read(r,'get-position',[Cl.principal(who)]);
const entry=(r:string,who=alice)=>{try{return simnet.getMapEntry(r,'positions',Cl.principal(who));}catch{return Cl.none();}};
const targets=(rs:string[])=>Cl.list(rs.map(r=>Cl.principal(pc(r))));
const allocations=(rs:string[],amounts:bigint[])=>Cl.list(rs.map((r,i)=>Cl.tuple({rung:Cl.principal(pc(r)),amount:U(amounts[i])})));
const weighted=(s:Side)=>Array.from({length:10},(_,i)=>s.amount*BigInt(i+1));
const wallets=(who:string)=>({sbtc:balance(true,who),stx:balance(false,who)});
function success(contract:string,fn:string,args:ClarityValue[]=[],who=owner){
 const receipt=call(contract,fn,args,who);
 expect(receipt.result.type,`${contract}.${fn}: ${cvToString(receipt.result)}`).toBe('ok');
 return value(receipt.result);
}
function supply(){
 return [...simnet.getAssetsMap()].map(([asset,holders])=>[asset,sum([...holders.values()])]).sort(([a],[b])=>String(a).localeCompare(String(b)));
}
function setup(s:Side){
 success('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.market`)]);
 success('market','initialize',[Cl.principal(`${owner}.market`),token,stx,U(100),U(10000),U(1),U(45)]);
 const rs=rungs(s);
 success('jing-ladder-v1','set-canonical',[Cl.stringAscii(s.ladderSide),Cl.principal(pc(rs[0]))]);
 for(const [i,r] of rs.entries())success(r,'initialize',[U((i+1)*10),Cl.bool(true)]);
 for(const who of [alice,bob,taker])success('token','mint',[U(100000000),Cl.principal(who)]);
 return rs;
}
function admit(s:Side,rs:string[]){
 for(const r of rs){
  if(read('market',`get-token-${s.side}-pending-deposit`,[Cl.principal(pc(r))]))
   success('market',`settle-token-${s.side}-deposit`,[Cl.principal(pc(r)),update,s.x?token:stx,name],taker);
  success(r,'sync',[],taker);
 }
}
function fund(s:Side,rs:string[],who=alice){
 const amounts=weighted(s).slice(0,rs.length);
 success(dispatch,`deposit-${s.label}`,[U(sum(amounts)),allocations(rs,amounts)],who);admit(s,rs);
}
// Same walk as dispatch.test.ts: rungs 1-5 sell out (tail roll, epoch 1),
// rung 6 fills partially, rungs 7-10 keep their whole order resting.
function sweep(s:Side,rs:string[],members=1n){
 success('market','swap',[U((s.x?18000000n:180000n)*members),U(s.x?P*2n:P/2n),update,token,name,stx,name,Cl.bool(!s.x)],taker);
 for(const r of rs)success(r,'sync',[],taker);
}
const input=(s:Side)=>s.x?'sbtc':'stx',proceeds=(s:Side)=>s.x?'stx':'sbtc';
const closed=(r:string,who=alice)=>value(entry(r,who)).epoch<state(r).epoch;
function snapshot(rs:string[],who=alice){
 return {wallet:wallets(who),market:wallets(`${owner}.market`),states:rs.map(state),
  claims:rs.map(r=>position(r,who)),entries:rs.map(r=>entry(r,who)),cash:rs.map(r=>wallets(pc(r)))};
}
// Exact expectation per rung, then the batch and its effects.
function claim(s:Side,rs:string[],who=alice){
 const before=wallets(who),claims=rs.map(r=>position(r,who)),old=rs.map(r=>closed(r,who));
 const resting=rs.map(r=>state(r).resting),total=supply();
 const expected=rs.map((r,i)=>({rung:pc(r),
  [proceeds(s)]:claims[i][proceeds(s)],[input(s)]:old[i]?claims[i][input(s)]:0n}));
 const receipt=call(dispatch,`claim-${s.label}`,[targets(rs)],who);
 expect(receipt.result.type,cvToString(receipt.result)).toBe('ok');
 const result=value(receipt.result);
 expect(result.rungs).toBe(BigInt(rs.length));expect(result.claimed).toBe(BigInt(rs.length));
 expect(result.positions).toEqual(expected);
 expect(result.stx).toBe(sum(expected.map(p=>p.stx)));expect(result.sbtc).toBe(sum(expected.map(p=>p.sbtc)));
 expect(wallets(who)).toEqual({sbtc:before.sbtc+result.sbtc,stx:before.stx+result.stx});
 expect(wallets(dispatcher)).toEqual({sbtc:0n,stx:0n});
 expect(supply()).toEqual(total);
 const event=receipt.events.at(-1)!;
 expect(event.event).toBe('print_event');expect(event.data.contract_identifier).toBe(dispatcher);
 expect(value(event.data.value)).toEqual({event:'ladder-claimed',member:who,buy:s.x,
  rungs:BigInt(rs.length),claimed:BigInt(rs.length),stx:result.stx,sbtc:result.sbtc});
 for(const [i,r] of rs.entries()){
  // Claim never touches what rests on the market.
  expect(state(r).resting).toBe(resting[i]);
  const p=position(r,who);
  if(old[i]){expect(entry(r,who)).toEqual(Cl.none());expect(p.shares).toBe(0n);}
  else{
   expect(p.shares).toBe(claims[i].shares);expect(p[input(s)]).toBe(claims[i][input(s)]);
   expect(p[proceeds(s)]).toBe(0n);
  }
 }
 return {result,old};
}

for(const s of specs)describe(`dispatch claim: ${s.label}`,()=>{
 it('ten rungs: sold-out, partial and untouched positions pay exactly; resting positions stay; second claim pays 0',()=>{
  const rs=setup(s),original=supply();
  fund(s,rs);fund(s,rs,bob);sweep(s,rs,2n);
  for(const [i,r] of rs.entries()){
   expect(closed(r)).toBe(i<5);
   if(i<6)expect(position(r)[proceeds(s)]).toBeGreaterThan(0n);else expect(position(r)[proceeds(s)]).toBe(0n);
   if(i>=5)expect(state(r).resting).toBeGreaterThan(0n);
  }
  const bobs=rs.map(r=>position(r,bob));
  const {result}=claim(s,rs);
  expect(result[proceeds(s)]).toBeGreaterThan(0n);
  // Bob's shares are untouched. A closed epoch's last member takes its rounding
  // remainder, so Bob's view of rungs 1-5 may only grow by that remainder.
  for(const [i,r] of rs.entries()){
   const p=position(r,bob);
   expect(p.shares).toBe(bobs[i].shares);
   for(const k of ['stx','sbtc']){expect(p[k]).toBeGreaterThanOrEqual(bobs[i][k]);expect(p[k]-bobs[i][k]).toBeLessThanOrEqual(i<5?1n:0n);}
  }
  // Resting rungs again: paid 0, positions kept.
  const again=claim(s,rs.slice(5)).result;
  expect({stx:again.stx,sbtc:again.sbtc}).toEqual({stx:0n,sbtc:0n});
  // A sold-out position is gone after its claim: the rung's u7006 rolls back the batch.
  const repeat=call(dispatch,`claim-${s.label}`,[targets([rs[0]])],alice);
  expect(repeat.result).toEqual(Cl.error(U(7006)));expect(repeat.events).toEqual([]);
  // Bob claims through the same batch; then both exit and the ladder drains.
  claim(s,rs,bob);
  success('jing-core-v6','pause');success('market','set-paused',[Cl.bool(true)]);
  for(const who of [alice,bob]){
   const left=rs.slice(5);
   success(dispatch,`withdraw-${s.label}`,[allocations(left,left.map(()=>(1n<<128n)-1n)),Cl.none()],who);
  }
  for(const r of rs){expect(state(r)['total-shares']).toBe(0n);expect(wallets(pc(r))).toEqual({sbtc:0n,stx:0n});}
  expect(supply()).toEqual(original);
 },120000);

 it('a tenth-rung absent position rolls back nine earlier payouts; the nine then claim',()=>{
  const rs=setup(s);
  fund(s,rs.slice(0,9));sweep(s,rs.slice(0,9));
  const before=snapshot(rs);
  expect(sum(rs.slice(0,9).map(r=>position(r)[proceeds(s)]))).toBeGreaterThan(0n);
  const receipt=call(dispatch,`claim-${s.label}`,[targets(rs)],alice);
  expect(receipt.result).toEqual(Cl.error(U(7006)));expect(receipt.events).toEqual([]);
  expect(snapshot(rs)).toEqual(before);
  // Same failure in the middle of the list.
  const middle=[...rs.slice(0,4),rs[9],...rs.slice(4,9)];
  expect(call(dispatch,`claim-${s.label}`,[targets(middle)],alice).result).toEqual(Cl.error(U(7006)));
  expect(snapshot(rs)).toEqual(before);
  claim(s,rs.slice(0,9));
 },120000);

 it('retired and replaced rungs stay claimable',()=>{
  const rs=setup(s);
  fund(s,rs);sweep(s,rs);
  success('jing-ladder-v1','retire-band',[Cl.stringAscii(s.ladderSide),U(60)]);
  expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(pc(rs[5]))])).toBe(false);
  expect(position(rs[5])[proceeds(s)]).toBeGreaterThan(0n);
  claim(s,[rs[9],rs[5],rs[0]]);
 },120000);
});
