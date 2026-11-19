// The world: the building, the equipment, the people, and `pose(t)`.
//
// `pose(t)` is a pure function of the clock. It reads the recorded day from model.js and the coordinates from
// layout.js and writes positions — it never decides anything. Scrub backwards and you get exactly the frame you saw
// on the way forward, and the numbers on the panels cannot disagree with the bodies on the floor, because both are
// reading the same recording.
//
// Everybody on screen is one instanced crowd (one draw call for bodies, one for heads, one for shadows) except the
// patient being followed and the member of staff serving them, who are fully posable figures. That is what keeps a
// hospital with 600 patients and 200 beds inside the frame budget.
import * as THREE from 'three';
import {CLINICS, ST, STATIONS, STATION_KEYS} from './model.js';
import {
  GATES, HOME_CAMERA, PLATES, PLATE_D, PLATE_KEYS, PLATE_W, ROOMS, SITE, UNIT_ROOMS, VERT_X, CORRIDORS_Z,
  baySeats, inLift, pointAt, queuePos, resultPos, servicePos, slotRoom, staffPos, walkPath,
} from './layout.js';
import {registerRoomPoints} from './layout.js';
import {HOS, box, hosMat, labelTexture, signPanel} from './style.js';
import {createHospitalStage} from './style.js';
import * as RM from './rooms.js';
import * as EQ from './equip.js';
import * as PE from './people.js';

// people.js places a crowd instance by its POSE ORIGIN, not its feet: a seated instance is positioned at the seat
// and a lying one at the mattress. Getting these two numbers wrong is what puts patients through the floor.
const SEAT_Y = 0.45; // chair seat, from the scale contract in docs/MODEL_BRIEF.md
const DECK_Y = 0.62; // bed deck
const WALK_STRIDE = PE.WALK_STRIDE || 1.11;

const D2R = Math.PI / 180;

/**
 * Collapse a room's repeated static meshes into InstancedMesh.
 *
 * The model kits merge the parts WITHIN one model and cache its geometry, so a second ward bed costs no new
 * geometry — but it is still its own draw call, and a ward of 25 beds is 200 of them. Eight wards, an ICU and six
 * theatres later the scene is thousands of draw calls and an integrated GPU manages five frames a second.
 *
 * Because the kits cache, every copy of a given part shares one geometry AND one material, so they can simply be
 * bucketed by that pair and re-issued as one instanced draw. Baking per ROOM rather than per scene keeps each
 * instanced mesh inside the room group, so clicking a room still picks the room.
 */
