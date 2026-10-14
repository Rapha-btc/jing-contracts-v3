// Generates the RV target `rv-ladder-harness` (Clarity) for the final pooled
// maker stack. One contract, four real rungs: per-rung code is emitted from
// one template so the buy/sell mirrors cannot drift.
//
// Shape of every wrapper:
//   test-<name>  property mode. (ok true) checked, (ok false) discarded (the
//                action itself was refused; every refusal happens behind a
//                contract-call? boundary, so it rolls back), (err u93xx) a
//                violated property.
//   rv-<name>    invariant mode alias (generated): a violated property latches
//                `rv-valid` false, which invariant-properties reports.
// Market-moving wrappers sync every rung afterwards (each member action syncs
// first, so the invariants read the state the next action would see) and book
// each rung's proceeds inflow in a ghost ledger.
export const OWNER = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
export const ACCOUNTS = [
  'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5',
  'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG', 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC',
  'ST2NEB84ASENDXKYGJPQW86YXQCEFEX2ZQPG87ND', 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB',
  'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0', 'ST3PF13W7Z0RRM42A8VZRVFQ75SV1K26RXEP8YGKJ',
  'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP',
];
export const RUNGS = [
  { id: 'b20', name: 'jing-buy-stx-spread-20', buy: true, spread: 20 },
  { id: 'b50', name: 'jing-buy-stx-spread-50', buy: true, spread: 50 },
  { id: 's20', name: 'jing-sell-stx-spread-20', buy: false, spread: 20 },
  { id: 's50', name: 'jing-sell-stx-spread-50', buy: false, spread: 50 },
];
const H = `'${OWNER}.rv-ladder-harness`;
const FEE = 10; // markets-sbtc-stx-jing-v6-3 FEE_BPS

