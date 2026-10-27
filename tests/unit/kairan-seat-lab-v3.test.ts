import { describe, expect, it } from 'vitest';
import { Cl, deserializeCV, serializeCV } from '@stacks/transactions';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const CONTRACT = 'kairan-seat-lab-ocifarsito-v3';
const LAB = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
const FUNDRAISER = 'SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const DESCRIPTION = "Kairan's Seat grant: Ada (@ada_btc) builds a Stacks indexer, https://github.com/ada-btc/stacks-indexer";
const REPLACEMENT = 'Kairan seat: Bo builds a sBTC wallet SDK, https://github.com/bo/sbtc-sdk';
const DEADLINE_SPAN = 12_960n;
const REVIEW_WINDOW = 1_008n;
const DEPOSIT_STX = 500_000_000n;
const DEPOSIT_SATS = 30_000n;

function owner(): string {
  return simnet.deployer;
}

function wallet(n: number): string {
  return simnet.getAccounts().get(`wallet_${n}`)!;
}

function contractId(): string {
  return `${owner()}.${CONTRACT}`;
}

function call(name: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, name, args, sender);
}

function readOnly(name: string, args: any[] = []): any {
  return simnet.callReadOnlyFn(CONTRACT, name, args, owner()).result;
}

function status(): any {
  return readOnly('get-status').value;
}

function deadline(): bigint {
  return status().deadline.value;
}

function toBurn(height: bigint): void {
  const blocks = Number(height) - simnet.burnBlockHeight;
  if (blocks > 0) simnet.mineEmptyBurnBlocks(blocks);
}

function stx(who: string): bigint {
  const value = simnet.runSnippet(`(stx-get-balance '${who})`);
  return (deserializeCV(value) as any).value;
}

function sats(who: string): bigint {
  return (simnet.callReadOnlyFn(SBTC, 'get-balance', [Cl.principal(who)], owner()).result as any).value.value;
}

function deposit(stxAmount = DEPOSIT_STX, satsAmount = DEPOSIT_SATS, sender = FUNDRAISER) {
  return call('deposit-reserve', [Cl.uint(stxAmount), Cl.uint(satsAmount)], sender);
}

function request(description = DESCRIPTION, sender = LAB, agree = true) {
  return call('request-reserve', [Cl.stringAscii(description), Cl.bool(agree)], sender);
}

function release(description = DESCRIPTION, sender = owner()) {
  return call('release-reserve', [Cl.stringAscii(description)], sender);
}

function recoup(sender = FUNDRAISER) {
  return call('recoup-reserve', [], sender);
}

function printed(result: any): any {
  return result.events.find((event: any) => event.event === 'print_event').data.value.value;
}

function termsHash(): Buffer {
  const serialized = Buffer.from(serializeCV(Cl.stringUtf8(readOnly('get-terms').value)), 'hex');
  return createHash('sha256').update(serialized).digest();
}

