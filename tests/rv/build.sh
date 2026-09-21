#!/bin/bash
# Build augmented .clar files for Rendezvous fuzzing.
#
# RV needs invariants in the contract source AND eligible SIP-010 trait
# implementations to fuzz deposit/cancel paths. Production contracts
# reference mainnet trait + jing-core; the build pipeline rewrites those
# references to local mocks (sip-010-trait, mock-ft-x, mock-ft-y,
# mock-jing-core) so RV can drive real state mutations on the market
# without loading mainnet contracts. Production .clar files stay clean.
#
# Pipeline for a target market contract:
#   1. Replace `(use-trait ft-trait '...sip-010-trait)` with local trait
#   2. Replace `.jing-core` references with `.mock-jing-core`
#   3. Replace SAINT defaults with mock-ft-x/y so the contract is
#      deploy-time pre-initialized and `initialize()` is never required
#      (RV's random calls would mostly fail to satisfy its auth gate).
#   4. Set `initialized = true` so initialize() rejects (`u1018`) -- harmless
#   5. Set min-deposits = u1 so RV's small random amounts can land
#   6. Append the invariants block
#
# Output: tests/rv/.build/<contract>.clar (gitignored)
#
# Usage: bash tests/rv/build.sh [contract-name | all]
#        Default: all
set -eu

OUT=tests/rv/.build
mkdir -p "$OUT"

declare -A SUTS=(
  ["markets-sbtc-usdcx-jing"]="contracts/markets-sbtc-usdcx-jing.clar"
  ["markets-sbtc-stx-jing"]="contracts/markets-sbtc-stx-jing.clar"
  ["markets-sbtc-stx-jing-v2"]="contracts/markets-sbtc-stx-jing-v2.clar"
  ["vault-sbtc-stx-v2"]="contracts/vault-sbtc-stx-v2.clar"
  ["jing-core"]="contracts/jing-core.clar"
  ["vault-sbtc-usdcx"]="contracts/vault-sbtc-usdcx.clar"
  ["vault-sbtc-stx"]="contracts/vault-sbtc-stx.clar"
  ["snpl-sbtc-stx-jing"]="contracts/snpl-sbtc-stx-jing.clar"
  ["reserve-sbtc-stx-jing"]="contracts/reserve-sbtc-stx-jing.clar"
  ["rfq-sbtc-stx-jing-v2"]="contracts/rfq/rfq-sbtc-stx-jing-v2.clar"
  ["rfq-sbtc-stx-jing-v3"]="contracts/rfq/rfq-sbtc-stx-jing-v3.clar"
  ["creator-bonus-jing"]="contracts/deploying/creator-bonus-jing.clar"
  ["markets-sbtc-stx-jing-v6"]="contracts/markets-sbtc-stx-jing-v6.clar"
  ["jing-ladder"]="contracts/jing-ladder.clar"
  ["jing-core-v5"]="contracts/jing-core-v5.clar"
  ["swap-router-sbtc-stx-jing-v5"]="contracts/swap-router-sbtc-stx-jing-v5.clar"
  ["markets-sbtc-stx-jing-v6-on-core"]="contracts/markets-sbtc-stx-jing-v6.clar"
  ["jing-buy-stx"]="contracts/jing-buy-stx.clar"
  ["jing-sell-stx"]="contracts/jing-sell-stx.clar"
  ["jing-buy-stx-market-spread"]="contracts/jing-buy-stx-market-spread.clar"
  ["jing-sell-stx-market-spread"]="contracts/jing-sell-stx-market-spread.clar"
  ["jing-buy-stx-core-spread"]="contracts/jing-buy-stx-core-spread.clar"
  ["jing-sell-stx-core-spread"]="contracts/jing-sell-stx-core-spread.clar"
)

# Mainnet SIP-010 trait reference (must match the use-trait line in the
# production market contracts -- if they ever change, update here too).
MAINNET_SIP010="'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait"
LOCAL_SIP010=".sip-010-trait.sip-010-trait"

