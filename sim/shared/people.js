// The toy hospital's people — posable figures for the staff and the followed patient, and an instanced crowd for
// everyone else. Built in the airport kit's idiom (rounded forms, a materials table, geometry cached per size, static
// detail merged per material), but a person has to bend, so every joint is its own Group.
//
// Real metres, y up, origin on the floor at the figure's own centre, facing +z. The reference figure is 1.70 m to the
// top of the head: eye 1.58, shoulder 1.42, hip 0.92, exactly the brief's scale contract. Nothing in here reads a
// clock — every pose is a pure function of its arguments.
//
//   buildPerson({role, skin, hair, shirt, scale, seed})
//       -> {group, pose(kind, k, phase), parts: {head, torso, armL, armR, legL, legR, ...}, height, role}
//     role       'doctor' | 'nurse' | 'tech' | 'admin' | 'pharm' | 'porter' | 'surgeon' | 'patient' | 'gown'
//                | 'child' | 'elder'
//     pose kinds 'stand' | 'walk' | 'sit' | 'lie' | 'lean' | 'type' | 'push' | 'scrub'
//     k          the pose's amount, 0..1, default 1 (stride for walk/push, recline for sit, the raised head of the
//                bed for lie, how far forward for lean, how high the hands for scrub)
//     phase      0..1, one full stride (or one tap / one sway). phase 0 = the left heel strikes.
//                Feet stay planted if the caller advances phase by distance / (WALK_STRIDE * k * scale).
//
//   createCrowd(max) -> {group, set(i, {x, y, z, rot, color, pose, phase, skin}), count(n), update(), meshes}
//     Three InstancedMesh — body, head, a soft shadow disc — so several hundred people cost three draw calls.
//     pose 0 standing, 1 walking (bob + lean + roll off its own phase), 2 sitting, 3 lying (head toward +z of rot).
//
// A posable figure is 12 primitives (head+neck, hair, torso, 2 x upper arm, 2 x forearm, 2 x thigh, 2 x shin, shoes)
// plus whatever the role carries: a coat skirt, the scrub V at the collar, an ID badge, a stethoscope, a cap, a mask,
// a cane. No faces beyond the hair and, for the surgeon, the mask.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HOS, hosMat, rbox} from './style.js';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** metres covered by one full stride of pose('walk', 1, phase) on a 1.70 m figure */
export const WALK_STRIDE = 1.11;
export const POSE_KINDS = ['stand', 'walk', 'sit', 'lie', 'lean', 'type', 'push', 'scrub'];
/** the crowd's pose numbers, by name */
export const CROWD_POSE = {stand: 0, walk: 1, sit: 2, lie: 3};

// ================================================================ the reference figure
const D = {
  top: 1.7,
  shoulder: 1.42,
  hip: 0.92,
  knee: 0.5,
  ankle: 0.085,
  thigh: 0.42, // hip -> knee
  shin: 0.415, // knee -> ankle
  legLen: 0.835, // hip -> ankle, straight
  hipX: 0.095,
  shY: 1.355, // the shoulder joint, a little below the shoulder line
  shX: 0.168,
  upper: 0.29, // shoulder -> elbow
  fore: 0.26, // elbow -> wrist
  neckY: 1.46, // the head group's pivot
  headY: 0.108, // the head's centre above that pivot
  headR: 0.118,
  torsoD: 0.215,
};
const AMP = 0.34; // hip swing at k = 1: a 0.56 m step, a 3.8 cm natural bob

// ================================================================ materials
const cloth = (c) => hosMat(c, {rough: 0.74});
const coat = (c) => hosMat(c, {rough: 0.62});
const skinM = (c) => hosMat(c, {rough: 0.6});
const hardM = (c) => hosMat(c, {rough: 0.42, metal: 0.1});

