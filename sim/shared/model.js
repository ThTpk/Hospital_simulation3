// The hospital model — the single source of truth for the whole simulator.
//
// No three.js in this file. It runs one whole day of a medium-sized hospital as a discrete-event simulation and
// RECORDS it into a timeline, then everything else just reads that timeline. Two reasons for recording rather than
// stepping live:
//   1. `pose(t)` stays a pure function of time, so scrubbing backwards shows exactly the frame that playing forwards
//      into it showed, and nothing drifts between the 3D and the numbers.
//   2. The process player has to know in advance which patient walks which route, which is impossible while a live
//      simulation is still deciding.
//
// The architecture decision that matters (see docs/SPEC.md §2): a patient is not locked to a fixed route, and the
// routing is not scattered through if/else branches. The doctor draws an ORDER SET from declared rules, and
// `resolvePlan` unfolds that order set into a sequence of units in one place. So the probabilities stay tunable AND
// the possible routes stay enumerable.

// ───────────────────────────────────────────────────────────── units

/**
 * svc  = mean service time in minutes
 * c    = service slots at the default staffing
 * max  = the most the floor plan and payroll allow
 * dist = service-time distribution: 'lognorm' (right-skewed, the realistic default) | 'erlang4' | 'det'
 * result = minutes a result takes after the patient leaves the machine
 * sizing = how the slot count was chosen: 'peak' (peak-hour rho <= 0.85) | 'daily' (all-day utilisation 0.75-0.80)
 */
export const STATIONS = {
  INFO: {key: 'INFO', name: 'Information', dept: 'front', svc: 1.0, c: 2, max: 3, dist: 'det', floor: 1, sizing: 'peak'},
  REG: {key: 'REG', name: 'Records & Eligibility', dept: 'front', svc: 3.0, c: 8, max: 10, dist: 'lognorm', floor: 1, sizing: 'peak'},
  TRI: {key: 'TRI', name: 'Triage & Vitals', dept: 'opd', svc: 4.0, c: 9, max: 11, dist: 'lognorm', floor: 1, sizing: 'peak'},
  DOC: {key: 'DOC', name: 'Consultation Rooms', dept: 'opd', svc: 9.0, c: 19, max: 24, dist: 'lognorm', floor: 1, sizing: 'daily', byClinic: true},
  PRC: {key: 'PRC', name: 'Procedure & Injection', dept: 'opd', svc: 8.0, c: 3, max: 5, dist: 'lognorm', floor: 2, sizing: 'peak'},
  DEN: {key: 'DEN', name: 'Dental', dept: 'opd', svc: 30.0, c: 3, max: 4, dist: 'lognorm', floor: 2, sizing: 'daily'},
  PT: {key: 'PT', name: 'Physiotherapy', dept: 'opd', svc: 40.0, c: 4, max: 6, dist: 'erlang4', floor: 2, sizing: 'daily'},
  LAB: {key: 'LAB', name: 'Laboratory', dept: 'diag', svc: 5.0, c: 6, max: 8, dist: 'lognorm', result: 25, floor: 1, sizing: 'peak'},
  XRY: {key: 'XRY', name: 'X-ray', dept: 'diag', svc: 8.0, c: 5, max: 6, dist: 'lognorm', result: 15, floor: 1, sizing: 'peak'},
  CT: {key: 'CT', name: 'CT / MRI / Ultrasound', dept: 'diag', svc: 20.0, c: 2, max: 3, dist: 'lognorm', result: 35, floor: 1, sizing: 'peak'},
  EKG: {key: 'EKG', name: 'EKG / Echo', dept: 'diag', svc: 10.0, c: 3, max: 4, dist: 'erlang4', result: 10, floor: 1, sizing: 'peak'},
  PHA: {key: 'PHA', name: 'Pharmacy', dept: 'money', svc: 5.0, c: 8, max: 9, dist: 'lognorm', floor: 1, sizing: 'peak'},
  CSH: {key: 'CSH', name: 'Billing & Cashier', dept: 'money', svc: 2.5, c: 6, max: 7, dist: 'lognorm', floor: 1, sizing: 'peak'},
  ERT: {key: 'ERT', name: 'ER Triage', dept: 'er', svc: 4.0, c: 2, max: 3, dist: 'lognorm', floor: 1, sizing: 'peak'},
  ER: {key: 'ER', name: 'Emergency Room', dept: 'er', svc: 30.0, c: 8, max: 10, dist: 'lognorm', floor: 1, sizing: 'peak', priority: true},
  ANE: {key: 'ANE', name: 'Pre-op & Anaesthesia', dept: 'surg', svc: 20.0, c: 2, max: 3, dist: 'lognorm', floor: 3, sizing: 'peak'},
  OR: {key: 'OR', name: 'Operating Theatre', dept: 'surg', svc: 95.0, c: 6, max: 7, dist: 'lognorm', floor: 3, sizing: 'standby'},
  PACU: {key: 'PACU', name: 'Recovery (PACU)', dept: 'surg', svc: 60.0, c: 6, max: 8, dist: 'erlang4', floor: 3, sizing: 'peak'},
  ADM: {key: 'ADM', name: 'Admission', dept: 'surg', svc: 15.0, c: 3, max: 4, dist: 'lognorm', floor: 3, sizing: 'peak'},
  ICU: {key: 'ICU', name: 'Intensive Care', dept: 'ward', svc: 4320, c: 14, max: 16, dist: 'lognorm', floor: 3, sizing: 'daily', bed: true},
  WARD: {key: 'WARD', name: 'Inpatient Wards', dept: 'ward', svc: 4320, c: 200, max: 220, dist: 'lognorm', floor: 4, sizing: 'daily', bed: true},
  POR: {key: 'POR', name: 'Porters', dept: 'support', svc: 12.0, c: 6, max: 9, dist: 'lognorm', floor: 0, sizing: 'peak', mobile: true},
};
export const STATION_KEYS = Object.keys(STATIONS);

