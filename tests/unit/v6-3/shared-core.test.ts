import {beforeEach,describe,expect,it} from 'vitest';
import {Cl,type ClarityValue} from '@stacks/transactions';
import fs from 'node:fs';
import * as h from './helpers';
const {U,N,P,UPDATE,owner,alice,bob,keeper,name,ok,value}=h;
const markets=['market','market-peer'] as const;
const sides=['x','y'] as const;
const client='registered-depositor',clientPrincipal=`${owner}.${client}`;
const assets={x:h.token,y:h.wrong},traits=[assets.x,name,assets.y,name];
const people=[owner,alice,bob,keeper,clientPrincipal];
const pub=(m:string,fn:string,args:ClarityValue[]=[],who=owner)=>h.call(fn,args,who,m);
const read=(m:string,fn:string,args:ClarityValue[]=[])=>value(h.ro(fn,args,m));
const position=(m:string,s:h.Side,who:string)=>{
 const cycle=read(m,'get-current-cycle');
 const live=read(m,`get-token-${s}-deposit`,[U(cycle),Cl.principal(who)]) as bigint;
 const parked=read(m,`get-token-${s}-parked`,[Cl.principal(who)]) as bigint;
 const pending=read(m,`get-token-${s}-pending-deposit`,[Cl.principal(who)])?.amount??0n;
 return {live,parked,pending,credited:live+parked,owned:live+parked+pending};
};
const equity=(s:h.Side,who:string)=>read('jing-core-v6','get-token-equity',[assets[s],Cl.principal(who)]) as bigint;
const deposit=(m:string,s:h.Side,n:number,quote=h.off(s),who=alice)=>pub(m,`deposit-token-${s}`,[U(n),U(quote),N,assets[s],name],who);
const admit=(m:string,s:h.Side,who:string)=>pub(m,`settle-token-${s}-deposit`,[Cl.principal(who),UPDATE,assets[s],name],keeper);
const cancel=(m:string,s:h.Side,who=alice)=>pub(m,`cancel-token-${s}-deposit`,[assets[s],name],who);
const clientDeposit=(m:string,s:h.Side,n:number,quote=h.off(s))=>pub(client,'deposit',[Cl.bool(m==='market-peer'),Cl.bool(s==='x'),U(n),U(quote)]);
const clientCancel=(m:string,s:h.Side)=>pub(client,'cancel',[Cl.bool(m==='market-peer'),Cl.bool(s==='x')]);
let supply:Record<h.Side,bigint>;
const conserved=(s:h.Side)=>[...people,...markets.map(m=>`${owner}.${m}`)].reduce((n,p)=>n+h.balance(s,p),0n);
function accounting(label:string){
 for(const s of sides){
  const snapshots=new Map(markets.map(m=>[m,new Map(people.map(who=>[who,position(m,s,who)]))]));
  const at=(m:typeof markets[number],who:string)=>snapshots.get(m)!.get(who)!;
  let total=0n;
  for(const who of people){
   // A registered custodian is credited at funding, including idle/pending
   // assets. EOAs are credited only when a market admits their deposit.
   const expected=who===clientPrincipal
    ? h.balance(s,who)+markets.reduce((n,m)=>n+at(m,who).owned,0n)
    : markets.reduce((n,m)=>n+at(m,who).credited,0n);
   expect(equity(s,who),`${label}: ${s} equity of ${who}`).toBe(expected);total+=expected;
  }
  expect(read('jing-core-v6','get-total-token-equity',[assets[s]]),`${label}: ${s} global equity`).toBe(total);
  for(const m of markets){
   const claims=people.map(who=>at(m,who));
   expect(h.balance(s,`${owner}.${m}`),`${label}: ${m} ${s} escrow`).toBe(claims.reduce((n,p)=>n+p.owned,0n));
   expect(read(m,'get-cycle-totals',[U(read(m,'get-current-cycle'))])[`total-token-${s}`]).toBe(claims.reduce((n,p)=>n+p.live,0n));
  }
  expect(conserved(s),`${label}: ${s} conservation`).toBe(supply[s]);
 }
}
function step(label:string,fn:()=>ReturnType<typeof h.call>){const r=fn();ok(r);accounting(label);return r;}
function price(n:number){step('price',()=>pub('oracle','set-mid',[U(n)]));}
function drain(){
 for(const m of markets)for(const s of sides)for(const who of people){
  if(position(m,s,who).owned>0n)step('cancel remaining claim',()=>who===clientPrincipal?clientCancel(m,s):cancel(m,s,who));
 }
 for(const s of sides){const n=h.balance(s,clientPrincipal);if(n>0n)step('withdraw registered idle balance',()=>pub(client,'withdraw',[Cl.bool(s==='x'),U(n)]));
  expect(read('jing-core-v6','get-total-token-equity',[assets[s]])).toBe(0n);
 }
}
beforeEach(()=>{
 const source=fs.readFileSync('tests/unit/v6-3/.build/market.clar','utf8');
 expect(simnet.deployContract('market-peer',source,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 expect(simnet.deployContract(client,fs.readFileSync('tests/unit/v6-3/registered-depositor.clar','utf8'),{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 for(const m of markets){
  ok(pub('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.${m}`)]));
  ok(pub(m,'initialize',[Cl.principal(`${owner}.${m}`),assets.x,assets.y,U(100),U(10000),U(1),U(45)]));
 }
 ok(pub('jing-core-v6','set-verified-contract',[Cl.principal(clientPrincipal)]));ok(pub(client,'register'));
 expect(read('jing-core-v6','is-registered',[Cl.principal(clientPrincipal)])).toBe(true);
 for(const who of [owner,alice,bob,keeper])ok(pub('token','mint',[U(1000000000),Cl.principal(who)]));
 supply={x:conserved('x'),y:conserved('y')};accounting('initialized');
});

describe('two v6-3 markets share the real core',()=>{
 for(const s of sides){
  it(`${s}: cancelling one market preserves the same wallet's equity in the other`,()=>{
   step('first claim',()=>deposit('market',s,h.amount(s)));
   step('second claim',()=>deposit('market-peer',s,h.amount(s)*2));
   step('pause core',()=>pub('jing-core-v6','pause'));
   for(const m of markets)step('pause market',()=>pub(m,'set-paused',[Cl.bool(true)]));
   step('cancel first market',()=>cancel('market',s));
   expect(equity(s,alice)).toBe(BigInt(h.amount(s)*2));
   expect(position('market-peer',s,alice).live).toBe(BigInt(h.amount(s)*2));drain();
  });
  it(`${s}: settling one market preserves the same wallet's other-market claim`,()=>{
   step('other-market claim',()=>deposit('market-peer',s,h.amount(s)*2));
   step('x maker',()=>deposit('market','x',10000,P,s==='x'?alice:bob));
   step('y maker escrow',()=>deposit('market','y',1000000,P,s==='y'?alice:bob));
   price(P/2);step('admit y maker',()=>admit('market','y',s==='y'?alice:bob));price(P);
   step('settle first market',()=>pub('market','settle-with-refresh',[UPDATE,...traits],keeper));
   expect(equity(s,alice)).toBe(BigInt(h.amount(s)*2));drain();
  });
 }
});

describe('registered contract depositor with real core accounting',()=>{
 for(const s of sides){
  it(`${s}: funding, two-market deposits and paused cancellation count funds once`,()=>{
   step('fund contract',()=>pub(client,'fund',[Cl.bool(s==='x'),U(h.amount(s)*4)]));
   step('first market claim',()=>clientDeposit('market',s,h.amount(s)));
   step('second market claim',()=>clientDeposit('market-peer',s,h.amount(s)*2));
   expect(equity(s,clientPrincipal)).toBe(BigInt(h.amount(s)*4));
   step('pause core',()=>pub('jing-core-v6','pause'));
   for(const m of markets)step('pause market',()=>pub(m,'set-paused',[Cl.bool(true)]));
   step('cancel first market',()=>clientCancel('market',s));
   expect(position('market-peer',s,clientPrincipal).live).toBe(BigInt(h.amount(s)*2));drain();
  });
  it(`${s}: batch settlement converts contract equity and preserves its other-market claim`,()=>{
   step('fund contract',()=>pub(client,'fund',[Cl.bool(s==='x'),U(h.amount(s)*4)]));
   step('other-market claim',()=>clientDeposit('market-peer',s,h.amount(s)*2));
   step('contract maker',()=>clientDeposit('market',s,h.amount(s),P));
   const opposite=h.other(s);
   step('EOA counterparty',()=>deposit('market',opposite,h.amount(opposite),P,bob));
   price(s==='x'?P/2:P*2);
   // Depending on insertion order, one or both sides are initially pending.
   for(const side of sides)for(const who of [clientPrincipal,bob])if(position('market',side,who).pending>0n)
    step('admit maker',()=>admit('market',side,who));
   price(P);
   step('batch settlement',()=>pub('market','settle-with-refresh',[UPDATE,...traits],keeper));
   expect(equity(s,clientPrincipal)).toBe(BigInt(h.amount(s)*3));
   expect(equity(opposite,clientPrincipal)).toBeGreaterThan(0n);drain();
  });
  for(const remainder of ['resting','refunded-dust'] as const)
  it(`${s}: passive registered maker walk with ${remainder} preserves exact equity`,()=>{
   const quote=s==='x'?(remainder==='resting'?P*1.5:P*2):P/2;
   const makerAmount=remainder==='resting'?h.amount(s):s==='x'?4991:499001;
   step('fund contract',()=>pub(client,'fund',[Cl.bool(s==='x'),U(h.amount(s)*4)]));
   step('other-market claim',()=>clientDeposit('market-peer',s,h.amount(s)*2));
   step('passive contract maker',()=>clientDeposit('market',s,makerAmount,quote));
   const opposite=h.other(s);
   const beforeInput=equity(s,clientPrincipal),beforeOutput=h.balance(opposite,clientPrincipal);
   const receipt=step('EOA walks registered maker',()=>pub('market','swap',[U(h.amount(opposite)),U(quote),UPDATE,...traits,Cl.bool(opposite==='x')],bob));
   const events=receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.jing-core-v6`).map(e=>value(e.data.value));
   const match=events.find(e=>e.event==='match');expect(match).toBeDefined();
   expect(equity(s,clientPrincipal)).toBe(beforeInput-match[`${s}-traded`]);
   expect(equity(opposite,clientPrincipal)).toBe(h.balance(opposite,clientPrincipal)-beforeOutput);
   if(remainder==='refunded-dust'){
    expect(position('market',s,clientPrincipal).owned).toBe(0n);
    expect(events.filter(e=>e.event===`refund-${s}`&&e.depositor===clientPrincipal)).toEqual([expect.objectContaining({amount:1n})]);
   }else expect(position('market',s,clientPrincipal).live).toBeGreaterThan(0n);
   expect(position('market-peer',s,clientPrincipal).live).toBe(BigInt(h.amount(s)*2));drain();
  });

  it(`${s}: registered taker logs its own swap once while the market accounts the EOA maker`,()=>{
   const opposite=h.other(s),quote=s==='x'?P/2:P*2,makerAmount=s==='x'?499000:4990;
   step('fund registered taker',()=>pub(client,'fund',[Cl.bool(s==='x'),U(h.amount(s)*4)]));
   step('other-market claim',()=>clientDeposit('market-peer',s,h.amount(s)*2));
   step('EOA resting maker',()=>deposit('market',opposite,makerAmount,quote,bob));
   const receipt=step('registered taker swaps and logs',()=>pub(client,'swap',[Cl.bool(s==='x'),U(h.amount(s)),U(quote)]));
   const result=value(receipt.result);
   expect(result['rebate-refunded']).toBe(1n);
   expect(result[`token-${s}-rolled`]).toBe(s==='x'?0n:3n);
   expect(equity(s,clientPrincipal)).toBe(BigInt(h.amount(s)*3)+result['rebate-refunded']+result[`token-${s}-rolled`]);
   expect(equity(opposite,clientPrincipal)).toBeGreaterThan(0n);drain();
  });
  it(`${s}: core pause rejects a walk without changing either market or equity`,()=>{
   const quote=s==='x'?P*1.5:P/2,opposite=h.other(s);
   step('fund registered maker',()=>pub(client,'fund',[Cl.bool(s==='x'),U(h.amount(s)*4)]));
   step('other-market claim',()=>clientDeposit('market-peer',s,h.amount(s)*2));
   step('passive contract maker',()=>clientDeposit('market',s,h.amount(s),quote));
   step('core paused',()=>pub('jing-core-v6','pause'));
   const peerBefore=sides.map(side=>people.map(who=>position('market-peer',side,who)));
   h.rejectUnchanged(()=>pub('market','swap',[U(h.amount(opposite)),U(quote),UPDATE,...traits,Cl.bool(opposite==='x')],bob),5016,[clientPrincipal,`${owner}.market-peer`]);
   expect(sides.map(side=>people.map(who=>position('market-peer',side,who)))).toEqual(peerBefore);
   accounting('rejected walk');drain();
  });
 }
});
