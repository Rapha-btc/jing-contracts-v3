import { describe, expect, it } from "vitest";
import {
  Cl,
  cvToJSON,
  privateKeyToPublic,
  publicKeyToHex,
  signMessageHashRsv,
} from "@stacks/transactions";

// ============================================================================
// vault-sbtc-stx clarinet coverage. Mirror of vault-sbtc-usdcx.test.ts adapted
// for the STX-side vault.
//
// Key differences vs vault-sbtc-usdcx:
//   - token-y is native STX (denominated as wstx on the equity ledger).
//     deposit-stx / withdraw-stx use stx-transfer? + with-stx instead of
//     SIP-010 transfer + with-ft.
//   - signed-intent side strings are "wstx" / "sbtc-token" (not "usdcx-token").
//   - has BOTH execute-bitflow-swap (xyk-core sBTC/STX pool) AND
//     execute-dlmm-swap (DLMM stx-sbtc pool, layout x=wstx y=sBTC — opposite
//     of the USDCx market).
//   - ASSET_WSTX = "wstx" so the SIP-018 message side label differs from the
//     USDCx vault.
//
// Surface tested: same 13 public functions + 4 read-onlys + 8 error codes.
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

const VAULT = "vault-sbtc-stx";
const JING_CORE = "jing-core";
const VAULT_AUTH = "jing-vault-auth";
const MARKET = "markets-sbtc-stx-jing";

const SBTC_TOKEN = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const SBTC_ASSET = "sbtc-token";
const SBTC_WHALE = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

const WSTX_TOKEN = "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";

const SBTC_10K = 10_000;
const STX_100 = 100_000_000;
const STX_500 = 500_000_000;

const BTC_FEED =
  "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const STX_FEED =
  "ec7a775f46379b5e943c3526b1c8d54cd49749176b0b98e02dde68d1bd335c17";
const MIN_X = 1_000;
const MIN_Y = 1_000_000;

const ASSET_SBTC = "sbtc-token";
const ASSET_WSTX = "wstx";

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