export const DEPTS = {
  front: {name: 'Front Office', color: 'blue'},
  opd: {name: 'Outpatient', color: 'mint'},
  diag: {name: 'Diagnostics', color: 'olive'},
  er: {name: 'Emergency', color: 'rose'},
  surg: {name: 'Surgery', color: 'violet'},
  ward: {name: 'Inpatient', color: 'violet'},
  money: {name: 'Pharmacy & Billing', color: 'amber'},
  support: {name: 'Support', color: 'teal'},
};

/** The consultation rooms are not one pool: a bottleneck in Medicine says nothing about Eye. */
export const CLINICS = {
  med: {key: 'med', name: 'Medicine', rooms: 6, share: 0.32, svc: 10},
  surg: {key: 'surg', name: 'Surgery', rooms: 3, share: 0.14, svc: 9},
  ped: {key: 'ped', name: 'Paediatrics', rooms: 3, share: 0.15, svc: 8},
  obg: {key: 'obg', name: 'Obstetrics & Gynaecology', rooms: 2, share: 0.11, svc: 10},
  ortho: {key: 'ortho', name: 'Orthopaedics', rooms: 2, share: 0.12, svc: 8},
  eye: {key: 'eye', name: 'Eye', rooms: 2, share: 0.09, svc: 7},
  ent: {key: 'ent', name: 'Ear, Nose & Throat', rooms: 1, share: 0.07, svc: 7},
};
export const CLINIC_KEYS = Object.keys(CLINICS);

// ───────────────────────────────────────────────────── how people arrive

