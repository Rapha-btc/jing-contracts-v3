// _lazer.js - shared Pyth Lazer (Pyth Pro) fetch for the v4 harnesses.
// One signed update carrying BTC/USD (feed 1) + STX/USD (feed 45), evm
// format (what SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1
// accepts), 1000ms channel (the plan's rate), WITH confidence (the market
// requires it). Needs PYTH_API_KEY (Pyth Pro key from pythdata.app).
export const LAZER_FEED_X = 1n; // BTC/USD
export const LAZER_FEED_Y = 45n; // STX/USD
export async function fetchLazerUpdate(ids = [1, 45]) {
  const key = process.env.PYTH_API_KEY;
  if (!key) throw new Error("PYTH_API_KEY is required (Pyth Pro key from pythdata.app)");
  const r = await fetch("https://pyth-lazer.dourolabs.app/v1/latest_price", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ priceFeedIds: ids, properties: ["price", "exponent", "confidence", "publisherCount", "feedUpdateTimestamp"], formats: ["evm"], channel: "fixed_rate@1000ms", jsonBinaryEncoding: "hex" }) });
  if (!r.ok) throw new Error(`Lazer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const f = Object.fromEntries(j.parsed.priceFeeds.map((e) => [e.priceFeedId, e]));
  const a = f[ids[0]], b = f[ids[1]];
  if (!a || !b || a.exponent !== b.exponent) throw new Error("Lazer parsed feeds missing or expo mismatch");
  // futX/futY: each feed's own feedUpdateTimestamp (micros). Equal to
  // timestampUs when the price was made in this update, older when Lazer
  // carried the last price forward. The market judges freshness on these.
  return { hex: j.evm.data, px: BigInt(a.price), py: BigInt(b.price), ts: Number(j.parsed.timestampUs) / 1e6, expo: a.exponent,
    futX: Number(a.feedUpdateTimestamp ?? 0), futY: Number(b.feedUpdateTimestamp ?? 0) };
}

// Same fetch with custom feed ids / properties, for the negative paths
// (single feed -> ERR_FEED_MISSING, no confidence -> ERR_PRICE_UNCERTAIN).
export async function fetchLazerUpdateOpts({ ids = [1, 45], properties = ["price", "exponent", "confidence", "publisherCount"] } = {}) {
  const key = process.env.PYTH_API_KEY;
  if (!key) throw new Error("PYTH_API_KEY is required");
  const r = await fetch("https://pyth-lazer.dourolabs.app/v1/latest_price", { method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ priceFeedIds: ids, properties, formats: ["evm"], channel: "fixed_rate@1000ms", jsonBinaryEncoding: "hex" }) });
  if (!r.ok) throw new Error(`Lazer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { hex: j.evm.data, parsed: j.parsed };
}

// No PYTH_API_KEY on this machine: the faktory-dao backend fetches the same
// signed update with its own key (GET /api/auction/pyth-lazer-update, the
// route the jingswap front end uses). The x-api-key it wants is the public
// one shipped in the jingswap.com bundle (FAKTORY_API_KEY to override).
export async function fetchLazerUpdateAny(ids = [1, 45]) {
  if (process.env.PYTH_API_KEY) return fetchLazerUpdate(ids);
  const key = process.env.FAKTORY_API_KEY || "jc_e4d2e10396eef95215a7afd492f42d743a3325739d29200c2a28b256f778be01";
  const base = process.env.FAKTORY_API_URL || "https://faktory-dao-backend.vercel.app";
  const r = await fetch(`${base}/api/auction/pyth-lazer-update?pair=sbtc-stx`, { headers: { "x-api-key": key } });
  if (!r.ok) throw new Error(`backend lazer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = (await r.json()).data;
  const ts = Number(d.timestampUs) / 1e6;
  return { hex: d.hex, px: BigInt(d.priceX), py: BigInt(d.priceY), ts, expo: d.exponent, futX: Number(d.timestampUs), futY: Number(d.timestampUs) };
}

// Per-feed publish times of a Lazer update, read through the mainnet
// decoder's read-only `decode-lazer-payload` (the evm envelope is
// 4 magic + 65 signature + 2 payload length + payload). `at` is the OLDER of
// the two feeds' feed-update-timestamps in whole seconds: what markets v7
// anchors on (a fresh envelope can carry a price Lazer carried forward).
export async function lazerFeedTimes(hex, ids = [1, 45]) {
  const { bufferCV, serializeCV, hexToCV, cvToJSON } = await import("@stacks/transactions");
  const buf = Buffer.from(hex.replace(/^0x/, ""), "hex");
  const len = buf.readUInt16BE(69);
  const payload = buf.subarray(71, 71 + len);
  const base = process.env.STACKS_API_URL || "http://77.42.3.101/stacks-api";
  const r = await fetch(`${base}/v2/contracts/call-read/SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8/pyth-lazer-decoder-v1/decode-lazer-payload`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: "SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8", arguments: ["0x" + Buffer.from(serializeCV(bufferCV(payload)), "hex").toString("hex").replace(/^0x/, "")] }),
  });
  const j = await r.json();
  if (!j.okay) throw new Error(`decode-lazer-payload: ${JSON.stringify(j).slice(0, 200)}`);
  const v = cvToJSON(hexToCV(j.result)).value.value;
  const feeds = v["price-feeds"].value.map((f) => f.value);
  const tsOf = (id) => { const f = feeds.find((x) => Number(x["feed-id"].value) === id); const t = f?.["feed-update-timestamp"]?.value?.value; if (!t) throw new Error(`feed ${id}: no feed-update-timestamp`); return Number(t) / 1e6; };
  const x = tsOf(ids[0]), y = tsOf(ids[1]);
  return { x, y, at: Math.floor(Math.min(x, y)), envelope: Number(v.timestamp.value) / 1e6 };
}
