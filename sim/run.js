// Headless runner for world.js. An instrument: it prints numbers, it does not judge them.
//
//   node sim/run.js                          the full comparison, written to sim/report.json
//   node sim/run.js --seeds 1,2 --hours 1    a quicker look (does not write the report)
//
// Seeds 1-3 were used while tuning the world. The default seeds, 101-105, were not.
// Each run is `hours` of simulated time; the first third is warm-up and is not measured.
'use strict';
const fs = require('fs');
const path = require('path');
const World = require('../world.js');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
}
const DEFAULT_SEEDS = '101,102,103,104,105';
const SEEDS = String(arg('seeds', DEFAULT_SEEDS)).split(',').map(Number);
const HOURS = Number(arg('hours', 3));
const DT = 1 / 20;

// policy(rule, second, rng): `second` is true when alone (chasing) or when light is low (giving)
const approach = (give) => (rule, second, rng) => (rule === 'chase' ? 1 : give(second, rng));
const VARIANTS = {
  'learning + copying (the page)':                    {},
  'copying only (no learning in life)':               { learn: false },
  'learning only (no copying)':                       { copy: false },
  'born alone starts empty (earlier rule)':           { copyFar: false },
  'reward: own + nearby light, pooled (earlier)':     { reward: 'near' },
  'reward: own light only':                           { reward: 'self' },
  'baseline: random choices':                         { learn: false, copy: false, policy: (rule, second, rng) => (rng() < 0.5 ? 1 : 0) },
  'baseline: never approach':                         { learn: false, copy: false, policy: () => 0 },
  'baseline: approach, never give':                   { learn: false, copy: false, policy: approach(() => 0) },
  'baseline: approach, always give':                  { learn: false, copy: false, policy: approach(() => 1) },
  'baseline: approach, give when light is fine':      { learn: false, copy: false, policy: approach((low) => (low ? 0 : 1)) },
};

function run(options, seed, hours) {
  const w = new World(Object.assign({}, options, { seed }));
  const steps = Math.round(hours * 3600 / DT), warm = Math.round(steps / 3);
  let deaths0 = 0, life0 = 0, chosen0 = null, aliveSum = 0, generation = 0, samples = 0;
  for (let i = 0; i < steps; i++) {
    w.step(DT);
    if (i === warm) { deaths0 = w.deaths; life0 = w.lifeSum; chosen0 = Float64Array.from(w.chosen); }
    if (i > warm && i % 200 === 0) { aliveSum += w.points.length; generation = w.beliefs().generation; samples++; }
  }
  const c = w.chosen.map((x, k) => x - chosen0[k]);
  const share = (k) => c[k + 1] / Math.max(1, c[k] + c[k + 1]);
  return {
    seed,
    lifetime: (w.lifeSum - life0) / (w.deaths - deaths0),
    alive: aliveSum / samples,
    generation,
    // shares of the choices actually made
    approachInCompany: share(0), approachAlone: share(2), giveWhenFine: share(4), giveWhenLow: share(6),
    world: w,
  };
}

const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const r2 = (x) => Math.round(x * 100) / 100;

if (require.main === module) {
  console.log(`seeds ${SEEDS.join(',')} · ${HOURS} simulated hours each · measured after the first third\n`);
  console.log('variant'.padEnd(50), 'lifetime s (sd)'.padEnd(17), 'worst'.padEnd(7), 'approach company/alone'.padEnd(24), 'give fine/low');
  const report = { seeds: SEEDS, hours: HOURS, dt: DT, config: World.DEFAULTS, variants: {} };
  for (const [name, options] of Object.entries(VARIANTS)) {
    const rs = SEEDS.map((s) => run(options, s, HOURS));
    const life = rs.map((r) => r.lifetime);
    const avg = (k) => mean(rs.map((r) => r[k]));
    console.log(name.padEnd(50), `${mean(life).toFixed(1)} (${sd(life).toFixed(1)})`.padEnd(17), Math.min(...life).toFixed(1).padEnd(7),
      `${avg('approachInCompany').toFixed(2)} / ${avg('approachAlone').toFixed(2)}`.padEnd(24), `${avg('giveWhenFine').toFixed(2)} / ${avg('giveWhenLow').toFixed(2)}`);
    report.variants[name] = {
      lifetimeMean: r2(mean(life)), lifetimeSd: r2(sd(life)), lifetimeBySeed: life.map(r2), alive: r2(avg('alive')), generation: r2(avg('generation')),
      approachInCompany: r2(avg('approachInCompany')), approachAlone: r2(avg('approachAlone')), giveWhenFine: r2(avg('giveWhenFine')), giveWhenLow: r2(avg('giveWhenLow')),
    };
  }
  if (SEEDS.join(',') === DEFAULT_SEEDS) {
    fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('\nwrote sim/report.json');
  }
}

module.exports = { run, VARIANTS };
