import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tx } from "@stacks/clarinet-sdk";
import {
  Cl,
  cvToJSON,
  privateKeyToPublic,
  publicKeyToHex,
  signMessageHashRsv,
} from "@stacks/transactions";

// ============================================================================
// vault-sbtc-stx-v2 clarinet coverage. Mirror of vault-sbtc-stx.test.ts (v1)
// adapted to the maker/taker market (markets-sbtc-stx-jing-v2).
//
// Key differences vs vault-sbtc-stx (v1):
//   - NOT declared in Clarinet.toml. The contract hardcodes absolute mainnet
//     refs to SPV9K21...markets-sbtc-stx-jing-v2 / .jing-core-v3 /
//     .jing-vault-auth, and markets-sbtc-stx-jing-v2 is not deployed on
//     mainnet. The suite therefore reads the source, rewrites the
//     'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22. prefix to the simnet
//     deployer, and deploys the patched source at runtime with
//     simnet.deployContract. Same "patch trick" the stxer sims use.
//   - initialize now asserts the market's get-taker-rebate-bps equals the
//     vault's own TAKER_REBATE_BPS mirror (u20) -> ERR_REBATE_MISMATCH u6023.
//     Covered by deploying a second patched copy with u21.
//   - execute-jing-deposit takes a trailing `vaa` argument: the v2 market's
//     maker gate calls fresh-classification-price whenever the OPPOSITE book
//     is non-empty. All deterministic staging here uses dead limits on empty
//     opposite books, where the VAA is never read, so DUMMY_VAA works.
//   - NEW execute-jing-swap: taker path through the market's fill-or-kill
//     `swap`. Requires a real Hermes VAA plus live resting size opposite, so
//     the happy paths live in the Hermes-gated section and skip when Hermes
//     is unreachable.
//   - NEW execute-jing-reprice: signed intent whose `amount` must equal the
//     vault's current resting deposit on `side` (ERR_AMOUNT_MISMATCH u6022).
//     On an uncrossed book it is a pure limit move with no asset flow.
//   - cancel-jing-stx / cancel-jing-sbtc use EMPTY (as-contract? () ...)
//     allowances instead of with-all-assets-unsafe; both cancels are
//     regression-tested end to end.
//   - jing-vault-auth build-intent-hash hashes `vault: contract-caller`, so a
//     read-only call from a wallet cannot reproduce the hash the vault
//     computes. The suite rebuilds the SIP-018 hash in TypeScript with the
//     vault principal bound explicitly, and asserts parity with the on-chain
//     builder in the first test.
//
// KNOWN FAILING (on purpose, contract-side):
//   "execute-jing-swap: pays the Pyth refresh fee out of the vault (no warm)"
//   The market's oracle refresh charges an STX fee to tx-sender, which is the
//   vault under as-contract?, and no vault allowance leaves room for it. See
//   the long comment above that test for the exact mechanism.
//
// Error codes: u6001 NOT_OWNER, u6002 INVALID_SIGNATURE, u6003 REPLAY,
// u6004 EXPIRED, u6006 NO_FUNDS, u6011 INVALID_SIDE, u6013 INVALID_PRICE,
// u6020 ALREADY_INITIALIZED, u6021 PUBKEY_NOT_SET, u6022 AMOUNT_MISMATCH,
// u6023 REBATE_MISMATCH.
// ============================================================================

function detectRemoteData(): boolean {
  try {
    const xykPool = cvToJSON(
      simnet.callReadOnlyFn(
        "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.xyk-pool-sbtc-stx-v-1-1",
        "get-total-supply",
        [],
        simnet.getAccounts().get("deployer")!,
      ).result,
    );
    return Number(xykPool.value?.value || 0) > 0;
  } catch {
    return true;
  }
}
const remoteDataEnabled = detectRemoteData();

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const DEPLOYER_PRIVKEY =
  "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
const DEPLOYER_PUBKEY = publicKeyToHex(privateKeyToPublic(DEPLOYER_PRIVKEY));
const WALLET1_PRIVKEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";

const VAULT_NAME = "vault-sbtc-stx-v2-testable";
const BAD_REBATE_NAME = "vault-v2-badrebate";
const VAULT = `${deployer}.${VAULT_NAME}`;
const JING_CORE = "jing-core-v3";
const VAULT_AUTH = "jing-vault-auth";
const MARKET = "markets-sbtc-stx-jing-v2";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";
const SBTC_TRAIT = Cl.contractPrincipal(
  "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4",
  "sbtc-token",
);

const WSTX_TOKEN = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";
const WSTX_TRAIT = Cl.contractPrincipal(
  "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR",
  "token-stx-v-1-2",
);

const SBTC_ASSET = "sbtc-token";
const WSTX_ASSET = "wstx";
const ASSET_SBTC = "sbtc-token";
const ASSET_WSTX = "wstx";

const SBTC_10K = 10_000;
const SBTC_20K = 20_000;
const STX_10 = 10_000_000;
const STX_100 = 100_000_000;
const STX_500 = 500_000_000;

const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX_FEED =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";
const MIN_X = 1_000;
const MIN_Y = 1_000_000;

// Limits relative to any sane BTC/STX oracle price (~1e13 scaled 1e8):
// x-limits are floors (live iff price >= limit), y-limits are ceilings
// (live iff price <= limit).
const LIVE_X = 1;
const DEAD_X = 999_999_999_999_999;
const LIVE_Y = 999_999_999_999_999;
const DEAD_Y = 1;

const TAKER_REBATE_BPS = 20;
const BPS_PRECISION = 10_000;

// The maker gate ignores the VAA when the opposite book is empty, so all
// deterministic staging passes a dummy byte.
const DUMMY_VAA = "00";

// ---------------------------------------------------------------------------
// Runtime deploy of the patched v2 vault source.
// ---------------------------------------------------------------------------
const MAINNET_PREFIX = "'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.";
const V2_SOURCE = readFileSync(
  resolve(process.cwd(), "contracts/vault-sbtc-stx-v2.clar"),
  "utf8",
);

function patchedSource(mutate?: (s: string) => string): string {
  const bound = V2_SOURCE.split(MAINNET_PREFIX).join(`'${deployer}.`);
  return mutate ? mutate(bound) : bound;
}

