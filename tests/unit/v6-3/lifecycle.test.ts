import {beforeEach, describe, expect, it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';
const {U,N,P,UPDATE,owner,alice,bob,carol,keeper,market,name,call,ro,ok,value}=h;
const sides=['x','y'] as const;
const people=[owner,alice,bob,carol,keeper];
// Distinct asset identities are essential when checking the real core ledger.
const assets={x:h.token,y:h.wrong};
const traits=[assets.x,name,assets.y,name];
const deposit=(s:h.Side,n:number,limit:number,who=alice)=>call(`deposit-token-${s}`,[U(n),U(limit),N,assets[s],name],who);
const admit=(s:h.Side,who=alice)=>call(`settle-token-${s}-deposit`,[Cl.principal(who),UPDATE,assets[s],name],keeper);
const cancel=(s:h.Side,who=alice)=>call(`cancel-token-${s}-deposit`,[assets[s],name],who);
const swap=(s:h.Side,n:number,limit:number,who=carol)=>call('swap',[U(n),U(limit),UPDATE,...traits,Cl.bool(s==='x')],who);
const batch=()=>call('settle-with-refresh',[UPDATE,...traits],keeper);
const equity=(s:h.Side,who:string)=>value(ro('get-token-equity',[assets[s],Cl.principal(who)],'jing-core-v6')) as bigint;
let supply:Record<h.Side,bigint>;
let checkpoints:number;
function conserved(s:h.Side){return [...people,market].reduce((sum,who)=>sum+h.balance(s,who),0n);}
function accounting(label:string){
  for(const s of sides){
    let live=0n,credited=0n,escrow=0n;
    for(const who of people){
      const active=h.live(s,who),parked=h.parked(s,who),pending=value(h.pending(s,'deposit',who))?.amount??0n;
      expect(equity(s,who),`${label}: ${s} core equity of ${who}`).toBe(active+parked);
      live+=active;credited+=active+parked;escrow+=active+parked+pending;
    }
    expect(h.balance(s,market),`${label}: ${s} escrow equals all claims`).toBe(escrow);
    expect(value(ro('get-total-token-equity',[assets[s]],'jing-core-v6')),`${label}: ${s} total core equity`).toBe(credited);
    expect(value(ro('get-cycle-totals',[U(h.cycle())]))[`total-token-${s}`],`${label}: ${s} book total`).toBe(live);
    expect(conserved(s),`${label}: ${s} conserved across wallets, treasury and market`).toBe(supply[s]);
  }
  checkpoints++;
}
function step(label:string,action:()=>ReturnType<typeof call>){
  const receipt=action();ok(receipt);accounting(label);return receipt;
}
function price(n:number){step('oracle price',()=>call('set-mid',[U(n)],owner,'oracle'));}
function zeroClaims(){
  for(const s of sides){
    expect(h.balance(s,market)).toBe(0n);
    for(const who of people){
      expect(h.live(s,who)+h.parked(s,who)).toBe(0n);
      for(const kind of ['deposit','limit','readmit'])expect(h.pending(s,kind,who)).toEqual(N);
      expect(equity(s,who)).toBe(0n);
    }
  }
}

beforeEach(()=>{
 h.verifyMarket();
 ok(call('initialize',[Cl.principal(market),assets.x,assets.y,U(100),U(10000),U(1),U(45)]));
 for(const who of [alice,bob,carol,keeper])ok(call('mint',[U(1000000000),Cl.principal(who)],owner,'token'));
 supply={x:conserved('x'),y:conserved('y')};checkpoints=0;accounting('initialized');
});

describe('multi-cycle lifecycle with real core equity',()=>{
 for(const s of sides)it(`${s}: deposit, park, refused readmit, readmit, walk, settle and paused recovery`,()=>{
  const opposite=h.other(s),amount=h.amount(s),quote=h.off(s);
  step('reserve seats',()=>call('set-max-band',[U(49)],owner,'jing-ladder-v1'));
  step('one public slot',()=>call('sync-seat-count'));
  step('size-only queue',()=>call('set-distance-slots',[U(0)]));
  step('first maker admitted',()=>deposit(s,amount,quote));
  step('larger maker escrowed',()=>deposit(s,amount*2,quote,bob));
  expect(value(h.pending(s,'deposit',bob)).amount).toBe(BigInt(amount*2));expect(equity(s,bob)).toBe(0n);
  step('incumbent parked',()=>admit(s,bob));expect(h.parked(s,alice)).toBe(BigInt(amount));
  step('readmit requested',()=>h.readmit(s));
  step('full queue refuses readmit',()=>h.settleReadmit(s));
  expect(h.parked(s,alice)).toBe(BigInt(amount));expect(h.pending(s,'readmit')).toEqual(N);
  step('competitor cancels',()=>cancel(s,bob));
  step('readmit retried',()=>h.readmit(s));
  const beforeReadmit=h.balance(s,alice);
  step('parked claim readmitted',()=>h.settleReadmit(s));
  expect(h.balance(s,alice)).toBe(beforeReadmit);expect(h.live(s,alice)).toBe(BigInt(amount));
  const walked=step('taker walks maker quote',()=>swap(opposite,h.amount(opposite),quote));
  expect(walked.events.some(e=>e.event==='print_event'&&value(e.data.value).event==='match')).toBe(true);
  expect(h.cycle()).toBe(1n);
  const remainder=Number(h.live(s,alice));expect(remainder).toBeGreaterThan(0);
  step('remaining maker repriced at midpoint',()=>h.setLimit(s,P));
  const matching=opposite==='y'?remainder*100:remainder/100;
  step('matching funds escrowed',()=>deposit(opposite,matching,P,bob));
  price(s==='x'?P/2:P*2);
  step('matching maker admitted',()=>admit(opposite,bob));price(P);
  step('independent escrow survives settlement',()=>deposit(s,amount,quote,carol));
  step('remaining book settles in next cycle',batch);expect(h.cycle()).toBe(2n);
  expect(value(h.pending(s,'deposit',carol)).amount).toBe(BigInt(amount));
  step('core paused',()=>call('pause',[],owner,'jing-core-v6'));
  step('market paused',()=>call('set-paused',[Cl.bool(true)]));
  h.rejectUnchanged(()=>deposit(s,amount,quote,bob),1007);accounting('paused deposit rejected');
  step('pending funds returned during both pauses',()=>cancel(s,carol));
  zeroClaims();expect(checkpoints).toBeGreaterThanOrEqual(24);
 });
});

// Awkward, publicly accepted quotes exercise the real walk's final dust refund.
// Equity is independently compared to actual remaining custody, not to logs.
describe('walk rounding leaves no core claim after refunded taker dust',()=>{
 for(const s of sides)for(const action of ['swap','reprice'] as const)it(`${s} ${action}: dust refund clears real core equity exactly once`,()=>{
  const opposite=h.other(s),input=h.amount(s),quote=s==='y'?P*1.5:P/2;
  const makerAmount=s==='y'?10000:action==='swap'?498000:494000;
  const dust=s==='y'?(action==='swap'?53n:50n):20n;
  if(action==='reprice')step('taker first rests off-market',()=>deposit(s,input,h.off(s),carol));
  step('maker supplies walk liquidity',()=>deposit(opposite,makerAmount,quote));
  if(action==='reprice'){
    step('maker escrow admitted',()=>admit(opposite));
    step('midpoint maker triggers crossing reprice',()=>deposit(opposite,s==='y'?101:10000,P,bob));
    step('midpoint maker admitted',()=>admit(opposite,bob));
  }
  const before=h.balance(s,carol);
  const receipt=action==='swap'?swap(s,input,quote):call(`reprice-or-swap-token-${s}`,[U(quote),N,UPDATE,...traits],carol);
  ok(receipt);
  const transfers=receipt.events.filter(e=>e.event===(s==='y'?'stx_transfer_event':'ft_transfer_event')).map(e=>e.data);
  expect(transfers.some(t=>t.sender===market&&t.recipient===carol&&BigInt(t.amount)===dust)).toBe(true);
  const received=transfers.filter(t=>t.recipient===carol).reduce((n,t)=>n+BigInt(t.amount),0n);
  const sent=transfers.filter(t=>t.sender===carol).reduce((n,t)=>n+BigInt(t.amount),0n);
  expect(h.balance(s,carol)-before).toBe(received-sent);
  expect(h.live(s,carol)+h.parked(s,carol)).toBe(0n);
  expect(h.pending(s,'deposit',carol)).toEqual(N);expect(h.balance(s,market)).toBe(0n);
  expect(equity(s,carol),'refunded taker has no deposited input left').toBe(0n);
  const refunds=receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.jing-core-v6`)
    .map(e=>value(e.data.value)).filter(e=>e.event===`refund-${s}`&&e.depositor===carol);
  expect(refunds).toHaveLength(1);
  expect(refunds[0]).toMatchObject({amount:dust,cycle:h.cycle(),[`equity-${s}`]:0n});
  expect(value(receipt.result)[`token-${s}-rolled`]).toBe(dust); // Existing taker return semantics.
  accounting('walk dust refunded and core debited');
  // Removing the remaining maker claim must leave no ghost equity or custody.
  if(h.live(opposite,alice)>0n)step('remaining maker cancels',()=>cancel(opposite));
  zeroClaims();
 });
});

describe('real-core accounting at the taker refund threshold',()=>{
 for(const s of sides)for(const boundary of ['zero','below-minimum','at-minimum'] as const)
 it(`${s}: ${boundary} remainder, rollback or refund, then wallet reuse`,()=>{
  const opposite=h.other(s),quote=s==='x'?P/2:P*2;
  const minimum=s==='x'?100n:10000n;
  const remainder=boundary==='zero'?0n:boundary==='below-minimum'?minimum-1n:minimum;
  // Exact integer fills at these quotes leave the selected remainder. The y
  // below-minimum input nets 999,999 after the 20 bps net-based rebate.
  const targetNet=s==='x'?9980n:boundary==='below-minimum'?999999n:998000n;
  const input=Number((targetNet*10020n+9999n)/10000n);
  const makerAmount=s==='x'?Number((9980n-remainder)*50n):boundary==='zero'?4990:boundary==='below-minimum'?4950:4940;
  step('maker admitted for boundary fill',()=>deposit(opposite,makerAmount,quote));
  if(boundary==='at-minimum'){
    // A walk can transfer funds and emit logs before this guard rejects it;
    // the public transaction must roll all of them back, including core equity.
    h.rejectUnchanged(()=>swap(s,input,quote),1017);accounting('partial fill rolled back');
    expect(h.cycle()).toBe(0n);
    expect(h.live(opposite,alice)).toBe(BigInt(makerAmount));
    step('maker removes undersized liquidity',()=>cancel(opposite));
    step('maker supplies a complete fill',()=>deposit(opposite,s==='x'?499000:4990,quote));
  }
  const receipt=step('successful boundary fill',()=>swap(s,input,quote));
  const dust=boundary==='at-minimum'?0n:remainder;
  const refunds=receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.jing-core-v6`)
    .map(e=>value(e.data.value)).filter(e=>e.event===`refund-${s}`&&e.depositor===carol);
  expect(refunds).toHaveLength(dust===0n?0:1);
  if(dust>0n)expect(refunds[0]).toMatchObject({amount:dust,cycle:h.cycle(),[`equity-${s}`]:0n});
  expect(value(receipt.result)[`token-${s}-rolled`]).toBe(dust);
  zeroClaims();
  // Reusing the same wallet must credit only its fresh deposit, and allow a
  // complete exit even when both market and core have subsequently paused.
  step('same taker deposits again',()=>deposit(s,h.amount(s),h.off(s),carol));
  expect(equity(s,carol)).toBe(BigInt(h.amount(s)));
  step('core pauses after reuse',()=>call('pause',[],owner,'jing-core-v6'));
  step('market pauses after reuse',()=>call('set-paused',[Cl.bool(true)]));
  step('reused wallet exits during both pauses',()=>cancel(s,carol));
  zeroClaims();
 });
});
