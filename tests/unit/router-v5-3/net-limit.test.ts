import {beforeEach,describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

// Audit submission mut9sgqa8b043b391e46: the book fills at the maker's own
// price, but the taker prepays the rebate and pays the 10 bps fee on what it
// receives. The smart routes now run the book leg at bookLimit(limit), so the
// book's NET price meets the caller's limit. Manual routes are unchanged.
beforeEach(h.init);
const assetArgs=(s:h.Side)=>[s==='x'?h.token:h.stx,Cl.stringAscii(s==='x'?'token':'wstx')];
// A maker on the side the caller sells into, at `price`.
const maker=(s:h.Side,price:bigint)=>h.ok(h.call('market',`deposit-token-${h.other(s)}`,
  [h.U(h.amount(h.other(s))),h.U(price),h.N,...assetArgs(h.other(s))],h.maker));
const makerLeft=(s:h.Side)=>h.ro('market',`get-token-${h.other(s)}-deposit`,[h.U(h.ro('market','get-current-cycle')),Cl.principal(h.maker)]);
// Net price of a leg meets the limit: x a minimum STX-per-sat, y a maximum.
const meets=(s:h.Side,paid:bigint,got:bigint,limit:bigint)=>s==='x'?got*h.SCALE>=limit*paid:paid*h.SCALE<=limit*got;
// The floor vault-sbtc-stx-v6 passes as min-out (derive-min-out).
const vaultMin=(s:h.Side,amount:bigint,limit:bigint)=>s==='x'?amount*limit/h.SCALE:amount*h.SCALE/limit;
const floor=(s:h.Side,out:bigint,amount:bigint,limit:bigint)=>out>=vaultMin(s,amount,limit);

for(const s of ['x','y'] as const) describe(`net book limit ${s}`,()=>{
  it('manual route still fills a maker at the limit under the limit net (unchanged by design)',()=>{
    maker(s,h.quote(s));const n=h.amount(s),r=h.ok(h.manual(s,{jing:n}));
    expect(r['jing-ok']).toBe(true);
    // The exposure the smart fix removes: rebate + fee push the net under.
    expect(meets(s,r['jing-in'],r['jing-out'],h.quote(s))).toBe(false);
  });
  it('(A) a maker at the caller limit no longer fills the smart route; DLMM takes it above the floor',()=>{
    maker(s,h.quote(s));h.fund('dlmm');h.config('dlmm');
    const n=h.amount(s),limit=h.quote(s),before=h.wallet(s),receipt=h.smart(s,n,limit,h.UPDATE,h.P,vaultMin(s,n,limit)),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(0n);
    expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,'dlmm-in':n,unsold:0n});
    expect(r.out).toBe(s==='x'?n*100n:n/100n);
    expect(floor(s,r.out,n,limit)).toBe(true);
    expect(makerLeft(s)).toBe(h.amount(h.other(s)));expect(h.ro('market','get-current-cycle')).toBe(0n);
    h.conservation(s,before,r,n);
  });
  it('(A) with no other venue the book leg is skipped, not filled under the limit',()=>{
    maker(s,h.quote(s));const before=h.state(),n=h.amount(s),r=h.ok(h.smart(s,n,h.quote(s)));
    expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,out:0n,unsold:n});
    expect(h.state()).toBe(before);
  });
  it('(B) a maker just inside the limit cannot take the chunk ahead of a better DLMM quote',()=>{
    // Before the fix this maker passed the walk (price >= / <= limit) and
    // took the whole chunk at the floor, net under it, ahead of DLMM at P.
    maker(s,s==='x'?h.quote(s)+1n:h.quote(s)-1n);h.fund('dlmm');h.config('dlmm');
    const n=h.amount(s),limit=h.quote(s),before=h.wallet(s),receipt=h.smart(s,n,limit,h.UPDATE,h.P,vaultMin(s,n,limit)),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(0n);
    expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,'dlmm-in':n,out:s==='x'?n*100n:n/100n,unsold:0n});
    expect(floor(s,r.out,n,limit)).toBe(true);expect(makerLeft(s)).toBe(h.amount(h.other(s)));
    h.conservation(s,before,r,n);
  });
  it('(B) the same maker fills once its price nets to the caller limit',()=>{
    const limit=h.quote(s),price=h.bookLimit(s,limit);
    expect(s==='x'?price>limit:price<limit).toBe(true);
    maker(s,price);h.fund('dlmm');h.config('dlmm');
    // The whole chunk goes to the book and its net price meets the limit.
    // The only input left is the unused rebate's rounding dust (x: 20-sat
    // pot, fills pay floor(9980*20/10000) = 19; y: 2 microSTX), too small
    // for DLMM; the floor holds on what was sold.
    const n=h.amount(s),before=h.wallet(s),receipt=h.smart(s,n,limit),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(n);expect(r['jing-ok']).toBe(true);
    expect(r['dlmm-in']).toBe(0n);expect(r.unsold).toBe(s==='x'?1n:2n);expect(r['jing-in']).toBe(n-r.unsold);
    expect(meets(s,r['jing-in'],r['jing-out'],limit)).toBe(true);expect(floor(s,r.out,r['jing-in'],limit)).toBe(true);
    // A vault floor on the gross amount misses x by that 1-sat dust (2 microSTX).
    expect(vaultMin(s,n,limit)-r.out).toBe(s==='x'?2n:0n);
    h.conservation(s,before,r,n);
  });
  // Rounding: L = netLimit is the most lenient limit whose book limit reaches
  // the maker; one unit stricter must skip. At these prices the exact ratio is
  // fractional, so the wrong rounding direction would fill the stricter limit.
  for(const bps of [20n,70n]) for(const step of [0n,1n]) it(`book-limit rounding at ${bps} bps, ${step?'one unit stricter':'exact'} limit`,()=>{
    maker(s,h.quote(s));h.fund('dlmm');h.config('dlmm');
    // 70 bps is only read for an update at the staleness edge (age 80): the
    // sizing hint caps there while the market refuses the swap itself.
    if(bps===70n) h.ok(h.call('oracle','configure',[h.U(0),h.U(80),h.U(80)]));
    const exact=h.netLimit(s,h.quote(s),bps),limit=s==='x'?exact+step:exact-step;
    expect(h.bookLimit(s,exact,bps)).toBe(h.quote(s));
    expect(s==='x'?h.bookLimit(s,limit,bps)>h.quote(s):h.bookLimit(s,limit,bps)<h.quote(s)).toBe(step===1n);
    const ratio=s==='x'?exact*(10000n+bps)%9990n:exact*9990n%(10000n+bps);
    expect(ratio).not.toBe(0n);
    const n=h.amount(s),before=h.wallet(s),receipt=h.smart(s,n,limit),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(step?0n:n);
    const fills=bps===20n&&!step;
    expect(r['jing-ok']).toBe(fills);
    if(fills) expect(meets(s,r['jing-in'],r['jing-out'],limit)).toBe(true);
    else expect(r['dlmm-in']).toBe(n);
    h.conservation(s,before,r,n);
  });
});

it('blimit = 0 guard: a 1-unit max price for STX gives no book leg and no market call',()=>{
  maker('y',h.quote('y'));expect(h.bookLimit('y',1n)).toBe(0n);
  const before=h.state(),n=h.amount('y'),receipt=h.smart('y',n,1n),r=h.ok(receipt);
  expect(h.routerPrint(receipt)['jing-cap']).toBe(0n);
  expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,out:0n,unsold:n});
  expect(h.state()).toBe(before);
});
