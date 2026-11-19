// The floor plan — the only place coordinates are decided.
//
// `model.js` is the truth about WHAT happens; this file is the truth about WHERE. The model asks it for walking
// times, so the clock in the simulation and the distance covered in the 3D can never disagree: a patient who walks
// 60 m takes longer than one who walks 9 m, in the numbers as well as on screen.
//
// Four floors, STACKED — one building, drawn as an exploded axonometric: every floor sits directly above the one
// below it and they are lifted apart so the camera can look into all four at once. Version 1 of this simulator did
// the same with two floors and it is the view this version is built to match.
//
// The alternative, which version 2 shipped, was to unfold the floors into a 2x2 grid of plates on the ground. That
// keeps every room visible from any angle, but it stops being a building: a hospital where the wards are a field
// away from the theatres reads as four separate clinics, and the lift ride plays as a walk across a car park.
// Stacking costs some occlusion — at a 30-degree camera a floor hides the back of the floor below it — which is
// why picking a floor isolates it and drops the stack flat. `floorLift()` is the one place that geometry lives.
//
// Every plate therefore shares the same x/z origin and differs only in height. The walk graph is unchanged: node
// ids are per plate, and a lift ride is still one edge priced at 18 m of walking per floor rather than the
// distance between two plates that are only drawn apart.
//
// Rooms are never hand-placed. Each floor is a list of bands (the strips between corridors) and each band is a list
// of rooms laid out left to right by `placeBand`, which throws if they do not fit. That way the plan cannot
// silently develop overlapping rooms when a room is resized.

import {CLINICS, STATIONS} from './model.js';

// ───────────────────────────────────────────────────────────── the plates

export const PLATE_W = 86;
export const PLATE_D = 60;

/** Plate centres in world space. +x is east, +z is south (the main entrance faces +z). */
export const PLATES = {
  F1: {key: 'F1', floor: 1, x: 0, z: 0, name: 'ชั้น 1', sub: 'ส่วนหน้า · ตรวจวินิจฉัย · ฉุกเฉิน'},
  F2: {key: 'F2', floor: 2, x: 0, z: 0, name: 'ชั้น 2', sub: 'คลินิกเฉพาะทาง · ทันตกรรม · กายภาพบำบัด'},
  F3: {key: 'F3', floor: 3, x: 0, z: 0, name: 'ชั้น 3', sub: 'ห้องผ่าตัด · ห้องพักฟื้น · ICU'},
  F4: {key: 'F4', floor: 4, x: 0, z: 0, name: 'ชั้น 4', sub: 'หอผู้ป่วยใน'},
};
export const PLATE_KEYS = ['F1', 'F2', 'F3', 'F4'];
export const plateOf = (floor) => PLATES[`F${floor}`];

/**
 * How far apart the floors are drawn when the whole building is shown.
 *
 * Not the real 4.2 m floor-to-floor: at that spacing the camera sees the top floor and four slabs. 24 units is the
 * smallest gap at which a 30-degree camera can still see most of the floor below, which is the same trade version 1
 * made. `k` is the explode amount, animated 1 -> 0 when a single floor is isolated, so that isolating a floor drops
 * the stack flat and the chosen floor lands at y = 0 where the camera already is.
 */
export const FLOOR_LIFT = 24;
export const floorLift = (floor, k = 1) => (floor - 1) * FLOOR_LIFT * k;
/** The lift a room, unit or path node sits at. */
export const roomLift = (roomKey, k = 1) => floorLift(ROOMS[roomKey]?.floor ?? 1, k);

// Bands run front (+z, the entrance side) to back (-z). The numbers are the same on every plate so the lift core
// and the corridors line up when the plates are read side by side.
const CORRIDOR_W = 3.2;
export const CORRIDORS_Z = [18.4, 6.2, -6.0, -18.2]; // centre line of each cross corridor
export const VERT_X = [-10, 26]; // centre line of each vertical corridor
const BANDS = {
  lobby: {z0: 20.0, z1: 29.0},
  A: {z0: 7.8, z1: 16.8},
  B: {z0: -4.4, z1: 4.6},
  C: {z0: -16.6, z1: -7.6},
  D: {z0: -30.0, z1: -19.8},
};
const BAND_CORRIDOR = {lobby: 0, A: 0, B: 1, C: 2, D: 3}; // which corridor a band's doors open onto (front side)
const BAND_CORRIDOR_BACK = {lobby: null, A: 1, B: 2, C: 3, D: null};

