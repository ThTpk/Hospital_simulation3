// Meridian General — a hospital you can watch work, and then argue with.
//
// Four tabs over one model: the isometric simulator, the queue analysis, the service catalogue and the swimlanes.
// All four read ONE config object and ONE recorded day, so a change made on any of them is a change to all of them.
// See docs/SPEC.md for what is modelled and what is deliberately not.
import {runHospitalApp} from '../shared/app.js';
import {createShell} from '../shared/shell.js';

const boot = document.createElement('div');
boot.id = 'boot';
boot.innerHTML = '<div><b>Meridian General</b><s>Simulating one working day…</s><i></i></div>';
document.body.appendChild(boot);

/**
 * The config every part of the product shares. `runDay` honours each key, the analysis page edits them in place,
 * and the shell re-runs the day when they change. There is no second copy anywhere.
 */
const cfg = {
  seed: 20261119,
  servers: {}, // per unit: slots
  svc: {}, // per unit: mean service time, minutes
  dist: {}, // per unit: service-time distribution
  scale: {}, // per arrival lane: volume multiplier
  hourK: null, // 24 hourly multipliers
  flatBooking: 0, // 0 = every appointment in the morning, 1 = spread across the session
  orderK: 1,
  orders: {}, // per test: how freely it is ordered
  breaks: true,
  balking: true,
  profile: 'base',
};

const shell = createShell({cfg});

runHospitalApp({cfg})
  .then((sim) => {
    shell.attach(sim);
    // A timer, not requestAnimationFrame. Waiting for a real frame reads better, but a browser suspends rAF in a
    // background tab — so anyone who opens this in a tab they are not looking at would come back to a loading card
    // that never goes away, with the simulator running perfectly behind it.
    setTimeout(() => {
      boot.classList.add('gone');
      setTimeout(() => boot.remove(), 420);
    }, 120);
  })
  .catch((e) => {
    boot.innerHTML = `<div><b>The simulator failed to start</b><s>${String(e && e.message ? e.message : e)}</s></div>`;
    throw e;
  });
