# Arkadiko multisig oracle (arkadiko-oracle-v2-3)

Status as of **July 9, 2026**: **dead**. Last update landed **2026-07-01**
(stored STX price $0.161407 at burn height 956,153 vs $0.169 market when
checked - ~1,215 burn blocks / ~8.4 days stale). The contract itself is sound
and battle-tested (90k+ lifetime update txs); the off-chain signer + keeper
infra behind it simply stopped. Assessed as a Pyth replacement for Jing RFQ
and rejected on that basis - see `../pyth/README.md` for the full oracle
landscape and why we chose the native miner-commit price instead.

`arkadiko-oracle-v2-3.clar` in this folder is a **vendored copy for study** of
`SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-oracle-v2-3`. It is NOT
deployed by us, NOT referenced by any Jing contract, and NOT registered in
Clarinet.toml (it depends on `.arkadiko-oracle-trait-v1` and `.arkadiko-dao`,
which are not in this project).

## Trust model in one line

Off-chain signers ARE the oracle, the contract is an N-of-M signature verifier
with replay protection, and the keeper that submits the tx is an untrusted
stamp-licker - anyone can call `update-price-multi`; only the signatures carry
authority.

## The three roles

1. **Price signers (off-chain)**: N machines, each holding a secp256k1 key
   whose compressed pubkey the DAO owner registered via `set-trusted-oracle`.
   Each independently observes the market and signs the price message. The
   threshold is `minimum-valid-signers` (data-var, read on-chain: **u3**).
2. **Keeper (off-chain, untrusted)**: any account that collects >= 3
   signatures and submits `update-price-multi`, paying the gas. Arkadiko's
   keeper was `SP3K198T4PSVAPJT5K3060HXWEDVMKGA2S4TB0K9C` (nonce 90k+).
3. **DAO owner (on-chain admin)**: `arkadiko-dao get-dao-owner`. Manages the
   signer set, the threshold, and the token registry - and has a **direct
   price backdoor**: `update-price-owner` writes any price with zero
   signatures.

## The signed message

Signers do NOT sign Clarity structured data (no SIP-018). They sign an
EVM-flavored digest so standard Ethereum tooling can produce signatures:

```clarity
(get-signable-message-hash block token-id price decimals)
;; = (keccak256 (concat uint256-be(block) uint256-be(token-id)
;;                      uint256-be(price)  uint256-be(decimals)))
```

Four uints, each serialized as a 32-byte big-endian buffer (see
`uint256-to-buff-be`), concatenated, keccak256-hashed. Signature format is
65-byte RSV. `pubkey-price-signer` runs `secp256k1-recover?` on the digest and
`check-price-signer` returns u1 iff the recovered pubkey is in
`trusted-oracles`.

## Update flow (`update-price-multi`)

Args: `block` (burn height the message was signed for), `token-id`, `price`,
`decimals`, `signatures` (list up to 10 x buff 65). The fold/map plumbing with
10-element padded lists is just Clarity's way of iterating the signature list.

Gates, in order:

1. **Freshness**: `burn-block-height < block + 10` - the signed message is
   valid for ~10 Bitcoin blocks (~100 min). This is the ONLY staleness gate in
   the whole contract, and it gates writes, not reads.
2. **Signature uniqueness**: every signature's exact bytes are checked against
   the `signatures-used` map and permanently marked used
   (`check-unique-signatures-iter`). A signature can never be replayed - not
   in this tx, not ever.
3. **Threshold**: each signature is recovered against the digest; valid+trusted
   ones count u1. If the sum >= `minimum-valid-signers`, the price is stored;
   otherwise the call returns `(ok false)` - note: NOT an error, and the
   signatures are already burned by step 2.

Storage write: `update-price-multi-helper` looks up all names mapped to the
token-id (up to 4) and sets each to
`{ last-price: price, last-block: burn-block-height, decimals: decimals }`.
Note `last-block` is the block at execution time, not the signed `block`.

