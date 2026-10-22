import './build.mjs';
import { createRuntime } from './runtime.mjs';
import { Cl, cvToString } from '@stacks/transactions';

for (const side of ['sbtc', 'stx']) {
  const runtime = await createRuntime(side);
  const sender = runtime.raw.getAccounts().get('wallet_1');
  const receipt = runtime.raw.callPublicFn(
    runtime.harnessName,
    'test-donate-proceeds',
    [Cl.uint(0), Cl.uint(1)],
    sender,
  );
  const state = runtime.raw.callReadOnlyFn('vault', 'get-state', [], runtime.owner).result;
  const booking = runtime.raw.callReadOnlyFn(runtime.harnessName, 'invariant-rung-booking', [], runtime.owner).result;
  const output = {
    side,
    sequence: [
      'test-donate-proceeds(index=u0, raw=u1)',
      '  -> sell u1 into rung-1',
      '  -> donor transfers u2 proceeds to rung-1',
      '  -> claim; rung returns proceeds without consuming principal',
    ],
    result: cvToString(receipt.result),
    state: cvToString(state),
    bookingInvariant: cvToString(booking),
  };
  console.log(JSON.stringify(output, null, 2));
}
