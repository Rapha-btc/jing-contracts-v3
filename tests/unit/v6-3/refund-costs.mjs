import {initSimnet} from '@stacks/clarinet-sdk';
import {Cl,getAddressFromPrivateKey,cvToString} from '@stacks/transactions';
import fs from 'node:fs';
import crypto from 'node:crypto';
// Run after npm run test:v6-3. Keep the measured source pair pinned, without
// rebuilding or overwriting the full suite's coverage artifacts.
const dir='tests/unit/v6-3/.build';
const meta=JSON.parse(fs.readFileSync(`${dir}/source.json`,'utf8'));
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
function verifySource(){
 if(hash(meta.sourcePath)!==meta.sha256||hash(meta.corePath)!==meta.coreSha256)throw Error('Source changed; rerun the v6-3 suite first.');
 let expected=fs.readFileSync(meta.sourcePath,'utf8');
 for(const [from,to] of Object.entries(meta.substitutions))expected=expected.replaceAll(from,to);
 if(fs.readFileSync(`${dir}/market.clar`,'utf8')!==expected)throw Error('Generated market differs beyond dependency substitutions.');
}
verifySource();
const reports=[];
for(const side of ['x','y']){
 const sim=await initSimnet('tests/unit/v6-3/Clarinet.toml',true,{trackCosts:true,trackCoverage:false});
 const owner=sim.getAccounts().get('deployer'),market=`${owner}.market`;
 const asset={x:Cl.contractPrincipal(owner,'token'),y:Cl.contractPrincipal(owner,'wrong-token')},name=Cl.stringAscii('token');
 const call=(c,f,args=[],who=owner)=>{const r=sim.callPublicFn(c,f,args,who);if(r.result.type!=='ok')throw Error(`${f}: ${cvToString(r.result)}`);return r;};
 call('jing-core-v6','set-verified-contract',[Cl.principal(market)]);
 call('market','initialize',[Cl.principal(market),asset.x,asset.y,Cl.uint(100),Cl.uint(10000),Cl.uint(1),Cl.uint(45)]);
 call('jing-ladder-v1','set-max-band',[Cl.uint(0)]);call('market','sync-seat-count');
 const people=Array.from({length:51},(_,i)=>getAddressFromPrivateKey(`${(i+100).toString(16).padStart(64,'0')}01`,'testnet'));
 const amount=s=>s==='x'?10000:1000000,limit=s=>s==='x'?2000000000000:500000000000;
 const fund=(s,who)=>s==='x'?call('token','mint',[Cl.uint(amount(s)*2),Cl.principal(who)]):sim.mintSTX(who,BigInt(amount(s)*2));
 const deposit=(s,who)=>call('market',`deposit-token-${s}`,[Cl.uint(amount(s)),Cl.uint(limit(s)),Cl.none(),asset[s],name],who);
 for(const who of people.slice(0,50)){fund(side,who);deposit(side,who);}
 const list=sim.callReadOnlyFn('market',`get-token-${side}-depositors`,[Cl.uint(0)],owner).result;if(list.value.length!==50)throw Error('Book not full');
 // Admit the opposite maker so the original maker's top-up is escrowed pending.
 const other=side==='x'?'y':'x',counterparty=people[50];fund(other,counterparty);deposit(other,counterparty);
 call('market',`settle-token-${other}-deposit`,[Cl.principal(counterparty),Cl.bufferFromHex('00'),asset[other],name]);
 deposit(side,people[0]);
 const pending=sim.callReadOnlyFn('market',`get-token-${side}-pending-deposit`,[Cl.principal(people[0])],owner).result;if(pending.type!=='some')throw Error('Missing pending claim');
 call('market','set-paused',[Cl.bool(true)]);call('jing-core-v6','pause');
 const balance=who=>side==='x'?BigInt(sim.callReadOnlyFn('token','get-balance',[Cl.principal(who)],owner).result.value.value):sim.getAssetsMap().get('STX').get(who)??0n;
 const before=balance(people[0]);
 const r=call('market',`cancel-token-${side}-deposit`,[asset[side],name],people[0]);
 if(balance(people[0])-before!==BigInt(amount(side)*2)||balance(market)!==BigInt(amount(side)*49))throw Error('Unexpected wallet refund or remaining custody');
 if(cvToString(r.result)!==`(ok u${amount(side)*2})`)throw Error('Wrong refund');
 const {total,limit:budget,memory,memory_limit}=r.costs;
 reports.push({side,state:'50 live makers plus caller pending top-up; market and core paused',result:cvToString(r.result),total,budget,percent:Object.fromEntries(Object.keys(total).map(k=>[k,100*total[k]/budget[k]])),memory,memory_limit});
}
verifySource();
const evidence={marketSha256:meta.sha256,coreSha256:meta.coreSha256,scope:'Clarinet local budgets; real core, strict FT fixture and native STX; not a production sBTC or universal worst-case proof',reports};
fs.writeFileSync(`${dir}/refund-costs.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
