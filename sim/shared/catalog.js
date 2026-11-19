// บริการและฝ่ายทั้งหมดของโรงพยาบาล — the service catalogue behind the simulated units.
//
// Carried over from SmartHospital, re-keyed onto this model's 22 units and extended where this model goes further:
// the consultation rooms are seven clinics with their own room counts, radiology splits into plain film and
// cross-sectional imaging, intensive care and the porters are modelled rather than noted as out of scope.
//
// `station: null` means the service exists in the hospital but has no queue in the model. Saying so in a table is
// the honest version of a scope boundary — better than leaving the reader to guess why the ward round is missing.
import {CLINICS, CLINIC_KEYS, LANES, PROCESSES, STATIONS, STATION_KEYS} from './model.js';

export const CATALOG = [
  {
    group: 'ส่วนหน้า (Front Office)',
    color: 'blue',
    units: [
      {name: 'ประชาสัมพันธ์ / คัดแยกหน้าโรงพยาบาล', desc: 'ให้ข้อมูล คัดแยกผู้ป่วยทั่วไป/ฉุกเฉิน แจกบัตรคิว', station: 'INFO', note: 'มีอยู่ในผังและในฉาก 3D แต่ไม่มีคิวในแบบจำลอง'},
      {name: 'เวชระเบียน / ลงทะเบียน', desc: 'ลงทะเบียนผู้ป่วยใหม่-เก่า ค้นแฟ้ม (HN) ออกบัตรคิว', station: 'REG'},
      {name: 'ตรวจสอบสิทธิการรักษา', desc: '5 สิทธิ: บัตรทอง ประกันสังคม ข้าราชการ จ่ายเอง ประกันเอกชน — สิทธิเป็นตัวคูณเวลาที่เคาน์เตอร์', station: 'REG'},
      {name: 'ศูนย์นัดหมาย / Call center', desc: 'นัดหมายล่วงหน้า 180 ราย/วัน', station: null, note: 'เป็นช่องทางมาถึง (lane "appt") ไม่ใช่หน่วยที่ต้องเข้าคิว'},
    ],
  },
  {
    group: 'บริการผู้ป่วยนอก (OPD)',
    color: 'mint',
    units: [
      {name: 'จุดคัดกรอง / ซักประวัติ', desc: 'วัดสัญญาณชีพ น้ำหนัก ความดัน ซักประวัติโดยพยาบาล', station: 'TRI'},
      {name: 'ห้องตรวจแพทย์ (7 คลินิกเฉพาะทาง)', desc: `${CLINIC_KEYS.map((c) => CLINICS[c].name).join(' · ')} — แยกเป็น 7 กลุ่มห้อง ไม่ใช่กองเดียว`, station: 'DOC'},
      {name: 'ห้องหัตถการ / ทำแผล / ฉีดยา / วัคซีน', desc: 'ทำแผล ฉีดยา ให้วัคซีน ให้น้ำเกลือระยะสั้น', station: 'PRC'},
      {name: 'ทันตกรรม', desc: 'ขูดหินปูน อุดฟัน ถอนฟัน รักษารากฟัน', station: 'DEN'},
      {name: 'เวชศาสตร์ฟื้นฟู / กายภาพบำบัด', desc: 'กายภาพบำบัด กิจกรรมบำบัด ฟื้นฟูหลังผ่าตัด', station: 'PT'},
      {name: 'ศูนย์ตรวจสุขภาพ (Check-up)', desc: 'ตรวจสุขภาพประจำปี 40 ราย/วัน ใช้ Lab + X-ray + EKG แล้วพบแพทย์สรุปผล', station: null, note: 'เป็นช่องทางมาถึง (lane "checkup") ใช้หน่วยตรวจวินิจฉัยร่วมกับคนอื่น'},
    ],
  },
  {
    group: 'อุบัติเหตุและฉุกเฉิน (ER)',
    color: 'rose',
    units: [
      {name: 'จุดคัดแยกฉุกเฉิน (ER Triage)', desc: 'คัดแยกระดับความรุนแรง ESI 1–5 ซึ่งเป็นตัวกำหนดทั้งเวลารักษาและสิทธิแซงคิว', station: 'ERT'},
      {name: 'ห้องฉุกเฉิน (Emergency Room)', desc: 'กู้ชีพ ทำหัตถการเร่งด่วน สังเกตอาการ — ESI 1 แซงคิวได้', station: 'ER'},
      {name: 'หน่วยรถพยาบาล / EMS 1669', desc: 'รับผู้ป่วยนอกโรงพยาบาล ส่งต่อระหว่างโรงพยาบาล', station: null, note: 'ผู้ป่วยเข้ามาทางประตูฉุกเฉินอยู่แล้ว การวิ่งรถไม่ได้จำลอง'},
    ],
  },
  {
    group: 'ตรวจวินิจฉัย (Diagnostics)',
    color: 'olive',
    units: [
      {name: 'ห้องปฏิบัติการ / จุดเจาะเลือด', desc: 'เจาะเลือด เก็บปัสสาวะ เคมีคลินิก โลหิตวิทยา จุลชีววิทยา — ผลออกหลังผู้ป่วยออกจากห้อง 25 นาที', station: 'LAB'},
      {name: 'รังสีวิทยาทั่วไป (X-ray)', desc: 'ถ่ายภาพรังสีทรวงอกและกระดูก 5 ห้อง — ผลอ่าน 15 นาที', station: 'XRY'},
      {name: 'ภาพตัดขวาง (CT / MRI / Ultrasound)', desc: 'เครื่องหนัก 2 เครื่อง เวลาตรวจ 20 นาที ผลอ่าน 35 นาที', station: 'CT'},
      {name: 'ตรวจคลื่นไฟฟ้าหัวใจ (EKG / Echo)', desc: 'ตรวจคลื่นไฟฟ้าหัวใจ ตรวจหัวใจด้วยคลื่นเสียง', station: 'EKG'},
    ],
  },
  {
    group: 'ผ่าตัดและผู้ป่วยใน (Surgery & IPD)',
    color: 'violet',
    units: [
      {name: 'คลินิกวิสัญญี / เตรียมก่อนผ่าตัด', desc: 'ประเมินความพร้อมก่อนผ่าตัด งดน้ำงดอาหาร', station: 'ANE'},
      {name: 'ห้องผ่าตัด (Operating Theatre)', desc: '6 ห้อง เคสละ 95 นาที — จำนวนห้องตั้งไว้แบบ standby เพราะเคสฉุกเฉินมาเมื่อไรก็ได้', station: 'OR'},
      {name: 'ห้องพักฟื้น (PACU)', desc: 'เฝ้าระวังหลังผ่าตัด 60 นาที ก่อนกลับหอหรือกลับบ้าน', station: 'PACU'},
      {name: 'แผนกรับผู้ป่วยใน (Admission)', desc: 'จัดเตียง ทำเอกสารนอนโรงพยาบาล ประเมินค่าใช้จ่าย', station: 'ADM'},
      {name: 'หอผู้ป่วยวิกฤต (ICU / CCU)', desc: '14 เตียง วันนอนเฉลี่ย 3 วัน', station: 'ICU'},
      {name: 'หอผู้ป่วยใน (Ward)', desc: '200 เตียง 8 หอ วันนอนเฉลี่ย 3 วัน — คิดเป็นอัตราครองเตียง ไม่ใช่เวลารอคิว', station: 'WARD'},
      {name: 'ห้องคลอด (Labor Room)', desc: 'ดูแลการคลอด', station: null, note: 'อยู่นอกขอบเขต: ไม่ได้อยู่ในเส้นทางผู้ป่วยที่จำลอง'},
    ],
  },
  {
    group: 'การเงินและเภสัชกรรม (Billing & Pharmacy)',
    color: 'amber',
    units: [
      {name: 'การเงิน / ชำระเงิน', desc: 'คิดค่าใช้จ่าย เบิกจ่ายตามสิทธิ ชำระเงิน — ผู้ป่วยจ่ายเอง/ประกันเอกชนใช้เวลามากกว่าบัตรทองถึง 1.8 เท่า', station: 'CSH'},
      {name: 'เภสัชกรรม / ห้องจ่ายยา', desc: 'ตรวจสอบใบสั่งยา จัดยา จ่ายยาพร้อมให้คำแนะนำ — 83% ของผู้ป่วยนอกได้รับยากลับบ้าน', station: 'PHA'},
    ],
  },
  {
    group: 'สนับสนุน (Support)',
    color: 'teal',
    units: [
      {name: 'เวรเปล / เคลื่อนย้ายผู้ป่วย', desc: 'เข็นรถนั่งและเปล 6 คน — ผู้ป่วยนอก 6% ต้องใช้', station: 'POR', note: 'อยู่ในฉากและในกำลังคน แต่ไม่ได้คิดเป็นคิวแยก'},
      {name: 'สังคมสงเคราะห์', desc: 'ช่วยเหลือผู้ป่วยด้านค่าใช้จ่ายและสังคม', station: null},
      {name: 'โภชนาการ', desc: 'อาหารผู้ป่วยใน ให้คำปรึกษาด้านโภชนาการ', station: null},
      {name: 'ศูนย์เครื่องมือแพทย์ปลอดเชื้อ (CSSD)', desc: 'ทำให้เครื่องมือปราศจากเชื้อ', station: null},
      {name: 'เทคโนโลยีสารสนเทศ (HIS)', desc: 'ระบบสารสนเทศโรงพยาบาล ระบบคิว', station: null},
    ],
  },
];

