# Multi-sig deployment for jing-core

`jing-core`'s `register` and `set-verified-contract` enforce
`tx-sender == contract-owner`. The intended security model assumes
the `contract-owner` is a multi-sig — without that, a single
compromised key has full registry authority. This doc covers how to
deploy `jing-core` with native Stacks multi-sig ownership from day 1.

See `JING-CORE-DESIGN.md` for the threat model and design rationale.

## Stacks native multi-sig in two minutes

Stacks supports native n-of-m multi-sig at the protocol level — no
smart contract intermediary needed. The multi-sig address is derived
from a set of pubkeys + signature threshold. Every transaction signed
from that address must carry n valid signatures from the m
authorized pubkeys.

Four hash modes are available (from `@stacks/transactions/constants.AddressHashMode`):

| Mode | Value | Description |
|------|-------|-------------|
| `P2SH` | 1 | Sequential signatures — signers sign in pubkey order, each signature commits to the prior sig list |
| `P2WSH` | 3 | SegWit-style sequential |
| `P2SHNonSequential` | 5 | **Order-independent signatures** — recommended; signers can sign in any order, like Gnosis Safe on EVM |
| `P2WSHNonSequential` | 7 | SegWit-style order-independent |

**Use `P2SHNonSequential` (mode 5)** unless you have a specific reason
to require ordered signing. Order-independent dramatically simplifies
coordination — each signer signs the same tx hash independently and
their sigs are aggregated by a coordinator.

The address bytes are derived as `RIPEMD160(SHA256(<sorted-pubkeys-hash>))`
prefixed with the appropriate version byte. `@stacks/transactions`
exposes the helpers; you don't need to compute the hash yourself.

## Tooling

For Stacks multi-sig deployments, three options:

1. **Asigna** (https://asigna.io) — Stacks-native multi-sig wallet with
   a UI. Create a multi-sig vault, propose transactions, signers vote.
   Best for ongoing governance once the multi-sig is live.

2. **Leather wallet** (recent versions) — supports multi-sig
   coordination. Each signer holds their own seed; one signer initiates
   a tx, others sign through their wallet UI.

3. **Programmatic via `@stacks/transactions`** — for the initial
   deployment script (one-time event), the most explicit approach.
   This doc walks through the programmatic path because:
   - it's reproducible
   - it's auditable (the deploy script is the spec)
   - it works without trusting a third-party UI for the most
     consequential transaction in the protocol's life

After the initial deploy, switch to Asigna or Leather for ongoing
governance txs (set-verified-contract, add-guardian, pause, unpause,
set-contract-owner) — both UIs are well-suited for that workflow and
won't ask each signer to run a script.

## Programmatic deploy script (sketch)

```typescript
import {
  AddressHashMode,
  AddressVersion,
  PubKeyEncoding,
  createMultiSigSpendingCondition,
  makeUnsignedContractDeploy,
  publicKeyFromBytes,
  signMultiSigSpendingCondition,
  TransactionSigner,
  AnchorMode,
  PostConditionMode,
} from "@stacks/transactions";
import fs from "node:fs";

// === Step 1: collect each signer's compressed public key ===
// Each signer runs:
//   privateKeyToPublicKey(theirPrivateKey, "compressed")
// and shares the resulting hex with the coordinator (NOT private keys).
const SIGNER_PUBKEYS = [
  "02aaaa...",  // signer 1 compressed pubkey
  "03bbbb...",  // signer 2
  "02cccc...",  // signer 3
  "03dddd...",  // signer 4
  "02eeee...",  // signer 5
];
const THRESHOLD = 3;  // 3-of-5

// === Step 2: derive the multi-sig address ===
// @stacks/transactions sorts pubkeys for you when building the
// spending condition. The resulting address is deterministic.
const HASH_MODE = AddressHashMode.P2SHNonSequential;

// (You can compute the address up-front for funding it with STX
// before the deploy tx. Use addressFromPublicKeys + AddressVersion.MainnetMultiSig.)

// === Step 3: build the unsigned deploy tx ===
const jingCoreSource = fs.readFileSync("./contracts/jing-core.clar", "utf8");

const unsigned = await makeUnsignedContractDeploy({
  contractName: "jing-core",
  codeBody: jingCoreSource,
  publicKeys: SIGNER_PUBKEYS,
  numSignatures: THRESHOLD,
  signerKey: SIGNER_PUBKEYS[0],   // any one of the signers builds the tx
  hashMode: HASH_MODE,
  network: "mainnet",
  fee: 1_000_000n,                 // estimate first via stxer or testnet
  nonce: 0n,                       // first tx from the multi-sig address
  anchorMode: AnchorMode.Any,
  postConditionMode: PostConditionMode.Deny,
});

// === Step 4: each signer adds their signature ===
// The coordinator serializes the unsigned tx and ships it to each
// signer (out of band — Slack, encrypted message, etc.). Each signer
// runs:
//   const signer = new TransactionSigner(unsigned);
//   await signer.signOrigin(theirPrivateKey);
//   const sig = unsigned.auth.spendingCondition.fields[i].contents.data;
//   share the sig hex back with coordinator
// Coordinator collects N signatures and assembles them into the tx's
// spending condition.

// === Step 5: broadcast ===
// Standard broadcastTransaction(signedTx, network). Once mined, the
// jing-core contract is deployed, and contract-owner is the multi-sig
// address. Subsequent admin txs require the same N signatures.
```

This is the bare-bones flow. For a real deployment you'd want:
- A coordinator script that runs on each signer's machine (signs
  locally with their private key, never exposes it)
