# Mainnet deploys, verified

Each row: the on-chain source was compared by hand with the repo source and
matches. Deploy bytes have no comments and are `clarinet format` output.
Hash = sha512/256 of the on-chain source (what `contract-hash?` returns).

## 2026-10-15: Jing v6-4 set (bounty mv8wal fixes)

Verified by Rapha: GREEN.

| Contract | Block | Tx | Hash |
|---|---|---|---|
| `markets-sbtc-stx-jing-v6-4` | 9219231 | `0xcc46c303d2f1bf9a67a9f527115185667c644040e302825649453e68ced7458f` | `e804f91dd7c7a6789aee4d65fded552d0e95d483dca9db88b5a4cb9455535a99` |
| `swap-router-sbtc-stx-jing-v5-4` | 9219239 | `0xbf1a223e5569d684e52fb5f421d30f7b392ad830943984409a5f4da181eb6b45` | `f8f38ce68b576fde177dc5d21dd77d9decf5c46a6c10d1293e6e7b116b22b742` |
| `jing-buy-stx-{0..90}` (10, identical) | 9219340-41 | see explorer | `888e944056bc019fa92d98b842a8f9d94841c6751dcd9fb51bcdd494baf136dd` |
| `jing-sell-stx-{0..90}` (10, identical) | 9219341-42 | see explorer | `180185b6f5798fbc2e39c41a62b9b453f2c5d85228cbd321f3f1415a879c416a` |
| `swap-router-sbtc-stx-jing-v5-5` | 9219565 | `0x07974b236361418f8bfbce99842c5d66f4dd349e022c862540ffbe56c7629727` | `b3654d56523b6cf318b86966126d9b79eff9fa0c6742b62343e6d628a715178c` |

Sources: market = v6-3 + Patient Reed newest-limit settle fix (9a69481);
router v5-4 = v5-3 on v6-4; rungs = core-spread-v1 on v6-4 with name prefix
`jing-{buy,sell}-stx-` (Violet Reed fix reverted, f4dd6cf); router v5-5 =
v5-4 + XYK pool-status gate (10c076e). Init: jing-core-v6
`set-verified-contract` v6-4, v6-4 `initialize`, ladder-v1 old bands retired,
`set-canonical` buy/sel to `*-stx-0`, 20 rungs `initialize(bps, true)`.
Old v6-3 market paused, old rungs push-paused (exit via jingswap.com/withdraw).
