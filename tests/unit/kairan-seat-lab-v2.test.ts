import { describe, expect, it } from 'vitest';
import { Cl, privateKeyToAddress } from '@stacks/transactions';
import { createHash } from 'node:crypto';

const CONTRACT = 'kairan-seat-lab-ocifarsito-v2';
const LAB = 'SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF';
const OCIFARSITO = 'SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q'; // UASU Inc.: never receives funds
const USDCX = 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx';
const SBTC = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const USDCX_WHALE = 'SP13JV946AF23WA94SVANA8D6VRTTYEWCJJ8Q5YMJ';
const SBTC_WHALE = 'SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
const FUNDRAISER = 'SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F';
const SEAT_URL = 'https://letafricabuild.com/journal/kairans-seat-1';
const POOL_URL = 'https://letafricabuild.com/journal/builder-fund-pool-kairan';
const TARGET = 2_000_000_000n;
const DEADLINE = 1_025_386;
const SEAT_WINDOW = 12_960;
const RSTX = 500_000_000n; // 500 STX from the fundraiser wallet
const RSATS = 30_000n;

function owner() {
  return simnet.deployer;
}

function wallet(n: number) {
  return simnet.getAccounts().get(`wallet_${n}`)!;
}

function contractId() {
  return `${owner()}.${CONTRACT}`;
}

function call(fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(CONTRACT, fn, args, sender);
}

function ro(fn: string, args: any[] = []): any {
  return simnet.callReadOnlyFn(CONTRACT, fn, args, owner()).result;
}

function status(): any {
  return ro('get-status').value;
}

function ft(token: string, who: string): bigint {
  return (simnet.callReadOnlyFn(token, 'get-balance', [Cl.principal(who)], owner()).result as any).value.value;
}

function usdcx(who: string) {
  return ft(USDCX, who);
}

function sats(who: string) {
  return ft(SBTC, who);
}

function stx(who: string): bigint {
  return simnet.getAssetsMap().get('STX')!.get(who) ?? 0n;
}

// Gives `who` USDCx from the whale so it can donate.
function fund(who: string, amount: bigint) {
  expect(
    simnet.callPublicFn(USDCX, 'transfer', [Cl.uint(amount), Cl.principal(USDCX_WHALE), Cl.principal(who), Cl.none()], USDCX_WHALE).result
  ).toBeOk(Cl.bool(true));
}

function sendUsdcx(from: string, to: string, amount: bigint) {
  expect(simnet.callPublicFn(USDCX, 'transfer', [Cl.uint(amount), Cl.principal(from), Cl.principal(to), Cl.none()], from).result).toBeOk(Cl.bool(true));
}

function donate(amount: bigint | number, sender: string, agree = true) {
  return call('donate', [Cl.uint(amount), Cl.bool(agree)], sender);
}

function give(amount: bigint, sender: string) {
  fund(sender, amount);
  return donate(amount, sender);
}

const BUILDER = 'Ada Builder (@ada_btc)';
const REPO = 'https://github.com/ada-btc/stacks-indexer';

function requestSeat(sender = LAB, builder = BUILDER, repo = REPO, grant = SEAT_URL, agree = true) {
  return call('request-seat', [Cl.stringAscii(builder), Cl.stringAscii(repo), Cl.stringAscii(grant), Cl.bool(agree)], sender);
}

function release(sender = owner()) {
  return call('release-seat', [], sender);
}

function claimReserve(url = POOL_URL, sender = LAB, agree = true) {
  return call('claim-reserve', [Cl.stringAscii(url), Cl.bool(agree)], sender);
}

function refundMany(who: string[], sender = wallet(4)) {
  return call('refund-many', [Cl.list(who.map((w) => Cl.principal(w)))], sender);
}

// Next tx sees burn-block-height = h.
function toBurn(h: number) {
  const n = h - simnet.burnBlockHeight;
  if (n > 0) simnet.mineEmptyBurnBlocks(n);
}

