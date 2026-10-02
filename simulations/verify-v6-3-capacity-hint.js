// Fork only. Run: node simulations/verify-v6-3-capacity-hint.js
// (a current print comes from PYTH_API_KEY or the faktory backend fallback)
//
// markets-sbtc-stx-jing-v6-3 since ee2edde: `get-taker-capacity` takes an
// optional update and quotes gross-cap at that update's rebate rate.
// `capacity-rebate-hint` decodes the update WITHOUT verifying it (a sizing
// hint; `swap` verifies the signed envelope) and falls back to the
// historical 20 bps quote when the hint is missing or undecodable. The
// existing suites only pass real, decodable updates, so the six `none`
// arms of the hint were never taken. This suite takes each of them.
//
// Unmodified working-tree core-v6 / ladder-v1 / market v6-3 / router v5-3
// at the tip. One bid rests on the y side; a probe contract reads
// get-taker-capacity inside a transaction (so the stxer trace records it)
// for an sBTC seller, with:
//   none                         the 20 bps quote (the reference tuple)
//   a real signed update from sim c014c741 (block 8984873, two weeks old
//   at the tip): rebate-bps u70 (age >= 80 s), gross-cap grossed up at
//   70 bps, a different tuple
//   and six hints built from that same update's bytes, each one taking a
//   different `none` arm (the hint is unverified by design, so unsigned
//   bytes are a valid input to this read-only; `swap` would refuse them):
//     10 bytes                     slice? u71 fails            L3940
//     71 + 20 garbage bytes        decoder: bad payload magic  L3941
//     feed 1 renumbered 99         feed x not found            L3943
//     feed 45 renumbered 98        feed y not found            L3944
//     feed 1 timestamp flag 0      x feed-update-timestamp none L3945
//     feed 45 timestamp flag 0     y feed-update-timestamp none L3946
//   each must return exactly the 20 bps reference tuple.
import { getSimulationResult } from 'stxer';
import { uintCV, noneCV, someCV, bufferCV, boolCV, deserializeTransaction } from '@stacks/transactions';
import {
  DEP, MARKET, H, check, ev, evRaw, tx, fund, deployAll, initMarket, printAfter, forkClock,
  fields, mk, traits, assets, shas, retry,
} from './_router-v5-3-harness.js';
import { lazerFeedTimes } from './_lazer.js';

const OLD_SIM = 'c014c74195d0c8967ae6627082aa1d3a';
const PROBE = `${DEP}.caphint-probe`;
const PROBE_SRC = `;; caphint-probe: get-taker-capacity read inside a transaction
(define-public (cap (mid uint) (limit uint) (sell-sbtc bool) (update (optional (buff 8192))))
  (ok (contract-call? .markets-sbtc-stx-jing-v6-3 get-taker-capacity mid limit sell-sbtc tx-sender update)))
`;

// evm envelope: 4 magic + 65 signature + 2 payload length + payload (to the end)
// payload: 4 magic + 8 timestamp + 1 channel + 1 feed count, then per feed
// 4 id + 1 property count + properties (1 type byte + value)
const SIZE = { 0: 8, 1: 8, 2: 8, 3: 2, 4: 2, 5: 8, 9: 2, 10: 8, 11: 8 };
const OPT = new Set([6, 7, 8, 12]);
function feedsOf(buf) {
  const feeds = [];
  let o = 71 + 13; const n = buf[o]; o += 1;
  for (let f = 0; f < n; f++) {
    const start = o, id = buf.readUInt32BE(o), np = buf[o + 4]; o += 5;
    const props = [];
    for (let p = 0; p < np; p++) {
      const type = buf[o], at = o; o += 1;
      if (OPT.has(type)) o += buf[o] === 0 ? 1 : 9; else if (type in SIZE) o += SIZE[type]; else throw new Error(`unknown property ${type}`);
      props.push({ type, at, end: o });
    }
    feeds.push({ id, start, props });
  }
  if (o !== buf.length) throw new Error(`payload not consumed: ${o} / ${buf.length}`);
  return feeds;
}
const renumber = (buf, id, to) => { const b = Buffer.from(buf); const f = feedsOf(b).find((x) => x.id === id); b.writeUInt32BE(to, f.start); return b; };
function dropTimestamp(buf, id) {
  const f = feedsOf(buf).find((x) => x.id === id), p = f.props.find((x) => x.type === 12);
  if (!p || p.end - p.at !== 10) throw new Error(`feed ${id}: no 9-byte timestamp`);
  // flag byte 0 = none; the 8 value bytes go
  return Buffer.concat([buf.subarray(0, p.at + 1), Buffer.from([0]), buf.subarray(p.end)]);
}

