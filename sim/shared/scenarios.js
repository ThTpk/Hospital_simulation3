// สถานการณ์สำเร็จรูป — the preset days, and the one place a preset is allowed to write to the config.
//
// Carried over from version 1 (วันปกติ · เช้าวันจันทร์ · อุบัติเหตุหมู่ · แพทย์ลา) and extended with the two
// questions version 1 could not ask, because it had no appointment book and no order sets: what spreading the
// appointments is worth, and what happens when the share of patients sent for imaging doubles.
//
// Every field below is a key `runDay` already honours. A preset is therefore nothing but a named set of slider
// positions — anything a preset does, the sliders can do by hand, and the panel says which preset you are on (or
// "กำหนดเอง" once you have moved something). No preset has a private mechanism of its own.
import {LANES, LANE_KEYS, STATIONS} from './model.js';
import {unitTh} from './th.js';

/** Keys a scenario may set. Everything else in cfg (the seed, the view) belongs to the visitor, not the preset. */
const OWNED = ['servers', 'svc', 'dist', 'scale', 'hourK', 'flatBooking', 'orderK', 'orders', 'surge', 'breaks', 'balking'];

const hourK = (map) => {
  const a = new Array(24).fill(1);
  for (const h of Object.keys(map)) a[Number(h)] = map[h];
  return a;
};

export const SCENARIOS = [
  {
    key: 'normal',
    label: 'วันปกติ',
    hint: 'ค่าตั้งต้นของแบบจำลอง — ผู้ป่วยนอก 440 ราย ฉุกเฉิน 75 ราย นัดหมายกระจุกตัวช่วงเช้าแบบที่โรงพยาบาลไทยส่วนใหญ่เป็น',
    cfg: {},
  },
  {
    key: 'monday',
    label: 'เช้าวันจันทร์',
    hint: 'คนมากขึ้นและมาเร็วขึ้น ผู้ป่วยเดินเข้า +30% ผู้ป่วยนัด +25% กองกันที่ 07:00–10:00 — คอขวดจะย้ายที่ให้ดูภายในสองชั่วโมงแรก',
    cfg: {
      scale: {walkin: 1.3, appt: 1.25, checkup: 1.1},
      hourK: hourK({6: 1.35, 7: 1.5, 8: 1.4, 9: 1.2, 13: 0.85, 14: 0.8, 15: 0.75, 16: 0.7}),
    },
  },
  {
    key: 'masscas',
    label: 'อุบัติเหตุหมู่',
    hint: 'รถตู้ชนที่ 10:30 — ผู้ป่วยฉุกเฉินเข้ามา 18 รายต่อชั่วโมงเป็นเวลาหนึ่งชั่วโมงครึ่ง และส่วนใหญ่เป็น ESI 1–2 ซึ่งแซงคิวทุกคนและกินเตียง ER นานเป็นสองเท่า',
    cfg: {
      surge: {lane: 'er', from: 10.5 * 60, to: 12 * 60, perHour: 18, esiBias: true},
    },
  },
  {
    key: 'shortdoc',
    label: 'แพทย์ลา 3 ห้อง',
    hint: 'ห้องตรวจเปิดได้ 16 จาก 19 ห้อง ของอื่นเท่าเดิม — ลดกำลัง 16% เพื่อดูว่าเวลารอเพิ่มขึ้นกี่เท่า (ไม่ใช่ 16%)',
    cfg: {servers: {DOC: 16}},
  },
  {
    key: 'spread',
    label: 'กระจายนัดทั่ววัน',
    hint: 'คนกลุ่มเดิมทุกคน แต่นัดหมาย 180 รายถูกกระจายให้ทั่วช่วงเปิดบริการแทนที่จะกองไว้ตอนเช้า — มาตรการที่ไม่ต้องจ้างใครเพิ่มเลย',
    cfg: {flatBooking: 1},
  },
  {
    key: 'flu',
    label: 'ฤดูไข้หวัด',
    hint: 'ผู้ป่วยเดินเข้า +35% และแพทย์สั่งเอกซเรย์เป็นสองเท่า — คำถามที่ว่าถ้าสัดส่วนการส่งตรวจเปลี่ยน ระบบยังรับได้ไหม',
    cfg: {scale: {walkin: 1.35, er: 1.15}, orderK: 1.1, orders: {xray: 2, lab: 1.15}},
  },
];