/** แนวทางลดเวลาบริการเฉพาะหน่วย — used by the advice panel when adding slots is no longer possible. */
export const IDEAS = {
  INFO: ['ป้ายบอกทางและผังอาคารที่อ่านรู้เรื่อง', 'ตู้ Kiosk แจกบัตรคิวด้วยบัตรประชาชน'],
  REG: ['ลงทะเบียนล่วงหน้าผ่านแอป/LINE', 'ตู้ Kiosk ยืนยันตัวตนด้วยบัตรประชาชน', 'แยกช่องผู้ป่วยเก่า/ผู้ป่วยใหม่', 'ตรวจสอบสิทธิอัตโนมัติจากฐานข้อมูล (สิทธิเป็นตัวคูณเวลาที่ใหญ่ที่สุดของหน่วยนี้)'],
  TRI: ['เครื่องวัดความดัน/ชั่งน้ำหนักอัตโนมัติ (self-service)', 'ส่งค่าสัญญาณชีพเข้า HIS อัตโนมัติ', 'แยกผู้ช่วยพยาบาลวัด vital ออกจากพยาบาลซักประวัติ'],
  DOC: ['ระบบนัดหมายแบบแบ่งช่วงเวลา (time-slot)', 'e-Prescription / order set สำเร็จรูป', 'Telemedicine สำหรับผู้ป่วยติดตามอาการ', 'เปิดคลินิกนอกเวลา', 'ย้ายห้องจากคลินิกที่ว่างไปคลินิกที่แน่น (ดูตารางราย 7 คลินิก)'],
  LAB: ['เจาะเลือดล่วงหน้า / จุดเจาะเลือดนอกอาคาร', 'Barcode ติดหลอดเลือดอัตโนมัติ', 'ท่อลมส่งสิ่งส่งตรวจ (pneumatic tube)', 'Point-of-care สำหรับรายการที่ต้องรู้ผลเร็ว'],
  XRY: ['Digital X-ray (DR) ลดเวลาจัดท่าและล้างฟิล์ม', 'นัดคิวเอกซเรย์ล่วงหน้า', 'แยกคิว ER ออกจาก OPD'],
  CT: ['จัดตารางเครื่องตามประเภทการตรวจ', 'เตรียมผู้ป่วยนอกห้องตรวจ', 'ส่งผลอ่านทางไกล (teleradiology) ลดเวลารอผล 35 นาที'],
  EKG: ['เครื่อง EKG แบบพกพาเพิ่มที่จุดตรวจสุขภาพ', 'ให้เจ้าหน้าที่เตรียมผู้ป่วยระหว่างรอ'],
  PRC: ['ชุดหัตถการสำเร็จรูป (procedure kit)', 'แยกเตียงวัคซีนออกจากทำแผล'],
  DEN: ['นัดหมายแบบ time-slot', 'แยกงานขูดหินปูนให้ทันตาภิบาล'],
  PT: ['กายภาพแบบกลุ่ม', 'สอนท่าบริหารให้ทำที่บ้าน + ติดตามออนไลน์'],
  ERT: ['เพิ่มพยาบาลคัดแยกช่วงพีค', 'ใช้แบบฟอร์ม ESI ดิจิทัล'],
  ER: ['Fast track สำหรับผู้ป่วย ESI 4–5 ซึ่งเป็นเกือบครึ่งของผู้มาห้องฉุกเฉิน', 'ส่งผู้ป่วยไม่ฉุกเฉินไป OPD', 'Point-of-care lab ใน ER'],
  ANE: ['ประเมินก่อนผ่าตัดทางออนไลน์', 'Checklist สำเร็จรูป'],
  OR: ['ลดเวลา turnover ระหว่างเคส', 'จัดตารางผ่าตัดตามระยะเวลาเคสจริง', 'กันห้องไว้สำหรับเคสฉุกเฉินแยกจากเคสนัด'],
  PACU: ['เกณฑ์ส่งกลับ (discharge criteria) ชัดเจน', 'พยาบาลประจำเตียงพักฟื้นตามสัดส่วน'],
  ADM: ['จองเตียงล่วงหน้าจาก OPD', 'เอกสาร Admit อิเล็กทรอนิกส์'],
  ICU: ['เกณฑ์ย้ายออกจาก ICU ที่ชัดเจน', 'หน่วยกึ่งวิกฤต (step-down) รับผู้ป่วยที่ยังไม่พร้อมกลับหอ'],
  WARD: ['เตรียมเตียงล่วงหน้า (bed management board)', 'จำหน่ายผู้ป่วยก่อน 11:00', 'ลดวันนอนด้วยการวางแผนจำหน่ายตั้งแต่วันรับ'],
  CSH: ['ชำระเงินผ่าน QR / Mobile banking', 'ตัดสิทธิอัตโนมัติ (ไม่ต้องรอที่การเงิน)', 'ตู้ชำระเงินอัตโนมัติ'],
  PHA: ['จัดยาล่วงหน้าตั้งแต่แพทย์สั่ง (pre-packing)', 'ตู้จ่ายยาอัตโนมัติ / ส่งยาทางไปรษณีย์', 'แยกช่องรับยาเดิม/ยาใหม่'],
  POR: ['วิทยุสื่อสาร/แอปเรียกเปลแทนการโทร', 'จัดเวรเปลตามพีคของการย้ายผู้ป่วย'],
};

/** The process × unit matrix: which step of each named journey lands on which unit. */
export function matrix() {
  const used = STATION_KEYS.filter((k) => PROCESSES.some((p) => p.route.includes(k)));
  const rows = PROCESSES.map((p) => ({
    key: p.key,
    name: p.name,
    lane: p.lane,
    laneName: LANES[p.lane]?.name || p.lane,
    note: p.note,
    cells: used.map((k) => {
      const at = p.route.map((r, i) => (r === k ? i + 1 : 0)).filter(Boolean);
      return at.length ? at.join(',') : '';
    }),
  }));
  return {units: used.map((k) => ({key: k, name: STATIONS[k].name, dept: STATIONS[k].dept})), rows};
}

/** How many units each catalogue group has a queue for — the badge on the group header. */
export function groupStats(g) {
  const q = g.units.filter((u) => u.station && STATIONS[u.station]).length;
  return {queued: q, total: g.units.length};
}
