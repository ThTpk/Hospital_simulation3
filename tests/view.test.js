// Acceptance criteria for the things version 3 added: node tests/view.test.js
//
// The 3D itself cannot be checked here — that needs a browser — but everything it is DRIVEN by can:
// the stacked floors, the floor each position belongs to, the preset scenarios, the live sliders and the labels.
// These are the parts where a mistake is silent on screen: a patient drawn one floor too low still looks like a
// patient, and a scenario that quietly changes nothing still looks like a scenario.
import {LANES, STATIONS, STATION_KEYS, runDay} from '../sim/shared/model.js';
import {FLOOR_LIFT, PLATES, PLATE_KEYS, ROOMS, UNIT_ROOMS, checkLayout, floorLift, unitFloor, walkPath, walkTime} from '../sim/shared/layout.js';
import {SCENARIOS, applyScenario, matchesScenario, scenarioOf, sliderSpecs, totalPerDay} from '../sim/shared/scenarios.js';
import {UNIT_TH, clinicTh, insTh, laneTh, unitTh} from '../sim/shared/th.js';

let fails = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (cond) return;
  fails++;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
};

const fresh = () => ({seed: 20261119, servers: {}, svc: {}, dist: {}, scale: {}, orders: {}, orderK: 1, flatBooking: 0, hourK: null, surge: null, breaks: true, balking: true, scenario: 'normal'});

// ---- 1. the building is a stack: one footprint, four heights
{
  ok(checkLayout().length === 0, 'the plan still checks out', checkLayout().join('; '));
  const xs = new Set(PLATE_KEYS.map((k) => `${PLATES[k].x},${PLATES[k].z}`));
  ok(xs.size === 1, 'every floor shares one footprint', [...xs].join(' / '));
  ok(
    PLATE_KEYS.every((k, i) => floorLift(PLATES[k].floor, 1) === i * FLOOR_LIFT),
    'the floors are lifted one storey apart when the stack is open',
    PLATE_KEYS.map((k) => floorLift(PLATES[k].floor, 1)).join(','),
  );
  ok(
    PLATE_KEYS.every((k) => floorLift(PLATES[k].floor, 0) === 0),
    'isolating a floor drops the whole stack to the ground, so the camera does not have to move with it',
  );
}

// ---- 2. every unit, and every point of every walk, knows which floor it is on
{
  for (const u of STATION_KEYS) {
    if (!UNIT_ROOMS[u]) continue;
    const f = unitFloor(u);
    ok(f >= 1 && f <= 4, `${u} is on a real floor`, `got ${f}`);
    // One unit is allowed to be on two floors, and exactly one is: medicine and paediatrics are downstairs with
    // the diagnostics they order, the specialty clinics are upstairs. That is why a position has to carry its own
    // floor instead of the renderer looking one up per unit.
    const spread = new Set(UNIT_ROOMS[u].map((rk) => ROOMS[rk].floor)).size > 1;
    ok(!spread || u === 'DOC', `${u} does not have rooms spread over two floors`, UNIT_ROOMS[u].map((rk) => `${rk}:${ROOMS[rk].floor}`).join(' '));
  }
  ok(new Set(UNIT_ROOMS.DOC.map((rk) => ROOMS[rk].floor)).size === 2, 'the consultation rooms really do span two floors');
  ok(unitFloor('DOC', 'med') !== unitFloor('DOC', 'eye'), 'and a clinic resolves to the floor it is actually on', `med ${unitFloor('DOC', 'med')} · eye ${unitFloor('DOC', 'eye')}`);

  const p = walkPath('REG', 'WARD');
  ok(p.pts.every((q) => q.length === 4 && q[3] >= 1), 'every point of a walk carries its floor');
  ok(p.liftAt > 0, 'a walk between floors goes through a lift');
  const before = p.pts[p.liftAt - 1][3];
  const after = p.pts[p.liftAt][3];
  ok(before !== after, 'the floor changes exactly at the lift, not anywhere else', `${before} -> ${after}`);
  ok(
    p.pts.slice(0, p.liftAt).every((q) => q[3] === before) && p.pts.slice(p.liftAt).every((q) => q[3] === after),
    'nobody changes floor halfway down a corridor',
  );
  const flat = walkPath('REG', 'TRI');
  ok(flat.liftAt === -1 && flat.pts.every((q) => q[3] === 1), 'a walk on one floor uses no lift');
}

