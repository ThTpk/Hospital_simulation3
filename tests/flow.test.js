// Acceptance criteria 1-5 from docs/SPEC.md §11, as a runnable check: node tests/flow.test.js
// These are the rules that must hold for every patient on every seed, not "it looked right when I ran it".
// Two of them are bugs the first version of this simulator actually shipped.
import {CLINICS, DAY_END, DAY_START, ST, STATIONS, STATION_KEYS, findJourney, hhmm, PROCESSES, runDay} from '../sim/shared/model.js';

let fails = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (cond) return;
  fails++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};

const SEEDS = [20261119, 7, 424242, 1000003];
console.log(`running ${SEEDS.length} seeds\n`);

for (const seed of SEEDS) {
  const day = runDay({seed});
  const served = (p, k) => p.steps.filter((s) => s.k === k && (s.kind === ST.SERVICE || s.kind === ST.BED)).length;
  console.log(`seed ${seed}: ${day.totals.arrived} arrived, ${day.totals.left} left, ${day.totals.admitted} admitted, ${day.totals.balked} balked, ${day.totals.reneged} reneged`);

  // ---- 1. one review visit, not one per test
  {
    let worst = null;
    for (const p of day.patients) {
      if (p.lane === 'er' || p.lane === 'dental' || p.lane === 'vacc') continue;
      const n = served(p, 'DOC');
      const orders = Object.values(p.orders).filter(Boolean).length;
      const limit = p.lane === 'checkup' ? 1 : orders > 0 ? 2 : 1;
      if (n > limit && (!worst || n > worst.n)) worst = {p, n, orders, limit};
    }
    ok(!worst, 'a patient with several orders sees the doctor once for review', worst && `patient ${worst.p.id} (${worst.p.lane}, ${worst.orders} orders) saw DOC ${worst.n}x, limit ${worst.limit}`);
  }

  // ---- 2. nobody with a prescription leaves without paying
  {
    // walking out mid-queue is a legitimate way to leave without paying; finishing the visit is not
    const bad = day.patients.filter((p) => p.rx && p.left && !p.balked && !p.reneged && !p.stuck && !p.admitted && served(p, 'CSH') === 0);
    ok(bad.length === 0, 'everyone who completes a visit with a prescription passes billing', bad.length ? `${bad.length} patients, first is id ${bad[0].id} (${bad[0].lane})` : '');
  }

  // ---- 3. an admission is counted once, however long the route to the bed
  {
    const bad = day.patients.filter((p) => {
      const beds = served(p, 'WARD') + served(p, 'ICU');
      return beds > 1;
    });
    ok(bad.length === 0, 'ER to theatre to a ward bed counts one admission', bad.length ? `${bad.length} patients occupied two beds, first id ${bad[0].id}` : '');
    const admittedFlag = day.patients.filter((p) => p.admitted).length;
    ok(admittedFlag === day.totals.admitted, 'the admitted total matches the flagged patients', `${day.totals.admitted} vs ${admittedFlag}`);
  }

  // ---- 4. the most critical arrivals are not left in the queue
  {
    let worst = 0;
    let who = null;
    for (const p of day.patients) {
      if (p.esi !== 1) continue;
      const q = p.steps.find((s) => s.k === 'ER' && s.kind === ST.QUEUE);
      const w = q && q.wait != null ? q.wait : 0;
      if (w > worst) {
        worst = w;
        who = p;
      }
    }
    ok(worst <= 5, 'an ESI 1 arrival reaches an ER bed within 5 minutes', who ? `worst wait ${worst.toFixed(1)} min (patient ${who.id} at ${hhmm(who.tArrive)})` : '');
  }

  // ---- 5. conservation: everybody is in exactly one place
  {
    let bad = null;
    for (const p of day.patients) {
      // the recorded steps must tile the patient's time without gaps or overlaps
      for (let i = 1; i < p.steps.length; i++) {
        const a = p.steps[i - 1];
        const b = p.steps[i];
        if (Math.abs(a.t1 - b.t0) > 1e-6) {
          bad = `patient ${p.id} step ${i}: ${a.kind}@${a.k} ends ${a.t1.toFixed(2)} but ${b.kind}@${b.k} starts ${b.t0.toFixed(2)}`;
          break;
        }
        if (b.t1 && b.t1 < b.t0 - 1e-9) {
          bad = `patient ${p.id} step ${i} ends before it starts`;
          break;
        }
      }
      if (bad) break;
    }
    ok(!bad, 'each patient timeline tiles without gaps or overlaps', bad || '');
    const anyOpen = day.patients.some((p) => p.steps.some((s) => !s.t1));
    ok(!anyOpen, 'no recorded step is left open at the end of the day');
  }

  // ---- the recorded day must stay inside its own window
  {
    const bad = day.patients.find((p) => p.steps.some((s) => s.t0 < DAY_START - 1e-6 || s.t1 > DAY_END + 1e-6));
    ok(!bad, 'no step falls outside the simulated window', bad ? `patient ${bad.id}` : '');
  }

  // ---- every named process must be findable in the recorded day
  {
    const missing = PROCESSES.filter((pr) => !findJourney(day, pr));
    ok(missing.length === 0, 'every named process matches a real patient in the day', missing.length ? missing.map((m) => m.key).join(', ') : '');
  }
}

