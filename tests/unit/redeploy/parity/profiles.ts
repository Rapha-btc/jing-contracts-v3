// Oracle prices use 8 decimals; USDCx and STX use 6, sBTC uses 8.
// valueY = amountX * mid / (10^8 * 10^(decimalsX - 6)).
export const profiles = {
 'sbtc-usdcx': {market:'market-sbtc-usdcx',x:'token',y:'usdcx',feeds:[1,7],mid:10000000000000n,decimalFactor:100n,xAmount:100000n,yAmount:100000000n,xMinimum:100n,yMinimum:100000n,rungAsset:'sbtc',suffix:'-v2'},
 'stx-usdcx': {market:'market-stx-usdcx',x:'asset-stx',y:'usdcx',feeds:[45,7],mid:100000000n,decimalFactor:1n,xAmount:1000000n,yAmount:1000000n,xMinimum:100000n,yMinimum:100000n,rungAsset:'stx-usdc',suffix:''},
} as const;
export type Pair=keyof typeof profiles;
