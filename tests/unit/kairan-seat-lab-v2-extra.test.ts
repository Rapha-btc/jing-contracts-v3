import { describe, expect, it } from 'vitest';
import { Cl } from '@stacks/transactions';

const CONTRACT = 'kairan-seat-lab-ocifarsito-v2';
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const USDCX_HOLDER = 'SP3A7MGAH0SKC1ACS854PHXHVWE031FYQCBA8M51D';
const USDCX_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const LAB = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
const TARGET = 2_000_000_000n;
const DEADLINE = 1_025_386;
const SEAT_WINDOW = 12_960;
const BUILDER = 'Ada Builder (@ada_btc)';
const REPO = 'https://github.com/ada-btc/stacks-indexer';
const SEAT_URL = 'https://letafricabuild.com/journal/kairans-seat-1';

function owner() {
  return simnet.deployer;
}

function wallet(n: number) {
  return simnet.getAccounts().get(`wallet_${n}`)!;
}

function call(fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, fn, args, sender);
}

function donate(want: bigint, sender: string) {
  return call('donate', [Cl.uint(want), Cl.bool(true)], sender);
}

function usdcx(who: string): bigint {
  const result = simnet.callReadOnlyFn(
    USDCX,
    'get-balance',
    [Cl.principal(who)],
    owner(),
  ).result as any;
  return result.value.value;
}

function readOnly(fn: string, args: any[] = []) {
  return simnet.callReadOnlyFn(CONTRACT, fn, args, owner()).result as any;
}

function fund(who: string, amount: bigint) {
  expect(
    simnet.callPublicFn(
      USDCX,
      'transfer',
      [Cl.uint(amount), Cl.principal(USDCX_WHALE), Cl.principal(who), Cl.none()],
      USDCX_WHALE,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function toBurn(height: number) {
  const blocks = height - simnet.burnBlockHeight;
  if (blocks > 0) simnet.mineEmptyBurnBlocks(blocks);
}

describe('kairan-seat-lab-ocifarsito-v2 mainnet-fork gaps', function () {
  it('real USDCx holders donate directly; a want above the remainder is capped', function () {
    const holderGift = 1_250_000_000n;
    const whaleGift = 750_000_000n;
    const holderBefore = usdcx(USDCX_HOLDER);
    const whaleBefore = usdcx(USDCX_WHALE);

    expect(holderBefore).toBeGreaterThan(holderGift);
    expect(whaleBefore).toBeGreaterThan(whaleGift);

    expect(donate(holderGift, USDCX_HOLDER).result).toBeOk(Cl.uint(holderGift));
    expect(donate(whaleGift + 1n, USDCX_WHALE).result).toBeOk(Cl.uint(TARGET));
    expect(donate(1n, USDCX_WHALE).result).toBeErr(Cl.uint(110));

    expect(usdcx(USDCX_HOLDER)).toBe(holderBefore - holderGift);
    expect(usdcx(USDCX_WHALE)).toBe(whaleBefore - whaleGift); // only the remaining amount moved
    expect(readOnly('get-donor', [Cl.principal(USDCX_HOLDER)])).toBeSome(Cl.uint(holderGift));
    expect(readOnly('get-donor', [Cl.principal(USDCX_WHALE)])).toBeSome(Cl.uint(whaleGift));

    const status = readOnly('get-status').value;
    expect(status.total).toBeUint(TARGET);
    expect(status.unrefunded).toBeUint(TARGET);
    expect(status.remaining).toBeUint(0);
    expect(status['reached-at']).toBeSome(Cl.uint(simnet.burnBlockHeight));
  });

  it('reaching the target at DEADLINE - 1 preserves the full 12,960-block seat window', function () {
    const firstDonor = wallet(1);
    const lastDonor = wallet(2);

    fund(firstDonor, TARGET - 1n);
    expect(donate(TARGET - 1n, firstDonor).result).toBeOk(Cl.uint(TARGET - 1n));
    fund(lastDonor, 1n);
    toBurn(DEADLINE - 1);
    expect(donate(1n, lastDonor).result).toBeOk(Cl.uint(TARGET));

    const failureAt = DEADLINE - 1 + SEAT_WINDOW;
    const status = readOnly('get-status').value;
    expect(status['reached-at']).toBeSome(Cl.uint(DEADLINE - 1));
    expect(status['failure-at']).toBeUint(failureAt);

    toBurn(DEADLINE + 1);
    expect(
      call('request-seat', [
        Cl.stringAscii(BUILDER),
        Cl.stringAscii(REPO),
        Cl.stringAscii(SEAT_URL),
        Cl.bool(true),
      ], LAB).result,
    ).toBeOk(Cl.bool(true));
    expect(
      call('claim-reserve', [Cl.stringAscii('https://letafricabuild.com/pool'), Cl.bool(true)], LAB).result,
    ).toBeErr(Cl.uint(112));

    toBurn(failureAt - 1);
    expect(call('release-seat', [Cl.stringAscii(BUILDER), Cl.stringAscii(REPO), Cl.stringAscii(SEAT_URL)], owner()).result).toBeOk(
      Cl.tuple({ usdcx: Cl.uint(TARGET), stx: Cl.uint(0), sats: Cl.uint(0) }),
    );
  });
});
