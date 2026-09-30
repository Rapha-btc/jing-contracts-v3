import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import fs from 'node:fs';
import {U,P,owner,alice,bob,taker,stx,name,update,value,call,read,ok,balance,specs,setup} from './helpers';

// Oracle/trait fixtures are exact mainnet source snapshots retrieved 2026-09-30:
// https://api.hiro.so/v2/contracts/source/SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8/pyth-lazer-oracle?proof=0
// https://api.hiro.so/v2/contracts/source/SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8/pyth-lazer-traits?proof=0
// SHA-256 oracle: cf6d5b61f88be41bc4d366f53d566be0f3fc03454a15228e759cdd26f3adedc8
// SHA-256 traits: 090ef953c1990ea73be56a5d9fb4b6d1a85576f0b4c0b12d83048eb8d55c4e4e
// The live fee was u0 when checked. The unexpected-proceeds witness explicitly needs
// oracle governance to enable a fee and select the rung as its recipient.
const received=1001n;
const data=(rung:string,key:string)=>value(simnet.getDataVar(rung,key));
const prints=(receipt:ReturnType<typeof call>)=>receipt.events.filter(e=>e.event==='print_event').map(e=>value(e.data.value));

describe('buy withdraw: reachability of close-epoch proceeds',()=>{
 for(const path of ['held','live','admitted','crossing','expired'] as const)it(`${path}: public final withdrawal pays existing proceeds once, with zero close-epoch dust`,()=>{
  const r=setup(specs[0]);
  if(path==='held')ok(call(r.rung,'set-push-paused',[Cl.bool(true)]));
  if(path==='admitted'||path==='expired')r.addOppositeMaker();
  if(path==='crossing')ok(call('market','deposit-token-y',[U(1000000),U(P),Cl.none(),stx,name],taker));
  ok(call(r.rung,'deposit',[U(specs[0].amount)],alice));
  const pending=path==='admitted'||path==='crossing'||path==='expired';
  expect(r.pending()!==null).toBe(pending);
  if(path==='crossing')expect(read('market','would-take-as-x',[U(P),U(P)])).toBe(true);
  if(path==='expired'){simnet.mineEmptyBurnBlocks(145);r.paused();}
  ok(simnet.transferSTX(received,r.principal,bob));
  const before=balance(false,alice);
  const receipt=call(r.rung,'withdraw',[U(specs[0].amount),pending&&path!=='expired'?Cl.some(update):Cl.none()],alice);
  expect(ok(receipt)).toEqual({sbtc:specs[0].amount,stx:received});
  expect(balance(false,alice)-before).toBe(received);
  const transfers=receipt.events.filter(e=>e.event==='stx_transfer_event');
  expect(transfers).toHaveLength(1);
  expect(transfers[0].data).toMatchObject({sender:r.principal,recipient:alice,amount:String(received)});
  const events=prints(receipt),payouts=events.filter(e=>e?.event==='rung-payout');
  expect(payouts).toHaveLength(1);expect(payouts[0].proceeds).toBe(received);
  const payoutIndex=events.findIndex(e=>e?.event==='rung-payout');
  if(pending){
   const marketIndex=events.findIndex(e=>e?.event===(path==='admitted'?'deposit-x':'pending-refund-x'));
   expect(marketIndex).toBeGreaterThan(payoutIndex);
   if(path!=='admitted')expect(events[marketIndex].reason).toBe(path==='crossing'?'crossing':'cancel');
  }
  expect(events.some(e=>e?.event==='rung-epoch-closed')).toBe(true);
  expect(r.state().members).toBe(0n);expect(r.state().epoch).toBe(1n);
  expect(r.pending()).toBe(null);
  for(const key of ['current-proceeds','stx-accounted','proceeds-carry'])expect(data(r.rung,key)).toBe(0n);
  expect(balance(false,r.principal)).toBe(0n);expect(balance(true,r.principal)).toBe(0n);
 });

 for(const recipientIsRung of [false,true])it(`production oracle fee sent to ${recipientIsRung?'rung: retained for the next epoch':'another recipient: no retained proceeds'}`,()=>{
  // Exact deployed oracle/trait snapshots, with dependency identities adapted.
  // Only decoding/signatures use the existing deterministic feed fixture.
  // Rung, market, core and ladder keep their production logic; no state injection.
  const deploy=(n:string,source:string)=>expect(simnet.deployContract(n,source,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
  deploy('pyth-lazer-traits',fs.readFileSync('tests/unit/integration-v6-3/fixtures/dust-pyth-lazer-traits.clar','utf8'));
  deploy('pyth-lazer-decoder-v1',fs.readFileSync('tests/unit/v6-3/oracle.clar','utf8')+'\n(impl-trait .pyth-lazer-traits.decoder-trait)\n(define-public (decode-and-verify-price-feeds (update (buff 8192))) (decode-lazer-payload update))\n');
  deploy('pyth-lazer-oracle',fs.readFileSync('tests/unit/integration-v6-3/fixtures/dust-pyth-lazer-oracle.clar','utf8'));
  const market='dust-market',rung='jing-buy-stx-spread-75',principal=`${owner}.${rung}`;
  let marketSource=fs.readFileSync('tests/unit/integration-v6-3/.build/markets-sbtc-stx-jing-v6-3.clar','utf8');
  marketSource=marketSource.replace('(define-constant LAZER_ORACLE .oracle)','(define-constant LAZER_ORACLE .pyth-lazer-oracle)').replaceAll('.oracle','.pyth-lazer-decoder-v1');
  deploy(market,marketSource);
  deploy(rung,fs.readFileSync('tests/unit/integration-v6-3/.build/jing-buy-stx-core-spread-v1.clar','utf8').replaceAll(`${owner}.market`,`${owner}.${market}`));
  const token=Cl.contractPrincipal(owner,'token');
  ok(call('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.${market}`)]));
  ok(call(market,'initialize',[Cl.principal(`${owner}.${market}`),token,stx,U(100),U(10000),U(1),U(45)]));
  ok(call('jing-ladder-v1','set-canonical',[Cl.stringAscii('buy-band'),Cl.principal(principal)]));
  ok(call(rung,'initialize',[U(75),Cl.bool(false)]));
  ok(call('token','mint',[U(10000),Cl.principal(alice)]));
  ok(call(market,'deposit-token-y',[U(1000000),U(P/2n),Cl.none(),stx,name],taker));
  ok(call(rung,'deposit',[U(10000)],alice));
  expect(read(market,'get-token-x-pending-deposit',[Cl.principal(principal)])?.amount).toBe(10000n);
  ok(simnet.transferSTX(received,principal,bob));
  const fee=7n,recipient=recipientIsRung?principal:bob;
  ok(call('pyth-lazer-oracle','set-fee',[U(fee)]));
  ok(call('pyth-lazer-oracle','set-fee-recipient',[Cl.principal(recipient)]));
  const wallet=balance(false,alice);
  const receipt=call(rung,'withdraw',[U(10000),Cl.some(update)],alice);
  const retained=recipientIsRung?fee:0n;
  expect(ok(receipt)).toEqual({sbtc:10000n,stx:received});
  expect(balance(false,alice)-wallet).toBe(received-fee);
  const transfers=receipt.events.filter(e=>e.event==='stx_transfer_event').map(e=>e.data);
  expect(transfers).toEqual([
   expect.objectContaining({sender:principal,recipient:alice,amount:String(received)}),
   expect.objectContaining({sender:alice,recipient,amount:String(fee)}),
  ]);
  expect(prints(receipt).filter(e=>e?.event==='rung-payout').map(e=>e.proceeds)).toEqual([received]);
  expect(read(rung,'get-state').epoch).toBe(1n);
  expect(data(rung,'current-proceeds')).toBe(retained);expect(data(rung,'stx-accounted')).toBe(retained);
  expect(balance(false,principal)).toBe(retained);expect(balance(true,principal)).toBe(0n);
  // Existing indexed earnings are already settled. The retained balance is
  // not indexed again: it belongs to the next epoch's final member.
  ok(call(rung,'set-push-paused',[Cl.bool(true)]));
  ok(call('token','mint',[U(20000),Cl.principal(bob)]));
  ok(call(rung,'deposit',[U(10000)],bob));
  ok(call(rung,'deposit',[U(10000)],alice));
  expect(read(rung,'get-position',[Cl.principal(bob)]).stx).toBe(0n);
  expect(read(rung,'get-position',[Cl.principal(alice)]).stx).toBe(0n);
  const bobWallet=balance(false,bob);
  expect(ok(call(rung,'withdraw',[U(10000),Cl.none()],alice))).toEqual({sbtc:10000n,stx:0n});
  expect(read(rung,'get-position',[Cl.principal(bob)]).stx).toBe(retained);
  expect(ok(call(rung,'withdraw',[U(10000),Cl.none()],bob))).toEqual({sbtc:10000n,stx:retained});
  expect(balance(false,bob)-bobWallet).toBe(retained);
  expect(read(rung,'get-state').epoch).toBe(2n);
  expect(data(rung,'current-proceeds')).toBe(0n);expect(data(rung,'stx-accounted')).toBe(0n);
  expect(balance(false,principal)).toBe(0n);expect(balance(true,principal)).toBe(0n);
 });
});
