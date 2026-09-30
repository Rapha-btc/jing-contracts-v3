import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,owner,alice,bob,taker,token,stx,name,update,value,call,read,ok,balance,specs,setup} from './helpers';

for(const spec of specs)describe(`${spec.label} v1 epochs and rescale`,()=>{
 it('cancels still-live escrow during an extreme fill tail roll and releases reserve rounding dust',()=>{
  const r=setup(spec),amount=spec.x?1000000000n:100000000000n;
  for(const who of [alice,bob,taker])ok(call('token','mint',[U(10000000000n),Cl.principal(who)]));
  r.deposit(alice,amount);r.deposit(bob,amount+2n);
  const targetRest=spec.x?200n:20000n,total=amount*2n+2n;
  const counter=spec.x?(total-targetRest)*100n:(total-targetRest)/100n;
  // Smallest gross whose net equals counter at the fresh 20 bps rate.
  const gross=(counter*10020n+9999n)/10000n;
  ok(call('market','swap',[U(gross),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
  const live=r.state().resting;
  expect(live).toBeGreaterThanOrEqual(spec.x?100n:10000n);
  expect(live).toBeLessThan(total/1000000n);
  ok(call(r.rung,'sync',[],taker));
  expect(r.state().epoch).toBe(1n);expect(r.state().resting).toBe(0n);
  expect(r.equity()).toBe(0n);
  const reserve=value(simnet.getDataVar(r.rung,spec.x?'reserved-sats':'reserved-ustx'));
  expect(reserve).toBe(live);
  expect(balance(spec.x,r.principal)).toBe(live);
  for(const who of [alice,bob]){
   const claim=r.position(who)[spec.x?'sbtc':'stx'],before=balance(spec.x,who);
   ok(call(r.rung,'claim',[],who));
   expect(balance(spec.x,who)-before).toBe(claim);
  }
  expect(value(simnet.getDataVar(r.rung,spec.x?'reserved-sats':'reserved-ustx'))).toBe(0n);
  r.deposit(alice);r.withdraw(alice,spec.amount+live);
  expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
 });
 it('tail-rolls a nearly filled pool and pays old members before reopening the epoch',()=>{
  const r=setup(spec),amount=spec.x?1000n:1000000n,inputKey=spec.x?'sbtc':'stx',outputKey=spec.x?'stx':'sbtc';
  r.deposit(alice,amount);r.deposit(bob,amount);
  const inputBefore=[balance(spec.x,alice),balance(spec.x,bob)],outputBefore=[balance(!spec.x,alice),balance(!spec.x,bob)];
  const total=amount*2n;
  ok(call('market','swap',[U(spec.x?total*100n:total/100n),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
  const proceeds=balance(!spec.x,r.principal),rest=balance(spec.x,r.principal);
  expect(proceeds).toBeGreaterThan(0n);expect(rest).toBeGreaterThan(0n);
  ok(call(r.rung,'sync',[],taker));
  expect(r.state().epoch).toBe(1n);expect(r.state().members).toBe(0n);
  expect(r.state()['total-shares']).toBe(0n);
  expect(read(r.rung,'final-unfilled',[U(0)])).toBeGreaterThan(0n);
  expect(read(r.rung,'final-index',[U(0)])).toBeGreaterThan(0n);
  expect(read(r.rung,'final-scale',[U(0)])).toBe(0n);
  const claims=[r.position(alice),r.position(bob)];
  expect(claims[0][inputKey]).toBe(claims[1][inputKey]);
  ok(call(r.rung,'claim',[],alice));
  claims[1]=r.position(bob); // Final claimer owns both exact reserve remainders.
  // Old-epoch withdraw pays the historical payout even though no live shares remain.
  ok(call(r.rung,'withdraw',[U(amount),Cl.none()],bob));
  for(const [i,who] of [alice,bob].entries()){
   expect(balance(spec.x,who)-inputBefore[i]).toBe(claims[i][inputKey]);
   expect(balance(!spec.x,who)-outputBefore[i]).toBe(claims[i][outputKey]);
   expect(r.position(who).shares).toBe(0n);
  }
  expect(value(simnet.getDataVar(r.rung,spec.x?'reserved-sats':'reserved-ustx'))).toBe(0n);
  expect(claims[0][inputKey]+claims[1][inputKey]).toBe(rest);
  expect(balance(spec.x,r.principal)).toBe(0n);
  expect(claims[0][outputKey]+claims[1][outputKey]).toBe(proceeds);
  expect(balance(!spec.x,r.principal)).toBe(0n);
  r.deposit(alice,amount);r.withdraw(alice,amount+rest);
  expect(r.state().members).toBe(0n);expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
 });

 it('rescales through real fills and refills while a member remains inactive across four scales',()=>{
  const r=setup(spec),amount=spec.amount*10n,inputKey=spec.x?'sbtc':'stx',outputKey=spec.x?'stx':'sbtc';
  ok(call('token','mint',[U(100000000),Cl.principal(bob)]));
  ok(call('token','mint',[U(100000000),Cl.principal(taker)]));
  r.deposit(alice,amount);r.deposit(bob,amount);
  const initialOutput=[balance(!spec.x,alice),balance(!spec.x,bob)];
  let totalProceeds=0n,idealAlice=0n,effectiveAlice=amount,previousScale=0n;
  for(let i=0;i<45&&r.state().scale<4n;i++){
   const before=r.state(),onBook=before.resting,output=balance(!spec.x,r.principal);
   ok(call('market','swap',[U(spec.x?onBook*50n:onBook/200n),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
   const gained=balance(!spec.x,r.principal)-output;
   expect(gained).toBeGreaterThan(0n);totalProceeds+=gained;
   idealAlice+=gained*effectiveAlice/before['total-shares'];
   const sync=call(r.rung,'sync',[],taker);ok(sync);
   const after=r.state();
   expect(after.epoch).toBe(0n);expect(after.members).toBe(2n);
   expect(after['unfilled-index']).toBeGreaterThanOrEqual(1000000000n);
   expect(after['unfilled-index']).toBeLessThanOrEqual(P);
   if(after.scale>previousScale){
    expect(after.scale).toBe(previousScale+1n);effectiveAlice/=1000n;
    expect(sync.events.some(e=>e.event==='print_event'&&value(e.data.value)?.event==='rung-rescale')).toBe(true);
    previousScale=after.scale;
   }
   r.deposit(bob,onBook-after.resting);
  }
  expect(r.state().scale).toBe(4n);
  expect(r.position(alice)[inputKey]).toBe(0n);
  const owed=r.position(alice)[outputKey],difference=owed>idealAlice?owed-idealAlice:idealAlice-owed;
  // Independent per-fill allocation rounds once per fill, rather than once per scale segment.
  expect(difference).toBeLessThanOrEqual(90n);
  ok(call(r.rung,'claim',[],alice));
  expect(balance(!spec.x,alice)-initialOutput[0]).toBe(owed);
  // A current-epoch position rounded to zero must still be removable.
  r.withdraw(alice,1n);expect(r.position(alice).shares).toBe(0n);
  r.paused();const remaining=r.position(bob)[inputKey];r.withdraw(bob,remaining+1n);
  expect(r.state().members).toBe(0n);expect(r.state()['total-shares']).toBe(0n);
  expect(r.equity()).toBe(0n);expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  const paid=(balance(!spec.x,alice)-initialOutput[0])+(balance(!spec.x,bob)-initialOutput[1]);
  expect(paid).toBe(totalProceeds);
  expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
 },120000);

 it('prevents re-locking timeout refunds during cooldown, then permits a push after 24 hours',()=>{
  const r=setup(spec);r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  simnet.mineEmptyBurnBlocks(145);
  r.withdraw(alice,spec.amount/2n);
  expect(r.pending()).toBe(null);expect(r.held()).toBe(spec.amount/2n);
  expect(ok(call(r.rung,'push',[],bob))).toBe(false);
  expect(r.held()).toBe(spec.amount/2n);
  simnet.mineEmptyBurnBlocks(145);
  expect(ok(call(r.rung,'push',[],bob))).toBe(true);
  expect(r.pending()?.amount).toBe(spec.amount/2n);
  simnet.mineEmptyBurnBlocks(145);r.withdraw(alice);
  expect(r.held()).toBe(0n);expect(r.pending()).toBe(null);
 });
});
