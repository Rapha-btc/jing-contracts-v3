import {beforeEach,describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

beforeEach(h.init);

for(const side of ['x','y'] as const)describe(`age-aware book sizing ${side}`,()=>{
 const minimum=side==='x'?10_000n:1_000_000n;
 const opposite=side==='x'?1_000_000n:10_000n;
 function tightBook(){
  h.ok(h.call('market',`set-min-token-${side}-deposit`,[h.U(minimum)]));
  h.ok(h.call('market',`deposit-token-${h.other(side)}`,[
   h.U(opposite),h.U(side==='x'?h.P*2n:h.P/2n),h.N,
   side==='x'?h.stx:h.token,Cl.stringAscii(side==='x'?'wstx':'token'),
  ],h.maker));
 }
 for(const [ax,ay] of [[0,0],[30,30],[31,0],[0,31],[79,0],[0,79]])
 it(`fills the capacity-capped book with feed ages ${ax}/${ay}`,()=>{
  tightBook();
  h.ok(h.call('oracle','configure',[h.U(0),h.U(ax),h.U(ay)]));
  const bps=BigInt(20+Math.max(0,Math.max(ax,ay)-30));
  const cap=((minimum+1n)*(10000n+bps)-1n)/10000n;
  const amount=minimum*2n,before=h.wallet(side);
  const quote=h.ro('market','get-taker-capacity',[h.U(h.P),h.U(h.quote(side)),Cl.bool(side==='x'),Cl.principal(h.user),h.UPDATE]);
  expect(quote['net-cap']).toBe(minimum);
  const receipt=h.smart(side,amount),result=h.ok(receipt);
  expect(h.routerPrint(receipt)['jing-cap']).toBe(cap);
  expect(result['jing-ok']).toBe(true);
  // The full midpoint batch receives the whole prepaid rebate pot.
  expect(result['jing-in']).toBe(cap);
  expect(h.ro('market',`get-token-${h.other(side)}-deposit`,[h.U(h.ro('market','get-current-cycle')),Cl.principal(h.maker)])).toBe(0n);
  h.conservation(side,before,result,amount);
 });
 for(const sufficient of [false,true])it(`aged input budget ${sufficient?'at':'below'} the true minimum`,()=>{
  tightBook();
  h.ok(h.call('oracle','configure',[h.U(0),h.U(79),h.U(0)]));
  const amount=h.gross(minimum,69n)-(sufficient?0n:1n),before=h.wallet(side);
  const receipt=h.smart(side,amount),result=h.ok(receipt);
  expect(h.routerPrint(receipt)['jing-cap']).toBe(sufficient?amount:0n);
  expect(result['jing-ok']).toBe(sufficient);
  h.conservation(side,before,result,amount);
 });
});

describe('rebate sizing hint boundaries',()=>{
 const hint=(update=h.UPDATE)=>h.ro('market','get-taker-capacity',[h.U(h.P),h.U(h.quote('x')),Cl.bool(true),Cl.principal(h.user),update])['rebate-bps'];
 it('ignores an update shorter than the EVM envelope',()=>{
  expect(hint(Cl.some(Cl.bufferFromHex('00')))).toBe(20n);
 });
 for(const mode of [4,6,7,13,15])it(`ignores decoder failure or missing feed/timestamp (mode ${mode})`,()=>{
  h.ok(h.call('oracle','configure',[h.U(mode),h.U(0),h.U(0)]));
  expect(hint()).toBe(20n);
  h.book('x');h.fund('dlmm');h.config('dlmm');
  const before=h.wallet('x'),receipt=h.smart('x',10000n),result=h.ok(receipt);
  expect(result['jing-ok']).toBe(false);
  expect(result['dlmm-in']).toBe(10000n);
  h.conservation('x',before,result,10000n);
 });
 it('treats future timestamps as age zero like the market',()=>{
  h.ok(h.call('oracle','configure',[h.U(8),h.U(0),h.U(0)]));
  expect(hint()).toBe(20n);
 });
 it('caps the sizing hint at 70 bps while the market still refuses stale feeds',()=>{
  h.ok(h.call('oracle','configure',[h.U(0),h.U(81),h.U(0)]));
  expect(hint()).toBe(70n);
  h.book('x');h.fund('dlmm');h.config('dlmm');
  const before=h.wallet('x'),receipt=h.smart('x',10000n),result=h.ok(receipt);
  expect(result['jing-ok']).toBe(false);
  expect(result['dlmm-in']).toBe(10000n);
  h.conservation('x',before,result,10000n);
 });
});
