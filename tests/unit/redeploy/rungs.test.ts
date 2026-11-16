import {boot,simnet,owner,accounts} from './lab';
import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
const U=Cl.uint, member=accounts.get('wallet_1')!;
const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who).result;
const read=(c:string,f:string,a:any[]=[])=>simnet.callReadOnlyFn(c,f,a,owner).result;
const ok=(r:any)=>expect(r).toEqual(Cl.ok(Cl.bool(true)));
function initMarket(market:string,x:string,y:string){
 ok(call('jing-core-v6','set-verified-contract',[Cl.contractPrincipal(owner,market)]));
 ok(call(market,'initialize',[Cl.contractPrincipal(owner,market),Cl.contractPrincipal(owner,x),Cl.contractPrincipal(owner,y),U(1000),U(100000),U(1),U(45)]));
}
for(const pair of ['stx','sbtc'])for(const side of ['buy','sell'])for(const suffix of ['-v2',''])it(`${pair} rung ${side}: ${suffix||'old name'}`,async()=>{
   await boot();
 const market=pair==='stx'?'market':'market-sbtc-usdcx',ladder=pair==='stx'?'jing-ladder-v1':'jing-ladder-sbtc-usdcx-v1';
 initMarket(market,'token',pair==='stx'?'asset-stx':'usdcx');
 const rung=`jing-${side}-${pair}-10${suffix}`;
 ok(call(ladder,'set-canonical',[Cl.stringAscii(side==='buy'?'buy-band':'sel-band'),Cl.contractPrincipal(owner,rung)]));
 const result=call(rung,'initialize',[U(10),Cl.bool(true)]);
 expect(result).toEqual(suffix?Cl.ok(Cl.bool(true)):Cl.error(U(7009)));
 expect(simnet.getDataVar(rung,'initialized')).toEqual(Cl.bool(!!suffix));
});
for(const pair of ['sbtc','stx'])for(const side of ['buy','sell'])for(const scenario of ['fresh','stale','future','huge','future-boundary','value-boundary'])it(`${pair} ${side}: DIA ${scenario} controls pushes`,async()=>{
   await boot();
 const market=`market-${pair}-usdcx`,ladder=`jing-ladder-${pair}-usdcx-v1`;
 const rung=`jing-${side}-${pair==='sbtc'?'sbtc':'stx-usdc'}-10${pair==='sbtc'?'-v2':''}`;
 const max=pair==='sbtc'?10000000000000000n:100000000000n;
 const value=scenario==='huge'?max+1n:scenario==='value-boundary'?max:pair==='sbtc'?10000000000000n:100000000n;
 const offset=scenario==='stale'?-7200:scenario==='future'?301:scenario==='future-boundary'?300:0;
 initMarket(market,pair==='sbtc'?'token':'asset-stx','usdcx');
 ok(call(ladder,'set-canonical',[Cl.stringAscii(side==='buy'?'buy-band':'sel-band'),Cl.contractPrincipal(owner,rung)]));
 ok(call(rung,'initialize',[U(10),Cl.bool(true)]));
 ok(call('dia','configure',[U(value),Cl.int(offset)]));
 const blocked=['stale','future','huge'].includes(scenario);
 expect(read(rung,'miner-mid')).toEqual(U(blocked?0:value));
 for(const token of ['token','usdcx'])ok(call(token,'mint',[U(1000000000),Cl.principal(member)]));
 expect(call(rung,'deposit',[U(1000000)],member).type).toBe('ok');
 const assetSide=side==='sell'?'x':'y';
 const live=read(market,`get-token-${assetSide}-deposit`,[U(0),Cl.contractPrincipal(owner,rung)]);
 expect(live).toEqual(U(blocked?0:1000000));
 if(blocked){
  expect(call(rung,'push')).toEqual(Cl.ok(Cl.bool(false)));
  // Recovery proves a funded push was stopped by the oracle guard.
  ok(call('dia','configure',[U(pair==='sbtc'?10000000000000n:100000000n),Cl.int(0)]));
  expect(call(rung,'push')).toEqual(Cl.ok(Cl.bool(true)));
  expect(read(market,`get-token-${assetSide}-deposit`,[U(0),Cl.contractPrincipal(owner,rung)])).toEqual(U(1000000));
 }
});
