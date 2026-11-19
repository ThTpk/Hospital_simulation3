// Acceptance criteria for the queue analysis: node tests/analysis.test.js
//
// The analysis page derives λ and the mean service time per unit from the rule tables, with no help from the
// simulation. So there are two independent answers to the same question, and this file is the check that they agree.
// When they stop agreeing, one of the two is wrong — and that is exactly the bug worth catching, because the page
// shows them side by side as if they were comparable.
import {CLINIC_KEYS, ST, STATIONS, STATION_KEYS, erlangC, runDay} from '../sim/shared/model.js';
import {CV, H0, H1, analyse, demandByHour, effectiveSvc, flowByHour, hourlyArrivals, hourlyLoad, queueRow, recommend, visitsForLane} from '../sim/shared/analysis.js';

let fails = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (cond) return;
  fails++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};
const near = (a, b, pct, label) => ok(b === 0 ? a === 0 : Math.abs(a - b) / Math.abs(b) <= pct / 100, label, `${a.toFixed(2)} vs ${b.toFixed(2)} (${b ? (((a - b) / b) * 100).toFixed(1) : '—'}%, allowed ${pct}%)`);
/** How far the run is from the prediction, as a share OF THE PREDICTION — the same number the table prints. */
const nearPred = (pred, measured, pct, label) =>
  ok(pred === 0 ? measured === 0 : Math.abs(measured - pred) / pred <= pct / 100, label, `predicted ${pred.toFixed(1)}, ran ${measured.toFixed(1)} (${(((measured - pred) / pred) * 100).toFixed(1)}%, allowed ${pct}%)`);

const SEEDS = [20261119, 7, 424242, 1000003];
const cfg = {balking: false}; // balking is a behaviour, not a route: it would hide a routing error behind a walk-out

// ---- measure the same day the analysis is predicting
const visits = {};
const svcSum = {};
const svcN = {};
for (const k of STATION_KEYS) {
  visits[k] = 0;
  svcSum[k] = 0;
  svcN[k] = 0;
}
let arrived = 0;
let stillIn = 0;
for (const seed of SEEDS) {
  const day = runDay({seed, cfg});
  arrived += day.totals.arrived;
  stillIn += day.patients.filter((p) => !p.left).length;
  for (const p of day.patients) {
    for (const s of p.steps) {
      if (!s.k) continue;
      if (s.kind !== ST.SERVICE && s.kind !== ST.BED) continue;
      visits[s.k]++;
      if (s.t1) {
        svcSum[s.k] += s.t1 - s.t0;
        svcN[s.k]++;
      }
    }
  }
}
for (const k of STATION_KEYS) visits[k] /= SEEDS.length;
console.log(`${SEEDS.length} seeds · ${(arrived / SEEDS.length).toFixed(0)} arrivals a day · ${(stillIn / SEEDS.length).toFixed(0)} still in the building at 20:00\n`);

const {perHour, docByClinic} = demandByHour(cfg);
const dayTotal = (k) => perHour[k].reduce((a, b) => a + b, 0);

// ---- 1. λ per unit: the derivation against the run
//
// The tolerance is not one number, because the error is not one thing. Up to the review visit the two agree to
// within a few per cent. Further down the chain the day's end starts cutting journeys off: a patient who reaches
// the ER at 18:30 and needs theatre never gets as far as recovery before 20:00, so the DES records fewer visits
// than the demand implies. That gap is real, and the page says so.
const TOL = {
  REG: 4, TRI: 4, DOC: 4, DEN: 2, PT: 4, PRC: 7, LAB: 5, XRY: 6, EKG: 10, CSH: 4, PHA: 4, ERT: 4,
  CT: 15, ER: 18, ADM: 22, ICU: 25, ANE: 26, OR: 26, PACU: 26, WARD: 30,
};
console.log('unit    derived       DES     diff');
for (const k of STATION_KEYS) {
  const a = dayTotal(k);
  if (a < 0.5 && visits[k] < 0.5) continue;
  console.log(
    `${k.padEnd(6)} ${a.toFixed(1).padStart(8)}  ${visits[k].toFixed(1).padStart(8)}  ${(a ? (((visits[k] - a) / a) * 100).toFixed(1) : '—').padStart(6)}%`,
  );
  nearPred(a, visits[k], TOL[k] ?? 15, `λ at ${k} agrees with the run`);
}
console.log('');