/** Per-lane daily volume and the shape of the day. Shapes are relative weights per hour (index = hour of day). */
export const LANES = {
  walkin: {
    key: 'walkin', name: 'Walk-in outpatient', perDay: 260, entry: 'main',
    shape: [0, 0, 0, 0, 0, 3, 22, 40, 46, 38, 27, 18, 10, 16, 14, 10, 6, 2, 0, 0, 0, 0, 0, 0],
  },
  appt: {
    key: 'appt', name: 'Booked appointment', perDay: 180, entry: 'main', booked: true,
    // the default booking pattern: everyone booked into the morning, which is what most Thai hospitals do
    shape: [0, 0, 0, 0, 0, 0, 10, 34, 38, 30, 22, 12, 4, 12, 10, 6, 0, 0, 0, 0, 0, 0, 0, 0],
    // the alternative the appointment-spread control gives you: the same people, booked evenly across the session
    flat: [0, 0, 0, 0, 0, 0, 14, 16, 16, 16, 16, 14, 6, 16, 16, 16, 12, 0, 0, 0, 0, 0, 0, 0],
  },
  checkup: {
    key: 'checkup', name: 'Annual check-up', perDay: 40, entry: 'main',
    shape: [0, 0, 0, 0, 0, 0, 18, 14, 6, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  dental: {
    key: 'dental', name: 'Dental', perDay: 35, entry: 'main',
    shape: [0, 0, 0, 0, 0, 0, 4, 6, 6, 6, 5, 4, 2, 5, 5, 4, 2, 0, 0, 0, 0, 0, 0, 0],
  },
  physio: {
    key: 'physio', name: 'Physiotherapy', perDay: 30, entry: 'main',
    shape: [0, 0, 0, 0, 0, 0, 3, 5, 5, 5, 4, 3, 2, 4, 4, 3, 2, 0, 0, 0, 0, 0, 0, 0],
  },
  vacc: {
    key: 'vacc', name: 'Vaccination', perDay: 25, entry: 'main',
    shape: [0, 0, 0, 0, 0, 0, 2, 4, 4, 4, 4, 3, 2, 4, 4, 3, 2, 0, 0, 0, 0, 0, 0, 0],
  },
  er: {
    key: 'er', name: 'Emergency', perDay: 75, entry: 'er',
    shape: [2, 1.5, 1.2, 1, 1, 1.4, 2, 2.6, 3, 3.2, 3.2, 3, 3, 3, 3.2, 3.4, 3.8, 4.4, 4.6, 4.2, 3.6, 3.2, 2.8, 2.4],
  },
  elective: {
    key: 'elective', name: 'Scheduled surgery', perDay: 10, entry: 'main',
    shape: [0, 0, 0, 0, 0, 0, 7, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};
export const LANE_KEYS = Object.keys(LANES);

/** Who pays, and how long that takes at the counter. A real reason the counters are so variable. */
export const INSURANCE = [
  {key: 'ucs', name: 'Universal Coverage', share: 0.48, regK: 1.0, cshK: 1.0},
  {key: 'sss', name: 'Social Security', share: 0.22, regK: 1.15, cshK: 1.2},
  {key: 'csmbs', name: 'Civil Servant', share: 0.14, regK: 1.25, cshK: 1.35},
  {key: 'cash', name: 'Self-pay', share: 0.11, regK: 0.8, cshK: 1.5},
  {key: 'private', name: 'Private insurance', share: 0.05, regK: 1.4, cshK: 1.8},
];

/** Emergency severity index: the share of ER arrivals, how long they take, and who may jump the queue. */
export const ESI = [
  {level: 1, name: 'Resuscitation', share: 0.04, svcK: 2.8, preempt: true},
  {level: 2, name: 'Emergent', share: 0.14, svcK: 1.9, preempt: false},
  {level: 3, name: 'Urgent', share: 0.34, svcK: 1.0, preempt: false},
  {level: 4, name: 'Less urgent', share: 0.32, svcK: 0.6, preempt: false},
  {level: 5, name: 'Non-urgent', share: 0.16, svcK: 0.4, preempt: false},
];

// ──────────────────────────────────────────────────────── the order sets

/**
 * What a doctor orders. Declared as data so the probabilities stay tunable and the routes stay enumerable.
 * `when` is matched against the patient; the first matching rule wins. Values are independent probabilities.
 */
export const ORDER_RULES = [
  {when: {lane: 'checkup'}, orders: {lab: 1.0, xray: 1.0, ekg: 1.0, ct: 0}},
  {when: {lane: 'er', esiAtMost: 2}, orders: {lab: 0.92, xray: 0.6, ekg: 0.55, ct: 0.35}},
  {when: {lane: 'er'}, orders: {lab: 0.55, xray: 0.4, ekg: 0.18, ct: 0.08}},
  {when: {clinic: 'med'}, orders: {lab: 0.52, xray: 0.1, ekg: 0.12, ct: 0.02}},
  {when: {clinic: 'ortho'}, orders: {lab: 0.1, xray: 0.74, ekg: 0, ct: 0.08}},
  {when: {clinic: 'surg'}, orders: {lab: 0.38, xray: 0.26, ekg: 0.04, ct: 0.09}},
  {when: {clinic: 'ped'}, orders: {lab: 0.26, xray: 0.12, ekg: 0.01, ct: 0.01}},
  {when: {clinic: 'obg'}, orders: {lab: 0.42, xray: 0.02, ekg: 0.02, ct: 0.06}},
  {when: {clinic: 'eye'}, orders: {lab: 0.08, xray: 0.01, ekg: 0, ct: 0.01}},
  {when: {clinic: 'ent'}, orders: {lab: 0.14, xray: 0.1, ekg: 0, ct: 0.04}},
  {when: {}, orders: {lab: 0.34, xray: 0.14, ekg: 0.05, ct: 0.03}},
];

/** Everything else the model decides, in one table so it can be shown and tuned. */
export const RULES = {
  pProcedure: 0.1, // a minor procedure after the consultation
  pAdmitOPD: 0.05, // admitted from the clinic
  pRx: 0.83, // leaves with a prescription
  pErOR: 0.11, // emergency to theatre
  pErAdmit: 0.28, // emergency admitted to a bed
  pErICU: 0.1, // ...of those, the share that needs intensive care
  pElectiveStay: 0.4, // scheduled surgery that stays the night rather than going home
  pWheelchair: 0.06, // outpatients who need a porter and a wheelchair
  balkQueue: 55, // walks out without joining if the queue is longer than this
  renegeWait: 150, // walks out after waiting this many minutes
  liftWait: 1.4, // mean wait for a lift, minutes
};

/** The diagnostics always run in this order, so two patients with the same order set walk the same way. */
const DIAG_ORDER = ['lab', 'xray', 'ekg', 'ct'];
const DIAG_STATION = {lab: 'LAB', xray: 'XRY', ekg: 'EKG', ct: 'CT'};

/** Lanes that see a doctor at all. Vaccination is nurse-only; dental and scheduled surgery go to their own unit. */
const NEEDS_DOCTOR = {walkin: true, appt: true, checkup: true, physio: true, er: true, vacc: false, dental: false, elective: false};

/**
 * Unfold a patient's order set into the units they still have to visit. The whole workflow lives here, and it is
 * the one place a route is decided — which is what makes rule 1 of the acceptance criteria testable: a patient with
 * several orders comes back to the doctor ONCE, after the whole set is done, not once per test.
 *
 * `p.dispatched` is the terminal latch. Without it the resolver would hand out the discharge chain again every time
 * a patient finished the last unit of it, and they would queue at billing forever.
 */
export function resolvePlan(p) {
  if (p.dispatched) return [];
  return p.lane === 'er' ? resolveER(p) : resolveOPD(p);
}

function pending(p) {
  return DIAG_ORDER.filter((d) => p.orders[d] && !p.done[d]);
}

function resolveOPD(p) {
  // lanes with a fixed journey of their own
  if (p.lane === 'elective') {
    p.dispatched = true;
    return p.electiveStay ? ['LAB', 'OR', 'PACU', 'ADM', 'WARD'] : ['LAB', 'OR', 'PACU', 'CSH', 'PHA'];
  }
  if (p.lane === 'dental') {
    p.dispatched = true;
    return p.rx ? ['CSH', 'PHA'] : ['CSH'];
  }
  if (p.lane === 'vacc') {
    p.dispatched = true;
    return ['CSH'];
  }
  // the first consultation
  if (NEEDS_DOCTOR[p.lane] && !p.ordered) {
    // a check-up is the one journey where every test runs BEFORE the doctor, who then reads them all at once
    if (p.lane === 'checkup') return ['LAB', 'XRY', 'EKG', 'DOC'];
    return ['DOC'];
  }
  // tests outstanding: all of them, then exactly one review visit
  const pend = pending(p);
  if (pend.length) return [...pend.map((d) => DIAG_STATION[d]), 'DOC'];
  // discharge
  p.dispatched = true;
  return opdDisposition(p);
}

function resolveER(p) {
  const pend = pending(p);
  if (pend.length) return [...pend.map((d) => DIAG_STATION[d]), 'ER']; // back to the bed to be reassessed
  p.dispatched = true;
  return erDisposition(p);
}

function opdDisposition(p) {
  if (p.disposition === 'admit') return [p.icu ? 'ADM' : 'ADM', p.icu ? 'ICU' : 'WARD'];
  if (p.disposition === 'physio') return ['PT', 'CSH'];
  if (p.disposition === 'procedure') return p.rx ? ['PRC', 'CSH', 'PHA'] : ['PRC', 'CSH'];
  return p.rx ? ['CSH', 'PHA'] : ['CSH'];
}
function erDisposition(p) {
  if (p.disposition === 'or') return ['ANE', 'OR', 'PACU', p.icu ? 'ICU' : 'WARD'];
  if (p.disposition === 'admit') return ['ADM', p.icu ? 'ICU' : 'WARD'];
  return p.rx ? ['CSH', 'PHA'] : ['CSH'];
}

// ──────────────────────────────────────────────────────────── processes
// The named journeys the page offers in Process mode. These are not the routing — the routing is the order sets
// above. Each one is a PATTERN the player matches against the recorded day to find a patient who really walked it.

export const PROCESSES = [
  {key: 'opd', name: 'General outpatient visit', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'CSH', 'PHA'], note: 'Register, see the doctor, pay, collect medicine.'},
  {key: 'opd_lab', name: 'Outpatient with blood test', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'LAB', 'DOC', 'CSH', 'PHA'], note: 'The doctor orders a blood test, then sees the patient again for the result.'},
  {key: 'opd_xray', name: 'Outpatient with X-ray', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'XRY', 'DOC', 'CSH', 'PHA'], note: 'Imaging, then back to the same doctor.'},
  {key: 'opd_both', name: 'Outpatient with lab and X-ray', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'LAB', 'XRY', 'DOC', 'CSH', 'PHA'], note: 'Both tests run before one review visit — not two.'},
  {key: 'opd_proc', name: 'Dressing or injection', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'PRC', 'CSH', 'PHA'], note: 'A minor procedure after the consultation.'},
  {key: 'vacc', name: 'Vaccination', lane: 'vacc', route: ['REG', 'TRI', 'PRC', 'CSH'], note: 'No doctor: screened by a nurse, then vaccinated.'},
  {key: 'checkup', name: 'Annual check-up', lane: 'checkup', route: ['REG', 'TRI', 'LAB', 'XRY', 'EKG', 'DOC', 'CSH'], note: 'Every test first, then one doctor to read them all.'},
  {key: 'dental', name: 'Dental treatment', lane: 'dental', route: ['REG', 'DEN', 'CSH', 'PHA'], note: 'Straight to the dental chair.'},
  {key: 'physio', name: 'Physiotherapy session', lane: 'physio', route: ['REG', 'DOC', 'PT', 'CSH'], note: 'Reviewed, then 40 minutes of therapy.'},
  {key: 'er_home', name: 'Emergency, treated and discharged', lane: 'er', route: ['ERT', 'ER', 'LAB', 'XRY', 'ER', 'CSH', 'PHA'], note: 'Triaged by severity, worked up in the bed, sent home.'},
  {key: 'er_admit', name: 'Emergency to a ward bed', lane: 'er', route: ['ERT', 'ER', 'LAB', 'ER', 'ADM', 'WARD'], note: 'Admitted: a porter moves them upstairs.'},
  {key: 'er_or', name: 'Emergency to theatre', lane: 'er', route: ['ERT', 'ER', 'CT', 'ER', 'ANE', 'OR', 'PACU', 'ICU'], note: 'The fastest escalating path in the hospital.'},
  {key: 'elective', name: 'Scheduled day surgery', lane: 'elective', route: ['REG', 'ANE', 'LAB', 'OR', 'PACU', 'CSH', 'PHA'], note: 'Booked, operated, recovered, home the same day.'},
  {key: 'opd_admit', name: 'Outpatient admitted', lane: 'walkin', route: ['REG', 'TRI', 'DOC', 'LAB', 'DOC', 'ADM', 'WARD'], note: 'The clinic decides this one needs a bed.'},
];