- A test run on testnet or stxer first
- Clear off-chain comms about which tx is being signed (hash + intent)

## Recommended initial sequence

Once the multi-sig is funded with enough STX for fees:

1. **Deploy `jing-core`** from the multi-sig address. `contract-owner`
   is set to `tx-sender` at deploy time, which is the multi-sig.
2. **Add guardians** via `add-guardian(principal)` for any fast-pause
   keys you want (these can be single-key, e.g. team members on call).
   Each `add-guardian` is a multi-sig tx (N signatures).
3. **Deploy each market** (`markets-sbtc-usdcx-jing`,
   `markets-sbtc-stx-jing`, etc.) from the multi-sig.
4. **Verify each market**: call `jing-core.set-verified-contract(market)`
   for each. One multi-sig tx per market.
5. **Initialize each market**: call `market.initialize(canonical, x, y,
   min-x, min-y, feed)` from the multi-sig. The `tx-sender ==
   contract-owner` check inside `register` propagates and passes
   because the multi-sig is the owner.
6. **Verify on-chain**: read `(is-registered '<market>)` returns true
   and `(get-verified-hash '<market>)` returns the expected hash.

After that, the protocol is live. Routine governance (adding new
markets, pausing in emergencies, transferring ownership) all flows
through the multi-sig with the same N signatures.

## Key rotation / signer changes

To add or remove a signer (or change the threshold), you must
**redeploy** the multi-sig — Stacks native multi-sig is configured at
deploy time and immutable. The procedure:

1. Compute the new multi-sig address with updated pubkeys/threshold.
2. Old multi-sig calls `jing-core.set-contract-owner(<new-multi-sig>)`.
3. From now on, the new multi-sig holds owner authority.

Note that `set-contract-owner` is one-step (no on-chain timelock) — the
multi-sig itself is the audit window. Plan signer rotations
deliberately; they're not reversible without another multi-sig round.

## Operational notes

- **Don't lose key threshold-1 or more keys.** A 3-of-5 multi-sig with
  3+ keys lost is permanently bricked. Use a hardware-secured signing
  setup with backups (Shamir's Secret Sharing, geographic distribution).
- **Test the recovery procedure.** Before mainnet, simulate "we lost
  signer 4" and "we need to rotate signer 1" on testnet.
- **Document signer identities off-chain.** Who holds which key, where.
  This survives team turnover.
- **Pause guardians can be single-key**, intentionally. Their privilege
  is only "pause", which is non-destructive and reversible by the
  multi-sig owner. Don't multi-sig the pause path; that defeats its
  fast-response purpose.
- **Stxer simulation before each multi-sig governance tx.** Build the
  tx, run it through stxer against a fork, verify the on-chain effect
  matches expectations, *then* sign. The stxer URL becomes part of the
  off-chain audit trail for that signing round.

## References

- Stacks docs: https://docs.stacks.co
- Asigna multi-sig wallet: https://asigna.io
- `@stacks/transactions` source for the multi-sig helpers:
  `node_modules/@stacks/transactions/src/authorization.ts`
- This file's sibling: `JING-CORE-DESIGN.md`
