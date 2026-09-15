// verify-vault-sbtc-stx-v6-parked.js
// The v5 parked-order harness on the NEXT stack, nothing live: jing-core-v5,
// markets-sbtc-stx-jing-v6 (pegged orders), swap-router-sbtc-stx-jing-v5 and
// vault-sbtc-stx-v6 are deployed on the fork under chavita first (the live
// jing-vault-auth stays), then the same P/V waves run. Fillers pass `none` in
// the spread slot; the vault does inside its own calls. With
// a real Lazer update (PYTH_API_KEY). Targets audit finding 5 (Watchful
// Node): a zero-amount jing-set-limit intent used to reprice a fully PARKED
// order because `resting` read live only.
//
//   P0  clear the live book (fork: cancel as the live makers) so the vault's
//       and the fillers' deposits skip classification
//   V1  deploy / core-v4 verify / initialize / pubkey / keeper / fund
//   V2  keeper rests a 20k-sat ask far out of range (+20%)
//   V3  LIVE order: set-limit amount 0 -> u6006, wrong amount -> u6022,
//       right amount -> ok (limit retargeted)
//   V4  PARK it: 49 fillers rest closer asks (book = 50), distance-slots
//       widened to 50, a 50th newcomer with an in-range ask (fresh update)
//       demotes the N-th best = the vault, which is parked
//   V5  PARKED order: set-limit amount 0 -> u6006 (the finding), amount =
//       parked -> ok and the limit moves, reprice on parked -> market
//       u1005 (needs a live deposit)
//   V6  keeper cancels: the parked 20k comes back to the vault
//   V7+ the rest of the vault on this stack: STX funding, the STX-side
//       deposit / set-limit, the CROSSING reprice (the bid repriced into
//       range swaps against the parker's in-range ask), the vault as a
//       maker that gets walked (jing-core-v5 credits a registered
//       contract), execute-jing-swap both ways, execute-router-swap both
//       ways + a stale update (pools only), withdraws, expiry, revoke, the
//       wrong key, a replay, a stranger
//
// Run: PYTH_API_KEY=... npx tsx simulations/verify-vault-sbtc-stx-v6-parked.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, contractPrincipalCV, standardPrincipalCV, stringAsciiCV, bufferCV,
  someCV, noneCV, trueCV, cvToString, deserializeCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, SBTC_FQN,
  WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME, TEST_INTENT_PUBKEY_HEX, TEST_INTENT_PRIVKEY, WRONG_INTENT_PRIVKEY,
  buildIntentHashHex, signIntent,
} from "./_setup.js";
import { fetchLazerUpdate } from "./_lazer.js";

const CHAVITA = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const OWNER = getAddressFromPrivateKey("3".repeat(64) + "01", "mainnet");
const MARKET_NAME = "markets-sbtc-stx-jing-v6", CORE_NAME = "jing-core-v5", ROUTER_NAME = "swap-router-sbtc-stx-jing-v5";
const MARKET_ID = `${CHAVITA}.${MARKET_NAME}`;
const CORE_ID = `${CHAVITA}.${CORE_NAME}`;
const VAULT_NAME = "vault-sbtc-stx-v6";
const VAULT_ID = `${OWNER}.${VAULT_NAME}`;
const KEEPER = STX_DEPOSITOR_1;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const LIVE_X = ["SPW81Q8C7S1ZD0ZDRF50TZ4RA32A1FADPHXMACF7", CHAVITA];
const LIVE_Y = ["SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q"];
const FILLERS = Array.from({ length: 49 }, (_, i) => getAddressFromPrivateKey((i + 100).toString(16).padStart(64, "0") + "01", "mainnet"));
const PARKER = getAddressFromPrivateKey("7".repeat(64) + "01", "mainnet");

