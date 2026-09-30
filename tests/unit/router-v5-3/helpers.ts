import {expect} from 'vitest';
import {Cl, type ClarityValue} from '@stacks/transactions';
import fs from 'node:fs';
export type Side = 'x' | 'y';
export const accounts = simnet.getAccounts();
export const owner = accounts.get('deployer')!;
export const maker = accounts.get('wallet_1')!;
export const user = accounts.get('wallet_2')!;
export const P = 1_000_000_000_000n, SCALE = 10_000_000_000n;
// Placeholder EVM envelope and payload; the local oracle controls decoded feeds.
export const U = Cl.uint, N = Cl.none(), UPDATE = Cl.some(Cl.bufferFromHex('00'.repeat(72)));
export const venues = ['dlmm','xyk','velar'] as const;
export const principal = (c:string) => `${owner}.${c}`;
export const token = Cl.principal(principal('token')), stx = Cl.principal(principal('asset-stx'));
export function value(cv:any):any {
  if (cv.type === 'uint' || cv.type === 'int') return BigInt(cv.value);
  if (cv.type === 'tuple') return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,value(v)]));
  if (cv.type === 'list') return cv.value.map(value);
  if (cv.type === 'ok' || cv.type === 'some') return value(cv.value);
  if (cv.type === 'none') return null;
  if (cv.type === 'true' || cv.type === 'false') return cv.type === 'true';
  return cv.value;
}
export function call(c:string, fn:string, args:ClarityValue[]=[], who=owner) {return simnet.callPublicFn(c,fn,args,who);}
export function ro(c:string,fn:string,args:ClarityValue[]=[]) {return value(simnet.callReadOnlyFn(c,fn,args,user).result);}
export function ok(r:ReturnType<typeof call>) {expect(r.result.type).toBe('ok'); return value(r.result);}
export function err(r:ReturnType<typeof call>,code:number) {expect(r.result).toEqual(Cl.error(U(code)));expect(r.events).toEqual([]);}
export function balance(s:Side,who=user):bigint {
  return s==='x' ? ro('token','get-balance',[Cl.principal(who)]) : simnet.getAssetsMap().get('STX')?.get(who) ?? 0n;
}
export const other = (s:Side):Side => s==='x'?'y':'x';
export const amount = (s:Side) => s==='x'?10000n:1000000n;
export const quote = (s:Side) => s==='x'?P/2n:P*2n;
export function init() {
  ok(call('jing-core-v6','set-verified-contract',[Cl.principal(principal('market'))]));
  ok(call('market','initialize',[Cl.principal(principal('market')),token,stx,U(100),U(10000),U(1),U(45)]));
  for (const who of [maker,user]) ok(call('token','mint',[U(10_000_000_000n),Cl.principal(who)]));
}
export function book(s:Side,n=amount(other(s))) {
  const asset=other(s)==='x'?token:stx, name=other(s)==='x'?'token':'wstx';
  ok(call('market',`deposit-token-${other(s)}`,[U(n),U(quote(s)),N,asset,Cl.stringAscii(name)],maker));
}
export function config(v:string,sats=1_000_000n,microstx=100_000_000n,reverse=false,fx=0,fy=fx) {
  ok(call(v,'configure',[U(sats),U(microstx),Cl.bool(reverse),U(fx),U(fy)]));
}
export function fund(v:string,sats=100_000_000n,microstx=10_000_000_000n) {
  if(sats) ok(call('token','mint',[U(sats),Cl.principal(principal(v))]));
  if(microstx) expect(simnet.transferSTX(microstx,principal(v),owner).result).toEqual(Cl.ok(Cl.bool(true)));
}
export const tuple = (a:bigint[]=[]) => Cl.tuple(Object.fromEntries(venues.map((v,i)=>[v,U(a[i]??0n)])));
export function manual(s:Side,opts:{total?:bigint,jing?:bigint,limit?:bigint,update?:ClarityValue,fallback?:number,amms?:bigint[],mins?:bigint[],minOut?:bigint}={}) {
  const jing=opts.jing??0n, amms=opts.amms??[];
  return call('router',s==='x'?'swap-sbtc-for-stx':'swap-stx-for-sbtc',[
    U(opts.total??jing+amms.reduce((a,b)=>a+b,0n)),U(jing),U(opts.limit??quote(s)),opts.update??UPDATE,
    opts.fallback===undefined?N:Cl.some(U(opts.fallback)),tuple(amms),tuple(opts.mins),U(opts.minOut??0n)],user);
}
export function smart(s:Side,n:bigint,limit=quote(s),update=UPDATE,mid=P,minOut=0n) {
  return call('router',s==='x'?'smart-swap-sbtc-for-stx':'smart-swap-stx-for-sbtc',[U(n),U(limit),update,U(mid),U(minOut)],user);
}
export function routerPrint(r:ReturnType<typeof call>) {
  return value(r.events.find(e=>e.event==='print_event'&&e.data.contract_identifier===principal('router'))!.data.value);
}
export const net = (gross:bigint,bps=20n) => gross*10000n/(10000n+bps);
export const gross = (n:bigint,bps=20n) => (n*(10000n+bps)+9999n)/10000n;
export const cpOut = (n:bigint,rin:bigint,rout:bigint,fee=0n) => {const a=n*(10000n-fee)/10000n;return rout*a/(rin+a);};
export function conservation(s:Side,before:{sold:bigint,bought:bigint},r:any,total:bigint) {
  const spent=['jing','dlmm','xyk','velar'].reduce((a,v)=>a+r[`${v}-in`],0n);
  expect(before.sold-balance(s)).toBe(spent);
  expect(balance(other(s))-before.bought).toBe(r.out);
  expect(spent+r.unsold).toBe(total);
  expect(balance('x',principal('router'))).toBe(0n);
  expect(balance('y',principal('router'))).toBe(0n);
}
export const wallet = (s:Side) => ({sold:balance(s),bought:balance(other(s))});
// Snapshot every variable plus book history/maps and core equity for all test
// accounts. A rejected transaction advances the clock but must restore state.
export function state() {
  const sources:Record<string,string>={market:'contracts/markets-sbtc-stx-jing-v6-3.clar','jing-core-v6':'contracts/jing-core-v6.clar',...Object.fromEntries(venues.map(v=>[v,'tests/unit/router-v5-3/venues.clar']))};
  const variables=Object.fromEntries(Object.entries(sources).map(([c,p])=>[c,Object.fromEntries([...fs.readFileSync(p,'utf8').matchAll(/\(define-data-var\s+([^\s]+)/g)].map(m=>[m[1],simnet.getDataVar(c,m[1])]))]));
  const people=[...accounts.values(),...['market','router',...venues].map(principal)];
  const maps:Record<string,unknown>={};
  const read=(name:string,key:ClarityValue)=>{try{return simnet.getMapEntry('market',name,key);}catch(e){if(String(e)==='value not found')return N;throw e;}};
  const cycle=Number(ro('market','get-current-cycle'));
  for(let c=0;c<=cycle+1;c++) {
    for(const m of ['cycle-totals','settlements','token-x-depositor-list','token-y-depositor-list']) maps[`${m}:${c}`]=read(m,U(c));
    for(const who of people) for(const s of ['x','y']) maps[`${s}:${c}:${who}`]=read(`token-${s}-deposits`,Cl.tuple({cycle:U(c),depositor:Cl.principal(who)}));
  }
  for(const who of people) for(const s of ['x','y']) for(const m of ['deposit-limits','pending-deposits','pending-limits','pending-readmits','parked']) maps[`${s}:${m}:${who}`]=read(`token-${s}-${m}`,Cl.principal(who));
  const equity=[token,stx].map(t=>({total:ro('jing-core-v6','get-total-token-equity',[t]),owners:people.map(who=>ro('jing-core-v6','get-token-equity',[t,Cl.principal(who)]))}));
  const assets=[...simnet.getAssetsMap()].map(([a,bs])=>[a,[...bs].sort()]).sort();
  return JSON.stringify({variables,maps,equity,assets},(_,v)=>typeof v==='bigint'?v.toString():v);
}
export function reject(action:()=>ReturnType<typeof call>,code:number) {const before=state();err(action(),code);expect(state()).toBe(before);}
