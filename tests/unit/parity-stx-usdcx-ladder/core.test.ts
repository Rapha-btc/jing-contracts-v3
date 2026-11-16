import {describe, it, expect} from 'vitest';
import {Cl} from '@stacks/transactions';
import * as h from './helpers';

const core = 'jing-core-v6';
const P = Cl.principal;

describe('jing-core-v6 admin', () => {
  it('starts unpaused, owned by the deployer, with nothing verified', () => {
    expect(h.ro(core, 'get-contract-owner')).toBe(h.owner);
    expect(h.ro(core, 'get-pending-owner')).toBe(null);
    expect(h.ro(core, 'is-paused')).toBe(false);
    expect(h.ro(core, 'get-paused-at')).toBe(0n);
    expect(h.ro(core, 'get-unpause-eligible-at')).toBe(144n);
    expect(h.ro(core, 'is-verified-contract', [P(h.probe)])).toBe(false);
    expect(h.ro(core, 'get-verified-hash', [P(h.probe)])).toBe(null);
    expect(h.ro(core, 'is-registered', [P(h.probe)])).toBe(false);
    expect(h.ro(core, 'get-balance', [P(h.alice)])).toBe(0n);
  });
  it('verifies a contract hash once, owner only', () => {
    h.err(h.call(core, 'set-verified-contract', [P(h.probe)], h.alice), 5001);
    h.err(h.call(core, 'set-verified-contract', [P(h.alice)]), 5002);
    const r = h.ok(h.call(core, 'set-verified-contract', [P(h.probe)]));
    expect(h.printed(r, core)).toMatchObject({event: 'verified-contract-set', contract: h.probe, by: h.owner});
    expect(h.ro(core, 'is-verified-contract', [P(h.probe)])).toBe(true);
    expect(h.ro(core, 'get-verified-hash', [P(h.probe)])).toBe(h.printed(r, core).hash);
    h.err(h.call(core, 'set-verified-contract', [P(h.probe)]), 5003);
  });
  it('pauses at once and unpauses only after the timelock', () => {
    h.err(h.call(core, 'pause', [], h.alice), 5001);
    h.err(h.call(core, 'unpause'), 5017);
    const r = h.ok(h.call(core, 'pause'));
    const at = BigInt(simnet.burnBlockHeight);
    expect(h.printed(r, core)).toMatchObject({event: 'paused', 'paused-at': at, 'eligible-at': at + 144n});
    expect(h.ro(core, 'is-paused')).toBe(true);
    expect(h.ro(core, 'get-unpause-eligible-at')).toBe(at + 144n);
    h.err(h.call(core, 'unpause', [], h.alice), 5001);
    h.err(h.call(core, 'unpause'), 5008);
    simnet.mineEmptyBurnBlocks(Number(at + 144n) - simnet.burnBlockHeight - 1);
    h.err(h.call(core, 'unpause'), 5008);
    simnet.mineEmptyBurnBlocks(1);
    h.ok(h.call(core, 'unpause'));
    expect(h.ro(core, 'is-paused')).toBe(false);
  });
  it('hands ownership over in two steps', () => {
    h.err(h.call(core, 'propose-owner', [Cl.some(P(h.alice))], h.alice), 5001);
    h.err(h.call(core, 'accept-owner', [], h.alice), 5018);
    h.ok(h.call(core, 'propose-owner', [Cl.some(P(h.alice))]));
    expect(h.ro(core, 'get-pending-owner')).toBe(h.alice);
    h.err(h.call(core, 'accept-owner', [], h.bob), 5001);
    h.ok(h.call(core, 'accept-owner', [], h.alice));
    expect(h.ro(core, 'get-contract-owner')).toBe(h.alice);
    expect(h.ro(core, 'get-pending-owner')).toBe(null);
    h.err(h.call(core, 'pause'), 5001);
    h.ok(h.call(core, 'propose-owner', [Cl.none()], h.alice));
    h.err(h.call(core, 'accept-owner', [], h.alice), 5018);
  });
});

