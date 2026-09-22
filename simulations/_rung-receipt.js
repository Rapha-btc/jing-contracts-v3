// ABI shape checks for the older lifecycle suites. Exact payout-vs-wallet
// checks live in verify-v6-2-ten-rung-ladder.js and the RV receipt properties.
export const rungReceipt = method => value => {
  if (!value.startsWith('(ok (tuple ')) return false;
  const fields = method === 'deposit'
    ? ['amount', 'epoch', 'sbtc-paid', 'shares', 'stx-paid']
    : ['sbtc', 'stx'];
  return fields.every(key => new RegExp(`\\(${key} u\\d+\\)`).test(value));
};