function sendSbtc(from: string, to: string, amount: bigint): void {
  expect(
    simnet.callPublicFn(
      SBTC,
      'transfer',
      [Cl.uint(amount), Cl.principal(from), Cl.principal(to), Cl.none()],
      from,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function deployProxy(): string {
  const target = contractId();
  const source = [
    `(define-public (proxy-deposit) (contract-call? '${target} deposit-reserve u1 u0))`,
    `(define-public (proxy-request) (contract-call? '${target} request-reserve "proxy request" true))`,
    `(define-public (proxy-release) (contract-call? '${target} release-reserve "${DESCRIPTION}"))`,
    `(define-public (proxy-recoup) (contract-call? '${target} recoup-reserve))`,
  ].join('\n');
  simnet.deployContract('kairan-proxy-v3', source, { clarityVersion: 5 }, wallet(1));
  return `${wallet(1)}.kairan-proxy-v3`;
}

describe('Kairan reserve v3 terms and deployment status', function () {
  it('sets the deadline to 12,960 burn blocks after deployment and returns it in status', function () {
    const deployHeight = BigInt(simnet.burnBlockHeight);

    expect(deadline()).toBe(deployHeight + DEADLINE_SPAN);
    expect(status()).toEqual({
      lab: Cl.principal(LAB),
      owner: Cl.principal(owner()),
      fundraiser: Cl.principal(FUNDRAISER),
      deadline: Cl.uint(deployHeight + DEADLINE_SPAN),
      stx: Cl.uint(0),
      sats: Cl.uint(0),
      claimed: Cl.bool(false),
    });
  });

  it('TERMS include the deadline, fundraiser recoup, and manual donor refunds', function () {
    const text = readOnly('get-terms').value as string;

    expect(text).toContain(FUNDRAISER);
    expect(text).toContain('at least 7 days (1,008 Bitcoin blocks) before the deadline');
    expect(text).toContain('about 90 days (12,960 Bitcoin blocks) after this contract is deployed');
    expect(text).toContain('if the reserve was not released to LAB by the deadline');
    expect(text).toContain('recoup the whole reserve at any time');
    expect(text).toContain("refunds each donor's wallet manually from it");
  });
});

describe('deposit-reserve', function () {
  it('accepts repeat deposits and tracks the entire reserve', function () {
    const fundraiserStx = stx(FUNDRAISER);
    const fundraiserSats = sats(FUNDRAISER);

    const first = deposit();
    const second = deposit(1_000_000n, 500n);

    expect(first.result).toBeOk(Cl.bool(true));
    expect(second.result).toBeOk(Cl.bool(true));
    expect(printed(second)).toEqual({
      event: Cl.stringAscii('deposit-reserve'),
      stx: Cl.uint(1_000_000n),
      sats: Cl.uint(500n),
    });
    expect(status().stx).toBeUint(DEPOSIT_STX + 1_000_000n);
    expect(status().sats).toBeUint(DEPOSIT_SATS + 500n);
    expect(stx(FUNDRAISER)).toBe(fundraiserStx - DEPOSIT_STX - 1_000_000n);
    expect(sats(FUNDRAISER)).toBe(fundraiserSats - DEPOSIT_SATS - 500n);
  });

  it('returns u105 for non-fundraisers and u102 for a zero deposit', function () {
    for (const sender of [wallet(1), owner(), LAB]) {
      expect(deposit(1n, 0n, sender).result).toBeErr(Cl.uint(105));
    }
    expect(deposit(0n, 0n).result).toBeErr(Cl.uint(102));
  });
});

describe('request-reserve', function () {
  it('checks LAB, terms acceptance, and a non-empty description', function () {
    for (const sender of [wallet(1), owner(), FUNDRAISER]) {
      expect(request(DESCRIPTION, sender).result).toBeErr(Cl.uint(101));
    }
    expect(request(DESCRIPTION, LAB, false).result).toBeErr(Cl.uint(103));
    expect(request('').result).toBeErr(Cl.uint(104));
    expect(readOnly('get-request')).toBeNone();
  });

  it('records a request and lets LAB replace it', function () {
    const first = request();
    const second = request(REPLACEMENT);
    const event = printed(second);

    expect(first.result).toBeOk(Cl.bool(true));
    expect(second.result).toBeOk(Cl.bool(true));
    expect(readOnly('get-request')).toBeSome(Cl.stringAscii(REPLACEMENT));
    expect(event.event).toBeAscii('request-reserve');
    expect(event.description).toBeAscii(REPLACEMENT);
    expect(event['terms-hash']).toBeBuff(termsHash());
  });

  it('works at DEADLINE - 1009 and DEADLINE - 1008, then returns u113 inside the review window', function () {
    toBurn(deadline() - REVIEW_WINDOW - 1n);
    expect(request().result).toBeOk(Cl.bool(true));

    toBurn(deadline() - REVIEW_WINDOW);
    expect(request(REPLACEMENT).result).toBeOk(Cl.bool(true));

    toBurn(deadline() - REVIEW_WINDOW + 1n);
    expect(request('Too late').result).toBeErr(Cl.uint(113));
    expect(readOnly('get-request')).toBeSome(Cl.stringAscii(REPLACEMENT));
  });
});

describe('release-reserve', function () {
  it('returns u100 for non-owners, u107 without a request, and u115 for a changed request', function () {
    deposit();
    expect(release().result).toBeErr(Cl.uint(107));
    request();

    for (const sender of [wallet(1), LAB, FUNDRAISER]) {
      expect(release(DESCRIPTION, sender).result).toBeErr(Cl.uint(100));
    }
    request(REPLACEMENT);
    expect(release(DESCRIPTION).result).toBeErr(Cl.uint(115));
    expect(release(REPLACEMENT).result).toBeOk(
      Cl.tuple({ stx: Cl.uint(DEPOSIT_STX), sats: Cl.uint(DEPOSIT_SATS) }),
    );
  });

  it('returns u102 when the reserve is empty', function () {
    request();
    expect(release().result).toBeErr(Cl.uint(102));
    expect(readOnly('get-claim')).toBeNone();
  });

  it('releases at DEADLINE - 1', function () {
    deposit();
    request();
    toBurn(deadline() - 1n);
    expect(release().result).toBeOk(
      Cl.tuple({ stx: Cl.uint(DEPOSIT_STX), sats: Cl.uint(DEPOSIT_SATS) }),
    );
  });

  it('returns u113 at DEADLINE', function () {
    deposit();
    request();
    toBurn(deadline());
    expect(release().result).toBeErr(Cl.uint(113));
    expect(readOnly('get-claim')).toBeNone();
  });

  it('pays LAB every deposited and directly transferred STX/sBTC and records the claim', function () {
    const directStx = 7_000_000n;
    const directSats = 1_111n;
    deposit();
    expect(deposit(2_000_000n, 222n).result).toBeOk(Cl.bool(true));
    expect(simnet.transferSTX(directStx, contractId(), wallet(2)).result).toBeOk(Cl.bool(true));
    sendSbtc(FUNDRAISER, contractId(), directSats);
    request();

    const totalStx = DEPOSIT_STX + 2_000_000n + directStx;
    const totalSats = DEPOSIT_SATS + 222n + directSats;
    const labStx = stx(LAB);
    const labSats = sats(LAB);
    const releasedAt = BigInt(simnet.burnBlockHeight);
    const result = release();

    expect(result.result).toBeOk(Cl.tuple({ stx: Cl.uint(totalStx), sats: Cl.uint(totalSats) }));
    expect(stx(LAB)).toBe(labStx + totalStx);
    expect(sats(LAB)).toBe(labSats + totalSats);
    expect(stx(contractId())).toBe(0n);
    expect(sats(contractId())).toBe(0n);
    expect(readOnly('get-claim')).toBeSome(
      Cl.tuple({
        to: Cl.principal(LAB),
        'burn-height': Cl.uint(releasedAt),
        description: Cl.stringAscii(DESCRIPTION),
        stx: Cl.uint(totalStx),
        sats: Cl.uint(totalSats),
      }),
    );
    expect(status().claimed).toBeBool(true);
    expect(printed(result)).toEqual({
      event: Cl.stringAscii('release-reserve'),
      description: Cl.stringAscii(DESCRIPTION),
      stx: Cl.uint(totalStx),
      sats: Cl.uint(totalSats),
    });
  });

  it('pays an STX-only reserve', function () {
    deposit(DEPOSIT_STX, 0n);
    request();
    expect(release().result).toBeOk(Cl.tuple({ stx: Cl.uint(DEPOSIT_STX), sats: Cl.uint(0) }));
  });

  it('pays an sBTC-only reserve', function () {
    deposit(0n, DEPOSIT_SATS);
    request();
    expect(release().result).toBeOk(Cl.tuple({ stx: Cl.uint(0), sats: Cl.uint(DEPOSIT_SATS) }));
  });
});

describe('recoup-reserve', function () {
  it('returns u105 for non-fundraisers and u112 before DEADLINE', function () {
    deposit();
    for (const sender of [wallet(1), owner(), LAB]) {
      expect(recoup(sender).result).toBeErr(Cl.uint(105));
    }
    toBurn(deadline() - 1n);
    expect(recoup().result).toBeErr(Cl.uint(112));

  });

  it('returns u102 when there is nothing to recoup', function () {
    toBurn(deadline());
    expect(recoup().result).toBeErr(Cl.uint(102));
  });

  it('recoups the whole balance at DEADLINE, including direct transfers, and records FUNDRAISER as the recipient', function () {
    const directStx = 9_000_000n;
    const directSats = 2_222n;
    deposit();
    expect(deposit(4_000_000n, 333n).result).toBeOk(Cl.bool(true));
    expect(simnet.transferSTX(directStx, contractId(), wallet(2)).result).toBeOk(Cl.bool(true));
    sendSbtc(FUNDRAISER, contractId(), directSats);
    request(REPLACEMENT); // A pending request does not prevent recoup after expiry.
    toBurn(deadline());

    const totalStx = DEPOSIT_STX + 4_000_000n + directStx;
    const totalSats = DEPOSIT_SATS + 333n + directSats;
    const fundraiserStx = stx(FUNDRAISER);
    const fundraiserSats = sats(FUNDRAISER);
    const recoupedAt = BigInt(simnet.burnBlockHeight);
    const result = recoup();

    expect(result.result).toBeOk(Cl.tuple({ stx: Cl.uint(totalStx), sats: Cl.uint(totalSats) }));
    expect(stx(FUNDRAISER)).toBe(fundraiserStx + totalStx);
    expect(sats(FUNDRAISER)).toBe(fundraiserSats + totalSats);
    expect(stx(contractId())).toBe(0n);
    expect(sats(contractId())).toBe(0n);
    expect(readOnly('get-claim')).toBeSome(
      Cl.tuple({
        to: Cl.principal(FUNDRAISER),
        'burn-height': Cl.uint(recoupedAt),
        description: Cl.stringAscii(''),
        stx: Cl.uint(totalStx),
        sats: Cl.uint(totalSats),
      }),
    );
    expect(status().claimed).toBeBool(true);
    expect(printed(result)).toEqual({
      event: Cl.stringAscii('recoup-reserve'),
      stx: Cl.uint(totalStx),
      sats: Cl.uint(totalSats),
    });
  });
});

describe('terminal claim guards', function () {
  it('returns u106 from every flow call after a release', function () {
    deposit();
    request();
    expect(release().result).toBeOk(Cl.tuple({ stx: Cl.uint(DEPOSIT_STX), sats: Cl.uint(DEPOSIT_SATS) }));

    expect(deposit().result).toBeErr(Cl.uint(106));
    expect(request(REPLACEMENT).result).toBeErr(Cl.uint(106));
    expect(release().result).toBeErr(Cl.uint(106));
    expect(recoup().result).toBeErr(Cl.uint(106));
  });

  it('returns u106 from every flow call after a recoup', function () {
    deposit();
    toBurn(deadline());
    expect(recoup().result).toBeOk(Cl.tuple({ stx: Cl.uint(DEPOSIT_STX), sats: Cl.uint(DEPOSIT_SATS) }));

    expect(deposit().result).toBeErr(Cl.uint(106));
    expect(request().result).toBeErr(Cl.uint(106));
    expect(release().result).toBeErr(Cl.uint(106));
    expect(recoup().result).toBeErr(Cl.uint(106));
  });
});

describe('contract-caller checks', function () {
  it('rejects proxy calls to deposit, request, and release', function () {
    const proxy = deployProxy();
    deposit();
    request();

    expect(simnet.callPublicFn(proxy, 'proxy-deposit', [], FUNDRAISER).result).toBeErr(Cl.uint(105));
    expect(simnet.callPublicFn(proxy, 'proxy-request', [], LAB).result).toBeErr(Cl.uint(101));
    expect(simnet.callPublicFn(proxy, 'proxy-release', [], owner()).result).toBeErr(Cl.uint(100));
    expect(readOnly('get-claim')).toBeNone();
  });

  it('rejects a proxy call to recoup after DEADLINE', function () {
    const proxy = deployProxy();
    deposit();
    toBurn(deadline());

    expect(simnet.callPublicFn(proxy, 'proxy-recoup', [], FUNDRAISER).result).toBeErr(Cl.uint(105));
    expect(readOnly('get-claim')).toBeNone();
  });
});