build_market() {
  local name="$1"
  local src="${SUTS[$name]:-}"
  # Select v6-2 for the same local market dependency without editing production
  # rungs or the root manifest. All other fuzz transformations stay identical.
  if [ "$name" = "markets-sbtc-stx-jing-v6" ] && [ "${RV_MARKET_VERSION:-v6}" = "v6-2" ]; then
    src="contracts/markets-sbtc-stx-jing-v6-2.clar"
  fi
  local invariants="tests/rv/$name.invariants.clar"
  local out="$OUT/$name.clar"
  # the on-core market variant is the v6 build with the real core-v5 as its
  # registry: the v6 wrappers and invariants plus the core ledger add-on
  # (tests/rv/jing-core-v5.invariants.clar). The core cannot be the RV
  # target itself: it would have to call the market, and the market calls
  # the core, which clarinet refuses as a cycle.
  if [ "$name" = "markets-sbtc-stx-jing-v6-on-core" ]; then
    invariants="tests/rv/markets-sbtc-stx-jing-v6.invariants.clar"
  fi
  # jing-core-v5 has no manifest of its own; it is built for the on-core target
  if [ "$name" = "jing-core-v5" ]; then
    invariants="/dev/null"
  fi

  if [ -z "$src" ]; then
    echo "Unknown contract: $name (known: ${!SUTS[*]})" >&2
    exit 1
  fi
  if [ "$invariants" != "/dev/null" ] && [ ! -f "$invariants" ]; then
    echo "Skipping $name: no invariants file at $invariants"
    return
  fi

  # Pipeline: read production source, apply substitutions, append invariants.
  python3 - "$src" "$invariants" "$out" <<'PYEOF'
import sys, re
src_path, inv_path, out_path = sys.argv[1:4]
text = open(src_path).read()

# 1. Local SIP-010 trait
text = text.replace(
    "(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)",
    "(use-trait ft-trait .sip-010-trait.sip-010-trait)"
)

# 2a. v2 vault ABSOLUTE mainnet refs. MUST run before BOTH the generic
#     `.jing-core*` replaces below (whose `.jing-core-v2` pattern is a
#     substring of the absolute principal and would corrupt it first) and
#     the generic `.markets-sbtc-*-jing` replaces in section 6 (which
#     would corrupt the `-v2` contract names to `...mock-jing-market-v2`).
#     The v2 per-target manifests point the mock-jing-market /
#     mock-jing-core contract NAMES at the *-v2.clar mock FILES, so these
#     rewrites keep the same local names as the v1 builds.
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v2",
    ".mock-jing-market"
)
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-usdcx-jing-v2",
    ".mock-jing-market"
)
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v3",
    ".mock-jing-core"
)
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-core-v2",
    ".mock-jing-core"
)
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-vault-auth",
    ".mock-jing-vault-auth"
)

# 2b. creator-bonus-jing (no-ops elsewhere): the deployed escrow literal
#     becomes the deterministic mock, the with-ft asset name is pinned to
#     the mock token, and fund records every NEW delivery id in `rv-ids`
#     so the invariants can scan the rows (Clarity cannot iterate a map).
text = text.replace(
    "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-v2-jing",
    ".mock-creator-escrow"
)
text = text.replace(
    '(define-constant ASSET_USDCX "usdcx-token")',
    '(define-constant ASSET_USDCX "mock-ft")'
)
if "creator-bonus-jing" in src_path:
    # Fold ids into 0..99 so fund, claim and revoke collide on the same rows:
    # with raw random uints a claim never lands on an id fund already used and
    # the payout invariant stays vacuous. RV keeps ONE simnet across all runs,
    # so the space must stay wide enough that rows going terminal (claimed or
    # revoked) do not exhaust the RELEASED ids (id mod 5 = 1, 20 of them).
    for fn, sig in (
        ("fund", "(delivery-id uint) (amount uint) (reason (string-utf8 256))"),
        ("revoke", "(delivery-id uint)"),
        ("claim", "(delivery-id uint)"),
    ):
        head = "(define-public (%s %s)\n  (let (\n" % (fn, sig)
        assert head in text, fn
        text = text.replace(
            head,
            "(define-public (%s %s)\n  (let (\n      (delivery-id (mod delivery-id-raw u100))\n"
            % (fn, sig.replace("(delivery-id uint)", "(delivery-id-raw uint)")),
            1
        )
    text = text.replace(
        "(define-constant OWNER tx-sender)",
        "(define-data-var rv-ids (list 200 uint) (list))\n(define-constant OWNER tx-sender)",
        1
    )
    text = text.replace(
        "    (ok total)\n  )\n)",
        "    (if (is-none existing)\n"
        "      (var-set rv-ids (unwrap! (as-max-len? (append (var-get rv-ids) delivery-id) u200) ERR_AMOUNT_ZERO))\n"
        "      true)\n"
        "    (ok total)\n  )\n)",
        1
    )

