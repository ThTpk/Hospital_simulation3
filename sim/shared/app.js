// The app: three ways to watch one hospital.
//
//   Whole hospital  the four levels side by side, the clock running, the busiest unit flagged
//   By unit         pick a unit and watch that unit work — its own room, its own staff, its own queue
//   By process      pick a patient journey and play it one unit at a time, walking between them
//
// The clock is the only thing that moves. `world.pose(t)` is a pure function of it, so the scrubber, the step rail
// and the play button are all just different ways of setting t, and none of them can disagree with the panels.
//
//   drag            pan          scroll/pinch  zoom        right-drag or shift-drag  swing the camera
//   click a room    select it    Esc           deselect    space  play/pause
//   1 2 3           switch mode  [ ]           step back and forward through a process
import * as THREE from 'three';
import {CLINICS, DAY_END, DAY_START, PROCESSES, ST, STATIONS, STATION_KEYS, findJourney, hhmm, runDay} from './model.js';
import {CLINIC_ROOM, HOME_CAMERA, PLATES, PLATE_KEYS, ROOMS, UNIT_ROOMS, plateCamera, roomCamera, walkPath, walkTime} from './layout.js';
import {HOS} from './style.js';
import {createUI} from './ui.js';
import {createWorld} from './world.js';
import {createSelection} from './select.js';
import {thumb} from './thumbs.js';
import * as EQ from './equip.js';

const D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const FOV = 26;
const MIN_D = 22;
const MAX_D = 620;
const MIN_EL = 18;
const MAX_EL = 74;
const PAN_SLOP = 6;
const SPEEDS = [1, 4, 12, 40, 120]; // simulated minutes per real second

const UNIT_THUMB = {
  REG: () => EQ.buildRegDesk?.(),
  INFO: () => EQ.buildQueueKiosk?.(),
  TRI: () => EQ.buildBPMonitor?.(),
  DOC: () => EQ.buildExamBed?.({head: 0.3}),
  PRC: () => EQ.buildIVPole?.({bags: 2}),
  DEN: () => EQ.buildDentalChair?.({light: 1, tray: true}),
  PT: () => EQ.buildParallelBars?.(),
  LAB: () => EQ.buildAnalyser?.({lights: true}),
  XRY: () => EQ.buildXrayTable?.({tube: 1.6}),
  CT: () => EQ.buildCTScanner?.({bed: 0.3, ring: 0}),
  EKG: () => EQ.buildEKGCart?.(),
  PHA: () => EQ.buildPharmShelf?.({bays: 4}),
  CSH: () => EQ.buildCashierCounter?.({cardReader: true}),
  ERT: () => EQ.buildRegDesk?.(),
  ER: () => EQ.buildERBed?.({rails: true, head: 0.3}),
  ANE: () => EQ.buildAnaesthesiaMachine?.(),
  OR: () => EQ.buildORTable?.({tilt: 0}),
  PACU: () => EQ.buildPACUBed?.(),
  ADM: () => EQ.buildRegDesk?.(),
  ICU: () => EQ.buildICUBed?.(),
  WARD: () => EQ.buildWardBed?.({head: 0.2}),
};

/**
 * Run the simulator inside `#app`.
 *
 * `opts.cfg` is the one config object the whole product shares — the analysis tab edits it in place and calls the
 * returned `rerun()`. Without a cfg this still runs standalone, which is how the bench pages and the capture script
 * use it.
 */
