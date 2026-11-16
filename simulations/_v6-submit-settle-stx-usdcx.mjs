// _v6-submit-settle-stx-usdcx.mjs - STX/USDCx copy of _v6-submit-settle.js
// (the original is hard-wired to markets-sbtc-stx-jing-v6-3 for the clock read
// and to Lazer feeds [1, 45]). Same behaviour: the plan's steps run one by
// one on a fork at the TIP, and every FRESH_UPDATE marker in a call's args is
// replaced by a signed [45, 7] update whose older feed time is newer than the
// fork clock at that step. Differences:
//   - clock is read in `clockCid` (the suite's market), feeds [45, 7];
//   - each substitution is recorded in result.updates[planIndex] = {hex, px, py, mid}
//     (planIndex = index in builder.steps), so a harness can rederive a band
//     rung's pegged price from the exact mid the step used.
//   - transient stxer 5xx are retried via _retry-submit.js (installed here).
import { SimulationBuilder, getSimulationResult, submitSimulationSteps, getNonce, setSender } from 'stxer';
import {
  bufferCV, cvToString, deserializeCV, makeUnsignedContractCall,
  makeUnsignedContractDeploy, makeUnsignedSTXTokenTransfer, PostConditionMode,
} from '@stacks/transactions';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';
import { installRetrySubmit } from './_retry-submit.js';
import { NODE, DEP, FEEDS, PRICE_PRECISION } from './_stx-usdcx-v6-common.mjs';

installRetrySubmit();
export const FRESH_UPDATE = bufferCV(Buffer.from('f0e1d2c3b4a59687', 'hex'));
const marker = cvToString(FRESH_UPDATE);

export async function runCurrentPlan(builder, { clockCid, renewEvery = 0 } = {}) {
  if (!clockCid) throw new Error('runCurrentPlan: clockCid required');
  const initial = SimulationBuilder.new({ stacksNodeAPI: NODE });
  if (Number.isFinite(builder.block)) initial.useBlockHeight(builder.block);
  initial.steps = [builder.steps[0]];
  initial.sender = builder.sender;
  const sid = await initial.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const first = await getSimulationResult(sid);
  const result = { steps: [...first.steps], updates: {} };
  for (const [index, step] of builder.steps.slice(1).entries()) {
    if (renewEvery > 0 && index % renewEvery === 0) {
      const extended = await submitSimulationSteps(sid, { steps: [{ TenureExtend: { cause: 'Extended' } }] });
      if (!extended.steps[0].TenureExtend) throw new Error(`Tenure extension failed: ${JSON.stringify(extended)}`);
    }
    let wire;
    if (step.function_name) {
      let args = step.function_args;
      if (args.some((a) => cvToString(a) === marker)) {
        const clock = await submitSimulationSteps(sid, { steps: [{ Eval: [DEP, '', clockCid, 'stacks-block-time'] }] });
        if (!clock.steps[0].Eval?.Ok) throw new Error(`Fork clock read failed: ${JSON.stringify(clock)}`);
        const stamp = Number(cvToString(deserializeCV(clock.steps[0].Eval.Ok)).slice(1));
        let fresh;
        for (let i = 0; i < 40; i++) {
          try {
            const u = await fetchLazerUpdateAny(FEEDS), times = await lazerFeedTimes(u.hex, FEEDS);
            if (times.at > stamp) {
              fresh = bufferCV(Buffer.from(u.hex.replace(/^0x/, ''), 'hex'));
              result.updates[index + 1] = { hex: u.hex, px: u.px, py: u.py, mid: u.px * PRICE_PRECISION / u.py };
              console.log(`  step ${index + 1}: signed at ${times.at} > submit clock ${stamp}`);
              break;
            }
          } catch (e) { if (i > 8) throw e; }
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!fresh) throw new Error(`No signed [45,7] price newer than ${stamp}; ${sid}`);
        args = args.map((a) => cvToString(a) === marker ? fresh : a);
      }
      const raw = await makeUnsignedContractCall({ contractAddress: step.contract_id.split('.')[0], contractName: step.contract_id.split('.')[1], functionName: step.function_name, functionArgs: args, nonce: await getNonce(sid, step.sender), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
      setSender(raw, step.sender); wire = { Transaction: raw.serialize() };
    } else if (step.deployer) {
      const raw = await makeUnsignedContractDeploy({ contractName: step.contract_name, codeBody: step.source_code, clarityVersion: step.clarity_version, nonce: await getNonce(sid, step.deployer), network: 'mainnet', publicKey: '', fee: 0, postConditionMode: PostConditionMode.Allow });
      setSender(raw, step.deployer); wire = { Transaction: raw.serialize() };
    } else if (step.recipient) {
      const raw = await makeUnsignedSTXTokenTransfer({ recipient: step.recipient, amount: step.amount, nonce: await getNonce(sid, step.sender), network: 'mainnet', publicKey: '', fee: 0 });
      setSender(raw, step.sender); wire = { Transaction: raw.serialize() };
    } else if (step.code) wire = { Eval: [DEP, '', step.contract_id, step.code] };
    else if (step.type === 'AdvanceBlocks') wire = { AdvanceBlocks: step.request };
    else throw new Error(`Unsupported planned step: ${JSON.stringify(step)}`);
    const out = await submitSimulationSteps(sid, { steps: [wire] });
    const r = out.steps[0];
    if (r.Transaction?.Err || r.Transaction?.Ok?.vm_error || r.Eval?.Err)
      throw new Error(`Engine failure at planned step ${index + 1}: ${JSON.stringify(r).slice(0, 1200)}; ${sid}`);
    result.steps.push({ Result: r });
  }
  return { sid, result };
}
