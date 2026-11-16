import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import {boot,simnet,owner,accounts,names} from '../lab';
import {profiles,type Pair} from './profiles';
const U=Cl.uint,update=Cl.bufferFromHex('00'.repeat(72)),assetName=Cl.stringAscii('token');
const value=(v:any):any=>v.type==='ok'||v.type==='some'?value(v.value):v.type==='uint'?BigInt(v.value):v.type==='tuple'?Object.fromEntries(Object.entries(v.value).map(([k,x])=>[k,value(x)])):v.type==='list'?v.value.map(value):v.value;
const pc=(c:string)=>Cl.contractPrincipal(owner,names[c]??c);
const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who);
const read=(c:string,f:string,a:any[]=[])=>value(simnet.callReadOnlyFn(c,f,a,owner).result);
const ok=(r:any)=>{expect(r.result.type,Cl.prettyPrint(r.result)).toBe('ok');return value(r.result);};
const maker=accounts.get('wallet_1')!,taker=accounts.get('wallet_2')!;
const supply=()=>[...simnet.getAssetsMap()].map(([asset,b]:any)=>[asset,[...b.values()].reduce((a:bigint,n:any)=>a+n,0n)]);
async function setup(pair:Pair){
 await boot({routers:true});const p=profiles[pair];
 ok(call('jing-core-v6','set-verified-contract',[pc(p.market)]));
 ok(call(p.market,'initialize',[pc(p.market),pc(p.x),pc(p.y),U(p.xMinimum),U(p.yMinimum),...p.feeds.map(U)]));
 ok(call('oracle','configure-feed-ids',p.feeds.map(U)));ok(call('oracle','set-mid',[U(p.mid)]));
 for(const who of [maker,taker])for(const token of [p.x,p.y])if(token!=='asset-stx')ok(call(token,'mint',[U(1000000000000n),Cl.principal(who)]));
 return p;
}
for(const pair of Object.keys(profiles) as Pair[]){
 const routers=pair==='sbtc-usdcx'?['swap-router-sbtc-usdcx-jing-v5-6']:['swap-router-stx-usdcx-jing-v5-5','swap-router-stx-usdcx-jing-v6'];
 for(const router of routers)for(const x of [true,false])for(const smart of [false,true])it(`${router} ${smart?'smart':'manual'} ${x?'x to y':'y to x'}: funded swap, exact net proceeds, min-out rollback`,async()=>{
  const p=await setup(pair),side=x?'y':'x',token=x?p.y:p.x,amount=x?p.xAmount:p.yAmount;
  ok(call(p.market,`deposit-token-${side}`,[U(2n*(x?p.yAmount:p.xAmount)),U(p.mid),Cl.none(),pc(token),assetName],maker));
  if(read(p.market,`get-token-${side}-pending-deposit`,[Cl.principal(maker)]))ok(call(p.market,`settle-token-${side}-deposit`,[Cl.principal(maker),update,pc(token),assetName]));
  // Input includes a 20-bps maker rebate: net = floor(input * 10000 / 10020).
  // The 10-bps protocol fee is floored on output after conversion.
  const traded=amount*10000n/10020n;
  const gross=x?traded*p.mid/(100000000n*p.decimalFactor):traded*100000000n*p.decimalFactor/p.mid;
  const expected=gross-gross*10n/10000n,limit=x?p.mid/2n:p.mid*2n;
  const ticker=pair==='sbtc-usdcx'?'sbtc':'stx',fn=`${smart?'smart-':''}swap-${x?ticker:'usdcx'}-for-${x?'usdcx':ticker}`;
  const zero=Cl.tuple({dlmm:U(0),xyk:U(0),velar:U(0),...(router.endsWith('-v6')?{zest:U(0)}:{})});
  const args=(minimum:bigint)=>smart?[U(amount),U(limit),Cl.some(update),U(p.mid),U(minimum)]:[U(amount),U(amount),U(limit),Cl.some(update),Cl.none(),zero,zero,U(minimum),...(router.endsWith('-v6')?[Cl.tuple({ticks:Cl.list([]),price:U(0)})]:[])];
  const balance=(s:'x'|'y',who:string)=>p[s]==='asset-stx'?simnet.getAssetsMap().get('STX')!.get(who):read(p[s],'get-balance',[Cl.principal(who)]);
  const before=[balance('x',taker),balance('y',taker)],total=supply();
  const refused=call(router,fn,args(expected+1n),taker);
  expect(refused.result).toEqual(Cl.error(U(3002)));expect(refused.events).toEqual([]);
  expect([balance('x',taker),balance('y',taker)]).toEqual(before);
  const result=ok(call(router,fn,args(expected),taker));
  expect(balance(x?'y':'x',taker)-before[x?1:0]).toBe(expected);
  expect(before[x?0:1]-balance(x?'x':'y',taker)).toBe(amount);
  expect(result['jing-in']).toBe(amount);expect(result['jing-out']).toBe(expected);
  expect(supply()).toEqual(total);
  for(const s of ['x','y'] as const)expect(balance(s,`${owner}.${router}`)??0n).toBe(0n);
 });
 it(`${pair} batch: mixed success codes and empty request rollback`,async()=>{
  const p=await setup(pair),batch=pair==='sbtc-usdcx'?'jing-settle-batch-sbtc-usdcx-v2':'jing-settle-batch-stx-usdcx';
  ok(call(p.market,'deposit-token-x',[U(p.xAmount),U(p.mid*2n),Cl.none(),pc(p.x),assetName],maker));
  ok(call(p.market,'deposit-token-y',[U(p.yAmount),U(p.mid/2n),Cl.none(),pc(p.y),assetName],taker));
  expect(call(batch,'settle-many',[update,Cl.list([])]).result).toEqual(Cl.error(U(7201)));
  const request=(who:string,x:boolean,kind:number)=>Cl.tuple({who:Cl.principal(who),x:Cl.bool(x),kind:U(kind)});
  const result=ok(call(batch,'settle-many',[update,Cl.list([request(taker,false,0),request(maker,true,0),request(maker,true,99)])]));
  expect(result).toEqual({settled:1n,codes:[0n,1030n,7202n]});
  expect(read(p.market,'get-token-y-deposit',[U(0),Cl.principal(taker)])).toBe(p.yAmount);
 });
}
