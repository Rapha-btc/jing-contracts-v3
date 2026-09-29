import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Cl,serializeCV,signMessageHashRsv,privateKeyToPublic,publicKeyToHex,type ClarityValue} from '@stacks/transactions';
const accounts=simnet.getAccounts(),owner=accounts.get('deployer')!,maker=accounts.get('wallet_1')!,keeper=accounts.get('wallet_2')!,stranger=accounts.get('wallet_3')!;
const key='753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601';
const vault=`${owner}.vault`,U=Cl.uint,P=1_000_000_000_000n,update=Cl.bufferFromHex('00');
const token=Cl.contractPrincipal(owner,'token'),stx=Cl.contractPrincipal(owner,'wrong-token'),name=Cl.stringAscii('token');
function value(cv:any):any{
 if(cv.type==='uint'||cv.type==='int')return BigInt(cv.value);
 if(cv.type==='ok'||cv.type==='some')return value(cv.value);
 if(cv.type==='none')return null;
 if(cv.type==='true'||cv.type==='false')return cv.type==='true';
 if(cv.type==='tuple')return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,value(v)]));
 return cv.value;
}
const call=(c:string,f:string,args:ClarityValue[]=[],sender=owner)=>simnet.callPublicFn(c,f,args,sender);
const read=(c:string,f:string,args:ClarityValue[]=[])=>value(simnet.callReadOnlyFn(c,f,args,owner).result);
function ok(r:ReturnType<typeof call>){expect(r.result.type,JSON.stringify(r.result)).toBe('ok');return value(r.result);}
const side=(x:boolean)=>Cl.stringAscii(x?'token':'wstx');
const balance=(x:boolean,p=vault)=>x?read('token','get-balance',[Cl.principal(p)]):simnet.getAssetsMap().get('STX')!.get(p)??0n;
const equity=(x:boolean)=>read('jing-core-v6','get-token-equity',[x?token:stx,Cl.principal(vault)]);
const position=(x:boolean)=>read('vault','get-jing-position',[side(x)]);
const pendingLimit=(x:boolean)=>read('market',`get-token-${x?'x':'y'}-pending-limit`,[Cl.principal(vault)]);
const total=(x:boolean)=>{const p=position(x);return balance(x)+p.live+p.parked+(p['pending-deposit']?.amount??0n);};
const hash=(cv:ClarityValue)=>createHash('sha256').update(Buffer.from(serializeCV(cv),'hex')).digest();
function intent(action:string,x:boolean,amount:bigint,limit:bigint,id=1,expiry=0){
 const domain=hash(Cl.tuple({'chain-id':U(2147483648),name:Cl.stringAscii('jing-vault'),version:Cl.stringAscii('1')}));
 const message=hash(Cl.tuple({action:Cl.stringAscii(action),side:side(x),amount:U(amount),'limit-price':U(limit),'auth-id':U(id),expiry:U(expiry),vault:Cl.principal(vault)}));
 const digest=createHash('sha256').update(Buffer.concat([Buffer.from('534950303138','hex'),domain,message])).digest('hex');
 return {digest,args:[Cl.bufferFromHex(signMessageHashRsv({messageHash:digest,privateKey:key})),side(x),U(amount),U(limit),U(id),U(expiry)]};
}
function setup(){
 for(const n of ['router','vault'])expect(simnet.deployContract(n,fs.readFileSync(`tests/unit/vault-v6-3/.build/${n}.clar`,'utf8'),{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
 for(const n of ['market','vault'])ok(call('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.${n}`)]));
 ok(call('market','initialize',[Cl.principal(`${owner}.market`),token,stx,U(100),U(10000),U(1),U(45)]));
 ok(call('vault','initialize',[Cl.principal(vault)]));
 ok(call('vault','set-owner-pubkey',[Cl.bufferFromHex(publicKeyToHex(privateKeyToPublic(key)))]));
 ok(call('vault','set-keeper',[Cl.some(Cl.principal(keeper))]));
 for(const who of [owner,maker])ok(call('token','mint',[U(10_000_000),Cl.principal(who)]));
 ok(call('vault','deposit-sbtc',[U(1_000_000)]));ok(call('vault','deposit-stx',[U(100_000_000)]));
 for(const n of ['mock-dlmm-router','mock-xyk-core','mock-velar-pool']){
  expect(simnet.transferSTX(10_000_000_000_000,`${owner}.${n}`,owner).result).toEqual(Cl.ok(Cl.bool(true)));
  ok(call('token','mint',[U(10_000_000_000),Cl.principal(`${owner}.${n}`)]));
 }
}
function addMaker(x:boolean,amount:bigint,limit:bigint){
 ok(call('market',`deposit-token-${x?'x':'y'}`,[U(amount),U(limit),Cl.none(),x?token:stx,name],maker));
 if(read('market',`get-token-${x?'x':'y'}-pending-deposit`,[Cl.principal(maker)]))
  ok(call('market',`settle-token-${x?'x':'y'}-deposit`,[Cl.principal(maker),update,x?token:stx,name],stranger));
}
for(const x of [true,false])describe(x?'sBTC vault':'STX vault',()=>{
 const amount=x?10000n:1000000n,limit=x?P*2n:P/2n;
 it('submits, settles and cancels a maker order with unchanged core equity',()=>{
  setup();addMaker(!x,x?1000000n:10000n,x?P/2n:P*2n);
  const i=intent('jing-deposit',x,amount,limit);
  ok(call('vault','execute-jing-deposit',i.args,keeper));
  expect(position(x)['pending-deposit'].amount).toBe(amount);expect(position(x).live).toBe(0n);
  expect(equity(x)).toBe(total(x));
  ok(call('market',`settle-token-${x?'x':'y'}-deposit`,[Cl.principal(vault),update,x?token:stx,name],stranger));
  expect(position(x)['pending-deposit']).toBe(null);expect(position(x).live).toBe(amount);
  expect(equity(x)).toBe(total(x));
  ok(call('vault',x?'cancel-jing-sbtc':'cancel-jing-stx',[],keeper));
  expect(equity(x)).toBe(balance(x));expect(position(x).live).toBe(0n);
  expect(call('vault','execute-jing-deposit',i.args,keeper).result).toEqual(Cl.error(U(6003)));
 });
 it('direct taker fill leaves core equity equal to actual holdings',()=>{
  setup();addMaker(!x,x?10000000n:100000n,P);
  const i=intent('jing-swap',x,amount,P);
  ok(call('vault','execute-jing-swap',[...i.args,update],keeper));
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
 it('crossing reprice supports an aged update and exact equity',()=>{
  setup();ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,limit).args,keeper));
  addMaker(!x,x?10000000n:100000n,P);
  ok(call('oracle','configure',[U(0),U(79),U(79)]));
  ok(call('vault','execute-jing-reprice',[...intent('jing-reprice',x,amount,P,2).args,update],keeper));
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
 it('queues a limit change, refuses a crossing change and preserves the original order',()=>{
  setup();ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,limit).args,keeper));
  addMaker(!x,x?10000000n:100000n,P);
  const good=x?P*3n:P/3n;
  ok(call('vault','execute-jing-set-limit',intent('jing-set-limit',x,amount,good,2).args,keeper));
  expect(pendingLimit(x).limit).toBe(good);
  expect(ok(call('market',`settle-token-${x?'x':'y'}-limit`,[Cl.principal(vault),update],stranger))).toBe(true);
  expect(pendingLimit(x)).toBe(null);
  ok(call('vault','execute-jing-set-limit',intent('jing-set-limit',x,amount,P,3).args,keeper));
  expect(ok(call('market',`settle-token-${x?'x':'y'}-limit`,[Cl.principal(vault),update],stranger))).toBe(false);
  expect(position(x).live).toBe(amount);expect(equity(x)).toBe(total(x));
 });
 it('does not count pending escrow as inventory eligible for repricing',()=>{
  setup();addMaker(!x,x?1000000n:10000n,x?P/2n:P*2n);
  ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,limit).args,keeper));
  const i=intent('jing-set-limit',x,amount,limit,2);
  expect(call('vault','execute-jing-set-limit',i.args,keeper).result).toEqual(Cl.error(U(6022)));
  expect(read('vault','is-signature-used',[Cl.bufferFromHex(i.digest)])).toBe(false);
  ok(call('jing-core-v6','pause'));ok(call('market','set-paused',[Cl.bool(true)]));
  ok(call('vault',x?'cancel-jing-sbtc':'cancel-jing-stx',[],keeper));
  expect(position(x)['pending-deposit']).toBe(null);expect(equity(x)).toBe(balance(x));
  ok(call('vault',x?'withdraw-sbtc':'withdraw-stx',[U(balance(x))]));
  expect(equity(x)).toBe(0n);expect(balance(x)).toBe(0n);
 });
 it('preserves unlogged bridge funds across a crossing reprice',()=>{
  setup();
  if(x)ok(call('token','mint',[U(amount),Cl.principal(vault)]));
  else expect(simnet.transferSTX(Number(amount),vault,owner).result).toEqual(Cl.ok(Cl.bool(true)));
  const unlogged=total(x)-equity(x);
  ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,limit).args,keeper));
  addMaker(!x,x?10000000n:100000n,P);
  ok(call('vault','execute-jing-reprice',[...intent('jing-reprice',x,amount,P,2).args,update],keeper));
  expect(total(x)-equity(x)).toBe(unlogged);expect(equity(!x)).toBe(total(!x));
 });
 it('rolls back funds and signature consumption when a swap fails',()=>{
  setup();const i=intent('jing-swap',x,amount,P),before=[total(x),total(!x),equity(x),equity(!x)];
  expect(call('vault','execute-jing-swap',[...i.args,update],keeper).result.type).toBe('err');
  expect([total(x),total(!x),equity(x),equity(!x)]).toEqual(before);
  expect(read('vault','is-signature-used',[Cl.bufferFromHex(i.digest)])).toBe(false);
  expect(call('vault','execute-jing-swap',[...i.args,update],stranger).result).toEqual(Cl.error(U(6001)));
 });
 it('accounts a passive fill without a vault swap log',()=>{
  setup();ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,P).args,keeper));
  ok(call('market','swap',[U(x?500000n:5000n),U(P),update,token,name,stx,name,Cl.bool(!x)],maker));
  expect(position(x).live).toBeLessThan(amount);
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
 it('keeps pending escrow intact during a router swap and reconciles only this operation',()=>{
  setup();addMaker(!x,x?1000000n:10000n,x?P/2n:P*2n);
  ok(call('vault','execute-jing-deposit',intent('jing-deposit',x,amount,limit).args,keeper));
  const routerLimit=x?20000000000000n:40000000000000n;
  ok(call('vault','execute-router-swap',[...intent('router-swap',x,amount,routerLimit,2).args,Cl.none(),U(30000000000000n)],keeper));
  expect(position(x)['pending-deposit'].amount).toBe(amount);
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
 it('real router accounts Jing fills followed by pool legs',()=>{
  setup();const mid=30000000000000n;
  ok(call('oracle','set-mid',[U(mid)]));
  addMaker(!x,x?1000000n:100n,mid);
  const routerLimit=x?20000000000000n:40000000000000n;
  const receipt=call('vault','execute-router-swap',[...intent('router-swap',x,amount,routerLimit).args,Cl.some(update),U(mid)],keeper);ok(receipt);
  const route=receipt.events.filter(e=>e.event==='print_event'&&e.data.contract_identifier===`${owner}.router`).map(e=>value(e.data.value)).find(e=>e.topic);
  expect(route['jing-in']).toBeGreaterThan(0n);
  expect(route['dlmm-in']+route['xyk-in']+route['velar-in']).toBeGreaterThan(0n);
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
 it('real router swaps through funded mock venues and logs exact equity',()=>{
  setup();
  // Limits admit the mock venues near 3000 micro-STX/sat.
  const routerLimit=x?20000000000000n:40000000000000n;
  ok(call('vault','execute-router-swap',[...intent('router-swap',x,amount,routerLimit).args,Cl.none(),U(30000000000000n)],keeper));
  expect(equity(x)).toBe(total(x));expect(equity(!x)).toBe(total(!x));
 });
});

it('new core reconciliation cannot be called by an unregistered wallet',()=>{
 setup();
 expect(call('jing-core-v6','log-jing-swap-reconciled',[
  Cl.bufferFromHex('00'.repeat(32)),Cl.principal(`${owner}.market`),token,stx,
  U(1),U(P),U(1),U(0),U(0),
 ],stranger).result).toEqual(Cl.error(U(5001)));
});
