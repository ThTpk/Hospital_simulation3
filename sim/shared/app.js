// The app — version 1's way of working, over version 2's hospital.
//
// What version 1 (Hospital_Workflow_3DSim) let you do, and this file reproduces:
//
//   pick a unit          the camera flies to it, its floor is isolated, the charts follow it
//   cut the building     ทึบ · X-ray · ไม่มีผนัง · ตัดขวาง (keys 1–4)
//   pick a floor         one floor on its own, or the whole stack lifted apart
//   camera presets       ภาพรวม · ผังจากบน · ระดับสายตา, and free orbit at any time
//   time                 play/pause, 1×–120×, drag the bar back to the minute the queue broke
//   live sliders         staffing, arrivals and referral rates — the whole day recomputes
//   preset scenarios     วันปกติ · เช้าวันจันทร์ · อุบัติเหตุหมู่ · แพทย์ลา · กระจายนัด · ฤดูไข้หวัด
//   click a patient      the camera follows them, their history opens, their whole route is drawn on the floor
//   whole-day comparison against a baseline you set, and CSV of both the summary and the five-minute series
//   leave it alone       after 25 seconds it tours itself, and the first touch hands control back
//
// The one behavioural difference from version 1, and it is deliberate: version 1 simulated forward and a slider
// changed the future only. This model records the whole day in one pass (~100 ms), so a slider re-records the whole
// day and the clock stays where it was. That is why the comparison panel can be honest — the numbers it shows are
// the whole day under the current settings, not the half of it that happened after you moved the slider.
import * as THREE from 'three';
import {DAY_END, DAY_START, STATIONS, STATION_KEYS, hhmm, runDay} from './model.js';
import {
  CAMERA_PRESETS, CLINIC_ROOM, FLOOR_LIFT, HOME_CAMERA, PLATES, PLATE_KEYS, ROOMS, UNIT_ROOMS,
  checkLayout, floorLift, plateCamera, roomCamera, unitFloor, walkPath, walkTime,
} from './layout.js';
import {HOS} from './style.js';
import {createHud} from './hud.js';
import {createWorld} from './world.js';
import {createSelection} from './select.js';
import {SCENARIOS, applyScenario, matchesScenario, scenarioOf, sliderSpecs} from './scenarios.js';
import {clinicTh, insTh, laneTh, unitTh} from './th.js';

const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const FOV = 30;
const MIN_D = 14;
const MAX_D = 560;
const MIN_EL = 4;
const MAX_EL = 80;
const PAN_SLOP = 6;
const SPEEDS = [1, 4, 12, 40, 120]; // simulated minutes per real second
const IDLE_BEFORE_TOUR = 25; // seconds untouched before the page starts touring itself

/** Units that get a row in the list and a slider: everything the model queues for and the plan has a room for. */
const LISTED = STATION_KEYS.filter((k) => UNIT_ROOMS[k] && k !== 'POR');

