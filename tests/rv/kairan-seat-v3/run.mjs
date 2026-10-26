// RV campaign for kairan-seat-lab-ocifarsito-v3. RV keeps one simnet per
// process, so one process = one lifecycle (open -> release -> closed). The
// campaign runs several seeds on three release-gate profiles, each a fresh
// build, so the release lands early, mid and late in the campaign:
//   early  RV_RELEASE_GATE 4   (release soon; long closed phase)
//   mid    RV_RELEASE_GATE 16
//   late   RV_RELEASE_GATE 64  (many deposits / requests before the release)
// Each job's log is scanned for the contract's print events so summary.json
// shows which paths every profile reached.
//
// Usage: node tests/rv/kairan-seat-v3/run.mjs [invariant|test|both] [runs] [seedBase] [seedsPerProfile] [profiles]
// Logs: tests/rv/kairan-seat-v3/.build/results/<profile>-<mode>-<seed>.log
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIR = 'tests/rv/kairan-seat-v3';
const RES = `${DIR}/.build/results`;
const PROFILES = { early: '4', mid: '16', late: '64' };
const [modeArg = 'both', runs = '600', seedBase = '20261026', perProfile = '3', only] = process.argv.slice(2);
const modes = modeArg === 'both' ? ['invariant', 'test'] : [modeArg];
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');
fs.mkdirSync(RES, { recursive: true });

const totals = {};
const reach = {};
let failures = 0;
let jobs = 0;
for (const [pi, [profile, gate]] of Object.entries(PROFILES).entries()) {
  if (only && !only.split(',').includes(profile)) continue;
  const b = spawnSync('node', [`${DIR}/build.mjs`, gate], { encoding: 'utf8' });
  if (b.status !== 0) throw Error(b.stderr);
  for (const mode of modes) {
    for (let i = 0; i < Number(perProfile); i++) {
      const seed = Number(seedBase) + pi * 104729 + i * 7919 + (mode === 'test' ? 1 : 0); // distinct seeds per profile
      const r = spawnSync('npx', ['rv', DIR, 'kairan-seat-lab-ocifarsito-v3', mode, `--runs=${runs}`, `--seed=${seed}`],
        { encoding: 'utf8', maxBuffer: 1 << 30 });
      const log = strip(r.stdout + r.stderr);
      fs.writeFileSync(`${RES}/${profile}-${mode}-${seed}.log`, log);
      const failed = r.status !== 0 || /Counterexample|Property failed|\[FAIL\]/.test(log)
        || !/(invariants|properties) passed after/.test(log);
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
      const ev = {};
      for (const m of log.matchAll(/event: "([a-z-]+)"/g)) ev[m[1]] = (ev[m[1]] ?? 0) + 1;
      (reach[`${profile}/${mode}`] ??= []).push({ seed, events: ev });
      console.log(`${failed ? 'FAIL' : 'ok  '} ${profile.padEnd(6)} ${mode.padEnd(9)} runs=${runs} seed=${seed} ${JSON.stringify(ev)}`);
    }
  }
}
fs.writeFileSync(`${RES}/summary.json`, JSON.stringify({ runs: Number(runs), seedBase: Number(seedBase), perProfile: Number(perProfile), jobs, failures, passed: totals, reached: reach }, null, 2) + '\n');
console.log(JSON.stringify(totals, null, 1));
console.log(`${jobs} jobs, ${failures} failing`);
// leave the default build in place
spawnSync('node', [`${DIR}/build.mjs`], { encoding: 'utf8' });
if (failures) process.exitCode = 1;
