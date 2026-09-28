import {beforeEach,describe,it,expect} from 'vitest';
import {Cl,getAddressFromPrivateKey} from '@stacks/transactions';
import * as h from './helpers';
const {U,N,P,owner,alice,bob,carol,keeper,market,token,name,UPDATE,init,call,ok,deposit,settleDeposit,setLimit,settleLimit,cancel,readmit,settleReadmit,reprice,swap,withdraw,amount,other,off,queue,book,batch,mid,oracle,rejectUnchanged}=h;
const pauseCore=()=>ok(call('pause',[],owner,'jing-core-v6'));
function parked(s:h.Side){queue();ok(deposit(s,amount(s),P));ok(deposit(s,amount(s)*2,P,bob));ok(settleDeposit(s,bob));}

for(const s of ['x','y'] as const)describe(`${s} real core pause and rollback`,()=>{
 beforeEach(init);
 it.each(['limit','small share'] as const)('reverts %s filtering when the real settlement logger rejects a paused core',kind=>{
  const n=s==='x'?100:10000;
  ok(deposit(s,n*1000,P));ok(deposit(s,n,kind==='limit'?off(s):P,carol));
  ok(deposit(other(s),s==='x'?n*1000*100:n*1000/100,P,bob));mid(s==='x'?P/2:P*2);ok(settleDeposit(other(s),bob));mid(P);
  pauseCore(); rejectUnchanged(()=>batch(),5016);
  simnet.mineEmptyBurnBlocks(144);ok(call('unpause',[],owner,'jing-core-v6'));
  const receipt=batch();ok(receipt);
  const events=receipt.events.filter(e=>e.event==='print_event').map(e=>h.value(e.data.value).event);
  expect(events).toContain(`${kind==='limit'?'limit':'small-share'}-roll-${s}`);
  expect(events).toContain('settlement');
  expect(h.cycle()).toBe(1n);expect(h.live(s,carol)).toBe(BigInt(n));h.custody(s);h.custody(other(s));
 });
 it('rejects crossing settlement while the real core is paused',()=>{
  const quote=s==='x'?P/2:P*2;ok(deposit(other(s),amount(other(s)),quote));pauseCore();
  rejectUnchanged(()=>swap(s,amount(s),quote),5016);
 });
 it.each(['live','pending','parked'] as const)('allows %s funds to be cancelled while the core is paused',kind=>{
  if(kind==='parked')parked(s);
  else {if(kind==='pending')ok(deposit(other(s),amount(other(s)),off(other(s)),bob));ok(deposit(s));}
  const before=h.balance(s,alice);pauseCore();ok(cancel(s));
  expect(h.balance(s,alice)-before).toBe(BigInt(amount(s)));h.custody(s);
 });
});

describe('real core registration and equity',()=>{
 beforeEach(init);
 it('registers the actual market hash and updates equity on deposit, withdrawal and cancellation',()=>{
  expect(h.ro('is-registered',[Cl.principal(market)],'jing-core-v6')).toEqual(Cl.bool(true));
  const equity=(who:string)=>h.value(h.ro('get-token-equity',[token,Cl.principal(who)],'jing-core-v6'));
  expect(equity(alice)).toBe(0n);ok(deposit('x'));expect(equity(alice)).toBe(10000n);
  ok(withdraw('x',100));expect(equity(alice)).toBe(9900n);
  ok(cancel('x'));expect(equity(alice)).toBe(0n);
  expect(h.value(h.ro('get-total-token-equity',[token],'jing-core-v6'))).toBe(0n);
 });
 it.each(['direct','pending','swap','reprice'] as const)('an unfunded %s token input returns the real FT balance error',kind=>{
  const who=getAddressFromPrivateKey('2'.repeat(64)+'01','testnet');
  let action:()=>ReturnType<typeof call>;
  if(kind==='reprice'){ok(call('mint',[U(10000),Cl.principal(who)],owner,'token'));ok(deposit('x',10000,P*2,who));ok(deposit('y',2000000,P,bob));ok(settleDeposit('y',bob));action=()=>reprice('x',P,who);}
  else {if(kind!=='direct')ok(deposit('y',2000000,P,bob));action=()=>kind==='swap'?swap('x',10000,P,who):deposit('x',10000,P*2,who);}
  expect(h.balance('x',who)).toBe(0n);rejectUnchanged(action,1,[who]);
 });
});