function newAddress(i: number): string {
  const key = createHash('sha256').update(`kairan-usdcx-donor-${i}`).digest('hex') + '01';
  return privateKeyToAddress(key, 'testnet');
}

function deployProxy() {
  const src = `
(define-public (proxy-request)
  (contract-call? '${contractId()} request-seat "evil" "https://evil.example" "https://evil.example" true))
(define-public (proxy-release)
  (contract-call? '${contractId()} release-seat))
(define-public (proxy-reserve)
  (contract-call? '${contractId()} claim-reserve "https://evil.example" true))
(define-public (proxy-deposit)
  (contract-call? '${contractId()} deposit-reserve u1 u0))
`;
  simnet.deployContract('kairan-proxy', src, { clarityVersion: 5 }, wallet(1));
  return `${wallet(1)}.kairan-proxy`;
}

function d0(): string {
  return ro('get-donor-terms').value;
}

function reserve(s = RSTX, b = RSATS) {
  return call('deposit-reserve', [Cl.uint(s), Cl.uint(b)], FUNDRAISER);
}

const OPEN =
  "Target: 2,000 USDCx for one Kairan's Seat, newly raised. " +
  'Reserve: the STX and sBTC raised for the first 10K in the fundraiser wallet SP12AVHNBR1K5BRAXP699V66CWK7PQTJJBT2H174F (about $200 at Oct 23, 2026 prices), which that wallet deposits once, in full minus STX network fees, into this contract with deposit-reserve; no one else can add to the reserve. ' +
  'Deadline: Bitcoin block 1,025,386 (about one year from Oct 23, 2026). ' +
  "Success: as soon as 2,000 USDCx is raised, LAB may claim it with a seat receipt naming the builder who takes Kairan's Seat, with links to their repo and to the grant post, crediting ocifarsito.com, plus the reserve as a bonus; gifts above the target are not accepted. " +
  'Once 2,000 USDCx is raised, LAB has about 90 days (12,960 Bitcoin blocks) to post the seat receipt and have the owner release the seat to LAB; if that does not happen, every USDCx gift is refunded in full to the wallet that sent it. ' +
  "Failure: if 2,000 USDCx is not raised by the deadline, each donor gets every USDCx gift back in full, to the wallet that sent it; refunds can be triggered by anyone in batches after the deadline, or after LAB's 90-day seat window if the seat was not claimed. " +
  'Reserve on failure: once refunds open, LAB may claim the reserve for the Builder Fund pool at any time, with no expiry; the reserve never goes to UASU Inc. ' +
  "No one, including UASU Inc. and the owner, can take or redirect donors' USDCx; the owner's only power is to release the seat to LAB after reviewing LAB's seat receipt. " +
  'The contract enforces all of this. ';

const RISKS = [
  "USDCx is a third-party token; its value, peg and availability are outside UASU's control, and refunds are paid in the same USDCx amount given, not in US dollars. ",
  "The STX and sBTC reserve is held as tokens and its value can go up or down; sBTC is a third-party token whose peg to bitcoin is outside UASU's control; LAB receives the reserve as tokens, whatever its value at claim, and UASU is not liable for any loss of value or depeg. ",
  'Smart contracts and blockchains carry technical risk; UASU is not liable for losses from bugs, network failures, wallet errors or lost keys, except as required by law. ',
  "LAB receives funds only at its wallet SP2RGCKAQH0ZZD0WEVB38H128DZ1M2S5V3ST871NF; LAB is solely responsible for that wallet's keys, and UASU Inc. does not guarantee against funds lost if LAB loses access to it. ",
  'Gifts are final except for the full USDCx refund if LAB does not claim the seat in time. ',
  'This contract runs as-is, with no warranty of any kind. ',
  'If 2,000 USDCx is not raised by the deadline, or LAB does not claim the seat within its 90-day window, anyone may trigger the refunds in batches, and every USDCx gift made through this contract is returned in full to the wallet that sent it. ',
  'on-chain, which is the official record; ocifarsito.com/kairans-seat also shows them, on a best-effort basis with no guarantee of service',
  'UASU Inc. (a Delaware corporation, operating as Ocifarsito)',
];