// ---- determinism: the same seed gives the same day
{
  const a = runDay({seed: 99});
  const b = runDay({seed: 99});
  ok(a.totals.arrived === b.totals.arrived && a.totals.left === b.totals.left, 'the same seed gives the same day');
  const sa = JSON.stringify(Object.values(a.summary).map((s) => [s.key, s.served, Math.round(s.waitMean * 100)]));
  const sb = JSON.stringify(Object.values(b.summary).map((s) => [s.key, s.served, Math.round(s.waitMean * 100)]));
  ok(sa === sb, 'the same seed gives the same per-unit summary');
}

// ---- speed: a whole day with no drawing, for the compare-the-day panel
{
  const t0 = Date.now();
  runDay({seed: 5});
  const ms = Date.now() - t0;
  ok(ms < 900, `a whole day runs fast enough to compare scenarios live (${ms} ms)`, ms >= 900 ? `took ${ms} ms` : '');
  console.log(`\none day = ${ms} ms`);
}

// ---- the report
{
  const day = runDay({seed: 20261119});
  console.log('\nunit                       served   util   mean    p50    p90    max   maxQ');
  for (const k of STATION_KEYS) {
    const s = day.summary[k];
    if (!s.served) continue;
    console.log(
      `${s.key.padEnd(5)} ${s.name.slice(0, 20).padEnd(20)} ${String(s.served).padStart(6)} ${(s.util * 100).toFixed(0).padStart(5)}% ` +
        `${s.waitMean.toFixed(1).padStart(6)} ${String(s.waitP50).padStart(6)} ${String(s.waitP90).padStart(6)} ${s.waitMax.toFixed(0).padStart(6)} ${String(s.maxQueue).padStart(6)}`,
    );
  }
  // only the two general outpatient lanes: check-up and physiotherapy patients also use DOC and would inflate it
  const opd = day.patients.filter((p) => p.lane === 'walkin' || p.lane === 'appt');
  const docVisits = opd.reduce((a, p) => a + p.steps.filter((s) => s.k === 'DOC' && s.kind === ST.SERVICE).length, 0);
  const ordered = opd.filter((p) => Object.values(p.orders).some(Boolean)).length;
  console.log(`\nordered at least one test: ${((ordered / opd.length) * 100).toFixed(1)}%  (docs/capacity-check.py expects 51.2%)`);
  console.log(`consultations per outpatient: ${(docVisits / opd.length).toFixed(2)}  (expects about 1.51)`);
  console.log(`still in the hospital at ${hhmm(DAY_END)}: ${day.patients.filter((p) => p.stuck).length}`);
  console.log('\nprocess                                    patient  units  door-to-door');
  for (const pr of PROCESSES) {
    const j = findJourney(day, pr);
    if (!j) {
      console.log(`${pr.name.slice(0, 40).padEnd(42)} (none found)`);
      continue;
    }
    const p = j.patient;
    const end = p.left ? p.tLeft : DAY_END;
    console.log(`${pr.name.slice(0, 40).padEnd(42)} ${String(p.id).padStart(7)} ${String(j.visited.length).padStart(6)}  ${(end - p.tArrive).toFixed(0).padStart(5)} min  ${j.visited.join(' > ')}`);
  }
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
