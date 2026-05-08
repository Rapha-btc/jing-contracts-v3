"""Generate mock-jing-core.clar from jing-core.clar by keeping all
log-*/register/get-contract-owner signatures but replacing bodies with
(ok true) — for RV fuzzing only."""
import re, sys

src = open("contracts/jing-core.clar").read()
out = ['''(define-read-only (get-contract-owner) tx-sender)

''']

# Match (define-public (FN-NAME (param type) ...)\n  ...body...\n  )) — extract just signature line(s)
# We capture the (define-public (sig)) header and replace body with (ok true)

# Find all log-* and register definitions
pattern = re.compile(
    r'\(define-public \((log-[a-z-]+|register)\b((?:[^()]|\([^()]*(?:\([^()]*\))?[^()]*\))*?)\)\s*\n(?:[^\(]|\([^\(]*\))*?\n*\s*\)\s*(?=\n\(define|\Z)',
    re.DOTALL
)

# Simpler: find each "(define-public (FN-NAME ..." through matching parens via line counts
# Process line by line
lines = src.splitlines(keepends=True)
i = 0
while i < len(lines):
    line = lines[i]
    m = re.match(r'\(define-public \((log-[a-z-]+|register)\b', line)
    if m:
        # Found a target function. Capture lines until top-level paren closes.
        depth = 0
        start = i
        # The body starts at i; find balanced parens
        for j in range(i, len(lines)):
            for ch in lines[j]:
                if ch == '(':
                    depth += 1
                elif ch == ')':
                    depth -= 1
            if depth == 0:
                break
        block = ''.join(lines[start:j+1])

        # Extract signature: from "(define-public (NAME ...)" through the matching ) on signature
        # Sig is the params part of (define-public (NAME (p1 t1) (p2 t2) ...)
        # Walk parens at depth 1: first ( is define-public, second ( is sig
        # Easier: find the position where the signature ends (depth 1 close after open).
        d = 0
        sig_end = None
        first_paren = block.index('(')  # the outer (
        # Walk after first (
        idx = first_paren + 1
        d = 1
        in_sig = False
        sig_open = None
        while idx < len(block):
            ch = block[idx]
            if ch == '(':
                d += 1
                if d == 2 and not in_sig:
                    sig_open = idx
                    in_sig = True
            elif ch == ')':
                if d == 2 and in_sig:
                    sig_end = idx + 1
                    break
                d -= 1
            idx += 1

        if sig_end is None:
            raise SystemExit(f"failed to parse {m.group(1)}")

        signature = block[:sig_end]  # from "(define-public " through end of sig
        # Find function name
        name = m.group(1)
        # The body replacement
        out.append(signature + '\n  (ok true))\n\n')

        i = j + 1
        continue
    i += 1

print(''.join(out))
