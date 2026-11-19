// The three pages that are not the 3D: queue analysis, the service catalogue, and the swimlanes.
//
// Everything here reads the ONE config object the simulator runs on, and writes to it through `edit()`. So there is
// no second copy of the hospital to drift out of step: change the number of consultation rooms in the table and the
// same change is in the recorded day, the people on the floor and the Erlang-C column on the next frame.
//
// The analysis is deliberately NOT the simulation. λ, μ and ρ come from `analysis.js`, which derives them from the
// rule tables; the columns marked DES are measured off the recorded day. Two independent answers, printed next to
// each other, is the only arrangement in which either of them can be caught being wrong.
import {CLINICS, LANES, LANE_KEYS, ORDER_RULES, PROCESSES, RULES, STATIONS, STATION_KEYS} from './model.js';
import {CV, DIST_NAME, H0, H1, analyse, compare, hourlyLoad, recommend} from './analysis.js';
import {CATALOG, IDEAS, groupStats, matrix} from './catalog.js';
import {HOURS, PROFILES, applyProfile, laneRows, matchesProfile, totalPerDay} from './profiles.js';
import {HOS} from './style.js';

const STATUS = {ok: HOS.mintDeep, warn: HOS.amber, bad: HOS.rose, idle: HOS.shade};
const DEPT_COLOR = {front: HOS.blue, opd: HOS.mint, diag: HOS.olive, er: HOS.rose, surg: HOS.violet, ward: HOS.violet, money: HOS.amber, support: HOS.teal};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inf = (v) => v === Infinity || v === -Infinity || Number.isNaN(v);
const n1 = (v) => (inf(v) ? '∞' : v.toFixed(1));
const n0 = (v) => (inf(v) ? '∞' : Math.round(v).toLocaleString('en-US'));
const pc = (v) => (inf(v) ? '∞' : `${Math.round(v * 100)}%`);
const dash = (v, f) => (Number.isNaN(v) ? '—' : f(v));
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`;
const rhoClass = (rho, rhoMax) => (rho >= 1 ? 'bad' : rho >= rhoMax ? 'warn' : 'ok');

/**
 * @param host     the element to fill
 * @param cfg      the live simulator config (mutated in place)
 * @param getDay   () => the recorded day currently playing
 * @param rerun    (soft) => re-run the day and redraw everything
 * @param focusUnit (key) => switch to the 3D and select that unit
 */
export function createPages({host, cfg, getDay, rerun, focusUnit}) {
  const view = {hour: 9, targetWq: 15, rhoMax: 0.85, hours: 9, scenario: 'after', unit: null};

  host.innerHTML = `
    <section class="sh-page" data-page="queue"><div class="sh-wrap" data-k="queue"></div></section>
    <section class="sh-page" data-page="catalog"><div class="sh-wrap" data-k="catalog"></div></section>
    <section class="sh-page" data-page="workflow"><div class="sh-wrap sh-wf" data-k="workflow"></div></section>`;
  const el = (k) => host.querySelector(`[data-k="${k}"]`);

  // ---- the config as it was before any of the user's changes to staffing: "ก่อนปรับปรุง"
  const baseCfg = () => ({...cfg, servers: {}, svc: {}, dist: {}});
  const edited = () => Object.keys(cfg.servers).length || Object.keys(cfg.svc).length || Object.keys(cfg.dist).length;

  // ───────────────────────────────────────────────────────────── queue page
  const card = (title, sub, body, extra = '') => `
    <div class="sh-card">
      <div class="sh-head"><div><h2>${title}</h2>${sub ? `<p class="sh-sub">${sub}</p>` : ''}</div>${extra}</div>
      ${body}
    </div>`;

  function profileCard() {
    const rows = laneRows(cfg);
    const total = totalPerDay(cfg);
    const current = PROFILES.find((p) => matchesProfile(cfg, p.key));
    const cards = PROFILES.map(
      (p) => `<button class="sh-pf${current?.key === p.key ? ' on' : ''}" data-act="profile" data-v="${p.key}">
        <b>${p.name}</b><s>${p.sub}</s></button>`,
    ).join('');
    const lanes = rows
      .map(
        (r) => `<label class="sh-lane"><span>${esc(r.name)}${r.booked ? ' <i class="sh-tag">นัดหมาย</i>' : ''}</span>
        <input type="number" min="0" max="4000" step="5" value="${r.perDay}" data-act="lane" data-k="${r.key}">
        <s>ตั้งต้น ${r.base}</s></label>`,
      )
      .join('');
    const hours = HOURS.map(
      (h) => `<label class="sh-hk" title="${hourLabel(h)}"><input type="range" min="0" max="2" step="0.05"
        value="${cfg.hourK ? cfg.hourK[h] : 1}" data-act="hourK" data-k="${h}" orient="vertical">
        <s>${String(h).padStart(2, '0')}</s></label>`,
    ).join('');
    return card(
      'โปรไฟล์ผู้รับบริการ',
      `เลือกลักษณะวันจาก 6 แบบ หรือกำหนดเอง — ทั้งจำนวนผู้ป่วยแต่ละช่องทางและน้ำหนักรายชั่วโมง ใช้กับทั้งการจำลอง 3D และการวิเคราะห์คิว`,
      `<div class="sh-pfs">${cards}</div>
       <p class="sh-note">${current ? esc(current.desc) : 'กำหนดเอง — ไม่ตรงกับโปรไฟล์ใดใน 6 แบบ'}</p>
       <div class="sh-two">
         <div><h3>จำนวนผู้ป่วยต่อวันแต่ละช่องทาง <b class="sh-mono">${Math.round(total)} ราย</b></h3><div class="sh-lanes">${lanes}</div></div>
         <div><h3>น้ำหนักรายชั่วโมง</h3><div class="sh-hks">${hours}</div>
           <label class="sh-row"><span>กระจายนัดหมายทั่ววัน</span>
             <input type="range" min="0" max="1" step="0.05" value="${cfg.flatBooking}" data-act="flatBooking">
             <b class="sh-mono">${pc(cfg.flatBooking)}</b></label>
           <p class="sh-note">0% = นัดทุกคนไว้ตอนเช้า · 100% = คนกลุ่มเดิมกระจายทั่วช่วงเปิดบริการ</p>
         </div>
       </div>`,
    );
  }

  function paramCard() {
    const opts = HOURS.filter((h) => h >= H0 && h < H1)
      .map((h) => `<option value="${h}"${h === view.hour ? ' selected' : ''}>${hourLabel(h)}</option>`)
      .join('');
    const dists = Object.keys(DIST_NAME)
      .map((d) => `<option value="${d}">${DIST_NAME[d]}</option>`)
      .join('');
    const ord = ['lab', 'xray', 'ekg', 'ct']
      .map(
        (d) => `<label class="sh-row"><span>${{lab: 'Lab', xray: 'X-ray', ekg: 'EKG', ct: 'CT'}[d]}</span>
        <input type="range" min="0" max="3" step="0.05" value="${cfg.orders?.[d] ?? 1}" data-act="order" data-k="${d}">
        <b class="sh-mono">×${(cfg.orders?.[d] ?? 1).toFixed(2)}</b></label>`,
      )
      .join('');
    return card(
      'พารามิเตอร์การวิเคราะห์',
      'เลือกชั่วโมงที่จะวิเคราะห์ เป้าหมายเวลารอ และสัดส่วนการส่งตรวจ — ทุกช่องมีผลทันทีทั้งกับสูตรและกับวันที่จำลอง',
      `<div class="sh-params">
        <label><span>วิเคราะห์ที่ช่วงเวลา</span><select data-act="hour">${opts}</select></label>
        <label><span>เป้าหมายเวลารอ Wq (นาที)</span><input type="number" min="1" max="180" step="1" value="${view.targetWq}" data-act="target"></label>
        <label><span>ρ สูงสุดที่ยอมรับ</span><input type="number" min="0.5" max="0.99" step="0.01" value="${view.rhoMax}" data-act="rhoMax"></label>
        <label><span>ความแปรปรวนเวลาบริการทุกหน่วย</span><select data-act="distAll"><option value="">— กำหนดรายหน่วยในตาราง —</option>${dists}</select></label>
        <label><span>ตัวคูณการสั่งตรวจรวม</span><input type="number" min="0" max="3" step="0.05" value="${cfg.orderK ?? 1}" data-act="orderK"></label>
        <label class="sh-check"><input type="checkbox" data-act="breaks"${cfg.breaks === false ? '' : ' checked'}> คิดช่วงพักเที่ยงและเวรบางช่วงเช้า-เย็น</label>
        <label class="sh-check"><input type="checkbox" data-act="balking"${cfg.balking === false ? '' : ' checked'}> ให้ผู้ป่วยเดินออกเมื่อคิวยาวเกิน ${RULES.balkQueue} คน หรือรอเกิน ${RULES.renegeWait} นาที</label>
        <label><span>Seed</span><input type="number" min="1" step="1" value="${cfg.seed ?? 20261119}" data-act="seed"></label>
      </div>
      <div class="sh-two">
        <div><h3>สัดส่วนการส่งตรวจ (ตัวคูณจากกฎชุดคำสั่ง)</h3>${ord}
          <p class="sh-note">กฎตั้งต้นอยู่ที่ <code>ORDER_RULES</code> — ออร์โธส่งเอกซเรย์ 74% อายุรกรรมส่ง Lab 52% ตัวคูณนี้คูณทับกฎนั้น</p></div>
        <div><h3>ที่มาของ λ ในหน้านี้</h3>
          <p class="sh-note">แบบจำลองนี้ไม่มีเส้นทางคงที่ — แพทย์จับฉลากชุดคำสั่ง แล้ว <code>resolvePlan()</code> คลี่เป็นลำดับหน่วย
          λ ของแต่ละหน่วยจึงต้อง<b>คำนวณ</b>จากค่าคาดหวังของจำนวนครั้งที่ผู้ป่วยแต่ละช่องทางแวะหน่วยนั้น
          ถ่วงด้วยสัดส่วนคลินิก สิทธิการรักษา และระดับ ESI แล้วไหลต่อกันทีละชั่วโมงโดยถูกจำกัดด้วยกำลังของหน่วยต้นทาง
          คอลัมน์ <b>DES</b> ในตารางคือค่าที่วัดจากการจำลองจริง ไม่ได้มาจากสูตรนี้ — สองคอลัมน์นั้นต้องตรงกัน ถ้าไม่ตรงคืออันใดอันหนึ่งผิด</p></div>
      </div>`,
    );
  }

  function compareCard() {
    const opts = {hour: view.hour, targetWq: view.targetWq, rhoMax: view.rhoMax, hours: view.hours};
    const diff = compare(baseCfg(), cfg, opts).filter((x) => !x.bed);
    const body = !diff.length
      ? `<p class="sh-note">ยังไม่ได้แก้กำลังคนหรือเวลาบริการของหน่วยใด — ตารางนี้จะขึ้นเมื่อปรับค่าในตารางด้านล่าง หรือกด “ใช้คำแนะนำทั้งหมด”</p>`
      : `<div class="sh-scroll"><table class="sh-t"><thead><tr><th>หน่วยบริการ</th><th>slot</th><th>svc (นาที)</th><th>ρ</th><th>Wq (นาที)</th></tr></thead><tbody>
        ${diff
          .map(
            (x) => `<tr><td>${esc(x.name)}</td>
          <td class="sh-mono">${x.before.slots} → <b>${x.after.slots}</b></td>
          <td class="sh-mono">${x.before.svc.toFixed(1)} → <b>${x.after.svc.toFixed(1)}</b></td>
          <td class="sh-mono"><span class="sh-${rhoClass(x.before.rho, view.rhoMax)}">${pc(x.before.rho)}</span> → <span class="sh-${rhoClass(x.after.rho, view.rhoMax)}"><b>${pc(x.after.rho)}</b></span></td>
          <td class="sh-mono">${n1(x.before.Wq)} → <b>${n1(x.after.Wq)}</b></td></tr>`,
          )
          .join('')}
        </tbody></table></div>`;
    return card(
      'ก่อน / หลังปรับปรุง',
      `เทียบค่าตั้งต้นของแบบจำลองกับค่าที่กำลังใช้อยู่ ที่ช่วงเวลา ${hourLabel(view.hour)} บนโปรไฟล์ผู้ป่วยชุดเดียวกัน`,
      body,
      `<div class="sh-btns">
        <button class="sh-btn" data-act="applyAll">ใช้คำแนะนำ “เพิ่ม slot” ทั้งหมด</button>
        <button class="sh-btn ghost" data-act="resetCfg"${edited() ? '' : ' disabled'}>คืนค่าตั้งต้น</button>
      </div>`,
    );
  }

  function heatCard() {
    const load = hourlyLoad(cfg);
    const keys = Object.keys(load).sort((a, b) => load[b].peak - load[a].peak);
    const head = HOURS.filter((h) => h >= H0 && h < H1)
      .map((h) => `<th>${String(h).padStart(2, '0')}</th>`)
      .join('');
    const rows = keys
      .map((k) => {
        const u = load[k];
        const cells = u.cells
          .map((c) => {
            const cls = c.rho >= 1 ? 'bad' : c.rho >= view.rhoMax ? 'warn' : c.rho > 0 ? 'ok' : 'idle';
            const label = [
              `${hourLabel(c.h)} · ${esc(u.name)}`,
              `ความต้องการ ${n1(c.demand)} ราย/ชม`,
              c.carryIn > 0.5 ? `ค้างจากชั่วโมงก่อน ${n1(c.carryIn)} ราย` : null,
              c.throttled > 0.5 ? `ถูกบีบไว้ที่หน่วยต้นทาง ${n1(c.throttled)} ราย` : null,
              `กำลังให้บริการได้ ${n1(c.cap)} ราย/ชม`,
              `ρ ${pc(c.rho)}`,
              c.carry > 0.5 ? `ค้างไปชั่วโมงถัดไป ${n1(c.carry)} ราย` : null,
            ]
              .filter(Boolean)
              .join('\n');
            return `<td class="sh-cell ${cls}" title="${label}"><i style="opacity:${Math.min(1, 0.12 + (inf(c.rho) ? 1 : c.rho) * 0.88)}"></i><s>${c.rho > 0 ? Math.round(Math.min(999, inf(c.rho) ? 999 : c.rho * 100)) : ''}</s></td>`;
          })
          .join('');
        return `<tr><th class="sh-rowh" data-act="pick" data-k="${k}"><i style="background:${DEPT_COLOR[u.dept] || HOS.shade}"></i>${esc(u.name)}</th>${cells}
          <td class="sh-mono sh-carry">${u.endCarry > 0.5 ? `ค้าง ${n0(u.endCarry)}` : '—'}</td></tr>`;
      })
      .join('');
    const worst = keys[0] ? load[keys[0]] : null;
    return card(
      'ภาระรายชั่วโมง',
      'ρ ของแต่ละหน่วยในแต่ละชั่วโมง คิดต่อเนื่องกันทั้งวัน: คิวที่ไม่หมดในชั่วโมงนี้ยังอยู่ในชั่วโมงถัดไป และหน่วยปลายทางรับได้ไม่เกินที่หน่วยต้นทางปล่อยออกมา · ชี้ที่ช่องเพื่อดูตัวเลข',
      `${worst ? `<p class="sh-callout"><b>${esc(worst.name)}</b> หนักที่สุดของวันที่ ${hourLabel(worst.peakHour)} — ρ ${pc(worst.peak)}${worst.endCarry > 0.5 ? ` และยังเหลือคิวค้างสิ้นวัน ${n0(worst.endCarry)} ราย` : ''}</p>` : ''}
       <div class="sh-scroll"><table class="sh-t sh-heat"><thead><tr><th></th>${head}<th>สิ้นวัน</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }

  function barsCard(res) {
    const rows = res.rows.filter((r) => !r.bed);
    const bars = rows
      .map((r) => {
        const w = Math.min(100, (inf(r.rho) ? 1.4 : r.rho) * 71.4); // 100% of ρ sits at 71.4% of the width
        return `<div class="sh-bar" data-act="pick" data-k="${r.key}">
        <span class="sh-bn">${esc(r.name)}</span>
        <span class="sh-bt"><i class="sh-${rhoClass(r.rho, view.rhoMax)}" style="width:${w}%"></i></span>
        <b class="sh-mono sh-${rhoClass(r.rho, view.rhoMax)}">${pc(r.rho)}</b></div>`;
      })
      .join('');
    const beds = res.rows
      .filter((r) => r.bed)
      .map(
        (r) => `<div class="sh-bar"><span class="sh-bn">${esc(r.name)}</span>
        <span class="sh-bt"><i class="sh-${r.rho >= 0.95 ? 'bad' : r.rho >= 0.85 ? 'warn' : 'ok'}" style="width:${Math.min(100, r.rho * 71.4)}%"></i></span>
        <b class="sh-mono">${pc(r.rho)}</b></div>`,
      )
      .join('');
    return card(
      'คอขวดของระบบ',
      `ρ = λ / (c·μ) ณ ${hourLabel(view.hour)} — เส้นส้มคือ ρ สูงสุดที่ยอมรับ (${pc(view.rhoMax)}) เส้นแดงคือ 100% ซึ่งคิวจะยาวขึ้นเรื่อย ๆ ไม่เข้าสู่สมดุล`,
      `<div class="sh-bars" style="--rhomax:${view.rhoMax * 71.4}%">${bars}</div>
       <h3>เตียง — คิดเป็นอัตราครองเตียงตลอดวัน ไม่ใช่เวลารอคิว</h3><div class="sh-bars sh-nolines">${beds}</div>`,
    );
  }

  function laneCard(res) {
    const arr = res.demand.arrivals;
    const rows = LANE_KEYS.map((k) => {
      const L = LANES[k];
      const day = arr[k].reduce((a, b) => a + b, 0);
      const hour = arr[k][view.hour];
      const v = res.demand.perLane[k].visits;
      const stops = Object.keys(v).length;
      const steps = Object.values(v).reduce((a, b) => a + b, 0);
      return `<tr><td>${esc(L.name)}</td><td class="sh-mono">${n0(day)}</td><td class="sh-mono">${n1(hour)}</td>
        <td class="sh-mono">${steps.toFixed(2)}</td>
        <td class="sh-vis">${Object.entries(v)
          .sort((a, b) => b[1] - a[1])
          .map(([u, n]) => `<i title="${esc(STATIONS[u].name)}">${u} <b>${n.toFixed(2)}</b></i>`)
          .join('')}</td></tr>`;
    }).join('');
    return card(
      'ภาระงานตามช่องทางที่ผู้ป่วยเข้ามา',
      'จำนวนครั้งที่ผู้ป่วยหนึ่งคนของแต่ละช่องทาง “คาดว่าจะ” แวะแต่ละหน่วย — ตัวเลขนี้คือที่มาของ λ ทั้งหมดในหน้านี้ และเป็นเศษส่วนเพราะเส้นทางเป็นความน่าจะเป็น ไม่ใช่เส้นคงที่',
      `<div class="sh-scroll"><table class="sh-t"><thead><tr><th>ช่องทาง</th><th>ราย/วัน</th><th>ราย/ชม ที่ ${String(view.hour).padStart(2, '0')}:00</th><th>หน่วยที่แวะ (ครั้ง/คน)</th><th>รายละเอียด</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }

  function tableCard(res) {
    const day = getDay();
    const rows = res.rows
      .map((r) => {
        const s = day.summary[r.key];
        const d = STATIONS[r.key];
        const des = s
          ? `<td class="sh-mono">${pc(s.util)}</td><td class="sh-mono">${n1(s.waitMean)}</td><td class="sh-mono">${n0(s.served)}</td>`
          : '<td>—</td><td>—</td><td>—</td>';
        const distSel = Object.keys(DIST_NAME)
          .map((x) => `<option value="${x}"${x === r.dist ? ' selected' : ''}>${x}</option>`)
          .join('');
        return `<tr class="${r.key === view.unit ? 'on' : ''}">
        <th class="sh-rowh" data-act="pick" data-k="${r.key}"><i style="background:${DEPT_COLOR[r.dept] || HOS.shade}"></i>${esc(r.name)}
          ${r.capped ? `<em class="sh-tag warn" title="หน่วยต้นทาง (${r.cappedBy}) ปล่อยผู้ป่วยมาได้ไม่ครบตามความต้องการ">ถูกบีบ</em>` : ''}
          ${r.bed ? '<em class="sh-tag">เตียง</em>' : ''}</th>
        <td><input type="number" class="sh-in" min="1" max="${Math.max(r.max, 999)}" step="1" value="${r.slots}" data-act="slots" data-k="${r.key}"></td>
        <td class="sh-mono sh-dim">${r.staffed}</td>
        <td><input type="number" class="sh-in" min="0.2" max="10000" step="0.1" value="${(cfg.svc?.[r.key] ?? d.svc).toFixed(1)}" data-act="svc" data-k="${r.key}"></td>
        <td class="sh-mono sh-dim">${r.svc.toFixed(1)}</td>
        <td><select class="sh-in" data-act="dist" data-k="${r.key}">${distSel}</select></td>
        <td class="sh-mono">${r.bed ? n1(r.lambda) + '/วัน' : n1(r.lambda)}</td>
        <td class="sh-mono sh-${rhoClass(r.rho, view.rhoMax)}">${pc(r.rho)}</td>
        <td class="sh-mono">${dash(r.pWait, pc)}</td>
        <td class="sh-mono">${dash(r.Lq, n1)}</td>
        <td class="sh-mono sh-${r.Wq > view.targetWq ? 'warn' : 'ok'}">${dash(r.Wq, n1)}</td>
        <td class="sh-mono">${dash(r.q95, n0)}</td>
        <td class="sh-mono">${dash(r.w95, n1)}</td>
        ${des}</tr>`;
      })
      .join('');
    return card(
      'ผลการวิเคราะห์แถวคอยต่อหน่วยบริการ',
      `แก้จำนวน slot เวลาบริการและความแปรปรวนได้ในตาราง แล้วทั้งหน้าและการจำลอง 3D จะคำนวณใหม่ทันที · ถ้าเวลาบริการไม่ใช่ Exponential จะใช้ M/G/c (Allen–Cunneen) · คอลัมน์ <b>DES</b> คือค่าที่วัดจากวันที่จำลองไปแล้วจริง ๆ ไม่ใช่จากสูตร`,
      `<div class="sh-scroll"><table class="sh-t sh-wide"><thead>
        <tr><th rowspan="2">หน่วยบริการ</th><th colspan="2">slot</th><th colspan="2">เวลาบริการ (นาที)</th><th rowspan="2">ความแปรปรวน</th>
          <th rowspan="2">λ (ราย/ชม)</th><th rowspan="2">ρ</th><th rowspan="2">P<sub>wait</sub></th><th rowspan="2">L<sub>q</sub></th>
          <th rowspan="2">W<sub>q</sub></th><th rowspan="2">คิว P95</th><th rowspan="2">รอ P95</th><th colspan="3">DES (วัดจากการจำลอง)</th></tr>
        <tr><th>ตั้งไว้</th><th>ขึ้นเวร</th><th>ตั้งไว้</th><th>ใช้จริง</th><th>ρ</th><th>Wq</th><th>ให้บริการ</th></tr>
      </thead><tbody>${rows}</tbody></table></div>
      <p class="sh-note">“ตั้งไว้” คือจำนวน slot ทั้งหมดของหน่วย · “ขึ้นเวร” คือจำนวนที่เปิดใช้จริงในชั่วโมงที่วิเคราะห์ (พักเที่ยงเหลือ 66% ก่อน 07:00 และหลัง 16:30 เหลือ 15%)
      · “ใช้จริง” คือเวลาบริการหลังถ่วงด้วยสิทธิการรักษา (ลงทะเบียน/การเงิน) ระดับ ESI (ห้องฉุกเฉิน) และการกระจายวันนอน (เตียง)</p>`,
    );
  }

  function clinicCard(res) {
    const rows = res.clinics
      .map(
        (c) => `<tr><td>${esc(c.name)}</td><td class="sh-mono">${c.rooms}</td><td class="sh-mono sh-dim">${c.staffed}</td>
      <td class="sh-mono">${c.svc.toFixed(1)}</td><td class="sh-mono">${n1(c.lambda)}</td>
      <td class="sh-mono sh-${rhoClass(c.rho, view.rhoMax)}">${pc(c.rho)}</td><td class="sh-mono">${n1(c.Wq)}</td></tr>`,
      )
      .join('');
    return card(
      'ห้องตรวจแพทย์ แยกตามคลินิก',
      'ห้องตรวจ 19 ห้องไม่ใช่กองเดียว — แต่ละคลินิกมีห้องของตัวเองและคิวของตัวเอง คอขวดที่อายุรกรรมไม่ได้บอกอะไรเลยเกี่ยวกับจักษุ นี่คือเหตุผลที่ตารางนี้แยกออกมา',
      `<div class="sh-scroll"><table class="sh-t"><thead><tr><th>คลินิก</th><th>ห้อง</th><th>ขึ้นเวร</th><th>svc (นาที)</th><th>λ (ราย/ชม)</th><th>ρ</th><th>Wq (นาที)</th></tr></thead><tbody>${rows}</tbody></table></div>
       <p class="sh-note">จำนวนห้องที่เปิดของแต่ละคลินิกเปลี่ยนตามจำนวน slot รวมของห้องตรวจ — เพิ่มห้องตรวจในตารางด้านบนแล้วทุกคลินิกจะได้เพิ่มตามสัดส่วน เหมือนที่ตัวจำลองทำ</p>`,
    );
  }

  function adviceCard() {
    const recs = recommend(cfg, {hour: view.hour, targetWq: view.targetWq, rhoMax: view.rhoMax, hours: view.hours});
    if (!recs.length) {
      return card(
        'คำแนะนำการปรับปรุง',
        `ที่ ${hourLabel(view.hour)} ด้วยเป้าหมาย Wq ≤ ${view.targetWq} นาที และ ρ < ${pc(view.rhoMax)}`,
        `<p class="sh-callout ok">ทุกหน่วยอยู่ในเกณฑ์ที่ตั้งไว้ — ไม่มีอะไรต้องเพิ่มในชั่วโมงนี้</p>`,
      );
    }
    const body = recs
      .map((r) => {
        const ideas = (IDEAS[r.key] || []).map((i) => `<li>${esc(i)}</li>`).join('');
        return `<div class="sh-sug ${r.kind}">
        <div class="sh-sh"><b>${esc(r.name)}</b>
          ${r.kind === 'slots' ? `<button class="sh-btn sm" data-act="apply" data-k="${r.key}" data-v="${r.to}">เพิ่มเป็น ${r.to}</button>` : `<em class="sh-tag warn">เต็มเพดาน</em>`}</div>
        <p>${esc(r.text)}</p>
        ${r.kind !== 'slots' && ideas ? `<div class="sh-ideas"><s>แนวทางลดเวลาบริการ</s><ul>${ideas}</ul></div>` : ''}</div>`;
      })
      .join('');
    return card(
      'คำแนะนำการปรับปรุง',
      `เพิ่ม slot ถ้ายังไม่เกินเพดานของพื้นที่และกำลังคน — ถ้าเกินแล้ว จะบอกว่าต้องลดเวลาบริการลงเหลือเท่าไรจึงจะถึงเป้า`,
      `<div class="sh-sugs">${body}</div>`,
      `<div class="sh-btns"><button class="sh-btn" data-act="applyAll">ใช้คำแนะนำ “เพิ่ม slot” ทั้งหมด</button></div>`,
    );
  }

  function formulaCard() {
    return card(
      'สูตรที่ใช้ และสิ่งที่สูตรนี้ทำไม่ได้',
      '',
      `<div class="sh-two">
        <div class="sh-formula">
          λ<sub>s</sub> = Σ<sub>lane</sub> (ผู้ป่วยต่อชั่วโมงของ lane) × (จำนวนครั้งที่คาดว่าจะแวะ s)<br>
          a = λ/μ ,  ρ = a / c<br>
          P<sub>wait</sub> = ErlangC(c, a)<br>
          L<sub>q</sub> = P<sub>wait</sub>·ρ/(1−ρ) ,  W<sub>q</sub> = L<sub>q</sub>/λ<br>
          W = W<sub>q</sub> + 1/μ ,  L = λW (Little)<br>
          M/G/c : W<sub>q</sub> ≈ W<sub>q</sub>(M/M/c) × (1+CV²)/2<br>
          P(N<sub>q</sub> ≥ n) = P<sub>wait</sub>·ρ<sup>n</sup> → คิว P95<br>
          P(W<sub>q</sub> &gt; t) = P<sub>wait</sub>·e<sup>−(cμ−λ)t</sup> → รอ P95<br>
          ρ ≥ 1 : คิวสิ้นวัน ≈ (λ − cμ) × เวลาที่เปิด<br>
          เตียง : อัตราครองเตียง = (รับเข้า/วัน × วันนอน) / (เตียง × 1440)
        </div>
        <div>
          <p class="sh-note"><b>ข้อจำกัดที่ต้องรู้</b> — สูตรข้างบนสมมติว่าผู้ป่วยมาถึงแต่ละหน่วยแบบ Poisson และระบบเข้าสู่สมดุลภายในชั่วโมงนั้น
          ซึ่งไม่จริงทั้งคู่ในโรงพยาบาลที่คนมากองกันตอนเช้า หน้านี้แก้ให้สองข้อ: หน่วยปลายทางรับได้ไม่เกินที่ต้นทางปล่อยมา
          และคิวที่เหลือถูกยกไปชั่วโมงถัดไป แต่ยังเหลือข้อที่แก้ไม่ได้ด้วยสูตร คือเวลาเดินระหว่างหน่วย เวลารอผลตรวจ
          และผู้ป่วยที่ยังอยู่ในโรงพยาบาลตอน 20:00 (วันละราว 60–70 ราย) — ด้วยเหตุนี้ λ ของหน่วยปลายทาง เช่น ห้องผ่าตัดและเตียง
          จึงสูงกว่าที่การจำลองนับได้จริงราว 20–30% และนั่นคือช่องว่างที่ยอมรับไว้ ไม่ใช่บั๊ก</p>
          <p class="sh-note">คอลัมน์ DES ไม่มีข้อจำกัดเหล่านี้เลย เพราะมันคือการเดินของผู้ป่วยทีละคนจริง ๆ — เมื่อสองคอลัมน์ต่างกันมาก
          ให้เชื่อ DES และใช้สูตรเป็นตัวบอกว่า “ถ้าเพิ่มหนึ่งหน่วยที่ไหนจะคุ้มที่สุด” ซึ่งเป็นงานที่สูตรทำได้เร็วกว่าการรันทุกทางเลือก</p>
        </div>
      </div>`,
    );
  }

  function renderQueue() {
    const res = analyse(cfg, {hour: view.hour, targetWq: view.targetWq, rhoMax: view.rhoMax, hours: view.hours});
    const day = getDay();
    const kpis = [
      ['ผู้ป่วยทั้งวัน', n0(day.totals.arrived), 'ราย'],
      ['เวลาอยู่ในโรงพยาบาลเฉลี่ย', n0(day.totals.losSum / Math.max(1, day.totals.losCount)), 'นาที'],
      ['เดินออกกลางคัน', n0(day.totals.balked + day.totals.reneged), 'ราย'],
      ['หน่วยที่ ρ ≥ 100%', String(res.rows.filter((r) => !r.bed && r.rho >= 1).length), `จาก ${res.rows.filter((r) => !r.bed).length} หน่วย`],
    ];
    el('queue').innerHTML =
      `<div class="sh-kpis">${kpis.map(([k, v, s]) => `<div class="sh-kpi"><u>${k}</u><b>${v}</b><s>${s}</s></div>`).join('')}</div>` +
      profileCard() +
      paramCard() +
      compareCard() +
      heatCard() +
      barsCard(res) +
      tableCard(res) +
      clinicCard(res) +
      adviceCard() +
      laneCard(res) +
      formulaCard();
  }

  // ────────────────────────────────────────────────────────── catalogue page
  function renderCatalog() {
    const groups = CATALOG.map((g) => {
      const st = groupStats(g);
      const units = g.units
        .map((u) => {
          const s = u.station ? STATIONS[u.station] : null;
          const day = s ? getDay().summary[u.station] : null;
          return `<div class="sh-cu${s ? '' : ' off'}"${s ? ` data-act="pick" data-k="${u.station}"` : ''}>
          <div class="sh-cuh"><b>${esc(u.name)}</b>${
            s
              ? `<em class="sh-chip q">${u.station}</em>`
              : '<em class="sh-chip">ไม่มีคิวในแบบจำลอง</em>'
          }</div>
          <p>${esc(u.desc)}</p>
          ${u.note ? `<s class="sh-note">${esc(u.note)}</s>` : ''}
          ${s && day ? `<div class="sh-cnums"><i>${s.c} slot</i><i>${s.svc} นาที/ราย</i><i>ให้บริการวันนี้ ${n0(day.served)} ครั้ง</i><i>รอเฉลี่ย ${n1(day.waitMean)} นาที</i></div>` : ''}</div>`;
        })
        .join('');
      return `<div class="sh-cg"><h3><i style="background:${HOS[g.color] || HOS.shade}"></i>${esc(g.group)}
        <s>${st.queued} จาก ${st.total} หน่วยมีคิวในแบบจำลอง</s></h3><div class="sh-cus">${units}</div></div>`;
    }).join('');

    const m = matrix();
    const mhead = m.units.map((u) => `<th title="${esc(u.name)}"><i style="background:${DEPT_COLOR[u.dept] || HOS.shade}"></i>${u.key}</th>`).join('');
    const mrows = m.rows
      .map(
        (r) => `<tr><th class="sh-rowh" title="${esc(r.note)}">${esc(r.name)}<s>${esc(r.laneName)}</s></th>
      ${r.cells.map((c) => `<td class="sh-mono${c ? ' on' : ''}">${c}</td>`).join('')}</tr>`,
      )
      .join('');

    const ordRows = PROCESSES.length;
    el('catalog').innerHTML =
      card(
        'บริการและฝ่ายทั้งหมดของโรงพยาบาล',
        `หน่วยที่มีป้ายรหัสกำกับคือหน่วยที่ถูกจำลองคิวไว้ — คลิกเพื่อไปดูหน่วยนั้นทำงานในมุมมอง 3D · หน่วยที่เหลือมีอยู่จริงในโรงพยาบาลแต่อยู่นอกขอบเขตของแบบจำลองนี้`,
        `<div class="sh-cat">${groups}</div>`,
      ) +
      card(
        'เมทริกซ์ เส้นทางผู้ป่วย × หน่วยบริการ',
        `ตัวเลข = ลำดับที่ผู้ป่วยไปถึงหน่วยนั้น · ${ordRows} เส้นทางนี้ไม่ใช่ตัว routing ของแบบจำลอง แต่เป็น “แบบ” ที่เอาไปจับกับผู้ป่วยจริงในวันที่จำลองแล้ว เพื่อหาคนที่เดินเส้นทางนั้นจริง ๆ มาเล่นให้ดู`,
        `<div class="sh-scroll"><table class="sh-t sh-matrix"><thead><tr><th></th>${mhead}</tr></thead><tbody>${mrows}</tbody></table></div>`,
      ) +
      card(
        'กฎชุดคำสั่ง (order set) — ตัว routing จริงของแบบจำลอง',
        'สิ่งที่เมทริกซ์ข้างบนแสดงไม่ได้ เพราะเส้นทางไม่คงที่: แพทย์จับฉลากชุดคำสั่งตามคลินิกหรือระดับความรุนแรง แล้วผู้ป่วยจึงมีเส้นทางของตัวเอง ตัวเลขคือความน่าจะเป็นที่จะถูกสั่งตรวจแต่ละอย่าง',
        orderTable(),
      );
  }

  function orderTable() {
    const rows = [
      ...Object.keys(CLINICS).map((c) => ({label: `คลินิก${CLINICS[c].name}`, who: {clinic: c}})),
      {label: 'ฉุกเฉิน ESI 1–2 (รุนแรง)', who: {lane: 'er', esi: 1}},
      {label: 'ฉุกเฉิน ESI 3–5', who: {lane: 'er', esi: 4}},
      {label: 'ตรวจสุขภาพประจำปี', who: {lane: 'checkup'}},
      {label: 'กายภาพบำบัด', who: {lane: 'physio', clinic: 'ortho'}, none: true},
    ];
    const body = rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.none ? '<td colspan="4" class="sh-dim">ไม่สั่งตรวจ — แพทย์ประเมินแล้วส่งทำกายภาพเลย</td>' : orderCells(r.who)}</tr>`).join('');
    return `<div class="sh-scroll"><table class="sh-t"><thead><tr><th>ใครได้รับการสั่ง</th><th>Lab</th><th>X-ray</th><th>EKG</th><th>CT / MRI</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="sh-note">ผู้ป่วยที่มีคำสั่งหลายอย่างจะไป<b>ทุก</b>ห้องตรวจที่สั่ง แล้วกลับมาพบแพทย์ <b>ครั้งเดียว</b> ไม่ใช่กลับมาทีละผล — เป็นข้อที่ <code>tests/flow.test.js</code> ตรวจไว้
      ส่วนตรวจสุขภาพกลับกัน: ตรวจทุกอย่างก่อน แล้วพบแพทย์ครั้งเดียวเพื่อฟังผลทั้งหมด</p>`;
  }

  function orderCells(who) {
    // read the rules the same way analysis.js does, without exporting its internals
    const ORDER = ['lab', 'xray', 'ekg', 'ct'];
    const rules = PROCESSES.length ? null : null;
    const o = orderProbs(who);
    return ORDER.map((d) => `<td class="sh-mono">${o[d] ? pc(Math.min(1, o[d] * (cfg.orderK ?? 1) * (who.lane === 'er' ? 1 : cfg.orders?.[d] ?? 1))) : '—'}</td>`).join('');
  }

  // ───────────────────────────────────────────────────────── workflow page
  function renderWorkflow() {
    const sheets = [
      {file: 'workflow/swimlane-opd.html', name: 'ผู้ป่วยนอก (OPD)'},
      {file: 'workflow/swimlane-opd-specialty.html', name: 'OPD เฉพาะทาง · หัตถการ · วัคซีน · ทันตกรรม · กายภาพ'},
      {file: 'workflow/swimlane-surgery-admit.html', name: 'ผ่าตัดวันเดียวกลับ / Admit จาก OPD'},
      {file: 'workflow/swimlane-er-ipd.html', name: 'ฉุกเฉิน → ผ่าตัด / ผู้ป่วยใน'},
    ];
    el('workflow').innerHTML = `
      <div class="sh-wftabs">${sheets.map((s, i) => `<button class="sh-btn ghost${i ? '' : ' on'}" data-act="wf" data-v="${s.file}">${esc(s.name)}</button>`).join('')}</div>
      <iframe class="sh-frame" data-k="wfframe" src="${sheets[0].file}" title="Swimlane workflow"></iframe>
      <p class="sh-note">แผ่น swimlane สร้างด้วย <a href="https://github.com/tt-a1i/archify" target="_blank" rel="noreferrer">Archify</a> จาก <code>tools/archify/*.workflow.json</code>
      — เป็นไฟล์แยกสี่ไฟล์ข้าง <code>index.html</code> ไม่ได้ฝังรวมมาในหน้าเดียว (รวมกันเกือบ 3.3 MB) ถ้าเปิดหน้านี้จากไฟล์เดี่ยวโดยไม่มีโฟลเดอร์ <code>workflow/</code> มาด้วย กรอบด้านบนจะว่าง</p>`;
  }

  // ─────────────────────────────────────────────────────────────── plumbing
  let timer = null;
  const schedule = (hard) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (hard) rerun();
      render();
    }, 60);
  };

  host.addEventListener('input', (e) => onEdit(e, false));
  host.addEventListener('change', (e) => onEdit(e, true));
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'profile') {
      applyProfile(cfg, t.dataset.v);
      schedule(true);
    } else if (act === 'apply') {
      cfg.servers[t.dataset.k] = Number(t.dataset.v);
      schedule(true);
    } else if (act === 'applyAll') {
      for (const r of recommend(cfg, {hour: view.hour, targetWq: view.targetWq, rhoMax: view.rhoMax, hours: view.hours})) {
        if (r.kind === 'slots') cfg.servers[r.key] = r.to;
      }
      schedule(true);
    } else if (act === 'resetCfg') {
      cfg.servers = {};
      cfg.svc = {};
      cfg.dist = {};
      schedule(true);
    } else if (act === 'pick') {
      view.unit = t.dataset.k;
      focusUnit(t.dataset.k);
    } else if (act === 'wf') {
      const f = host.querySelector('[data-k="wfframe"]');
      if (f) f.src = t.dataset.v;
      for (const b of host.querySelectorAll('[data-act="wf"]')) b.classList.toggle('on', b === t);
    }
  });

  function onEdit(e, committed) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const k = t.dataset.k;
    const num = Number(t.value);
    let hard = false;
    switch (act) {
      case 'lane': {
        const base = LANES[k].perDay || 1;
        cfg.scale[k] = Math.max(0, num) / base;
        hard = true;
        break;
      }
      case 'hourK': {
        if (!cfg.hourK) cfg.hourK = new Array(24).fill(1);
        cfg.hourK[Number(k)] = num;
        hard = true;
        break;
      }
      case 'flatBooking':
        cfg.flatBooking = num;
        hard = true;
        break;
      case 'orderK':
        cfg.orderK = num;
        hard = true;
        break;
      case 'order':
        cfg.orders = {...(cfg.orders || {}), [k]: num};
        hard = true;
        break;
      case 'hour':
        view.hour = Number(t.value);
        break;
      case 'target':
        view.targetWq = num;
        break;
      case 'rhoMax':
        view.rhoMax = num;
        break;
      case 'distAll':
        if (t.value) for (const key of STATION_KEYS) cfg.dist[key] = t.value;
        hard = true;
        break;
      case 'breaks':
        cfg.breaks = t.checked;
        hard = true;
        break;
      case 'balking':
        cfg.balking = t.checked;
        hard = true;
        break;
      case 'seed':
        cfg.seed = num;
        hard = true;
        break;
      case 'slots':
        cfg.servers[k] = Math.max(1, Math.round(num));
        hard = true;
        break;
      case 'svc':
        cfg.svc[k] = Math.max(0.2, num);
        hard = true;
        break;
      case 'dist':
        cfg.dist[k] = t.value;
        hard = true;
        break;
      default:
        return;
    }
    // a slider fires on every pixel: redraw the formulas live, but only re-run the day when it is let go
    if (hard && !committed) {
      schedule(false);
      return;
    }
    schedule(hard);
  }

  let built = false;
  function render() {
    renderQueue();
    renderCatalog();
    if (!built) {
      renderWorkflow();
      built = true;
    }
  }

  return {render, view};
}

/** The order-set probabilities for one kind of patient, read off the same table the model reads. */
function orderProbs(who) {
  for (const r of ORDER_RULES) {
    const w = r.when;
    if (w.lane && w.lane !== who.lane) continue;
    if (w.clinic && w.clinic !== who.clinic) continue;
    if (w.esiAtMost != null && !(who.esi && who.esi <= w.esiAtMost)) continue;
    return {lab: 0, xray: 0, ekg: 0, ct: 0, ...r.orders};
  }
  return {lab: 0, xray: 0, ekg: 0, ct: 0};
}
