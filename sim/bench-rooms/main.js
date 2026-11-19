// Bench for sim/shared/rooms.js — every building model on the ground under createHospitalStage, laid out in rows
// with its name printed under it. The camera cuts between a whole-bench shot and four close-ups; render(t) is a pure
// function of t, so `capture.mjs --still <t>` always gets the same frame.
//
//   t = 0..3  the whole bench      t = 3..5  the big rooms (ER, ICU, ward bay)
//   t = 5..7  circulation and the front office        t = 7..9  the outside: entrance, lifts, ambulance bay
//   t = 9..10 the small rooms
import {runSim} from 'simulator-kit/runtime.js';
import * as THREE from 'three';
import {HOS, createHospitalStage, hosMat, labelTexture} from '../shared/style.js';
import {
  buildAmbulanceBay,
  buildCarPark,
  buildCityBlock,
  buildCorridor,
  buildCounter,
  buildCubicleRow,
  buildEntrance,
  buildFence,
  buildFloorPlate,
  buildGlassPartition,
  buildHedge,
  buildLiftCore,
  buildNurseStation,
  buildRoomShell,
  buildSignGantry,
  buildStairBlock,
  buildStoreRoom,
  buildToilet,
  buildTree,
  buildWaitingBay,
  buildWallRun,
  buildWardBay,
} from '../shared/rooms.js';

const D2R = Math.PI / 180;
const GAP = 3.6; // between models in a row
const ROWGAP = 5.0; // between rows, after the label strip
const LABEL = 2.2;

/** one bench item: the group, the footprint it needs, and where its origin sits inside that footprint */
const item = (name, group, w, d, oz = null) => ({name, group, w, d, oz: oz ?? d / 2});

// ------------------------------------------------------------------ the models, by row
function benchRows() {
  const rooms = [];
  const room = (name, w, d, color, opt = {}) => {
    const r = buildRoomShell({w, d, name, color, ...opt});
    rooms.push(r);
    return item(name, r.group, w, d);
  };

  const r1 = [
    room('Info', 6, 4, HOS.blue),
    room('EKG', 6, 5, HOS.olive),
    room('ER Triage', 5, 4, HOS.rose),
    room('Pre-op', 7, 5, HOS.violet),
    room('Admission', 7, 5, HOS.blue, {glassTop: true}),
    room('OR 1', 7, 6, HOS.violet, {doors: [{side: 's', w: 1.8}, {side: 'n'}]}),
  ];
  const t = buildToilet({w: 4.4, d: 3.2});
  r1.push(item('Toilets', t.group, 4.4, 3.2));
  const st = buildStoreRoom({w: 5, d: 4});
  r1.push(item('Store', st.group, 5, 4));

  const r2 = [
    room('Triage', 9, 6, HOS.mint, {glassTop: true}),
    room('Billing', 9, 6, HOS.amber),
    room('X-ray 1', 8, 6, HOS.olive),
    room('CT', 9, 7, HOS.olive, {doors: [{side: 's', w: 2.0}]}),
    room('Procedure', 8, 6, HOS.mint),
    room('Dental', 9, 7, HOS.teal, {glassTop: true}),
  ];

  const r3 = [
    room('Records', 11, 7, HOS.blue, {doors: ['s', 'e']}),
    room('Pharmacy', 11, 7, HOS.amber, {doors: [{side: 's', at: -2.2}, {side: 's', at: 2.2}]}),
    room('Lab', 11, 7, HOS.olive, {glassTop: true}),
    room('PACU', 12, 8, HOS.violet, {doors: [{side: 's', w: 2.4}]}),
    room('Physiotherapy', 13, 9, HOS.teal, {glassTop: true, doors: ['s', 'w']}),
  ];

  const r4 = [
    room('ER', 15, 9, HOS.rose, {doors: [{side: 's', at: -4, w: 2.4}, {side: 's', at: 4, w: 2.4}, {side: 'w', w: 2.4}]}),
    room('ICU', 15, 10, HOS.violet, {glassTop: true, doors: [{side: 's', w: 2.4}, {side: 'e', w: 2.4}]}),
  ];
  const ward = buildWardBay({beds: 6, w: 20, d: 9, name: 'Ward A', color: HOS.violet});
  r4.push(item('Ward bay (6 beds)', ward.group, 20, 9));

  const cub = buildCubicleRow({n: 6, w: 3.4, d: 3.6, color: HOS.mint});
  const cor = buildCorridor({len: 22, w: 3.2, stripes: [HOS.blue, HOS.mint, HOS.amber, HOS.rose]});
  const gantry = buildSignGantry({
    items: [
      {text: 'Pharmacy', color: HOS.amber, arrow: 'right'},
      {text: 'Laboratory', color: HOS.olive, arrow: 'right'},
      {text: 'Emergency', color: HOS.rose, arrow: 'left'},
    ],
    len: 9.5,
  });
  gantry.group.position.set(6.0, 0, 0);
  cor.group.add(gantry.group);
  const counter = buildCounter({len: 7, posts: 4, color: HOS.blue});
  const wait = buildWaitingBay({w: 12, d: 7, rows: 3, perRow: 7, color: HOS.blue});
  const nurse = buildNurseStation({len: 4.4, color: HOS.mint});
  const r5 = [
    item('Cubicle row', cub.group, cub.w, 3.6),
    item('Corridor + sign gantry', cor.group, 22, 3.2),
    item('Counter', counter.group, 7.2, 2.6, 1.8),
    item('Waiting bay', wait.group, 12, 7),
    item('Nurse station', nurse.group, 4.8, 2.8, 2.2),
  ];

  const ent = buildEntrance({w: 9, color: HOS.blue});
  const lift = buildLiftCore({pax: 2, bed: 1});
  const abay = buildAmbulanceBay({w: 7});
  const stair = buildStairBlock({});
  const part = buildGlassPartition({len: 5});
  const wrun = buildWallRun({len: 9, openings: [{at: -2.4, w: 1.6}, {at: 2.4, w: 1.6}], color: HOS.mint});
  const r6 = [
    item('Entrance', ent.group, 10.8, 5.0, 0.4),
    item('Lift core + stairs', lift.group, lift.w + 1.5, 6.6, 3.1),
    item('Ambulance bay', abay.group, abay.w, abay.d),
    item('Stair block', stair.group, stair.w, stair.d),
    item('Glass partition', part.group, 5, 1.2, 0.6),
    item('Wall run', wrun.group, 9, 1.2, 0.6),
  ];

  const park = buildCarPark({cols: 8, rows: 1, cars: 5});
  const city = buildCityBlock({w: 16, d: 12, h: 11});
  const fence = buildFence({len: 16});
  const hedge = buildHedge({len: 8});
  const trees = new THREE.Group();
  [
    [-2.6, 0, 1.05, 'tree'],
    [1.0, -0.6, 0.85, 'tree'],
    [3.4, 1.0, 1.0, 'bush'],
    [-0.4, 1.4, 0.9, 'palm'],
  ].forEach(([x, z, s, kind]) => {
    const g = buildTree({size: s, kind});
    g.position.set(x, 0, z);
    trees.add(g);
  });
  const r7 = [
    item('Car park', park.group, park.w, park.d),
    item('Fence', fence.group, 16, 1.2, 0.6),
    item('City block', city.group, 16, 12),
    item('Hedge', hedge.group, 8, 1.6, 0.8),
    item('Trees', trees, 9, 5, 2.2),
  ];

  return {rows: [r1, r2, r3, r4, r5, r6, r7], ward, lift, abay};
}

