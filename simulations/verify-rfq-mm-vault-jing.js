// verify-rfq-mm-vault-jing.js
// SELF-VERIFYING stxer mainnet-fork harness for rfq-mm-vault-jing against
// rfq-sbtc-stx-jing-v2 (banded + kill-switch). The vault is the on-chain MM:
// the client signs the VAULT PRINCIPAL as the SIP-018 winner, the operator
// (backend hot key) proxies fix-price/fulfill through it, the STX float pays
// settlement, the escrowed sBTC lands in the vault, and only the owner can
// withdraw -- only to itself.
//
// Run: npx tsx simulations/verify-rfq-mm-vault-jing.js
import {
  uintCV,
  bufferCV,
  stringAsciiCV,
  standardPrincipalCV,
  contractPrincipalCV,
  noneCV,
  trueCV,
  deserializeCV,
  cvToString,
  getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import fs from "node:fs";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1,
  SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  buildRfqAuthHashHexV2, signIntent,
  TEST_INTENT_PRIVKEY,
} from "./_setup.js";

const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet");

const CORE = "jing-core-v2";
const MARKET = "rfq-sbtc-stx-jing-v2";
const VAULT = "rfq-mm-vault-jing";
const CORE_ID = `${DEPLOYER}.${CORE}`;
const MARKET_ID = `${DEPLOYER}.${MARKET}`;
const VAULT_ID = `${DEPLOYER}.${VAULT}`;
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);
const vaultCV = contractPrincipalCV(DEPLOYER, VAULT);

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";

const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");
const VAULT_OWNER = STX_DEPOSITOR_1;   // Yguazu stand-in: STX whale funds the float
const OPERATOR = DEPLOYER;             // backend hot key stand-in
const MM_WHALE = STX_DEPOSITOR_1;      // tries to steal the vault's signed win

const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";
const FLOAT = 2_000_000_000n;          // 2,000 STX float

const coreSrc = fs.readFileSync(new URL(`../contracts/rfq/deploying/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/rfq/${MARKET}.clar`, import.meta.url), "utf8");
const vaultSrc = fs.readFileSync(new URL(`../contracts/rfq/${VAULT}.clar`, import.meta.url), "utf8");

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const balStx = (a) => `(stx-get-balance '${a})`;
const balSbtc = (a) => `(contract-call? '${SBTC_FQN} get-balance '${a})`;
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");

function decodeTx(s) {
  const r = s?.Result?.Transaction;
  if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
}
function decodeEval(s) {
  const r = s?.Result?.Eval;
  if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
}

// probe: native price + tip time (quotes must sit in the [0.5x,2x] band)
async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  pb.addEvalCode(MARKET_ID, "(get-native-price)");
  pb.addEvalCode(MARKET_ID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[2]));
  const tipTime = uintFrom(decodeEval(res.steps[3]));
  if (price <= 0n || tipTime <= 0n) throw new Error(`probe failed: price=${price} tipTime=${tipTime}`);
  return { price, tipTime };
}

