import { beforeEach, describe, expect, it } from 'vitest';
import { Cl, getAddressFromPrivateKey } from '@stacks/transactions';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as h from './helpers';
const { U, N, P, token, wrong, name, UPDATE, owner, alice, bob, keeper, carol, market, call, ro, ok, err, value, init, amount, off, other, balance, live, parked, pending, deposit, settleDeposit, cancel, withdraw, setLimit, settleLimit, readmit, settleReadmit, mid, oracle, batch, swap, reprice, queue, book, custody, snapshot } = h;

it('instruments the current deploy source with dependency substitutions only', () => {
  const meta = JSON.parse(fs.readFileSync('tests/unit/v6-3/.build/source.json', 'utf8'));
  const source = fs.readFileSync(meta.sourcePath, 'utf8');
  expect(crypto.createHash('sha256').update(source).digest('hex')).toBe(meta.sha256);
  let expected = source;
  for (const [from, to] of Object.entries(meta.substitutions)) expected = expected.replaceAll(from, to as string);
  expect(fs.readFileSync('tests/unit/v6-3/.build/market.clar', 'utf8')).toBe(expected);
  expect(crypto.createHash('sha256').update(fs.readFileSync(meta.corePath)).digest('hex')).toBe(meta.coreSha256);
  expect(fs.readFileSync('tests/unit/v6-3/Clarinet.toml','utf8')).toContain('path = "../../../contracts/jing-core-v6.clar"');
});

describe('initialization and administration', () => {
  const args = () => [Cl.principal(market), token, token, U(100), U(10000), U(1), U(45)];
  it('requires both operator and core owner; rejects zero minima and reinitialization', () => {
    err(call('initialize', args(), alice), 1008);
    for (const index of [3, 4]) { const a = args(); a[index] = U(0); err(call('initialize', a), 1019); }
    ok(call('set-operator', [Cl.principal(alice)]));
    err(call('initialize', args(), alice), 1008);
    ok(call('set-operator', [Cl.principal(owner)], alice));
    h.verifyMarket(); ok(call('initialize', args()));
    err(call('initialize', args()), 1012);
    expect(value(ro('get-min-deposits'))).toEqual({ 'min-token-x': 100n, 'min-token-y': 10000n });
  });
  it('rolls initialization back when core registration fails', () => {
    err(call('initialize', args()), 5005);
    h.verifyMarket();
    ok(call('initialize', args()));
  });
  it('authorizes setters and enforces their boundaries', () => {
    init();
    for (const [fn, arg] of [['set-treasury', Cl.principal(carol)], ['set-paused', Cl.bool(true)], ['set-min-token-x-deposit', U(101)], ['set-min-token-y-deposit', U(10001)], ['set-distance-slots', U(50)], ['set-operator', Cl.principal(owner)]] as const) {
      err(call(fn, [arg], alice), 1008); ok(call(fn, [arg]));
    }
    for (const s of ['x', 'y']) err(call(`set-min-token-${s}-deposit`, [U(0)]), 1019);
    err(call('set-distance-slots', [U(51)]), 1010);
    expect(ro('get-distance-slots')).toEqual(U(50));
    ok(call('set-distance-slots', [U(0)]));
    expect(ro('get-taker-rebate-bps')).toEqual(U(20));
    expect(ro('get-taker-rebate-max-bps')).toEqual(U(70));
    ok(call('set-operator', [Cl.principal(alice)]));
    err(call('set-paused', [Cl.bool(false)]), 1008);
    ok(call('set-paused', [Cl.bool(false)], alice));
  });
  it('rejects the market as treasury without changing the configured recipient or funded book', () => {
    init(); book();
    ok(call('set-treasury', [Cl.principal(carol)]));
    const beforeX = snapshot('x'), beforeY = snapshot('y');
    err(call('set-treasury', [Cl.principal(market)], alice), 1008);
    err(call('set-treasury', [Cl.principal(market)]), 1033);
    expect(simnet.getDataVar('market', 'treasury')).toEqual(Cl.principal(carol));
    expect(snapshot('x')).toEqual(beforeX);
    expect(snapshot('y')).toEqual(beforeY);
    const x = balance('x', carol), y = balance('y', carol);
    ok(batch());
    expect(balance('x', carol)).toBeGreaterThan(x);
    expect(balance('y', carol)).toBeGreaterThan(y);
  });
});

describe('oracle and peg boundaries', () => {
  beforeEach(init);
  it.each([[0,0,0,0], [0,79,0,0], [0,0,79,0], [0,80,0,1003], [0,0,80,1003], [1,0,0,1006], [45,0,0,1006], [2,0,0,1004], [4,0,0,1025], [6,0,0,1023], [7,0,0,9001]])('refresh mode=%i ages=%i/%i code=%i', (mode, ax, ay, code) => {
    oracle(mode, ax, ay);
    const r = call('refresh-mid', [UPDATE]);
    if (code) err(r, code); else ok(r, U(P));
  });
  it.each([[3,1004], [5,1014], [1,1006], [45,1006]])('batch validates confidence/exponent/positive prices: %i', (mode, code) => {
    book(); oracle(mode); const before = snapshot('x'); err(batch(), code); expect(snapshot('x')).toEqual(before);
  });
  it('computes peg boundaries including disabled sentinels and rounding', () => {
    const max = U(2n ** 128n - 1n);
    for (const [spread, cap, expected] of [[0,10000,10000], [100,9900,9900], [100,9899,0], [9999,10000,1], [10000,10000,0]]) {
      expect(ro('pegged-bid', [U(10000), U(spread), U(cap)])).toEqual(U(expected));
    }
    for (const [spread, floor, expected] of [[0,10000,10000], [100,10100,10100], [100,10101,-1], [9999,1,19999], [10000,1,-1]]) {
      expect(ro('pegged-ask', [U(10000), U(spread), U(floor)])).toEqual(expected < 0 ? max : U(expected));
    }
  });
});