// ------------------------------------------------------------------ ground labels
const LABELMAT = new Map();
function groundLabel(text) {
  // one line of Inter lying flat on the ground, reading toward the camera
  let m = LABELMAT.get(text);
  if (!m) {
    const tex = labelTexture(text, {color: HOS.inkSoft, w: 2048, h: 256, font: '800 120px Inter, system-ui, sans-serif'});
    m = new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false});
    LABELMAT.set(text, m);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8 * 1.05, 1.05), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}

runSim(
  {
    duration: 10,
    fps: 60,
    theme: 'light',
    hud: {enabled: false, title: 'bench-rooms', subtitle: ''},
    director: {enabled: false},
    watermark: '',
  },
  async ({canvas}) => {
    const st = createHospitalStage(canvas, {fov: 26});
    const {rows} = benchRows();

    // lay the rows out: every item's back edge on the row's back line, one label strip under each row
    const root = new THREE.Group();
    const bands = [];
    let depth = 0;
    for (const r of rows) depth += Math.max(...r.map((i) => i.d)) + LABEL + ROWGAP;
    let zc = -depth / 2;
    let widest = 0;
    for (const r of rows) {
      const maxD = Math.max(...r.map((i) => i.d));
      const totalW = r.reduce((s, i) => s + i.w, 0) + (r.length - 1) * GAP;
      widest = Math.max(widest, totalW);
      let x = -totalW / 2;
      for (const i of r) {
        i.group.position.set(x + i.w / 2, 0, zc + i.oz);
        root.add(i.group);
        const lab = groundLabel(i.name);
        lab.position.set(x + i.w / 2, 0.03, zc + maxD + LABEL * 0.5);
        lab.scale.setScalar(Math.min(1, (i.w + GAP * 0.9) / 8.4));
        root.add(lab);
        x += i.w + GAP;
      }
      bands.push({z0: zc, z1: zc + maxD, cz: zc + maxD / 2, w: totalW});
      zc += maxD + LABEL + ROWGAP;
    }

    const plate = buildFloorPlate({w: Math.ceil(widest + 9), d: Math.ceil(depth + 4), tint: HOS.ground});
    plate.group.position.y = -0.004;
    st.scene.add(plate.group, root);

    // the shots: a hard cut per window, so a still is never caught mid-move
    const shots = [
      {to: 3, tx: 1, tz: 9, az: 20, el: 38, d: 166},
      {to: 5, tx: 13, tz: bands[3].cz, az: 22, el: 34, d: 50},
      {to: 7, tx: 24, tz: bands[4].cz + 1, az: 23, el: 29, d: 40},
      {to: 9, tx: -4, tz: bands[5].cz, az: 28, el: 29, d: 46},
      {to: 99, tx: -6, tz: bands[0].cz, az: 24, el: 31, d: 62},
    ];
    const shotAt = (t) => shots.find((s) => t < s.to) ?? shots[shots.length - 1];

    const resize = () => st.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2));
    resize();
    return {
      resize,
      render(t) {
        const s = shotAt(t);
        // a slow drift inside each shot, so the bench reads as one world rather than a contact sheet
        const k = Math.min(1, (t % 2) / 2);
        st.frame({tx: s.tx, ty: 1.4, tz: s.tz, az: (s.az + k * 4 - 2) * D2R, el: s.el * D2R, d: s.d, fov: 26});
        return {};
      },
    };
  },
);