function deployVault(
  name: string = VAULT_NAME,
  source?: string,
): string {
  // The canonical vault is deployed from the manifest as
  // vault-sbtc-stx-v2-testable (so clarinet's coverage instruments it);
  // only mutants and extra copies are deployed at runtime.
  if (name !== VAULT_NAME || source !== undefined) {
    simnet.deployContract(name, source ?? patchedSource(), { clarityVersion: 5 }, deployer);
  }
  return `${deployer}.${name}`;
}

function pub(contract: string, fn: string, args: any[], sender: string) {
  return simnet.callPublicFn(contract, fn, args, sender);
}

function ro(contract: string, fn: string, args: any[]) {
  return simnet.callReadOnlyFn(contract, fn, args, deployer).result;
}

function fundSbtc(recipient: string, amount: number) {
  const r = simnet.callPublicFn(
    SBTC_TOKEN,
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(SBTC_WHALE),
      Cl.principal(recipient),
      Cl.none(),
    ],
    SBTC_WHALE,
  );
  expect(r.result).toBeOk(Cl.bool(true));
}

function sbtcBalance(who: string): number {
  const r = cvToJSON(
    simnet.callReadOnlyFn(
      SBTC_TOKEN,
      "get-balance",
      [Cl.principal(who)],
      deployer,
    ).result,
  );
  return Number(r.value?.value || 0);
}