export async function runHospitalApp(opts = {}) {
  const root = document.documentElement;
  document.title = 'จำลองการทำงานในโรงพยาบาล 3 มิติ — รุ่นที่ 3';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);

  const layoutErrs = checkLayout();
  if (layoutErrs.length) console.warn('layout:', layoutErrs);

  await Promise.all([
    document.fonts.load('400 20px "JetBrains Mono"'),
    document.fonts.load('600 20px "Inter"'),
    document.fonts.load('800 20px "Inter"'),
  ]).catch(() => {});

  // ---------------------------------------------------------------- the day
  const cfg = opts.cfg || {seed: 20261119, servers: {}, svc: {}, dist: {}, scale: {}, orders: {}, orderK: 1, flatBooking: 0, hourK: null, surge: null, breaks: true, balking: true, scenario: 'normal'};
  const seedOf = () => cfg.seed ?? 20261119;
  let day = runDay({seed: seedOf(), walkTime, cfg});
  const world = createWorld({canvas, day});
  const {st} = world;
  const sel = createSelection(st.scene, st);

  // ---------------------------------------------------------------- state
  let t = 7 * 60 + 40; // open on the morning crush, where the interesting answer lives
  let playing = true;
  let speed = 1; // 4x — a minute of hospital every fifteen seconds, slow enough to watch one patient cross a room
  let cutaway = 'solid';
  let floorFilter = null;
  let explode = 1;
  let explodeWant = 1;
  let selUnit = null;
  let selRoom = null;
  let selT0 = -1;
  let followId = null;
  let tour = false;
  let tourI = -1;
  let tourT = 0;
  let idleFor = 0;
  let dragging = false;
  let dragTimer = null;
  const cam = {...HOME_CAMERA};
  const camWant = {...HOME_CAMERA};
  let manual = false;

  // ------------------------------------------------------- canvas and sizing
  const PIXEL_RATIO = 1;
  st.renderer.shadowMap.autoUpdate = false;
  st.sun.shadow.mapSize.set(2048, 2048);
  let frameNo = 0;
  const resize = () => {
    const w = Math.max(320, app.clientWidth || innerWidth);
    const h = Math.max(240, app.clientHeight || innerHeight);
    st.resize(w, h, PIXEL_RATIO);
    st.gtao.setSize(Math.max(2, Math.round(st.size.w / 2)), Math.max(2, Math.round(st.size.h / 2)));
  };
  addEventListener('resize', resize);
  resize();

  // ----------------------------------------------------- the bottleneck ring
  // Version 1 made the bottleneck room glow. The walls here are folded into instanced draws and cannot be
  // recoloured one room at a time, so the room gets an outline of its own instead — same job, one draw call.
  const ring = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({color: HOS.rose, transparent: true, opacity: 0.9}),
  );
  ring.visible = false;
  st.scene.add(ring);
  const showRing = (roomKey) => {
    const r = roomKey && ROOMS[roomKey];
    ring.visible = !!r;
    if (!r) return;
    ring.scale.set(r.w, 2.9, r.d);
    ring.position.set(r.x, 1.45 + world.liftOf(r.floor), r.z);
  };

  // --------------------------------------------------------------- handlers
  const glide = (to, hard = false) => {
    Object.assign(camWant, to);
    if (hard) Object.assign(cam, to);
    manual = false;
  };

  /**
   * Move the camera by hand, from a key.
   *
   * Everything goes through here so that a key press and a mouse drag leave the camera in exactly the same state:
   * both `cam` (where it is) and `camWant` (where it is heading) are set, and `manual` is raised so that nothing —
   * a selected unit, a followed patient, the tour — drags the view back out from under the visitor.
   */
  const nudge = ({az = 0, el = 0, zoom = 1, fwd = 0, side = 0, floor = 0}) => {
    manual = true;
    if (az) camWant.az = cam.az = (cam.az + az) % 360;
    if (el) camWant.el = cam.el = clamp(cam.el + el, MIN_EL, MAX_EL);
    if (zoom !== 1) camWant.d = cam.d = clamp(cam.d * zoom, MIN_D, MAX_D);
    if (fwd || side) {
      // pan in the direction the camera is facing, not along the world axes, so "left" is left on screen
      const r = cam.az * D2R;
      const step = Math.max(4, cam.d * 0.06);
      const dx = -Math.sin(r) * fwd * step + Math.cos(r) * side * step;
      const dz = -Math.cos(r) * fwd * step - Math.sin(r) * side * step;
      camWant.x = cam.x += dx;
      camWant.z = cam.z += dz;
    }
    if (floor) camWant.floor = cam.floor = clamp((cam.floor ?? 1) + floor, 1, 4);
  };

  const touch = () => {
    idleFor = 0;
    if (tour) {
      tour = false;
      hud.setTour(false);
    }
  };

  const setFloor = (f, {quiet = false} = {}) => {
    floorFilter = f;
    explodeWant = f == null ? 1 : 0;
    hud.setFloorBtn(f);
    if (!quiet && f != null) glide({...plateCamera(`F${f}`)});
    if (!quiet && f == null) glide(CAMERA_PRESETS.overview);
  };

  const selectUnit = (u, {fly = true} = {}) => {
    selUnit = u;
    selRoom = u ? (UNIT_ROOMS[u] ? UNIT_ROOMS[u][0] : null) : null;
    selT0 = t;
    followId = null;
    if (u) {
      // A floor hides the back of the floor below it, so focusing a unit isolates its floor — the same thing
      // version 1 did for exactly the same reason.
      setFloor(unitFloor(u), {quiet: true});
      if (fly && selRoom) glide(roomCamera(selRoom));
    } else {
      setFloor(null, {quiet: true});
      if (fly) glide(CAMERA_PRESETS.overview);
    }
    hud.setFloorBtn(floorFilter);
  };

  const selectRoom = (rk) => {
    const r = ROOMS[rk];
    if (!r) return;
    if (r.unit) {
      selectUnit(r.unit);
      selRoom = rk;
      glide(roomCamera(rk));
      return;
    }
    selUnit = null;
    selRoom = rk;
    selT0 = t;
    setFloor(r.floor, {quiet: true});
    glide(roomCamera(rk));
  };

  const follow = (id) => {
    followId = id;
    world.setFollow(id);
    if (id != null) {
      const p = day.patients.find((q) => q.id === id);
      if (p) {
        selUnit = null;
        // being followed means being seen: show the floor they are on, whichever it is
        const at = p.steps.find((s) => t >= s.t0 && t < (s.t1 || DAY_END));
        const f = at && at.k ? unitFloor(at.k, at.clinic) : null;
        if (f) setFloor(f, {quiet: true});
        hud.setFloorBtn(floorFilter);
      }
    }
  };

  /** Re-record the day on the edited config, keeping the clock and whoever is being followed if they still exist. */
  const rerun = () => {
    day = runDay({seed: seedOf(), walkTime, cfg});
    world.setDay(day);
    if (followId != null && !day.patients.some((p) => p.id === followId)) follow(null);
    scheduleCompare();
  };

  const setScenario = (key) => {
    applyScenario(cfg, key);
    rerun();
    hud.setScenario(key, scenarioOf(key).label);
    hud.syncSliders();
  };

  const setCutaway = (mode) => {
    cutaway = mode;
    world.setCutaway(mode);
    hud.setCutBtn(mode);
  };

  const seek = (minute) => {
    t = clamp(minute, DAY_START, DAY_END - 0.5);
    dragging = true;
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => (dragging = false), 350);
  };

  // --------------------------------------------------- whole-day comparison
  //
  // The baseline is a RECORDING, not a set of numbers: the whole day as it ran under the settings in force when the
  // button was pressed. Comparing a recording with a recording on the same seed is the only way the difference can
  // be attributed to the staffing rather than to the dice.
  let baseline = {day, label: 'ค่าตั้งต้น'};
  let compareTimer = null;
  const summaryUnit = () => selUnit || 'DOC';

  const compareRows = () => {
    const a = baseline.day;
    const b = day;
    const u = summaryUnit();
    const stuck = (d) => d.patients.filter((p) => !p.left).length;
    const dir = (delta, goodIsDown = true) => (Math.abs(delta) < 0.05 ? 'same' : (delta < 0) === goodIsDown ? 'good' : 'bad');
    const num = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
    const row = (label, av, bv, {digits = 0, unit = '', goodIsDown = true} = {}) => ({
      label,
      base: `${num(av, digits)}${unit}`,
      now: `${num(bv, digits)}${unit}`,
      delta: `${bv - av > 0 ? '+' : ''}${num(bv - av, digits)}`,
      dir: dir(bv - av, goodIsDown),
    });
    return [
      {section: 'ทั้งโรงพยาบาล'},
      row('กลับบ้านแล้ว', a.totals.left, b.totals.left, {goodIsDown: false}),
      row('อยู่ใน รพ. เฉลี่ย', a.totals.losSum / Math.max(1, a.totals.losCount), b.totals.losSum / Math.max(1, b.totals.losCount), {unit: ' น.'}),
      row('ค้างตอนปิดทำการ', stuck(a), stuck(b)),
      row('เดินออกกลางคัน', a.totals.balked + a.totals.reneged, b.totals.balked + b.totals.reneged),
      row('รับไว้นอน', a.totals.admitted, b.totals.admitted, {goodIsDown: false}),
      {section: unitTh(u)},
      row('รอเฉลี่ย', a.summary[u].waitMean, b.summary[u].waitMean, {digits: 1, unit: ' น.'}),
      row('90% ไม่เกิน', a.summary[u].waitP90, b.summary[u].waitP90, {unit: ' น.'}),
      row('คิวยาวสุด', a.summary[u].maxQueue, b.summary[u].maxQueue),
      row('ให้บริการ', a.summary[u].served, b.summary[u].served, {goodIsDown: false}),
      row('ใช้กำลังคน', a.summary[u].util * 100, b.summary[u].util * 100, {unit: '%', goodIsDown: false}),
    ];
  };

  const scheduleCompare = () => {
    clearTimeout(compareTimer);
    hud?.setCompare(compareRows(), 'คำนวณ…');
    compareTimer = setTimeout(() => hud.setCompare(compareRows(), ''), 30);
  };

  // --------------------------------------------------------------- CSV
  const download = (name, text) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], {type: 'text/csv;charset=utf-8'}));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const csv = (kind) => {
    const sc = scenarioOf(cfg.scenario || 'normal').label;
    if (kind === 'summary') {
      const head = ['unit', 'name', 'floor', 'slots', 'svc_min', 'served', 'util', 'wait_mean', 'wait_p50', 'wait_p90', 'wait_max', 'max_queue'];
      const rows = STATION_KEYS.filter((k) => day.summary[k]).map((k) => {
        const s = day.summary[k];
        return [k, unitTh(k), STATIONS[k].floor, s.servers, s.svc, s.served, (s.util * 100).toFixed(1), s.waitMean.toFixed(2), s.waitP50, s.waitP90, s.waitMax.toFixed(1), s.maxQueue];
      });
      download(`hospital-summary-${sc}.csv`, [head, ...rows].map((r) => r.join(',')).join('\n'));
      return;
    }
    const units = STATION_KEYS.filter((k) => day.summary[k]);
    const head = ['minute', 'clock', 'in_system', ...units.flatMap((k) => [`q_${k}`, `svc_${k}`, `staffed_${k}`])];
    const rows = day.history.map((h) => [
      h.t.toFixed(0),
      hhmm(h.t),
      h.inSystem,
      ...units.flatMap((k) => [h.stations[k]?.q ?? 0, h.stations[k]?.inSvc ?? 0, h.stations[k]?.staffed ?? 0]),
    ]);
    download(`hospital-series-${sc}.csv`, [head, ...rows].map((r) => r.join(',')).join('\n'));
  };

  // --------------------------------------------------------------- the HUD
  const sliders = sliderSpecs();
  const hud = createHud({
    host: app,
    cfg,
    sliders,
    floors: PLATE_KEYS.map((k) => PLATES[k]),
    handlers: {
      selectUnit: (u) => {
        touch();
        selectUnit(u === selUnit ? null : u);
      },
      selectPatient: (id) => {
        touch();
        follow(id);
      },
      setScenario: (k) => {
        touch();
        setScenario(k);
      },
      setCutaway: (m) => {
        touch();
        setCutaway(m);
      },
      setSection: (u) => {
        touch();
        world.setSection(u);
      },
      setFloor: (f) => {
        touch();
        selUnit = null;
        selRoom = null;
        setFloor(f);
      },
      setCamera: (name) => {
        touch();
        hud.setCamBtn(name);
        const c = CAMERA_PRESETS[name];
        if (!c) return;
        if (floorFilter != null && name !== 'overview') glide({...c, floor: floorFilter});
        else {
          if (name === 'overview') setFloor(null, {quiet: true});
          glide(c);
        }
      },
      setSpeed: (i) => {
        touch();
        speed = i;
        hud.setSpeedBtn(i);
      },
      togglePlay: () => {
        touch();
        playing = !playing;
        hud.setPlaying(playing);
      },
      seek: (m) => {
        touch();
        seek(m);
      },
      setSlider: (i, v, commit) => {
        touch();
        sliders[i].set(cfg, v);
        if (commit) {
          cfg.scenario = SCENARIOS.find((s) => matchesScenario(cfg, s.key))?.key || null;
          hud.setScenario(cfg.scenario, cfg.scenario ? scenarioOf(cfg.scenario).label : 'กำหนดเอง');
          rerun();
        }
      },
      setBaseline: () => {
        touch();
        baseline = {day, label: scenarioOf(cfg.scenario || 'normal').label};
        scheduleCompare();
      },
      csv,
    },
  });
  hud.setScenario(cfg.scenario || 'normal', scenarioOf(cfg.scenario || 'normal').label);
  hud.setCutBtn('solid');
  hud.setFloorBtn(null);
  hud.setCamBtn('overview');
  hud.setSpeedBtn(speed);
  hud.setPlaying(true);
  scheduleCompare();

  // ------------------------------------------------------------- picking
  //
  // Version 1's order of precedence, kept: a click that lands on a patient follows that patient; otherwise a click
  // that lands on a room selects that room; otherwise it clears the selection.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const gHit = new THREE.Vector3();

  /** Where the ray meets one floor's slab. */
  const planeAt = (cx, cy, y) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, st.camera);
    GROUND.constant = -y;
    if (!ray.ray.intersectPlane(GROUND, gHit)) return null;
    return {x: gHit.x, z: gHit.z};
  };

  /**
   * Which room a click landed on. The floors are stacked now, so the same x/z belongs to four rooms — the one
   * that counts is the highest visible floor whose room actually contains the hit, because that is the one the
   * ray reaches first on its way down.
   */
  const pickRoom = (cx, cy) => {
    const floors = PLATE_KEYS.map((k) => PLATES[k].floor)
      .filter((f) => floorFilter == null || f === floorFilter)
      .sort((a, b) => b - a);
    for (const f of floors) {
      const g = planeAt(cx, cy, world.liftOf(f));
      if (!g) continue;
      let best = null;
      let bestArea = Infinity;
      for (const r of Object.values(ROOMS)) {
        if (r.floor !== f) continue;
        if (Math.abs(g.x - r.x) > r.w / 2 || Math.abs(g.z - r.z) > r.d / 2) continue;
        const area = r.w * r.d;
        if (area < bestArea) {
          bestArea = area; // a small room inside a big one wins
          best = r.key;
        }
      }
      if (best) return best;
    }
    return null;
  };

  /** The patient nearest the click, in screen space, within a finger's width. */
  const pickPatient = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    const sx = ((cx - r.left) / r.width) * st.size.w;
    const sy = ((cy - r.top) / r.height) * st.size.h;
    const lim = Math.max(14, st.size.w * 0.012);
    let best = null;
    let bestD = lim * lim;
    const v = new THREE.Vector3();
    for (const p of world.drawnPeople()) {
      v.set(p.x, p.y, p.z);
      const q = st.project(v);
      if (!q) continue;
      const d = (q[0] - sx) ** 2 + (q[1] - sy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p.id;
      }
    }
    return best;
  };

  // ------------------------------------------------------------ camera input
  const pointers = new Map();
  let drag = null;
  let pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    touch();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
      return;
    }
    drag = {far: 0, panning: false, rotate: e.button === 2 || e.shiftKey, x0: e.clientX, y0: e.clientY, cur: {x: e.clientX, y: e.clientY}, grab: null};
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) camWant.d = cam.d = clamp(cam.d * (pinch / d), MIN_D, MAX_D);
      pinch = d;
      return;
    }
    if (!drag) return;
    drag.cur.x = e.clientX;
    drag.cur.y = e.clientY;
    drag.far = Math.max(drag.far, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    if (!drag.rotate && !drag.panning && drag.far > PAN_SLOP) {
      drag.panning = true;
      manual = true;
      drag.grab = planeAt(drag.x0, drag.y0, camTargetY());
    }
    if (drag.rotate) {
      manual = true;
      const k = 1600 / canvas.getBoundingClientRect().width;
      camWant.az = cam.az = (cam.az - dx * k * 0.25) % 360;
      camWant.el = cam.el = clamp(cam.el + dy * k * 0.12, MIN_EL, MAX_EL);
    }
  });
  const endPointer = (e) => {
    const was = drag;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (!was || pointers.size) {
      drag = null;
      return;
    }
    drag = null;
    if (was.rotate || was.panning) return;
    const pid = pickPatient(was.x0, was.y0);
    if (pid != null) {
      follow(pid);
      return;
    }
    const rk = pickRoom(was.x0, was.y0);
    if (rk) {
      const r = ROOMS[rk];
      if (r.unit && r.unit === selUnit) selectUnit(null);
      else selectRoom(rk);
      return;
    }
    follow(null);
    selectUnit(null);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      touch();
      manual = true;
      camWant.d = cam.d = clamp(cam.d * Math.exp(e.deltaY * 0.0012), MIN_D, MAX_D);
    },
    {passive: false},
  );

  addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    touch();
    // ---- the camera: arrows turn and tilt it, WASD slides it, + and - zoom. These work in every view, at every
    // floor and cutaway, and whether or not a unit is selected or a patient is being followed.
    if (k === 'arrowleft' && !e.shiftKey) nudge({az: 5});
    else if (k === 'arrowright' && !e.shiftKey) nudge({az: -5});
    else if (k === 'arrowup' && !e.shiftKey) nudge({el: 3});
    else if (k === 'arrowdown' && !e.shiftKey) nudge({el: -3});
    else if (k === 'w') nudge({fwd: 1});
    else if (k === 's') nudge({fwd: -1});
    else if (k === 'a') nudge({side: -1});
    else if (k === 'd') nudge({side: 1});
    else if (k === '+' || k === '=') nudge({zoom: 1 / 1.14});
    else if (k === '-' || k === '_') nudge({zoom: 1.14});
    else if (k === 'pageup') nudge({floor: 1});
    else if (k === 'pagedown') nudge({floor: -1});
    // ---- the clock keeps the arrows with shift held, and the brackets as a second way in
    else if (k === 'arrowright' || k === ']') seek(t + 10);
    else if (k === 'arrowleft' || k === '[') seek(t - 10);
    else if (k === ' ') {
      playing = !playing;
      hud.setPlaying(playing);
    } else if (k === '1') setCutaway('solid');
    else if (k === '2') setCutaway('xray');
    else if (k === '3') setCutaway('nowalls');
    else if (k === '4') setCutaway('section');
    else if (k === 'r') setScenario(cfg.scenario || 'normal');
    else if (k === 'h') {
      selectUnit(null);
      hud.setCamBtn('overview');
      glide(CAMERA_PRESETS.overview);
    } else if (k === 'escape') {
      follow(null);
      selectUnit(null);
    } else if (k === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------- auto tour
  // The same script version 1 used: nothing in it that a visitor could not press themselves.
  const TOUR = [
    {hold: 5.5, act: () => {
      selectUnit(null);
      setCutaway('solid');
    }},
    {hold: 4.5, act: () => selectUnit('REG')},
    {hold: 4.0, act: () => selectUnit('TRI')},
    {hold: 6.5, act: () => selectUnit('DOC')},
    {hold: 4.0, act: () => selectUnit('LAB')},
    {hold: 4.0, act: () => selectUnit('XRY')},
    {hold: 4.0, act: () => selectUnit('PHA')},
    {hold: 4.5, act: () => selectUnit('ER')},
    {hold: 4.5, act: () => selectUnit('OR')},
    {hold: 4.5, act: () => selectUnit('WARD')},
    {hold: 5.5, act: () => {
      selectUnit(null);
      setCutaway('nowalls');
    }},
    {hold: 5.5, act: () => {
      setCutaway('xray');
      hud.setCamBtn('top');
      glide(CAMERA_PRESETS.top);
    }},
  ];

  // --------------------------------------------------------------- panels
  const camTargetY = () => floorLift(cam.floor ?? 1, explode) + 2.2;

  const unitRows = (report) => {
    let worstQ = 0;
    for (const u of LISTED) worstQ = Math.max(worstQ, report.perUnit[u]?.q || 0);
    return LISTED.map((u) => {
      const d = STATIONS[u];
      const live = report.perUnit[u] || {q: 0, inSvc: 0};
      const s = day.summary[u];
      return {
        key: u,
        name: unitTh(u),
        q: live.q,
        inSvc: live.inSvc,
        slots: s.servers,
        util: s.util,
        waitMean: s.waitMean,
        selected: u === selUnit,
        bottleneck: live.q > 0 && live.q === worstQ && worstQ > 6,
      };
    }).sort((a, b) => b.q - a.q || a.name.localeCompare(b.name));
  };

  const patientCard = () => {
    if (followId == null) return null;
    const p = day.patients.find((q) => q.id === followId);
    if (!p) return null;
    const steps = [];
    let nowIdx = -1;
    for (let i = 0; i < p.steps.length; i++) {
      const s = p.steps[i];
      if (s.t0 > t) break;
      const live = t < (s.t1 || DAY_END);
      if (live) nowIdx = steps.length;
      if (s.kind === 'walk') {
        steps.push({label: `เดินไป${s.to in STATIONS ? unitTh(s.to) : 'ทางออก'}`, detail: `${((s.t1 || t) - s.t0).toFixed(1)} น.`, now: live});
      } else if (s.kind === 'queue') {
        steps.push({label: `รอคิว ${unitTh(s.k)}`, detail: `${((s.t1 || t) - s.t0).toFixed(0)} น.`, now: live});
      } else if (s.kind === 'service' || s.kind === 'bed') {
        steps.push({label: `${s.kind === 'bed' ? 'นอน' : 'รับบริการ'} ${unitTh(s.k)}`, detail: `${((s.t1 || t) - s.t0).toFixed(0)} น.`, now: live});
      } else if (s.kind === 'result') {
        steps.push({label: `รอผล ${unitTh(s.k)}`, detail: `${((s.t1 || t) - s.t0).toFixed(0)} น.`, now: live});
      } else if (s.kind === 'lift') {
        steps.push({label: 'ขึ้นลิฟต์', detail: `${((s.t1 || t) - s.t0).toFixed(1)} น.`, now: live});
      }
    }
    const waited = p.steps.filter((s) => s.kind === 'queue' && s.t0 <= t).reduce((a, s) => a + ((Math.min(s.t1 || t, t)) - s.t0), 0);
    const end = p.left ? p.tLeft : null;
    return {
      id: p.id,
      now: nowIdx,
      steps: steps.slice(-9),
      note: `${laneTh(p.lane)} · สิทธิ${insTh(p.ins)}${p.esi ? ` · ESI ${p.esi}` : ''}${p.clinic ? ` · ${clinicTh(p.clinic)}` : ''} · มาถึง ${hhmm(p.tArrive)}${end ? ` กลับ ${hhmm(end)}` : ''} · รอรวม ${waited.toFixed(0)} นาที`,
    };
  };

  /** The route the followed patient has walked, lifted onto the floors it crosses. */
  const routeFor = (step) => {
    const path = walkPath(step.from, step.to, {clinicFrom: step.clinic, clinicTo: step.clinic});
    const pts = [];
    path.pts.forEach((p, i) => {
      if (path.liftAt > 0 && i === path.liftAt) return; // the lift ride is not a walk
      pts.push(new THREE.Vector3(p[0], 0.06 + world.liftOf(p[3] ?? 1), p[2]));
    });
    return pts.length >= 2 ? pts : null;
  };

  // ------------------------------------------------------------------- loop
  let last = performance.now();
  let visible = true;
  let fpsT = 0;
  let fpsN = 0;

  const draw = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (!visible) {
      requestAnimationFrame(draw);
      return;
    }
    if (playing) {
      t += dt * SPEEDS[speed];
      t = DAY_START + ((t - DAY_START) % (DAY_END - DAY_START));
    }

    // ---- the tour takes over when nobody has touched anything
    idleFor += dt;
    if (!tour && idleFor > IDLE_BEFORE_TOUR) {
      tour = true;
      tourI = -1;
      tourT = 0;
      hud.setTour(true);
    }
    if (tour) {
      tourT -= dt;
      if (tourT <= 0) {
        tourI = (tourI + 1) % TOUR.length;
        TOUR[tourI].act();
        tourT = TOUR[tourI].hold;
        idleFor = IDLE_BEFORE_TOUR + 1; // the tour pressing its own buttons is not a visitor touching them
      }
    }

    // ---- the stack opens and closes
    explode += (explodeWant - explode) * (1 - Math.pow(0.002, dt));
    if (Math.abs(explode - explodeWant) < 0.002) explode = explodeWant;
    world.setView({floor: Math.abs(explode - 1) < 0.01 ? null : floorFilter, explode});

    const report = world.pose(t);

    // ---- the camera eases to where the mode wants it, unless the visitor has taken the wheel
    const k = 1 - Math.pow(0.0015, dt);
    for (const key of ['x', 'z', 'd', 'az', 'el', 'floor']) {
      if (camWant[key] == null) continue;
      cam[key] += (camWant[key] - cam[key]) * k;
    }
    // the camera follows the patient only while nobody is steering: one drag, one key, and it stops pulling
    if (followId != null && report.hero && !manual) {
      camWant.x += (report.hero.x - camWant.x) * 0.08;
      camWant.z += (report.hero.z - camWant.z) * 0.08;
      camWant.d = Math.min(camWant.d, 46);
      const hf = report.hero.step?.k ? unitFloor(report.hero.step.k, report.hero.step.clinic) : cam.floor;
      camWant.floor += (hf - camWant.floor) * 0.1;
    }

    if (drag && drag.panning && drag.grab) {
      const g = planeAt(drag.cur.x, drag.cur.y, camTargetY());
      if (g) {
        cam.x += drag.grab.x - g.x;
        cam.z += drag.grab.z - g.z;
        camWant.x = cam.x;
        camWant.z = cam.z;
      }
    }

    // ---- marks: the selected room, the bottleneck, the route of whoever is followed
    const obj = selRoom ? world.pickables[selRoom] : null;
    const fade = selRoom ? clamp((t - selT0) / 0.4 + 0.3) : 0;
    sel.box(obj || null, obj ? Math.max(0.2, fade) : 0);
    let bottleneck = null;
    for (const u of LISTED) {
      const q = report.perUnit[u]?.q || 0;
      if (q > 6 && (!bottleneck || q > bottleneck.q)) bottleneck = {key: u, q, name: unitTh(u)};
    }
    showRing(bottleneck && (floorFilter == null || unitFloor(bottleneck.key) === floorFilter) ? UNIT_ROOMS[bottleneck.key]?.[0] : null);
    if (followId != null && report.hero && report.hero.step?.kind === 'walk') sel.route(routeFor(report.hero.step), 1, 0.9);
    else sel.route(null, 0, 0);
    sel.update();

    if (frameNo++ % 3 === 0) st.renderer.shadowMap.needsUpdate = true;
    world.setDetail(cam.x, camTargetY(), cam.z, cam.d);
    st.frame({tx: cam.x, ty: camTargetY(), tz: cam.z, az: cam.az * D2R, el: cam.el * D2R, d: cam.d, fov: FOV, sx: -14, sy: 24});

    // ---- the panels, four times a second rather than sixty
    if (frameNo % 6 === 0) {
      const u = summaryUnit();
      hud.update({
        clock: hhmm(t),
        t,
        dragging,
        scenarioLabel: cfg.scenario ? scenarioOf(cfg.scenario).label : 'กำหนดเอง',
        totals: day.totals,
        inSystem: day.patients.filter((p) => p.tArrive <= t && !(p.left && (p.tLeft ?? 1e9) <= t)).length,
        losMean: day.totals.losSum / Math.max(1, day.totals.losCount),
        depts: unitRows(report),
        bottleneck,
        charts: frameNo % 24 === 0 ? {unit: u, unitName: unitTh(u), history: day.history, summary: day.summary[u], util: LISTED.map((k2) => ({key: k2, util: day.summary[k2].util}))} : null,
        patient: patientCard(),
      });
    }

    fpsN++;
    fpsT += dt;
    if (fpsT >= 1) {
      hud.setFps(Math.round(fpsN / fpsT));
      fpsN = 0;
      fpsT = 0;
    }
    requestAnimationFrame(draw);
  };

  window.HOSPITAL = {
    world,
    cam,
    get day() {
      return day;
    },
    get t() {
      return t;
    },
    get cfg() {
      return cfg;
    },
    seek,
    selectUnit,
    follow,
    setCutaway,
    setFloor,
    setScenario,
    pickRoom,
    rerun,
  };
  window.SIM = {ready: true, duration: (DAY_END - DAY_START) / 12, render: (v) => (t = DAY_START + v * 12)};
  requestAnimationFrame(draw);

  return {
    cfg,
    getDay: () => day,
    rerun,
    setVisible: (v) => {
      visible = v;
      if (v) {
        resize();
        last = performance.now();
      }
    },
    focusUnit: (key) => selectUnit(key),
  };
}