for (const s of ['x', 'y'] as const) describe(`${s} maker lifecycle`, () => {
  beforeEach(init);
  it('starts empty and exposes consistent default reads', () => {
    expect(live(s)).toBe(0n); expect(parked(s)).toBe(0n);
    for (const kind of ['deposit', 'limit', 'readmit']) expect(pending(s, kind)).toEqual(N);
    expect(ro(`get-token-${s}-depositors`, [U(0)])).toEqual(Cl.list([]));
    expect(ro('get-settlement', [U(0)])).toEqual(N);
    expect(value(ro('get-cycle-totals', [U(99)]))).toEqual({'total-token-x':0n,'total-token-y':0n});
    expect(ro(`get-token-${s}-limit`, [Cl.principal(alice)])).toEqual(U(0));
    expect(ro(`token-${s}-limit-at`, [Cl.principal(alice), U(P)])).toEqual(U(0));
    err(withdraw(s, 1), 1005); err(cancel(s), 1005); err(readmit(s), 1022);
    err(setLimit(s, off(s)), 1005);
    err(settleDeposit(s),1030); err(settleLimit(s),1030); err(settleReadmit(s),1030);
  });
  it('deposits, tops up, updates a direct quote, partially withdraws and cancels while paused', () => {
    const start = balance(s, alice), a = amount(s);
    ok(deposit(s), U(a)); ok(deposit(s), U(a));
    expect(live(s)).toBe(BigInt(2*a)); expect(balance(s, alice)).toBe(start-BigInt(2*a));
    expect(value(ro(`get-token-${s}-depositors`,[U(0)]))).toHaveLength(1);
    ok(setLimit(s, off(s)+1), Cl.bool(true));
    expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)+1));
    err(withdraw(s,0),1005); err(withdraw(s,2*a),1024); err(withdraw(s,3*a),1024);
    err(withdraw(s,2*a-1),1001);
    ok(call('set-paused',[Cl.bool(true)]));
    ok(withdraw(s,a),U(a)); ok(cancel(s),U(a));
    expect(balance(s,alice)).toBe(start); expect(live(s)).toBe(0n);
    expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(0)); custody(s);
  });
  it('rejects invalid deposits and quotes without touching funds', () => {
    const before=snapshot(s);
    err(deposit(s,1),1001); err(deposit(s,amount(s),0),1011);
    err(deposit(s,amount(s),off(s),alice,Cl.some(U(10000))),1026);
    err(call(`deposit-token-${s}`,[U(amount(s)),U(off(s)),N,wrong,name],alice),1013);
    ok(call('set-paused',[Cl.bool(true)])); err(deposit(s),1007); err(readmit(s),1007);
    expect(snapshot(s)).toEqual(before);
    err(setLimit(s,0),1011); err(setLimit(s,off(s),alice,Cl.some(U(10000))),1026);
  });
  it('enforces exact minimum across a live top-up and accepts maximum valid spread', () => {
    ok(deposit(s)); ok(call(`set-min-token-${s}-deposit`,[U(amount(s)+1)]));
    ok(deposit(s,1,off(s),alice,Cl.some(U(9999))),U(1));
    expect(live(s)).toBe(BigInt(amount(s)+1)); custody(s);
  });
  it('escrows opposite-book entry, rejects duplicate, and admits permissionlessly without a second debit', () => {
    ok(deposit(other(s),amount(other(s)),off(other(s)),bob));
    const start=balance(s,alice), k=balance(s,keeper);
    ok(deposit(s)); const p=value(pending(s));
    expect(p.amount).toBe(BigInt(amount(s))); expect(p.limit).toBe(BigInt(off(s)));
    expect(p['spread-bps']).toBeNull(); expect(p['submitted-at']).toBeGreaterThan(0n);
    expect(live(s)).toBe(0n); err(deposit(s),1031); err(withdraw(s,1),1005);
    ok(settleDeposit(s),U(amount(s))); expect(pending(s)).toEqual(N);
    expect(live(s)).toBe(BigInt(amount(s))); expect(balance(s,alice)).toBe(start-BigInt(amount(s)));
    expect(balance(s,keeper)).toBe(k); custody(s);
  });
  it('uses feed timestamps strictly newer than submission and preserves escrow on guard errors', () => {
    ok(deposit(other(s),amount(other(s)),off(other(s)),bob));
    ok(call('freeze',[],owner,'oracle')); ok(deposit(s));
    const before=snapshot(s); err(settleDeposit(s),1032); expect(snapshot(s)).toEqual(before);
    ok(call('thaw',[],owner,'oracle'));
    ok(call('set-paused',[Cl.bool(true)])); err(settleDeposit(s),1007);
    ok(call('set-paused',[Cl.bool(false)]));
    err(call(`settle-token-${s}-deposit`,[Cl.principal(alice),UPDATE,wrong,name],keeper),1013);
    ok(settleDeposit(s)); custody(s);
  });
  it('refunds a crossing submission instead of admitting or paying its keeper', () => {
    ok(deposit(other(s),amount(other(s)),P,bob));
    const start=balance(s,alice); ok(deposit(s,amount(s),P));
    ok(settleDeposit(s),U(amount(s)));
    expect(balance(s,alice)).toBe(start); expect(live(s)).toBe(0n); expect(pending(s)).toEqual(N); custody(s);
  });
  it('applies minimum at submit time and leaves a newer quote intact when an older deposit settles', () => {
    ok(deposit(s)); ok(deposit(other(s),amount(other(s)),off(other(s)),bob)); ok(settleDeposit(other(s),bob));
    ok(deposit(s,1));
    ok(call(`set-min-token-${s}-deposit`,[U(amount(s)*3)]));
    ok(setLimit(s,off(s)+10)); ok(settleLimit(s));
    ok(settleDeposit(s)); expect(live(s)).toBe(BigInt(amount(s)+1));
    expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)+10)); custody(s);
  });
  it('cancel clears live plus pending funds and pending quote; withdraw leaves escrow intact', () => {
    const start=balance(s,alice); ok(deposit(s));
    ok(deposit(other(s),amount(other(s)),off(other(s)),bob)); ok(settleDeposit(other(s),bob));
    ok(deposit(s)); ok(setLimit(s,off(s)+1));
    ok(withdraw(s,amount(s)/2),U(amount(s)/2)); expect(value(pending(s)).amount).toBe(BigInt(amount(s)));
    ok(call('set-paused',[Cl.bool(true)])); ok(cancel(s),U(amount(s)*1.5));
    expect(balance(s,alice)).toBe(start); expect(pending(s)).toEqual(N); expect(pending(s,'limit')).toEqual(N);
    err(settleDeposit(s),1030); err(settleLimit(s),1030); custody(s);
  });
  it('keeps the old quote until permissionless settlement; replaces pending quotes and allows quoting paused', () => {
    ok(deposit(s)); ok(deposit(other(s),amount(other(s)),off(other(s)),bob)); ok(settleDeposit(other(s),bob));
    ok(call('set-paused',[Cl.bool(true)]));
    ok(setLimit(s,off(s)+1),Cl.bool(false)); ok(setLimit(s,off(s)+2),Cl.bool(false));
    expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)));
    expect(value(pending(s,'limit')).limit).toBe(BigInt(off(s)+2));
    ok(settleLimit(s),Cl.bool(true)); expect(pending(s,'limit')).toEqual(N);
    expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)+2));
  });
  it('rejects funding while the real core is paused but permits withdrawals and cancellation', () => {
    ok(deposit(s));
    ok(call('pause',[],owner,'jing-core-v6'));
    h.rejectUnchanged(()=>deposit(s),5016);
    ok(withdraw(s,amount(s)/2)); ok(cancel(s)); custody(s);
  });
});

