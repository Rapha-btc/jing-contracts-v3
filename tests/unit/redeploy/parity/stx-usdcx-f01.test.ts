import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import {boot,simnet,owner,accounts,names} from '../lab';
const U=Cl.uint,market='market-stx-usdcx',rung='jing-sell-stx-usdc-10';
const value=(v:any):any=>v.type==='ok'||v.type==='some'?value(v.value):v.type==='uint'?BigInt(v.value):v.type==='tuple'?Object.fromEntries(Object.entries(v.value).map(([k,x])=>[k,value(x)])):v.value;
for(const count of [1,3])it(`STX sell F-01: ${count} members exit after privileged USDCx burn, then claim their debt`,async()=>{
 // Only the USDCx fixture gains a privileged burn, modeling its production issuer role.
 await boot({extensions:{usdcx:'\n(define-public (burn (n uint) (who principal)) (begin (asserts! (is-eq tx-sender owner) (err u401)) (ft-burn? token n who)))\n'}});
 const pc=(c:string)=>Cl.contractPrincipal(owner,names[c]??c);
 const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who);
 const read=(c:string,f:string,a:any[]=[])=>value(simnet.callReadOnlyFn(c,f,a,owner).result);
 const ok=(r:any)=>{expect(r.result.type,Cl.prettyPrint(r.result)).toBe('ok');return value(r.result);};
 const members=[owner,accounts.get('wallet_1')!,accounts.get('wallet_2')!].slice(0,count),taker=accounts.get('wallet_3')!;
 ok(call('jing-core-v6','set-verified-contract',[pc(market)]));
 ok(call(market,'initialize',[pc(market),pc('asset-stx'),pc('usdcx'),U(100000),U(100000),U(45),U(7)]));
 ok(call('oracle','configure-feed-ids',[U(45),U(7)]));ok(call('oracle','set-mid',[U(100000000)]));
 ok(call('dia','configure',[U(100000000),Cl.int(0)]));
 ok(call('jing-ladder-stx-usdcx-v1','set-canonical',[Cl.stringAscii('sel-band'),pc(rung)]));
 ok(call(rung,'initialize',[U(10),Cl.bool(true)]));
 for(const who of members)ok(call(rung,'deposit',[U(1000000)],who));
 ok(call('usdcx','mint',[U(1000000000),Cl.principal(taker)]));
 ok(call(market,'swap',[U(500000),U(200000000),Cl.bufferFromHex('00'),pc('asset-stx'),Cl.stringAscii('wstx'),pc('usdcx'),Cl.stringAscii('token'),Cl.bool(false)],taker));
 ok(call(rung,'sync'));
 const pos=(who:string)=>read(rung,'get-position',[Cl.principal(who)]),debt=(who:string)=>read(rung,'get-debt',[Cl.principal(who)]);
 const before=members.map(pos),cash=read(rung,'proceeds-cash'),seized=cash/2n;
 expect(cash).toBeGreaterThan(0n);expect(before.every(p=>p.sbtc>0n&&p.sbtc<1000000n)).toBe(true);
 ok(call('usdcx','burn',[U(seized),pc(rung)]));
 expect(read(rung,'get-deficit')).toBe(seized);
 expect(call(rung,'deposit',[U(1000000)],taker).result).toEqual(Cl.error(U(7017)));
 let left=cash-seized;
 for(const [i,who] of members.entries()){
  // The last member receives the exact remainder, including prior members' division dust.
  const current=pos(who),expected=current.stx<left?current.stx:left;
  const paid=ok(call(rung,'withdraw',[U((1n<<128n)-1n),Cl.none()],who));
  expect(paid.stx).toBe(expected);left-=expected;
  expect(paid.sbtc).toBe(current.sbtc);
  expect(debt(who)).toBe(current.stx-expected);
  expect(pos(who).shares).toBe(0n);
 }
 expect(read(rung,'proceeds-cash')).toBe(0n);expect(read(rung,'get-deficit')).toBe(seized);
 ok(call('usdcx','mint',[U(seized),pc(rung)]));
 for(const who of members)if(debt(who)>0n){const owed=debt(who);expect(ok(call(rung,'claim',[],who)).stx).toBe(owed);}
 expect(members.map(debt)).toEqual(members.map(()=>0n));expect(read(rung,'get-deficit')).toBe(0n);
 ok(call(rung,'deposit',[U(1000000)],taker));
});