async function main() {
  const sha0 = shas();
  console.log('sha256 at start:', JSON.stringify(sha0));
  const old = await retry(() => getSimulationResult(OLD_SIM));
  const FULL = Buffer.from(String(deserializeTransaction(old.steps[5].Transaction).payload.functionArgs[0].value).replace(/^0x/, ''), 'hex');
  const t0 = await lazerFeedTimes(FULL.toString('hex'));
  console.log(`old signed update: feeds at ${t0.x} / ${t0.y}; feeds ${feedsOf(FULL).map((f) => `${f.id}: types ${f.props.map((p) => p.type).join(',')}`).join('; ')}`);

  await deployAll([['caphint-probe', PROBE_SRC]]);
  await initMarket();
  const stamp = await forkClock();
  const u = await printAfter(stamp);
  const P = u.mid;
  console.log(`mid ${P}, fork clock ${stamp}, old update age ${stamp - t0.at} s`);

  // one resting bid (STX) a sBTC seller can hit
  const maker = mk(881), taker = mk(882);
  await fund('y', maker, 200_000_000n);
  await tx('maker bids 100 STX at up to 2x mid', maker, MARKET, 'deposit-token-y', [uintCV(100_000_000n), uintCV(P * 2n), noneCV(), traits.y, assets.y], (v) => String(v).startsWith('(ok'));
  const limit = P / 2n;
  const cap = async (label, hint) => {
    const r = await tx(label, taker, PROBE, 'cap', [uintCV(P), uintCV(limit), boolCV(true), hint == null ? noneCV() : someCV(bufferCV(hint))], (v) => String(v).startsWith('(ok (tuple'));
    return r.result;
  };

  const ref = await cap('quote with no update (20 bps reference)', null);
  check('reference rebate-bps u20, gross-cap > 0', `${fields(ref)['rebate-bps']} ${fields(ref)['gross-cap'] > 0n}`, '20 true');
  const aged = await cap('quote with the two-week-old signed update', FULL);
  const af = fields(aged), rf = fields(ref);
  check('old update: age >= 80 s -> rebate-bps u70', String(af['rebate-bps']), '70');
  check('old update: same net-cap / mid-cap / walk-cap / min-taker as the reference', ['net-cap', 'mid-cap', 'walk-cap', 'min-taker'].map((k) => af[k]).join(' '), ['net-cap', 'mid-cap', 'walk-cap', 'min-taker'].map((k) => rf[k]).join(' '));
  // gross-up(net, bps) = ceil((net + 1) * (10000 + bps) / 10000) - 1: the largest gross whose net fits
  const grossUp = (n, b) => (n === 0n ? 0n : ((n + 1n) * (10_000n + b) - 1n) / 10_000n);
  check('reference gross-cap == gross-up(net-cap, 20)', String(rf['gross-cap']), String(grossUp(rf['net-cap'], 20n)));
  check('old update gross-cap == gross-up(net-cap, 70) > the 20 bps one', `${af['gross-cap']} ${af['gross-cap'] > rf['gross-cap']}`, `${grossUp(af['net-cap'], 70n)} true`);

  const cases = [
    ['10 bytes: slice? from 71 fails (L3940)', FULL.subarray(0, 10)],
    ['71 + 20 garbage bytes: payload magic refused by the decoder (L3941)', Buffer.concat([FULL.subarray(0, 71), Buffer.alloc(20, 0xab)])],
    ['feed 1 renumbered 99: feed x not found (L3943)', renumber(FULL, 1, 99)],
    ['feed 45 renumbered 98: feed y not found (L3944)', renumber(FULL, 45, 98)],
    ['feed 1 timestamp flag 0: x feed-update-timestamp none (L3945)', dropTimestamp(FULL, 1)],
    ['feed 45 timestamp flag 0: y feed-update-timestamp none (L3946)', dropTimestamp(FULL, 45)],
  ];
  for (const [label, hint] of cases) {
    const got = await cap(`hint ${label}`, hint);
    check(`hint ${label}: falls back to the 20 bps reference tuple exactly`, got, ref);
  }
  // the crafted payloads stay decodable where they should (decoder read-only)
  const dec = async (b) => evRaw('SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1', `(is-ok (decode-lazer-payload 0x${b.subarray(71).toString('hex')}))`);
  check('the renumbered and timestamp-less payloads still decode (the arms are the market\'s, not the decoder\'s)',
    (await Promise.all(cases.slice(2).map(([, b]) => dec(b)))).join(' '), 'true true true true');

  const sha1 = shas();
  console.log('sha256 at end:', JSON.stringify(sha1));
  check('sources unchanged during the run', JSON.stringify(sha1), JSON.stringify(sha0));
  console.log(`${H.passed}/${H.checks} checks green`);
  console.log(`Sim: https://stxer.xyz/simulations/mainnet/${H.sid}`);
}
main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
