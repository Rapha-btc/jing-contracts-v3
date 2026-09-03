import { SimulationBuilder, getSimulationResult } from "stxer";
import { cvToString, deserializeCV, bufferCV, contractPrincipalCV, tupleCV } from "@stacks/transactions";
import fs from "node:fs";
const H = Number(process.argv[2]);
const vaa = fs.readFileSync(process.argv[3], "utf8").trim();
const P = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y";
const BTC = "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX = "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";
let b = SimulationBuilder.new({ stacksNodeAPI: "http://77.42.3.101/stacks-api" }).useBlockHeight(H).withSender("SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22");
b = b.addEvalCode(`${P}.pyth-storage-v4`, `(get-price 0x${BTC})`);
for (let k = 0; k < 2; k++) b = b.addContractCall({ contract_id: `${P}.pyth-oracle-v4`, function_name: "verify-and-update-price-feeds", function_args: [bufferCV(Buffer.from(vaa, "hex")), tupleCV({ "pyth-storage-contract": contractPrincipalCV(P, "pyth-storage-v4"), "pyth-decoder-contract": contractPrincipalCV(P, "pyth-pnau-decoder-v3"), "wormhole-core-contract": contractPrincipalCV(P, "wormhole-core-v4") })] });
b = b.addEvalCode(`${P}.pyth-storage-v4`, `(get-price 0x${BTC})`).addEvalCode(`${P}.pyth-storage-v4`, `(get-price 0x${STX})`);
const sid = await b.run(); const res = await getSimulationResult(sid);
for (const st of res.steps) { const r = st.Result || {}; if (r.Transaction) console.log("TX", "Err" in r.Transaction ? "ENGINE-ERR " + JSON.stringify(r.Transaction.Err).slice(0, 200) : cvToString(deserializeCV(r.Transaction.Ok.result)).slice(0, 300)); else if (r.Eval) { const ok = r.Eval.Ok?.value ?? r.Eval.Ok?.result ?? r.Eval.Ok; console.log("EVAL", "Err" in r.Eval ? JSON.stringify(r.Eval.Err).slice(0, 120) : cvToString(deserializeCV(ok)).slice(0, 240)); } }
console.log("sim", sid);
