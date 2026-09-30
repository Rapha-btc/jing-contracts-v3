import {describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import {U,P,alice,bob,taker,token,stx,name,update,value,call,ok,balance,specs,setup} from './helpers';

// Reproducible public-call campaigns. This is a receipt/custody ledger, not
// a copy of the rung's proceeds-index or entitlement formula.
const seeds=[0xc0ffee,0x5eed1234,0x12345678];
const people=[alice,bob,taker];
type Book={input:bigint;returned:bigint;filled:bigint;received:bigint;paid:bigint};
for(const spec of specs)describe(`${spec.label}: seeded epoch solvency`,()=>{
 for(const seed of seeds)it(`conserves both assets across random ownership changes and rescales, seed ${seed}`,()=>{
  const r=setup(spec),input=spec.x?'sbtc':'stx',output=spec.x?'stx':'sbtc';
  for(const who of people)ok(call('token','mint',[U(1000000000000n),Cl.principal(who)]));
  let rng=seed>>>0,steps=0,scales=0,rolls=0;
  // xorshift32 avoids the short low-bit cycle of an LCG modulo four.
  const random=(max:number)=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)%max;};
  const randomActions={deposits:0,withdrawals:0,claims:0,fills:0};
  const epochs=new Map<bigint,Book>();
  const book=(e:bigint)=>{if(!epochs.has(e))epochs.set(e,{input:0n,returned:0n,filled:0n,received:0n,paid:0n});return epochs.get(e)!;};
  const row=(map:string,key:any)=>{
   try{return value(simnet.getMapEntry(r.rung,map,key));}
   catch(error){if(String(error)==='value not found')return null;throw error;}
  };
  const custody=()=>balance(spec.x,r.principal)+r.state().resting;
  function invariant(){
   steps++;
   const s=r.state(),current=s.epoch,context=`seed ${seed}, step ${steps}, epoch ${current}, scale ${s.scale}`;
   const cp=value(simnet.getDataVar(r.rung,'current-proceeds'));
   const carry=value(simnet.getDataVar(r.rung,'proceeds-carry'));
   let reservedInput=0n,reservedOutput=0n,effective=0n;
   const claims=new Map<bigint,{p:bigint;q:bigint}>();
   for(const who of people){
    const pos=row('positions',Cl.principal(who));if(!pos)continue;
    const claim=r.position(who),sums=claims.get(pos.epoch)??{p:0n,q:0n};
    sums.p+=claim[input];sums.q+=claim[output];claims.set(pos.epoch,sums);
    if(pos.epoch===current){const d=s.scale-pos.scale;effective+=d>3n?0n:pos.shares/(1000n**d);}
   }
   expect(effective,context).toBeLessThanOrEqual(s['total-shares']);
   expect(carry,context).toBeLessThan(s['total-shares']||1n);
   for(const [e,b] of epochs){
    const reserve=row('epoch-reserve',U(e));
    if(reserve){reservedInput+=reserve.reserve;reservedOutput+=reserve.proceeds;}
    const p=b.input-b.returned-b.filled,q=b.received-b.paid,c=claims.get(e)??{p:0n,q:0n};
    expect(b.returned+b.filled,context).toBeLessThanOrEqual(b.input);
    expect(b.paid,context).toBeLessThanOrEqual(b.received);
    expect(c.p,context).toBeLessThanOrEqual(p);expect(c.q,context).toBeLessThanOrEqual(q);
    if(e===current)expect(q,context).toBe(cp);
    else {expect(p,context).toBe(reserve?.reserve??0n);expect(q,context).toBe(reserve?.proceeds??0n);}
   }
   const remainingP=[...epochs.values()].reduce((n,b)=>n+b.input-b.returned-b.filled,0n);
   const remainingQ=[...epochs.values()].reduce((n,b)=>n+b.received-b.paid,0n);
   expect(custody(),context).toBe(remainingP);
   expect(balance(!spec.x,r.principal),context).toBe(remainingQ);
   expect(cp+reservedOutput,context).toBe(remainingQ);
   expect(value(simnet.getDataVar(r.rung,spec.x?'reserved-sats':'reserved-ustx')),context).toBe(reservedInput);
   expect(value(simnet.getDataVar(r.rung,spec.x?'stx-accounted':'sats-accounted')),context).toBe(remainingQ);
  }
  function action(fn:string,args:any[],who:string,deposit=0n){
   const beforeP=balance(spec.x,who),beforeQ=balance(!spec.x,who);
   const receipt=call(r.rung,fn,args,who);ok(receipt);
   // Deposit's initial sync can close an old epoch; the new funds belong
   // to the resulting current epoch, while payout events identify the old one.
   if(deposit)book(r.state().epoch).input+=deposit;
   let returned=0n,paid=0n;
   for(const event of receipt.events){
    if(event.event!=='print_event')continue;
    const v=value(event.data.value);
    if(v?.event==='rung-payout'){
     book(v.epoch).returned+=v.back;book(v.epoch).paid+=v.proceeds;returned+=v.back;paid+=v.proceeds;
    }else if(v?.event==='rung-withdraw'){book(v.epoch).returned+=v.amount;returned+=v.amount;}
   }
   expect(balance(spec.x,who)-beforeP).toBe(returned-deposit);
   expect(balance(!spec.x,who)-beforeQ).toBe(paid);
   // Only this rung rests on the market, so deposits are admitted directly.
   expect(r.pending()).toBe(null);
   invariant();
  }
  const deposit=(who:string,n:bigint)=>action('deposit',[U(n)],who,n);
  const withdraw=(who:string,n:bigint)=>action('withdraw',[U(n),Cl.none()],who);
  function fill(numerator:bigint,denominator:bigint){
   const before=r.state(),rest=before.resting;
   if(rest===0n)return false;
   const spend=rest*numerator/denominator,net=spec.x?spend*100n:spend/100n;
   if(net<(spec.x?10000n:100n))return false;
   const beforeP=custody(),beforeQ=balance(!spec.x,r.principal);
   ok(call('market','swap',[U((net*10020n+9999n)/10000n),U(P),update,token,name,stx,name,Cl.bool(!spec.x)],taker));
   book(before.epoch).filled+=beforeP-custody();
   book(before.epoch).received+=balance(!spec.x,r.principal)-beforeQ;
   // Claims are evaluated after sync, as with every production member action.
   ok(call(r.rung,'sync',[],taker));
   const after=r.state();scales+=Number(after.scale-before.scale);rolls+=Number(after.epoch-before.epoch);
   invariant();return true;
  }
  const base=spec.x?20000000n:2000000000n;
  deposit(alice,base+BigInt(random(997)));deposit(bob,base+BigInt(random(997)));
  // Each round forces a randomized near-full fill through a real rescale,
  // with random fills, claims, deposits and partial/full exits around it.
  for(let round=0;round<4;round++){
   for(let j=0;j<10;j++){
    const who=people[random(people.length)],op=random(4),pos=row('positions',Cl.principal(who));
    if(op===0||!pos){deposit(who,spec.amount+BigInt(random(Number(spec.amount))));randomActions.deposits++;}
    else if(op===1){action('claim',[],who);randomActions.claims++;}
    else if(op===2){const own=r.position(who)[input];withdraw(who,random(3)===0?base*100n:(own*BigInt(1+random(7))/10n||1n));randomActions.withdrawals++;}
    else if(fill(BigInt(1+random(6)),10n))randomActions.fills++;
   }
   // Keep two inactive positions across the forced rescale. Vary residues
   // modulo 1000 so total/member rounding disagree frequently.
   deposit(alice,base+BigInt(1+random(999)));deposit(bob,base+BigInt(1+random(999)));
   const scale=r.state().scale,ui=r.state()['unfilled-index'];
   const target=200000000n+BigInt(random(600000000));
   expect(fill(ui-target,ui)).toBe(true);
   expect(r.state().scale).toBe(scale+1n);
   // A receipt amplifies any fractional-share over-allocation immediately.
   const e=r.state().epoch,n=BigInt(10000000+random(1000000));
   ok(spec.x?simnet.transferSTX(n,r.principal,taker):call('token','transfer',[U(n),Cl.principal(taker),Cl.principal(r.principal),Cl.none()],taker));
   book(e).received+=n;ok(call(r.rung,'sync',[],taker));invariant();
   // In alternating rounds close by a tail roll, then fund a new epoch
   // while earlier members still own its reserves.
   if(round%2===1){fill(1n,1n);deposit(taker,base+BigInt(random(997)));}
  }
  // Different final exit orders per seed. Every epoch must finish exactly
  // balanced, including fractions deferred to its last remaining member.
  const order=[...people];for(let i=order.length-1;i>0;i--){const j=random(i+1);[order[i],order[j]]=[order[j],order[i]];}
  for(const who of order)if(row('positions',Cl.principal(who)))withdraw(who,base*1000n);
  invariant();expect(scales).toBeGreaterThanOrEqual(4);expect(rolls).toBeGreaterThanOrEqual(2);
  for(const [kind,count] of Object.entries(randomActions))expect(count,`seed ${seed}: random ${kind}`).toBeGreaterThan(0);
  for(const b of epochs.values()){expect(b.paid).toBe(b.received);expect(b.returned+b.filled).toBe(b.input);}
  expect(r.state().members).toBe(0n);expect(r.state().resting).toBe(0n);
  expect(balance(true,r.principal)).toBe(0n);expect(balance(false,r.principal)).toBe(0n);
  console.log('campaign',JSON.stringify({side:spec.label,seed,steps,scales,rolls,randomActions}));
 },120000);
});
