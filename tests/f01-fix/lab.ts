// Local simnet lab for the F-01 fix (rung proceeds deficit). Adapted from the SetDev review lab
// (~/projects/jingswap-sbtc-usdcx-review/tests/f01-lab/lab.ts). Jing sources are read from this repo's
// working tree; token deps (deps/*.clar) are the review's byte-identical mainnet copies. A local
// sbtc-registry stub lets the deployer act as sBTC protocol caller and the deployer gets USDCx
// mint/burn roles: this models a privileged token role, not who holds it on mainnet.
import {readFileSync} from 'node:fs';
import {getSDK} from '@stacks/clarinet-sdk';
import {Cl, ClarityValue, getAddressFromPrivateKey, privateKeyToPublic, signMessageHashRsv} from '@stacks/transactions';
import {keccak_256} from '@noble/hashes/sha3';
import {expect} from 'vitest';

export {Cl};
export const DEP = 'ST000000000000000000002AMW42H';
export const M = 'markets-sbtc-usdcx-jing-v6-4', L = 'jing-ladder-sbtc-usdcx-v1';
export const X = DEP + '.sbtc-token', Y = DEP + '.usdcx';
export const BTC = 10000000000000n;
export const wallet = (n: number) => getAddressFromPrivateKey(BigInt(n + 700).toString(16).padStart(64, '0') + '01', 'testnet');

const CONTRACTS = new URL('../../contracts/', import.meta.url);
const DEPS = new URL('./deps/', import.meta.url);
const jingSrc = (p: string) => readFileSync(new URL(p, CONTRACTS), 'utf8');
const depSrc = (n: string) => readFileSync(new URL(n + '.clar', DEPS), 'utf8');

const bindings: [string, string][] = [
  ["'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait", '.sip-010-trait-ft-standard.sip-010-trait'],
  ["'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", '.sbtc-token'],
  ["'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx", '.usdcx'],
  ["'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle", '.pyth-lazer-oracle'],
  ["'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1", '.pyth-lazer-decoder-v1'],
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v6-4", '.' + M],
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder-sbtc-usdcx-v1", '.' + L],
  ["'SP1G48FZ4Y7JY8G2Z0N51QTCYGBQ6F4J43J77BQC0.dia-oracle", '.dia-oracle'],
];
const trait = `(define-trait sip-010-trait (
 (transfer (uint principal principal (optional (buff 34))) (response bool uint))
 (get-name () (response (string-ascii 32) uint)) (get-symbol () (response (string-ascii 32) uint))
 (get-decimals () (response uint uint)) (get-balance (principal) (response uint uint))
 (get-total-supply () (response uint uint)) (get-token-uri () (response (optional (string-utf8 256)) uint))))`;

const TEST_KEY = '1'.padStart(64, '0') + '01';
export const PUB = privateKeyToPublic(TEST_KEY);
const uintBytes = (v: bigint | number, width: number) => Buffer.from(BigInt.asUintN(width * 8, BigInt(v)).toString(16).padStart(width * 2, '0'), 'hex');
export function signedUpdate(now: bigint, {px = BTC, py = 100000000n} = {}) {
  const fs = [{id: 1, price: px, expo: -8, conf: 1n, time: now * 1000000n}, {id: 7, price: py, expo: -8, conf: 1n, time: now * 1000000n}];
  const encoded = fs.map(f => {
    const props = [
      Buffer.concat([uintBytes(0, 1), uintBytes(f.price, 8)]),
      Buffer.concat([uintBytes(3, 1), uintBytes(1, 2)]),
      Buffer.concat([uintBytes(4, 1), uintBytes(f.expo, 2)]),
      Buffer.concat([uintBytes(5, 1), uintBytes(f.conf, 8)]),
      Buffer.concat([uintBytes(12, 1), uintBytes(1, 1), uintBytes(f.time, 8)]),
    ];
    return Buffer.concat([uintBytes(f.id, 4), uintBytes(props.length, 1), ...props]);
  });
  const payload = Buffer.concat([uintBytes(2479346549, 4), uintBytes(now * 1000000n, 8), uintBytes(0, 1), uintBytes(fs.length, 1), ...encoded]);
  const signature = Buffer.from(signMessageHashRsv({messageHash: Buffer.from(keccak_256(payload)).toString('hex'), privateKey: TEST_KEY}), 'hex');
  return Cl.buffer(Buffer.concat([uintBytes(706910618, 4), signature, uintBytes(payload.length, 2), payload]));
}

export const pp = (v: ClarityValue) => Cl.prettyPrint(v);