# 2d. markets-sbtc-stx-jing-v6 (added 2026-09-15). Settle runs LIVE under
#     fuzz: the Lazer oracle and the decoder it passes along are one mock
#     (tests/rv/mock-lazer-oracle.clar) whose mid the SUT's rv-set-mid moves;
#     the ladder is a mock the SUT's rv-band-x/y seat accounts on; the core is
#     the v5 mock (generated from jing-core-v5.clar). The queue is shrunk from
#     50 to 6 with 2 seats (4 open slots) so ten RV accounts fill a side and
#     reach park-tenth / size-rule / seat paths; the price region
#     (distance-slots) is 2 for the same reason. Feed ids are the mainnet ones
#     (BTC u1, STX u45) so pick-feed finds the mock's feeds. Minimums are
#     u100 a side: big enough that the dust-refund branches at settle and the
#     ERR_DEPOSIT_TOO_SMALL gate fire on RV's small naturals.
on_core = out_path.endswith("-on-core.clar")
if "markets-sbtc-stx-jing-v6" in src_path:
    # the on-core variant keeps the real registry: park the name so the
    # generic .jing-core* replaces below cannot touch it, restore at the end
    text = text.replace(".jing-core-v5", ".JINGCOREV5" if on_core else ".mock-jing-core")
    text = text.replace(
        "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle", ".mock-lazer-oracle")
    text = text.replace(
        "'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-decoder-v1", ".mock-lazer-oracle")
    text = text.replace(".jing-ladder", ".mock-jing-ladder")
    text = text.replace("(define-constant MAX_DEPOSITORS u50)", "(define-constant MAX_DEPOSITORS u6)")
    text = text.replace("(define-data-var seats-per-side uint u10)", "(define-data-var seats-per-side uint u2)")
    text = text.replace("(define-data-var distance-slots uint u10)", "(define-data-var distance-slots uint u2)")
    # the treasury is a contract that never trades: with the deployer (one
    # sender in ten) as treasury, a fee paid mid-swap moved the taker's own
    # balance and broke the router's delta properties (u9201)
    text = text.replace("(define-data-var treasury principal tx-sender)", "(define-data-var treasury principal .mock-jing-ladder)")
    text = text.replace("(define-data-var feed-id-x uint u0)", "(define-data-var feed-id-x uint u1)")
    text = text.replace("(define-data-var feed-id-y uint u0)", "(define-data-var feed-id-y uint u45)")
    # y minimum above one sat's worth of STX in the price band (4,000 uSTX at
    # 250 sats/STX): a y taker's remainder after the walk is quantised to
    # one sat, and under one sat it is dust to refund, not a partial fill
    # (the sizing property tripped u1017 on a 3,000-uSTX remainder with u100)
    text = text.replace("(define-data-var min-token-y-deposit uint u0)", "(define-data-var min-token-y-deposit uint u10000)")
    text = text.replace("(define-data-var min-token-x-deposit uint u0)", "(define-data-var min-token-x-deposit uint u100)")

