import {it,expect} from 'vitest';
import {boot,Cl,u,ok,STX,USDCX,legs,route} from './lab';
const routes=[[STX,'sbtc-for-stx'],[STX,'stx-for-sbtc'],[USDCX,'sbtc-for-usdcx'],[USDCX,'usdcx-for-sbtc']] as const;
it.each(routes)('%s smart %s executes a partial Zest fill and accounts for unsold',async(contract,direction)=>{
 // Arrange
 const {call,read}=await boot();
 ok(call('zest','configure',[Cl.bool(true),u(10),u(10)]));
 // Act
 const result=call(contract,`smart-swap-${direction}`,[u(100),u(10000000000),Cl.some(Cl.bufferFromHex('')),u(10000000000),u(0)]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.out).toEqual(u(10));expect(value.value.unsold).toEqual(u(90));
 expect(read('zest','get-calls')).toEqual(u(1));
});
it.each(routes)('%s smart %s rejects invalid amount, limit, mid and minimum output',async(contract,direction)=>{
 // Arrange
 const {call}=await boot();
 ok(call('zest','configure',[Cl.bool(false),u(10),u(10)]));
 // Act
 const zero=call(contract,`smart-swap-${direction}`,[u(0),u(1),Cl.none(),u(1),u(0)]);
 const limit=call(contract,`smart-swap-${direction}`,[u(100),u(0),Cl.none(),u(1),u(0)]);
 const mid=call(contract,`smart-swap-${direction}`,[u(100),u(1),Cl.none(),u(0),u(0)]);
 const minimum=call(contract,`smart-swap-${direction}`,[u(100),u(10000000000),Cl.none(),u(10000000000),u(1)]);
 // Assert
 expect(zero.result).toEqual(Cl.error(u(3001)));expect(limit.result).toEqual(Cl.error(u(3006)));
 expect(mid.result).toEqual(Cl.error(u(3007)));expect(minimum.result).toEqual(Cl.error(u(3002)));
});
it.each(routes)('%s split %s rejects sum mismatch and invalid fallback',async(contract,direction)=>{
 // Arrange
 const {call}=await boot();
 // Act
 const mismatch=call(contract,`swap-${direction}`,[u(100),u(0),u(1),Cl.none(),Cl.none(),legs(99),legs(0),u(0),route]);
 const fallback=call(contract,`swap-${direction}`,[u(100),u(0),u(1),Cl.none(),Cl.some(u(4)),legs(100),legs(0),u(0),route]);
 // Assert
 expect(mismatch.result).toEqual(Cl.error(u(3004)));expect(fallback.result).toEqual(Cl.error(u(3003)));
});
it.each(routes)('%s smart %s fills on DLMM when Zest is absent',async(contract,direction)=>{
 // Arrange
 const {call}=await boot();
 ok(call('zest','configure',[Cl.bool(false),u(10),u(10)]));
 ok(call('dlmm','set-enabled',[Cl.bool(true)]));
 // Act
 const result=call(contract,`smart-swap-${direction}`,[u(100),u(10000000000),Cl.none(),u(10000000000),u(100)]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.out).toEqual(u(100));expect(value.value.unsold).toEqual(u(0));
});
it.each(routes)('%s split %s combines Jing, Zest and DLMM fills',async(contract,direction)=>{
 // Arrange
 const {call}=await boot();
 ok(call('zest','configure',[Cl.bool(true),u(10),u(10)]));
 ok(call('dlmm','set-enabled',[Cl.bool(true)]));
 const amounts=Cl.tuple({zest:u(10),dlmm:u(65),xyk:u(0),velar:u(0)});
 // Act
 const result=call(contract,`swap-${direction}`,[u(100),u(25),u(10000000000),Cl.some(Cl.bufferFromHex('')),Cl.none(),amounts,amounts,u(100),route]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.out).toEqual(u(100));expect(value.value.unsold).toEqual(u(0));
});
it.each(['sbtc-for-stx','stx-for-sbtc'])('STX split %s fills on XYK and Velar',async(direction)=>{
 // Arrange
 const {call}=await boot();
 const amounts=Cl.tuple({zest:u(0),dlmm:u(0),xyk:u(50),velar:u(50)});
 // Act
 const result=call(STX,`swap-${direction}`,[u(100),u(0),u(10000000000),Cl.none(),Cl.none(),amounts,amounts,u(100),route]);
 // Assert
 const value=ok(result) as any;
 expect(value.value.out).toEqual(u(100));expect(value.value.unsold).toEqual(u(0));
});
