import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ============================================================================
// Sync guard for the coverage-instrumented vault copy.
//
// contracts/test/vault-sbtc-stx-v2-testable.clar exists ONLY so the manifest
// deploys the vault and clarinet's lcov instrumentation can measure it (a
// runtime simnet.deployContract is invisible to coverage). It must stay
// byte-identical to the canonical contracts/vault-sbtc-stx-v2.clar under one
// mechanical transformation: every 'SPV9K21... principal prefix rewritten to
// a relative reference. This test re-derives that transformation and fails
// the suite if the copy ever drifts, so the coverage numbers always describe
// the real vault.
// ============================================================================

// Must match the rewrite list in the header of the testable copy (and the
// same substitutions tests/rv/build.sh applies for the RV harness).
const REWRITES: [string, string][] = [
  ["'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.", "."],
  ["'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-core-v-1-2", ".mock-xyk-core"],
  ["'SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1", ".mock-xyk-pool"],
  ["'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-swap-router-v-1-1", ".mock-dlmm-router"],
  ["'SM1FKXGNZJWSTWDWXQZJNF7B5TV5ZB235JTCXYXKD.dlmm-pool-stx-sbtc-v-1-bps-15", ".mock-dlmm-pool"],
];

describe("vault-sbtc-stx-v2-testable sync guard", function () {
  it("is exactly the canonical source under the fixed rewrite list", function () {
    const canonical = readFileSync(
      resolve(process.cwd(), "contracts/vault-sbtc-stx-v2.clar"),
      "utf8",
    );
    const testable = readFileSync(
      resolve(process.cwd(), "contracts/test/vault-sbtc-stx-v2-testable.clar"),
      "utf8",
    );
    let derived = canonical;
    for (const [from, to] of REWRITES) {
      derived = derived.split(from).join(to);
    }

    expect(testable).toContain("DO NOT EDIT BY HAND");
    // The testable copy is a fixed notice header followed by the derived body.
    expect(testable.endsWith(derived)).toBe(true);
  });
});
