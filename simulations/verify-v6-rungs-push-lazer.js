import { rungReceipt } from "./_rung-receipt.js";
// Sponsor-friendly entry and keeper push on current v6-3, all four fixed/peg rungs.
// P1/P3/P5/P6: market refusal holds funds locally; keeper pushes after unpause,
// then settles with a newer signed price; exact order and rung-push event.
// P2: a sub-minimum top-up is admitted against a live position; another top-up
// stays held while escrow is pending, then keeper push drains it after settle.
// P4: stale signed keeper update refuses settlement and preserves escrow;
// the member deposit/push APIs no longer accept an update at all.
// Run: node simulations/verify-v6-rungs-push-lazer.js
import { runCurrentPlan, FRESH_UPDATE } from "./_v6-submit-settle.js";
import fs from "node:fs";
import { ClarityVersion, uintCV, bufferCV, stringAsciiCV, contractPrincipalCV, noneCV, boolCV, deserializeCV, cvToString, hexToCV } from "@stacks/transactions";
import { SimulationBuilder } from "stxer";
import { fetchLazerUpdateAny as fetchLazerUpdate } from "./_lazer.js";

const DEP = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const CORE = "jing-core-v6", MKT = "markets-sbtc-stx-jing-v6-3";
const CORE_ID = `${DEP}.${CORE}`, MARKET = `${DEP}.${MKT}`, LADDER = `${DEP}.jing-ladder-v1`;
const sbtcT = contractPrincipalCV("SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4", "sbtc-token"), wstxT = contractPrincipalCV("SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR", "token-stx-v-1-2");
const wstxA = stringAsciiCV("wstx"), sbtcA=stringAsciiCV("sbtc-token");
const A = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2"; // sBTC holder: buy-rung member
const S = "SP9BP4PN74CNR5XT7CMAMBPA0GWC9HMB69HVVV51";  // STX holder: sell-rung member, the resting bid
const KEEPER = "SPZSQNQF9SM88N00K4XYV05ZAZRACC748T78P5P3"; // anyone
const PP = 100_000_000n, BPS = 20n;
const STALE = bufferCV(Buffer.from(fs.readFileSync(new URL("./fixtures/lazer-update-stale-btc-stx.hex", import.meta.url), "utf8").trim(), "hex"));
// comment-only lines stripped before deploying: the v6 market crossed the
// 100,000-byte deploy limit with its comments (2026-09-15); the deploy form
// is comment-free anyway, same strip as verify-markets-v6-gaps.js
const stripComments = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).join("\n");
const src = (f) => stripComments(fs.readFileSync(`./contracts/${f}.clar`, "utf8"));
const centsName = (c) => { const w = c / 100n, f = c % 100n; return `${w}-${f < 10n ? "0" : ""}${f}`; };
let checks = 0, failures = 0;
function check(label, actual, want) { checks += 1; const ok = typeof want === "function" ? want(actual) : String(actual) === want; if (!ok) failures += 1; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}: ${String(actual).slice(0, 170)}${ok ? "" : ` (want ${typeof want === "function" ? want.toString().slice(0, 90) : want})`}`); }
const decodeTx = (s) => { const r = s?.Result?.Transaction; if (!r) return "<no tx>"; if ("Err" in r) return `ENGINE-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; if (r.Ok?.vm_error) return `VM-ERR ${r.Ok.vm_error}`; try { return cvToString(deserializeCV(r.Ok.result)); } catch (e) { return `decode-failed ${e.message}`; } };
const decodeEval = (s) => { const r = s?.Result?.Eval; if (!r) return "<no eval>"; if (!("Ok" in r)) return `EVAL-ERR ${JSON.stringify(r.Err).slice(0, 120)}`; try { return cvToString(deserializeCV(r.Ok)); } catch { return r.Ok; } };
const field = (s, k) => (String(s).match(new RegExp(`\\(${k} (u?\\d+|none|true|false|\\(some u\\d+\\))\\)`)) || [])[1];
const prints = (step) => (step?.Result?.Transaction?.Ok?.events || []).map((e) => { try { const o = typeof e === "string" ? JSON.parse(e) : e; const raw = o.contract_event?.raw_value; return raw ? cvToString(hexToCV(raw)) : ""; } catch { return ""; } });

