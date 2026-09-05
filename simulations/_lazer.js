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
    body: JSON.stringify({ priceFeedIds: ids, properties: ["price", "exponent", "confidence", "publisherCount"], formats: ["evm"], channel: "fixed_rate@1000ms", jsonBinaryEncoding: "hex" }) });
  if (!r.ok) throw new Error(`Lazer ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const f = Object.fromEntries(j.parsed.priceFeeds.map((e) => [e.priceFeedId, e]));
  const a = f[ids[0]], b = f[ids[1]];
  if (!a || !b || a.exponent !== b.exponent) throw new Error("Lazer parsed feeds missing or expo mismatch");
  return { hex: j.evm.data, px: BigInt(a.price), py: BigInt(b.price), ts: Number(j.parsed.timestampUs) / 1e6, expo: a.exponent };
}