// ──────────────────────────────────────────────────────────── maths bits

/** Seeded PRNG (mulberry32): the same seed gives the same day, every time, in every browser. */
export const rng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const normal = (rand) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** A service time: right-skewed by default, because most patients are quick and a few take very long. */
export function serviceTime(rand, mean, dist = 'lognorm') {
  if (dist === 'det') return mean;
  if (dist === 'exp') return -Math.log(1 - rand()) * mean;
  if (dist === 'erlang4') {
    let s = 0;
    for (let i = 0; i < 4; i++) s += -Math.log(1 - rand());
    return (mean / 4) * s;
  }
  const cv = 0.55;
  const s2 = Math.log(1 + cv * cv);
  return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal(rand));
}

/**
 * Share `total` places among pools in proportion to their size, as whole rooms, without losing or inventing any.
 *
 * Largest remainder, not rounding each pool on its own: rounding each of seven clinics separately turned a request
 * for 16 consultation rooms into 18 open rooms, so closing three rooms barely moved the wait and the staffing
 * slider was quietly lying about what it had done.
 */
export function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * total) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({i, frac: v - Math.floor(v)})).sort((a, b) => b.frac - a.frac || weights[b.i] - weights[a.i]);
  for (let j = 0; left > 0 && j < order.length * 2; j++) {
    out[order[j % order.length].i]++;
    left--;
  }
  return out;
}

const pickShare = (rand, list) => {
  let r = rand();
  for (const it of list) {
    r -= it.share;
    if (r <= 0) return it;
  }
  return list[list.length - 1];
};

const matchRule = (p, when) => {
  if (when.lane && when.lane !== p.lane) return false;
  if (when.clinic && when.clinic !== p.clinic) return false;
  if (when.esiAtMost != null && !(p.esi && p.esi <= when.esiAtMost)) return false;
  return true;
};

// ─────────────────────────────────────────────────────── the day itself

export const DAY_START = 6 * 60; // 06:00
export const DAY_END = 20 * 60; // 20:00
const DT = 0.25; // minutes per tick

export const ST = {WALK: 'walk', QUEUE: 'queue', SERVICE: 'service', RESULT: 'result', BED: 'bed', LEFT: 'left', LIFT: 'lift'};

