#!/bin/bash
# Run all 37 jing v3 stxer simulations in sequence with a 3s delay
# between each to avoid Hiro API rate limits. Captures session IDs
# into _run-all-results.tsv (sim-name <TAB> session-id).
#
# Usage: bash simulations/_run-all.sh
set -u
RESULTS=simulations/_run-all-results.tsv
LOG=simulations/_run-all.log
> "$RESULTS"
> "$LOG"

# Collect all jing v3 sims (excludes creator-escrow + this script + setup + new ones run last)
SIMS=$(ls simulations/simul-jing-core-*.js simulations/simul-markets-*.js 2>/dev/null)

echo "Running $(echo "$SIMS" | wc -l) simulations..."
i=0
for sim in $SIMS; do
  i=$((i+1))
  name=$(basename "$sim" .js)
  echo "[$i] $name" | tee -a "$LOG"

  # Run sim, capture stdout, find session ID
  out=$(npx tsx "$sim" 2>&1)
  echo "$out" >> "$LOG"

  # Extract session ID (line: "View: https://stxer.xyz/simulations/mainnet/<id>")
  sid=$(echo "$out" | grep -oE "stxer.xyz/simulations/mainnet/[a-f0-9]+" | head -1 | sed 's|.*/||')

  if [ -z "$sid" ]; then
    echo "  FAILED — no session ID extracted" | tee -a "$LOG"
    printf "%s\tFAILED\n" "$name" >> "$RESULTS"
  else
    echo "  -> $sid" | tee -a "$LOG"
    printf "%s\t%s\n" "$name" "$sid" >> "$RESULTS"
  fi

  sleep 3
done

echo ""
echo "=== Done. Results in $RESULTS ==="
echo "Failures (if any):"
grep -E "FAILED" "$RESULTS" || echo "  (none)"
