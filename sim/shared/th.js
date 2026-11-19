// ชื่อไทยสำหรับหน้าจอ — the Thai labels the panels use.
//
// `model.js` keeps every name in English on purpose: those strings are printed onto the room signs and the queue
// screens inside the 3D, and a texture atlas of Thai glyphs is not something the model kit can bake. The panels are
// a different audience — version 1's interface was Thai throughout — so the names are translated here, in one table,
// rather than being changed in the model and breaking the signs.
//
// A key that is missing falls back to the model's own English name, so adding a unit to the model can never leave a
// blank label on screen.
import {CLINICS, INSURANCE, LANES, STATIONS} from './model.js';

export const UNIT_TH = {
  INFO: 'ประชาสัมพันธ์',
  REG: 'เวชระเบียน / ลงทะเบียน',
  TRI: 'คัดกรอง / ซักประวัติ',
  DOC: 'ห้องตรวจแพทย์',
  PRC: 'ห้องหัตถการ / ฉีดยา',
  DEN: 'ทันตกรรม',
  PT: 'กายภาพบำบัด',
  LAB: 'ห้องปฏิบัติการ',
  XRY: 'เอกซเรย์',
  CT: 'CT / MRI / อัลตราซาวด์',
  EKG: 'คลื่นไฟฟ้าหัวใจ',
  PHA: 'ห้องยา',
  CSH: 'การเงิน',
  ERT: 'คัดแยกฉุกเฉิน',
  ER: 'ห้องฉุกเฉิน',
  ANE: 'เตรียมผ่าตัด / วิสัญญี',
  OR: 'ห้องผ่าตัด',
  PACU: 'ห้องพักฟื้น',
  ADM: 'แผนกรับผู้ป่วยใน',
  ICU: 'หอผู้ป่วยวิกฤต',
  WARD: 'หอผู้ป่วยใน',
  POR: 'เวรเปล',
};

export const LANE_TH = {
  walkin: 'ผู้ป่วยเดินเข้า',
  appt: 'ผู้ป่วยนัดหมาย',
  checkup: 'ตรวจสุขภาพประจำปี',
  dental: 'ทันตกรรม',
  physio: 'กายภาพบำบัด',
  vacc: 'ฉีดวัคซีน',
  er: 'ฉุกเฉิน',
  elective: 'ผ่าตัดตามนัด',
};

export const INS_TH = {
  ucs: 'บัตรทอง',
  sss: 'ประกันสังคม',
  csmbs: 'ข้าราชการ',
  cash: 'จ่ายเอง',
  private: 'ประกันเอกชน',
};

export const CLINIC_TH = {
  med: 'อายุรกรรม',
  surg: 'ศัลยกรรม',
  ped: 'กุมารเวช',
  obg: 'สูติ-นรีเวช',
  ortho: 'ออร์โธปิดิกส์',
  eye: 'จักษุ',
  ent: 'หู คอ จมูก',
};

export const unitTh = (k) => UNIT_TH[k] || STATIONS[k]?.name || k;
export const laneTh = (k) => LANE_TH[k] || LANES[k]?.name || k;
export const insTh = (k) => INS_TH[k] || INSURANCE.find((i) => i.key === k)?.name || k;
export const clinicTh = (k) => (k ? CLINIC_TH[k] || CLINICS[k]?.name || k : null);

/**
 * ชื่อไทยของห้อง — for the label that floats over the selected room.
 *
 * Only the rooms whose name is not simply their unit's: the halls, the lift lobbies, the back-of-house, and the
 * suites that are named after what is inside them (four consultation suites, three x-ray rooms, six theatres,
 * eight wards). Anything not listed falls back to the unit's Thai name, and then to the English name printed on
 * the room's own sign inside the 3D.
 */
export const ROOM_TH = {
  // ชั้น 1
  ENTRY: 'ทางเข้าหลัก',
  LOBBY: 'โถงต้อนรับ',
  KIOSK: 'ตู้กดบัตรคิว',
  WAITA: 'โถงรอตรวจ',
  WAITB: 'โถงรอตรวจวินิจฉัย',
  SUBW1: 'โถงรอย่อยหน้าห้องตรวจ',
  READ: 'ห้องอ่านผลรังสี',
  DOC1: 'ห้องตรวจ อายุรกรรม · กุมารเวช',
  XRY1: 'ห้องเอกซเรย์ 1',
  XRY2: 'ห้องเอกซเรย์ 2',
  XRY3: 'ห้องเอกซเรย์ 3',
  // ชั้น 2
  DOC2: 'ห้องตรวจ ศัลยกรรม · ออร์โธปิดิกส์',
  DOC3: 'ห้องตรวจ สูติ-นรีเวช',
  DOC4: 'ห้องตรวจ จักษุ · หู คอ จมูก',
  WAITE: 'โถงรอคลินิกเฉพาะทาง',
  WAITF: 'โถงรอทำหัตถการ',
  GYM: 'ห้องฝึกกายภาพ',
  DAY2: 'ห้องสังเกตอาการ',
  OFF2: 'สำนักงานคลินิก',
  OFF3: 'ห้องเวชระเบียน',
  STAFF2: 'ห้องพักเจ้าหน้าที่',
  STORE2: 'คลังเวชภัณฑ์สะอาด',
  // ชั้น 3
  WAITG: 'โถงรอญาติ',
  SCRUB: 'ห้องเตรียมและล้างมือ',
  CSSD: 'หน่วยจ่ายกลางปลอดเชื้อ',
  STERILE: 'ทางเดินปลอดเชื้อ',
  OFF4: 'สำนักงานห้องผ่าตัด',
  STORE3: 'คลังเครื่องมือ',
  PLANT3: 'ห้องเครื่อง',
  OR1: 'ห้องผ่าตัด 1',
  OR2: 'ห้องผ่าตัด 2',
  OR3: 'ห้องผ่าตัด 3',
  OR4: 'ห้องผ่าตัด 4',
  OR5: 'ห้องผ่าตัด 5',
  OR6: 'ห้องผ่าตัด 6',
  // ชั้น 4
  WAITH: 'โถงรอผู้มาเยี่ยม',
  NURSE4: 'เคาน์เตอร์พยาบาล',
  OFF5: 'สำนักงานหอผู้ป่วย',
  W1: 'หอผู้ป่วย อายุรกรรม A',
  W2: 'หอผู้ป่วย อายุรกรรม B',
  W3: 'หอผู้ป่วย ศัลยกรรม A',
  W4: 'หอผู้ป่วย ศัลยกรรม B',
  W5: 'หอผู้ป่วย กุมารเวช',
  W6: 'หอผู้ป่วย สูติกรรม',
  W7: 'หอผู้ป่วย ออร์โธปิดิกส์',
  W8: 'หอผู้ป่วย ห้องพิเศษ',
  // ทุกชั้น
  LIFT1: 'โถงลิฟต์',
  LIFT2: 'โถงลิฟต์',
  LIFT3: 'โถงลิฟต์',
  LIFT4: 'โถงลิฟต์',
  STAIR2: 'บันไดและชานพัก',
  STAIR3: 'บันไดและชานพัก',
  STAIR4: 'บันไดและชานพัก',
  WC1: 'ห้องน้ำ',
  WC2: 'ห้องน้ำ',
  WC4: 'ห้องน้ำและห้องอาบน้ำ',
};

/** ชื่อห้องสำหรับป้ายลอย: ชื่อห้องถ้ามี ไม่มีก็ชื่อหน่วยบริการที่อยู่ในห้องนั้น */
export const roomTh = (key, unit) => ROOM_TH[key] || (unit ? unitTh(unit) : null);