describe('jing-core-v6 register', () => {
  it('refuses a standard principal, an unverified canonical and other bytes', () => {
    h.err(h.call(core, 'register', [P(h.probe)], h.alice), 5002);
    h.err(h.call(h.probe, 'core-register', [P(h.probe)]), 5005);
    h.ok(h.call(core, 'set-verified-contract', [P(h.probe)]));
    h.err(h.call(h.probeAlt, 'core-register', [P(h.probe)]), 5006);
    expect(h.ro(core, 'is-registered', [P(h.probeAlt)])).toBe(false);
  });
  it('registers any deploy with the canonical bytes, once', () => {
    h.ok(h.call(core, 'set-verified-contract', [P(h.probe)]));
    const twin = h.deployProbe('probe-twin', h.bob);
    const r = h.ok(h.call(twin, 'core-register', [P(h.probe)]));
    expect(h.printed(r, core)).toMatchObject({event: 'registered', contract: twin, canonical: h.probe});
    expect(h.ro(core, 'is-registered', [P(twin)])).toBe(true);
    h.err(h.call(twin, 'core-register', [P(h.probe)]), 5003);
  });
});

describe('jing-core-v6 log entrypoints', () => {
  for (const e of h.coreLogs) it(`${e.name}: registered caller only${e.pauseGated ? ', refused while paused' : ''}`, () => {
    h.coreRegister();
    h.err(h.coreLog(e.name, {}, h.probeAlt), 5001);
    const r = h.ok(h.coreLog(e.name));
    expect(h.printed(r, core)).toHaveProperty('event');
    h.ok(h.call(core, 'pause'));
    if (e.pauseGated) h.err(h.coreLog(e.name), 5016);
    else h.ok(h.coreLog(e.name));
  });
});

