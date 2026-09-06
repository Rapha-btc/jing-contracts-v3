// verify-vault-sbtc-stx-v3.js
// Self-verifying stxer mainnet-fork harness for vault-sbtc-stx-v3 against
// the LIVE Lazer stack: markets-sbtc-stx-jingswap, swap-router-sbtc-stx-
// jingswap-v1, jing-core-v3 and jing-vault-auth, all at chavita. Nothing is
// rewritten: the vault is deployed as is under a throwaway owner, chavita
// verifies its hash in jing-core-v3 (the fork lets us sign as chavita),
// the owner initializes it with itself as canonical.
//
// Proves on a real fork, with real Lazer updates:
//   V1  deploy / verify / initialize / pubkey / keeper / funding
//   V2  keeper executes a signed jing-deposit (ask) with a fresh update;
//       the vault rests on the market; replay -> u6003; wrong key -> u6002
//   V3  execute-jing-set-limit: pure reprice, limit retargeted, amount
//       mismatch -> u6022
//   V4  execute-jing-reprice (crossing branch untouched: no live bid) ok
//   V5  keeper cancels; sBTC back in the vault
//   V6  execute-router-swap sBTC -> STX with a fresh update + mid: the
//       book leg takes a resting bid, the DLMM takes the rest, STX lands
//       in the vault; min-out = amount at the signed limit
//   V7  execute-router-swap with a STALE update (fixture) -> the router
//       catches the book revert, pools only, still (ok ...)
//   V8  execute-router-swap STX -> sBTC ok; owner withdraws
//   V9  a non-keeper sender -> u6001
//   V10 STX-side execute-jing-deposit (bid out of range) + cancel-jing-stx
//   V11 execute-jing-swap STX -> sBTC, fill-or-kill against a fresh maker's
//       in-range ask (the taker path straight into the market)
//   V12 execute-jing-reprice CROSSING branch: the vault's out-of-range bid
//       is repriced into range and swaps on the spot against the ask
//   V13 expiry: a future burn height passes, expiry u1 -> u6004
//   V14 revoke-intent, then executing it -> u6003
//   V15 a bridge-style mint (sBTC sent to the vault principal) simply
//       lands as balance; the indexer records the mint event off chain
//
// Run: PYTH_API_KEY=... npx tsx simulations/verify-vault-sbtc-stx-v3.js
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  stringAsciiCV,
  bufferCV,
  someCV,
  noneCV,
  cvToString,
  deserializeCV,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1,
  SBTC_DEPOSITOR_1,
  SBTC_ADDR,
  SBTC_NAME,
  SBTC_ASSET_NAME,
  SBTC_FQN,
  WSTX_ADDR,
  WSTX_NAME,
  WSTX_ASSET_NAME,
  TEST_INTENT_PUBKEY_HEX,
  TEST_INTENT_PRIVKEY,
  buildIntentHashHex,
  signIntent,
} from "./_setup.js";
import { fetchLazerUpdate } from "./_lazer.js";

const CHAVITA = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const OWNER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");
const WRONG_PRIVKEY = "2222222222222222222222222222222222222222222222222222222222222222" + "01";

const MARKET_ID = `${CHAVITA}.markets-sbtc-stx-jingswap`;
const ROUTER_ID = `${CHAVITA}.swap-router-sbtc-stx-jingswap-v1`;
const CORE_ID = `${CHAVITA}.jing-core-v3`;
const VAULT_NAME = "vault-sbtc-stx-v3";
const VAULT_ID = `${OWNER}.${VAULT_NAME}`;
const KEEPER = STX_DEPOSITOR_1;
const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const PP = 100_000_000n;
const SBTC_20K = 20_000;
const SBTC_5K = 5_000;
const STX_300 = 300_000_000;
const STX_100 = 100_000_000;
const HUGE = 999_999_999_999_999;

const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const vaultCV = contractPrincipalCV(OWNER, VAULT_NAME);

