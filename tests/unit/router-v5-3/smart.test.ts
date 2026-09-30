import {beforeEach,describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';
beforeEach(h.init);
const cpCap=(s:h.Side,rin:bigint,rout:bigint,limit:bigint,fee:bigint)=>{
  const keep=10000n-fee;
  const top=s==='x'?rout*h.SCALE*keep/(limit*10000n):rout*limit*keep/(h.SCALE*10000n);
  return top>rin?(top-rin)*10000n*9980n/(keep*10000n):0n;
};
for(const s of ['x','y'] as const) describe(`smart ${s}`,()=>{
  for(const above of [0n,1n]) it(`sizes to the exact new gross-cap with ${above} extra input`,()=>{
    h.book(s);
    const q=h.ro('market','get-taker-capacity',[h.U(h.P),h.U(h.quote(s)),Cl.bool(s==='x'),Cl.principal(h.user),Cl.none()]);
    const cap=q['net-cap'],grossCap=((cap+1n)*10020n-1n)/10000n;
    expect(q['gross-cap']).toBe(grossCap);expect(h.net(grossCap)).toBe(cap);expect(h.net(grossCap+1n)).toBe(cap+1n);
    const n=grossCap+above,before=h.wallet(s),receipt=h.smart(s,n),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(grossCap);
    expect(r['jing-ok']).toBe(true);
    expect(r['jing-in']).toBe(cap+cap*20n/10000n);
    expect(r['jing-out']).toBe(h.amount(h.other(s))-h.amount(h.other(s))/1000n);
    expect(r.unsold).toBe(n-r['jing-in']);
    expect(h.ro('market',`get-token-${h.other(s)}-deposit`,[h.U(h.ro('market','get-current-cycle')),Cl.principal(h.maker)])).toBe(0n);
    h.conservation(s,before,r,n);
  });
  for(const enough of [false,true]) it(`new net formula at minimum deposit: ${enough?'accepted':'skipped'}`,()=>{
    h.book(s);const minimum=s==='x'?100n:10000n,n=h.gross(minimum)-(enough?0n:1n),before=h.wallet(s);
    expect(h.net(n)).toBe(minimum-(enough?0n:1n));
    const receipt=h.smart(s,n),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(enough?n:0n);
    expect(r['jing-ok']).toBe(enough);
    // Minimum x net is 100: its one-unit pot pays floor(100*20/10000)=0,
    // so that unit is correctly returned. The y minimum has no rounding.
    expect(r.unsold).toBe(enough?n-minimum-minimum*20n/10000n:n);
    h.conservation(s,before,r,n);
  });
  it('no update deliberately skips an available book',()=>{
    h.book(s);h.fund('dlmm');h.config('dlmm');const n=h.amount(s),before=h.wallet(s);
    const r=h.ok(h.smart(s,n,h.quote(s),h.N));
    expect(r['jing-ok']).toBe(false);expect(r['jing-in']).toBe(0n);expect(r['dlmm-in']).toBe(n);
    expect(h.ro('market','get-current-cycle')).toBe(0n);
    h.conservation(s,before,r,n);
  });
  for(const reason of ['stale','paused'] as const) it(`${reason} real market rejection falls through to DLMM`,()=>{
    h.book(s);h.fund('dlmm');h.config('dlmm');
    if(reason==='stale') h.ok(h.call('oracle','configure',[h.U(0),h.U(80),h.U(80)]));
    else h.ok(h.call('market','set-paused',[Cl.bool(true)]));
    const n=h.amount(s),before=h.wallet(s),receipt=h.smart(s,n),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(n);
    expect(r['jing-ok']).toBe(false);expect(r['dlmm-in']).toBe(n);
    expect(h.ro('market','get-current-cycle')).toBe(0n);
    h.conservation(s,before,r,n);
  });
  for(const age of [31,79]) it(`uses the real oracle-age rebate at age ${age}`,()=>{
    h.book(s);h.ok(h.call('oracle','configure',[h.U(0),h.U(age),h.U(age)]));
    const n=h.amount(s),bps=BigInt(20+age-30),net=h.net(n,bps);
    const traded=s==='x'?net:net/200n*200n,rawOut=s==='x'?traded*50n:traded/200n;
    const spent=traded+traded*bps/10000n,before=h.wallet(s),r=h.ok(h.smart(s,n));
    expect(r['jing-ok']).toBe(true);expect(r['jing-in']).toBe(spent);
    expect(r['jing-out']).toBe(rawOut-rawOut/1000n);expect(r.unsold).toBe(n-spent);
    h.conservation(s,before,r,n);
  });
  it('skips the book when the input budget cannot cover the older update rebate and market minimum',()=>{
    h.book(s);h.fund('dlmm');h.config('dlmm');
    h.ok(h.call('oracle','configure',[h.U(0),h.U(79),h.U(79)]));
    // Use a 1,000-sat minimum here: at 100 sats both ages round to the
    // same net. This owner-configured minimum separates the two formulas.
    const minimum=s==='x'?1000n:10000n;
    h.ok(h.call('market',`set-min-token-${s}-deposit`,[h.U(minimum)]));
    const n=h.gross(minimum),before=h.wallet(s);
    expect(h.net(n)).toBe(minimum);expect(h.net(n,69n)).toBeLessThan(minimum);
    const receipt=h.smart(s,n),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['jing-cap']).toBe(0n);expect(r['jing-ok']).toBe(false);
    expect(r['dlmm-in']).toBe(n);h.conservation(s,before,r,n);
  });
  for(const reverse of [false,true]) for(const exhausted of [false,true]) it(`CP sizing, fees and exact output: reverse=${reverse}, exhaust=${exhausted}`,()=>{
    h.fund('xyk');h.fund('velar');h.config('xyk',1_000_000n,100_000_000n,reverse,30,50);
    h.config('velar',2_000_000n,200_000_000n,reverse,20);
    const limit=h.quote(s),[rin,rout]=s==='x'?[1_000_000n,100_000_000n]:[100_000_000n,1_000_000n];
    const fee=(s==='x')!==reverse?30n:50n,capX=cpCap(s,rin,rout,limit,fee),capV=cpCap(s,2n*rin,2n*rout,limit,20n);
    const n=exhausted?capX+capV+h.amount(s):h.amount(s),x=exhausted?capX:n*capX/(capX+capV),v=exhausted?capV:n-x;
    const before=h.wallet(s),receipt=h.smart(s,n,limit,h.N),r=h.ok(receipt);
    expect(h.routerPrint(receipt)).toMatchObject({'xyk-cap':capX,'velar-cap':capV,'dlmm-cap':0n});
    expect(r).toMatchObject({'xyk-in':x,'velar-in':v,'xyk-out':h.cpOut(x,rin,rout,fee),'velar-out':h.cpOut(v,2n*rin,2n*rout,20n),unsold:exhausted?h.amount(s):0n});
    expect(r.out).toBe(r['xyk-out']+r['velar-out']);
    h.conservation(s,before,r,n);
  });
  for(const venue of ['xyk','velar'] as const) it(`uses ${venue} alone when the other CP pool has no capacity`,()=>{
    h.fund(venue);h.config(venue);const n=h.amount(s),before=h.wallet(s),r=h.ok(h.smart(s,n,h.quote(s),h.N));
    expect(r[`${venue}-in`]).toBe(n);expect(r.unsold).toBe(0n);h.conservation(s,before,r,n);
  });
  it('leaves input untouched when every quote is worse than the limit',()=>{
    for(const v of h.venues){h.fund(v);h.config(v);}
    const n=h.amount(s),limit=s==='x'?2n*h.P:h.P/2n,before=h.wallet(s),r=h.ok(h.smart(s,n,limit,h.N));
    expect(r.out).toBe(0n);expect(r.unsold).toBe(n);h.conservation(s,before,r,n);
  });
  it('does not read downstream venues when the book has filled the request',()=>{
    h.book(s);const n=h.gross(h.amount(s));
    // This fixture price would make get-bin-price fail if called. The book
    // consumes the whole request, so the later stage must exit first.
    h.ok(h.call('dlmm','configure-dlmm',[Cl.int(0),h.U(0),h.U(15),h.U(n)]));
    const before=h.wallet(s),r=h.ok(h.smart(s,n));expect(r['jing-ok']).toBe(true);expect(r.unsold).toBe(0n);
    h.conservation(s,before,r,n);
  });
  it('leaves untradeable dust without reading invalid downstream quotes',()=>{
    h.ok(h.call('dlmm','configure-dlmm',[Cl.int(0),h.U(0),h.U(15),h.U(1)]));
    const n=s==='x'?2n:100n,before=h.wallet(s),r=h.ok(h.smart(s,n,h.quote(s),h.N));
    expect(r.unsold).toBe(n);expect(r.out).toBe(0n);h.conservation(s,before,r,n);
  });
  for(const fee of [0,30]) it(`DLMM capacity grosses up the active bin with fee ${fee}`,()=>{
    h.fund('dlmm');h.config('dlmm',1000n,100000n,false,fee);
    const raw=s==='x'?1000n:100000n,cap=raw*10000n/(10000n-BigInt(fee)),n=h.amount(s);
    const before=h.wallet(s),receipt=h.smart(s,n,h.quote(s),h.N),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['dlmm-cap']).toBe(cap);
    expect(r['dlmm-in']).toBe(cap);expect(r.unsold).toBe(n-cap);
    const adjusted=cap*(10000n-BigInt(fee))/10000n;
    expect(r['dlmm-out']).toBe(s==='x'?adjusted*100n:adjusted/100n);
    h.conservation(s,before,r,n);
  });
  it('routes the actual DLMM partial-fill remainder to CP pools',()=>{
    for(const v of h.venues){h.fund(v);h.config(v);}
    const n=h.amount(s),spent=n*7n/10n;
    h.ok(h.call('dlmm','configure-dlmm',[Cl.int(0),h.U(1000000),h.U(15),h.U(spent)]));
    const before=h.wallet(s),r=h.ok(h.smart(s,n,h.quote(s),h.N));
    expect(r['dlmm-in']).toBe(spent);expect(r['xyk-in']+r['velar-in']).toBe(n-spent);expect(r.unsold).toBe(0n);
    h.conservation(s,before,r,n);
  });
  it('stops safely at the outermost DLMM bin',()=>{
    h.fund('dlmm');h.config('dlmm',1000n,100000n);
    const n=h.amount(s),raw=s==='x'?1000n:100000n;
    h.ok(h.call('dlmm','configure-dlmm',[Cl.int(s==='x'?500:-500),h.U(1000000),h.U(0),h.U(n)]));
    const before=h.wallet(s),receipt=h.smart(s,n,h.quote(s),h.N),r=h.ok(receipt);
    expect(h.routerPrint(receipt)['dlmm-cap']).toBe(raw);h.conservation(s,before,r,n);
  });
  it('rolls back real book and DLMM when a later CP payout has insufficient funds',()=>{
    h.book(s);h.fund('dlmm');h.config('dlmm',1000n,100000n);h.config('velar');
    const n=h.amount(s)*4n;
    h.reject(()=>h.smart(s,n),1);
  });
  it('rolls back a successful smart route if the wallet minimum is not met',()=>{
    h.book(s);for(const v of h.venues){h.fund(v);h.config(v);}
    h.reject(()=>h.smart(s,h.amount(s)*4n,h.quote(s),h.UPDATE,h.P,1_000_000_000_000n),3002);
  });
  it('rejects zero amount',()=>h.reject(()=>h.smart(s,0n),3001));
  it('rejects zero limit',()=>h.reject(()=>h.smart(s,1n,0n),3006));
  it('rejects zero mid hint',()=>h.reject(()=>h.smart(s,1n,h.quote(s),h.UPDATE,0n),3007));
});
it('exposes the real market minimum deposits',()=>{
  expect(h.ro('router','get-jing-min-deposits')).toEqual({'min-token-x':100n,'min-token-y':10000n});
});
