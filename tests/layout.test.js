// The floor plan has to hold together before anything is drawn on it: node tests/layout.test.js
// No two rooms may overlap, every unit in the model needs somewhere to happen, every room must be reachable from
// the entrance, and the walking times the model charges must be plausible for the distances involved.
import {CLINIC_ROOM, GATES, HOME_CAMERA, PLATES, ROOMS, UNIT_ROOMS, baySeats, checkLayout, inLift, pointAt, queuePos, roomCamera, servicePos, staffPos, walkPath, walkTime} from '../sim/shared/layout.js';
import {CLINICS, PROCESSES, STATIONS, STATION_KEYS} from '../sim/shared/model.js';

let fails = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (cond) return;
  fails++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};

const errs = checkLayout();
ok(errs.length === 0, 'the plan has no overlaps and nothing unreachable', errs.slice(0, 12).join('\n        '));

console.log(`${Object.keys(ROOMS).length} rooms on ${Object.keys(PLATES).length} plates\n`);
console.log('unit  rooms                                               slots');
for (const u of STATION_KEYS) {
  if (u === 'POR') continue;
  const rs = UNIT_ROOMS[u] || [];
  const slots = rs.reduce((a, rk) => a + (ROOMS[rk].slots || 0), 0);
  console.log(`${u.padEnd(5)} ${rs.join(', ').slice(0, 50).padEnd(50)} ${String(slots).padStart(4)} / ${STATIONS[u].c}`);
  ok(rs.length > 0, `unit ${u} has at least one room`);
  ok(slots === STATIONS[u].c, `unit ${u} has as many slots in the plan as in the model`, `${slots} vs ${STATIONS[u].c}`);
}

// every clinic must have a consulting room of its own
for (const c of Object.keys(CLINICS)) ok(!!CLINIC_ROOM[c], `clinic ${c} has a room`);

console.log('\nwalk                          min      m   pts  lift');
const pairs = [
  ['GATE_MAIN', 'REG'], ['REG', 'TRI'], ['TRI', 'DOC'], ['DOC', 'LAB'], ['LAB', 'DOC'],
  ['DOC', 'XRY'], ['DOC', 'CSH'], ['CSH', 'PHA'], ['PHA', 'GATE_MAIN'],
  ['GATE_ER', 'ERT'], ['ERT', 'ER'], ['ER', 'CT'], ['ER', 'ANE'], ['ANE', 'OR'],
  ['OR', 'PACU'], ['PACU', 'ICU'], ['ADM', 'WARD'], ['DOC', 'PT'], ['REG', 'DEN'], ['TRI', 'PRC'],
];
for (const [a, b] of pairs) {
  const p = walkPath(a, b);
  const t = walkTime(a, b);
  console.log(`${a.padEnd(10)} -> ${b.padEnd(6)} ${t.toFixed(2).padStart(7)} ${p.metres.toFixed(0).padStart(6)} ${String(p.pts.length).padStart(5)} ${String(p.liftAt).padStart(5)}`);
  ok(p.pts.length >= 2, `a path exists from ${a} to ${b}`);
  ok(t > 0.1 && t < 14, `${a} to ${b} takes a believable time`, `${t.toFixed(2)} min over ${p.metres.toFixed(0)} m`);
}

// a walk that changes floor must go through a lift, and one that does not must never claim to
{
  const sameFloor = walkPath('REG', 'TRI');
  ok(sameFloor.liftAt === -1, 'a walk on one floor uses no lift');
  const up = walkPath('DOC', 'PT'); // level 1 to level 2
  ok(up.liftAt > 0, 'a walk between floors goes through a lift', `liftAt=${up.liftAt}`);
  const far = walkPath('ER', 'WARD'); // level 1 to level 4
  ok(far.liftAt > 0, 'emergency to a ward bed goes through a lift');
  ok(walkTime('ER', 'WARD') > walkTime('ER', 'CT'), 'four floors up costs more than crossing one floor');
}

// pointAt must stay on the path and must hide the patient while the lift is moving
{
  const p = walkPath('DOC', 'PT');
  let hiddenSomewhere = false;
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const q = pointAt(p, u);
    ok(Number.isFinite(q.x) && Number.isFinite(q.z), `pointAt is finite at u=${u.toFixed(2)}`);
    if (inLift(p, u)) hiddenSomewhere = true;
  }
  ok(hiddenSomewhere, 'a cross-floor walk is hidden for part of the trip (inside the lift)');
  const start = pointAt(p, 0);
  const end = pointAt(p, 1);
  ok(Math.hypot(start.x - p.pts[0][0], start.z - p.pts[0][2]) < 0.5, 'u=0 is the start of the path');
  ok(Math.hypot(end.x - p.pts[p.pts.length - 1][0], end.z - p.pts[p.pts.length - 1][2]) < 0.5, 'u=1 is the end of the path');
}

// service, staff and queue positions must land inside or just outside their own room
{
  for (const u of STATION_KEYS) {
    if (u === 'POR' || !UNIT_ROOMS[u]) continue;
    const n = STATIONS[u].c;
    for (let s = 0; s < Math.min(n, 30); s++) {
      const clinic = u === 'DOC' ? Object.keys(CLINICS)[s % Object.keys(CLINICS).length] : null;
      const p = servicePos(u, s, clinic);
      ok(Number.isFinite(p.x) && Number.isFinite(p.z), `${u} slot ${s} has a finite service position`);
      const st = staffPos(u, s, clinic);
      ok(Number.isFinite(st.x) && Number.isFinite(st.z), `${u} slot ${s} has a finite staff position`);
    }
    for (const i of [0, 1, 3, 10, 40, 120]) {
      const q = queuePos(u, i);
      ok(Number.isFinite(q.x) && Number.isFinite(q.z), `${u} queue position ${i} is finite`);
    }
  }
  // a seated queue position must actually be on a chair in a waiting bay
  const bays = Object.values(ROOMS).filter((r) => r.kind === 'waiting');
  for (const b of bays) {
    const seats = baySeats(b);
    ok(seats.length > 0, `waiting bay ${b.key} has chairs`);
    ok(seats.length >= Math.min(b.seats, 20), `waiting bay ${b.key} fits most of its intended ${b.seats} seats`, `got ${seats.length}`);
    for (const s of seats) {
      const inside = Math.abs(s.x - b.x) <= b.w / 2 + 0.1 && Math.abs(s.z - b.z) <= b.d / 2 + 0.1;
      if (!inside) {
        ok(false, `every chair in ${b.key} is inside the bay`, `chair at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
        break;
      }
    }
  }
}

// every named process must be walkable end to end
{
  for (const proc of PROCESSES) {
    const route = ['GATE_MAIN', ...proc.route];
    let total = 0;
    let broken = null;
    for (let i = 1; i < route.length; i++) {
      const p = walkPath(route[i - 1], route[i]);
      if (!p.pts.length) broken = `${route[i - 1]} -> ${route[i]}`;
      total += walkTime(route[i - 1], route[i]);
    }
    ok(!broken, `the ${proc.key} process is walkable end to end`, broken || '');
    ok(total < 50, `the ${proc.key} process does not spend half the day walking`, `${total.toFixed(1)} min of walking`);
  }
}

// cameras must point at something
{
  for (const rk of Object.keys(ROOMS)) {
    const c = roomCamera(rk);
    ok(c.d > 10 && c.d < 400, `the camera for ${rk} is at a sane distance`, `d=${c.d}`);
  }
  ok(HOME_CAMERA.d > 100, 'the home camera sees the whole site');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