describe('protected seats', () => {
  beforeEach(init);
  it('syncs both memberships idempotently, prunes revoked seats, caps reservation at 50', () => {
    err(call('sync-seat',[Cl.principal(alice)],keeper),1028);
    for (const s of ['x','y']) {
      expect(ro(`get-seated-${s}`)).toEqual(Cl.list([]));
      expect(ro(`is-protected-${s}`,[Cl.principal(alice)])).toEqual(Cl.bool(false));
      ok(call(`set-band-${s}`,[Cl.principal(alice),Cl.bool(true)],owner,'jing-ladder-v1'));
    }
    for (let i=0;i<2;i++) ok(call('sync-seat',[Cl.principal(alice)],keeper),Cl.tuple({x:Cl.bool(true),y:Cl.bool(true),seats:U(2)}));
    for (const s of ['x','y']) {
      expect(ro(`get-seated-${s}`)).toEqual(Cl.list([Cl.principal(alice)]));
      expect(ro(`is-protected-${s}`,[Cl.principal(alice)])).toEqual(Cl.bool(true));
      ok(call(`set-band-${s}`,[Cl.principal(alice),Cl.bool(false)],owner,'jing-ladder-v1'));
    }
    ok(call('prune-seats'),U(2));
    expect(ro('get-seated-x')).toEqual(Cl.list([])); expect(ro('get-seated-y')).toEqual(Cl.list([]));
    ok(call('set-max-band',[U(60)],owner,'jing-ladder-v1')); ok(call('sync-seat-count'),U(50));
    expect(ro('protected-seats')).toEqual(U(50));
  });
});

for (const s of ['x','y'] as const) describe(`${s} queues, parking, and readmission`, () => {
  beforeEach(init);
  function parkedBook() {
    queue(); ok(deposit(s,amount(s),P)); ok(deposit(s,amount(s)*2,P,bob)); ok(settleDeposit(s,bob));
    expect(parked(s)).toBe(BigInt(amount(s))); expect(live(s)).toBe(0n); custody(s);
  }
  it.each([0.5,1,2])('size-only admission amount multiplier %s refunds ties/smaller and parks for larger', mult => {
    queue(); ok(deposit(s,amount(s),P)); const start=balance(s,bob);
    ok(deposit(s,amount(s)*mult,P,bob)); expect(live(s,bob)).toBe(0n);
    ok(settleDeposit(s,bob),U(amount(s)*mult));
    if (mult>1) { expect(parked(s)).toBe(BigInt(amount(s))); expect(live(s,bob)).toBe(BigInt(amount(s)*mult)); }
    else { expect(live(s)).toBe(BigInt(amount(s))); expect(balance(s,bob)).toBe(start); }
    expect(pending(s,'deposit',bob)).toEqual(N); custody(s);
  });
  it('honors submit-time minimum when a larger pending entrant parks the incumbent', () => {
    queue(); ok(deposit(s,amount(s),P)); ok(deposit(s,amount(s)*2,P,bob));
    ok(call(`set-min-token-${s}-deposit`,[U(amount(s)*3)]));
    ok(settleDeposit(s,bob)); expect(live(s,bob)).toBe(BigInt(amount(s)*2)); expect(parked(s)).toBe(BigInt(amount(s))); custody(s);
  });
  it('withdraws parked funds, cancels parked+pending records while paused, and leaves incumbent intact', () => {
    parkedBook(); ok(withdraw(s,amount(s)/2),U(amount(s)/2));
    ok(readmit(s),U(amount(s)/2)); err(readmit(s),1031);
    ok(deposit(s,amount(s),P));
    ok(call('set-paused',[Cl.bool(true)])); const before=balance(s,alice);
    ok(cancel(s),U(amount(s)*1.5)); expect(balance(s,alice)).toBe(before+BigInt(amount(s)*1.5));
    for (const kind of ['deposit','readmit','limit']) expect(pending(s,kind)).toEqual(N);
    expect(live(s,bob)).toBe(BigInt(amount(s)*2)); custody(s);
  });
  it('readmission clears a full-queue refusal, then succeeds after a seat is freed', () => {
    parkedBook(); ok(readmit(s)); ok(settleReadmit(s),U(0));
    expect(pending(s,'readmit')).toEqual(N); expect(parked(s)).toBe(BigInt(amount(s)));
    ok(call('freeze',[],owner,'oracle')); ok(readmit(s)); err(settleReadmit(s),1032);
    ok(call('thaw',[],owner,'oracle')); ok(call('set-paused',[Cl.bool(true)])); err(settleReadmit(s),1007);
    ok(call('set-paused',[Cl.bool(false)])); ok(cancel(s,bob));
    const before=balance(s,alice); ok(settleReadmit(s),U(amount(s)));
    expect(balance(s,alice)).toBe(before); expect(parked(s)).toBe(0n); expect(live(s)).toBe(BigInt(amount(s))); custody(s);
  });
  it('combines parked carry and fresh escrow on re-entry', () => {
    parkedBook(); ok(deposit(s,amount(s)*2,P)); ok(settleDeposit(s));
    expect(live(s)).toBe(BigInt(amount(s)*3)); expect(parked(s)).toBe(0n);
    expect(parked(s,bob)).toBe(BigInt(amount(s)*2)); custody(s);
  });
  it('disabled peg refunds an entrant on a full side', () => {
    queue(); ok(deposit(s,amount(s),P));
    const start=balance(s,bob);
    ok(deposit(s,amount(s)*2,off(s),bob,Cl.some(U(0))));
    // A cap below mid disables bids; a floor above mid disables asks.
    ok(settleDeposit(s,bob)); expect(balance(s,bob)).toBe(start);
    expect(live(s)).toBe(BigInt(amount(s))); custody(s);
  });
  it('parks a disabled incumbent before a smaller enabled entrant', () => {
    queue(); ok(deposit(s,amount(s),off(s),alice,Cl.some(U(0))));
    ok(deposit(s,amount(s)/2,P,bob)); ok(settleDeposit(s,bob));
    expect(parked(s)).toBe(BigInt(amount(s))); expect(live(s,bob)).toBe(BigInt(amount(s)/2)); custody(s);
  });
  it('price priority replaces the farthest quote and rejects a worse quote', () => {
    queue(2,2);
    const near=s==='x'?P*1.1:P*0.9, far=s==='x'?P*1.2:P*0.8, closer=s==='x'?P*1.05:P*0.95;
    ok(deposit(s,amount(s),near)); ok(deposit(s,amount(s),far,bob));
    ok(deposit(s,amount(s),off(s),carol)); ok(settleDeposit(s,carol)); expect(live(s,carol)).toBe(0n);
    ok(deposit(s,amount(s),closer,carol)); ok(settleDeposit(s,carol));
    expect(parked(s,bob)).toBe(BigInt(amount(s))); expect(live(s)).toBe(BigInt(amount(s)));
    expect(live(s,carol)).toBe(BigInt(amount(s))); custody(s);
  });
  it('protected makers do not consume public capacity and survive eviction', () => {
    queue(); ok(call(`set-band-${s}`,[Cl.principal(alice),Cl.bool(true)],owner,'jing-ladder-v1'));
    ok(call('sync-seat',[Cl.principal(alice)],keeper)); ok(deposit(s,amount(s),P));
    ok(deposit(s,amount(s)*2,P,bob)); ok(deposit(s,amount(s)*3,P,carol)); ok(settleDeposit(s,carol));
    expect(live(s)).toBe(BigInt(amount(s))); expect(parked(s,bob)).toBe(BigInt(amount(s)*2));
    expect(live(s,carol)).toBe(BigInt(amount(s)*3)); custody(s);
  });
  it('a paused core rejects admission after parking and restores incumbent and escrow', () => {
    queue(); ok(deposit(s,amount(s),P)); ok(deposit(s,amount(s)*2,P,bob));
    const a=snapshot(s), b=snapshot(s,bob);
    ok(call('pause',[],owner,'jing-core-v6'));
    err(settleDeposit(s,bob),5016); expect(snapshot(s)).toEqual(a); expect(snapshot(s,bob)).toEqual(b);
    simnet.mineEmptyBurnBlocks(144); ok(call('unpause',[],owner,'jing-core-v6')); ok(settleDeposit(s,bob)); custody(s);
  });
});

