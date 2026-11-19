// Fork-only oracle fee fixture. The original deployer relinquished governance;
// exercise the live shim's untimelocked fee proposal with its real multisig.
import { uintCV, bufferCV } from '@stacks/transactions';
import { evalIn, call, must, tx, show, OK } from './_yg-loop-common.js';
export const ORACLE = 'SPMV5HDZ4EMB8XY7HAYT3XW0DF7DZ4E8XEG2J1T8.pyth-lazer-oracle';
const ORIGINAL = ORACLE.split('.')[0];
const GOV = 'SPA105SQJJSN4YCZXR9F1C6GYQE8DRZ95WNY5HZF.pyth-lazer-gov';
const META = 'SP3M2BYF7RGF8WKW5FVDNJ6WR8D7AR9BHDXAKPXZE.meta-governance-v1';
// Initial membership, verified on the fork before voting. Fail loudly if it changes.
const MEMBERS = ['SP1ABZHX4VKG0BTQ8NTBJ591W7AK67C33KR76QD27', 'SPTXMEW26M54HX1ZXF6VN7QKK4XES1038ERD40T5', 'SP2G62YGCCMWS4PAN54ZYT2G9TCJRGBSKQ679M96Q', 'SP2EBZVFF99Q97GJXGTRT3Y0M7N6G7XJAKMNVGFK'];
export async function setOracleFee(label, fee) {
  if (await evalIn(ORACLE, `(has-role '${ORIGINAL} 0x00)`)) {
    await tx(label, ORIGINAL, ORACLE, 'set-fee', [uintCV(fee)], { ok: true });
  } else {
    must(`${label}: current shim has oracle governance`, await evalIn(ORACLE, `(has-role '${GOV} 0x00)`));
    const count = await evalIn(META, '(governance-multisig-count)'), members = [];
    for (const who of MEMBERS) if ((await evalIn(META, `(is-governance-member '${who})`))?.ok === true) members.push(who);
    must(`${label}: known live members reach 60% quorum`, BigInt(members.length) * 100n >= count * 60n && count > 0n);
    const r = await call(members[0], GOV, 'initiate-proposal-to-set-fee', [uintCV(fee), uintCV(1000)]);
    must(`${label}: fee proposal created`, !r.vm && OK(r.res), show(r.res ?? r.vm));
    const hex = r.res.ok.replace(/^0x/, ''), id = bufferCV(Buffer.from(hex, 'hex'));
    for (let i = 1; i < members.length; i++) {
      if ((await evalIn(GOV, `(get-proposal 0x${hex})`)).executed) break;
      await tx(`${label}: governance approval ${i + 1}`, members[i], GOV, 'approve', [id], { ok: true });
    }
  }
  must(`${label}: oracle fee is exactly ${fee}`, await evalIn(ORACLE, '(get-fee)') === fee);
}