/** Lay rooms left to right inside a band, skipping the vertical corridors. Throws rather than overlapping. */
function placeBand(plateKey, bandKey, items, {x0 = -42, x1 = 42, gap = 2, skipVerts = true, depth = null, align = 'front'} = {}) {
  const band = BANDS[bandKey];
  const plate = PLATES[plateKey];
  const out = [];
  const blocked = skipVerts ? VERT_X.map((x) => [x - CORRIDOR_W / 2 - 0.6, x + CORRIDOR_W / 2 + 0.6]) : [];
  let cx = x0;
  for (const it of items) {
    const w = it.w;
    const d = it.d ?? depth ?? band.z1 - band.z0;
    // slide past any vertical corridor this room would straddle
    for (let guard = 0; guard < 8; guard++) {
      const hit = blocked.find(([a, b]) => cx < b && cx + w > a);
      if (!hit) break;
      cx = hit[1] + gap;
    }
    if (cx + w > x1 + 1e-6) {
      throw new Error(`layout: ${plateKey} band ${bandKey} overflows at ${it.key} (needs ${(cx + w).toFixed(1)}, limit ${x1})`);
    }
    // front-aligned rooms put their door wall on the band's front edge
    const z0 = align === 'front' ? band.z0 : band.z1 - d;
    out.push({...it, lx: cx + w / 2, lz: z0 + d / 2, w, d, band: bandKey, plate: plateKey, floor: plate.floor});
    cx += w + gap;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────── the rooms
// `unit` ties a room to a station in model.js. Several rooms may serve one unit (six theatres, eight ward bays);
// `slots` says how many of that unit's service slots live in this room.

const F1_ROOMS = [
  ...placeBand('F1', 'lobby', [
    {key: 'ENTRY', name: 'Main Entrance', kind: 'entrance', w: 14, d: 9},
    {key: 'LOBBY', name: 'Main Lobby', kind: 'waiting', w: 30, d: 9, seats: 60},
    {key: 'INFO', name: 'Information', unit: 'INFO', kind: 'counter', w: 8, d: 5, slots: 2},
    {key: 'KIOSK', name: 'Queue Kiosks', kind: 'kiosk', w: 7, d: 5},
  ], {x0: -42, x1: 42, skipVerts: false}),
  ...placeBand('F1', 'A', [
    {key: 'REG', name: 'Records & Eligibility', unit: 'REG', kind: 'counter', w: 13, slots: 8},
    {key: 'TRI', name: 'Triage & Vitals', unit: 'TRI', kind: 'bays', w: 11, slots: 9},
    {key: 'CSH', name: 'Billing & Cashier', unit: 'CSH', kind: 'counter', w: 11, slots: 6},
    {key: 'PHA', name: 'Pharmacy', unit: 'PHA', kind: 'pharmacy', w: 13, slots: 8},
    {key: 'WC1', name: 'Toilets', kind: 'toilet', w: 6},
  ]),
  ...placeBand('F1', 'B', [
    {key: 'WAITA', name: 'Clinic Waiting', kind: 'waiting', w: 28, seats: 90},
    {key: 'LIFT1', name: 'Lift Lobby', kind: 'lift', w: 11},
    {key: 'WAITB', name: 'Diagnostics Waiting', kind: 'waiting', w: 14, seats: 40},
  ]),
  ...placeBand('F1', 'C', [
    {key: 'DOC1', name: 'Medicine & Paediatrics', unit: 'DOC', kind: 'cubicles', w: 29, slots: 9, clinics: ['med', 'ped']},
    {key: 'SUBW1', name: 'Clinic Sub-waiting', kind: 'waiting', w: 9, seats: 24},
    {key: 'EKG', name: 'EKG / Echo', unit: 'EKG', kind: 'diag', w: 8, slots: 3},
    {key: 'READ', name: 'Reporting Room', kind: 'office', w: 9},
  ]),
  ...placeBand('F1', 'D', [
    {key: 'LAB', name: 'Laboratory', unit: 'LAB', kind: 'lab', w: 12, d: 8, slots: 6},
    {key: 'XRY1', name: 'X-ray 1', unit: 'XRY', kind: 'xray', w: 9, d: 7, slots: 2},
    {key: 'XRY2', name: 'X-ray 2', unit: 'XRY', kind: 'xray', w: 9, d: 7, slots: 2},
    {key: 'XRY3', name: 'X-ray 3', unit: 'XRY', kind: 'xray', w: 9, d: 7, slots: 1},
    {key: 'CT', name: 'CT / MRI / Ultrasound', unit: 'CT', kind: 'ct', w: 9, d: 8, slots: 2},
    {key: 'ERT', name: 'ER Triage', unit: 'ERT', kind: 'counter', w: 5, d: 5, slots: 2},
    {key: 'ER', name: 'Emergency Room', unit: 'ER', kind: 'er', w: 15, d: 10, slots: 8},
  ], {skipVerts: false}),
];

const F2_ROOMS = [
  ...placeBand('F2', 'lobby', [
    {key: 'STAIR2', name: 'Stair & Landing', kind: 'stair', w: 8, d: 7},
    {key: 'WAITE', name: 'Specialty Waiting', kind: 'waiting', w: 34, d: 9, seats: 80},
    {key: 'OFF2', name: 'Clinic Office', kind: 'office', w: 10, d: 6},
  ], {skipVerts: false}),
  ...placeBand('F2', 'A', [
    {key: 'DOC2', name: 'Surgery & Orthopaedics', unit: 'DOC', kind: 'cubicles', w: 18, slots: 5, clinics: ['surg', 'ortho']},
    {key: 'DOC3', name: 'Obstetrics & Gynaecology', unit: 'DOC', kind: 'cubicles', w: 9, slots: 2, clinics: ['obg']},
    {key: 'DOC4', name: 'Eye & ENT', unit: 'DOC', kind: 'cubicles', w: 12, slots: 3, clinics: ['eye', 'ent']},
    {key: 'WC2', name: 'Toilets', kind: 'toilet', w: 6},
  ]),
  ...placeBand('F2', 'B', [
    {key: 'WAITF', name: 'Treatment Waiting', kind: 'waiting', w: 26, seats: 60},
    {key: 'LIFT2', name: 'Lift Lobby', kind: 'lift', w: 11},
    {key: 'STORE2', name: 'Clean Supply', kind: 'store', w: 10},
  ]),
  ...placeBand('F2', 'C', [
    {key: 'PRC', name: 'Procedure & Injection', unit: 'PRC', kind: 'procedure', w: 10, slots: 3},
    {key: 'DEN', name: 'Dental', unit: 'DEN', kind: 'dental', w: 9, slots: 3},
    {key: 'PT', name: 'Physiotherapy', unit: 'PT', kind: 'physio', w: 14, slots: 4},
    {key: 'GYM', name: 'Rehab Gym', kind: 'physio', w: 12},
  ]),
  ...placeBand('F2', 'D', [
    {key: 'DAY2', name: 'Day Observation', kind: 'bays', w: 16, d: 9},
    {key: 'OFF3', name: 'Medical Records', kind: 'office', w: 12, d: 8},
    {key: 'STAFF2', name: 'Staff Room', kind: 'office', w: 10, d: 8},
  ], {skipVerts: false}),
];

const F3_ROOMS = [
  ...placeBand('F3', 'lobby', [
    {key: 'STAIR3', name: 'Stair & Landing', kind: 'stair', w: 8, d: 7},
    {key: 'ANE', name: 'Pre-op & Anaesthesia', unit: 'ANE', kind: 'preop', w: 12, d: 8, slots: 2},
    {key: 'ADM', name: 'Admission', unit: 'ADM', kind: 'counter', w: 10, d: 6, slots: 3},
    {key: 'WAITG', name: 'Relatives Waiting', kind: 'waiting', w: 16, d: 8, seats: 36},
  ], {skipVerts: false}),
  ...placeBand('F3', 'A', [
    {key: 'SCRUB', name: 'Scrub & Prep', kind: 'scrub', w: 10},
    {key: 'PACU', name: 'Recovery (PACU)', unit: 'PACU', kind: 'pacu', w: 16, slots: 6},
    {key: 'CSSD', name: 'Sterile Supply', kind: 'store', w: 10},
    {key: 'OFF4', name: 'Theatre Office', kind: 'office', w: 8},
  ]),
  ...placeBand('F3', 'B', [
    {key: 'ICU', name: 'Intensive Care', unit: 'ICU', kind: 'icu', w: 28, slots: 14},
    {key: 'LIFT3', name: 'Lift Lobby', kind: 'lift', w: 11},
    {key: 'STORE3', name: 'Equipment Store', kind: 'store', w: 10},
  ]),
  ...placeBand('F3', 'C', [
    {key: 'OR1', name: 'Theatre 1', unit: 'OR', kind: 'or', w: 8, slots: 1},
    {key: 'OR2', name: 'Theatre 2', unit: 'OR', kind: 'or', w: 8, slots: 1},
    {key: 'OR3', name: 'Theatre 3', unit: 'OR', kind: 'or', w: 8, slots: 1},
    {key: 'OR4', name: 'Theatre 4', unit: 'OR', kind: 'or', w: 8, slots: 1},
    {key: 'OR5', name: 'Theatre 5', unit: 'OR', kind: 'or', w: 8, slots: 1},
    {key: 'OR6', name: 'Theatre 6', unit: 'OR', kind: 'or', w: 8, slots: 1},
  ]),
  ...placeBand('F3', 'D', [
    {key: 'STERILE', name: 'Sterile Corridor', kind: 'corridor', w: 40, d: 7},
    {key: 'PLANT3', name: 'Plant Room', kind: 'store', w: 14, d: 7},
  ], {skipVerts: false}),
];

const WARD_NAMES = ['Medicine A', 'Medicine B', 'Surgery A', 'Surgery B', 'Paediatrics', 'Obstetrics', 'Orthopaedics', 'Private'];
const ward = (i, w = 19) => ({key: `W${i + 1}`, name: `Ward ${WARD_NAMES[i]}`, unit: 'WARD', kind: 'ward', w, slots: 25, ward: i});
const F4_ROOMS = [
  ...placeBand('F4', 'lobby', [
    {key: 'STAIR4', name: 'Stair & Landing', kind: 'stair', w: 8, d: 7},
    {key: 'WAITH', name: 'Visitor Waiting', kind: 'waiting', w: 18, d: 8, seats: 30},
    {key: 'OFF5', name: 'Ward Office', kind: 'office', w: 10, d: 6},
    {key: 'NURSE4', name: 'Nurse Station', kind: 'nurse', w: 14, d: 7},
    {key: 'WC4', name: 'Toilets & Bathing', kind: 'toilet', w: 10, d: 6},
  ], {skipVerts: false}),
  // two bays fit between the vertical corridors in each of the three middle bands; the back band takes three
  ...placeBand('F4', 'A', [ward(0), ward(1)]),
  ...placeBand('F4', 'B', [ward(2), {key: 'LIFT4', name: 'Lift Lobby', kind: 'lift', w: 11}]),
  ...placeBand('F4', 'C', [ward(3), ward(4)]),
  ...placeBand('F4', 'D', [ward(5), ward(6), ward(7)], {skipVerts: false, depth: 9}),
];

/** Every room, in world coordinates, keyed by room key. */
export const ROOMS = {};
for (const r of [...F1_ROOMS, ...F2_ROOMS, ...F3_ROOMS, ...F4_ROOMS]) {
  const plate = PLATES[r.plate];
  const corridorFront = BAND_CORRIDOR[r.band];
  const zFront = corridorFront == null ? null : CORRIDORS_Z[corridorFront];
  ROOMS[r.key] = {
    ...r,
    x: plate.x + r.lx,
    z: plate.z + r.lz,
    // the door is on the wall facing the corridor in front of the band, at the room's centre line
    doorLZ: r.lz + r.d / 2,
    doorZ: plate.z + r.lz + r.d / 2,
    doorX: plate.x + r.lx,
    corridorZ: zFront == null ? plate.z + r.lz + r.d / 2 + 2 : plate.z + zFront,
    // queues face the door: +z means the queue builds toward the corridor
    qDir: [0, 1],
    dept: r.unit ? STATIONS[r.unit].dept : 'support',
  };
}

/** Station key -> the rooms that serve it, with the slot range each room covers. */
export const UNIT_ROOMS = {};
for (const key of Object.keys(ROOMS)) {
  const r = ROOMS[key];
  if (!r.unit) continue;
  (UNIT_ROOMS[r.unit] ||= []).push(key);
}
for (const unit of Object.keys(UNIT_ROOMS)) {
  let base = 0;
  for (const rk of UNIT_ROOMS[unit]) {
    ROOMS[rk].slot0 = base;
    base += ROOMS[rk].slots || 0;
  }
  const total = base;
  const want = STATIONS[unit].c;
  if (total !== want && unit !== 'POR') {
    // not fatal, but it means the plan and the model disagree about how many slots exist
    console.warn(`layout: unit ${unit} has ${total} slots in the plan but ${want} in the model`);
  }
}

/** Which clinic sits in which consultation room, so a patient walks to the right door. */
export const CLINIC_ROOM = {};
for (const rk of UNIT_ROOMS.DOC || []) {
  for (const c of ROOMS[rk].clinics || []) CLINIC_ROOM[c] = rk;
}
// the per-clinic room count inside each consultation suite
export const CLINIC_SLOT0 = {};
{
  for (const rk of UNIT_ROOMS.DOC || []) {
    let b = ROOMS[rk].slot0;
    for (const c of ROOMS[rk].clinics || []) {
      CLINIC_SLOT0[c] = b;
      b += CLINICS[c].rooms;
    }
  }
}

export const GATES = {
  GATE_MAIN: {key: 'GATE_MAIN', name: 'Main entrance', x: PLATES.F1.x + 0, z: PLATES.F1.z + 33, floor: 1},
  GATE_ER: {key: 'GATE_ER', name: 'Ambulance bay', x: PLATES.F1.x + 40, z: PLATES.F1.z - 34, floor: 1},
};

// ────────────────────────────────────────────────── the walkable network

/** One node per corridor intersection and one per room door, per plate. */
const NODES = {};
const EDGES = [];
const addNode = (id, x, z, floor) => {
  NODES[id] = {id, x, z, floor};
  return id;
};
const addEdge = (a, b) => {
  const A = NODES[a];
  const B = NODES[b];
  EDGES.push({a, b, w: Math.hypot(A.x - B.x, A.z - B.z)});
};

for (const pk of PLATE_KEYS) {
  const plate = PLATES[pk];
  // corridor rails: every cross corridor gets nodes at both vertical corridors and at the plate's ends
  const xs = [-42, ...VERT_X, 42];
  CORRIDORS_Z.forEach((cz, ci) => {
    const row = [];
    for (const x of xs) row.push(addNode(`${pk}:c${ci}:${x}`, plate.x + x, plate.z + cz, plate.floor));
    for (let i = 1; i < row.length; i++) addEdge(row[i - 1], row[i]);
  });
  // the vertical corridors tie the cross corridors together
  for (const vx of VERT_X) {
    for (let ci = 1; ci < CORRIDORS_Z.length; ci++) addEdge(`${pk}:c${ci - 1}:${vx}`, `${pk}:c${ci}:${vx}`);
  }
}

// a door node per room, hung off the corridor its band faces
for (const key of Object.keys(ROOMS)) {
  const r = ROOMS[key];
  const ci = BAND_CORRIDOR[r.band];
  if (ci == null) continue;
  const plate = PLATES[r.plate];
  const doorId = addNode(`door:${key}`, r.doorX, r.doorZ, r.floor);
  const railId = addNode(`rail:${key}`, r.doorX, plate.z + CORRIDORS_Z[ci], r.floor);
  addEdge(doorId, railId);
  // splice the rail node into its corridor between the two nearest rail points
  const xs = [-42, ...VERT_X, 42];
  const lx = r.lx;
  let lo = xs[0];
  let hi = xs[xs.length - 1];
  for (const x of xs) {
    if (x <= lx && x > lo) lo = x;
    if (x >= lx && x < hi) hi = x;
  }
  addEdge(railId, `${r.plate}:c${ci}:${lo}`);
  addEdge(railId, `${r.plate}:c${ci}:${hi}`);
}

// the lift cores: one node per plate, joined to every other plate's core. Crossing plates is a lift ride, and its
// cost is the ride, not the distance between two plates that are only drawn apart.
const LIFT_NODE = {};
for (const pk of PLATE_KEYS) {
  const lift = Object.values(ROOMS).find((r) => r.plate === pk && r.kind === 'lift');
  const anchor = lift || Object.values(ROOMS).find((r) => r.plate === pk && r.kind === 'stair');
  LIFT_NODE[pk] = addNode(`lift:${pk}`, anchor.x, anchor.doorZ, anchor.floor);
  const ci = BAND_CORRIDOR[anchor.band];
  if (ci != null) addEdge(LIFT_NODE[pk], `rail:${anchor.key}`);
}
for (let i = 0; i < PLATE_KEYS.length; i++) {
  for (let j = i + 1; j < PLATE_KEYS.length; j++) {
    const a = LIFT_NODE[PLATE_KEYS[i]];
    const b = LIFT_NODE[PLATE_KEYS[j]];
    const floors = Math.abs(PLATES[PLATE_KEYS[i]].floor - PLATES[PLATE_KEYS[j]].floor);
    // 18 m of equivalent walking per floor: the wait plus the ride, so the model charges for a lift honestly
    EDGES.push({a, b, w: 18 * floors, lift: true});
  }
}

// the two gates hang off the nearest corridor
addNode('GATE_MAIN', GATES.GATE_MAIN.x, GATES.GATE_MAIN.z, 1);
addEdge('GATE_MAIN', 'rail:ENTRY');
addNode('GATE_ER', GATES.GATE_ER.x, GATES.GATE_ER.z, 1);
addEdge('GATE_ER', 'rail:ER');

const ADJ = {};
for (const e of EDGES) {
  (ADJ[e.a] ||= []).push({to: e.b, w: e.w, lift: e.lift});
  (ADJ[e.b] ||= []).push({to: e.a, w: e.w, lift: e.lift});
}

/** Dijkstra over the corridor network. Returns {ids, cost, liftAt} or null. */
function route(fromId, toId) {
  if (fromId === toId) return {ids: [fromId], cost: 0, liftAt: -1};
  const dist = {[fromId]: 0};
  const prev = {};
  const seen = new Set();
  const heap = [[0, fromId]];
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [d, id] = heap.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === toId) break;
    for (const e of ADJ[id] || []) {
      const nd = d + e.w;
      if (nd < (dist[e.to] ?? Infinity)) {
        dist[e.to] = nd;
        prev[e.to] = {id, lift: e.lift};
        heap.push([nd, e.to]);
      }
    }
  }
  if (!(toId in dist)) return null;
  const ids = [];
  let liftAt = -1;
  let cur = toId;
  while (cur) {
    ids.unshift(cur);
    const p = prev[cur];
    if (p && p.lift) liftAt = 0; // marked below once the array is complete
    cur = p ? p.id : null;
  }
  if (liftAt === 0) {
    for (let i = 1; i < ids.length; i++) {
      if (ids[i].startsWith('lift:') && ids[i - 1].startsWith('lift:')) {
        liftAt = i;
        break;
      }
    }
  }
  return {ids, cost: dist[toId], liftAt};
}