// ---- 2. the mean service time the analysis uses is the one the DES actually draws
for (const k of STATION_KEYS) {
  if (STATIONS[k].bed || svcN[k] < 30) continue; // a bed's stay is cut off by the end of the day, so it cannot be measured here
  // the run is a sample of `svcN` draws with coefficient of variation CV: three standard errors, on top of 6%
  const se = ((CV[STATIONS[k].dist] ?? 1) / Math.sqrt(svcN[k])) * 100;
  nearPred(effectiveSvc(k, cfg), svcSum[k] / svcN[k], 6 + 3 * se, `mean service time at ${k} matches the run`);
}

// ---- 3. the consultation rooms: the per-clinic split must add up to the unit
{
  const perClinic = CLINIC_KEYS.reduce((a, c) => a + docByClinic[c].reduce((x, y) => x + y, 0), 0);
  near(perClinic, dayTotal('DOC'), 0.5, 'the seven clinic pools add up to the consultation-room total');
}

// ---- 4. one review visit, not one per test — the rule the first version got wrong, read off the derivation
{
  const v = visitsForLane('walkin', cfg).visits;
  const tests = v.LAB + v.XRY + v.EKG + v.CT;
  ok(v.DOC > 1 && v.DOC < 2, 'a walk-in sees the doctor once, plus at most one review', `DOC ${v.DOC.toFixed(2)} visits with ${tests.toFixed(2)} tests ordered`);
  ok(v.DOC < 1 + tests, 'the review visit is one for the whole order set, not one per test', `DOC ${v.DOC.toFixed(2)} vs ${(1 + tests).toFixed(2)} if it were one each`);
  const c = visitsForLane('checkup', cfg).visits;
  ok(Math.abs(c.DOC - 1) < 1e-9, 'a check-up sees the doctor exactly once: every test runs first', `DOC ${c.DOC}`);
}

// ---- 5. the day window
{
  const arr = hourlyArrivals(cfg);
  ok(
    Object.values(arr).every((a) => a.slice(0, H0).every((v) => v === 0) && a.slice(H1).every((v) => v === 0)),
    'no arrival is counted outside the simulated day',
  );
  const twice = hourlyArrivals({...cfg, scale: {walkin: 2}});
  near(twice.walkin.reduce((a, b) => a + b, 0), arr.walkin.reduce((a, b) => a + b, 0) * 2, 0.5, 'the volume control scales the lane');
}

// ---- 6. Erlang-C: cv = 1 must collapse onto M/M/c exactly, and ρ >= 1 must refuse to give a steady-state answer
{
  const r = queueRow({lambda: 0.5, svc: 8, c: 5, cv: 1});
  const e = erlangC(0.5, 1 / 8, 5);
  near(r.Wq, e.wq, 0.01, 'M/G/c with cv = 1 is M/M/c');
  near(r.rho, e.rho, 0.01, 'ρ matches Erlang-C');
  const calm = queueRow({lambda: 0.5, svc: 8, c: 5, cv: 0});
  ok(calm.Wq < r.Wq, 'a constant service time waits less than an exponential one', `${calm.Wq.toFixed(2)} vs ${r.Wq.toFixed(2)} min`);
  const over = queueRow({lambda: 1, svc: 8, c: 5, cv: 1, hours: 540});
  ok(over.Wq === Infinity && over.overflow > 0, 'ρ ≥ 1 has no steady state and reports the queue left at closing', `overflow ${over.overflow.toFixed(0)}`);
}

