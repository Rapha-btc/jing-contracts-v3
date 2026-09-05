// probe-lazer-stacks.mjs
// Proves the Pyth Pro (Lazer) path on Stacks end to end with our key: fetch a
// signed evm-format update for BTC/USD (feed 1) + STX/USD (feed 45) at the
// 1000ms channel, then verify it on a stxer mainnet fork through
// SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle verify-price-feeds
// (fee u0, default staleness 7200s, max-age optional). First green:
// https://stxer.xyz/simulations/mainnet/8dc46b841b454a0711d3f618e3bbfdcd
// Run: PYTH_API_KEY=<key> npx tsx simulations/probe-lazer-stacks.mjs

import { SimulationBuilder, getSimulationResult } from "stxer";
import { bufferCV, contractPrincipalCV, noneCV, cvToString, deserializeCV } from "@stacks/transactions";
const K = process.env.PYTH_API_KEY;
const r = await fetch("https://pyth-lazer.dourolabs.app/v1/latest_price", { method: "POST", headers: { Authorization: `Bearer ${K}`, "content-type": "application/json" },
  body: JSON.stringify({ priceFeedIds: [1, 45], properties: ["price", "exponent", "publisherCount"], formats: ["evm"], channel: "fixed_rate@1000ms", jsonBinaryEncoding: "hex" }) });
const j = await r.json();
const hex = j.evm.data;
console.log("update", hex.length / 2, "bytes; parsed", JSON.stringify(j.parsed));
const L = "SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8";
let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" });
b = b.withSender("SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2").addContractCall({ contract_id: `${L}.pyth-lazer-oracle`, function_name: "verify-price-feeds",
  function_args: [bufferCV(Buffer.from(hex, "hex")), contractPrincipalCV(L, "pyth-lazer-decoder-v1"), noneCV()] });
const sid = await b.run();
console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
const res = await getSimulationResult(sid);
const st = res.steps.find((s) => s?.Result?.Transaction);
const t = st.Result.Transaction;
console.log("Err" in t ? "ENGINE-ERR " + JSON.stringify(t.Err).slice(0, 300) : cvToString(deserializeCV(t.Ok.result)));
if (t.Ok?.vm_error) console.log("vm_error:", t.Ok.vm_error);
