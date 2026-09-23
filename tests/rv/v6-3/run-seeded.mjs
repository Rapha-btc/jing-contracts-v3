// Public-call prelude gives RV parked/live/pending states from the first trial.
// Uses RV's own checkProperties/checkInvariants and shrinking/reset routines.
import { initSimnet } from '@stacks/clarinet-sdk';
import { Cl, cvToString } from '@stacks/transactions';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {checkProperties}=require('../../../node_modules/@stacks/rendezvous/dist/property.js');
const {checkInvariants}=require('../../../node_modules/@stacks/rendezvous/dist/invariant.js');
const {getSimnetDeployerContractsInterfaces,getFunctionsFromContractInterfaces}=require('../../../node_modules/@stacks/rendezvous/dist/shared.js');
const manifest='tests/rv/v6-3/Clarinet.toml';
const type=process.argv[2]??'test',runs=Number(process.argv[3]??3000),seed=Number(process.argv[4]??230928);
let simnet;let accounts;
async function reset(){
 simnet=await initSimnet(manifest);
 accounts=[...simnet.getAccounts()].filter(([n])=>n!=='faucet').sort(([a],[b])=>a.localeCompare(b)).map(([,a])=>a);
 const trait=Cl.contractPrincipal(simnet.deployer,'mock-ft'),asset=Cl.stringAscii('mock-ft');
 const call=(who,fn,args)=>{
  const r=simnet.callPublicFn('market',fn,args,who),text=cvToString(r.result);
  if(!text.startsWith('(ok'))throw Error(`Prelude ${fn}: ${text}`);
  return text;
 };
 for(const [side,offset,scale,limit] of [['x',0,1,40000000000000],['y',3,1000,24000000000000]]){
  for(let j=0;j<3;j++) {
   const who=accounts[offset+j],amount=(j===2?3000:1000+j*1000)*scale;
   call(who,`deposit-token-${side}`,[Cl.uint(amount),Cl.uint(limit),Cl.none(),trait,asset]);
   const p=simnet.callReadOnlyFn('market',`get-token-${side}-pending-deposit`,[Cl.principal(who)],simnet.deployer);
   if(cvToString(p.result)!=='none') {simnet.mineEmptyBlocks(1);call(accounts[accounts.length-1],`settle-token-${side}-deposit`,[Cl.principal(who),Cl.bufferFromHex(''),trait,asset]);}
  }
  call(accounts[6+offset/3],`deposit-token-${side}`,[Cl.uint(500*scale),Cl.uint(limit),Cl.none(),trait,asset]);
  call(accounts[offset+1],`set-token-${side}-limit`,[Cl.uint(limit),Cl.none()]);
  call(accounts[accounts.length-1],`readmit-token-${side}`,[Cl.principal(accounts[offset])]);
 }
 console.log('PRELUDE: both sides have 2 live, 1 parked, 1 pending deposit, pending limit/readmit; all created by public calls.');
}
await reset();
const radio=new EventEmitter();let failed=false;
for(const name of ['logMessage','logInfo','logFailure'])radio.on(name,s=>{console.log(s);if(/\[FAIL\]|Error:|Runtime error|u9900|u9901/.test(s))failed=true;});
const eligible=new Map([...simnet.getAccounts()].filter(([n])=>n!=='faucet').sort(([a],[b])=>a.localeCompare(b)));
const all=getSimnetDeployerContractsInterfaces(simnet),list=[`${simnet.deployer}.market`];
const functions=getFunctionsFromContractInterfaces(new Map([...all].filter(([id])=>list.includes(id))));
console.log(`RV SEEDED type=${type} runs=${runs} seed=${seed}`);
if(type==='test')await checkProperties(simnet,reset,list,functions,seed,runs,true,false,radio,eligible,[...eligible.values()]);
else await checkInvariants(simnet,reset,list,functions,seed,runs,undefined,true,false,radio,eligible,[...eligible.values()]);
if(failed)process.exitCode=1;