describe('batch settlement and history', () => {
  beforeEach(init);
  it('settles a balanced book with exact payouts, fees, cleared amounts, and custody', () => {
    book(); const ax=balance('y',alice), by=balance('x',bob), tx=balance('x',owner), ty=balance('y',owner);
    const result=value(ok(batch(alice)));
    expect(result).toEqual({'token-x-received':0n,'token-y-received':999000n,'token-x-rolled':0n,'token-y-rolled':0n});
    expect(balance('y',alice)-ax).toBe(999000n); expect(balance('x',bob)-by).toBe(9990n);
    expect(balance('x',owner)-tx).toBe(10n); expect(balance('y',owner)-ty).toBe(1000n);
    expect(h.cycle()).toBe(1n); const settlement=value(ro('get-settlement',[U(0)]));
    expect(settlement).toMatchObject({price:BigInt(P),'token-x-cleared':10000n,'token-y-cleared':1000000n,'token-x-fee':10n,'token-y-fee':1000n});
    custody('x'); custody('y'); err(batch(),1009);
    err(call('prune-cycles',[Cl.list([U(0),U(1)])]),1027);
    expect(value(ro('get-token-x-depositors',[U(0)]))).toHaveLength(1);
    ok(call('prune-cycles',[Cl.list([U(0)])]),U(1));
    expect(ro('get-token-x-depositors',[U(0)])).toEqual(Cl.list([]));
    expect(ro('get-token-y-depositors',[U(0)])).toEqual(Cl.list([]));
    expect(value(ro('get-settlement',[U(0)]))).toEqual(settlement);
    ok(call('prune-cycles',[Cl.list([])]),U(0));
  });
  it.each(['x','y'] as const)('rolls the unfilled %s balance into the next cycle', s => {
    book(s==='x'?20000:10000,s==='y'?2000000:1000000);
    const who=s==='x'?alice:bob, result=value(ok(batch(who)));
    expect(result[`token-${s}-rolled`]).toBe(BigInt(amount(s)));
    expect(live(s,who)).toBe(BigInt(amount(s))); expect(live(other(s),s==='x'?bob:alice)).toBe(0n);
    custody('x'); custody('y');
  });
  it.each(['x','y'] as const)('refunds sub-minimum %s remainder', s => {
    book(s==='x'?10001:10000,s==='y'?1000001:1000000);
    const who=s==='x'?alice:bob, start=balance(s,who), result=value(ok(batch(who)));
    expect(result[`token-${s}-rolled`]).toBe(0n);
    expect(balance(s,who)-start).toBe(1n); expect(live(s,who)).toBe(0n); custody('x'); custody('y');
  });
  it('rejects empty, paused, stale, and wrong-trait settlement without mutations', () => {
    err(batch(),1009); book(); const before=snapshot('x');
    ok(call('set-paused',[Cl.bool(true)])); err(batch(),1007); ok(call('set-paused',[Cl.bool(false)]));
    oracle(0,80,0); err(batch(),1003); oracle(0,0,80); err(batch(),1003); oracle();
    err(call('settle-with-refresh',[UPDATE,wrong,name,token,name]),1013);
    err(call('settle-with-refresh',[UPDATE,token,name,wrong,name]),1013);
    expect(snapshot('x')).toEqual(before);
  });
  it.each(['x','y'] as const)('rolls off-price and small-share %s makers while settling eligible makers', s => {
    const small=s==='x'?100:10000, large=small*1000;
    ok(deposit(s,large,P,alice)); ok(deposit(s,small,P,carol)); ok(deposit(s,small,off(s),keeper));
    ok(deposit(other(s),s==='x'?large*100:large/100,P,bob));
    mid(s==='x'?P/2:P*2); ok(settleDeposit(other(s),bob)); mid(P);
    ok(batch()); expect(live(s,carol)).toBe(BigInt(small)); expect(live(s,keeper)).toBe(BigInt(small));
    expect(live(s,alice)).toBe(0n); custody('x'); custody('y');
  });
});

