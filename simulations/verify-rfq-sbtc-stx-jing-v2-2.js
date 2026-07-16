// verify-rfq-sbtc-stx-jing-v2-2.js
// FOCUSED stxer harness for the DELTA in rfq-sbtc-stx-jing-v2-2 vs v2: the
// separate CLIENT-ADMIN whitelist. The rest of the market (band, coinbase,
// drift, oracle) is byte-identical to rfq-sbtc-stx-jing-v2 and stays covered by
// verify-rfq-sbtc-stx-jing-v2.js (83/83). Here we prove:
//   - initialize enforces client-admin != operator (ERR_SAME_ADMIN u1023)
//   - open-rfq is permissioned: non-whitelisted client -> u2017
//   - set-client-whitelist is client-admin only (operator -> u1022)
//   - a whitelisted client can open -> fix -> fulfill end to end
//   - set-operator can't become the client-admin (u1023); client-admin rotates
//   - de-whitelisting a client re-blocks open-rfq
//
// The market source is contracts/rfq/rfq-sbtc-stx-jing-v2.clar deployed under
// the name rfq-sbtc-stx-jing-v2-2 (deploy-name-agnostic; build-auth-hash binds
// market: current-contract).
//
// Run: npx tsx simulations/verify-rfq-sbtc-stx-jing-v2-2.js
import {
  uintCV, bufferCV, stringAsciiCV, standardPrincipalCV, contractPrincipalCV,
  noneCV, trueCV, falseCV, deserializeCV, cvToString, getAddressFromPrivateKey,
} from "@stacks/transactions";
import { SimulationBuilder, getSimulationResult } from "stxer";
import fs from "node:fs";
import {
  STX_DEPOSITOR_1, SBTC_DEPOSITOR_1, SBTC_FQN, SBTC_ASSET_NAME, WSTX_FQN,
  buildRfqAuthHashHexV2, signIntent, TEST_INTENT_PRIVKEY,
} from "./_setup.js";

const OWNER_PRIVKEY = "3333333333333333333333333333333333333333333333333333333333333333" + "01";
const DEPLOYER = getAddressFromPrivateKey(OWNER_PRIVKEY, "mainnet"); // operator + jing-core owner
const CLIENT_ADMIN_PRIVKEY = "4444444444444444444444444444444444444444444444444444444444444444" + "01";
const CLIENT_ADMIN = getAddressFromPrivateKey(CLIENT_ADMIN_PRIVKEY, "mainnet"); // != operator
const ROTATED_ADMIN_PRIVKEY = "5555555555555555555555555555555555555555555555555555555555555555" + "01";
const ROTATED_ADMIN = getAddressFromPrivateKey(ROTATED_ADMIN_PRIVKEY, "mainnet");

const CORE = "jing-core-v2";
const MARKET = "rfq-sbtc-stx-jing-v2-2";
const CID = `${DEPLOYER}.${MARKET}`;
const CORE_ID = `${DEPLOYER}.${CORE}`;
const marketCV = contractPrincipalCV(DEPLOYER, MARKET);

const STACKS_NODE_API = "http://77.42.3.101/stacks-api";
const CLIENT = getAddressFromPrivateKey(TEST_INTENT_PRIVKEY, "mainnet");
const MM = STX_DEPOSITOR_1;
const mmCV = standardPrincipalCV(MM);
const SBTC_IN = 200_000n;
const AUTH_BIG = 10_000_000_000n;
const CHAIN = 1;
const REF_VENUE = "kraken-mid";

const coreSrc = fs.readFileSync(new URL(`../contracts/rfq/deploying/${CORE}.clar`, import.meta.url), "utf8");
const mktSrc = fs.readFileSync(new URL(`../contracts/rfq/rfq-sbtc-stx-jing-v2.clar`, import.meta.url), "utf8");

const pcv = (s) => contractPrincipalCV(s.split(".")[0], s.split(".")[1]);
const bv = (hex) => bufferCV(Buffer.from(hex, "hex"));
const uintFrom = (s) => BigInt((String(s).match(/u(\d+)/) || [])[1] ?? "-1");
const decodeTx = (s) => {
  const r = s?.Result?.Transaction; if (!r) return "<no tx>";
  if ("Err" in r) return `ENGINE-ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed: ${e.message}`; }
};
const decodeEval = (s) => {
  const r = s?.Result?.Eval; if (!r) return "<no eval>";
  if (!("Ok" in r)) return `ERR: ${JSON.stringify(r.Err)}`;
  try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; }
};

async function probe() {
  const pb = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API })
    .withSender(DEPLOYER)
    .addContractDeploy({ contract_name: CORE, source_code: coreSrc })
    .addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  pb.addEvalCode(CID, "(get-native-price)");
  pb.addEvalCode(CID, "stacks-block-time");
  const sid = await pb.run();
  const res = await getSimulationResult(sid);
  const price = uintFrom(decodeEval(res.steps[2]));
  const tipTime = uintFrom(decodeEval(res.steps[3]));
  if (price <= 0n || tipTime <= 0n) throw new Error(`probe failed: price=${price} tip=${tipTime}`);
  return { price, tipTime };
}