function bakeStatics(group, skip) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.material) return;
    for (let p = o; p; p = p.parent) if (skip.has(p)) return; // anything that moves stays a real mesh
    const mk = Array.isArray(o.material) ? o.material.map((m) => m.uuid).join(',') : o.material.uuid;
    const key = `${o.geometry.uuid}|${mk}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(o);
  });
  let saved = 0;
  const m = new THREE.Matrix4();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    const im = new THREE.InstancedMesh(first.geometry, first.material, list.length);
    im.castShadow = first.castShadow;
    im.receiveShadow = first.receiveShadow;
    list.forEach((o, i) => {
      o.updateMatrixWorld(true);
      im.setMatrixAt(i, m.multiplyMatrices(inv, o.matrixWorld));
    });
    im.instanceMatrix.needsUpdate = true;
    // a real bounding sphere over the instances, so the pass stays frustum-culled; switching culling off instead
    // means the whole hospital is drawn even when the camera is inside one consulting room
    im.computeBoundingSphere();
    group.add(im);
    for (const o of list) o.parent?.remove(o);
    saved += list.length - 1;
  }
  return saved;
}
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

// What equipment each kind of room gets. This is where "the rooms have their proper kit" actually happens.
//
// Each entry receives (room, place, slots). `place(built, x, z, rot, animKind)` puts a model down in ROOM-LOCAL
// coordinates (x right, z toward the door). `slots` is the authoritative list of service positions for this room,
// taken from layout.js — the SAME function that decides where the patient will be drawn. Anything that belongs to
// a service slot (a bed, a chair, a machine the patient lies on) must be placed from `slots`, never from a second
// formula, or the body and the furniture drift apart.
const FURNISH = {
  counter: (r, p, slots) => {
    // the counter itself, its screens and the staff chairs come from rooms.js buildCounter
    if (r.unit === 'REG') {
      p('buildFileShelf', () => EQ.buildFileShelf({bays: 5}), -r.w / 2 + 2.2, -r.d / 2 + 0.7, 0);
      p('buildPrinter', () => EQ.buildPrinter(), r.w / 2 - 1.6, -r.d / 2 + 0.8, 0);
    }
    if (r.unit === 'CSH') for (const s of slots) p('buildCashierCounter', () => EQ.buildCashierCounter({cardReader: true}), s.x, s.z - 0.9, Math.PI);
    p('buildSanitiser', () => EQ.buildSanitiser(), r.w / 2 - 0.8, r.d / 2 - 0.8, Math.PI);
    p('buildBin', () => EQ.buildBin({kind: 'general'}), -r.w / 2 + 0.8, r.d / 2 - 0.8, 0);
  },
  pharmacy: (r, p, slots) => {
    for (const s of slots) p('buildDispenseCounter', () => EQ.buildDispenseCounter({windows: 1}), s.x, s.z - 0.7, Math.PI);
    for (let i = 0; i < 4; i++) p('buildPharmShelf', () => EQ.buildPharmShelf({bays: 4}), -r.w / 2 + 2.4 + i * 2.6, -r.d / 2 + 1.0, 0);
    p('buildPackingTable', () => EQ.buildPackingTable(), r.w / 2 - 3.0, -r.d / 2 + 2.6, 0);
    p('buildPillTrolley', () => EQ.buildPillTrolley(), r.w / 2 - 1.4, -0.4, 0.4);
  },
  bays: (r, p, slots) => {
    slots.forEach((s, i) => {
      p('buildExamDesk', () => EQ.buildExamDesk(), s.x, s.z - 0.9, Math.PI);
      p('buildBPMonitor', () => EQ.buildBPMonitor(), s.x + 0.75, s.z - 1.5, Math.PI);
      p('buildPatientStool', () => EQ.buildPatientStool(), s.x, s.z + 0.35, 0);
      if (i % 3 === 0) p('buildWeighScale', () => EQ.buildWeighScale({heightRod: true}), s.x - 1.0, -r.d / 2 + 0.9, 0);
    });
    p('buildSanitiser', () => EQ.buildSanitiser(), r.w / 2 - 0.8, r.d / 2 - 0.8, Math.PI);
  },
  cubicles: (r, p, slots) => {
    slots.forEach((s) => {
      p('buildExamDesk', () => EQ.buildExamDesk(), s.x - 0.5, s.z - 1.1, Math.PI);
      p('buildDoctorChair', () => EQ.buildDoctorChair(), s.x - 0.5, s.z - 1.9, 0);
      p('buildPatientStool', () => EQ.buildPatientStool(), s.x - 0.5, s.z + 0.1, Math.PI);
      p('buildExamBed', () => EQ.buildExamBed({head: 0.25}), s.x + 0.95, s.z - 0.3, Math.PI / 2);
      p('buildCurtain', () => EQ.buildCurtain({len: 2.0, open: 0.7}), s.x + 0.95, s.z - 1.5, 0);
      p('buildWallChart', () => EQ.buildWallChart(), s.x - 1.2, -r.d / 2 + 0.2, 0);
    });
  },
  lab: (r, p, slots) => {
    slots.slice(0, 4).forEach((s) => p('buildPhlebotomyChair', () => EQ.buildPhlebotomyChair(), s.x, s.z, Math.PI));
    p('buildLabBench', () => EQ.buildLabBench({len: r.w - 4}), 0, -r.d / 2 + 1.1, 0);
    p('buildAnalyser', () => EQ.buildAnalyser({lights: true}), -r.w / 2 + 3.0, -r.d / 2 + 1.2, 0);
    p('buildAnalyser', () => EQ.buildAnalyser({lights: true}), -r.w / 2 + 6.0, -r.d / 2 + 1.2, 0);
    p('buildCentrifuge', () => EQ.buildCentrifuge({spin: 0}), 0.5, -r.d / 2 + 1.2, 0, 'centrifuge');
    p('buildMicroscope', () => EQ.buildMicroscope(), 2.6, -r.d / 2 + 1.2, 0);
    p('buildTubeRack', () => EQ.buildTubeRack(), 4.2, -r.d / 2 + 1.2, 0);
    p('buildFridge', () => EQ.buildFridge(), r.w / 2 - 1.4, -r.d / 2 + 1.0, 0);
    p('buildSpecimenHatch', () => EQ.buildSpecimenHatch(), r.w / 2 - 1.2, r.d / 2 - 0.3, Math.PI);
  },
  xray: (r, p, slots) => {
    const s0 = slots[0] || {x: 0, z: 0};
    p('buildXrayTable', () => EQ.buildXrayTable({tube: 1.6}), s0.x, s0.z, 0, 'xray');
    p('buildXrayBooth', () => EQ.buildXrayBooth(), r.w / 2 - 1.6, r.d / 2 - 1.4, -Math.PI / 2);
    p('buildLeadApronRack', () => EQ.buildLeadApronRack(), -r.w / 2 + 1.0, r.d / 2 - 1.2, 0);
    p('buildViewingStation', () => EQ.buildViewingStation({screens: 2}), -r.w / 2 + 1.4, -r.d / 2 + 1.0, 0);
  },
  ct: (r, p, slots) => {
    const s0 = slots[0] || {x: 0, z: 0};
    p('buildCTScanner', () => EQ.buildCTScanner({bed: 0.3, ring: 0}), s0.x, s0.z, 0, 'ct');
    p('buildXrayBooth', () => EQ.buildXrayBooth(), r.w / 2 - 1.8, r.d / 2 - 1.4, -Math.PI / 2);
    p('buildUltrasound', () => EQ.buildUltrasound(), -r.w / 2 + 1.6, r.d / 2 - 1.8, 0.3);
    p('buildViewingStation', () => EQ.buildViewingStation({screens: 3}), -r.w / 2 + 1.6, -r.d / 2 + 1.0, 0);
  },
  diag: (r, p, slots) => {
    slots.forEach((s) => {
      p('buildExamBed', () => EQ.buildExamBed({head: 0.2}), s.x, s.z, 0);
      p('buildEKGCart', () => EQ.buildEKGCart(), s.x + 0.9, s.z - 1.1, -0.4, 'ekg');
      p('buildCurtain', () => EQ.buildCurtain({len: 2.0, open: 0.5}), s.x, s.z - 1.6, 0);
    });
  },
  procedure: (r, p, slots) => {
    slots.forEach((s) => {
      p('buildExamBed', () => EQ.buildExamBed({head: 0.4}), s.x, s.z, 0);
      p('buildIVPole', () => EQ.buildIVPole({bags: 1}), s.x + 1.0, s.z - 1.0, 0);
      p('buildCurtain', () => EQ.buildCurtain({len: 2.0, open: 0.6}), s.x, s.z - 1.6, 0);
    });
    p('buildLabBench', () => EQ.buildLabBench({len: r.w - 3}), 0, -r.d / 2 + 0.9, 0);
    p('buildBin', () => EQ.buildBin({kind: 'sharps'}), r.w / 2 - 0.8, -r.d / 2 + 0.8, 0);
  },
  dental: (r, p, slots) => {
    slots.forEach((s) => {
      p('buildDentalChair', () => EQ.buildDentalChair({light: 1, tray: true}), s.x, s.z, 0, 'dental');
      p('buildCurtain', () => EQ.buildCurtain({len: 1.8, open: 0.4}), s.x, s.z - 1.7, 0);
    });
    p('buildDentalXray', () => EQ.buildDentalXray(), r.w / 2 - 1.3, -r.d / 2 + 1.0, 0);
    p('buildSteriliser', () => EQ.buildSteriliser(), -r.w / 2 + 1.3, -r.d / 2 + 1.0, 0);
  },
  physio: (r, p, slots) => {
    slots.forEach((s) => p('buildPTTable', () => EQ.buildPTTable(), s.x, s.z, 0));
    p('buildParallelBars', () => EQ.buildParallelBars(), r.w / 2 - 4.0, -r.d / 2 + 2.2, 0);
    p('buildExerciseBike', () => EQ.buildExerciseBike(), r.w / 2 - 1.6, -r.d / 2 + 1.4, -0.5);
    p('buildTreadmill', () => EQ.buildTreadmill(), r.w / 2 - 1.6, 1.0, -0.5);
    p('buildUltrasoundTherapy', () => EQ.buildUltrasoundTherapy(), -r.w / 2 + 1.4, -r.d / 2 + 1.2, 0);
    p('buildMatSet', () => EQ.buildMatSet(), -r.w / 2 + 1.6, r.d / 2 - 1.6, 0);
  },
  er: (r, p, slots) => {
    slots.forEach((s) => {
      const back = s.row === 1 ? 1 : -1; // which way the headwall is
      p('buildERBed', () => EQ.buildERBed({rails: true, head: 0.3}), s.x, s.z, s.rot);
      p('buildVitalMonitor', () => EQ.buildVitalMonitor({on: true, beat: 0}), s.x + 1.3, s.z + back * 0.9, s.rot, 'monitor');
      p('buildIVPole', () => EQ.buildIVPole({bags: 2}), s.x - 1.3, s.z + back * 0.7, 0);
      p('buildOxygenPanel', () => EQ.buildOxygenPanel(), s.x, s.z + back * 1.6, s.rot);
      p('buildCurtain', () => EQ.buildCurtain({len: 2.4, open: 0.35}), s.x + 1.6, s.z, Math.PI / 2);
    });
    p('buildCrashCart', () => EQ.buildCrashCart(), 0, 0, 0);
    p('buildDefibrillator', () => EQ.buildDefibrillator(), 1.4, 0, 0);
    p('buildVentilator', () => EQ.buildVentilator(), -1.6, 0, 0);
    p('buildSuctionUnit', () => EQ.buildSuctionUnit(), -2.8, 0, 0);
  },
  or: (r, p, slots) => {
    const s0 = slots[0] || {x: 0, z: 0};
    p('buildORTable', () => EQ.buildORTable({tilt: 0}), s0.x, s0.z, 0, 'ortable');
    p('buildORLamp', () => EQ.buildORLamp({aim: 0}), s0.x, s0.z, 0, 'orlamp');
    p('buildAnaesthesiaMachine', () => EQ.buildAnaesthesiaMachine(), -1.9, -1.5, 0.5, 'anaes');
    p('buildInstrumentTable', () => EQ.buildInstrumentTable(), 1.9, -1.4, -0.4);
    p('buildElectrosurgery', () => EQ.buildElectrosurgery(), 2.2, 0.4, -0.6);
    p('buildVitalMonitor', () => EQ.buildVitalMonitor({on: true, beat: 0}), -2.2, 0.3, 0.6, 'monitor');
    p('buildSurgicalScreen', () => EQ.buildSurgicalScreen(), 0, r.d / 2 - 1.0, Math.PI);
  },
  preop: (r, p, slots) => {
    slots.forEach((s) => {
      p('buildERBed', () => EQ.buildERBed({rails: true, head: 0.35}), s.x, s.z, s.rot);
      p('buildIVPole', () => EQ.buildIVPole({bags: 1}), s.x + 1.2, s.z - 1.0, 0);
      p('buildVitalMonitor', () => EQ.buildVitalMonitor({on: true, beat: 0}), s.x - 1.2, s.z - 1.0, 0, 'monitor');
      p('buildCurtain', () => EQ.buildCurtain({len: 2.2, open: 0.5}), s.x, s.z - 1.9, 0);
    });
    p('buildScrubSink', () => EQ.buildScrubSink({taps: 2}), r.w / 2 - 1.5, -r.d / 2 + 0.8, 0);
  },
  pacu: (r, p, slots) => {
    slots.forEach((s) => {
      const back = s.row === 1 ? 1 : -1;
      p('buildPACUBed', () => EQ.buildPACUBed(), s.x, s.z, s.rot);
      p('buildVitalMonitor', () => EQ.buildVitalMonitor({on: true, beat: 0}), s.x + 1.2, s.z + back * 0.9, s.rot, 'monitor');
      p('buildInfusionPump', () => EQ.buildInfusionPump(), s.x - 1.2, s.z + back * 0.8, 0);
    });
  },
  icu: (r, p, slots) => {
    slots.forEach((s) => {
      const back = s.row === 1 ? 1 : -1;
      p('buildICUBed', () => EQ.buildICUBed(), s.x, s.z, s.rot);
      p('buildVitalMonitor', () => EQ.buildVitalMonitor({on: true, beat: 0}), s.x + 1.2, s.z + back * 1.0, s.rot, 'monitor');
      p('buildVentilator', () => EQ.buildVentilator(), s.x - 1.2, s.z + back * 0.9, 0);
      p('buildInfusionPump', () => EQ.buildInfusionPump(), s.x - 1.9, s.z + back * 0.5, 0);
    });
  },
  ward: (r, p, slots) => {
    // the bay's headwalls, curtain tracks and nurse station come from rooms.js; the beds sit on its own bed points
    slots.forEach((s, i) => {
      const back = s.rot ? 1 : -1;
      p('buildWardBed', () => EQ.buildWardBed({head: 0.2}), s.x, s.z, s.rot);
      p('buildBedsideCabinet', () => EQ.buildBedsideCabinet(), s.x + 0.95, s.z + back * 0.5, 0);
      if (i % 4 === 0) p('buildIVPole', () => EQ.buildIVPole({bags: 1}), s.x - 0.9, s.z + back * 0.6, 0);
      if (i % 5 === 0) p('buildOverbedTable', () => EQ.buildOverbedTable(), s.x - 0.9, s.z, 0);
    });
  },
  waiting: (r, p) => {
    p('buildWaterCooler', () => EQ.buildWaterCooler(), -r.w / 2 + 1.0, -r.d / 2 + 1.0, 0);
    p('buildBin', () => EQ.buildBin({kind: 'general'}), r.w / 2 - 1.0, -r.d / 2 + 1.0, 0);
    p('buildSanitiser', () => EQ.buildSanitiser(), r.w / 2 - 2.2, -r.d / 2 + 1.0, 0);
  },
  kiosk: (r, p) => {
    for (let i = 0; i < 3; i++) p('buildQueueKiosk', () => EQ.buildQueueKiosk(), -2.2 + i * 2.2, 0, Math.PI);
  },
  office: (r, p) => {
    p('buildExamDesk', () => EQ.buildExamDesk(), 0, -1.0, Math.PI);
    p('buildDoctorChair', () => EQ.buildDoctorChair(), 0, -2.0, 0);
    p('buildFileShelf', () => EQ.buildFileShelf({bays: 4}), -r.w / 2 + 1.8, -r.d / 2 + 0.7, 0);
  },
  store: (r, p) => {
    for (let i = 0; i < Math.max(2, Math.floor(r.w / 3)); i++) p('buildPharmShelf', () => EQ.buildPharmShelf({bays: 3}), -r.w / 2 + 1.8 + i * 2.8, -r.d / 2 + 0.9, 0);
    p('buildLinenCart', () => EQ.buildLinenCart(), r.w / 2 - 1.4, 0.5, 0.3);
  },
  scrub: (r, p) => {
    p('buildScrubSink', () => EQ.buildScrubSink({taps: 3}), 0, -r.d / 2 + 0.9, 0);
    p('buildSteriliser', () => EQ.buildSteriliser(), r.w / 2 - 1.5, -r.d / 2 + 1.0, 0);
    p('buildLinenCart', () => EQ.buildLinenCart(), -r.w / 2 + 1.4, 0.4, 0);
  },
  nurse: (r, p) => {
    p('buildChartBoard', () => EQ.buildChartBoard(), 0, -r.d / 2 + 0.3, 0);
    p('buildPrinter', () => EQ.buildPrinter(), -r.w / 2 + 1.2, -r.d / 2 + 0.8, 0);
    p('buildLinenCart', () => EQ.buildLinenCart(), r.w / 2 - 1.3, -0.4, 0.3);
  },
  toilet: () => {},
  stair: () => {},
  lift: () => {},
  corridor: () => {},
  entrance: (r, p) => {
    p('buildSanitiser', () => EQ.buildSanitiser(), -r.w / 2 + 1.2, -0.8, 0);
    p('buildWheelchair', () => EQ.buildWheelchair({roll: 0, occupied: false}), r.w / 2 - 1.6, -0.6, 0.4);
    p('buildWheelchair', () => EQ.buildWheelchair({roll: 0, occupied: false}), r.w / 2 - 2.6, -0.6, 0.6);
  },
};

/**
 * Build the hospital. `day` is the recording from model.js.
 * Returns {st, root, pose, anchors, pickables, animated, project}.
 */
export function createWorld({canvas, day: day0, detail = 'high'}) {
  // the recording is swappable: the analysis tab edits a parameter, the model runs the day again, and the same
  // building replays the new recording. Only the index below depends on which day it is.
  let day = day0;
  // the three model kits, reachable from the console: `EQ.buildCTScanner({})` tells you straight away whether a
  // missing model is a bad call here or a broken builder there
  window.EQ = EQ;
  window.RM = RM;
  window.PE = PE;
  const st = createHospitalStage(canvas, {fov: 26});
  const root = new THREE.Group();
  st.scene.add(root);

  const animated = []; // {kind, obj, room} — equipment whose look depends on t
  let baked = 0; // how many draw calls the instancing pass removed
  const detailLayers = []; // per-plate furniture, switched by camera distance
  const BAD = new Set(); // builders that have already failed, so one broken model warns once, not 200 times
  const pickables = {}; // room key -> Object3D, for clicking
  const anchors = {}; // unit key -> () => Vector3

  // ---------------------------------------------------------------- ground
  if (RM.buildSiteGround) {
    root.add(RM.buildSiteGround({x0: SITE.x0, x1: SITE.x1, z0: SITE.z0, z1: SITE.z1}).group);
  } else {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(SITE.x1 - SITE.x0 + 120, SITE.z1 - SITE.z0 + 120).rotateX(-Math.PI / 2),
      hosMat(HOS.ground, {rough: 0.95}),
    );
    g.position.set((SITE.x0 + SITE.x1) / 2, -0.02, (SITE.z0 + SITE.z1) / 2);
    g.receiveShadow = true;
    root.add(g);
  }

  // car park, trees and the fence, outside the plates
  if (RM.buildCarPark) {
    const cp = RM.buildCarPark({cols: 14, rows: 3});
    cp.group.position.set(0, 0, SITE.z1 - 12);
    root.add(cp.group);
  }
  if (RM.buildTree) {
    let s = 7;
    const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // Plant only OUTSIDE the whole block of plates, never in the gaps between them. A tree standing in a gap is on
    // the ground and perfectly legal, but at 38 degrees it draws over the plate behind it and reads as a tree
    // growing out of a roof.
    const bx0 = Math.min(...PLATE_KEYS.map((k) => PLATES[k].x)) - PLATE_W / 2 - 6;
    const bx1 = Math.max(...PLATE_KEYS.map((k) => PLATES[k].x)) + PLATE_W / 2 + 6;
    const bz0 = Math.min(...PLATE_KEYS.map((k) => PLATES[k].z)) - PLATE_D / 2 - 6;
    const bz1 = Math.max(...PLATE_KEYS.map((k) => PLATES[k].z)) + PLATE_D / 2 + 6;
    const onPlate = (x, z) => x > bx0 && x < bx1 && z > bz0 && z < bz1;
    let placed = 0;
    for (let i = 0; i < 400 && placed < 44; i++) {
      const x = lerp(SITE.x0 - 10, SITE.x1 + 10, rand());
      const z = lerp(SITE.z0 - 10, SITE.z1 + 10, rand());
      if (onPlate(x, z)) continue;
      const t = RM.buildTree({kind: rand() < 0.22 ? 'bush' : 'tree'});
      const g = t.group || t;
      g.position.set(x, 0, z);
      g.scale.setScalar(0.85 + rand() * 0.5);
      root.add(g);
      placed++;
    }
  }

  // ---------------------------------------------------------------- plates
  for (const pk of PLATE_KEYS) {
    const plate = PLATES[pk];
    const pg = new THREE.Group();
    pg.position.set(plate.x, 0, plate.z);
    root.add(pg);

    if (RM.buildFloorPlate) pg.add(RM.buildFloorPlate({w: PLATE_W, d: PLATE_D, tint: HOS.floorA}).group);

    // Everything small enough to be invisible from across the site goes in here. At the whole-hospital camera a
    // scalpel is a long way under one pixel, but it still costs a draw call and a few hundred triangles — and
    // there are seven thousand of them. The shells, the beds and the people stay; the rest switches off.
    const detail = new THREE.Group();
    pg.add(detail);
    detailLayers.push({plate: pk, group: detail, x: plate.x, z: plate.z});

    // corridors: the cross corridors always, the vertical ones only where no room sits on them
    if (RM.buildCorridor) {
      for (const cz of CORRIDORS_Z) {
        const c = RM.buildCorridor({len: PLATE_W - 2, w: 3.2, dir: 'x', stripes: [HOS.blue, HOS.mint]});
        c.group.position.set(0, 0, cz);
        pg.add(c.group);
      }
      const clearVerts = !Object.values(ROOMS).some(
        (r) => r.plate === pk && r.band !== 'lobby' && r.band !== 'D' && VERT_X.some((vx) => Math.abs(r.lx - vx) < (r.w + 3.2) / 2 - 0.4),
      );
      if (clearVerts) {
        for (const vx of VERT_X) {
          const c = RM.buildCorridor({len: CORRIDORS_Z[0] - CORRIDORS_Z[CORRIDORS_Z.length - 1], w: 3.2, dir: 'z', stripes: []});
          c.group.position.set(vx, 0, (CORRIDORS_Z[0] + CORRIDORS_Z[CORRIDORS_Z.length - 1]) / 2);
          pg.add(c.group);
        }
      }
    }

    // the rooms on this plate
    for (const r of Object.values(ROOMS)) {
      if (r.plate !== pk) continue;
      const rg = new THREE.Group();
      rg.position.set(r.lx, 0, r.lz);
      pg.add(rg);
      pickables[r.key] = rg;
      // the room's own furniture lives on the detail layer, at the same place
      const dg = new THREE.Group();
      dg.position.copy(rg.position);
      detail.add(dg);

      const color = HOS[{front: 'blue', opd: 'mint', diag: 'olive', er: 'rose', surg: 'violet', ward: 'violet', money: 'amber', support: 'teal'}[r.dept] || 'blue'];
      const toWorld = (p) => ({x: r.x + p.x, z: r.z + p.z, rot: p.rot ?? 0, bay: p.bay});

      // An invisible box the size of the room. After the instancing pass the room group holds no meshes of its own,
      // so this is what the selection outline measures. It is never drawn.
      const bounds = new THREE.Mesh(new THREE.BoxGeometry(r.w, 2.9, r.d), new THREE.MeshBasicMaterial());
      bounds.position.y = 1.45;
      bounds.visible = false;
      bounds.userData.bounds = true;
      rg.add(bounds);

      // ---- the shell. Whatever the builder puts down, it hands its own points back and layout.js adopts them,
      // so a patient can never be drawn beside a chair instead of on it.
      let shell = null;
      if (r.kind === 'waiting') {
        // A real waiting hall is banks of eight with aisles between them. One continuous bank of forty-six chairs
        // is what the arithmetic wants and it reads as a conga line, so lay several banks across the room instead.
        const PER_BANK = 8;
        const BANK_W = PER_BANK * 0.56;
        const AISLE = 1.3;
        const banks = Math.max(1, Math.floor((r.w - 1.2) / (BANK_W + AISLE)));
        const rows = Math.max(1, Math.min(3, Math.floor((r.d - 1.6) / 1.9)));
        const pitch = (r.w - 1.2) / banks;
        const seats = [];
        const holder = new THREE.Group();
        for (let b = 0; b < banks; b++) {
          const bank = RM.buildWaitingBay?.({w: BANK_W + 0.6, d: r.d, rows, perRow: PER_BANK, color});
          if (!bank) break;
          const ox = -r.w / 2 + 0.6 + pitch * (b + 0.5);
          bank.group.position.x = ox;
          holder.add(bank.group);
          for (const st of bank.seats || []) seats.push({x: st.x + ox, z: st.z, rot: st.rot});
        }
        shell = {group: holder};
        registerRoomPoints(r.key, {seats: seats.map(toWorld)});
      } else if (r.kind === 'lift') {
        shell = RM.buildLiftCore?.({pax: 3, bed: 2});
      } else if (r.kind === 'stair') {
        shell = RM.buildStairBlock?.({w: r.w, d: r.d});
      } else if (r.kind === 'toilet') {
        shell = RM.buildToilet?.({w: r.w, d: r.d});
      } else if (r.kind === 'store') {
        shell = RM.buildStoreRoom?.({w: r.w, d: r.d});
      } else if (r.kind === 'entrance') {
        shell = RM.buildEntrance?.({w: r.w, color, label: 'MAIN ENTRANCE'});
      } else if (r.kind === 'cubicles') {
        // w is the width of ONE cubicle, not the row
        shell = RM.buildCubicleRow?.({n: r.slots, w: r.w / r.slots, d: r.d, color});
        if (shell?.cells) registerRoomPoints(r.key, {cells: shell.cells.map(toWorld)});
      } else if (r.kind === 'ward') {
        shell = RM.buildWardBay?.({beds: r.slots, w: r.w, d: r.d, name: r.name, color});
        if (shell?.bedPts) registerRoomPoints(r.key, {bedPts: shell.bedPts.map(toWorld)});
      } else if (r.kind === 'counter' || r.kind === 'pharmacy' || r.kind === 'nurse') {
        shell = RM.buildRoomShell?.({w: r.w, d: r.d, name: r.name, color, doors: 's', glassTop: false});
        const cnt = RM.buildCounter?.({len: Math.max(3, r.w - 2.6), posts: r.slots || 2, color, screen: r.kind !== 'nurse'});
        if (cnt) {
          cnt.group.position.set(0, 0, -r.d * 0.12);
          rg.add(cnt.group);
          // the customer stand point is where the patient waits; the post is where the member of staff sits
          if (cnt.posts) {
            registerRoomPoints(r.key, {
              cells: cnt.posts.map((p) => toWorld({x: p.fx ?? p.x, z: (p.fz ?? p.z) - r.d * 0.12, rot: Math.PI})),
              staffPts: cnt.posts.map((p) => toWorld({x: p.x, z: p.z - r.d * 0.12, rot: p.rot ?? 0})),
            });
          }
        }
      } else {
        shell = RM.buildRoomShell?.({w: r.w, d: r.d, name: r.name, color, doors: 's', glassTop: r.kind === 'office' || r.kind === 'icu'});
      }
      if (shell?.group) rg.add(shell.group);

      // ---- the equipment.
      // Bed rooms get their bed positions from layout.js, which is the same function that decides where the PATIENT
      // lies — so the bed and the body cannot end up in different places.
      const furnish = FURNISH[r.kind];
      if (furnish) {
        // Each item is built behind its own try: a single broken model leaves a gap, it does not empty the room,
        // and the warning names the builder instead of the room.
        const place = (name, make, x = 0, z = 0, rot = 0, animKind = null) => {
          let built;
          try {
            built = typeof make === 'function' ? make() : make;
          } catch (e) {
            if (!BAD.has(name)) {
              BAD.add(name);
              console.warn(`equip.${name}() threw while furnishing ${r.key}: ${e && e.stack ? e.stack : e}`);
            }
            return;
          }
          if (!built) return;
          const g = built.group || (built.isObject3D ? built : null);
          if (!g) {
            if (!BAD.has(name)) {
              BAD.add(name);
              console.warn(`equip.${name}() returned no group`);
            }
            return;
          }
          g.position.set(x, 0, z);
          g.rotation.y = rot;
          dg.add(g);
          if (animKind) animated.push({kind: animKind, obj: built, room: r});
        };
        const slots = [];
        if (r.unit) {
          for (let i = 0; i < (r.slots || 0); i++) {
            const g = servicePos(r.unit, (r.slot0 || 0) + i, (r.clinics || [])[0]);
            slots.push({x: g.x - r.x, z: g.z - r.z, rot: g.rot ?? 0, bed: !!g.bed, row: g.row ?? 0});
          }
        }
        try {
          furnish(r, place, slots);
        } catch (e) {
          console.warn(`furnishing ${r.key} (${r.kind}) failed: ${e.stack || e.message}`);
        }
      }

      // The sign over the door. It carries its own canvas texture, so it shares a material with nothing and can
      // never be folded into an instanced draw — and it is unreadable from across the site. It goes on the detail
      // layer with the furniture.
      if (r.unit || r.kind === 'waiting') {
        const sign = signPanel(r.unit || '', r.name, {w: Math.min(r.w - 1, 5.2), h: 0.7, color});
        sign.position.set(0, 2.55, r.d / 2 + 0.05);
        dg.add(sign);
      }
    }

    // Collapse the plate's repeats in one pass. Doing this per room would miss the biggest win by far: the two
    // hundred ward beds sit in eight different rooms but share one geometry and one material.
    // Anything with a setter must stay a real mesh, so its subtree is skipped.
    {
      const dyn = new Set();
      for (const a of animated) if (a.obj && a.obj.group) dyn.add(a.obj.group);
      baked += bakeStatics(pg, dyn); // the shells
      baked += bakeStatics(detail, dyn); // the furniture
    }

    // the plate's own name plate, laid on the ground in front of it
    const tex = labelTexture(`${plate.name.toUpperCase()}`, {color: '#8793ae', w: 1024, h: 192, font: '800 120px Inter, system-ui, sans-serif'});
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: tex, transparent: true}));
    nm.position.set(-PLATE_W / 2 + 13, 0.03, PLATE_D / 2 + 4.5);
    pg.add(nm);
  }

  // the ambulance bay, outside the emergency department
  if (RM.buildAmbulanceBay) {
    const ab = RM.buildAmbulanceBay({w: 12});
    ab.group.position.set(GATES.GATE_ER.x, 0, GATES.GATE_ER.z + 4);
    root.add(ab.group);
  }

  // anchors: where a unit's pin and camera point
  for (const u of STATION_KEYS) {
    const rooms = UNIT_ROOMS[u];
    if (!rooms) continue;
    const r = ROOMS[rooms[0]];
    anchors[u] = () => new THREE.Vector3(r.x, 2.6, r.z);
  }

  console.log(`world: ${Object.keys(ROOMS).length} rooms, ${baked} repeated meshes folded into instanced draws`);

  // ---------------------------------------------------------------- people
  const CROWD_MAX = 900;
  const crowd = PE.createCrowd(CROWD_MAX);
  root.add(crowd.group);
  // the followed patient and the member of staff attending them are real, posable figures
  const hero = PE.buildPerson({role: 'patient', skin: HOS.skin[2], hair: HOS.hair[0], shirt: HOS.civvies[3]});
  hero.group.visible = false;
  root.add(hero.group);
  const heroStaff = PE.buildPerson({role: 'doctor', skin: HOS.skin[1], hair: HOS.hair[1]});
  heroStaff.group.visible = false;
  root.add(heroStaff.group);

  // ------------------------------------------------- the recorded day index
  // Which patients are in the building in each minute, so pose(t) touches only them.
  const start = day.meta.start;
  const end = day.meta.end;
  const BUCKET = 1; // minute
  let buckets = [];
  const indexDay = () => {
    buckets = new Array(Math.ceil((end - start) / BUCKET) + 2);
    for (let i = 0; i < buckets.length; i++) buckets[i] = [];
    day.patients.forEach((p, pi) => {
      if (!p.steps.length) return;
      const t0 = p.steps[0].t0;
      const t1 = p.steps[p.steps.length - 1].t1 || end;
      const b0 = Math.max(0, Math.floor((t0 - start) / BUCKET));
      const b1 = Math.min(buckets.length - 1, Math.ceil((t1 - start) / BUCKET));
      for (let b = b0; b <= b1; b++) buckets[b].push(pi);
    });
  };
  indexDay();

  /** The step a patient is in at time t, plus how far through it they are. */
  const stepAt = (p, t) => {
    const steps = p.steps;
    // most lookups are near the previous one, so remember where we were
    let i = p._i ?? 0;
    if (i >= steps.length) i = steps.length - 1;
    while (i > 0 && steps[i].t0 > t) i--;
    while (i < steps.length - 1 && (steps[i].t1 || end) <= t) i++;
    p._i = i;
    const s = steps[i];
    if (!s || t < s.t0) return null;
    const dur = (s.t1 || end) - s.t0;
    return {s, u: dur > 0 ? clamp((t - s.t0) / dur) : 1, i};
  };

  const colorFor = (p, s, t) => {
    if (s.kind === ST.WALK) return HOS.stWalk;
    if (s.kind === ST.QUEUE) {
      const w = t - s.t0;
      const k = clamp(w / 45);
      return new THREE.Color(HOS.stQueue).lerp(new THREE.Color(HOS.stQueueLong), k).getStyle();
    }
    if (s.kind === ST.SERVICE) return HOS.stService;
    if (s.kind === ST.RESULT) return HOS.stResult;
    if (s.kind === ST.BED) return HOS.stBed;
    return HOS.stWalk;
  };

  // where each patient is, reused between frames so pose() allocates nothing
  const tmp = new THREE.Vector3();
  const liveAt = (p, t) => {
    const at = stepAt(p, t);
    if (!at) return null;
    const {s, u} = at;
    if (s.kind === ST.WALK) {
      const path = walkPath(s.from, s.to, {clinicFrom: s.clinic, clinicTo: s.clinic});
      if (inLift(path, u)) return {hidden: true};
      const q = pointAt(path, u);
      // the walk phase is driven by DISTANCE covered, not by the clock, so the feet do not slide
      const phase = ((p.id * 0.137 + (u * path.metres) / WALK_STRIDE) % 1 + 1) % 1;
      return {x: q.x, y: 0, z: q.z, rot: q.rot, pose: 1, phase, color: colorFor(p, s, t), step: s};
    }
    if (s.kind === ST.QUEUE) {
      const idx = Math.max(0, s.qIdx ?? 0);
      const g = queuePos(s.k, idx, s.clinic);
      return {x: g.x, y: g.sitting ? SEAT_Y : 0, z: g.z, rot: g.rot, pose: g.sitting ? 2 : 0, color: colorFor(p, s, t), step: s};
    }
    if (s.kind === ST.RESULT) {
      const g = resultPos(s.k, (p.id * 7) % 20);
      return {x: g.x, y: SEAT_Y, z: g.z, rot: g.rot, pose: 2, color: colorFor(p, s, t), step: s};
    }
    const g = servicePos(s.k, s.slot ?? 0, s.clinic);
    const lying = !!g.bed || s.kind === ST.BED || !!STATIONS[s.k]?.bed;
    return {x: g.x, y: lying ? DECK_Y : 0, z: g.z, rot: g.rot, pose: lying ? 3 : 0, color: colorFor(p, s, t), step: s};
  };

  // queue indices are not in the recording (a queue position changes as others are served), so rebuild them per
  // frame: everybody queueing at a unit, oldest first, is that unit's queue in order.
  const queueOrder = new Map();

  let followId = null;
  let staffPose = [];

  /**
   * Place everybody for sim-minute `t`. Pure: same t, same frame.
   * Returns a small report the UI reads (who is where, which unit is the bottleneck).
   */
  const pose = (t) => {
    const tt = clamp(t, start, end);
    const b = Math.min(buckets.length - 1, Math.max(0, Math.floor((tt - start) / BUCKET)));
    const live = buckets[b];

    // first pass: work out each unit's queue order at this instant
    queueOrder.clear();
    for (const pi of live) {
      const p = day.patients[pi];
      const at = stepAt(p, tt);
      if (!at || at.s.kind !== ST.QUEUE) continue;
      const key = `${at.s.k}|${at.s.clinic || ''}`;
      let arr = queueOrder.get(key);
      if (!arr) queueOrder.set(key, (arr = []));
      arr.push({pi, t0: at.s.t0});
    }
    for (const arr of queueOrder.values()) {
      arr.sort((x, y) => x.t0 - y.t0);
      arr.forEach((x, i) => {
        day.patients[x.pi]._q = i;
      });
    }

    // second pass: place them
    let n = 0;
    const perUnit = {};
    let heroInfo = null;
    for (const pi of live) {
      if (n >= CROWD_MAX) break;
      const p = day.patients[pi];
      const at = stepAt(p, tt);
      if (!at) continue;
      const s = at.s;
      if (s.kind === ST.QUEUE) s.qIdx = p._q ?? 0;
      const g = liveAt(p, tt);
      if (!g || g.hidden) continue;
      if (s.k) {
        const u = (perUnit[s.k] ||= {q: 0, inSvc: 0, res: 0});
        if (s.kind === ST.QUEUE) u.q++;
        else if (s.kind === ST.SERVICE || s.kind === ST.BED) u.inSvc++;
        else if (s.kind === ST.RESULT) u.res++;
      }
      if (p.id === followId) {
        heroInfo = {...g, patient: p, step: s, u: at.u};
        continue; // drawn as a posable figure instead
      }
      crowd.set(n++, {x: g.x, y: g.y ?? 0, z: g.z, rot: g.rot, color: g.color, pose: g.pose, phase: g.phase ?? (p.id % 97) / 97});
    }

    // staff: one figure per busy slot, from the recording, not a fixed number (criterion 6)
    for (const u of STATION_KEYS) {
      const d = STATIONS[u];
      if (!UNIT_ROOMS[u] || d.bed) continue;
      const busy = perUnit[u]?.inSvc || 0;
      const hist = day.history[Math.min(day.history.length - 1, Math.floor((tt - start) / 5))];
      const staffed = hist?.stations[u]?.staffed ?? d.c;
      const show = Math.min(staffed, Math.max(busy, Math.round(staffed * 0.75)));
      for (let i = 0; i < show && n < CROWD_MAX; i++) {
        const clinic = u === 'DOC' ? Object.keys(CLINICS)[i % Object.keys(CLINICS).length] : null;
        const sp = staffPos(u, i, clinic);
        const role = d.dept === 'front' || d.dept === 'money' ? (u === 'PHA' ? 'pharm' : 'admin') : u === 'DOC' || u === 'ER' || u === 'OR' ? 'doctor' : d.dept === 'diag' ? 'tech' : 'nurse';
        const col = {admin: HOS.uniAdmin, pharm: HOS.uniPharm, doctor: HOS.coatDoctor, tech: HOS.scrubTech, nurse: HOS.scrubNurse}[role];
        crowd.set(n++, {x: sp.x, y: i % 4 === 3 ? SEAT_Y : 0, z: sp.z, rot: sp.rot, color: col, pose: i % 4 === 3 ? 2 : 0, phase: (i * 0.31) % 1});
      }
    }

    crowd.count(n);
    crowd.update();

    // the followed patient
    if (heroInfo) {
      hero.group.visible = true;
      hero.group.position.set(heroInfo.x, 0, heroInfo.z);
      // a posable figure sits and lies about its own origin, so it needs no y offset — only the crowd does
      hero.group.rotation.y = heroInfo.rot || 0;
      const kind = heroInfo.pose === 1 ? 'walk' : heroInfo.pose === 2 ? 'sit' : heroInfo.pose === 3 ? 'lie' : 'stand';
      hero.pose(kind, 1, heroInfo.phase ?? 0);
      // the member of staff dealing with them
      if (heroInfo.step.kind === ST.SERVICE && heroInfo.step.k) {
        const sp = staffPos(heroInfo.step.k, heroInfo.step.slot ?? 0, heroInfo.step.clinic);
        heroStaff.group.visible = true;
        heroStaff.group.position.set(sp.x, 0, sp.z);
        heroStaff.group.rotation.y = sp.rot;
        heroStaff.pose(heroInfo.step.k === 'DOC' ? 'lean' : 'stand', 1, 0);
      } else heroStaff.group.visible = false;
    } else {
      hero.group.visible = false;
      heroStaff.group.visible = false;
    }

    // animated equipment — everything is a function of t, nothing keeps its own timer
    for (const a of animated) {
      const u = a.room.unit;
      const busy = (perUnit[u]?.inSvc || 0) > 0;
      const o = a.obj;
      switch (a.kind) {
        case 'monitor':
          o.setOn?.(busy);
          if (busy) o.setBeat?.((tt * 62) % 1);
          break;
        case 'centrifuge':
          o.setOn?.(busy);
          o.setSpin?.(busy ? (tt * 40) % (Math.PI * 2) : 0);
          break;
        case 'ct':
          o.setOn?.(busy);
          o.setRing?.(busy ? (tt * 12) % (Math.PI * 2) : 0);
          o.setBed?.(busy ? 0.5 + 0.5 * Math.sin(tt * 0.5) : 0);
          break;
        case 'xray':
          o.setTube?.(busy ? 0.1 : -0.5);
          break;
        case 'orlamp':
          o.setOn?.(busy);
          o.setAim?.(busy ? 0.12 : 0, busy ? -0.25 : 0);
          break;
        case 'ortable':
          o.setTilt?.(busy ? 0.08 : 0);
          break;
        case 'anaes':
          o.setOn?.(busy);
          o.setBellows?.(busy ? (Math.sin(tt * 14) * 0.5 + 0.5) : 0);
          break;
        case 'dental':
          o.setLight?.(busy ? 1 : 0.15);
          o.setRecline?.(busy ? 0.8 : 0.1);
          break;
        case 'ekg':
          o.setOn?.(busy);
          break;
        default:
          break;
      }
    }

    return {t: tt, perUnit, people: n, hero: heroInfo};
  };

  const project = (v) => st.project(v);

  /**
   * Switch each level's furniture on only when the camera is near enough for it to mean anything.
   * Called once a frame from the app with the live camera.
   */
  const setDetail = (camX, camZ, camD) => {
    for (const L of detailLayers) {
      const dist = Math.hypot(camX - L.x, camZ - L.z);
      // near enough that the level fills a good part of the screen, and close enough to be the one being looked at
      L.group.visible = camD < 115 && dist < 110;
    }
  };

  return {
    st,
    root,
    pose,
    anchors,
    pickables,
    animated,
    project,
    crowd,
    hero,
    setDetail,
    setFollow: (id) => {
      followId = id;
    },
    /** Replace the recorded day and re-index it. The building, the furniture and the crowd are reused as they are. */
    setDay: (d) => {
      day = d;
      indexDay();
    },
    getFollow: () => followId,
    home: HOME_CAMERA,
  };
}
