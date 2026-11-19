// The product shell: four tabs over one hospital.
//
//   จำลอง 3D          the isometric simulator — the whole of version 2, untouched
//   วิเคราะห์คิว       Erlang-C / M-G-c against the same day, with the controls that change both
//   บริการ/ฝ่าย        every service in the hospital, and which of them this model queues for
//   Workflow          the swimlane sheets
//
// The shell owns exactly two things: which tab is showing, and the single `cfg` object the simulator runs on. When a
// page edits that object the shell re-runs the day (~100 ms for 630 patients) and hands the new recording to the 3D,
// which keeps the clock where it was. That is why editing the number of consultation rooms on the analysis tab and
// then switching back to the 3D shows the same hospital, at the same minute, with the change already in it — rather
// than two views of two different hospitals, which is what a second copy of the config would have given.
import {hhmm} from './model.js';
import {createPages} from './pages.js';
import {PROFILES, matchesProfile, totalPerDay} from './profiles.js';

const TABS = [
  {key: 'sim', label: 'จำลอง 3D &amp; เส้นทางบริการ'},
  {key: 'queue', label: 'วิเคราะห์คิว &amp; คอขวด'},
  {key: 'catalog', label: 'บริการ / ฝ่ายทั้งหมด'},
  {key: 'workflow', label: 'Workflow (Swimlane)'},
];

/**
 * Build the shell around the existing `#app` stage. Call `attach(sim)` once the simulator is running.
 * @param cfg the live config object, shared with the simulator
 */
export function createShell({cfg}) {
  const app = document.getElementById('app');
  const shell = document.createElement('div');
  shell.className = 'sh';
  shell.innerHTML = `
    <header class="sh-bar">
      <div class="sh-brand"><i></i><span>Meridian General<small>HOSPITAL OPERATIONS</small></span></div>
      <nav class="sh-tabs">${TABS.map((t, i) => `<button class="sh-tab${i ? '' : ' on'}" data-tab="${t.key}">${t.label}</button>`).join('')}</nav>
      <div class="sh-state" data-k="state"></div>
    </header>
    <div class="sh-body" data-k="body"></div>`;
  document.body.appendChild(shell);

  const body = shell.querySelector('[data-k="body"]');
  const stateEl = shell.querySelector('[data-k="state"]');
  const simPage = document.createElement('section');
  simPage.className = 'sh-page on';
  simPage.dataset.page = 'sim';
  body.appendChild(simPage);
  simPage.appendChild(app); // the 3D keeps its own fixed 1600x900 stage, now inside the tab

  const pagesHost = document.createElement('div');
  pagesHost.className = 'sh-pages';
  body.appendChild(pagesHost);

  let sim = null;
  let tab = 'sim';
  let pages = null;
  let busy = false;

  const setState = (msg) => {
    const prof = PROFILES.find((p) => matchesProfile(cfg, p.key));
    stateEl.innerHTML = `${msg ? `<em class="sh-busy">${msg}</em>` : ''}
      <span><u>โปรไฟล์</u><b>${prof ? prof.name : 'กำหนดเอง'}</b></span>
      <span><u>ผู้ป่วย/วัน</u><b>${Math.round(totalPerDay(cfg))}</b></span>
      <span><u>seed</u><b>${cfg.seed ?? 20261119}</b></span>`;
  };

  const show = (k) => {
    tab = k;
    for (const b of shell.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === k);
    simPage.classList.toggle('on', k === 'sim');
    for (const p of pagesHost.querySelectorAll('.sh-page')) p.classList.toggle('on', p.dataset.page === k);
    // the 3D costs 3,500 draw calls a frame: it stops entirely while another tab is in front
    sim?.setVisible(k === 'sim');
    if (k !== 'sim') pages?.render();
  };

  shell.querySelector('.sh-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) show(b.dataset.tab);
  });

  /**
   * Re-run the day on the edited config. Synchronous and about 100 ms, so there is no spinner to manage — but the
   * label is set before the work and cleared after, so a slow machine still says what it is doing.
   */
  const rerun = () => {
    if (!sim || busy) return;
    busy = true;
    setState('คำนวณวันใหม่…');
    try {
      sim.rerun();
    } finally {
      busy = false;
      setState('');
    }
  };

  return {
    show,
    get tab() {
      return tab;
    },
    attach(s) {
      sim = s;
      pages = createPages({
        host: pagesHost,
        cfg,
        getDay: () => sim.getDay(),
        rerun,
        focusUnit: (key) => {
          show('sim');
          sim.focusUnit(key);
        },
      });
      pages.render();
      setState('');
      addEventListener('keydown', (e) => {
        if (e.target.matches('input, select, textarea')) return;
        const i = ['q', 'w', 'e', 'r'].indexOf(e.key);
        if (i >= 0) {
          show(TABS[i].key);
          e.preventDefault();
        }
      });
    },
    setClock(t) {
      if (tab === 'sim') return; // the 3D has its own clock on screen
      void hhmm(t);
    },
  };
}
