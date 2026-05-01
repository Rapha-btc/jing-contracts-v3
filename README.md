# jing-contracts-v3

The Jing protocol on Stacks: a fair-batch swap venue for sBTC pairs, plus tools that let users automate trades and borrow against their position. This repo holds the smart contracts; the file layout below is the same one you'll see in the `contracts/` folder.

## Layout

```
contracts/
├── jing-core.clar              registry, equity ledger, single event stream
├── jing-vault-auth.clar        SIP-018 hash builder for signed vault intents
│
├── markets-sbtc-stx-jing.clar       sBTC/STX market
├── markets-sbtc-usdcx-jing.clar     sBTC/USDCx market
│
├── vault-sbtc-stx.clar         per-user sBTC/STX vault
├── vault-sbtc-usdcx.clar       per-user sBTC/USDCx vault
│
├── reserve-trait.clar          interface the reserve implements
├── snpl-trait.clar             interface the per-borrower loan implements
├── reserve-sbtc-stx-jing.clar  shared sBTC reserve (lender's pool)
└── snpl-sbtc-stx-jing.clar     per-borrower swap-now-pay-later loan against sBTC
```

## What each piece does, from a user's point of view

### `jing-core`
The "post office" of the protocol. Every other contract talks to it. It tracks how much sBTC each user has parked across the whole ecosystem (in any vault, market, or loan), and it broadcasts a single event feed that wallets, dashboards, and bots all subscribe to. If you've ever wondered "where's all my sBTC right now?" — that's the question jing-core answers.

### `jing-vault-auth`
A small utility that produces the signature format used by vaults (see below). Owners sign trade intents off-chain; this contract is what turns a structured intent into the exact bytes they sign. You don't interact with it directly.

### Markets — `markets-sbtc-stx-jing` / `markets-sbtc-usdcx-jing`
A **blind-batch auction**. Instead of front-running each other on order books, depositors put their sBTC (or STX / USDCx) into a shared pool with a price they're willing to accept. After a short window, the market settles every order at the same fair price using a Pyth oracle, and everyone gets filled (or rolled to the next round) without any MEV games. One contract per pair.

### Vaults — `vault-sbtc-stx` / `vault-sbtc-usdcx`
Your **personal trading account**. You deploy one (or use a deployer service), park your sBTC and STX/USDCx in it, and sign trade conditions off-chain — *"sell 0.1 sBTC for at least 5,000 USDCx, expires in 24 hours"*. A keeper bot watches the market and executes when conditions are met. Your funds never leave your control: they only move into the official Jing market, into Bitflow's pools, or back to you. The keeper can't substitute tokens or reroute funds.

You can have any number of conditional orders open in parallel. Cancel any of them at any time; the keeper can also cancel an in-flight Jing deposit if you change your mind.

### Reserve — `reserve-sbtc-stx-jing`
A **shared sBTC lending pool**. A lender (or DAO) supplies sBTC into the reserve and sets credit limits per borrower. Borrowers don't share collateral or default risk — each borrower has their own line and their own loan contract (snpl, below). The lender earns interest; rates are set per credit-line.

### Snpl — `snpl-sbtc-stx-jing`
Stands for **"swap now, pay later"**. It's a per-borrower loan contract: the borrower draws sBTC from the reserve, deposits it into the Jing market for STX, and then has a deadline to pay back the loan (with interest) — typically using the STX they swapped into. If they don't repay by the deadline, the lender can seize whatever's left. One snpl per borrower; many borrowers can run in parallel without affecting each other.

This is useful if you have STX coming in (yield, salary, an inbound bridge) and want sBTC exposure now without buying it outright.

### `reserve-trait` / `snpl-trait`
Just type definitions — they describe the shape that any reserve / snpl must conform to. Lets the reserve and snpl talk to each other safely without knowing each other's exact code.

## How the parts fit together

```
        ┌──────────────────────────────┐
        │           jing-core          │ ← single source of truth for
        │  (registry, equity, events)  │   "who has what sBTC where"
        └──┬────────┬──────────┬───────┘
           │        │          │
   ┌───────▼──┐  ┌──▼────┐ ┌───▼────────┐
   │ markets  │  │ vault │ │ reserve +  │
   │  (per    │◄─┤ (per  │ │ snpl       │
   │   pair)  │  │ user) │ │ (lending)  │
   └────┬─────┘  └───┬───┘ └─────┬──────┘
        │            │           │
        └─ also routes ─┘        │
        ─ to Bitflow xyk ─       │
        ─ + DLMM pools ─         ▼
                          (uses the market
                           for the swap)
```

- The **market** is where actual trades clear, fairly and in batches.
- A **vault** is a user's smart-account on top: it lets the user pre-sign trade conditions and lets a keeper fire them at the market when those conditions are met. Vaults can also hit Bitflow's xyk and DLMM pools as fallback venues if the market doesn't fill.
- A **reserve + snpl** stack is for credit: the reserve is the lender's deposit, the snpl is the borrower's account. The snpl uses the same Jing market underneath to swap the borrowed sBTC into STX.
- Everything emits to **jing-core**, so a single feed of events covers all activity across all pairs and all users.

## Build

```sh
clarinet check
```

Mainnet contracts the project depends on (sBTC, USDCx, Pyth oracles, Bitflow xyk + DLMM + router) are pulled into `.cache/requirements/` automatically on first check.

## Status

Pre-mainnet. One known wrinkle:

- `clarinet check` auto-generates a simnet deploy plan that can put the vaults *before* the markets they reference, which trips a "use of unresolved contract" error. If you hit that, open `deployments/default.simnet-plan.yaml` and move the `markets-*-jing` entries above the `vault-*` entries. Pure tooling quirk — the contracts themselves compile fine.
