import {describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

// dlmm-pick (280c81c). A pool is eligible if its ledger balance of the asset
// the leg buys (STX when selling sBTC, sBTC when selling STX) is > 0 and at
// least 1% of the deepest pool's balance. With fewer than two eligible pools
// the eligible one is used (u1 when none) and no factor list is read.
// Otherwise one read of the core's u15 factor list prices every bin, and each
// eligible pool's payout for the leg's amount is estimated by walking up to 30
// bins from its active bin (dlmm-out; u0 for a bin step other than u15). The
// highest payout wins; ties go to the lower number. Manual legs pick with
// their amount; the smart DLMM stage picks once with what is left and runs
// both its capacity walk and its sale on that pool.
//
// The pools run venues.clar in bin-walk mode: each bin holds its own
// balances and a swap walks at most 30 bins with the core's per-bin formula,
// so each pool's output, capacity and swap counter show which pool ran.

type Side = h.Side;
// One pool: active-bin offset `a` (taker-worse direction: up selling sBTC,
// down selling STX), bin step, fee (bps), bins as [offset from the active
// bin in the walk direction, liquidity] and the ledger depth. Liquidity and
// depth are in percent of what the reference amount buys at price 1e6;
// `minus` takes base units off the depth; `iy` is the initial price selling STX.
type Pool = {a:number,step?:number,fee?:number,initial?:bigint,iy?:bigint,bins:[number,bigint][],depth?:bigint,minus?:bigint,sold?:bigint};
type Case = {name:string,pools:Pool[],pick:number,amount?:bigint,noFactorRead?:boolean};
const MAX = 340282366920938463463374607431768211455n;
const up = (s:Side) => s==='x';
// percent unit of the bought asset: 1% of 1e6 uSTX (selling sBTC) / 1e4 sats (selling STX)
const pct = (s:Side) => s==='x' ? 10_000n : 100n;
const sum = (b:[number,bigint][]) => b.reduce((t,[,l])=>t+l,0n);
const binId = (s:Side,p:Pool,offset:number) => up(s) ? p.a+offset : -(p.a+offset);
// Stub and core-factor price, sats per uSTX x 1e8 (linear in the stub).
const price = (p:Pool,bin:number) => {const i=(bin<0?p.iy:undefined)??p.initial??1_000_000n;return (i*10000n+i*BigInt(p.step??15)*BigInt(bin))/10000n;};
const liq = (s:Side,p:Pool,bin:number) => {
  const hit=p.bins.find(([o])=>binId(s,p,o)===bin);return hit?hit[1]*pct(s):0n;
};

// The router's dlmm-out walk and the stub swap (same per-bin formula).
function walk(s:Side,p:Pool,amount:bigint) {
  const fee=BigInt(p.fee??0);let left=amount,out=0n;
  for (let i=0;i<30&&left>0n;i++) {
    const bin=up(s)?p.a+i:-(p.a+i),pr=price(p,bin),avail=liq(s,p,bin);
    const raw=up(s)?(avail*pr+99_999_999n)/100_000_000n:(avail*100_000_000n+pr-1n)/pr;
    const grossed=fee>0n?raw*10000n/(10000n-fee):raw;
    if (left>=grossed) {out+=avail;left-=grossed;}
    else {const net=left*(10000n-fee)/10000n;out+=up(s)?net*100_000_000n/pr:net*pr/100_000_000n;left=0n;}
  }
  return {in:amount-left,out};
}
// The router's dlmm-capacity at the limit (all bins in these cases pass it).
function capacity(s:Side,p:Pool,limit:bigint) {
  const fee=BigInt(p.fee??0),base=h.SCALE*100_000_000n/limit;
  const thr=up(s)?base*(10000n-fee)/10000n:base*10000n/(10000n-fee);
  let cap=0n;
  for (let i=0;i<30;i++) {
    const bin=up(s)?p.a+i:-(p.a+i),pr=price(p,bin),avail=liq(s,p,bin);
    if (up(s)?pr>thr:pr<thr) break;
    const raw=up(s)?(avail*pr+99_999_999n)/100_000_000n:(avail*100_000_000n+pr-1n)/pr;
    cap+=fee>0n?raw*10000n/(10000n-fee):raw;
  }
  return cap;
}
const depth = (s:Side,p:Pool) => (p.depth??sum(p.bins))*pct(s)-(p.minus??0n);
// The rule itself, to keep each case's expected pick honest.
function model(s:Side,pools:Pool[],amount:bigint) {
  const d=pools.map(p=>depth(s,p)),floor=d.reduce((m,x)=>x>m?x:m,0n)/100n;
  const e=d.map(x=>x>0n&&x>=floor);
  if (e.filter(Boolean).length<2) return e[1]?2:e[2]?3:1;
  const o=pools.map((p,i)=>e[i]&&(p.step??15)===15?walk(s,p,amount).out:0n);
  return o[0]>=o[1]&&o[0]>=o[2]?1:o[1]>=o[2]?2:3;
}

function setup(s:Side,pools:Pool[]) {
  h.init();
  h.pools.forEach((name,i)=>{
    const p=pools[i];
    h.config(name,0n,0n,false,p.fee??0,p.fee??0);
    h.ok(h.call(name,'configure-dlmm',[Cl.int(up(s)?p.a:-p.a),h.U((up(s)?undefined:p.iy)??p.initial??1_000_000n),h.U(p.step??15),h.U(MAX)]));
    for (const [o,l] of p.bins) {
      const x=up(s)?l*pct(s):0n,y=up(s)?0n:l*pct(s);
      h.ok(h.call(name,'set-bin',[Cl.int(binId(s,p,o)),h.U(x),h.U(y)]));
    }
    if (!p.bins.length) h.ok(h.call(name,'set-bin',[Cl.int(0),h.U(0),h.U(0)]));
    const bought=depth(s,p),sold=(p.sold??0n)*pct(h.other(s));
    // x sells sBTC and buys STX; y sells STX and buys sBTC.
    if (s==='x') h.fund(name,sold,bought); else h.fund(name,bought,sold);
  });
}
// Core factor read returns (ok none): a router that reads it panics.
const poison = () => h.ok(h.call('dlmm-router','set-factors-off',[Cl.bool(true)]));
const calls = () => h.pools.map(p=>h.value(simnet.getDataVar(p,'calls')));
const used = (pick:number) => [1,2,3].map(n=>n===pick?1n:0n);

function manualLeg(s:Side,c:Case,pick:number) {
  const a=(c.amount??100n)*h.amount(s)/100n,before=h.wallet(s),w=walk(s,c.pools[pick-1],a);
  const r=h.ok(h.manual(s,{amms:[a],update:h.N}));
  expect(calls()).toEqual(used(pick));
  expect(r['dlmm-in']).toBe(w.in);
  expect(r['dlmm-out']).toBe(w.out);
  expect(r.unsold).toBe(a-w.in);
  h.conservation(s,before,r,a);
}
function smartLeg(s:Side,c:Case,pick:number) {
  const n=(c.amount??100n)*h.amount(s)/100n,before=h.wallet(s),p=c.pools[pick-1];
  const cap=capacity(s,p,h.quote(s)),plan=cap<n?cap:n,w=walk(s,p,plan);
  const receipt=h.smart(s,n,h.quote(s),h.N),r=h.ok(receipt);
  // capacity walked on the picked pool, and the sale ran on the same pool
  expect(h.routerPrint(receipt)['dlmm-cap']).toBe(cap);
  expect(calls()).toEqual(used(pick));
  expect(h.value(simnet.getDataVar(h.pools[pick-1],'last-in'))).toBe(w.in);
  expect(r['dlmm-in']).toBe(w.in);
  expect(r['dlmm-out']).toBe(w.out);
  expect(r.unsold).toBe(n-w.in);
  h.conservation(s,before,r,n);
}

const one = (a:number,l=200n,extra:Partial<Pool>={}):Pool => ({a,bins:[[0,l]],...extra});
const cases:Case[] = [
  // payout, not depth: the deepest pool loses when another pays more
  {name:'deeper but worse-paying pool 2 loses to pool 1',pools:[one(0),one(20,200n,{depth:5000n}),one(10,200n,{depth:300n})],pick:1},
  {name:'pool 2 pays most, pool 1 deepest',pools:[one(10,200n,{depth:5000n}),one(0),one(20)],pick:2},
  {name:'pool 3 pays most, pool 2 deepest',pools:[one(20),one(10,200n,{depth:5000n}),one(0)],pick:3},
  // steering: pool 1's active bin quotes best but is empty; its liquidity
  // sits 25 bins away. It cannot win on a quote it cannot fill.
  {name:'empty active bin with liquidity 25 bins away loses',pools:[{a:0,bins:[[25,200n]]},one(10),one(20)],pick:2},
  {name:'1% dust in the best active bin, rest far away, loses',pools:[{a:0,bins:[[0,1n],[25,199n]]},one(10),one(20)],pick:2},
  // the walk stops after 30 bins: liquidity at offset 30 is not counted
  {name:'liquidity past the 30th bin is not counted',pools:[{a:0,bins:[[30,5000n]]},one(10),one(20)],pick:2},
  {name:'amount larger than pool 1\'s 30 bins: pool 2 pays more',pools:[{a:0,bins:[[0,20n],[10,20n],[29,20n],[30,5000n]]},one(10),one(20)],pick:2},
  {name:'amount larger than every pool\'s bins: most paid wins, leg fills part',pools:[one(0,80n),one(10,60n),one(20,60n)],pick:1},
  // partial last bin: the same pools rank differently with the amount
  {name:'partial last bin, full amount: steady pool 2 wins',pools:[{a:0,bins:[[0,40n],[20,200n]]},one(10),one(25)],pick:2},
  {name:'partial last bin, 30% amount: pool 1\'s best bin covers it',amount:30n,pools:[{a:0,bins:[[0,40n],[20,200n]]},one(10),one(25)],pick:1},
  // fees come off the input before pricing
  {name:'fee breaks a tie: 30 bps on pool 1 hands it to pool 2',pools:[one(0,200n,{fee:30}),one(0),one(10)],pick:2},
  {name:'fee beats price: 100 bps at the best bin loses to 0 bps 5 bins worse',pools:[one(0,200n,{fee:100}),one(5),one(20)],pick:2},
  {name:'small fee does not beat price: 5 bps best bin wins over 0 bps 5 bins worse',pools:[one(0,200n,{fee:5}),one(5),one(20)],pick:1},
  // ties go to the lower number, even when the higher one is deeper
  {name:'tie 1 = 2 (pool 2 deeper) goes to pool 1',pools:[one(0),one(0,200n,{depth:3000n}),one(10)],pick:1},
  {name:'tie 2 = 3 (pool 3 deeper) goes to pool 2',pools:[one(10),one(0),one(0,200n,{depth:3000n})],pick:2},
  {name:'tie 1 = 3 (pool 3 deeper) goes to pool 1',pools:[one(0),one(10),one(0,200n,{depth:3000n})],pick:1},
  {name:'three-way tie goes to pool 1',pools:[one(0),one(0,200n,{depth:2000n}),one(0,200n,{depth:3000n})],pick:1},
  // 1% floor on ledger depth: pool 3 pays most; pool 2 is deepest (10,000)
  {name:'floor: best-paying pool at 0.99% of the deepest is excluded',pools:[one(10,200n,{depth:5000n}),one(20,200n,{depth:10000n}),{a:0,bins:[[0,99n]]}],pick:1},
  {name:'floor: best-paying pool one base unit under 1% is excluded',pools:[one(10,200n,{depth:5000n}),one(20,200n,{depth:10000n}),{a:0,bins:[[0,99n]],depth:100n,minus:1n}],pick:1},
  {name:'floor: best-paying pool at exactly 1% is eligible and wins',pools:[one(10,200n,{depth:5000n}),one(20,200n,{depth:10000n}),{a:0,bins:[[0,100n]]}],pick:3},
  {name:'floor: best-paying pool with a zero ledger is excluded',pools:[one(10,200n,{depth:5000n}),one(20,200n,{depth:10000n}),one(0,200n,{depth:0n})],pick:1},
  // two eligible pools with the third excluded, either of the first two
  {name:'pool 1 excluded (zero ledger), 2 and 3 compared',pools:[one(0,200n,{depth:0n}),one(10),one(0)],pick:3},
  {name:'pool 2 excluded (zero ledger), 1 and 3 compared',pools:[one(10),one(0,200n,{depth:0n}),one(0)],pick:3},
  // the walk stops at the edge bin (id 1000 selling sBTC, 0 selling STX):
  // pool 1 sits 10 bins from it and pays its 40 there; the leg fills part
  {name:'walk stops at the edge bin; edge pool pays most',pools:[{a:490,iy:2_200_000n,bins:[[0,20n],[10,20n]]},one(0,10n),one(0,10n)],pick:1},
  // a pool with another bin step is not priced (u0)
  {name:'pool 1 at bin step 10 cannot win; best u15 payout does',pools:[one(0,200n,{step:10}),one(20),one(10)],pick:3},
  {name:'pool 2 at bin step 10 cannot win; tie of 1 = 3 to pool 1',pools:[one(10),one(0,200n,{step:10}),one(10)],pick:1},
  {name:'no pool at bin step 15: every payout u0, pool 1',pools:[one(20,200n,{step:10}),one(10,200n,{step:10}),one(0,200n,{step:10})],pick:1},
  // single eligible pool: used as is, no factor read (the list is poisoned)
  {name:'only pool 2 holds the bought asset',pools:[one(0,200n,{depth:0n}),one(20),one(0,200n,{depth:0n})],pick:2,noFactorRead:true},
  {name:'only pool 3 clears the floor',pools:[{a:0,bins:[[0,99n]]},one(0,200n,{depth:0n}),one(20,200n,{depth:10000n})],pick:3,noFactorRead:true},
  {name:'only pool 1 clears the floor',pools:[one(20,200n,{depth:10000n}),{a:0,bins:[[0,99n]]},{a:0,bins:[[0,98n]]}],pick:1,noFactorRead:true},
  // a pool holding only the sold asset (one-sided) is skipped on its empty
  // side and used from its full side
  {name:'skips a one-sided pool on its empty side',pools:[{a:0,bins:[]},{a:0,bins:[],sold:100000n},one(20)],pick:3,noFactorRead:true},
  {name:'uses a one-sided pool on its full side',pools:[{a:0,bins:[]},one(20,200n,{depth:100000n}),{a:0,bins:[],sold:200n}],pick:2,noFactorRead:true},
];

for (const s of ['x','y'] as const) describe(`dlmm-pick ${s==='x'?'selling sBTC':'selling STX'}`,()=>{
  for (const c of cases) for (const route of ['manual','smart'] as const) it(`${route}: ${c.name}`,()=>{
    const amount=(c.amount??100n)*h.amount(s)/100n;
    expect(model(s,c.pools,amount)).toBe(c.pick);
    setup(s,c.pools);
    if (c.noFactorRead) poison();
    if (route==='manual') manualLeg(s,c,c.pick); else smartLeg(s,c,c.pick);
  });
  // Control for the poisoned list: with two eligible pools the pick reads
  // it and the call aborts.
  for (const route of ['manual','smart'] as const) it(`${route}: two eligible pools read the core factor list`,()=>{
    setup(s,[one(0),one(10),one(0,200n,{depth:0n})]);
    poison();
    const run=()=>route==='manual' ? h.manual(s,{amms:[h.amount(s)],update:h.N}) : h.smart(s,h.amount(s),h.quote(s),h.N);
    expect(run).toThrow();
    expect(calls()).toEqual([0n,0n,0n]);
  });
  // No pool holds the bought asset: the pick is u1 with no factor read and
  // the leg fills nothing. Pools 2 and 3 report bins they cannot pay (empty
  // ledger), so picking either would size a sale that then fails; pool 1's
  // bins are empty, so its capacity is zero and no pool is called.
  it('smart: all three pools empty picks pool 1 and fills nothing',()=>{
    setup(s,[{a:0,bins:[]},one(0,200n,{depth:0n}),one(0,200n,{depth:0n})]);
    poison();
    const n=h.amount(s),before=h.wallet(s);
    const receipt=h.smart(s,n,h.quote(s),h.N),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['dlmm-cap']).toBe(0n);
    expect(calls()).toEqual([0n,0n,0n]);
    expect(r['dlmm-in']).toBe(0n);
    expect(r.out).toBe(0n);
    expect(r.unsold).toBe(n);
    h.conservation(s,before,r,n);
  });
  it('rolls back the picked pool when the wallet minimum fails',()=>{
    setup(s,[one(10),one(0),one(20)]);
    h.reject(()=>h.manual(s,{amms:[h.amount(s)],update:h.N,minOut:MAX}),3002);
  });
});
