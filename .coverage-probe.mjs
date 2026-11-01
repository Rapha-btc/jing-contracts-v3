import { initSimnet } from '/home/raphastacks/projects/jing-contracts-v3/node_modules/@stacks/clarinet-sdk/dist/esm/node/src/index.js';
import { Cl, cvToString } from '/home/raphastacks/projects/jing-contracts-v3/node_modules/@stacks/transactions/dist/esm/index.js';
const deployer='SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22';
const market=deployer+'.markets-sbtc-stx-jing-v6-4';
const sbtc= 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
const whale='SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2';
for (const [manifest, contract, prefix, amount] of [
  ['./Clarinet-yguazu-mm-loop-sell-sbtc.toml','yguazu-mm-loop-sell-sbtc','jing-buy-stx-',1000000n],
  ['./Clarinet-yguazu-mm-loop-sell-stx.toml','yguazu-mm-loop-sell-stx','jing-sell-stx-',100000000n],
]) {
 const sim=await initSimnet(manifest); const owner=sim.deployer; const vault=owner+'.'+contract;
 console.log(contract,'minimums',cvToString(sim.callReadOnlyFn(market,'get-min-deposits',[],owner).result));
 if(contract.endsWith('sbtc')) console.log('fund',cvToString(sim.callPublicFn(sbtc,'transfer',[Cl.uint(amount*10n),Cl.principal(whale),Cl.contractPrincipal(owner,contract),Cl.none()],whale).result));
 else console.log('fund stx',cvToString(sim.transferSTX(amount*10n,vault,owner).result));
 for(let i=1;i<=10;i++) {
  const rung=deployer+'.'+prefix+(i===1?'1':i*10);
  const receipt=sim.callPublicFn(contract,'sell',[Cl.contractPrincipal(deployer,rung.split('.').at(-1)),Cl.uint(amount)],owner);
  console.log(rung,cvToString(receipt.result));
 }
}
