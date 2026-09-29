import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import fs from 'node:fs';
import * as h from './helpers';
const {U,owner,alice,token,wrong,name,value,ok}=h;
const core='refund-core',market='refund-market',principal=`${owner}.${market}`;
const MAX=(1n<<128n)-1n;

// Production core and market bodies are intact. Only the market's dependency
// principal changes. An appended PRIVATE test helper seeds an inconsistent
// aggregate after real deposit/registration calls; it is not production code
// or a claim that the corruption can arise through the public API.
function setup(side:h.Side,parked:boolean,total:bigint){
 const coreSource=fs.readFileSync('contracts/jing-core-v6.clar','utf8');
 const faultSetter='\n(define-private (test-set-total (asset principal) (n uint)) (map-set total-token-equity asset n))\n';
 expect(simnet.deployContract(core,coreSource+faultSetter,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 const marketSource=fs.readFileSync('tests/unit/v6-3/.build/market.clar','utf8').replaceAll('.jing-core-v6','.refund-core');
 expect(simnet.deployContract(market,marketSource,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 ok(h.call('set-verified-contract',[Cl.principal(principal)],owner,core));
 ok(h.call('initialize',[Cl.principal(principal),token,wrong,U(100),U(10000),U(1),U(45)],owner,market));
 ok(h.call('mint',[U(100000),Cl.principal(alice)],owner,'token'));
 const amount=h.amount(side),asset=side==='x'?token:wrong;
 ok(h.call(`deposit-token-${side}`,[U(amount),U(h.off(side)),Cl.none(),asset,name],alice,market));
 expect(value(h.ro(`get-token-${side}-deposit`,[U(0),Cl.principal(alice)],market))).toBe(BigInt(amount));
 if(parked)expect(simnet.callPrivateFn(market,`park-token-${side}`,[U(0),U(h.P),Cl.principal(alice),Cl.list([Cl.principal(alice)])],owner).result.type).toBe('ok');
 expect(value(h.ro('get-token-equity',[asset,Cl.principal(alice)],core))).toBe(BigInt(amount));
 expect(simnet.callPrivateFn(core,'test-set-total',[asset,U(total)],owner).result).toEqual(Cl.bool(true));
 ok(h.call('pause',[],owner,core));ok(h.call('set-paused',[Cl.bool(true)],owner,market));
 return {amount,asset};
}
for(const side of ['x','y'] as const)for(const parked of [false,true])describe(`${side} ${parked?'parked':'live'} refund with inconsistent core total`,()=>{
 const amount=BigInt(h.amount(side));
 for(const [label,total] of [['zero',0n],['below debit',amount-1n],['equal to debit',amount],['above debit',amount+1n],['uint maximum',MAX]] as const){
  it(`returns actual funds when total is ${label}`,()=>{
   const {amount,asset}=setup(side,parked,total),before=h.balance(side,alice);
   const receipt=h.call(`cancel-token-${side}-deposit`,[asset,name],alice,market);
   expect(receipt.result).toEqual(Cl.ok(U(amount)));
   expect(h.balance(side,alice)-before).toBe(BigInt(amount));expect(h.balance(side,principal)).toBe(0n);
   expect(value(h.ro(`get-token-${side}-deposit`,[U(0),Cl.principal(alice)],market))).toBe(0n);
   expect(value(h.ro(`get-token-${side}-parked`,[Cl.principal(alice)],market))).toBe(0n);
   expect(value(h.ro('get-token-equity',[asset,Cl.principal(alice)],core))).toBe(0n);
   expect(value(h.ro('get-total-token-equity',[asset],core))).toBe(total>BigInt(amount)?total-BigInt(amount):0n);
   expect(receipt.events.some(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.${core}`)).toBe(true);
   expect(h.call(`cancel-token-${side}-deposit`,[asset,name],alice,market).result).toEqual(Cl.error(U(1005)));
  });
 }
});
