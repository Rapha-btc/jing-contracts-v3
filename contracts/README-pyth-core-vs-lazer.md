# Pyth on Stacks: Core (what our markets use) vs Lazer / Pro

Written 2026-09-03 while trying to run the v2 market sims against the
deployed bytes. Facts below were checked on chain and in Pyth's docs on
that date; the "what it means for us" part is our reading.

## The two products

| | Pyth Core (our path) | Pyth Lazer, now sold as "Pyth Pro" |
|---|---|---|
| What it is | The original pull oracle. Prices aggregate on Pythnet, Wormhole guardians attest them, Hermes serves the attested update (a "PNAU" payload, `0x504e4155` prefix). | A lower-latency feed (1 ms to 200 ms channels), signed directly by Pyth-run signer keys, sold by subscription. Renamed Pyth Pro; docs.pyth.network/lazer now redirects there. |
| How a Stacks contract verifies it | `SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4` `verify-and-update-price-feeds`: Wormhole guardian signatures are checked by `wormhole-core-v4`, the payload is decoded by `pyth-pnau-decoder-v3`, prices are written to `pyth-storage-v4` (which emits an `updated` print per feed). | `SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle` `verify-price-feeds` (deployed block 8612235, late July 2026): checks secp256k1 signatures from a governance-managed list of up to 16 trusted signers, applies its own staleness window, returns the decoded feeds. Verify-only. It does NOT write `pyth-storage-v4`. |
| Who signs | Wormhole guardian set (19 guardians, quorum 13). | Pyth's own signer keys. |
| Where the bytes come from | Hermes (`hermes.pyth.network`, or `pyth.dourolabs.app/hermes` after the Aug 2026 upgrade). | Pyth Pro / Lazer endpoints. |
| Access | Hermes requires an API key since the Core upgrade completed on 2026-08-26 16:00 UTC. Free trial, then paid plans. | API key, subscription tiers. |
| Freshness on chain | Whatever the last poster wrote to `pyth-storage-v4`. Our markets require the stored publish-time to be within `MAX_STALENESS` (80 s) of block time AND always call `verify-and-update-price-feeds` with the VAA passed in. | Per call; nothing persists. |

Both are Pyth products. Lazer / Pro is not a replacement of Core; Pyth's own
framing is "complementary". Pythnet, the chain that feeds Core, is scheduled to
be retired later in 2026 (OP-PIP-100); Pyth says Core continues on the upgraded
infrastructure. Stacks is not listed on Pyth's contract-address index; the
Stacks integration is the Trust Machines `stacks-pyth-bridge` (beta), which
lists the v4 set above as current.

## What the chain shows (checked 2026-09-03)

`pyth-storage-v4` last updates:

| Feed | Last publish-time | Posted by |
|---|---|---|
| BTC/USD | 2026-08-21 22:22:01 | `SP…9B1WSYBM8HD0WBQ1E1WRXEGSENS.vault-v1-0` (`price-data (optional (buff …))`, BTC only) |
| STX/USD | 2026-08-17 11:33:44 | Granite `…48AGBHQAW3R3ZW1QF4N.borrow-helper-v2-1-7` and Zest `…QCCRCARCYD1CC5N7M6688BSYADJ7.v0-6-market`, dual-feed PNAU VAAs |

Nothing has been written to `pyth-storage-v4` since 2026-08-21. Zest's newer
`borrower-v1` path goes through `pyth-adapter-v1` -> `pyth-lazer-oracle`
(Lazer bytes, not a VAA; they fail `pyth-oracle-v4` with `u2001`). So the Core
path is alive on chain but starved: whoever posts needs a Hermes key.

## What it means for markets-sbtc-stx-jing-v2 (deployed 2026-09-02)

- The contract hardcodes the Core v4 set. Every `swap`, `reprice-or-swap`,
  gated deposit and `settle-with-refresh` needs a VAA that is fresh within
  80 s. Without a Hermes key nobody can produce one, so the market cannot
  settle. Operating it means holding a Pyth API key (Core, free trial first).
- Our stxer harnesses ran on a throwaway copy with the two verify calls
  patched out and `MAX_STALENESS` loosened, reading the stale stored prices.
  To run the exact deployed bytes we reuse a real dual-feed VAA from the
  Aug 17 Granite tx (`0x075d0c27be4f…`, block 8785969) and fork at 8785968,
  where that VAA is 39 s old: the sim deploys the same bytes from the same
  deployer principal (so the contract ids match mainnet), posts the VAA, and
  runs the scenarios. Same bytes, same addresses, real Wormhole verification,
  older block.
- Switching this pair to Lazer would be a contract change (different oracle
  contract, different payload, no storage). The sBTC/STX pair also has a
  native alternative in the miner-spend oracle the RFQ v2 desk uses; sBTC/USDCx
  does not.

## Sources

- Pyth docs, "Preparing for the Pyth Core upgrade": upgrade completed
  2026-08-26 16:00 UTC; Hermes now requires an API key; DAO upgraded the Core
  contract in place on most chains.
- Pyth docs, Hermes: `Authorization: Bearer $PYTH_API_KEY`.
- Pyth blog, "Pyth's Next Chapter": Lazer channels 1 ms / 50 ms / 200 ms,
  Pyth Pro built on it, Pythnet sunset later in 2026.
- Trust Machines `stacks-pyth-bridge` README: v4 contract set, pull model,
  beta.
- On chain: `pyth-storage-v4` events, `pyth-lazer-oracle` source, Zest
  `pyth-adapter-v1` source, tx args of the posters above.
