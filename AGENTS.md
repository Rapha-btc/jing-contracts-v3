# Agent rules

- Never reformat code you aren't otherwise changing: no reflowing lines, no
  re-indenting, no running `clarinet format` over a whole file. Every diff is
  reviewed line by line, so it must contain only real changes.
- This includes the `markets-sbtc-stx-jing-v6-3-formatted.clar` and
  `-followAll.clar` mirror copies: apply each logic hunk by hand in the copy's
  existing style. `git diff -w` should show the same logical change in all
  three market files and nothing else.
