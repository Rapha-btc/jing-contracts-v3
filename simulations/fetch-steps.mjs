import { getSimulationResult } from "stxer";
import { cvToString, deserializeCV } from "@stacks/transactions";
const sid = process.argv[2]; const from = Number(process.argv[3] || 0);
const res = await getSimulationResult(sid);
const s = res.steps;
const dec = (hex) => { try { return cvToString(deserializeCV(hex)); } catch (e) { return "?" + String(hex).slice(0, 40); } };
for (let k = from; k < s.length; k++) {
  const st = s[k]; const r = st.Result || {};
  let out = "";
  if (r.Transaction) out = "TX " + ("Err" in r.Transaction ? "ENGINE-ERR " + JSON.stringify(r.Transaction.Err).slice(0, 120) : dec(r.Transaction.Ok.result));
  else if (r.Eval) out = "EVAL " + ("Err" in r.Eval ? "ERR " + JSON.stringify(r.Eval.Err).slice(0, 120) : dec(r.Eval.Ok?.value ?? r.Eval.Ok?.result ?? r.Eval.Ok));
  else out = Object.keys(st).join(",") + " " + JSON.stringify(st).slice(0, 100);
  const code = st.Eval ? String(st.Eval[3] ?? "").slice(0, 70) : "";
  console.log(k, code ? `[${code}]` : "", out.slice(0, 200));
}