for (const s of ['x','y'] as const) describe(`${s} swaps and reprice`, () => {
  beforeEach(init);
  it.each([0,30,31,79])('fills at mid with exact age-dependent rebate (age %i)', age => {
    ok(deposit(other(s),amount(other(s))*2,P,alice));
    oracle(0,age,age);
    const input=amount(s), bps=age<=30?20:20+age-30, net=Math.floor(input*10000/(10000+bps)), rebate=input-net;
    const startOut=balance(other(s),bob), makerIn=balance(s,alice), startIn=balance(s,bob);
    const result=value(ok(swap(s,input,P)));
    const cleared=s==='x'?net*100:Math.floor(net/100), fee=Math.floor(cleared/1000);
    expect(result[`token-${other(s)}-received`]).toBe(BigInt(cleared-fee));
    expect(balance(other(s),bob)-startOut).toBe(BigInt(cleared-fee));
    // Midpoint settlement clears the binding input in full; conversion
    // rounding affects the output, not the amount paid to the maker.
    const traded=net;
    expect(balance(s,alice)-makerIn).toBe(BigInt(traded-Math.floor(traded/1000)+Math.floor(rebate*traded/net)));
    expect(startIn-balance(s,bob)).toBe(BigInt(input)-result[`token-${s}-rolled`]-result['rebate-refunded']);
    expect(live(s,bob)).toBe(0n); custody('x'); custody('y');
  });
  it('rejects zero limit, below-minimum, resting, and insufficient-liquidity swaps atomically', () => {
    ok(deposit(other(s),amount(other(s)),P,alice)); const before=snapshot(s,bob);
    err(swap(s,0),1001); err(swap(s,amount(s),0),1011); err(swap(s,1),1001);
    // Gross 1 now nets zero; gross 2 reaches the positive-but-subminimum guard.
    err(swap(s,2),1001);
    err(swap(s,amount(s)*3),1017); expect(snapshot(s,bob)).toEqual(before);
    ok(deposit(s,amount(s),off(s),bob)); ok(settleDeposit(s,bob)); err(swap(s),1018);
  });
  it('does not count pending escrow as settlement liquidity', () => {
    ok(deposit(s,amount(s),off(s),alice)); ok(deposit(other(s),amount(other(s)),P,carol));
    const before=snapshot(other(s),carol); err(swap(s),1009); expect(snapshot(other(s),carol)).toEqual(before);
  });
  it('direct and pending maker reprices preserve funds and enforce guards', () => {
    err(reprice(s,0),1011); err(reprice(s,P,alice,Cl.some(U(10000))),1026); err(reprice(s,P),1005);
    ok(deposit(s)); const before=balance(s,alice);
    err(call(`reprice-or-swap-token-${s}`,[U(off(s)),N,UPDATE,wrong,name,token,name],alice),1013);
    err(call(`reprice-or-swap-token-${s}`,[U(off(s)),N,UPDATE,token,name,wrong,name],alice),1013);
    ok(reprice(s,off(s)+1)); expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)+1));
    ok(deposit(other(s),amount(other(s)),off(other(s)),bob)); ok(settleDeposit(other(s),bob));
    ok(reprice(s,off(s)+2)); expect(value(pending(s,'limit')).limit).toBe(BigInt(off(s)+2));
    ok(settleLimit(s)); expect(balance(s,alice)).toBe(before); custody(s);
  });
  it('a crossing reprice pays its owner and leaves no resting position', () => {
    ok(deposit(s,amount(s),off(s),alice)); ok(deposit(other(s),amount(other(s))*2,P,bob)); ok(settleDeposit(other(s),bob));
    const before=balance(other(s),alice); const result=value(ok(reprice(s,P)));
    expect(balance(other(s),alice)-before).toBe(result[`token-${other(s)}-received`]);
    expect(result[`token-${other(s)}-received`]).toBeGreaterThan(0n); expect(live(s)).toBe(0n);
    expect(pending(s,'limit')).toEqual(N); custody('x'); custody('y');
  });
  it.each(['swap', 'reprice'] as const)('%s reports zero opposite-side rolled funds when the taker\'s maker remainder is refunded', mode => {
    const makerSide = other(s), refund = s === 'y' ? 20n : 2000n;
    // Swap uses input minus the prepaid rebate; reprice crosses the full
    // existing deposit and pays the rebate separately from the wallet.
    const makerAmount = amount(makerSide) + (mode === 'reprice' ? Number(refund) : 0);
    ok(deposit(makerSide, makerAmount, P, alice));
    if (mode === 'reprice') {
      ok(deposit(s, amount(s), off(s), alice));
      ok(settleDeposit(s, alice));
    }
    const before = balance(makerSide, alice);
    const result = value(ok(mode === 'swap' ? swap(s, amount(s), P, alice) : reprice(s, P, alice)));
    const output = mode === 'swap' ? (s === 'y' ? 9971n : 997002n) : (s === 'y' ? 9990n : 999000n);
    expect(result[`token-${makerSide}-received`]).toBe(output);
    expect(result[`token-${makerSide}-rolled`]).toBe(0n);
    expect(balance(makerSide, alice) - before).toBe(output + refund);
    expect(result[`token-${s}-rolled`]).toBe(0n);
    expect(live('x', alice)).toBe(0n); expect(live('y', alice)).toBe(0n);
    expect(balance('x', market)).toBe(0n); expect(balance('y', market)).toBe(0n);
    custody('x'); custody('y');
  });
  it('walks out-of-mid quotes in price order with exact custody', () => {
    const quote1=s==='x'?P*0.8:P*1.2, quote2=s==='x'?P*0.9:P*1.1;
    ok(deposit(other(s),amount(other(s)),quote1,alice));
    ok(deposit(other(s),amount(other(s)),quote2,carol));
    const before=balance(other(s),bob), result=value(ok(swap(s,amount(s),quote1)));
    expect(result[`token-${other(s)}-received`]).toBeGreaterThan(0n);
    expect(balance(other(s),bob)-before).toBe(result[`token-${other(s)}-received`]);
    expect(live(other(s),carol)).toBeLessThan(BigInt(amount(other(s))));
    expect(live(s,bob)).toBe(0n); custody('x'); custody('y');
  });
  it('reports shared mid capacity and excludes the requesting maker from the walk', () => {
    ok(deposit(other(s),amount(other(s)),P,alice));
    const capacity=value(ro('get-taker-capacity',[U(P),U(P),Cl.bool(s==='x'),Cl.principal(bob),Cl.none()]));
    expect(capacity).toMatchObject({'mid-cap':BigInt(amount(s)),'net-cap':BigInt(amount(s)),'walk-cap':0n,'min-taker':0n});
    expect(capacity['gross-cap']).toBeGreaterThan(capacity['net-cap']);
    // Midpoint settlement aggregates all makers; only the bilateral walk skips self.
    expect(value(ro('get-taker-capacity',[U(P),U(P),Cl.bool(s==='x'),Cl.principal(alice),Cl.none()]))['net-cap']).toBe(BigInt(amount(s)));
    ok(setLimit(other(s),off(other(s))));
    const walk=value(ro('get-taker-capacity',[U(P),U(off(other(s))),Cl.bool(s==='x'),Cl.principal(bob),Cl.none()]));
    expect(walk['walk-cap']).toBeGreaterThan(0n);
    expect(value(ro('get-taker-capacity',[U(P),U(off(other(s))),Cl.bool(s==='x'),Cl.principal(alice),Cl.none()]))['walk-cap']).toBe(0n);
  });
});

