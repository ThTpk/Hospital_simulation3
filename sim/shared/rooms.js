// The toy hospital's BUILDING kit — floors, walls, rooms, corridors, counters, the lift core, the entrances and the
// landscape the block sits in. Everything is parameterised by size and built at the origin: the world file places it.
// Real metres, y up, origin on the floor at the model's own centre, front face toward +z.
//
// Every builder returns `{group, ...keyPoints}`. Rooms are OPEN-TOPPED (no ceilings — the camera is isometric and
// looks in from above) and every wall carries real doorway openings, never a sealed box.
//
//   buildFloorPlate({w, d, tint})                       -> {group, w, d}
//   buildRoomShell({w, d, name, color, doors, glassTop, tint, sign, wallH})
//                                                       -> {group, doorPts, w, d, color}
//   buildWallRun({len, h, openings, glassFrom, color})   -> {group, len, h}
//   buildGlassPartition({len, solidH, glassH})          -> {group, len}
//   buildCubicleRow({n, w, d, color})                   -> {group, cells, w, d}
//   buildCorridor({len, w, dir, stripes})               -> {group, len, w, dir}
//   buildCounter({len, posts, color, screen})           -> {group, posts, len}
//   buildWaitingBay({w, d, rows, perRow, color})        -> {group, seats, w, d}
//   buildLiftCore({pax, bed})                           -> {group, doors, w, d}
//   buildEntrance({w, color, label})                    -> {group, w, doorPt}
//   buildAmbulanceBay({w})                              -> {group, ambulance, w, d}
//   buildWardBay({beds, w, d, name, color})             -> {group, bedPts, doorPts, w, d}
//   buildNurseStation({len, color})                     -> {group, len, staffPts}
//   buildSignGantry({items, len, h})                    -> {group, len}
//   buildStairBlock({w, d})                             -> {group, w, d}
//   buildToilet({w, d})                                 -> {group, doorPts, w, d}
//   buildStoreRoom({w, d})                              -> {group, doorPts, w, d}
//   buildCarPark({cols, rows, cars})                    -> {group, bays, w, d}
//   buildTree({size, kind})  buildHedge({len})  buildFence({len})  buildCityBlock({w, d, h})
//       these four return the Group itself with a `group` property pointing back at it, so `scene.add(buildTree())`
//       and `scene.add(buildTree().group)` both work.
//
// Static parts are merged per material and the frozen geometry is cached per size, so a hospital of 40 rooms is a few
// hundred draw calls. Nothing here reads a clock: anything that moves is an argument.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HOS, hosMat, rbox, rcyl, rsph, mesh} from './style.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

/** the scale contract, so no builder carries a magic number twice */
export const DIM = {
  floorToFloor: 4.2,
  slab: 0.3,
  wallH: 2.9, // full-height wall
  wallT: 0.18,
  cubSolid: 1.25, // cubicle wall: solid to here
  cubGlass: 2.45, // then frosted glass to here
  glassSill: 1.6, // a room shell's glazed upper band starts here
  doorW: 1.6,
  doorH: 2.15,
  corridor: 3.2,
  counterH: 1.05,
  counterD: 0.7,
  deskH: 0.75,
  seatH: 0.45,
  screenY: 2.05, // a wall monitor's / queue screen's centre
  shelfH: 2.05,
  shelfD: 0.5,
};

// ------------------------------------------------------------------------------------------------ materials
/**
 * The materials the cutaway modes act on: the walls, their inner faces, the skirting and the cubicle glass.
 *
 * Handed out by name rather than hunted for in the scene, because the instancing pass folds hundreds of wall
 * meshes into a handful of InstancedMeshes and the only thing left that identifies a wall afterwards is which
 * material it carries. Equipment painted the same white is a different material (paint: true), so it stays solid.
 */
export function wallMaterials() {
  const M = mats();
  return [M.wall, M.wallIn, M.base, M.glass, M.glassClear];
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    wall: hosMat(HOS.wall, {rough: 0.68}),
    wallIn: hosMat(HOS.wallShade, {rough: 0.7}),
    base: hosMat(HOS.wallBase, {rough: 0.6}),
    slab: hosMat(HOS.slab, {rough: 0.72}),
    glass: hosMat(HOS.glass, {rough: 0.2, opacity: 0.5}),
    glassClear: hosMat(HOS.glassClear, {rough: 0.12, opacity: 0.36}),
    door: hosMat(HOS.door, {rough: 0.5}),
    white: hosMat(HOS.white, {rough: 0.55}),
    panel: hosMat(HOS.panel, {rough: 0.6}),
    shade: hosMat(HOS.shade, {rough: 0.62}),
    ink: hosMat(HOS.ink, {rough: 0.6}),
    inkSoft: hosMat(HOS.inkSoft, {rough: 0.55}),
    steel: hosMat(HOS.steel, {rough: 0.42, metal: 0.25}),
    steelDark: hosMat(HOS.steelDark, {rough: 0.46, metal: 0.3}),
    chrome: hosMat(HOS.chrome, {rough: 0.3, metal: 0.5}),
    screen: hosMat(HOS.screen, {rough: 0.34}),
    lamp: hosMat(HOS.lamp, {rough: 0.3, emissive: HOS.lamp}),
    road: hosMat(HOS.road, {rough: 0.78}),
    lane: hosMat(HOS.lane, {rough: 0.7}),
    bay: hosMat(HOS.bay, {rough: 0.66}),
    ground: hosMat(HOS.ground, {rough: 0.8}),
    groundDeep: hosMat(HOS.groundDeep, {rough: 0.82}),
    green: hosMat(HOS.green, {rough: 0.74}),
    greenDeep: hosMat(HOS.greenDeep, {rough: 0.74}),
    trunk: hosMat(HOS.trunk, {rough: 0.8}),
    wood: hosMat(HOS.wood, {rough: 0.7}),
    linen: hosMat(HOS.linen, {rough: 0.72}),
    curtain: hosMat(HOS.curtain, {rough: 0.78}),
    cardboard: hosMat(HOS.cardboard, {rough: 0.84}),
    red: hosMat(HOS.red, {paint: true, rough: 0.48}),
    tyre: hosMat(HOS.ink, {rough: 0.84}),
  };
  return MATS;
}
const paint = (color) => hosMat(color, {paint: true, rough: 0.48});
const matte = (color) => hosMat(color, {rough: 0.62});

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
/** a colour mixed toward another, so department washes derive from the palette instead of adding to it */
const mix = (a, b, k) => '#' + _c1.set(a).lerp(_c2.set(b), k).getHexString();
/** the faint floor wash a department colour gives a room */
export const tintOf = (color) => mix(color, HOS.floorA, 0.8);
/** the pale version of a department colour, for bands and seat shells */
export const softOf = (color) => mix(color, HOS.white, 0.58);

// ------------------------------------------------------------------------------------------------ geometry kit
const GEO = new Map();
const cached = (key, make) => {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
};
const FROZEN = new Map();
const frozenKit = (key, make) => {
  if (!FROZEN.has(key)) FROZEN.set(key, make());
  return FROZEN.get(key);
};
/** keep only position, normal and uv and drop the index, so anything merges with anything */
function clean(g) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.morphAttributes = {};
  out.clearGroups();
  return out;
}

