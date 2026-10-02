import {describe,expect,it} from 'vitest';
import {Cl,type ClarityValue} from '@stacks/transactions';
import {U,owner,alice,token,stx,call,read,ok,balance,specs} from './helpers';

// Every jing-ladder-dispatch validation guard, both directions. Each refusal
// must happen before any transfer: the batch rolls back with no events and
// the member's wallet is unchanged.
const dispatch='jing-ladder-dispatch';
const pc=(r:string)=>`${owner}.${r}`;
type Side=typeof specs[number];
const rung=(s:Side,spread:number)=>`jing-${s.label}-stx-spread-${spread}`;
const list=(entries:[string,bigint][])=>Cl.list(entries.map(([r,amount])=>Cl.tuple({rung:Cl.principal(pc(r)),amount:U(amount)})));

// Spreads 10 and 20 seated, 25 registered unseated, 0 never registered.
function setup(){
 ok(call('jing-core-v6','set-verified-contract',[Cl.principal(pc('market'))]));
 ok(call('market','initialize',[Cl.principal(pc('market')),token,stx,U(100),U(10000),U(1),U(45)]));
 for(const s of specs){
  ok(call('jing-ladder-v1','set-canonical',[Cl.stringAscii(s.ladderSide),Cl.principal(pc(rung(s,10)))]));
  for(const spread of [10,20])ok(call(rung(s,spread),'initialize',[U(spread),Cl.bool(true)]));
  ok(call(rung(s,25),'initialize',[U(25),Cl.bool(false)]));
 }
 ok(call('token','mint',[U(1000000),Cl.principal(alice)]));
}
function refused(fn:string,args:ClarityValue[],code:number,who=alice){
 const before=[balance(true,who),balance(false,who)];
 const receipt=call(dispatch,fn,args,who);
 expect(receipt.result).toEqual(Cl.error(U(code)));
 expect(receipt.events).toEqual([]);
 expect([balance(true,who),balance(false,who)]).toEqual(before);
}

for(const s of specs)describe(`dispatch guards: ${s.label}`,()=>{
 const deposit=`deposit-${s.label}`,withdraw=`withdraw-${s.label}`,other=specs.find(o=>o!==s)!;
 const a=s.amount;
 it('deposit: empty list, zero total, zero amount, over budget, under budget',()=>{
  setup();
  refused(deposit,[U(a),Cl.list([])],7101);
  refused(deposit,[U(0),list([[rung(s,10),a]])],7102);
  refused(deposit,[U(a),list([[rung(s,10),0n]])],7103);
  refused(deposit,[U(a),list([[rung(s,10),a],[rung(s,20),1n]])],7102);
  refused(deposit,[U(2n*a),list([[rung(s,10),a]])],7102);
 });
 it('deposit: duplicate rung, unseated rung, rung of the other side',()=>{
  setup();
  refused(deposit,[U(2n*a),list([[rung(s,10),a],[rung(s,10),a]])],7105);
  refused(deposit,[U(a),list([[rung(s,25),a]])],7104);
  refused(deposit,[U(a),list([[rung(other,10),a]])],7104);
  // the same allocation on seated rungs goes through
  ok(call(dispatch,deposit,[U(2n*a),list([[rung(s,10),a],[rung(s,20),a]])],alice));
 });
 it('withdraw: empty list, zero amount, duplicate, other side, never registered',()=>{
  setup();
  ok(call(dispatch,deposit,[U(a),list([[rung(s,10),a]])],alice));
  refused(withdraw,[Cl.list([]),Cl.none()],7101);
  refused(withdraw,[list([[rung(s,10),0n]]),Cl.none()],7103);
  refused(withdraw,[list([[rung(s,10),a],[rung(s,10),a]]),Cl.none()],7105);
  refused(withdraw,[list([[rung(s,10),a],[rung(other,10),a]]),Cl.none()],7108);
  refused(withdraw,[list([[rung(s,0),a]]),Cl.none()],7108);
 });
 it('refuses an intermediary contract spending its caller sender (deposit and withdraw)',()=>{
  setup();
  const target=`'${pc(rung(s,10))}`,dispatcher=`'${pc(dispatch)}`;
  const source=`(define-public (relay-deposit) (contract-call? ${dispatcher} ${deposit} u${a} (list {rung: ${target}, amount: u${a}})))
(define-public (relay-withdraw) (contract-call? ${dispatcher} ${withdraw} (list {rung: ${target}, amount: u${a}}) none))`;
  expect(simnet.deployContract(`relay-${s.label}`,source,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
  for(const fn of ['relay-deposit','relay-withdraw']){
   const receipt=call(`relay-${s.label}`,fn,[],alice);
   expect(receipt.result).toEqual(Cl.error(U(7106)));
   expect(receipt.events).toEqual([]);
  }
  expect(read(rung(s,10),'get-position',[Cl.principal(alice)])).toEqual({sbtc:0n,shares:0n,stx:0n});
 });
});
