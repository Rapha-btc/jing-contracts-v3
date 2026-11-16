# sBTC/USDCx v6-5 Rendezvous

`npm run rv:build` generates an isolated market with the real core, strict token fixtures, explicit oracle/ladder fixtures, and append-only RV declarations. The production prefix is changed only by dependency/asset substitutions recorded in `../.build/sbtc-usdcx-v6-5/source.json`.

`npm run rv:v6` includes 1,000 native invariant trials for this market. `npm run rv:rungs` includes 500 native invariant trials for each new buy/sell `-v2` rung, using the F-01 local signed-Lazer setup. All campaigns use seed `20261116` and check the staleness/list invariants after every public call.

See [current results and limitations](../../unit/redeploy/README.md), including the source-hashed `results.json`. Historical reports in the v6-3 and ladder-v1 directories describe their original campaigns, not this run.
