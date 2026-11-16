// verify-v6-rungs-audit-tail-stx-usdcx.mjs
// STX/USDCx port of verify-v6-rungs-audit-tail.js: real market fills drive the
// two band rungs (the core-spread-v1 descendants jing-sell-stx-usdc-bps on x,
// jing-buy-stx-usdc-bps on y) into the rescale band and then the tail roll.
// Fork at the TIP on the LIVE jing-core-v6: fresh jing-ladder-stx-usdcx-v1 +
// markets-stx-usdcx-jing-v6-4 (stripped source) + jing-ladder-dispatch-stx-usdcx
// by DEP; verify + initialize by the core owner multisig (operator handed to it
// and back to DEP). jing-rung-deposit-trait is the live one (not redeployed).
// Lazer [45, 7]; mid = px*1e8/py; y = x * price / 1e8.
// Optional SIDE=x|y restricts a diagnostic run.
//
// Roles: x scenario = jing-sell-stx-usdc-100 (rests STX, ladder sel-band,
//   dispatch withdraw-sell), y scenario = jing-buy-stx-usdc-100 (rests USDCx,
//   ladder buy-band, dispatch withdraw-buy). Positional keys: sbtc = uSTX, stx = uUSDCx.
// Rederived sizes (6 dp both sides; SOLD_OUT_DUST is u10000 on BOTH rungs here,
//   orig x sBTC rung u10 / y STX rung u10000):
//   tail roll needs SOLD_OUT_DUST <= residual < 2*big*MINT_FLOOR/RESCALE/SCALE = 2*big/1e6.
//   The original targets residual = big*2/2e6 (half the threshold).
//   x: big = 50,000 STX (target 0.05 STX = 5x dust); taker funded 45k USDCx.
//   y: big = 24,000 USDCx (target 0.024 USDCx = 2.4x dust), bounded by the USDCx
//      whales (~128k total: alice 2*big, bob big, carol big); taker 330k STX.
//   small = the market minimum (1 STX / 1 USDCx); the taker's per-fill floor is
//   the opposite market minimum (orig 1 STX / 1000 sats).
//   Fill sizing: net = want * price / 1e8 (x side, taker pays USDCx) or
//   want * 1e8 / price (y side, taker pays STX); orig used 1e10.
//   The residual check 'avoids absolute-dust close' is >= SOLD_OUT_DUST (u10000)
//   on both sides (orig: >= 10, the sBTC rung's dust).
//
// Run: node simulations/verify-v6-rungs-audit-tail-stx-usdcx.mjs
import {
  ClarityVersion, listCV, tupleCV, uintCV, stringAsciiCV, noneCV, someCV, boolCV, makeUnsignedSTXTokenTransfer,
  deserializeCV, cvToString, makeUnsignedContractDeploy, PostConditionMode,
} from '@stacks/transactions';
import { SimulationBuilder, submitSimulationSteps, callContract, getNonce, setSender } from 'stxer';
import { P_ as principal, NODE, DEP, CORE, CORE_OWNER, USDCX, STX_WHALES, USDCX_WHALES, N, C, src, traits, assets, mk, balanceExpr, freshAfter, updCV, DISPATCH_DIR } from './_stx-usdcx-v6-common.mjs';

