import {it,expect} from 'vitest';
import {boot,Cl,u,ok,STX,legs,route} from './lab';

it.each([[10,3,1,4],[10,3,2,7],[10,3,3,10],[0,3,1,0],[10,0,0,10],[10,5,2,4]])('scale-min(%i,%i,%i) = %i',async(min,planned,actual,expected)=>{
 // Arrange
 const {sim,cp,admin}=await boot();
 // Act
 const result=sim.callPrivateFn(cp(STX),'scale-min',[u(min),u(planned),u(actual)],admin);
 // Assert
 expect(result.result).toEqual(u(expected));
});
it.each([3,4])('partial Zest fill needs ceil(10 / 3) = 4: output %i',async(output)=>{
 // Arrange
 const {call,read}=await boot();
 ok(call('zest','configure',[Cl.bool(true),u(1),u(output)]));
 // Act
 const result=call(STX,'swap-sbtc-for-stx',[u(3),u(0),u(1),Cl.none(),Cl.none(),legs(3),legs(10),u(0),route]);
 // Assert
 if(output===3){expect(result.result).toEqual(Cl.error(u(3002)));expect(read('zest','get-calls')).toEqual(u(0));}
 else {ok(result);expect(read('zest','get-calls')).toEqual(u(1));}
});