# 2g. jing-core-v5 (added 2026-09-15): the registry fuzzed WITH the v6 market
#     driving its log-* calls (the on-core market variant is registered at
#     deploy; RV accounts still cannot register, contract-hash? of an account
#     is none). set-verified-contract's hash read becomes a fixed buffer so
#     the owner path runs; the pause timelock is 10 burn blocks so unpause
#     is reachable; sBTC is the mock token.
if src_path.endswith("contracts/jing-core-v5.clar"):
    text = text.replace(
        "(computed-hash (unwrap! (contract-hash? contract) ERR_INVALID_CONTRACT_HASH))",
        "(computed-hash 0x00)")
    text = text.replace("(define-constant TIMELOCK_BURN_BLOCKS u144)", "(define-constant TIMELOCK_BURN_BLOCKS u10)")
    text = text.replace(
        "(define-map registered-contracts\n  principal\n  bool\n)",
        "(define-map registered-contracts\n  principal\n  bool\n)\n;; RV: the on-core market registers itself through this (a literal here\n;; would be a dependency edge back to the market, a cycle for clarinet;\n;; the real register needs a code hash no account has)\n(define-public (rv-register (who principal))\n  (begin (asserts! true (err u0)) (ok (map-set registered-contracts who true))))")

# 2h. swap-router-sbtc-stx-jing-v5 (added 2026-09-15): the taker path users
#     call, fuzzed on the v6 fuzz market plus one mock per AMM (DLMM pool,
#     core and router; XYK pool and core; Velar pool and fees) and a wstx
#     facade that moves real STX. The AMM mocks take the input and pay
#     exactly the minimum the router derived from the mock pool state, so
#     the pricing under test is the router's own arithmetic; the router
#     never holds funds and the user's deltas must match what it reports.
if src_path.endswith("contracts/swap-router-sbtc-stx-jing-v5.clar"):
    for a, b in [
        ("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6", ".v6-market"),
        ("'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", ".mock-ft"),
        ("'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2", ".mock-ft"),
        ("'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-2", ".mock-dlmm-router-v5"),
        ("'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-2-bps-15", ".mock-dlmm-pool-v5"),
        ("'SP1PFR4V08H1RAZXREBGFFQ59WB739XM8VVGTFSEA.dlmm-core-v-1-1", ".mock-dlmm-core"),
        ("'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2", ".mock-xyk-core-v5"),
        ("'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1", ".mock-xyk-pool-v5"),
        ("'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-pool-v1_0_0-0070", ".mock-velar-pool"),
        ("'SP20X3DC5R091J8B6YPQT638J8NR1W83KN6TN5BJY.univ2-fees-v1_0_0-0070", ".mock-velar-fees"),
        ("'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.wstx", ".mock-wstx"),
    ]:
        assert a in text, a
        text = text.replace(a, b)
    text = text.replace('(define-constant ASSET_SBTC "sbtc-token")', '(define-constant ASSET_SBTC "mock-ft")')
    text = text.replace('(define-constant ASSET_WSTX "wstx")', '(define-constant ASSET_WSTX "mock-ft")')

# 2e. jing-ladder (added 2026-09-15). The only gate an RV account cannot
#     pass is the code hash (contract-hash? of an account is none), so both
#     hash reads become a fixed buffer: any account may then register as a
#     rung, take a seat, be replaced, retired and re-seated. The SUT's rv-*
#     wrappers fold the side string onto the six real sides and the price
#     onto a handful of values so keys collide.
if src_path.endswith("contracts/jing-ladder.clar"):
    text = text.replace(
        "(caller-hash (unwrap! (contract-hash? caller) ERR_INVALID_CONTRACT_HASH))",
        "(caller-hash 0x00)")
    text = text.replace(
        "(unwrap! (contract-hash? canon) ERR_INVALID_CONTRACT_HASH)",
        "0x00")

