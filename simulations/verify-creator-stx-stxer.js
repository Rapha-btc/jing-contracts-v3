// Mainnet-fork verification of the exact deployment source; no real transactions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Cl, ClarityVersion, deserializeCV, cvToString } from '@stacks/transactions';
import { SimulationBuilder, getSimulationResult } from 'stxer';

const OWNER = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const CREATOR = 'SP3AJC728JY0Y43E8RT6K4VDWPT265RDMXJ8M0VH0';
const OTHER = 'SP3C1YFP86PVM9VT0119NXH54DW9KWDVVGS571VVT';
const STRANGER = 'SP000000000000000000002Q6VF78';
// Stand-in only: 3hunna has not supplied his own wallet yet.
const WALLET = 'SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.studiosam-wallet';
const OTHER_WALLET = 'SP28MP1HQDJWQAFSQJN2HBAXBVP7H7THD1W2NYZVK.emmex-wallet';
const NAME = 'creator-escrow-stx-jing';
const CID = `${OWNER}.${NAME}`;
const PRICE = 1_000_000;
const source = fs.readFileSync('./contracts/deploying/creator-escrow-stx-jing.clar', 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const b = SimulationBuilder.new();
const plan = [];
const capture = {};
const start = (count, price = PRICE, twoCreators = false) => [
  Cl.principal(CREATOR), Cl.principal(WALLET),
  Cl.principal(twoCreators ? OTHER : CREATOR), Cl.principal(twoCreators ? OTHER_WALLET : WALLET),
  Cl.uint(price), Cl.uint(count),
];
const content = (tag = 1) => [Cl.stringUtf8(`https://x.com/3hunna/status/${tag}`), Cl.buffer(Buffer.alloc(32, tag))];
function call(label, sender, fn, args, expect) {
  b.withSender(sender).addContractCall({ contract_id: CID, function_name: fn, function_args: args });
  plan.push({ kind: 'tx', label, expect });
}
function evaluate(label, code, expect, key) {
  b.addEvalCode(CID, code);
  plan.push({ kind: 'eval', label, expect, key });
}
function balance(principal, key) { evaluate(key, `(stx-get-balance '${principal})`, undefined, key); }
function advance(n) {
  b.addAdvanceBlocks({ bitcoin_blocks: n, stacks_blocks_per_bitcoin: 1 });
  plan.push({ kind: 'advance', label: `advance ${n} Bitcoin blocks` });
}
b.withSender(OWNER).addContractDeploy({ contract_name: NAME, source_code: source, clarity_version: ClarityVersion.Clarity4 });
plan.push({ kind: 'deploy', label: 'deploy exact STX source' });
evaluate('empty escrow', '(get-escrow-balance)', 'u0');
call('owner guard', STRANGER, 'start-round', start(1), '(err u100)');
call('zero price rejected', OWNER, 'start-round', start(1, 0), '(err u112)');
call('zero count rejected', OWNER, 'start-round', start(0), '(err u112)');
balance(OWNER, 'ownerBeforeFunding');
call('fund ONE delivery with STX', OWNER, 'start-round', start(1), '(ok u1)');
evaluate('single-video round stores identical creator and payout slots', `(let ((r (unwrap-panic (get-round u1)))) (and (is-eq (get creator-a r) '${CREATOR}) (is-eq (get creator-b r) '${CREATOR}) (is-eq (get creator-a-wallet r) '${WALLET}) (is-eq (get creator-b-wallet r) '${WALLET}) (is-eq (get num-videos r) u1)))`, 'true');
balance(OWNER, 'ownerAfterFunding');
evaluate('escrow holds 1 STX', '(get-escrow-balance)', `u${PRICE}`);
call('live cycle blocks next', OWNER, 'start-round', start(1), '(err u103)');
balance(WALLET, 'walletBefore'); balance(CREATOR, 'creatorBefore');
call('submit guard', STRANGER, 'submit-delivery', content(), '(err u101)');
call('3hunna submits', CREATOR, 'submit-delivery', content(), '(ok u1)');
call('capacity guard', CREATOR, 'submit-delivery', content(2), '(err u119)');
call('cannot unlock early', CREATOR, 'release', [Cl.uint(1), Cl.bool(true)], '(err u116)');
call('approval guard', STRANGER, 'approve', [Cl.uint(1)], '(err u100)');
call('veto guard', STRANGER, 'veto', [Cl.uint(1), Cl.stringUtf8('Revise')], '(err u100)');
call('owner requests revision', OWNER, 'veto', [Cl.uint(1), Cl.stringUtf8('Revise')], '(ok true)');
call('cannot claim vetoed', CREATOR, 'release', [Cl.uint(1), Cl.bool(true)], '(err u116)');
call('amend guard', STRANGER, 'amend-delivery', [Cl.uint(1), ...content(2)], '(err u101)');
call('3hunna amends', CREATOR, 'amend-delivery', [Cl.uint(1), ...content(2)], '(ok true)');
evaluate('amended URI/hash/status updated', '(let ((d (unwrap-panic (get-delivery u1)))) (and (is-eq (get content-uri d) u"https://x.com/3hunna/status/2") (is-eq (get content-hash d) 0x' + Buffer.alloc(32, 2).toString('hex') + ') (is-eq (get status d) u0)))', 'true');
call('owner approves early', OWNER, 'approve', [Cl.uint(1)], '(ok true)');
call('duplicate approval rejected', OWNER, 'approve', [Cl.uint(1)], '(err u109)');
call('unlock guard', STRANGER, 'release', [Cl.uint(1), Cl.bool(true)], '(err u101)');
call('must accept terms', CREATOR, 'release', [Cl.uint(1), Cl.bool(false)], '(err u115)');
call('3hunna unlocks payout', CREATOR, 'release', [Cl.uint(1), Cl.bool(true)], '(ok true)');
balance(WALLET, 'walletAfter'); balance(CREATOR, 'creatorAfter');
evaluate('escrow drained by payout', '(get-escrow-balance)', 'u0');
call('double claim rejected', CREATOR, 'release', [Cl.uint(1), Cl.bool(true)], '(err u116)');
call('paid cycle permits next immediately', OWNER, 'start-round', start(1), '(ok u2)');
call('sweep exhausted old cycle', OWNER, 'sweep', [Cl.uint(1)], '(ok u0)');
evaluate('zero refund preserves new funding', '(get-escrow-balance)', `u${PRICE}`);
call('double sweep rejected', OWNER, 'sweep', [Cl.uint(1)], '(err u113)');
call('submit timed delivery', CREATOR, 'submit-delivery', content(3), '(ok u2)');
call('cannot expire live delivery', STRANGER, 'expire', [Cl.uint(2)], '(err u117)');
advance(288);
call('approval closes at review boundary', OWNER, 'approve', [Cl.uint(2)], '(err u108)');
call('veto closes at review boundary', OWNER, 'veto', [Cl.uint(2), Cl.stringUtf8('Late')], '(err u108)');
call('claim opens at review boundary', CREATOR, 'release', [Cl.uint(2), Cl.bool(true)], '(ok true)');
call('open two-creator cycle', OWNER, 'start-round', start(3, PRICE, true), '(ok u3)');
balance(OTHER_WALLET, 'otherWalletBefore');
call('second creator submits', OTHER, 'submit-delivery', content(4), '(ok u3)');
call('approve second creator', OWNER, 'approve', [Cl.uint(3)], '(ok true)');
call('creator A cannot unlock B delivery', CREATOR, 'release', [Cl.uint(3), Cl.bool(true)], '(err u101)');
call('creator B unlocks to B wallet', OTHER, 'release', [Cl.uint(3), Cl.bool(true)], '(ok true)');
balance(OTHER_WALLET, 'otherWalletAfter');
call('submit abandoned delivery', CREATOR, 'submit-delivery', content(5), '(ok u4)');
call('live sweep rejected', OWNER, 'sweep', [Cl.uint(3)], '(err u105)');
advance(4200);
call('pending prevents refund', OWNER, 'sweep', [Cl.uint(3)], '(err u111)');
call('claim grace prevents expiry', STRANGER, 'expire', [Cl.uint(4)], '(err u117)');
call('late submission rejected', CREATOR, 'submit-delivery', content(6), '(err u104)');
advance(288);
call('anyone expires abandoned delivery', STRANGER, 'expire', [Cl.uint(4)], '(ok true)');
call('expired cannot claim', CREATOR, 'release', [Cl.uint(4), Cl.bool(true)], '(err u116)');
call('refund owner guard', STRANGER, 'sweep', [Cl.uint(3)], '(err u100)');
balance(OWNER, 'ownerBeforeRefund');
call('refund unspent STX', OWNER, 'sweep', [Cl.uint(3)], `(ok u${PRICE * 2})`);
balance(OWNER, 'ownerAfterRefund');
evaluate('escrow empty after refund', '(get-escrow-balance)', 'u0');
call('repeat refund rejected', OWNER, 'sweep', [Cl.uint(3)], '(err u113)');

const sessionId = process.env.STXER_SESSION_ID || await b.run();
const url = `https://stxer.xyz/simulations/mainnet/${sessionId}`;
console.log(`Simulation: ${url}\nSource SHA-256: ${sourceSha256}`);
const result = await getSimulationResult(sessionId);
fs.writeFileSync('/tmp/creator-stx-stxer-results.json', JSON.stringify({ sessionId, url, sourceSha256, plan, result }, null, 2));
assert.equal(result.steps.length, plan.length, 'simulation must return every planned step');
let passed = 0;
for (const [i, p] of plan.entries()) {
  const step = result.steps[i];
  if (p.kind === 'advance') {
    assert.ok(step.Result && !JSON.stringify(step.Result).includes('"Err"'), `${p.label}: ${JSON.stringify(step)}`);
  } else {
    const r = p.kind === 'eval' ? step.Result?.Eval : step.Result?.Transaction;
    assert.ok(r && 'Ok' in r, `${p.label}: ${JSON.stringify(step)}`);
    const decoded = cvToString(deserializeCV(p.kind === 'eval' ? r.Ok : r.Ok.result));
    if (p.expect !== undefined) assert.equal(decoded, p.expect, p.label);
    if (p.key) { assert.match(decoded, /^u\d+$/, p.label); capture[p.key] = BigInt(decoded.slice(1)); }
    console.log(`PASS ${p.label}: ${decoded}`);
  }
  passed++;
}
for (const [label, before, after, expected] of [
  ['owner funds exact STX amount', 'ownerBeforeFunding', 'ownerAfterFunding', -BigInt(PRICE)],
  ['smart wallet receives payout', 'walletBefore', 'walletAfter', BigInt(PRICE)],
  ['operating address receives no payout', 'creatorBefore', 'creatorAfter', 0n],
  ['second creator smart wallet receives payout', 'otherWalletBefore', 'otherWalletAfter', BigInt(PRICE)],
  ['owner receives exact refund', 'ownerBeforeRefund', 'ownerAfterRefund', BigInt(PRICE * 2)],
]) {
  assert.equal(capture[after] - capture[before], expected, label);
  console.log(`PASS ${label}: ${expected} microSTX`); passed++;
}
console.log(`${passed} checks passed. ${url}`);
