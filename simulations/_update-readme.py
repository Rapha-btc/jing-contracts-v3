#!/usr/bin/env python3
"""Replace stxer URLs in README-stxer.md with new ones from _run-all-results.tsv,
and insert the new *-cancel-after-roll.js row after the cancel-flows row.

Run: python3 simulations/_update-readme.py
"""
import re
from pathlib import Path

README = Path("simulations/README-stxer.md")
TSV = Path("simulations/_run-all-results.tsv")

# Load new sim_name -> session_id
new_urls = {}
for line in TSV.read_text().splitlines():
    if not line.strip():
        continue
    name, sid = line.split("\t")
    if sid == "FAILED":
        raise SystemExit(f"FAILED entry still in TSV: {name}")
    new_urls[name] = sid

URL_BASE = "https://stxer.xyz/simulations/mainnet/"

# Mapping of (line-pattern-regex, list of sim names in order they appear in URLs on that line)
# The pattern matches the row's leading label so we can find it deterministically.
ROWS = [
    (r"\| `simul-markets-sbtc-\{usdcx,stx\}-jing\.js`",
     ["simul-markets-sbtc-usdcx-jing", "simul-markets-sbtc-stx-jing"]),
    (r"\| `\*-cancel-flows\.js`",
     ["simul-markets-sbtc-usdcx-jing-cancel-flows", "simul-markets-sbtc-stx-jing-cancel-flows"]),
    (r"\| `\*-same-depositor\.js`",
     ["simul-markets-sbtc-usdcx-jing-same-depositor", "simul-markets-sbtc-stx-jing-same-depositor"]),
    (r"\| `\*-small-share-filter\.js`",
     ["simul-markets-sbtc-usdcx-jing-small-share-filter", "simul-markets-sbtc-stx-jing-small-share-filter"]),
    (r"\| `\*-dust-sweep\.js`",
     ["simul-markets-sbtc-usdcx-jing-dust-sweep", "simul-markets-sbtc-stx-jing-dust-sweep"]),
    (r"\| `\*-dust-sweep-both\.js`",
     ["simul-markets-sbtc-usdcx-jing-dust-sweep-both", "simul-markets-sbtc-stx-jing-dust-sweep-both"]),
    (r"\| `\*-settle-refresh\.js`",
     ["simul-markets-sbtc-usdcx-jing-settle-refresh", "simul-markets-sbtc-stx-jing-settle-refresh"]),
    (r"\| `\*-swap\.js`",
     ["simul-markets-sbtc-usdcx-jing-swap", "simul-markets-sbtc-stx-jing-swap"]),
    (r"\| `\*-swap-deposit-y\.js`",
     ["simul-markets-sbtc-usdcx-jing-swap-deposit-y", "simul-markets-sbtc-stx-jing-swap-deposit-y"]),
    (r"\| `\*-limit-rolls\.js`",
     ["simul-markets-sbtc-usdcx-jing-limit-rolls", "simul-markets-sbtc-stx-jing-limit-rolls"]),
    (r"\| `\*-close-and-settle\.js`",
     ["simul-markets-sbtc-usdcx-jing-close-and-settle", "simul-markets-sbtc-stx-jing-close-and-settle"]),
    (r"\| `\*-treasury-fees\.js`",
     ["simul-markets-sbtc-usdcx-jing-treasury-fees", "simul-markets-sbtc-stx-jing-treasury-fees"]),
    (r"\| `\*-deposit-gates\.js` \(usdcx\)",
     ["simul-markets-sbtc-usdcx-jing-deposit-gates"]),
    (r"\| `\*-queue-full\.js` \(usdcx\)",
     ["simul-markets-sbtc-usdcx-jing-queue-full"]),
    (r"\| `simul-jing-core-pause\.js`",
     ["simul-jing-core-pause"]),
    (r"\| `simul-jing-core-hash-mismatch\.js`",
     ["simul-jing-core-hash-mismatch"]),
    (r"\| `simul-jing-core-multi-market\.js`",
     ["simul-jing-core-multi-market"]),
    (r"\| `simul-jing-core-get-balance\.js`",
     ["simul-jing-core-get-balance"]),
    (r"\| `\*-limit-updates\.js`",
     ["simul-markets-sbtc-usdcx-jing-limit-updates", "simul-markets-sbtc-stx-jing-limit-updates"]),
    (r"\| `\*-operator-setters\.js` \(usdcx\)",
     ["simul-markets-sbtc-usdcx-jing-operator-setters"]),
    (r"\| `\*-queue-full\.js` \(stx\)",
     ["simul-markets-sbtc-stx-jing-queue-full"]),
    (r"\| `\*-one-sided-cycle\.js` \(usdcx\)",
     ["simul-markets-sbtc-usdcx-jing-one-sided-cycle"]),
]

text = README.read_text()
url_pattern = re.compile(re.escape(URL_BASE) + r"[a-f0-9]+")

for label_re, sim_names in ROWS:
    # Find the row in the text
    row_match = re.search(label_re + r".*", text)
    if not row_match:
        raise SystemExit(f"No row matched: {label_re}")
    row = row_match.group(0)

    # Find URLs in that row
    urls_in_row = url_pattern.findall(row)
    if len(urls_in_row) != len(sim_names):
        raise SystemExit(f"Row has {len(urls_in_row)} URLs but expected {len(sim_names)} for sims {sim_names}\nRow: {row[:200]}")

    # Replace each URL with the new one
    new_row = row
    for old_url, sim_name in zip(urls_in_row, sim_names):
        new_url = URL_BASE + new_urls[sim_name]
        new_row = new_row.replace(old_url, new_url, 1)

    text = text.replace(row, new_row, 1)

# Now insert the new cancel-after-roll row after cancel-flows row
new_row_md = (
    "| `*-cancel-after-roll.js` "
    f"| [✓]({URL_BASE}{new_urls['simul-markets-sbtc-usdcx-jing-cancel-after-roll']}) "
    f"| [✓]({URL_BASE}{new_urls['simul-markets-sbtc-stx-jing-cancel-after-roll']}) "
    "| **Regression test** for the cancel-cycle × small-share-filter state-overwrite bug "
    "(found 2026-05-07, fixed in same-day commit). Reproduces the trigger: whale + 3 fish "
    "below 0.20% threshold deposit y; close-deposits rolls fish to cycle 1; advance 42 blocks; "
    "cancel-cycle. Asserts cycle 1 holds all 4 depositors with merged totals (600M whale + 3M "
    "fish = 603M), every deposits-map entry intact, all 4 cancel cleanly without underflow. |"
)
# Append after cancel-flows row
cancel_flows_re = re.compile(r"(\| `\*-cancel-flows\.js`.*\|\n)")
text = cancel_flows_re.sub(r"\1" + new_row_md + "\n", text, count=1)

# Update header counts: "All 35 sims green" -> "All 37 sims green"
text = re.sub(r"All 35 sims green as of [^.]+\.", "All 37 sims green as of 2026-05-07.", text)
# Update "**30 sims**" -> "**37 sims**"
text = re.sub(r"\*\*30 sims\*\*", "**37 sims**", text)

README.write_text(text)
print(f"Updated README with {len(new_urls)} sim URLs.")
print("URLs in README after update:", len(url_pattern.findall(text)))