/** Where a unit's work actually happens, used as the end point of a walk. */
function unitAnchor(unitKey, clinic) {
  if (unitKey === 'DOC' && clinic && CLINIC_ROOM[clinic]) return CLINIC_ROOM[clinic];
  const rooms = UNIT_ROOMS[unitKey];
  return rooms ? rooms[0] : null;
}

const nodeFor = (key, clinic) => {
  if (key in GATES) return key;
  if (ROOMS[key]) return `door:${key}`;
  const rk = unitAnchor(key, clinic);
  return rk ? `door:${rk}` : null;
};

const PATH_CACHE = new Map();

/**
 * The walk from one unit (or gate, or room) to another, as world-space points.
 * Returns {pts, metres, liftAt} where liftAt is the index in `pts` at which the patient is inside a lift and must
 * be hidden; -1 when the whole walk is on one floor.
 */
export function walkPath(fromKey, toKey, {clinicFrom = null, clinicTo = null} = {}) {
  const ck = `${fromKey}|${clinicFrom}>${toKey}|${clinicTo}`;
  const hit = PATH_CACHE.get(ck);
  if (hit) return hit;
  const a = nodeFor(fromKey, clinicFrom);
  const b = nodeFor(toKey, clinicTo);
  let res = {pts: [], metres: 6, liftAt: -1};
  if (a && b) {
    const r = route(a, b);
    if (r) {
      // a point carries its floor, because the floors are stacked: the renderer lifts each point to its own level
      const pts = r.ids.map((id) => [NODES[id].x, 0, NODES[id].z, NODES[id].floor]);
      // start and end inside the room rather than in its doorway
      const insideOf = (key, clinic) => {
        const rk = ROOMS[key] ? key : unitAnchor(key, clinic);
        if (!rk) return null;
        const rr = ROOMS[rk];
        return [rr.x, 0, rr.z - rr.d * 0.12, rr.floor];
      };
      const sIn = fromKey in GATES ? null : insideOf(fromKey, clinicFrom);
      const eIn = toKey in GATES ? null : insideOf(toKey, clinicTo);
      if (sIn) pts.unshift(sIn);
      if (eIn) pts.push(eIn);
      let metres = 0;
      for (let i = 1; i < pts.length; i++) metres += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
      let liftAt = -1;
      if (r.liftAt > 0) {
        liftAt = r.liftAt + (sIn ? 1 : 0);
        // the two plates are drawn apart; that gap is not walking, so take it out of the distance
        const g = Math.hypot(pts[liftAt][0] - pts[liftAt - 1][0], pts[liftAt][2] - pts[liftAt - 1][2]);
        metres -= g;
      }
      res = {pts, metres, liftAt};
    }
  }
  PATH_CACHE.set(ck, res);
  return res;
}

