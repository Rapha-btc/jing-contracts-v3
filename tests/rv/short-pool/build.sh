#!/bin/bash
# Builds tests/rv/.build/short-pool/stx-short-pool.clar (gitignored) from the production
# pool: USDCx -> local .mock-usdcx, the vault binding -> wallet_1 (so the
# fuzzer can drive borrow / repay / add-interest as the vault), then appends
# invariants.clar. The production source is not touched.
# Run from the repo root: bash tests/rv/short-pool/build.sh
#   then: npx rv tests/rv/short-pool stx-short-pool invariant --runs=1000
set -eu
D=tests/rv/short-pool
O=tests/rv/.build/short-pool
mkdir -p "$O"
sed -e "s|(define-constant VAULT .stx-short-vault)|(define-constant VAULT 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5)|" \
    -e "s|(define-constant USDCX 'SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx)|(define-constant USDCX .mock-usdcx)|" \
    contracts/short/stx-short-pool.clar > "$O/stx-short-pool.clar"
grep -q "VAULT 'ST1SJ3" "$O/stx-short-pool.clar"
grep -q "USDCX .mock-usdcx" "$O/stx-short-pool.clar"
cat "$D/invariants.clar" >> "$O/stx-short-pool.clar"
echo "built $O/stx-short-pool.clar"
