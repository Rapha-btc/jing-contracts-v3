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
  ["jing-core"]="contracts/jing-core.clar"
  ["vault-sbtc-usdcx"]="contracts/vault-sbtc-usdcx.clar"
  ["vault-sbtc-stx"]="contracts/vault-sbtc-stx.clar"
  ["snpl-sbtc-stx-jing"]="contracts/snpl-sbtc-stx-jing.clar"
  ["reserve-sbtc-stx-jing"]="contracts/reserve-sbtc-stx-jing.clar"
  ["rfq-sbtc-stx-jing-v2"]="contracts/rfq/rfq-sbtc-stx-jing-v2.clar"
  ["rfq-sbtc-stx-jing-v3"]="contracts/rfq/rfq-sbtc-stx-jing-v3.clar"
)

# Mainnet SIP-010 trait reference (must match the use-trait line in the
# production market contracts -- if they ever change, update here too).
MAINNET_SIP010="'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait"
LOCAL_SIP010=".sip-010-trait.sip-010-trait"

build_market() {
  local name="$1"
  local src="${SUTS[$name]:-}"
  local invariants="tests/rv/$name.invariants.clar"
  local out="$OUT/$name.clar"

  if [ -z "$src" ]; then
    echo "Unknown contract: $name (known: ${!SUTS[*]})" >&2
    exit 1
  fi
  if [ ! -f "$invariants" ]; then
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

# 2. Local mock-jing-core. The v2-specific replace MUST run before the
#    generic one, or `.jing-core-v2` would corrupt to `.mock-jing-core-v2`.
text = text.replace(".jing-core-v2", ".mock-jing-core")
text = text.replace(".jing-core", ".mock-jing-core")

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
