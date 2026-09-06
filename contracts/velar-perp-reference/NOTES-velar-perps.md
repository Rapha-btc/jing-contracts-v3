# Velar PerpDex ("gl-*" / GMX-like) - Mainnet Clarity Reference

Fetched from Stacks mainnet via Hiro API on 2026-08-31. NOT committed to git.
Frontend (perpdex.velar.com / app.velar.co) was serving a "site under maintenance"
shell at the time of research, but the on-chain engine is fully deployed and was
actively used (last successful open/close ~2026-03; last successful liquidation
2025-11). The perp engine is 100% on-chain Clarity - this is NOT a CEX-style / off-chain
matching product. The only off-chain pieces are (a) Pyth price messages relayed on-chain,
and (b) a single liquidation keeper bot.

## Mainnet contract IDs

Three byte-identical deployments of the same 11-contract suite exist. Contract source
is identical across all three (verified by diff); they differ only in the oracle FEED-ID
data-var and the pool's token pair.

### Suite 1 - sBTC/USDh (deployer = Velar AMM deployer), deployed 2025-03-27
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-api        (entrypoint / oracle context / reentrancy lock)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-core       (token custody, orchestration, invariants)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-positions  (position store, PnL, liquidation test)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-pools      (LP pool / reserves / interest / collateral ledger)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-fees       (rolling borrowing/funding fee accumulators)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-fees-bank  (protocol fee sink)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-params     (risk params: leverage caps, thresholds, fee rates)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-math       (fixed-point token/price/fee math, formula DSL)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-oracle     (Pyth price extraction, per-block price cache, slippage)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.gl-oracle-trait-pyth (oracle trait)
- SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.sbtc-usdh_v1_0_0 (LP token, SIP-010 + ft-plus mint/burn)
  - base-token = sBTC (SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token), quote = usdh-token-v1
  - Pyth FEED-ID (BTC/USD) = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43

### Suite 2 - STX/USDh (deployer SP1JZ89NV29EEGKJ10TH5ZQVRV9N9392FAQCMB5X8), deployed 2025-05-05
- Same 10 gl-* contracts under that deployer, plus SP1JZ...stx-usdh_v1_0_0 LP token.
  - base = wstx, quote = usdh-token-v1, symbol "STX/USDh"
  - Pyth FEED-ID (STX/USD) = 0xec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17

### Suite 3 - STX/USDh (deployer SP27237SX8784MWJK0RN73M0NK270KMY33F6WNXHH), deployed 2025-04-29
- Earlier STX/USDh deployment, same code. Suite 2 appears to be the live successor.

Owner / fee-collector of suite 1 = SP1Y5...JECTMY4A1 (the deployer EOA), read from
gl-api get-owner and gl-fees-bank fee-collector.
Liquidation keeper (only address that has ever successfully called liquidate) =
SP1044WW9J519H12NT9XEPHQV5GZE2YXZD30555R0.

## Architecture / roles

Layered, single-market-per-suite (each suite hard-codes pool id u1 in gl-api).

- gl-api = the ONLY public entrypoint users call. Functions: mint, burn (LP), open,
  close, liquidate. It (1) builds the price "ctx" by calling the oracle with the caller's
  Pyth message, (2) enforces a per-tx-sender per-block reentrancy LOCK, then (3) forwards
  to gl-core. Note: liquidate does NOT take the lock (so keepers can act same block).
- gl-core = holds all real tokens (as-contract). Pulls collateral in, pays payouts out,
  mints/burns LP tokens, and runs INVARIANTS after every op (balance >= reserves+collateral;
  reserves >= interest). Only gl-api may call the position ops (INTERNAL = contract-caller is .gl-api).
- gl-pools = the ledger for one pool: base/quote reserves (LP funds), base/quote interest
  (open interest locked against reserves), base/quote collateral (trader deposits). LP
  share math (calc-mint/calc-burn) values the pool in quote terms at current price.
- gl-positions = per-position store + PnL. Computes long/short PnL, applies fees, produces
  a "deltas" record (a list of ADD/SUB ops per pool field) that gl-pools.close folds in.
- gl-fees = time-weighted rolling sums of borrowing & funding rates so a position's accrued
  fee can be computed as (sum_at_close - sum_at_open) * collateral. Uses at-block historical
  reads (get-stacks-block-info? id-header-hash + at-block) to read the accumulator as of the
  position's open block.
- gl-params = risk config (owner-settable): leverage caps, collateral caps, fee rates,
  liquidation threshold/fee. Also computes the dynamic (utilization-based) fee rates.
- gl-math = fixed-point helpers: decimal lifting between base/quote, base<->quote conversion
  at a price, fee application, and a tiny stack "formula DSL" (eval over {op,arg} lists).
- gl-oracle = Pyth reader (see below).
- gl-fees-bank = passive sink; the one-off protocol fee is transferred here on open; only
  fee-collector can sweep it via collect.