/**
 * Run one day and return the recorded timeline.
 *
 * opts.walkTime(fromKey, toKey) -> minutes. Injected by world.js, which owns the floor plan, so the clock in the
 * model and the distance walked in the 3D can never disagree. Falls back to a flat estimate for node-side tests.
 * opts.cfg overrides staffing (`servers`), volumes (`scale`), order rates (`orders`) and the booking pattern.
 */
export function runDay(opts = {}) {
  const seed = opts.seed ?? 20261119;
  const rand = rng(seed);
  const cfg = {
    servers: {},
    svc: {}, // per-unit service-time override, minutes
    dist: {}, // per-unit service-time distribution override
    scale: {},
    hourK: null, // 24 multipliers, one per hour of the day (the arrival profile editor)
    orderK: 1,
    flatBooking: 0, // 0 = all booked into the morning, 1 = spread evenly
    surge: null, // {lane, from, to, perHour, esiBias}
    breaks: true,
    balking: true,
    ...(opts.cfg || {}),
  };
  const walkTime = opts.walkTime || ((a, b) => (a === b ? 0.2 : 2.2));

  const stations = {};
  for (const k of STATION_KEYS) {
    const d = STATIONS[k];
    stations[k] = {
      def: d,
      key: k,
      servers: cfg.servers[k] ?? d.c,
      svc: cfg.svc[k] ?? d.svc,
      dist: cfg.dist[k] ?? d.dist,
      queue: [],
      inService: [],
      waitingResult: [],
      served: 0,
      busyMin: 0,
      waitSum: 0,
      waitCount: 0,
      maxQueue: 0,
      maxWait: 0,
      hist: new Int32Array(61), // waiting-time histogram, 2-minute buckets, last bucket is 120+
      // per-clinic sub-pools for the consultation rooms
      capAt: -1, // the staffing level the clinic apportionment below was worked out for
      pools: d.byClinic ? Object.fromEntries(CLINIC_KEYS.map((c) => [c, {queue: [], inService: [], rooms: CLINICS[c].rooms, open: CLINICS[c].rooms}])) : null,
    };
  }

  const patients = [];
  const arrivals = [];
  // ---- arrivals: thinning a non-homogeneous Poisson process, lane by lane
  for (const lk of LANE_KEYS) {
    const L = LANES[lk];
    const shapeA = L.shape;
    const shapeB = L.flat || L.shape;
    const k = L.booked ? cfg.flatBooking : 0;
    const shape = shapeA.map((v, i) => v * (1 - k) + shapeB[i] * k);
    const sum = shape.reduce((a, b) => a + b, 0) || 1;
    const perDay = (L.perDay || 0) * (cfg.scale[lk] ?? 1);
    for (let h = 0; h < 24; h++) {
      let n = (shape[h] / sum) * perDay * (cfg.hourK ? (cfg.hourK[h] ?? 1) : 1);
      // the surge is a window, not a whole-day multiplier
      if (cfg.surge && cfg.surge.lane === lk) {
        const ov = Math.max(0, Math.min((h + 1) * 60, cfg.surge.to) - Math.max(h * 60, cfg.surge.from));
        n += (cfg.surge.perHour * ov) / 60;
      }
      let whole = Math.floor(n);
      if (rand() < n - whole) whole++;
      for (let i = 0; i < whole; i++) arrivals.push({lane: lk, t: h * 60 + rand() * 60});
    }
  }
  arrivals.sort((a, b) => a.t - b.t);

  let uid = 1;
  const spawn = (a) => {
    const L = LANES[a.lane];
    const ins = pickShare(rand, INSURANCE);
    const isER = a.lane === 'er';
    let esi = 0;
    if (isER) {
      const e = cfg.surge && cfg.surge.esiBias && a.t >= cfg.surge.from && a.t <= cfg.surge.to
        ? ESI[rand() < 0.6 ? 0 : 1]
        : pickShare(rand, ESI);
      esi = e.level;
    }
    const p = {
      id: uid++,
      lane: a.lane,
      laneName: L.name,
      ins: ins.key,
      insName: ins.name,
      esi,
      clinic: null,
      tArrive: a.t,
      state: ST.WALK,
      at: null,
      from: isER ? 'GATE_ER' : 'GATE_MAIN',
      to: null,
      walkT: 0,
      walkDur: 0,
      tQueue: 0,
      tServiceEnd: 0,
      slot: -1,
      qIdx: -1,
      orders: {lab: false, xray: false, ekg: false, ct: false},
      done: {lab: false, xray: false, ekg: false, ct: false},
      ordered: false, // the doctor has drawn the order set
      reviewed: false, // the one review visit has happened
      disposition: null,
      rx: false,
      icu: false,
      admitted: false,
      dispatched: false,
      electiveStay: a.lane === 'elective' && rand() < RULES.pElectiveStay,
      wheelchair: rand() < RULES.pWheelchair,
      plan: [],
      steps: [], // the recording: {k, kind, t0, t1, wait, from, to}
      waitTotal: 0,
      left: false,
      balked: false,
      reneged: false,
    };
    // the first unit of the journey
    if (isER) p.plan = ['ERT', 'ER'];
    else if (a.lane === 'dental') {
      p.plan = ['REG', 'DEN'];
      p.rx = rand() < 0.8;
      p.disposition = 'home';
    } else if (a.lane === 'elective') {
      p.plan = ['REG', 'ANE'];
      p.rx = true;
      p.disposition = p.electiveStay ? 'admit' : 'home';
      p.admitted = p.electiveStay;
    } else if (a.lane === 'physio') p.plan = ['REG', 'DOC'];
    else if (a.lane === 'vacc') {
      p.plan = ['REG', 'TRI', 'PRC'];
      p.rx = false;
      p.disposition = 'home';
    } else p.plan = ['REG', 'TRI'];
    if (!isER) {
      const c = pickShare(rand, CLINIC_KEYS.map((ck) => ({...CLINICS[ck], share: CLINICS[ck].share})));
      p.clinic = a.lane === 'vacc' ? null : c.key;
      if (a.lane === 'checkup') p.clinic = 'med';
      if (a.lane === 'physio') p.clinic = 'ortho';
      if (a.lane === 'dental') p.clinic = null;
    }
    patients.push(p);
    beginWalk(p, p.from, p.plan.shift());
    return p;
  };

  const beginWalk = (p, from, to) => {
    p.state = ST.WALK;
    p.from = from;
    p.to = to;
    p.at = null;
    p.slot = -1;
    p.qIdx = -1;
    p.walkT = 0;
    // layout.js owns the distance AND the lift, so there is nothing to add here but the person's own pace
    // (an elderly patient with a stick is slower than a twenty-year-old, and that shows in the queue downstream)
    const base = walkTime(from, to, {clinicFrom: p.clinic, clinicTo: p.clinic});
    p.walkDur = Math.max(0.15, base * (0.82 + rand() * 0.42));
    p.steps.push({k: null, kind: ST.WALK, t0: t, t1: 0, from, to, clinic: p.clinic});
  };

  const closeStep = (p, tNow) => {
    const s = p.steps[p.steps.length - 1];
    if (s && !s.t1) s.t1 = tNow;
  };

  /** The doctor's visit: draw the order set, then decide the disposition. */
  const consult = (p) => {
    if (!p.ordered) {
      p.ordered = true;
      const rule = ORDER_RULES.find((r) => matchRule(p, r.when)) || ORDER_RULES[ORDER_RULES.length - 1];
      for (const d of DIAG_ORDER) {
        const base = (rule.orders[d] || 0) * (cfg.orderK ?? 1) * (cfg.orders?.[d] ?? 1);
        p.orders[d] = rand() < Math.min(1, base);
      }
      if (p.lane === 'physio') p.orders = {lab: false, xray: false, ekg: false, ct: false};
    } else {
      p.reviewed = true;
    }
    // the disposition is drawn once, when no diagnostics are left outstanding
    const pend = DIAG_ORDER.some((d) => p.orders[d] && !p.done[d]);
    if (!pend && !p.disposition) {
      if (p.lane === 'physio') p.disposition = 'physio';
      else if (rand() < RULES.pAdmitOPD) p.disposition = 'admit';
      else if (rand() < RULES.pProcedure) p.disposition = 'procedure';
      else p.disposition = 'home';
      p.rx = p.disposition === 'admit' ? true : rand() < RULES.pRx;
      if (p.disposition === 'admit') {
        p.admitted = true;
        p.icu = rand() < 0.04;
      }
    }
  };

  const erAssess = (p) => {
    if (!p.ordered) {
      p.ordered = true;
      const rule = ORDER_RULES.find((r) => matchRule(p, r.when)) || ORDER_RULES[ORDER_RULES.length - 1];
      for (const d of DIAG_ORDER) p.orders[d] = rand() < Math.min(1, (rule.orders[d] || 0) * (cfg.orderK ?? 1));
    }
    const pend = DIAG_ORDER.some((d) => p.orders[d] && !p.done[d]);
    if (!pend && !p.disposition) {
      const r = rand();
      if (r < RULES.pErOR) {
        p.disposition = 'or';
        p.admitted = true;
      } else if (r < RULES.pErOR + RULES.pErAdmit) {
        p.disposition = 'admit';
        p.admitted = true;
      } else p.disposition = 'home';
      p.icu = p.admitted && rand() < RULES.pErICU;
      p.rx = p.disposition === 'home' ? rand() < 0.78 : true;
    }
  };

  /** Where next. The plan is consumed first; when it runs out, resolvePlan refills it. */
  const advance = (p) => {
    if (!p.plan.length) {
      const next = resolvePlan(p);
      p.plan = next;
    }
    const to = p.plan.shift();
    if (!to) {
      depart(p);
      return;
    }
    beginWalk(p, p.at || p.from, to);
  };

  const depart = (p) => {
    p.state = ST.LEFT;
    p.left = true;
    p.tLeft = t;
    closeStep(p, t);
    totals.left++;
    totals.losSum += t - p.tArrive;
    totals.losCount++;
  };

  const totals = {arrived: 0, left: 0, admitted: 0, balked: 0, reneged: 0, losSum: 0, losCount: 0, visits: 0};
  const history = []; // a snapshot every 5 minutes, for the charts
  let t = DAY_START;
  let ai = 0;
  let histAcc = 0;

  const staffedNow = (s) => {
    if (!cfg.breaks) return s.servers;
    const d = s.def;
    if (d.bed || d.key === 'ER' || d.key === 'ERT' || d.key === 'ICU' || d.key === 'WARD') return s.servers;
    // the lunch dip: a third of the counters go off between 12:00 and 13:00, staggered
    if (t >= 12 * 60 && t < 13 * 60) return Math.max(1, Math.round(s.servers * 0.66));
    // the session: nothing much is staffed before 07:00 or after 16:30 except emergency and beds
    if (t < 7 * 60 || t > 16.5 * 60) return d.key === 'CSH' || d.key === 'PHA' ? Math.max(1, Math.round(s.servers * 0.3)) : Math.max(0, Math.round(s.servers * 0.15));
    return s.servers;
  };

  const push = (s, p) => {
    p.state = ST.QUEUE;
    p.at = s.key;
    p.tQueue = t;
    p.steps.push({k: s.key, kind: ST.QUEUE, t0: t, t1: 0, clinic: p.clinic});
    const pool = s.pools && p.clinic ? s.pools[p.clinic] : null;
    const q = pool ? pool.queue : s.queue;
    q.push(p);
    if (s.def.priority) q.sort((a, b) => a.esi - b.esi || a.tQueue - b.tQueue);
    q.forEach((x, i) => (x.qIdx = i));
    if (q.length > s.maxQueue) s.maxQueue = q.length;
  };

  const startService = (s, p, pool) => {
    const wait = t - p.tQueue;
    p.waitTotal += wait;
    s.waitSum += wait;
    s.waitCount++;
    if (wait > s.maxWait) s.maxWait = wait;
    s.hist[Math.min(Math.floor(wait / 2), 60)]++;
    closeStep(p, t);
    const last = p.steps[p.steps.length - 1];
    if (last) last.wait = wait;
    p.state = ST.SERVICE;
    p.qIdx = -1;
    const d = s.def;
    let mean = s.svc;
    if (d.byClinic && p.clinic) mean = CLINICS[p.clinic].svc * (s.svc / d.svc);
    if (d.key === 'ER') mean *= (ESI.find((e) => e.level === p.esi) || ESI[2]).svcK;
    if (d.key === 'REG') mean *= (INSURANCE.find((i) => i.key === p.ins) || INSURANCE[0]).regK;
    if (d.key === 'CSH') mean *= (INSURANCE.find((i) => i.key === p.ins) || INSURANCE[0]).cshK;
    if (d.bed) mean *= 0.6 + rand() * 1.1;
    const dur = Math.max(0.2, serviceTime(rand, mean, s.dist));
    p.tServiceEnd = t + dur;
    p.slot = pool ? pool.inService.length : s.inService.length;
    p.steps.push({k: s.key, kind: d.bed ? ST.BED : ST.SERVICE, t0: t, t1: 0, clinic: p.clinic, slot: p.slot});
    (pool ? pool.inService : s.inService).push(p);
    s.served++;
    totals.visits++;
  };

  const finishService = (s, p, pool) => {
    closeStep(p, t);
    const arr = pool ? pool.inService : s.inService;
    const i = arr.indexOf(p);
    if (i >= 0) arr.splice(i, 1);
    arr.forEach((x, j) => (x.slot = j));
    const d = s.def;
    if (d.key === 'DOC') consult(p);
    if (d.key === 'ER') erAssess(p);
    if (d.key === 'LAB') p.done.lab = true;
    if (d.key === 'XRY') p.done.xray = true;
    if (d.key === 'EKG') p.done.ekg = true;
    if (d.key === 'CT') p.done.ct = true;
    if (d.result) {
      // off the machine, now waiting for the report
      p.state = ST.RESULT;
      p.tResultEnd = t + d.result * (0.7 + rand() * 0.7);
      p.steps.push({k: s.key, kind: ST.RESULT, t0: t, t1: 0});
      s.waitingResult.push(p);
      return;
    }
    advance(p);
  };

  const snapshot = () => {
    const row = {t, stations: {}};
    for (const k of STATION_KEYS) {
      const s = stations[k];
      const q = s.pools ? Object.values(s.pools).reduce((a, p) => a + p.queue.length, 0) : s.queue.length;
      const inSvc = s.pools ? Object.values(s.pools).reduce((a, p) => a + p.inService.length, 0) : s.inService.length;
      row.stations[k] = {q, inSvc, res: s.waitingResult.length, staffed: staffedNow(s)};
    }
    row.inSystem = patients.filter((p) => !p.left).length;
    history.push(row);
  };

  snapshot();
  while (t < DAY_END) {
    // arrivals due
    while (ai < arrivals.length && arrivals[ai].t <= t) {
      const a = arrivals[ai++];
      if (a.t < DAY_START) continue;
      totals.arrived++;
      spawn(a);
    }

    // walking
    for (const p of patients) {
      if (p.state !== ST.WALK) continue;
      p.walkT += DT;
      if (p.walkT < p.walkDur) continue;
      closeStep(p, t);
      const s = stations[p.to];
      if (!s) {
        depart(p);
        continue;
      }
      const pool = s.pools && p.clinic ? s.pools[p.clinic] : null;
      const qLen = pool ? pool.queue.length : s.queue.length;
      // balking: a wall of people and no emergency reason to stay
      if (cfg.balking && p.lane !== 'er' && !p.admitted && qLen > RULES.balkQueue && rand() < 0.35) {
        p.balked = true;
        totals.balked++;
        depart(p);
        continue;
      }
      push(s, p);
    }

    // reneging and results
    for (const p of patients) {
      if (p.state === ST.QUEUE && cfg.balking && p.lane !== 'er' && !p.admitted && t - p.tQueue > RULES.renegeWait) {
        const s = stations[p.at];
        const pool = s.pools && p.clinic ? s.pools[p.clinic] : null;
        const q = pool ? pool.queue : s.queue;
        const i = q.indexOf(p);
        if (i >= 0) q.splice(i, 1);
        q.forEach((x, j) => (x.qIdx = j));
        p.reneged = true;
        totals.reneged++;
        depart(p);
      } else if (p.state === ST.RESULT && t >= p.tResultEnd) {
        const s = stations[p.at];
        const i = s.waitingResult.indexOf(p);
        if (i >= 0) s.waitingResult.splice(i, 1);
        closeStep(p, t);
        advance(p);
      }
    }

    // service completions
    for (const k of STATION_KEYS) {
      const s = stations[k];
      const pools = s.pools ? Object.values(s.pools) : [null];
      for (const pool of pools) {
        const arr = pool ? pool.inService : s.inService;
        for (const p of [...arr]) if (t >= p.tServiceEnd) finishService(s, p, pool);
      }
    }

    // ESI 1 pre-empts a lighter patient out of an ER bed
    {
      const s = stations.ER;
      const crit = s.queue.find((p) => p.esi === 1);
      if (crit && s.inService.length >= staffedNow(s)) {
        const victim = [...s.inService].sort((a, b) => b.esi - a.esi)[0];
        if (victim && victim.esi >= 4) {
          const i = s.inService.indexOf(victim);
          s.inService.splice(i, 1);
          closeStep(victim, t);
          victim.state = ST.QUEUE;
          victim.tQueue = t - (victim.waitPaused || 0);
          victim.steps.push({k: 'ER', kind: ST.QUEUE, t0: t, t1: 0, preempted: true});
          s.queue.push(victim);
          s.queue.sort((a, b) => a.esi - b.esi || a.tQueue - b.tQueue);
        }
      }
    }

    // dispatch
    for (const k of STATION_KEYS) {
      const s = stations[k];
      const cap = staffedNow(s);
      if (s.pools) {
        // how many of the unit's open rooms each clinic gets, re-apportioned only when the staffing level changes
        if (s.capAt !== cap) {
          s.capAt = cap;
          const keys = Object.keys(s.pools);
          const share = apportion(cap, keys.map((c) => s.pools[c].rooms));
          keys.forEach((c, i) => (s.pools[c].open = share[i]));
        }
        for (const pool of Object.values(s.pools)) {
          const roomCap = pool.open ?? 0;
          while (pool.inService.length < roomCap && pool.queue.length) {
            const p = pool.queue.shift();
            pool.queue.forEach((x, i) => (x.qIdx = i));
            startService(s, p, pool);
          }
        }
      } else {
        while (s.inService.length < cap && s.queue.length) {
          const p = s.queue.shift();
          s.queue.forEach((x, i) => (x.qIdx = i));
          startService(s, p, null);
        }
      }
      // utilisation is accumulated per tick, which is the only honest way with a staffing level that changes
      const inSvc = s.pools ? Object.values(s.pools).reduce((a, p) => a + p.inService.length, 0) : s.inService.length;
      s.busyMin += inSvc * DT;
    }

    t += DT;
    histAcc += DT;
    if (histAcc >= 5) {
      histAcc = 0;
      snapshot();
    }
  }

  // close anything still open at the end of the day
  for (const p of patients) {
    closeStep(p, t);
    if (!p.left) p.stuck = true;
  }
  for (const p of patients) if (p.admitted) totals.admitted++;

  // per-unit summary
  const summary = {};
  for (const k of STATION_KEYS) {
    const s = stations[k];
    const d = s.def;
    const openMin = d.bed || d.key === 'ER' || d.key === 'ERT' ? DAY_END - DAY_START : Math.min(DAY_END, 16.5 * 60) - Math.max(DAY_START, 7 * 60);
    const waits = [];
    for (let i = 0; i < 61; i++) for (let n = 0; n < s.hist[i]; n++) waits.push(i * 2 + 1);
    const pct = (q) => (waits.length ? waits[Math.min(waits.length - 1, Math.floor(q * waits.length))] : 0);
    summary[k] = {
      key: k,
      name: d.name,
      dept: d.dept,
      servers: s.servers,
      svc: s.svc,
      dist: s.dist,
      served: s.served,
      arrivals: s.waitCount,
      util: openMin > 0 ? s.busyMin / (s.servers * openMin) : 0,
      waitMean: s.waitCount ? s.waitSum / s.waitCount : 0,
      waitP50: pct(0.5),
      waitP90: pct(0.9),
      waitMax: s.maxWait,
      maxQueue: s.maxQueue,
      hist: Array.from(s.hist),
    };
  }

  return {
    seed,
    cfg,
    patients,
    stations,
    summary,
    history,
    totals,
    meta: {start: DAY_START, end: DAY_END, dt: DT},
  };
}

