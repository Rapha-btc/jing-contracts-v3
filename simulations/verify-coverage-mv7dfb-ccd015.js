// verify-coverage-mv7dfb-ccd015.js - stxer mainnet fork of
// ccd015-redemption-book-mia-stx from its deploy bytes (citycoins-protocol
// 8bfbb5f, full-line comments dropped: deploy-bytes-mv7dfb/), deployed under
// the CityCoins DAO. Real MIA v2 holders place, change and cancel offers; the
// book crosses with real STX and burns the MIA it buys.
// Covers every public function and the error arms: DAO gate, par unset,
// min deposit, max per tx, ask range, above par, duplicate, not found, pause,
// sorted insert (both arms), partial frontier fill, zero-take frontier,
// book full (eviction of the worst and refusal of a worse one), no budget,
// no fill.
// Fixtures: base-dao Extensions map-set for a proxy that plays a passed
// proposal; one var-set of par-scaled DOWN (the treasury cannot shrink on a
// fork) to make every offer above par for the no-fill arm.
// Run: node simulations/verify-coverage-mv7dfb-ccd015.js
import { session, bytes, sweepReadOnly, Cl, ClarityVersion, U, ok, P, mk, stxOf, STX_WHALE, STX } from './_mv7dfb-session.mjs';

const DAO = 'SP8A9HZ3PKST0S42VM9523Z9NV42SZ026V4K39WH';
const BOOK = `${DAO}.ccd015-redemption-book-mia-stx`, PROXY = `${DAO}.sim-ccip-proxy-015`, BASE_DAO = `${DAO}.base-dao`;
const MIA = 'SP1H1733V5MZ3SZ9XRW9FKYGEZT0JDGEB8Y634C7R.miamicoin-token-v2';
const H1 = 'SP3HXJJMJQ06GNAZ8XWDN1QM48JEDC6PP6W3YZPZJ', H2 = 'SP22WH53NS94VR6N145ZX77BK4S0EWFBE41VW3Z6B', H3 = 'SP1FJ0MY8M18KZF43E85WJN48SDXYS1EC4BCQW02S';
const STRANGER = mk(651);
const M = 1_000_000n; // micro MIA per MIA
const miaOf = (w) => `(unwrap-panic (contract-call? '${MIA} get-balance '${w}))`;

const S = session('coverage-mv7dfb-ccd015');
const { tx, ev, read, fixture } = S;
await S.start({ name: 'ccd015-redemption-book-mia-stx', body: bytes('ccd015-redemption-book-mia-stx'), version: ClarityVersion.Clarity5, sender: DAO });
await S.deploy('sim-ccip-proxy-015', `
(define-public (update-par) (contract-call? '${BOOK} update-par))
(define-public (pause (p bool)) (contract-call? '${BOOK} set-paused p))
(define-public (min (a uint)) (contract-call? '${BOOK} set-min-deposit a))
`, ClarityVersion.Clarity5, DAO, 'sim-only proxy playing a passed CCIP proposal');
await tx('callback is a no-op (ok true)', STRANGER, BOOK, 'callback', [P(STRANGER), Cl.buffer(Buffer.alloc(1))], '(ok true)');
await tx('is-dao-or-extension for a stranger -> u15000', STRANGER, BOOK, 'is-dao-or-extension', [], '(err u15000)');
await tx('update-par by a stranger -> u15000', STRANGER, BOOK, 'update-par', [], '(err u15000)');
await tx('proxy before the vote -> u15000', STRANGER, PROXY, 'pause', [Cl.bool(true)], '(err u15000)');
await tx('place-offer before par is set -> u15011', H1, BOOK, 'place-offer', [Cl.uint(200_000n * M), Cl.uint(1)], '(err u15011)');
await tx('cross-book with no budget -> u15010', STRANGER, BOOK, 'cross-book', [], '(err u15010)');
await S.sendStx('1 STX into the book', STX_WHALE, BOOK, STX);
await tx('cross-book with budget but par unset -> u15011', STRANGER, BOOK, 'cross-book', [], '(err u15011)');
await fixture('base-dao set-extensions: the proposal proxy enabled', BASE_DAO, `(begin (map-set Extensions '${PROXY} true) (is-extension '${PROXY}))`, 'true');
await tx('proxy update-par: par = treasury STX / MIA supply', STRANGER, PROXY, 'update-par', [], ok);
const par = await read('(get-par-scaled)', BOOK);
await ev('par matches calculate-par', BOOK, '(calculate-par)', `(some u${par})`);
S.check('par > 0', String(par), () => par > 0n);
const parAsk = (amt) => (amt * par) / 100_000_000n; // the highest ask at or below par
await tx('set-min-deposit 0 -> u15001', STRANGER, PROXY, 'min', [Cl.uint(0)], '(err u15001)');

