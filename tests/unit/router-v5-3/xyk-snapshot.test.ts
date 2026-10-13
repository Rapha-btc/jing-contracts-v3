import {beforeEach,describe,it,expect} from 'vitest';
import {Cl,cvToString} from '@stacks/transactions';
import * as h from './helpers';

// Differential suite for the XYK pool-snapshot change (Blazing Haven, bounty
// muqchqnaa54e769598a4, submission muzipzref76939675f71). `router` reads the
// XYK pool once per smart CP stage (xyk-quote) and hands the reserves, fees
// and pool side to cp-capacity and to the XYK swap; `router-ref` is the same
// source with the change reversed (xyk-ref.mjs: xyk-keep, xyk-reserves and
// xyk-swap each read the pool). Each scenario runs on both, each on a fresh
// simnet (the ref run first), and the second run must match the first
// exactly: the result, every event (the router's own principal normalised),
// the CP split in the print, the user's balances and every XYK / Velar
// fixture variable (reserves, swap counter, last input and minimum).
beforeEach(h.init);
const SIDES = ['x','y'] as const;
type Run = {result:string,events:string,venues:string,wallet:string};
const runs = new Map<string,Run>();
const vars = ['sats','microstx','calls','last-in','last-min','reverse','fee-x','fee-y'];
function capture(router:string,r:ReturnType<typeof h.call>):Run {
  const norm = (t:string) => t.split(h.principal(router)).join(h.principal('router'));
  return {
    result: cvToString(r.result),
    events: norm(JSON.stringify(r.events,(_,v)=>typeof v==='bigint'?v.toString():v)),
    venues: JSON.stringify(['xyk','velar'].map(v=>vars.map(n=>cvToString(simnet.getDataVar(v,n))))),
    wallet: JSON.stringify([h.balance('x'),h.balance('y'),h.balance('x',h.principal(router)),h.balance('y',h.principal(router))].map(String)),
  };
}
const smart = (router:string,s:h.Side,n:bigint,limit:bigint,minOut=0n) =>
  h.call(router,s==='x'?'smart-swap-sbtc-for-stx':'smart-swap-stx-for-sbtc',[h.U(n),h.U(limit),h.N,h.U(h.P),h.U(minOut)],h.user);
const manual = (router:string,s:h.Side,o:{jing?:bigint,amms:bigint[],mins?:bigint[],fallback?:number,update?:any}) => {
  const jing=o.jing??0n,total=jing+o.amms.reduce((a,b)=>a+b,0n);
  return h.call(router,s==='x'?'swap-sbtc-for-stx':'swap-stx-for-sbtc',[h.U(total),h.U(jing),h.U(h.quote(s)),o.update??h.N,
    o.fallback===undefined?h.N:Cl.some(h.U(o.fallback)),h.tuple(o.amms),h.tuple(o.mins),h.U(0)],h.user);
};
// venues at 100 uSTX per sat (the fixture default); `xyk` / `velar` give
// [sats, uSTX, reversed, fee-x, fee-y] or null for an unconfigured pool
type Venue = [bigint,bigint,boolean,number,number]|null;
type Case = {name:string,xyk:Venue,velar:Venue,run:(router:string,s:h.Side)=>ReturnType<typeof h.call>,ok:boolean};
const STD:Venue = [1_000_000n,100_000_000n,false,30,50];
const REV:Venue = [1_000_000n,100_000_000n,true,50,30];
const THIN:Venue = [20_000n,2_000_000n,false,0,0];
// limits per side: loose (all room), tight (a little room), none (no room)
const loose = (s:h.Side) => h.quote(s);
const tight = (s:h.Side) => s==='x' ? h.P*99n/100n : h.P*101n/100n;
const none = (s:h.Side) => s==='x' ? h.P*2n : h.P/2n;
const cases:Case[] = [
  {name:'smart, loose limit, both pools: pro-rata split, nothing unsold',xyk:STD,velar:STD,run:(r,s)=>smart(r,s,h.amount(s),loose(s)),ok:true},
  {name:'smart, tight limit, both pools: each to its cap, the rest unsold',xyk:STD,velar:STD,run:(r,s)=>smart(r,s,h.amount(s)*20n,tight(s)),ok:true},
  {name:'smart, tight limit, reversed XYK with asymmetric fees',xyk:REV,velar:STD,run:(r,s)=>smart(r,s,h.amount(s)*20n,tight(s)),ok:true},
  {name:'smart, loose limit, reversed XYK, uneven depths',xyk:REV,velar:THIN,run:(r,s)=>smart(r,s,h.amount(s),loose(s)),ok:true},
  {name:'smart, limit no pool respects: caps u0, all unsold',xyk:STD,velar:STD,run:(r,s)=>smart(r,s,h.amount(s),none(s)),ok:true},
  {name:'smart, XYK alone (Velar empty)',xyk:STD,velar:null,run:(r,s)=>smart(r,s,h.amount(s),loose(s)),ok:true},
  {name:'smart, Velar alone (XYK empty): no XYK swap',xyk:null,velar:STD,run:(r,s)=>smart(r,s,h.amount(s),loose(s)),ok:true},
  {name:'smart, a few units of XYK room: dust XYK leg dropped',xyk:THIN,velar:STD,run:(r,s)=>smart(r,s,s==='x'?3n:300n,loose(s)),ok:true},
  {name:'smart, dust amount: early exit, no pool read',xyk:STD,velar:STD,run:(r,s)=>smart(r,s,1n,loose(s)),ok:true},
  {name:'smart, wallet minimum one over: refused, rolled back',xyk:STD,velar:STD,run:(r,s)=>smart(r,s,h.amount(s),loose(s),10n**15n),ok:false},
  {name:'manual, XYK leg alone',xyk:STD,velar:null,run:(r,s)=>manual(r,s,{amms:[0n,h.amount(s),0n]}),ok:true},
  {name:'manual, XYK leg alone, reversed pool',xyk:REV,velar:null,run:(r,s)=>manual(r,s,{amms:[0n,h.amount(s),0n]}),ok:true},
  {name:'manual, XYK minimum over its output: refused',xyk:STD,velar:null,run:(r,s)=>manual(r,s,{amms:[0n,h.amount(s),0n],mins:[0n,10n**12n,0n]}),ok:false},
  {name:'manual, refused book (no maker) on fallback XYK',xyk:REV,velar:null,run:(r,s)=>manual(r,s,{jing:h.amount(s),amms:[0n,0n,0n],fallback:2,update:h.UPDATE}),ok:true},
];
function arrange(c:Case) {
  for (const [v,cfg] of [['xyk',c.xyk],['velar',c.velar]] as const) {
    if (!cfg) continue;
    h.fund(v);h.config(v,cfg[0],cfg[1],cfg[2],cfg[3],cfg[4]);
  }
}
for (const s of SIDES) describe(`xyk snapshot differential ${s==='x'?'selling sBTC':'selling STX'}`,()=>{
  for (const c of cases) for (const router of ['router-ref','router']) it(`${router}: ${c.name}`,()=>{
    arrange(c);
    const r=c.run(router,s);
    expect(r.result.type).toBe(c.ok?'ok':'err');
    const key=`${s}:${c.name}`,got=capture(router,r);
    if (router==='router-ref') {runs.set(key,got);return;}
    const ref=runs.get(key);
    expect(ref,'reference run missing').toBeDefined();
    expect(got).toEqual(ref);
    // the CP split (xyk-cap / velar-cap / legs) rides in the router print,
    // compared above with every other event
    if (c.ok && c.name.startsWith('smart')) expect(Object.keys(h.routerPrint(r))).toContain('xyk-cap');
  });
});
