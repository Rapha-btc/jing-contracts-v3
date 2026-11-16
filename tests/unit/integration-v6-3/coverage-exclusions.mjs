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
 requireValue(excluded.filter(e=>e.kind==='line').length===2&&excluded.filter(e=>e.kind==='branch').length===2,'fixed exception count');
 return excluded;
}