export const SCENARIO_KEYS = SCENARIOS.map((s) => s.key);
export const scenarioOf = (key) => SCENARIOS.find((s) => s.key === key) || SCENARIOS[0];

/** Write a preset onto the live config, clearing whatever the previous preset or the sliders had left behind. */
export function applyScenario(cfg, key) {
  const sc = scenarioOf(key);
  for (const f of OWNED) {
    if (f === 'breaks' || f === 'balking') cfg[f] = sc.cfg[f] ?? true;
    else if (f === 'orderK') cfg.orderK = sc.cfg.orderK ?? 1;
    else if (f === 'flatBooking') cfg.flatBooking = sc.cfg.flatBooking ?? 0;
    else if (f === 'hourK') cfg.hourK = sc.cfg.hourK ? sc.cfg.hourK.slice() : null;
    else if (f === 'surge') cfg.surge = sc.cfg.surge ? {...sc.cfg.surge} : null;
    else cfg[f] = {...(sc.cfg[f] || {})};
  }
  cfg.scenario = sc.key;
  return cfg;
}

/** Is the config still exactly the preset it claims to be? The HUD says "กำหนดเอง" when it is not. */
export function matchesScenario(cfg, key) {
  const sc = scenarioOf(key);
  const sameMap = (f) => {
    const want = sc.cfg[f] || {};
    const have = cfg[f] || {};
    const keys = new Set([...Object.keys(want), ...Object.keys(have)]);
    for (const k of keys) if ((want[k] ?? (f === 'scale' || f === 'orders' ? 1 : undefined)) !== (have[k] ?? (f === 'scale' || f === 'orders' ? 1 : undefined))) return false;
    return true;
  };
  if (!['servers', 'svc', 'dist', 'scale', 'orders'].every(sameMap)) return false;
  if ((cfg.flatBooking ?? 0) !== (sc.cfg.flatBooking ?? 0)) return false;
  if ((cfg.orderK ?? 1) !== (sc.cfg.orderK ?? 1)) return false;
  const hk = sc.cfg.hourK || null;
  if (!!cfg.hourK !== !!hk) return false;
  if (hk && !cfg.hourK.every((v, i) => v === hk[i])) return false;
  if (!!cfg.surge !== !!sc.cfg.surge) return false;
  if (cfg.breaks === false || cfg.balking === false) return false;
  return true;
}

/** The units whose staffing and service time can be moved while the day plays. */
export const TUNABLE = ['REG', 'TRI', 'DOC', 'LAB', 'XRY', 'PHA', 'CSH', 'ER'];

/**
 * How long one patient takes at a unit, as a slider.
 *
 * This is the second half of the pair: the first slider says how many of a thing there are, this one says how fast
 * each of them is. They are not interchangeable — six pharmacy windows at 5 minutes and five windows at 4 minutes
 * have almost the same capacity but very different queues — and the whole point of having both is to be able to
 * ask which one is cheaper to buy.
 *
 * For the consultation rooms the figure is the unit's average: `model.js` scales each clinic's own service time by
 * the same ratio, so dragging this to 7 minutes makes Medicine 7.8 and ENT 5.4 rather than flattening them all.
 */
const svcSpec = (k) => {
  const base = STATIONS[k].svc;
  const coarse = base >= 20;
  return {
    kind: 'svc',
    key: k,
    label: 'เวลาบริการ',
    sub: unitTh(k),
    min: coarse ? Math.max(2, Math.round(base * 0.3)) : Math.max(0.5, Math.round(base * 0.3 * 10) / 10),
    max: coarse ? Math.round(base * 2.2) : Math.round(base * 2.2 * 10) / 10,
    step: coarse ? 1 : 0.1,
    get: (cfg) => cfg.svc?.[k] ?? base,
    set: (cfg, v) => (cfg.svc[k] = v),
    fmt: (v) => `${coarse ? Math.round(v) : v.toFixed(1)} นาที/ราย`,
    note: k === 'DOC' ? 'ค่าเฉลี่ยของทั้ง 7 คลินิก — แต่ละคลินิกจะถูกปรับตามสัดส่วนของตัวเอง' : null,
  };
};

