import {beforeEach,describe,it,expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';
beforeEach(h.init);
for(const s of ['x','y'] as const) describe(`manual ${s}`,()=>{
  it('real book: exact net, fee, rebate and wallet payout',()=>{
    h.book(s);const net=h.amount(s),n=h.gross(net),before=h.wallet(s);
    const r=h.ok(h.manual(s,{jing:n}));
    const tradedOut=s==='x'?net*50n:net/200n;
    expect(r['jing-ok']).toBe(true);
    expect(r['jing-in']).toBe(n);
    expect(r['jing-out']).toBe(tradedOut-tradedOut/1000n);
    expect(r.unsold).toBe(0n);
    h.conservation(s,before,r,n);
  });
  for(const fallback of [undefined,1,2,3]) it(`returns sub-minimum rest and rebate crumbs; fallback ${fallback??'none'}`,()=>{
    const net=s==='x'?9980n:999999n,rest=s==='x'?99n:9999n,traded=net-rest,n=h.gross(net);
    h.book(s,s==='x'?traded*50n:traded/200n);
    if(fallback) {h.fund(h.venues[fallback-1]);h.config(h.venues[fallback-1]);}
    const before=h.wallet(s),r=h.ok(h.manual(s,{jing:n,fallback}));
    const refund=n-net-traded*20n/10000n, residual=rest+refund;
    expect(r['jing-ok']).toBe(true);
    expect(r['jing-in']).toBe(n-residual);
    expect(r.unsold).toBe(fallback?0n:residual);
    if(fallback) expect(r[`${h.venues[fallback-1]}-in`]).toBe(residual);
    h.conservation(s,before,r,n);
  });
  for(const reason of ['capacity','stale-oracle'] as const) for(const fallback of [undefined,1,2,3]) it(`catches real ${reason} rejection; fallback ${fallback??'none'}`,()=>{
    h.book(s);
    if(reason==='stale-oracle') h.ok(h.call('oracle','configure',[h.U(0),h.U(80),h.U(80)]));
    const n=reason==='capacity'?h.amount(s)*10n:h.amount(s);
    if(fallback) {h.fund(h.venues[fallback-1]);h.config(h.venues[fallback-1]);}
    const before=h.wallet(s),cycle=h.ro('market','get-current-cycle'),custody=h.balance(h.other(s),h.principal('market'));
    const r=h.ok(h.manual(s,{jing:n,fallback}));
    expect(r['jing-ok']).toBe(false); expect(r['jing-in']).toBe(0n);expect(r['jing-out']).toBe(0n);
    expect(h.ro('market','get-current-cycle')).toBe(cycle);
    expect(h.balance(h.other(s),h.principal('market'))).toBe(custody);
    expect(r.unsold).toBe(fallback?0n:n);
    h.conservation(s,before,r,n);
  });
  for(const reverse of [false,true]) it(`all four legs pay independent exact outputs; reversed XYK/Velar ${reverse}`,()=>{
    h.book(s);for(const v of h.venues){h.fund(v);h.config(v,1_000_000n,100_000_000n,reverse,30,50);}
    const net=h.amount(s),jing=h.gross(net),a=h.amount(s)/10n,before=h.wallet(s);
    const receipt=h.manual(s,{jing,amms:[a,a,a]}),r=h.ok(receipt);
    const output=s==='x'?net*50n:net/200n;
    const dlmmNet=a*(s==='x'?9950n:9970n)/10000n;
    const dlmmOut=s==='x'?dlmmNet*100n:dlmmNet/100n;
    const [rin,rout]=s==='x'?[1_000_000n,100_000_000n]:[100_000_000n,1_000_000n];
    const xykOut=h.cpOut(a,rin,rout,(s==='x')!==reverse?30n:50n),velarOut=h.cpOut(a,rin,rout,30n);
    expect(r).toMatchObject({'jing-ok':true,'jing-in':jing,'jing-out':output-output/1000n,
      'dlmm-in':a,'dlmm-out':dlmmOut,'xyk-in':a,'xyk-out':xykOut,'velar-in':a,'velar-out':velarOut,unsold:0n});
    expect(r.out).toBe(output-output/1000n+dlmmOut+xykOut+velarOut);
    expect(h.routerPrint(receipt)).toMatchObject(r);
    h.conservation(s,before,r,jing+3n*a);
  });
  for(const fallback of [1,2,3]) it(`scales fallback ${fallback} minimum with the added rejected book amount`,()=>{
    const v=h.venues[fallback-1];h.fund(v);h.config(v);
    const a=h.amount(s),min=s==='x'?100000n:1000n;
    const amms=[0n,0n,0n],mins=[0n,0n,0n];amms[fallback-1]=a;mins[fallback-1]=min;
    const before=h.wallet(s),r=h.ok(h.manual(s,{jing:a,amms,mins,fallback}));
    expect(r['jing-ok']).toBe(false);expect(r[`${v}-in`]).toBe(2n*a);
    expect(h.value(simnet.getDataVar(v,'last-min'))).toBe(2n*min);
    h.conservation(s,before,r,2n*a);
  });
  it('DLMM partial fill leaves the unspent input in the wallet',()=>{
    h.fund('dlmm');h.config('dlmm');const a=h.amount(s),spent=a*7n/10n;
    h.ok(h.call('dlmm','configure-dlmm',[Cl.int(0),h.U(1000000),h.U(15),h.U(spent)]));
    const before=h.wallet(s),r=h.ok(h.manual(s,{amms:[a],update:h.N}));
    expect(r['dlmm-in']).toBe(spent);expect(r.unsold).toBe(a-spent);
    expect(h.value(simnet.getDataVar('dlmm','last-min'))).toBe(1n);
    h.conservation(s,before,r,a);
  });
  for(const which of ['xyk','velar'] as const) it(`${which} refusal rolls back the book and earlier venues`,()=>{
    h.book(s);for(const v of h.venues){h.fund(v);h.config(v);}
    const a=h.amount(s),jing=h.gross(a),mins=[0n,0n,0n];mins[h.venues.indexOf(which)]=100_000_000_000n;
    h.reject(()=>h.manual(s,{jing,amms:[a,a,a],mins}),4003);
  });
  it('wallet minimum rolls back all four successful legs and core equity',()=>{
    h.book(s);for(const v of h.venues){h.fund(v);h.config(v);}
    const a=h.amount(s);h.reject(()=>h.manual(s,{jing:h.gross(a),amms:[a,a,a],minOut:100_000_000_000n}),3002);
  });
  it('inflated venue return cannot bypass the actual wallet minimum',()=>{
    h.fund('velar');h.config('velar');h.ok(h.call('velar','set-inflate',[h.U(1_000_000_000)]));
    h.reject(()=>h.manual(s,{amms:[0n,0n,h.amount(s)],minOut:1_000_000_000n}),3002);
  });
  it('an unfunded last venue rolls back earlier real market and DLMM transfers',()=>{
    h.book(s);h.fund('dlmm');h.config('dlmm');h.config('velar');
    const a=h.amount(s);
    // Both native STX and the strict FT return u1 for insufficient balance.
    h.reject(()=>h.manual(s,{jing:h.gross(a),amms:[a,0n,a]}),1);
  });
  it('rejects a missing update before using fallback',()=>h.reject(()=>h.manual(s,{jing:h.amount(s),update:h.N,fallback:1}),3005));
  it('rejects zero input',()=>h.reject(()=>h.manual(s),3001));
  it('rejects a split not equal to the signed total',()=>h.reject(()=>h.manual(s,{total:10n,jing:11n}),3004));
  for(const fallback of [0,4]) it(`rejects unknown fallback ${fallback}`,()=>h.reject(()=>h.manual(s,{jing:h.amount(s),fallback}),3003));
});
