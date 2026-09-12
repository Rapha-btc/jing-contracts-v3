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
//   V4  PARK it: 49 fillers rest closer asks (book = 50), a 50th newcomer
//       with an in-range ask (fresh update) parks the farthest = the vault
//   V5  PARKED order: set-limit amount 0 -> u6006 (the finding), amount =
//       parked -> ok and the limit moves, reprice on parked -> market
//       u1005 (needs a live deposit)
//   V6  keeper cancels: the parked 20k comes back to the vault
//
// Run: PYTH_API_KEY=... npx tsx simulations/verify-vault-sbtc-stx-v6-parked.js
import fs from "node:fs";
import {
  ClarityVersion, uintCV, contractPrincipalCV, standardPrincipalCV, stringAsciiCV, bufferCV,
  someCV, noneCV, cvToString, deserializeCV, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_ADDR, SBTC_NAME, SBTC_ASSET_NAME, SBTC_FQN,
  WSTX_ADDR, WSTX_NAME, WSTX_ASSET_NAME, TEST_INTENT_PUBKEY_HEX, TEST_INTENT_PRIVKEY,
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
const FILL = 2_000;
const sbtcTrait = contractPrincipalCV(SBTC_ADDR, SBTC_NAME);
const wstxTrait = contractPrincipalCV(WSTX_ADDR, WSTX_NAME);
const sbtcAsset = stringAsciiCV(SBTC_ASSET_NAME);
const wstxAsset = stringAsciiCV(WSTX_ASSET_NAME);
const vaultCV = contractPrincipalCV(OWNER, VAULT_NAME);
const vaultSrc = fs.readFileSync(new URL(`../contracts/${VAULT_NAME}.clar`, import.meta.url), "utf8");
const srcOf = (n) => fs.readFileSync(new URL(`../contracts/${n}.clar`, import.meta.url), "utf8");

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

  const intent = (action, side, amount, limitPrice, authId) => { const d = { vault: vaultCV, action, side, amount, limitPrice, authId, expiry: 0 }; return { d, sig: signIntent(buildIntentHashHex(d), TEST_INTENT_PRIVKEY) }; };
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

  const call = (sender, cid, fn, args) => (b) => b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const exec = (sender, fn, it, extra) => call(sender, VAULT_ID, fn, [bufferCV(Buffer.from(it.sig, "hex")), stringAsciiCV(it.d.side), uintCV(it.d.amount), uintCV(it.d.limitPrice), uintCV(it.d.authId), uintCV(it.d.expiry), ...extra]);
  const steps = [];
  let b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); };
  const ev = (label, cid, code, want) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); };

  // ---- P0 the next stack, deployed on the fork under chavita ----
  tx("P0 deploy jing-core-v5", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: CORE_NAME, source_code: srcOf(CORE_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("P0 deploy markets-sbtc-stx-jing-v6", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: MARKET_NAME, source_code: srcOf(MARKET_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  tx("P0 core-v5 verifies the market", call(CHAVITA, CORE_ID, "set-verified-contract", [contractPrincipalCV(CHAVITA, MARKET_NAME)]), "(ok true)");
  tx("P0 initialize the market (mins 1000 / 1 STX, feeds 1 / 45)", call(CHAVITA, MARKET_ID, "initialize", [contractPrincipalCV(CHAVITA, MARKET_NAME), sbtcTrait, wstxTrait, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)");
  tx("P0 deploy swap-router-sbtc-stx-jing-v5", (b) => b.withSender(CHAVITA).addContractDeploy({ contract_name: ROUTER_NAME, source_code: srcOf(ROUTER_NAME), clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  ev("P0 x book empty", MARKET_ID, "(len (get-token-x-depositors (get-current-cycle)))", "u0");

  // ---- V1 setup ----
  tx("V1 fund owner with STX", (b) => b.addSTXTransfer({ sender: STX_DEPOSITOR_1, recipient: OWNER, amount: 5_000_000 }), () => true);
  tx("V1 fund owner with sBTC", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(SBTC_20K), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(OWNER), noneCV()]), "(ok true)");
  tx("V1 deploy vault v6 (source as is, next-stack refs)", (b) => b.withSender(OWNER).addContractDeploy({ contract_name: VAULT_NAME, source_code: vaultSrc, clarity_version: ClarityVersion.Clarity5 }), "(ok true)");
  tx("V1 chavita verifies the vault hash in jing-core-v5", call(CHAVITA, CORE_ID, "set-verified-contract", [vaultCV]), "(ok true)");
  tx("V1 owner initializes", call(OWNER, VAULT_ID, "initialize", [vaultCV]), "(ok true)");
  tx("V1 set-owner-pubkey", call(OWNER, VAULT_ID, "set-owner-pubkey", [bufferCV(Buffer.from(TEST_INTENT_PUBKEY_HEX, "hex"))]), "(ok true)");
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

  // ---- V4 park the vault: fill the book, then an in-range newcomer ----
  FILLERS.forEach((f, i) => {
    tx(`V4 fund filler ${i + 1}`, call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(FILL), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(f), noneCV()]), "(ok true)");
    tx(`V4 filler ${i + 1} rests 2000 at +5%`, call(f, MARKET_ID, "deposit-token-x", [uintCV(FILL), uintCV(ASK_NEAR), noneCV(), UPD, sbtcTrait, sbtcAsset]), `(ok u${FILL})`);
  });
  ev("V4 book full (50)", MARKET_ID, "(len (get-token-x-depositors (get-current-cycle)))", "u50");
  tx("V4 fund the parker", call(SBTC_DEPOSITOR_1, SBTC_FQN, "transfer", [uintCV(FILL), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(PARKER), noneCV()]), "(ok true)");
  tx("V4 parker rests 2000 in range (-10%) with a fresh update -> parks the farthest ask", call(PARKER, MARKET_ID, "deposit-token-x", [uintCV(FILL), uintCV(ASK_IN), noneCV(), UPD, sbtcTrait, sbtcAsset]), `(ok u${FILL})`);
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

  const sid = await b.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const res = await getSimulationResult(sid);
  const s = res.steps;
  steps.forEach((st, i) => assert(st.label, st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]), st.want));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((err) => { console.error(err); process.exit(1); });
