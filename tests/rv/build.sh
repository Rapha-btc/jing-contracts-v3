#!/bin/bash
# Build augmented .clar files for Rendezvous fuzzing.
#
# RV requires invariants to live in the same source file as the contract being
# fuzzed. To keep production .clar files clean, we maintain invariants in
# tests/rv/<contract>.invariants.clar and concatenate at build time into
# tests/rv/.build/<contract>.clar (gitignored). The Clarinet-<contract>.toml
# files at the project root point Clarinet/RV at the .build/ copies.
#
# Usage: bash tests/rv/build.sh [contract-name | all]
#        Default: all
set -eu

OUT=tests/rv/.build
mkdir -p "$OUT"

# Map: contract-name -> path to production source
declare -A SUTS=(
  ["markets-sbtc-usdcx-jing"]="contracts/markets-sbtc-usdcx-jing.clar"
  ["markets-sbtc-stx-jing"]="contracts/markets-sbtc-stx-jing.clar"
  ["jing-core"]="contracts/jing-core.clar"
)

build_one() {
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

  cat "$src" "$invariants" > "$out"
  echo "Built $out ($(wc -l < "$out") lines)"
}

target="${1:-all}"
if [ "$target" = "all" ]; then
  for name in "${!SUTS[@]}"; do
    if [ -f "tests/rv/$name.invariants.clar" ]; then
      build_one "$name"
    fi
  done
else
  build_one "$target"
fi
