// Post-call accounting monitor for the ladder-v1 RV stack.
//
// Contract reads into the 4,200-line market cost 25-175 ms each in simnet, so
// a Clarity invariant summing get-position over every member of four rungs
// takes seconds per step. This monitor reads raw storage instead (getDataVar /
// getMapEntry, under 0.5 ms) after EVERY public call, rejected ones included,
// and re-derives each member's claim with an independent model of the rung's
// get-position (carried / earned / epoch-payout). `crossCheck` compares that
// model with the on-chain get-position and the Clarity rv-check-rung-* /
// rv-check-market-solvent read-onlys, so the model cannot drift silently.
import { Cl, cvToString } from '@stacks/transactions';
import { ACCOUNTS, RUNGS } from './harness.mjs';

const SCALE = 10n ** 12n, PS = 10n ** 18n, RESCALE = 1000n, MINT_FLOOR = 10n ** 9n;
export function value(cv) {
  if (cv === null || cv === undefined) return null;
  switch (cv.type) {
    case 'uint': case 'int': return BigInt(cv.value);
    case 'some': case 'ok': return value(cv.value);
    case 'none': return null;
    case 'true': return true; case 'false': return false;
    case 'tuple': return Object.fromEntries(Object.entries(cv.value).map(([k, v]) => [k, value(v)]));
    case 'list': return cv.value.map(value);
    default: return cv.value;
  }
}