for (const s of ['x','y'] as const) describe(`${s} remaining public transitions`, () => {
  beforeEach(init);
  it('refuses a crossing limit without changing the previous quote', () => {
    ok(deposit(s)); ok(deposit(other(s),amount(other(s)),P,bob)); ok(settleDeposit(other(s),bob));
    ok(call('freeze',[],owner,'oracle')); ok(setLimit(s,P)); err(settleLimit(s),1032);
    ok(call('thaw',[],owner,'oracle')); ok(settleLimit(s),Cl.bool(false));
    expect(pending(s,'limit')).toEqual(N); expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s))); custody(s);
  });
  it('a direct quote supersedes an older pending quote after the opposite book leaves', () => {
    ok(deposit(s)); ok(deposit(other(s),amount(other(s)),off(other(s)),bob)); ok(settleDeposit(other(s),bob));
    ok(setLimit(s,off(s)+1)); ok(cancel(other(s),bob)); ok(setLimit(s,off(s)+2));
    ok(settleLimit(s),Cl.bool(false)); expect(ro(`get-token-${s}-limit`,[Cl.principal(alice)])).toEqual(U(off(s)+2));
    expect(pending(s,'limit')).toEqual(N);
  });
  it('a filled maker has its obsolete pending limit refused as gone', () => {
    ok(deposit(s,amount(s),P)); ok(deposit(other(s),amount(other(s)),P,bob));
    mid(s==='x'?P/2:P*2); ok(settleDeposit(other(s),bob)); mid(P);
    ok(setLimit(s,off(s))); ok(batch()); expect(live(s)).toBe(0n);
    ok(settleLimit(s),Cl.bool(false)); expect(pending(s,'limit')).toEqual(N); custody(s);
  });
  it('readmission refuses crossing, and detects parked carry consumed by a new deposit', () => {
    queue(); ok(deposit(s,amount(s),P)); ok(deposit(s,amount(s)*2,P,bob)); ok(settleDeposit(s,bob));
    ok(cancel(s,bob));
    ok(deposit(other(s),amount(other(s)),P,bob)); ok(readmit(s));
    ok(settleReadmit(s),U(0)); expect(parked(s)).toBe(BigInt(amount(s)));
    ok(cancel(other(s),bob)); ok(readmit(s)); ok(deposit(s,amount(s),P));
    expect(parked(s)).toBe(0n); ok(settleReadmit(s),U(0));
    expect(live(s)).toBe(BigInt(amount(s)*2)); custody(s);
  });
  it('refunds only fresh escrow when a parked owner is refused re-entry', () => {
    queue(); ok(deposit(s,amount(s),P)); ok(deposit(s,amount(s)*3,P,bob)); ok(settleDeposit(s,bob));
    const start=balance(s,alice); ok(deposit(s,amount(s),P)); ok(settleDeposit(s));
    expect(balance(s,alice)).toBe(start); expect(parked(s)).toBe(BigInt(amount(s)));
    expect(live(s,bob)).toBe(BigInt(amount(s)*3)); err(swap(s,amount(s),P,alice),1018); custody(s);
  });
  it.each([0.5,2])('price-edge admission chooses the smaller of edge and outside (outside size %s)', scale => {
    queue(2,1);
    const near=s==='x'?P*1.1:P*0.9, far=s==='x'?P*1.2:P*0.8, better=s==='x'?P*1.05:P*0.95;
    // Far first exercises sorted insertion when the nearer maker follows.
    ok(deposit(s,amount(s)*scale,far,bob)); ok(deposit(s,amount(s),near,alice));
    ok(deposit(s,amount(s),better,carol)); ok(settleDeposit(s,carol));
    expect(parked(s,scale<1?bob:alice)).toBe(BigInt(amount(s)*(scale<1?scale:1))); custody(s);
  });
  it.each([0.5,2])('non-edge entrant competes by size with the outside quote (size %s)', scale => {
    queue(3,1);
    const near=s==='x'?P*1.1:P*0.9, far=s==='x'?P*1.2:P*0.8;
    ok(deposit(s,amount(s),far,bob)); ok(deposit(s,amount(s)*2,far,carol)); ok(deposit(s,amount(s),near,alice));
    ok(deposit(s,amount(s)*scale,off(s),keeper)); ok(settleDeposit(s,keeper));
    expect(live(s,keeper)).toBe(scale>1?BigInt(amount(s)*scale):0n);
    expect(parked(s,bob)).toBe(scale>1?BigInt(amount(s)):0n); custody(s);
  });
  it('capacity on full books reports size threshold, door parking, and disabled liquidity', () => {
    queue(); ok(deposit(s,amount(s),P));
    const capacity=() => value(ro('get-taker-capacity',[U(P),U(P),Cl.bool(s==='x'),Cl.principal(carol),Cl.none()]));
    expect(capacity()).toMatchObject({'min-taker':BigInt(amount(s)+1),'net-cap':0n});
    ok(deposit(other(s),amount(other(s))*4,P,bob)); mid(s==='x'?P/2:P*2); ok(settleDeposit(other(s),bob)); mid(P);
    expect(capacity()['net-cap']).toBe(BigInt(amount(s)*3));
    ok(cancel(other(s),bob)); ok(setLimit(s,off(s),alice,Cl.some(U(0))));
    expect(capacity()['min-taker']).toBe(0n);
    ok(setLimit(s,off(s))); ok(call('set-distance-slots',[U(1)]));
    expect(capacity()['min-taker']).toBe(0n); custody(s);
  });
  it('a full-side taker parks an incumbent and completely fills against the opposite side', () => {
    queue(); ok(deposit(s,amount(s),off(s),alice,Cl.some(U(0))));
    ok(deposit(other(s),amount(other(s))*2,P,carol)); ok(settleDeposit(other(s),carol));
    const out=value(ok(swap(s))); expect(out[`token-${other(s)}-received`]).toBeGreaterThan(0n);
    expect(parked(s)).toBe(BigInt(amount(s))); expect(live(s,bob)).toBe(0n); custody(s); custody(other(s));
  });
  it('rejects a taker below the minimum pro-rata share without committing rebates or fills', () => {
    ok(deposit(s,amount(s)*1000,P,alice));
    ok(deposit(other(s),amount(other(s))*2000,P,carol)); mid(s==='x'?P/2:P*2); ok(settleDeposit(other(s),carol)); mid(P);
    const before=snapshot(s,bob); err(swap(s),1020); expect(snapshot(s,bob)).toEqual(before); custody(s); custody(other(s));
  });
  it('refunds sub-minimum taker input remaining after consuming a smaller maker', () => {
    const makerAmount=s==='x'?995000:9970;
    ok(deposit(other(s),makerAmount,P,alice)); const start=balance(s,bob);
    const r=value(ok(swap(s)));
    expect(r[`token-${s}-rolled`]).toBe(s==='x'?30n:1003n);
    expect(start-balance(s,bob)).toBe(BigInt(amount(s))-r[`token-${s}-rolled`]-r['rebate-refunded']);
    expect(live(s,bob)).toBe(0n); custody(s); custody(other(s));
  });
  it('walks multiple makers, refunding their sub-minimum dust', () => {
    const quote=s==='x'?P/2:P*2;
    const first=s==='x'?100001:501;
    ok(deposit(other(s),first,quote,alice)); ok(deposit(other(s),amount(other(s))*2,quote,carol));
    const out=value(ok(swap(s,amount(s),quote)));
    expect(out[`token-${other(s)}-received`]).toBeGreaterThan(0n);
    expect(live(other(s),alice)).toBe(0n); custody(s); custody(other(s));
  });
  it('walk refunds dust to a maker when the taker exhausts just before it', () => {
    const quote=s==='x'?P/2:P*2;
    // Net input 9980 x / 998003 y consumes 499000 y / 4990 x; y has 3 units of dust.
    const first=s==='x'?499001:4991;
    const start=balance(other(s),alice); ok(deposit(other(s),first,quote,alice));
    ok(swap(s,amount(s),quote));
    expect(balance(other(s),alice)).toBe(start-BigInt(first)+1n);
    expect(live(other(s),alice)).toBe(0n); custody(s); custody(other(s));
  });
});

