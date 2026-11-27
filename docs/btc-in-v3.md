# BTC-in adapter v3 / escrow v6 cutover

Prepared on `feat/btc-in-v3` in an isolated worktree. Production branch deployment awaits review. Deployer: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` (chavita.btc).

New BTC-in calls use `jing-btc-in-adapter-v3`; new deposit-keyed arms use `jing-btc-in-escrow-v6`. Adapter v1/v2 and escrow v3/v4/v5 remain available for rows pinned to those contracts. v6 uses the v4 ABI: arm `(txid vout fee-sats slippage-bps min-out arm-by)`, execute `(txid vout update)`, cancel `(txid vout)`; escrow v3 still cancels by ID.

Router bindings are `swap-router-sbtc-stx-jing-v6-1` (Zest pool 3, x=sBTC) and `swap-router-sbtc-usdcx-jing-v6` (Zest pool 4, x=sBTC). Explicit split builders carry the Zest amount/minimum fields and route, including zero/empty when unused. Zest output post-conditions permit the pool to send **at least zero** of the actual bought asset; they do not replace the user's sold-asset cap or the contract's minimum output.

## Release checks

The initial chain read found nine smart-target approvals missing; the final read confirmed all nine plus chavita's keeper permission. The local credential was rejected by the init endpoint; this work did not broadcast owner setters. Confirmation is from actual read-only contract calls, not simulated initialization.

The deployed-contract [stxer fork proof](https://stxer.xyz/simulations/mainnet/95bace7f534a3eebb3701036e1a16fa0) passed 16/16 checks: adapter v3 swap (including nonzero Zest and DLMM fills), real-registry-deposit escrow v6 arm, keeper execute with positive STX output, and parked liability cleared. Funding transfers and impersonation occur only inside the fork. No production swap was broadcast.

The indexer migration is still pending: SSH to Juice was rejected. The append-only SQL was shown before execution and tested locally for idempotency, legacy-trigger retention and unchanged per-subscription secrets. Do not use PATCH or create a new secret/subscription. Keep `poll-btc-in-events` replay enabled.

Base reviewed: `c67df04cc808e8f85327acc5ee073e0ee4a6fc45`.

## Changes and reproduction

Added a read-only owner-init release gate and a deployed-contract stxer proof. Production Clarity sources were not changed.

```sh
node simulations/check-btc-in-v3-init.mjs
STACKS_NODE=https://api.mainnet.hiro.so node simulations/verify-btc-in-v3-cutover.mjs
```

The proof uses a real completed sBTC registry deposit and live venues. It checks the keeper permission without setting it on the fork. The adapter swap spent through Zest as well as DLMM. The escrow execution returned positive STX and cleared its parked balance. The node API override is also used by Lazer decoding; Juice's HTTP API was unreachable from this session.

Both scripts passed `node --check`. Owner-init reads passed 10/10; fork assertions passed 16/16. See [init evidence](btc-in-v3/init.json) and [fork evidence](btc-in-v3/fork.json). TypeScript/app builds are not applicable to these JavaScript validation scripts.

Review the proof and retain the initializer as a release gate. No production contract deployment or transaction was sent by these scripts.
