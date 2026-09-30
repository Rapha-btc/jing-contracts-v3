import {beforeEach,describe,expect,it} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

beforeEach(h.init);
const assetArgs=(s:h.Side)=>[s==='x'?h.token:h.stx,Cl.stringAscii(s==='x'?'token':'wstx')];
const live=(s:h.Side)=>h.ro('market',`get-token-${s}-deposit`,[h.U(h.ro('market','get-current-cycle')),Cl.principal(h.user)]);
const equity=(s:h.Side)=>h.ro('jing-core-v6','get-token-equity',[s==='x'?h.token:h.stx,Cl.principal(h.user)]);
function bothSides(s:h.Side,oppositeAmount=h.amount(h.other(s)),oppositeLimit=h.P) {
  h.ok(h.call('market',`deposit-token-${h.other(s)}`,[h.U(oppositeAmount),h.U(oppositeLimit),h.N,...assetArgs(h.other(s))],h.user));
  h.ok(h.call('market',`deposit-token-${s}`,[h.U(h.amount(s)),h.U(s==='x'?h.P*2n:h.P/2n),h.N,...assetArgs(s)],h.user));
  h.ok(h.call('market',`settle-token-${s}-deposit`,[Cl.principal(h.user),Cl.bufferFromHex('00'),...assetArgs(s)]));
  expect(live(s)).toBe(h.amount(s));expect(live(h.other(s))).toBe(oppositeAmount);
  expect(equity(s)).toBe(h.amount(s));expect(equity(h.other(s))).toBe(oppositeAmount);
}
function cancelInput(s:h.Side) {
  const before=h.balance(s),n=live(s);
  h.ok(h.call('market',`cancel-token-${s}-deposit`,assetArgs(s),h.user));
  expect(h.balance(s)-before).toBe(n);expect(live(s)).toBe(0n);expect(equity(s)).toBe(0n);
}
function custody(s:h.Side,remaining:bigint) {
  expect(live(s)).toBe(remaining);expect(equity(s)).toBe(remaining);
  expect(h.balance(s,h.principal('market'))).toBe(remaining);
  expect(h.ro('jing-core-v6','get-total-token-equity',[s==='x'?h.token:h.stx])).toBe(remaining);
}
function bookState() {
  const state=JSON.parse(h.state());
  return {...state,assets:undefined,variables:{market:state.variables.market,core:state.variables['jing-core-v6']},
    custody:[h.balance('x',h.principal('market')),h.balance('y',h.principal('market'))]};
}
for(const s of ['x','y'] as const) describe(`existing orders ${s}`,()=>{
  it('both live sides cause the real market to refuse a new same-side swap',()=>{
    bothSides(s);
    h.reject(()=>h.call('market','swap',[h.U(h.amount(s)),h.U(h.P),Cl.bufferFromHex('00'),...assetArgs('x'),...assetArgs('y'),Cl.bool(s==='x')],h.user),1018);
  });
  for(const smart of [false,true]) it(`${smart?'smart':'manual'} catches the refusal without modifying either order`,()=>{
    bothSides(s);const before=h.state(),n=h.amount(s);
    const receipt=smart?h.smart(s,n,h.P):h.manual(s,{jing:n,limit:h.P}),r=h.ok(receipt);
    if(smart) expect(h.routerPrint(receipt)['jing-cap']).toBe(n);
    expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,'jing-out':0n,out:0n,unsold:n});
    expect(h.state()).toBe(before);
  });
  for(const smart of [false,true]) for(const venue of h.venues) it(`${smart?'smart':'manual'} uses ${venue} while preserving both resting orders`,()=>{
    bothSides(s);h.fund(venue);
    const sats=s==='x'?1_000_000n:2_000_000n,micro=s==='x'?200_000_000n:100_000_000n;
    h.config(venue,sats,micro);
    const before=h.wallet(s),book=bookState(),n=h.amount(s);
    const receipt=smart?h.smart(s,n,h.P):h.manual(s,{jing:n,limit:h.P,fallback:h.venues.indexOf(venue)+1}),r=h.ok(receipt);
    expect(r['jing-ok']).toBe(false);expect(r['jing-in']).toBe(0n);expect(r[`${venue}-in`]).toBe(n);
    expect(r.out).toBe(venue==='dlmm'?(s==='x'?n*100n:n/100n):h.cpOut(n,s==='x'?sats:micro,s==='x'?micro:sats));
    expect(bookState()).toEqual(book);h.conservation(s,before,r,n);
  });
  for(const smart of [false,true]) for(const carry of [false,true]) it(`${smart?'smart':'manual'} after cancel: midpoint self-settlement ${carry?'rolls a valid rest':'refunds a sub-minimum rest'}`,()=>{
    const opposite=h.amount(h.other(s))*(carry?2n:1n);
    bothSides(s,opposite);cancelInput(s);
    for(const venue of h.venues){h.fund(venue);h.config(venue);}
    const n=h.amount(s),net=h.net(n),tradedOutput=s==='x'?net*100n:net/100n;
    const inputFee=net/1000n,received=tradedOutput-tradedOutput/1000n;
    const rest=opposite-tradedOutput,refunded=carry?0n:rest;
    const before=h.wallet(s),receipt=smart?h.smart(s,n,h.P,h.UPDATE,h.P,received+refunded)
      :h.manual(s,{jing:n,limit:h.P,fallback:3,minOut:received+refunded}),r=h.ok(receipt);
    // Full midpoint clearing distributes the full prepaid rebate pot pro
    // rata; the bilateral walk's per-fill floor formula does not apply.
    expect(r).toMatchObject({'jing-ok':true,'jing-in':n,'jing-out':received,unsold:0n,out:received+refunded});
    expect(h.routerPrint(receipt)).toMatchObject(r);
    // The caller is also the midpoint maker: its proceeds are paid in the
    // sold asset. jing-in records the swap leg, not the net wallet debit.
    expect(before.sold-h.balance(s)).toBe(inputFee);
    expect(h.balance(h.other(s))-before.bought).toBe(received+refunded);
    for(const venue of h.venues){expect(r[`${venue}-in`]).toBe(0n);expect(h.value(simnet.getDataVar(venue,'calls'))).toBe(0n);}
    custody(s,0n);custody(h.other(s),carry?rest:0n);
    expect(h.balance('x',h.principal('router'))).toBe(0n);expect(h.balance('y',h.principal('router'))).toBe(0n);
    if(carry){cancelInput(h.other(s));custody(h.other(s),0n);}
  });
  for(const smart of [false,true]) it(`${smart?'smart':'manual'} allocates midpoint proceeds between the caller and another maker`,()=>{
    bothSides(s);cancelInput(s);
    const opposite=h.other(s),deposit=h.amount(opposite);
    h.ok(h.call('market',`deposit-token-${opposite}`,[h.U(deposit),h.U(h.P),h.N,...assetArgs(opposite)],h.maker));
    const n=h.amount(s),net=h.net(n),traded=s==='x'?net*100n:net/100n;
    const payout=traded-traded/1000n,makerProceeds=(n-net/1000n)/2n,rest=(2n*deposit-traded)/2n;
    const before=h.wallet(s),makerBefore=h.balance(s,h.maker);
    const r=h.ok(smart?h.smart(s,n,h.P):h.manual(s,{jing:n,limit:h.P}));
    expect(r).toMatchObject({'jing-ok':true,'jing-in':n,'jing-out':payout,out:payout,unsold:0n});
    expect(before.sold-h.balance(s)).toBe(n-makerProceeds);
    expect(h.balance(s,h.maker)-makerBefore).toBe(makerProceeds);
    expect(h.balance(opposite)-before.bought).toBe(payout);
    expect(live(opposite)).toBe(rest);expect(equity(opposite)).toBe(rest);
    expect(h.ro('market',`get-token-${opposite}-deposit`,[h.U(h.ro('market','get-current-cycle')),Cl.principal(h.maker)])).toBe(rest);
    expect(h.ro('jing-core-v6','get-token-equity',[opposite==='x'?h.token:h.stx,Cl.principal(h.maker)])).toBe(rest);
    expect(h.balance(opposite,h.principal('market'))).toBe(2n*rest);custody(s,0n);
    cancelInput(opposite);
    const makerRestBefore=h.balance(opposite,h.maker);
    h.ok(h.call('market',`cancel-token-${opposite}-deposit`,assetArgs(opposite),h.maker));
    expect(h.balance(opposite,h.maker)-makerRestBefore).toBe(rest);custody(opposite,0n);
    expect(h.ro('jing-core-v6','get-token-equity',[opposite==='x'?h.token:h.stx,Cl.principal(h.maker)])).toBe(0n);
  });
  for(const smart of [false,true]) it(`${smart?'smart':'manual'} rejects one unit above settlement payout plus own-order refund`,()=>{
    bothSides(s);cancelInput(s);
    const n=h.amount(s),net=h.net(n),traded=s==='x'?net*100n:net/100n;
    const bought=traded-traded/1000n+h.amount(h.other(s))-traded;
    h.reject(()=>smart?h.smart(s,n,h.P,h.UPDATE,h.P,bought+1n):h.manual(s,{jing:n,limit:h.P,minOut:bought+1n}),3002);
    custody(s,0n);custody(h.other(s),h.amount(h.other(s)));
  });
  for(const failure of ['minimum','unfunded'] as const) it(`later ${failure} rejection reverses the caller's settlement and refund`,()=>{
    bothSides(s);cancelInput(s);h.fund('dlmm');h.config('dlmm');h.config('velar');
    if(failure==='minimum')h.fund('velar');
    const n=h.amount(s),mins=failure==='minimum'?[0n,0n,1_000_000_000_000n]:[];
    h.reject(()=>h.manual(s,{jing:n,limit:h.P,amms:[n,0n,n],mins}),failure==='minimum'?4003:1);
    custody(s,0n);custody(h.other(s),h.amount(h.other(s)));
  });
  for(const smart of [false,true]) it(`${smart?'smart':'manual'} wallet rejection restores both held orders and a successful fallback`,()=>{
    bothSides(s);h.fund('dlmm');h.config('dlmm');
    const n=h.amount(s),output=s==='x'?n*100n:n/100n;
    h.reject(()=>smart?h.smart(s,n,h.P,h.UPDATE,h.P,output+1n):h.manual(s,{jing:n,limit:h.P,fallback:1,minOut:output+1n}),3002);
  });
  for(const smart of [false,true]) it(`${smart?'smart':'manual'} cannot walk the caller's own off-mid quote`,()=>{
    bothSides(s,h.amount(h.other(s)),h.quote(s));cancelInput(s);
    const q=h.ro('market','get-taker-capacity',[h.U(h.P),h.U(h.quote(s)),Cl.bool(s==='x'),Cl.principal(h.user),Cl.none()]);
    expect(q['mid-cap']).toBe(0n);expect(q['walk-cap']).toBe(0n);expect(q['gross-cap']).toBe(0n);
    const before=h.state(),n=h.amount(s),r=h.ok(smart?h.smart(s,n):h.manual(s,{jing:n}));
    expect(r).toMatchObject({'jing-ok':false,'jing-in':0n,out:0n,unsold:n});expect(h.state()).toBe(before);
  });
});
