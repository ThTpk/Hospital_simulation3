#!/usr/bin/env node
// Build the simulator into a single self-contained index.html for GitHub Pages.
//
//   node build.mjs            build index.html
//   node build.mjs --bench    also build the three model benches (sim/bench-*)
//
// The heavy lifting is the simulator skill's bundler: it inlines three.js, the fonts and the CSS into one HTML file
// that opens from file:// and needs no server, which is exactly what Pages wants. Point SIMULATOR_SKILL at the
// skill if it lives somewhere other than ~/.claude/skills/simulator.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// fileURLToPath, not url.pathname: on Windows the latter keeps the %20 of a path with a space in it
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = process.env.SIMULATOR_SKILL || path.join(os.homedir(), '.claude', 'skills', 'simulator');
const BUILD = path.join(SKILL, 'sims', 'build.mjs');

if (!fs.existsSync(BUILD)) {
  console.error(`Cannot find the simulator skill's bundler at:\n  ${BUILD}\n`);
  console.error('Install the simulator skill, or set SIMULATOR_SKILL to where it lives.');
  process.exit(1);
}

const entries = ['./sim/hospital-app'];
if (process.argv.includes('--bench')) {
  for (const d of fs.readdirSync(path.join(HERE, 'sim'))) {
    if (d.startsWith('bench-') && fs.existsSync(path.join(HERE, 'sim', d, 'main.js'))) entries.push(`./sim/${d}`);
  }
}

for (const e of entries) {
  process.stdout.write(`building ${e} … `);
  execFileSync(process.execPath, [BUILD, e], {cwd: HERE, stdio: 'inherit'});
}

// the page itself becomes index.html at the repo root, which is what GitHub Pages serves
const built = path.join(HERE, 'simulator-out', 'dist', 'hospital-app.html');
if (!fs.existsSync(built)) {
  console.error(`\nThe bundler reported success but ${built} is missing.`);
  process.exit(1);
}
const out = path.join(HERE, 'index.html');
fs.copyFileSync(built, out);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`\nindex.html  ${kb} KB  — open it directly, or commit and let GitHub Pages serve it.`);
if (Number(kb) > 16000) console.warn('WARNING: over 16 MB. Pages will serve it, but it is too heavy for a landing page.');