# 2f. the six pooled rungs (added 2026-09-15). Absolute mainnet refs become
#     the fuzz stack: `.v6-market` is the v6 fuzz build (a name no generic
#     replace below touches), the ladder and the RFQ native oracle are mocks,
#     sBTC and wstx are one mock-ft with the allowance name pinned. The rung
#     is pre-initialized at 331.50 sats per STX (u33150 -> 1e18 / 33150 in
#     the market unit), 20 bps for the spread rungs, so `initialize` (name
#     check, ladder registration) is out of scope and every member action is
#     reachable from the first call.
if "/jing-buy-stx" in src_path or "/jing-sell-stx" in src_path:
    text = text.replace("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.markets-sbtc-stx-jing-v6", ".v6-market")
    text = text.replace("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.jing-ladder", ".mock-jing-ladder")
    text = text.replace("'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.rfq-sbtc-stx-jing-v2-3", ".mock-rfq-oracle")
    text = text.replace("'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", ".mock-ft")
    text = text.replace("'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2", ".mock-ft")
    text = text.replace('(define-constant SBTC_NAME "sbtc-token")', '(define-constant SBTC_NAME "mock-ft")')
    text = text.replace('(define-constant WSTX_NAME "wstx")', '(define-constant WSTX_NAME "mock-ft")')
    text = text.replace("(define-data-var initialized bool false)", "(define-data-var initialized bool true)")
    text = text.replace("(define-data-var price uint u0)", "(define-data-var price uint u30165912518853695)")
    text = text.replace("(define-data-var sats-per-stx-cents uint u0)", "(define-data-var sats-per-stx-cents uint u33150)")
    text = text.replace("(define-data-var spread-bps uint u0)", "(define-data-var spread-bps uint u20)")
    text = text.replace("(define-data-var floor-cents uint u0)", "(define-data-var floor-cents uint u33150)")
    text = text.replace("(define-data-var cap-cents uint u0)", "(define-data-var cap-cents uint u33150)")
    text = text.replace("(define-data-var floor uint u0)", "(define-data-var floor uint u30165912518853695)")
    text = text.replace("(define-data-var cap uint u0)", "(define-data-var cap uint u30165912518853695)")

# 2. Local mock-jing-core. The v2-specific replace MUST run before the
#    generic one, or `.jing-core-v2` would corrupt to `.mock-jing-core-v2`.
text = text.replace(".jing-core-v3", ".mock-jing-core")
text = text.replace(".jing-core-v2", ".mock-jing-core")
text = text.replace(".jing-core", ".mock-jing-core")

# 2c. markets-v2 fuzz relaxation (no-op elsewhere): fixed classification
#     mid in place of the Pyth verify-and-read. RV's random vaa buffers
#     can never pass wormhole verification, so without this the maker
#     gate and reprice-or-swap would make every deposit into a non-empty
#     opposite book revert, freezing the book one-sided and starving the
#     lifecycle invariants. A fixed sane BTC/STX cross (~0.32 STX/sat,
#     1e8-scaled) keeps classification REAL against random limits: both
#     gate outcomes (pass and ERR_MUST_USE_SWAP) and both reprice
#     branches stay reachable. The crossing branches still revert at
#     settle-with-refresh (its own Pyth path is untouched), so settle
#     remains out of RV scope exactly as documented for v1.
text = text.replace(
    "(try! (fresh-classification-price vaa))",
    "u32000000000000"
)