function setupMarket() {
  const marketArg = Cl.contractPrincipal(deployer, MARKET);
  expect(
    pub(JING_CORE, "set-verified-contract", [marketArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(
      MARKET,
      "initialize",
      [
        marketArg,
        Cl.principal(SBTC_TOKEN),
        Cl.principal(WSTX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y),
        Cl.bufferFromHex(BTC_FEED),
        Cl.bufferFromHex(STX_FEED),
      ],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

// Deploy + register + arm the pubkey. Returns the vault principal.
function setupVault(): string {
  const vault = deployVault();
  const vaultArg = Cl.principal(vault);
  expect(
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(pub(vault, "initialize", [vaultArg], deployer).result).toBeOk(
    Cl.bool(true),
  );
  expect(
    pub(vault, "set-owner-pubkey", [Cl.bufferFromHex(DEPLOYER_PUBKEY)], deployer)
      .result,
  ).toBeOk(Cl.bool(true));
  return vault;
}

// ---------------------------------------------------------------------------
// SIP-018 intent hash. jing-vault-auth hashes `vault: contract-caller`, which
// is the calling vault when the vault builds it, so the hash is rebuilt here
// in TypeScript with the vault principal bound explicitly. Parity with the
// on-chain builder is asserted in the first test.
// ---------------------------------------------------------------------------
const SIP018_MSG_PREFIX = "534950303138";

function sha256hex(hex: string): string {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
}

function domainHash(): string {
  return cvToJSON(ro(VAULT_AUTH, "get-domain-hash", []))
    .value.replace(/^0x/, "");
}

type Intent = {
  action: string;
  side: string;
  amount: number;
  limitPrice: number;
  authId: number;
  expiry: number;
};

function intentTuple(vaultPrincipal: string, d: Intent) {
  return Cl.tuple({
    vault: Cl.principal(vaultPrincipal),
    action: Cl.stringAscii(d.action),
    side: Cl.stringAscii(d.side),
    amount: Cl.uint(d.amount),
    "limit-price": Cl.uint(d.limitPrice),
    "auth-id": Cl.uint(d.authId),
    expiry: Cl.uint(d.expiry),
  });
}

function buildIntentHash(vaultPrincipal: string, d: Intent): string {
  const inner = sha256hex(Cl.serialize(intentTuple(vaultPrincipal, d)));
  return sha256hex(SIP018_MSG_PREFIX + domainHash() + inner);
}

function signRsv(messageHash: string, privateKey: string): string {
  return signMessageHashRsv({ messageHash, privateKey });
}

// Argument list for the three signed jing entry points (they share a shape).
function jingArgs(sig: string, d: Intent, vaaHex: string = DUMMY_VAA) {
  return [
    Cl.bufferFromHex(sig),
    Cl.stringAscii(d.side),
    Cl.uint(d.amount),
    Cl.uint(d.limitPrice),
    Cl.uint(d.authId),
    Cl.uint(d.expiry),
    Cl.bufferFromHex(vaaHex),
  ];
}

// Argument list for the AMM entry points (no VAA).
function ammArgs(sig: string, d: Intent) {
  return [
    Cl.bufferFromHex(sig),
    Cl.stringAscii(d.side),
    Cl.uint(d.amount),
    Cl.uint(d.limitPrice),
    Cl.uint(d.authId),
    Cl.uint(d.expiry),
  ];
}

function depositY(
  amount: number,
  limit: number,
  sender: string,
  vaaHex: string = DUMMY_VAA,
) {
  return pub(
    MARKET,
    "deposit-token-y",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaaHex),
      WSTX_TRAIT,
      Cl.stringAscii(WSTX_ASSET),
    ],
    sender,
  );
}

function depositX(
  amount: number,
  limit: number,
  sender: string,
  vaaHex: string = DUMMY_VAA,
) {
  return pub(
    MARKET,
    "deposit-token-x",
    [
      Cl.uint(amount),
      Cl.uint(limit),
      Cl.bufferFromHex(vaaHex),
      SBTC_TRAIT,
      Cl.stringAscii(SBTC_ASSET),
    ],
    sender,
  );
}

async function fetchVaa(tag: string): Promise<string | null> {
  const timestamp = Math.floor(Date.now() / 1000) - 30;
  const url = `https://hermes.pyth.network/v2/updates/price/${timestamp}?ids[]=${BTC_FEED}&ids[]=${STX_FEED}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    const data = await response.json();
    if (!data?.binary?.data?.[0]) {
      console.log(`[v3-vault-stx-v2] ${tag}: skipped - no VAA`);
      return null;
    }
    return data.binary.data[0];
  } catch (e) {
    console.log(
      `[v3-vault-stx-v2] ${tag}: skipped - Hermes fetch failed:`,
      (e as Error).message,
    );
    return null;
  }
}

// Pyth's execution plan, needed to warm the price feeds from an EOA.
const PYTH_ORACLE = "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4";
const PYTH_PLAN = Cl.tuple({
  "pyth-storage-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "pyth-storage-v4",
  ),
  "pyth-decoder-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "pyth-pnau-decoder-v3",
  ),
  "wormhole-core-contract": Cl.contractPrincipal(
    "SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y",
    "wormhole-core-v4",
  ),
});

// The market's MAX_STALENESS is 80 seconds and simnet advances
// stacks-block-time by 10 seconds per mined block from the session's boot
// time. Staging the Hermes-gated tests one call per block therefore burns the
// whole freshness window before the settle runs. All staging for those tests
// is batched into a single block instead.
function vaultSetupTxs() {
  return [
    // the vault itself is already deployed from the manifest
    tx.callPublicFn(
      JING_CORE,
      "set-verified-contract",
      [Cl.principal(VAULT)],
      deployer,
    ),
    tx.callPublicFn(VAULT, "initialize", [Cl.principal(VAULT)], deployer),
    tx.callPublicFn(
      VAULT,
      "set-owner-pubkey",
      [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
      deployer,
    ),
  ];
}

function marketSetupTxs() {
  const marketArg = Cl.contractPrincipal(deployer, MARKET);
  return [
    tx.callPublicFn(
      JING_CORE,
      "set-verified-contract",
      [marketArg],
      deployer,
    ),
    tx.callPublicFn(
      MARKET,
      "initialize",
      [
        marketArg,
        Cl.principal(SBTC_TOKEN),
        Cl.principal(WSTX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y),
        Cl.bufferFromHex(BTC_FEED),
        Cl.bufferFromHex(STX_FEED),
      ],
      deployer,
    ),
  ];
}

function fundSbtcTx(recipient: string, amount: number) {
  return tx.callPublicFn(
    SBTC_TOKEN,
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(SBTC_WHALE),
      Cl.principal(recipient),
      Cl.none(),
    ],
    SBTC_WHALE,
  );
}

// Submitting the VAA from an EOA first leaves the feeds already current, so
// the vault's own submission updates nothing and Pyth charges it no fee. See
// the "Pyth refresh fee" test below for what happens without this.
function warmPythTx(vaaHex: string, sender: string) {
  return tx.callPublicFn(
    PYTH_ORACLE,
    "verify-and-update-price-feeds",
    [Cl.bufferFromHex(vaaHex), PYTH_PLAN],
    sender,
  );
}

function allOk(results: { result: any }[], tag: string): boolean {
  for (let i = 0; i < results.length; i++) {
    // A contract deployment inside mineBlock yields a plain bool, not a
    // response; only response results carry a `success` flag.
    const j: any = cvToJSON(results[i].result);
    if (!("success" in j)) continue;
    if (!j.success) {
      console.log(
        `[v3-vault-stx-v2] ${tag}: staging tx ${i} failed -`,
        Cl.prettyPrint(results[i].result),
      );
      return false;
    }
  }
  return true;
}

// Distinguish "the VAA aged out against simnet's synthetic clock" (skip) from
// a real contract-level failure (assert).
function isStale(result: any): boolean {
  const j = cvToJSON(result);
  return !j.success && String(j.value?.value) === "1005";
}

describe.skipIf(!remoteDataEnabled)("vault-sbtc-stx-v2", function () {
  // --- Hash builder parity ---
  it("TS intent-hash helper matches jing-vault-auth build-intent-hash", function () {
    const d: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 1,
      expiry: 0,
    };
    // A read-only call from `deployer` makes contract-caller = deployer, so
    // binding vault = deployer must reproduce the on-chain hash exactly.
    const onChain = cvToJSON(
      simnet.callReadOnlyFn(
        VAULT_AUTH,
        "build-intent-hash",
        [
          Cl.tuple({
            action: Cl.stringAscii(d.action),
            side: Cl.stringAscii(d.side),
            amount: Cl.uint(d.amount),
            "limit-price": Cl.uint(d.limitPrice),
            "auth-id": Cl.uint(d.authId),
            expiry: Cl.uint(d.expiry),
          }),
        ],
        deployer,
      ).result,
    ).value.replace(/^0x/, "");
    expect(buildIntentHash(deployer, d)).toBe(onChain);
    // And the vault-bound hash must differ from the wallet-bound one.
    expect(buildIntentHash(VAULT, d)).not.toBe(onChain);
  });

  // --- Initialization + read-onlys ---
  it("initialize: register gate fires; success; double-init rejected", function () {
    const vault = deployVault();
    const vaultArg = Cl.principal(vault);

    expect(pub(vault, "initialize", [vaultArg], deployer).result).toBeErr(
      Cl.uint(5005),
    );
    expect(ro(vault, "is-initialized", [])).toBeBool(false);

    expect(
      pub(JING_CORE, "set-verified-contract", [vaultArg], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(pub(vault, "initialize", [vaultArg], deployer).result).toBeOk(
      Cl.bool(true),
    );
    expect(ro(vault, "is-initialized", [])).toBeBool(true);

    expect(pub(vault, "initialize", [vaultArg], deployer).result).toBeErr(
      Cl.uint(6020),
    );
  });

  it("initialize: ERR_REBATE_MISMATCH when the vault's rebate mirror drifts", function () {
    // Same source, TAKER_REBATE_BPS bumped to u21. The rebate assert fires
    // before the jing-core register call, so no verified-contract entry is
    // needed for the failure path.
    const bad = deployVault(
      BAD_REBATE_NAME,
      patchedSource((s) =>
        s.replace(
          "(define-constant TAKER_REBATE_BPS u20)",
          "(define-constant TAKER_REBATE_BPS u21)",
        ),
      ),
    );
    expect(
      pub(bad, "initialize", [Cl.principal(bad)], deployer).result,
    ).toBeErr(Cl.uint(6023));
    expect(ro(bad, "is-initialized", [])).toBeBool(false);

    // Sanity: the market really does report u20.
    expect(ro(MARKET, "get-taker-rebate-bps", [])).toBeUint(TAKER_REBATE_BPS);
  });

  it("get-owner returns deployer, get-status reflects empty balances", function () {
    const vault = setupVault();
    expect(ro(vault, "get-owner", [])).toBePrincipal(deployer);
    const status = cvToJSON(ro(vault, "get-status", []));
    expect(status.value.owner.value).toBe(deployer);
    expect(status.value.pubkey.value).toBe(`0x${DEPLOYER_PUBKEY}`);
    expect(status.value.keeper.value).toBe(null);
    expect(Number(status.value["stx-balance"].value)).toBe(0);
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);
  });

  // --- Owner-only setters ---
  it("set-owner-pubkey + set-keeper: owner-only", function () {
    const vault = deployVault();
    const vaultArg = Cl.principal(vault);
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer);
    pub(vault, "initialize", [vaultArg], deployer);

    expect(
      pub(vault, "set-owner-pubkey", [Cl.bufferFromHex(DEPLOYER_PUBKEY)], wallet1)
        .result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(
        vault,
        "set-owner-pubkey",
        [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    expect(
      pub(vault, "set-keeper", [Cl.some(Cl.principal(wallet2))], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(vault, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(
      cvToJSON(ro(vault, "get-status", [])).value.keeper.value.value,
    ).toBe(wallet2);
  });

  // --- deposit / withdraw ---
  it("deposit-stx / deposit-sbtc: owner-only, ERR_NO_FUNDS, balances + jing-core-v2 equity", function () {
    const vault = setupVault();
    fundSbtc(deployer, SBTC_10K);

    expect(pub(vault, "deposit-stx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(vault, "deposit-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );

    expect(
      pub(vault, "deposit-stx", [Cl.uint(STX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    expect(
      pub(vault, "deposit-stx", [Cl.uint(STX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(vault, "get-status", []));
    expect(Number(status.value["stx-balance"].value)).toBe(STX_100);
    expect(Number(status.value["sbtc-balance"].value)).toBe(SBTC_10K);

    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(WSTX_TOKEN),
        Cl.principal(vault),
      ]),
    ).toBeUint(STX_100);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vault),
      ]),
    ).toBeUint(SBTC_10K);
  });

  it("withdraw-stx / withdraw-sbtc: owner-only, ERR_NO_FUNDS, equity debited", function () {
    const vault = setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(vault, "deposit-stx", [Cl.uint(STX_100)], deployer);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    expect(pub(vault, "withdraw-stx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(vault, "withdraw-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(
      pub(vault, "withdraw-stx", [Cl.uint(STX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(vault, "withdraw-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    expect(
      pub(vault, "withdraw-stx", [Cl.uint(STX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(vault, "withdraw-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(vault, "get-status", []));
    expect(Number(status.value["stx-balance"].value)).toBe(0);
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);

    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(WSTX_TOKEN),
        Cl.principal(vault),
      ]),
    ).toBeUint(0);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vault),
      ]),
    ).toBeUint(0);
  });

  // --- revoke-intent ---
  it("revoke-intent: owner OR keeper, ERR_REPLAY on second call", function () {
    const vault = setupVault();
    pub(vault, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);

    const targetHash = "ab".repeat(32);
    expect(
      pub(vault, "revoke-intent", [Cl.bufferFromHex(targetHash)], wallet1)
        .result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(vault, "revoke-intent", [Cl.bufferFromHex(targetHash)], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(
      ro(vault, "is-signature-used", [Cl.bufferFromHex(targetHash)]),
    ).toBeBool(true);
    expect(
      pub(vault, "revoke-intent", [Cl.bufferFromHex(targetHash)], deployer)
        .result,
    ).toBeErr(Cl.uint(6003));

    expect(
      pub(vault, "revoke-intent", [Cl.bufferFromHex("cd".repeat(32))], wallet2)
        .result,
    ).toBeOk(Cl.bool(true));
  });

  // --- cancel-jing-* (empty as-contract? allowance regression) ---
  it("cancel-jing-stx: owner cancels STX-side market deposit, refund returns to vault", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 1,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);
    expect(
      pub(vault, "execute-jing-deposit", jingArgs(sig, intent), deployer)
        .result,
    ).toBeOk(Cl.bufferFromHex(msgHash));

    expect(
      ro(MARKET, "get-token-y-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(STX_100);
    expect(
      Number(cvToJSON(ro(vault, "get-status", [])).value["stx-balance"].value),
    ).toBe(STX_500 - STX_100);

    expect(pub(vault, "cancel-jing-stx", [], wallet1).result).toBeErr(
      Cl.uint(6001),
    );
    expect(pub(vault, "cancel-jing-stx", [], deployer).result).toBeOk(
      Cl.bool(true),
    );

    expect(
      ro(MARKET, "get-token-y-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(0);
    expect(
      Number(cvToJSON(ro(vault, "get-status", [])).value["stx-balance"].value),
    ).toBe(STX_500);
  });

  it("cancel-jing-sbtc: keeper-only path, sBTC returns to the vault", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);
    fundSbtc(deployer, SBTC_10K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 2,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);
    expect(
      pub(vault, "execute-jing-deposit", jingArgs(sig, intent), deployer)
        .result,
    ).toBeOk(Cl.bufferFromHex(msgHash));
    expect(sbtcBalance(vault)).toBe(0);

    expect(pub(vault, "cancel-jing-sbtc", [], wallet3).result).toBeErr(
      Cl.uint(6001),
    );
    expect(pub(vault, "cancel-jing-sbtc", [], wallet2).result).toBeOk(
      Cl.bool(true),
    );

    expect(
      ro(MARKET, "get-token-x-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(0);
    expect(sbtcBalance(vault)).toBe(SBTC_10K);
  });

  // --- execute-jing-deposit ---
  it("execute-jing-deposit (STX): valid signature -> market deposit; replay rejected", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 100,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const args = jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent);
    expect(
      pub(vault, "execute-jing-deposit", args, deployer).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));
    expect(
      pub(vault, "execute-jing-deposit", args, deployer).result,
    ).toBeErr(Cl.uint(6003));
  });

  it("execute-jing-deposit (sBTC): keeper may execute the owner's signed intent", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);
    fundSbtc(deployer, SBTC_10K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 200,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        wallet2,
      ).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));
    expect(
      ro(MARKET, "get-token-x-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(SBTC_10K);
  });

  it("execute-jing-deposit: ERR_NOT_OWNER when the caller is neither owner nor keeper", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 250,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6001));
  });

  it("execute-jing-deposit: ERR_INVALID_SIGNATURE when signed by wrong key", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 300,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, WALLET1_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6002));
  });

  it("execute-jing-deposit: ERR_PUBKEY_NOT_SET before set-owner-pubkey", function () {
    const vault = deployVault();
    const vaultArg = Cl.principal(vault);
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer);
    pub(vault, "initialize", [vaultArg], deployer);
    setupMarket();

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 320,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6021));
  });

  it("execute-jing-deposit: ERR_INVALID_SIDE on bad side string", function () {
    const vault = setupVault();
    setupMarket();

    const intent: Intent = {
      action: "jing-deposit",
      side: "garbage",
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 400,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  it("execute-jing-deposit: ERR_EXPIRED when expiry <= burn-block-height", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 500,
      expiry: Number(simnet.burnBlockHeight),
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6004));
  });

  // --- execute-jing-reprice ---
  it("execute-jing-reprice: dead-to-dead limit move on a one-sided book, no asset flow", function () {
    const vault = setupVault();
    setupMarket();
    fundSbtc(deployer, SBTC_20K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_20K)], deployer);

    const stage: Intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 1000,
      expiry: 0,
    };
    const stageHash = buildIntentHash(vault, stage);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(stageHash, DEPLOYER_PRIVKEY), stage),
        deployer,
      ).result,
    ).toBeOk(Cl.bufferFromHex(stageHash));
    expect(ro(MARKET, "get-token-x-limit", [Cl.principal(vault)])).toBeUint(
      DEAD_X,
    );
    const sbtcBefore = sbtcBalance(vault);
    expect(sbtcBefore).toBe(SBTC_20K - SBTC_10K);

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X - 1,
      authId: 1001,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    const args = jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice);
    expect(pub(vault, "execute-jing-reprice", args, deployer).result).toBeOk(
      Cl.bufferFromHex(repriceHash),
    );

    // Limit moved, deposit untouched, no assets left the vault.
    expect(ro(MARKET, "get-token-x-limit", [Cl.principal(vault)])).toBeUint(
      DEAD_X - 1,
    );
    expect(
      ro(MARKET, "get-token-x-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(SBTC_10K);
    expect(sbtcBalance(vault)).toBe(sbtcBefore);

    // Replay of the same intent is rejected.
    expect(pub(vault, "execute-jing-reprice", args, deployer).result).toBeErr(
      Cl.uint(6003),
    );
  });

  it("execute-jing-reprice (STX side): dead-to-dead limit move on a one-sided book", function () {
    const vault = setupVault();
    setupMarket();
    pub(vault, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const stage: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 1010,
      expiry: 0,
    };
    const stageHash = buildIntentHash(vault, stage);
    expect(
      pub(
        vault,
        "execute-jing-deposit",
        jingArgs(signRsv(stageHash, DEPLOYER_PRIVKEY), stage),
        deployer,
      ).result,
    ).toBeOk(Cl.bufferFromHex(stageHash));

    const stxBefore = Number(
      cvToJSON(ro(vault, "get-status", [])).value["stx-balance"].value,
    );

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y + 1,
      authId: 1011,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeOk(Cl.bufferFromHex(repriceHash));

    expect(ro(MARKET, "get-token-y-limit", [Cl.principal(vault)])).toBeUint(
      DEAD_Y + 1,
    );
    expect(
      ro(MARKET, "get-token-y-deposit", [Cl.uint(0), Cl.principal(vault)]),
    ).toBeUint(STX_100);
    expect(
      Number(cvToJSON(ro(vault, "get-status", [])).value["stx-balance"].value),
    ).toBe(stxBefore);
  });

  it("execute-jing-reprice: ERR_AMOUNT_MISMATCH when the signed amount is not the resting size", function () {
    const vault = setupVault();
    setupMarket();
    fundSbtc(deployer, SBTC_20K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_20K)], deployer);

    const stage: Intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 1020,
      expiry: 0,
    };
    const stageHash = buildIntentHash(vault, stage);
    pub(
      vault,
      "execute-jing-deposit",
      jingArgs(signRsv(stageHash, DEPLOYER_PRIVKEY), stage),
      deployer,
    );

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: SBTC_10K + 1, // stale: resting size is SBTC_10K
      limitPrice: DEAD_X - 1,
      authId: 1021,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6022));

    // A mismatch is rejected before verify-and-consume, so the hash stays
    // unused and the owner can re-sign against the true size.
    expect(
      ro(vault, "is-signature-used", [Cl.bufferFromHex(repriceHash)]),
    ).toBeBool(false);
  });

  it("execute-jing-reprice: ERR_AMOUNT_MISMATCH when nothing rests on the side", function () {
    const vault = setupVault();
    setupMarket();

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 1030,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6022));
  });

  it("execute-jing-reprice: ERR_NO_FUNDS on a zero amount", function () {
    const vault = setupVault();
    setupMarket();

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: 0,
      limitPrice: DEAD_X,
      authId: 1040,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6006));
  });

  it("execute-jing-reprice: ERR_INVALID_PRICE on zero limit-price", function () {
    const vault = setupVault();
    setupMarket();

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 0,
      authId: 1050,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-jing-reprice: ERR_INVALID_SIDE on bad side string", function () {
    const vault = setupVault();
    setupMarket();

    const reprice: Intent = {
      action: "jing-reprice",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 1060,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(vault, reprice);
    expect(
      pub(
        vault,
        "execute-jing-reprice",
        jingArgs(signRsv(repriceHash, DEPLOYER_PRIVKEY), reprice),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  // --- execute-jing-swap: deterministic error modes ---
  it("execute-jing-swap: ERR_INVALID_PRICE on zero limit-price", function () {
    const vault = setupVault();
    setupMarket();

    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 0,
      authId: 2000,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-swap",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-jing-swap: ERR_INVALID_SIDE on bad side string", function () {
    const vault = setupVault();
    setupMarket();

    const intent: Intent = {
      action: "jing-swap",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 2010,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-swap",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  it("execute-jing-swap: ERR_INVALID_SIGNATURE when signed by wrong key", function () {
    const vault = setupVault();
    setupMarket();

    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 2020,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-swap",
        jingArgs(signRsv(msgHash, WALLET1_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6002));
  });

  it("execute-jing-swap: ERR_NOT_OWNER when the caller is neither owner nor keeper", function () {
    const vault = setupVault();
    setupMarket();

    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 2030,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-jing-swap",
        jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6001));
  });

  // --- execute-bitflow-swap (xyk-core sBTC/STX pool) ---
  it("execute-bitflow-swap (sBTC -> STX via xyk-core)", function () {
    const vault = setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent: Intent = {
      action: "bitflow-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 600,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const args = ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent);

    let r;
    try {
      r = pub(vault, "execute-bitflow-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] bitflow sBTC->STX: threw -",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log(
        "[v3-vault-stx-v2] bitflow sBTC->STX: errored - VM bug or pool",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-bitflow-swap (STX -> sBTC via xyk-core)", function () {
    const vault = setupVault();
    pub(vault, "deposit-stx", [Cl.uint(STX_100)], deployer);

    const intent: Intent = {
      action: "bitflow-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 999_999_999_999_999,
      authId: 700,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const args = ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent);

    let r;
    try {
      r = pub(vault, "execute-bitflow-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] bitflow STX->sBTC: threw -",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log(
        "[v3-vault-stx-v2] bitflow STX->sBTC: errored - VM bug or pool",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-bitflow-swap: ERR_INVALID_PRICE on zero limit-price (sbtc side)", function () {
    const vault = setupVault();

    const intent: Intent = {
      action: "bitflow-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 0,
      authId: 800,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-bitflow-swap",
        ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-bitflow-swap: ERR_INVALID_PRICE on zero limit-price (wstx side - assert-before-let)", function () {
    const vault = setupVault();

    const intent: Intent = {
      action: "bitflow-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 0,
      authId: 1150,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-bitflow-swap",
        ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-bitflow-swap: ERR_INVALID_SIDE on bad side string", function () {
    const vault = setupVault();

    const intent: Intent = {
      action: "bitflow-swap",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: 5_000_000_000_000,
      authId: 850,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-bitflow-swap",
        ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  it("execute-dlmm-swap: ERR_INVALID_SIDE on bad side string", function () {
    const vault = setupVault();

    const intent: Intent = {
      action: "dlmm-swap",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: 5_000_000_000_000,
      authId: 855,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-dlmm-swap",
        ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  // --- execute-dlmm-swap (DLMM stx-sbtc pool, layout x=wstx y=sBTC) ---
  it("execute-dlmm-swap (STX -> sBTC via DLMM router)", function () {
    const vault = setupVault();
    pub(vault, "deposit-stx", [Cl.uint(STX_100)], deployer);

    const intent: Intent = {
      action: "dlmm-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 999_999_999_999_999,
      authId: 900,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const args = ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent);

    let r;
    try {
      r = pub(vault, "execute-dlmm-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] dlmm STX->sBTC: threw -",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx-v2] dlmm STX->sBTC: errored - VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap (sBTC -> STX via DLMM router)", function () {
    const vault = setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(vault, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent: Intent = {
      action: "dlmm-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 1000,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    const args = ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent);

    let r;
    try {
      r = pub(vault, "execute-dlmm-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] dlmm sBTC->STX: threw -",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx-v2] dlmm sBTC->STX: errored - VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap: ERR_INVALID_PRICE on zero limit-price (wstx side - assert-before-let)", function () {
    const vault = setupVault();

    const intent: Intent = {
      action: "dlmm-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 0,
      authId: 1100,
      expiry: 0,
    };
    const msgHash = buildIntentHash(vault, intent);
    expect(
      pub(
        vault,
        "execute-dlmm-swap",
        ammArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent),
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  // --- Distinct-action hash separator ---
  it("intent hashes are distinct across all five actions", function () {
    const base = {
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 5_000_000_000_000,
      authId: 9999,
      expiry: 0,
    };
    const hashes = [
      "jing-deposit",
      "jing-swap",
      "jing-reprice",
      "bitflow-swap",
      "dlmm-swap",
    ].map((action) => buildIntentHash(VAULT, { ...base, action }));
    expect(new Set(hashes).size).toBe(hashes.length);
  });


  // ==========================================================================
  // Hermes-gated: the taker paths. These need a live oracle payload plus live
  // resting size on the opposite book, so they skip when Hermes is
  // unreachable. Staging is batched into one block to stay inside the
  // market's 80-second MAX_STALENESS window (see vaultSetupTxs).
  // ==========================================================================

  it("execute-jing-swap (sBTC taker): FOK fill against a resting STX bid", async function () {
    const vaaHex = await fetchVaa("jing-swap-x");
    if (!vaaHex) return;

    const staged = simnet.mineBlock([
      ...vaultSetupTxs(),
      ...marketSetupTxs(),
      fundSbtcTx(deployer, SBTC_10K),
      tx.callPublicFn(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer),
      // Maker rests 100 STX live; the x book is empty so a dummy VAA suffices.
      tx.callPublicFn(
        MARKET,
        "deposit-token-y",
        [
          Cl.uint(STX_100),
          Cl.uint(LIVE_Y),
          Cl.bufferFromHex(DUMMY_VAA),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet1,
      ),
      warmPythTx(vaaHex, wallet2),
    ]);
    if (!allOk(staged, "jing-swap-x")) return;

    const preCycle = Number(cvToJSON(ro(MARKET, "get-current-cycle", [])).value);
    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 3000,
      expiry: 0,
    };
    const msgHash = buildIntentHash(VAULT, intent);
    const args = jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent, vaaHex);

    let r;
    try {
      r = pub(VAULT, "execute-jing-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] jing-swap-x: threw -",
        (e as Error).message,
      );
      return;
    }
    if (isStale(r.result)) {
      console.log("[v3-vault-stx-v2] jing-swap-x: skipped - VAA aged out");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
    // Fully filled: sBTC left the vault, STX came back, cycle advanced.
    expect(sbtcBalance(VAULT)).toBe(0);
    expect(
      Number(cvToJSON(ro(VAULT, "get-status", [])).value["stx-balance"].value),
    ).toBeGreaterThan(0);
    expect(ro(MARKET, "get-current-cycle", [])).toBeUint(preCycle + 1);
    console.log(
      `[v3-vault-stx-v2] jing-swap-x: cycle ${preCycle} FOK-filled by the vault`,
    );
  });

  it("execute-jing-swap (STX taker): FOK fill against a resting sBTC offer", async function () {
    const vaaHex = await fetchVaa("jing-swap-y");
    if (!vaaHex) return;

    const staged = simnet.mineBlock([
      ...vaultSetupTxs(),
      ...marketSetupTxs(),
      tx.callPublicFn(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer),
      fundSbtcTx(wallet2, SBTC_10K),
      tx.callPublicFn(
        MARKET,
        "deposit-token-x",
        [
          Cl.uint(SBTC_10K),
          Cl.uint(LIVE_X),
          Cl.bufferFromHex(DUMMY_VAA),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet2,
      ),
      warmPythTx(vaaHex, wallet1),
    ]);
    if (!allOk(staged, "jing-swap-y")) return;

    const preCycle = Number(cvToJSON(ro(MARKET, "get-current-cycle", [])).value);
    const sbtcBefore = sbtcBalance(VAULT);

    // 10 STX against ~10k sats of live offer: the taker side binds and fills.
    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_WSTX,
      amount: STX_10,
      limitPrice: LIVE_Y,
      authId: 3010,
      expiry: 0,
    };
    const msgHash = buildIntentHash(VAULT, intent);
    const args = jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent, vaaHex);

    let r;
    try {
      r = pub(VAULT, "execute-jing-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] jing-swap-y: threw -",
        (e as Error).message,
      );
      return;
    }
    if (isStale(r.result)) {
      console.log("[v3-vault-stx-v2] jing-swap-y: skipped - VAA aged out");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
    expect(sbtcBalance(VAULT)).toBeGreaterThan(sbtcBefore);
    expect(ro(MARKET, "get-current-cycle", [])).toBeUint(preCycle + 1);
    console.log(
      `[v3-vault-stx-v2] jing-swap-y: cycle ${preCycle} FOK-filled by the vault`,
    );
  });

  it("execute-jing-reprice: crossing limit turns the resting sBTC offer taker", async function () {
    const vaaHex = await fetchVaa("jing-reprice-cross");
    if (!vaaHex) return;

    const stage: Intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: DEAD_X,
      authId: 3020,
      expiry: 0,
    };
    const stageHash = buildIntentHash(VAULT, stage);

    const staged = simnet.mineBlock([
      ...vaultSetupTxs(),
      ...marketSetupTxs(),
      fundSbtcTx(deployer, SBTC_20K),
      tx.callPublicFn(VAULT, "deposit-sbtc", [Cl.uint(SBTC_20K)], deployer),
      // Vault rests a dead offer first (y book empty -> dummy VAA).
      tx.callPublicFn(
        VAULT,
        "execute-jing-deposit",
        jingArgs(signRsv(stageHash, DEPLOYER_PRIVKEY), stage),
        deployer,
      ),
      // Maker bid on y. The x book holds only the vault's dead offer, so this
      // does not cross and the gate lets it through (real VAA required now).
      tx.callPublicFn(
        MARKET,
        "deposit-token-y",
        [
          Cl.uint(STX_100),
          Cl.uint(LIVE_Y),
          Cl.bufferFromHex(vaaHex),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet1,
      ),
    ]);
    if (!allOk(staged, "jing-reprice-cross")) return;

    const sbtcBefore = sbtcBalance(VAULT);
    const preCycle = Number(cvToJSON(ro(MARKET, "get-current-cycle", [])).value);

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 3021,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(VAULT, reprice);
    const args = jingArgs(
      signRsv(repriceHash, DEPLOYER_PRIVKEY),
      reprice,
      vaaHex,
    );

    let r;
    try {
      r = pub(VAULT, "execute-jing-reprice", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] jing-reprice-cross: threw -",
        (e as Error).message,
      );
      return;
    }
    if (isStale(r.result)) {
      console.log(
        "[v3-vault-stx-v2] jing-reprice-cross: skipped - VAA aged out",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(repriceHash));

    // The crossing path pulls exactly the taker rebate out of the vault on
    // top of the resting size, and the fill returns STX.
    const rebate = Math.floor((SBTC_10K * TAKER_REBATE_BPS) / BPS_PRECISION);
    expect(sbtcBalance(VAULT)).toBe(sbtcBefore - rebate);
    expect(ro(MARKET, "get-current-cycle", [])).toBeUint(preCycle + 1);
    console.log(
      `[v3-vault-stx-v2] jing-reprice-cross: took through, rebate ${rebate} sats`,
    );
  });

  it("execute-jing-reprice: crossing limit turns the resting STX bid taker", async function () {
    const vaaHex = await fetchVaa("jing-reprice-cross-y");
    if (!vaaHex) return;

    const stage: Intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: DEAD_Y,
      authId: 3030,
      expiry: 0,
    };
    const stageHash = buildIntentHash(VAULT, stage);

    const staged = simnet.mineBlock([
      ...vaultSetupTxs(),
      ...marketSetupTxs(),
      // Rebate plus the Pyth fee budget must stay free in the vault after the
      // resting deposit moves to the market.
      tx.callPublicFn(VAULT, "deposit-stx", [Cl.uint(STX_100 * 2)], deployer),
      // Vault rests a dead bid first (x book empty -> dummy VAA).
      tx.callPublicFn(
        VAULT,
        "execute-jing-deposit",
        jingArgs(signRsv(stageHash, DEPLOYER_PRIVKEY), stage),
        deployer,
      ),
      // Maker offer on x, sized well past the vault's ~18.5k-sat bid value so
      // the vault's crossing y side fills 100% (reprice-or-swap is
      // fill-or-kill for the crossing side; the resting x side may roll).
      // The y book holds only the vault's dead bid, so this deposit does not
      // cross and the gate lets it through (real VAA required now).
      fundSbtcTx(wallet1, SBTC_20K * 3),
      tx.callPublicFn(
        MARKET,
        "deposit-token-x",
        [
          Cl.uint(SBTC_20K * 3),
          Cl.uint(LIVE_X),
          Cl.bufferFromHex(vaaHex),
          SBTC_TRAIT,
          Cl.stringAscii(SBTC_ASSET),
        ],
        wallet1,
      ),
    ]);
    if (!allOk(staged, "jing-reprice-cross-y")) return;

    const sbtcBefore = sbtcBalance(VAULT);
    const stxBefore = Number(
      cvToJSON(ro(VAULT, "get-status", [])).value["stx-balance"].value,
    );
    const preCycle = Number(cvToJSON(ro(MARKET, "get-current-cycle", [])).value);

    const reprice: Intent = {
      action: "jing-reprice",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: LIVE_Y,
      authId: 3031,
      expiry: 0,
    };
    const repriceHash = buildIntentHash(VAULT, reprice);
    const args = jingArgs(
      signRsv(repriceHash, DEPLOYER_PRIVKEY),
      reprice,
      vaaHex,
    );

    let r;
    try {
      r = pub(VAULT, "execute-jing-reprice", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] jing-reprice-cross-y: threw -",
        (e as Error).message,
      );
      return;
    }
    if (isStale(r.result)) {
      console.log(
        "[v3-vault-stx-v2] jing-reprice-cross-y: skipped - VAA aged out",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(repriceHash));

    // The crossing path pulls at most the taker rebate (plus the oracle fee)
    // out of the vault's STX on top of the resting size, and the fill returns
    // sBTC to the vault.
    const rebate = Math.floor((STX_100 * TAKER_REBATE_BPS) / BPS_PRECISION);
    const stxAfter = Number(
      cvToJSON(ro(VAULT, "get-status", [])).value["stx-balance"].value,
    );
    expect(stxBefore - stxAfter).toBeGreaterThanOrEqual(rebate);
    expect(sbtcBalance(VAULT)).toBeGreaterThan(sbtcBefore);
    expect(ro(MARKET, "get-current-cycle", [])).toBeUint(preCycle + 1);
    console.log(
      `[v3-vault-stx-v2] jing-reprice-cross-y: took through, rebate ${rebate} uSTX`,
    );
  });

  // --------------------------------------------------------------------------
  // SUSPECTED CONTRACT BUG - left failing on purpose.
  //
  // Every gated market entry point the vault calls (swap -> settle-with-refresh,
  // deposit-token-* -> fresh-classification-price, reprice-or-swap-token-*)
  // routes through pyth-oracle-v4 verify-and-update-price-feeds, which charges
  // an STX update fee to tx-sender:
  //
  //   (if (> fee-amount u0)
  //     (unwrap! (stx-transfer? fee-amount tx-sender (get address fee-info))
  //              ERR_BALANCE_INSUFFICIENT)  ;; (err u3001)
  //     true)
  //
  // fee-amount = (number of feeds actually updated) * mantissa * 10^exponent.
  // Mainnet pyth-governance-v3 get-fee-info is currently
  // { mantissa: u1, exponent: u0 } -> 1 uSTX per updated feed, so 2 uSTX for
  // this market's two-feed bundle.
  //
  // Inside the vault that transfer runs under `as-contract?`, so tx-sender is
  // the vault and the fee comes out of vault STX under the vault's allowance.
  // Observed on the mainnet fork:
  //   - side "sbtc-token", vault holding STX: allowance is (with-ft SBTC ...)
  //     only, with no with-stx entry at all -> (err u128), the as-contract?
  //     allowance violation. This is what this test asserts against.
  //   - side "sbtc-token", vault holding no STX: stx-transfer? fails on the
  //     balance first and Pyth maps it to ERR_BALANCE_INSUFFICIENT -> u3001.
  //   - side "wstx": allowance is (with-stx amount) and the market pulls
  //     exactly `amount` (rebate + net deposit), leaving zero headroom ->
  //     (err u0), the "allowance amount exceeded" variant.
  // Either way the whole vault call reverts.
  //
  // It only stays hidden when somebody else refreshed the same feeds earlier in
  // the same block-or-earlier, which makes fee-amount zero - the situation the
  // warmPythTx staging above manufactures. A vault that is first to submit its
  // own VAA cannot execute at all.
  //
  // Suggested fix: widen the allowances to include a small with-stx budget for
  // the oracle fee (and, on the wstx side, `amount` plus that budget).
  // --------------------------------------------------------------------------
  it("execute-jing-swap: pays the Pyth refresh fee out of the vault (no warm)", async function () {
    const vaaHex = await fetchVaa("jing-swap-pythfee");
    if (!vaaHex) return;

    const staged = simnet.mineBlock([
      ...vaultSetupTxs(),
      ...marketSetupTxs(),
      fundSbtcTx(deployer, SBTC_10K),
      tx.callPublicFn(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer),
      // Plenty of spare STX in the vault: the failure is the allowance, not
      // the balance.
      tx.callPublicFn(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer),
      tx.callPublicFn(
        MARKET,
        "deposit-token-y",
        [
          Cl.uint(STX_100),
          Cl.uint(LIVE_Y),
          Cl.bufferFromHex(DUMMY_VAA),
          WSTX_TRAIT,
          Cl.stringAscii(WSTX_ASSET),
        ],
        wallet1,
      ),
    ]);
    if (!allOk(staged, "jing-swap-pythfee")) return;

    const intent: Intent = {
      action: "jing-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: LIVE_X,
      authId: 3030,
      expiry: 0,
    };
    const msgHash = buildIntentHash(VAULT, intent);
    const args = jingArgs(signRsv(msgHash, DEPLOYER_PRIVKEY), intent, vaaHex);

    let r;
    try {
      r = pub(VAULT, "execute-jing-swap", args, deployer);
    } catch (e) {
      console.log(
        "[v3-vault-stx-v2] jing-swap-pythfee: threw -",
        (e as Error).message,
      );
      return;
    }
    if (isStale(r.result)) {
      console.log(
        "[v3-vault-stx-v2] jing-swap-pythfee: skipped - VAA aged out",
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log(
        "[v3-vault-stx-v2] jing-swap-pythfee: reverted with",
        Cl.prettyPrint(r.result),
        "- see the comment above this test",
      );
    }
    // The vault should be able to take on the Jing market without an EOA
    // pre-paying the oracle refresh for it.
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });
});