describe('rounding and additional oracle boundaries', () => {
  beforeEach(init);
  it.each([[10000,1000000], [20001,1000000], [10000,2000001]])('sweeps exact payout and roll dust for totals %i/%i', (totalX,totalY) => {
    const xs=[Math.floor(totalX/3),Math.floor(totalX/3),totalX-2*Math.floor(totalX/3)];
    const ys=[Math.floor(totalY/3),Math.floor(totalY/3),totalY-2*Math.floor(totalY/3)];
    [alice,carol,keeper].forEach((who,i)=>ok(deposit('x',xs[i],P,who)));
    [alice,bob,carol].forEach((who,i)=>{
      ok(deposit('y',ys[i],P,who)); mid(P/2); ok(settleDeposit('y',who)); mid(P);
    });
    const clearedX=Math.min(totalX,Math.floor(totalY/100)), clearedY=clearedX*100;
    const feeX=Math.floor(clearedX/1000), feeY=Math.floor(clearedY/1000);
    const paidX=ys.reduce((n,a)=>n+Math.floor(a*(clearedX-feeX)/totalY),0);
    const paidY=xs.reduce((n,a)=>n+Math.floor(a*(clearedY-feeY)/totalX),0);
    const rolledX=xs.reduce((n,a)=>n+Math.floor(a*(totalX-clearedX)/totalX),0);
    const rolledY=ys.reduce((n,a)=>n+Math.floor(a*(totalY-clearedY)/totalY),0);
    const x=balance('x',owner), y=balance('y',owner);
    ok(batch());
    expect(balance('x',owner)-x).toBe(BigInt(totalX-paidX-rolledX));
    expect(balance('y',owner)-y).toBe(BigInt(totalY-paidY-rolledY));
    custody('x'); custody('y');
  });
  it('does not settle a book with no eligible liquidity after limit filtering', () => {
    ok(deposit('x')); ok(deposit('y',1000000,P/2,bob)); ok(settleDeposit('y',bob));
    const before=snapshot('x'); err(batch(),1009); expect(snapshot('x')).toEqual(before);
  });
  it('rejects zero computed cross-price and confidence at the x threshold', () => {
    book(); oracle(9); err(batch(),1004);
    oracle(11); mid(50); err(batch(),1006);
  });
  it('accepts future feed timestamps with zero rebate age and rejects negative classification prices', () => {
    oracle(12); err(call('refresh-mid',[UPDATE]),1006);
    oracle(8); ok(call('refresh-mid',[UPDATE]),U(P));
    ok(deposit('y',2000000,P)); ok(swap('x')); custody('x'); custody('y');
  });
});

describe('pure private arithmetic boundaries', () => {
  // SDK calls the actual private function; no source wrappers or state injection.
  it.each([[0,20],[30,20],[31,21],[79,69],[80,70],[1000,70]])('rebate age %i gives %i bps', (age,bps) => {
    expect(h.privateCall('rebate-bps-for-age',[U(age)],owner).result).toEqual(U(bps));
  });
  it('gross-up respects the net capacity through fee rounding boundaries', () => {
    for (const net of [0,1,99,498,499,500,501,998,999,1000,10000]) {
      const gross=value(h.privateCall('gross-up',[U(net),U(20)],owner).result);
      expect(gross).toBe(net===0?0n:((BigInt(net)+1n)*10020n-1n)/10000n);
      expect(gross*10000n/10020n).toBeLessThanOrEqual(BigInt(net));
      // Returned gross is the maximum input fitting this net capacity.
      // Zero capacity deliberately returns zero, though gross 1 also nets zero.
      if(net>0)expect((gross+1n)*10000n/10020n).toBeGreaterThan(BigInt(net));
    }
  });
});

for (const s of ['x','y'] as const) describe(`${s} final guard and walk boundaries`, () => {
  beforeEach(init);
  it('withdraw and cancel reject a wrong token without releasing custody', () => {
    ok(deposit(s)); const before=snapshot(s);
    err(call(`withdraw-token-${s}`,[U(1),wrong,name],alice),1013);
    err(call(`cancel-token-${s}-deposit`,[wrong,name],alice),1013); expect(snapshot(s)).toEqual(before);
  });
  it('classification scans stop after the first willing counterparty', () => {
    ok(deposit(other(s),amount(other(s)),P,alice)); ok(deposit(other(s),amount(other(s)),P,bob));
    expect(ro(`would-take-as-${s}`,[U(P),U(P)])).toEqual(Cl.bool(true));
    expect(ro(`would-take-as-${s}`,[U(0),U(P)])).toEqual(Cl.bool(false));
  });
  it('rolls back price-priority parking when the real core rejects admission', () => {
    queue(); ok(deposit(s,amount(s),off(s),alice,Cl.some(U(0)))); ok(deposit(s,amount(s)*2,P,bob));
    const a=snapshot(s), b=snapshot(s,bob); ok(call('pause',[],owner,'jing-core-v6'));
    err(settleDeposit(s,bob),5016); expect(snapshot(s)).toEqual(a); expect(snapshot(s,bob)).toEqual(b);
  });
  it('a larger full-side swap funds size-only admission and preserves parked custody', () => {
    queue(); ok(deposit(s,amount(s),P,alice)); ok(deposit(other(s),amount(other(s))*4,P,carol));
    mid(s==='x'?P/2:P*2); ok(settleDeposit(other(s),carol)); mid(P);
    ok(swap(s,amount(s)*2)); expect(parked(s)).toBe(BigInt(amount(s))); custody(s); custody(other(s));
  });
  it('walk excludes disabled and beyond-limit quotes and skips remaining makers after exhaustion', () => {
    const quote=s==='x'?P/2:P*2;
    ok(deposit(other(s),amount(other(s)),quote,alice));
    ok(deposit(other(s),amount(other(s)),quote,carol));
    ok(deposit(other(s),amount(other(s)),s==='x'?P/4:P*4,keeper,Cl.some(U(0))));
    // Preserve the exact walk exhaustion this scenario is meant to test.
    // Gross 500,000 now nets 499,001 y, leaving one unit after the first fill.
    const net=s==='x'?4990n:499000n, gross=(net*10020n+9999n)/10000n;
    const before=live(other(s),keeper), result=value(ok(swap(s,Number(gross),quote)));
    expect(result[`token-${s}-rolled`]).toBe(0n);
    expect(live(other(s),keeper)).toBe(before); expect(live(other(s),carol)).toBe(BigInt(amount(other(s))));
    custody(s); custody(other(s));
  });
});

