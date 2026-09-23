// Execute explicit scenario steps sequentially so a signed update can be fetched
// AFTER submit. No contract/source/storage patches; added settle calls stay in
// each harness's plan and its N/M count. Normal steps keep fork time fixed.
import {
  SimulationBuilder, getSimulationResult, submitSimulationSteps, getNonce, setSender,
} from 'stxer';
import {
  bufferCV, cvToString, deserializeCV, makeUnsignedContractCall,
  makeUnsignedContractDeploy, makeUnsignedSTXTokenTransfer, PostConditionMode,
} from '@stacks/transactions';
import { fetchLazerUpdateAny, lazerFeedTimes } from './_lazer.js';

export const FRESH_UPDATE = bufferCV(Buffer.from('f0e1d2c3b4a59687', 'hex'));
// Read-only values derived from actual fork liquidity, never storage writes.
export const forkValue = (contract, code, capture = () => {}) => ({forkValue:{contract,code,capture}});
const marker = cvToString(FRESH_UPDATE);
const DEP = 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const MARKET = `${DEP}.markets-sbtc-stx-jing-v6-3`;

export async function runCurrentPlan(builder) {
  const initial = SimulationBuilder.new({stacksNodeAPI:'http://77.42.3.101/stacks-api'});
  if (Number.isFinite(builder.block)) initial.useBlockHeight(builder.block);
  initial.steps = [builder.steps[0]];
  initial.sender = builder.sender;
  const sid = await initial.run();
  console.log(`View: https://stxer.xyz/simulations/mainnet/${sid}`);
  const first = await getSimulationResult(sid);
  const result = {steps: [...first.steps]};
  for (const [index, step] of builder.steps.slice(1).entries()) {
    let wire;
    if (step.function_name) {
      let args = [];
      for (const arg of step.function_args) {
        if (!arg?.forkValue) { args.push(arg); continue; }
        const {contract,code,capture}=arg.forkValue;
        const out=await submitSimulationSteps(sid,{steps:[{Eval:[DEP,'',contract,typeof code==='function'?code():code]}]});
        if(!out.steps[0].Eval?.Ok) throw new Error(`Fixture read failed at step ${index+1}: ${JSON.stringify(out)}`);
        const value=deserializeCV(out.steps[0].Eval.Ok);capture(value);args.push(value);
      }
      if (args.some(a => cvToString(a) === marker)) {
        const clock = await submitSimulationSteps(sid, {steps:[{Eval:[DEP,'',MARKET,'stacks-block-time']}]});
        const stamp = Number(cvToString(deserializeCV(clock.steps[0].Eval.Ok)).slice(1));
        let fresh;
        for (let i=0;i<30;i++) {
          const u = await fetchLazerUpdateAny(), times = await lazerFeedTimes(u.hex);
          if (times.at > stamp) { fresh = bufferCV(Buffer.from(u.hex.replace(/^0x/,''),'hex')); console.log(`  step ${index+1}: signed at ${times.at} > submit clock ${stamp}`); break; }
          await new Promise(r=>setTimeout(r,2000));
        }
        if (!fresh) throw new Error(`No signed price newer than ${stamp}; ${sid}`);
        args = args.map(a=>cvToString(a)===marker?fresh:a);
      }
      const raw = await makeUnsignedContractCall({contractAddress:step.contract_id.split('.')[0],contractName:step.contract_id.split('.')[1],functionName:step.function_name,functionArgs:args,nonce:await getNonce(sid,step.sender),network:'mainnet',publicKey:'',fee:0,postConditionMode:PostConditionMode.Allow});
      setSender(raw,step.sender);wire={Transaction:raw.serialize()};
    } else if (step.deployer) {
      const raw=await makeUnsignedContractDeploy({contractName:step.contract_name,codeBody:step.source_code,clarityVersion:step.clarity_version,nonce:await getNonce(sid,step.deployer),network:'mainnet',publicKey:'',fee:0,postConditionMode:PostConditionMode.Allow});
      setSender(raw,step.deployer);wire={Transaction:raw.serialize()};
    } else if (step.recipient) {
      const raw=await makeUnsignedSTXTokenTransfer({recipient:step.recipient,amount:step.amount,nonce:await getNonce(sid,step.sender),network:'mainnet',publicKey:'',fee:0});
      setSender(raw,step.sender);wire={Transaction:raw.serialize()};
    } else if (step.code) wire={Eval:[DEP,'',step.contract_id,step.code]};
    else if (step.type==='AdvanceBlocks') wire={AdvanceBlocks:step.request};
    else throw new Error(`Unsupported planned step: ${JSON.stringify(step)}`);
    const out=await submitSimulationSteps(sid,{steps:[wire]});
    result.steps.push({Result:out.steps[0]});
  }
  return {sid,result};
}
