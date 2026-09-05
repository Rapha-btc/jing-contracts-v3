// verify-markets-v4-stress.js
// Breadth test of the market on real Lazer updates: a SEEDED random sequence
// of maker and taker actions over many cycles (deposits at limits around the
// mid, cancels, reprices, swaps of random size, top-ups, settle attempts),
// with the book's invariants checked at every checkpoint:
//
//   I1 escrow: the contract's sBTC == sum of every x deposit (this cycle +
//      next) + parked x + pending-rebate-x; same for STX / y.
//   I2 cycle totals == sum of the deposits in the depositor lists, both
//      cycles, both sides.
//   I3 rebate pots are zero at rest (between transactions).
//   I4 conservation: per token, the balance deltas of every participant +
//      the contract + the treasury sum to zero (nothing minted or lost).
//   I5 the treasury only ever gains, and gains when fills happened.
//
// Every action's result must be (ok ...) or one of the market's documented
// refusals; the distribution is printed. SEED=<n> changes the sequence,
// STEPS=<n> its length. DEPLOYED=1 runs on SPV9K21…markets-sbtc-stx-jingswap.
// Run: PYTH_API_KEY=<key> [DEPLOYED=1] [SEED=7] [STEPS=60] npx tsx simulations/verify-markets-v4-stress.js
import fs from "node:fs";
import { uintCV, contractPrincipalCV, stringAsciiCV, bufferCV, trueCV, falseCV, standardPrincipalCV, noneCV, cvToString, deserializeCV, getAddressFromPrivateKey } from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import { fetchLazerUpdate } from "./_lazer.js";
import { STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, SBTC_FQN, WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME } from "./_setup.js";

const DEPLOYED = process.env.DEPLOYED === "1";
const SEED = Number(process.env.SEED ?? 7);
const STEPS = Number(process.env.STEPS ?? 60);
const CHAVITA = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
// a key no maker uses (makers are "1".."6" repeated); the deployer is also the treasury
const DEPLOYER = DEPLOYED ? CHAVITA : getAddressFromPrivateKey("9a".repeat(32) + "01", "mainnet");
const CORE = "jing-core-v3";
const MARKET_FILE = "markets-sbtc-stx-jing-v4";
const MARKET = DEPLOYED ? "markets-sbtc-stx-jingswap" : MARKET_FILE;
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const PP = 100_000_000n;
const MIN_SBTC = 1000n, MIN_STX = 1_000_000n;
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME), wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME), wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const coreSrc = fs.readFileSync(new URL(`../contracts/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/${MARKET_FILE}.clar`, import.meta.url), "utf8");
// the market's documented refusals a random action may legitimately hit
// u1 / u3 are the token contracts' insufficient-balance refusals (a maker ran dry)
const OK_ERRS = new Set(["u1", "u3", "u1001", "u1002", "u1003", "u1008", "u1012", "u1013", "u1016", "u1017", "u1022", "u1023", "u1024", "u1026", "u1027", "u1028"]);

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + BigInt(Math.floor(rnd() * Number(hi - lo + 1n)));

let checks = 0, failures = 0;
function check(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual) === want;
  if (!ok) failures += 1;
  if (!ok || process.env.VERBOSE) console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 140)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 70) : want})`}`);
}
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return String(r.Ok); } };
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);
const field = (s, k) => BigInt((String(s).match(new RegExp(`\\(${k} u(\\d+)\\)`)) || [, "0"])[1]);

