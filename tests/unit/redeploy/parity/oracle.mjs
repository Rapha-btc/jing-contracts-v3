import fs from 'node:fs';
// Explicit deterministic Pyth fixture. Fault modes retain the historical side
// labels 1 and 45; emitted feed identities follow each deployed market.
export const oracleSource=pair=>{
 let source=fs.readFileSync('tests/unit/v6-3/oracle.clar','utf8');
 source=source.replace('(is-eq (var-get mode) id)','(or (and (is-eq id (var-get feed-x)) (is-eq (var-get mode) u1)) (and (is-eq id (var-get feed-y)) (is-eq (var-get mode) u45)))')
  .replaceAll('(is-eq id u1)','(is-eq id (var-get feed-x))').replaceAll('(is-eq id u45)','(is-eq id (var-get feed-y))')
  .replace('(define-data-var feed-y uint u45)','(define-data-var feed-y uint u7)');
 if(pair==='stx-usdcx')source=source.replace('(define-data-var feed-x uint u1)','(define-data-var feed-x uint u45)').replace('(define-data-var mid uint u1000000000000)','(define-data-var mid uint u10000000000)');
 return source;
};