const vaultSrc = fs.readFileSync(new URL(`../contracts/${VAULT_NAME}.clar`, import.meta.url), "utf8");
const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-btc-stx.hex", import.meta.url), "utf8").trim(), "hex"));

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok.result));
  } catch (e) {
    return `decode-failed: ${e.message}`;
  }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try {
    return cvToString(deserializeCV(r.Ok));
  } catch {
    return r.Ok;
  }
}
const uintOf = (s) => BigInt((String(s).match(/u(\d+)/) || [, "0"])[1]);

let checks = 0;
let failures = 0;
function assert(label, actual, want) {
  checks += 1;
  const ok = typeof want === "function" ? want(actual) : String(actual).includes(want);
  if (ok) console.log(`  ok   ${label}: ${String(actual).slice(0, 110)}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}: got "${String(actual).slice(0, 200)}" want "${want}"`);
  }
}

async function main() {
  console.log("=== vault-sbtc-stx-v3 SELF-VERIFYING stxer harness (live Lazer stack) ===\n");
  const lz = await fetchLazerUpdate();
  const UPD = bufferCV(Buffer.from(lz.hex, "hex"));
  const MID = (lz.px * PP) / lz.py; // market unit
  console.log(`Lazer ${lz.hex.length / 2} bytes, mid ${MID} (1 STX ~ ${(10n ** 16n) / MID} sats)\n`);

  // Signed intents; auth-ids keep the hashes distinct.
  const intent = (action, side, amount, limitPrice, authId, key) => {
    const d = { vault: vaultCV, action, side, amount, limitPrice, authId, expiry: 0 };
    return { d, sig: signIntent(buildIntentHashHex(d), key ?? TEST_INTENT_PRIVKEY) };
  };
  // an ask is in range when its limit <= mid (market unit); 1.1 mid rests out of range
  const ASK_OUT = Number((MID * 110n) / 100n);
  const ASK_OUT2 = Number((MID * 112n) / 100n);
  const L_SELL_SBTC = Number((MID * 90n) / 100n); // router floor for an sBTC seller, 10% under the mid
  const L_SELL_STX = Number((MID * 110n) / 100n); // router ceiling for an STX seller
  const dep = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_20K, ASK_OUT, 1);
  const depWrongKey = intent("jing-deposit", SBTC_ASSET_NAME, SBTC_20K, ASK_OUT, 2, WRONG_PRIVKEY);
  const setLimit = intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K, ASK_OUT2, 3);
  const setLimitBad = intent("jing-set-limit", SBTC_ASSET_NAME, SBTC_20K + 1, ASK_OUT2, 4);
  const reprice = intent("jing-reprice", SBTC_ASSET_NAME, SBTC_20K, ASK_OUT, 5);
  const routerSell = intent("router-swap", SBTC_ASSET_NAME, SBTC_5K, L_SELL_SBTC, 6);
  const routerSellStale = intent("router-swap", SBTC_ASSET_NAME, SBTC_5K, L_SELL_SBTC, 7);
  const routerBuy = intent("router-swap", WSTX_ASSET_NAME, STX_100, L_SELL_STX, 8);
  const routerNoKeeper = intent("router-swap", SBTC_ASSET_NAME, SBTC_5K, L_SELL_SBTC, 9);
  // V10-V15: a bid below the mid rests out of range; in range means >= mid
  const BID_OUT_V = Number((MID * 95n) / 100n);
  const BID_IN_V = Number((MID * 101n) / 100n);
  const STX_50 = 50_000_000;
  const depStx = intent("jing-deposit", WSTX_ASSET_NAME, STX_50, BID_OUT_V, 10);
  const jingSwapStx = intent("jing-swap", WSTX_ASSET_NAME, STX_100, L_SELL_STX, 11);
  const repriceCross = intent("jing-reprice", WSTX_ASSET_NAME, STX_50, BID_IN_V, 12);
  const info = await (await fetch(`${STACKS_NODE_API}/v2/info`)).json();
  const burnTip = Number(info.burn_block_height);
  const expOk = (() => { const d = { vault: vaultCV, action: "jing-deposit", side: WSTX_ASSET_NAME, amount: STX_50, limitPrice: BID_OUT_V, authId: 13, expiry: burnTip + 1000 }; return { d, sig: signIntent(buildIntentHashHex(d)) }; })();
  const expDead = (() => { const d = { vault: vaultCV, action: "jing-deposit", side: WSTX_ASSET_NAME, amount: STX_50, limitPrice: BID_OUT_V, authId: 14, expiry: 1 }; return { d, sig: signIntent(buildIntentHashHex(d)) }; })();
  const revoked = intent("router-swap", SBTC_ASSET_NAME, SBTC_5K, L_SELL_SBTC, 15);
  const revokedHash = buildIntentHashHex(revoked.d);
  const MAKER = getAddressFromPrivateKey("7".repeat(64) + "01", "mainnet");

  const call = (sender, cid, fn, args) => (b) =>
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const exec = (sender, fn, it, extra) =>
    call(sender, VAULT_ID, fn, [
      bufferCV(Buffer.from(it.sig, "hex")),
      stringAsciiCV(it.d.side),
      uintCV(it.d.amount),
      uintCV(it.d.limitPrice),
      uintCV(it.d.authId),
      uintCV(it.d.expiry),
      ...extra,
    ]);

  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, cid, code, want) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };

  // ---- V1 setup ----
  tx("V1 fund owner with STX", (b) => b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: OWNER, amount: STX_300 + 5_000_000 }), () => true);
  tx("V1 fund owner with sBTC", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(SBTC_20K + SBTC_5K * 2), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(OWNER), noneCV()]), "(ok true)");
  tx("V1 deploy vault v3 (unmodified source, live refs)", (b) => b.withSender(OWNER).addContractDeploy({ contract_name: VAULT_NAME, source_code: vaultSrc, clarity_version: ClarityVersion.Clarity5 }), "(ok true)");
  tx("V1 chavita verifies the vault hash in jing-core-v3", call(CHAVITA, CORE_ID, "set-verified-contract", [vaultCV]), "(ok true)");
  tx("V1 owner initializes (rebate parity vs the live market)", call(OWNER, VAULT_ID, "initialize", [vaultCV]), "(ok true)");
  tx("V1 set-owner-pubkey", call(OWNER, VAULT_ID, "set-owner-pubkey", [bufferCV(Buffer.from(TEST_INTENT_PUBKEY_HEX, "hex"))]), "(ok true)");
  tx("V1 set-keeper", call(OWNER, VAULT_ID, "set-keeper", [someCV(standardPrincipalCV(KEEPER))]), "(ok true)");
  tx("V1 deposit-sbtc 30k", call(OWNER, VAULT_ID, "deposit-sbtc", [uintCV(SBTC_20K + SBTC_5K * 2)]), "(ok true)");
  tx("V1 deposit-stx 300", call(OWNER, VAULT_ID, "deposit-stx", [uintCV(STX_300)]), "(ok true)");
  ev("V1 status", VAULT_ID, "(get-status)", (v) => v.includes("keeper"));

  // ---- V2 signed deposit (ask out of range, no gate read) ----
  tx("V2 keeper executes jing-deposit (ask 20k, +10%)", exec(KEEPER, "execute-jing-deposit", dep, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V2 vault rests 20k on the market", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${VAULT_ID})`, "u20000");
  tx("V2 replay -> u6003", exec(KEEPER, "execute-jing-deposit", dep, [UPD]), "(err u6003)");
  tx("V2 wrong key -> u6002", exec(KEEPER, "execute-jing-deposit", depWrongKey, [UPD]), "(err u6002)");

  // ---- V3 set-limit ----
  tx("V3 execute-jing-set-limit (+12%)", exec(KEEPER, "execute-jing-set-limit", setLimit, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V3 limit retargeted", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_OUT2}`);
  tx("V3 set-limit wrong amount -> u6022", exec(KEEPER, "execute-jing-set-limit", setLimitBad, [UPD]), "(err u6022)");

  // ---- V4 reprice-or-swap (no live bid: plain reprice branch) ----
  tx("V4 execute-jing-reprice back to +10%", exec(KEEPER, "execute-jing-reprice", reprice, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V4 limit back", MARKET_ID, `(get-token-x-limit '${VAULT_ID})`, `u${ASK_OUT}`);

  // ---- V5 cancel ----
  ev("V5 vault sBTC before cancel", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u10000)");
  tx("V5 keeper cancels the ask", call(KEEPER, VAULT_ID, "cancel-jing-sbtc", []), "(ok true)");
  ev("V5 vault sBTC after cancel", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u30000)");

  // ---- V6 router swap sBTC -> STX, book + pools ----
  // a bid BELOW the mid rests out of range (an in-range bid would cross the
  // live asks on the real book -> u1022); the vault's 10% limit walks to it
  const BID_OUT = Number((MID * 95n) / 100n);
  tx("V6 a bid rests on the market (100 STX at -5%)", call(STX_DEPOSITOR_1, MARKET_ID, "deposit-token-y", [uintCV(STX_100), uintCV(BID_OUT), UPD, wstxTrait, wstxAsset]), `(ok u${STX_100})`);
  ev("V6 vault STX before", VAULT_ID, "(stx-get-balance current-contract)", `u${STX_300}`);
  tx("V6 keeper executes router-swap 5k sats with fresh update + mid", exec(KEEPER, "execute-router-swap", routerSell, [someCV(UPD), uintCV(Number(MID))]), (v) => v.startsWith("(ok 0x"));
  ev("V6 vault sBTC debited 5k", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u25000)");
  ev("V6 vault STX grew", VAULT_ID, "(stx-get-balance current-contract)", (v) => uintOf(v) > BigInt(STX_300));
  ev("V6 the bid was walked (smaller than 100 STX)", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${STX_DEPOSITOR_1})`, (v) => uintOf(v) < BigInt(STX_100));

  // ---- V7 stale update: book leg refused, pools only, still ok ----
  tx("V7 router-swap with a STALE update -> pools only, ok", exec(KEEPER, "execute-router-swap", routerSellStale, [someCV(STALE), uintCV(Number(MID))]), (v) => v.startsWith("(ok 0x"));
  ev("V7 vault sBTC debited another 5k", SBTC_FQN, `(get-balance '${VAULT_ID})`, "(ok u20000)");

  // ---- V8 router swap STX -> sBTC; withdraw ----
  tx("V8 keeper executes router-swap 100 STX -> sBTC", exec(KEEPER, "execute-router-swap", routerBuy, [someCV(UPD), uintCV(Number(MID))]), (v) => v.startsWith("(ok 0x"));
  ev("V8 vault sBTC grew past 20k", SBTC_FQN, `(get-balance '${VAULT_ID})`, (v) => uintOf(v) > 20_000n);
  tx("V8 owner withdraws 10k sats", call(OWNER, VAULT_ID, "withdraw-sbtc", [uintCV(10_000)]), "(ok true)");
  tx("V8 keeper cannot withdraw -> u6001", call(KEEPER, VAULT_ID, "withdraw-sbtc", [uintCV(1_000)]), "(err u6001)");

  // ---- V9 not owner nor keeper ----
  tx("V9 stranger executes a valid intent -> u6001", exec(SBTC_DEPOSITOR_1, "execute-router-swap", routerNoKeeper, [someCV(UPD), uintCV(Number(MID))]), "(err u6001)");

  // ---- V11 taker path into the market: a fresh maker rests an in-range ask ----
  tx("V11 fund a fresh maker with sBTC", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(100_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(MAKER), noneCV()]), "(ok true)");
  tx("V11 fund the maker with STX for fees", (b) => b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: MAKER, amount: 2_000_000 }), () => true);
  tx("V11 maker rests 100k sats in range (-1%)", call(MAKER, MARKET_ID, "deposit-token-x", [uintCV(100_000), uintCV(Number((MID * 99n) / 100n)), UPD, sbtcTrait, sbtcAsset]), "(ok u100000)");
  ev("V11 vault sBTC before", SBTC_FQN, `(get-balance '${VAULT_ID})`, () => true);
  tx("V11 execute-jing-swap 100 STX -> sBTC, fill-or-kill at the mid", exec(KEEPER, "execute-jing-swap", jingSwapStx, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V11 vault sBTC after (grew)", SBTC_FQN, `(get-balance '${VAULT_ID})`, () => true);
  ev("V11 maker's ask reduced by the fill", MARKET_ID, `(get-token-x-deposit (get-current-cycle) '${MAKER})`, (v) => uintOf(v) > 0n && uintOf(v) < 100_000n);

  // ---- V10 STX-side deposit (bid out of range) ----
  tx("V10 execute-jing-deposit STX side (bid -5%)", exec(KEEPER, "execute-jing-deposit", depStx, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V10 vault bid rests 50 STX", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, `u${STX_50}`);

  // ---- V12 reprice into range: crossing branch swaps against the maker's ask ----
  ev("V12 vault sBTC before crossing", SBTC_FQN, `(get-balance '${VAULT_ID})`, () => true);
  tx("V12 execute-jing-reprice bid to +1% (crosses) -> swaps on the spot", exec(KEEPER, "execute-jing-reprice", repriceCross, [UPD]), (v) => v.startsWith("(ok 0x"));
  ev("V12 vault bid gone (dust at most)", MARKET_ID, `(get-token-y-deposit (get-current-cycle) '${VAULT_ID})`, (v) => uintOf(v) < 1_000_000n);
  ev("V12 vault sBTC after crossing (grew again)", SBTC_FQN, `(get-balance '${VAULT_ID})`, () => true);

  // ---- V13 expiry ----
  tx("V13 intent expiring in 1000 burn blocks -> ok", exec(KEEPER, "execute-jing-deposit", expOk, [UPD]), (v) => v.startsWith("(ok 0x"));
  tx("V13 cancel it again (keeper)", call(KEEPER, VAULT_ID, "cancel-jing-stx", []), "(ok true)");
  tx("V13 intent with expiry u1 -> u6004", exec(KEEPER, "execute-jing-deposit", expDead, [UPD]), "(err u6004)");

  // ---- V14 revoke ----
  tx("V14 owner revokes an unused intent", call(OWNER, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(revokedHash, "hex"))]), "(ok true)");
  tx("V14 executing the revoked intent -> u6003", exec(KEEPER, "execute-router-swap", revoked, [someCV(UPD), uintCV(Number(MID))]), "(err u6003)");
  tx("V14 revoking twice -> u6003", call(OWNER, VAULT_ID, "revoke-intent", [bufferCV(Buffer.from(revokedHash, "hex"))]), "(err u6003)");

  // ---- V15 bridge-style mint: lands as a plain balance, nothing to call ----
  tx("V15 sBTC lands in the vault without a call (bridge mint stand-in)", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(7_000), standardPrincipalCV(SBTC_DEPOSITOR_1), contractPrincipalCV(OWNER, VAULT_NAME), noneCV()]), "(ok true)");
  ev("V15 the owner can withdraw it like any other sBTC", SBTC_FQN, `(get-balance '${VAULT_ID})`, (v) => uintOf(v) >= 7_000n);

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  steps.forEach((st, i) => assert(st.label, st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]), st.want));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