async function main() {
  console.log(`=== markets v4 STRESS (seed ${SEED}, ${STEPS} actions) ===`);
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  console.log(`mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats); ${DEPLOYED ? "DEPLOYED " + CID : "local v4"}`);

  const S = STX_DEPOSITOR_1, T = SBTC_DEPOSITOR_1;
  const makers = Array.from({ length: 6 }, (_, k) => getAddressFromPrivateKey(String(k + 1).repeat(64) + "01", "mainnet"));
  const parties = [S, T, ...makers];
  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const call = (sender, fn, args, cid = CID) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); const slot = { label, kind: "tx", want, raw: null }; steps.push(slot); return slot; };
  const cap = (label, code, cid = CID) => { b = b.addEvalCode(cid, code); const slot = { label, kind: "eval", capture: true, value: null, raw: null }; steps.push(slot); return slot; };

  if (!DEPLOYED) {
    tx("deploy core", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc }), (v) => !String(v).includes("ERR"));
    tx("deploy market v4", (bb) => bb.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc }), (v) => !String(v).includes("ERR"));
  }
  tx("verify market in core", call(DEPLOYER, "set-verified-contract", [contractPrincipalCV(DEPLOYER, MARKET)], CORE_ID), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u5002)"));
  tx("initialize", call(DEPLOYER, "initialize", [contractPrincipalCV(DEPLOYER, MARKET), contractPrincipalCV(SBTC_ADDR, SBTC_NAME), contractPrincipalCV(WSTX_ADDR, WSTX_NAME), uintCV(MIN_SBTC), uintCV(MIN_STX), uintCV(1n), uintCV(45n)]), (v) => v === "(ok true)" || (DEPLOYED && v === "(err u1018)"));
  // fund the makers: 30 STX + 300k sats each, from S and T
  for (const m of makers) {
    tx(`fund ${m.slice(0, 8)} STX`, (bb) => bb.withSender(S).addSTXTransfer({ recipient: m, amount: 30_000_000 }), () => true);
    tx(`fund ${m.slice(0, 8)} sBTC`, (bb) => bb.withSender(T).addContractCall({ contract_id: SBTC_FQN, function_name: "transfer", function_args: [uintCV(300_000n), standardPrincipalCV(T), standardPrincipalCV(m), noneCV()] }), (v) => String(v).startsWith("(ok"));
  }

  // balances snapshot helper: every party + contract + treasury (deployer), both tokens
  const snap = (tag) => {
    const out = { stx: {}, sbtc: {} };
    for (const p of [...parties, DEPLOYER]) {
      out.stx[p] = cap(`${tag} stx ${p.slice(0, 6)}`, `(stx-get-balance '${p})`);
      out.sbtc[p] = cap(`${tag} sbtc ${p.slice(0, 6)}`, `(get-balance '${p})`, SBTC_FQN);
    }
    out.stx.contract = cap(`${tag} stx contract`, `(stx-get-balance '${CID})`);
    out.sbtc.contract = cap(`${tag} sbtc contract`, `(get-balance '${CID})`, SBTC_FQN);
    return out;
  };
  // book snapshot: per party deposits this cycle + next + parked, cycle totals, rebate pots
  const book = (tag) => {
    const out = { cycle: cap(`${tag} cycle`, "(get-current-cycle)"), y: {}, x: {}, yNext: {}, xNext: {}, yPark: {}, xPark: {} };
    out.totals = cap(`${tag} totals`, "(get-cycle-totals (get-current-cycle))");
    out.totalsNext = cap(`${tag} totals next`, "(get-cycle-totals (+ u1 (get-current-cycle)))");
    out.rebX = cap(`${tag} pending-rebate-x`, "(var-get pending-rebate-x)");
    out.rebY = cap(`${tag} pending-rebate-y`, "(var-get pending-rebate-y)");
    for (const p of parties) {
      out.y[p] = cap(`${tag} y ${p.slice(0, 6)}`, `(get-token-y-deposit (get-current-cycle) '${p})`);
      out.x[p] = cap(`${tag} x ${p.slice(0, 6)}`, `(get-token-x-deposit (get-current-cycle) '${p})`);
      out.yNext[p] = cap(`${tag} y+1 ${p.slice(0, 6)}`, `(get-token-y-deposit (+ u1 (get-current-cycle)) '${p})`);
      out.xNext[p] = cap(`${tag} x+1 ${p.slice(0, 6)}`, `(get-token-x-deposit (+ u1 (get-current-cycle)) '${p})`);
      out.yPark[p] = cap(`${tag} ypark ${p.slice(0, 6)}`, `(get-token-y-parked '${p})`);
      out.xPark[p] = cap(`${tag} xpark ${p.slice(0, 6)}`, `(get-token-x-parked '${p})`);
    }
    return out;
  };

  const snap0 = snap("start");
  const actions = [];
  const checkpoints = [];
  const limitNear = (side) => { // maker limits around the mid, mostly in range, sometimes out
    const bps = BigInt(Math.floor(rnd() * 600) - 300); // -3% .. +3%
    const l = (MID * (10_000n + bps)) / 10_000n;
    return side === "y" ? (rnd() < 0.3 ? 999_999_999_999_999n : l) : (rnd() < 0.3 ? 1n : l);
  };
  for (let k = 0; k < STEPS; k++) {
    const r = rnd();
    const who = pick(makers);
    let label, fn;
    if (r < 0.22) { const amt = between(MIN_STX, 20_000_000n); const l = limitNear("y"); label = `#${k} ${who.slice(0, 6)} bid ${amt} @ ${l === 999_999_999_999_999n ? "any" : l}`; fn = call(who, "deposit-token-y", [uintCV(amt), uintCV(l), UPD, wstxTrait, wstxAsset]); }
    else if (r < 0.44) { const amt = between(MIN_SBTC, 60_000n); const l = limitNear("x"); label = `#${k} ${who.slice(0, 6)} ask ${amt} @ ${l === 1n ? "any" : l}`; fn = call(who, "deposit-token-x", [uintCV(amt), uintCV(l), UPD, sbtcTrait, sbtcAsset]); }
    else if (r < 0.54) { const side = rnd() < 0.5 ? "y" : "x"; label = `#${k} ${who.slice(0, 6)} cancel ${side}`; fn = call(who, side === "y" ? "cancel-token-y-deposit" : "cancel-token-x-deposit", side === "y" ? [wstxTrait, wstxAsset] : [sbtcTrait, sbtcAsset]); }
    else if (r < 0.64) { const side = rnd() < 0.5 ? "y" : "x"; const l = limitNear(side); label = `#${k} ${who.slice(0, 6)} reprice ${side} -> ${l}`; fn = call(who, side === "y" ? "reprice-or-swap-token-y" : "reprice-or-swap-token-x", [uintCV(l), UPD, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]); }
    else if (r < 0.84) { const depX = rnd() < 0.5; const taker = depX ? T : S; const amt = depX ? between(MIN_SBTC, 12_000n) : between(MIN_STX, 12_000_000n); const l = depX ? (MID * 97n) / 100n : (MID * 103n) / 100n; label = `#${k} ${depX ? "T sells sBTC" : "S sells STX"} ${amt} (swap, 3% limit)`; fn = call(taker, "swap", [uintCV(amt), uintCV(l), UPD, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, depX ? trueCV() : falseCV()]); }
    else if (r < 0.92) { label = `#${k} ${who.slice(0, 6)} close-and-settle`; fn = call(who, "close-and-settle-with-refresh", [UPD, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset]); }
    else { const side = rnd() < 0.5 ? "y" : "x"; label = `#${k} ${who.slice(0, 6)} readmit ${side} ${pick(makers).slice(0, 6)}`; fn = call(who, side === "y" ? "readmit-token-y" : "readmit-token-x", [standardPrincipalCV(pick(makers)), UPD]); }
    const slot = tx(label, fn, (v) => String(v).startsWith("(ok") || OK_ERRS.has((String(v).match(/\(err (u\d+)\)/) || [])[1]));
    actions.push(slot);
    if ((k + 1) % 10 === 0 || k === STEPS - 1) checkpoints.push({ k, book: book(`cp${k}`), bal: snap(`cp${k}`) });
  }

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  let i = 0;
  for (const st of steps) {
    while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1;
    const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]);
    i += 1;
    st.raw = raw;
    if (st.capture) st.value = uintOf(raw);
    else check(st.label, raw, st.want);
  }
  // action outcome distribution
  const dist = {};
  for (const a of actions) { const key = String(a.raw).startsWith("(ok") ? "ok" : (String(a.raw).match(/\(err (u\d+)\)/) || [, String(a.raw).slice(0, 20)])[1]; dist[key] = (dist[key] || 0) + 1; }
  console.log("  outcomes:", JSON.stringify(dist));
  const fills = actions.filter((a) => String(a.raw).startsWith("(ok (tuple") && /token-[xy]-received u[1-9]/.test(String(a.raw))).length;
  console.log(`  swaps/reprices that filled something: ${fills}`);

  const sumOver = (obj) => Object.values(obj).reduce((t, c) => t + c.value, 0n);
  for (const cp of checkpoints) {
    const B = cp.book, L = cp.bal, tag = `cp#${cp.k}`;
    const xAll = sumOver(B.x) + sumOver(B.xNext) + sumOver(B.xPark) + B.rebX.value;
    const yAll = sumOver(B.y) + sumOver(B.yNext) + sumOver(B.yPark) + B.rebY.value;
    check(`${tag} I1 escrow sBTC == x deposits (cur+next+parked) + pending-rebate-x`, L.sbtc.contract.value, (v) => v === xAll);
    check(`${tag} I1 escrow STX == y deposits (cur+next+parked) + pending-rebate-y`, L.stx.contract.value, (v) => v === yAll);
    check(`${tag} I2 cycle totals == list sums (this cycle)`, [field(B.totals.raw, "total-token-x"), field(B.totals.raw, "total-token-y")], ([tx_, ty]) => tx_ === sumOver(B.x) && ty === sumOver(B.y));
    check(`${tag} I2 cycle totals == list sums (next cycle)`, [field(B.totalsNext.raw, "total-token-x"), field(B.totalsNext.raw, "total-token-y")], ([tx_, ty]) => tx_ === sumOver(B.xNext) && ty === sumOver(B.yNext));
    check(`${tag} I3 rebate pots zero at rest`, [B.rebX.value, B.rebY.value], ([a, c]) => a === 0n && c === 0n);
    const dSTX = [...parties, DEPLOYER].reduce((t, p) => t + (L.stx[p].value - snap0.stx[p].value), 0n) + (L.stx.contract.value - snap0.stx.contract.value);
    const dSBTC = [...parties, DEPLOYER].reduce((t, p) => t + (L.sbtc[p].value - snap0.sbtc[p].value), 0n) + (L.sbtc.contract.value - snap0.sbtc.contract.value);
    check(`${tag} I4 conservation STX (sum of deltas == 0)`, dSTX, (d) => d === 0n);
    check(`${tag} I4 conservation sBTC (sum of deltas == 0)`, dSBTC, (d) => d === 0n);
    if (dSTX !== 0n || dSBTC !== 0n) {
      for (const p of [...parties, DEPLOYER]) console.log(`      ${p === DEPLOYER ? "treasury" : p === S ? "S" : p === T ? "T" : p.slice(0, 8)} dSTX ${L.stx[p].value - snap0.stx[p].value} dSBTC ${L.sbtc[p].value - snap0.sbtc[p].value}`);
      console.log(`      contract dSTX ${L.stx.contract.value - snap0.stx.contract.value} dSBTC ${L.sbtc.contract.value - snap0.sbtc.contract.value}`);
    }
    const tSTX = L.stx[DEPLOYER].value - snap0.stx[DEPLOYER].value, tSBTC = L.sbtc[DEPLOYER].value - snap0.sbtc[DEPLOYER].value;
    check(`${tag} I5 treasury never loses (STX ${tSTX}, sBTC ${tSBTC})`, [tSTX, tSBTC], ([a, c]) => a >= 0n && c >= 0n);
  }
  const last = checkpoints[checkpoints.length - 1];
  if (fills > 0) check("I5 treasury gained fees over the run", [last.bal.stx[DEPLOYER].value - snap0.stx[DEPLOYER].value, last.bal.sbtc[DEPLOYER].value - snap0.sbtc[DEPLOYER].value], ([a, c]) => a > 0n || c > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
