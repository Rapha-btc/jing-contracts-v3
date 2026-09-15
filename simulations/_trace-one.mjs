// _trace-one.mjs <sim> <substring of the decoded result> : print the user-function call path of that tx
import { execFileSync } from "node:child_process";
import { getSimulationResult } from "stxer"; import { deserializeCV, cvToString } from "@stacks/transactions";
const [sim, want, pat = "filter-small|filter-limit|execute-settlement|cross-remainder|walk-|settle-with-refresh|reprice|deposit-token|execute-fill|distribute|taker-too-small|crossing"] = process.argv.slice(2);
const res = await getSimulationResult(sim);
const target = res.steps.find((s) => { try { return s.TxId && cvToString(deserializeCV(s.Result.Transaction.Ok.result)).includes(want); } catch { return false; } });
if (!target) { console.log("no tx with that result"); process.exit(1); }
const r = await fetch(`https://api.stxer.xyz/devtools/v2/simulations/${sim}/inspect/${target.TxId}`);
const raw = execFileSync("zstd", ["-d", "-c"], { input: Buffer.from(await r.arrayBuffer()), maxBuffer: 1 << 28 });
const td = new TextDecoder(); const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const re = new RegExp(pat); const out = [];
function node(b, o, depth) {
  const cl = u32(b, o); o += 4; const code = td.decode(b.subarray(o, o + cl)); o += cl; o += 8 + 80;
  const fl = u32(b, o); o += 4; const func = td.decode(b.subarray(o, o + fl)); o += fl;
  const al = u32(b, o); o += 4; const args = [];
  for (let i = 0; i < al; i++) { const ok = b[o] === 0; o += 1; const len = u32(b, o); o += 4; if (ok) { try { args.push(cvToString(deserializeCV(b.subarray(o, o + len))).slice(0, 30)); } catch { args.push("?"); } } else args.push("ERR"); o += len; }
  const rok = b[o] === 0; o += 1; const rl = u32(b, o); o += 4; let result = ""; try { result = rok ? cvToString(deserializeCV(b.subarray(o, o + rl))).slice(0, 70) : td.decode(b.subarray(o, o + rl)).slice(0, 70); } catch { result = "?"; } o += rl;
  const label = code.includes(":") ? code.split(":").slice(1).join(":") : func;
  if (re.test(label) || re.test(func) || re.test(code)) out.push(`${"  ".repeat(Math.min(depth, 12))}${label}${args.length ? " (" + args.join(", ") + ")" : ""} -> ${result}`);
  const n = u32(b, o); o += 4; for (let i = 0; i < n; i++) o = node(b, o, depth + 1); return o;
}
node(raw, 6 + 64, 0);
console.log(`tx ${target.TxId}\n` + out.slice(0, 120).join("\n"));
