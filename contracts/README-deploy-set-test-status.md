# Deploy set: test status

State on **2026-10-02**, jing-contracts-v3 at `df091b8` for the contract bytes
(router v5-3 `df091b8`, market v6-3 `ee2edde`, rungs `d8b01e4`, all others
unchanged since). Not deployed. The follow-up audit is open until 2026-10-09:
[AIBTC bounty muqchqnaa54e769598a4](https://aibtc.com/bounties/muqchqnaa54e769598a4).
Static review: [Sentinel findings](README-sentinel-review.md) (13 LOW, no code
change).

## What ships

Deploy order, all from `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22`:

1. `jing-core-v6`
2. `jing-ladder-v1`
3. `markets-sbtc-stx-jing-v6-3`, then `verify-market` and `init-market` (set `v6-3`)
4. `swap-router-sbtc-stx-jing-v5-3`
5. `jing-rung-deposit-trait`
6. 20 rungs: `jing-buy-stx-spread-<bps>` and `jing-sell-stx-spread-<bps>` for
   bps 0, 10, ..., 90, each `initialize(bps, true)` by the ladder owner
7. `jing-ladder-dispatch`
8. `juice-pool-sbtc-signer`, then `juice-sbtc-autoswap` (juicestx)

The fastpool and ccd016 vaults are deployed by their owners after step 4.
`vault-sbtc-stx-v6` is out of this phase.

Deploy bytes are the faktory-dao templates (private repo): comments stripped,
`clarinet format` applied, except the market, which is also de-indented to stay
under 100,000 bytes (96,268). Every template is token-identical to its source.
`markets-sbtc-stx-jing-v6-3.clar` is the deploy source;
`markets-sbtc-stx-jing-v6-3-formatted.clar` is the readable copy, kept in sync
by `npm run check:v6-3-mirrors`.

## Clarinet unit tests

| Contract | Suite | Tests | Functions | Lines | Branches |
| --- | --- | --- | --- | --- | --- |
| markets-sbtc-stx-jing-v6-3 | `tests/unit/v6-3` | 320/320 | 139/139 | 2361/2367 (99.75%) | 837/839 (99.76%) |
| swap-router-sbtc-stx-jing-v5-3 | `tests/unit/router-v5-3` | 223/223 | 37/37 | 531/534 (99.44%) | 165/166 (99.4%) |
| jing-buy/sell-stx-core-spread-v1 | `tests/unit/integration-v6-3` | 110/110 | 100% | 100% | 100% (after exceptions) |
| jing-ladder-dispatch | `tests/unit/integration-v6-3` | (same) | 10/10 | 93/93 | 30/30 |
| jing-core-v6 | `tests/unit/core-ladder-v1` | 95/95 | 83/83 | 938/938 | 163/164 |
| jing-ladder-v1 | `tests/unit/core-ladder-v1` | (same) | 31/31 | 266/267 | 61/61 |
| jing-rung-deposit-trait | - | - | no executable code | | |

Negative controls (each fix reverted on a local copy): pool pick `df091b8`,
capacity hint `ee2edde`, full-exit check `b41dbd6` and the buy-side inlined
epoch close `d8b01e4` all make their tests fail. The sell-side epoch-close
case cannot be reached through public calls.

## stxer mainnet-fork simulations

| Suite | Checks |
| --- | --- |
| market v6-3 (15 suites + core-v6 admin) | 6,022/6,022 |
| capacity hint (`ee2edde` fallbacks) | 33/33 |
| oracle feeds (Pyth Pro key) | 101/101 |
| core-spread v1 rungs / small proceeds | 998/998, 77/77 |
| ladder dispatch (one member across ten rungs per side) | 461/461 |
| ladder dispatch on the template bytes | 391/391 |
| ladder-v1 admin and seats | 334/334 |
| router manual / smart | 366/366, 524-525 |
| router pool pick (`df091b8`) | 158/158 |
| rebate age / V6 router / router impact / bin boundary | 482, 304, 398, 26 |
| deploy bytes from the templates | 17/17 |

Trace coverage on the final bytes (`simulations/TRACE-COVERAGE-*.md`):

| Contract | Expressions | Branch nodes fully taken | Error paths hit |
| --- | --- | --- | --- |
| market v6-3 | 72.1% | 295 of 301 | 159 of 292 |
| router v5-3 | 64.1% | 78 of 81 | 35 of 35 |
| buy / sell rung | 70.0% | 57 of 62 | 26 of 51 |
| dispatch | 62.2% | 15 of 15 | 24 of 28 |
| ladder-v1 | 52.2% | 24 of 24 | 37 of 37 |
| core-v6 | 30.7% | 51 of 82 | 18 of 85 |

## Swap vaults, stxer at the tip on the final router

| Vault | Runs |
| --- | --- |
| juice (`juice-pool-sbtc-signer` + `juice-sbtc-autoswap`) | recovery matrix 529, guards 21, maker 34, liquidation 40, jing-router 45, jing-take 40, split-pyth 41, continuity 189, upgrade 95, admin handover 59, emergency 26 + 36, allowance proof; template deploy check |
| fastpool-swap-vault | guards 22, lifecycle 41, maker 35, recovery matrix 569, dust-vaults 68, vault-fixes 174, dust-1sat 22 |
| ccd016-swap-vault-mia-v2 | clock 68, coverage 104, happy path 58, parked 136, fixes 92, emergency 45 + 48 |

juicestx Clarinet: `test:vault` 144/144 branches, `test:vault:migration` 98/98.

`clarinet check` passes on every suite manifest: integration (34 contracts),
router (14), core-ladder (4) and v6-3 (7).

## Remaining gaps

**Unreachable or tool artifacts** (documented in each suite's README):
router `cp-split` zero-total guard and two literal-principal lines; core-v6
`debit` saturating arm; ladder-v1 tuple line in `retire-band`; market lines
1404 and 1647 and six tuple labels; the rungs' unreachable partial branches
and error paths; dispatch list-overflow fallbacks.

**Out of this phase:** core-v6 logs called only by other products (Bitflow
wrapper, RFQ desk, reserve, SNPL) and the three registered-depositor branches
reached only through `vault-sbtc-stx-v6`.

**Reachable but not hit on the fork:** the rungs' `ERR_TOO_MANY_SHARES` needs
a deposit of at least 1e15 base units, which no mainnet wallet holds; the
Clarinet suite covers it with minted funds.

## Open before deploy

- Close the audit (2026-10-09) and apply any accepted fixes; regenerate the
  affected templates and rerun their suites.
- Move the RFQ operator, the core-v6 owner, the ladder owner and the market
  operator to a multisig with distinct cosigners.
