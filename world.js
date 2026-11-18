/**
 * The world behind the background: a small society of light.
 *
 * Pure simulation, no drawing and no DOM, so the page and the headless runner (sim/run.js) execute
 * the same code. All randomness comes from one seeded generator and time only advances through
 * step(dt): the same seed gives the same history.
 *
 * Nature (fixed):
 *   - A point loses a share of its light every second, so a brighter light burns faster.
 *     With another lit point within reach it loses several times less.
 *   - Light flows only from a brighter point to a dimmer one, and only when the brighter one gives.
 *   - A point is born at a random place. It copies the notebook of the nearest point it can see,
 *     with small changes, or starts empty if it sees nobody.
 *   - Points keep a minimum distance, and births stop at a cap.
 *
 * Learned (two rules, each a 2 × 2 Q-table, updated by Q-learning from the point's own life):
 *   - chasing: when it sees a light, drift or approach.        Situations: in company / alone.
 *   - giving:  when a dimmer one is in reach, keep or give.    Situations: my light is fine / low.
 * A choice is kept for a few seconds and judged when the next one is made. The reward is how
 * fast light is being lost, as a share: the point's own light ('self'), or its own together with
 * the light within its reach ('near').
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightWorld = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    width: 1440, height: 900,
    cap: 28,                 // births stop at this many points
    birthEvery: 1.6,         // seconds between births while under the cap
    birthLight: [0.3, 1.0],  // a newborn's light, uniform in this range

    sight: 320,              // px: how far a point sees
    reach: 72,               // px: close enough to be company and to pass light
    spacing: 30,             // px: minimum distance between points

    fadeAlone: 0.14,         // share of its light a point loses per second with nobody in reach
    fadeCompany: 0.03,       // ... with company
    giveRate: 0.08,          // light passed per second while giving
    dark: 0.04,              // at or below this a point goes out
    low: 0.15,               // below this a point's light counts as "low"

    approachSpeed: 22,       // px per second
    driftSpeed: 5,

    lookEvery: 0.5,          // seconds between a point's looks around
    hold: 3,                 // seconds a choice is kept before the point chooses again
    alpha: 0.2,              // learning rate
    gamma: 0.97,             // discount per second
    explore: 0.06,           // chance of trying a random choice
    copyNoise: 0.01,         // size of the small changes when a notebook is copied
    copyTrust: 12,           // a copied entry counts as this many own experiences at most

    reward: 'near',          // 'self' or 'near' (see the header)
    learn: true,             // Q-learning within a life
    copy: true,              // newborns copy the nearest notebook
    policy: null,            // fixed behaviour for baselines: function (rule, second, rng) -> 0 or 1,
                             // where `second` is true in the rule's second situation (alone / low)
    seed: 1,
  };

  // Notebook layout: [chasing: company-drift, company-approach, alone-drift, alone-approach,
  //                   giving:  fine-keep,     fine-give,        low-keep,    low-give]
  var CHASE = 0, GIVE = 4;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function World(options) {
    var c = {};
    for (var k in DEFAULTS) c[k] = options && options[k] !== undefined ? options[k] : DEFAULTS[k];
    this.cfg = c;
    this.rng = mulberry32(c.seed);
    this.time = 0;
    this.points = [];
    this.nextId = 1;
    this.birthClock = 0;
    this.flows = [];                     // light passed this step: { from, to, amount }
    this.events = [];                    // births and deaths this step
    this.deaths = 0;
    this.lifeSum = 0;                    // total lifetime of the points that have gone out
    this.chosen = new Float64Array(8);   // how often each choice was actually made, by notebook entry
    // Optional hooks the page uses to keep the points off its text. Unset when run headless.
    this.keepOut = null;                 // function (x, y) -> true where points should not be born
    this.blocked = null;                 // function (p, o) -> true if p cannot see o
    this.confine = null;                 // function (p, dt): called after p has moved
  }

  World.prototype.gauss = function () {
    var u = 1 - this.rng(), v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // Birth: a random place; copy the nearest notebook in sight, slightly changed, or start empty.
  World.prototype.birth = function (x, y) {
    var c = this.cfg;
    if (x === undefined) {
      for (var tries = 0; tries < 12; tries++) {
        x = 24 + this.rng() * (c.width - 48);
        y = 24 + this.rng() * (c.height - 48);
        if (!this.keepOut || !this.keepOut(x, y)) break;
      }
    }
    var p = {
      id: this.nextId++, x: x, y: y, vx: 0, vy: 0,
      light: c.birthLight[0] + this.rng() * (c.birthLight[1] - c.birthLight[0]),
      age: 0, generation: 0, parent: null,       // parent: the point whose notebook it copied
      q: new Float64Array(8),          // the notebook
      n: new Uint8Array(8),            // how many times each entry has been judged (0 = never tried)
      wander: this.rng() * Math.PI * 2,
      clock: this.rng() * c.lookEvery,
      target: null, receiver: null, company: false, near: 0,
      chase: { s: 0, a: 0, open: false, sum: 0, disc: 1, until: 0 },
      give: { s: 0, a: 0, open: false, sum: 0, disc: 1, until: 0 },
    };
    if (c.copy) {
      var teacher = null, best = c.sight;
      for (var i = 0; i < this.points.length; i++) {
        var o = this.points[i], d = Math.hypot(o.x - x, o.y - y);
        if (d < best) { best = d; teacher = o; }
      }
      if (teacher) {
        for (var k = 0; k < 8; k++) {
          p.q[k] = teacher.q[k] + (teacher.n[k] ? this.gauss() * c.copyNoise : 0);
          p.n[k] = Math.min(teacher.n[k], c.copyTrust);
        }
        p.generation = teacher.generation + 1;
        p.parent = teacher;
      }
    }
    this.points.push(p);
    this.events.push({ type: 'birth', point: p });
    return p;
  };

  // One rule's decision: judge the previous choice (Q-learning), then choose again.
  World.prototype.decide = function (p, rule, base, s) {
    var c = this.cfg, q = p.q, n = p.n, i0 = base + s * 2;
    if (rule.open && c.learn) {
      var i = base + rule.s * 2 + rule.a;
      var future = Math.max(q[i0], q[i0 + 1]);
      if (n[i] < 250) n[i]++;
      // The first experiences count in full; after that, the learning rate.
      q[i] += Math.max(c.alpha, 1 / n[i]) * (rule.sum + rule.disc * future - q[i]);
    }
    var a;
    if (c.policy) a = c.policy(base === CHASE ? 'chase' : 'give', s === 1, this.rng);
    else if (this.rng() < c.explore) a = this.rng() < 0.5 ? 0 : 1;
    else if (!n[i0] !== !n[i0 + 1]) a = n[i0] ? 1 : 0;              // one choice never tried: try it
    else a = q[i0] > q[i0 + 1] ? 0 : q[i0] < q[i0 + 1] ? 1 : (this.rng() < 0.5 ? 0 : 1);
    rule.s = s; rule.a = a; rule.open = true; rule.sum = 0; rule.disc = 1;
    rule.until = this.time + c.hold;
    this.chosen[i0 + a]++;
  };

  World.prototype.look = function (p) {
    var c = this.cfg, pts = this.points;
    var nearest = null, nearestD = c.sight, receiver = null, receiverD = c.reach, company = false;
    for (var i = 0; i < pts.length; i++) {
      var o = pts[i];
      if (o === p) continue;
      var d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < nearestD && !(this.blocked && this.blocked(p, o))) { nearestD = d; nearest = o; }
      if (d < c.reach) {
        company = true;
        if (o.light < p.light && d < receiverD) { receiverD = d; receiver = o; }
      }
    }
    p.target = nearest; p.receiver = receiver; p.company = company;
  };

  World.prototype.step = function (dt) {
    var c = this.cfg, pts = this.points, i, j, p, o;
    this.time += dt;
    this.flows.length = 0;
    this.events.length = 0;

    // Births
    this.birthClock += dt;
    if (this.birthClock >= c.birthEvery) {
      this.birthClock -= c.birthEvery;
      if (pts.length < c.cap) this.birth();
    }

    // Looking and choosing. A choice is kept for `hold` seconds, or until what it was about is gone.
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      p.clock -= dt;
      if (p.clock > 0) continue;
      p.clock += c.lookEvery;
      this.look(p);
      if (!p.target) { p.chase.a = 0; p.chase.until = 0; }
      else if (this.time >= p.chase.until) this.decide(p, p.chase, CHASE, p.company ? 0 : 1);
      if (!p.receiver) { p.give.a = 0; p.give.until = 0; }
      else if (this.time >= p.give.until) this.decide(p, p.give, GIVE, p.light < c.low ? 1 : 0);
    }

    // Movement
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var wx = 0, wy = 0, t = p.target;
      if (p.chase.a === 1 && t && t.light > c.dark) {
        var dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        var want = d > c.spacing * 1.5 ? c.approachSpeed : 0;
        wx = dx / d * want; wy = dy / d * want;
      } else {
        p.wander += this.gauss() * 0.6 * dt;
        wx = Math.cos(p.wander) * c.driftSpeed; wy = Math.sin(p.wander) * c.driftSpeed;
      }
      for (j = 0; j < pts.length; j++) {              // keep a minimum distance
        o = pts[j];
        if (o === p) continue;
        var ox = p.x - o.x, oy = p.y - o.y, od = Math.hypot(ox, oy);
        if (od < c.spacing && od > 0.01) {
          var push = (c.spacing - od) / c.spacing * 40;
          wx += ox / od * push; wy += oy / od * push;
        }
      }
      p.vx += (wx - p.vx) * Math.min(1, 2.5 * dt);
      p.vy += (wy - p.vy) * Math.min(1, 2.5 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
      var m = 16;                                     // stay on the page
      if (p.x < m) { p.x = m; p.wander = Math.PI - p.wander; }
      if (p.x > c.width - m) { p.x = c.width - m; p.wander = Math.PI - p.wander; }
      if (p.y < m) { p.y = m; p.wander = -p.wander; }
      if (p.y > c.height - m) { p.y = c.height - m; p.wander = -p.wander; }
      if (this.confine) this.confine(p, dt);
    }

    // Light. Changes are collected first so the order of the points does not matter.
    var count = pts.length;
    var delta = new Float64Array(count), nearDelta = new Float64Array(count);
    var pairsA = [], pairsB = [];
    for (i = 0; i < count; i++) { pts[i].index = i; pts[i].near = 0; }
    for (i = 0; i < count; i++) {
      for (j = i + 1; j < count; j++) {
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < c.reach) {
          pts[i].near += pts[j].light; pts[j].near += pts[i].light;
          pairsA.push(i); pairsB.push(j);
        }
      }
    }
    for (i = 0; i < count; i++) {
      p = pts[i];
      delta[i] -= (p.near > 0 ? c.fadeCompany : c.fadeAlone) * p.light * dt;
    }
    for (i = 0; i < count; i++) {
      p = pts[i];
      var r = p.receiver;
      if (p.give.a !== 1 || !r || r.light <= c.dark || r.light >= p.light) continue;
      if (Math.hypot(r.x - p.x, r.y - p.y) > c.reach * 1.15) continue;
      var amount = Math.min(c.giveRate * dt, (p.light - r.light) / 2);
      delta[i] -= amount; delta[r.index] += amount;
      this.flows.push({ from: p, to: r, amount: amount });
    }
    for (i = 0; i < pairsA.length; i++) {
      nearDelta[pairsA[i]] += delta[pairsB[i]]; nearDelta[pairsB[i]] += delta[pairsA[i]];
    }
    var discount = Math.pow(c.gamma, dt);
    for (i = 0; i < count; i++) {
      p = pts[i];
      var reward = c.reward === 'near' ? (delta[i] + nearDelta[i]) / (p.light + p.near) : delta[i] / p.light;
      p.light = Math.min(1, p.light + delta[i]);
      p.age += dt;
      p.chase.sum += p.chase.disc * reward; p.chase.disc *= discount;
      p.give.sum += p.give.disc * reward; p.give.disc *= discount;
    }

    // Going out
    for (i = pts.length - 1; i >= 0; i--) {
      p = pts[i];
      if (p.light > c.dark) continue;
      pts.splice(i, 1);
      this.deaths++; this.lifeSum += p.age;
      this.events.push({ type: 'death', point: p });
    }
  };

  // What the society currently believes: per notebook entry pair, the share of points that prefer
  // the active choice (approach, give); a point that has not tried both counts as undecided (0.5).
  World.prototype.beliefs = function () {
    var pts = this.points, count = pts.length || 1;
    var out = { approachCompany: 0, approachAlone: 0, giveFine: 0, giveLow: 0, generation: 0 };
    var keys = ['approachCompany', 'approachAlone', 'giveFine', 'giveLow'];
    for (var i = 0; i < pts.length; i++) {
      for (var k = 0; k < 4; k++) out[keys[k]] += World.prefers(pts[i], k * 2);
      out.generation += pts[i].generation;
    }
    for (var key in out) out[key] /= count;
    out.alive = pts.length;
    return out;
  };

  // 1 if the point's notebook prefers the active choice of the pair starting at `entry`, 0 if the
  // passive one, 0.5 if it has not tried both.
  World.prefers = function (p, entry) {
    if (!p.n[entry] || !p.n[entry + 1]) return 0.5;
    return p.q[entry + 1] > p.q[entry] ? 1 : p.q[entry + 1] < p.q[entry] ? 0 : 0.5;
  };

  // How strongly one point prefers giving when its light is fine, from 0 (keeps) to 1 (gives).
  World.generosity = function (p) {
    if (!p.n[4] || !p.n[5]) return 0.5;
    return 1 / (1 + Math.exp(-(p.q[5] - p.q[4]) * 30));
  };

  // A population saved from one run can start another.
  World.prototype.save = function () {
    return this.points.map(function (p) {
      return {
        q: Array.prototype.map.call(p.q, function (v) { return +v.toFixed(4); }),
        n: Array.prototype.slice.call(p.n),
        generation: p.generation,
      };
    });
  };
  World.prototype.load = function (saved) {
    for (var i = 0; i < saved.length && this.points.length < this.cfg.cap; i++) {
      var p = this.birth();
      p.q.set(saved[i].q); p.n.set(saved[i].n);
      p.generation = saved[i].generation;
    }
  };

  World.DEFAULTS = DEFAULTS;
  return World;
});