export const WALK_SPEED = 72; // metres per minute (~1.2 m/s — a patient, not a commuter)
const LIFT_MIN = 1.6; // the wait plus the ride, per transfer

/** What the model asks for: how long this walk takes, in minutes. */
export function walkTime(fromKey, toKey, opts) {
  const p = walkPath(fromKey, toKey, opts);
  const base = Math.max(0.15, p.metres / WALK_SPEED);
  return base + (p.liftAt > 0 ? LIFT_MIN : 0);
}

export function pathLength(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
  return m;
}

/** A point at fraction u along a polyline, plus the heading there. Skips the lift gap. */
export function pointAt(path, u) {
  const {pts, liftAt} = path;
  if (!pts.length) return {x: 0, z: 0, rot: 0, hidden: false};
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const isLift = i === liftAt;
    const len = isLift ? 0 : Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    segs.push({i, len, isLift});
    total += len;
  }
  // the lift ride takes a share of the trip's time even though it covers no walking distance
  const liftShare = liftAt > 0 ? 0.18 : 0;
  const walkU = Math.min(1, Math.max(0, (u - (u > 0.5 ? liftShare : 0)) / (1 - liftShare)));
  let want = (liftAt > 0 ? walkU : u) * total;
  for (const s of segs) {
    if (s.isLift) continue;
    if (want > s.len) {
      want -= s.len;
      continue;
    }
    const a = pts[s.i - 1];
    const b = pts[s.i];
    const k = s.len ? want / s.len : 0;
    return {
      x: a[0] + (b[0] - a[0]) * k,
      z: a[2] + (b[2] - a[2]) * k,
      rot: Math.atan2(b[0] - a[0], b[2] - a[2]),
      // the walker belongs to the floor the segment STARTS on; the lift segment is where that flips, and they are
      // hidden for the whole ride, so nobody is ever drawn sliding up the outside of the building
      floor: a[3] ?? 1,
      hidden: false,
    };
  }
  const last = pts[pts.length - 1];
  return {x: last[0], z: last[2], rot: 0, floor: last[3] ?? 1, hidden: false};
}