const keeper = mk(871);
const cv = (hex) => cvToString(deserializeCV(hex));
const decode = (step) => {
  const r = step?.Result;
  if (r?.Eval?.Ok) return cv(r.Eval.Ok);
  if (r?.Transaction?.Ok) {
    const tx = r.Transaction.Ok;
    if (tx.vm_error || tx.post_condition_aborted) return `ENGINE-ERR ${JSON.stringify(tx)}`;
    return cv(tx.result);
  }
  return `ENGINE-ERR ${JSON.stringify(r)}`;
};
const ok = (v) => v.startsWith('(ok');
const update = updCV;
let passed = 0, checks = 0, failures = 0, sid;
function check(label, actual, want) {
  checks++;
  const good = typeof want === 'function' ? want(actual) : actual === want;
  if (good) passed++; else failures++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${checks}. ${label}: ${String(actual).slice(0, 700)}${good ? '' : `; expected ${want}`}`);
  if (!good) finishPhase();
  return good;
}
function finishPhase() {
  if (failures) { console.log(`${passed}/${checks} checks green`); throw new Error(`Fork checks failed: https://stxer.xyz/simulations/mainnet/${sid}`); }
}
async function ev(label, cid, code, want) {
  const out = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, code] }] });
  const actual = decode({ Result: out.steps[0] });
  check(label, actual, want);
  return actual;
}
async function tx(label, sender, cid, fn, args, want) {
  const r = await callContract(sid, { sender, contract: cid, functionName: fn, functionArgs: args, fee: 0 });
  const actual = r.vmError || r.pcAborted ? `ENGINE-ERR ${JSON.stringify(r)}` : r.result;
  check(label, actual, want);
  return r;
}
const balance = balanceExpr;
const live = (side, p) => `(get-token-${side}-deposit (var-get current-cycle) '${p})`;
async function fundFrom(side, whale, who, amount) {
  if (side === 'y') {
    await tx('fund fresh USDCx', whale, USDCX, 'transfer', [uintCV(amount), principal(whale), principal(who), noneCV()], '(ok true)');
  } else {
    const raw = await makeUnsignedSTXTokenTransfer({ recipient: who, amount, nonce: await getNonce(sid, whale), network: 'mainnet', publicKey: '', fee: 0 });
    setSender(raw, whale);
    const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
    check('fund fresh STX', decode({ Result: out.steps[0] }), '(ok true)');
  }
  finishPhase();
}
const MARKET = C.market, LADDER = C.ladder, DISPATCH = C.dispatch;
async function deploy(name, code) {
  const raw = await makeUnsignedContractDeploy({ contractName: name, codeBody: code, clarityVersion: ClarityVersion.Clarity5, nonce: await getNonce(sid, DEP), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
  setSender(raw, DEP); const out = await submitSimulationSteps(sid, { steps: [{ Transaction: raw.serialize() }] });
  check(`deploy ${name}`, decode({ Result: out.steps[0] }), ok); finishPhase();
}
const SCALE = 1000000000000n, FLOOR = 1000000000n, PRICE = 100000000n, DUST = 10000n;
const MINX = 1_000_000n, MINY = 1_000_000n;
const number = (s) => BigInt(s.slice(1));
const field = (s, name) => BigInt(s.match(new RegExp(`\\(${name} u(\\d+)\\)`))[1]);
const opposite = (side) => side === 'x' ? 'y' : 'x';
const coin = (side) => side === 'x' ? 'sbtc' : 'stx';
const links = [];
async function read(cid, expression) {
  const r = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', cid, expression] }] });
  const v = decode({ Result: r.steps[0] });
  if (v.startsWith('ENGINE-ERR')) throw new Error(v);
  return v;
}
async function get(cid, expression) { return number(await read(cid, expression)); }
async function wallet(side, who) { return get(MARKET, balance(side, who)); }
async function main() {
  for (const side of (process.env.SIDE ? [process.env.SIDE] : ['x', 'y'])) await scenario(side);
  console.log(`\n${passed}/${checks} checks green`);
  console.log(links.join('\n'));
}
async function scenario(side) {
  const tpl = side === 'x' ? N.sellTpl : N.buyTpl, dir = DISPATCH_DIR[side];
  const prefix = side === 'x' ? 'jing-sell-stx-usdc-' : 'jing-buy-stx-usdc-';
  console.log(`\n=== ${tpl} (${side}) ===`);
  const b = SimulationBuilder.new({ stacksNodeAPI: NODE });
  b.withSender(DEP).addEvalCode(USDCX, '(get-total-supply)');
  sid = await b.run(); const link = `${tpl}: https://stxer.xyz/simulations/mainnet/${sid}`; links.push(link); console.log(link);
  check('live core owner = the multisig', await read(CORE, '(get-contract-owner)'), CORE_OWNER);
  await deploy(N.ladder, src(N.ladder)); await deploy(N.market, src(N.market));
  await tx('sync seats', DEP, MARKET, 'sync-seat-count', [], '(ok u10)');
  await tx('market operator -> core owner', DEP, MARKET, 'set-operator', [principal(CORE_OWNER)], '(ok true)');
  await tx('verify market (core owner)', CORE_OWNER, CORE, 'set-verified-contract', [principal(MARKET)], '(ok true)');
  await tx('initialize market (core owner)', CORE_OWNER, MARKET, 'initialize', [principal(MARKET), traits.x, traits.y, uintCV(MINX), uintCV(MINY), uintCV(45), uintCV(7)], '(ok true)');
  await tx('market operator -> DEP', CORE_OWNER, MARKET, 'set-operator', [principal(DEP)], '(ok true)');
  const stamp = Number(await get(MARKET, 'stacks-block-time')), signed = await freshAfter(stamp), mid = signed.mid;
  console.log(`  Lazer [45,7] mid ${mid} ($${Number(mid) / 1e8}/STX)`);
  const name = `${prefix}100`, rung = `${DEP}.${name}`, ladderSide = side === 'x' ? 'sel-band' : 'buy-band';
  await deploy(name, src(tpl));
  await tx('canonical rung', DEP, LADDER, 'set-canonical', [stringAsciiCV(ladderSide), principal(rung)], '(ok true)');
  await tx('initialize rung', DEP, rung, 'initialize', [uintCV(100), boolCV(true)], '(ok true)');
  const alice = mk(881), bob = mk(882), carol = mk(883), taker = mk(884);
  const big = side === 'x' ? 50_000_000_000n : 24_000_000_000n, small = side === 'x' ? MINX : MINY;
  if (side === 'x') {
    for (const who of [alice, bob, carol]) await fundFrom('x', STX_WHALES[0], who, big * 2n + small * 20n);
    await fundFrom('y', USDCX_WHALES[0], taker, 45_000_000_000n);
  } else {
    // USDCx whales hold ~56k / 47k / 25k: alice needs ~2 x big, bob and carol big each
    await fundFrom('y', USDCX_WHALES[0], alice, big * 2n + small * 20n);
    await fundFrom('y', USDCX_WHALES[1], bob, big + small * 20n);
    await fundFrom('y', USDCX_WHALES[2], carol, big + small * 20n);
    await fundFrom('x', STX_WHALES[0], taker, 330_000_000_000n);
  }
  const state = () => read(rung, '(get-state)');
  const actual = () => get(rung, `(+ (market-size) ${side === 'x' ? '(stx-get-balance current-contract)' : `(unwrap-panic (contract-call? '${USDCX} get-balance current-contract))`})`);
  const sync = () => tx('sync rung', keeper, rung, 'sync', [], '(ok true)');
  const deposit = (who, amount) => tx('member deposit', who, rung, 'deposit', [uintCV(amount)], ok);
  const exit = (who, amount = big * 100n) => tx('member exit', who, rung, 'withdraw', [uintCV(amount), someCV(update(signed))], ok);
  // All fills use public swap against the rung's real pegged limit.
  async function sellTo(target) {
    const start = await actual();
    for (let i = 0; i < 8; i++) {
      const rest = await actual(); if (rest <= target + target / 100n) break;
      const price = await get(MARKET, `(token-${side}-limit-at '${rung} u${mid})`);
      if (price === 0n && await get(MARKET, live(side, rung)) === 0n) break;
      check('rung quote is executable outside mid', price, (p) => side === 'x' ? p > mid && p < mid * 4n : p > mid / 4n && p < mid);
      const want = rest - target;
      const net = side === 'x' ? want * price / PRICE : want * PRICE / price;
      if (net < (side === 'x' ? MINY : MINX)) break;
      const gross = net * 10000n / 9980n;
      const r = await tx(`real fill toward ${target}`, taker, MARKET, 'swap', [uintCV(gross), uintCV(side === 'x' ? price * 101n / 100n : price * 99n / 100n), update(signed), traits.x, assets.x, traits.y, assets.y, boolCV(side === 'y')], ok);
      check('fill returns output', field(r.result, `token-${side}-received`), (v) => v > 0n);
      await ev('taker leaves no resting position', MARKET, live(opposite(side), taker), 'u0');
    }
    const rest = await actual(); check('real fills reduced rung inventory', rest, (v) => v < start);
    console.log(`inventory ${start} -> ${rest}, target ${target}`);
  }
  const within1 = (v, want) => v <= want && v + 1n >= want;

  // --- A. Drift under MINT_FLOOR (not under MINT_FLOOR/RESCALE): rescale, stay open.
  await deposit(alice, big);
  const pre = await state(), preShares = field(pre, 'total-shares'), epochA = field(pre, 'epoch'), scaleA = field(pre, 'scale');
  await sellTo(big / 2000n);
  const restA = await actual();
  check('fills leave index in rescale band [1e6, MINT_FLOOR)', restA * SCALE / big, (v) => v >= 1000000n && v < FLOOR);
  await sync();
  const resc = await state();
  check('rescale keeps the epoch open', field(resc, 'epoch'), epochA);
  check('rescale steps scale +1', field(resc, 'scale'), scaleA + 1n);
  check('rescaled index back at or above MINT_FLOOR', field(resc, 'unfilled-index'), (v) => v >= FLOOR && v < SCALE);
  check('rescale divides total shares by 1000', field(resc, 'total-shares'), preShares / 1000n);
  check('rescale keeps the member', field(resc, 'members'), 1n);
  check('sole member still owns all unsold', field(await read(rung, `(get-position '${alice})`), coin(side)), restA);
  const bobBefore = await wallet(side, bob);
  const joinA = await deposit(bob, big);
  check('newcomer after rescale is admitted (no u7013)', field(joinA.result, 'shares'), (v) => v > 0n);
  check('newcomer deposit moves exactly the amount', bobBefore - await wallet(side, bob), big);
  const afterJoin = await state();
  check('newcomer joins the same epoch', field(afterJoin, 'epoch'), epochA); check('two members', field(afterJoin, 'members'), 2n);
  check('newcomer position worth its deposit (<=1 unit rounding)', field(await read(rung, `(get-position '${bob})`), coin(side)), (v) => within1(v, big));
  check('incumbent position unchanged by the join (<=1 unit)', field(await read(rung, `(get-position '${alice})`), coin(side)), (v) => within1(v, restA));
  const bobMid = await wallet(side, bob); await exit(bob);
  check('newcomer exits with its deposit (<=1 unit)', await wallet(side, bob) - bobMid, (v) => within1(v, big));
  const aPos = await read(rung, `(get-position '${alice})`), aWallet = await wallet(side, alice);
  await exit(alice);
  check('last member receives exact unsold position', await wallet(side, alice) - aWallet, field(aPos, coin(side)));
  const emptyA = await state();
  check('last exit closes epoch', field(emptyA, 'epoch'), epochA + 1n); check('last exit resets index', field(emptyA, 'unfilled-index'), SCALE); check('last exit burns every share', field(emptyA, 'total-shares'), 0n);
  check('pool input fully paid out', await actual(), 0n);

  // --- B. One fill over 99.9% (index under MINT_FLOOR/RESCALE), residual above
  // SOLD_OUT_DUST: sync rolls the tail and closes the epoch losslessly.
  await deposit(alice, big); await deposit(carol, big);
  const epochB = field(await state(), 'epoch'), sharesB = field(await state(), 'total-shares');
  await sellTo(big * 2n / 1000n); await sellTo(big * 2n / 2000000n);
  const residual = await actual();
  check('nonzero residual avoids absolute-dust close (>= SOLD_OUT_DUST u10000)', residual, (v) => v >= DUST);
  check('residual crosses the roll threshold (index < MINT_FLOOR/RESCALE)', residual * SCALE / sharesB, (v) => v < 1000000n);
  await sync();
  const rolled = await state();
  check('tail roll closes the epoch', field(rolled, 'epoch'), epochB + 1n);
  check('fresh epoch index = SCALE', field(rolled, 'unfilled-index'), SCALE);
  check('fresh epoch has no shares', field(rolled, 'total-shares'), 0n);
  check('fresh epoch has no members', field(rolled, 'members'), 0n);
  check('tail roll takes the order off the market', field(rolled, 'resting'), 0n);
  check('tail roll reserves the rest (nothing held for the pool)', field(rolled, side === 'x' ? 'held-ustx' : 'held-uusdcx'), 0n);
  const aliceB = await read(rung, `(get-position '${alice})`);
  const aliceBack = field(aliceB, coin(side)), aliceOwed = field(aliceB, coin(opposite(side)));
  check('closed member has positive proceeds claim', aliceOwed, (v) => v > 0n);
  const nBefore = await wallet(side, bob);
  const joinB = await deposit(bob, big);
  check('newcomer after roll mints fresh shares 1:1', field(joinB.result, 'shares'), big);
  check('newcomer after roll moves exactly the amount', nBefore - await wallet(side, bob), big);
  const fresh = await state();
  check('newcomer opens the fresh epoch', field(fresh, 'epoch'), epochB + 1n); check('fresh epoch one member', field(fresh, 'members'), 1n);
  check('newcomer owns exactly its deposit', field(await read(rung, `(get-position '${bob})`), coin(side)), big);
  check('closed members claims untouched by the newcomer', await read(rung, `(get-position '${alice})`), aliceB);
  // Alice: closed rung + a second live rung in one real dispatch withdrawal.
  check('jing-rung-deposit-trait is live (reused, not redeployed)', await read(MARKET, `(is-ok (contract-hash? '${DEP}.jing-rung-deposit-trait))`), 'true');
  await deploy(N.dispatch, src(N.dispatch));
  const secondName = `${prefix}101`, second = `${DEP}.${secondName}`;
  await deploy(secondName, src(tpl)); await tx('initialize second band rung', DEP, second, 'initialize', [uintCV(101), boolCV(true)], '(ok true)');
  await tx('same member funds live rung', alice, second, 'deposit', [uintCV(small * 10n)], ok);
  const payoutBefore = await wallet(opposite(side), alice), inputBefore = await wallet(side, alice);
  const out = await tx('dispatch closed + live rung exits atomically', alice, DISPATCH, `withdraw-${dir}`, [listCV([rung, second].map((r) => tupleCV({ rung: principal(r), amount: uintCV(big * 100n) }))), someCV(update(signed))], ok);
  const result = deserializeCV(out.resultHex).value.value;
  check('dispatch includes both withdrawals', BigInt(result.withdrawn.value), 2n);
  check('dispatch closed proceeds paid exactly', BigInt(result[coin(opposite(side))].value), aliceOwed);
  check('dispatch input = closed reserve share + live deposit', BigInt(result[coin(side)].value), aliceBack + small * 10n);
  check('proceeds wallet exact', await wallet(opposite(side), alice) - payoutBefore, aliceOwed);
  check('input wallet exact', await wallet(side, alice) - inputBefore, aliceBack + small * 10n);
  await tx('second old-epoch withdraw has no position', alice, rung, 'withdraw', [uintCV(1), noneCV()], '(err u7006)');
  const carolLast = await read(rung, `(get-position '${carol})`), carolBack = field(carolLast, coin(side)), carolOwed = field(carolLast, coin(opposite(side)));
  check('last closed member gets the whole remaining reserve', aliceBack + carolBack, residual);
  const cOut = await wallet(opposite(side), carol), cIn = await wallet(side, carol);
  await tx('last closed member claims', carol, rung, 'claim', [], ok);
  check('claim pays proceeds exactly', await wallet(opposite(side), carol) - cOut, carolOwed);
  check('claim pays reserve share exactly', await wallet(side, carol) - cIn, carolBack);
  await ev('claim deletes old member position', rung, `(get shares (get-position '${carol}))`, 'u0');
  const bMid = await wallet(side, bob); await exit(bob);
  check('newcomer exits fresh epoch with exactly its deposit', await wallet(side, bob) - bMid, big);
  check('no input left in the rung after every exit', await actual(), 0n);
  console.log(`${passed}/${checks} checks green so far; ${link}`);
}
main().catch((e) => { console.error(e); console.log(`${passed}/${checks} checks green`); process.exit(1); });
