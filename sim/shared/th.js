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