function newDonors(n: number, tag = 'a'): string[] {
  return Array.from({ length: n }, (_v, i) => newAddress(i + (tag === 'a' ? 0 : 10_000)));
}

describe('kairan-seat-lab-ocifarsito-v2 (USDCx + reserve, no owner power over funds)', function () {
  it('terms: plain opening lines, protections, risk lines, no emergency, Delaware last', function () {
    const t: string = ro('get-terms').value;
    const d: string = ro('get-donor-terms').value;
    for (const x of [t, d]) {
      expect(x.startsWith(OPEN)).toBe(true);
      for (const part of RISKS) expect(x).toContain(part);
      expect(x).not.toMatch(/emergency|freeze/i);
      expect(x).not.toContain('100 distinct donors');
      expect(x).toMatch(/These terms are governed by the laws of the State of Delaware, USA, and any dispute is resolved only in the courts of Delaware\.$/);
      expect(/^[\x20-\x7e]*$/.test(x)).toBe(true);
    }
    for (const part of [
      'RunThrough USA',
      'for safety',
      'Run proofs are posted on ocifarsito.com and on X on a best-effort basis, with no guarantee of service. ',
      'LAB posts the seat receipt and accepts these terms; the owner then releases the seat to LAB after reviewing it. ',
      "The seat receipt is the name or handle of the builder who takes Kairan's Seat, a link to their repo, and a link to LAB's public post announcing the grant (amount and what it funds, crediting ocifarsito.com). ",
      'can only happen once refunds open, if LAB did not claim the seat',
      'announced as holding "Kairan\'s Seat", with ocifarsito.com credited',
      'USDCx sent to the contract without donate is not refundable and goes to LAB with its claim. ',
      "This contract funds one Kairan's Seat; the next seat uses a new contract. ",
      'Each quarter, LAB publishes a Builder Fund report',
      'UASU Inc. (Ocifarsito) only raises and forwards gifts; once LAB claims, LAB alone is responsible for how those funds are used, and UASU Inc. has no liability for it. ',
    ])
      expect(t).toContain(part);
    for (const part of [
      'Gifts are voluntary. ',
      'may not exceed the amount still needed',
      'Reserve deposits and USDCx sent straight to the contract are not gifts',
      'Gifts are not tax-deductible: UASU Inc. is a for-profit company and Let Africa Build (LAB) is not a US 501(c)(3) charity. ',
      'Donors receive no goods or services in return for a gift. ',
    ])
      expect(d).toContain(part);
  });

  it('donate: terms, zero, capped at the remaining amount, books donors, prints donor + amount', function () {
    const a = wallet(1), b = wallet(2);
    fund(a, TARGET + 10n);
    expect(donate(1, a, false).result).toBeErr(Cl.uint(103));
    expect(donate(0, a).result).toBeErr(Cl.uint(102));
    expect(donate(TARGET + 1n, a).result).toBeErr(Cl.uint(110));
    const r = donate(1_500_000_000n, a);
    expect(r.result).toBeOk(Cl.uint(1_500_000_000n));
    const ev = r.events.find((e: any) => e.event === 'print_event').data.value.value;
    expect(ev.donor).toBePrincipal(a);
    expect(ev.amount).toBeUint(1_500_000_000n);
    expect(donate(500_000_001n, a).result).toBeErr(Cl.uint(110));
    expect(donate(100_000_000n, a).result).toBeOk(Cl.uint(1_600_000_000n));
    expect(give(400_000_000n, b).result).toBeOk(Cl.uint(TARGET));
    expect(donate(1, a).result).toBeErr(Cl.uint(110));
    expect(ro('get-donor', [Cl.principal(a)])).toBeSome(Cl.uint(1_600_000_000n));
    const s = status();
    expect(s.total).toBeUint(TARGET);
    expect(s.unrefunded).toBeUint(TARGET);
    expect(s.remaining).toBeUint(0);
    expect(s.deadline).toBeUint(DEADLINE);
    const reached = Number(s['reached-at'].value.value);
    expect(s['failure-at']).toBeUint(reached + SEAT_WINDOW); // target reached: 90-day seat window
    expect(s['refunds-open']).toBeBool(false);
    expect(s.closed).toBeBool(false);
  });

  it('deposit-reserve: FUNDRAISER only, once, non-zero, before DEADLINE; contract-caller checked', function () {
    expect(call('deposit-reserve', [Cl.uint(1), Cl.uint(0)], wallet(1)).result).toBeErr(Cl.uint(105));
    expect(call('deposit-reserve', [Cl.uint(1), Cl.uint(0)], owner()).result).toBeErr(Cl.uint(105));
    const p = deployProxy();
    expect(simnet.callPublicFn(p, 'proxy-deposit', [], FUNDRAISER).result).toBeErr(Cl.uint(105));
    expect(reserve(0n, 0n).result).toBeErr(Cl.uint(102));
    expect(reserve().result).toBeOk(Cl.bool(true));
    expect(reserve(1n, 0n).result).toBeErr(Cl.uint(111));
    const s = status();
    expect(s['reserve-stx']).toBeUint(RSTX);
    expect(s['reserve-sats']).toBeUint(RSATS);
    expect(s['reserve-deposited']).toBeBool(true);
    expect(s.total).toBeUint(0);
  });

  it('deposit-reserve after DEADLINE -> u113; one asset alone is fine', function () {
    toBurn(DEADLINE);
    expect(reserve().result).toBeErr(Cl.uint(113));
  });

  it('request-seat: LAB only, accepts TERMS, needs the target and 3 non-empty fields; a new request replaces the old', function () {
    const a = wallet(1);
    expect(requestSeat().result).toBeErr(Cl.uint(109));
    expect(release().result).toBeErr(Cl.uint(107));
    give(TARGET, a);
    for (const who of [a, owner(), OCIFARSITO, FUNDRAISER]) expect(requestSeat(who).result).toBeErr(Cl.uint(101));
    expect(requestSeat(LAB, BUILDER, REPO, SEAT_URL, false).result).toBeErr(Cl.uint(103));
    expect(requestSeat(LAB, '').result).toBeErr(Cl.uint(104));
    expect(requestSeat(LAB, BUILDER, '').result).toBeErr(Cl.uint(104));
    expect(requestSeat(LAB, BUILDER, REPO, '').result).toBeErr(Cl.uint(104));
    expect(release().result).toBeErr(Cl.uint(107));
    expect(requestSeat(LAB, BUILDER, REPO, 'https://letafricabuild.com/typo').result).toBeOk(Cl.bool(true));
    const r = requestSeat();
    expect(r.result).toBeOk(Cl.bool(true)); // replaces the typo
    expect(r.events.find((e: any) => e.event === 'print_event').data.value.value['terms-hash'].type).toBe('buffer');
    expect(ro('get-seat-request')).toBeSome(
      Cl.tuple({ builder: Cl.stringAscii(BUILDER), repo: Cl.stringAscii(REPO), grant: Cl.stringAscii(SEAT_URL) })
    );
    expect(usdcx(contractId())).toBe(TARGET); // a request moves no funds
  });

  it('SUCCESS: LAB gets 2,000 USDCx + any direct USDCx + the whole reserve; nothing to Ocifarsito; closed for good', function () {
    const a = wallet(1), b = wallet(2);
    expect(reserve().result).toBeOk(Cl.bool(true));
    give(1_200_000_000n, a);
    give(800_000_000n, b);
    fund(a, 7_777n);
    sendUsdcx(a, contractId(), 7_777n);
    simnet.transferSTX(1_000, contractId(), a); // direct STX joins the reserve
    expect(release().result).toBeErr(Cl.uint(107)); // no receipt yet
    requestSeat();
    for (const who of [LAB, a, OCIFARSITO, FUNDRAISER]) expect(release(who).result).toBeErr(Cl.uint(100));
    const l = { u: usdcx(LAB), s: stx(LAB), b: sats(LAB) };
    const oU = usdcx(OCIFARSITO);
    const ownerU = usdcx(owner());
    expect(release().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(TARGET + 7_777n), stx: Cl.uint(RSTX + 1_000n), sats: Cl.uint(RSATS) }));
    expect(usdcx(LAB) - l.u).toBe(TARGET + 7_777n); // direct USDCx goes to LAB with its claim
    expect(stx(LAB) - l.s).toBe(RSTX + 1_000n);
    expect(sats(LAB) - l.b).toBe(RSATS);
    expect(usdcx(OCIFARSITO) - oU).toBe(0n);
    expect(usdcx(owner()) - ownerU).toBe(0n); // release pays only LAB
    expect(usdcx(contractId())).toBe(0n);
    expect(stx(contractId())).toBe(0n);
    expect(sats(contractId())).toBe(0n);
    const c = ro('get-claim').value.value;
    expect(c.kind).toBeAscii('seat');
    expect(c.builder).toBeAscii(BUILDER);
    expect(c.repo).toBeAscii(REPO);
    expect(c.link).toBeAscii(SEAT_URL);
    expect(status().closed).toBeBool(true);
    expect(release().result).toBeErr(Cl.uint(106));
    expect(give(1n, wallet(3)).result).toBeErr(Cl.uint(106));
    expect(requestSeat().result).toBeErr(Cl.uint(106));
    toBurn(DEADLINE);
    expect(refundMany([a, b]).result).toBeErr(Cl.uint(114));
    expect(claimReserve().result).toBeErr(Cl.uint(106));
  });

  it('seat window: claim at reached-at + 12959 succeeds', function () {
    reserve();
    give(TARGET, wallet(1));
    const reached = Number(status()['reached-at'].value.value);
    expect(status()['failure-at']).toBeUint(reached + SEAT_WINDOW);
    requestSeat();
    toBurn(reached + SEAT_WINDOW - 1);
    expect(refundMany([wallet(1)]).result).toBeErr(Cl.uint(112)); // window still open
    expect(release().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(TARGET), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
  });

  it('seat window over (target reached early): seat path closes, refunds open BEFORE DEADLINE, LAB may claim the reserve', function () {
    const a = wallet(1), b = wallet(2);
    reserve();
    give(1_500_000_000n, a);
    give(500_000_000n, b);
    const reached = Number(status()['reached-at'].value.value);
    requestSeat();
    toBurn(reached + SEAT_WINDOW);
    expect(simnet.burnBlockHeight < DEADLINE).toBe(true);
    expect(release().result).toBeErr(Cl.uint(113));
    expect(requestSeat().result).toBeErr(Cl.uint(113));
    expect(status()['refunds-open']).toBeBool(true);
    const a0 = usdcx(a), b0 = usdcx(b);
    expect(refundMany([a, b, a]).result).toBeOk(Cl.uint(TARGET));
    expect(usdcx(a) - a0).toBe(1_500_000_000n);
    expect(usdcx(b) - b0).toBe(500_000_000n);
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(0), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
    expect(status().closed).toBeBool(true);
  });

  it('target reached late (DEADLINE - 10) still gets its full 90 days past DEADLINE', function () {
    const a = wallet(1);
    reserve();
    give(TARGET - 1n, a);
    toBurn(DEADLINE - 10);
    expect(give(1n, wallet(2)).result).toBeOk(Cl.uint(TARGET));
    const reached = DEADLINE - 10;
    expect(status()['reached-at']).toBeSome(Cl.uint(reached));
    expect(status()['failure-at']).toBeUint(reached + SEAT_WINDOW);
    toBurn(DEADLINE + 100);
    expect(refundMany([a]).result).toBeErr(Cl.uint(112)); // past DEADLINE, window still open
    expect(claimReserve().result).toBeErr(Cl.uint(112));
    expect(requestSeat().result).toBeOk(Cl.bool(true));
    toBurn(reached + SEAT_WINDOW - 1);
    expect(release().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(TARGET), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
  });

  it('target reached late, seat not claimed: refunds and the reserve claim open at the end of the seat window', function () {
    const a = wallet(1);
    reserve();
    toBurn(DEADLINE - 10);
    give(TARGET, a);
    const fail = DEADLINE - 10 + SEAT_WINDOW;
    toBurn(fail - 1);
    expect(claimReserve().result).toBeErr(Cl.uint(112));
    toBurn(fail);
    expect(release().result).toBeErr(Cl.uint(113));
    const a0 = usdcx(a);
    expect(refundMany([a]).result).toBeOk(Cl.uint(TARGET));
    expect(usdcx(a) - a0).toBe(TARGET);
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(0), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
    expect(status().closed).toBeBool(true);
  });

  it('DEADLINE boundaries: donations stop exactly at it; refunds and the reserve claim open exactly at it', function () {
    const a = wallet(1);
    fund(a, 1_000_000n);
    reserve();
    toBurn(DEADLINE - 1);
    expect(donate(500_000n, a).result).toBeOk(Cl.uint(500_000n));
    expect(claimReserve().result).toBeErr(Cl.uint(112));
    expect(refundMany([a]).result).toBeErr(Cl.uint(112));
    toBurn(DEADLINE);
    expect(donate(500_000n, a).result).toBeErr(Cl.uint(113));
    for (const who of [owner(), a, OCIFARSITO, FUNDRAISER]) expect(claimReserve(POOL_URL, who).result).toBeErr(Cl.uint(101));
    expect(claimReserve(POOL_URL, LAB, false).result).toBeErr(Cl.uint(103));
    expect(claimReserve('').result).toBeErr(Cl.uint(104));
    const l = { s: stx(LAB), b: sats(LAB) };
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(0), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
    expect(stx(LAB) - l.s).toBe(RSTX);
    expect(sats(LAB) - l.b).toBe(RSATS);
    expect(ro('get-claim').value.value.kind).toBeAscii('reserve');
    expect(claimReserve().result).toBeErr(Cl.uint(106));
    expect(status().closed).toBeBool(false); // refund still due
    const a0 = usdcx(a);
    expect(refundMany([a]).result).toBeOk(Cl.uint(500_000n));
    expect(usdcx(a) - a0).toBe(500_000n);
    expect(status().closed).toBeBool(true);
    expect(refundMany([a, a]).result).toBeOk(Cl.uint(0)); // double refund: no-op
  });

  it('reserve has no expiry: LAB claims it long after failure-at, with any direct USDCx; refunds never reduced; nothing to Ocifarsito', function () {
    const a = wallet(1);
    give(3_000_000n, a);
    reserve();
    fund(wallet(3), 11n);
    sendUsdcx(wallet(3), contractId(), 11n); // direct, not a gift
    toBurn(DEADLINE + 200_000);
    const o = { s: stx(OCIFARSITO), b: sats(OCIFARSITO), u: usdcx(OCIFARSITO) };
    const l = { s: stx(LAB), b: sats(LAB), u: usdcx(LAB) };
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(11n), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
    expect(usdcx(LAB) - l.u).toBe(11n);
    expect(stx(LAB) - l.s).toBe(RSTX);
    expect(sats(LAB) - l.b).toBe(RSATS);
    expect(stx(OCIFARSITO) - o.s).toBe(0n);
    expect(sats(OCIFARSITO) - o.b).toBe(0n);
    expect(usdcx(OCIFARSITO) - o.u).toBe(0n);
    expect(usdcx(contractId())).toBe(3_000_000n); // the gift stays for its refund
    const a0 = usdcx(a);
    expect(refundMany([a]).result).toBeOk(Cl.uint(3_000_000n)); // refunds never expire
    expect(usdcx(a) - a0).toBe(3_000_000n);
    expect(status().closed).toBeBool(true);
  });

  it('FAILURE with 250 donors: refunds in 3 calls (100, 100, 50), duplicates refunded once, claim-reserve takes only the direct USDCx', function () {
    const N = 250;
    const donors = newDonors(N);
    const gift = (i: number) => BigInt(1_000_000 + i * 10_000) + (i === 7 ? 5n : 0n);
    let book = 0n;
    for (let i = 0; i < N; i++) {
      const amt = BigInt(1_000_000 + i * 10_000);
      expect(give(amt, donors[i]).result.type).toBe('ok');
      book += amt;
    }
    expect(give(5n, donors[7]).result.type).toBe('ok');
    book += 5n;
    fund(wallet(1), 4_242n);
    sendUsdcx(wallet(1), contractId(), 4_242n);
    reserve();
    expect(refundMany(donors.slice(0, 100)).result).toBeErr(Cl.uint(112));
    toBurn(DEADLINE);
    const lU = usdcx(LAB);
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(4_242n), stx: Cl.uint(RSTX), sats: Cl.uint(RSATS) }));
    expect(usdcx(LAB) - lU).toBe(4_242n); // only the direct transfer
    expect(usdcx(contractId())).toBe(book); // every gift still owed
    const before = donors.map(usdcx);
    const calls = [donors.slice(0, 100), donors.slice(100, 200), donors.slice(200, 250)];
    let left = book;
    calls.forEach(function (batch, k) {
      const want = batch.reduce((acc, _d, j) => acc + gift(k * 100 + j), 0n);
      expect(refundMany(batch, k === 1 ? SBTC_WHALE : wallet(4)).result).toBeOk(Cl.uint(want));
      left -= want;
      expect(status().unrefunded).toBeUint(left);
      expect(status().closed).toBeBool(left === 0n);
    });
    expect(refundMany([donors[7], donors[7], donors[0], donors[249]]).result).toBeOk(Cl.uint(0));
    for (let i = 0; i < N; i++) {
      expect(usdcx(donors[i]) - before[i]).toBe(gift(i));
      expect(ro('get-donor', [Cl.principal(donors[i])])).toBeSome(Cl.uint(0));
    }
    expect(refundMany([wallet(5), LAB]).result).toBeOk(Cl.uint(0));
    expect(usdcx(contractId())).toBe(0n);
  });

  it('refund-many before the reserve claim; a donor listed twice is refunded once; a direct transfer never reduces a refund', function () {
    const a = wallet(1), b = wallet(2);
    give(3_000_000n, a);
    give(2_000_000n, b);
    toBurn(DEADLINE);
    expect(refundMany([b, b]).result).toBeOk(Cl.uint(2_000_000n));
    fund(wallet(3), 9n);
    sendUsdcx(wallet(3), contractId(), 9n);
    expect(refundMany([a, b]).result).toBeOk(Cl.uint(3_000_000n)); // direct USDCx never reduces a refund
    expect(status().unrefunded).toBeUint(0);
    expect(status().closed).toBeBool(false); // reserve claim still open for LAB
    expect(claimReserve().result).toBeOk(Cl.tuple({ usdcx: Cl.uint(9n), stx: Cl.uint(0), sats: Cl.uint(0) }));
    expect(status().closed).toBeBool(true);
  });

  it('OWNER has no power over funds: no withdraw function, proxies cannot act as LAB / OWNER / FUNDRAISER', function () {
    const iface = simnet.getContractsInterfaces().get(contractId())!;
    const names = iface.functions.filter((f: any) => f.access === 'public').map((f: any) => f.name).sort();
    expect(names).toEqual(['claim-reserve', 'deposit-reserve', 'donate', 'refund-many', 'release-seat', 'request-seat']);
    give(TARGET, wallet(2));
    const p = deployProxy();
    expect(simnet.callPublicFn(p, 'proxy-request', [], LAB).result).toBeErr(Cl.uint(101));
    requestSeat();
    expect(simnet.callPublicFn(p, 'proxy-release', [], owner()).result).toBeErr(Cl.uint(100));
    toBurn(DEADLINE);
    expect(simnet.callPublicFn(p, 'proxy-reserve', [], LAB).result).toBeErr(Cl.uint(101));
    expect(status().claim).toBeNone();
  });
});
