// RV campaign for kairan-seat-lab-ocifarsito-v2. RV keeps one simnet per
// process, so one process = one lifecycle (raise -> seat or failure -> close).
// The campaign therefore runs several seeds on three timing profiles, each a
// fresh build, so every path is reached many times:
//   seat     DEADLINE 6000, SEAT_WINDOW 3000            (seat released inside the window)
//   expire   DEADLINE 6000, SEAT_WINDOW 20              (target hit, window lapses -> refunds)
//   deadline DEADLINE 6000, finish-the-raise disabled   (DEADLINE passes short of target -> refunds)
//   window   DEADLINE 6000, SEAT_WINDOW 12960 (mainnet) (real 90-day window, reached in invariant mode)
// Each job's log is scanned for the contract's print events and the highest
// burn height so summary.json shows which paths every profile reached.
//
// Usage: node tests/rv/kairan-seat-v2/run.mjs [invariant|test|both] [runs] [seedBase] [seedsPerProfile]
// Logs: tests/rv/kairan-seat-v2/.build/results/<profile>-<mode>-<seed>.log
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIR = 'tests/rv/kairan-seat-v2';
const RES = `${DIR}/.build/results`;
const PROFILES = {
  seat: ['6000', '3000', '8'],
  expire: ['6000', '20', '8'],
  deadline: ['6000', '3000', '0'],
  window: ['6000', '12960', '8'],
};
const [modeArg = 'both', runs = '1000', seedBase = '20261023', perProfile = '3', only] = process.argv.slice(2);
const modes = modeArg === 'both' ? ['invariant', 'test'] : [modeArg];
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
fs.mkdirSync(RES, { recursive: true });

const totals = {};
const reach = {};
let failures = 0;
let jobs = 0;
for (const [profile, [deadline, window, gate]] of Object.entries(PROFILES)) {
  if (only && !only.split(',').includes(profile)) continue;
  const b = spawnSync('node', [`${DIR}/build.mjs`, deadline, window, gate], { encoding: 'utf8' });
  if (b.status !== 0) throw Error(b.stderr);
  for (const mode of modes) {
    for (let i = 0; i < Number(perProfile); i++) {
      const seed = Number(seedBase) + i * 7919 + (mode === 'test' ? 1 : 0);
      const r = spawnSync('npx', ['rv', DIR, 'kairan-seat-lab-ocifarsito-v2', mode, `--runs=${runs}`, `--seed=${seed}`],
        { encoding: 'utf8', maxBuffer: 1 << 30 });
      const log = strip(r.stdout + r.stderr);
      fs.writeFileSync(`${RES}/${profile}-${mode}-${seed}.log`, log);
      const failed = r.status !== 0 || /Counterexample|Property failed|\[FAIL\]/.test(log);
      if (failed) failures++;
      jobs++;
      // tally the SUCCESSFUL / PASSED rows of RV's statistics
      const t = (totals[`${profile}/${mode}`] ??= {});
      let section = '';
      for (const line of log.split('\n')) {
        const h = line.match(/[+-] (SUCCESSFUL|IGNORED|PASSED|FAILED|DISCARDED)/);
        if (h) section = h[1];
        const m = line.match(/[├└]─ ([a-z0-9-]+): x(\d+)/);
        if (m && (section === 'SUCCESSFUL' || section === 'PASSED')) t[m[1]] = (t[m[1]] ?? 0) + Number(m[2]);
      }
      // paths reached: contract print events + highest burn height
      const ev = {};
      for (const m of log.matchAll(/event: "([a-z-]+)"/g)) ev[m[1]] = (ev[m[1]] ?? 0) + 1;
      const burn = Math.max(0, ...[...log.matchAll(/^₿\s+(\d+)/gm)].map(m => Number(m[1])));
      (reach[`${profile}/${mode}`] ??= []).push({ seed, maxBurn: burn, events: ev });
      console.log(`${failed ? 'FAIL' : 'ok  '} ${profile.padEnd(8)} ${mode.padEnd(9)} runs=${runs} seed=${seed} burn<=${burn} ${JSON.stringify(ev)}`);
    }
  }
}
fs.writeFileSync(`${RES}/summary.json`, JSON.stringify({ runs: Number(runs), seedBase: Number(seedBase), perProfile: Number(perProfile), jobs, failures, successfulCalls: totals, reached: reach }, null, 2) + '\n');
console.log(JSON.stringify(totals, null, 1));
console.log(`${jobs} jobs, ${failures} failing`);
// leave the default build in place
spawnSync('node', [`${DIR}/build.mjs`], { encoding: 'utf8' });
if (failures) process.exitCode = 1;
