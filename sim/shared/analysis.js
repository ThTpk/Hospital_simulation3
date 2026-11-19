// Queue theory over the same hospital the 3D shows — computed from the rule tables, NOT from the simulation.
//
// SmartHospital could read λ per unit straight off its routes, because every patient there was locked to a fixed
// route at birth. This model has no fixed routes: a doctor draws an order set from `ORDER_RULES`, and `resolvePlan`
// unfolds it. So λ has to be *derived* — the expected number of times a patient of each lane visits each unit,
// taken over the order-set probabilities, the clinic mix, the insurance mix and the ESI mix.
//
// That derivation is the whole point of this file. It gives the analysis page a λ that owes nothing to the
// discrete-event run, which is what makes the comparison in the table worth anything: the Erlang-C column and the
// DES column are two independent answers to the same question, so when they disagree, one of them is wrong.
// `tests/analysis.test.js` holds them against each other on every seed.
//
// Mirrors of model.js logic that MUST stay in step:
//   consult()      disposition: admit 0.05, else procedure 0.10, else home; rx 0.83; icu 0.04 of admits
//   erAssess()     one draw: r < 0.11 -> theatre; r < 0.11+0.28 -> admit; else home; icu 0.10 of admitted
//   resolveOPD()   one review visit after the whole order set, not one per test
//   startService() REG and CSH scale with the insurance mix, ER with ESI, a bed with 0.6 + U(0,1.1)
//   staffedNow()   the lunch dip and the thin early/late staffing
//   the dispatcher a clinic pool gets round(pool.rooms * staffed / DOC.c) of the consultation rooms
import {CLINICS, CLINIC_KEYS, DAY_END, DAY_START, ESI, INSURANCE, LANES, LANE_KEYS, ORDER_RULES, RULES, STATIONS, STATION_KEYS, erlangC} from './model.js';

const DIAG = ['lab', 'xray', 'ekg', 'ct'];
const DIAG_STATION = {lab: 'LAB', xray: 'XRY', ekg: 'EKG', ct: 'CT'};

export const H0 = DAY_START / 60; // 6
export const H1 = DAY_END / 60; // 20

/** CV of the service time, by distribution. The DES draws from these, so the M/G/c correction uses the same numbers. */
export const CV = {det: 0, erlang4: 0.5, lognorm: 0.55, exp: 1};
export const DIST_NAME = {
  lognorm: 'เบ้ขวา (Lognormal, CV 0.55)',
  erlang4: 'ปานกลาง (Erlang-4, CV 0.5)',
  det: 'คงที่ (Deterministic, CV 0)',
  exp: 'แปรปรวนสูง (Exponential, CV 1)',
};

/** Which unit feeds which. One feeder each: enough for the throttle, and honest about being an approximation. */
const UPSTREAM = {
  TRI: 'REG', DOC: 'TRI', LAB: 'DOC', XRY: 'DOC', EKG: 'DOC', CT: 'DOC', PRC: 'DOC',
  CSH: 'DOC', PHA: 'CSH', DEN: 'REG', PT: 'DOC', ER: 'ERT', OR: 'ANE', PACU: 'OR',
  ADM: 'DOC', WARD: 'ADM', ICU: 'ADM',
};

