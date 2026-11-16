import {it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import {boot,simnet,owner,accounts,names} from '../lab';
import {profiles,type Pair} from './profiles';
const U=Cl.uint,update=Cl.bufferFromHex('00'.repeat(72));
const value=(v:any):any=>v.type==='ok'||v.type==='some'?value(v.value):v.type==='tuple'?Object.fromEntries(Object.entries(v.value).map(([k,x])=>[k,value(x)])):v.type==='uint'?BigInt(v.value):v.type==='true'?true:v.type==='false'?false:v.type==='none'?null:v.value;
export const rungCases=(pair:Pair,side:'buy'|'sell')=>{
 const p=profiles[pair],x=side==='sell',input=x?'x':'y',output=x?'y':'x',amount=x?p.xAmount:p.yAmount;
 const rung=`jing-${side}-${p.rungAsset}-10${p.suffix}`,ladder=`jing-ladder-${pair}-v1`;
 it(`${pair} ${side}: funded partial and maximal exits preserve both members and conserve assets`,async()=>{
  await boot();
  const call=(c:string,f:string,a:any[]=[],who=owner)=>simnet.callPublicFn(c,f,a,who);
  const read=(c:string,f:string,a:any[]=[])=>value(simnet.callReadOnlyFn(c,f,a,owner).result);
  const ok=(r:any)=>{expect(r.result.type,Cl.prettyPrint(r.result)).toBe('ok');return value(r.result);};
  const principal=(c:string)=>Cl.contractPrincipal(owner,names[c]??c);
  const alice=accounts.get('wallet_1')!,bob=accounts.get('wallet_2')!;
  const bal=(asset:'x'|'y',who:string)=>p[asset]==='asset-stx'?(simnet.getAssetsMap().get('STX')?.get(who)??0n):read(p[asset],'get-balance',[Cl.principal(who)]);
  ok(call('jing-core-v6','set-verified-contract',[principal(p.market)]));
  ok(call(p.market,'initialize',[principal(p.market),principal(p.x),principal(p.y),U(p.xMinimum),U(p.yMinimum),...p.feeds.map(U)]));
  ok(call('oracle','configure-feed-ids',p.feeds.map(U)));ok(call('oracle','set-mid',[U(p.mid)]));
  ok(call('dia','configure',[U(p.mid),Cl.int(0)]));
  ok(call(ladder,'set-canonical',[Cl.stringAscii(x?'sel-band':'buy-band'),principal(rung)]));
  ok(call(rung,'initialize',[U(10),Cl.bool(true)]));
  for(const who of [alice,bob])for(const asset of [p.x,p.y])if(asset!=='asset-stx')ok(call(asset,'mint',[U(1000000000),Cl.principal(who)]));
  const before=[bal(input,alice),bal(input,bob)];
  for(const who of [alice,bob])ok(call(rung,'deposit',[U(amount)],who));
  expect(read(p.market,`get-token-${input}-deposit`,[U(0),principal(rung)])).toBe(amount*2n);
  const other=read(rung,'get-position',[Cl.principal(bob)]);
  const partial=ok(call(rung,'withdraw',[U(amount/2n),Cl.none()],alice));
  expect(bal(input,alice)-before[0]+amount).toBe(amount/2n);
  expect(read(rung,'get-position',[Cl.principal(bob)])).toEqual(other);
  expect(partial[x?'sbtc':'stx']).toBe(amount/2n);
  for(const who of [alice,bob]){
   const position=read(rung,'get-position',[Cl.principal(who)]),old=bal(input,who);
   ok(call(rung,'withdraw',[U((1n<<128n)-1n),Cl.some(update)],who));
   expect(bal(input,who)-old).toBe(position[x?'sbtc':'stx']);
   expect(read(rung,'get-position',[Cl.principal(who)]).shares).toBe(0n);
  }
  expect([bal(input,alice),bal(input,bob)]).toEqual(before);
  for(const asset of ['x','y'] as const)for(const who of [names[p.market],rung])expect(bal(asset,`${owner}.${who}`)).toBe(0n);
  expect(read('jing-core-v6','get-total-token-equity',[principal(p[input])])).toBe(0n);
  expect(read(rung,'get-state').members).toBe(0n);
 });
};