## Collateral + margin model

- ISOLATED margin, per position. There is no cross-margin. Each position stores its own
  collateral, leverage, entry-price, interest.
- Collateral token depends on side (this is a GMX-style dual-sided design, not USD-margined):
  - LONG: collateral is the QUOTE token (USDh). Conceptually buys `collateral*leverage`
    worth of base; payout in BASE token.
  - SHORT: collateral is the BASE token (sBTC or wstx). Conceptually sells `collateral*leverage`
    base for quote; payout in QUOTE token.
- Leverage caps (gl-params default PARAMS): MIN 1x, MAX 10x for both long and short.
  (Marketing said "up to 20x" historically; the live params cap at 10x.)
- "interest" (open interest / virtual position size) = leverage * virtual-tokens, where
  virtual-tokens = collateral converted to the opposite unit at entry price.
- Max 100 open positions per user (MAX-POSITIONS).
- No same-block open/close and no same-block open-then-close (gl-positions.close requires
  stacks-block-height > opened-at; gl-api LOCK blocks two state ops by one sender in one block).

## Price oracle - Pyth (off-chain signed, relayed on-chain)

- Source is PYTH via the Trust Machines stacks-pyth-bridge:
  'SP3R4F6C1J3JQWWCVZ3S7FRRYPMYG6ZW6RZK31FXY.pyth-oracle-v3 verify-and-update-price-feeds
  (with pyth-storage-v3, pyth-pnau-decoder-v2, wormhole-core-v3).
- The caller (frontend/keeper) fetches a signed Pyth VAA "message" off-chain and passes it
  as (buff 8192) into every gl-api call. gl-oracle.extract-price verifies it on-chain,
  checks the price-identifier == the pool's configured FEED-ID, checks publish-time is
  monotonic (>= stored TIMESTAMP), and rescales price to quote decimals.
- gl-oracle caches the first price seen per block (map prices: block -> price) so all ops in
  the same block use one price (get-or-set-block-price). This is a spot price, NOT a TWAP.
- Slippage: caller passes desired + slippage; check-slippage asserts |price - desired| <= slippage.
- So there is NO internal AMM TWAP and NO DIA. Price is Pyth spot, freshness enforced by
  publish-time monotonicity only (no explicit max-age / staleness bound in the contract).

## Funding + borrowing rate mechanism

Two fee streams, both per-block, both utilization-driven; computed in gl-params.dynamic-fees
and accumulated in gl-fees.

- BORROWING fee: traders pay the LP pool for using its reserves. Rate scales with side
  utilization = interest / (reserves/100), scaled by MAX-FEE, clamped to [MIN-FEE, MAX-FEE].
  Charged to the side that borrows; goes to LPs (stays in reserves).
- FUNDING fee: the heavier (more collateralized/imbalanced) side pays the lighter side.
  funding-fee(base_fee, colA, colB) = scale(base_fee, imbalance(colA, colB)) where
  imbalance = max(colA - colB, 0). So the larger side of collateral pays; the counter side
  receives. Longs and shorts pay each other, capped by available counter-side collateral.
- Cadence: continuous, PER BLOCK (5s blocks). gl-fees stores per-block "samples" (current
  rate) plus rolling "sums" (rate * number of blocks elapsed). A position's accrued fee is
  the difference of the accumulator between its open block and now, times its collateral -
  the classic O(1) funding-index pattern. Rates are refreshed lazily whenever any op calls
  gl-fees.update (open/close/mint/burn each call it).
- Fee representation: per-block numerator over DENOM = 1e9 (gl-math). Params default
  MIN-FEE=1, MAX-FEE=10 (numerators), i.e. very small per-block rates.
- Ordering in gl-positions.value: funding-paid is deducted from a position's collateral
  first, then borrowing-paid, then PnL is computed on the remainder ("users > LPs > protocol"
  priority comment). Fees are capped by available counter-side collateral so the pool can't
  go negative.

## Liquidation

- Permissionless in principle: gl-core.liquidate skips the owner/user check and only requires
  gl-positions.is-liquidatable(id, ctx) to be true. In practice a single keeper
  (SP1044WW9...) is the only address that has landed successful liquidations.
- Maintenance-margin test (gl-params.is-liquidatable):
    required = collateral * (LIQUIDATION-THRESHOLD * leverage) / 100
    liquidatable when pnl.remaining <= required
  With defaults LIQUIDATION-THRESHOLD=1: a 10x position is liquidatable once remaining
  collateral value falls to <= 10% of original collateral; a 1x once <= 1%. (Higher leverage
  => liquidated earlier, i.e. bigger maintenance buffer.)
- Liquidation payout split (gl-params.liquidation-fees, LIQUIDATION-FEE=2): the residual is
  divided by 2 -> half (fee) goes to the liquidator (tx-sender), half (remaining) goes back
  to the position owner. gl-core.liquidate transfers accordingly in both base and quote.