async function main() {
  console.log("=== rfq-sbtc-stx-jing-v2-2 CLIENT-ADMIN delta harness ===\n");
  console.log(`operator/deployer = ${DEPLOYER}`);
  console.log(`client-admin      = ${CLIENT_ADMIN}`);
  console.log(`client            = ${CLIENT}\n`);

  const { price: nativePrice, tipTime } = await probe();
  const mid = (SBTC_IN * nativePrice) / 10_000_000_000n;
  const cOk = (mid * 9950n) / 10000n;
  const minOut = mid / 2n;
  const fee = (cOk * 10n) / 10000n;
  const clientReceives = cOk - fee;
  const refOk = tipTime - 30n;
  console.log(`native=${nativePrice} mid=${mid} cOk=${cOk}\n`);

  const sig = (rfqId, quotedOut) => signIntent(
    buildRfqAuthHashHexV2({
      market: marketCV, rfqId, winner: mmCV, quotedOut,
      refPrice: nativePrice, refTimestamp: refOk, refVenue: REF_VENUE, authExpiry: AUTH_BIG,
    }, CHAIN), TEST_INTENT_PRIVKEY);
  const sig0 = sig(0, cOk);
  const sig1 = sig(1, cOk);

  const plan = [];
  const b = SimulationBuilder.new({ stacksNodeAPI: STACKS_NODE_API });
  const call = (label, sender, cid, fn, args, expect) => {
    b.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
    plan.push({ kind: "tx", label, expect });
  };
  const evalc = (label, code, capture) => { b.addEvalCode(CID, code); plan.push({ kind: "eval", label, capture }); };
  const fixArgs = (id, committed, quoted, sigHex) => [
    uintCV(id), uintCV(committed), uintCV(quoted), uintCV(nativePrice), uintCV(refOk),
    stringAsciiCV(REF_VENUE), uintCV(AUTH_BIG), bv(sigHex)];
  const openArgs = (mo) => [uintCV(SBTC_IN), uintCV(mo ?? minOut), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const ffArgs = (id) => [uintCV(id), pcv(SBTC_FQN), stringAsciiCV(SBTC_ASSET_NAME)];
  const initArgs = (m, ca) => [contractPrincipalCV(DEPLOYER, m), pcv(SBTC_FQN), pcv(WSTX_FQN), uintCV(0), standardPrincipalCV(ca)];

  // ---- deploy core + market (v2-2 name) ----
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: CORE, source_code: coreSrc });
  plan.push({ kind: "deploy", label: `deploy ${CORE}` });
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: MARKET, source_code: mktSrc });
  plan.push({ kind: "deploy", label: `deploy ${MARKET}` });

  // ---- initialize distinctness: client-admin == operator must revert u1023 ----
  b.withSender(DEPLOYER).addContractDeploy({ contract_name: `${MARKET}-bad`, source_code: mktSrc });
  plan.push({ kind: "deploy", label: `deploy ${MARKET}-bad (for init-distinctness test)` });
  call("set-verified bad market", DEPLOYER, CORE_ID, "set-verified-contract", [contractPrincipalCV(DEPLOYER, `${MARKET}-bad`)], null);
  call("initialize with client-admin == operator -> ERR_SAME_ADMIN", DEPLOYER, `${DEPLOYER}.${MARKET}-bad`, "initialize",
    initArgs(`${MARKET}-bad`, DEPLOYER), "(err u1023)");

  // ---- real market registry + init (client-admin != operator) ----
  call("set-verified market", DEPLOYER, CORE_ID, "set-verified-contract", [marketCV], null);
  call("initialize (client-admin != operator) -> ok", DEPLOYER, CID, "initialize", initArgs(MARKET, CLIENT_ADMIN), null);
  evalc("get-client-admin", "(get-client-admin)", "CA");

  // ---- fund client sBTC + whitelist the MM ----
  call("fund client sBTC", SBTC_DEPOSITOR_1, SBTC_FQN, "transfer",
    [uintCV(2_000_000), standardPrincipalCV(SBTC_DEPOSITOR_1), standardPrincipalCV(CLIENT), noneCV()], null);
  call("set-mm-whitelist(MM) by operator -> ok", DEPLOYER, CID, "set-mm-whitelist", [mmCV, trueCV()], "(ok true)");

  // ============ CLIENT whitelist gate ============
  call("open-rfq by non-whitelisted client -> ERR_CLIENT_NOT_WHITELISTED", CLIENT, CID, "open-rfq", openArgs(), "(err u2017)");
  call("set-client-whitelist by operator (non client-admin) -> ERR_NOT_CLIENT_ADMIN", DEPLOYER, CID, "set-client-whitelist",
    [standardPrincipalCV(CLIENT), trueCV()], "(err u1022)");
  call("set-client-whitelist(CLIENT) by client-admin -> ok", CLIENT_ADMIN, CID, "set-client-whitelist",
    [standardPrincipalCV(CLIENT), trueCV()], "(ok true)");
  evalc("is-whitelisted-client(CLIENT)", `(is-whitelisted-client '${CLIENT})`, "WLC");

  // ============ distinctness on rotation ============
  call("set-operator -> client-admin -> ERR_SAME_ADMIN", DEPLOYER, CID, "set-operator", [standardPrincipalCV(CLIENT_ADMIN)], "(err u1023)");
  call("set-client-admin by operator (non-admin) -> ERR_NOT_CLIENT_ADMIN", DEPLOYER, CID, "set-client-admin",
    [standardPrincipalCV(ROTATED_ADMIN)], "(err u1022)");
  call("set-client-admin -> operator -> ERR_SAME_ADMIN", CLIENT_ADMIN, CID, "set-client-admin", [standardPrincipalCV(DEPLOYER)], "(err u1023)");
  call("set-client-admin rotate by client-admin -> ok", CLIENT_ADMIN, CID, "set-client-admin", [standardPrincipalCV(ROTATED_ADMIN)], "(ok true)");
  call("old client-admin now powerless -> ERR_NOT_CLIENT_ADMIN", CLIENT_ADMIN, CID, "set-client-whitelist",
    [standardPrincipalCV(CLIENT), falseCV()], "(err u1022)");
  call("rotate back by new admin -> ok", ROTATED_ADMIN, CID, "set-client-admin", [standardPrincipalCV(CLIENT_ADMIN)], "(ok true)");

  // ============ happy path: whitelisted client open -> fix -> fulfill ============
  call("open rfq0 (whitelisted) -> ok", CLIENT, CID, "open-rfq", openArgs(), "(ok u0)");
  evalc("client STX before", `(stx-get-balance '${CLIENT})`, "C0");
  evalc("mm sBTC before", `(contract-call? '${SBTC_FQN} get-balance '${MM})`, "M0");
  call("fix-price rfq0 -> ok", MM, CID, "fix-price", fixArgs(0, cOk, cOk, sig0), null);
  call("fulfill rfq0 -> ok", MM, CID, "fulfill", ffArgs(0), null);
  evalc("client STX after", `(stx-get-balance '${CLIENT})`, "C1");
  evalc("mm sBTC after", `(contract-call? '${SBTC_FQN} get-balance '${MM})`, "M1");

  // ============ de-whitelist re-blocks ============
  call("de-whitelist CLIENT by client-admin -> ok", CLIENT_ADMIN, CID, "set-client-whitelist", [standardPrincipalCV(CLIENT), falseCV()], "(ok true)");
  call("open-rfq after de-whitelist -> ERR_CLIENT_NOT_WHITELISTED", CLIENT, CID, "open-rfq", openArgs(), "(err u2017)");

  // ---- run + verify ----
  const sessionId = await b.run();
  const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
  console.log(`Submitted: ${url}\n`);
  const res = await getSimulationResult(sessionId);
  const cap = {};
  let pass = 0, fail = 0;
  res.steps.forEach((s, i) => {
    const p = plan[i]; if (!p) return;
    if (p.kind === "deploy") {
      const ok = !("Err" in (s?.Result?.Transaction || {}));
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label} -> ${decodeTx(s)}`); ok ? pass++ : fail++;
    } else if (p.kind === "tx") {
      const got = decodeTx(s);
      const ok = p.expect === null ? got.startsWith("(ok") : got === p.expect;
      console.log(`${ok ? "✅" : "❌"} [${i}] ${p.label}\n        got ${got}${ok || p.expect === null ? "" : `  EXPECTED ${p.expect}`}`); ok ? pass++ : fail++;
    } else if (p.kind === "eval") {
      const v = decodeEval(s); if (p.capture) cap[p.capture] = v;
      console.log(`ℹ️  [${i}] ${p.label}: ${v}`);
    }
  });

  console.log("\n--- assertions ---");
  const assert = (label, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` ${detail}` : ""}`); ok ? pass++ : fail++; };
  assert("client-admin set to the distinct key", String(cap.CA).includes(CLIENT_ADMIN), `(${cap.CA})`);
  assert("client whitelisted after set", String(cap.WLC) === "true", `(${cap.WLC})`);
  const cDelta = uintFrom(cap.C1) - uintFrom(cap.C0);
  const mDelta = uintFrom(cap.M1) - uintFrom(cap.M0);
  assert(`client STX +net delta=${cDelta}`, cDelta === clientReceives, `(want ${clientReceives})`);
  assert(`mm sBTC +sbtc-in delta=${mDelta}`, mDelta === SBTC_IN, `(want ${SBTC_IN})`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===\nView: ${url}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