async function main() {
  console.log("=== v6-3 rungs: oracle-free deposit/push + keeper settle ===");
  const lz = await fetchLazerUpdate();
  const MID = (lz.px * PP) / lz.py;
  const BUY_C = (10n ** 18n) / ((MID * 110n) / 100n); // fixed buy rung 10% over mid: rests, never crosses
  const SELL_C = (10n ** 18n) / ((MID * 110n) / 100n); // sell peg rung cap over the bid: in band
  const BUY = `jing-buy-stx-${centsName(BUY_C)}`, SELL = `jing-sell-stx-spread-${BPS}-cap-${centsName(SELL_C)}`;
  const SELLF_C = (10n ** 18n) / ((MID * 90n) / 100n); // P5: fixed sell rung bidding 10% under the mid: rests, never crosses
  const BUYP_C = (10n ** 18n) / ((MID * 90n) / 100n);  // P6: buy peg rung, floor under the pegged ask: in band
  const SELLF = `jing-sell-stx-${centsName(SELLF_C)}`, BUYP = `jing-buy-stx-spread-${BPS}-floor-${centsName(BUYP_C)}`;
  const rid = (n) => `${DEP}.${n}`;
  console.log(`mid ${MID}; ${BUY} / ${SELL}`);

  const steps = []; let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
  const call = (sender, fn, args, cid = MARKET) => (bb) => bb.withSender(sender).addContractCall({ contract_id: cid, function_name: fn, function_args: args });
  const tx = (label, fn, want) => { b = fn(b); steps.push({ label, kind: "tx", want }); return steps[steps.length - 1]; };
  const ev = (label, code, want, cid = MARKET) => { b = b.addEvalCode(cid, code); steps.push({ label, kind: "eval", want }); return steps[steps.length - 1]; };
  const deploy = (name, code) => tx(`deploy ${name}`, (bb) => bb.withSender(DEP).addContractDeploy({ contract_name: name, source_code: code, clarity_version: ClarityVersion.Clarity5 }), (v) => !String(v).includes("ERR"));
  const state = (label, cid, want) => ev(label, "(get-state)", want, cid);

  deploy(CORE, src(CORE)); deploy("jing-ladder-v1", src("jing-ladder-v1")); deploy(MKT, src(MKT));
  tx("core-v6 verifies v6", call(DEP, "set-verified-contract", [contractPrincipalCV(DEP, MKT)], CORE_ID), "(ok true)");
  tx("v6 initialize", call(DEP, "initialize", [contractPrincipalCV(DEP, MKT), sbtcT, wstxT, uintCV(1000), uintCV(1_000_000), uintCV(1), uintCV(45)]), "(ok true)"); deploy(BUY, src("jing-buy-stx")); deploy(SELL, src("jing-sell-stx-market-spread"));
  tx("canonical buy-stx", call(DEP, "set-canonical", [stringAsciiCV("buy-stx"), contractPrincipalCV(DEP, BUY)], LADDER), "(ok true)");
  tx("canonical sell-peg", call(DEP, "set-canonical", [stringAsciiCV("sell-peg"), contractPrincipalCV(DEP, SELL)], LADDER), "(ok true)");
  tx(`init ${BUY}`, call(DEP, "initialize", [uintCV(BUY_C)], rid(BUY)), "(ok true)");
  tx(`init ${SELL}`, call(DEP, "initialize", [uintCV(BPS), uintCV(SELL_C)], rid(SELL)), "(ok true)");

  // Seed the opposite side: the first buy push must escrow.
  tx("seed opposite bid", call(S,"deposit-token-y",[uintCV(5000000),uintCV(MID*95n/100n),noneCV(),wstxT,wstxA]),"(ok u5000000)");
  deploy(SELLF,src("jing-sell-stx"));deploy(BUYP,src("jing-buy-stx-market-spread"));
  tx("canonical sell-stx",call(DEP,"set-canonical",[stringAsciiCV("sell-stx"),contractPrincipalCV(DEP,SELLF)],LADDER),"(ok true)");
  tx("canonical buy-peg",call(DEP,"set-canonical",[stringAsciiCV("buy-peg"),contractPrincipalCV(DEP,BUYP)],LADDER),"(ok true)");
  tx("init fixed sell",call(DEP,"initialize",[uintCV(SELLF_C)],rid(SELLF)),"(ok true)");
  tx("init buy peg",call(DEP,"initialize",[uintCV(BPS),uintCV(BUYP_C)],rid(BUYP)),"(ok true)");
  const pushes=[];
  for (const [n,side,peg,amount,limit] of [[BUY,'x',false,20000,10n**18n/BUY_C],[SELL,'y',true,5000000,10n**18n/SELL_C],[SELLF,'y',false,5000000,10n**18n/SELLF_C],[BUYP,'x',true,3000,10n**18n/BUYP_C]]) {
    const owner=side==='x'?A:S,trait=side==='x'?sbtcT:wstxT,asset=side==='x'?sbtcA:wstxA;
    const held=side==='x'?'held-sats':'held-ustx',top=side==='x'?500:500000;
    const settle=(label,qty,upd=FRESH_UPDATE,want=`(ok u${qty})`)=>tx(`${n}: ${label}`,call(KEEPER,`settle-token-${side}-deposit`,[contractPrincipalCV(DEP,n),upd,trait,asset]),want);
    tx(`${n}: pause market`,call(DEP,'set-paused',[boolCV(true)]),'(ok true)');
    tx(`${n}: member deposit without oracle is held on refusal`,call(owner,'deposit',[uintCV(amount)],rid(n)),rungReceipt('deposit'));
    state(`${n}: held exact`,rid(n),v=>field(v,held)===`u${amount}`&&field(v,'resting')==='u0');
    tx(`${n}: keeper push while paused leaves held`,call(KEEPER,'push',[],rid(n)),'(ok false)');
    tx(`${n}: unpause`,call(DEP,'set-paused',[boolCV(false)]),'(ok true)');
    const pushed=tx(`${n}: keeper push escrows without oracle`,call(KEEPER,'push',[],rid(n)),'(ok true)');
    pushes.push({slot:pushed,amount,n});
    ev(`${n}: escrow exact`, `(get amount (unwrap-panic (get-token-${side}-pending-deposit '${rid(n)})))`,`u${amount}`);
    ev(`${n}: not live until settle`,`(get-token-${side}-deposit (get-current-cycle) '${rid(n)})`,'u0');
    state(`${n}: escrow stays in member claim`,rid(n),v=>field(v,held)==='u0'&&field(v,'resting')===`u${amount}`);
    tx(`${n}: nothing held to push`,call(KEEPER,'push',[],rid(n)),'(ok false)');
    settle('stale signed update refuses settlement',amount,STALE,v=>v==='(err u1002)'||v==='(err u1003)');
    ev(`${n}: stale refusal preserves escrow`,`(get amount (unwrap-panic (get-token-${side}-pending-deposit '${rid(n)})))`,`u${amount}`);
    settle('newer signed update places escrow',amount);
    ev(`${n}: pending cleared`,`(get-token-${side}-pending-deposit '${rid(n)})`,'none');
    ev(`${n}: exact stored quote`,`(get-token-${side}-order '${rid(n)})`,v=>field(v,'limit')===`u${limit}`&&field(v,'spread-bps')===(peg?'(some u20)':'none'));
    if(peg)ev(`${n}: effective peg at mid`,`(token-${side}-limit-at '${rid(n)} u${MID})`,`u${MID*(side==='x'?10020n:9980n)/10000n}`);
    tx(`${n}: small top-up escrows against existing position`,call(owner,'deposit',[uintCV(top)],rid(n)),rungReceipt('deposit'));
    tx(`${n}: duplicate pending makes next top-up held`,call(owner,'deposit',[uintCV(top)],rid(n)),rungReceipt('deposit'));
    state(`${n}: top-up held exact`,rid(n),v=>field(v,held)===`u${top}`&&field(v,'resting')===`u${amount+top}`);
    tx(`${n}: keeper cannot push over pending`,call(KEEPER,'push',[],rid(n)),'(ok false)');
    settle('admit first top-up',top);
    tx(`${n}: keeper pushes held top-up after settle`,call(KEEPER,'push',[],rid(n)),'(ok true)');
    settle('admit second top-up',top);
    ev(`${n}: exact aggregate live`,`(get-token-${side}-deposit (get-current-cycle) '${rid(n)})`,`u${amount+top*2}`);
    state(`${n}: held drained`,rid(n),v=>field(v,held)==='u0'&&field(v,'resting')===`u${amount+top*2}`);
    tx(`${n}: empty push false`,call(KEEPER,'push',[],rid(n)),'(ok false)');
  }

  const {sid, result:res} = await runCurrentPlan(b);
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}\n`);
  const s = res.steps; let i = 0;
  for (const st of steps) { while (i < s.length && !s[i]?.Result?.Transaction && !s[i]?.Result?.Eval) i += 1; st.raw = st.kind === "tx" ? decodeTx(s[i]) : decodeEval(s[i]); st.idx = i; i += 1; check(st.label, st.raw, st.want); }
  const pushLog = (st) => prints(s[st.idx]).filter((p) => p.includes('(event "rung-push")')).join("|");
  for (const {slot,amount,n} of pushes) check(`${n}: rung-push event names keeper and exact amount`,pushLog(slot),v=>v.includes('(pushed true)')&&v.includes(`(amount u${amount})`)&&v.includes(KEEPER));
  console.log(`\n${checks - failures}/${checks} checks green`);
  if (failures > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
