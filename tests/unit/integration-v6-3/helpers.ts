import {afterAll,expect} from 'vitest';
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
const token=Cl.contractPrincipal(owner,'token'),stx=Cl.contractPrincipal(owner,'asset-stx'),name=Cl.stringAscii('token'),update=Cl.bufferFromHex('00');
function value(cv:any):any{
 if(cv.type==='uint'||cv.type==='int')return BigInt(cv.value);
 if(cv.type==='ok'||cv.type==='some')return value(cv.value);
 if(cv.type==='none')return null;
 if(cv.type==='true'||cv.type==='false')return cv.type==='true';
 if(cv.type==='tuple')return Object.fromEntries(Object.entries(cv.value).map(([k,v])=>[k,value(v)]));
 if(cv.type==='list')return cv.value.map(value);
 return cv.value;
}
const call=(contract:string,fn:string,args:ClarityValue[]=[],sender=owner)=>simnet.callPublicFn(contract,fn,args,sender);
const read=(contract:string,fn:string,args:ClarityValue[]=[])=>value(simnet.callReadOnlyFn(contract,fn,args,owner).result);
function ok(receipt:ReturnType<typeof call>){expect(receipt.result.type).toBe('ok');return value(receipt.result);}
const balance=(x:boolean,who:string)=>x?read('token','get-balance',[Cl.principal(who)]):simnet.getAssetsMap().get('STX')!.get(who)??0n;
const specs=[{label:'buy',side:'x',x:true,ladderSide:'buy-band',amount:10000n}, {label:'sell',side:'y',x:false,ladderSide:'sel-band',amount:1000000n}] as const;
function setup(spec:typeof specs[number], options:{initialize?:boolean;seat?:boolean;spread?:number}={}){
 const spread=options.spread??0;
 const rung=`jing-${spec.label}-stx-spread-${spread}`,principal=`${owner}.${rung}`;
 // Manifest deployment lets Clarinet instrument the actual rung source.
 ok(call('jing-core-v6','set-verified-contract',[Cl.principal(`${owner}.market`)]));
 ok(call('market','initialize',[Cl.principal(`${owner}.market`),token,stx,U(100),U(10000),U(1),U(45)]));
 ok(call('jing-ladder-v1','set-canonical',[Cl.stringAscii(spec.ladderSide),Cl.principal(principal)]));
 if(options.initialize!==false){
  ok(call(rung,'initialize',[U(spread),Cl.bool(options.seat!==false)]));
  expect(read('jing-ladder-v1','is-registered',[Cl.principal(principal)])).toBe(true);
 }
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


export {U,P,owner,alice,bob,taker,token,stx,name,update,value,call,read,ok,balance,specs,setup};
