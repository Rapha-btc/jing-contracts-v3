import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import {boot,simnet,owner,names,accounts} from './lab';
const U=Cl.uint,P=1000000000000n,update=Cl.bufferFromHex('00'.repeat(72));
const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who).result;
const read=(c:string,f:string,a:any[]=[])=>simnet.callReadOnlyFn(c,f,a,owner).result;
const ok=(r:any)=>{expect(r.type,Cl.prettyPrint(r)).toBe('ok');return r.value;};
function init(market:string){
 const x=market==='market-stx-usdcx'?'asset-stx':'token',y=market==='market'?'asset-stx':'usdcx';
 const p=(n:string)=>Cl.contractPrincipal(owner,n),id=p(names[market]);
 ok(call('jing-core-v6','set-verified-contract',[id]));
 ok(call(market,'initialize',[id,p(x),p(y),U(1000),U(100000),U(1),U(45)]));
 return {x,y,traits:[p(x),Cl.stringAscii(x==='asset-stx'?'wstx':'token'),p(y),Cl.stringAscii(y==='asset-stx'?'wstx':'token')]};
}
for(const market of ['market','market-sbtc-usdcx','market-stx-usdcx'])it(`${market}: independent settle and swap/reprice caps; fixed rebate curve`,async()=>{
 await boot();const {traits}=init(market);
 for(const cap of [20,40])for(const older of [0,1])for(const age of [cap-1,cap,cap+1]){
  ok(call(market,'set-settle-max-staleness',[U(cap)]));
  ok(call('oracle','configure',[U(0),U(older===0?age:0),U(older===1?age:0)]));
  const r=call(market,'settle-with-refresh',[update,...traits]);
  expect(r).toEqual(Cl.error(U(age>=cap?1003:1009)));
 }
 for(const cap of [40,80])for(const age of [cap-1,cap,cap+1]){
  ok(call(market,'set-max-staleness',[U(cap)]));
  ok(call('oracle','configure',[U(0),U(age),U(0)]));
  const r=simnet.callPrivateFn(market,'fresh-classification-price',[update],owner).result;
  expect(r.type).toBe(age>=cap?'err':'ok');
  if(age>=cap)expect(r).toEqual(Cl.error(U(1003)));
 }
 ok(call(market,'set-max-staleness',[U(40)]));
 for(const [age,bps] of [[0,20],[30,20],[40,30],[79,69],[80,70]]){
  ok(call('oracle','configure',[U(0),U(age),U(0)]));
  expect(read(market,'get-taker-rebate-bps-for',[update])).toEqual(U(bps));
 }
 expect(read(market,'get-taker-rebate-bps-for',[Cl.bufferFromHex('00')])).toEqual(U(20));
});
for(const [market,router] of [['market','router'],['market-sbtc-usdcx','swap-router-sbtc-usdcx-jing-v5-6'],['market-stx-usdcx','swap-router-stx-usdcx-jing-v5-5'],['market-stx-usdcx','swap-router-stx-usdcx-jing-v6']])it(`${router}: jing-size follows the update rebate read-only`,async()=>{
 await boot({routers:true});init(market);
 for(const age of [0,40,79])for(const sell of [true,false]){
  ok(call('oracle','configure',[U(0),U(age),U(0)]));
  const bps=read(market,'get-taker-rebate-bps-for',[update]);
  const expected=simnet.callPrivateFn(router,'book-limit',[U(P),bps,Cl.bool(sell)],owner).result;
  const r=simnet.callPrivateFn(router,'jing-size',[U(1000000),U(P),Cl.some(update),U(P),Cl.bool(sell)],owner).result;
  expect(r.value.limit).toEqual(expected);expect(r.value.size).toEqual(U(0));
 }
});
for(const [market,batch] of [['market','z-batch'],['market-sbtc-usdcx','jing-settle-batch-sbtc-usdcx-v2']])it(`${batch}: settles a valid pending maker and reports a missing request`,async()=>{
 await boot();const {x,y}=init(market),alice=accounts.get('wallet_1')!,bob=accounts.get('wallet_2')!;
 for(const [who,token] of [[alice,x],[bob,y]])if(token!=='asset-stx')ok(call(token,'mint',[U(100000000),Cl.principal(who)]));
 ok(call(market,'deposit-token-x',[U(10000),U(P*2n),Cl.none(),Cl.contractPrincipal(owner,x),Cl.stringAscii('token')],alice));
 ok(call(market,'deposit-token-y',[U(1000000),U(P/2n),Cl.none(),Cl.contractPrincipal(owner,y),Cl.stringAscii(y==='asset-stx'?'wstx':'token')],bob));
 const requests=Cl.list([Cl.tuple({who:Cl.principal(bob),x:Cl.bool(false),kind:U(0)}),Cl.tuple({who:Cl.principal(alice),x:Cl.bool(true),kind:U(0)})]);
 const result=ok(call(batch,'settle-many',[update,requests]));
 expect(result).toEqual(Cl.tuple({settled:U(1),codes:Cl.list([U(0),U(1030)])}));
 expect(read(market,'get-token-y-deposit',[U(0),Cl.principal(bob)])).toEqual(U(1000000));
});
for(const market of ['market','market-sbtc-usdcx'])for(const action of ['swap','reprice'])for(const age of [39,40])it(`${market} ${action}: funded public path at age ${age} with cap 40`,async()=>{
 await boot();const {x,y,traits}=init(market),maker=accounts.get('wallet_1')!,taker=accounts.get('wallet_2')!;
 for(const [who,token] of [[maker,y],[taker,x]])if(token!=='asset-stx')ok(call(token,'mint',[U(100000000),Cl.principal(who)]));
 if(action==='reprice')ok(call(market,'deposit-token-x',[U(10000),U(P*2n),Cl.none(),Cl.contractPrincipal(owner,x),Cl.stringAscii('token')],taker));
 ok(call(market,'deposit-token-y',[U(1000000),U(P/2n),Cl.none(),Cl.contractPrincipal(owner,y),Cl.stringAscii(y==='asset-stx'?'wstx':'token')],maker));
 if(action==='reprice')ok(call(market,'settle-token-y-deposit',[Cl.principal(maker),update,Cl.contractPrincipal(owner,y),Cl.stringAscii(y==='asset-stx'?'wstx':'token')]));
 ok(call(market,'set-max-staleness',[U(40)]));
 ok(call('oracle','configure',[U(0),U(age),U(0)]));
 const r=action==='swap'?call(market,'swap',[U(10000),U(P/2n),update,...traits,Cl.bool(true)],taker):call(market,'reprice-or-swap-token-x',[U(P/2n),Cl.none(),update,...traits],taker);
 if(age===40)expect(r).toEqual(Cl.error(U(1003)));
 else{
  ok(r);
  if(action==='swap')expect(read(market,'get-current-cycle').value).toBeGreaterThan(0n);
  else{
   // The opposite maker is off-market, so a fresh reprice queues its limit.
   const pending=simnet.getMapEntry(market,'token-x-pending-limits',Cl.principal(taker));
   expect(pending.value.value.limit).toEqual(U(P/2n));
  }
 }
});