/** True while a walk is inside the lift, so the renderer can hide the patient instead of flying them between plates. */
export function inLift(path, u) {
  if (!path.liftAt || path.liftAt < 0) return false;
  return u > 0.46 && u < 0.64;
}

// ────────────────────────────────────────── positions inside a room

/** The room and local slot index for service slot `slot` of a unit. */
export function slotRoom(unitKey, slot, clinic) {
  const rooms = UNIT_ROOMS[unitKey] || [];
  if (unitKey === 'DOC' && clinic && CLINIC_ROOM[clinic]) {
    const rk = CLINIC_ROOM[clinic];
    return {room: ROOMS[rk], local: slot};
  }
  for (const rk of rooms) {
    const r = ROOMS[rk];
    if (slot < (r.slots || 0)) return {room: r, local: slot};
    slot -= r.slots || 0;
  }
  const r = ROOMS[rooms[rooms.length - 1]];
  return {room: r, local: 0};
}

/** Where the person being served stands or lies. */
export function servicePos(unitKey, slot, clinic) {
  const {room, local} = slotRoom(unitKey, slot, clinic);
  const n = Math.max(1, room.slots || 1);
  const kind = room.kind;
  // if the kit told us where it put the beds or the cubicles, use those and not an estimate
  const built = BUILT.get(room.key);
  if (built) {
    const pts = built.bedPts || built.cells;
    if (pts && pts.length) {
      const p = pts[local % pts.length];
      return {x: p.x, z: p.z, rot: p.rot ?? 0, bed: !!built.bedPts, row: p.rot ? 1 : 0};
    }
  }
  if (kind === 'counter' || kind === 'pharmacy') {
    // along the counter, on the public side
    const span = room.w - 2.4;
    const x = room.x - span / 2 + (span * (local + 0.5)) / n;
    return {x, z: room.z + room.d / 2 - 1.7, rot: Math.PI};
  }
  if (kind === 'cubicles') {
    const span = room.w - 1.6;
    const cols = n;
    const x = room.x - span / 2 + (span * (local + 0.5)) / cols;
    return {x, z: room.z + 0.4, rot: Math.PI};
  }
  if (kind === 'bays' || kind === 'er' || kind === 'icu' || kind === 'pacu' || kind === 'ward') {
    // two rows of beds along the long walls
    const perRow = Math.ceil(n / 2);
    const row = local < perRow ? 0 : 1;
    const i = local % perRow;
    const span = room.w - 3.0;
    const x = room.x - span / 2 + (span * (i + 0.5)) / perRow;
    const z = room.z + (row === 0 ? -room.d / 2 + 2.0 : room.d / 2 - 2.0);
    return {x, z, rot: row === 0 ? 0 : Math.PI, bed: true, row};
  }
  if (kind === 'or' || kind === 'ct' || kind === 'xray') {
    return {x: room.x, z: room.z, rot: 0, bed: true};
  }
  if (kind === 'lab' || kind === 'diag' || kind === 'procedure' || kind === 'dental' || kind === 'physio' || kind === 'preop') {
    const span = room.w - 2.6;
    const x = room.x - span / 2 + (span * (local + 0.5)) / n;
    return {x, z: room.z + room.d * 0.1, rot: Math.PI};
  }
  return {x: room.x, z: room.z, rot: Math.PI};
}

