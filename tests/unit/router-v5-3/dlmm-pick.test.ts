import {describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

// dlmm-pick (df091b8): each DLMM leg uses the pool with the largest ledger
// balance of the asset it buys (STX when selling sBTC, sBTC when selling
// STX); ties go to the lower pool number. The pick feeds both the smart
// route's capacity walk and the swap itself.
//
// Each pool quotes its own bin price, so the output and the capacity show
// which pool was used, and each pool counts its own swaps.
const prices = [1_000_000n, 800_000n, 1_250_000n];
const binSats = 5_000n, binMicro = 500_000n;
const MAX = 340282366920938463463374607431768211455n;
// One depth unit covers the largest payout of any pool in these cases.
const unit = (s:h.Side) => s==='x' ? 2_000_000n : 20_000n;

function setup(s:h.Side, bought:bigint[], sold:bigint[]=[0n,0n,0n]) {
  h.init();
  h.pools.forEach((pool,i)=>{
    h.config(pool,binSats,binMicro);
    h.ok(h.call(pool,'configure-dlmm',[Cl.int(0),h.U(prices[i]),h.U(15),h.U(MAX)]));
    // x sells sBTC and buys STX; y sells STX and buys sBTC.
    if (s==='x') h.fund(pool,sold[i],bought[i]); else h.fund(pool,bought[i],sold[i]);
  });
}
const calls = () => h.pools.map(p=>h.value(simnet.getDataVar(p,'calls')));
const used = (pick:number) => [1,2,3].map(n=>n===pick?1n:0n);
// Bin price is sats per uSTX x 1e8 (venues.clar dlmm-fill).
const swapOut = (s:h.Side,net:bigint,price:bigint) => s==='x' ? net*100_000_000n/price : net*price/100_000_000n;
// Router capacity of the active bin: the core's ceil, no fee configured.
const binCap = (s:h.Side,price:bigint) => s==='x'
  ? (binMicro*price+99_999_999n)/100_000_000n
  : (binSats*100_000_000n+price-1n)/price;

function manualLeg(s:h.Side,pick:number) {
  const a=h.amount(s),before=h.wallet(s);
  const r=h.ok(h.manual(s,{amms:[a],update:h.N}));
  expect(calls()).toEqual(used(pick));
  expect(r['dlmm-in']).toBe(a);
  expect(r['dlmm-out']).toBe(swapOut(s,a,prices[pick-1]));
  h.conservation(s,before,r,a);
}
function smartLeg(s:h.Side,pick:number) {
  const n=h.amount(s),before=h.wallet(s),price=prices[pick-1],cap=binCap(s,price);
  const receipt=h.smart(s,n,h.quote(s),h.N),r=h.ok(receipt);
  expect(h.routerPrint(receipt)['dlmm-cap']).toBe(cap);
  expect(calls()).toEqual(used(pick));
  expect(r['dlmm-in']).toBe(cap);
  expect(r['dlmm-out']).toBe(swapOut(s,cap,price));
  expect(r.unsold).toBe(n-cap);
  h.conservation(s,before,r,n);
}

// Depths in units of the bought asset, and the pool the rule must pick.
const cases:[string,bigint[],number][] = [
  ['pool 1 deepest',[3n,2n,1n],1],
  ['pool 2 deepest',[1n,3n,2n],2],
  ['pool 3 deepest',[1n,2n,3n],3],
  ['tie 1 = 2 goes to pool 1',[3n,3n,1n],1],
  ['tie 2 = 3 goes to pool 2',[1n,3n,3n],2],
  ['tie 1 = 3 goes to pool 1',[3n,1n,3n],1],
  ['three-way tie goes to pool 1',[2n,2n,2n],1],
];

for (const s of ['x','y'] as const) describe(`dlmm-pick ${s==='x'?'selling sBTC':'selling STX'}`,()=>{
  for (const [name,depths,pick] of cases) {
    it(`manual leg: ${name}`,()=>{
      setup(s,depths.map(d=>d*unit(s)));
      manualLeg(s,pick);
    });
    it(`smart capacity and swap: ${name}`,()=>{
      setup(s,depths.map(d=>d*unit(s)));
      smartLeg(s,pick);
    });
  }
  // Pool 2 holds a large balance of the asset this leg sells and none of
  // the asset it buys (one-sided, price out of its range). It is skipped;
  // pool 3, the only pool holding the bought asset, is used.
  for (const route of ['manual','smart'] as const) it(`${route}: skips a one-sided pool on its empty side`,()=>{
    setup(s,[0n,0n,unit(s)],[0n,1000n*unit(h.other(s)),0n]);
    if (route==='manual') manualLeg(s,3); else smartLeg(s,3);
  });
  // The same pools seen from the other side: pool 2 now holds the bought
  // asset and is picked over pool 3.
  for (const route of ['manual','smart'] as const) it(`${route}: uses a one-sided pool on its full side`,()=>{
    setup(s,[0n,1000n*unit(s),0n],[0n,0n,unit(h.other(s))]);
    if (route==='manual') manualLeg(s,2); else smartLeg(s,2);
  });
  it('rolls back the picked pool when the wallet minimum fails',()=>{
    setup(s,[1n,2n,3n].map(d=>d*unit(s)));
    h.reject(()=>h.manual(s,{amms:[h.amount(s)],update:h.N,minOut:MAX}),3002);
  });
});
