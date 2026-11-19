// The toy hospital's shared look — every model kit takes its colours and materials from here.
//
// Proportions and finish are borrowed from the simulator skill's airport kit (chunky bevelled forms, matte paint,
// soft contact shadows, few colours, readable from its silhouette at thumbnail size). The palette is a hospital's:
// clinical white, a cool grey-blue ground, mint for nursing, blue for the front office and signage, amber for
// pharmacy and billing, rose for emergency. Yellow and orange only on machines and warnings.
//
// Real metres, y up, no toy upscaling — hospital rooms are small already and the camera can come close.
// Never declare a colour in your own file. If the palette lacks one, add it here and say so in your report.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {createMapStage} from './stage.js';

export const HOS = {
  // ---- world and ground
  bg: '#e9edf7', // beyond the map
  ground: '#dbe2f1', // the lot around the building
  groundDeep: '#c9d2e6', // planting beds, shaded strips
  road: '#e7ebf6', // roads and the car park
  lane: '#ffffff', // lane markings
  bay: '#f0b63c', // parking bay lines

  // ---- floors and walls
  slab: '#cfd7e8', // the edge of a floor plate
  floorA: '#f2f5fc', // white tile (1 m grid)
  floorB: '#e6ebf7', // the alternate tile
  floorWarm: '#f4f0e8', // waiting halls and wards
  wall: '#f8fafe', // white wall
  wallShade: '#dfe5f2', // inner faces, undersides
  wallBase: '#c6cfe3', // skirting
  glass: '#c3dcea', // frosted cubicle glass
  glassClear: '#a8cbe0',
  door: '#9fb6d8', // door frames

  // ---- department colours (signs, floor wayfinding stripes, canopy roofs)
  blue: '#2f6fe0', // front office, records
  blueDeep: '#1f4fb4',
  blueLight: '#8fb4f2',
  mint: '#3fbfa8', // nursing, triage
  mintDeep: '#2a9a86',
  mintLight: '#9fe0d4',
  violet: '#8a6fe0', // inpatient, surgery
  violetLight: '#c4b4f2',
  olive: '#7f9a5f', // laboratory, imaging
  oliveLight: '#bfd4a0',
  amber: '#e0a040', // pharmacy, billing
  amberLight: '#f2d49a',
  rose: '#e05a62', // emergency
  roseLight: '#f2a8ac',
  teal: '#2f9fc0', // physiotherapy, dental
  tealLight: '#9fd8e8',

  // ---- neutrals
  white: '#f7f9fd',
  panel: '#eaeef8',
  shade: '#ccd4e6',
  ink: '#1c2436', // tyres, dark trim, heavy type
  inkSoft: '#3a4458',
  steel: '#aeb8cc', // bed frames, IV poles
  steelDark: '#8b96ad',
  chrome: '#c8d0e0',
  screen: '#15314a', // a monitor that is off
  screenOn: '#1f7fa8', // a monitor that is on
  lamp: '#fdf4dc', // lit lamps
  red: '#e0484d',
  green: '#54bf7a', // trees, normal signals
  greenDeep: '#3d9a5e',
  trunk: '#ab8766',
  linen: '#eef2f8', // bed sheets
  pillow: '#ffffff',
  curtain: '#9fc4d8', // bed curtains
  wood: '#d8b98c', // waiting-hall furniture
  cardboard: '#e0b47e',

  // ---- people: uniforms by profession (a contract with people.js)
  coatDoctor: '#fbfdff', // the white coat
  scrubDoctor: '#5e8fd8', // scrubs under the coat
  scrubNurse: '#4fcbb4', // nursing mint
  scrubTech: '#9aa6bd', // lab and radiology grey
  uniAdmin: '#4f7fd8', // records and billing blue
  uniPharm: '#e0a040', // pharmacy amber
  uniPorter: '#6f7b94', // porters, darker grey
  gownPatient: '#cfe0ee', // the inpatient gown
  // outpatient clothes — pick at random from this set so a crowd does not repeat
  civvies: ['#e4e8f2', '#d8c3b0', '#b8c8dc', '#e8cfd4', '#c8d4bc', '#dcd2e8', '#cfd8e4', '#e8dcc4'],
  skin: ['#f0d2b4', '#e4bc96', '#d4a37c', '#b88660', '#9a6b4a', '#f6ddc4'],
  hair: ['#241c18', '#3a2a20', '#1a1a1c', '#54402e', '#8a8a92'],

  // ---- queue states (a contract with world.js — the page's colour key reads these values, never a copy of them)
  stWalk: '#3f7fe0', // walking between units
  stQueue: '#e8c23c', // queueing
  stQueueLong: '#e0484d', // queueing a long time (full red = waited over 45 min)
  stService: '#54bf7a', // in service
  stResult: '#9a7fe0', // waiting for a result
  stBed: '#8a6fe0', // in a bed
};