const PP = 100_000_000n;
const SBTC_20K = 20_000;
const STX_300 = 300_000_000;
const SBTC_EXTRA = 40_000; // V7+: the vault trades both ways
const FILL = 2_000;
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const vaultCV = contractPrincipalCV(OWNER, VAULT_NAME);
const vaultSrc = fs.readFileSync(new URL(`../contracts/${VAULT_NAME}.clar`, import.meta.url), "utf8");
const srcOf = (n) => fs.readFileSync(new URL(`../contracts/${n}.clar`, import.meta.url), "utf8").split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n"); // comment lines dropped as deployed

function decodeTx(s) { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`; if (r.Ok?.vm_error) return `VM-ERR: ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; } }
function decodeEval(s) { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } }
let checks = 0, failures = 0;
function assert(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual).includes(want); if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 110)}`); else { failures += 1; console.log(`  FAIL ${label}: got "${String(actual).slice(0, 200)}" want "${want}"`); } }

async function main() {
  console.log("=== vault-sbtc-stx-v6 PARKED-ORDER harness (next stack from source: core-v5, market v6, router v5) ===\n");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py;
  console.log(`Lazer ${lz.hex.length / 2} bytes, mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats)\n`);

  const intent = (action, side, amount, limitPrice, authId, key = TEST_INTENT_PRIVKEY, expiry = 0) => { const d = { vault: vaultCV, action, side, amount, limitPrice, authId, expiry }; return { d, sig: signIntent(buildIntentHashHex(d), key) }; };
  const ASK_FAR = Number((MID * 120n) / 100n);   // the vault: farthest above mid -> parked first
  const ASK_NEAR = Number((MID * 105n) / 100n);  // fillers: closer
  const ASK_IN = Number((MID * 90n) / 100n);     // the parker: in range (<= mid), triggers the park
  const ASK_FAR2 = Number((MID * 125n) / 100n);
  const ASK_FAR3 = Number((MID * 130n) / 100n);
  const dep = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR, 1);
  const slZeroLive = intent("jing-set-limit", SBTC_ASSET_NAME, 0, ASK_FAR2, 2);
  const slWrong = intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K + 1, ASK_FAR2, 3);
  const slLive = intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR2, 4);
  const slZeroParked = intent("jing-set-limit", SBTC_ASSET_NAME, 0, ASK_FAR3, 5);
  const slParked = intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR3, 6);
  const repriceParked = intent("jing-reprice", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR, 7);
  const repriceLive = intent("jing-reprice", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR, 36); // sBTC side, live, no cross: back from +25% to +20%

  const call = (sender, cid, fn, args) => (b) => b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const exec = (sender, fn, it, extra) => call(sender, VAULT_ID, fn, [bufferCV(Buffer.from(it.sig, "hex")), stringAsciiCV(it.d.side), uintCV(it.d.amount), uintCV(it.d.limitPrice), uintCV(it.d.authId), uintCV(it.d.expiry), ...extra]);
  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, cid, code, want) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };
  const cap = (label, cid, code) => { b = b.addEvalCode(cid, code); const slot = { label, kind: "eval", capture: true, value: null }; steps.push(slot); return slot; };

  // ---- P0 the next stack, deployed on the fork under chavita ----
  tx("P0 deploy jing-core-v5", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: CORE_NAME, source_code: srcOf(CORE_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("P0 deploy jing-ladder (the market asks it who holds a band seat)", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: "jing-ladder", source_code: srcOf("jing-ladder"), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("P0 sim-only: seats 0 on the ladder (this harness fills the side)", call(CHAVITA, `${CHAVITA}.jing-ladder`, "set-max-band-per-side", [uintCV(0)]), "(ok true)");
  tx("P0 deploy markets-sbtc-stx-jing-v6", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: MARKET_NAME, source_code: srcOf(MARKET_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("P0 core-v5 verifies the market", call(CHAVITA, CORE_ID, "set-verified-contract", [contractPrincipalCV(CHAVITA, MARKET_NAME)]), "(ok true)");
  tx("P0 initialize the market (mins 1000 / 1 STX, feeds 1 / 45)", call(CHAVITA, MARKET_ID, "initialize", [contractPrincipalCV(CHAVITA, MARKET_NAME), sbtcTrait, wstxTrait, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  tx("P0 sim-only: market syncs the count", call(CHAVITA, MARKET_ID, "sync-seat-count", []), (v) => String(v).startsWith("(ok"));
  tx("P0 deploy swap-router-sbtc-stx-jing-v5", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: ROUTER_NAME, source_code: srcOf(ROUTER_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  ev("P0 x book empty", MARKET_ID, "(len (get-token-x-depositors (get-current-cycle)))", "u0");

  // ---- V1 setup ----
  tx("V1 fund owner with STX", (b) => b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: OWNER, amount: 5_000_000 + STX_300 }), () => true);
  tx("V1 fund owner with sBTC", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(SBTC_20K + SBTC_EXTRA), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(OWNER), noneCV()]), "(ok true)");
  tx("V1 deploy vault v6 (source as is, next-stack refs)", (b) => b.withSender(OWNER).addContractDeploy({ contract_name: VAULT_NAME, source_code: vaultSrc, clarity_version: ClarityVersion.Clarity5 }), "(ok true)");
  tx("V1 chavita verifies the vault hash in jing-core-v5", call(CHAVITA, CORE_ID, "set-verified-contract", [vaultCV]), "(ok true)");
  tx("V1 owner initializes", call(OWNER, VAULT_ID, "initialize", [vaultCV]), "(ok true)");
  tx("V1 initialize again -> u6020", call(OWNER, VAULT_ID, "initialize", [vaultCV]), "(err u6020)");
  tx("V1 an intent before the pubkey is set -> u6021", exec(OWNER, "execute-jing-deposit", dep, [UPD]), "(err u6021)");
  tx("V1 set-owner-pubkey", call(OWNER, VAULT_ID, "set-owner-pubkey", [bufferCV(Buffer.from(TEST_INTENT_PUBKEY_HEX, "hex"))]), "(ok true)");
  const dep0 = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_20K, 0, 99);
  tx("V1 an intent with limit-price 0 -> u6013 (refused before the signature is even checked)", exec(OWNER, "execute-jing-deposit", dep0, [UPD]), "(err u6013)");
  tx("V1 set-keeper", call(OWNER, VAULT_ID, "set-keeper", [someCV(standardPrincipalCV(KEEPER))]), "(ok true)");
  tx("V1 deposit-sbtc 20k", call(OWNER, VAULT_ID, "deposit-sbtc", [uintCV(SBTC_20K)]), "(ok true)");

  // ---- V2 the vault rests an ask far out of range ----
  tx("V2 keeper executes jing-deposit 20k at +20%", exec(KEEPER, "execute-jing-deposit", dep, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V2 live 20k", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${VAULT_ID})`, "u20000");
  ev("V2 parked 0", MARKET_ID, `(get-token-x-parked '${VAULT_ID})`, "u0");

  // ---- V3 set-limit on the LIVE order ----
  tx("V3 set-limit amount 0 on a live order -> u6006", exec(KEEPER, "execute-jing-set-limit", slZeroLive, [UPD]), "(err u6006)");
  tx("V3 set-limit wrong amount -> u6022", exec(KEEPER, "execute-jing-set-limit", slWrong, [UPD]), "(err u6022)");
  tx("V3 set-limit amount 20k -> ok", exec(KEEPER, "execute-jing-set-limit", slLive, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V3 limit retargeted to +25%", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_FAR2}`);
  tx("V3 execute-jing-reprice on the live ask back to +20%: nothing crosses, a plain reprice on the sBTC side", exec(KEEPER, "execute-jing-reprice", repriceLive, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V3 limit back at +20%", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_FAR}`);
  tx("V3 set-limit to +25% again (the park below wants the worst ask)", exec(KEEPER, "execute-jing-set-limit", intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K, ASK_FAR2, 37), [UPD]), (v) => v.startsWith("(ok 0x"));

  // ---- V4 park the vault: fill the book, then an in-range newcomer ----
  FILLERS.forEach((f, i) => {
    tx(`V4 fund filler ${i + 1}`, call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(FILL), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(f), noneCV()]), "(ok true)");
    tx(`V4 filler ${i + 1} rests 2000 at +5%`, call(f, MARKET_ID, "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), UPD, sbtcTrait, sbtcAsset]), `(ok u${FILL})`);
  });
  ev("V4 book full (50)", MARKET_ID, "(len (get-token-x-depositors (get-current-cycle)))", "u50");
  tx("V4 fund the parker", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(FILL), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(PARKER), noneCV()]), "(ok true)");
  // distance-slots (2026-09-13): an in-range newcomer no longer parks the
  // farthest ask but the N-th best out-of-range one. With N = 10 that is a
  // +5% filler and the vault (+25%, the worst) stays: a whale outside the N
  // best is only ever bumped on size. To exercise the parked flows the
  // operator widens the price region to the whole book, so the vault IS the
  // N-th best and is demoted; the size region is then empty -> parked.
  tx("V4 operator sets distance-slots u50: the vault (+25%, the worst ask) becomes the N-th best", call(CHAVITA, MARKET_ID, "set-distance-slots", [uintCV(50)]), "(ok true)");
  tx("V4 parker rests 2000 in range (-10%) with a fresh update -> the N-th best (the vault) is demoted, nobody outside the region -> parked", call(PARKER, MARKET_ID, "deposit-token-x", [uintCV(FILL), uintCV(ASK_IN), noneCV(), UPD, sbtcTrait, sbtcAsset]), `(ok u${FILL})`);
  ev("V4 vault live 0", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${VAULT_ID})`, "u0");
  ev("V4 vault parked 20k", MARKET_ID, `(get-token-x-parked '${VAULT_ID})`, "u20000");

  // ---- V5 the finding, on the PARKED order ----
  tx("V5 set-limit amount 0 on the parked order -> u6006 (was accepted before the fix)", exec(KEEPER, "execute-jing-set-limit", slZeroParked, [UPD]), "(err u6006)");
  ev("V5 limit untouched (+25%)", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_FAR2}`);
  tx("V5 set-limit amount = parked 20k -> ok", exec(KEEPER, "execute-jing-set-limit", slParked, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V5 limit moved to +30%", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_FAR3}`);
  tx("V5 reprice on a parked order -> market u1005 (needs a live deposit)", exec(KEEPER, "execute-jing-reprice", repriceParked, [UPD]), "(err u1005)");

  // ---- V6 cancel brings the parked balance home ----
  ev("V6 vault sBTC before cancel", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u0)");
  tx("V6 keeper cancels the parked ask", call(KEEPER, VAULT_ID, "cancel-jing-sbtc", []), "(ok true)");
  ev("V6 vault sBTC after cancel", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u20000)");
  ev("V6 parked 0", MARKET_ID, `(get-token-x-parked '${VAULT_ID})`, "u0");

  // ======== V7+: the rest of the vault on the v6 stack: STX side, crossing reprice, the vault as a
  // filled maker (jing-core-v5 credits a registered contract), taker paths both ways, the router
  // both ways, withdraws, expiry, revoke, the wrong key, a stranger ========
  const BID_OUT = Number((MID * 95n) / 100n);   // a bid under the mid rests out of range
  const BID_OUT2 = Number((MID * 94n) / 100n);
  const BID_IN = Number((MID * 101n) / 100n);   // in range: crosses the parker's in-range ask
  const L_SELL_SBTC = Number((MID * 90n) / 100n); // floor for an sBTC seller
  const L_SELL_STX = Number((MID * 110n) / 100n); // ceiling for an STX seller
  const L_ROUTER_STX = Number((MID * 110n) / 100n); // router STX sell at +10%: the book leg (the fillers' +5% asks) absorbs nearly all of it and the
  // rounding dust under one sat's worth stays home (router 6d8b5f2: before, the DLMM refused that dust with u2003 and sank the swap; V11 sold at +4% to dodge it)
  const STX_5 = 5_000_000, STX_20 = 20_000_000, STX_100 = 100_000_000;
  const depStx = intent("jing-deposit", WSTX_ASSET_NAME, STX_5, BID_OUT, 20);
  const slStx = intent("jing-set-limit", WSTX_ASSET_NAME, STX_5, BID_OUT2, 21);
  const repriceCross = intent("jing-reprice", WSTX_ASSET_NAME, STX_5, BID_IN, 22);
  const repriceStay = intent("jing-reprice", WSTX_ASSET_NAME, STX_5, Number((MID * 93n) / 100n), 35); // still out of range: a plain reprice, nothing crosses
  const depStx20 = intent("jing-deposit", WSTX_ASSET_NAME, STX_20, BID_IN, 23); // in range: cleared in the BATCH, which is where the core credits a maker
  const jingSwapSbtc = intent("jing-swap", SBTC_ASSET_NAME, 3000, L_SELL_SBTC, 24);
  const jingSwapStx = intent("jing-swap", WSTX_ASSET_NAME, STX_5, L_SELL_STX, 25);
  const routerSell = intent("router-swap", SBTC_ASSET_NAME, 5000, L_SELL_SBTC, 26);
  const routerSellStale = intent("router-swap", SBTC_ASSET_NAME, 5000, L_SELL_SBTC, 27);
  const routerBuy = intent("router-swap", WSTX_ASSET_NAME, STX_100, L_ROUTER_STX, 28);
  const ASK_OUT20 = Number((MID * 120n) / 100n), ASK_CROSS = Number((MID * 99n) / 100n); // in range: crosses an in-range bid (both would clear in the batch)
  const depSbtc3k = intent("jing-deposit", SBTC_ASSET_NAME, 3000, ASK_OUT20, 38);          // an ask far out of range on the full side (bigger than a filler: it stays, a filler parks)
  const repriceCrossX = intent("jing-reprice", SBTC_ASSET_NAME, 3000, ASK_CROSS, 39);     // repriced into range against an in-range bid: crosses, swaps on the spot (the sBTC-side crossing arm)
  const info = await (await fetch(`${STACKS_NODE_API}/v2/info`)).json();
  const burnTip = Number(info.burn_block_height);
  const expOk = intent("jing-deposit", WSTX_ASSET_NAME, STX_5, BID_OUT, 29, TEST_INTENT_PRIVKEY, burnTip + 1000);
  const expDead = intent("jing-deposit", WSTX_ASSET_NAME, STX_5, BID_OUT, 30, TEST_INTENT_PRIVKEY, 1);
  const revoked = intent("router-swap", SBTC_ASSET_NAME, 5000, L_SELL_SBTC, 31);
  const revokedHash = buildIntentHashHex(revoked.d);
  const revokedByKeeper = intent("router-swap", SBTC_ASSET_NAME, 5000, L_SELL_SBTC, 32);
  const strangerIntent = intent("router-swap", SBTC_ASSET_NAME, 5000, L_SELL_SBTC, 33);
  const wrongKey = intent("jing-deposit", WSTX_ASSET_NAME, STX_5, BID_OUT, 34, WRONG_INTENT_PRIVKEY);
  const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-btc-stx.hex", import.meta.url), "utf8").trim(), "hex"));
  const vaultSbtc = (label, want) => ev(label, SBTC_FQN, `(get-balance '${VAULT_ID})`, want);
  const vaultStx = (label, want) => ev(label, VAULT_ID, "(stx-get-balance current-contract)", want);
  const okHash = (v) => String(v).startsWith("(ok 0x");

  // ---- V7 STX funding ----
  tx("V7 deposit-stx u0 -> u6006", call(OWNER, VAULT_ID, "deposit-stx", [uintCV(0)]), "(err u6006)");
  tx("V7 keeper deposit-stx -> u6001", call(KEEPER, VAULT_ID, "deposit-stx", [uintCV(1_000_000)]), "(err u6001)");
  tx("V7 owner deposit-stx 300", call(OWNER, VAULT_ID, "deposit-stx", [uintCV(STX_300)]), "(ok true)");
  tx("V7 owner deposit-sbtc 40k more", call(OWNER, VAULT_ID, "deposit-sbtc", [uintCV(SBTC_EXTRA)]), "(ok true)");
  vaultStx("V7 vault STX 300", `u${STX_300}`);
  vaultSbtc("V7 vault sBTC 60k", "(ok u60000)");

  // ---- V8 STX-side deposit, set-limit, then the CROSSING reprice against the parker's in-range ask ----
  tx("V8 wrong key -> u6002", exec(KEEPER, "execute-jing-deposit", wrongKey, [UPD]), "(err u6002)");
  tx("V8 replay of the V2 intent -> u6003", exec(KEEPER, "execute-jing-deposit", dep, [UPD]), "(err u6003)");
  tx("V8 keeper executes jing-deposit STX side: 5 STX bid at -5% (out of range)", exec(KEEPER, "execute-jing-deposit", depStx, [UPD]), okHash);
  ev("V8 vault bid rests 5 STX", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, `u${STX_5}`);
  tx("V8 set-limit on the STX bid to -6% -> ok (amount = the resting 5 STX)", exec(KEEPER, "execute-jing-set-limit", slStx, [UPD]), okHash);
  ev("V8 bid limit at -6%", MARKET_ID, `(get-token-y-limit '${VAULT_ID})`, `u${BID_OUT2}`);
  tx("V8 reprice the bid to -7%: still out of range, nothing crosses, a plain reprice (no swap logged)", exec(KEEPER, "execute-jing-reprice", repriceStay, [UPD]), okHash);
  ev("V8 bid limit at -7%", MARKET_ID, `(get-token-y-limit '${VAULT_ID})`, `u${(MID * 93n) / 100n}`);
  vaultSbtc("V8 vault sBTC before the crossing", "(ok u60000)");
  tx("V8 reprice the bid to +1%: crosses the parker's in-range ask -> swaps on the spot (fill-or-kill), logged as a swap", exec(KEEPER, "execute-jing-reprice", repriceCross, [UPD]), okHash);
  ev("V8 vault bid gone (dust at most)", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, (v) => BigInt(String(v).replace(/^u/, "")) < 1_000_000n);
  vaultSbtc("V8 vault sBTC grew by the crossing fill", (v) => BigInt((String(v).match(/u(\d+)/) || [, "0"])[1]) > 60_000n);
  ev("V8 the parker's in-range ask was consumed (dust refunded)", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${PARKER})`, (v) => BigInt(String(v).replace(/^u/, "")) < 1000n);

  // ---- V9 the vault as a MAKER that gets filled: a 20 STX bid IN RANGE (+1%, the parker's ask is gone so
  // nothing crosses), cleared in the batch at the mid by an sBTC seller; the batch distribution is where
  // jing-core-v5 credits a registered contract's proceeds (credit-if-registered; a walk fill only debits),
  // then the keeper cancels the rest ----
  tx("V9 keeper executes jing-deposit STX side: 20 STX bid at +1% (in range)", exec(KEEPER, "execute-jing-deposit", depStx20, [UPD]), okHash);
  ev("V9 vault bid rests 20 STX", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, `u${STX_20}`);
  const eq0 = cap("V9 vault sBTC equity in jing-core-v5 before the fill", CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`);
  tx("V9 an sBTC seller swaps 3000 sats at a -10% limit: the batch clears part of the vault's bid at the mid", call(SBTC_DEPOSITOR_1, MARKET_ID, "swap", [uintCV(3000), uintCV(L_SELL_SBTC), UPD, sbtcTrait, sbtcAsset, wstxTrait, wstxAsset, trueCV()]), (v) => String(v).startsWith("(ok"));
  ev("V9 the vault's bid shrank", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, (v) => { const n = BigInt(String(v).replace(/^u/, "")); return n > 0n && n < BigInt(STX_20); });
  const eq1 = cap("V9 vault sBTC equity in jing-core-v5 after the fill", CORE_ID, `(get-token-equity '${SBTC_FQN} '${VAULT_ID})`);
  tx("V9 keeper cancels the STX bid: the rest comes home", call(KEEPER, VAULT_ID, "cancel-jing-stx", []), "(ok true)");
  ev("V9 vault bid 0", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, "u0");

  // ---- V10 taker paths straight into the market, both sides ----
  tx("V10 a direct maker rests a 100 STX bid at -5%", call(STX_DEPOSITOR_1, MARKET_ID, "deposit-token-y", [uintCV(STX_100), uintCV(BID_OUT), noneCV(), UPD, wstxTrait, wstxAsset]), `(ok u${STX_100})`);
  vaultStx("V10 vault STX before: 300 minus the crossing reprice's 5 STX (+ rebate) and the ~9 STX the batch cleared in V9", (v) => { const n = BigInt(String(v).replace(/^u/, "")); return n < BigInt(STX_300) - 5_000_000n && n > BigInt(STX_300) - 20_000_000n; });
  tx("V10 execute-jing-swap sBTC side: 3000 sats at -10%, fill-or-kill, walks the bid", exec(KEEPER, "execute-jing-swap", jingSwapSbtc, [UPD]), okHash);
  const vx0 = cap("V10 vault STX after the sBTC-side taker swap", VAULT_ID, "(stx-get-balance current-contract)");
  tx("V10 execute-jing-swap STX side: 5 STX at +10%, walks the fillers' asks at +5%", exec(KEEPER, "execute-jing-swap", jingSwapStx, [UPD]), okHash);
  const vx1 = cap("V10 vault STX after the STX-side taker swap", VAULT_ID, "(stx-get-balance current-contract)");

  // ---- V11 the router both ways (book leg sized from the mid, DLMM next), a stale update falls back to the pools ----
  vaultStx("V11 vault STX before the router sell", () => true);
  tx("V11 execute-router-swap 5000 sats -> STX with a fresh update + mid", exec(KEEPER, "execute-router-swap", routerSell, [someCV(UPD), uintCV(Number(MID))]), okHash);
  tx("V11 execute-router-swap 5000 sats with a STALE update: the book leg is caught, pools only, still ok", exec(KEEPER, "execute-router-swap", routerSellStale, [someCV(STALE), uintCV(Number(MID))]), okHash);
  vaultSbtc("V11 vault sBTC before the router buy", () => true);
  tx("V11 execute-router-swap 100 STX -> sBTC at +10%: the book leg takes the +5% asks, the dust under one sat stays home (router 6d8b5f2)", exec(KEEPER, "execute-router-swap", routerBuy, [someCV(UPD), uintCV(Number(MID))]), okHash);
  vaultSbtc("V11 vault sBTC after", () => true);

  // ---- V11b the sBTC-side CROSSING reprice: a 3000-sat ask repriced into range against an in-range bid swaps into it
  // (an ask under an out-of-range bid does not cross: only makers that would clear together at the mid do) ----
  tx("V11b the direct maker adds 50 STX at +1%: its position merges and reprices IN RANGE (no ask inside: nothing crosses)", call(STX_DEPOSITOR_1, MARKET_ID, "deposit-token-y", [uintCV(50_000_000), uintCV(BID_IN), noneCV(), UPD, wstxTrait, wstxAsset]), (v) => String(v).startsWith("(ok u"));
  tx("V11b keeper executes jing-deposit sBTC side: 3000 sats at +20% on the full side (bigger than a 2000-sat filler: it stays, the smallest parks)", exec(KEEPER, "execute-jing-deposit", depSbtc3k, [UPD]), okHash);
  ev("V11b vault ask rests 3000 live", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${VAULT_ID})`, "u3000");
  const vy0 = cap("V11b vault STX before the crossing", VAULT_ID, "(stx-get-balance current-contract)");
  tx("V11b reprice the ask to -1% (in range): crosses the in-range bid -> swaps on the spot, logged as a vault swap", exec(KEEPER, "execute-jing-reprice", repriceCrossX, [UPD]), okHash);
  ev("V11b vault ask gone (dust at most)", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${VAULT_ID})`, (v) => BigInt(String(v).replace(/^u/, "")) < 1000n);
  const vy1 = cap("V11b vault STX after the crossing", VAULT_ID, "(stx-get-balance current-contract)");

  // ---- V12 withdraws ----
  tx("V12 owner withdraws 1000 sats", call(OWNER, VAULT_ID, "withdraw-sbtc", [uintCV(1000)]), "(ok true)");
  tx("V12 keeper withdraw-sbtc -> u6001", call(KEEPER, VAULT_ID, "withdraw-sbtc", [uintCV(1000)]), "(err u6001)");
  tx("V12 withdraw-sbtc u0 -> u6006", call(OWNER, VAULT_ID, "withdraw-sbtc", [uintCV(0)]), "(err u6006)");
  tx("V12 owner withdraws 1 STX", call(OWNER, VAULT_ID, "withdraw-stx", [uintCV(1_000_000)]), "(ok true)");
  tx("V12 keeper withdraw-stx -> u6001", call(KEEPER, VAULT_ID, "withdraw-stx", [uintCV(1_000_000)]), "(err u6001)");
  tx("V12 withdraw-stx u0 -> u6006", call(OWNER, VAULT_ID, "withdraw-stx", [uintCV(0)]), "(err u6006)");

  // ---- V13 expiry ----
  tx("V13 an intent expiring in 1000 burn blocks -> ok", exec(KEEPER, "execute-jing-deposit", expOk, [UPD]), okHash);
  tx("V13 keeper cancels it again", call(KEEPER, VAULT_ID, "cancel-jing-stx", []), "(ok true)");
  tx("V13 an intent with expiry u1 -> u6004", exec(KEEPER, "execute-jing-deposit", expDead, [UPD]), "(err u6004)");

  // ---- V14 revoke ----
  tx("V14 stranger revokes -> u6001", call(SBTC_DEPOSITOR_1, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(revokedHash, "hex"))]), "(err u6001)");
  tx("V14 owner revokes an unused intent", call(OWNER, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(revokedHash, "hex"))]), "(ok true)");
  tx("V14 executing the revoked intent -> u6003", exec(KEEPER, "execute-router-swap", revoked, [someCV(UPD), uintCV(Number(MID))]), "(err u6003)");
  tx("V14 revoking twice -> u6003", call(OWNER, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(revokedHash, "hex"))]), "(err u6003)");
  tx("V14 the keeper can revoke too", call(KEEPER, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(buildIntentHashHex(revokedByKeeper.d), "hex"))]), "(ok true)");

  // ---- V15 a stranger with a valid intent ----
  tx("V15 stranger executes a valid intent -> u6001", exec(SBTC_DEPOSITOR_1, "execute-router-swap", strangerIntent, [someCV(UPD), uintCV(Number(MID))]), "(err u6001)");
  tx("V15 the direct maker cancels what is left of its bid", call(STX_DEPOSITOR_1, MARKET_ID, "cancel-token-y-deposit", [wstxTrait, wstxAsset]), (v) => String(v).startsWith("(ok u"));

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  steps.forEach((st, i) => { const raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); if (st.capture) { st.value = BigInt((String(raw).match(/u(\d+)/) || [, "0"])[1]); console.log(`  ..   ${st.label}: ${raw}`); } else assert(st.label, raw, st.want); });
  assert("V9 the fill credited the vault's sBTC equity in the core (credit-if-registered: a registered maker)", eq1.value - eq0.value, (d) => d > 0n);
  assert("V10 the STX-side taker swap took the 5 STX from the vault, less the sub-minimum dust the walk refunds", vx0.value - vx1.value, (d) => d > 4_000_000n && d <= 5_000_000n);
  assert("V11b the sBTC-side crossing paid the vault STX", vy1.value - vy0.value, (d) => d > 0n);
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
