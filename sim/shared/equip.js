// The toy hospital's medical equipment. Colours and materials come from ./style.js (HOS, hosMat); nothing in here
// declares a colour of its own.
//
// Real metres, y up, origin on the floor at the model's own centre. A machine's front (its screen, its door, the side
// you walk up to) faces +z. Beds, trolleys and scanner tables run along z with the HEAD END AT -z, so a bed pushed
// against a -z wall has its headboard on the wall.
//
// Every builder returns {group, ...}. Anything that moves is a setter taking an argument; no builder ever reads a
// clock, so the page's render(t) stays a pure function of time. Options named in the signature are the setter's
// initial value: buildCentrifuge({spin: 2}) is buildCentrifuge().setSpin(2).
//
// Static parts are merged per material and cached per variant (a second copy of a bed costs only draw calls); moving
// parts are separate meshes on shared geometry. Screens are canvas textures; the vital-sign trace is cached as 24
// phase variants shared by every monitor in the world.
//
//   Front office  buildRegDesk({len, color})            -> {group, setOn(b), topY}
//                 buildCashierCounter({len, cardReader})-> {group, setOn(b)}
//                 buildFileShelf({bays})                -> {group, w}
//                 buildPrinter()                        -> {group, setPaper(k)}
//                 buildQueueKiosk({number})             -> {group, setOn(b)}
//                 buildWaitingChairRow({n, color})      -> {group, seats:[{x,z,rot}], w}
//                 buildWaterCooler() / buildSanitiser() -> {group}
//                 buildBin({kind})                      -> {group}   kind: general|clinical|sharps|recycle
//   Clinic        buildExamBed({head})                  -> {group, setHead(k), deck}
//                 buildExamDesk()                       -> {group, setOn(b)}
//                 buildDoctorChair({color})             -> {group, setSwivel(a)}
//                 buildPatientStool()                   -> {group, setSwivel(a)}
//                 buildCurtain({len, open, h, color})   -> {group, setOpen(k)}
//                 buildBPMonitor()                      -> {group, setOn(b)}
//                 buildWeighScale({heightRod})          -> {group, setRod(h)}
//                 buildThermometerStand()               -> {group}
//                 buildWallChart({title})               -> {group}
//                 buildOtoscopeSet()                    -> {group}
//   Lab           buildLabBench({len, sink})            -> {group, topY, len}
//                 buildAnalyser({lights})               -> {group, setLights(k), setOn(b)}
//                 buildCentrifuge({spin})               -> {group, setSpin(a), setLid(k)}
//                 buildMicroscope()                     -> {group}
//                 buildPhlebotomyChair()                -> {group, setArm(k)}
//                 buildSpecimenHatch({hatch})           -> {group, setHatch(k)}
//                 buildTubeRack()                       -> {group}
//                 buildFridge({door})                   -> {group, setDoor(k)}
//   Imaging       buildXrayTable({tube})                -> {group, setTube(z), deck}
//                 buildXrayBooth()                      -> {group, setOn(b)}
//                 buildCTScanner({bed, ring})           -> {group, setBed(k), setRing(a), setOn(b), bore}
//                 buildUltrasound()                     -> {group, setOn(b)}
//                 buildEKGCart()                        -> {group, setOn(b)}
//                 buildLeadApronRack()                  -> {group}
//                 buildViewingStation({screens})        -> {group, setOn(b)}
//   Pharmacy      buildPharmShelf({bays})               -> {group, w}
//                 buildDispenseCounter({windows})       -> {group, setOn(b)}
//                 buildPackingTable()                   -> {group}
//                 buildPillTrolley()                    -> {group, setRoll(d)}
//   Emergency     buildERBed({rails, head})             -> {group, setHead(k), setRails(k), setRoll(d), deck}
//                 buildVitalMonitor({on, beat})         -> {group, setOn(b), setBeat(phase)}
//                 buildIVPole({bags, drip})             -> {group, setDrip(k), hook}
//                 buildCrashCart()                      -> {group, setRoll(d)}
//                 buildDefibrillator({on, charge})      -> {group, setOn(b), setCharge(k)}
//                 buildVentilator({on, bellows})        -> {group, setOn(b), setBellows(k)}
//                 buildOxygenPanel()                    -> {group}
//                 buildSuctionUnit({level})             -> {group, setLevel(k)}
//   Surgery       buildORTable({tilt, back})            -> {group, setTilt(a), setBack(k), deck}
//                 buildORLamp({aim, on})                -> {group, setAim(yaw, pitch), setOn(b)}
//                 buildAnaesthesiaMachine({on, bellows})-> {group, setOn(b), setBellows(k)}
//                 buildInstrumentTable()                -> {group, setRoll(d)}
//                 buildScrubSink({taps, flow})          -> {group, setFlow(k)}
//                 buildSurgicalScreen({fold})           -> {group, setFold(k)}
//                 buildElectrosurgery({on})             -> {group, setOn(b)}
//                 buildPACUBed({head, rails})           -> {group, setHead(k), setRails(k), setRoll(d), monitor}
//                 buildICUBed({head, rails, knee})      -> {group, setHead(k), setKnee(k), setRails(k), setRoll(d)}
//   Ward          buildWardBed({head, color})           -> {group, setHead(k), setRails(k), setRoll(d), deck}
//                 buildBedsideCabinet()                 -> {group}
//                 buildOverbedTable({height})           -> {group, setHeight(h)}
//                 buildInfusionPump({on})               -> {group, setOn(b)}   (origin at its pole clamp)
//                 buildChartBoard({title})              -> {group}
//   Dental        buildDentalChair({light, tray, recline}) -> {group, setLight(k), setTray(a), setRecline(k)}
//                 buildDentalXray({aim})                -> {group, setAim(a)}
//                 buildSteriliser({door})               -> {group, setDoor(k), setOn(b)}
//   Physio        buildPTTable({head})                  -> {group, setHead(k)}
//                 buildParallelBars({len})              -> {group}
//                 buildExerciseBike({crank})            -> {group, setCrank(a)}
//                 buildTreadmill({belt})                -> {group, setBelt(d), setOn(b)}
//                 buildUltrasoundTherapy({on})          -> {group, setOn(b)}
//                 buildMatSet()                         -> {group}
//   Transport     buildWheelchair({roll, occupied})     -> {group, setRoll(d)}
//                 buildStretcher({roll, head})          -> {group, setRoll(d), setHead(k), deck}
//                 buildPorterTrolley()                  -> {group, setRoll(d)}
//                 buildLinenCart()                      -> {group, setRoll(d)}
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {HOS, hosMat, rbox} from './style.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ================================================================ materials
const paint = (color, rough = 0.5) => hosMat(color, {paint: true, rough});
const glow = (color, emissive, k, rough = 0.3) =>
  new THREE.MeshStandardMaterial({color, roughness: rough, emissive: new THREE.Color(emissive), emissiveIntensity: k});
let MM = null;
function mats() {
  if (MM) return MM;
  MM = {
    white: paint(HOS.white),
    wall: paint(HOS.wall),
    panel: paint(HOS.panel),
    shade: hosMat(HOS.shade, {rough: 0.6}),
    ink: hosMat(HOS.ink, {rough: 0.6}),
    inkSoft: hosMat(HOS.inkSoft, {rough: 0.55}),
    steel: hosMat(HOS.steel, {rough: 0.4, metal: 0.35}),
    steelDark: hosMat(HOS.steelDark, {rough: 0.45, metal: 0.3}),
    chrome: hosMat(HOS.chrome, {rough: 0.2, metal: 0.65}),
    rubber: hosMat('#2a3142', {rough: 0.85}),
    linen: hosMat(HOS.linen, {rough: 0.84}),
    pillow: hosMat(HOS.pillow, {rough: 0.88}),
    screenOff: hosMat(HOS.screen, {rough: 0.2}),
    blue: paint(HOS.blue),
    blueDeep: paint(HOS.blueDeep),
    blueLight: paint(HOS.blueLight),
    mint: paint(HOS.mint),
    mintDeep: paint(HOS.mintDeep),
    mintLight: paint(HOS.mintLight),
    violet: paint(HOS.violet),
    violetLight: paint(HOS.violetLight),
    olive: paint(HOS.olive),
    oliveLight: paint(HOS.oliveLight),
    amber: paint(HOS.amber),
    amberLight: paint(HOS.amberLight),
    rose: paint(HOS.rose),
    roseLight: paint(HOS.roseLight),
    teal: paint(HOS.teal),
    tealLight: paint(HOS.tealLight),
    green: paint(HOS.green),
    red: paint(HOS.red),
    wood: hosMat(HOS.wood, {rough: 0.7}),
    cardboard: hosMat(HOS.cardboard, {rough: 0.8}),
    curtain: hosMat(HOS.curtain, {rough: 0.85}),
    glass: hosMat(HOS.glassClear, {paint: true, rough: 0.1, opacity: 0.4}),
    fluid: hosMat(HOS.mintLight, {rough: 0.25, opacity: 0.75}),
    fluidRed: hosMat(HOS.roseLight, {rough: 0.25, opacity: 0.8}),
    water: hosMat(HOS.glassClear, {rough: 0.15, opacity: 0.45}),
    lamp: glow(HOS.lamp, '#fff0c8', 0.55),
    lampOff: hosMat(HOS.panel, {rough: 0.35}),
    beam: new THREE.MeshBasicMaterial({color: HOS.lamp, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide}),
    ledOff: hosMat(HOS.steelDark, {rough: 0.4}),
    ledGreen: glow('#b6f7cf', HOS.green, 1.3),
    ledRed: glow('#ffc2c4', HOS.red, 1.3),
    ledAmber: glow('#ffe6b8', HOS.amber, 1.2),
    ledBlue: glow('#bfe4f7', HOS.screenOn, 1.2),
  };
  return MM;
}

// ================================================================ geometry kit
const GEO = new Map();
const cg = (key, make) => {
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = make()));
  return g;
};
/** a rounded box; r defaults to a generous 20% of the smallest side (the toy look lives in the bevels) */
function rb(w, h, d, r) {
  w = Math.max(0.004, w);
  h = Math.max(0.004, h);
  d = Math.max(0.004, d);
  r = r ?? Math.min(w, h, d) * 0.2;
  r = Math.min(r, Math.min(w, h, d) / 2 - 1e-3);
  if (r < 0.004) return cg(`b|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
  return rbox(w, h, d, r, 3);
}
const cylG = (r0, r1, h, seg = 16) => cg(`cy|${r0}|${r1}|${h}|${seg}`, () => new THREE.CylinderGeometry(r0, r1, h, seg));
const tubeG = (r0, r1, h, seg = 16) => cg(`tu|${r0}|${r1}|${h}|${seg}`, () => new THREE.CylinderGeometry(r0, r1, h, seg, 1, true));
const sphG = (r) => cg(`sp|${r}`, () => new THREE.SphereGeometry(r, 16, 11));
const domeG = (r) => cg(`dm|${r}`, () => new THREE.SphereGeometry(r, 20, 8, 0, PI * 2, 0, PI / 2));
const torusG = (r, t, seg = 28) => cg(`to|${r}|${t}|${seg}`, () => new THREE.TorusGeometry(r, t, 9, seg));
const planeG = (w, h) => cg(`pl|${w.toFixed(3)}|${h.toFixed(3)}`, () => new THREE.PlaneGeometry(w, h));
const discG = (r, seg = 28) => cg(`di|${r}|${seg}`, () => new THREE.CircleGeometry(r, seg));

/** a plate with a round hole through it, extruded along z (a CT gantry cover, a hatch frame) */
function holedPlate(key, w, h, hole, depth, r = 0.12, bev = 0.05) {
  return cg(`hp|${key}`, () => {
    const s = new THREE.Shape();
    const hw = w / 2 - r;
    const hh = h / 2 - r;
    s.moveTo(-hw - r, -hh);
    s.lineTo(-hw - r, hh);
    s.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
    s.lineTo(hw, hh + r);
    s.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
    s.lineTo(hw + r, -hh);
    s.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
    s.lineTo(-hw, -hh - r);
    s.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);
    const p = new THREE.Path();
    p.absarc(0, 0, hole, 0, PI * 2, true);
    s.holes.push(p);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: depth - 2 * bev,
      bevelEnabled: true,
      bevelThickness: bev,
      bevelSize: bev,
      bevelSegments: 3,
      curveSegments: 34,
    });
    g.translate(0, 0, -(depth - 2 * bev) / 2);
    return g;
  });
}
/** a cable or hose from a list of points, sagging where told */
function cableG(key, pts, r = 0.016) {
  return cg(`ca|${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V3(...p))), Math.max(12, pts.length * 6), r, 7, false));
}
/** a hose coiled into n loops hanging from a point (anaesthesia circuits, probe leads) */
function coilG(key, x, y, z, n = 3, r = 0.11, drop = 0.26, tube = 0.022) {
  return cg(`co|${key}`, () => {
    const pts = [];
    const steps = n * 14;
    for (let i = 0; i <= steps; i++) {
      const a = (i / 14) * PI * 2;
      pts.push(V3(x + Math.cos(a) * r, y - (i / steps) * drop, z + Math.sin(a) * r * 0.45));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, tube, 6, false);
  });
}

// ================================================================ textures
const TEX = new Map();
function canvasTex(key, w, h, draw, {repeat = false} = {}) {
  if (TEX.has(key)) return TEX.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX.set(key, t);
  return t;
}
const DECALS = new Map();
/** a printed layer: the texture's alpha is the print, and it never casts a shadow */
function decalMat(tex, {rough = 0.5} = {}) {
  const key = tex.uuid + rough;
  if (DECALS.has(key)) return DECALS.get(key);
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: rough,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  m.userData.noCast = true;
  DECALS.set(key, m);
  return m;
}
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
/** a text plate sized to the text, on transparent (or a rounded badge) */
function textTex(text, {fg = HOS.ink, bg = null, weight = 800, px = 90, pad = 22} = {}) {
  const key = `txt|${text}|${fg}|${bg}|${weight}|${px}`;
  if (TEX.has(key)) return TEX.get(key);
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${weight} ${px}px ${FONT}`;
  const W = Math.ceil(probe.measureText(text).width + pad * 2);
  const H = Math.ceil(px * 1.34 + pad * 0.6);
  return canvasTex(key, W, H, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.beginPath();
      g.roundRect(0, 0, W, H, H * 0.24);
      g.fill();
    }
    g.fillStyle = fg;
    g.font = `${weight} ${px}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + px * 0.05);
  });
}