function rung(r, idx) {
  const P = `.${r.name}`, IN = r.buy ? 'sbtc' : 'stx', OUT = r.buy ? 'stx' : 'sbtc';
  const inBal = w => r.buy ? `(tok ${w})` : `(stx-get-balance ${w})`;
  const outBal = w => r.buy ? `(stx-get-balance ${w})` : `(tok ${w})`;
  const amt = raw => r.buy ? `(+ u100 (mod ${raw} u300000))` : `(+ u100000 (mod ${raw} u1000000000))`;
  const amtW = raw => r.buy ? `(+ u1 (mod ${raw} u300000))` : `(+ u1 (mod ${raw} u1000000000))`;
  const BACK = r.buy ? 'sbtc-paid' : 'stx-paid', PAID = r.buy ? 'stx-paid' : 'sbtc-paid';
  const S = r.spread, id = r.id;
  // fill-price floor at the mid `m` the action ran at (see README)
  const priceOk = r.buy
    ? `(>= (* (+ g u4) u1000000000000000000) (* (* d m) (* u${10000 + S} u${10000 - FEE})))`
    : `(>= (* (* (+ g u4) m) u${10000 - S}) (* (* d u10000000000) u${10000 - FEE}))`;
  return `
;; ---------------------------------------------------------------- ${id}: ${r.name}
(define-private (in-bal-${id} (who principal)) ${inBal('who')})
(define-private (out-bal-${id} (who principal)) ${outBal('who')})
(define-private (total-in-${id}) (+ (contract-call? ${P} market-size) (in-bal-${id} ${P})))
(define-private (sync-${id})
  (if (is-ok (contract-call? ${P} sync)) true (begin (var-set rv-sync-failed true) false)))
(define-private (snap-${id}) {t: (total-in-${id}), g: (out-bal-${id} ${P})})
;; after a market action at mid m: input only leaves by a fill, proceeds only
;; arrive by one, and a fill never pays under the order's price
(define-private (after-${id} (s {t: uint, g: uint}) (m uint))
  (let ((t1 (total-in-${id})) (g1 (out-bal-${id} ${P})))
    (asserts! (<= t1 (get t s)) (err u9401))
    (asserts! (>= g1 (get g s)) (err u9402))
    (let ((d (- (get t s) t1)) (g (- g1 (get g s))))
      (asserts! (or (is-eq d u0) ${priceOk}) (err u9403))
      (asserts! (or (> d u0) (is-eq g u0)) (err u9404))
      (map-set rv-inflow u${idx} (+ g (inflow u${idx})))
      (and (> d u0) (rv-bump "fill-${id}"))
      (ok true))))

(define-private (dep-${id} (raw uint))
  (let ((who tx-sender) (amount ${amt('raw')})
        (i0 (in-bal-${id} who)) (o0 (out-bal-${id} who)) (r0 (out-bal-${id} ${P})))
    (match (contract-call? ${P} deposit amount)
      d (let ((back (get ${BACK} d)) (paid (get ${PAID} d)))
          (asserts! (is-eq (get amount d) amount) (err u9311))
          (asserts! (is-eq (+ (in-bal-${id} who) amount) (+ i0 back)) (err u9312))
          (asserts! (is-eq (out-bal-${id} who) (+ o0 paid)) (err u9313))
          (asserts! (is-eq (+ (out-bal-${id} ${P}) paid) r0) (err u9314))
          (asserts! (> (get shares d) u0) (err u9315))
          (asserts! (is-eq (get epoch d) (get epoch (contract-call? ${P} rv-vars))) (err u9316))
          (rv-ledger u${idx} who amount back paid)
          (rv-bump "deposit-${id}")
          (ok true))
      e (ok false))))

(define-private (wd-${id} (raw uint) (full bool) (upd bool))
  (let ((who tx-sender) (amount (if full RV-MAXU ${amtW('raw')}))
        (p (contract-call? ${P} get-position who))
        (i0 (in-bal-${id} who)) (o0 (out-bal-${id} who)) (r0 (out-bal-${id} ${P})))
    (match (contract-call? ${P} withdraw amount (if upd (some 0x00) none))
      w (let ((gin (get ${IN} w)) (gout (get ${OUT} w)))
          (asserts! (is-eq (in-bal-${id} who) (+ i0 gin)) (err u9321))
          (asserts! (is-eq (out-bal-${id} who) (+ o0 gout)) (err u9322))
          (asserts! (is-eq (+ (out-bal-${id} ${P}) gout) r0) (err u9323))
          ;; never more input than the position showed, proceeds exactly as shown
          (asserts! (<= gin (get ${IN} p)) (err u9324))
          (asserts! (is-eq gout (get ${OUT} p)) (err u9325))
          (rv-ledger u${idx} who u0 gin gout)
          (rv-bump (if full "withdraw-full-${id}" "withdraw-part-${id}"))
          (ok true))
      e (ok false))))

(define-private (claim-${id})
  (let ((who tx-sender) (p (contract-call? ${P} get-position who))
        (cur (match (contract-call? ${P} rv-raw who) x (is-eq (get epoch x) (get epoch (contract-call? ${P} rv-vars))) false))
        (i0 (in-bal-${id} who)) (o0 (out-bal-${id} who)) (r0 (out-bal-${id} ${P})))
    (match (contract-call? ${P} claim)
      c (let ((gin (get ${IN} c)) (gout (get ${OUT} c)))
          (asserts! (is-eq gout (get ${OUT} p)) (err u9331))
          ;; current-epoch input keeps resting; an old epoch returns its reserve share
          (asserts! (is-eq gin (if cur u0 (get ${IN} p))) (err u9332))
          (asserts! (is-eq (in-bal-${id} who) (+ i0 gin)) (err u9333))
          (asserts! (is-eq (out-bal-${id} who) (+ o0 gout)) (err u9334))
          (asserts! (is-eq (+ (out-bal-${id} ${P}) gout) r0) (err u9335))
          (rv-ledger u${idx} who u0 gin gout)
          ;; idempotent: a second claim in the same state pays nothing
          (asserts! (or (not cur)
            (match (contract-call? ${P} claim) c2 (and (is-eq (get ${IN} c2) u0) (is-eq (get ${OUT} c2) u0)) e2 false))
            (err u9336))
          (rv-bump (if (> gout u0) "claim-paid-${id}" "claim-zero-${id}"))
          (ok true))
      e (ok false))))

(define-private (push-${id})
  (let ((t0 (total-in-${id})) (r0 (out-bal-${id} ${P})) (h0 (get held (contract-call? ${P} rv-vars))))
    (match (contract-call? ${P} push)
      pushed (begin
        (asserts! (and (is-eq t0 (total-in-${id})) (is-eq r0 (out-bal-${id} ${P}))) (err u9341))
        (asserts! (or (not pushed) (is-eq (get held (contract-call? ${P} rv-vars)) u0)) (err u9342))
        (and pushed (> h0 u0) (rv-bump "push-${id}"))
        (ok true))
      e (ok false))))

(define-private (sync-twice-${id})
  (match (contract-call? ${P} sync)
    a (let ((v (contract-call? ${P} rv-vars)))
        (match (contract-call? ${P} sync)
          b (begin (asserts! (is-eq v (contract-call? ${P} rv-vars)) (err u9351)) (ok true))
          e (err u9352)))
    e (ok false)))

(define-private (guard-${id})
  (let ((t0 (total-in-${id})))
    (match (contract-call? ${P} refresh-guard)
      x (begin (asserts! (is-eq t0 (total-in-${id})) (err u9361)) (rv-bump "guard-${id}") (ok true))
      e (ok false))))

;; aggregates over every member the fuzz can create (the nine accounts and
;; this harness, the dispatcher's own member)
(define-private (fold-${id} (who principal)
    (acc {e: uint, sc: uint, pi: uint, sum: uint, n: uint, rows: uint, pin: uint, oldin: uint, pout: uint, ahead: bool, over: bool}))
  (let ((p (contract-call? ${P} get-position who)))
    (match (contract-call? ${P} rv-raw who)
      raw (let ((cur (is-eq (get epoch raw) (get e acc))))
            (merge acc {
              sum: (if cur (+ (get sum acc) (contract-call? ${P} carried (get shares raw) (get scale raw) (get sc acc))) (get sum acc)),
              n: (if cur (+ (get n acc) u1) (get n acc)),
              rows: (+ (get rows acc) u1),
              pin: (+ (get pin acc) (get ${IN} p)),
              oldin: (if cur (get oldin acc) (+ (get oldin acc) (get ${IN} p))),
              pout: (+ (get pout acc) (get ${OUT} p)),
              ahead: (or (get ahead acc) (and cur (> (get paid-index raw) (get pi acc)))),
              over: (or (get over acc) (> (rv-get-out u${idx} who) (rv-get-in u${idx} who)))}))
      (merge acc {over: (or (get over acc) (> (rv-get-out u${idx} who) (rv-get-in u${idx} who)))}))))
(define-read-only (rv-agg-${id})
  (let ((v (contract-call? ${P} rv-vars)))
    (fold fold-${id} RV-MEMBERS {e: (get epoch v), sc: (get scale v), pi: (get pindex v),
      sum: u0, n: u0, rows: u0, pin: u0, oldin: u0, pout: u0, ahead: false, over: false})))

(define-read-only (rv-flags-${id})
  (let ((a (rv-agg-${id})) (v (contract-call? ${P} rv-vars)) (ms (contract-call? ${P} market-size))
        (ib (in-bal-${id} ${P})) (ob (out-bal-${id} ${P}))
        (on-book (+ (contract-call? .market get-token-${r.buy ? 'x' : 'y'}-deposit (contract-call? .market get-current-cycle) ${P})
                    (contract-call? .market get-token-${r.buy ? 'x' : 'y'}-parked ${P}))))
    {
     ;; SHARES: never more than the open epoch's members hold, carried to the
     ;; current scale (a rescale leaves a few ownerless shares; the JS monitor
     ;; bounds them per rescale); no member, no shares
     shares: (and (is-eq (get n a) (get members v))
                  (<= (get sum a) (get total v))
                  (or (> (get members v) u0) (is-eq (get total v) u0))),
     ;; INPUT SOLVENCY: every member's input claim (open epoch by the indices,
     ;; closed epochs from the reserve) is on the market or held here
     input: (and (<= (get pin a) (+ ms ib))
                 (<= (get oldin a) (get reserved v))
                 (<= (get reserved v) ib)
                 (<= (contract-call? ${P} pooled-${r.buy ? 'sbtc' : 'stx'}) (- (+ ms ib) (get reserved v)))),
     ;; PROCEEDS SOLVENCY: every claim fits in what the rung has accounted,
     ;; which fits in its balance
     ;; (the exact ledger, remainders kept for each epoch's final member, is
     ;; checked by the JS monitor, which can enumerate the epochs)
     proceeds: (and (<= (get pout a) ob) (<= (get accounted v) ob)
                    (<= (get pout a) (get accounted v))),
     ;; CONSERVATION: proceeds in == proceeds still here + proceeds paid out
     conserved: (is-eq (inflow u${idx}) (+ ob (rv-get-paid u${idx}))),
     ;; NO OVER-WITHDRAWAL: no member ever took more input out than it put in
     overdraw: (not (get over a)),
     ;; INDICES: unfilled-index in [MINT_FLOOR, SCALE] for an epoch with
     ;; shares; no member's paid mark ahead of the proceeds index
     indices: (and (<= (get unfilled v) u1000000000000)
                   (or (is-eq (get total v) u0) (>= (get unfilled v) u1000000000))
                   (not (get ahead a))),
     ;; CORE LEDGER: equity on jing-core-v6 == live + parked on the market
     ;; (pending escrow is not credited until admission)
     core: (is-eq (contract-call? .jing-core-v6 get-token-equity ${r.buy ? '.token' : '.asset-stx'} ${P}) on-book),
     ;; the resting order always carries the rung's own spread
     order: (or (is-eq on-book u0)
                (is-eq (get spread-bps (contract-call? .market get-token-${r.buy ? 'x' : 'y'}-order ${P})) (some u${S}))),
    }))
(define-read-only (check-conserved-${id})
  (is-eq (inflow u${idx}) (+ (out-bal-${id} ${P}) (rv-get-paid u${idx}))))
;; heavy (every member's get-position, the market's maps): evaluated by the JS
;; monitor's getter cross-check, not by invariant-all (see README, cost)
(define-read-only (rv-check-rung-${id})
  (let ((f (rv-flags-${id})))
    (and (get shares f) (get input f) (get proceeds f) (get conserved f)
         (get overdraw f) (get indices f) (get core f) (get order f))))
`;
}

