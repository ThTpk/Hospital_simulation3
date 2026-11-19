// Bench for sim/shared/people.js — every role in a row, one figure through 8 phases of the walk cycle, every pose
// kind over the prop it belongs on, and a crowd of 300 off to the right to check the draw cost.
//
//   node .../build.mjs ./sim/bench-people
//   node .../capture.mjs bench-people --still 2 --size 1600x900 --out bench-people.png
//
// Shots, by time: 0-3 the whole bench, 3-5 the roles, 5-7 the walk strip, 7-8.5 the poses, 8.5-10 the crowd.
import * as THREE from 'three';
import {runSim} from 'simulator-kit/runtime.js';
import {HOS, createHospitalStage, hosMat, labelTexture, rbox, mesh} from '../shared/style.js';
import {buildPerson, createCrowd, WALK_STRIDE} from '../shared/people.js';

const PI = Math.PI;
const D2R = PI / 180;
const ROLES = ['doctor', 'nurse', 'tech', 'admin', 'pharm', 'porter', 'surgeon', 'patient', 'gown', 'child', 'elder'];
const POSES = ['stand', 'walk', 'sit', 'lie', 'lean', 'type', 'push', 'scrub'];
const Z_ROLE = -9.5;
const Z_WALK = -4.2;
const Z_POSE = 2.0;
const CX = 14; // the crowd block sits up and to the right, clear of all three row shots

const SHOTS = [
  {at: 0, tx: 12, ty: 0.8, tz: -9.0, az: 8, el: 38, d: 62, fov: 27},
  {at: 3, tx: 0, ty: 1.8, tz: Z_ROLE, az: 7, el: 15, d: 21, fov: 27},
  {at: 5, tx: 0, ty: 1.25, tz: Z_WALK, az: 0, el: 15, d: 16.5, fov: 25},
  {at: 7, tx: 0, ty: 1.7, tz: Z_POSE, az: 4, el: 19, d: 25, fov: 26},
  {at: 8.5, tx: 23, ty: 0.8, tz: -18.5, az: 10, el: 30, d: 32, fov: 28},
];

/** a flat name plate on the floor, reading upright for a camera on the +z side */
function tag(text, x, z, w = 1.5, color = HOS.inkSoft) {
  // the canvas clips, so the type shrinks to fit the plate rather than overflowing it
  const px = Math.min(120, Math.round((1024 * 0.94) / (text.length * 0.52)));
  const tex = labelTexture(text, {color, w: 1024, h: 200, font: `700 ${px}px Inter, system-ui, sans-serif`});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.195), new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false}));
  m.position.set(x, 0.015, z);
  m.rotation.set(-PI / 2, 0, 0);
  m.renderOrder = 2;
  return m;
}