/** a bag of geometry that merges per material; push()/pop() nest a local frame so walls can be built along their own x */
class Kit {
  constructor() {
    this.parts = new Map();
    this.stack = [new THREE.Matrix4()];
  }
  get f() {
    return this.stack[this.stack.length - 1];
  }
  push(m) {
    this.stack.push(this.f.clone().multiply(m));
    return this;
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }
  add(mat, geo, m) {
    const g = clean(geo);
    g.applyMatrix4(m ? this.f.clone().multiply(m) : this.f);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }
  /** a rounded box; the toy look lives in the bevels */
  box(mat, w, h, d, x, y, z, r = null, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, rbox(w, h, d, r ?? Math.min(w, h, d) * 0.16), mat4(x, y, z, rx, ry, rz));
  }
  /** a plain box, for ribs and strips under 8 cm where a bevel never shows */
  flat(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), mat4(x, y, z, rx, ry, rz));
  }
  cyl(mat, rt, rb, h, x, y, z, axis = 'y', seg = 14) {
    const m = axis === 'x' ? mat4(x, y, z, 0, 0, -PI / 2) : axis === 'z' ? mat4(x, y, z, PI / 2, 0, 0) : mat4(x, y, z);
    return this.add(mat, rcyl(rt, rb, h, seg), m);
  }
  sph(mat, r, x, y, z, seg = 16) {
    return this.add(mat, rsph(r, seg), mat4(x, y, z));
  }
  freeze() {
    return [...this.parts].map(([mat, list]) => ({mat, geo: list.length === 1 ? list[0] : mergeGeometries(list, false)}));
  }
  build(group = new THREE.Group()) {
    return thaw(this.freeze(), group);
  }
}
/** a Group from a frozen kit; geometry and materials are shared between copies, never duplicated */
function thaw(frozen, group = new THREE.Group()) {
  for (const {geo, mat} of frozen) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

// ------------------------------------------------------------------------------------------------ printed text
const TEX = new Map();
const FONT = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/**
 * One line of text on a canvas sized to fit it: {tex, aspect}. bg null = transparent (a decal on a plate),
 * otherwise the text sits on a rounded plate of that colour. arrow = 'left' | 'right' | 'up' adds a wayfinding chevron.
 */
function fitTex(text, {px = 150, h = 256, color = HOS.white, bg = null, weight = 800, pad = 0.3, radius = 0.2, arrow = null} = {}) {
  const key = ['t', text, px, h, color, bg, weight, pad, radius, arrow].join('|');
  if (TEX.has(key)) return TEX.get(key);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = FONT(weight, px);
  const tw = probe.measureText(text).width;
  const aw = arrow ? h * 0.78 : 0;
  const w = Math.ceil(tw + 2 * h * pad + aw);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    rr(g, 0, 0, w, h, h * radius);
    g.fillStyle = bg;
    g.fill();
  }
  g.font = FONT(weight, px);
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, (arrow === 'left' ? aw : 0) + (w - aw) / 2, h / 2 + px * 0.05);
  if (arrow) {
    const s = h * 0.24;
    const cx = arrow === 'left' ? h * 0.46 : w - h * 0.46;
    const cy = h / 2;
    g.fillStyle = color;
    g.beginPath();
    if (arrow === 'up') {
      g.moveTo(cx, cy - s);
      g.lineTo(cx + s, cy + s * 0.75);
      g.lineTo(cx - s, cy + s * 0.75);
    } else {
      const sx = arrow === 'left' ? -1 : 1;
      g.moveTo(cx + sx * s, cy);
      g.lineTo(cx - sx * s * 0.75, cy - s);
      g.lineTo(cx - sx * s * 0.75, cy + s);
    }
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = {tex, aspect: w / h};
  TEX.set(key, out);
  return out;
}
const DECAL = new Map();
/** a flat printed panel h tall, facing +z; lit = false for a self-lit screen face */
function decal(text, h, opt = {}) {
  const {tex, aspect} = fitTex(text, opt);
  const lit = opt.lit !== false;
  const dkey = `${tex.uuid}|${lit}`;
  let m = DECAL.get(dkey);
  if (!m) {
    m = lit
      ? new THREE.MeshStandardMaterial({map: tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2})
      : new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
    DECAL.set(dkey, m);
  }
  const mesh2 = new THREE.Mesh(cached(`plane|${aspect.toFixed(4)}|${h}`, () => new THREE.PlaneGeometry(h * aspect, h)), m);
  mesh2.userData.w = h * aspect;
  return mesh2;
}
/** a wall / hanging sign: a coloured plate with white type, facing +z. Origin at the plate's centre. */
function signPlate(text, {h = 0.5, color = HOS.blue, maxW = 99, arrow = null, pad = 0.34} = {}) {
  const g = new THREE.Group();
  const face = decal(text, h * 0.56, {color: HOS.white, arrow, pad: 0.1, px: 150});
  const w = clamp(face.userData.w + h * pad * 2, h * 1.6, maxW);
  if (face.userData.w > w - 0.1) face.scale.setScalar((w - 0.12) / face.userData.w);
  g.add(mesh(rbox(w, h, 0.07, 0.07), paint(color), 0, 0, 0));
  face.position.z = 0.045;
  g.add(face);
  g.userData.w = w;
  return g;
}
/** a dark screen plate with glowing type on it (queue displays, lift indicators), facing +z */
function screenPlate(text, {w = 1.4, h = 0.8, color = HOS.lamp, sub = null} = {}) {
  const M = mats();
  const g = new THREE.Group();
  g.add(mesh(rbox(w, h, 0.09, 0.05), M.ink));
  g.add(mesh(rbox(w - 0.1, h - 0.1, 0.04, 0.03), M.screen, 0, 0, 0.045));
  const line = decal(text, h * (sub ? 0.34 : 0.44), {color, lit: false, pad: 0.08});
  const k = Math.min(1, (w - 0.22) / line.userData.w);
  line.scale.setScalar(k);
  line.position.set(0, sub ? h * 0.16 : 0, 0.075);
  g.add(line);
  if (sub) {
    const s = decal(sub, h * 0.2, {color: HOS.mintLight, lit: false, pad: 0.08});
    s.scale.setScalar(Math.min(1, (w - 0.22) / s.userData.w));
    s.position.set(0, -h * 0.24, 0.075);
    g.add(s);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ floors
let TILE = null;
/** a 2x2 m tile patch as a neutral luminance mask — the material's colour does the tinting */
function tileTex() {
  if (TILE) return TILE;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d9d9'; // grout (a grey mask, not a palette colour)
  g.fillRect(0, 0, S, S);
  const tiles = [
    [0, 0, '#ffffff'],
    [1, 1, '#ffffff'],
    [1, 0, '#f2f2f2'],
    [0, 1, '#f2f2f2'],
  ];
  for (const [i, j, col] of tiles) {
    g.fillStyle = col;
    g.fillRect(i * (S / 2) + 2, j * (S / 2) + 2, S / 2 - 4, S / 2 - 4);
  }
  TILE = new THREE.CanvasTexture(c);
  TILE.wrapS = TILE.wrapT = THREE.RepeatWrapping;
  TILE.colorSpace = THREE.SRGBColorSpace;
  TILE.anisotropy = 8;
  return TILE;
}
const FLOORMAT = new Map();
/** one material per (tint, size): the tile map is shared geometry-side but needs its own repeat */
function floorMat(tint, w, d) {
  const key = `${tint}|${w}|${d}`;
  if (!FLOORMAT.has(key)) {
    const map = tileTex().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(w / 2, d / 2);
    FLOORMAT.set(key, new THREE.MeshStandardMaterial({color: tint, map, roughness: 0.5}));
  }
  return FLOORMAT.get(key);
}
/** a tiled floor surface w x d, its top at y; the 1 m tile grid stays put whatever the size */
function floorSurface(w, d, tint, y = 0.01, z = 0, x = 0) {
  const m = new THREE.Mesh(cached(`fp|${w}|${d}`, () => new THREE.PlaneGeometry(w, d)), floorMat(tint, w, d));
  m.rotation.x = -PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

/** A floor plate: a 0.3 m slab with a tiled top on a 1 m grid and an edge trim. Top of the floor is y = 0. */
export function buildFloorPlate({w = 20, d = 12, tint = HOS.floorA, grid = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'floor-plate';
  const frozen = frozenKit(`plate|${w}|${d}`, () => {
    const K = new Kit();
    K.box(M.slab, w, DIM.slab, d, 0, -DIM.slab / 2, 0, 0.05);
    // the edge trim: a crisp lip just under the floor line on all four sides
    for (const s of [-1, 1]) {
      K.flat(M.base, w + 0.1, 0.1, 0.12, 0, -0.06, s * (d / 2 + 0.01));
      K.flat(M.base, 0.12, 0.1, d + 0.1, s * (w / 2 + 0.01), -0.06, 0);
    }
    return K.freeze();
  });
  thaw(frozen, group);
  if (grid) group.add(floorSurface(w, d, tint, 0.006));
  else group.add(mesh(cached(`plain|${w}|${d}`, () => new THREE.BoxGeometry(w, 0.02, d)), matte(tint), 0, 0.005, 0));
  return {group, w, d};
}

// ------------------------------------------------------------------------------------------------ walls
const SIDES = {
  s: {n: 0, ax: 'x'},
  n: {n: PI, ax: 'x'},
  e: {n: PI / 2, ax: 'z'},
  w: {n: -PI / 2, ax: 'z'},
};
const SIDE_ALIAS = {
  s: 's', south: 's', '+z': 's', front: 's', f: 's',
  n: 'n', north: 'n', '-z': 'n', back: 'n', b: 'n', rear: 'n',
  e: 'e', east: 'e', '+x': 'e', right: 'e', r: 'e',
  w: 'w', west: 'w', '-x': 'w', left: 'w', l: 'w',
};
/** doors may be 's', 'n,e', ['s','e'] or [{side, at, w}] — every form lands on [{side, at, w}] */
function normDoors(doors) {
  if (doors == null) return [{side: 's', at: 0, w: DIM.doorW}];
  const list = Array.isArray(doors) ? doors : typeof doors === 'string' ? doors.split(/[,\s|]+/) : [doors];
  const out = [];
  for (const it of list) {
    if (!it) continue;
    if (typeof it === 'string') {
      const s = SIDE_ALIAS[it.toLowerCase()];
      if (s) out.push({side: s, at: 0, w: DIM.doorW});
    } else {
      const s = SIDE_ALIAS[String(it.side ?? it.s ?? 's').toLowerCase()] ?? 's';
      out.push({side: s, at: it.at ?? 0, w: it.w ?? it.width ?? DIM.doorW, h: it.h ?? DIM.doorH});
    }
  }
  return out.length ? out : [{side: 's', at: 0, w: DIM.doorW}];
}
/** the solid stretches of a wall of length len once the openings are cut out of it */
function spans(len, actives) {
  const out = [];
  let x = -len / 2;
  for (const o of [...actives].sort((a, b) => a.at - b.at)) {
    const a = clamp(o.at - o.w / 2, -len / 2, len / 2);
    const b = clamp(o.at + o.w / 2, -len / 2, len / 2);
    if (a > x + 0.03) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (x < len / 2 - 0.03) out.push([x, len / 2]);
  return out;
}
/**
 * A wall into kit K, along the kit's local x and centred on it, faces toward ±z, standing on y = 0.
 * openings = [{at, w, h}] are real holes (no door leaf). glassFrom = the height a frosted upper band starts at.
 * capColor paints the top trim in a department colour.
 */
function wall(K, {len, h = DIM.wallH, t = DIM.wallT, openings = [], matWall = null, glassFrom = null, capColor = null, skirt = true, frames = true}) {
  const M = mats();
  const mw = matWall ?? M.wall;
  const ops = openings.filter((o) => o.w > 0.05).map((o) => ({at: o.at, w: o.w, h: Math.min(o.h ?? DIM.doorH, h - 0.12)}));
  const bands = glassFrom && glassFrom < h - 0.1 ? [[0, glassFrom, mw], [glassFrom, h, M.glass]] : [[0, h, mw]];
  for (const [by0, by1, mat] of bands) {
    // split the band at every opening top, so each slice is a clean row of solid stretches
    const cuts = [...new Set(ops.map((o) => o.h).filter((y) => y > by0 + 0.02 && y < by1 - 0.02))].sort((a, b) => a - b);
    let y0 = by0;
    for (const y1 of [...cuts, by1]) {
      const act = ops.filter((o) => o.h >= y1 - 1e-4);
      for (const [a, b] of spans(len, act)) {
        const segW = b - a;
        if (segW < 0.04) continue;
        K.box(mat, segW, y1 - y0, t, (a + b) / 2, (y0 + y1) / 2, 0, Math.min(0.04, t * 0.22));
      }
      y0 = y1;
    }
  }
  if (skirt) {
    const act = ops.filter((o) => o.h > 0.2);
    for (const [a, b] of spans(len, act)) {
      if (b - a > 0.06) K.flat(M.base, b - a, 0.14, t + 0.05, (a + b) / 2, 0.07, 0);
      // the bumper rail every hospital corridor carries — it is also what keeps a long wall from reading as a blank slab
      if (b - a > 0.4) K.flat(M.shade, b - a, 0.075, t + 0.05, (a + b) / 2, 0.97, 0);
    }
  }
  if (frames) {
    for (const o of ops) {
      for (const s of [-1, 1]) K.box(M.door, 0.1, o.h + 0.08, t + 0.07, o.at + s * (o.w / 2 + 0.05), (o.h + 0.08) / 2, 0, 0.03);
      K.box(M.door, o.w + 0.3, 0.12, t + 0.07, o.at, o.h + 0.08, 0, 0.04);
      K.flat(M.shade, o.w, 0.02, t + 0.12, o.at, 0.026, 0);
    }
  }
  K.box(capColor ? paint(capColor) : M.base, len + 0.03, 0.13, t + 0.09, 0, h + 0.02, 0, 0.04);
  return K;
}

/** One wall run along x, centred, faces toward ±z. openings = [{at, w}] (at = the opening's centre along x). */
export function buildWallRun({len = 8, h = DIM.wallH, openings = [], glassFrom = null, color = null, t = DIM.wallT} = {}) {
  const key = `wr|${len}|${h}|${t}|${glassFrom}|${color}|${JSON.stringify(openings)}`;
  const frozen = frozenKit(key, () => {
    const K = new Kit();
    wall(K, {len, h, t, openings, glassFrom, capColor: color});
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'wall-run';
  return {group, len, h};
}

/** A cubicle / office partition along x: solid to solidH, frosted glass up to glassH, in a slim steel frame. */
export function buildGlassPartition({len = 4, solidH = DIM.cubSolid, glassH = DIM.cubGlass} = {}) {
  const M = mats();
  const frozen = frozenKit(`gp|${len}|${solidH}|${glassH}`, () => {
    const K = new Kit();
    const t = 0.11;
    K.box(M.panel, len, solidH, t, 0, solidH / 2, 0, 0.035);
    K.flat(M.base, len, 0.12, t + 0.04, 0, 0.06, 0);
    K.flat(M.steel, len, 0.07, t + 0.05, 0, solidH + 0.03, 0);
    const gh = glassH - solidH - 0.1;
    if (gh > 0.1) {
      K.box(M.glass, len - 0.08, gh, 0.06, 0, solidH + 0.07 + gh / 2, 0, 0.02);
      const n = Math.max(1, Math.round(len / 1.3));
      for (let i = 1; i < n; i++) K.flat(M.steel, 0.07, gh, 0.09, -len / 2 + (len * i) / n, solidH + 0.07 + gh / 2, 0);
      for (const s of [-1, 1]) K.flat(M.steel, 0.09, gh + 0.1, 0.11, s * (len / 2 - 0.045), solidH + 0.07 + gh / 2, 0);
      K.box(M.steel, len + 0.04, 0.09, 0.14, 0, glassH, 0, 0.035);
    }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'glass-partition';
  return {group, len};
}

// ------------------------------------------------------------------------------------------------ the room shell
/**
 * Four walls with real doorway openings around a w x d room, open-topped, its floor washed in the department colour
 * and its name on a sign over the main door. doorPts[i].rot is the y-angle of the doorway's OUTWARD normal.
 */
export function buildRoomShell({
  w = 8,
  d = 6,
  name = '',
  color = HOS.blue,
  doors = null,
  glassTop = false,
  tint = null,
  wallH = DIM.wallH,
  sign = true,
} = {}) {
  const M = mats();
  const dr = normDoors(doors);
  const wash = tint ?? tintOf(color);
  const glassFrom = glassTop ? DIM.glassSill : null;
  const key = `shell|${w}|${d}|${color}|${wallH}|${glassTop}|${JSON.stringify(dr)}`;
  const frozen = frozenKit(key, () => {
    const K = new Kit();
    const T = DIM.wallT;
    for (const side of ['s', 'n', 'e', 'w']) {
      const horiz = side === 's' || side === 'n';
      const len = horiz ? w : d;
      const ops = dr
        .filter((o) => o.side === side)
        .map((o) => ({at: clamp(o.at, -len / 2 + o.w / 2 + 0.35, len / 2 - o.w / 2 - 0.35), w: o.w, h: o.h ?? DIM.doorH}));
      const ang = SIDES[side].n;
      K.push(mat4(side === 'e' ? w / 2 - T / 2 : side === 'w' ? -(w / 2 - T / 2) : 0, 0, side === 's' ? d / 2 - T / 2 : side === 'n' ? -(d / 2 - T / 2) : 0, 0, ang, 0));
      wall(K, {len: len - (horiz ? 0 : T * 2), h: wallH, t: T, openings: ops, glassFrom, capColor: color});
      K.pop();
    }
    // corner posts, so the four walls read as one shell rather than four slabs
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) K.box(M.wall, T + 0.12, wallH, T + 0.12, sx * (w / 2 - T / 2), wallH / 2, sz * (d / 2 - T / 2), 0.05);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = name ? `room-${name}` : 'room-shell';
  group.add(floorSurface(w - DIM.wallT * 2, d - DIM.wallT * 2, wash, 0.012));
  // the department stripe inside the door wall, at skirting height — the wayfinding colour read from inside
  const doorPts = dr.map((o) => {
    const horiz = o.side === 's' || o.side === 'n';
    const len = horiz ? w : d;
    const at = clamp(o.at, -len / 2 + o.w / 2 + 0.35, len / 2 - o.w / 2 - 0.35);
    const ang = SIDES[o.side].n;
    const off = (horiz ? d : w) / 2;
    const p = new THREE.Vector3(at, 0, off).applyAxisAngle(V(0, 1, 0), ang);
    return {x: +p.x.toFixed(3), z: +p.z.toFixed(3), rot: ang, side: o.side, w: o.w};
  });
  if (sign && name) {
    const main = doorPts[0];
    const horiz = main.side === 's' || main.side === 'n';
    const maxW = Math.min((horiz ? w : d) - 0.5, 4.4);
    const sp = signPlate(name.toUpperCase(), {h: 0.52, color, maxW});
    const out = (horiz ? d : w) / 2 + 0.055;
    sp.position.set(main.side === 'e' ? out : main.side === 'w' ? -out : main.x, wallH - 0.42, main.side === 's' ? out : main.side === 'n' ? -out : main.z);
    if (!horiz) sp.position.z = main.z;
    sp.rotation.y = main.rot;
    group.add(sp);
  }
  return {group, doorPts, w, d, color};
}

/** Exam cubicles in a row off a corridor: frosted upper halves, open toward +z, numbered. */
export function buildCubicleRow({n = 4, w = 3.4, d = 3.6, color = HOS.mint, first = 1} = {}) {
  const M = mats();
  const L = n * w;
  const frozen = frozenKit(`cub|${n}|${w}|${d}|${color}`, () => {
    const K = new Kit();
    // the back wall, full height, with the department cap
    K.push(mat4(0, 0, -(d / 2 - DIM.wallT / 2), 0, PI, 0));
    wall(K, {len: L, h: DIM.wallH, openings: [], capColor: color});
    K.pop();
    // the dividers: solid to 1.25, frosted to 2.45, running back to front
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + i * w;
      K.push(mat4(x, 0, 0, 0, PI / 2, 0));
      const t = 0.11;
      K.box(M.panel, d - DIM.wallT, DIM.cubSolid, t, 0, DIM.cubSolid / 2, 0, 0.035);
      K.flat(M.base, d - DIM.wallT, 0.12, t + 0.04, 0, 0.06, 0);
      const gh = DIM.cubGlass - DIM.cubSolid - 0.12;
      K.box(M.glass, d - DIM.wallT - 0.1, gh, 0.06, 0, DIM.cubSolid + 0.08 + gh / 2, 0, 0.02);
      K.flat(M.steel, d - DIM.wallT, 0.07, t + 0.05, 0, DIM.cubSolid + 0.04, 0);
      K.box(M.steel, d - DIM.wallT + 0.04, 0.09, 0.14, 0, DIM.cubGlass, 0, 0.035);
      K.pop();
    }
    // a curtain rail across each cubicle's open front
    for (let i = 0; i < n; i++) K.flat(M.steelDark, w - 0.1, 0.06, 0.06, -L / 2 + (i + 0.5) * w, 2.2, d / 2 - 0.3);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'cubicle-row';
  group.add(floorSurface(L, d - DIM.wallT, tintOf(color), 0.012));
  const cells = [];
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * w;
    const sp = signPlate(String(first + i), {h: 0.34, color, maxW: 0.7});
    sp.position.set(x, DIM.cubGlass + 0.3, d / 2 - 0.28);
    group.add(sp);
    cells.push({x: +x.toFixed(3), z: 0, rot: 0});
  }
  return {group, cells, w: L, d};
}

// ------------------------------------------------------------------------------------------------ circulation
/** A corridor floor with coloured wayfinding stripes down it. dir 'x' (default) or 'z'. */
export function buildCorridor({len = 20, w = DIM.corridor, dir = 'x', stripes = [HOS.blue]} = {}) {
  const group = new THREE.Group();
  group.name = 'corridor';
  group.add(floorSurface(len, w, HOS.floorA, 0.01));
  const st = (Array.isArray(stripes) ? stripes : [stripes]).filter(Boolean);
  const sw = 0.14;
  const gap = 0.08;
  const total = st.length * sw + (st.length - 1) * gap;
  st.forEach((c, i) => {
    const z = -w / 2 + 0.55 + total / 2 - (i * (sw + gap) + sw / 2);
    const m = mesh(cached(`stripe|${len}|${sw}`, () => new THREE.BoxGeometry(len, 0.018, sw)), paint(c), 0, 0.019, z);
    m.castShadow = false;
    group.add(m);
  });
  if (dir === 'z') group.rotation.y = PI / 2;
  return {group, len, w, dir};
}

/** Hanging department signs over a corridor: two posts, a beam at wall height, a plate per item. */
export function buildSignGantry({items = [], len = null, h = DIM.wallH} = {}) {
  const M = mats();
  const list = items.map((it) => (typeof it === 'string' ? {text: it} : it));
  const plates = list.map((it) => signPlate(String(it.text ?? '').toUpperCase(), {h: 0.52, color: it.color ?? HOS.blue, arrow: it.arrow ?? null}));
  const need = plates.reduce((s, p) => s + p.userData.w + 0.3, 0.6);
  const L = len ?? Math.max(DIM.corridor + 1.2, need);
  const frozen = frozenKit(`gantry|${L}|${h}`, () => {
    const K = new Kit();
    for (const s of [-1, 1]) {
      K.cyl(M.steelDark, 0.07, 0.08, h + 0.1, s * (L / 2 - 0.1), (h + 0.1) / 2, 0);
      K.box(M.steel, 0.34, 0.1, 0.34, s * (L / 2 - 0.1), 0.05, 0, 0.04);
    }
    K.box(M.steelDark, L, 0.14, 0.22, 0, h + 0.07, 0, 0.05);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'sign-gantry';
  let x = -plates.reduce((s, p) => s + p.userData.w + 0.3, -0.3) / 2;
  for (const p of plates) {
    p.position.set(x + p.userData.w / 2, h - 0.32, 0);
    group.add(p);
    const back = p.clone();
    back.rotation.y = PI;
    back.position.z = -0.001;
    group.add(back);
    x += p.userData.w + 0.3;
  }
  return {group, len: L};
}

/** A lift lobby: pax lifts, stretcher lifts and a stair flight beside them, all opening toward +z. */
export function buildLiftCore({pax = 2, bed = 1} = {}) {
  const M = mats();
  const PW = 1.4;
  const BW = 2.0;
  const pitchP = PW + 0.5;
  const pitchB = BW + 0.6;
  const w = pax * pitchP + bed * pitchB + 1.0;
  const dShaft = 2.9;
  const hCore = 3.6;
  const frozen = frozenKit(`lift|${pax}|${bed}`, () => {
    const K = new Kit();
    // the core block behind the doors
    K.box(M.wall, w, hCore, dShaft, 0, hCore / 2, -dShaft / 2, 0.08);
    K.box(M.base, w + 0.14, 0.16, dShaft + 0.08, 0, hCore + 0.06, -dShaft / 2 + 0.02, 0.05);
    K.flat(M.base, w, 0.14, 0.1, 0, 0.07, 0.03);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'lift-core';
  group.add(floorSurface(w + 3.0, DIM.corridor, HOS.floorA, 0.011, DIM.corridor / 2 + 0.05));
  const doors = [];
  let x = -w / 2 + 0.5;
  const addDoor = (dw, kind) => {
    const dh = kind === 'bed' ? 2.3 : 2.2;
    const cx = x + dw / 2;
    const g = new THREE.Group();
    g.position.set(cx, 0, 0.02);
    // a recessed dark surround, two brushed leaves parted by a seam, a call plate and an indicator
    g.add(mesh(rbox(dw + 0.3, dh + 0.26, 0.12, 0.05), M.steelDark, 0, (dh + 0.26) / 2, 0));
    for (const s of [-1, 1]) g.add(mesh(rbox(dw / 2 - 0.03, dh, 0.08, 0.03), M.chrome, s * (dw / 4 + 0.015), dh / 2, 0.07));
    g.add(mesh(rbox(0.16, 0.34, 0.06, 0.04), M.panel, dw / 2 + 0.24, 1.1, 0.06));
    g.add(mesh(rsph(0.035, 10), paint(HOS.amber), dw / 2 + 0.24, 1.18, 0.1));
    const ind = screenPlate(kind === 'bed' ? 'BED  2F' : '3F', {w: 0.62, h: 0.3, color: HOS.amberLight});
    ind.position.set(0, dh + 0.42, 0.07);
    g.add(ind);
    group.add(g);
    doors.push({x: +cx.toFixed(3), z: 0, rot: 0, kind, w: dw});
    x += dw + (kind === 'bed' ? 0.6 : 0.5);
  };
  for (let i = 0; i < pax; i++) addDoor(PW, 'pax');
  for (let i = 0; i < bed; i++) addDoor(BW, 'bed');
  const sp = signPlate('LIFTS', {h: 0.5, color: HOS.violet, maxW: 2.4});
  sp.position.set(0, hCore - 0.5, 0.1);
  group.add(sp);
  // the stair flight alongside
  const st = buildStairBlock({});
  st.group.position.set(w / 2 + st.w / 2 + 0.6, 0, -dShaft / 2 + st.d / 2 - 1.2);
  group.add(st.group);
  return {group, doors, w: w + st.w + 0.6, d: dShaft};
}

/** A stair flight: one straight run up to the half-landing at 2.1, handrails both sides, inside a stair well. */
export function buildStairBlock({w = 3.4, d = 6.0} = {}) {
  const M = mats();
  const frozen = frozenKit(`stair|${w}|${d}`, () => {
    const K = new Kit();
    const steps = 14;
    const top = DIM.floorToFloor / 2;
    const rise = top / steps;
    const land = 1.5;
    const run = (d - land - 0.9) / steps;
    const runW = w - 0.95;
    const z0 = d / 2 - 0.5; // the foot of the flight
    for (let i = 0; i < steps; i++) {
      const y = (i + 1) * rise;
      const z = z0 - (i + 0.5) * run;
      K.flat(M.white, runW, 0.11, run + 0.02, 0, y, z);
      K.flat(M.shade, runW, rise, 0.06, 0, y - rise / 2, z - run / 2 + 0.03);
    }
    // the half landing the flight arrives on
    K.box(M.white, runW + 0.3, 0.18, land + 0.2, 0, top - 0.07, -d / 2 + 0.3 + land / 2, 0.06);
    K.box(M.panel, runW + 0.3, top - 0.18, 0.26, 0, (top - 0.18) / 2, -d / 2 + 0.3 + land - 0.03, 0.06);
    // the stringers and handrails, following the slope
    const ang = Math.atan2(steps * rise, steps * run);
    const slope = Math.hypot(steps * rise, steps * run);
    const cy = (steps * rise) / 2;
    const cz = z0 - (steps * run) / 2;
    for (const s of [-1, 1]) {
      const x = s * (runW / 2 + 0.07);
      K.box(M.panel, 0.14, 0.34, slope, x, cy - 0.14, cz, 0.05, ang, 0, 0);
      K.box(M.steel, 0.08, 0.08, slope, x, cy + 0.92, cz, 0.03, ang, 0, 0);
      for (let i = 2; i < steps; i += 3) {
        const t = i / steps - 0.5;
        K.flat(M.steel, 0.05, 0.9, 0.05, x, cy + t * steps * rise + 0.46, cz - t * steps * run);
      }
      // the landing rail
      K.box(M.steel, 0.08, 0.08, land + 0.2, x, top + 0.95, -d / 2 + 0.3 + land / 2, 0.03);
      K.flat(M.steel, 0.05, 0.95, 0.05, x, top + 0.47, -d / 2 + 0.5);
    }
    // the stair well: walls on three sides, the front open onto the lobby
    K.push(mat4(0, 0, -(d / 2 - DIM.wallT / 2), 0, PI, 0));
    wall(K, {len: w, h: DIM.wallH, openings: [], capColor: HOS.violet});
    K.pop();
    for (const s of [-1, 1]) {
      K.push(mat4(s * (w / 2 - DIM.wallT / 2), 0, 0, 0, (s * PI) / 2, 0));
      wall(K, {len: d - DIM.wallT * 2, h: DIM.wallH, openings: [{at: -s * (d / 2 - 1.5), w: 1.4}], capColor: HOS.violet});
      K.pop();
    }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'stair-block';
  group.add(floorSurface(w - 0.3, d - 0.3, HOS.floorA, 0.012));
  // the sign goes over the doorway in the side wall, facing out of the well
  const sp = signPlate('STAIRS', {h: 0.44, color: HOS.violet, maxW: 1.9});
  sp.position.set(w / 2 + 0.055, DIM.wallH - 0.4, d / 2 - 1.5);
  sp.rotation.y = PI / 2;
  group.add(sp);
  return {group, w, d};
}

// ------------------------------------------------------------------------------------------------ front office
/** A service counter: worktop at 1.05, computers and staff chairs behind (-z), a queue screen hung over it. */
export function buildCounter({len = 6, posts = 3, color = HOS.blue, screen = true} = {}) {
  const M = mats();
  const n = Math.max(1, posts);
  const D = DIM.counterD;
  const frozen = frozenKit(`counter|${len}|${n}|${color}`, () => {
    const K = new Kit();
    // the body: a solid front with a department band, a lipped top, and a low worktop behind for the staff
    K.box(M.panel, len, DIM.counterH - 0.1, D, 0, (DIM.counterH - 0.1) / 2, 0, 0.05);
    K.box(paint(color), len + 0.03, 0.17, D + 0.02, 0, 0.34, 0.01, 0.05);
    K.box(M.white, len + 0.14, 0.1, D + 0.18, 0, DIM.counterH - 0.04, 0, 0.045);
    K.flat(M.base, len, 0.12, D + 0.04, 0, 0.06, 0);
    K.box(M.panel, len - 0.3, DIM.deskH - 0.08, 0.5, 0, (DIM.deskH - 0.08) / 2, -D / 2 - 0.42, 0.05);
    K.box(M.white, len - 0.2, 0.08, 0.58, 0, DIM.deskH - 0.03, -D / 2 - 0.42, 0.035);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (len * (i + 0.5)) / n;
      // a divider between service positions, a monitor on the staff side, a chair behind it
      if (i) K.box(M.glass, 0.05, 0.5, D - 0.1, -len / 2 + (len * i) / n, DIM.counterH + 0.22, 0, 0.02);
      K.box(M.ink, 0.5, 0.33, 0.05, x, DIM.deskH + 0.24, -D / 2 - 0.3, 0.03, 0, PI, 0);
      K.box(M.screen, 0.44, 0.27, 0.02, x, DIM.deskH + 0.24, -D / 2 - 0.33, 0.015);
      K.cyl(M.steelDark, 0.04, 0.04, 0.2, x, DIM.deskH + 0.04, -D / 2 - 0.3);
      K.flat(M.ink, 0.36, 0.02, 0.16, x, DIM.deskH + 0.03, -D / 2 - 0.22);
      // the staff chair
      const cz = -D / 2 - 1.1;
      K.box(matte(softOf(color)), 0.48, 0.1, 0.46, x, DIM.seatH, cz, 0.045);
      K.box(matte(softOf(color)), 0.46, 0.46, 0.1, x, DIM.seatH + 0.3, cz - 0.2, 0.045);
      K.cyl(M.steelDark, 0.04, 0.04, DIM.seatH - 0.05, x, (DIM.seatH - 0.05) / 2, cz);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * PI * 2;
        K.flat(M.steelDark, 0.06, 0.05, 0.26, x + Math.sin(a) * 0.13, 0.05, cz + Math.cos(a) * 0.13, 0, a, 0);
        K.cyl(M.tyre, 0.035, 0.035, 0.05, x + Math.sin(a) * 0.26, 0.04, cz + Math.cos(a) * 0.26, 'z', 8);
      }
    }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'counter';
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    const num = signPlate(String.fromCharCode(65 + i), {h: 0.3, color, maxW: 0.55});
    num.position.set(x, DIM.counterH + 0.46, 0.02);
    group.add(num);
    out.push({x: +x.toFixed(3), z: +(-D / 2 - 1.1).toFixed(3), rot: 0, fx: +x.toFixed(3), fz: +(D / 2 + 0.55).toFixed(3)});
  }
  if (screen) {
    // the queue screen stands on two posts off the counter top: nothing hangs, because the room has no ceiling
    const sw = Math.min(2.8, Math.max(1.4, len * 0.5));
    const s = screenPlate('NOW SERVING', {w: sw, h: 0.76, color: HOS.lamp, sub: 'A - 104'});
    s.position.set(0, 2.42, -0.1);
    group.add(s);
    for (const sx of [-1, 1]) {
      const px = sx * (sw / 2 - 0.12);
      const bar = mesh(rbox(0.08, 2.42 - DIM.counterH, 0.08, 0.03), M.steelDark, px, (2.42 + DIM.counterH) / 2 - 0.1, -0.1);
      group.add(bar);
    }
  }
  return {group, posts: out, len};
}

/** A nurse station: a counter island with a back worktop and a shelf unit, open toward +z. */
export function buildNurseStation({len = 4.4, color = HOS.mint} = {}) {
  const M = mats();
  const frozen = frozenKit(`nurse|${len}|${color}`, () => {
    const K = new Kit();
    const D = 0.78;
    // the counter, with returns at both ends so it reads as a station rather than a desk
    K.box(M.panel, len, DIM.counterH - 0.1, D, 0, (DIM.counterH - 0.1) / 2, 0, 0.05);
    K.box(paint(color), len + 0.03, 0.16, D + 0.02, 0, 0.36, 0, 0.05);
    K.box(M.white, len + 0.16, 0.1, D + 0.2, 0, DIM.counterH - 0.04, 0, 0.045);
    for (const s of [-1, 1]) {
      K.box(M.panel, D, DIM.counterH - 0.1, 1.5, s * (len / 2 - D / 2), (DIM.counterH - 0.1) / 2, -0.75 - D / 2, 0.05);
      K.box(M.white, D + 0.18, 0.1, 1.6, s * (len / 2 - D / 2), DIM.counterH - 0.04, -0.75 - D / 2, 0.045);
      K.box(paint(color), D + 0.02, 0.16, 1.52, s * (len / 2 - D / 2), 0.36, -0.75 - D / 2, 0.05);
    }
    K.flat(M.base, len, 0.12, D + 0.04, 0, 0.06, 0);
    // the back worktop with monitors and a shelf over it
    const bz = -1.55;
    K.box(M.panel, len - 1.2, DIM.deskH - 0.08, 0.55, 0, (DIM.deskH - 0.08) / 2, bz, 0.05);
    K.box(M.white, len - 1.1, 0.08, 0.62, 0, DIM.deskH - 0.03, bz, 0.035);
    for (const sx of [-1, 1]) {
      K.box(M.ink, 0.52, 0.34, 0.05, sx * (len * 0.18), DIM.deskH + 0.26, bz - 0.2, 0.03, 0, PI, 0);
      K.box(M.screen, 0.46, 0.28, 0.02, sx * (len * 0.18), DIM.deskH + 0.26, bz - 0.23, 0.015);
      K.cyl(M.steelDark, 0.04, 0.04, 0.22, sx * (len * 0.18), DIM.deskH + 0.06, bz - 0.2);
    }
    K.box(M.white, len - 1.2, 0.08, 0.34, 0, 1.78, bz - 0.12, 0.03);
    for (let i = 0; i < 5; i++) K.box(matte(softOf(color)), 0.2, 0.3, 0.26, -len * 0.2 + i * 0.26, 1.97, bz - 0.12, 0.03);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'nurse-station';
  const sp = signPlate('NURSE STATION', {h: 0.46, color, maxW: Math.min(len, 3.6)});
  sp.position.set(0, DIM.screenY + 0.45, 0.06);
  group.add(sp);
  const post = mesh(rbox(0.07, 1.1, 0.07, 0.02), M.steelDark, 0, DIM.screenY - 0.1, 0.06);
  group.add(post);
  return {group, len, staffPts: [{x: -len * 0.2, z: -1.0, rot: PI}, {x: len * 0.2, z: -1.0, rot: PI}]};
}

/** A waiting bay: rows of linked chairs facing +z, a queue display on a post, a bin and a planter. */
export function buildWaitingBay({w = 10, d = 7, rows = 3, perRow = 6, color = HOS.blue} = {}) {
  const M = mats();
  const seatW = 0.56;
  const frozen = frozenKit(`wait|${w}|${d}|${rows}|${perRow}|${color}`, () => {
    const K = new Kit();
    const shell = matte(softOf(color));
    const rowPitch = Math.min(1.9, (d - 1.6) / rows);
    const bankW = perRow * seatW;
    for (let r = 0; r < rows; r++) {
      const z = -d / 2 + 1.1 + r * rowPitch;
      // the beam the seats hang off, on two feet
      K.box(M.steelDark, bankW + 0.2, 0.1, 0.12, 0, 0.36, z - 0.06, 0.04);
      for (const s of [-1, 1]) {
        K.box(M.steelDark, 0.12, 0.36, 0.5, s * (bankW / 2 - 0.1), 0.18, z - 0.06, 0.04);
        K.flat(M.steel, 0.3, 0.05, 0.62, s * (bankW / 2 - 0.1), 0.03, z - 0.06);
      }
      for (let i = 0; i < perRow; i++) {
        const x = -bankW / 2 + (i + 0.5) * seatW;
        K.box(shell, seatW - 0.06, 0.09, 0.46, x, DIM.seatH, z + 0.06, 0.04);
        K.box(shell, seatW - 0.06, 0.46, 0.09, x, DIM.seatH + 0.28, z - 0.17, 0.04);
        if (i < perRow - 1) K.box(M.steel, 0.05, 0.07, 0.3, x + seatW / 2, DIM.seatH + 0.1, z + 0.08, 0.02);
      }
    }
    // a planter and a bin at the bay's edge
    K.box(M.wood, 0.8, 0.5, 0.8, w / 2 - 0.7, 0.25, -d / 2 + 0.7, 0.07);
    K.box(M.panel, 0.42, 0.72, 0.42, -w / 2 + 0.6, 0.36, -d / 2 + 0.7, 0.06);
    K.box(M.steelDark, 0.46, 0.08, 0.46, -w / 2 + 0.6, 0.75, -d / 2 + 0.7, 0.03);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'waiting-bay';
  group.add(floorSurface(w, d, HOS.floorWarm, 0.011));
  // the queue display on its post, in front of the seats and facing them
  const disp = screenPlate('QUEUE', {w: 2.2, h: 1.1, color: HOS.lamp, sub: 'A-104  ROOM 3'});
  const dz = d / 2 - 0.45;
  disp.position.set(0, 2.35, dz);
  disp.rotation.y = PI;
  group.add(disp);
  group.add(mesh(rbox(0.12, 1.85, 0.12, 0.04), M.steelDark, 0, 0.92, dz));
  group.add(mesh(rbox(0.5, 0.08, 0.5, 0.03), M.steel, 0, 0.04, dz));
  const planter = mesh(rsph(0.42, 14), mats().greenDeep, w / 2 - 0.7, 0.68, -d / 2 + 0.7);
  planter.scale.set(1, 0.8, 1);
  group.add(planter);
  const seats = [];
  const rowPitch = Math.min(1.9, (d - 1.6) / rows);
  const bankW = perRow * seatW;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < perRow; i++)
      seats.push({x: +(-bankW / 2 + (i + 0.5) * seatW).toFixed(3), z: +(-d / 2 + 1.1 + r * rowPitch + 0.06).toFixed(3), rot: 0});
  return {group, seats, w, d};
}

// ------------------------------------------------------------------------------------------------ the outside
/** The main entrance: a glazed front with parted sliding doors, a canopy on posts, bollards. Faces +z. */
export function buildEntrance({w = 9, color = HOS.blue, label = 'MAIN ENTRANCE'} = {}) {
  const M = mats();
  const doorW = 2.8;
  const frozen = frozenKit(`entr|${w}|${color}`, () => {
    const K = new Kit();
    const H = DIM.wallH;
    // the facade: solid returns, then a glazed screen with the sliding opening in the middle
    K.push(mat4(0, 0, 0, 0, 0, 0));
    wall(K, {len: w, h: H, openings: [{at: 0, w: doorW + 1.6, h: 2.45}], capColor: color, frames: false});
    K.pop();
    for (const s of [-1, 1]) {
      // the sidelights beside the opening
      K.box(M.glassClear, (doorW + 1.6) / 2 - doorW / 2 - 0.2, 2.2, 0.08, s * (doorW / 2 + 0.4 + 0.1), 1.2, 0, 0.03);
      K.box(M.steel, 0.11, 2.45, 0.2, s * (doorW / 2 + 0.78), 1.22, 0, 0.04);
    }
    // the door frame and head
    K.box(M.steel, doorW + 1.7, 0.16, 0.26, 0, 2.52, 0, 0.05);
    for (const s of [-1, 1]) K.box(M.steel, 0.12, 2.45, 0.26, s * (doorW / 2 + 0.03), 1.22, 0, 0.04);
    // the two leaves, parted
    for (const s of [-1, 1]) {
      K.box(M.glassClear, doorW / 2 - 0.4, 2.1, 0.06, s * (doorW / 2 - (doorW / 2 - 0.4) / 2 - 0.02), 1.08, 0.1, 0.02);
      K.box(M.steel, doorW / 2 - 0.36, 0.1, 0.12, s * (doorW / 2 - (doorW / 2 - 0.4) / 2 - 0.02), 2.14, 0.1, 0.04);
      K.box(M.steel, 0.09, 2.1, 0.12, s * (doorW / 2 - (doorW / 2 - 0.4) - 0.02), 1.08, 0.1, 0.03);
    }
    // the canopy on four posts
    const cz = 3.6;
    K.box(M.white, w + 1.6, 0.2, cz, 0, 3.4, cz / 2, 0.07);
    const nr = Math.max(3, Math.round((w + 1.6) / 1.2));
    for (let i = 0; i <= nr; i++) K.flat(M.panel, 0.12, 0.09, cz - 0.3, -(w + 1.6) / 2 + (i * (w + 1.6)) / nr, 3.54, cz / 2);
    K.box(paint(color), w + 1.7, 0.3, 0.24, 0, 3.26, cz - 0.02, 0.09);
    for (const s of [-1, 1]) {
      K.box(paint(color), 0.24, 0.3, cz, s * ((w + 1.7) / 2), 3.26, cz / 2, 0.09);
      K.cyl(M.steel, 0.1, 0.11, 3.3, s * (w / 2 + 0.6), 1.65, cz - 0.4);
      K.box(M.steel, 0.36, 0.08, 0.36, s * (w / 2 + 0.6), 0.04, cz - 0.4, 0.03);
    }
    // the mat and the bollards
    K.flat(M.shade, doorW + 1.2, 0.02, 1.5, 0, 0.012, 1.0);
    for (let i = 0; i < 4; i++) {
      const x = -2.4 + i * 1.6;
      K.cyl(M.steel, 0.09, 0.1, 0.95, x, 0.48, cz + 0.9);
      K.cyl(paint(color), 0.1, 0.1, 0.1, x, 0.8, cz + 0.9);
    }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'entrance';
  group.add(floorSurface(w + 1.6, 4.0, HOS.floorA, 0.009, 2.0));
  const sp = signPlate(label, {h: 0.56, color, maxW: w});
  sp.position.set(0, 3.26, 3.72);
  group.add(sp);
  return {group, w, doorPt: {x: 0, z: 0, rot: 0, w: doorW}};
}

/** A toy ambulance, 5.6 m long, nose toward +x. Returned as its own group so the world can drive it. */
export function toyAmbulance() {
  const M = mats();
  const frozen = frozenKit('ambulance', () => {
    const K = new Kit();
    const L = 5.6;
    const W = 2.1;
    // the box body and the cab
    K.box(M.white, 3.5, 1.65, W, -0.85, 1.52, 0, 0.16);
    K.box(M.white, 2.1, 1.0, W - 0.06, 1.55, 1.2, 0, 0.3);
    K.box(M.white, 1.5, 0.62, W - 0.18, 1.25, 1.95, 0, 0.22);
    K.box(M.glassClear, 0.1, 0.5, W - 0.34, 2.02, 1.95, 0, 0.05);
    for (const s of [-1, 1]) K.box(M.glassClear, 0.9, 0.44, 0.08, 1.2, 1.95, s * (W / 2 - 0.1), 0.04);
    // the rose belt line and the chequer band
    K.box(paint(HOS.rose), 5.3, 0.3, W + 0.04, -0.15, 1.1, 0, 0.08);
    for (let i = 0; i < 9; i++) K.box(paint(i % 2 ? HOS.rose : HOS.white), 0.56, 0.26, 0.06, -L / 2 + 0.3 + i * 0.6, 0.72, 0, 0.03);
    // the rear doors, the side door and the step
    K.box(M.panel, 0.1, 1.5, W - 0.26, -2.58, 1.55, 0, 0.05);
    K.flat(M.steelDark, 0.06, 1.42, 0.05, -2.64, 1.55, 0);
    for (const s of [-1, 1]) {
      K.box(M.glassClear, 0.06, 0.4, W / 2 - 0.3, -2.63, 2.05, s * (W / 4 - 0.02), 0.03);
      K.box(M.red, 0.08, 0.26, 0.34, -2.63, 0.95, s * (W / 2 - 0.3), 0.05);
      K.flat(M.steelDark, 0.05, 0.1, 0.24, -2.66, 1.5, s * 0.22);
    }
    K.box(M.panel, 0.9, 1.2, 0.08, -0.4, 1.55, W / 2 - 0.02, 0.05);
    K.flat(M.steel, 1.2, 0.08, 0.3, -2.3, 0.5, 0);
    // the light bar
    K.box(M.ink, 1.5, 0.12, W - 0.5, 1.2, 2.3, 0, 0.05);
    // wheels
    for (const sx of [1.45, -1.3])
      for (const sz of [-1, 1]) {
        K.cyl(M.tyre, 0.42, 0.42, 0.26, sx, 0.42, sz * (W / 2 - 0.1), 'z', 18);
        K.cyl(M.chrome, 0.2, 0.2, 0.3, sx, 0.42, sz * (W / 2 - 0.1), 'z', 14);
      }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'ambulance';
  // the beacons sit above the bar so they can be lit without rebuilding the body
  for (const s of [-1, 1]) {
    const b = mesh(rbox(0.42, 0.18, 0.3, 0.06), paint(s < 0 ? HOS.blue : HOS.red), 1.2 + s * 0.48, 2.42, 0);
    group.add(b);
  }
  const cross = decal('+', 0.62, {color: HOS.rose, weight: 800, pad: 0.02});
  cross.position.set(-0.9, 1.72, 1.06);
  group.add(cross);
  for (const s of [-1, 1]) {
    const t = decal('AMBULANCE', 0.28, {color: HOS.rose, pad: 0.04});
    t.position.set(0.0, 1.72, s * 1.06);
    t.rotation.y = s > 0 ? 0 : PI;
    const k = Math.min(1, 2.6 / t.userData.w);
    t.scale.setScalar(k);
    group.add(t);
  }
  return group;
}

/** The ER ambulance bay: a canopy over a drive-up apron, hatched ground, and an ambulance parked under it. */
export function buildAmbulanceBay({w = 7} = {}) {
  const M = mats();
  const d = 7.6;
  const frozen = frozenKit(`abay|${w}`, () => {
    const K = new Kit();
    const H = 3.9;
    // a ribbed canopy deck, deep enough for one ambulance and no deeper
    K.box(M.white, w + 1.0, 0.2, d, 0, H, 0, 0.07);
    const nr = Math.max(3, Math.round((w + 1.0) / 1.15));
    for (let i = 0; i <= nr; i++) K.flat(M.panel, 0.14, 0.1, d - 0.3, -(w + 1.0) / 2 + (i * (w + 1.0)) / nr, H + 0.14, 0);
    for (const sz of [-1, 1]) K.box(paint(HOS.rose), w + 1.1, 0.34, 0.26, 0, H - 0.26, sz * (d / 2 - 0.02), 0.1);
    for (const sx of [-1, 1]) {
      K.box(paint(HOS.rose), 0.26, 0.34, d, sx * ((w + 1.1) / 2), H - 0.26, 0, 0.1);
      for (const sz of [-1, 1]) {
        K.cyl(M.steel, 0.12, 0.14, H - 0.1, sx * (w / 2 + 0.2), (H - 0.1) / 2, sz * (d / 2 - 0.7));
        K.box(M.steel, 0.44, 0.1, 0.44, sx * (w / 2 + 0.2), 0.05, sz * (d / 2 - 0.7), 0.04);
        K.cyl(paint(HOS.rose), 0.15, 0.15, 0.3, sx * (w / 2 + 0.2), 0.55, sz * (d / 2 - 0.7));
      }
    }
    // the hatched apron and a kerb ramp at the doors end
    for (let i = 0; i < 9; i++) K.flat(M.bay, 0.12, 0.02, d - 1.6, -w / 2 + 0.5 + i * ((w - 1) / 8), 0.015, 0);
    K.box(M.base, w + 1.0, 0.12, 0.6, 0, 0.06, -d / 2 - 0.3, 0.04);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'ambulance-bay';
  group.add(floorSurface(w + 1.0, d, HOS.road, 0.008));
  const sp = signPlate('EMERGENCY', {h: 0.62, color: HOS.rose, maxW: w});
  sp.position.set(0, 3.64, d / 2 + 0.16);
  group.add(sp);
  const sp2 = signPlate('AMBULANCE ONLY', {h: 0.44, color: HOS.rose, maxW: w});
  sp2.position.set(0, 3.64, -d / 2 - 0.16);
  sp2.rotation.y = PI;
  group.add(sp2);
  const ambulance = toyAmbulance();
  ambulance.position.set(0, 0, 0.2);
  ambulance.rotation.y = -PI / 2;
  group.add(ambulance);
  return {group, ambulance, w: w + 1.1, d};
}

// ------------------------------------------------------------------------------------------------ wards
/** A shelf unit along x: 2.05 tall, 0.50 deep, open bays with a few boxes on them. */
function shelfUnit(K, {len, bays = 4, x = 0, z = 0, stock = true}) {
  const M = mats();
  const H = DIM.shelfH;
  const D = DIM.shelfD;
  K.box(M.panel, len, 0.08, D, x, 0.12, z, 0.03);
  for (let i = 1; i <= bays; i++) K.box(M.panel, len, 0.06, D, x, (H * i) / bays, z, 0.025);
  for (const s of [-1, 1]) K.box(M.steelDark, 0.07, H, D, x + s * (len / 2 - 0.035), H / 2, z, 0.03);
  K.box(M.steelDark, len, 0.06, 0.08, x, H + 0.03, z, 0.025);
  if (stock) {
    for (let i = 0; i < bays; i++) {
      const y = (H * i) / bays + 0.1;
      const n = 2 + ((i * 3) % 3);
      for (let k = 0; k < n; k++) {
        const bw = (len - 0.3) / (n + 0.4);
        K.box(k % 2 ? M.cardboard : M.panel, bw * 0.9, 0.3, D - 0.14, x - len / 2 + 0.15 + (k + 0.5) * bw, y + 0.15, z, 0.03);
      }
    }
  }
}

/** An open ward bay: bed positions along both long walls, curtain rails, a nurse station at one end. */
export function buildWardBay({beds = 6, w = 20, d = 9, name = 'WARD', color = HOS.violet} = {}) {
  const M = mats();
  const stationW = 4.4;
  const usable = w - stationW - 2.0;
  const perSide = [Math.ceil(beds / 2), Math.floor(beds / 2)];
  const bedZ = d / 2 - DIM.wallT - 0.25 - 1.03;
  const slots = (count) => {
    const pitch = count ? usable / count : 0;
    return Array.from({length: count}, (_, i) => -w / 2 + 1.0 + (i + 0.5) * pitch);
  };
  const xsA = slots(perSide[0]);
  const xsB = slots(perSide[1]);
  const frozen = frozenKit(`ward|${beds}|${w}|${d}|${color}`, () => {
    const K = new Kit();
    // the shell: long walls solid, both ends with a wide bed door
    K.push(mat4(0, 0, d / 2 - DIM.wallT / 2, 0, 0, 0));
    wall(K, {len: w, h: DIM.wallH, openings: [], capColor: color});
    K.pop();
    K.push(mat4(0, 0, -(d / 2 - DIM.wallT / 2), 0, PI, 0));
    wall(K, {len: w, h: DIM.wallH, openings: [], capColor: color});
    K.pop();
    for (const s of [-1, 1]) {
      K.push(mat4(s * (w / 2 - DIM.wallT / 2), 0, 0, 0, (s * PI) / 2, 0));
      wall(K, {len: d - DIM.wallT * 2, h: DIM.wallH, openings: [{at: 0, w: 2.4, h: 2.3}], capColor: color, glassFrom: DIM.glassSill});
      K.pop();
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        K.box(M.wall, DIM.wallT + 0.12, DIM.wallH, DIM.wallT + 0.12, sx * (w / 2 - DIM.wallT / 2), DIM.wallH / 2, sz * (d / 2 - DIM.wallT / 2), 0.05);
    // the bed bays: a headwall panel, a service rail and a curtain track per bed
    const bay = (x, sz) => {
      const wallZ = sz * (d / 2 - DIM.wallT - 0.02);
      K.box(matte(softOf(color)), 1.1, 1.35, 0.06, x, 0.95, wallZ - sz * 0.03, 0.04);
      K.box(M.white, 1.3, 0.14, 0.14, x, 1.68, wallZ - sz * 0.08, 0.05);
      K.flat(M.steel, 1.0, 0.06, 0.06, x, 1.4, wallZ - sz * 0.1);
      // the curtain track: out from the headwall and around the foot of the bed
      K.flat(M.steel, 0.045, 0.045, 2.5, x - 1.15, 2.22, wallZ - sz * 1.3);
      K.flat(M.steel, 0.045, 0.045, 2.5, x + 1.15, 2.22, wallZ - sz * 1.3);
      K.flat(M.steel, 2.3, 0.045, 0.045, x, 2.22, wallZ - sz * 2.5);
      for (const t of [-1, 1]) K.flat(M.steel, 0.05, 0.14, 0.05, x + t * 1.15, 2.33, wallZ - sz * 0.15);
    };
    xsA.forEach((x) => bay(x, 1));
    xsB.forEach((x) => bay(x, -1));
    // the station against the -z wall at the +x end, facing into the bay (the end doors stay clear for a bed)
    const sx0 = w / 2 - 1.1 - stationW / 2;
    const sz0 = -(d / 2 - DIM.wallT - 0.45);
    K.box(M.panel, stationW, DIM.counterH - 0.1, 0.78, sx0, (DIM.counterH - 0.1) / 2, sz0 + 0.6, 0.05);
    K.box(paint(color), stationW + 0.03, 0.16, 0.8, sx0, 0.36, sz0 + 0.6, 0.05);
    K.box(M.white, stationW + 0.16, 0.1, 0.96, sx0, DIM.counterH - 0.04, sz0 + 0.6, 0.045);
    K.flat(M.base, stationW, 0.12, 0.82, sx0, 0.06, sz0 + 0.6);
    K.box(M.panel, stationW - 0.8, DIM.deskH - 0.08, 0.5, sx0, (DIM.deskH - 0.08) / 2, sz0 - 0.05, 0.05);
    K.box(M.white, stationW - 0.7, 0.08, 0.58, sx0, DIM.deskH - 0.03, sz0 - 0.05, 0.035);
    for (const sx of [-1, 1]) {
      K.box(M.ink, 0.5, 0.33, 0.05, sx0 + sx * 1.1, DIM.deskH + 0.25, sz0 - 0.24, 0.03);
      K.box(M.screen, 0.44, 0.27, 0.02, sx0 + sx * 1.1, DIM.deskH + 0.25, sz0 - 0.21, 0.015);
      K.cyl(M.steelDark, 0.04, 0.04, 0.22, sx0 + sx * 1.1, DIM.deskH + 0.05, sz0 - 0.24);
    }
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = `ward-${name}`;
  group.add(floorSurface(w - DIM.wallT * 2, d - DIM.wallT * 2, HOS.floorWarm, 0.012));
  const bedPts = [];
  const addCurtain = (x, sz, k, side) => {
    // a half-drawn curtain on the track: a panel down one side of the bed, with a return across the foot when it is right round
    const wallZ = sz * (d / 2 - DIM.wallT - 0.02);
    const L = 1.4 + 0.9 * k;
    group.add(mesh(rbox(0.07, 1.82, L, 0.035), mats().curtain, x + side * 1.15, 1.27, wallZ - sz * (0.25 + L / 2)));
    if (k > 0.72) group.add(mesh(rbox(1.15, 1.82, 0.07, 0.035), mats().curtain, x + side * 0.57, 1.27, wallZ - sz * 2.47));
  };
  const place = (xs, sz) =>
    xs.forEach((x, i) => {
      bedPts.push({x: +x.toFixed(3), z: +(sz * bedZ).toFixed(3), rot: sz > 0 ? 0 : PI, bay: bedPts.length + 1});
      const num = signPlate(String(bedPts.length), {h: 0.3, color, maxW: 0.6});
      num.position.set(x, 1.95, sz * (d / 2 - DIM.wallT - 0.06));
      num.rotation.y = sz > 0 ? PI : 0;
      group.add(num);
      addCurtain(x, sz, 0.45 + 0.45 * ((i % 3) / 2), i % 2 ? -1 : 1);
    });
  place(xsA, 1);
  place(xsB, -1);
  const sp = signPlate(name.toUpperCase(), {h: 0.52, color, maxW: 4.2});
  sp.position.set(-w / 2 - 0.055, DIM.wallH - 0.42, 0);
  sp.rotation.y = -PI / 2;
  group.add(sp);
  const doorPts = [
    {x: -w / 2, z: 0, rot: -PI / 2, side: 'w', w: 2.4},
    {x: w / 2, z: 0, rot: PI / 2, side: 'e', w: 2.4},
  ];
  return {group, bedPts, doorPts, w, d};
}

/** Toilets: a shell with one door, WC cubicles along the back and a basin counter with a mirror band. */
export function buildToilet({w = 4.4, d = 3.2} = {}) {
  const M = mats();
  const color = HOS.teal;
  const shell = buildRoomShell({w, d, name: 'TOILETS', color, doors: [{side: 's', at: -w / 2 + 1.2}], glassTop: false});
  const frozen = frozenKit(`wc|${w}|${d}`, () => {
    const K = new Kit();
    const cw = 1.1;
    const n = Math.max(1, Math.floor((w - 1.9) / cw));
    const x0 = w / 2 - DIM.wallT - n * cw;
    for (let i = 0; i <= n; i++) {
      // the cubicle divider, from the back wall forward
      K.box(M.panel, 0.07, 2.0, 1.35, x0 + i * cw, 1.02, -d / 2 + 0.75, 0.03);
      K.box(M.steel, 0.09, 0.07, 1.4, x0 + i * cw, 2.03, -d / 2 + 0.75, 0.03);
    }
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * cw;
      // the pan and the cistern against the back wall
      K.box(M.white, 0.4, 0.42, 0.56, cx, 0.21, -d / 2 + 0.6, 0.12);
      K.box(M.white, 0.46, 0.08, 0.5, cx, 0.44, -d / 2 + 0.62, 0.04);
      K.box(M.white, 0.5, 0.65, 0.22, cx, 0.65, -d / 2 + 0.33, 0.06);
      K.box(M.panel, 0.95, 1.95, 0.06, cx, 0.98, -d / 2 + 1.4, 0.03);
    }
    // the basin counter along the -x wall
    const bw = Math.min(1.9, x0 - (-w / 2 + DIM.wallT) - 0.1);
    if (bw > 0.8) {
      const bx = -w / 2 + DIM.wallT + bw / 2;
      K.box(M.white, bw, 0.14, 0.52, bx, 0.86, -d / 2 + 0.5, 0.04);
      K.box(M.panel, bw - 0.1, 0.72, 0.46, bx, 0.43, -d / 2 + 0.5, 0.04);
      const nb = Math.max(1, Math.round(bw / 0.9));
      for (let i = 0; i < nb; i++) {
        const sx = bx - bw / 2 + ((i + 0.5) * bw) / nb;
        K.cyl(M.white, 0.19, 0.14, 0.12, sx, 0.95, -d / 2 + 0.48, 'y', 16);
        K.cyl(M.chrome, 0.022, 0.022, 0.22, sx, 1.03, -d / 2 + 0.26);
        K.flat(M.chrome, 0.04, 0.04, 0.14, sx, 1.13, -d / 2 + 0.33);
      }
      K.box(M.glassClear, bw - 0.2, 0.8, 0.04, bx, 1.65, -d / 2 + 0.26, 0.02);
      K.box(M.steel, bw - 0.1, 0.06, 0.08, bx, 2.08, -d / 2 + 0.26, 0.02);
    }
    return K.freeze();
  });
  thaw(frozen, shell.group);
  shell.group.name = 'toilet';
  return {group: shell.group, doorPts: shell.doorPts, w, d};
}

/** A store room: a shell with one wide door and shelf units along the back and side walls. */
export function buildStoreRoom({w = 5, d = 4} = {}) {
  const M = mats();
  const color = HOS.olive;
  const shell = buildRoomShell({w, d, name: 'STORE', color, doors: [{side: 's', at: 0, w: 1.6}]});
  const frozen = frozenKit(`store|${w}|${d}`, () => {
    const K = new Kit();
    shelfUnit(K, {len: w - 1.0, x: 0, z: -d / 2 + 0.45, bays: 4});
    for (const s of [-1, 1]) {
      K.push(mat4(s * (w / 2 - 0.45), 0, 0.3, 0, (s * PI) / 2, 0));
      shelfUnit(K, {len: Math.max(1.2, d - 1.6), x: 0, z: 0, bays: 4});
      K.pop();
    }
    // a stack of boxes and a linen bag on the floor
    K.box(M.cardboard, 0.6, 0.45, 0.55, 0.2, 0.23, d / 2 - 1.1, 0.05);
    K.box(M.cardboard, 0.55, 0.4, 0.5, 0.25, 0.65, d / 2 - 1.12, 0.05);
    K.box(M.linen, 0.7, 0.7, 0.6, -w / 2 + 1.2, 0.35, d / 2 - 1.0, 0.18);
    return K.freeze();
  });
  thaw(frozen, shell.group);
  shell.group.name = 'store-room';
  return {group: shell.group, doorPts: shell.doorPts, w, d};
}

// ------------------------------------------------------------------------------------------------ the lot
function toyCar(color) {
  const M = mats();
  const frozen = frozenKit(`car|${color}`, () => {
    const K = new Kit();
    const L = 4.3;
    const W = 1.85;
    K.box(paint(color), L, 0.8, W, 0, 0.76, 0, 0.2);
    K.box(paint(color), L - 1.8, 0.56, W - 0.2, -0.14, 1.36, 0, 0.18);
    K.box(M.glassClear, L - 2.0, 0.38, W - 0.12, -0.14, 1.4, 0, 0.1);
    K.flat(M.shade, L - 0.2, 0.05, W + 0.02, 0, 1.08, 0);
    K.flat(M.ink, L - 0.3, 0.1, W - 0.2, 0, 0.4, 0);
    for (const sx of [1.28, -1.3])
      for (const sz of [-1, 1]) {
        K.cyl(M.tyre, 0.33, 0.33, 0.2, sx, 0.33, sz * (W / 2 - 0.06), 'z', 16);
        K.cyl(M.chrome, 0.15, 0.15, 0.23, sx, 0.33, sz * (W / 2 - 0.06), 'z', 12);
      }
    for (const sz of [-1, 1]) {
      K.box(M.lamp, 0.1, 0.16, 0.34, L / 2 - 0.04, 0.85, sz * (W / 2 - 0.34), 0.05);
      K.box(M.red, 0.1, 0.16, 0.3, -L / 2 + 0.04, 0.85, sz * (W / 2 - 0.34), 0.05);
    }
    return K.freeze();
  });
  const g = thaw(frozen);
  g.name = 'car';
  return g;
}

/** A car park: marked bays in rows with an aisle behind each, and a few toy cars in them. */
export function buildCarPark({cols = 8, rows = 2, cars = null} = {}) {
  const M = mats();
  const BW = 2.5;
  const BD = 5.0;
  const AISLE = 6.0;
  const w = cols * BW + 1.2;
  const d = rows * (BD + AISLE);
  const frozen = frozenKit(`park|${cols}|${rows}`, () => {
    const K = new Kit();
    for (let r = 0; r < rows; r++) {
      const z0 = -d / 2 + r * (BD + AISLE);
      for (let i = 0; i <= cols; i++) {
        K.flat(M.bay, 0.1, 0.02, BD - 0.2, -w / 2 + 0.6 + i * BW, 0.016, z0 + BD / 2);
      }
      K.flat(M.bay, w - 1.2, 0.02, 0.1, 0, 0.016, z0 + 0.08);
      K.flat(M.lane, w - 0.6, 0.02, 0.12, 0, 0.016, z0 + BD + AISLE / 2);
    }
    return K.freeze();
  });
  const group = new THREE.Group();
  group.name = 'car-park';
  group.add(floorSurface(w, d, HOS.road, 0.006));
  thaw(frozen, group);
  const bays = [];
  const palette = [HOS.white, HOS.blueLight, HOS.steel, HOS.amberLight, HOS.mintLight, HOS.panel, HOS.roseLight];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const nCars = cars ?? Math.round(cols * rows * 0.5);
  const all = [];
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < cols; i++) {
      const x = -w / 2 + 0.6 + (i + 0.5) * BW;
      const z = -d / 2 + r * (BD + AISLE) + BD / 2;
      bays.push({x: +x.toFixed(3), z: +z.toFixed(3), rot: 0});
      all.push({x, z});
    }
  for (let k = 0; k < Math.min(nCars, all.length); k++) {
    const i = Math.floor(rnd() * all.length);
    const b = all.splice(i, 1)[0];
    const c = toyCar(palette[Math.floor(rnd() * palette.length)]);
    c.position.set(b.x, 0, b.z);
    c.rotation.y = PI / 2 + (rnd() < 0.5 ? PI : 0);
    group.add(c);
  }
  const sp = signPlate('PARKING', {h: 0.5, color: HOS.blue, maxW: 3.0});
  sp.position.set(-w / 2 + 1.6, 2.1, -d / 2 - 0.1);
  group.add(sp);
  group.add(mesh(rbox(0.1, 2.1, 0.1, 0.04), M.steelDark, -w / 2 + 1.6, 1.05, -d / 2 - 0.1));
  return {group, bays, w, d};
}

/**
 * The landscape pieces are returned "dual": the Group itself, carrying a `group` property that points back at it,
 * so both `scene.add(buildTree())` and `scene.add(buildTree().group)` are correct.
 */
function dual(group, extra = {}) {
  Object.assign(group, extra);
  group.group = group;
  return group;
}

/** A tree or a bush. kind 'tree' | 'bush' | 'palm'. */
export function buildTree({size = 1, kind = 'tree'} = {}) {
  const M = mats();
  const frozen = frozenKit(`tree|${kind}`, () => {
    const K = new Kit();
    if (kind === 'bush') {
      K.sph(M.greenDeep, 0.9, 0, 0.55, 0, 16);
      K.sph(M.green, 0.6, 0.45, 0.45, 0.25, 14);
    } else if (kind === 'palm') {
      K.cyl(M.trunk, 0.14, 0.2, 3.6, 0, 1.8, 0, 'y', 10);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2;
        K.box(M.green, 1.9, 0.08, 0.5, Math.sin(a) * 0.85, 3.6, Math.cos(a) * 0.85, 0.04, 0, -a + PI / 2, -0.3);
      }
      K.sph(M.greenDeep, 0.22, 0, 3.62, 0, 12);
    } else {
      K.cyl(M.trunk, 0.17, 0.24, 2.6, 0, 1.3, 0, 'y', 10);
      K.sph(M.green, 1.25, 0, 3.1, 0, 18);
      K.sph(M.greenDeep, 0.85, 0.55, 2.55, 0.35, 14);
      K.sph(M.green, 0.7, -0.5, 2.7, -0.45, 14);
    }
    return K.freeze();
  });
  const g = thaw(frozen);
  g.name = kind;
  g.scale.setScalar(size);
  return dual(g, {kind, size});
}

/** A hedge along x, in a planting bed. */
export function buildHedge({len = 8, h = 0.9} = {}) {
  const M = mats();
  const frozen = frozenKit(`hedge|${len}|${h}`, () => {
    const K = new Kit();
    K.box(M.groundDeep, len + 0.4, 0.14, 1.1, 0, 0.07, 0, 0.05);
    K.box(M.base, len + 0.5, 0.2, 1.2, 0, 0.1, 0, 0.06);
    K.box(M.greenDeep, len, h, 0.8, 0, 0.12 + h / 2, 0, 0.28);
    const n = Math.max(2, Math.round(len / 0.75));
    for (let i = 0; i < n; i++) K.sph(M.green, 0.26, -len / 2 + ((i + 0.5) * len) / n, 0.06 + h, (i % 2 ? 0.08 : -0.08), 12);
    return K.freeze();
  });
  const g = thaw(frozen);
  g.name = 'hedge';
  return dual(g, {len});
}

/** A boundary fence along x, 2.0 m, posts every 2.5 m. */
export function buildFence({len = 20, h = 2.0} = {}) {
  const M = mats();
  const n = Math.max(1, Math.round(len / 2.5));
  const frozen = frozenKit(`fence|${len}|${h}|${n}`, () => {
    const K = new Kit();
    for (let i = 0; i <= n; i++) {
      const x = -len / 2 + (i * len) / n;
      K.box(M.steelDark, 0.12, h + 0.1, 0.12, x, (h + 0.1) / 2, 0, 0.04);
      K.box(M.base, 0.26, 0.14, 0.26, x, 0.07, 0, 0.04);
    }
    K.flat(M.steel, len, 0.09, 0.09, 0, h - 0.05, 0);
    K.flat(M.steel, len, 0.09, 0.09, 0, 0.3, 0);
    for (let i = 0; i < n; i++)
      K.box(M.glassClear, len / n - 0.18, h - 0.52, 0.04, -len / 2 + ((i + 0.5) * len) / n, 0.36 + (h - 0.52) / 2, 0, 0.02);
    return K.freeze();
  });
  const g = thaw(frozen);
  g.name = 'fence';
  return dual(g, {len});
}

/** A neighbouring city block, for the skyline beyond the hospital's fence. */
export function buildCityBlock({w = 18, d = 14, h = 14} = {}) {
  const M = mats();
  const floors = Math.max(1, Math.round((h - 1.0) / 3.3));
  const frozen = frozenKit(`city|${w}|${d}|${h}`, () => {
    const K = new Kit();
    K.box(M.white, w, h, d, 0, h / 2, 0, 0.4);
    K.box(M.panel, w - 1.2, 0.4, d - 1.2, 0, h + 0.18, 0, 0.14);
    K.box(M.base, w + 0.3, 0.3, d + 0.3, 0, 0.15, 0, 0.1);
    K.box(M.panel, 2.6, 0.5, 1.8, w * 0.15, h + 0.6, -d * 0.2, 0.14);
    K.box(paint(HOS.blueLight), 3.2, 2.5, 0.3, -w * 0.2, 1.3, d / 2, 0.1);
    return K.freeze();
  });
  const group = thaw(frozen);
  group.name = 'city-block';
  const ms = [];
  const faces = [
    [w, d / 2, 0],
    [w, -d / 2, PI],
    [d, w / 2, PI / 2],
    [d, -w / 2, -PI / 2],
  ];
  let seed = Math.round(w * 31 + d * 7 + h);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (const [len, off, ry] of faces) {
    const nb = Math.max(1, Math.floor((len - 2.0) / 2.3));
    const sx = (len - 2.0) / nb;
    for (let f = 0; f < floors; f++)
      for (let b = 0; b < nb; b++) {
        if (rnd() < 0.06) continue;
        const u = -len / 2 + 1.0 + sx * (b + 0.5);
        const y = 1.1 + f * 3.3 + 1.5;
        if (y > h - 0.8) continue;
        ms.push(new THREE.Matrix4().makeRotationY(ry).multiply(mat4(u, y, Math.abs(off) + 0.02)));
      }
  }
  const im = new THREE.InstancedMesh(rbox(1.3, 1.5, 0.12, 0.05), hosMat(HOS.glassClear, {rough: 0.3}), ms.length);
  ms.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = false;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  group.add(im);
  return dual(group, {w, d, h});
}
