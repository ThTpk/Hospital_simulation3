// The HUD — version 1's panels, over version 2's hospital.
//
// Layout, wording and behaviour follow `3DSimulation_HospitalSystem` (Hospital_Workflow_3DSim): translucent panels
// pinned to the corners of a full-bleed canvas, the clock and the day's totals top left, the unit list down the
// left as both a readout and the selector, three charts top right, the whole-day comparison and the live sliders
// right, the view controls bottom left, the legend and the time bar across the bottom, and the patient card bottom
// right once somebody is being followed.
//
// Two rules carried over from both earlier versions, because they are what makes the thing trustworthy:
//
//   1. Nothing in this file touches the model or the camera. It renders what it is given and calls handlers.
//   2. The colour legend is BUILT FROM THE PALETTE, never typed out. Change a colour in style.js and the legend
//      changes with it, so it cannot describe a colour the simulation is not using.
import {CLINICS, DAY_END, DAY_START, STATIONS, hhmm} from './model.js';
import {SCENARIOS} from './scenarios.js';
import {HOS} from './style.js';

const CUTAWAYS = [
  {key: 'solid', label: 'ทึบ', hint: 'ผนังทุกชั้นทึบตามปกติ'},
  {key: 'xray', label: 'X-ray', hint: 'ผนังโปร่ง เห็นคนเดินทะลุผนัง'},
  {key: 'nowalls', label: 'ไม่มีผนัง', hint: 'ถอดผนังออกหมด เหลือผังพื้นกับของในห้อง'},
  {key: 'section', label: 'ตัดขวาง', hint: 'ตัดอาคารตามแนวลึก เลื่อนระนาบตัดได้'},
];
const CAMS = [
  {key: 'overview', label: 'ภาพรวม'},
  {key: 'top', label: 'ผังจากบน'},
  {key: 'eye', label: 'ระดับสายตา'},
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');

/**
 * @param host     the element the panels go in
 * @param cfg      the live config (read only here — writes go through handlers)
 * @param handlers {selectUnit, selectPatient, setScenario, setCutaway, setSection, setFloor, setCamera, setSpeed,
 *                  togglePlay, seek, setSlider, setBaseline, csv, resetView}
 * @param sliders  the slider specs from scenarios.js
 * @param floors   [{key, floor, name, sub}]
 */
export function createHud({host, cfg, handlers, sliders, floors, speeds}) {
  const ui = document.createElement('div');
  ui.className = 'ui';
  ui.innerHTML = `
    <div id="title">
      <h1>การไหลของผู้ป่วยในโรงพยาบาล</h1>
      <p>โรงพยาบาลทั่วไป 4 ชั้น 214 เตียง · ผู้ป่วยนอก ~440 ราย/วัน · ฉุกเฉิน ~75 ราย/วัน</p>
      <div id="bot"></div>
    </div>

    <div class="col col-l">
      <div class="p" id="clock">
        <div class="clockrow">
          <div class="time" data-k="time">06:00</div>
          <div class="scen" data-k="scen">วันปกติ</div>
        </div>
        <div class="kpis">
          <div class="kpi"><span>มาแล้ว</span><b data-k="kArr">0</b></div>
          <div class="kpi"><span>กลับแล้ว</span><b data-k="kLeft">0</b></div>
          <div class="kpi"><span>อยู่ใน รพ.</span><b data-k="kIn">0</b></div>
          <div class="kpi"><span>รับไว้นอน</span><b data-k="kAdm">0</b></div>
          <div class="kpi"><span>อยู่เฉลี่ย</span><b data-k="kLos">—</b></div>
          <div class="kpi"><span>ออกกลางคัน</span><b data-k="kBalk">0</b></div>
        </div>
      </div>

      <div class="p" id="depts">
        <h3>หน่วยบริการ <span class="mono" data-k="fps"></span></h3>
        <div data-k="dlist"></div>
        <div class="hint">กดหน่วยเพื่อโฟกัส (แยกชั้นให้เอง) · กดซ้ำเพื่อยกเลิก</div>
      </div>

      <div class="p" id="ctrl">
        <div class="grp"><div class="glab">สถานการณ์</div><div class="btns" data-k="bScen"></div></div>
        <div class="grp"><div class="glab">ตัดผ่าอาคาร</div><div class="btns" data-k="bCut"></div>
          <label class="secrow" data-k="secrow"><span>ระนาบตัด</span><input type="range" min="0" max="1" step="0.01" value="0.5" data-act="section"></label></div>
        <div class="grp"><div class="glab">ชั้น</div><div class="btns" data-k="bFloor"></div></div>
        <div class="grp"><div class="glab">มุมกล้อง</div><div class="btns" data-k="bCam"></div>
          <div class="hint">ลาก = เลื่อน · ลากขวา/shift+ลาก = หมุน · สกรอลล์ = ซูม<br>
            คีย์บอร์ด: <b>← →</b> หมุน · <b>↑ ↓</b> ก้ม-เงย · <b>W A S D</b> เลื่อน · <b>+ −</b> ซูม · <b>PgUp/PgDn</b> ย้ายระดับสายตา · <b>h</b> กลับภาพรวม</div></div>
      </div>
    </div>

    <div class="col col-r">
      <div class="p" id="card" data-k="card">
        <h3>ผู้ป่วย <span data-k="pid"></span> <button class="b" data-act="pclose" style="padding:1px 7px">ปิด</button></h3>
        <div data-k="psteps"></div>
        <div class="hint" data-k="pnote"></div>
      </div>

      <div class="p" id="charts">
        <h3>คิวย้อนหลัง <span data-k="chSel">ห้องตรวจแพทย์</span></h3>
        <canvas class="ch" data-k="chQ" height="92"></canvas>
        <div class="chl"><span>06:00</span><span data-k="chMax">0</span><span>20:00</span></div>
        <h3 style="margin-top:11px">การใช้กำลังคนทั้งวัน</h3>
        <canvas class="ch" data-k="chU" height="150"></canvas>
        <h3 style="margin-top:11px">การกระจายเวลารอ <span data-k="chPct"></span></h3>
        <canvas class="ch" data-k="chH" height="74"></canvas>
        <div class="chl"><span>0</span><span>นาที</span><span>60+</span></div>
      </div>

      <div class="p" id="compare">
        <h3>เทียบผลทั้งวัน <span data-k="cmpBusy" style="font-weight:400"></span></h3>
        <table class="cmp"><thead><tr><th>ตัวชี้วัด</th><th>ฐาน</th><th>ตอนนี้</th><th>ต่าง</th></tr></thead>
          <tbody data-k="cmpBody"></tbody></table>
        <div class="cmpbtns">
          <button class="b" data-act="baseline">ตั้งค่าปัจจุบันเป็นฐาน</button>
          <button class="b" data-act="csvSum">CSV สรุป</button>
          <button class="b" data-act="csvTs">CSV รายช่วงเวลา</button>
        </div>
        <div class="hint">รันทั้งวันจบแล้วเทียบ ไม่ใช่เทียบคิว ณ วินาทีนี้ซึ่งแกว่งตลอด ·
          ตัวสุ่มมี seed คงที่ ผลที่ต่างจึงมาจากกำลังคนที่ต่าง ไม่ใช่ดวง</div>
      </div>

      <div class="p" id="tune">
        <h3>ปรับสถานการณ์</h3>
        <div data-k="slist"></div>
        <div class="hint">เลื่อนแล้วคำนวณวันใหม่ทั้งวันทันที (~100 มิลลิวินาที) · ทุกหน่วยปรับได้ทั้ง<b>จำนวนจุดบริการ</b>และ<b>เวลาบริการเฉลี่ย</b> —
          ลองลดห้องตรวจเหลือ 14 ห้อง เทียบกับลดเวลาตรวจจาก 9 เหลือ 7 นาที แล้วดูว่าอย่างไหนช่วยได้มากกว่ากัน</div>
      </div>
    </div>

    <div id="bottom">
      <div class="p" id="legend" data-k="legend"></div>
      <div class="p" id="timebar">
        <button class="b" data-act="play" aria-pressed="true" style="min-width:58px">หยุด</button>
        <div class="btns" data-k="bSpeed"></div>
        <span class="tspan">06:00</span>
        <input type="range" data-act="scrub" min="${DAY_START}" max="${DAY_END}" step="1" value="${DAY_START}" aria-label="เวลา">
        <span class="tspan">20:00</span>
      </div>
    </div>`;
  host.appendChild(ui);

  // Queue counts, floating over the units they belong to.
  //
  // A separate layer rather than a panel, because the question "how many are waiting HERE" is a question about a
  // place: the number has to be next to the room. It is drawn from the same per-unit report the list on the left
  // reads, so the chip over the pharmacy and the row in the list can never show different numbers.
  const pinLayer = document.createElement('div');
  pinLayer.className = 'pins';
  ui.appendChild(pinLayer);

  const tour = document.createElement('div');
  tour.id = 'tour';
  tour.innerHTML = '<i></i><span>กำลังพาชมอัตโนมัติ — แตะเพื่อควบคุมเอง</span>';
  host.appendChild(tour);

  const el = (k) => ui.querySelector(`[data-k="${k}"]`);
  const els = {
    time: el('time'), scen: el('scen'), fps: el('fps'), dlist: el('dlist'),
    chSel: el('chSel'), chQ: el('chQ'), chU: el('chU'), chH: el('chH'), chMax: el('chMax'), chPct: el('chPct'),
    cmpBody: el('cmpBody'), cmpBusy: el('cmpBusy'), slist: el('slist'), legend: el('legend'),
    card: el('card'), pid: el('pid'), psteps: el('psteps'), pnote: el('pnote'),
    scrub: ui.querySelector('[data-act="scrub"]'), play: ui.querySelector('[data-act="play"]'),
    section: ui.querySelector('[data-act="section"]'), secrow: el('secrow'),
    kArr: el('kArr'), kLeft: el('kLeft'), kIn: el('kIn'), kAdm: el('kAdm'), kLos: el('kLos'), kBalk: el('kBalk'),
    bot: ui.querySelector('#bot'),
  };

  // ---- the button groups
  const group = (holder, items, act) => {
    holder.innerHTML = items
      .map((i) => `<button class="b${i.danger ? ' danger' : ''}" data-act="${act}" data-v="${i.key}" aria-pressed="false"${i.hint ? ` title="${esc(i.hint)}"` : ''}>${esc(i.label)}</button>`)
      .join('');
  };
  group(el('bScen'), SCENARIOS.map((s) => ({key: s.key, label: s.label, hint: s.hint, danger: s.key === 'masscas'})), 'scenario');
  group(el('bCut'), CUTAWAYS, 'cutaway');
  group(el('bFloor'), [{key: 'all', label: 'ทั้งอาคาร'}, ...floors.map((f) => ({key: String(f.floor), label: f.name, hint: f.sub}))], 'floor');
  group(el('bCam'), CAMS, 'camera');
  group(el('bSpeed'), speeds.map((s, i) => ({key: String(i), label: `${s}×`})), 'speed');

  const press = (act, value) => {
    for (const b of ui.querySelectorAll(`[data-act="${act}"][data-v]`)) b.setAttribute('aria-pressed', String(b.dataset.v === String(value)));
  };

  // ---- the sliders
  const slEls = {};
  let lastGroup = null;
  els.slist.innerHTML = sliders
    .map((sp, i) => {
      const v = sp.get(cfg);
      const head = sp.group && sp.group !== lastGroup ? `<div class="slgrp">${esc((lastGroup = sp.group))}</div>` : '';
      // a service-time slider sits under the staffing slider for the same unit, so the pair reads as one block
      return `${head}<div class="sl${sp.kind === 'svc' ? ' svcrow' : ''}"${sp.note ? ` title="${esc(sp.note)}"` : ''}>
        <div class="slr"><span>${esc(sp.label)}</span><b data-k="slv${i}">${esc(sp.fmt(v))}</b></div>
        <input type="range" min="${sp.min}" max="${sp.max}" step="${sp.step}" value="${v}" data-act="slider" data-i="${i}" aria-label="${esc(sp.sub ? `${sp.label} ${sp.sub}` : sp.label)}"></div>`;
    })
    .join('');
  sliders.forEach((sp, i) => {
    slEls[i] = {input: ui.querySelector(`[data-act="slider"][data-i="${i}"]`), out: el(`slv${i}`), spec: sp};
  });

  /** Push the config back into the sliders — after a scenario button, or a reset. */
  const syncSliders = () => {
    for (const i of Object.keys(slEls)) {
      const {input, out, spec} = slEls[i];
      const v = spec.get(cfg);
      input.value = String(v);
      out.textContent = spec.fmt(v);
    }
  };

  // ---- the legend, built from the palette so it cannot lie about what the colours mean
  els.legend.innerHTML = `
    <div class="lgrow"><span class="lgk">ผู้ป่วย</span>
      ${[
        [HOS.stWalk, 'กำลังเดิน'],
        [HOS.stQueue, 'ต่อคิว'],
        [HOS.stQueueLong, 'รอเกิน 45 นาที'],
        [HOS.stService, 'กำลังรับบริการ'],
        [HOS.stResult, 'รอผลตรวจ'],
        [HOS.stBed, 'นอนเตียง'],
      ]
        .map(([c, t]) => `<span class="lgi"><i class="lgs" style="background:${c}"></i>${t}</span>`)
        .join('')}
    </div>
    <div class="lgrow"><span class="lgk">เจ้าหน้าที่</span>
      ${[
        [HOS.coatDoctor, 'แพทย์'],
        [HOS.scrubNurse, 'พยาบาล'],
        [HOS.scrubTech, 'นักเทคนิค'],
        [HOS.uniAdmin, 'เวชระเบียน/การเงิน'],
        [HOS.uniPharm, 'เภสัชกร'],
      ]
        .map(([c, t]) => `<span class="lgi"><i class="lgs" style="background:${c}"></i>${t}</span>`)
        .join('')}
    </div>
    <div class="lgrow"><span class="lgk">ชั้น</span>
      ${floors.map((f) => `<span class="lgi"><span class="lgn">${f.name}</span> ${esc(f.sub)}</span>`).join('')}
    </div>`;

  // ---- events: one listener, every control
  ui.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act;
    const v = b.dataset.v;
    if (act === 'scenario') handlers.setScenario(v);
    else if (act === 'cutaway') handlers.setCutaway(v);
    else if (act === 'floor') handlers.setFloor(v === 'all' ? null : Number(v));
    else if (act === 'camera') handlers.setCamera(v);
    else if (act === 'speed') handlers.setSpeed(Number(v));
    else if (act === 'play') handlers.togglePlay();
    else if (act === 'baseline') handlers.setBaseline();
    else if (act === 'csvSum') handlers.csv('summary');
    else if (act === 'csvTs') handlers.csv('series');
    else if (act === 'pclose') handlers.selectPatient(null);
    else if (act === 'unit') handlers.selectUnit(b.dataset.unit || null);
  });
  ui.addEventListener('input', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'scrub') handlers.seek(Number(t.value));
    else if (act === 'section') handlers.setSection(Number(t.value));
    else if (act === 'slider') {
      const i = Number(t.dataset.i);
      const sp = slEls[i].spec;
      const v = Number(t.value);
      slEls[i].out.textContent = sp.fmt(v);
      handlers.setSlider(i, v, false);
    }
  });
  ui.addEventListener('change', (e) => {
    const t = e.target.closest('[data-act="slider"]');
    if (!t) return;
    handlers.setSlider(Number(t.dataset.i), Number(t.value), true);
  });

  // ─────────────────────────────────────────────────────────────── charts
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const prep = (c) => {
    const r = dpr();
    const w = c.clientWidth || 220;
    const h = Number(c.getAttribute('height'));
    if (c.width !== Math.round(w * r)) {
      c.width = Math.round(w * r);
      c.height = Math.round(h * r);
    }
    const g = c.getContext('2d');
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, w, h);
    return {g, w, h};
  };
  const css = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;

  /** Queue length over the day for one unit, with a marker at the clock. */
  function drawQueue(history, unit, tNow) {
    const {g, w, h} = prep(els.chQ);
    if (!history.length) return;
    const vals = history.map((r) => r.stations[unit]?.q || 0);
    const max = Math.max(4, ...vals);
    els.chMax.textContent = `สูงสุด ${max}`;
    g.strokeStyle = css('--line', '#ccc');
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h * i) / 4;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.beginPath();
    vals.forEach((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = HOS.blue;
    g.lineWidth = 1.6;
    g.stroke();
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = `${HOS.blue}22`;
    g.fill();
    const k = (tNow - DAY_START) / (DAY_END - DAY_START);
    g.strokeStyle = HOS.rose;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(k * w, 0);
    g.lineTo(k * w, h);
    g.stroke();
  }

  /** Utilisation per unit, all day, as a bar list. */
  function drawUtil(rows) {
    const {g, w, h} = prep(els.chU);
    const n = rows.length;
    if (!n) return;
    const bh = Math.max(4, (h - 2) / n - 2);
    rows.forEach((r, i) => {
      const y = i * (bh + 2);
      g.fillStyle = css('--line', '#ddd');
      g.fillRect(44, y, w - 44, bh);
      const u = Math.min(1.25, r.util);
      g.fillStyle = u >= 1 ? HOS.rose : u >= 0.85 ? HOS.amber : HOS.mintDeep;
      g.fillRect(44, y, (w - 44) * (u / 1.25), bh);
      g.fillStyle = css('--ink-2', '#666');
      g.font = `${Math.min(9.5, bh + 1)}px Inter, sans-serif`;
      g.textBaseline = 'middle';
      g.fillText(r.key, 0, y + bh / 2 + 0.5);
    });
    // the 85% and 100% marks
    for (const [v, c] of [[0.85, HOS.amber], [1, HOS.rose]]) {
      const x = 44 + (w - 44) * (v / 1.25);
      g.strokeStyle = c;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
  }

  /** The waiting-time distribution for the selected unit, with p50 and p90. */
  function drawHist(summary) {
    const {g, w, h} = prep(els.chH);
    if (!summary) return;
    const buckets = summary.hist.slice(0, 31);
    const max = Math.max(1, ...buckets);
    const bw = w / buckets.length;
    buckets.forEach((v, i) => {
      const bh = (v / max) * (h - 2);
      g.fillStyle = i * 2 >= summary.waitP90 ? HOS.rose : i * 2 >= summary.waitP50 ? HOS.amber : HOS.mintDeep;
      g.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
    });
    els.chPct.textContent = `p50 ${summary.waitP50} · p90 ${summary.waitP90} นาที`;
  }

  // ─────────────────────────────────────────────────────── per-frame update
  let lastDeptKey = '';
  let lastDeptAt = 0;
  let lastSel = null;
  let lastCardKey = '';

  function update(s) {
    els.time.textContent = s.clock;
    els.scen.textContent = s.scenarioLabel;
    els.kArr.textContent = n0(s.totals.arrived);
    els.kLeft.textContent = n0(s.totals.left);
    els.kIn.textContent = n0(s.inSystem);
    els.kAdm.textContent = n0(s.totals.admitted);
    els.kLos.textContent = `${n0(s.losMean)} น.`;
    els.kBalk.textContent = n0(s.totals.balked + s.totals.reneged);
    if (!s.dragging) els.scrub.value = String(Math.round(s.t));
    els.bot.textContent = s.bottleneck ? `คอขวดตอนนี้: ${s.bottleneck.name} · ${s.bottleneck.q} คนรออยู่` : '';
    els.bot.classList.toggle('on', !!s.bottleneck);

    // The unit list: rebuilt when the numbers change, but at most three times a second. At sixty it would be
    // replacing the rows between a mouse-down and a mouse-up, which eats the click.
    const sel = s.depts.find((d) => d.selected);
    const selKey = sel ? sel.key : null;
    const key = s.depts.map((d) => `${d.key}${d.q}${d.inSvc}${d.selected ? 1 : 0}${d.bottleneck ? 1 : 0}`).join('|');
    const now = performance.now();
    if (key !== lastDeptKey && (now - lastDeptAt > 320 || selKey !== lastSel)) {
      lastDeptKey = key;
      lastDeptAt = now;
      els.dlist.innerHTML = s.depts
        .map(
          (d) => `<button class="dept${d.bottleneck ? ' hot' : ''}" data-act="unit" data-unit="${d.key}" aria-pressed="${d.selected}">
            <div class="dr1"><span class="dn">${esc(d.name)}</span><span class="dq">${d.q}</span></div>
            <div class="bar"><i style="width:${Math.min(100, d.util * 100).toFixed(0)}%;background:${d.util >= 1 ? HOS.rose : d.util >= 0.85 ? HOS.amber : HOS.blue}"></i></div>
            <div class="dr2"><span>${d.inSvc}/${d.slots} ทำงาน</span><span>รอ ${n1(d.waitMean)} น.</span></div>
          </button>`,
        )
        .join('');
    }

    // Picking a room in the 3D moves the list to that room's unit: the panel and the building agree on what is
    // selected, and the row is brought into view rather than being highlighted somewhere below the fold.
    if (selKey !== lastSel) {
      lastSel = selKey;
      if (selKey) {
        const row = els.dlist.querySelector(`[data-unit="${selKey}"]`);
        if (row) row.scrollIntoView({block: 'nearest'});
      }
    }

    if (s.charts) {
      els.chSel.textContent = s.charts.unitName;
      drawQueue(s.charts.history, s.charts.unit, s.t);
      drawUtil(s.charts.util);
      drawHist(s.charts.summary);
    }

    // the patient card
    const ck = s.patient ? `${s.patient.id}|${s.patient.steps.length}|${s.patient.now}` : '';
    if (ck !== lastCardKey) {
      lastCardKey = ck;
      els.card.classList.toggle('on', !!s.patient);
      if (s.patient) {
        els.pid.textContent = `#${s.patient.id}`;
        els.psteps.innerHTML = s.patient.steps
          .map((x) => `<div class="pstep${x.now ? ' now' : ''}"><span>${esc(x.label)}</span><span>${esc(x.detail)}</span></div>`)
          .join('');
        els.pnote.textContent = s.patient.note;
      }
    }
  }

  return {
    els,
    slEls,
    update,
    syncSliders,
    /**
     * @param pins [{key, x, y, n, name, sub, cls}] in screen pixels, already filtered to what is visible.
     * `n` is a queue count; a pin with `n === ''` is a label instead, which is what the selected room gets.
     */
    setPins: (pins) => {
      pinLayer.innerHTML = pins
        .map(
          (p) => `<div class="pin ${p.cls}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">
            ${p.n === '' ? '' : `<b>${p.n}</b>`}${p.name ? `<s>${esc(p.name)}</s>` : ''}${p.sub ? `<em>${esc(p.sub)}</em>` : ''}</div>`,
        )
        .join('');
    },
    setScenario: (k, label) => {
      press('scenario', k);
      els.scen.textContent = label;
    },
    setCutBtn: (m) => {
      press('cutaway', m);
      els.secrow.classList.toggle('on', m === 'section');
    },
    setFloorBtn: (f) => press('floor', f == null ? 'all' : String(f)),
    setCamBtn: (c) => press('camera', c),
    setSpeedBtn: (i) => press('speed', String(i)),
    setPlaying: (p) => {
      els.play.textContent = p ? 'หยุด' : 'เล่น';
      els.play.setAttribute('aria-pressed', String(p));
    },
    setTour: (on) => tour.classList.toggle('on', on),
    setFps: (n) => (els.fps.textContent = `${n} fps`),
    setCompare: (rows, busy) => {
      els.cmpBusy.textContent = busy || '';
      els.cmpBody.innerHTML = rows
        .map((r) =>
          r.section
            ? `<tr class="sec"><td colspan="4">${esc(r.section)}</td></tr>`
            : `<tr><td>${esc(r.label)}</td><td>${esc(r.base)}</td><td>${esc(r.now)}</td><td class="dlt ${r.dir}">${esc(r.delta)}</td></tr>`,
        )
        .join('');
    },
  };
}