export async function boot() {
  const s: any = await getSDK({trackCosts: false} as any);
  await s.initEmptySession(null);
  s.setEpoch('4.0');
  const deploy = (name: string, original: string) => {
    const code = bindings.reduce((str, [a, b]) => str.replaceAll(a, b), original);
    const r = s.deployContract(name, code, {clarityVersion: 5}, DEP);
    return r;
  };
  const call = (c: string, f: string, a: ClarityValue[] = [], w = DEP) => s.callPublicFn(c, f, a, w);
  const read = (c: string, f: string, a: ClarityValue[] = [], w = DEP) => s.callReadOnlyFn(c, f, a, w);
  const ok = (r: any) => { expect(r.result.type, pp(r.result)).toBe('ok'); return r; };
  deploy('sip-010-trait-ft-standard', trait);
  deploy('sbtc-registry', `(define-read-only (is-protocol-caller (flag (buff 1)) (who principal)) (if (is-eq who '${DEP}) (ok true) (err u9)))`);
  for (const n of ['sbtc-token', 'usdcx', 'pyth-lazer-traits', 'pyth-lazer-oracle', 'pyth-lazer-decoder-v1', 'trait-dia-oracle', 'dia-oracle'])
    deploy(n, depSrc(n));
  deploy('jing-core-v6', jingSrc('jing-core-v6.clar'));
  deploy(L, jingSrc('sbtc-usdcx/' + L + '.clar'));
  deploy(M, jingSrc('sbtc-usdcx/' + M + '.clar'));
  ok(call('usdcx', 'set-active-protocol-caller', [Cl.principal(DEP), Cl.bufferFromHex('01'), Cl.bool(true)]));
  ok(call('usdcx', 'set-active-protocol-caller', [Cl.principal(DEP), Cl.bufferFromHex('02'), Cl.bool(true)]));
  ok(call('pyth-lazer-oracle', 'set-trusted-signers', [Cl.list([Cl.tuple({pubkey: Cl.bufferFromHex(PUB), 'expires-at': Cl.uint(s.getBlockTime() + 31536000n)})])]));
  ok(call('jing-core-v6', 'set-verified-contract', [Cl.principal(DEP + '.' + M)]));
  ok(call(M, 'initialize', [Cl.principal(DEP + '.' + M), Cl.principal(X), Cl.principal(Y), Cl.uint(1000), Cl.uint(1000000), Cl.uint(1), Cl.uint(7)]));
  ok(call(L, 'set-max-band-per-side', [Cl.uint(10)]));
  ok(call(M, 'sync-seat-count'));
  ok(call('dia-oracle', 'set-value', [Cl.stringAscii('BTC/USD'), Cl.uint(BTC), Cl.uint(s.getBlockTime() * 1000n)]));
  for (const side of ['sell', 'buy']) {
    const name = 'jing-' + side + '-sbtc-10';
    deploy(name, process.env.RUNG_DIR ? readFileSync(process.env.RUNG_DIR + '/jing-' + side + '-sbtc-bps.clar', 'utf8') : jingSrc('sbtc-usdcx/jing-' + side + '-sbtc-bps.clar'));
    ok(call(L, 'set-canonical', [Cl.stringAscii(side === 'sell' ? 'sel-band' : 'buy-band'), Cl.principal(DEP + '.' + name)]));
    ok(call(name, 'initialize', [Cl.uint(10), Cl.bool(true)]));
  }
  const fund = (who: string, x = 1000000000n, y = 1000000000000n) => {
    ok(call('sbtc-token', 'protocol-mint', [Cl.uint(x), Cl.principal(who), Cl.bufferFromHex('00')]));
    ok(call('usdcx', 'protocol-mint', [Cl.uint(y), Cl.principal(who)]));
  };
  const balance = (token: string, who: string): bigint => read(token, 'get-balance', [Cl.principal(who)]).result.value.value;
  const update = () => signedUpdate(s.getBlockTime());
  const dataVar = (contract: string, v: string): bigint => s.getDataVar(DEP + '.' + contract, v).value;
  const tokenArgs = (token: string, amt: bigint, owner: string) => token === X ? [Cl.uint(amt), Cl.principal(owner), Cl.bufferFromHex('00')] : [Cl.uint(amt), Cl.principal(owner)];
  const swap = (side: 'sell' | 'buy', taker: string) => call(M, 'swap', [
    Cl.uint(side === 'sell' ? 10000000n : 10000n),
    Cl.uint(side === 'sell' ? BTC * 110n / 100n : BTC * 90n / 100n),
    update(), Cl.principal(X), Cl.stringAscii('sbtc-token'), Cl.principal(Y), Cl.stringAscii('usdcx-token'), Cl.bool(side === 'buy')], taker);
  return {s, call, read, ok, fund, balance, update, dataVar, tokenArgs, swap};
}
