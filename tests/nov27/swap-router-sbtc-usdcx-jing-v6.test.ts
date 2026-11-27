import {it,expect} from 'vitest';
import {boot,Cl,u,ok,USDCX,legs,route} from './lab';

it.each(['sbtc-for-usdcx','usdcx-for-sbtc'])('split %s uses Zest pool 4 with sBTC as x and USDCx as y',async(direction)=>{
 // Arrange
 const {call,read,cp}=await boot();
 ok(call('zest','configure',[Cl.bool(true),u(100),u(100)]));
 // Act
 const result=call(USDCX,`swap-${direction}`,[u(100),u(0),u(10000000000),Cl.none(),Cl.none(),legs(100),legs(100),u(100),route]);
 // Assert
 ok(result);
 expect(read('zest','get-last')).toEqual(Cl.some(Cl.tuple({x:Cl.principal(cp('sbtc')),y:Cl.principal(cp('usdcx')),pool:u(4),
  'sell-x':Cl.bool(direction==='sbtc-for-usdcx'),amount:u(100),price:u(123456789),ticks:Cl.list([Cl.int(0),Cl.int(1)]),min:u(0),partial:Cl.bool(true)})));
});
it.each(['sbtc-for-usdcx','usdcx-for-sbtc'])('smart %s skips absent Zest pool and preserves unsold amount',async(direction)=>{
 // Arrange
 const {call,read}=await boot();
 ok(call('zest','configure',[Cl.bool(false),u(100),u(100)]));
 // Act
 const result=call(USDCX,`smart-swap-${direction}`,[u(10000),u(10000000000),Cl.none(),u(10000000000),u(0)]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.unsold).toEqual(u(10000));
 expect(value.value.out).toEqual(u(0));
 expect(read('zest','get-calls')).toEqual(u(0));
});
it.each(['sbtc-for-usdcx','usdcx-for-sbtc'])('split %s with zest u0 skips the absent pool',async(direction)=>{
 // Arrange
 const {call,read}=await boot();
 ok(call('zest','configure',[Cl.bool(false),u(100),u(100)]));
 const amounts=Cl.tuple({zest:u(0),dlmm:u(100),xyk:u(0),velar:u(0)});
 // Act
 const result=call(USDCX,`swap-${direction}`,[u(100),u(0),u(10000000000),Cl.none(),Cl.none(),amounts,legs(0),u(0),Cl.tuple({ticks:Cl.list([]),price:u(0)})]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.out).toEqual(u(100));
 expect(value.value.unsold).toEqual(u(0));
 expect(read('zest','get-calls')).toEqual(u(0));
});
it('nonzero split Zest leg also treats missing pool as nothing filled',async()=>{
 // Arrange
 const {call,read}=await boot();
 ok(call('zest','configure',[Cl.bool(false),u(100),u(100)]));
 // Act
 const result=call(USDCX,'swap-sbtc-for-usdcx',[u(100),u(0),u(10000000000),Cl.none(),Cl.none(),legs(100),legs(100),u(0),route]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.unsold).toEqual(u(100));expect(value.value.out).toEqual(u(0));
 expect(read('zest','get-calls')).toEqual(u(0));
});
