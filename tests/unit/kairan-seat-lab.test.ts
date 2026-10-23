import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';
import { createHash } from 'node:crypto';

const CONTRACT = 'kairan-seat-lab-ocifarsito';
const LAB = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
const RUNNER = 'SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const RUN_URL = 'https://x.com/RaphaStacks/status/2111442457384878240';
const LAB_URL = 'https://letafricabuild.com/journal/kairans-seat';
const HASH = createHash('sha256').update(RUN_URL).digest();

function owner() {
  return simnet.deployer;
}

function donor() {
  return simnet.getAccounts().get('wallet_1')!;
}

function contractId() {
  return `${owner()}.${CONTRACT}`;
}

function call(fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, fn, args, sender);
}

function status(): any {
  return (simnet.callReadOnlyFn(CONTRACT, 'get-status', [], owner()).result as any).value;
}

function getRun(id: number): any {
  return simnet.callReadOnlyFn(CONTRACT, 'get-run', [Cl.uint(id)], owner()).result;
}

function sats(who: string): bigint {
  return (simnet.callReadOnlyFn(SBTC, 'get-balance', [Cl.principal(who)], owner()).result as any)
    .value.value;
}

function stx(who: string): bigint {
  return simnet.getAssetsMap().get('STX')!.get(who) ?? 0n;
}

function amounts(id: number, s: number | bigint, b: number | bigint) {
  return Cl.tuple({ id: Cl.uint(id), stx: Cl.uint(s), sats: Cl.uint(b) });
}

function printed(r: any): any {
  return r.events.find((e: any) => e.event === 'print_event').data.value.value;
}

function postRun(url = RUN_URL, sender = RUNNER) {
  return call('post-run', [Cl.stringAscii(url), Cl.buffer(HASH)], sender);
}

function claimRun(id: number, url = LAB_URL, sender = LAB, agree = true) {
  return call('claim-run', [Cl.uint(id), Cl.stringAscii(url), Cl.bool(agree)], sender);
}

const OCIFARSITO = RUNNER;

function donateStx(amount: number | bigint, sender = donor(), agree = true) {
  return call('donate-stx', [Cl.uint(amount), Cl.bool(agree)], sender);
}

function donateSbtc(amount: number | bigint, sender = SBTC_WHALE, agree = true) {
  return call('donate-sbtc', [Cl.uint(amount), Cl.bool(agree)], sender);
}

function give(s: number, b: number) {
  if (s > 0) expect(donateStx(s).result).toBeOk(Cl.bool(true));
  if (b > 0) expect(donateSbtc(b).result).toBeOk(Cl.bool(true));
}

function pair(s: number | bigint, b: number | bigint) {
  return Cl.tuple({ stx: Cl.uint(s), sats: Cl.uint(b) });
}

function deployProxy() {
  const src = `
(define-public (proxy-post-run)
  (contract-call? '${contractId()} post-run "https://evil.example" 0x00))
(define-public (proxy-claim-run (id uint))
  (contract-call? '${contractId()} claim-run id "https://evil.example" true))
(define-public (proxy-emergency)
  (contract-call? '${contractId()} emergency-withdraw))
(define-public (proxy-sync)
  (contract-call? '${contractId()} sync-donations))
`;
  simnet.deployContract('kairan-proxy', src, { clarityVersion: 5 }, donor());
  return `${donor()}.kairan-proxy`;
}