/** Where staff stand to serve slot `slot` — behind the counter, at the far side of the bed, beside the machine. */
export function staffPos(unitKey, slot, clinic) {
  const p = servicePos(unitKey, slot, clinic);
  const {room} = slotRoom(unitKey, slot, clinic);
  if (room.kind === 'counter' || room.kind === 'pharmacy') return {x: p.x, z: p.z - 1.5, rot: 0};
  if (p.bed) return {x: p.x + 1.3, z: p.z + (p.row === 1 ? -0.4 : 0.4), rot: -Math.PI / 2};
  return {x: p.x - 0.9, z: p.z - 1.2, rot: 0.4};
}

/**
 * Where the person at position `idx` in a unit's queue stands or sits.
 * The front of the queue stands; everyone behind sits in the waiting bay; once the chairs run out people stand
 * packed together, which is how you can tell a unit has overflowed just by looking at it.
 */
export function queuePos(unitKey, idx, clinic) {
  const rk = unitAnchor(unitKey, clinic);
  const room = ROOMS[rk];
  if (!room) return {x: 0, z: 0, rot: 0, sitting: false};
  const front = 3; // how many wait on their feet at the door
  const doorZ = room.z + room.d / 2;
  if (idx < front) {
    const x = room.x - 1.4 + idx * 1.4;
    return {x, z: doorZ + 1.4, rot: Math.PI, sitting: false};
  }
  const bay = waitingBayFor(room);
  const i = idx - front;
  if (bay && i < bay.seats.length) {
    const s = bay.seats[i];
    return {x: s.x, z: s.z, rot: s.rot, sitting: true};
  }
  // standing room only
  const over = bay ? i - bay.seats.length : i;
  const perRow = 14;
  const row = Math.floor(over / perRow);
  const col = over % perRow;
  const cz = room.corridorZ + 2.2 + row * 1.1;
  return {x: room.x - 7.2 + col * 1.1, z: cz, rot: Math.PI, sitting: false};
}