runSim(
  {duration: 10, fps: 60, theme: 'light', hud: {enabled: false}, director: {enabled: false}, watermark: ''},
  async ({canvas}) => {
    const st = createHospitalStage(canvas, {fov: 28});
    st.renderer.info.autoReset = false; // the composer resets per pass, so the counts are summed by hand
    const root = new THREE.Group();
    st.scene.add(root);

    // ---- ground: the lot, with a pale floor pad under the bench
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), hosMat(HOS.ground, {rough: 0.92}));
    ground.rotation.x = -PI / 2;
    ground.receiveShadow = true;
    root.add(ground);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(24, 21), hosMat(HOS.floorA, {rough: 0.86}));
    pad.rotation.x = -PI / 2;
    pad.position.set(0, 0.004, -4);
    const pad2 = new THREE.Mesh(new THREE.PlaneGeometry(28, 23), hosMat(HOS.floorA, {rough: 0.86}));
    pad2.rotation.x = -PI / 2;
    pad2.position.set(24, 0.003, -18);
    pad2.receiveShadow = true;
    root.add(pad2);
    pad.receiveShadow = true;
    root.add(pad);
    for (const z of [Z_ROLE + 1.9, Z_WALK + 1.95, Z_POSE + 2.8]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(19, 0.05), hosMat(HOS.shade, {rough: 0.9}));
      s.rotation.x = -PI / 2;
      s.position.set(0, 0.006, z);
      root.add(s);
    }

    // ---- row A: every role, standing
    const roleFigs = ROLES.map((role, i) => {
      const p = buildPerson({role, seed: i * 3 + 1});
      p.group.position.set((i - (ROLES.length - 1) / 2) * 1.62, 0, Z_ROLE);
      p.group.rotation.y = 0.12 * Math.sin(i);
      root.add(p.group);
      root.add(tag(role, p.group.position.x, Z_ROLE + 0.95, 1.45));
      return p;
    });

    // ---- row B: one figure through 8 phases of the walk, seen in profile
    const PH = 8;
    const walkFigs = [];
    for (let i = 0; i < PH; i++) {
      const p = buildPerson({role: 'nurse', seed: 4, skin: 0, hair: 1});
      p.group.position.set((i - (PH - 1) / 2) * 1.45, 0, Z_WALK);
      p.group.rotation.y = PI / 2; // profile: the cycle only reads from the side
      root.add(p.group);
      root.add(tag((i / PH).toFixed(3), p.group.position.x, Z_WALK + 1.4, 0.9, HOS.blue));
      walkFigs.push(p);
    }
    // the same cycle, crossing the bench, so a video shows it moving
    const walker = buildPerson({role: 'porter', seed: 9});
    walker.group.rotation.y = PI / 2;
    root.add(walker.group);

    // ---- row C: every pose kind, over the prop it belongs on
    // every cell is turned a little so each pose reads in three-quarter view, props and all
    const poseFigs = POSES.map((kind, i) => {
      const cell = new THREE.Group();
      cell.position.set((i - (POSES.length - 1) / 2) * 2.3, 0, Z_POSE);
      cell.rotation.y = -0.62;
      root.add(cell);
      const prop = (w, h, d, x, z, color = HOS.panel, y = h / 2) => {
        const m = mesh(rbox(w, h, d, Math.min(w, h, d) * 0.14), hosMat(color, {rough: 0.6}), x, y, z);
        cell.add(m);
        return m;
      };
      const role = kind === 'scrub' ? 'surgeon' : kind === 'push' ? 'porter' : kind === 'lie' ? 'gown' : kind === 'type' ? 'admin' : kind === 'lean' ? 'doctor' : 'patient';
      const p = buildPerson({role, seed: i * 5 + 2});
      cell.add(p.group);
      root.add(tag(kind, cell.position.x, Z_POSE + 2.3, 1.3, HOS.blue));
      if (kind === 'sit') {
        prop(0.5, 0.45, 0.48, 0, -0.06, HOS.wood); // chair seat 0.45
        prop(0.5, 0.42, 0.06, 0, -0.27, HOS.wood, 0.66);
      }
      if (kind === 'type') {
        prop(1.4, 0.75, 0.7, 0, 0.8, HOS.panel); // desk top 0.75
        prop(0.44, 0.44, 0.46, 0, -0.08, HOS.steel);
      }
      if (kind === 'lie') {
        prop(0.95, 0.62, 2.05, 0, 0, HOS.linen); // ward bed deck 0.62
        p.group.position.y = 0.62;
      }
      if (kind === 'push') {
        prop(0.56, 0.06, 0.5, 0, 0.64, HOS.steel, 0.95); // push handles at 0.95
        prop(0.07, 0.95, 0.07, -0.24, 0.64, HOS.steelDark);
        prop(0.07, 0.95, 0.07, 0.24, 0.64, HOS.steelDark);
      }
      if (kind === 'lean') prop(0.8, 0.62, 2.0, 0, 1.35, HOS.linen);
      if (kind === 'scrub') prop(1.1, 0.95, 0.5, 0, 0.85, HOS.chrome);
      return {p, kind};
    });

    // ---- the crowd: 300 instances, off to the right of the rows
    const N = 300;
    const crowd = createCrowd(N + 8);
    root.add(crowd.group);
    const LANES = 6;
    const WALKERS = 186;
    const STAND = 70;
    const SIT = 34;
    const LIE = 10;
    const Z_LANE = -25.5;
    const Z_STAND = -19.0;
    const Z_BED = -13.6;
    for (let r = 0; r < 3; r++) {
      root.add(mesh(rbox(9.4, 0.45, 0.5, 0.06), hosMat(HOS.wood, {rough: 0.6}), CX + 17.3, 0.225, Z_STAND + r * 1.35));
      root.add(mesh(rbox(9.4, 0.42, 0.07, 0.03), hosMat(HOS.wood, {rough: 0.6}), CX + 17.3, 0.66, Z_STAND + r * 1.35 - 0.26));
    }
    for (let k = 0; k < 5; k++) {
      for (const c of [0, 1]) root.add(mesh(rbox(0.95, 0.62, 2.05, 0.07), hosMat(HOS.linen, {rough: 0.72}), CX + 1 + k * 1.45, 0.31, Z_BED + c * 2.6));
    }
    root.add(tag('walking', CX - 2.4, Z_LANE + 1.2, 2.1, HOS.inkSoft));
    root.add(tag('standing', CX + 5.6, Z_STAND + 3.1, 2.3, HOS.inkSoft));
    root.add(tag('sitting', CX + 17.3, Z_STAND + 3.4, 2.1, HOS.inkSoft));
    root.add(tag('lying', CX + 8.2, Z_BED + 1.6, 1.9, HOS.inkSoft));

    const STATE = [HOS.stWalk, HOS.stQueue, HOS.stQueueLong, HOS.stService, HOS.stResult, HOS.stBed];
    const rnd = (i, s) => {
      const v = Math.sin((i + 1) * 12.9898 + s * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    function layCrowd(t) {
      let i = 0;
      for (let w = 0; w < WALKERS; w++, i++) {
        const lane = w % LANES;
        const dir = lane % 2 ? 1 : -1;
        const span = 20;
        const v = 1.1 + 0.5 * rnd(i, 2);
        const x = CX + 2 + ((((w / LANES) * 1.2 + t * v * dir + 300) % span) + span) % span;
        crowd.set(i, {
          x,
          y: 0,
          z: Z_LANE + lane * 0.78 + 0.12 * rnd(i, 4),
          rot: dir > 0 ? PI / 2 : -PI / 2,
          pose: 1,
          phase: (x * dir) / WALK_STRIDE,
          color: STATE[Math.floor(rnd(i, 6) * 4)],
        });
      }
      for (let s = 0; s < STAND; s++, i++) {
        const row = s % 5;
        crowd.set(i, {
          x: CX + 0.4 + Math.floor(s / 5) * 0.8 + 0.12 * rnd(i, 7),
          y: 0,
          z: Z_STAND + row * 0.78,
          rot: PI / 2 + 0.14 * (rnd(i, 8) - 0.5),
          pose: 0,
          color: rnd(i, 9) > 0.4 ? HOS.stQueue : HOS.stQueueLong,
        });
      }
      for (let s = 0; s < SIT; s++, i++) {
        const row = s % 3;
        crowd.set(i, {
          x: CX + 12.9 + Math.floor(s / 3) * 0.78,
          y: 0.45,
          z: Z_STAND + row * 1.35,
          rot: 0,
          pose: 2,
          color: STATE[Math.floor(rnd(i, 11) * 5)],
        });
      }
      for (let s = 0; s < LIE; s++, i++) {
        const c = s % 2;
        crowd.set(i, {
          x: CX + 1 + Math.floor(s / 2) * 1.45,
          y: 0.62,
          z: Z_BED + c * 2.6,
          rot: 0,
          pose: 3,
          color: HOS.stBed,
        });
      }
      crowd.count(i);
      crowd.update();
      return i;
    }

    // ---- a floor readout of the draw cost, rebuilt only when the text changes
    let statText = '';
    let statMesh = null;
    const setStat = (txt) => {
      if (txt === statText) return;
      statText = txt;
      if (statMesh) {
        root.remove(statMesh);
        statMesh.material.map.dispose();
        statMesh.material.dispose();
      }
      statMesh = tag(txt, CX + 11, Z_BED + 4.4, 11, HOS.ink);
      root.add(statMesh);
    };

    let shown = 0;
    return {
      resize() {
        st.resize(1600, 900, 1);
      },
      render(t) {
        for (const [i, p] of roleFigs.entries()) p.pose('stand', 1, t * 0.22 + i * 0.13);
        for (const [i, p] of walkFigs.entries()) p.pose('walk', 1, i / PH);
        const wd = ((t * 1.45) % 13) - 6.5;
        walker.group.position.set(wd, 0, Z_WALK + 3.5);
        walker.pose('walk', 1, wd / WALK_STRIDE);
        for (const {p, kind} of poseFigs) {
          if (kind === 'walk' || kind === 'push') p.pose(kind, 1, t * 1.1);
          else if (kind === 'type') p.pose(kind, 1, t * 2.4);
          else if (kind === 'lie') p.pose(kind, 0.35 + 0.45 * (0.5 - 0.5 * Math.cos(t * 0.7)), 0);
          else if (kind === 'lean') p.pose(kind, 0.75 + 0.25 * Math.sin(t * 0.8), t * 0.3);
          else p.pose(kind, 1, t * 0.5);
        }
        shown = layCrowd(t);
        const r = st.renderer.info.render;
        setStat(`crowd ${shown} in 3 draw calls  —  whole bench ${r.calls} calls, ${(r.triangles / 1000) | 0}k triangles`);

        let s = SHOTS[0];
        for (const q of SHOTS) if (t >= q.at) s = q;
        st.renderer.info.reset();
        st.frame({tx: s.tx, ty: s.ty, tz: s.tz, az: s.az * D2R, el: s.el * D2R, d: s.d, fov: s.fov});
        return {};
      },
    };
  },
);
