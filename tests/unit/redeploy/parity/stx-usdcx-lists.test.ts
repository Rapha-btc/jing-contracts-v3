import {it,expect} from 'vitest';
import {Cl,getAddressFromPrivateKey} from '@stacks/transactions';
import {boot,simnet,owner,names} from '../lab';
const U=Cl.uint,P=10000000000n,update=Cl.bufferFromHex('00'.repeat(72));
const ok=(r:any)=>{expect(r.result.type,Cl.prettyPrint(r.result)).toBe('ok');return r.result.value;};
for(const market of ['market-stx-usdcx'])for(const side of ['x','y'])for(const action of ['cancel','withdraw','fill','full-50'])it(`${market} ${side}: ordered mixed-principal list removals via ${action}`,async()=>{
 await boot();
 const id=`${owner}.${names[market]}`,native=side==='x';
 const token=side==='x'?'asset-stx':'usdcx';
 const tokenId=Cl.contractPrincipal(owner,token),name=Cl.stringAscii(token==='asset-stx'?'wstx':'token');
 const tx=(f:string,a:any[]=[],sender=owner,c=market)=>simnet.callPublicFn(c,f,a,sender);
 const ro=(f:string,a:any[]=[])=>simnet.callReadOnlyFn(market,f,a,owner).result;
 ok(tx('set-verified-contract',[Cl.principal(id)],owner,'jing-core-v6'));
 ok(tx('initialize',[Cl.principal(id),Cl.contractPrincipal(owner,'asset-stx'),Cl.contractPrincipal(owner,'usdcx'),U(1000),U(100000),U(45),U(7)]));
 ok(tx('configure-feed-ids',[U(45),U(7)],owner,'oracle'));ok(tx('set-mid',[U(P)],owner,'oracle'));
 // Zero reserved seats permits the complete production MAX_DEPOSITORS list.
 const ladder='jing-ladder-stx-usdcx-v1';
 ok(tx('set-max-band-per-side',[U(0)],owner,ladder));ok(tx('sync-seat-count'));
 const amount=side==='x'?10000n:1000000n,limit=side==='x'?P*2n:P/2n;
 const count=action==='full-50'?50:4;
 const makers:string[]=[];
 for(let i=0;i<count;i++){
  const contract=i%2===1;
  const who=contract?`${owner}.maker-${i}`:getAddressFromPrivateKey(BigInt(900+i).toString(16).padStart(64,'0')+'01','testnet');
  makers.push(who);
  if(contract)ok(simnet.transferSTX(1000000000000n,who,owner));else simnet.mintSTX(who,10000000000000n);
  if(!native)ok(tx('mint',[U(amount*10n),Cl.principal(who)],owner,token));
  if(contract){
   const allowance=native?'(with-stx amount)':`(with-ft '${owner}.${token} "token" amount)`;
   const source=`
(define-public (deposit (amount uint) (limit uint))
 (as-contract? (${allowance}) (try! (contract-call? '${id} deposit-token-${side} amount limit none '${owner}.${token} "${token==='asset-stx'?'wstx':'token'}"))))
(define-public (cancel) (as-contract? () (try! (contract-call? '${id} cancel-token-${side}-deposit '${owner}.${token} "${token==='asset-stx'?'wstx':'token'}"))))
(define-public (withdraw (amount uint)) (as-contract? () (try! (contract-call? '${id} withdraw-token-${side} amount '${owner}.${token} "${token==='asset-stx'?'wstx':'token'}"))))
(define-public (change-limit (price uint)) (as-contract? () (try! (contract-call? '${id} set-token-${side}-limit price none))))`;
   expect(simnet.deployContract(`maker-${i}`,source,{clarityVersion:5},owner).result).toEqual(Cl.bool(true));
   ok(tx('deposit',[U(amount),U(limit)],owner,who));
  }else ok(tx(`deposit-token-${side}`,[U(amount),U(limit),Cl.none(),tokenId,name],who));
 }
 const cycle=()=>ro('get-current-cycle');
 const list=()=>ro(`get-token-${side}-depositors`,[cycle()]);
 const exact=(people:string[])=>expect(list()).toEqual(Cl.list(people.map(Cl.principal)));
 const act=(who:string,method:string,args:any[])=>who.includes('.')?tx(method==='limit'?'change-limit':method,args,owner,who):tx(method==='cancel'?`cancel-token-${side}-deposit`:method==='withdraw'?`withdraw-token-${side}`:`set-token-${side}-limit`,method==='cancel'?[tokenId,name]:method==='withdraw'?[...args,tokenId,name]:[...args,Cl.none()],who);
 exact(makers);
 // Missing principal is an explicit no-op of the read-cut helper; the public
 // cancellation rejects a missing position and must leave the list unchanged.
 const missing=getAddressFromPrivateKey('999'.padStart(64,'0')+'01','testnet');
 expect(simnet.callPrivateFn(market,`drop-${side}`,[list(),Cl.principal(missing)],owner).result).toEqual(list());
 expect(tx(`cancel-token-${side}-deposit`,[tokenId,name],missing).result.type).toBe('err');exact(makers);
 const remaining=[...makers];
 if(action==='fill'){
  // Cross only the selected maker at mid. The others roll in exact order.
  for(const choose of [(xs:string[])=>xs[0],(xs:string[])=>xs[Math.floor(xs.length/2)],(xs:string[])=>xs.at(-1)!,(xs:string[])=>xs[0]]){
   const who=choose(remaining);ok(act(who,'limit',[U(P)]));
   const proceeds=()=>side==='y'?(simnet.getAssetsMap().get('STX')?.get(who)??0n):simnet.callReadOnlyFn(side==='x'?'usdcx':'asset-stx','get-balance',[Cl.principal(who)],owner).result.value.value;
   const beforeProceeds=proceeds();
   const other=side==='x'?'y':'x',otherToken=other==='x'?'asset-stx':'usdcx';
   const counter=getAddressFromPrivateKey('1234'.padStart(64,'0')+'01','testnet');
   simnet.mintSTX(counter,10000000000000n);
   if(otherToken!=='asset-stx')ok(tx('mint',[U(100000000),Cl.principal(counter)],owner,otherToken));
   // Admission at an off-cross mid, then refresh back to the clearing price.
   ok(tx('set-mid',[U(side==='x'?P*2n:P/2n)],owner,'oracle'));
   ok(tx(`deposit-token-${other}`,[U(side==='x'?amount*100n:amount/100n),U(P),Cl.none(),Cl.contractPrincipal(owner,otherToken),Cl.stringAscii(otherToken==='asset-stx'?'wstx':'token')],counter));
   ok(tx(`settle-token-${other}-deposit`,[Cl.principal(counter),update,Cl.contractPrincipal(owner,otherToken),Cl.stringAscii(otherToken==='asset-stx'?'wstx':'token')]));
   ok(tx('set-mid',[U(P)],owner,'oracle'));
   ok(tx('settle-with-refresh',[update,Cl.contractPrincipal(owner,'asset-stx'),Cl.stringAscii('token'),Cl.contractPrincipal(owner,'usdcx'),Cl.stringAscii(market==='market'?'wstx':'token')]));
   remaining.splice(remaining.indexOf(who),1);exact(remaining);
   expect(proceeds()-beforeProceeds).toBe(side==='x'?999000n:9990n);
   expect(ro(`get-token-${side}-deposit`,[cycle(),Cl.principal(who)])).toEqual(U(0));
  }
 }else{
  const choices=action==='full-50'?[0,48]:[0,1,1,0];
  for(const index of choices){
   const who=remaining[index];
   if(action==='withdraw'){
    // Production requires cancel for a full exit; a refused withdrawal is atomic.
    expect(act(who,'withdraw',[U(amount)]).result).toEqual(Cl.error(U(1024)));exact(remaining);
    ok(act(who,'withdraw',[U(amount/2n)]));exact(remaining);
   }
   ok(act(who,'cancel',[]));remaining.splice(index,1);exact(remaining);
  }
 }
 // Every survivor can recover its remaining deposit (settlement pays proceeds
 // directly to makers; these markets have no separate claim entry point).
 for(const who of [...remaining]){ok(act(who,'cancel',[]));remaining.splice(remaining.indexOf(who),1);exact(remaining);}
});
