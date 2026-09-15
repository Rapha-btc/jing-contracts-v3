import { initSimnet } from "@stacks/clarinet-sdk";
import { Cl, cvToString, cvToValue } from "@stacks/transactions";
import fs from "node:fs";
const [,, manifest, contract, logPath, sideArg] = process.argv;
const SELL = sideArg === "sell";
const simnet = await initSimnet(manifest);
const accounts = simnet.getAccounts();
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const lines = fs.readFileSync(logPath, "utf8").split("\n").map(strip).filter((l) => l.startsWith("₿"));
const splitArgs = (s) => { const out=[]; let d=0, q=false, cur=""; for (const ch of s) { if (ch==='"') q=!q; if (!q && ch==="(") d++; if (!q && ch===")") d--; if (!q && ch===" " && d===0) { if (cur) out.push(cur); cur=""; } else cur+=ch; } if (cur) out.push(cur); return out; };
const D = accounts.get("deployer");
const ro = (fn, args=[]) => cvToValue(simnet.callReadOnlyFn(contract, fn, args, D).result);
const dv = (name) => { try { return cvToValue(simnet.getDataVar(contract, name)); } catch (e) { return "?"; } };
const state = () => {
  const bal = Number(ro("rv-sbtc-bal-of", [Cl.principal(`${D}.${contract}`)]) ?? 0);
  return bal;
};
let step = 0;
for (const l of lines) {
  if (l.includes("[PASS]") || l.includes("[FAIL]")) { if (l.includes("[FAIL]")) { console.log("FAIL reached at step", step); break; } continue; }
  const m = l.match(/^₿\s+\d+\s+Ӿ\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
  if (!m) continue;
  const [, wallet, c, fn, rest] = m;
  if (c !== contract) continue;
  const idx = Math.max(rest.lastIndexOf(" (ok"), rest.lastIndexOf(" (err"), rest.lastIndexOf(" (runtime"), rest.lastIndexOf(" (unknown"));
  const argStr = idx >= 0 ? rest.slice(0, idx) : (rest.startsWith("(ok")||rest.startsWith("(err") ? "" : rest);
  let args;
  try { args = splitArgs(argStr.trim()).map((a) => a === "0x" ? Cl.buffer(new Uint8Array(0)) : Cl.parse(a)); } catch (e) { console.log("PARSE FAIL", fn, JSON.stringify(argStr), String(e).slice(0,120)); continue; }
  const sender = accounts.get(wallet);
  let r;
  try { r = simnet.callPublicFn(contract, fn, args, sender); } catch (e) { console.log("CALL FAIL", fn, argStr.slice(0,80), String(e).slice(0,160)); continue; }
  step++;
  // state after each call
  const bal = SELL
    ? Number(cvToValue(simnet.callReadOnlyFn("mock-ft", "get-balance", [Cl.principal(`${D}.${contract}`)], D).result).value)
    : Number(simnet.getAssetsMap().get("STX")?.get(`${D}.${contract}`) ?? 0);
  let claims = 0n, members = 0;
  for (const [name, addr] of accounts) {
    const pos = cvToValue(simnet.callReadOnlyFn(contract, "get-position", [Cl.principal(addr)], D).result);
    claims += BigInt((SELL ? pos.sbtc : pos.stx).value);
    let has = false;
    try { const row = simnet.getMapEntry(contract, "positions", Cl.principal(addr)); has = cvToValue(row) !== null; } catch (e) { has = false; }
    if (has) members++;
  }
  const stranded = BigInt(bal) - claims;
  const tag = stranded > BigInt(members + 1) ? "  <== STRANDED" : "";
  if (tag || fn === "sync" || fn === "rv-settle" || fn === "rv-take" || fn === "claim" || fn === "withdraw" || fn === "deposit")
    console.log(step, wallet, fn, argStr.trim().slice(0, 40), cvToString(r.result).slice(0, 30), "| bal", bal, "claims", claims.toString(), "members", members, "epoch", dv("epoch").toString(), "shares", dv("total-shares").toString(), "idx", dv("unfilled-index").toString(), "pidx", dv("proceeds-index").toString(), "held", dv(SELL ? "held-ustx" : "held-sats").toString(), "acct", dv(SELL ? "sats-accounted" : "stx-accounted").toString(), tag);
}