// one dispatcher batch per side, made by this harness as the member
function batch(buy) {
  const [a, b] = RUNGS.filter(r => r.buy === buy), side = buy ? 'buy' : 'sell';
  const IN = buy ? 'sbtc' : 'stx', OUT = buy ? 'stx' : 'sbtc';
  const BACK = buy ? 'sbtc-paid' : 'stx-paid', PAID = buy ? 'stx-paid' : 'sbtc-paid';
  const inBal = w => buy ? `(tok ${w})` : `(stx-get-balance ${w})`;
  const outBal = w => buy ? `(stx-get-balance ${w})` : `(tok ${w})`;
  const allowance = buy ? `(with-ft .token "token" total)` : `(with-stx total)`;
  const ia = RUNGS.indexOf(a), ib = RUNGS.indexOf(b);
  const total = buy ? `(+ u200 (mod raw u600000))` : `(+ u200000 (mod raw u2000000000))`;
  const minA = buy ? 'u100' : 'u100000';
  // the dispatcher's own refusal rolls back at its contract-call? boundary
  const opt = call => `(match ${call} okv (some okv) errv none)`;
  const pick = (call, one, two) => `(if (is-eq m u0) ${call(one)} (if (is-eq m u1) ${call(two)} ${call('both')}))`;
  const list1 = (r, amt) => `(list {rung: .${r.name}, amount: ${amt}})`;
  const lists = (amtA, amtB) => ({ a: list1(a, amtA), b: list1(b, amtB), both: `(list {rung: .${a.name}, amount: ${amtA}} {rung: .${b.name}, amount: ${amtB}})` });
  const L = lists('total', 'total'), LB = lists('wa', 'wb');
  const row = (rows, i) => `(unwrap-panic (element-at? ${rows} u${i}))`;
  const idxOf = rr => `(if (is-eq (get rung ${rr}) .${a.name}) u${ia} u${ib})`;
  return `
;; ---------------------------------------------------------------- dispatcher, ${side} side
(define-private (bdep-${side} (raw uint) (split uint) (mask uint))
  (let ((total ${total}) (m (mod mask u3))
        (sa (+ ${minA} (mod split (+ u1 (- total (* u2 ${minA}))))))
        (i0 ${inBal('current-contract')}) (o0 ${outBal('current-contract')}))
    (match (as-contract? (${allowance})
             ${pick(k => k === 'both'
               ? opt(`(contract-call? .jing-ladder-dispatch deposit-${side} total (list {rung: .${a.name}, amount: sa} {rung: .${b.name}, amount: (- total sa)}))`)
               : opt(`(contract-call? .jing-ladder-dispatch deposit-${side} total ${L[k]})`), 'a', 'b')})
      inner (match inner
        d (let ((rows (get positions d)) (n (len rows)))
            (asserts! (is-eq (get amount d) total) (err u9501))
            (asserts! (is-eq (get rungs d) n) (err u9502))
            (asserts! (is-eq n (if (is-eq m u2) u2 u1)) (err u9503))
            (asserts! (is-eq (fold rv-sum-amount rows u0) total) (err u9504))
            (asserts! (is-eq (fold rv-sum-${BACK} rows u0) (get ${BACK} d)) (err u9505))
            (asserts! (is-eq (fold rv-sum-${PAID} rows u0) (get ${PAID} d)) (err u9506))
            (asserts! (is-eq (+ ${inBal('current-contract')} total) (+ i0 (get ${BACK} d))) (err u9507))
            (asserts! (is-eq ${outBal('current-contract')} (+ o0 (get ${PAID} d))) (err u9508))
            (let ((r0 ${row('rows', 0)}))
              (rv-ledger ${idxOf('r0')} current-contract (get amount r0) (get ${BACK} r0) (get ${PAID} r0)))
            (and (is-eq n u2) (let ((r1 ${row('rows', 1)}))
              (rv-ledger ${idxOf('r1')} current-contract (get amount r1) (get ${BACK} r1) (get ${PAID} r1))))
            (rv-bump "batch-deposit-${side}")
            (ok true))
        (ok false))
      e (ok false))))

(define-private (bwd-${side} (raw uint) (mask uint) (full bool) (upd bool))
  (let ((m (mod mask u3)) (wa (if full RV-MAXU (+ u1 (mod raw ${buy ? 'u500000' : 'u1500000000'})))) (wb (if full RV-MAXU (+ u1 (mod (/ raw u7) ${buy ? 'u500000' : 'u1500000000'}))))
        (pa (contract-call? .${a.name} get-position current-contract))
        (pb (contract-call? .${b.name} get-position current-contract))
        (want-in (if (is-eq m u0) (get ${IN} pa) (if (is-eq m u1) (get ${IN} pb) (+ (get ${IN} pa) (get ${IN} pb)))))
        (want-out (if (is-eq m u0) (get ${OUT} pa) (if (is-eq m u1) (get ${OUT} pb) (+ (get ${OUT} pa) (get ${OUT} pb)))))
        (i0 ${inBal('current-contract')}) (o0 ${outBal('current-contract')}))
    (match (as-contract? ()
             ${pick(k => opt(`(contract-call? .jing-ladder-dispatch withdraw-${side} ${k === 'a' ? list1(a, 'wa') : k === 'b' ? list1(b, 'wb') : LB.both} (if upd (some 0x00) none))`), 'a', 'b')})
      inner (match inner
        w (let ((rows (get positions w)))
            (asserts! (is-eq (get rungs w) (len rows)) (err u9511))
            (asserts! (is-eq (get withdrawn w) (len rows)) (err u9512))
            (asserts! (is-eq (fold rv-sum-${IN} rows u0) (get ${IN} w)) (err u9513))
            (asserts! (is-eq (fold rv-sum-${OUT} rows u0) (get ${OUT} w)) (err u9514))
            (asserts! (is-eq ${inBal('current-contract')} (+ i0 (get ${IN} w))) (err u9515))
            (asserts! (is-eq ${outBal('current-contract')} (+ o0 (get ${OUT} w))) (err u9516))
            (asserts! (<= (get ${IN} w) want-in) (err u9517))
            (asserts! (is-eq (get ${OUT} w) want-out) (err u9518))
            (let ((r0 ${row('rows', 0)}))
              (rv-ledger ${idxOf('r0')} current-contract u0 (get ${IN} r0) (get ${OUT} r0)))
            (and (is-eq (len rows) u2) (let ((r1 ${row('rows', 1)}))
              (rv-ledger ${idxOf('r1')} current-contract u0 (get ${IN} r1) (get ${OUT} r1))))
            (rv-bump "batch-withdraw-${side}")
            (ok true))
        (ok false))
      e (ok false))))

(define-private (bclaim-${side} (mask uint))
  (let ((m (mod mask u3))
        (pa (contract-call? .${a.name} get-position current-contract))
        (pb (contract-call? .${b.name} get-position current-contract))
        (want-out (if (is-eq m u0) (get ${OUT} pa) (if (is-eq m u1) (get ${OUT} pb) (+ (get ${OUT} pa) (get ${OUT} pb)))))
        (i0 ${inBal('current-contract')}) (o0 ${outBal('current-contract')}))
    (match (as-contract? ()
             ${pick(k => opt(`(contract-call? .jing-ladder-dispatch claim-${side} ${k === 'a' ? `(list .${a.name})` : k === 'b' ? `(list .${b.name})` : `(list .${a.name} .${b.name})`})`), 'a', 'b')})
      inner (match inner
        c (let ((rows (get positions c)))
            (asserts! (is-eq (get claimed c) (len rows)) (err u9521))
            (asserts! (is-eq (fold rv-sum-${OUT} rows u0) (get ${OUT} c)) (err u9522))
            (asserts! (is-eq (fold rv-sum-${IN} rows u0) (get ${IN} c)) (err u9523))
            (asserts! (is-eq ${outBal('current-contract')} (+ o0 (get ${OUT} c))) (err u9524))
            (asserts! (is-eq ${inBal('current-contract')} (+ i0 (get ${IN} c))) (err u9525))
            ;; the batch pays exactly what each rung's get-position showed
            (asserts! (is-eq (get ${OUT} c) want-out) (err u9526))
            (let ((r0 ${row('rows', 0)}))
              (rv-ledger ${idxOf('r0')} current-contract u0 (get ${IN} r0) (get ${OUT} r0)))
            (and (is-eq (len rows) u2) (let ((r1 ${row('rows', 1)}))
              (rv-ledger ${idxOf('r1')} current-contract u0 (get ${IN} r1) (get ${OUT} r1))))
            (rv-bump (if (> (get ${OUT} c) u0) "batch-claim-paid-${side}" "batch-claim-zero-${side}"))
            (ok true))
        (ok false))
      e (ok false))))
`;
}

