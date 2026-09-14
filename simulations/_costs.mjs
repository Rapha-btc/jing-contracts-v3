// Per-transaction execution costs of a stxer fork: node simulations/_costs.mjs <sim id>
import { getSimulationResult } from "stxer";
import { deserializeTransaction, cvToString, deserializeCV } from "@stacks/transactions";
const sid = process.argv[2];
const res = await getSimulationResult(sid);
for (let i = 0; i < res.steps.length; i++) {
  const s = res.steps[i];
  const ok = s.Result?.Transaction?.Ok; if (!ok) continue;
  const ec = ok.execution_cost;
  let name = "?";
  try { const tx = deserializeTransaction(s.Transaction); const p = tx.payload; name = p.functionName ? p.contractName.content + "." + p.functionName.content : "deploy:" + (p.contractName?.content || ""); } catch {}
  let r = ""; try { r = cvToString(deserializeCV(ok.result)).slice(0, 24); } catch { r = ok.result.slice(0, 12); }
  console.log(String(i).padStart(3), name.padEnd(50), "rc", String(ec.read_count).padStart(4), "rl", String(ec.read_length).padStart(7), "wc", String(ec.write_count).padStart(3), "rt", String(ec.runtime).padStart(10), r);
}