// ================================================================ geometry, cached by size
const GEO = new Map();
const cg = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
const sph = (r, s = 12, t = 8) => cg(`s|${r}|${s}`, () => new THREE.SphereGeometry(r, s, t));
const dome = (r, s = 14) => cg(`d|${r}|${s}`, () => new THREE.SphereGeometry(r, s, 7, 0, TAU, 0, PI / 2));
const cyl = (rt, rb, h, s = 12) => cg(`c|${rt}|${rb}|${h}|${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));

const KEEP = ['position', 'normal', 'uv'];
function prep(g0) {
  const g = g0.index ? g0.toNonIndexed() : g0.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** collects transformed primitives and merges them into one geometry (one mesh, one draw call) */
class Pile {
  constructor() {
    this.list = [];
  }
  add(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    const p = prep(g);
    p.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
    this.list.push(p);
    return this;
  }
  out() {
    return this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
  }
}
const pile = (key, make) => cg(key, () => {
  const P = new Pile();
  make(P);
  return P.out();
});

/** a limb: a tapered round bar with a ball at each end, hanging down from its joint at the origin */
const limb = (rt, rb, len) =>
  pile(`limb|${rt}|${rb}|${len}`, (P) => {
    P.add(cyl(rt, rb, len, 10), 0, -len / 2, 0);
    P.add(sph(rt, 10, 6), 0, 0, 0);
    P.add(sph(rb, 10, 6), 0, -len, 0);
  });

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ================================================================ roles
// top/pants: the garment colours. coatLen: the skirt below the hip (0 = none). under: the scrub V at an open collar.
// sleeves: 2 full, 1 to the elbow, 0 bare. h: the figure's height. stoop: a permanent forward bend at the hip.
const ROLES = {
  doctor: {top: HOS.coatDoctor, under: HOS.scrubDoctor, pants: HOS.scrubDoctor, coatLen: 0.24, sleeves: 1, badge: true, steth: true, shoe: HOS.white},
  nurse: {top: HOS.scrubNurse, pants: HOS.scrubNurse, coatLen: 0.08, sleeves: 1, badge: true, shoe: HOS.white},
  tech: {top: HOS.scrubTech, pants: HOS.scrubTech, coatLen: 0.08, sleeves: 1, badge: true, shoe: HOS.white},
  admin: {top: HOS.uniAdmin, pants: HOS.inkSoft, coatLen: 0, sleeves: 1, badge: true, shoe: HOS.ink},
  pharm: {top: HOS.coatDoctor, under: HOS.uniPharm, pants: HOS.uniPharm, coatLen: 0.2, sleeves: 1, badge: true, shoe: HOS.white},
  porter: {top: HOS.uniPorter, pants: HOS.uniPorter, coatLen: 0.06, sleeves: 1, badge: true, cap: HOS.uniPorter, peak: true, shoe: HOS.ink},
  surgeon: {top: HOS.mintLight, pants: HOS.mintDeep, coatLen: 0.22, sleeves: 2, cap: HOS.mintDeep, mask: true, shoe: HOS.white},
  patient: {top: null, pants: HOS.steelDark, coatLen: 0.03, sleeves: 1, shoe: HOS.inkSoft},
  gown: {top: HOS.gownPatient, pants: null, coatLen: 0.32, sleeves: 1, shoe: HOS.white},
  child: {top: null, pants: HOS.steelDark, coatLen: 0.03, sleeves: 1, shoe: HOS.inkSoft, h: 1.2, headK: 1.16},
  elder: {top: null, pants: HOS.steelDark, coatLen: 0.03, sleeves: 1, shoe: HOS.inkSoft, h: 1.64, stoop: 0.13, cane: true, hair: HOS.hair[4]},
};

const hashf = (i, s) => {
  const v = Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const pick = (list, i, s) => list[Math.floor(hashf(i, s) * list.length) % list.length];
const colorOf = (v, list, dflt) => (typeof v === 'number' ? list[((v % list.length) + list.length) % list.length] : v || dflt);

// ================================================================ a posable person
export function buildPerson({role = 'patient', skin, hair, shirt, scale = 1, seed = 0} = {}) {
  const R = ROLES[role] || ROLES.patient;
  const H = R.h || D.top;
  const sk = colorOf(skin, HOS.skin, pick(HOS.skin, seed, 3));
  const hr = colorOf(hair, HOS.hair, R.hair || pick(HOS.hair, seed, 7));
  const top = R.top || colorOf(shirt, HOS.civvies, pick(HOS.civvies, seed, 11));
  const pants = R.pants || sk; // a gown leaves the legs bare
  const Msk = skinM(sk);
  const Mtop = R.top ? (R.coatLen > 0.15 ? coat(top) : cloth(top)) : cloth(top);
  const Mpants = R.pants ? cloth(pants) : Msk;
  const Mshoe = hardM(R.shoe);

  const group = new THREE.Group();
  group.scale.setScalar((H / D.top) * scale);
  const body = new THREE.Group(); // whole-figure offset: the walk's bob, the drop into a chair, lying down
  body.rotation.order = 'YXZ';
  group.add(body);

  // ---- legs: hip -> thigh, knee -> shin, ankle -> shoe
  const mkLeg = (s) => {
    const hip = new THREE.Group();
    hip.position.set(s * D.hipX, D.hip, 0);
    body.add(hip);
    part(limb(0.082, 0.068, D.thigh), Mpants, hip);
    const knee = new THREE.Group();
    knee.position.y = -D.thigh;
    hip.add(knee);
    part(limb(0.068, 0.05, D.shin), Mpants, knee);
    const foot = new THREE.Group();
    foot.position.y = -D.shin;
    knee.add(foot);
    part(
      pile(`shoe|${R.shoe}`, (P) => {
        P.add(rbox(0.098, 0.068, 0.215, 0.032, 2), 0, -0.042, 0.03);
        P.add(rbox(0.09, 0.05, 0.09, 0.024, 1), 0, -0.004, -0.04);
      }),
      Mshoe,
      foot,
    );
    return {hip, knee, foot};
  };
  const L = mkLeg(-1);
  const Rg = mkLeg(1);

  // ---- torso, pivoting at the hip
  const torso = new THREE.Group();
  torso.position.y = D.hip;
  torso.rotation.order = 'YXZ';
  body.add(torso);
  part(
    pile(`torso|${top}`, (P) => {
      P.add(rbox(0.3, 0.3, 0.195, 0.085, 2), 0, 0.12, 0); // hips -> waist
      P.add(rbox(0.335, 0.34, 0.215, 0.095, 2), 0, 0.345, 0); // chest
      P.add(sph(0.074, 12, 7), -D.shX, D.shY - D.hip, 0); // shoulder caps
      P.add(sph(0.074, 12, 7), D.shX, D.shY - D.hip, 0);
      P.add(rbox(0.25, 0.1, 0.185, 0.045, 1), 0, 0.46, 0); // the yoke across the collar bones
    }),
    Mtop,
    torso,
  );
  if (R.coatLen > 0) {
    part(rbox(0.322, R.coatLen + 0.1, D.torsoD + 0.015, 0.05, 2), Mtop, torso, 0, -R.coatLen / 2 + 0.05, 0);
  }
  if (R.under) {
    part(
      pile('collarV', (P) => {
        P.add(rbox(0.135, 0.2, 0.06, 0.028, 1), 0, 0, 0);
        P.add(rbox(0.19, 0.06, 0.05, 0.022, 1), 0, 0.1, -0.004);
      }),
      cloth(R.under),
      torso,
      0,
      0.4,
      D.torsoD / 2 - 0.028,
    );
  }
  if (R.badge) {
    part(
      pile('badge', (P) => {
        P.add(rbox(0.012, 0.16, 0.012, 0.005, 1), -0.062, 0.145, 0.004, 0.1, 0, -0.22);
        P.add(rbox(0.012, 0.16, 0.012, 0.005, 1), 0.062, 0.145, 0.004, 0.1, 0, 0.22);
        P.add(rbox(0.08, 0.055, 0.014, 0.008, 1), 0, 0.045, 0.01);
      }),
      hardM(HOS.white),
      torso,
      0,
      0.26,
      D.torsoD / 2 - 0.012,
    );
  }
  if (R.steth) {
    part(
      pile('steth', (P) => {
        P.add(cg('ring', () => new THREE.TorusGeometry(0.088, 0.013, 7, 20)), 0, 0.52, 0.012, PI / 2 - 0.3, 0, 0);
        P.add(cyl(0.011, 0.011, 0.2, 8), 0.058, 0.42, 0.082, 0.22, 0, 0.1);
        P.add(cyl(0.032, 0.032, 0.015, 14), 0.078, 0.325, 0.102, PI / 2, 0, 0);
      }),
      hardM(HOS.inkSoft),
      torso,
    );
  }

  // ---- arms: shoulder -> upper, elbow -> forearm + hand
  const mkArm = (s) => {
    const sh = new THREE.Group();
    sh.position.set(s * D.shX, D.shY - D.hip, 0);
    sh.rotation.order = 'YXZ';
    torso.add(sh);
    part(limb(0.054, 0.047, D.upper), R.sleeves >= 1 ? Mtop : Msk, sh);
    const el = new THREE.Group();
    el.position.y = -D.upper;
    sh.add(el);
    part(limb(0.047, 0.04, D.fore), R.sleeves >= 2 ? Mtop : Msk, el);
    part(sph(0.054, 10, 6), R.sleeves >= 2 ? Mtop : Msk, el, 0, -D.fore - 0.028, 0.01);
    return {sh, el};
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ---- head: the neck travels with it, so a turned head reads
  const head = new THREE.Group();
  head.position.y = D.neckY - D.hip;
  head.rotation.order = 'YXZ';
  head.scale.setScalar(R.headK || 1);
  torso.add(head);
  part(
    pile(`head|${sk}`, (P) => {
      P.add(sph(D.headR, 14, 10), 0, D.headY, 0, 0, 0, 0, 1, 1.1, 1.03);
      P.add(cyl(0.052, 0.058, 0.1, 10), 0, -0.012, -0.004);
    }),
    Msk,
    head,
  );
  // a cap of hair, its rim above the widest point of the head — any lower and it reads as a blindfold
  part(dome(D.headR * 1.018, 14), hosMat(hr, {rough: 0.66}), head, 0, D.headY + 0.031, -0.004, 0, 0, 0, 1.0, 0.93, 1.04);
  if (R.cap) {
    part(
      pile(`cap|${R.cap}|${R.peak ? 1 : 0}`, (P) => {
        P.add(dome(D.headR * 1.08, 14), 0, 0, 0, 0, 0, 0, 1, 1.02, 1.03);
        if (R.peak) P.add(rbox(0.21, 0.022, 0.105, 0.01, 1), 0, 0.01, 0.12, -0.11, 0, 0);
      }),
      cloth(R.cap),
      head,
      0,
      D.headY + 0.006,
      -0.004,
    );
  }
  if (R.mask) {
    part(
      pile('mask', (P) => {
        P.add(rbox(0.17, 0.105, 0.1, 0.035, 2), 0, 0, 0.05);
        P.add(rbox(0.235, 0.03, 0.055, 0.012, 1), 0, 0.045, 0.018);
      }),
      cloth(HOS.white),
      head,
      0,
      D.headY - 0.045,
      0.045,
    );
  }

  // ---- the elder's cane, carried in the right hand
  let cane = null;
  if (R.cane) {
    cane = new THREE.Group();
    cane.position.y = -D.fore - 0.02;
    armR.el.add(cane);
    part(
      pile('cane', (P) => {
        P.add(cyl(0.015, 0.017, 0.84, 8), 0, -0.42, 0);
        P.add(cg('caneH', () => new THREE.TorusGeometry(0.045, 0.015, 6, 14, PI)), 0, 0.012, -0.03, PI / 2, 0, 0);
        P.add(cyl(0.023, 0.023, 0.03, 8), 0, -0.845, 0);
      }),
      hardM(HOS.trunk),
      cane,
    );
  }

  const parts = {head, torso, armL: armL.sh, armR: armR.sh, legL: L.hip, legR: Rg.hip, foreL: armL.el, foreR: armR.el, shinL: L.knee, shinR: Rg.knee, footL: L.foot, footR: Rg.foot, body, cane};
  const J = {body, torso, head, L, R: Rg, aL: armL, aR: armR, cane, stoop: R.stoop || 0, hasCane: !!R.cane};

  // ---------------------------------------------------------- the poses
  function reset() {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    torso.rotation.set(J.stoop, 0, 0);
    head.rotation.set(-J.stoop * 0.7, 0, 0);
    for (const [leg, s] of [[L, -1], [Rg, 1]]) {
      leg.hip.rotation.set(0, 0, s * 0.015);
      leg.knee.rotation.set(0.03, 0, 0);
      leg.foot.rotation.set(0, s * 0.06, 0);
    }
    for (const [a, s] of [[armL, -1], [armR, 1]]) {
      a.sh.rotation.set(-0.04, 0, s * 0.085);
      a.el.rotation.set(-0.16, 0, 0);
    }
    if (cane) cane.visible = true;
  }
  /** the leg half of a stride, with the hip dropped so the planted foot stays on the floor */
  function stride(k, ph) {
    let reach = 0;
    for (const [leg, off] of [[L, 0], [Rg, 0.5]]) {
      const u = (((ph + off) % 1) + 1) % 1;
      const c = Math.cos(u * TAU);
      const hipA = -AMP * k * c;
      const swing = u > 0.5 ? Math.sin((u - 0.5) * TAU) : 0;
      const stance = u <= 0.5 ? Math.sin(u * TAU * 0.5 * 2) : 0;
      const kneeA = 0.07 + 1.05 * k * swing + 0.16 * k * stance;
      leg.hip.rotation.x = hipA;
      leg.knee.rotation.x = kneeA;
      leg.foot.rotation.x = clamp(-0.75 * (hipA + kneeA), -0.95, 0.42);
      reach = Math.max(reach, D.thigh * Math.cos(hipA) + D.shin * Math.cos(hipA + kneeA) + D.ankle);
    }
    body.position.y = reach - D.hip;
  }
  /** both arms at once: x the swing, e the elbow, z the splay */
  function arms(xL, eL, xR, eR, z = 0.085) {
    armL.sh.rotation.set(xL, 0, -z);
    armL.el.rotation.x = eL;
    armR.sh.rotation.set(xR, 0, z);
    armR.el.rotation.x = eR;
  }
  function sitLegs(spread = 0.06) {
    for (const [leg, s] of [[L, -1], [Rg, 1]]) {
      leg.hip.rotation.set(-(PI / 2 + 0.07), 0, s * spread);
      leg.knee.rotation.set(PI / 2 + 0.12, 0, 0);
      leg.foot.rotation.set(-0.05, s * 0.09, 0);
    }
    body.position.y = 0.45 - D.hip;
  }
  function aimCane(tilt = 0.1) {
    if (!cane) return;
    cane.rotation.x = -(torso.rotation.x + armR.sh.rotation.x + armR.el.rotation.x) + tilt;
  }

  function pose(kind = 'stand', k = 1, phase = 0) {
    reset();
    const kk = k === undefined || k === null ? 1 : k;
    const ph = ((phase % 1) + 1) % 1;
    const a = ph * TAU;
    if (kind === 'walk' || kind === 'push') {
      stride(kk, ph);
      const push = kind === 'push';
      if (push) {
        arms(-0.55, -0.3, -0.55, -0.3, 0.19);
        torso.rotation.x = J.stoop + 0.16;
        body.rotation.z = 0.012 * kk * Math.sin(a);
      } else {
        const sw = 0.46 * kk;
        const c = Math.cos(a);
        const fl = (cc) => -(0.16 + 0.42 * kk * clamp(-cc, 0, 1));
        arms(sw * c, fl(c), -sw * c, fl(-c), 0.09);
        torso.rotation.x = J.stoop + 0.05 + 0.03 * kk;
        torso.rotation.y = -0.17 * kk * c;
        body.rotation.y = 0.055 * kk * c;
        body.rotation.z = 0.022 * kk * Math.sin(a);
        head.rotation.y = -torso.rotation.y * 0.6;
        if (J.hasCane) {
          // the cane plants with the opposite foot and barely swings
          armR.sh.rotation.x = -0.3 - 0.06 * kk * Math.cos(a);
          armR.el.rotation.x = -0.25;
        }
      }
      aimCane(0.1 + 0.06 * Math.sin(a));
    } else if (kind === 'sit' || kind === 'type') {
      sitLegs(kind === 'type' ? 0.05 : 0.08);
      if (kind === 'type') {
        torso.rotation.x = J.stoop + 0.1 * kk;
        const tap = 0.05 * Math.sin(a);
        arms(-0.25, -1.75 + tap, -0.25, -1.75 - tap, 0.14);
        head.rotation.x = -J.stoop * 0.7 + 0.16;
      } else {
        torso.rotation.x = J.stoop - 0.1 * kk + 0.004 * Math.sin(a);
        arms(0.12, -0.52, 0.12, -0.52, 0.13);
        if (J.hasCane) {
          armR.sh.rotation.set(-0.12, 0, 0.2);
          armR.el.rotation.x = -0.5;
        }
      }
      aimCane(0.18);
    } else if (kind === 'lie') {
      // supine along z, head toward +z, the group's origin at the middle of the figure on the deck
      // YXZ order: Ry(PI) * Rx(-PI/2) takes the head to +z and the face to +y; the offset centres the
      // figure on the group's origin, so the caller just drops it on the deck at the middle of the bed
      body.rotation.set(-PI / 2, PI, 0);
      body.position.set(0, 0.2, -0.85);
      torso.rotation.x = 0.95 * kk;
      // the limbs are thinner than the trunk, so they ride down off the hip to reach the mattress
      for (const [leg, s] of [[L, -1], [Rg, 1]]) {
        leg.hip.rotation.set(0.15, 0, s * 0.085);
        leg.knee.rotation.set(-0.03 + 0.1 * kk, 0, 0);
        leg.foot.rotation.set(0.12, s * 0.22, 0);
      }
      // the arms lie along the body, the forearms folded onto the belly
      arms(0.06, -0.5 - 0.25 * kk, 0.06, -0.5 - 0.25 * kk, 0.23);
      head.rotation.x = -0.28 * kk;
      if (cane) cane.visible = false;
    } else if (kind === 'lean') {
      torso.rotation.x = J.stoop + 0.52 * kk;
      torso.rotation.y = -0.1 * kk;
      head.rotation.x = -J.stoop * 0.7 + 0.34 * kk;
      L.hip.rotation.x = -0.26 * kk;
      L.knee.rotation.x = 0.2 * kk;
      Rg.hip.rotation.x = 0.16 * kk;
      Rg.knee.rotation.x = 0.06;
      Rg.foot.rotation.x = -0.13 * kk;
      body.position.y = -0.03 * kk;
      arms(-1.15 * kk, -0.55 * kk - 0.16, -0.62 * kk, -0.95 * kk - 0.16, 0.17);
      aimCane(0.2);
    } else if (kind === 'scrub') {
      arms(-0.65 - 0.35 * kk, -1.0 - 0.2 * kk, -0.65 - 0.35 * kk, -1.0 - 0.2 * kk, 0.3 + 0.06 * kk);
      torso.rotation.x = J.stoop + 0.04;
      torso.rotation.y = 0.03 * Math.sin(a);
      body.position.y = 0.004 * Math.sin(a * 2);
      L.hip.rotation.z = -0.07;
      Rg.hip.rotation.z = 0.07;
    } else {
      // stand: a little breath and weight shift, k = how much of it
      body.position.y = 0.004 * kk * Math.sin(a * 2);
      body.rotation.z = 0.008 * kk * Math.sin(a);
      torso.rotation.x = J.stoop + 0.01 * kk * Math.sin(a * 2);
      head.rotation.y = 0.05 * kk * Math.sin(a);
      L.hip.rotation.set(-0.03, 0, -0.035);
      Rg.hip.rotation.set(0.03, 0, 0.045);
      Rg.foot.rotation.y = 0.16;
      arms(-0.05, -0.18 - 0.04 * kk, -0.05, -0.18 - 0.04 * kk, 0.09);
      if (J.hasCane) {
        armR.sh.rotation.set(-0.3, 0, 0.1);
        armR.el.rotation.x = -0.25;
      }
      aimCane(0.1);
    }
    return group;
  }
  pose('stand', 0, 0);
  return {group, pose, parts, height: H * scale, role, stride: WALK_STRIDE * (H / D.top) * scale};
}

// ================================================================ the instanced crowd
const CROWD = {
  bodyH: 1.45,
  headY: 1.575,
  headR: 0.135,
  // sitting: the body squashed about its feet so the head lands 0.77 above the seat (the brief's seated 1.22)
  sitK: 0.44,
  sitY: -0.03,
  disc: 0.37,
};

function crowdBody() {
  return pile('crowdBody', (P) => {
    P.add(rbox(0.235, 0.5, 0.2, 0.085, 1), 0, 0.28, 0.005); // the legs, as one block
    P.add(rbox(0.305, 0.44, 0.225, 0.1, 1), 0, 0.68, 0); // hips
    P.add(rbox(0.37, 0.56, 0.245, 0.115, 2), 0, 1.15, 0); // chest
    P.add(rbox(0.105, 0.44, 0.135, 0.052, 1), -0.22, 1.16, 0, 0, 0, 0.07); // arms
    P.add(rbox(0.105, 0.44, 0.135, 0.052, 1), 0.22, 1.16, 0, 0, 0, -0.07);
    P.add(sph(0.105, 8, 6), -0.195, 1.35, 0);
    P.add(sph(0.105, 8, 6), 0.195, 1.35, 0);
    P.add(rbox(0.195, 0.12, 0.185, 0.05, 1), 0, 1.42, 0); // the collar, so the head sits on a neck
  });
}
function discTex() {
  return cg('discTex', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/**
 * max instances of body + head + shadow disc. set(i, {...}) writes one person, count(n) says how many are live,
 * update() flushes the buffers once per frame. Colour is per instance: the body takes `color` (the queue-state
 * colour), the head a skin tone (hashed from i unless `skin` is given).
 */
export function createCrowd(max = 400) {
  const group = new THREE.Group();
  const bodyMat = hosMat(HOS.white, {rough: 0.72});
  const headMat = hosMat(HOS.white, {rough: 0.6});
  const body = new THREE.InstancedMesh(crowdBody(), bodyMat, max);
  const head = new THREE.InstancedMesh(sph(CROWD.headR, 12, 7), headMat, max);
  const shadow = new THREE.InstancedMesh(
    cg('disc', () => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-PI / 2);
      return g;
    }),
    new THREE.MeshBasicMaterial({map: discTex(), transparent: true, depthWrite: false, color: HOS.ink, opacity: 0.4}),
    max,
  );
  for (const m of [body, head, shadow]) {
    m.castShadow = false;
    m.receiveShadow = m !== shadow;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  shadow.renderOrder = -1;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) {
    body.setMatrixAt(i, zero);
    head.setMatrixAt(i, zero);
    shadow.setMatrixAt(i, zero);
    body.setColorAt(i, new THREE.Color(HOS.civvies[i % HOS.civvies.length]));
    head.setColorAt(i, new THREE.Color(HOS.skin[i % HOS.skin.length]));
  }
  body.count = head.count = shadow.count = 0;
  const col = new THREE.Color();
  const qB = new THREE.Quaternion();
  const vB = new THREE.Vector3();
  const vH = new THREE.Vector3();
  const sB = new THREE.Vector3();
  const eB = new THREE.Euler(0, 0, 0, 'YXZ');
  const one = new THREE.Quaternion();
  let maxN = 0;

  function set(i, o) {
    if (i < 0 || i >= max) return;
    const p = o.pose | 0;
    const x = o.x || 0;
    const y = o.y || 0;
    const z = o.z || 0;
    const rot = o.rot || 0;
    const ph = o.phase === undefined ? hashf(i, 1) : ((o.phase % 1) + 1) % 1;
    if (p === 3) {
      // lying: flat along the rot direction, head toward +z of it, the back 0.10 above the given y
      eB.set(-PI / 2, rot + PI, 0);
      qB.setFromEuler(eB);
      const dx = Math.sin(rot);
      const dz = Math.cos(rot);
      vB.set(x - dx * 0.72, y + 0.19, z - dz * 0.72);
      vH.set(x + dx * 0.845, y + 0.19, z + dz * 0.845);
      sB.set(1, 1, 1);
      shadow.setMatrixAt(i, zero);
    } else {
      let dy = 0;
      let lean = 0;
      let roll = 0;
      let hy = CROWD.headY;
      if (p === 1) {
        dy = -0.019 * (1 + Math.cos(2 * TAU * ph));
        lean = 0.07;
        roll = 0.026 * Math.sin(ph * TAU);
        sB.set(1, 1, 1);
      } else if (p === 2) {
        lean = -0.07;
        dy = CROWD.sitY;
        hy = CROWD.headY * CROWD.sitK + 0.015;
        sB.set(1.02, CROWD.sitK, 1.32);
      } else {
        sB.set(1, 1, 1);
      }
      eB.set(lean, rot, roll);
      qB.setFromEuler(eB);
      vB.set(x, y + dy, z);
      vH.set(0, hy, 0).applyQuaternion(qB).add(vB);
      if (p === 2) {
        shadow.setMatrixAt(i, zero);
      } else {
        const r = CROWD.disc * (0.94 + 0.12 * hashf(i, 5));
        _m.compose(_p.set(x, y + 0.014, z), one, _s.set(r * 2, 1, r * 2));
        shadow.setMatrixAt(i, _m);
      }
    }
    body.setMatrixAt(i, _m.compose(vB, qB, sB));
    head.setMatrixAt(i, _m.compose(vH, qB, _s.set(1, 1.08, 1)));
    if (o.color) body.setColorAt(i, col.set(o.color));
    if (o.skin) head.setColorAt(i, col.set(o.skin));
    if (i + 1 > maxN) maxN = i + 1;
  }
  function count(n) {
    const c = clamp(n | 0, 0, max);
    body.count = head.count = shadow.count = c;
    return c;
  }
  function update() {
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    shadow.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (head.instanceColor) head.instanceColor.needsUpdate = true;
    if (!body.count && maxN) count(maxN);
  }
  return {group, set, count, update, max, meshes: {body, head, shadow}};
}