// ---- place-offer guards ---------------------------------------------------------------
const A1 = 200_000n * M;
await tx('below the 100k MIA minimum -> u15005', H1, BOOK, 'place-offer', [Cl.uint(99_999n * M), Cl.uint(1)], '(err u15005)');
await tx('over 10M MIA per tx -> u15001', H1, BOOK, 'place-offer', [Cl.uint(10_000_001n * M), Cl.uint(1)], '(err u15001)');
await tx('ask 0 -> u15001', H1, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(0)], '(err u15001)');
await tx('ask over MAX_ASK -> u15001', H1, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(1_000_000_000_000_001n)], '(err u15001)');
await tx('ask above par -> u15008', H1, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(parAsk(A1) + 1n)], '(err u15008)');
const h1m0 = await read(miaOf(H1), BOOK);
await tx('H1 places 200k MIA at par', H1, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(parAsk(A1))], '(ok true)');
await ev('H1 MIA moved into the book', BOOK, `{ h: ${miaOf(H1)}, b: ${miaOf(BOOK)} }`, `(tuple (b u${A1}) (h u${h1m0 - A1}))`);
await tx('H1 second offer -> u15004', H1, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(1)], '(err u15004)');
// sorted insert: H2 better (cheaper per MIA) goes first, H3 worse goes last
await tx('H2 places 100k MIA at 90% of par (best price: inserted first)', H2, BOOK, 'place-offer', [Cl.uint(100_000n * M), Cl.uint((parAsk(100_000n * M) * 90n) / 100n)], '(ok true)');
await tx('H3 places 300k MIA at 99% of par (between)', H3, BOOK, 'place-offer', [Cl.uint(300_000n * M), Cl.uint((parAsk(300_000n * M) * 99n) / 100n)], '(ok true)');
const book0 = await S.evRaw(BOOK, '(get-offer-book)');
S.check('book order H2, H3, H1 (insert-step both arms)', book0, (v) => v.indexOf(H2) < v.indexOf(H3) && v.indexOf(H3) < v.indexOf(H1));
await ev('get-offer H3', BOOK, `(get-offer '${H3})`, (v) => v.includes(`(amount u${300_000n * M})`));
await ev('get-book-totals', BOOK, '(get-book-totals)', (v) => v.includes(`(amount u${600_000n * M})`));
await ev('get-offer-count 3', BOOK, '(get-offer-count)', 'u3');

