# Core-spread v1 Clarinet coverage

**88/88 integration tests passed; coverage gate FAILED.**

Source-matched results from `/tmp/jing-rescale-full-final.log` and `.build/coverage.json`.
The existing gate requires 100% functions, 99% lines and 99% branches per rung. No threshold or instrumentation point was changed/excluded.
The npm command exits 1 at the gate; the reporter saves the JSON before throwing. This Markdown renders that JSON without claiming a passing release report.

| Rung | Functions | Lines | Branches |
| --- | --- | --- | --- |
| jing-buy-stx-core-spread-v1 | 36/36 (100%) | 472/485 (97.32%) | 153/155 (98.71%) |
| jing-sell-stx-core-spread-v1 | 36/36 (100%) | 469/483 (97.1%) | 152/155 (98.06%) |

## Source SHA-256

- markets-sbtc-stx-jing-v6-3: `5c08412fc5990a8bf0db3a0cbbec3fa4c859d4185d0caf1cd16ae0c78f851bfb`.
- jing-core-v6: `88a689affb23f13030953e891336af42a3f5cb275f13b3c54c79d8cd4de50697`.
- jing-ladder-v1: `0f1e08b023272ed96a2653f727292626d4b0325dcf4e42963104d977860ec786`.
- jing-rung-deposit-trait: `927fbba4826710ded7e81fb4847ed92f5c4310bc4e0cf42537600876b0a01163`.
- jing-ladder-dispatch: `cd31a7b28e4f7cd7b3d1d0c69398784d1c937095ce8b9cdf665c61f14cf0aa50`.
- jing-buy-stx-core-spread-v1: `ddf14dce3620f13679be87b322a72f8c8ced364736aa26e66bc246a70b61e4f7`.
- jing-sell-stx-core-spread-v1: `afd00982974cd9bc5be7948572475d55806e2405f08516fd99ce8b139da6a616`.

## Uncovered points

Ten unhit lines per rung are contract target/callee-name lines introduced by multiline formatting; the enclosing calls execute. Other gaps are the read-only fallback for a missing old reserve, positive proceeds payout/logging in `close-epoch`, and the sell share-ceiling refusal. Positive `close-epoch` payout is defensive handling for proceeds recognized while settling escrow; no public test exercised that branch. These gaps remain counted.

Coverage measures execution, not a proof of every transaction history. The invariant argument and six public-call randomized campaigns are separate evidence; private-helper boundaries are identified in README.md.

### jing-buy-stx-core-spread-v1

- Unhit functions: none.
- Unhit lines: 131, 132, 147, 148, 331, 332, 426, 427, 429, 430, 435, 441, 868.
- Unhit branches (line, block, arm): `867,0,1`, `875,0,1`.

### jing-sell-stx-core-spread-v1

- Unhit functions: none.
- Unhit lines: 105, 106, 121, 122, 304, 305, 399, 400, 402, 403, 408, 414, 577, 823.
- Unhit branches (line, block, arm): `577,0,1`, `822,0,1`, `830,0,1`.
