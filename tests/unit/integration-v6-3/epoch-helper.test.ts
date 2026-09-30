import {describe,expect,it} from 'vitest';
import {U,read,balance,specs,setup} from './helpers';

for(const spec of specs)describe(`${spec.label} v1 epoch helper units`,()=>{
 it('epoch-payout preserves supplied entitlements when an old reserve is absent',()=>{
  const r=setup(spec);
  expect(read(r.rung,'epoch-payout',[U(99),U(17),U(23)])).toEqual({input:17n,proceeds:23n});
  expect(balance(true,r.principal)).toBe(0n);
  expect(balance(false,r.principal)).toBe(0n);
 });
});