- liquidate does not take the gl-api LOCK, so a keeper can liquidate even in a block where
  the victim acted.

## Counterparty model

- LP-pool-as-counterparty (GMX/GLP style vAMM-on-a-shared-pool). LPs deposit base+quote via
  gl-api.mint and receive an LP token (sbtc-usdh / stx-usdh) representing a share of pool
  value (valued in quote at current price). Traders open leveraged positions against pool
  reserves; trader PnL is paid from / into reserves. There is NO order book and NO peer
  matching. LPs are the house and take the other side of aggregate trader PnL.
- Open interest is locked against unlocked reserves (open asserts reserves >= interest), so
  the pool cannot promise more payout than it holds. LP burn can only withdraw unlocked
  (non-interest-locked) reserves.

## Fees - where they go

- One-off protocol fee on OPEN: static-fees = collateral / PROTOCOL-FEE (default 1000 =>
  0.1% of collateral), transferred to gl-fees-bank on open. Swept by fee-collector (owner).
- Borrowing fee -> stays in LP reserves (accrues to LPs).
- Funding fee -> paid between long and short traders (net to the lighter side).
- Liquidation fee -> 50% of residual to the liquidator keeper.
- LP mint/burn: no explicit spread fee in code beyond pool-value share math.

## On-chain vs off-chain

- ON-CHAIN: all custody, position accounting, PnL, funding/borrowing accrual, LP share math,
  liquidation eligibility and settlement, invariants.
- OFF-CHAIN: (1) Pyth price service - the signed price "message" is produced off-chain and
  handed to the contract each call (relayed, then verified on-chain); (2) a liquidation
  keeper bot that watches positions and submits liquidate txs; (3) the web frontend that
  builds txs and fetches Pyth messages. No off-chain matching engine, no backend-custodied
  funds, no admin-signed prices (prices are Pyth-signed, not Velar-signed).

## Notable risks / gotchas in the code

1. Single-market hardcode: gl-api pins pool id u1; each market is a whole redeployed suite.
   Owner (gl-core set-owner, gl-params set-owner, oracle set-deployer/set-extractor) is the
   deployer EOA - centralized admin over params, oracle feed-id/decimals, and fee sweeping.
2. Oracle freshness: extract-price only enforces publish-time monotonic (>= last stored
   TIMESTAMP) and price>0. There is NO explicit max-staleness / max-age check against the
   chain clock. A stale-but-newer-than-last Pyth message is accepted; freshness relies on the
   caller supplying a recent VAA and on Pyth's own signing. Anyone can push a price by calling
   with a valid VAA.
3. Per-block price cache (get-or-set-block-price): the first price in a block is frozen for
   all ops that block. A user who lands first can pin the block price for others in the same
   block (though the LOCK stops one sender doing two ops/block).
4. gl-oracle.price does INTERNAL check (caller must be gl-api) AFTER calling extract-price,
   which mutates state (var-set TIMESTAMP, map-set prices) inside extract-price. extract-price
   is itself a public function callable by anyone, so the stored TIMESTAMP/price map can be
   advanced by any caller with a valid VAA independent of a trade. Not obviously exploitable
   but is externally pokeable global state.
5. lookup helpers use unwrap-panic on map-get? (gl-pools.lookup, gl-positions.lookup,
   gl-fees.lookup) - a bad id aborts hard rather than returning a typed error.
6. Fee/PnL math is fixed-point with hardcoded decimal-range assumptions (gl-fees ZEROS=1e12,
   gl-math DENOM=1e9). Comments flag several FIXME/TODO (e.g. "FIXME or LIQUIDATABLE" in
   close state check; balanced-burn "needs to check we can pay out"; static-fees FIXME). The
   close precondition allows only state==OPEN (not LIQUIDATABLE), so a liquidatable position
   is closed via the liquidate path, not user close.
7. Liquidations are permissionless in code but de-facto run by one keeper; if that keeper is
   down, bad-debt risk accrues to LPs (positions past maintenance not yet closed).
8. is-liquidatable inverts intuitively: higher leverage => larger `required` => liquidated
   sooner. Correct for the design but worth noting for anyone porting it.

## Files saved in this directory

- gl-api.clar, gl-core.clar, gl-positions.clar, gl-pools.clar, gl-fees.clar,
  gl-fees-bank.clar, gl-params.clar, gl-math.clar, gl-oracle.clar,
  gl-oracle-trait-pyth.clar, sbtc-usdh_v1_0_0.clar  (all from suite 1, SP1Y5...)
- stx-usdh/  = full suite 2 (SP1JZ8...) for byte-diff confirmation; identical gl-* code,
  STX/USDh pool + STX/USD Pyth feed.
</content>
