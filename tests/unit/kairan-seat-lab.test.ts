import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';

const CONTRACT = 'kairan-seat-lab';
const LAB = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const CLAIM_WINDOW = 8640;
const RECEIPT_WINDOW = 4320;

function owner() {
  return simnet.deployer;
}

function donor() {
  return simnet.getAccounts().get('wallet_1')!;
}

function call(fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, fn, args, sender);
}

function status() {
  return simnet.callReadOnlyFn(CONTRACT, 'get-status', [], owner()).result;
}

function sbtcBalance(who: string) {
  return simnet.callReadOnlyFn(SBTC, 'get-balance', [Cl.principal(who)], who).result;
}

describe('kairan-seat-lab', function () {
  it('takes STX and sBTC gifts and counts them', function () {
    expect(call('donate-stx', [Cl.uint(5_000_000)], donor()).result).toBeOk(Cl.bool(true));
    expect(call('donate-sbtc', [Cl.uint(10_000)], SBTC_WHALE).result).toBeOk(Cl.bool(true));
    const s: any = status();
    expect(s.value['donated-stx']).toBeUint(5_000_000);
    expect(s.value['donated-sats']).toBeUint(10_000);
    expect(s.value['balance-stx']).toBeUint(5_000_000);
  });

  it('rejects a zero gift', function () {
    expect(call('donate-stx', [Cl.uint(0)], donor()).result).toBeErr(Cl.uint(102));
  });

  it('only LAB can claim, and only by accepting the terms', function () {
    call('donate-stx', [Cl.uint(5_000_000)], donor());
    expect(call('claim', [Cl.bool(true)], donor()).result).toBeErr(Cl.uint(101));
    expect(call('claim', [Cl.bool(false)], LAB).result).toBeErr(Cl.uint(103));
  });

  it('LAB claim pays the whole STX + sBTC balance and sets the receipt deadline', function () {
    call('donate-stx', [Cl.uint(5_000_000)], donor());
    call('donate-sbtc', [Cl.uint(10_000)], SBTC_WHALE);
    const before = sbtcBalance(LAB) as any;
    const r = call('claim', [Cl.bool(true)], LAB);
    expect(r.result).toBeOk(Cl.tuple({ stx: Cl.uint(5_000_000), sats: Cl.uint(10_000) }));
    const after = sbtcBalance(LAB) as any;
    expect(after.value.value - before.value.value).toBe(10_000n);
    const s: any = status();
    expect(s.value['balance-stx']).toBeUint(0);
    expect(s.value['claimed-sats']).toBeUint(10_000);
    expect(s.value['receipt-deadline'].type).toBe('some');
    expect(call('claim', [Cl.bool(true)], LAB).result).toBeErr(Cl.uint(104));
    expect(call('donate-stx', [Cl.uint(1)], donor()).result).toBeErr(Cl.uint(104));
  });

  it('claim with an empty pot fails', function () {
    expect(call('claim', [Cl.bool(true)], LAB).result).toBeErr(Cl.uint(106));
  });

  it('receipts: LAB only, after claim, marked on time or late', function () {
    const url = 'https://letafricabuild.com/journal/kairans-seat';
    expect(call('post-receipt', [Cl.stringAscii(url)], LAB).result).toBeErr(Cl.uint(105));
    call('donate-stx', [Cl.uint(5_000_000)], donor());
    call('claim', [Cl.bool(true)], LAB);
    expect(call('post-receipt', [Cl.stringAscii(url)], donor()).result).toBeErr(Cl.uint(101));
    expect(call('post-receipt', [Cl.stringAscii('')], LAB).result).toBeErr(Cl.uint(108));
    expect(call('post-receipt', [Cl.stringAscii(url)], LAB).result).toBeOk(Cl.uint(0));
    const first: any = simnet.callReadOnlyFn(CONTRACT, 'get-receipt', [Cl.uint(0)], owner()).result;
    expect(first.value.value['on-time']).toBeBool(true);
    simnet.mineEmptyBurnBlocks(RECEIPT_WINDOW + 1);
    expect(call('post-receipt', [Cl.stringAscii(url + '-2')], LAB).result).toBeOk(Cl.uint(1));
    const second: any = simnet.callReadOnlyFn(CONTRACT, 'get-receipt', [Cl.uint(1)], owner()).result;
    expect(second.value.value['on-time']).toBeBool(false);
  });

  it('flags an overdue receipt when none is posted in the window', function () {
    call('donate-stx', [Cl.uint(5_000_000)], donor());
    call('claim', [Cl.bool(true)], LAB);
    simnet.mineEmptyBurnBlocks(RECEIPT_WINDOW + 1);
    const s: any = status();
    expect(s.value['receipt-overdue']).toBeBool(true);
  });

  it('owner reclaims only after the claim window, and never after a claim', function () {
    call('donate-stx', [Cl.uint(5_000_000)], donor());
    call('donate-sbtc', [Cl.uint(10_000)], SBTC_WHALE);
    expect(call('reclaim', [], donor()).result).toBeErr(Cl.uint(100));
    expect(call('reclaim', [], owner()).result).toBeErr(Cl.uint(107));
    simnet.mineEmptyBurnBlocks(CLAIM_WINDOW);
    expect(call('reclaim', [], owner()).result).toBeOk(
      Cl.tuple({ stx: Cl.uint(5_000_000), sats: Cl.uint(10_000) })
    );
    expect(call('claim', [Cl.bool(true)], LAB).result).toBeErr(Cl.uint(104));
  });
});