describe('oracle propagation and unfunded STX input',()=>{
 beforeEach(init);
 it.each([[13,1023],[14,1004],[15,1025]])('independent y-feed shape error mode %i is returned without state changes',(mode,code)=>{
  oracle(mode);rejectUnchanged(()=>call('refresh-mid',[UPDATE]),code);
 });
 it.each(['deposit','limit','readmit'] as const)('oracle error preserves pending %s on both sides',kind=>{
  for(const s of ['x','y'] as const){
   if(kind==='readmit'){parked(s);ok(readmit(s));}
   else {if(kind==='limit')ok(deposit(s));ok(deposit(other(s),amount(other(s)),off(other(s)),bob));if(kind==='limit'){ok(settleDeposit(other(s),bob));ok(setLimit(s,off(s)+1));}else ok(deposit(s));}
   oracle(7);rejectUnchanged(()=>kind==='deposit'?settleDeposit(s):kind==='limit'?settleLimit(s):settleReadmit(s),9001);oracle();
   for(const side of ['x','y'] as const)for(const who of [alice,bob]){const owned=h.live(side,who)+h.parked(side,who)+(h.value(h.pending(side,'deposit',who))?.amount??0n);if(owned>0n)ok(cancel(side,who));}
  }
 });
 it.each(['direct','pending','swap','reprice'] as const)('an unfunded %s STX input cannot change the market',kind=>{
  const who=getAddressFromPrivateKey('1'.repeat(64)+'01','testnet');
  expect(h.balance('y',who)).toBe(0n);
  let action:()=>ReturnType<typeof call>,line:number;
  if(kind==='reprice'){simnet.mintSTX(who,1000000n);ok(deposit('y',1000000,P/2,who));ok(deposit('x',20000,P,bob));ok(settleDeposit('x',bob));action=()=>reprice('y',P,who);line=2271;}
  else {if(kind!=='direct')ok(deposit('x',20000,P,bob));action=()=>kind==='swap'?swap('y',1000000,P,who):deposit('y',1000000,P/2,who);line=kind==='direct'?1268:kind==='pending'?1320:2719;}
  rejectUnchanged(action!,1,[who],[line!]);
 });
});

it('settles distinct asset identities through the real core and clears deposited equity',()=>{
 h.verifyMarket();
 const yToken=h.wrong;
 ok(call('initialize',[Cl.principal(market),token,yToken,U(100),U(10000),U(1),U(45)]));
 ok(call('mint',[U(10000),Cl.principal(alice)],owner,'token'));
 const equity=(asset:typeof token,who:string)=>h.value(h.ro('get-token-equity',[asset,Cl.principal(who)],'jing-core-v6'));
 ok(deposit('x',10000,P));
 ok(call('deposit-token-y',[U(1000000),U(P),N,yToken,name],bob));
 mid(P/2);ok(call('settle-token-y-deposit',[Cl.principal(bob),UPDATE,yToken,name],keeper));mid(P);
 expect(equity(token,alice)).toBe(10000n);expect(equity(yToken,bob)).toBe(1000000n);
 expect(equity(token,bob)).toBe(0n);expect(equity(yToken,alice)).toBe(0n);
 const settle=()=>call('settle-with-refresh',[UPDATE,token,name,yToken,name],keeper);
 pauseCore();rejectUnchanged(settle,5016);
 simnet.mineEmptyBurnBlocks(144);ok(call('unpause',[],owner,'jing-core-v6'));
 const beforeX=h.balance('x',bob),beforeY=h.balance('y',alice);
 ok(settle());
 expect(h.balance('x',bob)-beforeX).toBe(9990n);expect(h.balance('y',alice)-beforeY).toBe(999000n);
 for(const asset of [token,yToken]){
  expect(equity(asset,alice)).toBe(0n);expect(equity(asset,bob)).toBe(0n);
  expect(h.value(h.ro('get-total-token-equity',[asset],'jing-core-v6'))).toBe(0n);
 }
 h.custody('x');h.custody('y');
});
