// Explicit, source-anchored exceptions; never exclude a point merely for being
// unhit. Raw metrics and every exception remain in both coverage reports.
export function applyExclusions(source, lines, branches) {
 const excluded=[];
 const rows=source.split('\n');
 const requireValue=(condition,message)=>{if(!condition)throw Error(`Coverage exclusion invalid: ${message}`);};
 const removeLine=(line,reason)=>{
  requireValue(lines.get(String(line))===0,`expected unhit line ${line}: ${reason}`);
  lines.delete(String(line));excluded.push({kind:'line',point:String(line),reason});
 };
 const side=source.includes('(define-read-only (pooled-sbtc)')?'x':'y';
 const principal="'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.";
 const calls=[
  ['rfq-sbtc-stx-jing-v2-3','get-native-price'],
  ['markets-sbtc-stx-jing-v6-3','get-min-deposits'],
  ['markets-sbtc-stx-jing-v6-3',`get-token-${side}-deposit`],
  ['markets-sbtc-stx-jing-v6-3','get-current-cycle'],
  ['markets-sbtc-stx-jing-v6-3',`get-token-${side}-parked current-contract`],
  ['markets-sbtc-stx-jing-v6-3',`get-token-${side}-pending-deposit current-contract`],
 ];
 for(const [contract,method] of calls){
  const matches=rows.flatMap((row,i)=>row.trim()===principal+contract&&rows[i+1]?.trim()===method?[i]:[]);
  requireValue(matches.length===1,`unique static call ${method}`);
  const i=matches[0];
  requireValue(rows[i-1].trim().endsWith('(contract-call?'),`static call form ${method}`);
  requireValue(lines.get(String(i))>0,`enclosing call must execute: ${method}`);
  removeLine(i+1,`Static contract principal of executed ${method} call; not an evaluated expression`);
  if(!method.includes(' '))removeLine(i+2,`Static function name ${method}; not an evaluated expression`);
 }
 for(const [field,amount] of [['reserve','back'],['proceeds','paid']]){
  const fragment=`        ${field}: (if (> ${amount} (get ${field} r))\n          u0\n          (- (get ${field} r) ${amount})\n        ),`;
  requireValue(source.split(fragment).length===2,`unique unchanged ${field} clamp`);
  const index=source.indexOf(fragment);
  requireValue(index>source.indexOf('(define-private (count-reserve-claim')&&index<source.indexOf('(define-private (settle-proceeds'),`${field} clamp function`);
  const line=source.slice(0,index).split('\n').length+1;
  const key=`${line},0,0`,normal=`${line+1},0,1`;
  requireValue(branches.get(key)===0,`${field} overpay arm must remain unhit`);
  requireValue(branches.get(normal)>0,`${field} backed subtraction must execute`);
  const reason=`Defensive ${amount} > ${field} arm: epoch payout <= remaining receipts invariant; never force-reached`;
  branches.delete(key);excluded.push({kind:'branch',point:key,reason});
  removeLine(line,reason);
 }
 requireValue(excluded.filter(e=>e.kind==='line').length===12&&excluded.filter(e=>e.kind==='branch').length===2,'fixed exception count');
 return excluded;
}