# RFQ-v2-only fuzz relaxations (no-ops for every other contract). See the
# header of tests/rv/rfq-sbtc-stx-jing-v2.invariants.clar for the rationale.
# (a) Disable the SIP-018 signature check: RV cannot produce valid secp256k1
#     sigs; the stxer harness covers sig parity + auth reverts. Two shapes:
#     v2 dropped max-premium-bps from build-auth-hash (2026-07-15), v3 keeps
#     it -- each replace no-ops on the other contract.
text = text.replace(
    """    (asserts!
      (is-eq
        (unwrap!
          (principal-of?
            (unwrap! (secp256k1-recover?
              (build-auth-hash id mm quoted-out ref-price ref-timestamp ref-venue
                auth-expiry
              ) sig)
              ERR_BAD_AUTH
            ))
          ERR_BAD_AUTH
        )
        client
      )
      ERR_BAD_AUTH
    )""",
    "    (asserts! true ERR_BAD_AUTH)"
)
text = text.replace(
    """    (asserts!
      (is-eq
        (unwrap!
          (principal-of?
            (unwrap! (secp256k1-recover?
              (build-auth-hash id mm quoted-out ref-price ref-timestamp ref-venue
                max-premium-bps auth-expiry
              ) sig)
              ERR_BAD_AUTH
            ))
          ERR_BAD_AUTH
        )
        client
      )
      ERR_BAD_AUTH
    )""",
    "    (asserts! true ERR_BAD_AUTH)"
)
# (b) Disable the wall-clock reference checks (random uints never land in a
#     120s window).
text = text.replace(
    "(asserts! (<= ref-timestamp stacks-block-time) ERR_BAD_REFERENCE)",
    "(asserts! true ERR_BAD_REFERENCE)"
)
text = text.replace(
    """    (asserts! (> ref-timestamp (- stacks-block-time MAX_REF_STALENESS))
      ERR_STALE_PRICE
    )""",
    "    (asserts! true ERR_STALE_PRICE)"
)
# (c) Fixed native mid: simnet has no miner commits, get-native-price would
#     always ERR_ZERO_PRICE and kill the fix path. Keeps the band-enabled
#     branch live so RV still exercises the kill-switch.
text = text.replace(
    "(oracle-price (if band-on (try! (get-native-price)) u0))",
    "(oracle-price (if band-on u34000000000000 u0))"
)
# (d) Whitelist defaults to true under fuzz so any sender may attempt
#     fix-price; set-mm-whitelist false still blocks, keeping the gate live.
text = text.replace(
    "(default-to false (map-get? whitelisted-mms mm))",
    "(default-to true (map-get? whitelisted-mms mm))"
)
# (d2) Same for the CLIENT whitelist (added 2026-07-16, 2-of-2 cosigner flow
#     as of 5619c26): without the flip open-rfq is unreachable for RV's
#     random senders (genesis seeds live inside the skipped initialize()),
#     which would silently turn the escrow-conservation invariant vacuous.
#     revoke-client-whitelist (map-set false) still blocks, keeping the gate
#     live; propose/confirm/cancel/rotation paths are fuzzed on top.
text = text.replace(
    "(default-to false (map-get? whitelisted-clients client))",
    "(default-to true (map-get? whitelisted-clients client))"
)
# (e) Pin the with-ft allowance asset name to the mock token so
#     fulfill/reclaim can actually move escrow.
text = text.replace(
    "(with-ft (contract-of x) x-name sbtc-in)",
    '(with-ft (contract-of x) "mock-ft" sbtc-in)'
)


# 3. Pre-initialize token-x and token-y data-vars to the same mock.
# Using one mock contract for both sides ensures RV's random pick from
# the SIP-010 impl pool always matches the market's WRONG_TRAIT check.
text = text.replace(
    "(define-data-var token-x principal SAINT)",
    "(define-data-var token-x principal .mock-ft)"
)
text = text.replace(
    "(define-data-var token-y principal SAINT)",
    "(define-data-var token-y principal .mock-ft)"
)

# 4. Skip initialize() gate: pre-set initialized to true
text = text.replace(
    "(define-data-var initialized bool false)",
    "(define-data-var initialized bool true)"
)

# 5. Lower min-deposits so RV's small amounts pass the gate
text = text.replace(
    "(define-data-var min-token-y-deposit uint u0)",
    "(define-data-var min-token-y-deposit uint u1)"
)
text = text.replace(
    "(define-data-var min-token-x-deposit uint u0)",
    "(define-data-var min-token-x-deposit uint u1)"
)

