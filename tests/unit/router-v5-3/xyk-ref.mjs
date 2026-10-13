// Reverse of the XYK pool-snapshot change (Blazing Haven, bounty
// muqchqnaa54e769598a4, submission muzipzref76939675f71): turns the
// working-tree router back into the three-read version (xyk-keep,
// xyk-reserves and xyk-swap each read XYK_POOL get-pool) so the unit suite
// and the stxer differential can run both side by side. Every hunk must
// match exactly once, or the reference cannot be built.
export const XYK_REF = [
 [
  ";; fee off the input unless the caller is exempt. The pool's x may be\n;; either token, so the side is read at call time: by `xyk-x-is-sbtc` on a\n;; manual leg, from the stage's one pool read (`xyk-quote`) on a smart one.\n(define-private (xyk-x-is-sbtc)\n  (is-eq (get x-token (unwrap-panic (contract-call? XYK_POOL get-pool))) SBTC)\n)\n\n(define-private (xyk-swap\n",
  ";; fee off the input unless the caller is exempt. The pool's x may be\n;; either token, so the side is read at call time.\n(define-private (xyk-swap\n"
 ],
 [
  "    (min-received uint)\n    (x-is-sbtc bool)\n  )\n",
  "    (min-received uint)\n  )\n"
 ],
 [
  "  )\n  (begin\n    (if x-is-sbtc\n",
  "  )\n  (let ((x-is-sbtc (is-eq (get x-token (unwrap-panic (contract-call? XYK_POOL get-pool))) SBTC)))\n    (if x-is-sbtc\n"
 ],
 [
  "        in: amount,\n        out: (try! (xyk-swap true amount min-received (xyk-x-is-sbtc))),\n      })\n",
  "        in: amount,\n        out: (try! (xyk-swap true amount min-received)),\n      })\n"
 ],
 [
  "        in: amount,\n        out: (try! (xyk-swap false amount min-received (xyk-x-is-sbtc))),\n      })\n",
  "        in: amount,\n        out: (try! (xyk-swap false amount min-received)),\n      })\n"
 ],
 [
  "\n;; One read of the XYK pool for a smart stage (Blazing Haven's efficiency\n;; proposal): reserves as {in, out} for the direction being traded, k = 1 - f\n;; as num/den for the token being sold, and the pool's side for the swap.\n;; The pool's x may be either token; fees are per side of the pool. Nothing\n;; moves the pool between this read and the stage's XYK swap.\n(define-private (xyk-quote (sell-sbtc bool))\n  (let (\n      (pool (unwrap-panic (contract-call? XYK_POOL get-pool)))\n      (x-is-sbtc (is-eq (get x-token pool) SBTC))\n      (x-in (is-eq x-is-sbtc sell-sbtc))\n    )\n",
  "\n;; k = 1 - f as num/den for the token being sold\n(define-private (xyk-keep (sell-sbtc bool))\n  (let ((pool (unwrap-panic (contract-call? XYK_POOL get-pool))))\n    ;; the pool's x may be either token; fees are per side of the pool\n    (if (is-eq (is-eq (get x-token pool) SBTC) sell-sbtc)\n      {\n        num: (- BPS (+ (get x-protocol-fee pool) (get x-provider-fee pool))),\n        den: BPS,\n      }\n      {\n        num: (- BPS (+ (get y-protocol-fee pool) (get y-provider-fee pool))),\n        den: BPS,\n      }\n    )\n"
 ],
 [
  "    )\n    {\n      reserves: (if x-in\n        {\n          in: (get x-balance pool),\n          out: (get y-balance pool),\n        }\n        {\n          in: (get y-balance pool),\n          out: (get x-balance pool),\n        }\n      ),\n      keep: (if x-in\n        {\n          num: (- BPS (+ (get x-protocol-fee pool) (get x-provider-fee pool))),\n          den: BPS,\n        }\n        {\n          num: (- BPS (+ (get y-protocol-fee pool) (get y-provider-fee pool))),\n          den: BPS,\n        }\n      ),\n      x-is-sbtc: x-is-sbtc,\n    }\n  )\n",
  "    )\n  )\n"
 ],
 [
  "      den: (get den (get swap-fee fees)),\n    }\n  )\n)\n",
  "      den: (get den (get swap-fee fees)),\n    }\n  )\n)\n\n;; reserves as {in, out} for the direction being traded\n(define-private (xyk-reserves (sell-sbtc bool))\n  (let ((pool (unwrap-panic (contract-call? XYK_POOL get-pool))))\n    (if (is-eq (is-eq (get x-token pool) SBTC) sell-sbtc)\n      {\n        in: (get x-balance pool),\n        out: (get y-balance pool),\n      }\n      {\n        in: (get y-balance pool),\n        out: (get x-balance pool),\n      }\n    )\n  )\n)\n"
 ],
 [
  "    (let (\n        (q (xyk-quote sell-sbtc))\n        (cap-xyk (cp-capacity (get reserves q) (get keep q) limit sell-sbtc))\n        (cap-velar (cp-capacity (velar-reserves sell-sbtc) (velar-keep) limit sell-sbtc))\n",
  "    (let (\n        (cap-xyk (cp-capacity (xyk-reserves sell-sbtc) (xyk-keep sell-sbtc) limit\n          sell-sbtc\n        ))\n        (cap-velar (cp-capacity (velar-reserves sell-sbtc) (velar-keep) limit sell-sbtc))\n"
 ],
 [
  "        })\n        ;; amm-leg's XYK path, with the pool side from `q`\n        (xyk (if (> (get xyk plan) u0)\n          {\n            in: (get xyk plan),\n            out: (try! (xyk-swap sell-sbtc (get xyk plan)\n              (amm-floor (limit-min (get xyk plan) limit sell-sbtc)) (get x-is-sbtc q)\n            )),\n          }\n          {\n            in: u0,\n            out: u0,\n          }\n        ))\n        (velar (try! (amm-leg (get velar plan) limit sell-sbtc VENUE_VELAR)))\n",
  "        })\n        (xyk (try! (amm-leg (get xyk plan) limit sell-sbtc VENUE_XYK)))\n        (velar (try! (amm-leg (get velar plan) limit sell-sbtc VENUE_VELAR)))\n"
 ]
];
export function xykRef(source) {
  let out = source;
  for (const [from, to] of XYK_REF) {
    if (out.split(from).length !== 2) throw Error(`xyk-ref: hunk not found once: ${from.slice(0, 80)}`);
    out = out.replace(from, () => to);
  }
  return out;
}
