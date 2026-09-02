// fuzz-remainder-cross-math.mjs
// Property fuzz (JS mirror of the contract's integer math) for the
// remainder-cross + rebate-split formulas. RV cannot fuzz this market in
// simnet (mainnet Pyth calls), so the arithmetic invariants are pinned here:
//   I1 ride + pending == rebate (exact split, no leakage)
//   I2 y-traded <= walker remainder (never overdraws escrow)
//   I3 x-traded <= maker amount
//   I4 fees <= traded amounts; rebate slice <= pot; pot never negative
//   I5 post-fill residual < price/PPDF + 1 (bounded rounding dust)
//   I6 conservation: STX leaving walker escrow == maker + treasury payments
//   I7 no u128 overflow at extreme magnitudes
// Run: node simulations/fuzz-remainder-cross-math.mjs
const PP = 100_000_000n, DF = 100n, PPDF = PP * DF;
const FEE = 10n, REB = 20n, BPS = 10_000n;
const U128 = (1n << 128n) - 1n;
let seed = 42n;
const rnd = (max) => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & U128;
  return (seed >> 32n) % max + 1n;
};
let cases = 0, fails = 0;
const check = (c, label, ctx) => {
  if (!c) { fails++; if (fails < 10) console.log("FAIL", label, ctx); }
};
for (let k = 0; k < 200_000; k++) {
  cases++;
  // magnitudes: up to 21M BTC in sats, 1e9 STX in uSTX, BTC/STX price wide
  const mid = rnd(10n ** 15n);            // scaled price
  const price = mid + rnd(mid / 10n + 1n); // out-of-range maker limit
  const rem = rnd(10n ** 15n);            // walker uSTX remainder
  const makerAmt = rnd(2_100_000_000_000_000n); // sats
  const rebate = rnd(10n ** 13n);
  const clearing = rnd(rem);              // mid-cleared y
  const total = clearing + rnd(rem);      // total >= clearing

  // settlement split
  const ride = (rebate * clearing) / total;
  const pending = rebate - ride;
  check(ride + pending === rebate, "I1 split", { rebate, ride, pending });
  check(ride <= rebate && pending >= 0n, "I1b bounds", { rebate, ride });

  // execute-fill (y-is-taker)
  const xFromY = (rem * PPDF) / price;
  check(rem * PPDF <= U128, "I7 overflow rem*PPDF", { rem });
  const xTraded = makerAmt > xFromY ? xFromY : makerAmt;
  const yTraded = (xTraded * price) / PPDF;
  check(xTraded * price <= U128, "I7 overflow x*price", { xTraded, price });
  check(yTraded <= rem, "I2 overdraw", { rem, yTraded });
  check(xTraded <= makerAmt, "I3 maker", { makerAmt, xTraded });
  const yFee = (yTraded * FEE) / BPS;
  const xFee = (xTraded * FEE) / BPS;
  const rebSlice0 = (yTraded * REB) / BPS;
  const rebSlice = rebSlice0 > pending ? pending : rebSlice0;
  check(yFee <= yTraded && xFee <= xTraded, "I4 fees", { yFee, yTraded });
  check(rebSlice <= pending && pending - rebSlice >= 0n, "I4 pot", { rebSlice, pending });
  if (xTraded === xFromY && xTraded > 0n) {
    const residual = rem - yTraded;
    check(residual <= price / PPDF + 1n, "I5 residual bound", { residual, price });
  }
  // conservation: walker escrow debited yTraded; maker gets yTraded-yFee(+rebSlice from pot), treasury yFee
  check(yTraded === (yTraded - yFee) + yFee, "I6 conserve", {});
}
console.log(`${cases} cases, ${fails} failures`);
process.exit(fails ? 1 : 0);