export async function runHospitalApp(opts = {}) {
  const root = document.documentElement;
  root.dataset.theme = 'light';
  document.title = 'Meridian General — Hospital Operations Simulator';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);

  // the models print signs and numbers with Inter, so the fonts must be in before anything is built
  await Promise.all([
    document.fonts.load('400 20px "JetBrains Mono"'),
    document.fonts.load('600 20px "Inter"'),
    document.fonts.load('800 20px "Inter"'),
  ]).catch(() => {});

  // ---------------------------------------------------------------- the day
  const cfg = opts.cfg || {flatBooking: 0, servers: {}, svc: {}, dist: {}, scale: {}, orderK: 1, orders: {}};
  const seedOf = () => cfg.seed ?? 20261119;
  let day = runDay({seed: seedOf(), walkTime, cfg});
  const world = createWorld({canvas, day});
  const {st} = world;
  const ui = createUI(app);
  const sel = createSelection(st.scene, st);

  // ---------------------------------------------------------------- layout
  const fit = () => {
    // the stage is a true 1600 x 900 frame scaled to fit its box — the window when it runs alone, the tab when the
    // shell is around it, which is why this measures the parent and not the viewport
    const box = app.parentElement && app.parentElement !== document.body ? app.parentElement : null;
    const w = box ? box.clientWidth : innerWidth;
    const h = box ? box.clientHeight : innerHeight;
    const k = Math.min(w / 1600, h / 900);
    app.style.transform = `translate(-50%, -50%) scale(${k})`;
  };
  // ---- making it run on the graphics an office PC actually has
  //
  // Three things, in order of how much they cost on Intel integrated graphics:
  //   the ambient-occlusion pass at full resolution, the 4096 shadow map re-rendered every frame, and the device
  //   pixel ratio. The panels are DOM and stay sharp regardless, so the 3D renders at 1:1, the AO runs at half
  //   resolution, and the shadows — which barely move, since the sun does not — refresh every third frame.
  const PIXEL_RATIO = 1;
  st.renderer.shadowMap.autoUpdate = false;
  st.sun.shadow.mapSize.set(2048, 2048);
  let frameNo = 0;
  const resize = () => {
    fit();
    st.resize(1600, 900, PIXEL_RATIO);
    st.gtao.setSize(Math.max(2, Math.round(st.size.w / 2)), Math.max(2, Math.round(st.size.h / 2)));
  };
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- state
  let t = 7 * 60 + 40; // open on the morning crush, where the interesting answer lives
  let playing = true;
  let speed = 2; // index into SPEEDS
  let mode = 'site';
  let plate = 'F1';
  let selUnit = null;
  let selRoom = null;
  let selT0 = -1;
  let dropOpen = false;
  let proc = null; // the chosen process
  let journey = null; // the recorded patient who walked it
  let stepIdx = 0;
  const cam = {...HOME_CAMERA};
  const camWant = {...HOME_CAMERA};
  let manual = false;
  const thumbCache = {};

  const glide = (to, hard = false) => {
    Object.assign(camWant, to);
    if (hard) Object.assign(cam, to);
  };

  const unitThumb = (u) => {
    if (thumbCache[u] !== undefined) return thumbCache[u];
    let url = null;
    try {
      const b = UNIT_THUMB[u]?.();
      if (b && b.group) url = thumb(b.group, {size: 150, az: 36, el: 24});
    } catch (e) {
      url = null;
    }
    thumbCache[u] = url;
    return url;
  };

  const selectUnit = (u, {fly = true} = {}) => {
    selUnit = u;
    selRoom = u ? (UNIT_ROOMS[u] ? UNIT_ROOMS[u][0] : null) : null;
    selT0 = t;
    if (u && fly) {
      const r = ROOMS[selRoom];
      if (r) {
        plate = r.plate;
        glide(roomCamera(selRoom));
      }
    }
  };

  const selectRoom = (rk) => {
    const r = ROOMS[rk];
    if (!r) return;
    selRoom = rk;
    selUnit = r.unit || null;
    selT0 = t;
    plate = r.plate;
    glide(roomCamera(rk));
  };

  /** Pick a process: find a patient who really walked it, and follow them. */
  const selectProcess = (key) => {
    proc = PROCESSES.find((p) => p.key === key) || null;
    journey = proc ? findJourney(day, proc) : null;
    stepIdx = 0;
    if (journey) {
      world.setFollow(journey.patient.id);
      t = journey.patient.tArrive + 0.1;
      goStep(0, true);
    } else world.setFollow(null);
  };

  /**
   * The journey as the rail shows it: one tile per UNIT, with the queue in front of it and the wait for its result
   * folded in, and a thin connector for each walk. A tile per recorded step would be twenty-odd tiles and would not
   * fit on the screen — and "play it one unit at a time" is the thing being asked for, so the unit is the tile.
   */
  const journeySteps = () => {
    if (!journey) return [];
    const steps = journey.patient.steps;
    const out = [];
    let n = 0;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind === ST.WALK) {
        const to = s.to in STATIONS ? STATIONS[s.to].name.replace(/ .*/, '') : 'the exit';
        out.push({kind: 'walk', name: `to ${to}`, t0: s.t0, t1: s.t1 || s.t0, step: s, walk: true});
        continue;
      }
      if (s.kind !== ST.SERVICE && s.kind !== ST.BED) continue;
      const prev = steps[i - 1];
      const next = steps[i + 1];
      const queued = prev && prev.kind === ST.QUEUE ? prev : null;
      const result = next && next.kind === ST.RESULT ? next : null;
      n++;
      out.push({
        kind: 'unit',
        n,
        key: s.k,
        name: STATIONS[s.k]?.name || s.k,
        t0: queued ? queued.t0 : s.t0, // the tile starts when the patient joins the queue, not when they are called
        t1: result ? result.t1 || s.t1 : s.t1,
        step: s,
        wait: queued ? (queued.t1 || queued.t0) - queued.t0 : 0,
        svc: (s.t1 || s.t0) - s.t0,
        res: result ? (result.t1 || result.t0) - result.t0 : 0,
      });
    }
    return out;
  };

  const goStep = (i, hard = false) => {
    const steps = journeySteps();
    if (!steps.length) return;
    stepIdx = clamp(i, 0, steps.length - 1);
    const s = steps[stepIdx];
    t = s.t0 + 0.05;
    const rk = s.step.k ? (s.step.k === 'DOC' && s.step.clinic ? CLINIC_ROOM[s.step.clinic] : UNIT_ROOMS[s.step.k]?.[0]) : null;
    if (rk) {
      plate = ROOMS[rk].plate;
      glide(roomCamera(rk), hard);
      selRoom = rk;
      selUnit = s.step.k;
    }
  };

  const takeOver = () => {
    manual = true;
  };

  /**
   * Run the day again on the edited config and hand the new recording to the 3D.
   *
   * The clock does not move and the camera does not move: the point of editing a parameter is to see what changed
   * at the minute you were already looking at. The followed patient cannot survive a re-run — they were a patient
   * of the old recording — so the process player picks whoever walked the same journey in the new one.
   */
  const rerunDay = () => {
    day = runDay({seed: seedOf(), walkTime, cfg});
    world.setDay(day);
    if (proc) {
      journey = findJourney(day, proc);
      world.setFollow(journey ? journey.patient.id : null);
      if (journey) t = Math.max(t, journey.patient.tArrive + 0.1);
    }
    return day;
  };

  // ---------------------------------------------------------------- picking
  //
  // Every room is an axis-aligned rectangle on a known plate, so a click is answered by unprojecting onto the
  // ground and asking which rectangle holds that point. That is exact, costs one ray and 73 comparisons, and —
  // unlike raycasting the meshes — it does not care that the furniture has been folded into instanced draws.
  // It also picks a room by its floor, so clicking the gap between two beds still selects the ward.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ROOM_LIST = Object.values(ROOMS);
  const pickAt = (cx, cy) => {
    const g = groundAt(cx, cy);
    if (!g) return null;
    let best = null;
    let bestArea = Infinity;
    for (const r of ROOM_LIST) {
      if (Math.abs(g.x - r.x) > r.w / 2 || Math.abs(g.z - r.z) > r.d / 2) continue;
      const area = r.w * r.d;
      if (area < bestArea) {
        bestArea = area; // a small room inside a big one wins
        best = r.key;
      }
    }
    return best;
  };

  // ------------------------------------------------------------ camera input
  const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const gHit = new THREE.Vector3();
  const groundAt = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, st.camera);
    if (!ray.ray.intersectPlane(GROUND, gHit)) return null;
    if (Math.abs(gHit.x - cam.x) > 3000 || Math.abs(gHit.z - cam.z) > 3000) return null;
    return {x: gHit.x, z: gHit.z};
  };
  const pointers = new Map();
  let drag = null;
  let pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    takeOver();
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
    // a few pixels of wobble is still a click, so panning only starts once the pointer has really left the press —
    // and it grabs the ground under the PRESS, so the drag tracks exactly instead of lagging by the first jump
    if (!drag.rotate && !drag.panning && drag.far > PAN_SLOP) {
      drag.panning = true;
      drag.grab = groundAt(drag.x0, drag.y0);
    }
    if (drag.rotate) {
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
    const rk = pickAt(was.x0, was.y0);
    if (rk) selectRoom(rk);
    else {
      selUnit = null;
      selRoom = null;
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      camWant.d = cam.d = clamp(cam.d * Math.exp(e.deltaY * 0.0012), MIN_D, MAX_D);
    },
    {passive: false},
  );

  // ------------------------------------------------------------- UI controls
  const wt = ui.els.wt;
  for (const b of ui.els.modes) {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      if (mode === 'site') {
        world.setFollow(null);
        proc = null;
        journey = null;
        glide(HOME_CAMERA);
      } else if (mode === 'unit') {
        world.setFollow(null);
        proc = null;
        journey = null;
        if (!selUnit) selectUnit('DOC');
        else selectUnit(selUnit);
      } else if (mode === 'process') {
        selectProcess(proc?.key || PROCESSES[0].key);
      }
    });
  }
  ui.els.sw.addEventListener('click', () => {
    dropOpen = !dropOpen;
  });
  ui.els.drop.addEventListener('click', (e) => {
    const it = e.target.closest('[data-plate]');
    if (!it) return;
    plate = it.dataset.plate;
    glide(plateCamera(plate));
    dropOpen = false;
  });
  ui.els.units.addEventListener('click', (e) => {
    const row = e.target.closest('[data-unit]');
    if (!row) return;
    mode = mode === 'process' ? 'unit' : mode;
    selectUnit(row.dataset.unit);
  });
  ui.els.procs.addEventListener('click', (e) => {
    const row = e.target.closest('[data-proc]');
    if (!row) return;
    selectProcess(row.dataset.proc);
  });
  ui.els.rail.addEventListener('click', (e) => {
    const s = e.target.closest('[data-step]');
    if (!s) return;
    goStep(Number(s.dataset.step));
  });
  ui.els.det.addEventListener('click', (e) => {
    const b = e.target.closest('[data-btn]');
    if (!b) return;
    if (b.dataset.btn === 'focus' && selRoom) glide(roomCamera(selRoom));
    if (b.dataset.btn === 'close') {
      selUnit = null;
      selRoom = null;
    }
    if (b.dataset.btn === 'home') glide(HOME_CAMERA);
  });
  ui.els.follow.addEventListener('click', (e) => {
    if (e.target.closest('[data-btn="unfollow"]')) {
      world.setFollow(null);
      journey = null;
      proc = null;
      mode = 'site';
      glide(HOME_CAMERA);
    }
  });

  // ------------------------------------------------------------- the scrubber
  const bar = document.createElement('div');
  bar.className = 'scrub';
  bar.innerHTML =
    '<b class="pp" title="Play or pause (space)"></b>' +
    '<div class="tk"><i></i><u></u></div><span class="tm"></span>' +
    `<span class="sp">${SPEEDS.map((s, i) => `<em data-sp="${i}">${s}&times;</em>`).join('')}</span>` +
    '<span class="hint">drag to pan · scroll to zoom · click a room</span>';
  app.appendChild(bar);
  const ppEl = bar.querySelector('.pp');
  const tkEl = bar.querySelector('.tk');
  const fillEl = bar.querySelector('.tk i');
  const markEl = bar.querySelector('.tk u');
  const tmEl = bar.querySelector('.tm');
  ppEl.addEventListener('click', () => {
    playing = !playing;
  });
  bar.querySelector('.sp').addEventListener('click', (e) => {
    const em = e.target.closest('[data-sp]');
    if (em) speed = Number(em.dataset.sp);
  });
  const scrubTo = (cx) => {
    const r = tkEl.getBoundingClientRect();
    t = DAY_START + clamp((cx - r.left) / r.width) * (DAY_END - DAY_START);
  };
  let scrubbing = false;
  tkEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    playing = false;
    scrubbing = true;
    scrubTo(e.clientX);
  });
  addEventListener('pointermove', (e) => {
    if (scrubbing) scrubTo(e.clientX);
  });
  const stopScrub = () => (scrubbing = false);
  addEventListener('pointerup', stopScrub);
  addEventListener('pointercancel', stopScrub);

  addEventListener('keydown', (e) => {
    if (e.key === ' ') playing = !playing;
    else if (e.key === 'ArrowRight') t = Math.min(DAY_END, t + 10);
    else if (e.key === 'ArrowLeft') t = Math.max(DAY_START, t - 10);
    else if (e.key === '[') goStep(stepIdx - 1);
    else if (e.key === ']') goStep(stepIdx + 1);
    else if (e.key === '1') ui.els.modes[0].click();
    else if (e.key === '2') ui.els.modes[1].click();
    else if (e.key === '3') ui.els.modes[2].click();
    else if (e.key === 'h') glide(HOME_CAMERA);
    else if (e.key === 'Escape') {
      selUnit = null;
      selRoom = null;
      dropOpen = false;
    } else if (e.key === 'f') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } else return;
    e.preventDefault();
  });

  // --------------------------------------------------------------- the panels
  const histFor = (u) => {
    const s = day.summary[u];
    if (!s) return null;
    return {
      label: `${STATIONS[u].name} · waiting time`,
      buckets: s.hist.slice(0, 31),
      mean: s.waitMean.toFixed(1),
      p50: s.waitP50,
      p90: s.waitP90,
    };
  };

  const kpiFor = (report) => {
    const inSystem = report.people;
    let worst = null;
    for (const u of STATION_KEYS) {
      const q = report.perUnit[u]?.q || 0;
      if (!worst || q > worst.q) worst = {u, q};
    }
    const admitted = day.patients.filter((p) => p.admitted && p.tArrive <= t).length;
    const left = day.patients.filter((p) => p.left && (p.tLeft ?? 1e9) <= t).length;
    return [
      {label: 'In the building', value: String(inSystem), sub: 'patients and staff on screen'},
      {label: 'Busiest queue', value: worst ? String(worst.q) : '0', sub: worst && worst.q ? STATIONS[worst.u].name : 'nothing waiting', warn: worst && worst.q > 25},
      {label: 'Gone home', value: String(left), sub: `of ${day.totals.arrived} who arrived today`},
      {label: 'Admitted', value: String(admitted), sub: `${day.summary.WARD.servers} ward beds, ${day.summary.ICU.servers} in ICU`},
    ];
  };

  const cardFor = (report) => {
    if (mode === 'process' && journey) {
      const p = journey.patient;
      const steps = journeySteps();
      const s = steps[stepIdx];
      const end = p.left ? p.tLeft : DAY_END;
      return {
        title: proc.name,
        sub: `Patient #${p.id} · arrived ${hhmm(p.tArrive)} · ${p.insName}`,
        tag: s ? (s.kind === 'walk' ? 'WALKING' : s.kind === 'queue' ? 'WAITING' : s.kind === 'result' ? 'AWAITING RESULT' : 'BEING SEEN') : '',
        tagColor: s && s.kind === 'walk' ? HOS.stWalk : s && s.kind === 'queue' ? HOS.stQueue : s && s.kind === 'result' ? HOS.stResult : HOS.stService,
        thumb: s && s.step.k ? unitThumb(s.step.k) : null,
        rows: [
          ['Door to door', `${(end - p.tArrive).toFixed(0)} min`],
          ['Spent queueing', `${p.steps.filter((x) => x.kind === ST.QUEUE).reduce((a, x) => a + ((x.t1 || 0) - x.t0), 0).toFixed(0)} min`],
          ['Units visited', String(journey.visited.length)],
          ['Clinic', p.clinic ? CLINICS[p.clinic].name : '—'],
        ],
        note: proc.note,
        btns: [{id: 'focus', label: 'Centre'}, {id: 'home', label: 'Whole site'}],
      };
    }
    if (selUnit) {
      const s = day.summary[selUnit];
      const d = STATIONS[selUnit];
      const live = report.perUnit[selUnit] || {q: 0, inSvc: 0, res: 0};
      const rooms = UNIT_ROOMS[selUnit] || [];
      return {
        title: d.name,
        sub: `${rooms.length} room${rooms.length > 1 ? 's' : ''} on level ${d.floor} · ${d.c} service slots · ${d.svc} min each`,
        tag: d.sizing === 'daily' ? 'SIZED ON THE DAY' : 'SIZED ON THE PEAK',
        tagColor: d.sizing === 'daily' ? HOS.violet : HOS.blue,
        thumb: unitThumb(selUnit),
        rows: [
          ['Waiting now', String(live.q)],
          ['Busy now', `${live.inSvc} of ${d.c}`],
          ['Seen today', String(s.served)],
          ['Utilisation', `${(s.util * 100).toFixed(0)}%`],
          ['Mean wait', `${s.waitMean.toFixed(1)} min`],
          ['p90 wait', `${s.waitP90} min`],
        ],
        note: d.result ? `A result from here takes about ${d.result} more minutes after the patient leaves the room.` : null,
        btns: [{id: 'focus', label: 'Centre'}, {id: 'home', label: 'Whole site'}, {id: 'close', label: 'Close'}],
      };
    }
    const p = PLATES[plate];
    const units = Object.values(ROOMS).filter((r) => r.plate === plate && r.unit).length;
    return {
      title: p.name,
      sub: p.sub,
      tag: 'LEVEL',
      tagColor: HOS.blue,
      thumb: null,
      rows: [
        ['Rooms', String(Object.values(ROOMS).filter((r) => r.plate === plate).length)],
        ['Service points', String(units)],
        ['Arrived today', String(day.totals.arrived)],
        ['Mean stay', `${(day.totals.losSum / day.totals.losCount).toFixed(0)} min`],
      ],
      note: 'The four levels are drawn side by side: an isometric camera cannot see inside a stacked building. A lift transfer plays as the patient stepping into the lift on one level and out on another.',
      btns: [{id: 'home', label: 'Whole site'}],
    };
  };

  const unitRows = (report) => {
    let worstQ = 0;
    for (const u of STATION_KEYS) worstQ = Math.max(worstQ, report.perUnit[u]?.q || 0);
    return STATION_KEYS.filter((u) => UNIT_ROOMS[u])
      .map((u) => {
        const d = STATIONS[u];
        const live = report.perUnit[u] || {q: 0, inSvc: 0};
        const s = day.summary[u];
        return {
          key: u,
          name: d.name,
          dept: d.dept,
          slots: d.c,
          q: live.q,
          inSvc: live.inSvc,
          waitLabel: `${s.waitMean.toFixed(0)} min mean wait`,
          selected: u === selUnit,
          bottleneck: live.q > 0 && live.q === worstQ && worstQ > 6,
        };
      })
      .sort((a, b) => b.q - a.q || a.name.localeCompare(b.name));
  };

  const SEG_COLOR = {[ST.WALK]: HOS.stWalk, [ST.QUEUE]: HOS.stQueue, [ST.SERVICE]: HOS.stService, [ST.RESULT]: HOS.stResult, [ST.BED]: HOS.stBed};

  // ------------------------------------------------------------------- loop
  let last = performance.now();
  let visible = true;
  const draw = (now) => {
    if (!visible) {
      last = now;
      requestAnimationFrame(draw);
      return;
    }
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (playing) {
      t += dt * SPEEDS[speed];
      t = DAY_START + ((t - DAY_START) % (DAY_END - DAY_START));
    }

    // in process mode the clock stays inside the followed patient's own day
    if (mode === 'process' && journey) {
      const p = journey.patient;
      const end = (p.left ? p.tLeft : DAY_END) + 1;
      if (t < p.tArrive) t = p.tArrive;
      if (t > end) t = p.tArrive;
      const steps = journeySteps();
      const i = steps.findIndex((s) => t >= s.t0 && t < (s.t1 || DAY_END));
      if (i >= 0 && i !== stepIdx) {
        stepIdx = i;
        const s = steps[i];
        const rk = s.step.k ? (s.step.k === 'DOC' && s.step.clinic ? CLINIC_ROOM[s.step.clinic] : UNIT_ROOMS[s.step.k]?.[0]) : null;
        if (rk && !manual) {
          plate = ROOMS[rk].plate;
          glide(roomCamera(rk));
        }
      }
    }

    const report = world.pose(t);

    // the camera eases toward where the mode wants it, unless the visitor has taken the wheel
    const k = 1 - Math.pow(0.0015, dt);
    for (const key of ['x', 'z', 'd', 'az', 'el']) cam[key] += (camWant[key] - cam[key]) * k;

    // follow the patient in process mode
    if (mode === 'process' && report.hero && !manual) {
      camWant.x += (report.hero.x - camWant.x) * 0.08;
      camWant.z += (report.hero.z - camWant.z) * 0.08;
    }

    // pan: one correction a frame, against the camera actually on screen
    if (drag && drag.panning && drag.grab) {
      const g = groundAt(drag.cur.x, drag.cur.y);
      if (g) {
        cam.x += drag.grab.x - g.x;
        cam.z += drag.grab.z - g.z;
        camWant.x = cam.x;
        camWant.z = cam.z;
      }
    }

    // the selection marks
    const obj = selRoom ? world.pickables[selRoom] : null;
    const fade = selRoom ? clamp((t - selT0) / 0.4 + 0.3) : 0;
    sel.box(obj || null, obj ? Math.max(0.2, fade) : 0);
    if (mode === 'process' && journey) {
      const s = journeySteps()[stepIdx];
      if (s && s.kind === 'walk') sel.route(routeFor(s.step), 1, 0.9);
      else sel.route(null, 0, 0);
    } else sel.route(null, 0, 0);
    sel.update();

    // the sun never moves, so the shadow map only needs refreshing when something under it has
    if (frameNo++ % 3 === 0) st.renderer.shadowMap.needsUpdate = true;
    world.setDetail(cam.x, cam.z, cam.d);
    st.frame({tx: cam.x, ty: 2.2, tz: cam.z, az: cam.az * D2R, el: cam.el * D2R, d: cam.d, fov: FOV, sx: -14, sy: 24});

    // pins: the plate names and the busiest units
    const pins = [];
    for (const pk of PLATE_KEYS) {
      const pl = PLATES[pk];
      const q = st.project(new THREE.Vector3(pl.x, 0.1, pl.z - 34));
      if (q) pins.push({kind: 'plate', x: q[0], y: q[1], text: pl.name, sub: pl.sub});
    }
    for (const u of STATION_KEYS) {
      const live = report.perUnit[u];
      if (!live || (live.q < 8 && u !== selUnit)) continue;
      const a = world.anchors[u];
      if (!a) continue;
      const q = st.project(a());
      if (!q || q[1] < 80 || q[1] > 820 || q[0] < 350 || q[0] > 1250) continue;
      pins.push({
        kind: u === selUnit ? 'sel' : live.q > 25 ? 'hot' : '',
        x: q[0],
        y: q[1],
        text: `${STATIONS[u].name}`,
        sub: `${live.q} waiting · ${live.inSvc}/${STATIONS[u].c} busy`,
      });
    }

    const steps = mode === 'process' ? journeySteps() : [];
    ui.update({
      clock: hhmm(t),
      dayName: 'Monday',
      mode,
      plate,
      plateInfo: PLATES[plate],
      plates: PLATE_KEYS.map((k) => PLATES[k]),
      dropOpen,
      kpi: kpiFor(report),
      units: unitRows(report),
      processes: PROCESSES.map((p) => ({
        key: p.key,
        name: p.name,
        note: p.note,
        routeLabel: p.route.join(' › '),
        selected: proc?.key === p.key,
      })),
      steps: steps.map((s, i) => ({
        key: s.key || s.name,
        n: s.n || '',
        name: s.name,
        walk: s.kind === 'walk',
        detail:
          s.kind === 'walk'
            ? `${(s.t1 - s.t0).toFixed(1)} min`
            : `${s.wait > 0.5 ? `waited ${s.wait.toFixed(0)} · ` : ''}seen ${s.svc.toFixed(0)} min${s.res > 0.5 ? ` · +${s.res.toFixed(0)} result` : ''}`,
        state: i < stepIdx ? 'done' : i === stepIdx ? 'now' : 'next',
      })),
      card: cardFor(report),
      hist: histFor(selUnit || 'DOC'),
      follow:
        mode === 'process' && journey
          ? {
              title: `Following patient #${journey.patient.id}`,
              sub: `${proc.name} · ${hhmm(journey.patient.tArrive)} → ${hhmm(journey.patient.left ? journey.patient.tLeft : DAY_END)}`,
              at: stepIdx,
              segs: journey.patient.steps.map((s) => ({
                w: Math.max(0.3, (s.t1 || 0) - s.t0),
                color: SEG_COLOR[s.kind] || HOS.shade,
                label: `${s.kind} ${s.k || ''}`,
              })),
            }
          : null,
      pins,
    });

    ppEl.className = `pp${playing ? ' on' : ''}`;
    const frac = (t - DAY_START) / (DAY_END - DAY_START);
    fillEl.style.width = `${frac * 100}%`;
    tmEl.textContent = `${hhmm(t)}`;
    for (const em of bar.querySelectorAll('[data-sp]')) em.classList.toggle('on', Number(em.dataset.sp) === speed);
    if (journey) {
      const p = journey.patient;
      const a = (p.tArrive - DAY_START) / (DAY_END - DAY_START);
      const b = ((p.left ? p.tLeft : DAY_END) - DAY_START) / (DAY_END - DAY_START);
      markEl.style.display = 'block';
      markEl.style.left = `${a * 100}%`;
      markEl.style.width = `${Math.max(0.4, (b - a) * 100)}%`;
    } else markEl.style.display = 'none';

    requestAnimationFrame(draw);
  };

  /** The route drawn on the floor for the walking step being played, cached per leg. */
  const routeCache = new Map();
  function routeFor(step) {
    const key = `${step.from}>${step.to}|${step.clinic || ''}`;
    if (routeCache.has(key)) return routeCache.get(key);
    const path = walkPath(step.from, step.to, {clinicFrom: step.clinic, clinicTo: step.clinic});
    // drop the leg that crosses between two plates: that gap is a lift ride, not a walk, and a ribbon drawn across
    // it would read as a corridor between two buildings
    const pts = [];
    path.pts.forEach((p, i) => {
      if (path.liftAt > 0 && i === path.liftAt) return;
      pts.push(new THREE.Vector3(p[0], 0.06, p[2]));
    });
    const out = pts.length >= 2 ? pts : null;
    routeCache.set(key, out);
    return out;
  }

  window.HOSPITAL = {world, cam, get day() {
    return day;
  }, get t() {
    return t;
  }, seek: (v) => (t = v), selectUnit, selectProcess, pickAt};
  window.SIM = {ready: true, duration: (DAY_END - DAY_START) / 12, render: (v) => (t = DAY_START + v * 12)};
  selectUnit(null);
  requestAnimationFrame(draw);

  return {
    cfg,
    getDay: () => day,
    rerun: rerunDay,
    setVisible: (v) => {
      visible = v;
      if (v) {
        resize();
        last = performance.now();
      }
    },
    /** Called from the other tabs: show this unit working, in its own room. */
    focusUnit: (key) => {
      if (!STATIONS[key]) return;
      mode = 'unit';
      proc = null;
      journey = null;
      world.setFollow(null);
      selectUnit(key);
    },
  };
}
