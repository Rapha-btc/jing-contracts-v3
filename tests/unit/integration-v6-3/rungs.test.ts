import {afterAll,describe,expect,it} from 'vitest';
import {Cl,type ClarityValue} from '@stacks/transactions';
import fs from 'node:fs';
import crypto from 'node:crypto';

const U=Cl.uint,P=1_000_000_000_000n;
const build='tests/unit/integration-v6-3/.build';
const provenance=JSON.parse(fs.readFileSync(`${build}/sources.json`,'utf8'));
afterAll(()=>{
 const sha=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
 for(const [name,meta] of Object.entries(provenance.sources) as [string,any][]){
  const source=fs.readFileSync(meta.path,'utf8');
  expect(sha(source),`${meta.path} changed during the run; rerun against the new revision`).toBe(meta.sha256);
  let expected=source;
  if(name!=='jing-core-v6'&&name!=='jing-ladder-v1')for(const [from,to] of Object.entries(provenance.substitutions))expected=expected.replaceAll(from,to as string);
  expect(fs.readFileSync(`${build}/${name}.clar`,'utf8')).toBe(expected);
 }
});
const accounts=simnet.getAccounts(),owner=accounts.get('deployer')!,alice=accounts.get('wallet_1')!,bob=accounts.get('wallet_2')!,taker=accounts.get('wallet_3')!;
const token=Cl.contractPrincipal(owner,'token'),stx=Cl.contractPrincipal(owner,'wrong-token'),name=Cl.stringAscii('token'),update=Cl.bufferFromHex('00');
function value(cv:any):any{
 if(cv.type==='uint'||cv.type==='int')return BigInt(cv.value);
 if(cv.type==='ok'||cv.type==='some')return value(cv.value);
 if(cv.type==='none')return null;
 if(cv.type==='true'||cv.type==='false')return cv.type==='true';
 if(cv.type==='tuple')return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,value(v)]));
 return cv.value;
}
const call=(contract:string,fn:string,args:ClarityValue[]=[],sender=owner)=>simnet.callPublicFn(contract,fn,args,sender);
const read=(contract:string,fn:string,args:ClarityValue[]=[])=>value(simnet.callReadOnlyFn(contract,fn,args,owner).result);
function ok(receipt:ReturnType<typeof call>){expect(receipt.result.type).toBe('ok');return value(receipt.result);}
const balance=(x:boolean,who:string)=>x?read('token','get-balance',[Cl.principal(who)]):simnet.getAssetsMap().get('STX')!.get(who)??0n;
const specs=[{label:'buy',side:'x',x:true,ladderSide:'buy-band',amount:10000n}, {label:'sell',side:'y',x:false,ladderSide:'sel-band',amount:1000000n}] as const;
function setup(spec:typeof specs[number]){
 const rung=`jing-${spec.label}-stx-spread-0`,principal=`${owner}.${rung}`;
 const source=fs.readFileSync(`tests/unit/integration-v6-3/.build/jing-${spec.label}-stx-core-spread-v1.clar`,'utf8');
 expect(simnet.deployContract(rung,source,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 ok(call('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.market`)]));
 ok(call('market','initialize',[Cl.principal(`${owner}.market`),token,stx,U(100),U(10000),U(1),U(45)]));
 ok(call('jing-ladder-v1','set-canonical',[Cl.stringAscii(spec.ladderSide),Cl.principal(principal)]));
 ok(call(rung,'initialize',[U(0),Cl.bool(true)]));
 expect(read('jing-ladder-v1','is-registered',[Cl.principal(principal)])).toBe(true);
 // Ladder registration does not make a rung a core-registered custodian.
 expect(read('jing-core-v6','is-registered',[Cl.principal(principal)])).toBe(false);
 for(const who of [alice,bob,taker])ok(call('token','mint',[U(1000000),Cl.principal(who)]));
 const position=(who:string)=>read(rung,'get-position',[Cl.principal(who)]);
 const state=()=>read(rung,'get-state');
 const pending=()=>read('market',`get-token-${spec.side}-pending-deposit`,[Cl.principal(principal)]);
 const admit=()=>{if(pending())ok(call('market',`settle-token-${spec.side}-deposit`,[Cl.principal(principal),update,spec.x?token:stx,name],taker));};
 const deposit=(who:string,n=spec.amount)=>{ok(call(rung,'deposit',[U(n)],who));admit();};
 const equity=()=>read('jing-core-v6','get-token-equity',[spec.x?token:stx,Cl.principal(principal)]);
 const held=()=>balance(spec.x,principal);
 const paused=()=>{ok(call('jing-core-v6','pause'));ok(call('market','set-paused',[Cl.bool(true)]));};
 const withdraw=(who:string,n=spec.amount)=>ok(call(rung,'withdraw',[U(n),Cl.none()],who));
 const addOppositeMaker=()=>{
  const side=spec.x?'y':'x',asset=spec.x?stx:token,amount=spec.x?1000000n:10000n;
  ok(call('market',`deposit-token-${side}`,[U(amount),U(spec.x?P/2n:P*2n),Cl.none(),asset,name],taker));
  if(read('market',`get-token-${side}-pending-deposit`,[Cl.principal(taker)]))
   ok(call('market',`settle-token-${side}-deposit`,[Cl.principal(taker),update,asset,name],taker));
  expect(read('market',`get-token-${side}-deposit`,[U(read('market','get-current-cycle')),Cl.principal(taker)])).toBe(amount);
 };
 return {rung,principal,position,state,pending,admit,deposit,equity,held,paused,withdraw,addOppositeMaker};
}

for(const spec of specs)describe(`real ${spec.label} core-spread v1 rung`,()=>{
 it('registers with the real ladder and returns a funded position while market and core are paused',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  r.deposit(alice);
  expect(r.state().resting).toBe(spec.amount);
  expect(r.equity()).toBe(spec.amount);
  expect(balance(spec.x,`${owner}.market`)).toBe(spec.amount);
  r.paused();const paid=r.withdraw(alice);
  expect(paid[spec.x?'sbtc':'stx']).toBe(spec.amount);
  expect(balance(spec.x,alice)).toBe(before);
  expect(r.state()['total-shares']).toBe(0n);
  expect(r.position(alice).shares).toBe(0n);
  expect(r.equity()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  expect(r.held()).toBe(0n);
 });
 it('preserves the other member through partial withdrawal and fully drains while paused',()=>{
  const r=setup(spec),beforeA=balance(spec.x,alice),beforeB=balance(spec.x,bob);
  r.deposit(alice);r.deposit(bob);r.paused();
  r.withdraw(alice,spec.amount/2n);
  expect(r.position(bob)[spec.x?'sbtc':'stx']).toBe(spec.amount);
  expect(r.equity()).toBe(spec.amount*3n/2n);
  r.withdraw(alice);r.withdraw(bob);
  expect(balance(spec.x,alice)).toBe(beforeA);expect(balance(spec.x,bob)).toBe(beforeB);
  expect(r.equity()).toBe(0n);expect(r.held()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
 });
 it('holds a deposit locally when the real core refuses admission and lets the member exit',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  ok(call('jing-core-v6','pause'));
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  expect(r.state().resting).toBe(0n);expect(r.held()).toBe(spec.amount);
  expect(r.equity()).toBe(0n);
  r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);expect(r.held()).toBe(0n);
 });
 it('rejects an unauthorized initialization without taking a ladder seat',()=>{
  const r=setup(spec);
  // The owner check runs before the already-initialized check for a band rung.
  expect(call(r.rung,'initialize',[U(0),Cl.bool(true)],alice).result).toEqual(Cl.error(U(7001)));
  expect(read('jing-ladder-v1','get-band-count',[Cl.stringAscii(spec.ladderSide)])).toBe(1n);
 });
 it('accounts a partial maker fill and pays both members their actual proceeds',()=>{
  const r=setup(spec);
  r.deposit(alice);r.deposit(bob);
  const outputBefore=[balance(!spec.x,alice),balance(!spec.x,bob)];
  const receipt=ok(call('market','swap',[U(spec.x?1000000:10000),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
  expect(receipt[spec.x?'token-x-received':'token-y-received']).toBeGreaterThan(0n);
  const received=balance(!spec.x,r.principal);
  expect(received).toBeGreaterThan(0n);
  ok(call(r.rung,'sync',[],taker));
  const inputKey=spec.x?'sbtc':'stx',outputKey=spec.x?'stx':'sbtc';
  const claims=[r.position(alice),r.position(bob)];
  expect(claims[0][inputKey]).toBeGreaterThan(0n);
  expect(claims[0][inputKey]).toBeLessThan(spec.amount);
  expect(claims[0][outputKey]).toBe(claims[1][outputKey]);
  for(const who of [alice,bob])ok(call(r.rung,'claim',[],who));
  const paid=(balance(!spec.x,alice)-outputBefore[0])+(balance(!spec.x,bob)-outputBefore[1]);
  expect(paid).toBe(claims[0][outputKey]+claims[1][outputKey]);
  expect(received-paid).toBeLessThanOrEqual(2n);
  expect(balance(!spec.x,r.principal)).toBe(received-paid);
  r.paused();
  for(const who of [alice,bob]){
   const before=balance(spec.x,who),claim=r.position(who)[inputKey];
   r.withdraw(who,spec.amount);
   expect(balance(spec.x,who)-before).toBe(claim);
   expect(r.position(who).shares).toBe(0n);
  }
  expect(r.equity()).toBe(0n);expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  expect(r.held()).toBeLessThanOrEqual(2n);
 });
 it('retiring a seat preserves the member claim and paused exit',()=>{
  const r=setup(spec),before=balance(spec.x,alice);r.deposit(alice);
  ok(call('jing-ladder-v1','retire-band',[Cl.stringAscii(spec.ladderSide),U(0)]));
  expect(call('market','sync-seat',[Cl.principal(r.principal)],taker).result).toEqual(Cl.error(U(1028)));
  ok(call('market','prune-seats',[],taker));
  expect(read('jing-ladder-v1','is-current-rung',[Cl.principal(r.principal)])).toBe(false);
  expect(read('jing-ladder-v1','is-registered',[Cl.principal(r.principal)])).toBe(true);
  expect(r.position(alice)[spec.x?'sbtc':'stx']).toBe(spec.amount);
  r.paused();r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);expect(r.equity()).toBe(0n);
 });
 it('returns expired pending escrow without an oracle while market and core are paused',()=>{
  const r=setup(spec),before=balance(spec.x,alice);
  r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],alice));
  expect(r.pending()?.amount).toBe(spec.amount);
  expect(r.equity()).toBe(0n);
  simnet.mineEmptyBurnBlocks(145);r.paused();
  r.withdraw(alice);
  expect(balance(spec.x,alice)).toBe(before);
  expect(r.pending()).toBe(null);expect(r.held()).toBe(0n);
  expect(balance(spec.x,`${owner}.market`)).toBe(0n);
 });
 it('does not require an oracle for a funded live exit when another member has a young pending top-up',()=>{
  const r=setup(spec);r.deposit(alice);
  r.addOppositeMaker();
  ok(call(r.rung,'deposit',[U(spec.amount)],bob));
  expect(r.pending()?.amount).toBe(spec.amount);
  r.paused();
  const before=balance(spec.x,alice);
  const snapshot=()=>({state:r.state(),alice:r.position(alice),bob:r.position(bob),pending:r.pending(),equity:r.equity(),wallet:balance(spec.x,alice),market:balance(spec.x,`${owner}.market`),held:r.held()});
  const prior=snapshot();
  const receipt=call(r.rung,'withdraw',[U(spec.amount/2n),Cl.none()],alice);
  if(receipt.result.type==='err'){
   expect(receipt.result).toEqual(Cl.error(U(7012)));
   expect(snapshot()).toEqual(prior);
   // Establish the practical impact: the current sell port delays the exit,
   // but both members can recover after the 24-hour pending timeout.
   simnet.mineEmptyBurnBlocks(145);
   for(const who of [alice,bob]){
    const wallet=balance(spec.x,who);r.withdraw(who);
    expect(balance(spec.x,who)-wallet).toBe(spec.amount);
   }
   expect(r.held()).toBe(0n);expect(r.equity()).toBe(0n);
   expect(balance(spec.x,`${owner}.market`)).toBe(0n);
  }
  // Keep the desired behavior a normal failing regression until the sell
  // rung is ported. Do not turn this into a passing expected-error test.
  expect(receipt.result).toEqual(Cl.ok(Cl.tuple({
   sbtc:U(spec.x?spec.amount/2n:0),stx:U(spec.x?0:spec.amount/2n),
  })));
  expect(balance(spec.x,alice)-before).toBe(spec.amount/2n);
  expect(r.pending()?.amount).toBe(spec.amount);
  expect(r.position(bob)[spec.x?'sbtc':'stx']).toBe(spec.amount);
 });
});
