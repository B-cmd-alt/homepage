// Headless check of what the background's sparks learn (script.js). It prints numbers; it does not judge them.
//
//   node tools/check-sparks.js                  five seeds, five simulated minutes each (about three minutes)
//   node tools/check-sparks.js --minutes 3 --seeds 1,2
//
// script.js runs unchanged, on a fake page with a seeded Math.random and a clock this file advances.
// The fixed rules replace the sparks' choices and switch learning off, so the learned behaviour has
// something to be compared with. Brightness is the sparks' average energy: what a visitor sees.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
}
const SEEDS = String(arg('seeds', '101,102,103,104,105')).split(',').map(Number);
const MINUTES = Number(arg('minutes', 5));
const WIDTH = Number(arg('width', 1440)), HEIGHT = Number(arg('height', 900));
const FPS = 60;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A page with nothing on it but the canvas, whose drawing calls do nothing.
function page(seed) {
  let now = 0, frame = null;
  const nothing = new Proxy(function () {}, { get: () => nothing, apply: () => nothing, set: () => true });
  const canvas = { getContext: () => nothing, style: {}, width: 0, height: 0 };
  const sandbox = {
    console: { log() {} },
    performance: { now: () => now },
    navigator: { userAgent: 'node' },
    document: { readyState: 'complete', getElementById: () => canvas, addEventListener() {} },
    requestAnimationFrame: (f) => { frame = f; },
    innerWidth: WIDTH, innerHeight: HEIGHT, devicePixelRatio: 1,
    addEventListener() {}, matchMedia: () => ({ matches: false }),
    __random: mulberry32(seed),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext('Math.random = __random;', sandbox);
  vm.runInContext(SOURCE, sandbox);
  const system = sandbox.__sparks;
  system.draw = () => {};      // nothing to draw on
  return { system, step() { now += 1000 / FPS; const f = frame; frame = null; f(now); } };
}

// rule: null (learn), or function (alone) -> 0 drift | 1 approach
function run(seed, rule) {
  const { system, step } = page(seed);
  const choose = system.choose.bind(system);
  const chosen = [[0, 0], [0, 0]];
  system.choose = (situation) => {
    const a = rule ? rule(situation === 1) : choose(situation);
    chosen[situation][a]++;
    return a;
  };
  if (rule) system.learn = () => {};

  const frames = MINUTES * 60 * FPS, perWindow = 10 * FPS;
  const windows = [];
  let energy = 0, company = 0, count = 0, was = [[0, 0], [0, 0]];
  let energyAll = 0, companyAll = 0, countAll = 0;
  for (let i = 0; i < frames; i++) {
    step();
    for (const s of system.sparks) { energy += s.energy; company += s.inCompany ? 1 : 0; count++; }
    if ((i + 1) % perWindow === 0) {
      const made = chosen.map((row, k) => row.map((x, a) => x - was[k][a]));
      was = chosen.map((row) => row.slice());
      windows.push({ brightness: energy / count, inCompany: company / count,
        approachInCompany: made[0][1] / Math.max(1, made[0][0] + made[0][1]),
        approachAlone: made[1][1] / Math.max(1, made[1][0] + made[1][1]) });
      if (i >= frames / 2) { energyAll += energy; companyAll += company; countAll += count; }
      energy = 0; company = 0; count = 0;
    }
  }
  const half = windows.slice(windows.length / 2);
  const avg = (k) => half.reduce((a, w) => a + w[k], 0) / half.length;
  return { brightness: energyAll / countAll, inCompany: companyAll / countAll,
    approachInCompany: avg('approachInCompany'), approachAlone: avg('approachAlone'),
    sparks: system.sparks.length, q: system.q.map((row) => row.slice()), windows };
}

const RULES = {
  'learning (as on the page)':        null,
  'fixed: never approach':            () => 0,
  'fixed: random':                    null,   // filled in per seed below
  'fixed: always approach':           () => 1,
  'fixed: approach only when alone':  (alone) => (alone ? 1 : 0),
  'fixed: approach only in company':  (alone) => (alone ? 0 : 1),
};
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

function table() {
  const out = {};
  for (const name of Object.keys(RULES)) {
    const rs = SEEDS.map((seed) => {
      const coin = mulberry32(seed + 9999);
      return run(seed, name === 'fixed: random' ? () => (coin() < 0.5 ? 1 : 0) : RULES[name]);
    });
    out[name] = rs;
    const b = rs.map((r) => r.brightness);
    console.log(name.padEnd(34), `${mean(b).toFixed(3)} (${sd(b).toFixed(3)})`.padEnd(15),
      mean(rs.map((r) => r.inCompany)).toFixed(2).padEnd(11),
      `${mean(rs.map((r) => r.approachInCompany)).toFixed(2)} / ${mean(rs.map((r) => r.approachAlone)).toFixed(2)}`);
  }
  return out;
}

if (require.main === module) {
  console.log(`seeds ${SEEDS.join(',')} · ${MINUTES} simulated minutes each on ${WIDTH} × ${HEIGHT} · measured over the second half\n`);
  console.log('rule'.padEnd(34), 'brightness (sd)'.padEnd(15), 'in company'.padEnd(11), 'approach: in company / alone');
  const out = table();
  const learned = out['learning (as on the page)'];
  console.log('\nlearning, from an empty table, by 10 s (average of the seeds):');
  const show = (k) => learned[0].windows.slice(0, 12).map((_, i) => mean(learned.map((r) => r.windows[i][k])).toFixed(2)).join(' ');
  console.log('  approach when alone   ', show('approachAlone'));
  console.log('  approach in company   ', show('approachInCompany'));
  console.log('  brightness            ', show('brightness'));
  console.log('\nthe table at the end, per seed: [in company: drift, approach] [alone: drift, approach]');
  for (const r of learned) console.log('  ' + r.q.map((row) => '[' + row.map((x) => x.toFixed(3)).join(', ') + ']').join(' '));
}

module.exports = { run, page };