## Worked example (the last stSTX update ever, 2026-07-01)

Tx `0x20427b07...92a8`, called by the keeper, result `(ok true)`:

- `block: 956153` - signed at that burn height, submitted within the 10-block
  window.
- `token-id: 8` - registry maps u8 to `("stSTX" "ststx-token")`, so ONE push
  updates both names.
- `price: 190440`, `decimals: 1000000` - stSTX = $0.19044. Cross-check: STX
  was stored at $0.161407, implying stSTX/STX ~ 1.18, which is exactly the
  accrued-yield ratio you'd expect.
- `signatures`: exactly 3 RSV sigs = the minimum threshold.

## Token registry (init block)

| id | names | note |
|----|-------|------|
| u1 | STX, xSTX | one push updates both |
| u2 | BTC, xBTC | |
| u3 | USDA | |
| u4 | STX/USDA | a pair, not an asset |
| u5 | DIKO | |
| u6 | atALEX, auto-alex | |
| u7 | atALEXv2, auto-alex-v2 | |
| u8 | stSTX, ststx-token | |

DAO owner can append names via `set-token-id` (max 4 names per id).

## Read side - and what consumers MUST do

`get-price(token-name)` returns `{ last-price, last-block, decimals }`, with
an all-zeros default for unknown tokens. `fetch-price` is the same behind the
`oracle-trait` response wrapper.

**There is no staleness check on reads.** The contract cannot distinguish "no
news" from "no change" - it serves the last stamp forever, which is exactly
how it has been quietly serving July 1 prices for a week. Any consumer must
gate on `last-block` against `burn-block-height` itself (Arkadiko's vault
liquidation contracts do). A consumer that forgets this check inherits a
frozen price feed silently.

## Audit notes (gotchas in the design)

- **Signatures are deduped by BYTES, not by recovered signer.** The uniqueness
  map keys on the 65-byte signature. ECDSA with random nonces (non-RFC6979)
  can produce many distinct signatures from the SAME key over the SAME digest;
  each would recover to the same trusted pubkey and each would count u1 toward
  the threshold. Whether 1-of-N can impersonate 3-of-N therefore depends on
  the SIGNER IMPLEMENTATION being deterministic, which the contract cannot
  enforce. A robust design dedupes by recovered pubkey. (Also true trivially:
  the same signer can sign adjacent blocks' messages, but that's within one
  signer's authority anyway.)
- **Failed threshold still burns signatures** (map-set happens before the
  count check) and returns `(ok false)` rather than an error - a keeper
  submitting a 2-of-3 bundle by mistake wastes those exact sig bytes forever.
- **Owner backdoor**: `update-price-owner` bypasses signatures entirely. The
  DAO owner is a full price oracle on their own.
- **`signatures-used` grows forever** (one entry per signature ever seen) -
  fine economically on Stacks, but it's unbounded state.
- **Freshness window is generous**: 10 burn blocks (~100 min) between signing
  and landing. Fine for lending liquidations at 15-min cadence; too slow to
  seed a CEX-hedged RFQ quote.

## Why it matters to Jing

- The verification shape is the same as our RFQ SIP-018 flow: signed message
  verified on-chain, courier irrelevant. The difference is WHO signs - N paid
  oracle boxes here vs the self-interested client in RFQ. That difference is
  the entire ops bill, and it is why this oracle died when someone stopped
  paying it: revival means running >= 3 independent signer boxes + a keeper,
  forever ("easy to build an oracle network" - true, but it's a pager, not a
  contract).
- The native miner-commit price (see `rfq/rfq-sbtc-stx-jing-v2.clar` and
  `../pyth/README.md`) gets guardrail-grade prices with zero off-chain
  infrastructure, which is why we went that way.
- If Jing ever DOES need a real multi-asset push oracle, this contract is a
  good fork base: proven at 90k updates, simple, and the two fixes it needs
  are known (dedupe by pubkey, read-side staleness helper).
