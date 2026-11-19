// The product UI over the 3D: a top bar, the mode switch, the unit list, the process player, KPI cards, a detail
// card, the waiting-time distribution, map pins and the colour key.
//
// Laid out on a fixed 1600 x 900 stage so the panels and the 3D share one frame and nothing stretches on a window
// that is not 16:9. `update(state)` fills it and NOTHING here moves the scene or reads a clock — the app owns both.
//
// The colour key is generated from the palette values in style.js rather than typed out again, so it cannot lie
// about what the colours mean (acceptance criterion 7).
import {HOS} from './style.js';

const CSS = `
.wt{position:absolute;inset:0;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#12192c;font-feature-settings:"tnum"}
.wt *{box-sizing:border-box}
.wt b,.wt strong{font-weight:700}

/* ---------- top bar ---------- */
.wt .bar{position:absolute;left:0;right:0;top:0;height:68px;background:rgba(255,255,255,.95);border-bottom:1px solid #e2e7f3;display:flex;align-items:center;padding:0 24px;gap:18px}
.wt .logo{display:flex;align-items:center;gap:11px;font-weight:800;font-size:19px;letter-spacing:-.02em}
.wt .logo i{width:30px;height:30px;border-radius:9px;background:${HOS.blue};display:block;position:relative}
.wt .logo i:after{content:"";position:absolute;inset:9px 13px;background:#fff;border-radius:1px}
.wt .logo i:before{content:"";position:absolute;inset:13px 9px;background:#fff;border-radius:1px}
.wt .logo small{display:block;font-size:11px;font-weight:600;color:#7b849b;letter-spacing:.04em;margin-top:-1px}
.wt .modes{display:flex;gap:4px;margin-left:14px;background:#eef1f8;padding:4px;border-radius:11px;pointer-events:auto}
.wt .modes button{border:0;background:transparent;font:600 13.5px Inter,sans-serif;color:#5c6680;padding:7px 15px;border-radius:8px;cursor:pointer}
.wt .modes button.on{background:#fff;color:#12192c;box-shadow:0 1px 3px rgba(20,30,60,.13)}
.wt .sw{margin-left:auto;display:flex;align-items:stretch;height:44px;border:1px solid #dde3ef;border-radius:11px;background:#fff;overflow:hidden;pointer-events:auto;cursor:pointer}
.wt .sw .main{display:flex;align-items:center;gap:9px;padding:0 13px;font-size:13.5px;font-weight:700;width:248px}
.wt .sw .main em{width:26px;height:26px;border-radius:7px;background:${HOS.blueLight};color:#16233f;font:800 12px Inter;display:grid;place-items:center;font-style:normal}
.wt .sw .main small{display:block;font-size:11.5px;font-weight:500;color:#6f7891;margin-top:1px}
.wt .sw .caret{width:34px;border-left:1px solid #e8ecf5;display:grid;place-items:center;color:#8b93a6;font-size:10px}
.wt .clock{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;padding-left:4px}
.wt .clock span{font-size:11.5px;font-weight:600;color:#7b849b;display:block}
.wt .op{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:600}
.wt .op i{width:32px;height:32px;border-radius:50%;background:${HOS.mint};display:grid;place-items:center;color:#fff;font:800 12px Inter;font-style:normal}

/* the plate dropdown */
.wt .drop{position:absolute;right:24px;top:62px;width:282px;background:#fff;border:1px solid #dde3ef;border-radius:13px;box-shadow:0 18px 40px rgba(18,28,56,.16);padding:7px;opacity:0;transform:translateY(-6px);transition:opacity .13s,transform .13s}
.wt .drop.open{opacity:1;transform:none}
.wt .drop .it{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:13.5px;font-weight:600}
.wt .drop .it:hover{background:#f2f5fb}
.wt .drop .it.on{background:#eaf0fe}
.wt .drop .it em{width:24px;height:24px;border-radius:7px;background:${HOS.blueLight};color:#16233f;font:800 11px Inter;display:grid;place-items:center;font-style:normal}
.wt .drop .it small{display:block;font-size:11px;font-weight:500;color:#6f7891}

/* ---------- left column ---------- */
.wt .left{position:absolute;left:18px;top:84px;width:308px;max-height:770px;display:flex;flex-direction:column;gap:11px;pointer-events:auto}
.wt .pan{background:rgba(255,255,255,.96);border:1px solid #e2e7f3;border-radius:14px;box-shadow:0 6px 18px rgba(18,28,56,.07)}
.wt .pan h4{margin:0;padding:12px 14px 9px;font-size:11.5px;font-weight:700;letter-spacing:.07em;color:#7b849b;text-transform:uppercase}
.wt .pan h4 u{float:right;text-decoration:none;color:#aeb6c8;font-weight:600;letter-spacing:0;text-transform:none;font-size:11.5px}
.wt .list{max-height:452px;overflow:hidden;padding:0 7px 8px}
.wt .row{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:9px;cursor:pointer;font-size:13px}
.wt .row:hover{background:#f3f6fc}
.wt .row.on{background:#eaf0fe}
.wt .row i{width:8px;height:22px;border-radius:3px;display:block;flex:none}
.wt .row .nm{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wt .row .nm s{display:block;text-decoration:none;font-size:11px;font-weight:500;color:#7b849b}
.wt .row .q{font-weight:800;font-size:13.5px;min-width:30px;text-align:right}
.wt .row .q s{display:block;text-decoration:none;font-size:10px;font-weight:600;color:#9aa2b5}
.wt .row.hot .q{color:${HOS.rose}}
.wt .row em{font-style:normal;font-size:10px;font-weight:700;color:#fff;background:${HOS.rose};border-radius:5px;padding:1px 5px}

/* process list */
.wt .plist{padding:0 7px 8px;max-height:430px;overflow:hidden}
.wt .prow{padding:8px 9px;border-radius:9px;cursor:pointer}
.wt .prow:hover{background:#f3f6fc}
.wt .prow.on{background:#eaf0fe}
.wt .prow b{display:block;font-size:13px;font-weight:700}
.wt .prow s{display:block;text-decoration:none;font-size:11px;color:#7b849b;margin-top:1px;line-height:1.35}
.wt .prow u{display:block;text-decoration:none;font-size:10.5px;color:#9aa2b5;margin-top:3px;font-weight:600;letter-spacing:.02em}

/* ---------- right column ---------- */
.wt .right{position:absolute;right:18px;top:84px;width:330px;display:flex;flex-direction:column;gap:11px;pointer-events:auto}
.wt .kpis{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.wt .kpi{background:rgba(255,255,255,.96);border:1px solid #e2e7f3;border-radius:13px;padding:11px 12px;box-shadow:0 6px 18px rgba(18,28,56,.07)}
.wt .kpi u{display:block;text-decoration:none;font-size:10.5px;font-weight:700;letter-spacing:.06em;color:#8b93a6;text-transform:uppercase}
.wt .kpi b{display:block;font-size:25px;font-weight:800;letter-spacing:-.02em;margin-top:3px;line-height:1.05}
.wt .kpi s{display:block;text-decoration:none;font-size:11px;color:#7b849b;margin-top:2px}
.wt .kpi.warn b{color:${HOS.rose}}

/* detail card */
.wt .det{background:rgba(255,255,255,.96);border:1px solid #e2e7f3;border-radius:14px;padding:13px;box-shadow:0 6px 18px rgba(18,28,56,.07)}
.wt .det .hd{display:flex;gap:11px;align-items:flex-start}
.wt .det .hd img{width:62px;height:62px;border-radius:11px;background:#f1f4fb;flex:none;object-fit:contain}
.wt .det .hd b{display:block;font-size:14.5px;font-weight:800;line-height:1.2}
.wt .det .hd s{display:block;text-decoration:none;font-size:11.5px;color:#7b849b;margin-top:2px;line-height:1.35}
.wt .det .tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:5px;margin-top:5px;color:#fff}
.wt .det .grid{display:grid;grid-template-columns:1fr 1fr;gap:7px 10px;margin-top:11px}
.wt .det .grid div{border-top:1px solid #edf0f7;padding-top:5px}
.wt .det .grid u{display:block;text-decoration:none;font-size:10.5px;color:#8b93a6;font-weight:600}
.wt .det .grid b{display:block;font-size:14px;font-weight:700;margin-top:1px}
.wt .det .btns{display:flex;gap:6px;margin-top:11px}
.wt .det .btns b{flex:1;text-align:center;font-size:12px;font-weight:700;padding:7px 0;border-radius:8px;background:#f1f4fb;cursor:pointer}
.wt .det .btns b.pri{background:${HOS.blue};color:#fff}
.wt .det .btns b:hover{filter:brightness(.97)}

/* histogram */
.wt .hist{background:rgba(255,255,255,.96);border:1px solid #e2e7f3;border-radius:14px;padding:12px 13px 10px;box-shadow:0 6px 18px rgba(18,28,56,.07)}
.wt .hist .top{display:flex;justify-content:space-between;align-items:baseline}
.wt .hist .top u{text-decoration:none;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:#7b849b;text-transform:uppercase}
.wt .hist .top s{text-decoration:none;font-size:11px;color:#8b93a6}
.wt .hist .bars{height:62px;display:flex;align-items:flex-end;gap:1.5px;margin-top:9px}
.wt .hist .bars i{flex:1;background:${HOS.blueLight};border-radius:2px 2px 0 0;min-height:1px;display:block}
.wt .hist .bars i.p50{background:${HOS.blue}}
.wt .hist .bars i.p90{background:${HOS.rose}}
.wt .hist .ax{display:flex;justify-content:space-between;font-size:10px;color:#9aa2b5;margin-top:4px}

/* colour key */
.wt .key{background:rgba(255,255,255,.96);border:1px solid #e2e7f3;border-radius:14px;padding:11px 13px;box-shadow:0 6px 18px rgba(18,28,56,.07)}
.wt .key u{display:block;text-decoration:none;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:#7b849b;text-transform:uppercase;margin-bottom:7px}
.wt .key .g{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
.wt .key div{display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.25}
.wt .key div i{width:11px;height:11px;border-radius:3px;display:block;flex:none}

/* ---------- the process step rail ---------- */
.wt .rail{position:absolute;left:50%;transform:translateX(-50%);bottom:74px;display:flex;align-items:stretch;gap:0;background:rgba(255,255,255,.97);border:1px solid #e2e7f3;border-radius:15px;box-shadow:0 10px 30px rgba(18,28,56,.13);padding:9px;pointer-events:auto;max-width:1180px;overflow:hidden}
.wt .rail .st{position:relative;display:flex;flex-direction:column;gap:2px;padding:6px 10px;border-radius:10px;cursor:pointer;min-width:104px;max-width:150px}
.wt .rail .st.walk{min-width:58px;max-width:72px;padding:6px 6px;opacity:.72}
.wt .rail .st.walk b{font-size:10.5px;font-weight:600;color:#5c6680}
.wt .rail .st:hover{background:#f3f6fc}
.wt .rail .st u{text-decoration:none;font-size:10px;font-weight:700;letter-spacing:.06em;color:#9aa2b5;text-transform:uppercase}
.wt .rail .st b{font-size:12.5px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px}
.wt .rail .st s{text-decoration:none;font-size:10px;color:#7b849b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wt .rail .st.done{opacity:.55}
.wt .rail .st.now{background:#eaf0fe}
.wt .rail .st.now b{color:${HOS.blue}}
.wt .rail .st:not(:last-child):after{content:"";position:absolute;right:-4px;top:50%;width:8px;height:8px;border-right:1.6px solid #ccd4e6;border-top:1.6px solid #ccd4e6;transform:translateY(-50%) rotate(45deg)}
.wt .rail .st.walk u{color:${HOS.blue}}

/* ---------- map pins ---------- */
.wt .pins{position:absolute;inset:0;overflow:hidden}
.wt .pin{position:absolute;transform:translate(-50%,-100%);background:#fff;border:1px solid #dfe4f0;border-radius:9px;padding:4px 9px;box-shadow:0 5px 14px rgba(18,28,56,.14);font-size:11.5px;font-weight:700;white-space:nowrap}
.wt .pin s{display:block;text-decoration:none;font-size:10px;font-weight:500;color:#7b849b}
.wt .pin:after{content:"";position:absolute;left:50%;bottom:-4px;width:7px;height:7px;background:#fff;border-right:1px solid #dfe4f0;border-bottom:1px solid #dfe4f0;transform:translateX(-50%) rotate(45deg)}
.wt .pin.hot{background:${HOS.rose};border-color:${HOS.rose};color:#fff}
.wt .pin.hot s{color:rgba(255,255,255,.82)}
.wt .pin.hot:after{background:${HOS.rose};border-color:${HOS.rose}}
.wt .pin.sel{background:${HOS.blue};border-color:${HOS.blue};color:#fff}
.wt .pin.sel s{color:rgba(255,255,255,.85)}
.wt .pin.sel:after{background:${HOS.blue};border-color:${HOS.blue}}
.wt .plabel{position:absolute;transform:translate(-50%,-50%);font-size:13px;font-weight:800;letter-spacing:.1em;color:#8793ae;text-transform:uppercase;text-shadow:0 1px 0 rgba(255,255,255,.75)}
.wt .plabel s{display:block;text-decoration:none;font-size:10.5px;font-weight:600;letter-spacing:.02em;color:#99a3bb;text-transform:none;margin-top:2px}

/* ---------- the follow strip ---------- */
.wt .follow{position:absolute;left:50%;transform:translateX(-50%);top:84px;background:rgba(255,255,255,.97);border:1px solid #e2e7f3;border-radius:13px;box-shadow:0 8px 22px rgba(18,28,56,.1);padding:9px 14px;display:flex;align-items:center;gap:14px;pointer-events:auto}
.wt .follow b{font-size:13.5px;font-weight:800}
.wt .follow s{text-decoration:none;font-size:11.5px;color:#7b849b}
.wt .follow .tl{display:flex;height:9px;border-radius:5px;overflow:hidden;width:430px;background:#eef1f8}
.wt .follow .tl i{display:block;height:100%}
.wt .follow em{font-style:normal;font-size:11px;font-weight:700;color:#5c6680;background:#f1f4fb;border-radius:6px;padding:3px 8px;cursor:pointer}

.wt .hide{display:none}
`;

