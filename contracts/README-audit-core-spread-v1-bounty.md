# Review: core-spread v1, v6-3 sizing, router and vault bounty

Review started **2026-09-30** for [AIBTC bounty munkpv0qe7d1683c6411](https://aibtc.com/bounties/munkpv0qe7d1683c6411).
The [public submission record](https://aibtc.com/api/bounties/munkpv0qe7d1683c6411)
contained six submissions when reviewed. The bounty was open; this document
records technical decisions, not an award decision.

## Scope and baseline

The bounty pins `jing-contracts-v3` at `d4ac0c4`: the two core-spread v1
rungs, market net/rebate sizing from `34bbe18`, router sizing from `6a84e02`,
and dispatch's interaction with the rung payouts. External vault scope is
limited to the router-swap allowances in juicestx `5211831`, fastpool-pox-5
`8436562`, and citycoins-protocol `1cc6f23`.

This is separate from [the earlier ladder/market-spread bounty review](README-audit-ladder-dispatch-spread-rungs.md).
The earlier epoch-loss and small-proceeds findings are known and fixed in the
current core-spread v1 pair; they are not new findings for this bounty.

The withdrawal fix below changes only `jing-buy-stx-core-spread-v1.clar` and
`jing-sell-stx-core-spread-v1.clar`. Other findings are not bundled into it.

## Submission decisions

| Submission | Claim or contribution | Current decision |
| --- | --- | --- |
| [munla02j — source/model review](https://paste.rs/to2Rp) | No exploitable finding; carry and gross-up analysis. No Clarinet run. | Supporting review only. Its assertion that v6-3 nets by dividing by BPS contradicts the actual `BPS + bps` denominator. Do not use its no-findings conclusion as proof. |
| [munms1eg — integration review](https://paste.rs/SDSPp) | Reports 93/93 existing integration tests; observes aged-price sizing mismatch. | Supporting evidence. Its no-skip conclusion needs qualification: an attempted but rejected book leg can still miss liquidity a differently sized leg would fill. |
| [ARION, munnuftf](https://gist.github.com/maegminhui-tech/f8b35f896737df802f97d8003e8c3d65) | Low: oversized withdrawal arithmetic; conservation review and informational observations. | Withdrawal class accepted below. Other conclusions remain report claims unless independently checked. |
| [Celestial Shark, munor39t](https://gist.github.com/celestialsharkaibt/6dcff3e54cb3af30bcc83997f7ccc953) | F1: Medium vault allowance failure. F2: Low withdrawal overflow, with a Clarinet reproduction. | F2 accepted and reproduced locally. F1 is not established on the actual vault/router path; see below. |
| [Cunning Nexus, munwd5wp](https://paste.rs/SZMLP) | L-1: withdrawal overflow, including dispatch. L-2: aged-price book skip. I-1/I-2: direct-swap refunds and last-member rounding. | L-1 accepted, same class. L-2 has a source-supported mechanism and supplied tests, but awaits our independent reproduction and a separate fix decision. Informational claims are assessed below. |
| [muob06gj — epoch-map prototype](https://gist.github.com/bodhibuurstede-sys/a9c6f857e3d354374d37b9d764d32448) | No new exploit; optional four-epoch-maps-to-one proposal with reported 93/93 tests. | Design proposal only, not adopted or independently tested here. No bonus decision yet. |

## Accepted: oversized withdrawal requests overflow

**Severity: Low.** Both `withdraw` functions calculated
`ceil(amount * SCALE / unfilled-index)` in an eager `let` binding before
checking whether `amount >= mine`. A valid uint used as an oversized full-exit
cap could overflow, aborting a direct withdrawal or the entire dispatch batch.
The position remained recoverable by retrying with a smaller amount; this is
not insolvency, theft, or a permanent lock.

With `SCALE = unfilled-index = 1e12`, the largest safe old request was
`340282366920938463463374606`. The next value overflowed the ceiling's
addition; `340282366920938463463374608` overflowed the multiplication itself.
Max-uint (`2^128 - 1`) also failed. These are request caps, not required wallet
balances or position sizes.

### Decision and implementation

**Accepted; fix implemented and verified.** Check for a full exit
before evaluating the partial-share arithmetic:

```clarity
(partial (if (>= amount mine)
  member-shares
  (/ (+ (* amount SCALE) (- fi u1)) fi)
))
```

`partial` is the candidate share burn. The existing `full` test first checks
`amount >= mine`; only a smaller request evaluates whether the partial burn
would leave a position worth less than one unit. `shares-out` then chooses
all member shares for a full exit, otherwise `partial`.

The transfer amount remains separate: the member's inventory for an ordinary
full exit, the requested amount for a partial exit, or all remaining backing
for the final member. Existing rounding, zero-value position removal, epoch
payouts and escrow recovery are preserved. Dispatch needs no contract change.

### Verification

Four new regressions **failed on the original source with ArithmeticOverflow**:

- Direct buy and sell exits, with both former arithmetic boundaries and
  max-uint; another member's position must remain unchanged. The final member
  must also exit with max-uint while paused, leaving zero custody and equity.
- Ten-rung buy and sell dispatch batches with max-uint on the tenth leg;
  exact payouts, preservation of the second member, and complete final recovery.

The full post-fix integration run passed **97/97 tests across nine files**, with
no skips, including all four new regressions and the six seeded conservation
campaigns. The unchanged coverage gate passes: both rungs have 100% functions,
executable lines and reachable branches after the previously documented
exceptions. Raw lines are 479/491 (buy) and 477/489 (sell); raw branches are
159/161 per rung. No new exclusions were added. Clarinet checks pass for all
34 integration contracts; both edited files pass the formatter check.

Logs: `/tmp/jing-withdraw-overflow-before.log`,
`/tmp/jing-withdraw-overflow-full.log`, and
`/tmp/jing-withdraw-overflow-check.log`.
See [the integration suite](../tests/unit/integration-v6-3/README.md) and its
[generated coverage report](../tests/unit/integration-v6-3/COVERAGE.md).
Previous Stxer results predate this guard and are not claimed as a rerun of it.

## Pending verification: aged-price router sizing

The market's `gross-up` and router's `jing-size` use 20 bps, while swap netting
uses the verified price age and can charge 69 bps at 79 seconds. At a tight
minimum this can reject the book leg rather than merely underfill it.

Nexus's example has `net-cap = min-x = 10000`: the router sizes 10021 gross,
which nets only 9952 at 69 bps and fails the minimum. A gross input of 10069
nets 10000 and fills. Source inspection supports the mismatch; the report's
new Clarinet tests have not yet been independently rerun here.

Proposed direction, not implemented: use the rebate rate corresponding to
the supplied oracle update in both capacity gross-up and the router's net
minimum checks. Preserve market verification of the update. Test fresh and
aged prices at capacity/minimum boundaries on both asset directions before
choosing an API change. Keep this separate from the withdrawal patch.

## Not established: Medium vault allowance claim

Shark's F1 arithmetic demonstrates how a **direct market swap** leaving a
sub-minimum untraded remainder can refund more than 51 units of rebate.
It does not demonstrate that the vault's smart-router call reaches that
oversized market leg: `jing-size` caps it at the quoted `gross-cap`.

Nexus supplies a router-path countercheck and argues the cap prevents that
example; the latest prototype report also notes that the vault derives its
own mid from the supplied update. An arbitrary direct swap or forged router
mid is therefore insufficient evidence of a vault-entrypoint failure.

**Decision: no vault allowance change on this evidence.** The submitted F1
example is insufficient to establish the claimed Medium; this is not an
exhaustive proof of the allowance for every reachable state. A valid further
report must reproduce the failure through the actual vault/router sizing
path. No full external-vault or Stxer run was performed in this review.

## Informational and design observations

- **Direct-swap rebate refunds above 51:** distinguish the direct-swap bound
  from the capacity-capped router path. This alone is not a vault exploit.
- **Pre-join rounding paid to a later final member:** the existing documented
  policy assigns the epoch's unpaid rounding balance to its final member.
  It does not give a new member earlier indexed earnings. No change accepted
  on this observation; see [the accounting policy](../simulations/README-v1-core-spread-rungs.md#accounting-and-ownership).
- **Epoch-map consolidation:** potentially useful simplification, but it
  changes storage and needs a separate review and validation. It is not part
  of the accepted withdrawal fix.
