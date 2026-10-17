# jing-settle-batch

`contracts/jing-settle-batch.clar` settles many pending requests on
`markets-sbtc-stx-jing-v6-4` in one transaction, against one Pyth Lazer update.

## Why

On the submit + settle market, a deposit, set-limit or readmit that meets an
opposite side parks as a pending request. A later `settle-token-{x,y}-*` call
classifies it against a fresh price. A ladder deposit pushes up to 10 rungs at
once, so the keeper sends up to 10 settle transactions and pays every fee.

With this wrapper the depositor's wallet (or anyone) settles all of them in one
transaction, right after the deposit anchors, and pays one fee. The keeper
stays as the backstop.

## Interface

```clarity
(settle-many
  (update (buff 8192))                                   ;; one signed Lazer update (evm format, feeds 1 + 45)
  (requests (list 10 { who: principal, x: bool, kind: uint })))
```

- `who`: the owner of the pending request (a rung contract or a wallet).
- `x`: `true` for the sBTC side (token-x), `false` for the STX side (token-y).
- `kind`: `u0` deposit, `u1` limit, `u2` readmit.

Returns `(ok { settled, codes })`. `codes` has one entry per request, in order:
`u0` settled, otherwise the market's error code (for example `u1030` nothing
pending, `u1032` price older than the request, `u1002` stale update) or `u7202`
for a bad kind.

Errors for the whole call: `u7201` empty list, `u7203` nothing settled.

## Rules

- Anyone may call it. The market pays each request's owner, never the caller.
- One request failing does not stop the others: each settle is matched, not
  `try!`'d, and the market rolls back that one call's writes.
- Different owners can be settled in the same call.
- The list caps at 10: one ladder deposit is at most 10 rungs, and each settle
  re-verifies the Lazer update. A full list costs about the same as 10 single
  settles (runtime 10.4M, 577 reads, 1.9 MB read length), well inside one block.

## Tests

`simulations/verify-settle-batch.mjs` (`npm run verify:settle-batch`), on a
mainnet fork, 20/20: both sides, a full 10-item list, a mixed batch (u1030 /
u7202 / duplicate / never pending), a third-party caller (owners paid, caller
unchanged), empty and all-fail lists, a stale update, an update older than the
request (u1032), and the limit kind. A real readmit settle is not reachable on
the live book (it needs a parked maker, i.e. a full side of 50); only its
nothing-pending path (u1030) is covered.

Last run: https://stxer.xyz/simulations/mainnet/1ca0aae96d9a626f4e3a5cb503a90d71