/**
 * Find a recorded patient whose journey matches a named process, so Process mode follows somebody real rather than
 * an invented script. Returns the patient and the units they actually visited, in order.
 */
export function findJourney(day, proc) {
  const want = proc.route;
  let best = null;
  let bestScore = -1;
  for (const p of day.patients) {
    if (p.lane !== proc.lane) continue;
    // somebody who walked out is no journey; somebody still in a bed at closing time is (that IS the journey)
    if (p.balked || (p.stuck && !p.admitted)) continue;
    const visited = p.steps.filter((s) => s.kind === ST.SERVICE || s.kind === ST.BED).map((s) => s.k);
    if (!visited.length) continue;
    let score = visited.length === want.length ? 60 : 0;
    const n = Math.min(visited.length, want.length);
    for (let i = 0; i < n; i++) if (visited[i] === want[i]) score += 10;
    score -= Math.abs(visited.length - want.length) * 8;
    // prefer somebody who came through the busy part of the morning: it is the interesting case
    if (p.tArrive > 7 * 60 && p.tArrive < 10 * 60) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = {patient: p, visited};
    }
  }
  return best;
}

/** Erlang-C, for the queue-analysis panel. Computed independently of the simulation so the two can be compared. */
export function erlangC(lambda, mu, c) {
  const a = lambda / mu;
  if (a >= c) return {rho: a / c, wq: Infinity, pWait: 1};
  let s = 0;
  let term = 1;
  for (let n = 0; n < c; n++) {
    if (n > 0) term *= a / n;
    s += term;
  }
  const pc = (term * (a / c) * c) / (c - a);
  const p0 = 1 / (s + pc);
  const C = pc * p0;
  return {rho: a / c, wq: C / (c * mu - lambda), pWait: C};
}

/** hh:mm from minutes-of-day. */
export const hhmm = (min) => {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
