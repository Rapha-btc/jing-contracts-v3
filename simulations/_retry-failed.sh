#!/bin/bash
# Retry the FAILED sims from _run-all-results.tsv with longer delays.
# Updates the TSV in place when a retry succeeds.
#
# Usage: bash simulations/_retry-failed.sh
set -u
RESULTS=simulations/_run-all-results.tsv
LOG=simulations/_retry-failed.log
> "$LOG"

# Get list of failed sim names
FAILED=$(grep "FAILED" "$RESULTS" | cut -f1)
COUNT=$(echo "$FAILED" | grep -c .)
echo "Retrying $COUNT failed sims with 10s delays..."

i=0
for name in $FAILED; do
  i=$((i+1))
  echo "[$i/$COUNT] $name" | tee -a "$LOG"

  out=$(npx tsx "simulations/$name.js" 2>&1)
  echo "$out" >> "$LOG"

  sid=$(echo "$out" | grep -oE "stxer.xyz/simulations/mainnet/[a-f0-9]+" | head -1 | sed 's|.*/||')

  if [ -z "$sid" ]; then
    echo "  STILL FAILED" | tee -a "$LOG"
  else
    echo "  -> $sid" | tee -a "$LOG"
    # Update the row in TSV (use awk for safe replace of FAILED → sid for this sim)
    awk -v name="$name" -v sid="$sid" 'BEGIN{FS=OFS="\t"} $1==name { $2=sid } 1' "$RESULTS" > "$RESULTS.tmp" && mv "$RESULTS.tmp" "$RESULTS"
  fi

  sleep 10
done

echo ""
echo "=== Retry done ==="
echo "Still failed:"
grep "FAILED" "$RESULTS" || echo "  (none — all green)"