/** A topological order of the units: every feeder comes before what it feeds. */
const TOPO = ['REG', 'ERT', 'ANE', 'TRI', 'DEN', 'DOC', 'ER', 'LAB', 'XRY', 'EKG', 'CT', 'PRC', 'PT', 'OR', 'PACU', 'ADM', 'CSH', 'PHA', 'WARD', 'ICU'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const sum = (a) => a.reduce((x, y) => x + y, 0);

/** The first ORDER_RULES row that matches, exactly as matchRule() in model.js would pick it. */
function ruleFor({lane, clinic, esi}) {
  for (const r of ORDER_RULES) {
    const w = r.when;
    if (w.lane && w.lane !== lane) continue;
    if (w.clinic && w.clinic !== clinic) continue;
    if (w.esiAtMost != null && !(esi && esi <= w.esiAtMost)) continue;
    return r;
  }
  return ORDER_RULES[ORDER_RULES.length - 1];
}

/** The probability each test is ordered, with the page's order-rate controls applied the way consult() applies them. */
function orderP(who, cfg, {er = false} = {}) {
  const rule = ruleFor(who);
  const out = {};
  for (const d of DIAG) {
    const k = (cfg.orderK ?? 1) * (er ? 1 : cfg.orders?.[d] ?? 1); // erAssess() ignores the per-test control
    out[d] = clamp01((rule.orders[d] || 0) * k);
  }
  return out;
}

const pAny = (o) => 1 - DIAG.reduce((a, d) => a * (1 - o[d]), 1);

/** The clinic mix of the patients a lane sends to the consultation rooms. */
function clinicMix(lane) {
  if (lane === 'checkup') return {med: 1};
  if (lane === 'physio') return {ortho: 1};
  if (lane === 'dental' || lane === 'vacc' || lane === 'er' || lane === 'elective') return {};
  return Object.fromEntries(CLINIC_KEYS.map((c) => [c, CLINICS[c].share]));
}

/**
 * Expected visits per unit for one patient of a lane, plus the per-clinic split of the consultation rooms.
 * This is the model's routing read as arithmetic rather than played out.
 */
export function visitsForLane(lane, cfg = {}) {
  const v = {};
  const doc = {}; // per clinic
  const add = (k, n) => {
    if (n > 0) v[k] = (v[k] || 0) + n;
  };
  const R = RULES;

  if (lane === 'er') {
    const pLow = ESI.filter((e) => e.level <= 2).reduce((a, e) => a + e.share, 0);
    const o = {};
    const oLow = orderP({lane: 'er', esi: 1}, cfg, {er: true});
    const oHigh = orderP({lane: 'er', esi: 4}, cfg, {er: true});
    for (const d of DIAG) o[d] = pLow * oLow[d] + (1 - pLow) * oHigh[d];
    add('ERT', 1);
    add('ER', 1 + pAny(o)); // back to the bed to be reassessed once the whole set is done
    for (const d of DIAG) add(DIAG_STATION[d], o[d]);
    const pOR = R.pErOR;
    const pAdm = R.pErAdmit;
    const pHome = 1 - pOR - pAdm;
    add('ANE', pOR);
    add('OR', pOR);
    add('PACU', pOR);
    add('ADM', pAdm);
    add('ICU', (pOR + pAdm) * R.pErICU);
    add('WARD', (pOR + pAdm) * (1 - R.pErICU));
    add('CSH', pHome);
    add('PHA', pHome * 0.78); // erAssess(): a discharged emergency leaves with a prescription 78% of the time
    return {visits: v, doc};
  }

  if (lane === 'dental') {
    add('REG', 1);
    add('DEN', 1);
    add('CSH', 1);
    add('PHA', 0.8);
    return {visits: v, doc};
  }
  if (lane === 'vacc') {
    add('REG', 1);
    add('TRI', 1);
    add('PRC', 1);
    add('CSH', 1);
    return {visits: v, doc};
  }
  if (lane === 'elective') {
    const stay = R.pElectiveStay;
    add('REG', 1);
    add('ANE', 1);
    add('LAB', 1);
    add('OR', 1);
    add('PACU', 1);
    add('ADM', stay);
    add('WARD', stay);
    add('CSH', 1 - stay);
    add('PHA', 1 - stay);
    return {visits: v, doc};
  }

  // ---- the lanes that see an outpatient doctor: walk-in, appointment, check-up, physiotherapy
  add('REG', 1);
  if (lane !== 'physio') add('TRI', 1);

  const mix = clinicMix(lane);
  let docVisits = 0;
  for (const c of Object.keys(mix)) {
    const share = mix[c];
    if (!share) continue;
    // physio: consult() draws the order set and then throws it away, so there is never a review visit
    // check-up: every test runs BEFORE the doctor, so they are all done by the time the set is drawn
    const o = lane === 'physio' ? {lab: 0, xray: 0, ekg: 0, ct: 0} : orderP({lane, clinic: c}, cfg);
    const extra = lane === 'checkup' || lane === 'physio' ? 0 : pAny(o);
    doc[c] = (doc[c] || 0) + share * (1 + extra);
    docVisits += share * (1 + extra);
    if (lane !== 'checkup') for (const d of DIAG) add(DIAG_STATION[d], share * o[d]);
  }
  add('DOC', docVisits);
  if (lane === 'checkup') {
    add('LAB', 1);
    add('XRY', 1);
    add('EKG', 1);
  }

  if (lane === 'physio') {
    add('PT', 1);
    add('CSH', 1);
    return {visits: v, doc};
  }
  const pAdmit = R.pAdmitOPD;
  const pProc = (1 - pAdmit) * R.pProcedure;
  const pHome = 1 - pAdmit - pProc;
  add('ADM', pAdmit);
  add('ICU', pAdmit * 0.04);
  add('WARD', pAdmit * 0.96);
  add('PRC', pProc);
  add('CSH', pProc + pHome);
  add('PHA', (pProc + pHome) * R.pRx);
  return {visits: v, doc};
}

/**
 * Patients entering per hour, lane by lane — the same blend of booking patterns the day itself uses.
 *
 * Arrivals outside 06:00–20:00 are dropped, because `runDay` drops them too (`if (a.t < DAY_START) continue`, and
 * the loop stops at DAY_END). Emergencies are the lane this matters to: a third of the 75 a day in the table arrive
 * at night and are not part of this day at all. Counting them would make λ at the ER a third too high.
 */
export function hourlyArrivals(cfg = {}) {
  const out = {};
  for (const lk of LANE_KEYS) {
    const L = LANES[lk];
    const k = L.booked ? cfg.flatBooking ?? 0 : 0;
    const shape = L.shape.map((v, i) => v * (1 - k) + (L.flat || L.shape)[i] * k);
    const s = sum(shape) || 1;
    const perDay = (L.perDay || 0) * (cfg.scale?.[lk] ?? 1);
    out[lk] = shape.map((v, h) => (h < H0 || h >= H1 ? 0 : (v / s) * perDay * (cfg.hourK ? cfg.hourK[h] ?? 1 : 1)));
  }
  return out;
}

/** The effective mean service time of a unit: the table value, bent by the mixes that really change it. */
export function effectiveSvc(key, cfg = {}) {
  const d = STATIONS[key];
  const base = cfg.svc?.[key] ?? d.svc;
  if (key === 'REG') return base * sum(INSURANCE.map((i) => i.share * i.regK));
  if (key === 'CSH') return base * sum(INSURANCE.map((i) => i.share * i.cshK));
  if (key === 'ER') return base * sum(ESI.map((e) => e.share * e.svcK));
  if (d.bed) return base * 1.15; // startService(): a bed's stay is mean * (0.6 + U(0, 1.1))
  return base;
}

/** staffedNow() from model.js, as a function of the hour instead of the clock. */
export function staffedAt(key, c, hour, cfg = {}) {
  if (cfg.breaks === false) return c;
  const d = STATIONS[key];
  if (d.bed || key === 'ER' || key === 'ERT') return c;
  if (hour >= 12 && hour < 13) return Math.max(1, Math.round(c * 0.66));
  if (hour < 7 || hour > 16) return key === 'CSH' || key === 'PHA' ? Math.max(1, Math.round(c * 0.3)) : Math.max(0, Math.round(c * 0.15));
  return c;
}

/** Demand at each unit, per hour of the day, from the lane volumes and the expected visits. */
export function demandByHour(cfg = {}) {
  const arr = hourlyArrivals(cfg);
  const perLane = Object.fromEntries(LANE_KEYS.map((lk) => [lk, visitsForLane(lk, cfg)]));
  const out = {};
  const docByClinic = {};
  for (const k of STATION_KEYS) out[k] = new Array(24).fill(0);
  for (const c of CLINIC_KEYS) docByClinic[c] = new Array(24).fill(0);
  for (const lk of LANE_KEYS) {
    const {visits, doc} = perLane[lk];
    for (let h = 0; h < 24; h++) {
      const n = arr[lk][h];
      if (!n) continue;
      for (const k of Object.keys(visits)) out[k][h] += n * visits[k];
      for (const c of Object.keys(doc)) docByClinic[c][h] += n * doc[c];
    }
  }
  return {perHour: out, docByClinic, arrivals: arr, perLane};
}

/** M/G/c: Erlang-C for the M/M/c part, Allen–Cunneen for the variability correction. λ and μ in the same unit. */
export function queueRow({lambda, svc, c, cv = 1, hours = 9}) {
  const mu = 1 / Math.max(0.01, svc);
  const cap = c * mu;
  const out = {lambda, svc, c, cv, mu, cap, rho: c > 0 ? lambda / cap : Infinity};
  if (c <= 0 || lambda <= 0) {
    return {...out, pWait: 0, Lq: 0, Wq: 0, W: svc, L: 0, q95: 0, w95: 0, overflow: c <= 0 ? lambda * hours : 0, saturated: c <= 0};
  }
  const e = erlangC(lambda, mu, c);
  if (!(e.wq < Infinity)) {
    // ρ >= 1: there is no steady state. The honest answer is the queue it leaves behind at closing time.
    return {...out, pWait: 1, Lq: Infinity, Wq: Infinity, W: Infinity, L: Infinity, q95: Infinity, w95: Infinity, overflow: (lambda - cap) * hours, saturated: true};
  }
  const corr = (1 + cv * cv) / 2; // Allen–Cunneen; cv = 1 collapses to M/M/c
  const Wq = e.wq * corr;
  const rho = e.rho; // erlangC already returns (λ/μ)/c
  const q95 = rho > 0 && e.pWait > 0.05 ? Math.ceil(Math.log(0.05 / e.pWait) / Math.log(rho)) : 0;
  const w95 = e.pWait > 0.05 ? (Math.log(e.pWait / 0.05) / (cap - lambda)) * corr : 0;
  return {...out, pWait: e.pWait, Lq: Wq * lambda, Wq, W: Wq + svc, L: (Wq + svc) * lambda, q95, w95, overflow: 0, saturated: false};
}

/**
 * A bed is not a counter. What matters is occupancy: the admissions a day brings, each holding a bed for a mean
 * stay of `svcMin` minutes, against the bed-minutes the unit has. A wait for a slot means nothing here, so the
 * queueing columns come back NaN and the table prints them as a dash.
 */
function bedRow(perDay, slots, svcMin) {
  const occ = slots > 0 ? (perDay * svcMin) / (slots * 1440) : Infinity;
  return {
    lambda: perDay, svc: svcMin, c: slots, cv: 1, mu: 1 / svcMin, cap: (slots * 1440) / svcMin,
    rho: occ, pWait: NaN, Lq: NaN, Wq: NaN, W: svcMin, L: occ * slots, q95: NaN, w95: NaN,
    overflow: 0, saturated: occ >= 1, perDay, los: svcMin,
  };
}

/**
 * The day as a flow, hour by hour.
 *
 * A unit's own demand is what the rule tables say should reach it in that hour. What it is actually offered is a
 * different number, and the difference is the thing SmartHospital's per-hour table could not show:
 *
 *   - a unit cannot be offered more than its feeder pushed through ("ถูกบีบ"), and
 *   - whatever it could not finish this hour is still queueing at the start of the next one ("ค้าง").
 *
 * Together those make demand arrive LATE, which is why a thin registration desk at 06:00 moves the consultation-room
 * peak to mid-morning instead of leaving it at opening time. Without this pass the formula puts that peak at 06:00
 * and the simulation puts it at 10:00 — and the simulation is right.
 *
 * The approximation: one feeder per unit, with a fixed ratio between the feeder's throughput and what reaches the
 * unit (the expected visits say what that ratio is). A unit fed from two directions — the laboratory takes
 * outpatients from the clinic and emergencies from the bed — is charged to its main feeder.
 *
 * One trap in that proportional split, which cost a wrong answer before it was closed: when a feeder clears a
 * backlog it pushes through far more than one hour's worth, and a flat share of that surge can hand a small unit
 * more patients than exist for it in the whole morning. Dental came out at ρ 157% at 09:00 that way, on 35 patients
 * a day and capacity for 84. So a unit's inflow is also capped by its own demand that has not been delivered yet
 * (`waiting`): nobody can be sent to a unit who was never going there.
 */
export function flowByHour(cfg = {}) {
  const dem = demandByHour(cfg);
  const total = {};
  for (const k of STATION_KEYS) total[k] = sum(dem.perHour[k]);
  const out = {};
  for (const k of TOPO) {
    const d = STATIONS[k];
    if (!total[k]) continue;
    const slots = cfg.servers?.[k] ?? d.c;
    const svc = effectiveSvc(k, cfg);
    const u = {
      key: k, name: d.name, dept: d.dept, bed: !!d.bed, slots, svc, max: d.max,
      dist: cfg.dist?.[k] ?? d.dist, sizing: d.sizing, result: d.result || 0,
      demand: dem.perHour[k].slice(), offered: new Array(24).fill(0), done: new Array(24).fill(0),
      carry: new Array(24).fill(0), cap: new Array(24).fill(0), staffed: new Array(24).fill(0),
      throttled: new Array(24).fill(0),
    };
    for (let h = 0; h < 24; h++) {
      u.staffed[h] = staffedAt(k, slots, h, cfg);
      u.cap[h] = (u.staffed[h] * 60) / svc;
    }
    out[k] = u;
  }
  const carry = Object.fromEntries(Object.keys(out).map((k) => [k, 0])); // queueing AT the unit
  const waiting = Object.fromEntries(Object.keys(out).map((k) => [k, 0])); // due at the unit but still held upstream
  for (let h = 0; h < 24; h++) {
    for (const k of TOPO) {
      const u = out[k];
      if (!u) continue;
      const up = UPSTREAM[k];
      const fed = up && out[up] && total[up] > 0;
      const due = u.demand[h] + waiting[k];
      const inflow = fed ? Math.min(out[up].done[h] * (total[k] / total[up]), due) : u.demand[h];
      waiting[k] = Math.max(0, due - inflow);
      u.throttled[h] = waiting[k];
      const offered = inflow + carry[k];
      u.offered[h] = offered;
      u.inflow = u.inflow || new Array(24).fill(0);
      u.inflow[h] = inflow;
      // a bed holds a patient for days: it does not "finish" them inside the hour, so a bed carries no backlog
      const done = u.bed ? offered : Math.min(offered, u.cap[h]);
      u.done[h] = done;
      carry[k] = u.bed ? 0 : offered - done;
      u.carry[h] = carry[k];
    }
  }
  return {units: out, demand: dem};
}

/**
 * The whole analysis at one hour of the day.
 * `cfg` is the simulator's own config object, so the table and the 3D can never be analysing different hospitals.
 */
export function analyse(cfg = {}, {hour = 9, targetWq = 15, rhoMax = 0.85, hours = 9} = {}) {
  const flow = flowByHour(cfg);
  const dem = flow.demand;
  const rows = [];

  for (const k of STATION_KEYS) {
    const u = flow.units[k];
    if (!u) continue; // INFO and the porters are never queued for in this model
    const d = STATIONS[k];
    const lam = u.offered[hour];
    const row = d.bed
      ? bedRow(sum(u.demand), u.slots, u.svc)
      : queueRow({lambda: lam / 60, svc: u.svc, c: u.staffed[hour], cv: CV[u.dist] ?? 1, hours: hours * 60});
    rows.push({
      key: k,
      name: d.name,
      dept: d.dept,
      bed: !!d.bed,
      slots: u.slots,
      staffed: u.staffed[hour],
      max: d.max,
      dist: u.dist,
      sizing: d.sizing,
      result: d.result || 0,
      lambdaDemand: u.demand[hour],
      lambda: lam,
      carryIn: hour > 0 ? u.carry[hour - 1] : 0,
      carryOut: u.carry[hour],
      capped: u.throttled[hour] > 0.5,
      cappedBy: u.throttled[hour] > 0.5 ? UPSTREAM[k] : null,
      throughput: u.cap[hour],
      perDayDemand: sum(u.demand),
      ...row,
      overTarget: row.Wq > targetWq,
      overRho: row.rho >= rhoMax,
    });
  }
  rows.sort((a, b) => (b.rho === Infinity ? 1 : 0) - (a.rho === Infinity ? 1 : 0) || b.rho - a.rho);

  // ---- the consultation rooms are seven pools, not one: a bottleneck in Medicine says nothing about Eye
  const docFlow = flow.units.DOC;
  const docTotal = sum(docFlow.demand) || 1;
  const clinics = CLINIC_KEYS.map((c) => {
    const C = CLINICS[c];
    // model.js dispatches a pool at round(pool.rooms * staffed / DOC.c), so the analysis sizes it the same way
    const staffed = Math.max(0, Math.round(C.rooms * (docFlow.staffed[hour] / STATIONS.DOC.c)));
    const svc = C.svc * (docFlow.svc / STATIONS.DOC.svc);
    const lam = docFlow.offered[hour] * (sum(dem.docByClinic[c]) / docTotal);
    return {
      key: c, name: C.name, rooms: C.rooms, staffed, svc, lambda: lam,
      ...queueRow({lambda: lam / 60, svc, c: staffed, cv: CV[docFlow.dist] ?? 1, hours: hours * 60}),
    };
  }).sort((a, b) => b.rho - a.rho);

  return {hour, rows, clinics, demand: dem, flow, targetWq, rhoMax};
}

/** ρ hour by hour, with the upstream throttle and the backlog that does not clear, for the heat map. */
export function hourlyLoad(cfg = {}, {from = H0, to = H1} = {}) {
  const {units} = flowByHour(cfg);
  const out = {};
  for (const k of STATION_KEYS) {
    const u = units[k];
    if (!u || u.bed) continue;
    const cells = [];
    for (let h = from; h < to; h++) {
      cells.push({
        h,
        demand: u.demand[h],
        carryIn: h > from ? u.carry[h - 1] : 0,
        throttled: u.throttled[h],
        offered: u.offered[h],
        cap: u.cap[h],
        done: u.done[h],
        carry: u.carry[h],
        rho: u.cap[h] > 0 ? u.offered[h] / u.cap[h] : u.offered[h] > 0 ? Infinity : 0,
      });
    }
    out[k] = {
      key: k, name: u.name, dept: u.dept, cells,
      peak: Math.max(...cells.map((c) => (c.rho === Infinity ? 99 : c.rho))),
      peakHour: cells.reduce((a, c) => (c.rho > a.rho ? c : a), cells[0]).h,
      endCarry: cells[cells.length - 1].carry,
    };
  }
  return out;
}

/**
 * What to do about it. Same shape as SmartHospital's advice: add slots if the floor plan allows it, and if it does
 * not, say so and fall back to cutting the service time — with the figure that would be needed.
 */
export function recommend(cfg = {}, {hour = 9, targetWq = 15, rhoMax = 0.85, hours = 9} = {}) {
  const {rows} = analyse(cfg, {hour, targetWq, rhoMax, hours});
  const out = [];
  for (const r of rows) {
    if (r.bed) {
      if (r.rho >= 0.95) out.push({key: r.key, name: r.name, kind: 'bed', add: 0, text: `อัตราครองเตียง ${pc(r.rho)} — ต้องเพิ่มเตียงหรือลดวันนอน`});
      continue;
    }
    if (!(r.rho >= rhoMax || r.Wq > targetWq)) continue;
    const ceiling = Math.max(r.max, r.slots);
    // the recommendation is in SLOTS; at this hour only `scale` of them are actually staffed
    const scale = r.slots > 0 ? r.staffed / r.slots : 1;
    let fix = null;
    for (let slots = r.slots + 1; slots <= ceiling; slots++) {
      const q = queueRow({lambda: r.lambda / 60, svc: r.svc, c: Math.max(1, Math.round(slots * scale)), cv: r.cv, hours: hours * 60});
      if (q.rho < rhoMax && q.Wq <= targetWq) {
        fix = {slots, q};
        break;
      }
    }
    if (fix) {
      out.push({
        key: r.key, name: r.name, kind: 'slots', add: fix.slots - r.slots, to: fix.slots, max: r.max,
        was: {rho: r.rho, Wq: r.Wq}, now: {rho: fix.q.rho, Wq: fix.q.Wq},
        text: `เพิ่ม${r.key === 'DOC' ? 'ห้องตรวจ' : 'จุดบริการ'} ${fix.slots - r.slots} หน่วย (${r.slots} → ${fix.slots}) · ρ ${pc(r.rho)} → ${pc(fix.q.rho)} · Wq ${fmt(r.Wq)} → ${fmt(fix.q.Wq)} นาที`,
      });
      continue;
    }
    let need = null;
    const cMax = Math.max(1, Math.round(ceiling * scale));
    for (let s = r.svc; s > 0.2; s -= Math.max(0.05, r.svc / 200)) {
      const q = queueRow({lambda: r.lambda / 60, svc: s, c: cMax, cv: r.cv, hours: hours * 60});
      if (q.rho < rhoMax && q.Wq <= targetWq) {
        need = s;
        break;
      }
    }
    out.push({
      key: r.key, name: r.name, kind: 'svc', add: ceiling - r.slots, to: ceiling, max: r.max,
      was: {rho: r.rho, Wq: r.Wq}, needSvc: need,
      text: need
        ? `เต็มเพดานที่ ${ceiling} หน่วยแล้ว — ต้องลดเวลาบริการ ${r.svc.toFixed(1)} → ${need.toFixed(1)} นาที/ราย`
        : `เต็มเพดานที่ ${ceiling} หน่วย และลดเวลาบริการอย่างเดียวก็ยังไม่พอ — ต้องลดจำนวนผู้ป่วยที่ส่งมา`,
    });
  }
  return out;
}

const fmt = (v) => (v === Infinity || Number.isNaN(v) ? '∞' : v.toFixed(1));
const pc = (v) => (v === Infinity ? '∞' : `${(v * 100).toFixed(0)}%`);

/** Compare two configs on the same hour — "ก่อนปรับปรุง" against "หลังปรับปรุง". */
export function compare(cfgA, cfgB, opts = {}) {
  const a = analyse(cfgA, opts);
  const b = analyse(cfgB, opts);
  const byKey = Object.fromEntries(b.rows.map((r) => [r.key, r]));
  return a.rows
    .filter((r) => byKey[r.key])
    .map((r) => ({key: r.key, name: r.name, bed: r.bed, before: r, after: byKey[r.key]}))
    .filter((x) => Math.abs(x.before.rho - x.after.rho) > 0.001 || x.before.slots !== x.after.slots || Math.abs((x.before.svc || 0) - (x.after.svc || 0)) > 0.01);
}