// ---- change-offer --------------------------------------------------------------------
await tx('change-offer with no offer -> u15002', STRANGER, BOOK, 'change-offer', [Cl.none(), Cl.uint(1)], '(err u15002)');
await tx('change-offer ask 0 -> u15001', H1, BOOK, 'change-offer', [Cl.none(), Cl.uint(0)], '(err u15001)');
await tx('change-offer above par -> u15008', H1, BOOK, 'change-offer', [Cl.none(), Cl.uint(parAsk(A1) + 1n)], '(err u15008)');
await tx('change-offer over 10M MIA -> u15001', H1, BOOK, 'change-offer', [Cl.some(Cl.uint(10_000_000n * M)), Cl.uint(1)], '(err u15001)');
await tx('H1 adds 50k MIA and drops its ask to 80% of par (moves first)', H1, BOOK, 'change-offer', [Cl.some(Cl.uint(50_000n * M)), Cl.uint((parAsk(250_000n * M) * 80n) / 100n)], '(ok true)');
S.check('H1 moved to the front', await S.evRaw(BOOK, '(get-offer-book)'), (v) => v.indexOf(H1) < v.indexOf(H2));
await tx('H1 re-prices at par with no add (moves last)', H1, BOOK, 'change-offer', [Cl.none(), Cl.uint(parAsk(250_000n * M))], '(ok true)');
await tx('proxy raises the minimum to 260k MIA', STRANGER, PROXY, 'min', [Cl.uint(260_000n * M)], ok);
await tx('change-offer now below the minimum -> u15005', H1, BOOK, 'change-offer', [Cl.none(), Cl.uint(1)], '(err u15005)');
await tx('proxy minimum back to 100k MIA', STRANGER, PROXY, 'min', [Cl.uint(100_000n * M)], ok);

// ---- pause ---------------------------------------------------------------------------
await tx('proxy pauses the book', STRANGER, PROXY, 'pause', [Cl.bool(true)], ok);
await tx('paused: place-offer -> u15007', STRANGER, BOOK, 'place-offer', [Cl.uint(A1), Cl.uint(1)], '(err u15007)');
await tx('paused: change-offer -> u15007', H1, BOOK, 'change-offer', [Cl.none(), Cl.uint(1)], '(err u15007)');
await tx('paused: cross-book -> u15007', STRANGER, BOOK, 'cross-book', [], '(err u15007)');
await tx('cancel-offer works while paused (owners can always leave): H3', H3, BOOK, 'cancel-offer', [], '(ok true)');
await tx('cancel-offer again -> u15002', H3, BOOK, 'cancel-offer', [], '(err u15002)');
await tx('proxy unpauses', STRANGER, PROXY, 'pause', [Cl.bool(false)], ok);

// ---- cross-book: zero-take frontier, then a partial frontier, then full fills -------------
// book: H2 (100k @ 90% par), H1 (250k @ par). Budget 1 STX < H2 ask, and 1 STX buys
// floor(100k MIA * 1 STX / ask) > 0 of H2 -> partial fill on the first entry.
const ask2 = (parAsk(100_000n * M) * 90n) / 100n;
const ask1 = parAsk(250_000n * M);
S.notes.push(`asks: H2 ${ask2} uSTX for 100k MIA, H1 ${ask1} uSTX for 250k MIA; par ${par}`);
const sup0 = await read(`(unwrap-panic (contract-call? '${MIA} get-total-supply))`, BOOK);
const h2s0 = await read(stxOf(H2), BOOK);
const c1 = await tx('cross-book with 1 STX: partial fill of the best offer, MIA burned', STRANGER, BOOK, 'cross-book', [], (v) => ok(v));
const taken1 = (100_000n * M * STX) / ask2;
S.check('partial: spent 1 STX, acquired = amount x budget / ask', c1.result, `(ok (tuple (acquired u${taken1}) (spent u${STX})))`);
await ev('H2 paid 1 STX; MIA supply burned by the acquired amount', BOOK, `{ h: ${stxOf(H2)}, s: (unwrap-panic (contract-call? '${MIA} get-total-supply)) }`, `(tuple (h u${h2s0 + STX}) (s u${sup0 - taken1}))`);
await ev('H2 offer shrank to the rest at the rest of the ask', BOOK, `(get-offer '${H2})`, (v) => v.includes(`(amount u${100_000n * M - taken1})`) && v.includes(`(ustx u${ask2 - STX})`));
// the taken = 0 frontier arm needs ask/amount > 1 uSTX per micro-MIA, which
// at-or-below-par forbids while treasury uSTX / supply < 1 (about 0.006 here)
S.notes.push('settle-step taken = 0 arm: unreachable while par (uSTX per micro-MIA) < 1');
await S.sendStx(`fund the book for both offers`, STX_WHALE, BOOK, ask1 + ask2);
const b0 = await read(stxOf(BOOK), BOOK);
const c2 = await tx('cross-book fills H2 then H1 in full', STRANGER, BOOK, 'cross-book', [], ok);
S.check('full: spent = both remaining asks', c2.result, `(ok (tuple (acquired u${100_000n * M - taken1 + 250_000n * M}) (spent u${ask2 - STX + ask1})))`);
await ev('book empty, the rest of the budget stays', BOOK, `{ n: (get-offer-count), b: ${stxOf(BOOK)} }`, `(tuple (b u${b0 - (ask2 - STX + ask1)}) (n u0))`);
await ev('info: totals burned and spent', BOOK, '(get-info)', (v) => v.includes(`(total-burned-mia u${taken1 + 100_000n * M - taken1 + 250_000n * M})`));

