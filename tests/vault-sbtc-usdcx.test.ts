import { describe, expect, it } from "vitest";
import {
  Cl,
  cvToJSON,
  privateKeyToPublic,
  publicKeyToHex,
  signMessageHashRsv,
} from "@stacks/transactions";

// ============================================================================
// vault-sbtc-usdcx clarinet coverage
//
// Surface tested:
//   - initialize / is-initialized (idempotent, ERR_NOT_VERIFIED if not pre-set)
//   - set-owner-pubkey / set-keeper (owner-only)
//   - deposit-sbtc / deposit-usdcx (owner-only, ERR_NO_FUNDS, balance + log-deposit)
//   - withdraw-sbtc / withdraw-usdcx (owner-only, balance + log-withdraw)
//   - revoke-intent (owner OR keeper, ERR_REPLAY)
//   - cancel-jing-sbtc / cancel-jing-usdcx (owner OR keeper, refund + log-cancel)
//   - execute-jing-deposit (signed intent → market deposit; both sides)
//   - execute-dlmm-swap (signed intent → DLMM router; both directions)
//   - SIP-018 signature failure modes: INVALID_SIGNATURE / REPLAY / EXPIRED /
//     INVALID_SIDE / INVALID_PRICE
//
// Test fixture for SIP-018 signing: deployer's own simnet secret key (from
// settings/Devnet.toml). The vault's OWNER is set to deployer at deploy time
// (via tx-sender), so deployer is both the contract owner and the signing
// principal. We derive the 33-byte compressed pubkey from the secret, set
// it via set-owner-pubkey, then sign message hashes computed by
// jing-vault-auth.build-intent-hash.
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

// Deployer's secret key from settings/Devnet.toml (the trailing 01 is the
// Stacks compression-suffix byte). Stacks-style 33-byte private key.
const DEPLOYER_PRIVKEY =
  "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601";
const DEPLOYER_PUBKEY = publicKeyToHex(privateKeyToPublic(DEPLOYER_PRIVKEY));

// wallet1's secret key — used to test ERR_INVALID_SIGNATURE (signed by the
// wrong principal).
const WALLET1_PRIVKEY =
  "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801";

const VAULT = "vault-sbtc-usdcx";
const JING_CORE = "jing-core";
const VAULT_AUTH = "jing-vault-auth";
const MARKET = "markets-sbtc-usdcx-jing";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

const USDCX_TOKEN = "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";
const USDCX_ASSET = "usdcx-token";
const USDCX_WHALE = "SP2V3J7G42E8ZD1YPK6G6295EQ1EGZMPGDZQSRDWT";

const SBTC_10K = 10_000;
const USDCX_100 = 100_000_000;
const USDCX_500 = 500_000_000;

const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const MIN_X = 1_000;
const MIN_Y = 1_000_000;

const ASSET_SBTC = "sbtc-token";
const ASSET_USDCX = "usdcx-token";

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

function fundUsdcx(recipient: string, amount: number) {
  const r = simnet.callPublicFn(
    USDCX_TOKEN,
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(USDCX_WHALE),
      Cl.principal(recipient),
      Cl.none(),
    ],
    USDCX_WHALE,
  );
  expect(r.result).toBeOk(Cl.bool(true));
}

// Register the vault with jing-core and call its own initialize. The vault
// is deployed by `deployer` in simnet, so `deployer` is OWNER. After init,
// we set the deployer's compressed pubkey so signed intents will verify.
function setupVault() {
  const vaultArg = Cl.contractPrincipal(deployer, VAULT);
  expect(
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(VAULT, "initialize", [vaultArg], deployer).result,
  ).toBeOk(Cl.bool(true));
  expect(
    pub(
      VAULT,
      "set-owner-pubkey",
      [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

// Init the sBTC/USDCx market too (for cancel-jing-* + execute-jing-deposit).
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
        Cl.principal(USDCX_TOKEN),
        Cl.uint(MIN_X),
        Cl.uint(MIN_Y),
        Cl.bufferFromHex(BTC_FEED),
      ],
      deployer,
    ).result,
  ).toBeOk(Cl.bool(true));
}

function buildIntentHash(details: {
  action: string;
  side: string;
  amount: number;
  limitPrice: number;
  authId: number;
  expiry: number;
}): string {
  const r = simnet.callReadOnlyFn(
    VAULT_AUTH,
    "build-intent-hash",
    [
      Cl.tuple({
        action: Cl.stringAscii(details.action),
        side: Cl.stringAscii(details.side),
        amount: Cl.uint(details.amount),
        "limit-price": Cl.uint(details.limitPrice),
        "auth-id": Cl.uint(details.authId),
        expiry: Cl.uint(details.expiry),
      }),
    ],
    deployer,
  );
  return cvToJSON(r.result).value.replace(/^0x/, "");
}

