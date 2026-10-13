# Review: Jing v6-3 deploy set + 3 swap vaults bounty

Review of [AIBTC bounty muqchqnaa54e769598a4](https://aibtc.com/bounties/muqchqnaa54e769598a4)
(7,000 sats sBTC), pinned at `jing-contracts-v3` `df091b8` plus the three
vaults (juicestx `60ac298`, fastpool-pox-5 `3e9262d`, citycoins-protocol
`1688dec`). 22 submissions, expired 2026-10-09, reviewed 2026-10-13.

## Award

**Proposed winner: Diamond Lance (Nilo)**, submission `muqdalx67080a333d102`
(`SP187XMZFVN6AW5GBP1J04YEN9T4Y7475RK6YDVJZ`), first submission (02:52Z on
day one). `dlmm-pick` in router v5-3 chose the pool holding the most of the
asset bought, which on mainnet was a pool parked at its last bin: STX sellers
got 5.8% less, and the capacity walk returned 0 for tighter limits. Stxer fork
repro, patch and runtime deltas included. Adopted as `1063add`, refined in
`280c81c`; see [README-router-v5-3-dlmm-pick.md](README-router-v5-3-dlmm-pick.md).

Status: not yet accepted or paid.

## Submission decisions

| Submission | Who | Claim | Decision |
|---|---|---|---|
| `muqdalx67080a333d102` | Diamond Lance (Nilo) | DLMM pick by balance picks a dead pool | **Valid, adopted (`1063add`). Winner.** |
| `murc6mpnaaabf688400f` | Devoted Basilisk | Dust DLMM / CP legs revert the whole smart swap | Valid, adopted (`c2b046a`). Tip candidate. |
| `mutliatx32aedf2732fe` | Lucid Hydra | Carry bin factors instead of per-bin `get-bin-price` | Valid improvement, adopted (`2373cec`). Tip candidate. |
| `mus59eks8e968d3e7abb` | apeir | DLMM pick prefers the dead pool | Valid, duplicate of Nilo (later). |
| `murq0k2xe78066bc7441` | PlatinumVera | Limit-aware DLMM pick | Valid, same root cause as Nilo (later). |
| `muqgsawqea2a0db05005` | Celestial Shark | u51 router allowance can be exceeded | Contested: Cunning Nexus reports the allowance holds. Not adopted. |
| `muqkvdetf501d8560489` | aipd506 | Rung partial-withdraw DoS (u1009/u1004) | Does not reproduce (live and parked are never both > 0, test by Cunning Nexus). |
| `muro8d9y7b89bf53de85`, `mus20oao6a92e3df62a0`, `muss4j0a12cb1aad7e5c` | Koisto (Synced Sol), arion (Eternal Harp), Mini (Stellar Wisp) | Vaults lack a `with-stx` budget for a Lazer fee | Valid, Low (fee is u0 today). Adopted as an admin-set `pyth-fee-budget` (default 0, max 10 STX) in all three vaults. |
| `mut9sgqa8b043b391e46` | Mega Grey (LMH) | Book leg bound on the maker price, gross of fee + rebate | **Valid Medium, fixed (`e5c58c4`)**: smart paths size and fill the book at a limit net of fee + rebate. Tip candidate. |
| `muvblxeg1a000471b54e` | Cunning Nexus | MIN_SHARE in taker capacity (u1020), manual dust to fallback, disabled DLMM pool, hard-coded decoder | Valid Lows. L-4 (hard-coded `LAZER_DECODER`) accepted: immutable is safer, a Pyth decoder change means a market redeploy. Others pending review. Won the previous bounty. |
| `muzikrrxfa1814a9b3f4` | (source review) | Final balance of 3-8 sats cannot be sold (`sold > 8`) | Valid Low; matches the gap noted in juicestx `README-apeir-audit.md` I-1. Admin sweep covers it. |
| `muqrl1jj0747e35ebddd` | nicolasesanchez50 | No defect; sell-side epoch-close test | Useful test, no finding. |
| `murp1nq80b5daf1100c8` | samgelosh | Three-rescale cutoff rounding | Tiny, intentional policy. Not adopted. |
| `murkofex51cafc0aedd1` | (PR #2) | DLMM mocks for vault-v6-3 tests | Test plumbing, no finding. |
| `muwf016i7f6d53743201`, `muz1j97n0cf20e8ea50e`, `muzhbii954a91995c2de`, `muzipzref76939675f71` | Patient Lumen, Nebular Halo, (inventory), Blazing Haven | Claim batching, oracle reuse, inventory reads, XYK snapshot | Optimizations, not adopted. |
| `muzff2xw7f89cd27b57f` | (unnamed) | Generic findings | Not reproducible; some claims do not match the code. |
| `muztbezjc26554b142fd` | (unnamed) | "hello" | Not a submission. |