async function main() {
  console.log("=== rfq-mm-vault-jing (vs rfq-v2) SELF-VERIFYING stxer harness ===\n");
  console.log(`client   = ${CLIENT}`);
  console.log(`owner    = ${VAULT_OWNER}`);
  console.log(`operator = ${OPERATOR}`);
  console.log(`vault    = ${VAULT_ID}\n`);

  const { price: nativePrice, tipTime } = await probe();
  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const refOk = tipTime - 30n;
  console.log(`native=${nativePrice} mid=${mid} cOk=${cOk} fee=${fee} net=${clientReceives}\n`);

  // The client signs the VAULT as winner (not any EOA).
  const sigVault = (rfqId, quotedOut) => signIntent(
    buildRfqAuthHashHexV2({
      market: marketCV, rfqId, winner: vaultCV, quotedOut,
      refPrice: nativePrice, refTimestamp: refOk, refVenue: REF_VENUE,
      authExpiry: AUTH_BIG,
    }, CHAIN),
    TEST_INTENT_PRIVKEY
  );
  const sig0 = sigVault(0, cOk);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  function tx(label, sender, cid, fn, args, expect) {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  }
  function evalc(label, code, capture) {
    b.addEvalCode(VAULT_ID, code);
    plan.push({ kind: "eval", label, capture });
  }

  const fixRfqArgs = (id, sigHex) => [uintCV(id), uintCV(cOk), uintCV(cOk),
    uintCV(nativePrice), uintCV(refOk), stringAsciiCV(REF_VENUE),
    uintCV(AUTH_BIG), bv(sigHex)];
  const ffArgs = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];

  // ---- deploys + market prelude ----
  for (const [name, src] of [[CORE, coreSrc], [MARKET, mktSrc], [VAULT, vaultSrc]]) {
    b.withSender(DEPLOYER).addContractDeploy({ contract_name: name, source_code: src });
    plan.push({ kind: "deploy", label: `deploy ${name}` });
  }
  tx("set-verified-contract market", DEPLOYER, CORE_ID, "set-verified-contract", [marketCV], null);
  tx("initialize market", DEPLOYER, MARKET_ID, "initialize",
    [marketCV, pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0)], null);
  tx("whitelist the VAULT as MM", DEPLOYER, MARKET_ID, "set-mm-whitelist", [vaultCV, trueCV()], "(ok true)");

  // ---- vault init + funding ----
  // initialize registers into jing-core-v2: before set-verified-contract the
  // inner register dies at the canonical-hash lookup (clone protection)
  const initArgs = [vaultCV, standardPrincipalCV(VAULT_OWNER), standardPrincipalCV(OPERATOR)];
  tx("vault initialize before verify -> inner ERR_NOT_VERIFIED", DEPLOYER, VAULT_ID, "initialize",
    initArgs, "(err u5005)");
  tx("set-verified-contract vault", DEPLOYER, CORE_ID, "set-verified-contract", [vaultCV], null);
  tx("vault initialize (canonical, owner, operator)", DEPLOYER, VAULT_ID, "initialize",
    initArgs, "(ok true)");
  evalc("vault is-registered in core",
    `(contract-call? '${CORE_ID} is-registered '${VAULT_ID})`, "REGISTERED");
  // ownership moved: the deployer dies at is-owner, the new owner at the
  // already-initialized latch
  tx("vault initialize again by deployer -> ERR_NOT_AUTHORIZED", DEPLOYER, VAULT_ID, "initialize",
    initArgs, "(err u3001)");
  tx("vault initialize again by owner -> ERR_ALREADY_INITIALIZED", VAULT_OWNER, VAULT_ID, "initialize",
    initArgs, "(err u3002)");
  tx("set-operator by non-owner -> ERR_NOT_AUTHORIZED", DEPLOYER, VAULT_ID, "set-operator",
    [standardPrincipalCV(OPERATOR)], "(err u3001)");
  tx("deposit-stx zero -> ERR_ZERO_AMOUNT", VAULT_OWNER, VAULT_ID, "deposit-stx",
    [uintCV(0)], "(err u3005)");
  tx("owner deposits STX float", VAULT_OWNER, VAULT_ID, "deposit-stx", [uintCV(FLOAT)], null);
  tx("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()], null);

  // ---- rfq 0: open, fix through the vault, fulfill through the vault ----
  tx("client opens rfq0", CLIENT, MARKET_ID, "open-rfq",
    [uintCV(SBTC_IN), uintCV(minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)], "(ok u0)");

  // sig names the vault: an EOA whale submitting it directly must die at auth
  tx("whale steals vault-signed fix directly -> ERR_NOT_WHITELISTED", MM_WHALE, MARKET_ID, "fix-price",
    fixRfqArgs(0, sig0), "(err u2015)");
  tx("fix-rfq by client -> ERR_NOT_AUTHORIZED", CLIENT, VAULT_ID, "fix-rfq",
    fixRfqArgs(0, sig0), "(err u3001)");
  tx("fix-rfq missing rfq -> inner ERR_RFQ_NOT_FOUND", OPERATOR, VAULT_ID, "fix-rfq",
    fixRfqArgs(999, sig0), "(err u2001)");

  evalc("client STX before", balStx(CLIENT), "C_STX_0");
  evalc("vault STX before", balStx(VAULT_ID), "V_STX_0");
  evalc("vault sBTC before", balSbtc(VAULT_ID), "V_SBTC_0");
  evalc("treasury STX before", balStx(DEPLOYER), "T_STX_0");

  tx("fix-rfq by operator -> ok (vault recorded as winner)", OPERATOR, VAULT_ID, "fix-rfq",
    fixRfqArgs(0, sig0), "(ok u0)");
  tx("fulfill-rfq by client -> ERR_NOT_AUTHORIZED", CLIENT, VAULT_ID, "fulfill-rfq",
    ffArgs(0), "(err u3001)");
  tx("fulfill-rfq missing rfq -> ERR_RFQ_NOT_FOUND", OPERATOR, VAULT_ID, "fulfill-rfq",
    ffArgs(999), "(err u3003)");
  tx("fulfill-rfq by operator -> ok", OPERATOR, VAULT_ID, "fulfill-rfq", ffArgs(0), `(ok u${cOk})`);

  evalc("client STX after", balStx(CLIENT), "C_STX_1");
  evalc("vault STX after", balStx(VAULT_ID), "V_STX_1");
  evalc("vault sBTC after", balSbtc(VAULT_ID), "V_SBTC_1");
  evalc("treasury STX after", balStx(DEPLOYER), "T_STX_1");

  // ---- withdrawals: owner-only, owner-destination-only ----
  tx("withdraw-stx by operator -> ERR_NOT_AUTHORIZED", OPERATOR, VAULT_ID, "withdraw-stx",
    [uintCV(1_000_000)], "(err u3001)");
  tx("withdraw-ft by operator -> ERR_NOT_AUTHORIZED", OPERATOR, VAULT_ID, "withdraw-ft",
    [pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), uintCV(SBTC_IN)], "(err u3001)");
  evalc("owner sBTC before withdraw", balSbtc(VAULT_OWNER), "O_SBTC_0");
  tx("owner withdraws the received sBTC", VAULT_OWNER, VAULT_ID, "withdraw-ft",
    [pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME), uintCV(SBTC_IN)], `(ok u${SBTC_IN})`);
  evalc("owner sBTC after withdraw", balSbtc(VAULT_OWNER), "O_SBTC_1");
  tx("owner withdraws remaining STX float", VAULT_OWNER, VAULT_ID, "withdraw-stx",
    [uintCV(FLOAT - cOk)], `(ok u${FLOAT - cOk})`);
  evalc("vault STX after full withdraw", balStx(VAULT_ID), "V_STX_2");
  evalc("vault sBTC after full withdraw", balSbtc(VAULT_ID), "V_SBTC_2");

  // ---- run + verify ----
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;

  res.steps.forEach((s, i) => {
    const p = plan[i];
    if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      const ok = p.expect === null ? got.startsWith("(ok") : got === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok || p.expect === null ? "" : `  EXPECTED ${p.expect}`}`);
      ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s);
      if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++;
  };
  const d = (a, b2) => uintFrom(cap[a]) - uintFrom(cap[b2]);
  assert(`client STX +net delta=${d("C_STX_1", "C_STX_0")}`, d("C_STX_1", "C_STX_0") === clientReceives, `(want ${clientReceives})`);
  assert(`vault STX -stx-out delta=${d("V_STX_1", "V_STX_0")}`, d("V_STX_1", "V_STX_0") === -cOk, `(want ${-cOk})`);
  assert(`vault sBTC +sbtc-in delta=${d("V_SBTC_1", "V_SBTC_0")}`, d("V_SBTC_1", "V_SBTC_0") === SBTC_IN, `(want ${SBTC_IN})`);
  assert(`treasury STX +fee delta=${d("T_STX_1", "T_STX_0")}`, d("T_STX_1", "T_STX_0") === fee, `(want ${fee})`);
  assert(`owner sBTC +withdraw delta=${d("O_SBTC_1", "O_SBTC_0")}`, d("O_SBTC_1", "O_SBTC_0") === SBTC_IN, `(want ${SBTC_IN})`);
  assert("vault fully drained (STX)", uintFrom(cap.V_STX_2) === 0n, `(${cap.V_STX_2})`);
  assert("vault fully drained (sBTC)", uintFrom(cap.V_SBTC_2) === 0n, `(${cap.V_SBTC_2})`);
  assert("vault registered in jing-core-v2", String(cap.REGISTERED) === "true", `(${cap.REGISTERED})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
