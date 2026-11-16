import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';
for(const [name,lo,hi] of [['settle-max-staleness',20,40],['max-staleness',40,80]] as const)it(`${name} defaults, auth, bounds and rollback`,()=>{
 expect(simnet.getDataVar(h.C,name)).toEqual(h.U(hi));
 for(const v of [lo-1,lo,hi,hi+1]){
  h.err(h.call(`set-${name}`,[h.U(v)],h.alice),1008);
  const before=simnet.getDataVar(h.C,name);
  if(v<lo||v>hi){h.err(h.call(`set-${name}`,[h.U(v)]),1034);expect(simnet.getDataVar(h.C,name)).toEqual(before);}
  else{h.ok(h.call(`set-${name}`,[h.U(v)]));expect(simnet.getDataVar(h.C,name)).toEqual(h.U(v));}
 }
});
it('rebate read-only uses fixed 80-second curve even when swap age is tightened',()=>{
 h.init();h.ok(h.call('set-max-staleness',[h.U(40)]));
 for(const [age,bps] of [[0,20],[30,20],[40,30],[79,69],[80,70]]){
  h.oracle(0,age,age);expect(h.ro('get-taker-rebate-bps-for',[h.UPDATE])).toEqual(h.U(bps));
 }
 expect(h.ro('get-taker-rebate-bps-for',[Cl.bufferFromHex('00')])).toEqual(h.U(20));
 h.oracle(7);expect(h.ro('get-taker-rebate-bps-for',[h.UPDATE])).toEqual(h.U(20));
});
for(const side of ['x','y'])it(`drop-${side} preserves order for mixed principals and absent entries`,()=>{
 const list=[Cl.principal(h.alice),Cl.contractPrincipal(h.owner,'token'),Cl.principal(h.bob)];
 for(const i of [0,1,2,3])expect(h.privateCall(`drop-${side}`,[Cl.list(list),i<3?list[i]:Cl.principal(h.keeper)]).result).toEqual(Cl.list(list.filter((_,n)=>n!==i)));
 expect(h.privateCall(`drop-${side}`,[Cl.list([list[1]]),list[1]]).result).toEqual(Cl.list([]));
});

for(const stale of ['x','y'])it(`settlement helper rejects stale ${stale} feed at the swap cap`,()=>{
 h.init();h.book();
 const now=BigInt((simnet.execute('stacks-block-time').result as any).value);
 const feed=(price:number,age:bigint)=>Cl.tuple({price:Cl.int(price),conf:h.U(0),expo:Cl.int(-8),'ema-price':Cl.int(price),'ema-conf':h.U(0),'publish-time':h.U(now-age),'prev-publish-time':h.U(0)});
 h.err(h.privateCall('execute-settlement',[h.U(0),feed(h.P,stale==='x'?80n:0n),feed(100000000,stale==='y'?80n:0n),...h.traits],h.keeper),1003);
 expect(h.cycle()).toBe(0n);
});
