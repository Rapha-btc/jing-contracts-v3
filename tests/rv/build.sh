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

# 2. Local mock-jing-core
text = text.replace(".jing-core", ".mock-jing-core")


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