const matCache = new Map();
/** A shared matte material; paint = true adds the soft clearcoat that painted equipment carries. */
export function hosMat(color, {rough = 0.58, metal = 0, paint = false, emissive = null, opacity = 1} = {}) {
  const key = [color, rough, metal, paint, emissive, opacity].join('|');
  if (matCache.has(key)) return matCache.get(key);
  const m = paint
    ? new THREE.MeshPhysicalMaterial({color, roughness: rough, metalness: metal, clearcoat: 0.3, clearcoatRoughness: 0.35})
    : new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal});
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = 1;
  }
  if (opacity < 1) {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  }
  matCache.set(key, m);
  return m;
}
/** The airport kit's name for it, so code lifted from there needs no edits. */
export const toyMat = hosMat;

const geoCache = new Map();
/** A rounded box, cached by size; r is the bevel radius (the toy look lives in the bevels — be generous). */
export function rbox(w, h, d, r = Math.min(w, h, d) * 0.12, segs = 3) {
  const key = [w, h, d, r, segs].map((v) => +v.toFixed(3)).join('|');
  if (!geoCache.has(key)) geoCache.set(key, new RoundedBoxGeometry(w, h, d, segs, Math.min(r, Math.min(w, h, d) / 2 - 1e-3)));
  return geoCache.get(key);
}

/** A cylinder, cached by size (bed legs, IV poles, castors, test tubes). */
export function rcyl(rt, rb, h, seg = 14) {
  const key = ['cyl', rt, rb, h, seg].map((v) => String(v)).join('|');
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CylinderGeometry(rt, rb, h, seg));
  return geoCache.get(key);
}

/** A sphere, cached by size (heads, knobs, beacons). */
export function rsph(r, seg = 16) {
  const key = ['sph', r, seg].join('|');
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)));
  return geoCache.get(key);
}

/** A mesh that both casts and receives shadows. */
export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Shorthand rounded box: box(w, h, d, mat, x, y, z) — y is the box's centre. */
export function box(w, h, d, mat, x = 0, y = 0, z = 0, r) {
  return mesh(rbox(w, h, d, r), mat, x, y, z);
}

/** Text on a transparent canvas texture, for department signs, queue numbers and room numbers (Inter, bold). */
export function labelTexture(text, {color = HOS.ink, bg = null, w = 1024, h = 256, font = '800 150px Inter, system-ui, sans-serif', align = 'center'} = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, align === 'center' ? w / 2 : 24, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A wall or hanging sign: a thin plate with one or two lines of text. Returns a Group facing +z. */
export function signPanel(text, sub = '', {w = 2.4, h = 0.6, color = HOS.blue} = {}) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.06, hosMat(HOS.white, {rough: 0.5}), 0, 0, 0, 0.06));
  const tex = labelTexture(text, {color, w: 1024, h: 256, font: '700 130px Inter, system-ui, sans-serif'});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * (sub ? 0.5 : 0.62)), new THREE.MeshBasicMaterial({map: tex, transparent: true}));
  face.position.set(0, sub ? h * 0.12 : 0, 0.035);
  g.add(face);
  if (sub) {
    const t2 = labelTexture(sub, {color: HOS.inkSoft, w: 1024, h: 180, font: '500 90px Inter, system-ui, sans-serif'});
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.24), new THREE.MeshBasicMaterial({map: t2, transparent: true}));
    f2.position.set(0, -h * 0.26, 0.035);
    g.add(f2);
  }
  return g;
}

/** The stage tuned for the hospital: neutral tone mapping (ACES greys a pale ground out), soft sun, wide shadows. */
export function createHospitalStage(canvas, {fov = 26} = {}) {
  const st = createMapStage(canvas, {bg: HOS.bg, fov});
  st.scene.fog.near = 420;
  st.scene.fog.far = 1100;
  st.renderer.toneMapping = THREE.NeutralToneMapping;
  st.renderer.toneMappingExposure = 0.95;
  st.scene.traverse((o) => {
    if (o.isHemisphereLight) {
      o.color.set('#f5f8ff');
      o.groundColor.set('#ccd5ee');
      o.intensity = 1.05;
    }
  });
  st.sun.intensity = 2.1;
  st.sun.color.set('#ffffff');
  st.sun.shadow.radius = 5;
  st.gtao.blendIntensity = 0.72;
  return st;
}
export const createToyStage = createHospitalStage;
