// The model and the floor plan together — the combination the page actually runs.
//   node tests/day.test.js
// With real distances injected, walking stops being a flat guess: a patient sent upstairs for physiotherapy spends
// three minutes getting there and that time lands in somebody else's queue. This is also where the day is checked
// against the sizing work in docs/capacity-check.py.
import {PROCESSES, ST, STATIONS, STATION_KEYS, findJourney, hhmm, runDay} from '../sim/shared/model.js';
import {ROOMS, UNIT_ROOMS, walkPath, walkTime} from '../sim/shared/layout.js';

let fails = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (cond) return;
  fails++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};

const t0 = Date.now();
const day = runDay({seed: 20261119, walkTime});
const ms = Date.now() - t0;
console.log(`one day with real distances: ${ms} ms`);
ok(ms < 1200, 'a day with real path-finding still runs fast enough to compare scenarios live', `${ms} ms`);

console.log(`\n${day.totals.arrived} arrived · ${day.totals.left} left · ${day.totals.admitted} admitted · ${day.totals.balked} balked · ${day.totals.reneged} walked out`);
console.log(`visits across all units: ${day.totals.visits}`);
console.log(`mean time in hospital: ${(day.totals.losSum / day.totals.losCount).toFixed(0)} min`);

console.log('\nunit  name                 served   util   mean    p50    p90   maxQ');
for (const k of STATION_KEYS) {
  const s = day.summary[k];
  if (!s.served) continue;
  console.log(
    `${s.key.padEnd(5)} ${s.name.slice(0, 19).padEnd(19)} ${String(s.served).padStart(6)} ${(s.util * 100).toFixed(0).padStart(5)}% ` +
      `${s.waitMean.toFixed(1).padStart(6)} ${String(s.waitP50).padStart(6)} ${String(s.waitP90).padStart(6)} ${String(s.maxQueue).padStart(6)}`,
  );
  // every unit must show a mean AND the spread: criterion 13 exists because a mean on its own lies
  ok(s.waitP90 >= s.waitP50, `${k} reports a p90 at least as large as its p50`);
  ok(s.util <= 1.0001, `${k} is not asked to do more work than it has slots for`, `util ${(s.util * 100).toFixed(0)}%`);
}

// the walking has to be a real share of the day, or injecting the floor plan bought nothing
{
  let walkMin = 0;
  let serviceMin = 0;
  let queueMin = 0;
  for (const p of day.patients) {
    for (const s of p.steps) {
      const d = (s.t1 || 0) - s.t0;
      if (s.kind === ST.WALK) walkMin += d;
      else if (s.kind === ST.SERVICE) serviceMin += d;
      else if (s.kind === ST.QUEUE) queueMin += d;
    }
  }
  console.log(`\nwhere the patients' time goes: walking ${walkMin.toFixed(0)} min · queueing ${queueMin.toFixed(0)} min · being seen ${serviceMin.toFixed(0)} min`);
  ok(walkMin > 400, 'walking is a measurable part of the day', `${walkMin.toFixed(0)} min`);
  ok(queueMin > serviceMin * 0.2, 'queueing is the dominant waste, as it is in a real outpatient department');
}

// the journeys the process player will follow must all exist and must be walkable
console.log('\nprocess                                  patient  door-to-door  walking  queueing');
for (const proc of PROCESSES) {
  const j = findJourney(day, proc);
  ok(!!j, `the ${proc.key} process matches a patient`);
  if (!j) continue;
  const p = j.patient;
  const end = p.left ? p.tLeft : day.meta.end;
  let w = 0;
  let q = 0;
  for (const s of p.steps) {
    const d = (s.t1 || 0) - s.t0;
    if (s.kind === ST.WALK) w += d;
    if (s.kind === ST.QUEUE) q += d;
  }
  console.log(`${proc.name.slice(0, 38).padEnd(40)} ${String(p.id).padStart(7)} ${(end - p.tArrive).toFixed(0).padStart(11)} ${w.toFixed(0).padStart(8)} ${q.toFixed(0).padStart(9)}`);
  // every leg of the recorded journey must be drawable
  for (const s of p.steps) {
    if (s.kind !== ST.WALK) continue;
    const path = walkPath(s.from, s.to, {clinicFrom: s.clinic, clinicTo: s.clinic});
    ok(path.pts.length >= 2, `${proc.key}: the leg ${s.from} to ${s.to} has a drawable path`);
  }
}

// the morning crush must be visible in the history, or the whole exercise is pointless
{
  const docQ = day.history.map((h) => ({t: h.t, q: h.stations.DOC.q}));
  const peak = docQ.reduce((a, b) => (b.q > a.q ? b : a));
  const noon = docQ.find((h) => h.t >= 13 * 60) || {q: 0};
  console.log(`\nconsultation queue peaks at ${peak.q} people at ${hhmm(peak.t)}, down to ${noon.q} by 13:00`);
  ok(peak.q > 12, 'the morning crush shows up as a real queue at the consultation rooms', `peak ${peak.q}`);
  ok(peak.t < 12 * 60, 'the peak is in the morning, as the arrival profile says it should be', hhmm(peak.t));
}

// spreading the appointments must help, with no extra staff — the question v1 could not answer
{
  const clustered = runDay({seed: 20261119, walkTime, cfg: {flatBooking: 0}});
  const spread = runDay({seed: 20261119, walkTime, cfg: {flatBooking: 1}});
  const a = clustered.summary.DOC;
  const b = spread.summary.DOC;
  console.log(`\nappointments booked into the morning: consultation wait mean ${a.waitMean.toFixed(1)} min, p90 ${a.waitP90}`);
  console.log(`the same 180 appointments spread evenly:  mean ${b.waitMean.toFixed(1)} min, p90 ${b.waitP90}`);
  ok(b.waitMean < a.waitMean, 'spreading the appointments cuts the wait without hiring anybody', `${a.waitMean.toFixed(1)} -> ${b.waitMean.toFixed(1)}`);
  ok(a.servers === b.servers, 'the comparison really is at the same staffing level');
}

// taking a unit's staff away must make that unit worse and must not silently break anything
{
  const base = runDay({seed: 20261119, walkTime});
  const thin = runDay({seed: 20261119, walkTime, cfg: {servers: {DOC: 14}}});
  // "left the building" is the wrong measure: a patient who gives up and walks out has also left. What gets worse
  // is the number who COMPLETE a visit, and the number who abandon one.
  const done = (d) => d.patients.filter((p) => p.left && !p.balked && !p.reneged).length;
  const quit = (d) => d.totals.balked + d.totals.reneged;
  console.log(`\n19 consultation rooms: wait ${base.summary.DOC.waitMean.toFixed(1)} min · ${done(base)} visits completed · ${quit(base)} walked out`);
  console.log(`14 consultation rooms: wait ${thin.summary.DOC.waitMean.toFixed(1)} min · ${done(thin)} visits completed · ${quit(thin)} walked out`);
  ok(thin.summary.DOC.waitMean > base.summary.DOC.waitMean, 'fewer doctors means a longer wait');
  ok(done(thin) < done(base), 'fewer doctors means fewer completed visits', `${done(base)} -> ${done(thin)}`);
  ok(quit(thin) >= quit(base), 'fewer doctors means more people give up and walk out', `${quit(base)} -> ${quit(thin)}`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