describe('kairan-seat-lab-ocifarsito', function () {
  it('takes STX and sBTC gifts from anyone and counts them', function () {
    give(5_000_000, 10_000);
    expect(donateStx(1, owner()).result).toBeOk(Cl.bool(true));
    const r = donateSbtc(3);
    expect(printed(r).event).toBeAscii('donate');
    expect(printed(r).asset).toBeAscii('sbtc');
    const s = status();
    expect(s['donated-stx']).toBeUint(5_000_001);
    expect(s['donated-sats']).toBeUint(10_003);
    expect(s['balance-stx']).toBeUint(5_000_001);
    expect(s['locked-stx']).toBeUint(0);
    expect(s['run-count']).toBeUint(0);
    expect(s.runner).toBePrincipal(RUNNER);
    expect(s.lab).toBePrincipal(LAB);
    expect(s.owner).toBePrincipal(owner());
    expect(sats(contractId())).toBe(10_003n);
  });

  it('rejects zero gifts', function () {
    expect(donateStx(0).result).toBeErr(Cl.uint(102));
    expect(donateSbtc(0).result).toBeErr(Cl.uint(102));
  });

  it('exposes the terms', function () {
    const t: any = simnet.callReadOnlyFn(CONTRACT, 'get-terms', [], owner()).result;
    expect(t.value).toContain('raised by UASU Inc. (a Delaware corporation, operating as Ocifarsito)');
    expect(t.value).toContain('LAB alone is responsible');
    expect(t.value).toContain('move all funds to UASU Inc. (Ocifarsito), which then picks a new recipient');
    expect(t.value).toMatch(/courts of Delaware\.$/);
    expect(t.value).toContain('RunThrough USA');
    expect(t.value).toContain('@ocifarsito');
    expect(t.value).toContain('for safety');
    expect(/^[\x20-\x7e]*$/.test(t.value)).toBe(true);
  });

  it('post-run: RUNNER only, url required, something to lock', function () {
    expect(postRun().result).toBeErr(Cl.uint(102));
    give(1_000, 0);
    expect(postRun(RUN_URL, donor()).result).toBeErr(Cl.uint(104));
    expect(postRun(RUN_URL, owner()).result).toBeErr(Cl.uint(104));
    expect(postRun(RUN_URL, LAB).result).toBeErr(Cl.uint(104));
    expect(postRun('').result).toBeErr(Cl.uint(108));
    expect(status()['run-count']).toBeUint(0);
  });

  it('post-run locks the whole unlocked balance as run 0', function () {
    give(5_000_000, 10_000);
    const r = postRun();
    expect(r.result).toBeOk(amounts(0, 5_000_000, 10_000));
    expect(printed(r).event).toBeAscii('run');
    expect(printed(r)['proof-hash']).toBeBuff(HASH);
    expect(getRun(0)).toBeSome(
      Cl.tuple({
        runner: Cl.principal(RUNNER),
        'burn-height': Cl.uint(simnet.burnBlockHeight),
        url: Cl.stringAscii(RUN_URL),
        'proof-hash': Cl.buffer(HASH),
        stx: Cl.uint(5_000_000),
        sats: Cl.uint(10_000),
        cancelled: Cl.bool(false),
        claimed: Cl.none(),
      })
    );
    expect(getRun(1)).toBeNone();
    const s = status();
    expect(s['locked-stx']).toBeUint(5_000_000);
    expect(s['locked-sats']).toBeUint(10_000);
    expect(s['run-count']).toBeUint(1);
    // nothing new to lock
    expect(postRun().result).toBeErr(Cl.uint(102));
  });

  it('later gifts stay unlocked; second run locks only the new gifts (one asset ok)', function () {
    give(1_000, 50);
    postRun();
    give(2_000, 0);
    expect(status()['locked-stx']).toBeUint(1_000);
    expect(postRun().result).toBeOk(amounts(1, 2_000, 0));
    give(0, 7);
    expect(postRun().result).toBeOk(amounts(2, 0, 7));
    const s = status();
    expect(s['locked-stx']).toBeUint(3_000);
    expect(s['locked-sats']).toBeUint(57);
    expect(s['run-count']).toBeUint(3);
  });

  it('claim-run pays LAB exactly that run and records its update', function () {
    give(1_000, 50);
    postRun();
    give(2_000, 20);
    postRun();
    give(400, 4); // unlocked, must stay
    const labStx = stx(LAB);
    const labSats = sats(LAB);
    const r = claimRun(1);
    expect(r.result).toBeOk(amounts(1, 2_000, 20));
    expect(printed(r).event).toBeAscii('claim-run');
    expect(printed(r)['terms-hash'].type).toBe('buffer');
    expect(stx(LAB) - labStx).toBe(2_000n);
    expect(sats(LAB) - labSats).toBe(20n);
    expect(stx(contractId())).toBe(1_400n);
    expect(sats(contractId())).toBe(54n);
    const run = getRun(1).value.value;
    expect(run.claimed).toBeSome(
      Cl.tuple({ 'burn-height': Cl.uint(simnet.burnBlockHeight), url: Cl.stringAscii(LAB_URL) })
    );
    expect(getRun(0).value.value.claimed).toBeNone();
    let s = status();
    expect(s['paid-stx']).toBeUint(2_000);
    expect(s['paid-sats']).toBeUint(20);
    expect(s['locked-stx']).toBeUint(1_000);
    expect(s['locked-sats']).toBeUint(50);
    // double claim
    expect(claimRun(1).result).toBeErr(Cl.uint(106));
    // run 0 still claimable, then the leftover gift locks as run 2
    expect(claimRun(0).result).toBeOk(amounts(0, 1_000, 50));
    expect(postRun().result).toBeOk(amounts(2, 400, 4));
    expect(claimRun(2).result).toBeOk(amounts(2, 400, 4));
    s = status();
    expect(s['locked-stx']).toBeUint(0);
    expect(s['paid-stx']).toBeUint(3_400);
    expect(stx(contractId())).toBe(0n);
  });

  it('claim-run checks: LAB only, terms, url, run exists', function () {
    give(1_000, 0);
    postRun();
    expect(claimRun(0, LAB_URL, donor()).result).toBeErr(Cl.uint(101));
    expect(claimRun(0, LAB_URL, owner()).result).toBeErr(Cl.uint(101));
    expect(claimRun(0, LAB_URL, RUNNER).result).toBeErr(Cl.uint(101));
    expect(claimRun(0, LAB_URL, LAB, false).result).toBeErr(Cl.uint(103));
    expect(claimRun(0, '').result).toBeErr(Cl.uint(108));
    expect(claimRun(1).result).toBeErr(Cl.uint(105));
    expect(status()['paid-stx']).toBeUint(0);
  });

  it('donate requires the donor terms; donor terms are exposed', function () {
    expect(donateStx(1_000, donor(), false).result).toBeErr(Cl.uint(103));
    expect(donateSbtc(10, SBTC_WHALE, false).result).toBeErr(Cl.uint(103));
    expect(status()['donated-stx']).toBeUint(0);
    const t: any = simnet.callReadOnlyFn(CONTRACT, 'get-donor-terms', [], owner()).result;
    expect(t.value).toContain('UASU Inc. (a Delaware corporation, operating as Ocifarsito)');
    expect(t.value).toContain('Gifts are voluntary and final. ');
    expect(t.value).toContain('not tax-deductible');
    expect(t.value).toContain('501(c)(3)');
    expect(t.value).toContain('move all funds to UASU Inc. (Ocifarsito)');
    expect(t.value).not.toContain('reclaim');
    expect(t.value).toMatch(/courts of Delaware\.$/);
    expect(/^[\x20-\x7e]*$/.test(t.value)).toBe(true);
  });

  it('proxy contracts cannot act as RUNNER, LAB or OWNER (contract-caller)', function () {
    give(1_000, 0);
    const p = deployProxy();
    expect(simnet.callPublicFn(p, 'proxy-post-run', [], RUNNER).result).toBeErr(Cl.uint(104));
    postRun();
    expect(simnet.callPublicFn(p, 'proxy-claim-run', [Cl.uint(0)], LAB).result).toBeErr(Cl.uint(101));
    expect(simnet.callPublicFn(p, 'proxy-emergency', [], owner()).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(p, 'proxy-sync', [], owner()).result).toBeErr(Cl.uint(100));
    expect(status()['frozen-at']).toBeNone();
  });

  it('emergency-withdraw: owner only, whole balance to Ocifarsito, then frozen', function () {
    give(5_000_000, 10_000);
    postRun();
    give(1_000, 0);
    expect(call('emergency-withdraw', [], LAB).result).toBeErr(Cl.uint(100));
    expect(call('emergency-withdraw', [], RUNNER).result).toBeErr(Cl.uint(100));
    expect(call('emergency-withdraw', [], donor()).result).toBeErr(Cl.uint(100));
    const oStx = stx(OCIFARSITO);
    const oSats = sats(OCIFARSITO);
    const r = call('emergency-withdraw', [], owner());
    expect(r.result).toBeOk(pair(5_001_000, 10_000));
    expect(printed(r).event).toBeAscii('emergency-withdraw');
    expect(stx(OCIFARSITO) - oStx).toBe(5_001_000n);
    expect(sats(OCIFARSITO) - oSats).toBe(10_000n);
    expect(stx(contractId())).toBe(0n);
    expect(sats(contractId())).toBe(0n);
    const s = status();
    expect(s['frozen-at'].type).toBe('some');
    expect(s['withdrawn-stx']).toBeUint(5_001_000);
    expect(s['withdrawn-sats']).toBeUint(10_000);
    expect(s['locked-stx']).toBeUint(0);
    expect(s['locked-sats']).toBeUint(0);
    // frozen for good
    expect(call('emergency-withdraw', [], owner()).result).toBeErr(Cl.uint(109));
    expect(donateStx(1).result).toBeErr(Cl.uint(109));
    expect(donateSbtc(1).result).toBeErr(Cl.uint(109));
    simnet.transferSTX(300, contractId(), donor());
    expect(postRun().result).toBeErr(Cl.uint(109));
    expect(claimRun(0).result).toBeErr(Cl.uint(109));
    expect(call('sync-donations', [], owner()).result).toBeErr(Cl.uint(109));
  });

  it('emergency-withdraw on an empty contract still freezes', function () {
    expect(call('emergency-withdraw', [], owner()).result).toBeOk(pair(0, 0));
    expect(donateStx(1).result).toBeErr(Cl.uint(109));
  });

  it('sync-donations: owner counts direct transfers; they lock on the next run', function () {
    give(5_000_000, 0);
    simnet.transferSTX(1_000_000, contractId(), donor());
    expect(call('sync-donations', [], donor()).result).toBeErr(Cl.uint(100));
    expect(call('sync-donations', [], owner()).result).toBeOk(
      Cl.tuple({ stx: Cl.uint(1_000_000), sats: Cl.uint(0) })
    );
    expect(status()['donated-stx']).toBeUint(6_000_000);
    expect(postRun().result).toBeOk(amounts(0, 6_000_000, 0));
  });

  it('set-runner: owner approves a friend, who can then post a run', function () {
    const c = 'kairan-seat-lab-ocifarsito';
    const friend = simnet.getAccounts().get('wallet_3')!;
    const w1 = simnet.getAccounts().get('wallet_1')!;
    simnet.callPublicFn(c, 'donate-stx', [Cl.uint(5_000_000), Cl.bool(true)], w1);
    const hash = Cl.bufferFromHex('11'.repeat(32));
    const url = Cl.stringAscii('https://x.com/friend/status/1');
    expect(simnet.callPublicFn(c, 'post-run', [url, hash], friend).result).toBeErr(Cl.uint(104));
    expect(simnet.callPublicFn(c, 'set-runner', [Cl.principal(friend), Cl.bool(true)], w1).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(c, 'set-runner', [Cl.principal(friend), Cl.bool(true)], simnet.deployer).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn(c, 'post-run', [url, hash], friend).result).toBeOk(
      Cl.tuple({ id: Cl.uint(0), stx: Cl.uint(5_000_000), sats: Cl.uint(0) })
    );
    simnet.callPublicFn(c, 'set-runner', [Cl.principal(friend), Cl.bool(false)], simnet.deployer);
    simnet.callPublicFn(c, 'donate-stx', [Cl.uint(1_000_000), Cl.bool(true)], w1);
    expect(simnet.callPublicFn(c, 'post-run', [url, hash], friend).result).toBeErr(Cl.uint(104));
  });

  it('cancel-run: owner unlocks an unclaimed run, LAB cannot claim it, next run relocks', function () {
    const c = 'kairan-seat-lab-ocifarsito';
    const w1 = simnet.getAccounts().get('wallet_1')!;
    const lab = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
    const hash = Cl.bufferFromHex('22'.repeat(32));
    const url = Cl.stringAscii('https://x.com/RaphaStacks/status/1');
    simnet.callPublicFn(c, 'donate-stx', [Cl.uint(5_000_000), Cl.bool(true)], w1);
    simnet.callPublicFn(c, 'post-run', [url, hash], RUNNER);
    expect(simnet.callPublicFn(c, 'cancel-run', [Cl.uint(0)], w1).result).toBeErr(Cl.uint(100));
    expect(simnet.callPublicFn(c, 'cancel-run', [Cl.uint(0)], simnet.deployer).result).toBeOk(Cl.bool(true));
    expect(simnet.callPublicFn(c, 'cancel-run', [Cl.uint(0)], simnet.deployer).result).toBeErr(Cl.uint(107));
    expect(simnet.callPublicFn(c, 'claim-run', [Cl.uint(0), url, Cl.bool(true)], lab).result).toBeErr(Cl.uint(107));
    expect(simnet.callPublicFn(c, 'post-run', [url, hash], RUNNER).result).toBeOk(
      Cl.tuple({ id: Cl.uint(1), stx: Cl.uint(5_000_000), sats: Cl.uint(0) })
    );
    expect(simnet.callPublicFn(c, 'claim-run', [Cl.uint(1), url, Cl.bool(true)], lab).result).toBeOk(
      Cl.tuple({ id: Cl.uint(1), stx: Cl.uint(5_000_000), sats: Cl.uint(0) })
    );
    expect(simnet.callPublicFn(c, 'cancel-run', [Cl.uint(1)], simnet.deployer).result).toBeErr(Cl.uint(106));
  });
});