const by4 = (fn, args) => `(let ((k (mod r u4))) (if (is-eq k u0) (${fn}-b20${args}) (if (is-eq k u1) (${fn}-b50${args}) (if (is-eq k u2) (${fn}-s20${args}) (${fn}-s50${args})))))`;
const snapAll = '{b20: (snap-b20), b50: (snap-b50), s20: (snap-s20), s50: (snap-s50)}';
const afterAll = `(begin (rv-sync-all)
    (try! (after-b20 (get b20 s) m)) (try! (after-b50 (get b50 s) m))
    (try! (after-s20 (get s20 s) m)) (try! (after-s50 (get s50 s) m)) (ok true))`;
// market action wrapper: snapshot, act, sync every rung, book and check fills
const market = (name, params, call, tag) => `
(define-public (test-${name}${params})
  (let ((m (contract-call? .oracle get-mid)) (s ${snapAll}))
    (match ${call}
      okv (begin (try! (after-all s m)) (rv-bump "${tag}") (ok true))
      e (ok false))))`;

export function harness() {
  const owners = [...ACCOUNTS.map(a => `'${a}`), ...RUNGS.map(r => `.${r.name}`), H];
  let s = `;; Generated by tests/rv/ladder-v1/harness.mjs. Do not edit.
;; RV target for the final pooled-maker stack. Not a production contract.
(define-map context (string-ascii 100) {called: uint})
(define-public (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name {called: called})))

(define-constant RV-MAXU u340282366920938463463374607431768211455)
(define-constant RV-ACCOUNTS (list ${ACCOUNTS.map(a => `'${a}`).join(' ')}))
(define-constant RV-MEMBERS (list ${ACCOUNTS.map(a => `'${a}`).join(' ')} ${H}))
;; every principal that can own a market position in this stack
(define-constant RV-OWNERS (list ${owners.join(' ')}))
(define-data-var rv-valid bool true)
(define-data-var rv-fail-code uint u0)
(define-data-var rv-sync-failed bool false)
;; ghost ledger: input in / out per (rung, member), proceeds paid and arrived per rung
(define-map rv-in {r: uint, who: principal} uint)
(define-map rv-out {r: uint, who: principal} uint)
(define-map rv-paid uint uint)
(define-map rv-inflow uint uint)
(define-map rv-count (string-ascii 48) uint)
(define-read-only (rv-get-in (r uint) (who principal)) (default-to u0 (map-get? rv-in {r: r, who: who})))
(define-read-only (rv-get-out (r uint) (who principal)) (default-to u0 (map-get? rv-out {r: r, who: who})))
(define-read-only (rv-get-paid (r uint)) (default-to u0 (map-get? rv-paid r)))
(define-read-only (inflow (r uint)) (default-to u0 (map-get? rv-inflow r)))
(define-read-only (rv-get-count (k (string-ascii 48))) (default-to u0 (map-get? rv-count k)))
(define-read-only (rv-status) {valid: (var-get rv-valid), code: (var-get rv-fail-code), sync-failed: (var-get rv-sync-failed)})
(define-private (rv-bump (k (string-ascii 48)))
  (begin (print {rv-success: k}) (map-set rv-count k (+ u1 (rv-get-count k)))))
(define-private (rv-ledger (r uint) (who principal) (in uint) (out uint) (paid uint))
  (begin
    (map-set rv-in {r: r, who: who} (+ in (rv-get-in r who)))
    (map-set rv-out {r: r, who: who} (+ out (rv-get-out r who)))
    (map-set rv-paid r (+ paid (rv-get-paid r)))
    true))
(define-private (tok (who principal)) (unwrap-panic (contract-call? .token get-balance who)))
(define-private (rv-sum-amount (row {rung: principal, amount: uint, shares: uint, epoch: uint, stx-paid: uint, sbtc-paid: uint}) (acc uint)) (+ acc (get amount row)))
(define-private (rv-sum-stx-paid (row {rung: principal, amount: uint, shares: uint, epoch: uint, stx-paid: uint, sbtc-paid: uint}) (acc uint)) (+ acc (get stx-paid row)))
(define-private (rv-sum-sbtc-paid (row {rung: principal, amount: uint, shares: uint, epoch: uint, stx-paid: uint, sbtc-paid: uint}) (acc uint)) (+ acc (get sbtc-paid row)))
(define-private (rv-sum-stx (row {rung: principal, stx: uint, sbtc: uint}) (acc uint)) (+ acc (get stx row)))
(define-private (rv-sum-sbtc (row {rung: principal, stx: uint, sbtc: uint}) (acc uint)) (+ acc (get sbtc row)))
(define-private (owner-at (k uint)) (unwrap-panic (element-at? RV-OWNERS (mod k u${owners.length}))))
`;
  RUNGS.forEach((r, i) => { s += rung(r, i); });
  s += `
;; settle a rung's pending escrow (no-op when there is none or it is too young)
(define-private (admit-rung (k uint))
  (if (< k u2)
    (is-ok (contract-call? .market settle-token-x-deposit (if (is-eq k u0) .${RUNGS[0].name} .${RUNGS[1].name}) 0x00 .token "token"))
    (is-ok (contract-call? .market settle-token-y-deposit (if (is-eq k u2) .${RUNGS[2].name} .${RUNGS[3].name}) 0x00 .asset-stx "token"))))
(define-private (rv-sync-all) (begin (sync-b20) (sync-b50) (sync-s20) (sync-s50) true))
(define-private (after-all (s {b20: {t: uint, g: uint}, b50: {t: uint, g: uint}, s20: {t: uint, g: uint}, s50: {t: uint, g: uint}}) (m uint))
  ${afterAll})
`;
  s += batch(true) + batch(false);
  // ---------------- member actions on one rung (r mod 4)
  s += `
;; ================================================================ properties
(define-public (test-deposit (r uint) (raw uint)) ${by4('dep', ' raw')})
(define-public (test-withdraw (r uint) (raw uint) (full bool) (upd bool)) ${by4('wd', ' raw full upd')})
(define-public (test-claim (r uint)) ${by4('claim', '')})
(define-public (test-push (r uint)) ${by4('push', '')})
(define-public (test-sync-idempotent (r uint)) ${by4('sync-twice', '')})
(define-public (test-refresh-guard (r uint)) ${by4('guard', '')})
(define-public (test-batch-deposit (buy bool) (raw uint) (split uint) (mask uint))
  (if buy (bdep-buy raw split mask) (bdep-sell raw split mask)))
(define-public (test-batch-withdraw (buy bool) (raw uint) (mask uint) (full bool) (upd bool))
  (if buy (bwd-buy raw mask full upd) (bwd-sell raw mask full upd)))
(define-public (test-batch-claim (buy bool) (mask uint))
  (if buy (bclaim-buy mask) (bclaim-sell mask)))
`;
  // ---------------- the market around the rungs
  s += market('take', ' (raw uint) (lim uint) (x bool)',
    `(if x
      (contract-call? .market swap (+ u100 (mod raw (if (is-eq (mod lim u4) u0) u300000 u2000))) (/ (* m (- u10000 (mod lim u300))) u10000) 0x00 .token "token" .asset-stx "token" true)
      (contract-call? .market swap (+ u10000 (mod raw (if (is-eq (mod lim u4) u0) u1000000000 u6000000))) (/ (* m (+ u10000 (mod lim u300))) u10000) 0x00 .token "token" .asset-stx "token" false))`, 'take');
  s += market('maker', ' (raw uint) (lim uint) (x bool)',
    `(if x
      (contract-call? .market deposit-token-x (+ u100 (mod raw u300000)) (/ (* m (+ u10060 (mod lim u300))) u10000) none .token "token")
      (contract-call? .market deposit-token-y (+ u10000 (mod raw u1000000000)) (/ (* m (- u9940 (mod lim u300))) u10000) none .asset-stx "token"))`, 'maker');
  // a taker sized to a cut of one rung's live order (a third of the time
  // 99.90-100%: the rescale and the tail-roll close), limit just through its peg
  s += market('take-rung', ' (r uint) (raw uint)',
    `(let ((k (mod r u4)) (admitted (admit-rung (mod r u4))) (cut (if (is-eq (mod raw u3) u0) (+ u9990 (mod (/ raw u3) u11)) (+ u1 (mod raw u10000)))))
      (if (< k u2)
        (let ((size (contract-call? .market get-token-x-deposit (contract-call? .market get-current-cycle) (if (is-eq k u0) .${RUNGS[0].name} .${RUNGS[1].name})))
              (sp (if (is-eq k u0) u${RUNGS[0].spread} u${RUNGS[1].spread}))
              (ask (/ (* m (+ u10000 sp)) u10000))
              (need (/ (+ (* (/ (* size cut) u10000) ask) u9999999999) u10000000000)))
          (contract-call? .market swap (+ u1 (/ (* need u10020) u10000)) (/ (* m (+ u10001 sp)) u10000) 0x00 .token "token" .asset-stx "token" false))
        (let ((size (contract-call? .market get-token-y-deposit (contract-call? .market get-current-cycle) (if (is-eq k u2) .${RUNGS[2].name} .${RUNGS[3].name})))
              (sp (if (is-eq k u2) u${RUNGS[2].spread} u${RUNGS[3].spread}))
              (bid (/ (* m (- u10000 sp)) u10000))
              (need (/ (+ (* (/ (* size cut) u10000) u10000000000) (- bid u1)) bid)))
          (contract-call? .market swap (+ u1 (/ (* need u10020) u10000)) (/ (* m (- u9999 sp)) u10000) 0x00 .token "token" .asset-stx "token" true))))`, 'take-rung');
  s += market('admit', ' (k uint) (x bool)',
    `(if x
      (contract-call? .market settle-token-x-deposit (owner-at k) 0x00 .token "token")
      (contract-call? .market settle-token-y-deposit (owner-at k) 0x00 .asset-stx "token"))`, 'admit');
  s += market('cancel', ' (x bool)',
    `(if x (contract-call? .market cancel-token-x-deposit .token "token") (contract-call? .market cancel-token-y-deposit .asset-stx "token"))`, 'cancel');
  s += market('readmit', ' (k uint) (x bool)',
    `(if x (contract-call? .market readmit-token-x (owner-at k)) (contract-call? .market readmit-token-y (owner-at k)))`, 'readmit');
  s += market('settle-readmit', ' (k uint) (x bool)',
    `(if x
      (contract-call? .market settle-token-x-readmit (owner-at k) 0x00)
      (contract-call? .market settle-token-y-readmit (owner-at k) 0x00))`, 'settle-readmit');
  s += market('settle', '',
    `(contract-call? .market settle-with-refresh 0x00 .token "token" .asset-stx "token")`, 'settle');
  s += `
;; time passes: runtime.mjs mines 1 + n mod 150 empty blocks (600 s each,
;; up to 25 h) after this call, so the rungs' 24 h escrow-cancel and push
;; cooldown are reachable. The call itself changes nothing.
(define-public (test-wait (n uint))
  (begin (asserts! true (err u0)) (rv-bump "wait") (ok true)))
;; the Lazer mid in [3.04e13, 3.36e13): pegs move with it, fixed makers cross
(define-public (test-mid (raw uint))
  (begin (try! (contract-call? .oracle set-mid (+ u30400000000000 (* (mod raw u3200) u1000000000)))) (rv-bump "mid") (ok true)))
;; the miners' price behind every rung's guard: floor native/2, cap native*2;
;; wide enough to switch the pegs off on either side, and sometimes absent
(define-public (test-native (raw uint) (down bool))
  (begin
    (unwrap-panic (contract-call? .miner-oracle set-mid (+ u10000000000000 (* (mod raw u8000) u10000000000))))
    (unwrap-panic (contract-call? .miner-oracle set-available (not (and down (is-eq (mod raw u5) u0)))))
    (asserts! true (err u0))
    (rv-bump "native") (ok true)))
;; ladder owner paths (succeed only when RV picks the deployer)
(define-public (test-retire (r uint))
  (let ((k (mod r u4)))
    (asserts! true (err u0))
    (match (if (< k u2)
              (contract-call? .jing-ladder-v1 retire-band "buy-band" (if (is-eq k u0) u20 u50))
              (contract-call? .jing-ladder-v1 retire-band "sel-band" (if (is-eq k u2) u20 u50)))
      x (begin (unwrap-panic (contract-call? .market prune-seats)) (rv-bump "retire") (ok true))
      e (ok false))))
(define-public (test-seat (r uint))
  (let ((k (mod r u4)) (who (if (is-eq k u0) .${RUNGS[0].name} (if (is-eq k u1) .${RUNGS[1].name} (if (is-eq k u2) .${RUNGS[2].name} .${RUNGS[3].name})))))
    (asserts! true (err u0))
    (match (contract-call? .jing-ladder-v1 seat-band who)
      x (match (contract-call? .market sync-seat who) y (begin (rv-bump "seat") (ok true)) e (ok false))
      e (ok false))))
(define-public (test-push-paused (r uint) (paused bool))
  (begin (asserts! true (err u0)) (match ${by4('pause', ' paused')} x (begin (rv-bump "push-paused") (ok true)) e (ok false))))
${RUNGS.map(r => `(define-private (pause-${r.id} (paused bool)) (contract-call? .${r.name} set-push-paused paused))`).join('\n')}

;; ================================================================ invariants
(define-read-only (check-properties) (var-get rv-valid))
(define-read-only (check-sync-never-fails) (not (var-get rv-sync-failed)))
;; the dispatcher never holds funds
(define-read-only (check-dispatch-no-custody)
  (and (is-eq (tok .jing-ladder-dispatch) u0) (is-eq (stx-get-balance .jing-ladder-dispatch) u0)))
;; MARKET SOLVENCY: the market holds at least every owner's live + parked +
;; pending escrow on each side
(define-private (owed-x (who principal) (acc uint))
  (+ acc (contract-call? .market get-token-x-deposit (contract-call? .market get-current-cycle) who)
     (contract-call? .market get-token-x-parked who)
     (default-to u0 (get amount (contract-call? .market get-token-x-pending-deposit who)))))
(define-private (owed-y (who principal) (acc uint))
  (+ acc (contract-call? .market get-token-y-deposit (contract-call? .market get-current-cycle) who)
     (contract-call? .market get-token-y-parked who)
     (default-to u0 (get amount (contract-call? .market get-token-y-pending-deposit who)))))
(define-read-only (rv-check-market-solvent)
  (and (>= (tok .market) (fold owed-x RV-OWNERS u0))
       (>= (stx-get-balance .market) (fold owed-y RV-OWNERS u0))))
;; LADDER: each band side counts exactly the seated rungs, within the cap, and
;; a seat holder is registered on its own side
(define-private (b2u (b bool)) (if b u1 u0))
(define-read-only (check-ladder-seats)
  (let ((bx (+ (b2u (contract-call? .jing-ladder-v1 is-band-x .${RUNGS[0].name})) (b2u (contract-call? .jing-ladder-v1 is-band-x .${RUNGS[1].name}))))
        (by (+ (b2u (contract-call? .jing-ladder-v1 is-band-y .${RUNGS[2].name})) (b2u (contract-call? .jing-ladder-v1 is-band-y .${RUNGS[3].name}))))
        (cap (contract-call? .jing-ladder-v1 get-max-band-per-side)))
    (and (is-eq bx (contract-call? .jing-ladder-v1 get-band-count "buy-band"))
         (is-eq by (contract-call? .jing-ladder-v1 get-band-count "sel-band"))
         (<= bx cap) (<= by cap)
         (not (contract-call? .jing-ladder-v1 is-band-y .${RUNGS[0].name}))
         (not (contract-call? .jing-ladder-v1 is-band-x .${RUNGS[2].name}))
         (is-eq (get side (unwrap-panic (contract-call? .jing-ladder-v1 get-registered .${RUNGS[0].name}))) "buy-band")
         (is-eq (get side (unwrap-panic (contract-call? .jing-ladder-v1 get-registered .${RUNGS[3].name}))) "sel-band"))))
`;
  const checks = [...s.matchAll(/\(define-read-only \((check-[a-z0-9-]+)\)/g)].map(m => m[1]);
  s += `
;; RV checks ONE random invariant per step; this one evaluates every cheap
;; check. The accounting checks over every member run in the JS monitor after
;; every public call (monitor.mjs), cross-checked against rv-check-rung-*.
(define-read-only (invariant-all)
  (and ${checks.map(c => `(${c})`).join('\n       ')}))
;; diagnosis: the names of the checks that fail right now
(define-read-only (rv-failing)
  (list ${checks.map(c => `(if (${c}) "" "${c}")`).join('\n        ')}))
`;
  // rv-* aliases for invariant mode (RV skips test-* there)
  for (const m of s.matchAll(/\(define-public \((test-[a-z0-9-]+)((?: \([a-z0-9-]+ (?:uint|bool|principal)\))*)\)/g)) {
    const [, name, args] = m, params = [...args.matchAll(/\(([a-z0-9-]+) /g)].map(x => x[1]);
    s += `(define-public (${name.replace('test-', 'rv-')}${args}) (match (${name}${params.map(p => ' ' + p).join('')}) rv-res (ok rv-res) rv-code (begin (var-set rv-valid false) (var-set rv-fail-code rv-code) (ok false))))\n`;
  }
  return s;
}