const tx = P(h.tokenX), ty = P(h.tokenY);
describe('jing-core-v6 equity accounting', () => {
  it('vault deposit credits and withdraw debits the caller, saturating at zero', () => {
    h.coreRegister();
    h.ok(h.coreLog('log-deposit', {token: tx, amount: h.U(100)}));
    expect([h.equity(h.tokenX, h.probe), h.total(h.tokenX)]).toEqual([100n, 100n]);
    expect(h.printed(h.ok(h.coreLog('log-withdraw', {token: tx, amount: h.U(30)})), core).equity).toBe(70n);
    h.ok(h.coreLog('log-withdraw', {token: tx, amount: h.U(1000)}));
    expect([h.equity(h.tokenX, h.probe), h.total(h.tokenX)]).toEqual([0n, 0n]);
  });
  for (const s of ['x', 'y'] as const) it(`deposit-${s} credits only unregistered depositors; parked equity is reported`, () => {
    h.coreRegister();
    const token = s === 'x' ? h.tokenX : h.tokenY, base = {'token-x': tx, 'token-y': ty, delta: h.U(50)};
    const a = h.printed(h.ok(h.coreLog(`log-deposit-${s}`, {...base, depositor: P(h.alice), parked: Cl.some(P(h.bob))})), core);
    expect(a[`equity-${s}`]).toBe(50n);
    expect(a[`parked-equity-${s}`]).toBe(0n);
    const b = h.printed(h.ok(h.coreLog(`log-deposit-${s}`, {...base, depositor: P(h.probe)})), core);
    expect(b[`parked-equity-${s}`]).toBe(null);
    expect([h.equity(token, h.alice), h.equity(token, h.probe), h.total(token)]).toEqual([50n, 0n, 50n]);
    // refund: an unregistered depositor is debited, a registered one is not
    h.ok(h.coreLog('log-deposit', {token: P(token), amount: h.U(9)}));
    h.ok(h.coreLog(`log-refund-${s}`, {...base, depositor: P(h.alice), amount: h.U(20)}));
    h.ok(h.coreLog(`log-refund-${s}`, {...base, depositor: P(h.probe), amount: h.U(9)}));
    expect([h.equity(token, h.alice), h.equity(token, h.probe)]).toEqual([30n, 9n]);
  });
  for (const yTaker of [true, false]) it(`match with y-is-taker ${yTaker}: takers, makers and registered makers`, () => {
    const vault = h.deployProbe('probe-vault');
    h.coreRegister(h.probe, vault);
    const [taken, given] = yTaker ? [h.tokenY, h.tokenX] : [h.tokenX, h.tokenY];
    // unregistered taker (alice) and maker (bob) start with equity
    h.ok(h.coreLog(yTaker ? 'log-deposit-y' : 'log-deposit-x', {depositor: P(h.alice), delta: h.U(100), 'token-x': tx, 'token-y': ty}));
    h.ok(h.coreLog(yTaker ? 'log-deposit-x' : 'log-deposit-y', {depositor: P(h.bob), delta: h.U(100), 'token-x': tx, 'token-y': ty}));
    const m = {'token-x': tx, 'token-y': ty, 'y-is-taker': Cl.bool(yTaker), 'x-traded': h.U(10), 'y-traded': h.U(10), 'maker-received': h.U(9)};
    h.ok(h.coreLog('log-match', {...m, taker: P(h.alice), maker: P(h.bob)}));
    expect([h.equity(taken, h.alice), h.equity(given, h.bob), h.equity(taken, h.bob)]).toEqual([90n, 90n, 0n]);
    // registered taker: not debited here; registered maker: credited proceeds
    h.ok(h.coreLog('log-deposit', {token: P(given), amount: h.U(10)}, vault));
    h.ok(h.coreLog('log-match', {...m, taker: P(h.probe), maker: P(vault)}));
    expect([h.equity(given, vault), h.equity(taken, vault), h.equity(taken, h.probe)]).toEqual([0n, 9n, 0n]);
  });
  it('settlement reports the binding side', () => {
    h.coreRegister();
    expect(h.printed(h.ok(h.coreLog('log-settlement', {'x-is-binding': Cl.bool(true)})), core)['binding-side']).toBe('x');
    expect(h.printed(h.ok(h.coreLog('log-settlement', {'x-is-binding': Cl.bool(false)})), core)['binding-side']).toBe('y');
  });
  for (const s of ['x', 'y'] as const) it(`distribute-${s}: clears only a positive amount, credits only registered depositors`, () => {
    h.coreRegister();
    const o = s === 'x' ? 'y' : 'x', mine = s === 'x' ? h.tokenX : h.tokenY, theirs = s === 'x' ? h.tokenY : h.tokenX;
    const base = {'token-x': tx, 'token-y': ty, [`${o}-received`]: h.U(7)};
    h.ok(h.coreLog(`log-deposit-${s}`, {depositor: P(h.alice), delta: h.U(40), 'token-x': tx, 'token-y': ty}));
    h.ok(h.coreLog(`log-distribute-${s}-depositor`, {...base, depositor: P(h.alice), [`${s}-cleared`]: h.U(0)}));
    expect(h.equity(mine, h.alice)).toBe(40n);
    h.ok(h.coreLog(`log-distribute-${s}-depositor`, {...base, depositor: P(h.alice), [`${s}-cleared`]: h.U(15)}));
    expect([h.equity(mine, h.alice), h.equity(theirs, h.alice)]).toEqual([25n, 0n]);
    h.ok(h.coreLog(`log-distribute-${s}-depositor`, {...base, depositor: P(h.probe), [`${s}-cleared`]: h.U(0)}));
    expect(h.equity(theirs, h.probe)).toBe(7n);
  });
  it('swap logs debit the input and credit the output of the caller', () => {
    h.coreRegister();
    h.ok(h.coreLog('log-deposit', {token: tx, amount: h.U(100)}));
    for (const name of ['log-bitflow-swap', 'log-jing-swap'])
      h.ok(h.coreLog(name, {'token-in': tx, 'token-out': ty, amount: h.U(30), out: h.U(5)}));
    expect([h.equity(h.tokenX, h.probe), h.equity(h.tokenY, h.probe)]).toEqual([40n, 10n]);
  });
  it('reconciled swap sets the caller equity up or down to the targets', () => {
    h.coreRegister();
    h.ok(h.coreLog('log-deposit', {token: tx, amount: h.U(100)}));
    const r = h.ok(h.coreLog('log-jing-swap-reconciled', {'token-in': tx, 'token-out': ty, 'equity-in': h.U(60), 'equity-out': h.U(25)}));
    expect(h.printed(r, core)).toMatchObject({'equity-in': 60n, 'equity-out': 25n, reconciled: true});
    expect([h.total(h.tokenX), h.total(h.tokenY)]).toEqual([60n, 25n]);
  });
  it('reserve and snpl logs move the caller equity they name', () => {
    h.coreRegister();
    h.ok(h.coreLog('log-reserve-supply', {amount: h.U(100)}));
    h.ok(h.coreLog('log-reserve-withdraw-sbtc', {amount: h.U(40)}));
    expect(h.equity(h.SBTC, h.probe)).toBe(60n);
    expect(h.ro(core, 'get-balance', [P(h.probe)])).toBe(60n);
    h.ok(h.coreLog('log-deposit', {token: ty, amount: h.U(50)}));
    h.ok(h.coreLog('log-snpl-repay', {'token-y': ty, 'token-y-released': h.U(20)}));
    h.ok(h.coreLog('log-snpl-seize', {'token-y': ty, 'token-y-seized': h.U(5)}));
    expect(h.equity(h.tokenY, h.probe)).toBe(25n);
  });
});