// ---- book full: 50 offers, the 51st better one evicts the worst ------------------------------
await tx('proxy minimum to 1 MIA', STRANGER, PROXY, 'min', [Cl.uint(M)], ok);
const askN = (i) => (parAsk(10n * M) * BigInt(50 + i)) / 100n; // 10 MIA each, 50%..99% of par
for (let i = 0; i < 50; i++) {
  const w = mk(1000 + i);
  await tx(`seed ${w.slice(0, 6)} with 10 MIA`, H1, MIA, 'transfer', [Cl.uint(10n * M), P(H1), P(w), Cl.none()], '(ok true)');
  await tx(`offer ${i + 1}/50 at ${50 + i}% of par`, w, BOOK, 'place-offer', [Cl.uint(10n * M), Cl.uint(askN(i))], '(ok true)');
}
await ev('book holds 50 offers', BOOK, '(get-offer-count)', 'u50');
const late = mk(1099);
await tx('seed a 51st holder', H1, MIA, 'transfer', [Cl.uint(20n * M), P(H1), P(late), Cl.none()], '(ok true)');
await tx('51st offer no better than the worst -> u15003', late, BOOK, 'place-offer', [Cl.uint(10n * M), Cl.uint(askN(49))], '(err u15003)');
const worst = mk(1049);
const w0 = await read(miaOf(worst), BOOK);
await tx('51st offer better than the worst: evicts it (refund) and takes a seat', late, BOOK, 'place-offer', [Cl.uint(10n * M), Cl.uint(askN(0) - 1n)], '(ok true)');
await ev('the evicted worst offer was refunded its 10 MIA', BOOK, miaOf(worst), `u${w0 + 10n * M}`);
await ev('still 50 offers, the newcomer first', BOOK, '(get-offer-count)', 'u50');
S.check('newcomer at the front', await S.evRaw(BOOK, '(element-at? (get-offer-book) u0)'), (v) => v.includes(late));
// ---- no fill: par moves below every offer ------------------------------------------------
await fixture('par-scaled set to 1 (every offer now above par; the treasury cannot shrink on a fork)', BOOK, '(begin (var-set par-scaled u1) (var-get par-scaled))', 'u1');
await tx('cross-book with every offer above par -> u15006 (kept arm)', STRANGER, BOOK, 'cross-book', [], '(err u15006)');
await tx('place-offer at par 1 -> above par u15008', late, BOOK, 'place-offer', [Cl.uint(10n * M), Cl.uint(1)], '(err u15008)');
await tx('proxy update-par restores the real par', STRANGER, PROXY, 'update-par', [], ok);
await tx('cancel-offer by an offer owner refunds', mk(1000), BOOK, 'cancel-offer', [], '(ok true)');
S.notes.push(`read-only sweep: ${await sweepReadOnly(S, BOOK, bytes('ccd015-redemption-book-mia-stx'), [{ principal: late, uint: 10n * M }, { principal: mk(1001), uint: 1 }])} calls`);
S.done();