/** The sliders the ปรับสถานการณ์ panel offers: the handful of numbers worth moving while watching. */
export function sliderSpecs() {
  return [
    ...TUNABLE.flatMap((k) => [
      {
        kind: 'servers',
        key: k,
        label: unitTh(k),
        group: 'จุดบริการ และเวลาบริการ',
        min: 1,
        max: Math.max(STATIONS[k].max, STATIONS[k].c),
        step: 1,
        get: (cfg) => cfg.servers?.[k] ?? STATIONS[k].c,
        set: (cfg, v) => (cfg.servers[k] = v),
        fmt: (v) => `${v} ${STATIONS[k].bed ? 'เตียง' : 'จุด'}`,
      },
      svcSpec(k),
    ]),
    {
      kind: 'lane',
      key: 'walkin',
      label: 'ผู้ป่วยเดินเข้า',
      group: 'จำนวนผู้ป่วยที่เข้ามา',
      min: 0,
      max: 600,
      step: 10,
      get: (cfg) => Math.round(LANES.walkin.perDay * (cfg.scale?.walkin ?? 1)),
      set: (cfg, v) => (cfg.scale.walkin = v / LANES.walkin.perDay),
      fmt: (v) => `${v} ราย/วัน`,
    },
    {
      kind: 'lane',
      key: 'appt',
      label: 'ผู้ป่วยนัดหมาย',
      min: 0,
      max: 400,
      step: 10,
      get: (cfg) => Math.round(LANES.appt.perDay * (cfg.scale?.appt ?? 1)),
      set: (cfg, v) => (cfg.scale.appt = v / LANES.appt.perDay),
      fmt: (v) => `${v} ราย/วัน`,
    },
    {
      kind: 'lane',
      key: 'er',
      label: 'ผู้ป่วยฉุกเฉิน',
      min: 0,
      max: 200,
      step: 5,
      get: (cfg) => Math.round(LANES.er.perDay * (cfg.scale?.er ?? 1)),
      set: (cfg, v) => (cfg.scale.er = v / LANES.er.perDay),
      fmt: (v) => `${v} ราย/วัน`,
    },
    {
      kind: 'book',
      key: 'flatBooking',
      label: 'กระจายนัดทั่ววัน',
      group: 'การนัดหมายและการส่งตรวจ',
      min: 0,
      max: 1,
      step: 0.05,
      get: (cfg) => cfg.flatBooking ?? 0,
      set: (cfg, v) => (cfg.flatBooking = v),
      fmt: (v) => `${Math.round(v * 100)}%`,
    },
    {
      kind: 'order',
      key: 'lab',
      label: 'สัดส่วนส่ง Lab',
      min: 0,
      max: 3,
      step: 0.05,
      get: (cfg) => cfg.orders?.lab ?? 1,
      set: (cfg, v) => (cfg.orders.lab = v),
      fmt: (v) => `×${v.toFixed(2)}`,
    },
    {
      kind: 'order',
      key: 'xray',
      label: 'สัดส่วนส่ง X-ray',
      min: 0,
      max: 3,
      step: 0.05,
      get: (cfg) => cfg.orders?.xray ?? 1,
      set: (cfg, v) => (cfg.orders.xray = v),
      fmt: (v) => `×${v.toFixed(2)}`,
    },
  ];
}

/** Total arrivals a day under the current config — the headline the clock panel shows. */
export function totalPerDay(cfg) {
  return LANE_KEYS.reduce((a, k) => a + LANES[k].perDay * (cfg.scale?.[k] ?? 1), 0);
}
