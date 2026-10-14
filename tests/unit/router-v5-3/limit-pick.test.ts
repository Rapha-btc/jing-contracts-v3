import {describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

// Bounty mv7dfb (Zealous Citadel): the smart DLMM stage ranked pools with a
// limit-blind 30-bin walk, then sized on the winner with dlmm-capacity at the
// limit. A deep pool parked past the limit outranked an in-range pool that
// runs out inside 30 bins: its capacity was 0, so DLMM sold nothing.
// Fix: dlmm-stage passes its limit to dlmm-pick, and each dlmm-out walk stops
// at the first bin that fails dlmm-capacity's fee-adjusted threshold
// (dlmm-threshold, one formula for both). Manual legs pass u0 (no limit), so
// their pick is unchanged.
//
// Pools run venues.clar in bin-walk mode (see dlmm-pick.test.ts). Every pool
// here has its active bin at 0, bin step 15, initial price 1e6. The limit
// sits halfway between offsets 10 and 11 in the walk direction, so offset 10
// is inside the limit and offset 11 is past it (fee 0).

type Side = h.Side;
type Pool = {fee?:number,bins:[number,bigint][],depth?:bigint,off?:boolean,moved?:boolean};
const MAX = 340282366920938463463374607431768211455n;
const up = (s:Side) => s==='x';
const pct = (s:Side) => s==='x' ? 10_000n : 100n;
const binId = (s:Side,o:number) => up(s) ? o : -o;
const price = (bin:number) => (1_000_000n*10000n+1_000_000n*15n*BigInt(bin))/10000n;
const liq = (s:Side,p:Pool,bin:number) => {const hit=p.bins.find(([o])=>binId(s,o)===bin);return hit?hit[1]*pct(s):0n;};
const sum = (b:[number,bigint][]) => b.reduce((t,[,l])=>t+l,0n);
const depth = (s:Side,p:Pool) => (p.depth??sum(p.bins))*pct(s);
// caller limit: threshold halfway between offsets 10 and 11
const LIMIT = (s:Side) => h.SCALE*100_000_000n/((price(binId(s,10))+price(binId(s,11)))/2n);
// router dlmm-threshold; u0 limit = no bound
function threshold(s:Side,limit:bigint,fee:bigint) {
  if (limit===0n) return up(s)?MAX:0n;
  const base=h.SCALE*100_000_000n/limit;
  return up(s)?base*(10000n-fee)/10000n:base*10000n/(10000n-fee);
}
const inside = (s:Side,pr:bigint,thr:bigint) => up(s)?pr<=thr:pr>=thr;
const raw = (s:Side,avail:bigint,pr:bigint) => up(s)?(avail*pr+99_999_999n)/100_000_000n:(avail*100_000_000n+pr-1n)/pr;
// router dlmm-out: the walk stops at the first bin past the threshold
function walk(s:Side,p:Pool,amount:bigint,limit=0n) {
  const fee=BigInt(p.fee??0),thr=threshold(s,limit,fee);let left=amount,out=0n;
  for (let i=0;i<30&&left>0n;i++) {
    const bin=binId(s,i),pr=price(bin),avail=liq(s,p,bin);
    if (!inside(s,pr,thr)) break;
    const r=raw(s,avail,pr),grossed=fee>0n?r*10000n/(10000n-fee):r;
    if (left>=grossed) {out+=avail;left-=grossed;}
    else {const net=left*(10000n-fee)/10000n;out+=up(s)?net*100_000_000n/pr:net*pr/100_000_000n;left=0n;}
  }
  return {in:amount-left,out};
}
// router dlmm-capacity
function capacity(s:Side,p:Pool,limit:bigint) {
  const fee=BigInt(p.fee??0),thr=threshold(s,limit,fee);let cap=0n;
  for (let i=0;i<30;i++) {
    const bin=binId(s,i),pr=price(bin);
    if (!inside(s,pr,thr)) break;
    const r=raw(s,liq(s,p,bin),pr);cap+=fee>0n?r*10000n/(10000n-fee):r;
  }
  return cap;
}
// the pick rule; limit u0 = the pre-fix (and manual) ranking
function pick(s:Side,pools:Pool[],amount:bigint,limit:bigint) {
  const d=pools.map(p=>p.off||p.moved?0n:depth(s,p)),floor=d.reduce((m,x)=>x>m?x:m,0n)/100n;
  const e=d.map(x=>x>0n&&x>=floor);
  if (e.filter(Boolean).length<2) return e[1]?2:e[2]?3:1;
  const o=pools.map((p,i)=>e[i]?walk(s,p,amount,limit).out:0n);
  return o[0]>=o[1]&&o[0]>=o[2]?1:o[1]>=o[2]?2:3;
}

const IDS = [6,15,16];
function setup(s:Side,pools:Pool[]) {
  h.init();
  h.pools.forEach((name,i)=>{
    const p=pools[i];
    h.config(name,0n,0n,false,p.fee??0,p.fee??0);
    h.ok(h.call(name,'configure-dlmm',[Cl.int(0),h.U(1_000_000n),h.U(15),h.U(MAX)]));
    for (const [o,l] of p.bins) h.ok(h.call(name,'set-bin',[Cl.int(binId(s,o)),h.U(up(s)?l*pct(s):0n),h.U(up(s)?0n:l*pct(s))]));
    if (!p.bins.length) h.ok(h.call(name,'set-bin',[Cl.int(0),h.U(0),h.U(0)]));
    if (s==='x') h.fund(name,0n,depth(s,p)); else h.fund(name,depth(s,p),0n);
    if (p.off) h.ok(h.call('dlmm-router','set-pool-status',[h.U(IDS[i]),Cl.bool(false)]));
    // migrated to another core: the core entry stays enabled (Giant Moth 01)
    if (p.moved) h.ok(h.call(name,'set-core',[Cl.principal(h.principal('xyk'))]));
  });
}
const calls = () => h.pools.map(p=>h.value(simnet.getDataVar(p,'calls')));
const used = (n:number) => [1,2,3].map(i=>i===n?1n:0n);
const none:Pool = {bins:[],depth:0n};

function smartLeg(s:Side,pools:Pool[],want:number) {
  const n=h.amount(s),limit=LIMIT(s),before=h.wallet(s),p=pools[want-1];
  const cap=capacity(s,p,limit),plan=cap<n?cap:n,w=walk(s,p,plan);
  const receipt=h.smart(s,n,limit,h.N),r=h.ok(receipt);
  expect(h.routerPrint(receipt)['dlmm-cap']).toBe(cap);
  expect(calls()).toEqual(cap>0n?used(want):[0n,0n,0n]);
  expect(r['dlmm-in']).toBe(w.in);
  expect(r['dlmm-out']).toBe(w.out);
  expect(r.unsold).toBe(n-w.in);
  h.conservation(s,before,r,n);
  return r;
}

// pool 1: 40 units inside the limit (offsets 0 and 5), runs out early.
// pool 2: deep (50x, pool 1 stays above the 1% floor), parked at offset 20
// (past the limit); its unlimited walk pays
// more than pool 1's 40, so the limit-blind pick chose it and sold nothing.
const IN_RANGE:Pool = {bins:[[0,20n],[5,20n]]};
const PARKED:Pool = {bins:[[20,2000n]]};
type Case = {name:string,pools:Pool[],blind:number,fixed:number};
const cases:Case[] = [
  {name:'deep pool 2 past the limit vs in-range pool 1',pools:[IN_RANGE,PARKED,none],blind:2,fixed:1},
  {name:'deep pool 1 past the limit vs in-range pool 3',pools:[PARKED,none,IN_RANGE],blind:1,fixed:3},
  {name:'pool 2 has 10 inside the limit, pool 1 has 40',pools:[IN_RANGE,{bins:[[8,10n],[20,2000n]]},none],blind:2,fixed:1},
  // bin at offset 10 is inside, offset 11 is past: pool 2's 50 at offset 11
  // does not count, pool 1's 40 at offset 10 does
  {name:'boundary: offset 10 counts, offset 11 does not',pools:[{bins:[[10,40n]]},{bins:[[11,50n]]},none],blind:2,fixed:1},
  // fee shrinks the threshold (selling sBTC) or grows it (selling STX) as in
  // dlmm-capacity: at 30 bps pool 2's bin at offset 9 falls past the limit
  {name:'fee: 30 bps pushes pool 2\'s offset-9 bin past the limit',pools:[{bins:[[0,20n]]},{fee:30,bins:[[9,60n]]},none],blind:2,fixed:1},
  // the parked pool still wins when it pays more inside the limit
  {name:'pool 2 pays more inside the limit and still wins',pools:[IN_RANGE,{bins:[[0,60n],[20,2000n]]},none],blind:2,fixed:2},
];

for (const s of ['x','y'] as const) describe(`limit-aware DLMM pick ${s==='x'?'selling sBTC':'selling STX'}`,()=>{
  it('limit sits between offsets 10 and 11, fee 0',()=>{
    const thr=threshold(s,LIMIT(s),0n);
    expect(inside(s,price(binId(s,10)),thr)).toBe(true);
    expect(inside(s,price(binId(s,11)),thr)).toBe(false);
  });
  for (const c of cases) {
    it(`smart: ${c.name}`,()=>{
      const n=h.amount(s);
      expect(pick(s,c.pools,n,0n)).toBe(c.blind);
      expect(pick(s,c.pools,n,LIMIT(s))).toBe(c.fixed);
      setup(s,c.pools);
      const r=smartLeg(s,c.pools,c.fixed);
      expect(r['dlmm-in']).toBeGreaterThan(0n);
    });
    // manual legs pass u0: the pick is the limit-blind one, as before
    it(`manual (no limit): ${c.name}`,()=>{
      const a=h.amount(s),w=walk(s,c.pools[c.blind-1],a);
      setup(s,c.pools);
      const before=h.wallet(s),r=h.ok(h.manual(s,{amms:[a],update:h.N}));
      expect(calls()).toEqual(used(c.blind));
      expect(r['dlmm-in']).toBe(w.in);
      expect(r['dlmm-out']).toBe(w.out);
      h.conservation(s,before,r,a);
    });
  }
  // What the pre-fix pick did: with the parked pool chosen, capacity is 0.
  it('pre-fix outcome: capacity on the parked pool is 0',()=>{
    expect(capacity(s,PARKED,LIMIT(s))).toBe(0n);
    expect(capacity(s,IN_RANGE,LIMIT(s))).toBeGreaterThan(0n);
  });
  // Control: with pool 2 disabled only pool 1 is eligible (no walk). The
  // fixed pick (first case) fills exactly this.
  it('control: pool 2 disabled fills what the fixed pick fills',()=>{
    const pools=[IN_RANGE,{...PARKED,off:true},none],cap=capacity(s,IN_RANGE,LIMIT(s));
    setup(s,pools);
    const r=smartLeg(s,pools,1);
    expect(r['dlmm-out']).toBe(walk(s,IN_RANGE,cap<h.amount(s)?cap:h.amount(s)).out);
  });
  // Nothing inside the limit anywhere: every limited payout is 0, the tie
  // goes to pool 1, whose capacity is 0: nothing is sold, no revert.
  it('smart: no pool inside the limit sells nothing',()=>{
    const pools=[{bins:[[15,500n]]},PARKED,none] as Pool[];
    expect(pick(s,pools,h.amount(s),LIMIT(s))).toBe(1);
    setup(s,pools);
    const r=smartLeg(s,pools,1);
    expect(r['dlmm-in']).toBe(0n);
  });
});

// Bounty mv7dfb, Giant Moth note 01: Bitflow's migrate-pool (dlmm-core-v-1-1)
// moves a pool's core-address to the new core but leaves the old core's
// `pools` entry enabled. Every pool swap asserts the caller is its
// core-address (u1060), so a pick of a migrated pool reverted the whole
// smart swap. dlmm-enabled also requires the pool's core-address to be
// DLMM_CORE: a migrated pool has depth 0, is never picked, and a migrated
// pool 1 (the no-eligible-pool fallback) gets no capacity.
for (const s of ['x','y'] as const) describe(`migrated DLMM pool ${s==='x'?'selling sBTC':'selling STX'}`,()=>{
  const BEST:Pool = {bins:[[0,60n]]};
  it('fixture: every pool reports the router core (DLMM_CORE) by default',()=>{
    h.init();
    for (const p of h.pools) expect(h.ro(p,'get-pool')['core-address']).toBe(h.principal('dlmm-router'));
  });
  it('control: pool 2 (core = DLMM_CORE) wins the pick',()=>{
    const pools=[IN_RANGE,BEST,none];
    expect(pick(s,pools,h.amount(s),LIMIT(s))).toBe(2);
    setup(s,pools);
    smartLeg(s,pools,2);
  });
  for (const route of ['smart','manual'] as const) it(`${route}: migrated pool 2 is not picked, pool 1 sells`,()=>{
    const pools=[IN_RANGE,{...BEST,moved:true},none];
    expect(pick(s,pools,h.amount(s),LIMIT(s))).toBe(1);
    setup(s,pools);
    if (route==='smart') {
      const r=smartLeg(s,pools,1);
      expect(r['dlmm-in']).toBeGreaterThan(0n);
    } else {
      const a=h.amount(s),w=walk(s,IN_RANGE,a),before=h.wallet(s);
      const r=h.ok(h.manual(s,{amms:[a],update:h.N}));
      expect(calls()).toEqual(used(1));
      expect(r['dlmm-out']).toBe(w.out);
      h.conservation(s,before,r,a);
    }
  });
  it('smart: migrated pool 1 loses to pool 3',()=>{
    const pools=[{...BEST,moved:true},none,IN_RANGE];
    expect(pick(s,pools,h.amount(s),LIMIT(s))).toBe(3);
    setup(s,pools);
    smartLeg(s,pools,3);
  });
  // only pool 1 holds liquidity and it is migrated: the u1 pick is the
  // fallback, its capacity is 0, nothing is sold and the swap does not revert
  it('smart: only pool 1 holds liquidity and is migrated: no capacity, no revert',()=>{
    const pools=[{...BEST,moved:true},none,none];
    setup(s,pools);
    const n=h.amount(s),before=h.wallet(s),receipt=h.smart(s,n,LIMIT(s),h.N),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['dlmm-cap']).toBe(0n);
    expect(calls()).toEqual([0n,0n,0n]);
    expect(r['dlmm-in']).toBe(0n);
    expect(r.unsold).toBe(n);
    h.conservation(s,before,r,n);
  });
});