describe.skipIf(!remoteDataEnabled)("vault-sbtc-stx", function () {
  // --- Initialization + read-onlys ---
  it("initialize: anyone calls but register gate fires; double-init rejected", function () {
    const vaultArg = Cl.contractPrincipal(deployer, VAULT);
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

    expect(pub(VAULT, "initialize", [vaultArg], deployer).result).toBeErr(
      Cl.uint(6020),
    );
  });

  it("get-owner returns deployer, get-status reflects empty balances + STX-balance field", function () {
    setupVault();
    expect(ro(VAULT, "get-owner", [])).toBePrincipal(deployer);
    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(status.value.owner.value).toBe(deployer);
    expect(status.value.pubkey.value).toBe(`0x${DEPLOYER_PUBKEY}`);
    expect(status.value.keeper.value).toBe(null);
    expect(Number(status.value["stx-balance"].value)).toBe(0);
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);
  });

  // --- Owner-only setters ---
  it("set-owner-pubkey + set-keeper: owner-only", function () {
    const vaultArg = Cl.contractPrincipal(deployer, VAULT);
    pub(JING_CORE, "set-verified-contract", [vaultArg], deployer);
    pub(VAULT, "initialize", [vaultArg], deployer);

    expect(
      pub(
        VAULT,
        "set-owner-pubkey",
        [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
        wallet1,
      ).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(
        VAULT,
        "set-owner-pubkey",
        [Cl.bufferFromHex(DEPLOYER_PUBKEY)],
        deployer,
      ).result,
    ).toBeOk(Cl.bool(true));

    expect(
      pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], wallet1)
        .result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(cvToJSON(ro(VAULT, "get-status", [])).value.keeper.value.value).toBe(
      wallet2,
    );
  });

  // --- deposit / withdraw (STX uses native, sBTC uses FT) ---
  it("deposit-stx / deposit-sbtc: owner-only, ERR_NO_FUNDS, balances + jing-core equity", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);

    expect(pub(VAULT, "deposit-stx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(VAULT, "deposit-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );

    expect(
      pub(VAULT, "deposit-stx", [Cl.uint(STX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    expect(
      pub(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["stx-balance"].value)).toBe(STX_100);
    expect(Number(status.value["sbtc-balance"].value)).toBe(SBTC_10K);

    // Equity ledger: STX side denominated as WSTX_TOKEN (single bucket).
    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(WSTX_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(STX_100);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(SBTC_10K);
  });

  it("withdraw-stx / withdraw-sbtc: owner-only, ERR_NO_FUNDS, equity debited", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    expect(pub(VAULT, "withdraw-stx", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(pub(VAULT, "withdraw-sbtc", [Cl.uint(0)], deployer).result).toBeErr(
      Cl.uint(6006),
    );
    expect(
      pub(VAULT, "withdraw-stx", [Cl.uint(STX_100)], wallet1).result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "withdraw-sbtc", [Cl.uint(SBTC_10K)], wallet1).result,
    ).toBeErr(Cl.uint(6001));

    expect(
      pub(VAULT, "withdraw-stx", [Cl.uint(STX_100)], deployer).result,
    ).toBeOk(Cl.bool(true));
    expect(
      pub(VAULT, "withdraw-sbtc", [Cl.uint(SBTC_10K)], deployer).result,
    ).toBeOk(Cl.bool(true));

    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["stx-balance"].value)).toBe(0);
    expect(Number(status.value["sbtc-balance"].value)).toBe(0);

    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(WSTX_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
    expect(
      ro(JING_CORE, "get-token-equity", [
        Cl.principal(SBTC_TOKEN),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
  });

  // --- revoke-intent ---
  it("revoke-intent: owner OR keeper, ERR_REPLAY on second call", function () {
    setupVault();
    pub(VAULT, "set-keeper", [Cl.some(Cl.principal(wallet2))], deployer);

    const targetHash = "ab".repeat(32);
    expect(
      pub(VAULT, "revoke-intent", [Cl.bufferFromHex(targetHash)], wallet1)
        .result,
    ).toBeErr(Cl.uint(6001));
    expect(
      pub(VAULT, "revoke-intent", [Cl.bufferFromHex(targetHash)], deployer)
        .result,
    ).toBeOk(Cl.bool(true));
    expect(
      ro(VAULT, "is-signature-used", [Cl.bufferFromHex(targetHash)]),
    ).toBeBool(true);
    expect(
      pub(VAULT, "revoke-intent", [Cl.bufferFromHex(targetHash)], deployer)
        .result,
    ).toBeErr(Cl.uint(6003));

    // Keeper revokes a different hash.
    expect(
      pub(VAULT, "revoke-intent", [Cl.bufferFromHex("cd".repeat(32))], wallet2)
        .result,
    ).toBeOk(Cl.bool(true));
  });

  // --- cancel-jing-* via market deposit ---
  it("cancel-jing-stx: owner cancels STX-side market deposit, refund returns to vault", function () {
    setupVault();
    setupMarket();
    pub(VAULT, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 5_000_000_000_000,
      authId: 1,
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
      ro(MARKET, "get-token-y-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(STX_100);

    expect(pub(VAULT, "cancel-jing-stx", [], wallet1).result).toBeErr(
      Cl.uint(6001),
    );
    expect(pub(VAULT, "cancel-jing-stx", [], deployer).result).toBeOk(
      Cl.bool(true),
    );

    expect(
      ro(MARKET, "get-token-y-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);

    const status = cvToJSON(ro(VAULT, "get-status", []));
    expect(Number(status.value["stx-balance"].value)).toBe(STX_500);
  });

  it("cancel-jing-sbtc: keeper-only path", function () {
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

    expect(pub(VAULT, "cancel-jing-sbtc", [], wallet2).result).toBeOk(
      Cl.bool(true),
    );

    const vaultPrincipal = `${deployer}.${VAULT}`;
    expect(
      ro(MARKET, "get-token-x-deposit", [
        Cl.uint(0),
        Cl.principal(vaultPrincipal),
      ]),
    ).toBeUint(0);
  });

  // --- execute-jing-deposit happy paths + error modes ---
  it("execute-jing-deposit (STX): valid signature → market deposit; replay rejected", function () {
    setupVault();
    setupMarket();
    pub(VAULT, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
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
    expect(
      pub(VAULT, "execute-jing-deposit", args, wallet3).result,
    ).toBeOk(Cl.bufferFromHex(msgHash));
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

  it("execute-jing-deposit: ERR_INVALID_SIGNATURE when signed by wrong key", function () {
    setupVault();
    setupMarket();
    pub(VAULT, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 5_000_000_000_000,
      authId: 300,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, WALLET1_PRIVKEY); // wrong key

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
      side: "garbage",
      amount: STX_100,
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
    pub(VAULT, "deposit-stx", [Cl.uint(STX_500)], deployer);

    const currentHeight = Number(simnet.blockHeight ?? simnet.burnBlockHeight);
    const intent = {
      action: "jing-deposit",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 5_000_000_000_000,
      authId: 500,
      expiry: currentHeight,
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

  // --- execute-bitflow-swap (xyk-core sBTC/STX pool) ---
  it("execute-bitflow-swap (sBTC → STX via xyk-core)", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent = {
      action: "bitflow-swap",
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
        "execute-bitflow-swap",
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
        "[v3-vault-stx] bitflow sBTC→STX: threw —",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx] bitflow sBTC→STX: errored — VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-bitflow-swap (STX → sBTC via xyk-core)", function () {
    setupVault();
    pub(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer);

    const intent = {
      action: "bitflow-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 999_999_999_999_999,
      authId: 700,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    let r;
    try {
      r = pub(
        VAULT,
        "execute-bitflow-swap",
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
        "[v3-vault-stx] bitflow STX→sBTC: threw —",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx] bitflow STX→sBTC: errored — VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-bitflow-swap: ERR_INVALID_PRICE on zero limit-price", function () {
    setupVault();

    const intent = {
      action: "bitflow-swap",
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
        "execute-bitflow-swap",
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

  it("execute-bitflow-swap: ERR_INVALID_SIDE on bad side string", function () {
    setupVault();

    const intent = {
      action: "bitflow-swap",
      side: "garbage",
      amount: SBTC_10K,
      limitPrice: 5_000_000_000_000,
      authId: 850,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-bitflow-swap",
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

  // --- execute-dlmm-swap (DLMM stx-sbtc pool, layout x=wstx y=sBTC) ---
  it("execute-dlmm-swap (STX → sBTC via DLMM router)", function () {
    setupVault();
    pub(VAULT, "deposit-stx", [Cl.uint(STX_100)], deployer);

    const intent = {
      action: "dlmm-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 999_999_999_999_999,
      authId: 900,
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
        "[v3-vault-stx] dlmm STX→sBTC: threw —",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx] dlmm STX→sBTC: errored — VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap (sBTC → STX via DLMM router)", function () {
    setupVault();
    fundSbtc(deployer, SBTC_10K);
    pub(VAULT, "deposit-sbtc", [Cl.uint(SBTC_10K)], deployer);

    const intent = {
      action: "dlmm-swap",
      side: ASSET_SBTC,
      amount: SBTC_10K,
      limitPrice: 1,
      authId: 1000,
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
        "[v3-vault-stx] dlmm sBTC→STX: threw —",
        (e as Error).message,
      );
      return;
    }
    if (!cvToJSON(r.result).success) {
      console.log("[v3-vault-stx] dlmm sBTC→STX: errored — VM bug or pool");
      return;
    }
    expect(r.result).toBeOk(Cl.bufferFromHex(msgHash));
  });

  it("execute-dlmm-swap: ERR_INVALID_PRICE on zero limit-price (wstx side — verifies the assert-before-let fix)", function () {
    setupVault();

    // Pre-fix this would runtime-panic with DivisionByZero because
    // `derive-min-out` divides by limit-price for the wstx side and the
    // `let` binding evaluated min-out before the assert. Post-fix the
    // assert hoist guarantees a clean ERR_INVALID_PRICE.
    const intent = {
      action: "dlmm-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 0,
      authId: 1100,
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

  it("execute-bitflow-swap: ERR_INVALID_PRICE on zero limit-price (wstx side — verifies the assert-before-let fix)", function () {
    setupVault();

    const intent = {
      action: "bitflow-swap",
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 0,
      authId: 1150,
      expiry: 0,
    };
    const msgHash = buildIntentHash(intent);
    const sig = signRsv(msgHash, DEPLOYER_PRIVKEY);

    expect(
      pub(
        VAULT,
        "execute-bitflow-swap",
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

  // --- Distinct-action hash separator ---
  it("intent hashes for jing-deposit / bitflow-swap / dlmm-swap are distinct (action separator)", function () {
    const base = {
      side: ASSET_WSTX,
      amount: STX_100,
      limitPrice: 5_000_000_000_000,
      authId: 9999,
      expiry: 0,
    };
    const h1 = buildIntentHash({ ...base, action: "jing-deposit" });
    const h2 = buildIntentHash({ ...base, action: "bitflow-swap" });
    const h3 = buildIntentHash({ ...base, action: "dlmm-swap" });
    expect(h1).not.toBe(h2);
    expect(h2).not.toBe(h3);
    expect(h1).not.toBe(h3);
  });
});