// ─────────────────────────────── positions the 3D kit actually built
//
// rooms.js decides where the chairs, the beds and the cubicles really are when it builds them. If this file guessed
// those positions with its own formula the two would drift apart and patients would sit beside chairs rather than on
// them — a bug the first version shipped. So the builders hand their points back through here and they win.
// (This file still cannot import rooms.js: model.js imports it, and model.js must stay free of three.js.)
const BUILT = new Map();

/** Called by world.js right after a room is built, with its points in WORLD coordinates. */
export function registerRoomPoints(roomKey, pts) {
  BUILT.set(roomKey, {...(BUILT.get(roomKey) || {}), ...pts});
  SEAT_CACHE.delete(roomKey);
  BAY_CACHE.clear();
}
export const builtPoints = (roomKey) => BUILT.get(roomKey) || null;

/** The waiting bay that serves a room: the nearest 'waiting' room on the same plate. */
const BAY_CACHE = new Map();
function waitingBayFor(room) {
  if (BAY_CACHE.has(room.key)) return BAY_CACHE.get(room.key);
  const bays = Object.values(ROOMS).filter((r) => r.kind === 'waiting' && r.plate === room.plate);
  let best = null;
  let bd = Infinity;
  for (const b of bays) {
    const d = Math.hypot(b.x - room.x, b.z - room.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  const out = best ? {room: best, seats: baySeats(best)} : null;
  BAY_CACHE.set(room.key, out);
  return out;
}

/**
 * Chair positions in a waiting bay. Once rooms.js has built the bay, these are the chairs it really put down;
 * before that (and in the node tests, where nothing is built) it is the same rows-and-banks estimate the builder
 * uses, so the plan can be checked without a browser.
 */
const SEAT_CACHE = new Map();
export function baySeats(bay) {
  if (SEAT_CACHE.has(bay.key)) return SEAT_CACHE.get(bay.key);
  const built = BUILT.get(bay.key);
  if (built && built.seats && built.seats.length) {
    SEAT_CACHE.set(bay.key, built.seats);
    return built.seats;
  }
  const seats = [];
  const want = bay.seats || 40;
  const perRow = Math.max(4, Math.floor((bay.w - 2.4) / 0.62));
  const rows = Math.ceil(want / perRow);
  for (let r = 0; r < rows; r++) {
    const z = bay.z - bay.d / 2 + 1.6 + r * 2.0;
    if (z > bay.z + bay.d / 2 - 0.8) break;
    for (let c = 0; c < perRow && seats.length < want; c++) {
      const x = bay.x - (bay.w - 2.4) / 2 + 0.31 + c * 0.62;
      seats.push({x, z, rot: r % 2 === 0 ? Math.PI : 0});
    }
  }
  SEAT_CACHE.set(bay.key, seats);
  return seats;
}

/**
 * Which floor a unit happens on — the one number the renderer needs that the position helpers do not return.
 * For the consultation rooms it depends on the clinic: medicine is on level 1, the specialty clinics on level 2.
 */
export function unitFloor(unitKey, clinic = null) {
  const rk = unitAnchor(unitKey, clinic);
  return ROOMS[rk]?.floor ?? STATIONS[unitKey]?.floor ?? 1;
}

/** Where somebody waiting for a result sits — a bench by the unit that ordered it. */
export function resultPos(unitKey, idx) {
  const rk = unitAnchor(unitKey);
  const room = ROOMS[rk];
  if (!room) return {x: 0, z: 0, rot: 0, sitting: true};
  const perRow = 10;
  const row = Math.floor(idx / perRow);
  const col = idx % perRow;
  return {x: room.x - 4.5 + col * 1.0, z: room.corridorZ + 3.6 + row * 1.2, rot: Math.PI, sitting: true};
}

// ─────────────────────────────────────────────────────────── camera framing

/** A camera that frames one unit's room: used by unit mode and by the process player. */
export function roomCamera(roomKey) {
  const r = ROOMS[roomKey];
  if (!r) return {x: 0, z: 0, d: 240, az: 38, el: 36, floor: 1};
  const span = Math.max(r.w, r.d);
  return {x: r.x, z: r.z + span * 0.1, d: Math.max(30, span * 2.1), az: 38, el: 40, floor: r.floor};
}

/** A camera that frames a whole floor. */
export function plateCamera(plateKey) {
  const p = PLATES[plateKey];
  return {x: p.x, z: p.z, d: 150, az: 38, el: 42, floor: p.floor};
}

/**
 * The whole building in one shot: the opening frame and what the home button gives back.
 *
 * `floor` is fractional on purpose — the camera aims at the middle of the stack rather than at any one floor — and
 * the elevation is lower than version 2's 44 degrees because a stack has to be looked INTO, not down on.
 */
export const HOME_CAMERA = {x: 0, z: 2, d: 215, az: 38, el: 30, floor: 2.5};

/** The three preset angles, in version 1's words. */
export const CAMERA_PRESETS = {
  overview: {...HOME_CAMERA},
  top: {x: 0, z: 0, d: 190, az: 0, el: 72, floor: 2.5},
  eye: {x: -6, z: 30, d: 34, az: 16, el: 7, floor: 1},
};

/** The ground extent, for the lot, the roads and the fence. */
export const SITE = {
  x0: -PLATE_W / 2 - 30,
  x1: PLATE_W / 2 + 30,
  z0: -PLATE_D / 2 - 30,
  z1: PLATE_D / 2 + 34,
};

/** A sanity check the page runs at boot: no two rooms on a plate may overlap. */
export function checkLayout() {
  const errs = [];
  const byPlate = {};
  for (const r of Object.values(ROOMS)) (byPlate[r.plate] ||= []).push(r);
  for (const pk of Object.keys(byPlate)) {
    const rs = byPlate[pk];
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i];
        const b = rs[j];
        const ox = Math.abs(a.lx - b.lx) < (a.w + b.w) / 2 - 1e-6;
        const oz = Math.abs(a.lz - b.lz) < (a.d + b.d) / 2 - 1e-6;
        if (ox && oz) errs.push(`${pk}: ${a.key} overlaps ${b.key}`);
      }
    }
  }
  // every unit in the model must have somewhere to happen
  for (const u of Object.keys(STATIONS)) {
    if (u === 'POR') continue;
    if (!UNIT_ROOMS[u]) errs.push(`unit ${u} has no room`);
  }
  // every room must be reachable from the main entrance
  for (const r of Object.values(ROOMS)) {
    if (BAND_CORRIDOR[r.band] == null) continue;
    const p = walkPath('GATE_MAIN', r.key);
    if (!p.pts.length) errs.push(`${r.key} is not reachable from the main entrance`);
  }
  return errs;
}
