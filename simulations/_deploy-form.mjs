// _deploy-form.mjs - the DEPLOY FORM of a contract: comment lines dropped and
// leading indentation removed (whitespace between tokens carries no meaning
// in Clarity). markets-sbtc-stx-jing-v7 is 107,290 bytes comment-free, over
// the 100,000-byte deploy cap; de-indented it is ~85.7 KB. The v7 harnesses
// deploy this exact form, so the bytes that ship are the bytes that ran, and
// the sha512/256 below is what core-v6 `set-verified-contract` must hold.
//   npx tsx simulations/_deploy-form.mjs contracts/markets-sbtc-stx-jing-v7.clar > /tmp/v7.deploy.clar
//   npx tsx simulations/_deploy-form.mjs contracts/markets-sbtc-stx-jing-v7.clar --hash
import fs from "node:fs";
import { createHash } from "node:crypto";
const [file, flag] = process.argv.slice(2);
if (!file) { console.error("usage: _deploy-form.mjs <path.clar> [--hash]"); process.exit(2); }
export const deployForm = (t) => t.split("\n").filter((l) => !/^\s*;;/.test(l)).map((l) => l.replace(/^\s+/, "")).filter((l) => l.length).join("\n");
const out = deployForm(fs.readFileSync(file, "utf8"));
if (flag === "--hash") {
  const h = createHash("sha512-256").update(out).digest("hex");
  console.log(`${file}: ${Buffer.byteLength(out)} bytes, sha512/256 ${h}`);
} else {
  process.stdout.write(out);
}