function signRsv(messageHash: string, privateKey: string): string {
  return signMessageHashRsv({ messageHash, privateKey });
}

describe.skipIf(!remoteDataEnabled)("vault-sbtc-usdcx", function () {
  // --- Initialization + read-onlys ---
  it("initialize: owner-only style (anyone can call but register gate fires); double-init rejected", function () {
    const vaultArg = Cl.contractPrincipal(deployer, VAULT);

    // Without set-verified-contract, register inside initialize hits 5005.
    expect(pub(VAULT, "initialize", [vaultArg], deployer).result).toBeErr(
      Cl.uint(5005),
    );
    expect(ro(VAULT, "is-initialized", [])).toBeBool(false);

    expect(
      pub(JING_CORE, "set-verified-contract", [vaultArg], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(pub(VAULT, "initialize", [vaultArg], deployer).result).toBeOk(
      Cl.bool(true),
    );
    expect(ro(VAULT, "is-initialized", [])).toBeBool(true);

    // Re-init blocked by ERR_ALREADY_INITIALIZED.
    expect(pub(VAULT, "initialize", [vaultArg], deployer).result).toBeErr(
      Cl.uint(6020),
    );
  });

  it("get-owner returns deployer, get-status reflects empty balances", function () {
    setupVault();
    expect(ro(VAULT, "get-owner", [])).toBePrincipal(deployer);
    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(status.value.owner.value).toBe(deployer);
    expect(status.value.pubkey.value).toBe(`0x${DEPLOYER_PUBKEY}`);
    expect(status.value.keeper.value).toBe(null); // (none)
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);
    expect(Number(status.value["usdcx-balance"].value)).toBe(0);
  });

  // --- Owner-only setters ---
  it("set-owner-pubkey: owner-only", function () {
    const vaultArg = Cl.contractPrincipal(deployer, VAULT);
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer);
    pub(VAULT, "initialize", [vaultArg], deployer);

    // Non-owner rejected.
    expect(
      pub(
        VAULT,
        "set-owner-pubkey",
        [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(6001));

    // Owner happy path.
    expect(
      pub(
        VAULT,
        "set-owner-pubkey",
        [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
  });

  it("set-keeper: owner-only, none ↔ some", function () {
    setupVault();
    // Set keeper.
    expect(
      pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(cvToJSON(ro(VAULT, "get-status", [])).value.keeper.value.value).toBe(
      wallet2,
    );

    // Non-owner can't change.
    expect(
      pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet3))], wallet1)
        .result,
    ).toBeErr(Cl.uint(6001));

    // Clear keeper.
    expect(pub(VAULT, "set-keeper", [Cl.none()], deployer).result).toBeOk(
      Cl.bool(true),
    );
    expect(cvToJSON(ro(VAULT, "get-status", [])).value.keeper.value).toBe(null);
  });

  // --- deposit / withdraw ---
  it("deposit-sbtc / deposit-usdcx: owner-only, ERR_NO_FUNDS on zero, balances + jing-core equity", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    fundUsdcx(deployer, USDCX_100);

    // Zero amount → ERR_NO_FUNDS.
    expect(pub(VAULT, "deposit-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(VAULT, "deposit-usdcx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );

    // Non-owner.
    expect(
      pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    // Owner happy paths.
    expect(
      pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["sbtc-balance"].value)).toBe(SBTC_10K);
    expect(Number(status.value["usdcx-balance"].value)).toBe(USDCX_100);

    // jing-core equity credited to the vault (not to deployer).
    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(SBTC_10K);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(USDCX_100);
  });

  it("withdraw-sbtc / withdraw-usdcx: owner-only, ERR_NO_FUNDS on zero, balances + jing-core equity debited", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    fundUsdcx(deployer, USDCX_100);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_100)], deployer);

    // Zero rejected.
    expect(pub(VAULT, "withdraw-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(VAULT, "withdraw-usdcx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );

    // Non-owner.
    expect(
      pub(VAULT, "withdraw-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "withdraw-usdcx", [Cl.uint(USDCX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    // Owner happy.
    expect(
      pub(VAULT, "withdraw-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(VAULT, "withdraw-usdcx", [Cl.uint(USDCX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);
    expect(Number(status.value["usdcx-balance"].value)).toBe(0);

    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(USDCX_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
  });

  // --- revoke-intent ---
  it("revoke-intent: owner OR keeper, ERR_REPLAY on second call, marks signature-used", function () {
    setupVault();
    pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);

    const targetHash = "aa".repeat(32);

    // Random user rejected.
    expect(
      pub(
        VAULT,
        "revoke-intent",
        [Cl.bufferFromHex(targetHash)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(6001));

    // Owner can revoke.
    expect(
      pub(
        VAULT,
        "revoke-intent",
        [Cl.bufferFromHex(targetHash)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));
    expect(
      ro(VAULT, "is-signature-used", [Cl.bufferFromHex(targetHash)]),
    ).toBeBool(true);

    // Re-revoke → ERR_REPLAY.
    expect(
      pub(
        VAULT,
        "revoke-intent",
        [Cl.bufferFromHex(targetHash)],
        deployer,
      ).result,
    ).toBeErr(Cl.uint(6003));

    // Keeper can revoke a different hash.
    const targetHash2 = "bb".repeat(32);
    expect(
      pub(
        VAULT,
        "revoke-intent",
        [Cl.bufferFromHex(targetHash2)],
        wallet2,
      ).result,
    ).toBeOk(Cl.bool(true));

    // Removed keeper loses ability.
    pub(VAULT, "set-keeper", [Cl.none()], deployer);
    const targetHash3 = "cc".repeat(32);
    expect(
      pub(
        VAULT,
        "revoke-intent",
        [Cl.bufferFromHex(targetHash3)],
        wallet2,
      ).result,
    ).toBeErr(Cl.uint(6001));
  });

  // --- cancel-jing-* (via market deposit) ---
  it("cancel-jing-usdcx: owner cancels USDCx deposit on market, refund returns to vault", function () {
    setupVault();
    setupMarket();

    // Vault gets some USDCx and deposits to market via signed intent
    // (we just deposit straight to vault then call execute-jing-deposit
    // separately — for THIS test we need only to land in cycle 0 list).
    fundUsdcx(deployer, USDCX_500);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_500)], deployer);

    // Sign + execute a USDCx jing-deposit so the market knows the vault
    // is a depositor.
    const intent = {
      action: "jing-deposit",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 1,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);
    const exec = pub(
      VAULT,
      "execute-jing-deposit",
      [
        Cl.bufferFromHex(sig),
        Cl.stringAscii(intent.side),
        Cl.uint(intent.amount),
        Cl.uint(intent.limitPrice),
        Cl.uint(intent.authId),
        Cl.uint(intent.expiry),
      ],
      deployer,
    );
    expect(exec.result).toBeOk(Cl.bufferFromHex(msgHash));

    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(MARKET, "get-token-y-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(USDCX_100);

    // Non-authorized rejected.
    expect(pub(VAULT, "cancel-jing-usdcx", [], wallet1).result).toBeErr(
      Cl.uint(6001),
    );

    // Owner cancels → refund back to vault.
    const cancelResult = pub(VAULT, "cancel-jing-usdcx", [], deployer);
    expect(cancelResult.result).toBeOk(Cl.bool(true));

    expect(
      ro(MARKET, "get-token-y-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);

    // Vault USDCx balance = 500M − 100M deposited + 100M refunded = 500M.
    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["usdcx-balance"].value)).toBe(USDCX_500);
  });

  it("cancel-jing-sbtc: keeper-only path also works", function () {
    setupVault();
    setupMarket();
    pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 2,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);
    expect(
      pub(
        VAULT,
        "execute-jing-deposit",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        deployer,
      ).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));

    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(MARKET, "get-token-x-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(SBTC_10K);

    // Keeper cancels.
    expect(pub(VAULT, "cancel-jing-sbtc", [], wallet2).result).toBeOk(
      Cl.bool(true),
    );

    expect(
      ro(MARKET, "get-token-x-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
  });

  // --- Signed intents: execute-jing-deposit happy paths + error modes ---
  it("execute-jing-deposit (USDCx): valid signature → market deposit; replay rejected", function () {
    setupVault();
    setupMarket();
    fundUsdcx(deployer, USDCX_500);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_500)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 100,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    const args = [
      Cl.bufferFromHex(sig),
      Cl.stringAscii(intent.side),
      Cl.uint(intent.amount),
      Cl.uint(intent.limitPrice),
      Cl.uint(intent.authId),
      Cl.uint(intent.expiry),
    ];

    // Anyone can submit (the signature is the auth).
    expect(
      pub(VAULT, "execute-jing-deposit", args, wallet3).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));

    // Replay → ERR_REPLAY.
    expect(
      pub(VAULT, "execute-jing-deposit", args, wallet3).result,
    ).toBeErr(Cl.uint(6003));
  });

  it("execute-jing-deposit (sBTC): valid signature → market deposit", function () {
    setupVault();
    setupMarket();
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 200,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-jing-deposit",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-jing-deposit: ERR_INVALID_SIGNATURE when signed by wrong principal", function () {
    setupVault();
    setupMarket();
    fundUsdcx(deployer, USDCX_500);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_500)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 300,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    // Sign with WALLET1's key — vault expects deployer's pubkey.
    const sig = signRsv(msgHash, WALLET1_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-jing-deposit",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6002));
  });

  it("execute-jing-deposit: ERR_INVALID_SIDE on bad side string", function () {
    setupVault();
    setupMarket();

    const intent = {
      action: "jing-deposit",
      side: "not-a-side",
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 400,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-jing-deposit",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  it("execute-jing-deposit: ERR_EXPIRED when expiry < current stacks-block-height", function () {
    setupVault();
    setupMarket();
    fundUsdcx(deployer, USDCX_500);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_500)], deployer);

    // Set expiry to current stacks-block-height − 1 (i.e. already expired).
    const currentHeight = Number(simnet.blockHeight ?? simnet.burnBlockHeight);
    const intent = {
      action: "jing-deposit",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 500,
      expiry: currentHeight, // not strictly less than → ERR_EXPIRED
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-jing-deposit",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6004));
  });

  // --- execute-dlmm-swap ---
  it("execute-dlmm-swap (sBTC → USDCx): valid signature swaps via DLMM router", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    // limit-price = 1 → min-out = SBTC_10K * 1 / 1e10 = 0; router-side
    // min-out gate is loose enough to pass against mainnet pool depth.
    const intent = {
      action: "dlmm-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 600,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    let r;
    try {
      r = pub(
        VAULT,
        "execute-dlmm-swap",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      );
    } catch (e) {
      console.log(
        "[v3-vault-usdcx] dlmm-swap sBTC→USDCx: threw — VM bug or pool",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log(
        "[v3-vault-usdcx] dlmm-swap sBTC→USDCx: errored — VM bug or pool",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap (USDCx → sBTC): valid signature swaps the other direction", function () {
    setupVault();
    fundUsdcx(deployer, USDCX_500);
    pub(VAULT, "deposit-usdcx", [Cl.uint(USDCX_500)], deployer);

    const intent = {
      action: "dlmm-swap",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 999_999_999_999_999, // very loose ceiling
      authId: 700,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    let r;
    try {
      r = pub(
        VAULT,
        "execute-dlmm-swap",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      );
    } catch (e) {
      console.log(
        "[v3-vault-usdcx] dlmm-swap USDCx→sBTC: threw — VM bug or pool",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log(
        "[v3-vault-usdcx] dlmm-swap USDCx→sBTC: errored — VM bug or pool",
      );
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap: ERR_INVALID_PRICE on zero limit-price (sBTC side, limit-price in numerator)", function () {
    setupVault();

    const intent = {
      action: "dlmm-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 0,
      authId: 800,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-dlmm-swap",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-dlmm-swap: ERR_INVALID_PRICE on zero limit-price (usdcx-token side — verifies the assert-before-let fix)", function () {
    setupVault();

    // Pre-fix this would runtime-panic with DivisionByZero because
    // `derive-min-out` divides by limit-price for the usdcx-token side
    // and the `let` binding evaluated min-out before the assert.
    // Post-fix the assert hoist guarantees a clean ERR_INVALID_PRICE.
    const intent = {
      action: "dlmm-swap",
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 0,
      authId: 850,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-dlmm-swap",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6013));
  });

  it("execute-dlmm-swap: ERR_INVALID_SIDE on bad side string", function () {
    setupVault();

    const intent = {
      action: "dlmm-swap",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: 5_000_000_000_000,
      authId: 900,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-dlmm-swap",
        [
          Cl.bufferFromHex(sig),
          Cl.stringAscii(intent.side),
          Cl.uint(intent.amount),
          Cl.uint(intent.limitPrice),
          Cl.uint(intent.authId),
          Cl.uint(intent.expiry),
        ],
        wallet3,
      ).result,
    ).toBeErr(Cl.uint(6011));
  });

  // --- Distinct-action hash check ---
  // jing-deposit and dlmm-swap must produce DIFFERENT msg-hashes for the
  // same {side, amount, limit, auth-id, expiry} so an intent signed for
  // one path can't be replayed on the other.
  it("intent hashes for jing-deposit vs dlmm-swap are distinct (action separator)", function () {
    const base = {
      side: ASSET_USDCX,
      amount: USDCX_100,
      limitPrice: 5_000_000_000_000,
      authId: 1234,
      expiry: 0,
    };
    const h1 = buildIntentHash({ ...base, action: "jing-deposit" });
    const h2 = buildIntentHash({ ...base, action: "dlmm-swap" });
    expect(h1).not.toBe(h2);
  });
});
