# creator-escrow-stx-jing

Target: `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.creator-escrow-stx-jing`.
Status: prepared and verified locally; not deployed to mainnet.

Derived directly from `contracts/creator-v3/creator-escrow-v3.clar`.
Funding, releases, refunds, and escrow balances use native STX instead of
USDCx. All amounts are microSTX (1 STX = 1,000,000 microSTX). The even-delivery
restriction is removed to support a single bounty; the six-argument
`start-round` interface and v3 round completion, review, amendment, approval,
claim, expiry, refund, and license terms remain unchanged.

For 3hunna repeat `SPF0285448AVAQ2ASM78FWW89YF1VHPQ70MV4N4K` in both creator
slots and repeat his supplied smart-wallet contract principal in both payout
slots. Set num-videos to 1. The operating address submits and releases;
release sends STX to the payout wallet, never to the operating address.
The payout principal is fixed at round creation.

Verify:

```sh
clarinet check --manifest-path Clarinet-creator-stx.toml
node simulations/verify-creator-stx.js
```

The frontend's `/creators-2` owner panel includes source review and wallet
signed deployment. Deploy from the target owner address using Clarity 4,
then wait for confirmation before funding. The wallet owner must provide
his payout contract and confirm it is under his control.

The frontend bundles a copy at `src/contracts/creator-escrow-stx-jing.clar`
in the separate `jingswap-frontend` repository so it builds independently.
Keep that copy identical whenever changing this source.

Mainnet-fork stxer harness: `npm run verify:creator-stx-stxer`. Uploads the
exact deployment source to stxer and checks each returned result plus STX
balance deltas. Uses 3hunna’s actual operating address and existing creator
smart wallets as stand-ins until his wallet is supplied. Raw results are
saved to `/tmp/creator-stx-stxer-results.json`. Recheck a completed run with
`STXER_SESSION_ID=<id> npm run verify:creator-stx-stxer`.

Verified mainnet-fork run: https://stxer.xyz/simulations/mainnet/7297ddb68115e9c660a823481ce0d15f

69 checks passed, including simulated deployment, single-delivery funding,
3hunna authorization, separate smart-wallet payout, native STX balance
deltas, revision/amendment, early approval, exact 288-block review boundary,
capacity, duplicate claims, immediate next round after full payout, second
creator payout routing, expiry/grace, refund isolation and double-refund
protection. Source SHA-256:
`78aeb485881358f49ab03ea63656c8ef86cbdec43a96b104344bd9f9c1f9639b`.

His actual payout wallet remains unverified until supplied; the simulation
uses existing creator wallet contracts as stand-ins. This run does not
verify outbound transfers from his eventual wallet.

Updated-address verification: https://stxer.xyz/simulations/mainnet/93f99ed0b0fee8d0080183f46bb28f2d

70 checks passed with `SP3AJC728JY0Y43E8RT6K4VDWPT265RDMXJ8M0VH0`
in both creator slots, the same stand-in contract wallet in both payout
slots, and one video. Explicitly asserted stored round principals/count,
1 STX paid to the wallet, and zero payout to the operating address.

Final comment-free, Clarinet-formatted source verification:
https://stxer.xyz/simulations/mainnet/ccd0c9215034504939f71a65d71e5eaf

70 checks passed. Final source SHA-256: `09d1397da6a3d07cb58c42802bb08ea40625d585c313ed5f2b1ccd84b2598bc4`.
Backend deployment template is an exact byte-for-byte copy.
