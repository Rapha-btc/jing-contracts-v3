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

The withdrawal fix (`b41dbd6`, pushed to master) changes only the two
core-spread v1 production rungs. The age-sizing fix
below moves age-aware capacity into market v6-3 and updates the router to
consume it. The market capacity getter gains an optional update argument
and a `rebate-bps` field. Vault and public router interfaces are unchanged.

## Submission decisions

| Submission | Claim or contribution | Current decision |
| --- | --- | --- |
| [munla02j — source/model review](https://paste.rs/to2Rp) | No exploitable finding; carry and gross-up analysis. No Clarinet run. | Supporting review only. Its assertion that v6-3 nets by dividing by BPS contradicts the actual `BPS + bps` denominator. Do not use its no-findings conclusion as proof. |
| [munms1eg — integration review](https://paste.rs/SDSPp) | Reports 93/93 existing integration tests; observes aged-price sizing mismatch. | Supporting evidence. Its no-skip conclusion needs qualification: an attempted but rejected book leg can still miss liquidity a differently sized leg would fill. |
| [ARION, munnuftf](https://gist.github.com/maegminhui-tech/f8b35f896737df802f97d8003e8c3d65) | Low: oversized withdrawal arithmetic; conservation review and informational observations. | Withdrawal class accepted below. Other conclusions remain report claims unless independently checked. |
| [Celestial Shark, munor39t](https://gist.github.com/celestialsharkaibt/6dcff3e54cb3af30bcc83997f7ccc953) | F1: Medium vault allowance failure. F2: Low withdrawal overflow, with a Clarinet reproduction. | F2 accepted and reproduced locally. F1 is not established on the actual vault/router path; see below. |
| [Cunning Nexus, munwd5wp](https://paste.rs/SZMLP) | L-1: withdrawal overflow, including dispatch. L-2: aged-price book skip. I-1/I-2: direct-swap refunds and last-member rounding. | L-1 accepted, same class. L-2 reproduced independently; a market-owned quote and corresponding router update are implemented and verified. Informational claims are assessed below. |
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

## Accepted: aged-price router sizing

Before this fix, market `gross-up` and router `jing-size` used 20 bps, while swap netting
uses the verified price age and can charge 69 bps at 79 seconds. At a tight
minimum this can reject the book leg rather than merely underfill it.

Nexus's example has `net-cap = min-x = 10000`: the router sizes 10021 gross,
which nets only 9952 at 69 bps and fails the minimum. A gross input of 10069
nets 10000 and fills. Our independently written regressions reproduced the
age-sensitive sizing failures on both asset directions. Twelve assertions
failed on the old source; the four fresh/grace-period controls passed.

**Severity: Low.** The market rejects the mis-sized leg and the router can
fall back to AMMs or leave the input unsold. No theft or insolvency was shown.

### Market-owned capacity quote

**Accepted; implemented and verified.** The production changes are in
market v6-3 (including the formatted and followAll variants) and router v5-3.
This replaces the earlier router-only draft. The market owns feed selection,
age calculation, rebate policy and gross-up; the router consumes its quote.

`get-taker-capacity` now takes `(mid, limit, deposit-x, taker, update)`, where
`update` is optional. It decodes the EVM payload through the production
read-only Lazer decoder, reuses `pick-feed` with the configured `feed-id-x`
and `feed-id-y`, and selects the last matching record. Microseconds become
seconds before the older feed's age is computed. Swap and quote share the
same `feed-age` helper and existing `rebate-bps-for-age` schedule. Future
feed times count as age zero. Absent, malformed or incomplete hints fall
back to the historical 20-bps quote.

The getter retains its existing capacity fields and adds `rebate-bps`:

```text
gross-cap = net-cap == 0 ? 0 : floor(((net-cap + 1) * (10000 + bps) - 1) / 10000)
```

The router passes the update, takes `min(amount, gross-cap)`, and calculates
its minimum/admission net using the returned rate. It has no decoder
constant, timestamp parser, rebate schedule or gross-up formula of its own.
At 69 bps and net-cap 10000, the maximum fitting gross is 10070. A budget
below the real aged minimum still skips the book; no extra funds are drawn.

This is an unverified sizing hint using the caller's mid, not a promise that
invalid inputs can execute. Swap retains all signature, signer, price and
freshness validation. Ages >=80 quote the 70-bps ceiling but cannot trade on
the market. The decoder adds execution work without another oracle fee or
signature verification. The explicit decoder principal keeps Clarity's
read-only analysis valid.

The changed getter signature requires the updated market/router pair and
updated v6-3 quote consumers. `none` preserves fixed-20-bps quote arithmetic;
it does not preserve the old getter arity. Older-version callers remain on
their original signatures. Manual routes and public router/vault signatures
are unchanged. No core-spread rung or vault production source was changed.

### Verification and limits

- **320/320 market tests pass**, including 33 new quote regressions. Coverage
  remains 100% functions, 99.75% lines and 99.76% branches; gates unchanged.
- **185/185 router tests pass**. Coverage is 100% functions, 99.40% lines and
  99.30% branches, with no exclusions. Hint-boundary tests now call the public
  market getter, not a router private helper.
- **97/97 rung/dispatch integration tests** and **23/23 native-vault tests**
  pass. These counts are separate from market/router coverage.
- Market tests cover ages 0, 30, 31, 55, 79, 80 and 100; either feed older;
  configured feed IDs; last matching duplicate selection; future timestamps;
  failed hints; exact gross-cap fills; stale rejection; and conservation.
- Clarinet checks pass for the 11-contract router harness, both market
  mirror variants and the 7-contract RV harness. The full historical RV
  campaigns have not been rerun for this market hash.
- **1,275/1,275 Stxer checks pass**: 482 signed-update comparison checks,
  503 broad smart-router checks and 290 V6 router checks. Results, costs
  and fixture limitations are in the [Stxer report](../simulations/README-router-v5-3-rebate-age.md).
  The former router-only 185-test/787-Stxer-check report and unsigned parser
  probe describe the superseded draft; they are not evidence for these bytes.

Logs: `/tmp/jing-market-age-unit.log`, `/tmp/jing-market-age-router.log`,
`/tmp/jing-market-age-integration.log`, `/tmp/jing-market-age-vault.log` and
`/tmp/jing-market-age-*-stxer.log`. Source hashes are recorded in the
[router coverage report](../tests/unit/router-v5-3/COVERAGE.md) and Stxer
artifact. The market/router changes, regression tests and result artifacts are included
together for review.

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
path. The router Stxer runs above do not exercise the full external-vault
entrypoints or establish a universal allowance bound.

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
