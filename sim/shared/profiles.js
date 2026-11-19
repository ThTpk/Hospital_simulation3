// โปรไฟล์ผู้รับบริการ — the six ways this hospital's day is allowed to look.
//
// SmartHospital's profiles were a patient mix plus a count per hour. The same idea here, but expressed in the
// controls this model actually has: how many of each ARRIVAL LANE turn up, how the hours are weighted, whether the
// booked patients are all in the morning, and how freely the doctors order tests. Nothing here invents a new
// mechanism — every field is a `cfg` key `runDay` already honours, which is why picking a profile changes the 3D,
// the panels and the queue analysis together and they cannot disagree.
import {LANES, LANE_KEYS} from './model.js';

/** 06:00–19:00; anything outside the simulated day is ignored. */
export const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

const flat = () => new Array(24).fill(1);
const shapeK = (map) => {
  const a = flat();
  for (const h of Object.keys(map)) a[Number(h)] = map[h];
  return a;
};

export const PROFILES = [
  {
    key: 'base',
    name: 'วันธรรมดาปกติ',
    sub: '631 ราย/วัน',
    desc: 'ค่าตั้งต้นของแบบจำลอง: โรงพยาบาลทั่วไปขนาดกลาง ผู้ป่วยนอก 440 ราย นัดหมายกระจุกตัวช่วงเช้าแบบที่โรงพยาบาลไทยส่วนใหญ่เป็น',
    cfg: {scale: {}, hourK: null, flatBooking: 0, orderK: 1, orders: {}},
  },
  {
    key: 'crush',
    name: 'เช้าแน่น',
    sub: '+18% และกองเช้า',
    desc: 'คนมากขึ้นและมาเร็วขึ้น ผู้ป่วยเดินเข้าและผู้ป่วยนัดเพิ่มขึ้น โดยกระจุกที่ 07:00–10:00 — ใช้ดูว่าระบบพังที่จุดไหนก่อน',
    cfg: {
      scale: {walkin: 1.15, appt: 1.2, checkup: 1.1},
      hourK: shapeK({6: 1.3, 7: 1.45, 8: 1.4, 9: 1.25, 10: 1.1, 13: 0.85, 14: 0.8, 15: 0.8}),
      flatBooking: 0,
      orderK: 1,
      orders: {},
    },
  },
  {
    key: 'spread',
    name: 'กระจายนัดทั่ววัน',
    sub: 'คนเท่าเดิม',
    desc: 'คนกลุ่มเดิมทุกคน แต่นัดหมาย 180 รายถูกกระจายให้ทั่วช่วงเปิดบริการแทนที่จะกองไว้ตอนเช้า — มาตรการที่ไม่ต้องจ้างใครเพิ่มเลย',
    cfg: {scale: {}, hourK: null, flatBooking: 1, orderK: 1, orders: {}},
  },
  {
    key: 'flu',
    name: 'ฤดูไข้หวัด',
    sub: 'X-ray เท่าตัว',
    desc: 'ผู้ป่วยเดินเข้ามากขึ้น 35% และแพทย์สั่งเอกซเรย์เป็นสองเท่า — คำถามข้อ 4 ในสเปก: ถ้าสัดส่วนการส่งตรวจเปลี่ยน ระบบรับได้ไหม',
    cfg: {scale: {walkin: 1.35, er: 1.15}, hourK: null, flatBooking: 0, orderK: 1.1, orders: {xray: 2, lab: 1.15}},
  },
  {
    key: 'holiday',
    name: 'วันหยุดยาว',
    sub: 'ER หนัก OPD เบา',
    desc: 'คลินิกปิดเกือบหมด นัดหมายเลื่อนออกไป แต่อุบัติเหตุฉุกเฉินเพิ่มขึ้น 60% — ภาระย้ายไปอยู่ที่ห้องฉุกเฉิน ห้องผ่าตัดและเตียง',
    cfg: {
      scale: {walkin: 0.55, appt: 0.25, checkup: 0.1, dental: 0.2, physio: 0.2, vacc: 0.3, er: 1.6, elective: 0.3},
      hourK: null,
      flatBooking: 0,
      orderK: 1,
      orders: {},
    },
  },
  {
    key: 'checkupday',
    name: 'วันตรวจสุขภาพองค์กร',
    sub: 'ตรวจสุขภาพ ×4',
    desc: 'ตรวจสุขภาพประจำปีของบริษัทเข้ามาพร้อมกันตอนเช้า 160 ราย ทุกคนต้องผ่าน Lab, X-ray และ EKG ก่อนพบแพทย์ — คอขวดจะอยู่ที่ห้องตรวจวินิจฉัย ไม่ใช่ห้องตรวจแพทย์',
    cfg: {scale: {checkup: 4}, hourK: shapeK({6: 1.2, 7: 1.2, 8: 1.1}), flatBooking: 0, orderK: 1, orders: {}},
  },
];

export const PROFILE_KEYS = PROFILES.map((p) => p.key);

/** The lanes as the profile editor shows them: a daily volume you can type over. */
export function laneRows(cfg) {
  return LANE_KEYS.map((k) => {
    const L = LANES[k];
    const scale = cfg.scale?.[k] ?? 1;
    return {key: k, name: L.name, base: L.perDay, perDay: Math.round(L.perDay * scale), scale, booked: !!L.booked, entry: L.entry};
  });
}

/** Everything a profile sets, applied onto the live config in place (so every reader sees one object). */
export function applyProfile(cfg, key) {
  const p = PROFILES.find((x) => x.key === key) || PROFILES[0];
  cfg.scale = {...p.cfg.scale};
  cfg.hourK = p.cfg.hourK ? p.cfg.hourK.slice() : null;
  cfg.flatBooking = p.cfg.flatBooking;
  cfg.orderK = p.cfg.orderK;
  cfg.orders = {...p.cfg.orders};
  cfg.profile = p.key;
  return cfg;
}

/** Total arrivals a day under the current config — the headline number of the profile card. */
export function totalPerDay(cfg) {
  return LANE_KEYS.reduce((a, k) => a + LANES[k].perDay * (cfg.scale?.[k] ?? 1), 0);
}

/** Has the user edited away from the profile they picked? The card says so rather than lying about which it is. */
export function matchesProfile(cfg, key) {
  const p = PROFILES.find((x) => x.key === key);
  if (!p) return false;
  const sameScale = LANE_KEYS.every((k) => (cfg.scale?.[k] ?? 1) === (p.cfg.scale[k] ?? 1));
  const sameHours = (!cfg.hourK && !p.cfg.hourK) || (cfg.hourK && p.cfg.hourK && cfg.hourK.every((v, i) => v === p.cfg.hourK[i]));
  const sameOrders = ['lab', 'xray', 'ekg', 'ct'].every((d) => (cfg.orders?.[d] ?? 1) === (p.cfg.orders[d] ?? 1));
  return sameScale && !!sameHours && sameOrders && cfg.flatBooking === p.cfg.flatBooking && cfg.orderK === p.cfg.orderK;
}
