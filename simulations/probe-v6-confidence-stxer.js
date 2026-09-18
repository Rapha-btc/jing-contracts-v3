// Read actual signed Pyth prices/confidence through deployed v6 on a mainnet fork.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { cvToString, deserializeCV } from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult } from 'stxer';
import { fetchLazerUpdateAny } from './_lazer.js';
const cid = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6';
const update = await fetchLazerUpdateAny();
const b = SimulationBuilder.new();
const code = `(let ((feeds (try! (lazer-feeds 0x${update.hex.replace(/^0x/, '')}))))
  (ok {btc: (get feed-x feeds), stx: (get feed-y feeds),
    btc-threshold: (/ (to-uint (get price (get feed-x feeds))) MAX_CONF_RATIO),
    stx-threshold: (/ (to-uint (get price (get feed-y feeds))) MAX_CONF_RATIO),
    btc-passes: (< (get conf (get feed-x feeds)) (/ (to-uint (get price (get feed-x feeds))) MAX_CONF_RATIO)),
    stx-passes: (< (get conf (get feed-y feeds)) (/ (to-uint (get price (get feed-y feeds))) MAX_CONF_RATIO))}))`;
b.addEvalCode(cid, code);
const sessionId = await b.run();
console.log(`https://stxer.xyz/simulations/mainnet/${sessionId}`);
const result = await getSimulationResult(sessionId);
fs.writeFileSync('/tmp/v6-confidence-stxer.json', JSON.stringify({sessionId, result}, null, 2));
const r = result.steps[0]?.Result?.Eval;
assert.ok(r && 'Ok' in r, JSON.stringify(r));
const decoded = cvToString(deserializeCV(r.Ok));
assert.ok(decoded.startsWith("(ok "), `Feed verification failed: ${decoded}`);
console.log(decoded);