// ================================================================ merged statics
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const KEEP = ['position', 'normal', 'uv'];
function prep(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
/** collects transformed parts per material; merged() gives one geometry per material */
class Parts {
  constructor() {
    this.map = new Map();
  }
  put(mat, geo, m4) {
    const g = prep(geo);
    g.applyMatrix4(m4);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
    return this;
  }
  /** (mat, geo, ...) — the first two may be given in either order, so a tube or cable reads naturally in place */
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    if (mat && mat.isBufferGeometry) {
      const t = mat;
      mat = geo;
      geo = t;
    }
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    return this.put(mat, geo, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
  }
  /** a rounded box between two corners */
  ext(mat, x0, x1, y0, y1, z0, z1, r) {
    return this.add(mat, rb(x1 - x0, y1 - y0, z1 - z0, r), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  /** the same box mirrored in x: x0..x1 and -x1..-x0 */
  pairX(mat, x0, x1, y0, y1, z0, z1, r) {
    this.ext(mat, x0, x1, y0, y1, z0, z1, r);
    return this.ext(mat, -x1, -x0, y0, y1, z0, z1, r);
  }
  cyl(mat, r0, r1, h, x, y, z, axis = 'y', seg = 16) {
    const g = cylG(r0, r1, h, seg);
    if (axis === 'x') return this.add(mat, g, x, y, z, 0, 0, -PI / 2);
    if (axis === 'z') return this.add(mat, g, x, y, z, PI / 2, 0, 0);
    return this.add(mat, g, x, y, z);
  }
  /** a round bar between two points */
  rod(mat, a, b, r = 0.02, seg = 10) {
    const A = V3(...a);
    const d = V3(...b).sub(A);
    const len = d.length();
    _q.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
    return this.put(mat, cylG(r, r, len, seg), _m.compose(A.addScaledVector(d, 0.5), _q, _s.set(1, 1, 1)));
  }
  /** a square bar with rounded edges between two points */
  bar(mat, a, b, t = 0.05) {
    const A = V3(...a);
    const d = V3(...b).sub(A);
    const len = d.length();
    _q.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
    return this.put(mat, rb(t, len + t * 0.9, t, t * 0.35), _m.compose(A.addScaledVector(d, 0.5), _q, _s.set(1, 1, 1)));
  }
  /** a flat print of width w, height h, facing +z unless turned */
  print(mat, w, h, x, y, z, ry = 0, rx = 0) {
    return this.add(mat, planeG(w, h), x, y, z, rx, ry, 0);
  }
  /** printed text of cap height h, facing +z unless turned */
  text(str, opts, h, x, y, z, ry = 0, rx = 0) {
    const tex = textTex(str, opts);
    const a = tex.image.width / tex.image.height;
    return this.print(decalMat(tex), h * a, h, x, y, z, ry, rx);
  }
  /** a thin inset groove: the panel line that keeps a big white box from reading as a box */
  groove(x0, x1, y0, y1, z, t = 0.012) {
    const M = mats();
    return this.ext(M.shade, x0, x1, y0, y1, z - t, z + t, t * 0.4);
  }
  merged() {
    return [...this.map].map(([mat, list]) => [mat, mergeGeometries(list, false)]);
  }
}
const TPL = new Map();
/** the static meshes of a model, built once per variant key and shared between copies */
function tpl(key, make, parent = new THREE.Group()) {
  let list = TPL.get(key);
  if (!list) {
    const P = new Parts();
    make(P);
    list = P.merged();
    TPL.set(key, list);
  }
  for (const [mat, geo] of list) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.userData.noCast;
    m.receiveShadow = true;
    parent.add(m);
  }
  return parent;
}
/** a single live mesh (something that moves) */
const part = (geo, mat, parent) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
};
/** a group of merged statics, so a moving assembly can still be one draw call per material */
function sub(key, make, parent) {
  const g = new THREE.Group();
  tpl(key, make, g);
  if (parent) parent.add(g);
  return g;
}

// ================================================================ small shared details
/** a castor: dark wheel, light fork, under a corner at (x, z) */
function castor(P, x, z, r = 0.045) {
  const M = mats();
  P.ext(M.steelDark, x - r * 0.62, x + r * 0.62, r * 0.85, r * 2.3, z - r * 0.78, z + r * 0.78, r * 0.3);
  P.cyl(M.ink, r, r, r * 0.9, x, r, z, 'x', 12);
  P.cyl(M.steelDark, r * 0.3, r * 0.3, 0.05, x, r * 2.4, z, 'y', 10);
}
/** a drawer front with a bar handle */
function drawer(P, mat, x0, x1, y0, y1, z) {
  const M = mats();
  P.ext(mat, x0, x1, y0, y1, z + 0.004, z + 0.026, 0.018);
  P.ext(M.steelDark, x0 + (x1 - x0) * 0.22, x1 - (x1 - x0) * 0.22, (y0 + y1) / 2 - 0.013, (y0 + y1) / 2 + 0.013, z + 0.026, z + 0.05, 0.01);
}
/** a 5-star castor base of radius r with a column stub */
function starBase(P, r = 0.3, y = 0.0, legs = 5, mat = null) {
  const M = mats();
  mat = mat || M.steelDark;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * PI * 2 + 0.3;
    const dx = Math.cos(a) * r;
    const dz = Math.sin(a) * r;
    P.rod(mat, [0, y + 0.075, 0], [dx, y + 0.055, dz], 0.023, 8);
    P.cyl(M.ink, 0.035, 0.035, 0.03, dx, y + 0.035, dz, 'y', 10);
  }
  P.cyl(mat, 0.055, 0.075, 0.07, 0, y + 0.075, 0, 'y', 14);
}
/** the mesh of a lit screen: swaps map and colour, never reads a clock */
function screenFace(parent, w, h, tex, x, y, z, ry = 0, rx = 0) {
  const mat = new THREE.MeshBasicMaterial({map: tex});
  mat.userData.noCast = true;
  const m = new THREE.Mesh(planeG(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  parent.add(m);
  let cur = tex;
  let on = true;
  const apply = () => {
    mat.map = on ? cur : null;
    mat.color.set(on ? '#ffffff' : HOS.screen);
    mat.needsUpdate = true;
  };
  return {
    mesh: m,
    setOn(b) {
      on = !!b;
      apply();
    },
    setMap(t) {
      cur = t;
      if (on) apply();
    },
  };
}
/** swaps a small mesh between a lit and an unlit material */
function ledSet(list, onMat) {
  const M = mats();
  return (pred) => list.forEach((m, i) => (m.material = pred(i) ? onMat : M.ledOff));
}

// ================================================================ screen artwork
const scr = (g, w, h, bg = '#07131f') => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(130,180,220,0.12)';
  g.lineWidth = 1;
  for (let x = 0; x < w; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
  for (let y = 0; y < h; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
};
const scrText = (g, t, x, y, {fg = '#9fd8e8', px = 22, weight = 700, align = 'left'} = {}) => {
  g.fillStyle = fg;
  g.font = `${weight} ${px}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(t, x, y);
};
/** one ECG beat, u 0..1 -> -1..1 */
function ecgWave(u) {
  const gs = (c, w, a) => a * Math.exp(-((u - c) * (u - c)) / (2 * w * w));
  return gs(0.14, 0.024, 0.16) - gs(0.27, 0.009, 0.24) + gs(0.3, 0.01, 1) - gs(0.335, 0.013, 0.34) + gs(0.52, 0.055, 0.32);
}
/** one pulse-oximeter beat */
function plethWave(u) {
  if (u < 0.13) return 0.15 + 0.85 * (u / 0.13) * (u / 0.13) * (3 - 2 * (u / 0.13));
  const d = u - 0.13;
  return 0.15 + 0.85 * Math.exp(-d * 4.2) + 0.2 * Math.exp(-((d - 0.22) * (d - 0.22)) / 0.006);
}
/** one ventilator pressure breath */
function pressWave(u) {
  if (u < 0.1) return u / 0.1;
  if (u < 0.34) return 1 - 0.12 * ((u - 0.1) / 0.24);
  return 0.88 * Math.exp(-(u - 0.34) * 7.5);
}
function drawWave(g, fn, color, y0, y1, beats, phase, lw = 3) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.beginPath();
  const W = g.canvas.width;
  for (let i = 0; i <= 320; i++) {
    const x = (i / 320) * W;
    const u = (((i / 320) * beats - phase * beats) % 1 + 1) % 1;
    const y = y1 - fn(u) * (y1 - y0);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}
const TRACE_N = 24;
/** the bedside-monitor face at phase i/TRACE_N — 24 variants shared by every monitor in the world */
function monitorTex(i) {
  return canvasTex(`mon|${i}`, 512, 320, (g, w, h) => {
    scr(g, w, h);
    const ph = i / TRACE_N;
    g.save();
    g.beginPath();
    g.rect(0, 30, w - 150, h - 60);
    g.clip();
    drawWave(g, ecgWave, '#7af2a4', 50, 142, 3, ph, 3);
    drawWave(g, plethWave, '#7fd8f2', 160, 236, 3, ph + 0.08, 3);
    g.restore();
    g.fillStyle = 'rgba(10,30,46,0.9)';
    g.fillRect(w - 148, 30, 148, h - 60);
    scrText(g, 'BEDSIDE MONITOR', 14, 18, {px: 17, fg: '#86b6cf'});
    scrText(g, 'ECG II', 14, 46, {px: 16, fg: '#7af2a4'});
    scrText(g, 'SpO2', 14, 170, {px: 16, fg: '#7fd8f2'});
    scrText(g, 'HR', w - 136, 50, {px: 17, fg: '#7af2a4'});
    scrText(g, '78', w - 70, 58, {px: 52, fg: '#7af2a4', weight: 800, align: 'center'});
    scrText(g, '%SpO2', w - 136, 128, {px: 17, fg: '#7fd8f2'});
    scrText(g, '98', w - 70, 136, {px: 52, fg: '#7fd8f2', weight: 800, align: 'center'});
    scrText(g, 'NIBP', w - 136, 206, {px: 17, fg: '#f2e2a0'});
    scrText(g, '122/78', w - 70, 232, {px: 34, fg: '#f2e2a0', weight: 800, align: 'center'});
    scrText(g, 'RESP 16', 14, h - 24, {px: 18, fg: '#cfe0ee'});
    scrText(g, 'TEMP 36.8 C', 190, h - 24, {px: 18, fg: '#cfe0ee'});
    // the beat marker, so a still reads as alive
    const bx = 14 + ((ph * 3) % 1) * (w - 180);
    g.fillStyle = '#7af2a4';
    g.beginPath();
    g.arc(bx, h - 24, Math.max(3, 8 - ((ph * 3) % 1) * 5), 0, PI * 2);
    g.fill();
  });
}
const kioskTex = () =>
  canvasTex('kiosk', 512, 384, (g, w, h) => {
    g.fillStyle = HOS.blueDeep;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, 72);
    scrText(g, 'QUEUE TICKET', 24, 38, {px: 34, fg: HOS.blueDeep, weight: 800});
    scrText(g, 'NOW SERVING', 24, 118, {px: 26, fg: '#bcd4f7'});
    scrText(g, 'A-042', w / 2, 200, {px: 110, fg: '#ffffff', weight: 800, align: 'center'});
    g.fillStyle = HOS.amber;
    g.beginPath();
    g.roundRect(60, 282, w - 120, 68, 16);
    g.fill();
    scrText(g, 'TOUCH TO PRINT', w / 2, 316, {px: 30, fg: HOS.ink, weight: 800, align: 'center'});
  });
const ctConsoleTex = () =>
  canvasTex('ctc', 512, 320, (g, w, h) => {
    scr(g, w, h, '#06101a');
    g.save();
    g.translate(150, 165);
    const rings = [[86, '#1d4a63'], [70, '#2a6a86'], [50, '#3f8aa6'], [26, '#1a3a4e']];
    for (const [r, c] of rings) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(0, 0, r, 0, PI * 2);
      g.fill();
    }
    g.fillStyle = '#cfe8f2';
    g.beginPath();
    g.arc(-22, -14, 13, 0, PI * 2);
    g.arc(24, -10, 11, 0, PI * 2);
    g.fill();
    g.restore();
    scrText(g, 'CT  HEAD / AXIAL', 16, 20, {px: 20, fg: '#9fd8e8'});
    scrText(g, 'SLICE 24 / 64', 280, 70, {px: 20, fg: '#cfe0ee'});
    scrText(g, 'kV 120   mA 250', 280, 104, {px: 20, fg: '#cfe0ee'});
    scrText(g, 'DLP 412 mGy', 280, 138, {px: 20, fg: '#f2e2a0'});
    scrText(g, 'SCANNING', 280, 186, {px: 26, fg: '#7af2a4', weight: 800});
    g.fillStyle = '#2a6a86';
    g.fillRect(280, 206, 200, 14);
    g.fillStyle = '#7fd8f2';
    g.fillRect(280, 206, 128, 14);
    scrText(g, 'PATIENT: WARD 3', 16, h - 22, {px: 19, fg: '#86b6cf'});
  });
const usTex = () =>
  canvasTex('us', 512, 384, (g, w, h) => {
    g.fillStyle = '#060c12';
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, 40);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 300, PI * 0.33, PI * 0.67);
    g.closePath();
    g.clip();
    for (let i = 0; i < 2600; i++) {
      const a = PI * (0.33 + Math.random() * 0.34);
      const r = 40 + Math.random() * 260;
      const v = 40 + Math.random() * 150 * (1 - r / 320);
      g.fillStyle = `rgba(${v + 30},${v + 26},${v + 20},0.65)`;
      g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3);
    }
    g.strokeStyle = 'rgba(225,235,245,0.75)';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(-20, 180, 70, 48, 0.4, 0, PI * 2);
    g.stroke();
    g.restore();
    scrText(g, 'ULTRASOUND  ABD', 14, 18, {px: 19, fg: '#9fd8e8'});
    scrText(g, 'C5-2   MI 0.8   DEPTH 14 cm', 14, h - 20, {px: 18, fg: '#86b6cf'});
  });
const filmTex = (kind) =>
  canvasTex(`film|${kind}`, 384, 460, (g, w, h) => {
    g.fillStyle = '#0a1420';
    g.fillRect(0, 0, w, h);
    if (kind === 'chest') {
      g.fillStyle = '#44566a';
      g.beginPath();
      g.ellipse(w / 2, h * 0.55, w * 0.42, h * 0.42, 0, 0, PI * 2);
      g.fill();
      g.fillStyle = '#14202e';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(w / 2 + s * w * 0.18, h * 0.5, w * 0.15, h * 0.26, 0, 0, PI * 2);
        g.fill();
      }
      g.fillStyle = '#8c9db0';
      g.fillRect(w / 2 - 10, h * 0.2, 20, h * 0.6);
      g.strokeStyle = '#6d7f94';
      g.lineWidth = 7;
      for (let i = 0; i < 7; i++) {
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(w / 2, h * 0.3 + i * 34, w * 0.34, s > 0 ? -0.5 : PI + 0.5, s > 0 ? 0.9 : PI - 0.9, s < 0);
          g.stroke();
        }
      }
    } else {
      g.fillStyle = '#4e6076';
      g.fillRect(w * 0.36, h * 0.08, w * 0.12, h * 0.84);
      g.fillRect(w * 0.54, h * 0.08, w * 0.1, h * 0.84);
      g.fillStyle = '#9fb0c4';
      g.beginPath();
      g.ellipse(w * 0.45, h * 0.5, w * 0.17, h * 0.1, 0, 0, PI * 2);
      g.fill();
    }
    scrText(g, kind === 'chest' ? 'CXR  PA' : 'KNEE  AP', 12, 20, {px: 20, fg: '#9fd8e8'});
  });
const ventTex = (i) =>
  canvasTex(`vent|${i}`, 448, 288, (g, w, h) => {
    scr(g, w, h, '#06121c');
    const ph = i / 8;
    g.save();
    g.beginPath();
    g.rect(0, 26, w - 120, h - 52);
    g.clip();
    drawWave(g, pressWave, '#f2e2a0', 46, 128, 2, ph, 3);
    drawWave(g, (u) => Math.max(0, Math.sin(u * PI * 2)) * 0.9, '#7fd8f2', 150, 222, 2, ph, 3);
    g.restore();
    scrText(g, 'PRESSURE cmH2O', 12, 16, {px: 16, fg: '#f2e2a0'});
    scrText(g, 'FLOW L/min', 12, 142, {px: 16, fg: '#7fd8f2'});
    scrText(g, 'VT 450', w - 112, 54, {px: 24, fg: '#cfe0ee', weight: 800});
    scrText(g, 'RR 14', w - 112, 100, {px: 24, fg: '#cfe0ee', weight: 800});
    scrText(g, 'PEEP 5', w - 112, 146, {px: 24, fg: '#cfe0ee', weight: 800});
    scrText(g, 'FiO2 40%', w - 112, 192, {px: 22, fg: '#7af2a4', weight: 800});
  });
const miniTex = (key, lines, {bg = '#07131f'} = {}) =>
  canvasTex(`mini|${key}`, 320, 200, (g, w, h) => {
    scr(g, w, h, bg);
    lines.forEach((l, i) => scrText(g, l[0], 14, 34 + i * 44, {px: l[1] || 30, fg: l[2] || '#cfe0ee', weight: 800}));
  });
const pcTex = () =>
  canvasTex('pc', 448, 320, (g, w, h) => {
    g.fillStyle = '#f2f6fd';
    g.fillRect(0, 0, w, h);
    g.fillStyle = HOS.blue;
    g.fillRect(0, 0, w, 52);
    scrText(g, 'PATIENT RECORD', 14, 27, {px: 26, fg: '#ffffff', weight: 800});
    g.fillStyle = '#dde6f5';
    for (let i = 0; i < 6; i++) g.fillRect(16, 76 + i * 38, w - 32, 24);
    g.fillStyle = HOS.mint;
    g.fillRect(16, 76, 150, 24);
    g.fillStyle = HOS.amber;
    g.fillRect(16, 152, 220, 24);
    scrText(g, 'HN 44-128  QUEUE A-042', 16, h - 26, {px: 20, fg: HOS.inkSoft, weight: 700});
  });

// ================================================================ front office
/** the registration counter: public ledge at 1.05, staff worktop at 0.75 behind it with a PC */
export function buildRegDesk({len = 2.8, color = HOS.blue} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const L = Math.max(1.6, len);
  tpl(`reg|${L.toFixed(2)}|${color}`, (P) => {
    const C = paint(color, 0.48);
    P.ext(M.white, -L / 2, L / 2, 0.08, 1.0, -0.35, 0.3, 0.05); // body
    P.ext(M.panel, -L / 2 - 0.04, L / 2 + 0.04, 1.0, 1.05, -0.38, 0.35, 0.025); // counter top
    P.ext(C, -L / 2, L / 2, 0.72, 0.86, 0.3, 0.34, 0.02); // accent band on the public face
    P.groove(-L / 2 + 0.06, L / 2 - 0.06, 0.2, 0.22, 0.31);
    P.ext(M.shade, -L / 2 + 0.05, L / 2 - 0.05, 0.02, 0.1, -0.3, 0.26, 0.02); // kick plate
    // staff worktop behind, on two brackets
    P.ext(M.panel, -L / 2 + 0.1, L / 2 - 0.1, 0.71, 0.75, -0.78, -0.33, 0.02);
    for (const s of [-1, 1]) P.ext(M.steelDark, s * (L / 2 - 0.22), s * (L / 2 - 0.16), 0.1, 0.71, -0.72, -0.66, 0.02);
    // printed signage on the public face
    P.text('REGISTRATION', {fg: HOS.white, weight: 800, px: 96}, 0.1, 0, 0.79, 0.345);
    P.text('Bring your ID card and queue ticket', {fg: HOS.inkSoft, weight: 600, px: 64}, 0.048, 0, 0.6, 0.345);
    P.text('1', {fg: HOS.white, bg: color, weight: 800, px: 110}, 0.17, -L / 2 + 0.28, 1.2, 0.0);
    // a stack of forms and a pen pot on the counter
    P.ext(M.white, L / 2 - 0.55, L / 2 - 0.22, 1.05, 1.08, -0.08, 0.14, 0.008);
    P.cyl(M.blueLight, 0.045, 0.045, 0.1, L / 2 - 0.12, 1.1, 0.02, 'y', 12);
    for (const dx of [-0.02, 0.01, 0.03]) P.rod(M.ink, [L / 2 - 0.12 + dx, 1.1, 0.02], [L / 2 - 0.1 + dx, 1.22, 0.04], 0.006, 6);
  }, group);
  // the staff PC, facing -z
  const pc = screenFace(group, 0.46, 0.3, pcTex(), 0, 0.98, -0.63, PI);
  tpl('reg-pc', (P) => {
    P.ext(M.ink, -0.25, 0.25, 0.81, 1.15, -0.62, -0.58, 0.02);
    P.ext(M.inkSoft, -0.06, 0.06, 0.75, 0.82, -0.63, -0.52, 0.02);
    P.ext(M.ink, -0.1, 0.1, 0.75, 0.77, -0.68, -0.56, 0.01);
    P.ext(M.panel, -0.22, 0.22, 0.75, 0.78, -0.56, -0.4, 0.012); // keyboard
    P.add(cableG('reg-cab', [[0.1, 0.8, -0.6], [0.16, 0.6, -0.72], [0.1, 0.1, -0.74]], 0.012), M.rubber);
  }, group);
  return {group, topY: 1.05, setOn: (b) => pc.setOn(b)};
}

/** the cashier window: a glazed screen over the counter, a till and a card reader on a stalk */
export function buildCashierCounter({len = 2.2, cardReader = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const L = Math.max(1.4, len);
  tpl(`cash|${L.toFixed(2)}|${cardReader}`, (P) => {
    P.ext(M.white, -L / 2, L / 2, 0.08, 1.0, -0.35, 0.3, 0.05);
    P.ext(M.panel, -L / 2 - 0.04, L / 2 + 0.04, 1.0, 1.05, -0.38, 0.35, 0.025);
    P.ext(M.amber, -L / 2, L / 2, 0.74, 0.88, 0.3, 0.34, 0.02);
    P.ext(M.shade, -L / 2 + 0.05, L / 2 - 0.05, 0.02, 0.1, -0.3, 0.26, 0.02);
    P.groove(-L / 2 + 0.06, L / 2 - 0.06, 0.24, 0.26, 0.31);
    P.text('CASHIER', {fg: HOS.ink, weight: 800, px: 96}, 0.1, -0.1, 0.81, 0.345);
    P.text('PAYMENT', {fg: HOS.inkSoft, weight: 700, px: 70}, 0.055, 0.52, 0.805, 0.345);
    // glazed screen with a pass-through slot
    for (const s of [-1, 1]) P.ext(M.steelDark, s * (L / 2 - 0.08), s * (L / 2 - 0.03), 1.05, 1.75, -0.03, 0.03, 0.02);
    P.ext(M.steelDark, -L / 2 + 0.06, L / 2 - 0.06, 1.7, 1.76, -0.03, 0.03, 0.02);
    P.ext(M.glass, -L / 2 + 0.07, L / 2 - 0.07, 1.22, 1.7, -0.012, 0.012, 0.005);
    P.ext(M.steelDark, -0.3, 0.3, 1.14, 1.2, -0.04, 0.04, 0.015); // the slot lip
    // the till
    P.ext(M.panel, -L / 2 + 0.18, -L / 2 + 0.62, 1.05, 1.18, -0.24, 0.12, 0.03);
    P.ext(M.inkSoft, -L / 2 + 0.2, -L / 2 + 0.6, 1.18, 1.21, -0.22, 0.1, 0.012);
    P.ext(M.ink, -L / 2 + 0.24, -L / 2 + 0.56, 1.21, 1.42, -0.2, -0.17, 0.02);
    if (cardReader) {
      P.cyl(M.steelDark, 0.022, 0.022, 0.26, L / 2 - 0.4, 1.18, -0.02, 'y', 10);
      P.add(M.ink, rb(0.1, 0.17, 0.05, 0.016), L / 2 - 0.4, 1.38, 0.0, -0.4, 0, 0);
      P.text('TAP', {fg: HOS.mintLight, weight: 800, px: 60}, 0.035, L / 2 - 0.4, 1.42, 0.035);
    }
  }, group);
  const till = screenFace(group, 0.28, 0.17, miniTex('till', [['SUBTOTAL', 22, '#86b6cf'], ['THB 350', 36, '#7af2a4']]), -L / 2 + 0.4, 1.31, -0.165, 0);
  return {group, setOn: (b) => till.setOn(b)};
}

/** the records shelf: 2.05 tall, 0.50 deep, bays of patient files with printed index labels */
export function buildFileShelf({bays = 3} = {}) {
  const M = mats();
  const n = clamp(Math.round(bays), 1, 6);
  const bw = 0.92;
  const W = n * bw;
  const group = new THREE.Group();
  tpl(`fshelf|${n}`, (P) => {
    P.ext(M.panel, -W / 2, W / 2, 0, 2.05, -0.25, -0.2, 0.025); // back
    P.ext(M.panel, -W / 2, W / 2, 1.98, 2.05, -0.25, 0.25, 0.025); // top
    P.ext(M.panel, -W / 2, W / 2, 0.0, 0.12, -0.25, 0.25, 0.025); // plinth
    P.ext(M.shade, -W / 2 + 0.03, W / 2 - 0.03, 0.02, 0.1, -0.22, 0.22, 0.02);
    for (let i = 0; i <= n; i++) P.ext(M.white, -W / 2 + i * bw - 0.02, -W / 2 + i * bw + 0.02, 0.1, 2.0, -0.25, 0.25, 0.012);
    const files = [HOS.blueLight, HOS.amberLight, HOS.mintLight, HOS.roseLight, HOS.violetLight, HOS.oliveLight];
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 + i * bw + 0.04;
      for (let s = 0; s < 5; s++) {
        const y = 0.14 + s * 0.38;
        P.ext(M.white, x0, x0 + bw - 0.08, y, y + 0.022, -0.24, 0.24, 0.008); // shelf board
        let x = x0 + 0.02;
        while (x < x0 + bw - 0.14) {
          const t = 0.03 + Math.abs(Math.sin((i * 7 + s * 3 + x) * 11.3)) * 0.035;
          const c = files[(i + s + Math.round(x * 37)) % files.length];
          P.add(paint(c, 0.62), rb(t, 0.3, 0.42, 0.012), x + t / 2, y + 0.19, 0.0, 0, 0, 0.03);
          x += t + 0.012;
        }
      }
      P.text(`${String.fromCharCode(65 + i * 2)}-${String.fromCharCode(66 + i * 2)}`, {fg: HOS.white, bg: HOS.blue, weight: 800, px: 80}, 0.09, x0 + bw / 2 - 0.04, 1.96, 0.26);
    }
    P.text('MEDICAL RECORDS', {fg: HOS.inkSoft, weight: 700, px: 70}, 0.06, 0, 0.06, 0.26);
  }, group);
  return {group, w: W};
}

/** a floor-standing office printer with a paper tray and a sheet on the way out */
export function buildPrinter() {
  const M = mats();
  const group = new THREE.Group();
  tpl('printer', (P) => {
    P.ext(M.panel, -0.3, 0.3, 0.06, 0.62, -0.3, 0.3, 0.035); // base cabinet
    P.ext(M.shade, -0.27, 0.27, 0.0, 0.08, -0.27, 0.27, 0.02);
    drawer(P, M.white, -0.26, 0.26, 0.16, 0.36, 0.3);
    drawer(P, M.white, -0.26, 0.26, 0.38, 0.58, 0.3);
    P.ext(M.white, -0.3, 0.3, 0.62, 0.96, -0.3, 0.3, 0.04); // engine
    P.groove(-0.28, 0.28, 0.78, 0.8, 0.305);
    P.ext(M.ink, -0.3, 0.3, 0.96, 1.0, -0.28, 0.16, 0.025); // dark lid
    P.ext(M.inkSoft, -0.16, 0.24, 1.0, 1.03, -0.22, 0.1, 0.012);
    P.ext(M.shade, -0.26, 0.26, 0.86, 0.92, 0.18, 0.31, 0.02); // output tray lip
    P.text('MFP-210', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.045, -0.12, 0.69, 0.305);
    P.add(cableG('pr-cab', [[-0.2, 0.1, -0.3], [-0.3, 0.06, -0.42], [-0.2, 0.05, -0.52]], 0.012), M.rubber);
  }, group);
  const panel = screenFace(group, 0.16, 0.1, miniTex('pr', [['READY', 30, '#7af2a4'], ['TRAY 1 A4', 20]]), 0.12, 1.012, 0.02, 0, -PI / 2);
  const sheets = part(rb(0.21, 0.004, 0.29, 0.002), M.white, group);
  sheets.position.set(0, 0.93, 0.26);
  sheets.rotation.x = -0.1;
  return {
    group,
    setPaper(k) {
      const t = clamp(k, 0, 1);
      sheets.position.z = 0.2 + t * 0.14;
      sheets.visible = t > 0.02;
    },
    setOn: (b) => panel.setOn(b),
  };
}

/** the ticket kiosk: a pedestal, an angled touch screen, a ticket slot */
export function buildQueueKiosk({number = 'A-042'} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl(`kiosk|${number}`, (P) => {
    P.ext(M.ink, -0.26, 0.26, 0.0, 0.05, -0.22, 0.22, 0.02);
    P.ext(M.white, -0.22, 0.22, 0.05, 1.0, -0.17, 0.17, 0.05); // column
    P.groove(-0.2, 0.2, 0.5, 0.52, 0.175);
    P.ext(M.blue, -0.22, 0.22, 0.1, 0.2, -0.17, 0.175, 0.03);
    P.add(M.white, rb(0.46, 0.44, 0.14, 0.035), 0, 1.16, 0.06, -0.38, 0, 0); // screen housing
    P.ext(M.ink, -0.1, 0.1, 0.95, 0.98, 0.1, 0.2, 0.01); // ticket slot
    P.text('TAKE A TICKET', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.045, 0, 0.88, 0.178);
    P.text('QUEUE', {fg: HOS.white, bg: HOS.blue, weight: 800, px: 84}, 0.075, 0, 1.44, 0.03);
  }, group);
  const face = screenFace(group, 0.37, 0.35, kioskTex(), 0, 1.175, 0.135, 0, -0.38);
  const ticket = part(rb(0.07, 0.003, 0.11, 0.002), M.white, group);
  ticket.position.set(0, 0.945, 0.22);
  ticket.rotation.x = 0.45;
  return {group, setOn: (b) => face.setOn(b), number};
}

/** a row of linked waiting chairs on a steel beam; seat at 0.45 */
export function buildWaitingChairRow({n = 4, color = HOS.blueLight} = {}) {
  const M = mats();
  const k = clamp(Math.round(n), 1, 8);
  const pitch = 0.56;
  const W = k * pitch;
  const group = new THREE.Group();
  const seats = [];
  tpl(`wchair|${k}|${color}`, (P) => {
    const C = paint(color, 0.52);
    P.ext(M.steelDark, -W / 2 + 0.06, W / 2 - 0.06, 0.3, 0.36, -0.06, 0.06, 0.025); // beam
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.16);
      P.rod(M.steelDark, [x, 0.33, -0.22], [x, 0.02, -0.3], 0.022, 8);
      P.rod(M.steelDark, [x, 0.33, 0.22], [x, 0.02, 0.3], 0.022, 8);
      P.ext(M.steelDark, x - 0.02, x + 0.02, 0.3, 0.36, -0.24, 0.24, 0.015);
      P.ext(M.ink, x - 0.04, x + 0.04, 0.0, 0.03, -0.33, -0.27, 0.012);
      P.ext(M.ink, x - 0.04, x + 0.04, 0.0, 0.03, 0.27, 0.33, 0.012);
    }
    for (let i = 0; i < k; i++) {
      const x = -W / 2 + pitch * (i + 0.5);
      P.add(C, rb(pitch - 0.08, 0.07, 0.46, 0.03), x, 0.42, 0.02);
      P.add(C, rb(pitch - 0.08, 0.42, 0.07, 0.03), x, 0.66, -0.2, 0.14, 0, 0);
      P.ext(M.steelDark, x - 0.02, x + 0.02, 0.36, 0.45, -0.18, 0.04, 0.012);
      if (i < k - 1) P.ext(M.steelDark, x + pitch / 2 - 0.02, x + pitch / 2 + 0.02, 0.36, 0.62, -0.05, 0.14, 0.012); // armrest
    }
    P.ext(M.steelDark, -W / 2 + 0.14, -W / 2 + 0.18, 0.36, 0.62, -0.05, 0.14, 0.012);
    P.ext(M.steelDark, W / 2 - 0.18, W / 2 - 0.14, 0.36, 0.62, -0.05, 0.14, 0.012);
  }, group);
  for (let i = 0; i < k; i++) seats.push({x: -W / 2 + pitch * (i + 0.5), z: 0.02, rot: 0});
  return {group, seats, w: W};
}

export function buildWaterCooler() {
  const M = mats();
  const group = new THREE.Group();
  tpl('cooler', (P) => {
    P.ext(M.white, -0.18, 0.18, 0.04, 1.02, -0.17, 0.17, 0.04);
    P.ext(M.shade, -0.16, 0.16, 0.0, 0.06, -0.15, 0.15, 0.02);
    P.ext(M.blue, -0.18, 0.18, 0.72, 0.8, -0.17, 0.175, 0.02);
    P.groove(-0.16, 0.16, 0.34, 0.36, 0.175);
    P.ext(M.steelDark, -0.11, 0.11, 0.6, 0.64, 0.14, 0.26, 0.015); // drip tray
    P.ext(M.ink, -0.1, 0.1, 0.63, 0.65, 0.16, 0.25, 0.008);
    for (const [x, c] of [[-0.06, M.blue], [0.06, M.red]]) {
      P.cyl(c, 0.018, 0.018, 0.07, x, 0.86, 0.16, 'z', 10);
      P.ext(c, x - 0.022, x + 0.022, 0.86, 0.95, 0.12, 0.16, 0.012);
    }
    P.text('DRINKING WATER', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.04, 0, 0.47, 0.175);
    P.cyl(M.water, 0.14, 0.16, 0.42, 0, 1.24, 0, 'y', 18);
    P.cyl(M.water, 0.16, 0.08, 0.1, 0, 1.0, 0, 'y', 18);
    P.cyl(M.blueLight, 0.05, 0.05, 0.05, 0, 1.47, 0, 'y', 14);
    P.cyl(M.white, 0.035, 0.028, 0.16, 0.14, 1.1, 0.0, 'y', 12);
  }, group);
  return {group};
}

export function buildSanitiser() {
  const M = mats();
  const group = new THREE.Group();
  tpl('sanit', (P) => {
    P.cyl(M.steelDark, 0.16, 0.18, 0.03, 0, 0.015, 0, 'y', 18);
    P.cyl(M.steel, 0.025, 0.025, 0.96, 0, 0.5, 0, 'y', 12);
    P.ext(M.white, -0.09, 0.09, 0.96, 1.24, -0.07, 0.07, 0.03); // the dispenser
    P.ext(M.mint, -0.09, 0.09, 1.16, 1.24, -0.07, 0.075, 0.02);
    P.ext(M.ink, -0.05, 0.05, 0.93, 0.97, -0.02, 0.1, 0.012); // nozzle
    P.ext(M.white, -0.13, 0.13, 1.3, 1.52, -0.012, 0.012, 0.02); // sign
    P.text('SANITISE', {fg: HOS.mintDeep, weight: 800, px: 86}, 0.065, 0, 1.44, 0.015);
    P.text('HANDS', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.045, 0, 1.36, 0.015);
  }, group);
  return {group};
}

/** a pedal bin; kind sets its colour and its printed label */
export function buildBin({kind = 'general'} = {}) {
  const M = mats();
  const K = {
    general: {c: HOS.steel, t: 'GENERAL'},
    clinical: {c: HOS.rose, t: 'CLINICAL'},
    sharps: {c: HOS.amber, t: 'SHARPS'},
    recycle: {c: HOS.green, t: 'RECYCLE'},
  }[kind] || {c: HOS.steel, t: 'GENERAL'};
  const group = new THREE.Group();
  tpl(`bin|${kind}`, (P) => {
    const C = paint(K.c, 0.55);
    P.cyl(C, 0.165, 0.15, 0.56, 0, 0.3, 0, 'y', 18);
    P.cyl(M.ink, 0.16, 0.16, 0.04, 0, 0.03, 0, 'y', 18);
    P.cyl(M.panel, 0.17, 0.165, 0.05, 0, 0.6, 0, 'y', 18); // lid
    P.ext(M.ink, -0.04, 0.04, 0.0, 0.02, 0.14, 0.24, 0.012); // pedal
    P.rod(M.steelDark, [0.0, 0.02, 0.2], [0.0, 0.58, 0.16], 0.01, 6);
    P.text(K.t, {fg: HOS.ink, weight: 800, px: 72}, 0.05, 0, 0.36, 0.158);
    if (kind === 'sharps') P.text('DO NOT RECAP', {fg: HOS.inkSoft, weight: 600, px: 54}, 0.03, 0, 0.29, 0.158);
  }, group);
  return {group};
}

// ================================================================ clinic
/** the examination couch: a drawer base, a paper roll at the head, a head section that raises */
export function buildExamBed({head = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const L = 2.0;
  const W = 0.8;
  tpl('exambed', (P) => {
    P.ext(M.white, -W / 2 + 0.04, W / 2 - 0.04, 0.1, 0.5, -L / 2 + 0.2, L / 2 - 0.2, 0.03); // base cabinet
    P.ext(M.shade, -W / 2 + 0.07, W / 2 - 0.07, 0.0, 0.11, -L / 2 + 0.24, L / 2 - 0.24, 0.02);
    drawer(P, M.panel, -W / 2 + 0.1, W / 2 - 0.1, 0.16, 0.3, L / 2 - 0.2);
    drawer(P, M.panel, -W / 2 + 0.1, W / 2 - 0.1, 0.32, 0.46, L / 2 - 0.2);
    P.ext(M.panel, -W / 2, W / 2, 0.5, 0.56, -L / 2, L / 2, 0.03); // deck pan
    P.groove(-W / 2 + 0.03, W / 2 - 0.03, 0.52, 0.54, L / 2 + 0.001);
    P.add(M.mintLight, rb(W - 0.04, 0.09, 1.3, 0.04), 0, 0.6, L / 2 - 0.66);
    P.ext(M.panel, -0.22, 0.22, 0.0, 0.16, L / 2 + 0.02, L / 2 + 0.26, 0.03); // step
    P.ext(M.shade, -0.2, 0.2, 0.16, 0.18, L / 2 + 0.04, L / 2 + 0.24, 0.01);
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * (W / 2 - 0.05), 0.56, -L / 2 - 0.04], [s * (W / 2 - 0.05), 0.76, -L / 2 - 0.04], 0.012, 8);
    P.cyl(M.white, 0.055, 0.055, W - 0.14, 0, 0.76, -L / 2 - 0.04, 'x', 14);
    P.text('EXAM 1', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.045, 0, 0.3, -L / 2 + 0.21);
  }, group);
  const headG = new THREE.Group();
  headG.position.set(0, 0.56, -L / 2 + 0.7);
  group.add(headG);
  tpl('exambed-head', (P) => {
    P.add(M.mintLight, rb(W - 0.04, 0.09, 0.66, 0.04), 0, 0.04, -0.33);
    P.ext(M.panel, -W / 2 + 0.02, W / 2 - 0.02, -0.03, 0.0, -0.66, 0.0, 0.015);
    P.add(M.white, rb(W - 0.18, 0.012, 0.6, 0.006), 0, 0.09, -0.33); // the paper sheet
  }, headG);
  const api = {
    group,
    deck: 0.62,
    setHead(k) {
      headG.rotation.x = clamp(k, 0, 1) * 0.95;
    },
  };
  api.setHead(head);
  return api;
}

/** the doctor's desk: top at 0.75, a PC, a stack of notes, a pen pot */
export function buildExamDesk() {
  const M = mats();
  const group = new THREE.Group();
  tpl('examdesk', (P) => {
    P.ext(M.wood, -0.7, 0.7, 0.72, 0.76, -0.35, 0.35, 0.02); // top
    P.ext(M.white, -0.68, -0.26, 0.08, 0.72, -0.33, 0.3, 0.03); // drawer stack
    for (let i = 0; i < 3; i++) drawer(P, M.panel, -0.65, -0.29, 0.14 + i * 0.19, 0.3 + i * 0.19, 0.3);
    P.ext(M.white, 0.56, 0.68, 0.06, 0.72, -0.33, 0.3, 0.02); // end panel
    P.ext(M.shade, -0.66, 0.66, 0.66, 0.7, -0.34, -0.3, 0.015); // modesty rail
    P.text('CONSULT', {fg: HOS.inkSoft, weight: 700, px: 60}, 0.04, -0.47, 0.6, 0.305);
    P.ext(M.ink, -0.1, 0.1, 0.76, 0.79, -0.2, -0.08, 0.012);
    P.cyl(M.ink, 0.022, 0.022, 0.18, 0, 0.87, -0.14, 'y', 10);
    P.ext(M.ink, -0.26, 0.26, 0.94, 1.28, -0.16, -0.12, 0.02);
    P.ext(M.ink, -0.24, 0.24, 0.77, 0.8, -0.06, 0.1, 0.012); // keyboard
    P.ext(M.white, 0.26, 0.58, 0.76, 0.8, -0.1, 0.18, 0.008); // notes
    P.cyl(M.blueLight, 0.04, 0.04, 0.09, 0.44, 0.8, -0.22, 'y', 12);
    for (const dx of [-0.015, 0.01, 0.025]) P.rod(M.ink, [0.44 + dx, 0.8, -0.22], [0.46 + dx, 0.92, -0.2], 0.005, 6);
    P.add(cableG('ed-c', [[0.0, 0.9, -0.16], [0.08, 0.6, -0.3], [0.0, 0.08, -0.32]], 0.011), M.rubber);
  }, group);
  const face = screenFace(group, 0.44, 0.3, pcTex(), 0, 1.11, -0.115);
  return {group, topY: 0.76, setOn: (b) => face.setOn(b)};
}

/** a gas-lift office chair on a 5-star castor base; seat at 0.45 */
export function buildDoctorChair({color = HOS.mint} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl(`dchair-base|${color}`, (P) => {
    starBase(P, 0.29);
    P.cyl(M.steelDark, 0.03, 0.03, 0.22, 0, 0.19, 0, 'y', 12);
  }, group);
  const seat = new THREE.Group();
  seat.position.y = 0.3;
  group.add(seat);
  tpl(`dchair-seat|${color}`, (P) => {
    const C = paint(color, 0.56);
    P.cyl(M.steelDark, 0.04, 0.04, 0.12, 0, 0.0, 0, 'y', 12);
    P.add(C, rb(0.46, 0.09, 0.44, 0.05), 0, 0.11, 0.0);
    P.ext(M.steelDark, -0.03, 0.03, 0.12, 0.3, -0.23, -0.17, 0.015);
    P.add(C, rb(0.42, 0.42, 0.09, 0.05), 0, 0.46, -0.2, 0.12, 0, 0);
    for (const s of [-1, 1]) {
      P.ext(M.ink, s * 0.22 - 0.02, s * 0.22 + 0.02, 0.12, 0.26, -0.14, 0.06, 0.012);
      P.add(M.ink, rb(0.07, 0.035, 0.22, 0.015), s * 0.22, 0.27, -0.02);
    }
  }, seat);
  return {
    group,
    setSwivel(a) {
      seat.rotation.y = a;
    },
  };
}

/** a round patient stool, seat at 0.45 */
export function buildPatientStool() {
  const M = mats();
  const group = new THREE.Group();
  tpl('stool-base', (P) => {
    starBase(P, 0.24, 0, 4);
    P.cyl(M.steelDark, 0.028, 0.028, 0.26, 0, 0.2, 0, 'y', 12);
  }, group);
  const seat = new THREE.Group();
  seat.position.y = 0.32;
  group.add(seat);
  tpl('stool-seat', (P) => {
    P.cyl(M.blueLight, 0.2, 0.19, 0.09, 0, 0.09, 0, 'y', 20);
    P.cyl(M.steelDark, 0.035, 0.035, 0.1, 0, 0.0, 0, 'y', 12);
  }, seat);
  return {
    group,
    setSwivel(a) {
      seat.rotation.y = a;
    },
  };
}

/** a cubicle curtain on a ceiling track: one ribbon with real folds that bunch as it opens */
export function buildCurtain({len = 2.4, open = 0, h = 1.9, color = HOS.curtain} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const L = Math.max(0.6, len);
  const railY = 2.25;
  tpl(`curtain-rail|${L.toFixed(2)}`, (P) => {
    P.ext(M.steel, -L / 2 - 0.05, L / 2 + 0.05, railY, railY + 0.05, -0.025, 0.025, 0.02);
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * (L / 2 - 0.1), railY + 0.05, 0], [s * (L / 2 - 0.1), railY + 0.3, 0], 0.012, 8);
  }, group);
  const SEG = 44;
  const geo = new THREE.PlaneGeometry(1, h, SEG, 1);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({color, roughness: 0.86, side: THREE.DoubleSide});
  const rib = part(geo, mat, group);
  rib.position.y = railY - 0.05 - h;
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const setOpen = (k) => {
    const t = clamp(k, 0, 1);
    const span = L * (1 - 0.78 * t);
    const amp = 0.045 + 0.1 * t;
    const folds = 8 + Math.round(t * 5);
    for (let i = 0; i < pos.count; i++) {
      const u = base[i * 3] + 0.5;
      pos.setX(i, -L / 2 + u * span);
      pos.setZ(i, Math.sin(u * folds * PI * 2) * amp);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };
  setOpen(open);
  return {group, setOpen};
}

/** a BP machine on a rolling stand: cuff, hose loop, small display, basket */
export function buildBPMonitor() {
  const M = mats();
  const group = new THREE.Group();
  tpl('bp', (P) => {
    starBase(P, 0.27);
    P.cyl(M.steel, 0.022, 0.022, 0.95, 0, 0.6, 0, 'y', 12);
    P.ext(M.white, -0.13, 0.13, 1.02, 1.3, -0.1, 0.1, 0.035); // the head
    P.ext(M.ink, -0.11, 0.11, 1.24, 1.28, 0.1, 0.105, 0.01);
    P.ext(M.panel, -0.1, 0.1, 1.04, 1.1, 0.1, 0.108, 0.012); // button strip
    for (const x of [-0.06, 0, 0.06]) P.cyl(M.steelDark, 0.014, 0.014, 0.012, x, 1.07, 0.112, 'z', 10);
    P.text('NIBP', {fg: HOS.inkSoft, weight: 700, px: 60}, 0.035, 0, 1.0, 0.105);
    P.ext(M.steelDark, -0.02, 0.02, 0.98, 1.02, -0.11, -0.06, 0.01);
    P.add(M.blueLight, rb(0.17, 0.2, 0.06, 0.028), 0.0, 0.86, -0.12, 0.1, 0, 0);
    P.add(cableG('bp-h', [[0.0, 1.06, -0.09], [0.1, 0.99, -0.16], [0.03, 0.94, -0.13]], 0.011), M.rubber);
    P.ext(M.steelDark, -0.14, 0.14, 0.42, 0.46, -0.11, 0.13, 0.015);
    for (const s of [-1, 1]) P.ext(M.steelDark, s * 0.14 - 0.012, s * 0.14 + 0.012, 0.42, 0.56, -0.11, 0.13, 0.01);
    P.ext(M.steelDark, -0.14, 0.14, 0.52, 0.56, -0.11, -0.09, 0.01);
    P.ext(M.steelDark, -0.14, 0.14, 0.52, 0.56, 0.11, 0.13, 0.01);
  }, group);
  const face = screenFace(group, 0.2, 0.11, miniTex('bp', [['122 / 78', 34, '#7af2a4'], ['PULSE 76', 22]]), 0, 1.17, 0.102);
  return {group, setOn: (b) => face.setOn(b)};
}

/** a column scale with an optional height rod; setRod(h) slides the measuring arm */
export function buildWeighScale({heightRod = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl(`scale|${heightRod}`, (P) => {
    P.ext(M.panel, -0.22, 0.22, 0.02, 0.07, -0.18, 0.18, 0.025); // platform
    P.ext(M.ink, -0.2, 0.2, 0.07, 0.085, -0.16, 0.16, 0.012);
    P.ext(M.steel, -0.035, 0.035, 0.07, 1.02, -0.14, -0.08, 0.025); // column
    P.ext(M.white, -0.11, 0.11, 1.02, 1.18, -0.16, -0.04, 0.03); // display head
    P.text('WEIGHT kg', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.03, 0, 1.05, -0.035);
    if (heightRod) {
      P.ext(M.steel, -0.018, 0.018, 1.18, 2.0, -0.13, -0.09, 0.012);
      for (let i = 0; i <= 8; i++) P.ext(M.inkSoft, 0.018, 0.034, 1.25 + i * 0.09 - 0.004, 1.25 + i * 0.09 + 0.004, -0.12, -0.1, 0.002);
    }
  }, group);
  const face = screenFace(group, 0.16, 0.07, miniTex('wt', [['64.2 kg', 40, '#7af2a4']]), 0, 1.12, -0.038);
  const rod = part(rb(0.14, 0.03, 0.2, 0.012), M.panel, group);
  rod.position.set(0, 1.7, 0.0);
  rod.visible = heightRod;
  return {
    group,
    setRod(h) {
      rod.position.y = clamp(h, 1.2, 1.98);
    },
    setOn: (b) => face.setOn(b),
  };
}

export function buildThermometerStand() {
  const M = mats();
  const group = new THREE.Group();
  tpl('thermo', (P) => {
    P.cyl(M.steelDark, 0.15, 0.17, 0.03, 0, 0.015, 0, 'y', 16);
    P.cyl(M.steel, 0.02, 0.02, 1.0, 0, 0.52, 0, 'y', 12);
    P.ext(M.white, -0.1, 0.1, 1.02, 1.2, -0.08, 0.08, 0.03); // the unit
    P.ext(M.mint, -0.1, 0.1, 1.14, 1.2, -0.08, 0.082, 0.015);
    P.ext(M.ink, -0.05, 0.05, 1.05, 1.12, 0.08, 0.085, 0.012);
    P.text('TEMP', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.03, 0, 1.17, 0.085);
    P.add(M.ink, rb(0.03, 0.17, 0.03, 0.012), 0.11, 1.12, 0.0, 0, 0, 0.18);
    P.add(coilG('th-c', 0.08, 1.02, 0.0, 2, 0.05, 0.14, 0.009), M.rubber);
    P.ext(M.cardboard, -0.1, 0.1, 0.52, 0.66, -0.07, 0.07, 0.02);
    P.text('COVERS', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.025, 0, 0.59, 0.072);
  }, group);
  return {group};
}

/** a wall chart (an eye chart), on a wall that faces +z */
export function buildWallChart({title = 'VISION TEST'} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl(`chart|${title}`, (P) => {
    P.ext(M.white, -0.34, 0.34, 1.05, 1.95, -0.02, 0.01, 0.015);
    P.ext(M.blue, -0.34, 0.34, 1.83, 1.95, -0.02, 0.015, 0.012);
    P.text(title, {fg: HOS.white, weight: 800, px: 80}, 0.07, 0, 1.89, 0.018);
    const rows = [['E', 0.13], ['F P', 0.095], ['T O Z', 0.072], ['L P E D', 0.055], ['P E C F D', 0.042], ['E D F C Z P', 0.032]];
    let y = 1.72;
    for (const [s, h] of rows) {
      P.text(s, {fg: HOS.ink, weight: 800, px: 90}, h, 0, y, 0.014);
      y -= h + 0.055;
    }
    P.text('6 / 6', {fg: HOS.inkSoft, weight: 700, px: 52}, 0.03, 0.26, 1.1, 0.014);
  }, group);
  return {group};
}

/** the wall diagnostic set: two handles in lit cradles */
export function buildOtoscopeSet() {
  const M = mats();
  const group = new THREE.Group();
  tpl('otoscope', (P) => {
    P.ext(M.white, -0.17, 0.17, 1.3, 1.62, -0.06, 0.03, 0.025);
    P.ext(M.panel, -0.15, 0.15, 1.3, 1.36, -0.05, 0.06, 0.015);
    P.text('DIAGNOSTIC SET', {fg: HOS.inkSoft, weight: 700, px: 54}, 0.027, 0, 1.58, 0.035);
    for (const s of [-1, 1]) {
      P.cyl(M.steelDark, 0.03, 0.03, 0.2, s * 0.08, 1.46, 0.035, 'y', 12);
      P.cyl(M.ink, 0.024, 0.024, 0.1, s * 0.08, 1.62, 0.035, 'y', 12);
      P.cyl(M.steel, 0.018, 0.028, 0.05, s * 0.08, 1.69, 0.035, 'y', 12);
      P.cyl(M.ledGreen, 0.008, 0.008, 0.01, s * 0.08, 1.34, 0.062, 'z', 8);
    }
    P.ext(M.panel, -0.15, -0.02, 1.2, 1.3, -0.05, 0.05, 0.015); // tip dispenser
    P.cyl(M.steelDark, 0.03, 0.03, 0.06, -0.085, 1.17, 0.0, 'y', 12);
  }, group);
  return {group};
}

// ================================================================ laboratory
/** a lab bench: top at 0.90, 0.70 deep, under-bench drawers, a reagent shelf and an optional sink */
export function buildLabBench({len = 2.4, sink = true} = {}) {
  const M = mats();
  const L = Math.max(1.2, len);
  const group = new THREE.Group();
  tpl(`labbench|${L.toFixed(2)}|${sink}`, (P) => {
    P.ext(M.white, -L / 2, L / 2, 0.1, 0.86, -0.33, 0.3, 0.03); // carcass
    P.ext(M.shade, -L / 2 + 0.04, L / 2 - 0.04, 0.0, 0.11, -0.3, 0.24, 0.02);
    P.ext(M.inkSoft, -L / 2 - 0.02, L / 2 + 0.02, 0.86, 0.9, -0.36, 0.34, 0.018); // worktop
    const bays = Math.max(2, Math.round(L / 0.8));
    for (let i = 0; i < bays; i++) {
      const x0 = -L / 2 + (i * L) / bays + 0.03;
      const x1 = -L / 2 + ((i + 1) * L) / bays - 0.03;
      if (i % 2 === 0) {
        drawer(P, M.panel, x0, x1, 0.6, 0.82, 0.3);
        drawer(P, M.panel, x0, x1, 0.36, 0.58, 0.3);
        drawer(P, M.panel, x0, x1, 0.14, 0.34, 0.3);
      } else {
        P.ext(M.panel, x0, x1, 0.14, 0.82, 0.28, 0.3, 0.015);
        P.ext(M.steelDark, x1 - 0.06, x1 - 0.03, 0.44, 0.58, 0.3, 0.33, 0.01);
      }
    }
    // upstand + reagent shelf
    P.ext(M.panel, -L / 2, L / 2, 0.9, 1.06, -0.36, -0.32, 0.015);
    P.ext(M.white, -L / 2 + 0.04, L / 2 - 0.04, 1.3, 1.34, -0.36, -0.12, 0.015);
    for (const s of [-1, 1]) P.ext(M.steelDark, s * (L / 2 - 0.1), s * (L / 2 - 0.07), 1.06, 1.34, -0.35, -0.32, 0.012);
    const bottles = [HOS.mintLight, HOS.amberLight, HOS.roseLight, HOS.blueLight, HOS.oliveLight];
    for (let i = 0; i < Math.floor(L / 0.17); i++) {
      const x = -L / 2 + 0.12 + i * 0.17;
      P.cyl(paint(bottles[i % bottles.length], 0.4), 0.045, 0.05, 0.17, x, 1.43, -0.24, 'y', 12);
      P.cyl(M.white, 0.02, 0.02, 0.03, x, 1.53, -0.24, 'y', 10);
    }
    if (sink) {
      P.ext(M.steel, L / 2 - 0.58, L / 2 - 0.12, 0.78, 0.9, -0.28, 0.14, 0.02);
      P.ext(M.ink, L / 2 - 0.55, L / 2 - 0.15, 0.78, 0.8, -0.25, 0.11, 0.012);
      P.cyl(M.chrome, 0.015, 0.015, 0.3, L / 2 - 0.35, 1.03, -0.3, 'y', 10);
      P.add(cableG('lb-tap', [[L / 2 - 0.35, 1.16, -0.3], [L / 2 - 0.35, 1.22, -0.25], [L / 2 - 0.35, 1.16, -0.18]], 0.015), M.chrome);
      P.ext(M.ink, L / 2 - 0.4, L / 2 - 0.3, 1.02, 1.06, -0.36, -0.3, 0.012);
    }
    P.text('LABORATORY', {fg: HOS.inkSoft, weight: 700, px: 64}, 0.045, -L / 2 + 0.3, 1.14, -0.31);
  }, group);
  return {group, topY: 0.9, len: L};
}

/** a floor-standing chemistry analyser on castors: sample carousel, dark screen, an LED bar driven by setLights */
export function buildAnalyser({lights = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('analyser', (P) => {
    for (const x of [-0.38, 0.38]) for (const z of [-0.24, 0.24]) castor(P, x, z, 0.04);
    P.ext(M.white, -0.5, 0.5, 0.12, 1.3, -0.33, 0.3, 0.05); // body
    P.ext(M.shade, -0.47, 0.47, 0.1, 0.16, -0.3, 0.26, 0.02);
    P.groove(-0.48, 0.48, 0.62, 0.64, 0.305);
    P.groove(-0.48, 0.48, 0.98, 1.0, 0.305);
    P.ext(M.olive, -0.5, 0.5, 1.22, 1.3, -0.33, 0.305, 0.025); // accent band
    P.ext(M.ink, -0.3, 0.3, 0.68, 0.96, 0.3, 0.315, 0.018); // screen bezel
    P.ext(M.panel, -0.46, -0.34, 0.68, 0.96, 0.3, 0.312, 0.012); // LED strip plate
    P.ext(M.panel, 0.34, 0.46, 0.2, 0.58, 0.3, 0.312, 0.012); // reagent door
    P.ext(M.steelDark, 0.36, 0.44, 0.37, 0.4, 0.312, 0.34, 0.01);
    P.text('CHEM-400', {fg: HOS.inkSoft, weight: 800, px: 70}, 0.05, 0.0, 1.14, 0.308);
    P.text('SERUM / PLASMA', {fg: HOS.inkSoft, weight: 600, px: 50}, 0.028, -0.22, 0.2, 0.308);
    // the sample carousel on top, under a clear lid
    P.cyl(M.panel, 0.22, 0.22, 0.04, 0.0, 1.32, -0.02, 'y', 24);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      P.cyl(i % 3 === 0 ? M.fluidRed : M.panel, 0.017, 0.017, 0.08, Math.cos(a) * 0.17, 1.37, -0.02 + Math.sin(a) * 0.17, 'y', 8);
    }
    P.cyl(M.glass, 0.24, 0.24, 0.1, 0.0, 1.39, -0.02, 'y', 24);
    P.add(cableG('an-c', [[-0.4, 0.14, -0.3], [-0.5, 0.08, -0.42], [-0.36, 0.05, -0.5]], 0.014), M.rubber);
  }, group);
  const face = screenFace(group, 0.55, 0.26, miniTex('an', [['RUN 42 / 60', 26, '#7af2a4'], ['GLU  HbA1c  LFT', 22], ['QC PASS', 22, '#f2e2a0']]), 0, 0.82, 0.317);
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const m = part(cylG(0.014, 0.014, 0.012, 10), M.ledOff, group);
    m.rotation.x = PI / 2;
    m.position.set(-0.4, 0.74 + i * 0.05, 0.318);
    leds.push(m);
  }
  const set = ledSet(leds, M.ledAmber);
  const api = {
    group,
    setLights(k) {
      const n = Math.floor(((k % 1) + 1) % 1 * 5);
      set((i) => i <= n);
    },
    setOn: (b) => face.setOn(b),
  };
  api.setLights(lights);
  return api;
}

/** a benchtop centrifuge; setSpin(a) turns the rotor, setLid(k) lifts the lid. Place it on a bench top. */
export function buildCentrifuge({spin = 0, lid = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('centri', (P) => {
    P.ext(M.white, -0.23, 0.23, 0.0, 0.2, -0.21, 0.21, 0.035);
    P.cyl(M.shade, 0.17, 0.17, 0.04, 0, 0.2, 0, 'y', 22); // bowl rim
    P.cyl(M.inkSoft, 0.155, 0.155, 0.08, 0, 0.17, 0, 'y', 22);
    P.ext(M.ink, -0.1, 0.1, 0.05, 0.13, 0.21, 0.222, 0.015); // panel
    P.text('3000 rpm', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.025, 0.0, 0.17, 0.218);
    P.cyl(M.steelDark, 0.016, 0.016, 0.02, -0.16, 0.09, 0.218, 'z', 10);
  }, group);
  const face = screenFace(group, 0.14, 0.055, miniTex('cf', [['3000 rpm  05:00', 22, '#7af2a4']]), 0, 0.09, 0.225);
  const rotor = new THREE.Group();
  rotor.position.y = 0.21;
  group.add(rotor);
  tpl('centri-rotor', (P) => {
    P.cyl(M.steel, 0.14, 0.11, 0.05, 0, 0.0, 0, 'y', 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      P.add(M.steelDark, rb(0.035, 0.09, 0.035, 0.012), Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1, 0.25 * Math.sin(a), -a, 0.25 * Math.cos(a));
      P.cyl(i % 2 ? M.fluidRed : M.fluid, 0.011, 0.011, 0.05, Math.cos(a) * 0.1, 0.06, Math.sin(a) * 0.1, 'y', 8);
    }
    P.cyl(M.chrome, 0.02, 0.02, 0.07, 0, 0.04, 0, 'y', 12);
  }, rotor);
  const lidG = new THREE.Group();
  lidG.position.set(0, 0.24, -0.2);
  group.add(lidG);
  tpl('centri-lid', (P) => {
    P.add(M.glass, domeG(0.175), 0, -0.01, 0.2, 0, 0, 0, 1, 0.5, 1);
    P.ext(M.white, -0.2, 0.2, -0.03, 0.0, 0.0, 0.42, 0.02);
    P.ext(M.steelDark, -0.06, 0.06, -0.02, 0.02, 0.4, 0.44, 0.012);
  }, lidG);
  const api = {
    group,
    setSpin(a) {
      rotor.rotation.y = a;
    },
    setLid(k) {
      lidG.rotation.x = -clamp(k, 0, 1) * 1.4;
    },
    setOn: (b) => face.setOn(b),
  };
  api.setSpin(spin);
  api.setLid(lid);
  return api;
}

/** a benchtop microscope: base, arm, stage, turret, eyepiece. Place it on a bench top. */
export function buildMicroscope() {
  const M = mats();
  const group = new THREE.Group();
  tpl('micro', (P) => {
    P.ext(M.inkSoft, -0.11, 0.11, 0.0, 0.05, -0.13, 0.15, 0.025); // foot
    P.ext(M.ink, -0.07, 0.07, 0.05, 0.34, -0.12, -0.03, 0.03); // arm
    P.add(M.ink, rb(0.11, 0.2, 0.12, 0.04), 0.0, 0.42, -0.04, 0.4, 0, 0); // head
    P.cyl(M.steelDark, 0.022, 0.028, 0.1, 0.0, 0.52, 0.06, 'x', 12);
    P.add(M.ink, cylG(0.026, 0.026, 0.11, 12), 0, 0.54, 0.08, -0.9, 0, 0); // eyepiece
    P.ext(M.steel, -0.1, 0.1, 0.19, 0.22, -0.04, 0.14, 0.012); // stage
    P.ext(M.ink, -0.07, 0.07, 0.22, 0.235, -0.01, 0.1, 0.008);
    P.add(M.glass, rb(0.05, 0.004, 0.03, 0.002), 0.0, 0.24, 0.05); // slide
    P.cyl(M.ink, 0.045, 0.045, 0.035, 0.0, 0.3, 0.05, 'y', 14); // turret
    for (const [dx, h] of [[-0.025, 0.055], [0.0, 0.075], [0.025, 0.045]]) P.cyl(M.steelDark, 0.011, 0.009, h, dx, 0.3 - 0.018 - h / 2, 0.05, 'y', 10);
    P.cyl(M.steelDark, 0.024, 0.024, 0.016, -0.075, 0.26, -0.02, 'x', 12); // focus knob
    P.cyl(M.steelDark, 0.024, 0.024, 0.016, 0.075, 0.26, -0.02, 'x', 12);
    P.cyl(M.lamp, 0.02, 0.02, 0.012, 0.0, 0.14, 0.05, 'y', 12);
    P.add(cableG('mi-c', [[-0.06, 0.03, -0.12], [-0.14, 0.02, -0.2], [-0.04, 0.015, -0.26]], 0.01), M.rubber);
  }, group);
  return {group};
}

/** the blood-draw chair: padded seat at 0.48 with a hinged arm board */
export function buildPhlebotomyChair() {
  const M = mats();
  const group = new THREE.Group();
  tpl('phleb', (P) => {
    P.ext(M.steelDark, -0.3, 0.3, 0.02, 0.1, -0.3, 0.3, 0.03);
    for (const x of [-0.26, 0.26]) for (const z of [-0.26, 0.26]) P.cyl(M.ink, 0.03, 0.03, 0.03, x, 0.015, z, 'y', 10);
    P.ext(M.steel, -0.24, 0.24, 0.1, 0.4, -0.22, 0.22, 0.03);
    P.add(M.mint, rb(0.56, 0.1, 0.5, 0.045), 0, 0.44, 0.02); // seat
    P.add(M.mint, rb(0.56, 0.6, 0.12, 0.05), 0, 0.76, -0.24, 0.1, 0, 0); // back
    P.add(M.mintDeep, rb(0.3, 0.16, 0.1, 0.04), 0, 1.1, -0.3, 0.1, 0, 0); // head pad
    for (const s of [-1, 1]) {
      P.ext(M.steelDark, s * 0.3 - 0.025, s * 0.3 + 0.025, 0.49, 0.66, -0.16, 0.2, 0.015);
      P.add(M.mintLight, rb(0.14, 0.07, 0.42, 0.03), s * 0.3, 0.69, 0.04);
    }
    P.text('PHLEBOTOMY', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.035, 0, 0.26, 0.225);
  }, group);
  const arm = new THREE.Group();
  arm.position.set(0.3, 0.72, 0.2);
  group.add(arm);
  tpl('phleb-arm', (P) => {
    P.add(M.mintLight, rb(0.16, 0.05, 0.3, 0.025), 0, 0, 0.14);
    P.ext(M.steelDark, -0.02, 0.02, -0.03, 0.0, 0.0, 0.26, 0.01);
  }, arm);
  return {
    group,
    setArm(k) {
      arm.rotation.x = -clamp(k, 0, 1) * 1.1;
    },
  };
}

/** the specimen pass-through hatch in a wall facing +z; setHatch(k) slides the window */
export function buildSpecimenHatch({hatch = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('hatch', (P) => {
    P.ext(M.white, -0.5, 0.5, 0.9, 1.6, -0.1, 0.06, 0.03); // surround
    P.ext(M.inkSoft, -0.42, 0.42, 0.98, 1.02, -0.1, 0.07, 0.015); // the shelf
    P.ext(M.steelDark, -0.44, 0.44, 1.02, 1.5, -0.08, -0.05, 0.015); // the reveal
    P.ext(M.olive, -0.5, 0.5, 1.52, 1.6, -0.1, 0.065, 0.02);
    P.text('SPECIMENS', {fg: HOS.white, weight: 800, px: 86}, 0.065, 0, 1.56, 0.07);
    P.text('Place sample on the shelf', {fg: HOS.inkSoft, weight: 600, px: 54}, 0.032, 0, 0.94, 0.065);
    // a tube rack and a form on the shelf
    P.ext(M.panel, 0.12, 0.34, 1.02, 1.08, -0.06, 0.03, 0.015);
    for (let i = 0; i < 4; i++) P.cyl(M.fluidRed, 0.012, 0.012, 0.08, 0.16 + i * 0.05, 1.11, -0.015, 'y', 8);
    P.add(M.white, rb(0.18, 0.004, 0.12, 0.002), -0.2, 1.025, 0.0);
  }, group);
  const win = part(rb(0.44, 0.46, 0.02, 0.01), M.glass, group);
  win.position.set(0, 1.26, -0.03);
  return {
    group,
    setHatch(k) {
      win.position.x = clamp(k, 0, 1) * 0.44;
    },
  };
}

/** a benchtop rack of specimen tubes with coloured caps */
export function buildTubeRack() {
  const M = mats();
  const group = new THREE.Group();
  tpl('tuberack', (P) => {
    P.ext(M.white, -0.17, 0.17, 0.0, 0.07, -0.11, 0.11, 0.015);
    P.ext(M.panel, -0.17, 0.17, 0.07, 0.09, -0.11, 0.11, 0.008);
    const caps = [HOS.rose, HOS.amber, HOS.mint, HOS.violet, HOS.blue];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const x = -0.13 + c * 0.065;
        const z = -0.075 + r * 0.05;
        P.cyl(M.glass, 0.014, 0.014, 0.11, x, 0.13, z, 'y', 8);
        P.cyl(M.fluidRed, 0.012, 0.012, 0.05, x, 0.1, z, 'y', 8);
        P.cyl(paint(caps[(r + c) % caps.length], 0.5), 0.016, 0.016, 0.02, x, 0.19, z, 'y', 8);
      }
    }
    P.text('LAB', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.025, 0, 0.035, 0.115);
  }, group);
  return {group};
}

/** the medicine fridge: glass door (setDoor), shelves of boxes, a temperature badge */
export function buildFridge({door = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('fridge', (P) => {
    P.ext(M.white, -0.32, 0.32, 0.06, 1.8, -0.3, 0.26, 0.04);
    P.ext(M.shade, -0.29, 0.29, 0.0, 0.08, -0.27, 0.22, 0.02);
    P.ext(M.ink, -0.28, 0.28, 0.1, 1.72, -0.26, -0.2, 0.02); // dark interior back
    for (let i = 0; i < 4; i++) {
      const y = 0.32 + i * 0.36;
      P.ext(M.panel, -0.27, 0.27, y, y + 0.02, -0.26, 0.2, 0.008);
      const cols = [HOS.mintLight, HOS.amberLight, HOS.blueLight, HOS.roseLight];
      for (let j = 0; j < 5; j++) P.add(paint(cols[(i + j) % 4], 0.6), rb(0.09, 0.14, 0.26, 0.012), -0.21 + j * 0.105, y + 0.09, -0.05);
    }
    P.ext(M.blue, -0.32, 0.32, 1.72, 1.8, -0.3, 0.265, 0.02);
    P.text('VACCINE FRIDGE', {fg: HOS.white, weight: 800, px: 80}, 0.055, 0, 1.76, 0.27);
  }, group);
  const badge = screenFace(group, 0.16, 0.08, miniTex('fr', [['+4.2 C', 40, '#7fd8f2']]), -0.14, 1.64, 0.27);
  const doorG = new THREE.Group();
  doorG.position.set(-0.32, 0, 0.26);
  group.add(doorG);
  tpl('fridge-door', (P) => {
    P.ext(M.steelDark, 0.0, 0.64, 0.1, 1.7, 0.0, 0.04, 0.018);
    P.ext(M.glass, 0.04, 0.6, 0.14, 1.66, 0.012, 0.028, 0.006);
    P.ext(M.steelDark, 0.54, 0.6, 0.7, 1.1, 0.04, 0.08, 0.014); // handle
  }, doorG);
  const api = {
    group,
    setDoor(k) {
      doorG.rotation.y = -clamp(k, 0, 1) * 1.9;
    },
    setOn: (b) => badge.setOn(b),
  };
  api.setDoor(door);
  return api;
}

// ================================================================ imaging
/** the X-ray room: table deck at 0.70, a tube on a floor column that slides along the table, an upright bucky */
export function buildXrayTable({tube = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('xray', (P) => {
    // table
    P.ext(M.white, -0.26, 0.26, 0.08, 0.6, -0.5, 0.5, 0.05); // pedestal
    P.ext(M.shade, -0.24, 0.24, 0.0, 0.1, -0.46, 0.46, 0.02);
    P.ext(M.panel, -0.38, 0.38, 0.6, 0.66, -1.1, 1.1, 0.03); // table frame
    P.add(M.white, rb(0.74, 0.06, 2.2, 0.03), 0, 0.69, 0); // table top
    P.groove(-0.36, 0.36, 0.63, 0.645, 1.105);
    P.ext(M.inkSoft, -0.3, 0.3, 0.58, 0.63, -0.3, 0.42, 0.02); // the bucky tray
    P.ext(M.steelDark, -0.08, 0.08, 0.57, 0.62, 0.42, 0.5, 0.012);
    P.text('TABLE 1', {fg: HOS.inkSoft, weight: 700, px: 60}, 0.04, 0, 0.3, 0.265);
    // the tube column: a floor rail with a vertical column
    P.ext(M.steelDark, -1.0, -0.86, 0.0, 0.06, -1.3, 1.3, 0.02);
    // the upright bucky behind the table
    P.ext(M.white, 0.9, 1.3, 0.3, 2.0, -0.2, -0.1, 0.03);
    P.ext(M.inkSoft, 0.94, 1.26, 0.8, 1.76, -0.1, -0.07, 0.015);
    P.ext(M.steelDark, 1.04, 1.16, 0.0, 0.32, -0.22, -0.08, 0.02);
    P.text('CHEST STAND', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.035, 1.1, 0.42, -0.07, 0);
  }, group);
  // the tube carriage, sliding along z
  const carriage = new THREE.Group();
  group.add(carriage);
  tpl('xray-tube', (P) => {
    P.ext(M.steel, -0.99, -0.87, 0.06, 2.3, -0.06, 0.06, 0.03); // column
    P.ext(M.panel, -0.99, -0.87, 0.06, 0.2, -0.08, 0.08, 0.02);
    P.ext(M.steel, -0.95, -0.1, 1.72, 1.82, -0.05, 0.05, 0.03); // the arm over the table
    P.cyl(M.panel, 0.13, 0.13, 0.3, 0.0, 1.66, 0.0, 'x', 20); // tube housing
    P.ext(M.ink, -0.09, 0.09, 1.4, 1.56, -0.09, 0.09, 0.02); // collimator
    P.ext(M.steelDark, -0.07, 0.07, 1.36, 1.41, -0.07, 0.07, 0.012);
    P.cyl(M.ledBlue, 0.03, 0.03, 0.006, 0.0, 1.355, 0.0, 'y', 14); // the light field
    P.text('80 kV', {fg: HOS.inkSoft, weight: 700, px: 54}, 0.035, 0.0, 1.58, 0.135);
    P.add(cableG('xr-c', [[-0.9, 1.78, 0.0], [-0.72, 1.6, 0.12], [-0.4, 1.68, 0.06], [-0.1, 1.74, 0.0]], 0.018), M.rubber);
  }, carriage);
  const api = {
    group,
    deck: 0.72,
    setTube(z) {
      carriage.position.z = clamp(z, -1.0, 1.0);
    },
  };
  api.setTube(tube);
  return api;
}

/** the radiographer's booth: a leaded screen with a window and a console */
export function buildXrayBooth() {
  const M = mats();
  const group = new THREE.Group();
  tpl('xbooth', (P) => {
    P.ext(M.panel, -0.8, 0.8, 0.0, 2.1, -0.08, 0.04, 0.03); // the lead screen
    P.ext(M.violetLight, -0.8, 0.8, 1.98, 2.1, -0.08, 0.045, 0.02);
    P.ext(M.steelDark, -0.6, 0.6, 1.2, 1.86, -0.08, -0.05, 0.015);
    P.ext(M.glass, -0.58, 0.58, 1.22, 1.84, -0.07, -0.055, 0.006);
    P.text('CONTROLLED AREA', {fg: HOS.inkSoft, weight: 700, px: 62}, 0.045, 0, 2.04, 0.05);
    P.text('X-RAY', {fg: HOS.white, bg: HOS.rose, weight: 800, px: 80}, 0.07, -0.56, 0.95, 0.05);
    // the console desk on the operator side (-z)
    P.ext(M.white, -0.7, 0.7, 0.1, 0.78, -0.62, -0.1, 0.03);
    P.ext(M.panel, -0.74, 0.74, 0.78, 0.82, -0.66, -0.08, 0.02);
    P.ext(M.ink, -0.34, 0.34, 0.82, 0.86, -0.56, -0.26, 0.015); // keypad
    for (let i = 0; i < 8; i++) P.cyl(M.steelDark, 0.016, 0.016, 0.012, -0.3 + i * 0.085, 0.86, -0.42, 'y', 8);
    P.cyl(M.ledGreen, 0.03, 0.03, 0.02, 0.44, 0.86, -0.42, 'y', 14); // the exposure button
    P.cyl(M.rose, 0.038, 0.038, 0.016, 0.56, 0.855, -0.42, 'y', 14);
    P.text('EXPOSE', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.028, 0.5, 0.835, -0.3);
  }, group);
  const face = screenFace(group, 0.5, 0.33, ctConsoleTex(), -0.22, 1.08, -0.22, PI, -0.15);
  tpl('xbooth-mon', (P) => {
    P.ext(M.ink, -0.48, 0.02, 0.88, 1.26, -0.22, -0.18, 0.02);
    P.cyl(M.ink, 0.04, 0.06, 0.08, -0.22, 0.86, -0.2, 'y', 12);
  }, group);
  return {group, setOn: (b) => face.setOn(b)};
}

/**
 * The CT scanner. Gantry outer diameter 2.3, 0.9 thick, bore centre at 1.15; the pallet runs along z into the bore
 * with the head end at -z. setBed(k): 0 = fully out, 1 = head at the bore centre. setRing(a): the rotating element.
 */
export function buildCTScanner({bed = 0, ring = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const BORE = 0.37;
  const GZ = -0.85; // the gantry's centre in z
  tpl('ct-gantry', (P) => {
    // the plinth under the gantry
    P.ext(M.panel, -1.2, 1.2, 0.0, 0.16, GZ - 0.5, GZ + 0.5, 0.04);
    P.ext(M.shade, -1.16, 1.16, 0.0, 0.05, GZ - 0.46, GZ + 0.46, 0.02);
    // the housing: a rounded square plate with the bore cut through it
    P.add(M.white, holedPlate('ct', 2.4, 2.32, BORE + 0.04, 0.86, 0.34, 0.06), 0, 1.15, GZ);
    // the blue trim ring around the bore on the front face
    P.add(M.blueLight, torusG(BORE + 0.075, 0.035, 40), 0, 1.15, GZ + 0.43);
    P.add(M.steelDark, tubeG(BORE + 0.02, BORE + 0.02, 0.86, 30), 0, 1.15, GZ, PI / 2);
    // panel lines and the badge on the front face
    P.groove(-1.0, 1.0, 2.05, 2.08, GZ + 0.436);
    P.groove(-1.0, 1.0, 0.3, 0.33, GZ + 0.436);
    P.text('CT 64', {fg: HOS.ink, weight: 800, px: 110}, 0.12, -0.72, 1.98, GZ + 0.44);
    P.text('AXIAL SCANNER', {fg: HOS.inkSoft, weight: 600, px: 60}, 0.045, -0.705, 1.86, GZ + 0.44);
    // the side control panel and the status lamps over the bore
    P.ext(M.panel, 0.62, 1.1, 1.3, 1.5, GZ + 0.436, GZ + 0.45, 0.015);
    for (let i = 0; i < 4; i++) P.cyl(M.steelDark, 0.022, 0.022, 0.014, 0.72 + i * 0.1, 1.36, GZ + 0.452, 'z', 10);
    P.text('TILT  0.0', {fg: HOS.inkSoft, weight: 700, px: 52}, 0.03, 0.86, 1.46, GZ + 0.45);
    // the warning strip across the top of the front face
    P.ext(M.amber, -0.86, 0.86, 2.08, 2.14, GZ + 0.43, GZ + 0.46, 0.02);
    // the pallet base column
    P.ext(M.white, -0.3, 0.3, 0.06, 0.95, 0.5, 1.3, 0.05);
    P.ext(M.shade, -0.33, 0.33, 0.0, 0.08, 0.46, 1.34, 0.025);
    P.groove(-0.28, 0.28, 0.5, 0.52, 1.305);
    P.ext(M.blue, -0.3, 0.3, 0.86, 0.95, 0.5, 1.305, 0.02);
    P.text('PATIENT TABLE', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.035, 0, 0.72, 0.31);
    P.ext(M.steelDark, -0.14, 0.14, 0.0, 0.04, 1.3, 1.46, 0.015); // foot pedal
    P.add(cableG('ct-cab', [[0.3, 0.1, 1.2], [0.6, 0.06, 1.0], [0.9, 0.05, 1.3]], 0.02), M.rubber);
  }, group);
  // the status lamp over the bore
  const lamp = part(rb(0.3, 0.07, 0.03, 0.02), M.ledAmber, group);
  lamp.position.set(0, 1.78, GZ + 0.45);
  // the rotating element inside the bore: a ring with a detector block, seen through the bore
  const ringG = new THREE.Group();
  ringG.position.set(0, 1.15, GZ);
  group.add(ringG);
  tpl('ct-ring', (P) => {
    P.add(M.steelDark, torusG(BORE - 0.05, 0.035, 30), 0, 0, 0);
    P.add(M.ink, rb(0.16, 0.1, 0.34, 0.03), 0, BORE - 0.07, 0); // the tube housing
    P.add(M.inkSoft, rb(0.13, 0.07, 0.3, 0.025), 0, -(BORE - 0.07), 0); // the detector bank
    P.cyl(M.ledBlue, 0.022, 0.022, 0.3, BORE - 0.07, 0, 0, 'z', 10);
  }, ringG);
  // the pallet
  const pallet = new THREE.Group();
  group.add(pallet);
  tpl('ct-pallet', (P) => {
    P.add(M.panel, rb(0.52, 0.07, 2.1, 0.03), 0, 1.02, 0);
    P.add(M.linen, rb(0.46, 0.035, 1.9, 0.015), 0, 1.07, 0.02);
    P.add(M.pillow, rb(0.34, 0.07, 0.26, 0.035), 0, 1.11, -0.86); // head rest
    P.ext(M.steelDark, -0.26, 0.26, 0.96, 1.0, 0.6, 1.0, 0.015);
    P.text('HEAD', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.03, 0.2, 1.056, -1.0, 0, -PI / 2);
  }, pallet);
  const api = {
    group,
    bore: {y: 1.15, z: GZ, r: BORE},
    setBed(k) {
      pallet.position.z = lerp(1.05, GZ + 0.95, clamp(k, 0, 1));
    },
    setRing(a) {
      ringG.rotation.z = a;
    },
    setOn(b) {
      lamp.material = b ? mats().ledAmber : mats().ledOff;
    },
  };
  api.setBed(bed);
  api.setRing(ring);
  return api;
}

/** an ultrasound cart: console, monitor on an arm, three probes on coiled leads */
export function buildUltrasound() {
  const M = mats();
  const group = new THREE.Group();
  tpl('us', (P) => {
    for (const x of [-0.26, 0.26]) for (const z of [-0.2, 0.2]) castor(P, x, z, 0.045);
    P.ext(M.white, -0.34, 0.34, 0.12, 0.84, -0.26, 0.24, 0.045); // body
    P.ext(M.shade, -0.31, 0.31, 0.1, 0.16, -0.23, 0.2, 0.02);
    P.groove(-0.32, 0.32, 0.48, 0.5, 0.245);
    P.ext(M.teal, -0.34, 0.34, 0.76, 0.84, -0.26, 0.245, 0.02);
    P.add(M.panel, rb(0.68, 0.07, 0.5, 0.03), 0, 0.88, 0.04, -0.14, 0, 0); // console
    P.ext(M.ink, -0.26, 0.26, 0.9, 0.93, 0.08, 0.26, 0.012);
    for (let i = 0; i < 7; i++) P.cyl(M.steelDark, 0.016, 0.016, 0.014, -0.24 + i * 0.08, 0.95, -0.08, 'y', 8);
    P.cyl(M.teal, 0.045, 0.045, 0.02, 0.28, 0.95, -0.04, 'y', 16); // trackball
    P.text('SONO-7', {fg: HOS.inkSoft, weight: 800, px: 64}, 0.045, -0.2, 0.8, 0.248);
    // the monitor arm
    P.cyl(M.steelDark, 0.035, 0.035, 0.34, -0.02, 1.04, -0.18, 'y', 12);
    P.ext(M.ink, -0.3, 0.26, 1.2, 1.56, -0.2, -0.16, 0.02);
    // three probes in holders, with coiled leads
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.1;
      P.ext(M.panel, x - 0.03, x + 0.03, 0.9, 0.98, 0.16, 0.24, 0.012);
      P.add(M.ink, rb(0.04, 0.14, 0.04, 0.015), x, 1.03, 0.2);
      P.add(coilG(`us-p${i}`, x, 0.9, 0.2, 2, 0.045, 0.14, 0.009), M.rubber);
    }
    P.cyl(M.fluid, 0.035, 0.035, 0.14, 0.3, 0.95, 0.2, 'y', 12); // gel bottle
  }, group);
  const face = screenFace(group, 0.5, 0.33, usTex(), -0.02, 1.38, -0.155);
  return {group, setOn: (b) => face.setOn(b)};
}

/** an ECG cart: the recorder, a printed strip, a bundle of lead wires */
export function buildEKGCart() {
  const M = mats();
  const group = new THREE.Group();
  tpl('ekg', (P) => {
    for (const x of [-0.2, 0.2]) for (const z of [-0.16, 0.16]) castor(P, x, z, 0.04);
    P.ext(M.steel, -0.24, 0.24, 0.12, 0.17, -0.2, 0.2, 0.02); // lower shelf
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.21, 0.14, -0.17], [s * 0.21, 0.86, -0.17], 0.018, 8);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.21, 0.14, 0.17], [s * 0.21, 0.86, 0.17], 0.018, 8);
    P.ext(M.panel, -0.26, 0.26, 0.82, 0.88, -0.22, 0.22, 0.02); // top shelf
    P.ext(M.white, -0.24, 0.24, 0.88, 1.06, -0.2, 0.18, 0.03); // the recorder
    P.ext(M.ink, -0.22, 0.0, 0.92, 1.03, 0.18, 0.19, 0.012); // screen bezel
    P.ext(M.panel, 0.02, 0.22, 0.92, 1.03, 0.18, 0.19, 0.012);
    for (let i = 0; i < 6; i++) P.cyl(M.steelDark, 0.013, 0.013, 0.012, 0.05 + (i % 3) * 0.07, 0.95 + Math.floor(i / 3) * 0.05, 0.195, 'z', 8);
    P.ext(M.shade, -0.2, 0.2, 1.06, 1.08, -0.16, 0.04, 0.01); // paper slot
    P.text('ECG 12-LEAD', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.035, 0.0, 0.9, 0.192);
    // the lead bundle hanging on the side
    P.add(coilG('ekg-l', 0.23, 0.84, 0.0, 3, 0.09, 0.4, 0.011), M.rubber);
    for (let i = 0; i < 4; i++) P.cyl(i % 2 ? M.red : M.ledGreen, 0.013, 0.013, 0.03, 0.26 + i * 0.02, 0.42 + i * 0.015, 0.05, 'y', 8);
    P.ext(M.cardboard, -0.2, 0.0, 0.17, 0.3, -0.16, 0.12, 0.02); // the paper box
    P.text('PAPER', {fg: HOS.inkSoft, weight: 700, px: 46}, 0.022, -0.1, 0.24, 0.125);
  }, group);
  const face = screenFace(group, 0.2, 0.1, monitorTex(0), -0.11, 0.975, 0.193);
  const strip = part(rb(0.2, 0.004, 0.22, 0.002), M.white, group);
  strip.position.set(0, 1.07, 0.1);
  strip.rotation.x = 0.5;
  return {group, setOn: (b) => face.setOn(b)};
}

/** a rack of lead aprons and a thyroid collar */
export function buildLeadApronRack() {
  const M = mats();
  const group = new THREE.Group();
  tpl('apron', (P) => {
    for (const x of [-0.3, 0.3]) for (const z of [-0.16, 0.16]) castor(P, x, z, 0.04);
    P.ext(M.steelDark, -0.34, 0.34, 0.1, 0.15, -0.06, 0.06, 0.02);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.3, 0.12, 0], [s * 0.3, 1.5, 0], 0.02, 8);
    P.ext(M.steel, -0.32, 0.32, 1.46, 1.52, -0.03, 0.03, 0.02);
    const cols = [HOS.rose, HOS.violet, HOS.teal, HOS.amber];
    for (let i = 0; i < 4; i++) {
      const x = -0.22 + i * 0.15;
      P.cyl(M.steelDark, 0.02, 0.02, 0.06, x, 1.46, 0.0, 'z', 10);
      const C = paint(cols[i], 0.62);
      P.add(C, rb(0.11, 0.62, 0.1, 0.045), x, 1.12, 0.0); // the body of the apron
      P.add(C, rb(0.1, 0.16, 0.09, 0.04), x, 1.42, 0.0);
      P.add(C, rb(0.12, 0.12, 0.11, 0.05), x, 0.8, 0.0);
    }
    P.ext(M.rose, -0.1, 0.1, 0.5, 0.62, -0.05, 0.05, 0.035); // the thyroid collar
    P.text('LEAD APRONS', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.04, 0, 0.26, 0.07);
    P.ext(M.white, -0.2, 0.2, 0.2, 0.32, -0.012, 0.012, 0.015);
  }, group);
  return {group};
}

/** the reporting station: a desk with two or three screens of films, a keyboard and a dictation mic */
export function buildViewingStation({screens = 2} = {}) {
  const M = mats();
  const n = clamp(Math.round(screens), 1, 3);
  const group = new THREE.Group();
  tpl(`viewst|${n}`, (P) => {
    P.ext(M.inkSoft, -0.8, 0.8, 0.72, 0.76, -0.35, 0.35, 0.02);
    P.ext(M.white, -0.78, -0.4, 0.08, 0.72, -0.33, 0.3, 0.03);
    for (let i = 0; i < 3; i++) drawer(P, M.panel, -0.75, -0.43, 0.14 + i * 0.19, 0.3 + i * 0.19, 0.3);
    P.ext(M.white, 0.66, 0.78, 0.06, 0.72, -0.33, 0.3, 0.02);
    P.ext(M.ink, -0.3, 0.3, 0.76, 0.79, -0.04, 0.16, 0.012); // keyboard
    P.cyl(M.ink, 0.05, 0.07, 0.03, 0.44, 0.78, 0.1, 'y', 14); // dictation mic base
    P.rod(M.ink, [0.44, 0.78, 0.1], [0.44, 0.96, 0.02], 0.009, 8);
    P.add(M.inkSoft, rb(0.05, 0.08, 0.05, 0.02), 0.44, 0.99, 0.0);
    // the monitor stand
    P.cyl(M.ink, 0.08, 0.1, 0.03, 0, 0.78, -0.24, 'y', 16);
    P.ext(M.ink, -0.03, 0.03, 0.78, 1.1, -0.26, -0.22, 0.015);
    P.ext(M.ink, -(n * 0.27), n * 0.27, 1.06, 1.1, -0.26, -0.22, 0.015);
    P.text('RADIOLOGY', {fg: HOS.inkSoft, weight: 700, px: 60}, 0.04, -0.6, 0.6, 0.305);
  }, group);
  const faces = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 0.54;
    const ry = -x * 0.25;
    tpl(`viewst-m${i}|${n}`, (P) => {
      P.add(M.ink, rb(0.5, 0.64, 0.04, 0.02), x, 1.44, -0.22, 0, ry, 0);
      P.ext(M.ink, x - 0.03, x + 0.03, 1.08, 1.16, -0.24, -0.2, 0.012);
    }, group);
    faces.push(screenFace(group, 0.45, 0.58, filmTex(i % 2 ? 'knee' : 'chest'), x + Math.sin(ry) * 0.025, 1.44, -0.197 + Math.cos(ry) * 0.004, ry));
  }
  return {group, setOn: (b) => faces.forEach((f) => f.setOn(b))};
}

// ================================================================ pharmacy
/** the dispensary shelf: 2.05 tall, 0.50 deep, bays of medicine boxes with printed bin labels */
export function buildPharmShelf({bays = 3} = {}) {
  const M = mats();
  const n = clamp(Math.round(bays), 1, 6);
  const bw = 0.9;
  const W = n * bw;
  const group = new THREE.Group();
  tpl(`pshelf|${n}`, (P) => {
    P.ext(M.white, -W / 2, W / 2, 0, 2.05, -0.25, -0.2, 0.025); // back
    P.ext(M.white, -W / 2, W / 2, 1.98, 2.05, -0.25, 0.25, 0.025); // top
    P.ext(M.white, -W / 2, W / 2, 0.0, 0.12, -0.25, 0.25, 0.025); // plinth
    P.ext(M.shade, -W / 2 + 0.03, W / 2 - 0.03, 0.02, 0.1, -0.22, 0.22, 0.02);
    for (let i = 0; i <= n; i++) P.ext(M.panel, -W / 2 + i * bw - 0.02, -W / 2 + i * bw + 0.02, 0.1, 2.0, -0.25, 0.25, 0.012);
    const cols = [HOS.amberLight, HOS.white, HOS.mintLight, HOS.blueLight, HOS.panel, HOS.roseLight];
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 + i * bw + 0.05;
      for (let s = 0; s < 6; s++) {
        const y = 0.14 + s * 0.31;
        P.ext(M.white, x0 - 0.01, x0 + bw - 0.09, y, y + 0.02, -0.24, 0.24, 0.008);
        for (let j = 0; j < 7; j++) {
          const c = cols[(i * 3 + s * 2 + j) % cols.length];
          P.add(paint(c, 0.66), rb(0.1, 0.2, 0.3, 0.015), x0 + 0.055 + j * 0.112, y + 0.12, 0.0);
        }
        P.ext(M.amber, x0 - 0.01, x0 + bw - 0.09, y + 0.02, y + 0.05, 0.24, 0.26, 0.008); // bin label strip
      }
      P.text(`BAY ${i + 1}`, {fg: HOS.white, bg: HOS.amber, weight: 800, px: 76}, 0.085, x0 + bw / 2 - 0.05, 1.96, 0.26);
    }
    P.text('PHARMACY STOCK', {fg: HOS.inkSoft, weight: 700, px: 70}, 0.06, 0, 0.06, 0.26);
  }, group);
  return {group, w: W};
}

/** the dispensing counter: numbered windows, glazed screens, a basket of prescriptions */
export function buildDispenseCounter({windows = 2} = {}) {
  const M = mats();
  const n = clamp(Math.round(windows), 1, 4);
  const pitch = 1.5;
  const W = n * pitch;
  const group = new THREE.Group();
  tpl(`disp|${n}`, (P) => {
    P.ext(M.white, -W / 2, W / 2, 0.08, 1.0, -0.35, 0.3, 0.05);
    P.ext(M.panel, -W / 2 - 0.04, W / 2 + 0.04, 1.0, 1.05, -0.38, 0.35, 0.025);
    P.ext(M.amber, -W / 2, W / 2, 0.74, 0.86, 0.3, 0.34, 0.02);
    P.ext(M.shade, -W / 2 + 0.05, W / 2 - 0.05, 0.02, 0.1, -0.3, 0.26, 0.02);
    P.groove(-W / 2 + 0.06, W / 2 - 0.06, 0.24, 0.26, 0.31);
    for (let i = 0; i <= n; i++) P.ext(M.steelDark, -W / 2 + i * pitch - 0.03, -W / 2 + i * pitch + 0.03, 1.05, 1.9, -0.03, 0.03, 0.02);
    P.ext(M.steelDark, -W / 2, W / 2, 1.84, 1.9, -0.03, 0.03, 0.02);
    for (let i = 0; i < n; i++) {
      const cx = -W / 2 + pitch * (i + 0.5);
      P.ext(M.glass, cx - pitch / 2 + 0.05, cx + pitch / 2 - 0.05, 1.3, 1.84, -0.012, 0.012, 0.005);
      P.ext(M.steelDark, cx - 0.3, cx + 0.3, 1.22, 1.3, -0.04, 0.04, 0.015);
      P.text(`${i + 1}`, {fg: HOS.white, bg: HOS.amber, weight: 800, px: 110}, 0.14, cx, 1.68, 0.03);
      P.text('DISPENSING', {fg: HOS.ink, weight: 800, px: 84}, 0.075, cx, 0.8, 0.345);
      // a basket of prescriptions and a bag of medicine on the counter
      P.ext(M.panel, cx - 0.3, cx - 0.02, 1.05, 1.13, -0.16, 0.14, 0.02);
      for (let j = 0; j < 4; j++) P.add(M.white, rb(0.22, 0.004, 0.16, 0.002), cx - 0.16, 1.14 + j * 0.006, -0.01, 0, j * 0.1, 0);
      P.add(M.white, rb(0.2, 0.26, 0.1, 0.02), cx + 0.3, 1.18, 0.0);
      P.text('Rx', {fg: HOS.amber, weight: 800, px: 70}, 0.06, cx + 0.3, 1.2, 0.052);
    }
  }, group);
  const face = screenFace(group, Math.min(0.9, W * 0.3), 0.3, kioskTex(), 0, 2.1, 0.0);
  tpl(`disp-sign|${n}`, (P) => {
    P.ext(M.white, -Math.min(0.5, W * 0.17), Math.min(0.5, W * 0.17), 1.92, 2.3, -0.03, 0.0, 0.02);
  }, group);
  return {group, setOn: (b) => face.setOn(b)};
}

/** the packing bench: bags, a label printer, baskets of scripts */
export function buildPackingTable() {
  const M = mats();
  const group = new THREE.Group();
  tpl('packtable', (P) => {
    P.ext(M.white, -0.8, 0.8, 0.1, 0.86, -0.32, 0.3, 0.03);
    P.ext(M.shade, -0.76, 0.76, 0.0, 0.11, -0.28, 0.26, 0.02);
    P.ext(M.wood, -0.84, 0.84, 0.86, 0.9, -0.36, 0.34, 0.018);
    for (let i = 0; i < 3; i++) drawer(P, M.panel, -0.74, -0.3, 0.16 + i * 0.22, 0.34 + i * 0.22, 0.3);
    P.ext(M.panel, 0.0, 0.76, 0.14, 0.82, 0.28, 0.3, 0.015);
    // the bag roll on a spindle, a label printer, two baskets
    P.cyl(M.steelDark, 0.016, 0.016, 0.5, -0.4, 1.05, -0.26, 'x', 10);
    P.cyl(M.white, 0.08, 0.08, 0.4, -0.4, 1.05, -0.26, 'x', 18);
    for (const s of [-1, 1]) P.rod(M.steelDark, [-0.4 + s * 0.22, 0.9, -0.26], [-0.4 + s * 0.22, 1.05, -0.26], 0.012, 8);
    P.ext(M.white, 0.2, 0.52, 0.9, 1.06, -0.26, 0.0, 0.025); // label printer
    P.ext(M.ink, 0.22, 0.5, 1.06, 1.08, -0.24, -0.02, 0.01);
    P.add(M.white, rb(0.1, 0.004, 0.06, 0.002), 0.36, 1.085, 0.03);
    P.text('LABELS', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.028, 0.36, 0.96, 0.005);
    for (const x of [-0.1, 0.62]) {
      P.ext(M.panel, x - 0.16, x + 0.16, 0.9, 1.0, -0.14, 0.18, 0.02);
      for (let j = 0; j < 5; j++) P.add(M.white, rb(0.26, 0.004, 0.2, 0.002), x, 1.01 + j * 0.007, 0.02, 0, j * 0.08, 0);
    }
    P.text('PACKING', {fg: HOS.inkSoft, weight: 700, px: 62}, 0.045, -0.5, 0.6, 0.305);
  }, group);
  return {group, topY: 0.9};
}

/** the medicine trolley: deck at 0.90, coloured drawers, a basket of bottles */
export function buildPillTrolley() {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl('pilltrolley', (P) => {
    P.ext(M.white, -0.33, 0.33, 0.14, 0.86, -0.24, 0.22, 0.04);
    P.ext(M.panel, -0.36, 0.36, 0.86, 0.9, -0.27, 0.25, 0.02); // deck
    const cols = [M.mintLight, M.blueLight, M.amberLight, M.roseLight];
    for (let i = 0; i < 4; i++) drawer(P, cols[i], -0.3, 0.3, 0.19 + i * 0.165, 0.33 + i * 0.165, 0.22);
    P.ext(M.steelDark, -0.3, 0.3, 0.9, 0.94, 0.25, 0.3, 0.015); // push handle
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * 0.3, 0.86, 0.26], [s * 0.3, 0.94, 0.28], 0.014, 8);
    // basket of bottles on top
    P.ext(M.steelDark, -0.26, 0.04, 0.9, 0.96, -0.2, 0.12, 0.015);
    for (let i = 0; i < 5; i++) P.cyl(i % 2 ? M.amberLight : M.white, 0.034, 0.034, 0.12, -0.22 + i * 0.06, 1.02, -0.04, 'y', 10);
    P.add(M.white, rb(0.22, 0.01, 0.3, 0.005), 0.2, 0.905, -0.02, 0, 0.2, 0); // clipboard
    P.text('MEDICINES', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.038, 0, 0.16, 0.228);
  }, group);
  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.18, 0.18]) {
      const w = part(cylG(0.055, 0.055, 0.05, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.055, z);
      w.userData.r = 0.055;
      wheels.push(w);
      tpl(`pt-fork|${x}|${z}`, (P) => P.ext(M.steelDark, x - 0.035, x + 0.035, 0.1, 0.15, z - 0.04, z + 0.04, 0.015), group);
    }
  }
  return {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
}

// ================================================================ beds (the shared core)
/**
 * The common hospital-bed core, head end at -z: a wheeled chassis, a deck pan at deck - 0.08, a four-section
 * mattress whose head and knee break, a pillow, a folded blanket, head and foot boards, and side rails.
 */
function bedCore({
  key,
  L = 2.05,
  W = 0.95,
  deck = 0.62,
  color = HOS.white,
  padColor = HOS.panel,
  blanket = null,
  railPairs = 2,
  motor = false,
  chart = 'BED 1',
  pillow = true,
} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const C = paint(color, 0.5);
  const PAD = paint(padColor, 0.84);
  const padTop = deck;
  const pan = deck - 0.08;
  const wheels = [];
  tpl(`bed|${key}`, (P) => {
    // chassis
    P.ext(M.steelDark, -W / 2 + 0.2, W / 2 - 0.2, 0.14, 0.24, -L / 2 + 0.18, L / 2 - 0.18, 0.03);
    if (motor) {
      P.ext(M.panel, -0.22, 0.22, 0.24, pan - 0.04, -0.3, 0.3, 0.04);
      P.groove(-0.2, 0.2, 0.36, 0.38, 0.305);
      P.ext(M.inkSoft, -0.2, 0.2, 0.26, 0.34, 0.3, 0.315, 0.012);
    } else {
      for (const s of [-1, 1]) P.ext(M.steel, -0.04, 0.04, 0.22, pan, s * (L / 2 - 0.42) - 0.04, s * (L / 2 - 0.42) + 0.04, 0.02);
    }
    // the deck pan and its frame
    P.ext(M.panel, -W / 2 + 0.05, W / 2 - 0.05, pan, pan + 0.06, -L / 2 + 0.1, L / 2 - 0.1, 0.03);
    P.groove(-W / 2 + 0.08, W / 2 - 0.08, pan + 0.02, pan + 0.035, L / 2 - 0.095);
    // head and foot boards
    P.ext(C, -W / 2 + 0.02, W / 2 - 0.02, pan - 0.02, deck + 0.42, -L / 2 - 0.02, -L / 2 + 0.06, 0.04);
    P.ext(C, -W / 2 + 0.02, W / 2 - 0.02, pan - 0.02, deck + 0.3, L / 2 - 0.06, L / 2 + 0.02, 0.04);
    P.ext(M.panel, -W / 2 + 0.08, W / 2 - 0.08, deck + 0.1, deck + 0.34, -L / 2 + 0.01, -L / 2 + 0.03, 0.02);
    // the chart holder on the footboard
    if (chart) {
      P.ext(M.white, -0.17, 0.17, deck + 0.04, deck + 0.22, L / 2 + 0.02, L / 2 + 0.05, 0.015);
      P.text(chart, {fg: HOS.inkSoft, weight: 800, px: 72}, 0.055, 0, deck + 0.13, L / 2 + 0.056);
    }
    // the pads that do not move: seat
    P.add(PAD, rb(W - 0.14, 0.1, 0.44, 0.045), 0, padTop - 0.05, -0.04);
    P.add(M.linen, rb(W - 0.12, 0.02, 0.42, 0.008), 0, padTop + 0.005, -0.04); // the drawn sheet
    // IV-pole sockets at the head corners, a brake pedal at the foot
    for (const s of [-1, 1]) P.cyl(M.steelDark, 0.028, 0.028, 0.08, s * (W / 2 - 0.08), deck + 0.44, -L / 2 + 0.02, 'y', 10);
    P.ext(M.amber, -0.1, 0.1, 0.1, 0.14, L / 2 - 0.3, L / 2 - 0.16, 0.015);
  }, group);
  // live castors
  for (const x of [-(W / 2 - 0.2), W / 2 - 0.2]) {
    for (const z of [-(L / 2 - 0.22), L / 2 - 0.22]) {
      tpl(`bedfork|${key}|${x.toFixed(2)}|${z.toFixed(2)}`, (P) => {
        P.ext(M.steelDark, x - 0.04, x + 0.04, 0.1, 0.18, z - 0.05, z + 0.05, 0.02);
      }, group);
      const w = part(cylG(0.065, 0.065, 0.055, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.065, z);
      w.userData.r = 0.065;
      wheels.push(w);
    }
  }
  // the head section (back rest), pivoting at z = -0.26
  const headG = new THREE.Group();
  headG.position.set(0, padTop - 0.1, -0.26);
  group.add(headG);
  tpl(`bedhead|${key}`, (P) => {
    P.ext(M.panel, -W / 2 + 0.06, W / 2 - 0.06, -0.02, 0.02, -0.64, 0.0, 0.015);
    P.add(PAD, rb(W - 0.14, 0.1, 0.62, 0.045), 0, 0.09, -0.33);
    P.add(M.linen, rb(W - 0.12, 0.02, 0.58, 0.008), 0, 0.145, -0.33);
    if (pillow) P.add(M.pillow, rb(W - 0.3, 0.1, 0.34, 0.05), 0, 0.18, -0.44);
  }, headG);
  // the knee section, pivoting at z = 0.18
  const kneeG = new THREE.Group();
  kneeG.position.set(0, padTop - 0.1, 0.18);
  group.add(kneeG);
  tpl(`bedknee|${key}`, (P) => {
    P.add(PAD, rb(W - 0.14, 0.1, 0.38, 0.045), 0, 0.09, 0.19);
    P.add(PAD, rb(W - 0.14, 0.1, 0.34, 0.045), 0, 0.075, 0.55);
    if (blanket) {
      const B = paint(blanket, 0.82);
      P.add(B, rb(W - 0.06, 0.07, 0.72, 0.035), 0, 0.16, 0.38);
      P.add(B, rb(W - 0.06, 0.05, 0.16, 0.025), 0, 0.2, 0.06);
    }
  }, kneeG);
  // the rails
  const rails = [];
  for (let p = 0; p < railPairs; p++) {
    const z0 = railPairs === 1 ? -0.1 : p === 0 ? -0.56 : 0.34;
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(s * (W / 2 - 0.05), deck - 0.02, z0);
      group.add(g);
      tpl(`bedrail|${key}|${s}|${p}`, (P) => {
        P.ext(M.panel, -0.025, 0.025, 0.1, 0.36, -0.36, 0.36, 0.025);
        P.ext(M.steelDark, -0.02, 0.02, 0.0, 0.12, -0.3, -0.24, 0.012);
        P.ext(M.steelDark, -0.02, 0.02, 0.0, 0.12, 0.24, 0.3, 0.012);
        for (let i = 0; i < 3; i++) P.groove(-0.03, 0.03, 0.14 + i * 0.07, 0.15 + i * 0.07, 0);
        if (p === 0) {
          P.ext(M.inkSoft, -0.03, 0.03, 0.18, 0.3, -0.18, 0.02, 0.012); // a control pad on the head rail
          for (let i = 0; i < 3; i++) P.cyl(M.ledBlue, 0.009, 0.009, 0.008, s * 0.032, 0.24, -0.13 + i * 0.05, 'x', 8);
        }
      }, g);
      rails.push({g, s});
    }
  }
  return {
    group,
    deck,
    wheels,
    setHead(k) {
      headG.rotation.x = clamp(k, 0, 1) * 1.05;
    },
    setKnee(k) {
      kneeG.rotation.x = -clamp(k, 0, 1) * 0.5;
    },
    setRails(k) {
      const t = clamp(k, 0, 1);
      for (const r of rails) r.g.rotation.z = -r.s * (1 - t) * 1.55;
    },
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
}

// ================================================================ emergency
/** the ER trolley-bed: 2.05 x 0.95, deck 0.62, two rail pairs, a head section and a chart */
export function buildERBed({rails = 1, head = 0} = {}) {
  const b = bedCore({key: 'er', color: HOS.roseLight, padColor: HOS.panel, blanket: HOS.curtain, railPairs: 2, chart: 'ER 1', motor: false});
  b.setRails(rails);
  b.setHead(head);
  return b;
}

/** the recovery bed: an ER bed with a monitor shelf at the head */
export function buildPACUBed({head = 0.3, rails = 1} = {}) {
  const M = mats();
  const b = bedCore({key: 'pacu', color: HOS.violetLight, padColor: HOS.panel, blanket: HOS.violetLight, railPairs: 2, chart: 'PACU 1'});
  tpl('pacu-shelf', (P) => {
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.3, 1.04, -1.06], [s * 0.3, 1.62, -1.06], 0.018, 8);
    P.ext(M.panel, -0.36, 0.36, 1.56, 1.62, -1.14, -0.98, 0.02);
  }, b.group);
  b.setRails(rails);
  b.setHead(head);
  return b;
}

/** the ICU bed: a motor column, four rails with control pads, a knee break and a bed-end display */
export function buildICUBed({head = 0.35, rails = 1, knee = 0.15} = {}) {
  const M = mats();
  const b = bedCore({key: 'icu', color: HOS.violetLight, padColor: HOS.panel, blanket: HOS.mintLight, railPairs: 2, motor: true, chart: null});
  tpl('icu-end', (P) => {
    P.ext(M.ink, -0.2, 0.2, 0.74, 0.92, 1.05, 1.08, 0.02); // the bed-end panel
    P.text('ICU 3', {fg: HOS.inkSoft, weight: 800, px: 72}, 0.05, 0, 0.7, 1.085);
    for (const s of [-1, 1]) P.cyl(M.steelDark, 0.02, 0.02, 0.12, s * 0.42, 0.68, 1.0, 'y', 10); // drainage hooks
  }, b.group);
  const face = screenFace(b.group, 0.34, 0.14, miniTex('icu', [['BED 3  LOCKED', 20, '#7fd8f2'], ['CPR  TILT 0', 20, '#f2e2a0']]), 0, 0.83, 1.088);
  b.setRails(rails);
  b.setHead(head);
  b.setKnee(knee);
  b.setOn = (on) => face.setOn(on);
  return b;
}

/** the bedside vital-sign monitor on a rolling stand; the trace is a pure function of beat (0..1) */
export function buildVitalMonitor({on = true, beat = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('vitalmon', (P) => {
    starBase(P, 0.26);
    P.cyl(M.steel, 0.024, 0.024, 1.3, 0, 0.75, 0, 'y', 12);
    P.ext(M.steelDark, -0.06, 0.06, 1.3, 1.36, -0.04, 0.04, 0.02);
    // the monitor head
    P.ext(M.white, -0.23, 0.23, 1.36, 1.68, -0.08, 0.07, 0.03);
    P.ext(M.ink, -0.21, 0.13, 1.39, 1.65, 0.07, 0.078, 0.015); // screen bezel
    P.ext(M.panel, 0.14, 0.21, 1.39, 1.65, 0.07, 0.078, 0.012); // button column
    for (let i = 0; i < 4; i++) P.cyl(M.steelDark, 0.014, 0.014, 0.012, 0.175, 1.43 + i * 0.06, 0.082, 'z', 10);
    P.text('VITALS', {fg: HOS.inkSoft, weight: 800, px: 64}, 0.04, -0.04, 1.665, 0.075);
    // the lead bundle looping down to a basket
    P.add(cableG('vm-c', [[-0.2, 1.42, 0.02], [-0.3, 1.24, 0.1], [-0.26, 1.02, -0.02], [-0.14, 0.94, 0.04]], 0.015), M.rubber);
    for (let i = 0; i < 3; i++) P.cyl([M.red, M.ledGreen, M.ledBlue][i], 0.012, 0.012, 0.025, -0.14 + i * 0.03, 0.93, 0.04, 'y', 8);
    P.ext(M.steelDark, -0.16, 0.16, 0.56, 0.6, -0.12, 0.12, 0.015);
    for (const s of [-1, 1]) P.ext(M.steelDark, s * 0.16 - 0.012, s * 0.16 + 0.012, 0.56, 0.72, -0.12, 0.12, 0.01);
  }, group);
  const face = screenFace(group, 0.33, 0.25, monitorTex(0), -0.04, 1.52, 0.082);
  const api = {
    group,
    setOn: (b) => face.setOn(b),
    setBeat(phase) {
      const i = ((Math.floor(phase * TRACE_N) % TRACE_N) + TRACE_N) % TRACE_N;
      face.setMap(monitorTex(i));
    },
  };
  api.setBeat(beat);
  api.setOn(on);
  return api;
}

/** an IV pole: 1.95 tall, hook at 1.80, 1-3 bags, a drip chamber and tubing; setDrip(k) moves the drop */
export function buildIVPole({bags = 1, drip = 0} = {}) {
  const M = mats();
  const n = clamp(Math.round(bags), 0, 3);
  const group = new THREE.Group();
  tpl(`ivpole|${n}`, (P) => {
    starBase(P, 0.24);
    P.cyl(M.steel, 0.018, 0.018, 1.75, 0, 0.95, 0, 'y', 12);
    P.cyl(M.steelDark, 0.026, 0.026, 0.06, 0, 1.12, 0, 'y', 12); // the height collar
    P.ext(M.steel, -0.14, 0.14, 1.78, 1.82, -0.02, 0.02, 0.018); // the hook cross
    P.ext(M.steel, -0.02, 0.02, 1.78, 1.82, -0.14, 0.14, 0.018);
    for (const [dx, dz] of [[-0.14, 0], [0.14, 0], [0, 0.14], [0, -0.14]]) P.add(M.steel, torusG(0.022, 0.006, 12), dx, 1.77, dz, PI / 2, 0, 0);
    const col = [HOS.mintLight, HOS.amberLight, HOS.roseLight];
    const at = [[-0.14, 0], [0.14, 0], [0, 0.14]];
    for (let i = 0; i < n; i++) {
      const [dx, dz] = at[i];
      P.add(M.glass, rb(0.15, 0.3, 0.07, 0.03), dx, 1.58, dz);
      P.add(paint(col[i], 0.3), rb(0.13, 0.19, 0.055, 0.025), dx, 1.52, dz);
      P.text('0.9% NaCl', {fg: HOS.inkSoft, weight: 700, px: 44}, 0.022, dx, 1.62, dz + 0.04);
      P.cyl(M.glass, 0.016, 0.016, 0.07, dx, 1.4, dz, 'y', 10); // the drip chamber
    }
    if (n > 0) P.add(cableG('iv-line', [[-0.14, 1.37, 0], [-0.2, 1.1, 0.06], [-0.1, 0.8, -0.04], [-0.16, 0.5, 0.05]], 0.009), M.rubber);
  }, group);
  const drop = part(sphG(0.009), M.fluid, group);
  const api = {
    group,
    hook: {y: 1.8},
    setDrip(k) {
      const t = ((k % 1) + 1) % 1;
      drop.position.set(-0.14, lerp(1.42, 1.37, t), 0);
      drop.visible = n > 0;
    },
  };
  api.setDrip(drip);
  return api;
}

/** the crash cart: red drawers 1-5, a defibrillator and an oxygen cylinder on top, a backboard on the side */
export function buildCrashCart() {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl('crash', (P) => {
    P.ext(M.rose, -0.33, 0.33, 0.14, 0.86, -0.26, 0.24, 0.04);
    P.ext(M.panel, -0.36, 0.36, 0.86, 0.9, -0.29, 0.27, 0.02);
    for (let i = 0; i < 5; i++) {
      drawer(P, M.white, -0.3, 0.3, 0.18 + i * 0.132, 0.3 + i * 0.132, 0.24);
      P.text(`${5 - i}`, {fg: HOS.rose, weight: 800, px: 70}, 0.055, -0.24, 0.24 + i * 0.132, 0.272);
    }
    P.text('CRASH CART', {fg: HOS.white, weight: 800, px: 76}, 0.055, 0.04, 0.16, 0.245);
    P.ext(M.steelDark, -0.3, 0.3, 0.9, 0.94, 0.27, 0.33, 0.015);
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * 0.3, 0.86, 0.28], [s * 0.3, 0.94, 0.3], 0.014, 8);
    // the oxygen cylinder in its bracket
    P.cyl(M.green, 0.07, 0.07, 0.46, 0.22, 1.14, -0.1, 'y', 14);
    P.cyl(M.steelDark, 0.03, 0.03, 0.07, 0.22, 1.4, -0.1, 'y', 10);
    P.ext(M.steelDark, 0.14, 0.3, 1.2, 1.24, -0.18, -0.02, 0.012);
    P.text('O2', {fg: HOS.white, weight: 800, px: 60}, 0.045, 0.22, 1.14, -0.028);
    // the backboard strapped to the side
    P.add(M.amber, rb(0.04, 0.64, 0.3, 0.02), -0.36, 0.5, -0.02);
    // a sharps bin and a glove box on the shelf
    P.cyl(M.amber, 0.06, 0.055, 0.14, -0.22, 0.97, 0.1, 'y', 12);
    P.ext(M.cardboard, -0.12, 0.08, 0.9, 1.02, -0.2, -0.04, 0.02);
  }, group);
  const defib = screenFace(group, 0.2, 0.12, miniTex('cc', [['DEFIB READY', 22, '#7af2a4'], ['200 J', 30, '#f2e2a0']]), 0.0, 1.06, 0.14, 0, -0.3);
  tpl('crash-defib', (P) => {
    P.add(M.white, rb(0.28, 0.2, 0.24, 0.025), -0.02, 1.0, 0.08, -0.3, 0, 0);
  }, group);
  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.2, 0.2]) {
      tpl(`cc-fork|${x}|${z}`, (P) => P.ext(M.steelDark, x - 0.035, x + 0.035, 0.1, 0.16, z - 0.04, z + 0.04, 0.015), group);
      const w = part(cylG(0.055, 0.055, 0.05, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.055, z);
      w.userData.r = 0.055;
      wheels.push(w);
    }
  }
  return {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
    setOn: (b) => defib.setOn(b),
  };
}

/** a defibrillator on a rolling stand: paddles in their holsters, a charge bar */
export function buildDefibrillator({on = true, charge = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('defib', (P) => {
    for (const x of [-0.2, 0.2]) for (const z of [-0.16, 0.16]) castor(P, x, z, 0.04);
    P.ext(M.steelDark, -0.24, 0.24, 0.12, 0.17, -0.2, 0.2, 0.02);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.2, 0.14, -0.16], [s * 0.2, 0.78, -0.12], 0.018, 8);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.2, 0.14, 0.16], [s * 0.2, 0.78, 0.12], 0.018, 8);
    P.ext(M.panel, -0.26, 0.26, 0.74, 0.8, -0.2, 0.2, 0.02);
    // the unit
    P.ext(M.amber, -0.26, 0.26, 0.8, 1.14, -0.2, 0.18, 0.035);
    P.ext(M.ink, -0.24, -0.02, 0.86, 1.1, 0.18, 0.19, 0.015);
    P.ext(M.panel, 0.02, 0.24, 0.86, 1.1, 0.18, 0.188, 0.012);
    for (let i = 0; i < 4; i++) P.cyl(M.steelDark, 0.016, 0.016, 0.012, 0.07 + (i % 2) * 0.1, 0.9 + Math.floor(i / 2) * 0.09, 0.192, 'z', 10);
    P.text('DEFIB', {fg: HOS.ink, weight: 800, px: 70}, 0.05, -0.12, 0.83, 0.188);
    P.text('AED', {fg: HOS.ink, weight: 800, px: 60}, 0.04, 0.16, 0.83, 0.188);
    // paddles in their holsters with curly cables
    for (const s of [-1, 1]) {
      P.ext(M.steelDark, s * 0.17 - 0.05, s * 0.17 + 0.05, 1.14, 1.2, -0.12, 0.08, 0.015);
      P.cyl(M.ink, 0.045, 0.045, 0.07, s * 0.17, 1.24, -0.02, 'y', 14);
      P.add(M.ink, rb(0.05, 0.12, 0.05, 0.02), s * 0.17, 1.32, -0.02);
      P.add(coilG(`df-c${s}`, s * 0.17, 1.14, -0.02, 2, 0.06, 0.2, 0.011), M.rubber);
    }
    P.ext(M.panel, -0.22, 0.22, 0.3, 0.42, -0.14, 0.14, 0.02); // the pads box on the shelf
    P.text('PADS', {fg: HOS.inkSoft, weight: 700, px: 48}, 0.024, 0, 0.36, 0.145);
  }, group);
  const face = screenFace(group, 0.2, 0.22, monitorTex(6), -0.13, 0.98, 0.193);
  const leds = [];
  for (let i = 0; i < 5; i++) {
    const m = part(rb(0.03, 0.012, 0.01, 0.004), M.ledOff, group);
    m.position.set(-0.2 + i * 0.045, 1.165, 0.0);
    leds.push(m);
  }
  const set = ledSet(leds, M.ledRed);
  const api = {
    group,
    setOn: (b) => face.setOn(b),
    setCharge(k) {
      const n = clamp(k, 0, 1) * 5;
      set((i) => i < n);
    },
  };
  api.setCharge(charge);
  api.setOn(on);
  return api;
}

/** a ventilator on a column: waveform screen, a bellows that rises and falls, hoses */
export function buildVentilator({on = true, bellows = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('vent', (P) => {
    for (const x of [-0.22, 0.22]) for (const z of [-0.18, 0.18]) castor(P, x, z, 0.045);
    P.ext(M.steelDark, -0.26, 0.26, 0.12, 0.18, -0.22, 0.22, 0.025);
    P.ext(M.steel, -0.06, 0.06, 0.18, 1.0, -0.06, 0.06, 0.03); // column
    P.ext(M.white, -0.28, 0.28, 1.0, 1.42, -0.2, 0.18, 0.04); // the body
    P.groove(-0.26, 0.26, 1.06, 1.08, 0.185);
    P.ext(M.ink, -0.26, 0.26, 1.44, 1.78, -0.16, -0.12, 0.025); // the screen housing
    P.ext(M.panel, -0.26, 0.26, 1.0, 1.08, -0.2, 0.185, 0.02);
    for (let i = 0; i < 5; i++) P.cyl(M.steelDark, 0.015, 0.015, 0.012, -0.2 + i * 0.1, 1.04, 0.19, 'z', 10);
    P.text('VENTILATOR', {fg: HOS.inkSoft, weight: 800, px: 66}, 0.042, 0.0, 1.38, 0.185);
    // the bellows housing on the front
    P.cyl(M.glass, 0.09, 0.09, 0.3, 0.0, 1.24, 0.3, 'y', 18);
    P.cyl(M.panel, 0.095, 0.095, 0.03, 0.0, 1.4, 0.3, 'y', 18);
    P.cyl(M.panel, 0.1, 0.1, 0.04, 0.0, 1.07, 0.3, 'y', 18);
    // hoses looping off to the patient side
    P.add(cableG('vt-h1', [[0.1, 1.1, 0.3], [0.34, 0.98, 0.26], [0.42, 0.74, 0.1], [0.3, 0.6, -0.04]], 0.022), M.mintLight);
    P.add(cableG('vt-h2', [[-0.1, 1.1, 0.3], [-0.34, 0.96, 0.24], [-0.4, 0.72, 0.08], [-0.28, 0.58, -0.04]], 0.022), M.white);
    P.ext(M.panel, -0.2, 0.2, 0.42, 0.6, -0.16, 0.14, 0.03); // the humidifier
    P.cyl(M.fluid, 0.05, 0.05, 0.1, 0.0, 0.52, 0.0, 'y', 12);
    P.text('HUMIDIFIER', {fg: HOS.inkSoft, weight: 700, px: 48}, 0.024, 0, 0.46, 0.145);
  }, group);
  const face = screenFace(group, 0.44, 0.28, ventTex(0), 0, 1.61, -0.118);
  const bell = part(cylG(0.075, 0.075, 1, 16), M.mintLight, group);
  bell.position.set(0, 1.12, 0.3);
  const api = {
    group,
    setOn: (b) => face.setOn(b),
    setBellows(k) {
      const t = ((k % 1) + 1) % 1;
      const h = lerp(0.1, 0.25, 0.5 - 0.5 * Math.cos(t * PI * 2));
      bell.scale.y = h;
      bell.position.y = 1.09 + h / 2;
      face.setMap(ventTex(Math.floor(t * 8) % 8));
    },
  };
  api.setBellows(bellows);
  api.setOn(on);
  return api;
}

/** the bed-head unit: gas outlets, sockets, a nurse-call button, on a wall facing +z */
export function buildOxygenPanel() {
  const M = mats();
  const group = new THREE.Group();
  tpl('o2panel', (P) => {
    P.ext(M.white, -0.8, 0.8, 1.1, 1.62, -0.1, 0.0, 0.03);
    P.ext(M.panel, -0.78, 0.78, 1.14, 1.3, -0.09, 0.012, 0.015);
    P.ext(M.mintLight, -0.8, 0.8, 1.56, 1.62, -0.1, 0.015, 0.015);
    P.text('BED HEAD UNIT', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.038, -0.46, 1.5, 0.018);
    const outs = [['O2', HOS.green, -0.6], ['AIR', HOS.blue, -0.42], ['VAC', HOS.steelDark, -0.24]];
    for (const [t, c, x] of outs) {
      P.cyl(paint(c, 0.45), 0.038, 0.038, 0.05, x, 1.42, 0.0, 'z', 14);
      P.cyl(M.panel, 0.022, 0.022, 0.06, x, 1.42, 0.01, 'z', 12);
      P.text(t, {fg: HOS.inkSoft, weight: 800, px: 52}, 0.03, x, 1.35, 0.016);
    }
    for (let i = 0; i < 4; i++) {
      P.ext(M.panel, 0.0 + i * 0.13, 0.1 + i * 0.13, 1.18, 1.27, 0.0, 0.014, 0.012);
      for (const dx of [0.025, 0.075]) P.cyl(M.ink, 0.008, 0.008, 0.012, i * 0.13 + dx, 1.225, 0.016, 'z', 8);
    }
    P.text('230 V', {fg: HOS.inkSoft, weight: 700, px: 46}, 0.024, 0.26, 1.145, 0.016);
    // the nurse-call button and the reading light
    P.cyl(M.rose, 0.05, 0.05, 0.03, 0.6, 1.42, 0.005, 'z', 16);
    P.text('CALL', {fg: HOS.inkSoft, weight: 800, px: 50}, 0.028, 0.6, 1.35, 0.016);
    P.ext(M.panel, -0.3, 0.3, 1.62, 1.68, -0.1, -0.02, 0.02);
    P.ext(M.lamp, -0.26, 0.26, 1.6, 1.63, -0.08, -0.04, 0.01);
    P.add(coilG('o2-c', 0.6, 1.4, 0.0, 2, 0.05, 0.18, 0.009), M.rubber);
  }, group);
  return {group};
}

/** a wall suction regulator with its collection jar; setLevel(k) fills the jar */
export function buildSuctionUnit({level = 0.3} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('suction', (P) => {
    P.ext(M.white, -0.16, 0.16, 1.26, 1.66, -0.08, 0.0, 0.025); // the wall bracket
    P.cyl(M.panel, 0.06, 0.06, 0.06, 0.0, 1.58, 0.02, 'z', 16); // the regulator dial
    P.cyl(M.ink, 0.05, 0.05, 0.01, 0.0, 1.58, 0.05, 'z', 16);
    P.rod(M.white, [0, 1.58, 0.055], [0.03, 1.61, 0.055], 0.006, 6);
    P.text('SUCTION', {fg: HOS.inkSoft, weight: 800, px: 56}, 0.032, 0, 1.49, 0.012);
    P.text('-200 mmHg', {fg: HOS.inkSoft, weight: 600, px: 44}, 0.022, 0, 1.45, 0.012);
    P.cyl(M.glass, 0.075, 0.075, 0.26, 0.0, 1.16, 0.02, 'y', 18); // the jar
    P.cyl(M.panel, 0.08, 0.08, 0.04, 0.0, 1.31, 0.02, 'y', 18);
    P.add(cableG('su-t', [[0.06, 1.31, 0.02], [0.14, 1.2, 0.1], [0.08, 1.0, 0.04], [0.12, 0.84, 0.08]], 0.012), M.rubber);
  }, group);
  const fluid = part(cylG(0.07, 0.07, 1, 16), M.fluidRed, group);
  const api = {
    group,
    setLevel(k) {
      const t = clamp(k, 0.02, 1);
      fluid.scale.y = t * 0.22;
      fluid.position.set(0, 1.04 + (t * 0.22) / 2, 0.02);
    },
  };
  api.setLevel(level);
  return api;
}

// ================================================================ surgery
/** the operating table: deck 0.85, a chrome pedestal, segmented pads, arm boards; setTilt tips the whole top */
export function buildORTable({tilt = 0, back = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const deck = 0.85;
  tpl('ortable', (P) => {
    P.ext(M.steelDark, -0.3, 0.3, 0.02, 0.1, -0.5, 0.5, 0.035); // the base
    P.ext(M.ink, -0.27, 0.27, 0.0, 0.03, -0.46, 0.46, 0.015);
    P.cyl(M.chrome, 0.12, 0.16, 0.5, 0, 0.35, 0, 'y', 20); // the column
    P.cyl(M.steelDark, 0.14, 0.14, 0.06, 0, 0.6, 0, 'y', 20);
    P.ext(M.panel, -0.1, 0.1, 0.12, 0.2, 0.5, 0.62, 0.02); // the foot control
    P.text('OR 1', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.035, 0, 0.16, 0.625);
  }, group);
  // the table top (tilts as one piece)
  const top = new THREE.Group();
  top.position.set(0, deck - 0.08, 0);
  group.add(top);
  tpl('ortable-top', (P) => {
    P.ext(M.steel, -0.24, 0.24, -0.06, 0.0, -0.9, 0.9, 0.025); // the top frame
    P.add(M.mintDeep, rb(0.52, 0.08, 0.5, 0.035), 0, 0.045, 0.0); // seat pad
    P.add(M.mintDeep, rb(0.52, 0.08, 0.56, 0.035), 0, 0.045, 0.58); // leg pad
    P.ext(M.steelDark, -0.26, 0.26, -0.02, 0.02, 0.86, 0.94, 0.012);
    for (const s of [-1, 1]) {
      P.ext(M.steelDark, s * 0.26 - 0.015, s * 0.26 + 0.015, -0.04, 0.02, -0.6, 0.4, 0.01); // side rails
      // arm boards
      P.ext(M.steelDark, s * 0.28, s * 0.42, 0.0, 0.03, -0.36, -0.3, 0.01);
      P.add(M.mintDeep, rb(0.3, 0.06, 0.16, 0.025), s * 0.46, 0.05, -0.33, 0, 0, 0);
    }
  }, top);
  // the back section, pivoting at z = -0.3
  const backG = new THREE.Group();
  backG.position.set(0, 0.0, -0.3);
  top.add(backG);
  tpl('ortable-back', (P) => {
    P.add(M.mintDeep, rb(0.52, 0.08, 0.56, 0.035), 0, 0.045, -0.3);
    P.add(M.mintDeep, rb(0.34, 0.07, 0.22, 0.03), 0, 0.05, -0.62); // head pad
    P.ext(M.steel, -0.22, 0.22, -0.04, 0.0, -0.78, 0.0, 0.015);
  }, backG);
  const api = {
    group,
    deck,
    setTilt(a) {
      top.rotation.x = clamp(a, -0.25, 0.25);
    },
    setBack(k) {
      backG.rotation.x = clamp(k, -0.3, 1) * 0.7;
    },
  };
  api.setTilt(tilt);
  api.setBack(back);
  return api;
}

/** the surgical light: a ceiling stem, a spring arm, a dome (0.8 across) hanging at 2.3; setAim(yaw, pitch) */
export function buildORLamp({aim = [0, 0], on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('orlamp-mount', (P) => {
    P.cyl(M.panel, 0.17, 0.17, 0.08, 0, 2.86, 0, 'y', 20); // the ceiling plate
    P.cyl(M.steel, 0.055, 0.055, 0.3, 0, 2.7, 0, 'y', 14);
  }, group);
  const yawG = new THREE.Group();
  yawG.position.set(0, 2.68, 0);
  group.add(yawG);
  tpl('orlamp-arm', (P) => {
    P.cyl(M.steelDark, 0.07, 0.07, 0.1, 0, 0.0, 0, 'y', 16);
    P.ext(M.steel, -0.04, 0.04, -0.06, 0.0, 0.0, 0.72, 0.025); // the horizontal arm
    P.cyl(M.steelDark, 0.06, 0.06, 0.1, 0, -0.04, 0.72, 'y', 16);
    P.rod(M.steel, [0, -0.08, 0.72], [0, -0.3, 0.62], 0.028, 10); // the spring arm
    P.rod(M.steel, [0, -0.3, 0.62], [0, -0.36, 0.3], 0.028, 10);
  }, yawG);
  // the dome, on a pitch pivot
  const headG = new THREE.Group();
  headG.position.set(0, -0.38, 0.3);
  yawG.add(headG);
  const cells = [];
  tpl('orlamp-dome', (P) => {
    P.cyl(M.panel, 0.18, 0.4, 0.14, 0, 0.0, 0, 'y', 28); // the body
    P.cyl(M.white, 0.4, 0.4, 0.05, 0, -0.08, 0, 'y', 28);
    P.add(M.steel, torusG(0.4, 0.025, 32), 0, -0.1, 0, PI / 2);
    P.cyl(M.steelDark, 0.035, 0.035, 0.12, 0, 0.1, 0, 'y', 12);
    P.cyl(M.panel, 0.03, 0.03, 0.16, 0, -0.16, 0, 'y', 12); // the sterile handle
    P.cyl(M.panel, 0.045, 0.045, 0.04, 0, -0.25, 0, 'y', 12);
    P.text('OR LIGHT', {fg: HOS.inkSoft, weight: 700, px: 52}, 0.03, 0, 0.02, 0.4, 0, 0);
  }, headG);
  // the lamp cells on the underside
  const lensG = new THREE.Group();
  headG.add(lensG);
  for (let r = 0; r < 3; r++) {
    const n = r === 0 ? 1 : r * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const rr = r * 0.12;
      const m = part(cylG(0.045, 0.045, 0.012, 14), M.lamp, lensG);
      m.position.set(Math.cos(a) * rr, -0.115, Math.sin(a) * rr);
      cells.push(m);
    }
  }
  const beam = part(tubeG(0.34, 0.62, 1.0, 22), M.beam, headG);
  beam.position.y = -0.62;
  beam.material.side = THREE.DoubleSide;
  const api = {
    group,
    setAim(yaw = 0, pitch = 0) {
      yawG.rotation.y = yaw;
      headG.rotation.x = clamp(pitch, -0.7, 0.7);
    },
    setOn(b) {
      for (const c of cells) c.material = b ? mats().lamp : mats().lampOff;
      beam.visible = !!b;
    },
  };
  api.setAim(aim[0] || 0, aim[1] || 0);
  api.setOn(on);
  return api;
}

/** the anaesthesia machine: flowmeter tubes, two vaporisers, a bellows, a soda-lime canister, circuit hoses */
export function buildAnaesthesiaMachine({on = true, bellows = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('anaes', (P) => {
    for (const x of [-0.26, 0.26]) for (const z of [-0.2, 0.2]) castor(P, x, z, 0.045);
    P.ext(M.white, -0.34, 0.34, 0.12, 0.86, -0.26, 0.24, 0.04); // the trolley body
    P.ext(M.shade, -0.31, 0.31, 0.1, 0.16, -0.23, 0.2, 0.02);
    for (let i = 0; i < 3; i++) drawer(P, M.panel, -0.3, 0.3, 0.2 + i * 0.2, 0.36 + i * 0.2, 0.24);
    P.ext(M.panel, -0.38, 0.38, 0.86, 0.92, -0.3, 0.28, 0.025); // the work surface
    P.ext(M.white, -0.36, 0.36, 0.92, 1.0, -0.3, -0.12, 0.02);
    // the back column with the screen
    P.ext(M.white, -0.36, 0.36, 1.0, 1.52, -0.3, -0.18, 0.035);
    P.ext(M.ink, -0.3, 0.3, 1.08, 1.44, -0.18, -0.16, 0.02);
    P.ext(M.violetLight, -0.36, 0.36, 1.46, 1.52, -0.3, -0.175, 0.015);
    P.text('ANAESTHESIA', {fg: HOS.inkSoft, weight: 800, px: 70}, 0.045, 0, 1.49, -0.172);
    // the flowmeter block: three glass tubes with floats
    P.ext(M.panel, -0.34, -0.1, 0.92, 1.46, -0.16, -0.08, 0.02);
    const gases = [['O2', HOS.green], ['N2O', HOS.blue], ['AIR', HOS.steelDark]];
    for (let i = 0; i < 3; i++) {
      const x = -0.3 + i * 0.07;
      P.cyl(M.glass, 0.019, 0.019, 0.34, x, 1.21, -0.075, 'y', 12);
      P.cyl(paint(gases[i][1], 0.4), 0.014, 0.014, 0.02, x, 1.12 + i * 0.05, -0.075, 'y', 10); // the float
      P.cyl(paint(gases[i][1], 0.45), 0.024, 0.024, 0.03, x, 0.96, -0.06, 'y', 12); // the knob
      P.text(gases[i][0], {fg: HOS.inkSoft, weight: 700, px: 44}, 0.022, x, 1.42, -0.07);
    }
    // two vaporisers
    for (const [i, c] of [[0, M.amber], [1, M.violet]]) {
      P.ext(c, 0.04 + i * 0.16, 0.18 + i * 0.16, 0.92, 1.14, -0.16, -0.02, 0.025);
      P.cyl(M.steelDark, 0.03, 0.03, 0.03, 0.11 + i * 0.16, 1.16, -0.09, 'y', 14);
      P.text(i ? 'ISO' : 'SEV', {fg: HOS.ink, weight: 800, px: 48}, 0.028, 0.11 + i * 0.16, 1.0, -0.018);
    }
    // the bellows housing and the soda-lime canister
    P.cyl(M.glass, 0.1, 0.1, 0.3, 0.24, 1.22, 0.1, 'y', 18);
    P.cyl(M.panel, 0.105, 0.105, 0.03, 0.24, 1.38, 0.1, 'y', 18);
    P.cyl(M.panel, 0.11, 0.11, 0.04, 0.24, 1.05, 0.1, 'y', 18);
    P.cyl(M.panel, 0.095, 0.095, 0.14, 0.24, 0.98, 0.1, 'y', 18);
    // the circuit hoses looping off the front
    P.add(coilG('an-h1', 0.1, 0.98, 0.26, 3, 0.1, 0.42, 0.022), M.mintLight);
    P.add(cableG('an-h2', [[0.3, 0.98, 0.24], [0.44, 0.84, 0.3], [0.3, 0.6, 0.2], [0.36, 0.42, 0.26]], 0.022), M.white);
    // two cylinders on the back
    for (const [x, c] of [[-0.2, M.green], [0.2, M.blue]]) {
      P.cyl(c, 0.075, 0.075, 0.6, x, 0.46, -0.34, 'y', 14);
      P.cyl(M.steelDark, 0.03, 0.03, 0.08, x, 0.8, -0.34, 'y', 10);
    }
  }, group);
  const face = screenFace(group, 0.52, 0.32, ventTex(2), 0, 1.26, -0.154, PI);
  const bell = part(cylG(0.085, 0.085, 1, 16), M.mintLight, group);
  bell.position.set(0.24, 1.1, 0.1);
  const api = {
    group,
    setOn: (b) => face.setOn(b),
    setBellows(k) {
      const t = ((k % 1) + 1) % 1;
      const h = lerp(0.1, 0.26, 0.5 - 0.5 * Math.cos(t * PI * 2));
      bell.scale.y = h;
      bell.position.y = 1.07 + h / 2;
      face.setMap(ventTex(Math.floor(t * 8) % 8));
    },
  };
  api.setBellows(bellows);
  api.setOn(on);
  return api;
}

/** a Mayo instrument trolley: a draped steel top with instruments laid out, on castors */
export function buildInstrumentTable() {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl('instr', (P) => {
    P.ext(M.steelDark, -0.3, 0.3, 0.1, 0.15, -0.2, 0.2, 0.02);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.26, 0.12, 0], [s * 0.1, 0.9, 0], 0.022, 10);
    P.ext(M.steel, -0.42, 0.42, 0.9, 0.95, -0.28, 0.28, 0.02); // the tray
    P.add(M.mintLight, rb(0.9, 0.012, 0.62, 0.006), 0, 0.96, 0.0); // the drape
    P.ext(M.mintLight, -0.45, 0.45, 0.72, 0.96, 0.26, 0.28, 0.01);
    // instruments: clamps, scissors, a scalpel, a kidney dish
    for (let i = 0; i < 4; i++) {
      P.add(M.chrome, rb(0.014, 0.008, 0.2, 0.004), -0.3 + i * 0.07, 0.975, -0.04, 0, 0.06 * i, 0);
      P.cyl(M.chrome, 0.012, 0.012, 0.02, -0.3 + i * 0.07, 0.975, 0.07, 'y', 8);
    }
    P.add(M.chrome, rb(0.05, 0.01, 0.12, 0.006), 0.06, 0.975, -0.06);
    P.add(M.ink, rb(0.02, 0.01, 0.1, 0.004), 0.16, 0.975, -0.02);
    P.cyl(M.chrome, 0.08, 0.07, 0.04, 0.3, 0.99, 0.02, 'y', 18); // kidney dish
    P.add(M.white, rb(0.12, 0.02, 0.1, 0.008), 0.3, 1.02, 0.02); // gauze
  }, group);
  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.16, 0.16]) {
      tpl(`in-fork|${x}|${z}`, (P) => P.ext(M.steelDark, x - 0.03, x + 0.03, 0.08, 0.13, z - 0.035, z + 0.035, 0.012), group);
      const w = part(cylG(0.045, 0.045, 0.04, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.045, z);
      w.userData.r = 0.045;
      wheels.push(w);
    }
  }
  return {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
}

/** the scrub trough: taps on elbow levers, soap, a splashback; setFlow(k) runs the water */
export function buildScrubSink({taps = 2, flow = 0} = {}) {
  const M = mats();
  const n = clamp(Math.round(taps), 1, 3);
  const W = 0.8 * n;
  const group = new THREE.Group();
  tpl(`scrub|${n}`, (P) => {
    P.ext(M.steel, -W / 2, W / 2, 0.72, 0.95, -0.3, 0.26, 0.03); // the trough
    P.ext(M.ink, -W / 2 + 0.05, W / 2 - 0.05, 0.74, 0.78, -0.26, 0.2, 0.02);
    P.ext(M.white, -W / 2 + 0.06, W / 2 - 0.06, 0.08, 0.72, -0.28, 0.2, 0.03); // the apron
    P.ext(M.white, -W / 2, W / 2, 0.95, 2.1, -0.32, -0.28, 0.02); // the splashback
    P.ext(M.steel, -W / 2 + 0.05, W / 2 - 0.05, 1.5, 2.0, -0.28, -0.27, 0.01); // the mirror
    P.text('SURGICAL SCRUB  5 MIN', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.04, 0, 1.4, -0.265);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.8 * (i + 0.5);
      P.cyl(M.chrome, 0.022, 0.022, 0.3, x, 1.1, -0.24, 'y', 12);
      P.add(cableG(`sc-sp${i}`, [[x, 1.24, -0.24], [x, 1.32, -0.18], [x, 1.24, -0.1]], 0.022), M.chrome);
      for (const s of [-1, 1]) {
        P.cyl(M.chrome, 0.016, 0.016, 0.16, x + s * 0.12, 1.0, -0.24, 'z', 10);
        P.ext(M.chrome, x + s * 0.12 - 0.02, x + s * 0.12 + 0.02, 0.96, 1.04, -0.18, -0.1, 0.012);
      }
      P.ext(M.white, x - 0.05, x + 0.05, 1.18, 1.36, -0.27, -0.2, 0.02); // the soap dispenser
      P.ext(M.mint, x - 0.05, x + 0.05, 1.3, 1.36, -0.27, -0.195, 0.012);
      P.ext(M.ink, x - 0.02, x + 0.02, 1.14, 1.18, -0.24, -0.18, 0.008);
      P.ext(M.steelDark, x - 0.06, x + 0.06, 0.0, 0.04, -0.14, 0.0, 0.012); // the knee plate
    }
  }, group);
  const streams = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.8 * (i + 0.5);
    const m = part(cylG(0.012, 0.016, 1, 10), M.water, group);
    m.position.set(x, 1.0, -0.1);
    streams.push(m);
  }
  const api = {
    group,
    setFlow(k) {
      const t = clamp(k, 0, 1);
      for (const m of streams) {
        m.visible = t > 0.03;
        m.scale.set(1, t * 0.26, 1);
        m.position.y = 1.22 - (t * 0.26) / 2;
      }
    },
  };
  api.setFlow(flow);
  return api;
}

/** a folding surgical screen on castors; setFold(k) opens the wings */
export function buildSurgicalScreen({fold = 0.4} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const panelKey = (i) => `sscreen-p${i}`;
  tpl('sscreen-mid', (P) => {
    P.ext(M.steel, -0.44, 0.44, 0.1, 1.7, -0.02, 0.02, 0.02);
    P.ext(M.curtain, -0.42, 0.42, 0.16, 1.66, -0.012, 0.012, 0.012);
    P.text('STERILE AREA', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.04, 0, 1.52, 0.016);
    for (const x of [-0.4, 0.4]) {
      castor(P, x, 0.0, 0.04);
      P.ext(M.steelDark, x - 0.03, x + 0.03, 0.1, 0.16, -0.03, 0.03, 0.012);
    }
  }, group);
  const wings = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.44, 0, 0);
    group.add(g);
    tpl(panelKey(s), (P) => {
      P.ext(M.steel, s > 0 ? 0 : -0.84, s > 0 ? 0.84 : 0, 0.1, 1.7, -0.02, 0.02, 0.02);
      P.ext(M.curtain, s > 0 ? 0.03 : -0.81, s > 0 ? 0.81 : -0.03, 0.16, 1.66, -0.012, 0.012, 0.012);
      castor(P, s * 0.8, 0.0, 0.04);
      P.ext(M.steelDark, s * 0.8 - 0.03, s * 0.8 + 0.03, 0.1, 0.16, -0.03, 0.03, 0.012);
    }, g);
    wings.push({g, s});
  }
  const api = {
    group,
    setFold(k) {
      const t = clamp(k, 0, 1);
      for (const w of wings) w.g.rotation.y = -w.s * t * 1.1;
    },
  };
  api.setFold(fold);
  return api;
}

/** the electrosurgical unit on a stand: dials, a foot pedal on a cable, a pencil in its holster */
export function buildElectrosurgery({on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('esu', (P) => {
    for (const x of [-0.18, 0.18]) for (const z of [-0.16, 0.16]) castor(P, x, z, 0.04);
    P.ext(M.steelDark, -0.22, 0.22, 0.12, 0.17, -0.2, 0.2, 0.02);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.18, 0.14, -0.16], [s * 0.18, 0.9, -0.14], 0.018, 8);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.18, 0.14, 0.16], [s * 0.18, 0.9, 0.14], 0.018, 8);
    P.ext(M.panel, -0.24, 0.24, 0.86, 0.92, -0.2, 0.2, 0.02);
    P.ext(M.white, -0.24, 0.24, 0.92, 1.18, -0.18, 0.16, 0.03); // the unit
    P.ext(M.amber, -0.24, 0.24, 1.12, 1.18, -0.18, 0.165, 0.015);
    P.ext(M.ink, -0.2, -0.02, 0.98, 1.1, 0.16, 0.168, 0.012);
    for (let i = 0; i < 2; i++) {
      P.cyl(M.steelDark, 0.035, 0.035, 0.02, 0.06 + i * 0.1, 1.04, 0.168, 'z', 16);
      P.text(i ? 'COAG' : 'CUT', {fg: HOS.inkSoft, weight: 800, px: 44}, 0.024, 0.06 + i * 0.1, 0.97, 0.17);
    }
    P.text('ELECTROSURGERY', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.034, 0, 1.15, 0.168);
    // the pencil in its holster and the foot pedal
    P.ext(M.steelDark, 0.2, 0.26, 0.98, 1.08, -0.04, 0.06, 0.012);
    P.add(M.ink, cylG(0.014, 0.014, 0.16, 10), 0.24, 1.12, 0.0, 0.2, 0, 0.1);
    P.add(coilG('esu-c', 0.24, 0.98, 0.0, 2, 0.06, 0.24, 0.01), M.rubber);
    P.add(M.ink, rb(0.2, 0.07, 0.22, 0.03), 0.36, 0.05, 0.3, -0.12, 0, 0);
    P.add(cableG('esu-p', [[0.16, 0.9, 0.1], [0.3, 0.6, 0.2], [0.36, 0.2, 0.26], [0.36, 0.08, 0.3]], 0.012), M.rubber);
  }, group);
  const face = screenFace(group, 0.17, 0.11, miniTex('esu', [['CUT 40 W', 24, '#f2e2a0'], ['COAG 30 W', 24, '#7fd8f2']]), -0.11, 1.04, 0.172);
  return {group, setOn: (b) => face.setOn(b)};
}

// ================================================================ ward
/** the ward bed: a painted frame, one rail pair, a folded blanket and a name card at the foot */
export function buildWardBed({head = 0, color = HOS.mint, bed = 'BED 1'} = {}) {
  const b = bedCore({key: `ward|${color}`, color, padColor: HOS.panel, blanket: HOS.mintLight, railPairs: 1, chart: bed});
  b.setHead(head);
  b.setRails(1);
  return b;
}

export function buildBedsideCabinet() {
  const M = mats();
  const group = new THREE.Group();
  tpl('bedcab', (P) => {
    P.ext(M.white, -0.23, 0.23, 0.06, 0.82, -0.22, 0.2, 0.03);
    P.ext(M.shade, -0.2, 0.2, 0.0, 0.07, -0.19, 0.17, 0.02);
    P.ext(M.wood, -0.25, 0.25, 0.82, 0.86, -0.24, 0.22, 0.018);
    drawer(P, M.panel, -0.2, 0.2, 0.6, 0.78, 0.2);
    P.ext(M.panel, -0.2, 0.2, 0.12, 0.56, 0.18, 0.2, 0.015); // the door
    P.ext(M.steelDark, 0.12, 0.17, 0.32, 0.36, 0.2, 0.23, 0.01);
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * 0.26, 0.5, -0.1], [s * 0.26, 0.5, 0.12], 0.012, 8); // towel rail
    P.add(M.linen, rb(0.03, 0.22, 0.12, 0.012), -0.26, 0.4, 0.0);
    // a water jug and a cup on top
    P.cyl(M.white, 0.055, 0.05, 0.16, -0.1, 0.94, 0.0, 'y', 14);
    P.cyl(M.panel, 0.058, 0.058, 0.02, -0.1, 1.03, 0.0, 'y', 14);
    P.cyl(M.panel, 0.035, 0.03, 0.08, 0.06, 0.9, -0.02, 'y', 12);
    P.ext(M.cardboard, 0.1, 0.22, 0.86, 0.9, 0.0, 0.16, 0.012); // a magazine
  }, group);
  return {group};
}

/** a cantilever overbed table; setHeight(h) raises the top between 0.78 and 1.10 */
export function buildOverbedTable({height = 0.95} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('overbed', (P) => {
    P.ext(M.steelDark, -0.24, 0.24, 0.08, 0.13, -0.3, 0.3, 0.025);
    for (const z of [-0.24, 0.24]) {
      castor(P, -0.18, z, 0.038);
      castor(P, 0.18, z, 0.038);
    }
    P.cyl(M.steel, 0.035, 0.045, 0.72, 0.0, 0.47, 0.0, 'y', 16);
  }, group);
  const top = new THREE.Group();
  group.add(top);
  tpl('overbed-top', (P) => {
    P.cyl(M.steel, 0.028, 0.028, 0.2, 0.0, -0.1, 0.0, 'y', 12);
    P.ext(M.steel, -0.03, 0.03, -0.03, 0.0, 0.0, 0.34, 0.012);
    P.add(M.wood, rb(0.78, 0.04, 0.46, 0.018), 0, 0.02, 0.34);
    P.ext(M.panel, -0.36, 0.36, 0.0, 0.015, 0.14, 0.54, 0.006);
    // a meal tray, a cup and a plate
    P.add(M.panel, rb(0.4, 0.02, 0.3, 0.01), -0.1, 0.05, 0.34);
    P.cyl(M.white, 0.1, 0.095, 0.03, -0.14, 0.07, 0.34, 'y', 18);
    P.cyl(M.mintLight, 0.035, 0.03, 0.08, 0.06, 0.08, 0.26, 'y', 12);
    P.add(M.white, rb(0.14, 0.01, 0.1, 0.004), 0.22, 0.05, 0.42);
  }, top);
  const api = {
    group,
    setHeight(h) {
      top.position.y = clamp(h, 0.78, 1.1) - 0.02;
    },
  };
  api.setHeight(height);
  return api;
}

/** a volumetric infusion pump. Origin at its pole clamp (back face centre): hang it on an IV pole at y 1.2-1.5. */
export function buildInfusionPump({on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('pump', (P) => {
    P.ext(M.white, -0.12, 0.12, -0.11, 0.11, 0.03, 0.19, 0.025); // the body
    P.ext(M.panel, -0.1, 0.1, -0.1, -0.02, 0.19, 0.198, 0.012); // the keypad
    for (let i = 0; i < 6; i++) P.cyl(M.steelDark, 0.013, 0.013, 0.01, -0.07 + (i % 3) * 0.07, -0.04 - Math.floor(i / 3) * 0.045, 0.202, 'z', 8);
    P.ext(M.mint, -0.12, 0.12, 0.08, 0.11, 0.03, 0.195, 0.012);
    P.text('PUMP', {fg: HOS.inkSoft, weight: 800, px: 50}, 0.028, 0.0, 0.095, 0.198);
    // the clamp on the back and the line through the door
    P.ext(M.steelDark, -0.03, 0.03, -0.05, 0.05, -0.04, 0.03, 0.015);
    P.add(M.steelDark, torusG(0.03, 0.012, 14), 0, 0, -0.045, 0, PI / 2);
    P.add(cableG('pm-l', [[0.1, 0.11, 0.12], [0.14, 0.0, 0.14], [0.1, -0.16, 0.1]], 0.008), M.rubber);
    P.cyl(M.ledGreen, 0.01, 0.01, 0.008, -0.1, 0.06, 0.202, 'z', 8);
  }, group);
  const face = screenFace(group, 0.18, 0.08, miniTex('pump', [['5.0 mL/h  INF', 22, '#7af2a4']]), 0, 0.03, 0.2);
  const api = {group, setOn: (b) => face.setOn(b)};
  api.setOn(on);
  return api;
}

/** a wall chart board with clipboards, on a wall facing +z */
export function buildChartBoard({title = 'PATIENT CHARTS'} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl(`chartboard|${title}`, (P) => {
    P.ext(M.white, -0.7, 0.7, 1.05, 1.9, -0.05, 0.0, 0.025);
    P.ext(M.mint, -0.7, 0.7, 1.78, 1.9, -0.05, 0.008, 0.015);
    P.text(title, {fg: HOS.white, weight: 800, px: 86}, 0.07, 0, 1.84, 0.012);
    for (let i = 0; i < 6; i++) {
      const x = -0.56 + (i % 3) * 0.56;
      const y = 1.5 - Math.floor(i / 3) * 0.34;
      P.ext(M.panel, x - 0.2, x + 0.2, y - 0.14, y + 0.14, 0.0, 0.012, 0.012); // the clipboard
      P.ext(M.white, x - 0.17, x + 0.17, y - 0.12, y + 0.1, 0.012, 0.016, 0.006);
      P.ext(M.steelDark, x - 0.06, x + 0.06, y + 0.1, y + 0.14, 0.012, 0.02, 0.008);
      for (let j = 0; j < 4; j++) P.ext(M.shade, x - 0.13, x + 0.08, y - 0.06 + j * 0.04, y - 0.048 + j * 0.04, 0.016, 0.017, 0.002);
      P.text(`${i + 1}`, {fg: HOS.mintDeep, weight: 800, px: 56}, 0.04, x + 0.13, y - 0.07, 0.018);
    }
  }, group);
  return {group};
}

// ================================================================ dental
/** the dental chair: a reclining seat, an operating light, a delivery arm with handpieces, a spittoon and a tray */
export function buildDentalChair({light = 1, tray = 0, recline = 0.3} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('dental-base', (P) => {
    P.ext(M.panel, -0.3, 0.3, 0.02, 0.12, -0.5, 0.5, 0.04);
    P.ext(M.shade, -0.27, 0.27, 0.0, 0.03, -0.46, 0.46, 0.02);
    P.cyl(M.white, 0.14, 0.18, 0.34, 0, 0.28, -0.04, 'y', 20);
    P.ext(M.panel, -0.12, 0.12, 0.0, 0.07, 0.42, 0.62, 0.02); // the foot control
    P.text('DENTAL 1', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.035, 0, 0.1, 0.63);
    // the spittoon on its arm
    P.rod(M.steel, [-0.3, 0.45, -0.1], [-0.62, 0.72, 0.1], 0.022, 10);
    P.cyl(M.white, 0.1, 0.07, 0.1, -0.68, 0.76, 0.12, 'y', 20);
    P.cyl(M.steel, 0.012, 0.012, 0.14, -0.74, 0.86, 0.06, 'y', 10);
    P.cyl(M.mintLight, 0.028, 0.025, 0.07, -0.62, 0.82, 0.16, 'y', 12); // the cup
    // the delivery unit on its arm
    P.rod(M.steel, [0.26, 0.5, -0.2], [0.6, 0.9, -0.05], 0.025, 10);
    P.add(M.white, rb(0.34, 0.12, 0.26, 0.04), 0.66, 0.96, 0.02);
    P.ext(M.ink, 0.52, 0.8, 1.02, 1.04, -0.06, 0.1, 0.008);
    for (let i = 0; i < 3; i++) {
      P.ext(M.steelDark, 0.56 + i * 0.09, 0.6 + i * 0.09, 1.02, 1.08, 0.08, 0.14, 0.01);
      P.add(M.panel, cylG(0.015, 0.012, 0.16, 10), 0.58 + i * 0.09, 1.14, 0.12, 0.25, 0, 0);
      P.add(coilG(`dn-h${i}`, 0.58 + i * 0.09, 1.0, 0.12, 2, 0.045, 0.16, 0.009), M.rubber);
    }
    P.text('HANDPIECES', {fg: HOS.inkSoft, weight: 700, px: 46}, 0.024, 0.66, 0.92, 0.152);
  }, group);
  // the reclining chair
  const chair = new THREE.Group();
  chair.position.set(0, 0.45, -0.04);
  group.add(chair);
  tpl('dental-seat', (P) => {
    P.add(M.teal, rb(0.5, 0.1, 0.56, 0.045), 0, 0.03, 0.12); // the seat
    P.ext(M.white, -0.24, 0.24, -0.06, 0.0, -0.1, 0.4, 0.02);
    P.add(M.teal, rb(0.46, 0.08, 0.76, 0.04), 0, 0.08, -0.5, 0.12, 0, 0); // the back
    P.add(M.teal, rb(0.3, 0.07, 0.24, 0.03), 0, 0.22, -0.96, 0.12, 0, 0); // the head rest
    P.add(M.teal, rb(0.44, 0.08, 0.42, 0.035), 0, 0.0, 0.58); // the leg rest
    for (const s of [-1, 1]) P.ext(M.steelDark, s * 0.25 - 0.02, s * 0.25 + 0.02, 0.04, 0.16, 0.0, 0.3, 0.012);
  }, chair);
  // the operating light on its arm
  const lampG = new THREE.Group();
  lampG.position.set(0.1, 0, 0);
  group.add(lampG);
  const cells = [];
  tpl('dental-lamp', (P) => {
    P.cyl(M.steel, 0.05, 0.05, 1.5, 0.3, 0.86, -0.7, 'y', 14);
    P.rod(M.steel, [0.3, 1.6, -0.7], [0.1, 1.74, -0.3], 0.025, 10);
    P.rod(M.steel, [0.1, 1.74, -0.3], [0.0, 1.66, 0.05], 0.025, 10);
    P.add(M.white, rb(0.44, 0.14, 0.2, 0.05), 0.0, 1.58, 0.08, 0.5, 0, 0);
    P.ext(M.steelDark, -0.03, 0.03, 1.62, 1.72, 0.0, 0.08, 0.012);
  }, lampG);
  for (const dx of [-0.12, 0, 0.12]) {
    const m = part(cylG(0.055, 0.055, 0.012, 16), M.lamp, lampG);
    m.position.set(dx, 1.52, 0.14);
    m.rotation.x = 0.5 + PI / 2;
    cells.push(m);
  }
  const beam = part(tubeG(0.16, 0.3, 0.55, 18), M.beam, lampG);
  beam.position.set(0, 1.32, -0.02);
  beam.rotation.x = 0.5;
  // the bracket tray on a swing arm
  const trayG = new THREE.Group();
  trayG.position.set(0.3, 0.98, -0.3);
  group.add(trayG);
  tpl('dental-tray', (P) => {
    P.ext(M.steel, 0.0, 0.3, -0.02, 0.0, -0.02, 0.02, 0.01);
    P.ext(M.panel, 0.28, 0.6, 0.0, 0.03, -0.14, 0.14, 0.012);
    for (let i = 0; i < 4; i++) P.add(M.chrome, rb(0.012, 0.008, 0.16, 0.004), 0.34 + i * 0.06, 0.04, 0.0);
  }, trayG);
  const api = {
    group,
    setRecline(k) {
      chair.rotation.x = clamp(k, 0, 1) * 0.5;
    },
    setLight(k) {
      const t = clamp(k, 0, 1);
      for (const c of cells) c.material = t > 0.5 ? mats().lamp : mats().lampOff;
      beam.visible = t > 0.5;
      lampG.rotation.y = (t - 0.5) * 0.4;
    },
    setTray(a) {
      trayG.rotation.y = a;
    },
  };
  api.setRecline(recline);
  api.setLight(light);
  api.setTray(tray);
  return api;
}

/** a wall-mounted intraoral X-ray on a scissor arm; setAim(a) swings the tube head */
export function buildDentalXray({aim = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('dxray', (P) => {
    P.ext(M.white, -0.14, 0.14, 1.2, 1.9, -0.12, -0.04, 0.03); // the wall box
    P.ext(M.ink, -0.1, 0.1, 1.68, 1.84, -0.04, -0.03, 0.012);
    P.text('X-RAY', {fg: HOS.inkSoft, weight: 800, px: 56}, 0.035, 0, 1.6, -0.028);
    P.text('60 kV', {fg: HOS.inkSoft, weight: 600, px: 44}, 0.024, 0, 1.55, -0.028);
    for (let i = 0; i < 3; i++) P.cyl(M.steelDark, 0.015, 0.015, 0.012, -0.06 + i * 0.06, 1.44, -0.03, 'z', 10);
  }, group);
  const arm = new THREE.Group();
  arm.position.set(0, 1.7, -0.04);
  group.add(arm);
  tpl('dxray-arm', (P) => {
    P.ext(M.panel, -0.03, 0.03, -0.04, 0.0, 0.0, 0.7, 0.015);
    P.ext(M.panel, -0.025, 0.025, -0.08, -0.04, 0.0, 0.66, 0.012);
    P.cyl(M.steel, 0.03, 0.03, 0.12, 0.0, -0.06, 0.7, 'y', 12);
  }, arm);
  const headG = new THREE.Group();
  headG.position.set(0, -0.08, 0.7);
  arm.add(headG);
  tpl('dxray-head', (P) => {
    P.ext(M.white, -0.09, 0.09, -0.22, 0.0, -0.08, 0.08, 0.03);
    P.cyl(M.panel, 0.055, 0.05, 0.16, 0.0, -0.12, 0.16, 'z', 16); // the collimator cone
    P.cyl(M.ink, 0.048, 0.048, 0.01, 0.0, -0.12, 0.245, 'z', 16);
  }, headG);
  const api = {
    group,
    setAim(a) {
      arm.rotation.y = clamp(a, -1.2, 1.2);
      headG.rotation.y = clamp(a, -1.2, 1.2) * 0.4;
    },
  };
  api.setAim(aim);
  return api;
}

/** a bench autoclave on a cabinet: a round door that swings open, trays of instruments */
export function buildSteriliser({door = 0, on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('steril', (P) => {
    P.ext(M.white, -0.36, 0.36, 0.08, 0.88, -0.3, 0.28, 0.035); // the cabinet
    P.ext(M.shade, -0.33, 0.33, 0.0, 0.09, -0.27, 0.24, 0.02);
    drawer(P, M.panel, -0.32, 0.32, 0.56, 0.8, 0.28);
    P.ext(M.panel, -0.32, 0.32, 0.14, 0.52, 0.26, 0.28, 0.015);
    P.ext(M.panel, -0.4, 0.4, 0.88, 0.92, -0.34, 0.32, 0.02);
    // the autoclave body
    P.ext(M.white, -0.3, 0.3, 0.92, 1.4, -0.28, 0.24, 0.04);
    P.cyl(M.steelDark, 0.17, 0.17, 0.4, 0.0, 1.16, 0.04, 'z', 24); // the chamber
    P.cyl(M.ink, 0.155, 0.155, 0.34, 0.0, 1.16, 0.02, 'z', 24);
    for (let i = 0; i < 3; i++) P.add(M.chrome, rb(0.22, 0.012, 0.3, 0.005), 0.0, 1.06 + i * 0.09, 0.02);
    P.ext(M.panel, 0.2, 0.3, 0.96, 1.36, 0.24, 0.25, 0.012); // the control plate
    for (let i = 0; i < 3; i++) P.cyl(M.steelDark, 0.016, 0.016, 0.012, 0.25, 1.0 + i * 0.07, 0.254, 'z', 10);
    P.text('AUTOCLAVE', {fg: HOS.inkSoft, weight: 800, px: 64}, 0.04, -0.06, 1.38, 0.245);
    P.text('134 C  STERILE', {fg: HOS.inkSoft, weight: 600, px: 48}, 0.026, -0.1, 0.94, 0.245);
    P.add(cableG('st-c', [[-0.28, 0.1, -0.26], [-0.4, 0.06, -0.38], [-0.26, 0.05, -0.46]], 0.013), M.rubber);
  }, group);
  const face = screenFace(group, 0.14, 0.07, miniTex('st', [['134 C  18:00', 22, '#7af2a4']]), -0.1, 1.3, 0.252);
  const doorG = new THREE.Group();
  doorG.position.set(-0.18, 1.16, 0.24);
  group.add(doorG);
  tpl('steril-door', (P) => {
    P.cyl(M.panel, 0.19, 0.19, 0.05, 0.18, 0.0, 0.0, 'z', 24);
    P.cyl(M.glass, 0.12, 0.12, 0.02, 0.18, 0.0, 0.03, 'z', 20);
    P.ext(M.steelDark, 0.32, 0.4, -0.03, 0.03, -0.02, 0.05, 0.012);
  }, doorG);
  const api = {
    group,
    setDoor(k) {
      doorG.rotation.y = -clamp(k, 0, 1) * 1.9;
    },
    setOn: (b) => face.setOn(b),
  };
  api.setDoor(door);
  api.setOn(on);
  return api;
}

// ================================================================ physiotherapy
/** a treatment plinth: 1.9 x 0.70, top at 0.58, a head section that lifts, a paper roll */
export function buildPTTable({head = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const L = 1.9;
  const W = 0.7;
  tpl('pttable', (P) => {
    for (const s of [-1, 1]) {
      P.ext(M.steel, -W / 2 + 0.06, W / 2 - 0.06, 0.02, 0.07, s * (L / 2 - 0.3) - 0.03, s * (L / 2 - 0.3) + 0.03, 0.02);
      for (const q of [-1, 1]) P.rod(M.steel, [q * (W / 2 - 0.08), 0.06, s * (L / 2 - 0.3)], [q * (W / 2 - 0.08), 0.5, s * (L / 2 - 0.34)], 0.025, 10);
    }
    P.ext(M.steel, -0.03, 0.03, 0.44, 0.5, -L / 2 + 0.3, L / 2 - 0.3, 0.02);
    P.ext(M.panel, -W / 2, W / 2, 0.5, 0.54, -L / 2, L / 2 - 0.7, 0.025);
    P.add(M.teal, rb(W, 0.08, L - 0.7, 0.04), 0, 0.57, -0.35); // the fixed pad
    P.text('PHYSIOTHERAPY', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.038, 0, 0.3, W / 2 - 0.3, -PI / 2);
    for (const s of [-1, 1]) P.rod(M.steelDark, [s * (W / 2 - 0.04), 0.54, -L / 2 - 0.03], [s * (W / 2 - 0.04), 0.72, -L / 2 - 0.03], 0.012, 8);
    P.cyl(M.white, 0.05, 0.05, W - 0.12, 0, 0.72, -L / 2 - 0.03, 'x', 14);
  }, group);
  const headG = new THREE.Group();
  headG.position.set(0, 0.54, L / 2 - 0.7);
  group.add(headG);
  tpl('pttable-head', (P) => {
    P.ext(M.panel, -W / 2, W / 2, -0.04, 0.0, 0.0, 0.7, 0.02);
    P.add(M.teal, rb(W, 0.08, 0.68, 0.04), 0, 0.04, 0.35);
  }, headG);
  const api = {
    group,
    setHead(k) {
      headG.rotation.x = -clamp(k, 0, 1) * 0.8;
    },
  };
  api.setHead(head);
  return api;
}

/** parallel bars over a low walkway; rails at 0.9 */
export function buildParallelBars({len = 3.0} = {}) {
  const M = mats();
  const L = Math.max(1.6, len);
  const group = new THREE.Group();
  tpl(`pbars|${L.toFixed(2)}`, (P) => {
    P.ext(M.wood, -L / 2, L / 2, 0.02, 0.09, -0.45, 0.45, 0.02); // the walkway
    P.ext(M.shade, -L / 2 + 0.02, L / 2 - 0.02, 0.09, 0.1, -0.42, 0.42, 0.008);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = s * 0.4;
        const x = -L / 2 + 0.3 + (i * (L - 0.6)) / 2;
        P.ext(M.steelDark, x - 0.06, x + 0.06, 0.06, 0.12, z - 0.06, z + 0.06, 0.02);
        P.cyl(M.steel, 0.025, 0.025, 0.78, x, 0.5, z, 'y', 12);
        P.cyl(M.steelDark, 0.034, 0.034, 0.06, x, 0.78, z, 'y', 12);
      }
      P.cyl(M.wood, 0.028, 0.028, L - 0.3, 0, 0.9, s * 0.4, 'x', 14);
      for (const q of [-1, 1]) P.add(M.wood, sphG(0.03), q * (L / 2 - 0.15), 0.9, s * 0.4);
    }
    P.text('GAIT TRAINING', {fg: HOS.inkSoft, weight: 700, px: 58}, 0.04, 0, 0.1, 0.0, 0, -PI / 2);
  }, group);
  return {group};
}

/** an upright exercise bike; setCrank(a) turns the pedals and the flywheel */
export function buildExerciseBike({crank = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('bike', (P) => {
    P.ext(M.steelDark, -0.14, 0.14, 0.02, 0.09, -0.52, 0.52, 0.03); // the base
    P.ext(M.ink, -0.16, 0.16, 0.0, 0.03, -0.5, -0.4, 0.015);
    P.ext(M.ink, -0.16, 0.16, 0.0, 0.03, 0.4, 0.5, 0.015);
    P.ext(M.teal, -0.07, 0.07, 0.09, 0.62, 0.22, 0.42, 0.04); // the seat post
    P.ext(M.teal, -0.07, 0.07, 0.09, 1.0, -0.42, -0.22, 0.04); // the front post
    P.add(M.ink, rb(0.16, 0.08, 0.3, 0.04), 0, 0.88, 0.3); // the saddle
    P.ext(M.steelDark, -0.03, 0.03, 0.6, 0.9, 0.28, 0.34, 0.015);
    // the handlebar and the console
    P.cyl(M.ink, 0.022, 0.022, 0.5, 0, 1.0, -0.3, 'x', 12);
    for (const s of [-1, 1]) P.add(M.ink, cylG(0.024, 0.024, 0.16, 10), s * 0.25, 0.98, -0.22, 0.5, 0, 0);
    P.add(M.white, rb(0.26, 0.18, 0.08, 0.025), 0, 1.14, -0.3, -0.3, 0, 0);
    P.text('PT BIKE', {fg: HOS.inkSoft, weight: 700, px: 52}, 0.03, 0, 1.05, -0.26);
    P.cyl(M.panel, 0.11, 0.11, 0.12, 0, 0.4, -0.3, 'x', 20); // the flywheel shroud
  }, group);
  const face = screenFace(group, 0.2, 0.1, miniTex('bike', [['12.4 km/h', 24, '#7af2a4'], ['LEVEL 4  08:20', 18]]), 0, 1.17, -0.258, 0, -0.3);
  const cr = new THREE.Group();
  cr.position.set(0, 0.34, 0.05);
  group.add(cr);
  tpl('bike-crank', (P) => {
    P.cyl(M.steel, 0.1, 0.1, 0.05, 0, 0, 0, 'x', 20); // the chain wheel
    for (const s of [-1, 1]) {
      P.ext(M.steelDark, s * 0.06 - 0.015, s * 0.06 + 0.015, -0.02 * s, 0.17 * s, -0.02, 0.02, 0.01);
      P.add(M.ink, rb(0.09, 0.025, 0.14, 0.012), s * 0.12, 0.16 * s, 0);
    }
  }, cr);
  const api = {
    group,
    setCrank(a) {
      cr.rotation.x = a;
    },
  };
  api.setCrank(crank);
  return api;
}

/** a treadmill; setBelt(d) scrolls the belt, a pure function of distance */
export function buildTreadmill({belt = 0, on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('treadmill', (P) => {
    P.ext(M.panel, -0.44, 0.44, 0.06, 0.24, -0.9, 0.5, 0.04); // the deck frame
    P.ext(M.shade, -0.42, 0.42, 0.0, 0.07, -0.86, 0.46, 0.02);
    P.ext(M.ink, -0.46, 0.46, 0.24, 0.3, -0.9, -0.74, 0.02);
    P.ext(M.ink, -0.46, 0.46, 0.24, 0.3, 0.34, 0.5, 0.02);
    for (const s of [-1, 1]) P.ext(M.teal, s * 0.42 - 0.04, s * 0.42 + 0.04, 0.24, 0.3, -0.84, 0.44, 0.02);
    // the uprights, the handrails and the console
    for (const s of [-1, 1]) {
      P.ext(M.steelDark, s * 0.42 - 0.04, s * 0.42 + 0.04, 0.24, 1.0, 0.38, 0.48, 0.03);
      P.cyl(M.ink, 0.024, 0.024, 0.52, s * 0.42, 0.98, 0.18, 'z', 12);
      P.add(M.ink, torusG(0.07, 0.024, 14), s * 0.42, 0.98, 0.44, 0, PI / 2, 0);
    }
    P.add(M.white, rb(0.92, 0.3, 0.1, 0.035), 0, 1.16, 0.44, -0.25, 0, 0);
    P.ext(M.panel, -0.4, -0.12, 1.12, 1.22, 0.38, 0.39, 0.012);
    for (let i = 0; i < 6; i++) P.cyl(M.steelDark, 0.018, 0.018, 0.012, -0.36 + (i % 3) * 0.1, 1.15 + Math.floor(i / 3) * 0.06, 0.393, 'z', 10);
    P.text('TREADMILL', {fg: HOS.inkSoft, weight: 800, px: 62}, 0.04, 0.3, 1.04, 0.45);
  }, group);
  const face = screenFace(group, 0.4, 0.22, miniTex('tm', [['5.4 km/h', 28, '#7af2a4'], ['INCLINE 2%', 20], ['12:40  1.1 km', 20, '#f2e2a0']]), 0.14, 1.17, 0.405, 0, -0.25);
  // the belt: a repeating texture scrolled by setBelt
  const btex = canvasTex('belt', 64, 128, (g, w, h) => {
    g.fillStyle = '#2b3242';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#242a38';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 8);
  }, {repeat: true});
  btex.repeat.set(1, 6);
  const bmat = new THREE.MeshStandardMaterial({map: btex, roughness: 0.8});
  const bm = part(rb(0.78, 0.04, 1.26, 0.015), bmat, group);
  bm.position.set(0, 0.26, -0.2);
  const api = {
    group,
    setBelt(d) {
      btex.offset.y = -d * 0.6;
    },
    setOn: (b) => face.setOn(b),
  };
  api.setBelt(belt);
  api.setOn(on);
  return api;
}

/** a therapeutic ultrasound unit on a small cart: an applicator on a coiled lead, gel */
export function buildUltrasoundTherapy({on = true} = {}) {
  const M = mats();
  const group = new THREE.Group();
  tpl('ustherapy', (P) => {
    for (const x of [-0.18, 0.18]) for (const z of [-0.14, 0.14]) castor(P, x, z, 0.038);
    P.ext(M.steelDark, -0.22, 0.22, 0.1, 0.15, -0.18, 0.18, 0.02);
    P.ext(M.panel, -0.24, 0.24, 0.42, 0.47, -0.18, 0.18, 0.018);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.19, 0.13, -0.14], [s * 0.19, 0.84, -0.12], 0.018, 8);
    for (const s of [-1, 1]) P.rod(M.steel, [s * 0.19, 0.13, 0.14], [s * 0.19, 0.84, 0.12], 0.018, 8);
    P.ext(M.panel, -0.24, 0.24, 0.8, 0.86, -0.18, 0.18, 0.02);
    P.ext(M.white, -0.22, 0.22, 0.86, 1.1, -0.16, 0.14, 0.03);
    P.ext(M.teal, -0.22, 0.22, 1.04, 1.1, -0.16, 0.145, 0.015);
    P.ext(M.ink, -0.18, 0.02, 0.9, 1.02, 0.14, 0.148, 0.012);
    for (let i = 0; i < 2; i++) P.cyl(M.steelDark, 0.028, 0.028, 0.014, 0.08 + i * 0.09, 0.96, 0.15, 'z', 14);
    P.text('US THERAPY', {fg: HOS.inkSoft, weight: 700, px: 54}, 0.032, 0, 1.07, 0.148);
    P.text('1 MHz', {fg: HOS.inkSoft, weight: 600, px: 44}, 0.022, 0.12, 0.89, 0.148);
    // the applicator in its holder with a coiled lead
    P.ext(M.steelDark, 0.2, 0.26, 0.9, 0.98, -0.02, 0.06, 0.012);
    P.add(M.panel, cylG(0.022, 0.026, 0.12, 12), 0.23, 1.04, 0.02, 0.15, 0, 0);
    P.add(coilG('ut-c', 0.23, 0.9, 0.02, 2, 0.05, 0.2, 0.009), M.rubber);
    P.cyl(M.fluid, 0.035, 0.035, 0.13, -0.12, 0.53, 0.0, 'y', 12); // the gel bottle
    P.ext(M.linen, 0.02, 0.2, 0.47, 0.52, -0.12, 0.1, 0.015); // folded towels
  }, group);
  const face = screenFace(group, 0.18, 0.1, miniTex('ut', [['1.5 W/cm2', 24, '#7fd8f2'], ['05:00  PULSED', 18]]), -0.08, 0.96, 0.152);
  return {group, setOn: (b) => face.setOn(b)};
}

/** a stack of exercise mats, a rolled mat and two gym balls */
export function buildMatSet() {
  const M = mats();
  const group = new THREE.Group();
  tpl('matset', (P) => {
    const cols = [M.teal, M.tealLight, M.blueLight, M.mintLight];
    for (let i = 0; i < 4; i++) P.add(cols[i], rb(0.9, 0.055, 0.6, 0.028), 0, 0.03 + i * 0.058, 0, 0, (i % 2) * 0.03, 0);
    P.add(M.violetLight, cylG(0.13, 0.13, 0.86, 18), 0.0, 0.13, -0.52, 0, 0, PI / 2);
    P.add(M.steelDark, rb(0.04, 0.02, 0.3, 0.008), 0.0, 0.26, -0.52);
    P.add(M.amberLight, sphG(0.26), 0.78, 0.26, 0.2);
    P.add(M.roseLight, sphG(0.2), 0.78, 0.2, -0.36);
    P.text('MATS', {fg: HOS.inkSoft, weight: 700, px: 52}, 0.032, 0, 0.12, 0.305);
  }, group);
  return {group};
}

// ================================================================ transport
/** a wheelchair, seat at 0.48; setRoll(d) turns the big wheels and the castors */
export function buildWheelchair({roll = 0, occupied = false} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl(`wchair-f|${occupied}`, (P) => {
    // the frame
    for (const s of [-1, 1]) {
      P.ext(M.blue, s * 0.25 - 0.022, s * 0.25 + 0.022, 0.42, 0.48, -0.26, 0.24, 0.02); // the seat rail
      P.rod(M.blue, [s * 0.25, 0.46, 0.22], [s * 0.25, 0.2, 0.3], 0.02, 8);
      P.rod(M.blue, [s * 0.25, 0.2, 0.3], [s * 0.25, 0.08, 0.3], 0.018, 8);
      P.rod(M.blue, [s * 0.25, 0.46, -0.24], [s * 0.25, 1.0, -0.3], 0.022, 8); // the back post
      P.add(M.ink, cylG(0.024, 0.024, 0.14, 10), s * 0.25, 1.02, -0.26, 0.6, 0, 0); // the push handle
      P.ext(M.ink, s * 0.26 - 0.03, s * 0.26 + 0.03, 0.62, 0.68, -0.18, 0.12, 0.018); // the armrest
      P.ext(M.blue, s * 0.26 - 0.018, s * 0.26 + 0.018, 0.48, 0.64, 0.06, 0.1, 0.012);
      P.rod(M.steelDark, [s * 0.2, 0.2, 0.3], [s * 0.2, 0.08, 0.34], 0.014, 8); // the footplate hanger
      P.ext(M.ink, s * 0.2 - 0.06, s * 0.2 + 0.06, 0.06, 0.09, 0.3, 0.44, 0.012); // the footplate
      // the brake lever
      P.rod(M.steelDark, [s * 0.27, 0.42, -0.04], [s * 0.3, 0.3, 0.08], 0.012, 6);
    }
    P.add(M.inkSoft, rb(0.52, 0.045, 0.46, 0.022), 0, 0.46, -0.01); // the seat sling
    P.add(M.inkSoft, rb(0.5, 0.5, 0.045, 0.022), 0, 0.75, -0.28, 0.1, 0, 0); // the back sling
    P.text('WHEELCHAIR', {fg: HOS.inkSoft, weight: 700, px: 50}, 0.028, 0, 0.56, -0.25);
    if (occupied) {
      P.add(M.linen, rb(0.5, 0.06, 0.42, 0.03), 0, 0.52, 0.04); // a lap blanket
      P.add(M.linen, rb(0.46, 0.2, 0.08, 0.04), 0, 0.46, 0.26);
    }
    // the cross brace under the seat
    P.rod(M.steelDark, [-0.24, 0.3, 0.0], [0.24, 0.18, 0.0], 0.016, 8);
    P.rod(M.steelDark, [0.24, 0.3, 0.0], [-0.24, 0.18, 0.0], 0.016, 8);
  }, group);
  // the two big wheels with spokes and hand rims
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.28, 0.3, -0.12);
    w.userData.r = 0.3;
    group.add(w);
    tpl(`wchair-w|${s}`, (P) => {
      P.add(M.ink, torusG(0.3, 0.028, 30), 0, 0, 0, 0, PI / 2, 0);
      P.add(M.steel, torusG(0.26, 0.012, 24), s * 0.035, 0, 0, 0, PI / 2, 0); // the hand rim
      for (let i = 0; i < 8; i++) P.rod(M.steel, [0, 0, 0], [Math.cos((i / 8) * PI * 2) * 0.29, Math.sin((i / 8) * PI * 2) * 0.29, 0], 0.006, 5);
      P.cyl(M.steelDark, 0.04, 0.04, 0.05, 0, 0, 0, 'x', 14);
    }, w);
    wheels.push(w);
  }
  // the front castors
  for (const s of [-1, 1]) {
    tpl(`wchair-cf|${s}`, (P) => P.ext(M.steelDark, s * 0.2 - 0.025, s * 0.2 + 0.025, 0.08, 0.16, 0.26, 0.34, 0.012), group);
    const c = part(cylG(0.075, 0.075, 0.05, 14), M.ink, group);
    c.rotation.z = PI / 2;
    c.position.set(s * 0.2, 0.075, 0.3);
    c.userData.r = 0.075;
    group.add(c);
    wheels.push(c);
  }
  const api = {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
  api.setRoll(roll);
  return api;
}

/** an ambulance stretcher: deck at 0.75, an X-frame on four big castors, a head section, a strap */
export function buildStretcher({roll = 0, head = 0} = {}) {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  const L = 1.95;
  const W = 0.65;
  tpl('stretcher', (P) => {
    // the X frame
    for (const s of [-1, 1]) {
      P.rod(M.steel, [s * (W / 2 - 0.04), 0.14, -0.6], [s * (W / 2 - 0.04), 0.66, 0.1], 0.024, 10);
      P.rod(M.steel, [s * (W / 2 - 0.04), 0.14, 0.6], [s * (W / 2 - 0.04), 0.66, -0.1], 0.024, 10);
      P.ext(M.steel, s * (W / 2 - 0.06), s * (W / 2 - 0.02), 0.12, 0.17, -0.66, 0.66, 0.02);
    }
    P.ext(M.steel, -W / 2, W / 2, 0.64, 0.7, -L / 2 + 0.1, L / 2 - 0.1, 0.025); // the deck frame
    P.add(M.linen, rb(W - 0.06, 0.08, L - 0.7, 0.035), 0, 0.74, 0.3); // the mattress
    P.ext(M.steelDark, -0.2, 0.2, 0.7, 0.74, L / 2 - 0.12, L / 2 - 0.02, 0.015);
    P.add(M.rose, rb(W - 0.02, 0.02, 0.1, 0.008), 0, 0.79, 0.5); // the strap
    P.add(M.ink, rb(0.08, 0.035, 0.12, 0.012), 0, 0.81, 0.5);
    for (const s of [-1, 1]) {
      // the drop rails
      P.ext(M.panel, s * (W / 2 + 0.01) - 0.02, s * (W / 2 + 0.01) + 0.02, 0.8, 1.02, -0.5, 0.4, 0.02);
      P.rod(M.steel, [s * (W / 2 + 0.01), 0.7, -0.46], [s * (W / 2 + 0.01), 0.84, -0.46], 0.014, 8);
      P.rod(M.steel, [s * (W / 2 + 0.01), 0.7, 0.36], [s * (W / 2 + 0.01), 0.84, 0.36], 0.014, 8);
    }
    P.ext(M.steelDark, -0.26, 0.26, 0.74, 0.78, L / 2 - 0.06, L / 2 + 0.04, 0.015); // the push bar
    P.text('STRETCHER', {fg: HOS.inkSoft, weight: 700, px: 54}, 0.032, 0, 0.6, 0.0, -PI / 2);
    // a folded IV pole and an O2 cylinder under the deck
    P.rod(M.steel, [-W / 2 + 0.08, 0.68, -0.7], [-W / 2 + 0.08, 1.1, -0.74], 0.016, 8);
    P.cyl(M.green, 0.06, 0.06, 0.4, 0, 0.24, -0.4, 'z', 14);
    P.ext(M.steelDark, -0.08, 0.08, 0.18, 0.3, -0.26, -0.2, 0.012);
  }, group);
  const headG = new THREE.Group();
  headG.position.set(0, 0.7, -0.05);
  group.add(headG);
  tpl('stretcher-head', (P) => {
    P.ext(M.steel, -W / 2 + 0.04, W / 2 - 0.04, -0.04, 0.0, -0.85, 0.0, 0.02);
    P.add(M.linen, rb(W - 0.06, 0.08, 0.84, 0.035), 0, 0.04, -0.43);
    P.add(M.pillow, rb(W - 0.2, 0.09, 0.3, 0.045), 0, 0.12, -0.62);
  }, headG);
  for (const x of [-(W / 2 - 0.05), W / 2 - 0.05]) {
    for (const z of [-0.62, 0.62]) {
      tpl(`str-fork|${x.toFixed(2)}|${z}`, (P) => P.ext(M.steelDark, x - 0.035, x + 0.035, 0.1, 0.17, z - 0.045, z + 0.045, 0.015), group);
      const w = part(cylG(0.075, 0.075, 0.06, 14), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.075, z);
      w.userData.r = 0.075;
      wheels.push(w);
    }
  }
  const api = {
    group,
    deck: 0.78,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
    setHead(k) {
      headG.rotation.x = clamp(k, 0, 1) * 0.9;
    },
  };
  api.setRoll(roll);
  api.setHead(head);
  return api;
}

/** a porter's equipment trolley: two shelves at 0.90 and 0.45, a push handle, a box and a bin on it */
export function buildPorterTrolley() {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl('portertrolley', (P) => {
    P.ext(M.panel, -0.4, 0.4, 0.86, 0.9, -0.3, 0.28, 0.02); // the top shelf
    P.ext(M.panel, -0.4, 0.4, 0.42, 0.46, -0.3, 0.28, 0.02); // the lower shelf
    for (const x of [-0.35, 0.35]) {
      for (const z of [-0.25, 0.23]) P.rod(M.steel, [x, 0.14, z], [x, 0.9, z], 0.022, 10);
    }
    for (const x of [-0.35, 0.35]) P.rod(M.steel, [x, 0.9, 0.23], [x, 1.02, 0.3], 0.02, 8);
    P.cyl(M.ink, 0.024, 0.024, 0.74, 0, 1.02, 0.3, 'x', 12); // the push handle
    P.ext(M.steelDark, -0.38, 0.38, 0.9, 0.94, 0.26, 0.3, 0.012);
    P.text('PORTER', {fg: HOS.inkSoft, weight: 700, px: 54}, 0.034, 0, 0.62, 0.29);
    // what it carries
    P.ext(M.cardboard, -0.34, -0.02, 0.9, 1.1, -0.22, 0.14, 0.025);
    P.text('SUPPLIES', {fg: HOS.inkSoft, weight: 700, px: 48}, 0.026, -0.18, 1.0, 0.145);
    P.cyl(M.mintLight, 0.11, 0.1, 0.22, 0.22, 1.01, -0.04, 'y', 16);
    P.ext(M.panel, -0.3, 0.3, 0.46, 0.58, -0.24, 0.16, 0.02);
    P.add(M.linen, rb(0.5, 0.1, 0.34, 0.04), 0, 0.63, -0.04);
  }, group);
  for (const x of [-0.33, 0.33]) {
    for (const z of [-0.24, 0.22]) {
      tpl(`pr-fork2|${x}|${z}`, (P) => P.ext(M.steelDark, x - 0.035, x + 0.035, 0.1, 0.16, z - 0.04, z + 0.04, 0.015), group);
      const w = part(cylG(0.06, 0.06, 0.05, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.06, z);
      w.userData.r = 0.06;
      wheels.push(w);
    }
  }
  return {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
}

/** a linen trolley: a tubular frame, a canvas bag, folded linen stacks and a lid */
export function buildLinenCart() {
  const M = mats();
  const group = new THREE.Group();
  const wheels = [];
  tpl('linencart', (P) => {
    for (const x of [-0.34, 0.34]) for (const z of [-0.26, 0.26]) P.rod(M.steel, [x, 0.14, z], [x, 0.9, z], 0.022, 10);
    P.ext(M.steel, -0.36, 0.36, 0.86, 0.9, -0.28, -0.24, 0.015);
    P.ext(M.steel, -0.36, 0.36, 0.86, 0.9, 0.24, 0.28, 0.015);
    for (const s of [-1, 1]) P.ext(M.steel, s * 0.36 - 0.02, s * 0.36 + 0.02, 0.86, 0.9, -0.28, 0.28, 0.015);
    P.ext(M.steel, -0.36, 0.36, 0.16, 0.2, -0.28, 0.28, 0.015);
    // the canvas bag
    P.add(M.linen, rb(0.66, 0.6, 0.5, 0.05), 0, 0.56, 0.0);
    P.ext(M.blueLight, -0.34, 0.34, 0.8, 0.88, -0.27, 0.27, 0.025);
    P.text('CLEAN LINEN', {fg: HOS.inkSoft, weight: 700, px: 56}, 0.038, 0, 0.6, 0.262);
    // folded stacks on top and a lid half on
    for (let i = 0; i < 3; i++) P.add(i % 2 ? M.white : M.panel, rb(0.56, 0.07, 0.4, 0.025), 0, 0.93 + i * 0.075, 0.0, 0, i * 0.05, 0);
    P.add(M.panel, rb(0.7, 0.04, 0.3, 0.018), 0, 1.18, -0.18, -0.25, 0, 0);
  }, group);
  for (const x of [-0.32, 0.32]) {
    for (const z of [-0.24, 0.24]) {
      tpl(`lc-fork|${x}|${z}`, (P) => P.ext(M.steelDark, x - 0.035, x + 0.035, 0.1, 0.16, z - 0.04, z + 0.04, 0.015), group);
      const w = part(cylG(0.06, 0.06, 0.05, 12), M.ink, group);
      w.rotation.z = PI / 2;
      w.position.set(x, 0.06, z);
      w.userData.r = 0.06;
      wheels.push(w);
    }
  }
  return {
    group,
    setRoll(d) {
      for (const w of wheels) w.rotation.x = d / w.userData.r;
    },
  };
}
