import fs from 'node:fs';
import {getSDK} from '@stacks/clarinet-sdk';
import {Cl} from '@stacks/transactions';
export const owner='ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
export const accounts=new Map([
 ['deployer',owner],['wallet_1','ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5'],
 ['wallet_2','ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG'],['wallet_3','ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC'],
]);
export const names:Record<string,string>={market:'markets-sbtc-stx-jing-v6-5','market-sbtc-usdcx':'markets-sbtc-usdcx-jing-v6-5','market-stx-usdcx':'markets-stx-usdcx-jing-v6-4',router:'swap-router-sbtc-stx-jing-v5-6','z-batch':'jing-settle-batch-v2'};
export let simnet:any;
let sdk:any;
export async function boot({routers=false}={}){
 const raw:any=sdk??=await getSDK({trackCosts:false});
 await raw.initEmptySession(null);raw.setEpoch('4.0');
 const meta=JSON.parse(fs.readFileSync('tests/unit/redeploy/.build/sources.json','utf8'));
 const ordered=[...Object.entries(meta.fixtures)].filter(([n])=>routers||!(n==='router'||n.startsWith('swap-router'))).sort(([a],[b])=>{
  const rank=(n:string)=>n==='sip-010-trait'?0:['token','usdcx','asset-stx','oracle','dia','miner-oracle','jing-core-v6','jing-rung-deposit-trait'].includes(n)?1:n.startsWith('jing-ladder')?2:n.startsWith('market')?3:n.includes('settle-batch')||n==='z-batch'?7:n.startsWith('swap-router')||n==='router'?6:n.startsWith('jing-')?4:5;
  return rank(a)-rank(b);
 });
 for(const [alias,path] of ordered){
  const result=raw.deployContract(names[alias]??alias,fs.readFileSync(path as string,'utf8'),{clarityVersion:5},owner);
  if(result.result.type!=='true')throw Error(`deploy ${alias}: ${Cl.prettyPrint(result.result)}`);
 }
 for(const who of accounts.values())raw.mintSTX(who,100000000000000n);
 const id=(n:string)=>`${owner}.${names[n]??n}`;
 const cv=(v:any):any=>{
  if(v.type==='contract')return {...v,value:v.value.replace(new RegExp(`^${owner}\\.(.+)$`),(_:string,n:string)=>id(n))};
  if(v.type==='list')return {...v,value:v.value.map(cv)};
  if(v.type==='tuple')return {...v,value:Object.fromEntries(Object.entries(v.value).map(([k,x])=>[k,cv(x)]))};
  if(v.type==='some')return {...v,value:cv(v.value)};
  return v;
 };
 simnet=new Proxy(raw,{get(target,key){
  if(key==='getAccounts')return ()=>accounts;
  if(['callPublicFn','callReadOnlyFn','callPrivateFn'].includes(key as string))return (c:string,f:string,args:any[],who:string)=>target[key](c.includes('.')?c:id(c),f,args.map(cv),who);
  if(key==='getDataVar'||key==='getMapEntry')return (c:string,...args:any[])=>target[key](c.includes('.')?c:id(c),...args);
  const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
 }});
 return simnet;
}