const el = (html) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild;
};

const DEPT_COLOR = {
  front: HOS.blue, opd: HOS.mint, diag: HOS.olive, er: HOS.rose,
  surg: HOS.violet, ward: HOS.violet, money: HOS.amber, support: HOS.teal,
};

export function createUI(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const wt = el(`<div class="wt">
    <div class="bar">
      <div class="logo"><i></i><span>Meridian General<small>HOSPITAL OPERATIONS</small></span></div>
      <div class="modes">
        <button data-mode="site">Whole hospital</button>
        <button data-mode="unit">By unit</button>
        <button data-mode="process">By process</button>
      </div>
      <div class="sw" data-k="sw"><div class="main"><em>L1</em><span data-k="swname">Level 1<small data-k="swsub">Front office</small></span></div><div class="caret">&#9660;</div></div>
      <div class="clock"><span data-k="day">Monday</span><span data-k="time" style="font-size:15px;color:#12192c">08:00</span></div>
      <div class="op"><i>AC</i><span>Duty manager</span></div>
    </div>
    <div class="drop" data-k="drop"></div>

    <div class="left">
      <div class="pan" data-k="unitpan">
        <h4>Service units <u data-k="unitcount"></u></h4>
        <div class="list" data-k="units"></div>
      </div>
      <div class="pan hide" data-k="procpan">
        <h4>Patient processes <u data-k="proccount"></u></h4>
        <div class="plist" data-k="procs"></div>
      </div>
      <div class="key" data-k="key"></div>
    </div>

    <div class="right">
      <div class="kpis" data-k="kpis"></div>
      <div class="det" data-k="det"></div>
      <div class="hist" data-k="hist"></div>
    </div>

    <div class="rail hide" data-k="rail"></div>
    <div class="follow hide" data-k="follow"></div>
    <div class="pins" data-k="pins"></div>
  </div>`);
  app.appendChild(wt);

  const q = (k) => wt.querySelector(`[data-k="${k}"]`);
  const els = {
    wt,
    modes: wt.querySelectorAll('.modes button'),
    sw: q('sw'), swname: q('swname'), swsub: q('swsub'), drop: q('drop'),
    day: q('day'), time: q('time'),
    unitpan: q('unitpan'), units: q('units'), unitcount: q('unitcount'),
    procpan: q('procpan'), procs: q('procs'), proccount: q('proccount'),
    kpis: q('kpis'), det: q('det'), hist: q('hist'), key: q('key'),
    rail: q('rail'), follow: q('follow'), pins: q('pins'),
  };

  // the colour key is built from the palette, never retyped
  els.key.innerHTML =
    '<u>What the people mean</u><div class="g">' +
    [
      [HOS.stWalk, 'Walking'],
      [HOS.stQueue, 'Queueing'],
      [HOS.stQueueLong, 'Queueing 45 min+'],
      [HOS.stService, 'Being seen'],
      [HOS.stResult, 'Waiting for a result'],
      [HOS.stBed, 'In a bed'],
      [HOS.scrubNurse, 'Nurse'],
      [HOS.coatDoctor, 'Doctor'],
    ]
      .map(([c, l]) => `<div><i style="background:${c};box-shadow:inset 0 0 0 1px rgba(20,30,60,.12)"></i>${l}</div>`)
      .join('') +
    '</div>';

  let lastSig = {};
  const changed = (k, v) => {
    if (lastSig[k] === v) return false;
    lastSig[k] = v;
    return true;
  };

  /** Fill the UI. Pure: it reads `state` and writes the DOM, nothing else. */
  const update = (s) => {
    els.time.textContent = s.clock;
    els.day.textContent = s.dayName || 'Monday';

    for (const b of els.modes) b.classList.toggle('on', b.dataset.mode === s.mode);
    els.unitpan.classList.toggle('hide', s.mode === 'process');
    els.procpan.classList.toggle('hide', s.mode !== 'process');
    els.rail.classList.toggle('hide', s.mode !== 'process' || !s.steps?.length);
    els.follow.classList.toggle('hide', !s.follow);

    // plate switcher
    const plate = s.plateInfo;
    if (plate) {
      els.sw.querySelector('em').textContent = `L${plate.floor}`;
      els.swname.firstChild.textContent = plate.name;
      els.swsub.textContent = plate.sub;
    }
    els.drop.classList.toggle('open', !!s.dropOpen);
    els.drop.style.pointerEvents = s.dropOpen ? 'auto' : 'none';
    if (changed('drop', s.plates.map((p) => p.key).join() + s.plate)) {
      els.drop.innerHTML = s.plates
        .map((p) => `<div class="it${p.key === s.plate ? ' on' : ''}" data-plate="${p.key}"><em>L${p.floor}</em><span>${p.name}<small>${p.sub}</small></span></div>`)
        .join('');
    }

    // KPI cards
    const kpiSig = JSON.stringify(s.kpi);
    if (changed('kpi', kpiSig)) {
      els.kpis.innerHTML = s.kpi
        .map((k) => `<div class="kpi${k.warn ? ' warn' : ''}"><u>${k.label}</u><b>${k.value}</b><s>${k.sub}</s></div>`)
        .join('');
    }

    // unit list
    if (s.mode !== 'process') {
      els.unitcount.textContent = `${s.units.length} units`;
      const sig = s.units.map((u) => `${u.key}${u.q}${u.inSvc}${u.selected ? 1 : 0}${u.bottleneck ? 1 : 0}`).join('|');
      if (changed('units', sig)) {
        els.units.innerHTML = s.units
          .map(
            (u) => `<div class="row${u.selected ? ' on' : ''}${u.bottleneck ? ' hot' : ''}" data-unit="${u.key}">
              <i style="background:${DEPT_COLOR[u.dept] || HOS.shade}"></i>
              <span class="nm">${u.name}<s>${u.inSvc} of ${u.slots} busy · ${u.waitLabel}</s></span>
              ${u.bottleneck ? '<em>BUSIEST</em>' : ''}
              <span class="q">${u.q}<s>WAITING</s></span>
            </div>`,
          )
          .join('');
      }
    } else {
      els.proccount.textContent = `${s.processes.length}`;
      const sig = s.processes.map((p) => `${p.key}${p.selected ? 1 : 0}`).join('|');
      if (changed('procs', sig)) {
        els.procs.innerHTML = s.processes
          .map(
            (p) => `<div class="prow${p.selected ? ' on' : ''}" data-proc="${p.key}">
              <b>${p.name}</b><s>${p.note}</s><u>${p.routeLabel}</u>
            </div>`,
          )
          .join('');
      }
    }

    // detail card
    const c = s.card;
    if (c) {
      const sig = JSON.stringify([c.title, c.sub, c.rows, c.tag, c.thumb ? c.thumb.length : 0, c.note]);
      if (changed('card', sig)) {
        els.det.innerHTML = `
          <div class="hd">
            ${c.thumb ? `<img src="${c.thumb}" alt="">` : ''}
            <span><b>${c.title}</b><s>${c.sub}</s>${c.tag ? `<span class="tag" style="background:${c.tagColor || HOS.blue}">${c.tag}</span>` : ''}</span>
          </div>
          <div class="grid">${(c.rows || []).map(([k, v]) => `<div><u>${k}</u><b>${v}</b></div>`).join('')}</div>
          ${c.note ? `<s style="display:block;text-decoration:none;font-size:11.5px;color:#7b849b;margin-top:10px;line-height:1.4">${c.note}</s>` : ''}
          <div class="btns">${(c.btns || []).map((b, i) => `<b class="${i === 0 ? 'pri' : ''}" data-btn="${b.id}">${b.label}</b>`).join('')}</div>`;
      }
    }

    // waiting-time distribution: always with p50 and p90, never a bare mean (criterion 13)
    const h = s.hist;
    if (h) {
      const sig = JSON.stringify([h.label, h.buckets, h.p50, h.p90]);
      if (changed('hist', sig)) {
        // A square-root scale. Linear is honest but unreadable here: half the patients are seen in under two
        // minutes, so the first bar pins the scale and every other bar collapses to a line — which hides exactly the
        // long tail the panel exists to show.
        const max = Math.max(1, ...h.buckets);
        const bars = h.buckets
          .map((v, i) => {
            const mins = i * 2;
            const cls = mins === h.p50 ? 'p50' : mins === h.p90 ? 'p90' : '';
            return `<i class="${cls}" style="height:${v ? Math.max(3, Math.sqrt(v / max) * 100) : 0}%"></i>`;
          })
          .join('');
        els.hist.innerHTML = `
          <div class="top"><u>${h.label}</u><s>mean ${h.mean} · p50 ${h.p50} · p90 ${h.p90} min</s></div>
          <div class="bars">${bars}</div>
          <div class="ax"><span>0 min</span><span>${h.buckets.length * 2} min</span></div>`;
      }
    }

    // the process step rail
    if (s.mode === 'process' && s.steps?.length) {
      const sig = s.steps.map((x) => `${x.key}${x.state}${x.detail}`).join('|');
      if (changed('rail', sig)) {
        els.rail.innerHTML = s.steps
          .map(
            (x, i) => `<div class="st ${x.state}${x.walk ? ' walk' : ''}" data-step="${i}">
              <u>${x.walk ? 'WALK' : `STEP ${x.n}`}</u><b>${x.name}</b><s>${x.detail}</s>
            </div>`,
          )
          .join('');
      }
    }

    // the followed patient
    if (s.follow) {
      const f = s.follow;
      const sig = JSON.stringify([f.title, f.sub, f.segs.length, f.at]);
      if (changed('follow', sig)) {
        const total = f.segs.reduce((a, g) => a + g.w, 0) || 1;
        els.follow.innerHTML = `
          <span><b>${f.title}</b><s>${f.sub}</s></span>
          <div class="tl">${f.segs.map((g) => `<i style="width:${(g.w / total) * 100}%;background:${g.color}" title="${g.label}"></i>`).join('')}</div>
          <em data-btn="unfollow">Stop following</em>`;
      }
    }

    // map pins and plate labels
    const pins = s.pins || [];
    const sig = pins.map((p) => `${p.kind}${p.text}${Math.round(p.x)}${Math.round(p.y)}`).join('|');
    if (changed('pins', sig)) {
      els.pins.innerHTML = pins
        .map((p) =>
          p.kind === 'plate'
            ? `<div class="plabel" style="left:${p.x}px;top:${p.y}px">${p.text}<s>${p.sub || ''}</s></div>`
            : `<div class="pin ${p.kind || ''}" style="left:${p.x}px;top:${p.y}px">${p.text}${p.sub ? `<s>${p.sub}</s>` : ''}</div>`,
        )
        .join('');
    }
  };

  return {els, update, q};
}