export function createMonitor(sim, owner) {
  const harness = `${owner}.rv-ladder-harness`, market = `${owner}.market`;
  const members = [...ACCOUNTS, harness];
  const owners = [...members, ...RUNGS.map(r => `${owner}.${r.name}`)];
  const varOf = (c, n) => value(sim.getDataVar(c, n));
  const entry = (c, m, k) => {
    try { return value(sim.getMapEntry(c, m, k)); } catch (e) { if (String(e).includes('value not found')) return null; throw e; }
  };
  const tokenId = [...sim.getAssetsMap().keys()].find(k => k.endsWith('.token.token'));
  const bal = (asset, who) => sim.getAssetsMap().get(asset)?.get(who) ?? 0n;
  const stx = who => bal('STX', who), tok = who => bal(tokenId, who);

  function marketView(x) {
    const cycle = varOf('market', 'current-cycle'), s = x ? 'x' : 'y';
    return {
      cycle,
      live: who => entry('market', `token-${s}-deposits`, Cl.tuple({ cycle: Cl.uint(cycle), depositor: Cl.principal(who) })) ?? 0n,
      parked: who => entry('market', `token-${s}-parked`, Cl.principal(who)) ?? 0n,
      pending: who => entry('market', `token-${s}-pending-deposits`, Cl.principal(who))?.amount ?? 0n,
      order: who => entry('market', `token-${s}-deposit-limits`, Cl.principal(who)),
    };
  }

  // independent model of jing-{buy,sell}-stx-core-spread-v1 get-position
  function rungState(r, idx) {
    const C = r.name, P = `${owner}.${C}`, mv = marketView(r.buy);
    const v = n => varOf(C, n);
    const st = {
      epoch: v('epoch'), scale: v('scale'), total: v('total-shares'), members: v('members'),
      unfilled: v('unfilled-index'), pindex: v('proceeds-index'),
      held: v(r.buy ? 'held-sats' : 'held-ustx'), reserved: v(r.buy ? 'reserved-sats' : 'reserved-ustx'),
      accounted: v(r.buy ? 'stx-accounted' : 'sats-accounted'), currentProceeds: v('current-proceeds'),
      escrowCancelledAt: v('escrow-cancelled-at'),
    };
    st.onBook = mv.live(P) + mv.parked(P);
    st.marketSize = st.onBook + mv.pending(P);
    st.inBal = r.buy ? tok(P) : stx(P);
    st.outBal = r.buy ? stx(P) : tok(P);
    st.order = mv.order(P);
    st.coreEquity = entry('jing-core-v6', 'token-equity', Cl.tuple({ token: Cl.principal(`${owner}.${r.buy ? 'token' : 'asset-stx'}`), owner: Cl.principal(P) })) ?? 0n;
    const U = k => BigInt(k);
    const finalScale = e => entry(C, 'epoch-final-scale', Cl.uint(e)) ?? st.scale;
    const finalIndex = e => entry(C, 'epoch-final-proceeds', Cl.uint(e)) ?? st.pindex;
    const finalUnfilled = e => entry(C, 'epoch-final-unfilled', Cl.uint(e)) ?? 0n;
    const scaleStart = j => entry(C, 'scale-start', Cl.uint(j)) ?? 0n;
    const carried = (sh, from, to) => (to - from > 3n ? 0n : sh / RESCALE ** (to - from));
    const earned = (sh, from, to, paid, upto) => {
      let owed = 0n;
      for (let step = 0n; step <= 3n; step++) {
        const j = from + step; if (j > to) continue;
        const a = step === 0n ? paid : scaleStart(j), b = j === to ? upto : scaleStart(j + 1n);
        if (b < a) throw Error(`${C}: proceeds segment underflow (${a} > ${b})`);
        owed += carried(sh, 0n, step) * (b - a) / PS;
      }
      return owed;
    };
    st.reserve = e => entry(C, 'epoch-reserve', Cl.uint(e));
    st.epochStartScale = st.epoch === 0n ? 0n : (entry(C, 'epoch-final-scale', Cl.uint(st.epoch - 1n)) ?? 0n);
    st.position = who => {
      const p = entry(C, 'positions', Cl.principal(who));
      if (!p) return null;
      const e = p.epoch, cur = e === st.epoch, to = cur ? st.scale : finalScale(e);
      const sh = carried(p.shares, p.scale, to);
      const input = cur && st.members === 1n ? st.marketSize + st.held : sh * (cur ? st.unfilled : finalUnfilled(e)) / SCALE;
      let proceeds = earned(p.shares, p.scale, to, p['paid-index'], cur ? st.pindex : finalIndex(e)), inp = input;
      if (cur) { if (st.members === 1n) proceeds = st.currentProceeds; }
      else { const rv = entry(C, 'epoch-reserve', Cl.uint(e)); if (rv && rv.left === 1n) { inp = rv.reserve; proceeds = rv.proceeds; } }
      return { raw: p, cur, shares: sh, input: inp, proceeds };
    };
    st.ghost = who => ({
      in: entry('rv-ladder-harness', 'rv-in', Cl.tuple({ r: Cl.uint(idx), who: Cl.principal(who) })) ?? 0n,
      out: entry('rv-ladder-harness', 'rv-out', Cl.tuple({ r: Cl.uint(idx), who: Cl.principal(who) })) ?? 0n,
    });
    st.paid = entry('rv-ladder-harness', 'rv-paid', Cl.uint(idx)) ?? 0n;
    st.inflow = entry('rv-ladder-harness', 'rv-inflow', Cl.uint(idx)) ?? 0n;
    return st;
  }

  const stats = { checks: 0, crossChecks: 0, positionsCompared: 0, maxStranded: {}, maxShareGap: {}, deepest: {} };
  function check() {
    stats.checks++;
    const bad = [];
    for (const [idx, r] of RUNGS.entries()) {
      const st = rungState(r, idx), id = r.id;
      let sum = 0n, n = 0n, rows = 0n, pin = 0n, oldin = 0n, pout = 0n;
      for (const who of members) {
        const g = st.ghost(who);
        if (g.out > g.in) bad.push(`${id} overdraw ${who}: out ${g.out} > in ${g.in}`);
        const p = st.position(who); if (!p) continue;
        rows++; pin += p.input; pout += p.proceeds;
        if (p.cur) {
          n++; sum += carried(p.raw.shares, p.raw.scale, st.scale);
          if (p.raw['paid-index'] > st.pindex) bad.push(`${id} paid-index ahead ${who}`);
        } else oldin += p.input;
      }
      function carried(sh, from, to) { return to - from > 3n ? 0n : sh / RESCALE ** (to - from); }
      if (n !== st.members) bad.push(`${id} members ${st.members} != rows in epoch ${n}`);
      // Shares: never more issued than members hold. A rescale floors every
      // member and the total separately, which leaves ownerless shares (the
      // rung documents it); they stay when a member later exits, so the gap
      // is not bounded by today's members: 0 in an epoch with no rescale, at
      // most one share per possible member (10 here) per rescale otherwise.
      const startScale = st.epochStartScale;
      const rescales = st.scale - startScale;
      if (sum > st.total) bad.push(`${id} shares over-issued: total ${st.total} < members' ${sum}`);
      if (st.total - sum > rescales * BigInt(members.length)) bad.push(`${id} ownerless shares ${st.total - sum} > ${rescales} rescales x ${members.length}`);
      if (st.members === 0n && st.total !== 0n) bad.push(`${id} no member but total shares ${st.total}`);
      if (pin > st.marketSize + st.inBal) bad.push(`${id} input claims ${pin} > on market + held ${st.marketSize + st.inBal}`);
      if (oldin > st.reserved) bad.push(`${id} closed-epoch claims ${oldin} > reserved ${st.reserved}`);
      if (st.reserved > st.inBal) bad.push(`${id} reserved ${st.reserved} > balance ${st.inBal}`);
      const pooled = st.total * st.unfilled / SCALE;
      if (st.reserved <= st.inBal && pooled > st.marketSize + st.inBal - st.reserved) bad.push(`${id} pooled ${pooled} > actual ${st.marketSize + st.inBal - st.reserved}`);
      if (pout > st.outBal) bad.push(`${id} proceeds claims ${pout} > balance ${st.outBal}`);
      if (st.accounted > st.outBal) bad.push(`${id} accounted ${st.accounted} > balance ${st.outBal}`);
      // EXACT LEDGER (replaces a per-position dust bound that was wrong by
      // design: each payout floors and its remainder stays for the epoch's
      // final member, so the gap to the indexed claims grows with payouts).
      // accounted = open epoch's exact proceeds + every open reserve's proceeds;
      // reserved = every open reserve's input; each reserve's `left` is its
      // live positions and it covers their claims; a sole member's claim is
      // all of current-proceeds; no member, no current proceeds.
      let resProceeds = 0n, resInput = 0n;
      const byEpoch = {};
      for (const who of members) { const p = st.position(who); if (p && !p.cur) { const k = String(p.raw.epoch); (byEpoch[k] ??= { n: 0n, input: 0n, proceeds: 0n }); byEpoch[k].n++; byEpoch[k].input += p.input; byEpoch[k].proceeds += p.proceeds; } }
      for (let e = 0n; e < st.epoch; e++) {
        const rv = st.reserve(e), g = byEpoch[String(e)] ?? { n: 0n, input: 0n, proceeds: 0n };
        if (!rv) { if (g.n > 0n) bad.push(`${id} epoch ${e}: ${g.n} live positions but no reserve row`); continue; }
        resProceeds += rv.proceeds; resInput += rv.reserve;
        if (rv.left !== g.n) bad.push(`${id} epoch ${e}: reserve left ${rv.left} != live positions ${g.n}`);
        if (g.proceeds > rv.proceeds) bad.push(`${id} epoch ${e}: claims ${g.proceeds} > reserve proceeds ${rv.proceeds}`);
        if (g.input > rv.reserve) bad.push(`${id} epoch ${e}: input claims ${g.input} > reserve ${rv.reserve}`);
        if (rv.left === 0n && (rv.proceeds > 0n || rv.reserve > 0n)) bad.push(`${id} epoch ${e}: reserve with no claimant (${rv.reserve} in, ${rv.proceeds} out)`);
      }
      if (st.accounted !== st.currentProceeds + resProceeds) bad.push(`${id} ledger: accounted ${st.accounted} != current ${st.currentProceeds} + reserves ${resProceeds}`);
      if (st.reserved !== resInput) bad.push(`${id} reserved ${st.reserved} != sum of reserves ${resInput}`);
      const curOut = pout - Object.values(byEpoch).reduce((a, g) => a + g.proceeds, 0n);
      if (curOut > st.currentProceeds) bad.push(`${id} open-epoch claims ${curOut} > current-proceeds ${st.currentProceeds}`);
      if (st.members === 1n && curOut !== st.currentProceeds) bad.push(`${id} sole member's claim ${curOut} != current-proceeds ${st.currentProceeds}`);
      if (st.members === 0n && st.currentProceeds !== 0n) bad.push(`${id} no member but current-proceeds ${st.currentProceeds}`);
      const stranded = st.currentProceeds - curOut;
      if (st.inflow !== st.outBal + st.paid) bad.push(`${id} conservation: inflow ${st.inflow} != balance ${st.outBal} + paid ${st.paid}`);
      if (st.unfilled > SCALE || (st.total > 0n && st.unfilled < MINT_FLOOR)) bad.push(`${id} unfilled-index ${st.unfilled} out of range (total ${st.total})`);
      if (st.coreEquity !== st.onBook) bad.push(`${id} core equity ${st.coreEquity} != on book ${st.onBook}`);
      if (st.onBook > 0n && st.order?.['spread-bps'] !== BigInt(r.spread)) bad.push(`${id} order spread ${st.order?.['spread-bps']}`);
      // largest final-member remainder seen (rounding kept for the last one out)
      stats.maxStranded[id] = Math.max(stats.maxStranded[id] ?? 0, Number(stranded > 0n ? stranded : 0n));
      stats.maxShareGap[id] = Math.max(stats.maxShareGap[id] ?? 0, Number(st.total - sum));
      const d = stats.deepest[id] ??= { epoch: 0, scale: 0, members: 0, escrowCancelled: false, oldEpochRows: 0, reservedMax: 0 };
      d.escrowCancelled ||= st.escrowCancelledAt > 0n; d.oldEpochRows = Math.max(d.oldEpochRows, Number(rows - n)); d.reservedMax = Math.max(d.reservedMax, Number(st.reserved));
      d.epoch = Math.max(d.epoch, Number(st.epoch)); d.scale = Math.max(d.scale, Number(st.scale)); d.members = Math.max(d.members, Number(st.members));
    }
    // market solvency and the core ledger over every owner in the stack
    for (const x of [true, false]) {
      const mv = marketView(x); let owed = 0n, credited = 0n;
      for (const who of owners) { const c = mv.live(who) + mv.parked(who); credited += c; owed += c + mv.pending(who); }
      const have = x ? tok(market) : stx(market);
      if (have < owed) bad.push(`market ${x ? 'x' : 'y'} balance ${have} < owed ${owed}`);
      const total = entry('jing-core-v6', 'total-token-equity', Cl.principal(`${owner}.${x ? 'token' : 'asset-stx'}`)) ?? 0n;
      if (total !== credited) bad.push(`core total equity ${x ? 'x' : 'y'} ${total} != live + parked ${credited}`);
    }
    if (tok(`${owner}.jing-ladder-dispatch`) !== 0n || stx(`${owner}.jing-ladder-dispatch`) !== 0n) bad.push('dispatcher holds funds');
    return bad;
  }

  // the model against the chain: every member's get-position, and the
  // Clarity versions of the same checks
  function crossCheck() {
    stats.crossChecks++;
    const bad = [];
    for (const [idx, r] of RUNGS.entries()) {
      const st = rungState(r, idx);
      for (const who of members) {
        const chain = value(sim.callReadOnlyFn(r.name, 'get-position', [Cl.principal(who)], owner).result);
        const p = st.position(who) ?? { shares: 0n, input: 0n, proceeds: 0n };
        const [ci, co] = r.buy ? [chain.sbtc, chain.stx] : [chain.stx, chain.sbtc];
        stats.positionsCompared++;
        if (chain.shares !== p.shares || ci !== p.input || co !== p.proceeds)
          bad.push(`${r.id} model drift ${who}: chain ${cvToString(sim.callReadOnlyFn(r.name, 'get-position', [Cl.principal(who)], owner).result)} model ${p.shares}/${p.input}/${p.proceeds}`);
      }
      const clar = cvToString(sim.callReadOnlyFn('rv-ladder-harness', `rv-check-rung-${r.id}`, [], owner).result);
      if (clar !== 'true') bad.push(`${r.id} rv-check-rung false: ${cvToString(sim.callReadOnlyFn('rv-ladder-harness', `rv-flags-${r.id}`, [], owner).result)}`);
    }
    if (cvToString(sim.callReadOnlyFn('rv-ladder-harness', 'rv-check-market-solvent', [], owner).result) !== 'true') bad.push('rv-check-market-solvent false');
    return bad;
  }
  return { check, crossCheck, stats };
}