// ---- 3. the preset scenarios do what their label says
{
  // with the real walking times, so the figures printed here are the ones the page shows
  const day = (cfg) => runDay({seed: 20261119, walkTime, cfg});
  const base = day(applyScenario(fresh(), 'normal'));
  console.log(`วันปกติ: ${base.totals.arrived} ราย · ห้องตรวจรอเฉลี่ย ${base.summary.DOC.waitMean.toFixed(1)} นาที · เดินออก ${base.totals.balked + base.totals.reneged}`);

  for (const sc of SCENARIOS) {
    const cfg = applyScenario(fresh(), sc.key);
    ok(matchesScenario(cfg, sc.key), `“${sc.label}” recognises itself after being applied`);
    const d = day(cfg);
    ok(d.totals.arrived > 0 && d.patients.length > 0, `“${sc.label}” produces a day that runs`);
    const line = `${sc.label}: ${d.totals.arrived} ราย · ห้องตรวจรอ ${d.summary.DOC.waitMean.toFixed(1)} น. · ER รอ ${d.summary.ER.waitMean.toFixed(1)} น.`;
    console.log(`  ${line}`);
  }

  const monday = day(applyScenario(fresh(), 'monday'));
  ok(monday.totals.arrived > base.totals.arrived * 1.1, 'เช้าวันจันทร์ brings more people than a normal day', `${base.totals.arrived} -> ${monday.totals.arrived}`);
  ok(monday.summary.DOC.waitMean > base.summary.DOC.waitMean, 'and they wait longer for a doctor', `${base.summary.DOC.waitMean.toFixed(1)} -> ${monday.summary.DOC.waitMean.toFixed(1)} min`);

  const short = day(applyScenario(fresh(), 'shortdoc'));
  ok(short.summary.DOC.servers === 16, 'แพทย์ลา 3 ห้อง really closes three rooms', `${short.summary.DOC.servers} open`);
  // 16% fewer rooms, far more than 16% more waiting: the whole reason a queue model is worth building
  ok(
    short.summary.DOC.waitMean > base.summary.DOC.waitMean * 1.25,
    'and the wait grows by much more than the 16% the staffing fell by',
    `${base.summary.DOC.waitMean.toFixed(1)} -> ${short.summary.DOC.waitMean.toFixed(1)} min on 19 -> 16 rooms`,
  );

  const spread = day(applyScenario(fresh(), 'spread'));
  ok(Math.abs(spread.totals.arrived - base.totals.arrived) <= base.totals.arrived * 0.03, 'กระจายนัดทั่ววัน moves nobody in or out of the hospital', `${base.totals.arrived} vs ${spread.totals.arrived}`);
  ok(spread.summary.DOC.waitMean < base.summary.DOC.waitMean, 'but the wait falls anyway, with nobody hired', `${base.summary.DOC.waitMean.toFixed(1)} -> ${spread.summary.DOC.waitMean.toFixed(1)} min`);

  const mass = day(applyScenario(fresh(), 'masscas'));
  const erIn = (d, from, to) => d.patients.filter((p) => p.lane === 'er' && p.tArrive >= from && p.tArrive < to).length;
  ok(erIn(mass, 630, 720) > erIn(base, 630, 720) * 1.8, 'อุบัติเหตุหมู่ really is a surge in the window it names', `${erIn(base, 630, 720)} -> ${erIn(mass, 630, 720)} between 10:30 and 12:00`);
  ok(mass.summary.ER.maxQueue > base.summary.ER.maxQueue, 'and the emergency department feels it', `queue ${base.summary.ER.maxQueue} -> ${mass.summary.ER.maxQueue}`);

  const flu = day(applyScenario(fresh(), 'flu'));
  const visits = (d, k) => d.patients.reduce((a, p) => a + p.steps.filter((s) => s.k === k && s.kind === 'service').length, 0);
  ok(visits(flu, 'XRY') > visits(base, 'XRY') * 1.6, 'ฤดูไข้หวัด doubles the imaging referrals', `${visits(base, 'XRY')} -> ${visits(flu, 'XRY')} x-rays`);
}

// ---- 4. the sliders write where they say they write
{
  const specs = sliderSpecs();
  ok(specs.length > 8, 'there are sliders for the numbers worth moving while watching', `${specs.length} sliders`);
  for (const sp of specs) {
    const cfg = fresh();
    const was = sp.get(cfg);
    const want = sp.kind === 'servers' ? Math.max(sp.min, was - 1) : sp.kind === 'book' ? 1 : Math.max(sp.min, Math.round(was * 0.5));
    sp.set(cfg, want);
    ok(Math.abs(sp.get(cfg) - want) < 0.51, `the ${sp.label} slider reads back what it was set to`, `set ${want}, read ${sp.get(cfg)}`);
    ok(typeof sp.fmt(want) === 'string' && sp.fmt(want).length > 0, `the ${sp.label} slider has something to print`);
  }
  // and the value really reaches the simulation
  const cfg = fresh();
  const doc = specs.find((s) => s.key === 'DOC');
  doc.set(cfg, 14);
  const d = runDay({seed: 20261119, walkTime, cfg});
  ok(d.summary.DOC.servers === 14, 'moving the consultation-room slider changes the day that is recorded', `${d.summary.DOC.servers} rooms`);

  const vol = specs.find((s) => s.key === 'walkin');
  const c2 = fresh();
  vol.set(c2, 100);
  ok(Math.abs(totalPerDay(c2) - (totalPerDay(fresh()) - LANES.walkin.perDay + 100)) < 1, 'the arrivals slider changes the day total by exactly what it says');
}

// ---- 5. nothing English leaks into a Thai panel
{
  const listed = STATION_KEYS.filter((k) => UNIT_ROOMS[k] && k !== 'POR');
  for (const k of listed) {
    ok(!!UNIT_TH[k], `${k} has a Thai name for the panels`, `falls back to “${STATIONS[k].name}”`);
    ok(/[฀-๿]/.test(unitTh(k)), `${k}'s panel name is actually in Thai`, unitTh(k));
  }
  for (const l of Object.keys(LANES)) ok(/[฀-๿]/.test(laneTh(l)), `the ${l} lane has a Thai name`, laneTh(l));
  ok(/[฀-๿]/.test(insTh('ucs')) && /[฀-๿]/.test(clinicTh('ent')), 'insurance and clinics are named in Thai too');
  // the model keeps English, because those strings are printed on the signs inside the 3D
  ok(/^[\x00-\x7F]+$/.test(STATIONS.DOC.name), 'the model itself still names units in English, for the room signs', STATIONS.DOC.name);
  ok(scenarioOf('masscas').label.length > 0 && /[฀-๿]/.test(scenarioOf('masscas').label), 'scenarios are named in Thai');
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
