import assert from 'node:assert/strict';
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToHex } from '@stacks/transactions';
const simnet = await initSimnet('./Clarinet-community-payroll.toml');
const accounts = simnet.getAccounts();
const admin = accounts.get('deployer');
const mgr = accounts.get('wallet_1');
const video = accounts.get('wallet_2');
const outsider = accounts.get('wallet_3');
const newAdmin = accounts.get('wallet_4');
const c = 'community-payroll';
let checks = 0;
const call = (fn, args, sender) => simnet.callPublicFn(c, fn, args, sender).result;
const ro = (fn, args) => simnet.callReadOnlyFn(c, fn, args, admin).result;
const eq = (actual, expected) => { assert.equal(cvToHex(actual), cvToHex(expected)); checks++; };
const err = (n) => Cl.error(Cl.uint(n));
const OK = Cl.ok(Cl.bool(true));
const stx = (who) => simnet.getAssetsMap().get('STX').get(who);
const h = (b) => Cl.buffer(new Uint8Array(32).fill(b));
const CAP = 40_000_000; // ~$15/wk in STX with headroom
const W = 202643;

// admin + managers
eq(call('set-manager', [Cl.principal(mgr), Cl.uint(CAP)], outsider), err(100));
eq(call('set-manager', [Cl.principal(mgr), Cl.uint(0)], admin), err(104));
eq(call('set-manager', [Cl.principal(mgr), Cl.uint(CAP)], admin), OK);
eq(call('set-manager', [Cl.principal(video), Cl.uint(CAP)], admin), OK);
eq(call('deactivate-manager', [Cl.principal(outsider)], admin), err(102));

// funding
eq(call('fund', [Cl.uint(0)], outsider), err(104));
eq(call('fund', [Cl.uint(100_000_000)], outsider), OK);
eq(ro('get-balance', []), Cl.uint(100_000_000));

// submit
eq(call('submit-week', [Cl.uint(W), h(1), Cl.uint(5)], outsider), err(102));
eq(call('submit-week', [Cl.uint(202654), h(1), Cl.uint(5)], mgr), err(105));
eq(call('submit-week', [Cl.uint(202600), h(1), Cl.uint(5)], mgr), err(105));
eq(call('submit-week', [Cl.uint(202552), h(1), Cl.uint(5)], mgr), err(105));
eq(call('submit-week', [Cl.uint(W), h(1), Cl.uint(0)], mgr), err(112));
eq(call('pay-week', [Cl.principal(mgr), Cl.uint(W), h(1), Cl.uint(10), Cl.uint(1)], admin), err(106));
eq(call('submit-week', [Cl.uint(W), h(1), Cl.uint(5)], mgr), OK);
// resubmit while submitted overwrites; admin's reviewed hash h(1) is now stale
eq(call('submit-week', [Cl.uint(W), h(2), Cl.uint(6)], mgr), OK);

// pay guards
const pay = (hash, pts, amt, sender = admin, who = mgr) => call('pay-week', [Cl.principal(who), Cl.uint(W), hash, Cl.uint(pts), Cl.uint(amt)], sender);
eq(pay(h(2), 10, 15_000_000, outsider), err(100));
eq(pay(h(1), 10, 15_000_000), err(109));
eq(pay(h(2), 10, 0), err(104));
eq(pay(h(2), 10, CAP + 1), err(110));

// reject -> resubmit -> pay
eq(call('reject-week', [Cl.principal(mgr), Cl.uint(W), Cl.stringAscii('missing links')], outsider), err(100));
eq(call('reject-week', [Cl.principal(mgr), Cl.uint(W), Cl.stringAscii('missing links')], admin), OK);
eq(pay(h(2), 10, 15_000_000), err(108));
eq(call('reject-week', [Cl.principal(mgr), Cl.uint(W), Cl.stringAscii('again')], admin), err(108));
eq(call('submit-week', [Cl.uint(W), h(3), Cl.uint(7)], mgr), OK);
const before = stx(mgr);
const r = simnet.callPublicFn(c, 'pay-week', [Cl.principal(mgr), Cl.uint(W), h(3), Cl.uint(42), Cl.uint(CAP)], admin);
eq(r.result, OK);
assert.equal(stx(mgr) - before, BigInt(CAP)); checks++;
const ev = r.events.find((e) => e.event === 'print_event').data.value;
eq(ev.value.points, Cl.uint(42));
eq(ev.value['activities-hash'], h(3));
eq(ev.value.amount, Cl.uint(CAP));
const rec = ro('get-week', [Cl.principal(mgr), Cl.uint(W)]);
assert.equal(rec.value.value.status.value, 1n); checks++;
assert.equal(rec.value.value.points.value, 42n); checks++;
assert.equal(rec.value.value['paid-ustx'].value, BigInt(CAP)); checks++;

// paid is final
eq(pay(h(3), 42, 1), err(107));
eq(call('submit-week', [Cl.uint(W), h(4), Cl.uint(7)], mgr), err(107));
eq(call('reject-week', [Cl.principal(mgr), Cl.uint(W), Cl.stringAscii('x')], admin), err(107));

// video maker: paid per video, under cap
eq(call('submit-week', [Cl.uint(W), h(9), Cl.uint(2)], video), OK);
eq(pay(h(9), 2, 25_000_000, admin, video), OK);

// insufficient funds (balance 100 - 40 - 25 = 35 STX)
eq(call('submit-week', [Cl.uint(W + 1), h(5), Cl.uint(1)], mgr), OK);
eq(call('pay-week', [Cl.principal(mgr), Cl.uint(W + 1), h(5), Cl.uint(1), Cl.uint(36_000_000)], admin), err(111));

// deactivate blocks submit + pay
eq(call('deactivate-manager', [Cl.principal(mgr)], admin), OK);
eq(call('pay-week', [Cl.principal(mgr), Cl.uint(W + 1), h(5), Cl.uint(1), Cl.uint(1)], admin), err(103));
eq(call('submit-week', [Cl.uint(W + 2), h(6), Cl.uint(1)], mgr), err(103));

// withdraw
eq(call('withdraw', [Cl.uint(1), Cl.principal(outsider)], outsider), err(100));
eq(call('withdraw', [Cl.uint(35_000_001), Cl.principal(admin)], admin), err(111));
eq(call('withdraw', [Cl.uint(35_000_000), Cl.principal(newAdmin)], admin), OK);
eq(ro('get-totals', []), Cl.tuple({ funded: Cl.uint(100_000_000), paid: Cl.uint(65_000_000), withdrawn: Cl.uint(35_000_000), balance: Cl.uint(0) }));

// admin handover
eq(call('accept-admin', [], newAdmin), err(101));
eq(call('propose-admin', [Cl.some(Cl.principal(newAdmin))], outsider), err(100));
eq(call('propose-admin', [Cl.some(Cl.principal(newAdmin))], admin), OK);
eq(call('accept-admin', [], outsider), err(100));
eq(call('accept-admin', [], newAdmin), OK);
eq(ro('get-admin', []), Cl.principal(newAdmin));
eq(call('set-manager', [Cl.principal(mgr), Cl.uint(CAP)], admin), err(100));
eq(call('set-manager', [Cl.principal(mgr), Cl.uint(CAP)], newAdmin), OK);
eq(call('accept-admin', [], newAdmin), err(101));

console.log(`community-payroll verified: ${checks} checks passed`);