describe('unreduced queue boundaries', () => {
  beforeEach(init);
  const address=(i:number)=>getAddressFromPrivateKey(`${(i+100).toString(16).padStart(64,'0')}01`,'testnet');
  it.each(['x','y'] as const)('fills all 40 default public %s slots before escrowing the 41st maker', s => {
    const people=Array.from({length:41},(_,i)=>address(i));
    for (const who of people) {
      if (s==='x') ok(call('mint',[U(amount(s)),Cl.principal(who)],owner,'token'));
      else simnet.mintSTX(who,BigInt(amount(s)));
      ok(deposit(s,amount(s),P,who));
    }
    expect(value(ro(`get-token-${s}-depositors`,[U(0)]))).toHaveLength(40);
    expect(value(pending(s,'deposit',people[40])).amount).toBe(BigInt(amount(s)));
    ok(settleDeposit(s,people[40])); expect(live(s,people[40])).toBe(0n);
    expect(balance(s,people[40])).toBe(BigInt(amount(s))); custody(s,people);
  },20000);
  it.each(['x','y'] as const)('enforces the 50-entry protected %s seat list and recovers after pruning', s => {
    ok(call('set-max-band',[U(51)],owner,'jing-ladder-v1'));
    for(let i=0;i<51;i++) {
      const who=address(i); ok(call(`set-band-${s}`,[Cl.principal(who),Cl.bool(true)],owner,'jing-ladder-v1'));
      const result=call('sync-seat',[Cl.principal(who)],keeper);
      if(i<50) ok(result); else err(result,1029);
    }
    expect(value(ro(`get-seated-${s}`))).toHaveLength(50);
    ok(call(`set-band-${s}`,[Cl.principal(address(0)),Cl.bool(false)],owner,'jing-ladder-v1'));
    ok(call('sync-seat',[Cl.principal(address(50))],keeper));
    expect(ro(`is-protected-${s}`,[Cl.principal(address(0))])).toEqual(Cl.bool(false));
    expect(ro(`is-protected-${s}`,[Cl.principal(address(50))])).toEqual(Cl.bool(true));
  },20000);
});

describe('walk rounding and error propagation', () => {
  beforeEach(init);
  it('does not charge a rounded-to-zero STX fee on a small walk fill', () => {
    ok(deposit('y',10000,P/1000,alice));
    const treasury=balance('y',owner), output=balance('y',bob);
    const r=value(ok(swap('x',10000,P/1000)));
    expect(r['token-y-received']).toBe(998n);
    expect(balance('y',bob)-output).toBe(998n);
    expect(balance('y',owner)).toBe(treasury);
    custody('x'); custody('y');
  });
  it.each(['walk-x-book-step','walk-y-book-step'])('%s propagates a failed fold accumulator without state changes', fn => {
    const before=snapshot('x');
    expect(h.privateCall(fn,[Cl.principal(alice),Cl.error(U(9000))],owner).result).toEqual(Cl.error(U(9000)));
    expect(snapshot('x')).toEqual(before);
  });
});

describe('isolated defensive helper cases', () => {
  beforeEach(init);
  // These invoke real private helpers in documented boundary contexts. They do
  // not claim those contexts are reachable through the normal public call chain.
  it.each([true,false])('caps a walk rebate to its available budget (y taker: %s)', yIsTaker => {
    book(); ok(batch()); // A real completed cycle, so match logging has cycle >= 1.
    ok(deposit('x',10000,P*2,alice)); ok(deposit('y',1000000,P/2,bob)); ok(settleDeposit('y',bob));
    const ax=balance('y',alice), by=balance('x',bob);
    // No public swap is in flight: pending rebate budgets are zero. The helper
    // must cap the computed positive rebate instead of overdrawing custody.
    ok(h.privateCall('execute-fill',[
      U(1),Cl.principal(bob),U(1000000),Cl.principal(alice),U(10000),U(P),U(P),Cl.bool(yIsTaker),token,name,
    ],keeper),Cl.bool(true));
    expect(balance('y',alice)-ax).toBe(999000n); expect(balance('x',bob)-by).toBe(9990n);
    expect(live('x',alice)).toBe(0n); expect(live('y',bob)).toBe(0n); custody('x'); custody('y');
  });
  it.each(['x','y'] as const)('handles an empty %s distribution without division by zero or transfers', s => {
    const before=snapshot(s);
    const acc=Cl.ok(Cl.tuple({t:token,name}));
    const r=h.privateCall(`distribute-to-token-${s}-depositor`,[Cl.principal(alice),acc],keeper);
    expect(r.result).toEqual(acc);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].event).toBe('print_event');
    expect(r.events[0].data.contract_identifier).toBe(`${owner}.jing-core-v6`);
    expect(value(r.events[0].data.value)).toMatchObject({
      event: `distribute-${s}-depositor`, [`${s}-cleared`]: 0n,
      [`${s}-rolled`]: 0n, [`${other(s)}-received`]: 0n,
    });
    expect(snapshot(s)).toEqual(before);
  });
  it('rejects an already-settled historical cycle through the settlement helper', () => {
    book(); ok(batch()); const before=snapshot('x');
    const timestamp=simnet.execute('stacks-block-time').result;
    const feed=(price:number)=>Cl.tuple({price:Cl.int(price),conf:U(0),expo:Cl.int(-8),'ema-price':Cl.int(price),'ema-conf':U(0),'publish-time':timestamp,'prev-publish-time':U(0)});
    err(h.privateCall('execute-settlement',[U(0),feed(P),feed(100000000),...h.traits],keeper),1002);
    expect(snapshot('x')).toEqual(before);
  });
});
