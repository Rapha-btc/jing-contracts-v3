// probe-old-usdcx-holders.mjs - who still holds funds on the retired
// sBTC/USDCx v6-4 set (markets-sbtc-usdcx-jing-v6-4 + jing-{buy,sell}-sbtc-<bps>)?
// Read-only, mainnet tip, through the box node. Also checks the old rungs'
// ladder registration (dispatch exits need it) and the get-position shape.
import { Cl, cvToHex, hexToCV, cvToJSON } from '@stacks/transactions';
const NODE = process.env.STACKS_NODE || 'http://77.42.3.101/stacks-api';
const D = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const BPS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90];
async function ro(cid, fn, args = []) {
  const [a, n] = cid.includes('.') ? cid.split('.') : [D, cid];
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${NODE}/v2/contracts/call-read/${a}/${n}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sender: D, arguments: args.map(cvToHex) }) });
    if (r.ok) { const j = await r.json(); if (!j.okay) throw new Error(`${n}.${fn}: ${j.cause}`); return cvToJSON(hexToCV(j.result)); }
    await new Promise((s) => setTimeout(s, 1000));
  }
  throw new Error(`${n}.${fn} failed`);
}
const flat = (v) => { while (v && typeof v === 'object' && 'value' in v && !Array.isArray(v.value) && typeof v.value !== 'object') return v.value; return v; };
const tup = (v) => { while (v && v.type && !String(v.type).startsWith('(tuple') && v.value && typeof v.value === 'object') v = v.value; return Object.fromEntries(Object.entries(v.value ?? {}).map(([k, x]) => [k, x.value])); };
const who = (process.env.WHO || '').split(',').filter(Boolean);
const cands = who.length ? who : [
  'SP1YT273ZNW9Q1Q3Q6JH4S6K2ZHAH0YBW19RAWMDP', 'SP2WRKMXSS8P7NPTH1NSX5HCGPK8R4WGBR5FQG8MF', 'SP3NFPMB1SRQHA8SGPX4KDDX4EC6XXDRJ9Z3CGJ7E',
  'SP1BP036PHHJMZG6G2YYVKW4GH15KRD7YNKT6VW8Q', 'SP22A5S8P4F56H6ND2XZDSYTJ3VWXP8BERX2CGG2E', 'SP3X62M5MSB2VNMVWM7913E8QF2RYS37JPCRFCMP2',
  'SP34HBPH4EHPVW0NSXBCV5Z27FAGTC62RV5Y9Y9MR', D,
  ...(process.env.EXTRA || '').split(',').filter(Boolean),
];
console.log('== registration on jing-ladder-sbtc-usdcx-v1 ==');
for (const side of ['buy', 'sell']) for (const b of BPS) {
  const r = `${D}.jing-${side}-sbtc-${b}`;
  const reg = await ro('jing-ladder-sbtc-usdcx-v1', 'get-registered', [Cl.principal(r)]);
  const st = tup(await ro(r, 'get-state'));
  console.log(`${r.split('.')[1]}: reg ${JSON.stringify(reg.value?.value ?? null)} members ${st.members} resting ${st.resting} deficit ${st.deficit ?? 'n/a'}`);
}
console.log('\n== positions ==');
for (const w of cands) for (const side of ['buy', 'sell']) for (const b of BPS) {
  const p = tup(await ro(`jing-${side}-sbtc-${b}`, 'get-position', [Cl.principal(w)]));
  if (Object.values(p).some((x) => x !== '0' && x !== 0)) console.log(`${w} jing-${side}-sbtc-${b}`, JSON.stringify(p));
}
const M = 'markets-sbtc-usdcx-jing-v6-4';
const cyc = (await ro(M, 'get-current-cycle')).value;
console.log(`\n== market ${M} cycle ${cyc} ==`);
for (const s of ['x', 'y']) {
  const deps = await ro(M, `get-token-${s}-depositors`, [Cl.uint(cyc)]);
  console.log(`depositors ${s}:`, JSON.stringify((deps.value ?? []).map((d) => d.value)));
}
for (const w of cands) for (const s of ['x', 'y']) {
  const live = (await ro(M, `get-token-${s}-deposit`, [Cl.uint(cyc), Cl.principal(w)])).value;
  const parked = (await ro(M, `get-token-${s}-parked`, [Cl.principal(w)])).value;
  const pd = (await ro(M, `get-token-${s}-pending-deposit`, [Cl.principal(w)])).value;
  if (live !== '0' || parked !== '0' || pd) console.log(`${w} ${s}: live ${live} parked ${parked} pending ${JSON.stringify(pd)}`);
}