# 6. Vault-specific rewrites (only fire if patterns match):
#    - mainnet sBTC + USDCx pinned constants -> single mock-ft
#    - mainnet DLMM router + pool -> mock-dlmm-router
#    - .markets-sbtc-{usdcx,stx}-jing -> .mock-jing-market
#    - .jing-vault-auth -> .mock-jing-vault-auth
text = text.replace(
    "'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    ".mock-ft"
)
text = text.replace(
    "'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx",
    ".mock-ft"
)
text = text.replace(
    "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-1",
    ".mock-dlmm-router"
)
text = text.replace(
    "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-sbtc-usdcx-v-1-bps-10",
    ".mock-dlmm-pool"
)
text = text.replace(
    "'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-1-bps-15",
    ".mock-dlmm-pool"
)
text = text.replace(
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2",
    ".mock-xyk-core"
)
text = text.replace(
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1",
    ".mock-xyk-pool"
)
text = text.replace(
    ".markets-sbtc-usdcx-jing",
    ".mock-jing-market"
)
text = text.replace(
    ".markets-sbtc-stx-jing",
    ".mock-jing-market"
)
text = text.replace(
    ".jing-vault-auth",
    ".mock-jing-vault-auth"
)
# Mainnet wstx pseudo-token used by vault-sbtc-stx (token-y for STX vault).
text = text.replace(
    "'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2",
    ".mock-ft"
)

# SNPL-specific: pre-init current-reserve to mock-reserve so RV doesn't
# need to randomly generate a successful initialize() call to unlock
# the lifecycle. Same idea as initialized=true on the markets/vaults.
text = text.replace(
    "(define-data-var current-reserve principal SAINT)",
    "(define-data-var current-reserve principal .mock-reserve)"
)
# Reduce CLAWBACK-DELAY for fuzzing so RV can reach the past-deadline
# branches (seize, anyone-can-cancel-swap) without having to advance
# 4200 blocks. u10 is plenty for fuzz.
text = text.replace(
    "(define-constant CLAWBACK-DELAY u4200)",
    "(define-constant CLAWBACK-DELAY u10)"
)
# JING-TREASURY hardcoded mainnet principal (snpl repay carve-out).
# Replace with a simnet account address so the contract can compile and
# transfers don't depend on resolving a mainnet principal.
text = text.replace(
    "'SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE",
    "'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0"
)
# SNPL-only: the borrow-side slippage check `interest-bps == line-bps`
# blocks every RV-generated borrow because RV's random uint never
# matches mock-reserve's fixed return value (200). Disable for fuzz so
# the loan lifecycle can actually start. Production keeps the check.
text = text.replace(
    "(asserts! (is-eq interest-bps line-bps) ERR-INTEREST-MISMATCH)",
    "(asserts! true ERR-INTEREST-MISMATCH)"
)
# Reserve-only: pre-init `initialized` so RV doesn't need to randomly
# generate a successful initialize() to unlock the lifecycle.
text = text.replace(
    "(define-data-var initialized bool false)",
    "(define-data-var initialized bool true)"
)
# Reserve / SNPL local refs
text = text.replace(
    ".reserve-trait",
    ".reserve-trait"
)
text = text.replace(
    ".snpl-trait",
    ".snpl-trait"
)
text = text.replace(
    ".reserve-sbtc-stx-jing",
    ".reserve-sbtc-stx-jing"
)
text = text.replace(
    ".snpl-sbtc-stx-jing",
    ".snpl-sbtc-stx-jing"
)

# Append invariants
text += "\n\n" + open(inv_path).read()
if on_core:
    text = text.replace(".JINGCOREV5", ".jing-core-v5")
    text += "\n\n" + open("tests/rv/jing-core-v5.invariants.clar").read()

open(out_path, "w").write(text)
PYEOF

  echo "Built $out ($(wc -l < "$out") lines)"
}

target="${1:-all}"
if [ "$target" = "all" ]; then
  for name in "${!SUTS[@]}"; do
    if [ -f "tests/rv/$name.invariants.clar" ]; then
      build_market "$name"
    fi
  done
else
  build_market "$target"
fi