// ---- 7. the recommendation has to work in the simulator, not only in the formula
//
// This is the end-to-end check: take what the page tells the user to do, feed it to the simulation, and see whether
// the wait really falls. A recommendation that only improves the algebra would pass every other test in this file.
{
  const base = analyse(cfg, {hour: 9});
  const recs = recommend(cfg, {hour: 9}).filter((r) => r.kind === 'slots' && r.add > 0);
  ok(recs.length > 0, 'the morning peak produces at least one recommendation');
  const after = {...cfg, servers: {}};
  for (const r of recs) after.servers[r.key] = r.to;
  const before = runDay({seed: SEEDS[0], cfg});
  const fixed = runDay({seed: SEEDS[0], cfg: after});
  // A unit that was never really waiting cannot be improved, and on thirty patients a day the measured wait is
  // mostly noise — changing the staffing changes the order of events and so the random draws themselves. So the
  // claim is only made where there was a wait worth cutting; elsewhere it only has to stay small.
  for (const r of recs) {
    const b = before.summary[r.key].waitMean;
    const a = fixed.summary[r.key].waitMean;
    if (b >= 3) ok(a < b, `adding slots at ${r.key} cuts its wait in the simulation`, `${b.toFixed(1)} → ${a.toFixed(1)} min`);
    else ok(a < 5, `${r.key} had no real queue to begin with and still has none`, `${b.toFixed(1)} → ${a.toFixed(1)} min`);
  }
  const worst = base.rows.find((r) => !r.bed);
  console.log(`\nbusiest unit at 09:00 by the formula: ${worst.name} · ρ ${(worst.rho * 100).toFixed(0)}% · Wq ${worst.Wq === Infinity ? '∞' : worst.Wq.toFixed(1)} min`);
  const recNames = recs.map((r) => `${r.key} +${r.add}`).join(', ');
  console.log(`recommended: ${recNames || 'nothing'}`);
}

// ---- 7b. the flow pass must actually throttle and carry, or it is doing nothing
{
  const {units} = flowByHour(cfg);
  const throttled = Object.values(units).filter((u) => u.throttled.some((v) => v > 0.5));
  const carried = Object.values(units).filter((u) => u.carry.some((v) => v > 0.5));
  ok(throttled.length > 0, 'at least one unit is held back by its feeder during the day', throttled.map((u) => u.key).join(', '));
  ok(carried.length > 0, 'at least one unit carries a backlog into the next hour', carried.map((u) => u.key).join(', '));
  for (const u of Object.values(units)) {
    if (u.bed) continue;
    const bad = u.done.findIndex((d, h) => d > u.cap[h] + 1e-6);
    ok(bad < 0, `${u.key} never finishes more than its capacity in an hour`, bad >= 0 ? `hour ${bad}: ${u.done[bad].toFixed(1)} done, capacity ${u.cap[bad].toFixed(1)}` : '');
  }
}

// ---- 8. the hourly load must find the peak the simulation finds
{
  const load = hourlyLoad(cfg);
  const day = runDay({seed: SEEDS[0], cfg});
  const docCells = load.DOC.cells;
  const peak = docCells.reduce((a, c) => (c.rho > a.rho ? c : a), docCells[0]);
  let simPeak = {q: -1, h: -1};
  for (const row of day.history) {
    const q = row.stations.DOC.q;
    if (q > simPeak.q) simPeak = {q, h: Math.floor(row.t / 60)};
  }
  ok(Math.abs(peak.h - simPeak.h) <= 2, 'the formula puts the consultation-room peak within two hours of the run', `formula ${peak.h}:00 · run ${simPeak.h}:00`);
  console.log(`consultation rooms peak: formula ${peak.h}:00 (ρ ${(peak.rho * 100).toFixed(0)}%) · simulation ${simPeak.h}:00 (${simPeak.q} waiting)`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
