/**
 * The background of every page: draws the society of light simulated by world.js.
 *
 * What is on screen:
 *   - A point's size and glow are its light. Its colour is how much its notebook prefers giving:
 *     gold gives, terracotta is undecided, purple keeps.
 *   - A faint line joins points that are within reach of each other (company).
 *   - A brighter line with moving pulses is light being given, in the direction it flows.
 *   - A ring is a birth; a point that goes out shrinks and fades.
 * Nothing is written in the field. On the home page a small panel in the corner shows what the
 * society currently believes, and its "?" explains the scene.
 *
 * Points keep to the space the page's text leaves free. Where the text leaves no room (a phone, a
 * narrow window on a long page) the field runs behind the text, dimmed.
 */
(() => {
  'use strict';

  const GOLD = [235, 170, 60], TERRACOTTA = [210, 100, 60], PURPLE = [150, 110, 190];
  const MAX_DPR = 2;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const toLinear = (c) => Math.pow(c / 255, 2.2);
  const toSRGB = (c) => Math.round(Math.pow(clamp(c, 0, 1), 1 / 2.2) * 255);
  const mix = (a, b, t) => [0, 1, 2].map((k) => toSRGB(lerp(toLinear(a[k]), toLinear(b[k]), t)));
  const css = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

  // Generosity 0..1 -> purple .. terracotta .. gold
  const colourOf = (g) => (g < 0.5 ? mix(PURPLE, TERRACOTTA, g * 2) : mix(TERRACOTTA, GOLD, (g - 0.5) * 2));

  class Field {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.avoid = [];
      this.quiet = false;
      this.dim = 1;
      this.links = new Map();      // giving in progress, keyed by the two ids
      this.pulses = [];
      this.ghosts = [];            // points that went out, still fading
      this.lifetime = (window.LIGHT_START && window.LIGHT_START.lifetime) || 0;
      this.panel = canvas.hasAttribute('data-panel') ? buildPanel() : null;

      this.world = new LightWorld({ seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 });
      this.world.keepOut = (x, y) => this.inAvoid(x, y, 12);
      this.world.blocked = (p, o) => this.crossesText(p, o);
      this.world.confine = (p, dt) => this.pushOut(p, dt);

      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.listenForTaps();
    }

    // ----------------------------------------
    // Layout: where the text is, how many points fit
    // ----------------------------------------

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.layout();
    }

    layout() {
      this.measureAvoid();
      const cfg = this.world.cfg;
      cfg.width = this.width;
      cfg.height = this.height;
      const small = this.width < 700;
      const area = (this.width * this.height) / (1440 * 900);
      const room = clamp(this.freeShare / 0.7, 0.6, 1);
      cfg.cap = Math.round(clamp(28 * area * room, small ? 10 : 14, 32));
      cfg.sight = small ? 240 : 320;
      this.dim = this.quiet ? 0.45 : 1;
    }

    measureAvoid() {
      this.avoid = [];
      const union = (els, padX, padY) => {
        let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        for (const el of els) {
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height) continue;
          l = Math.min(l, box.left); t = Math.min(t, box.top);
          r = Math.max(r, box.right); b = Math.max(b, box.bottom);
        }
        if (r > l) this.avoid.push({ l: l - padX, t: t - padY, r: r + padX, b: b + padY });
      };
      // A centred block (home, the single-screen pages): the box around what is in it
      for (const host of document.querySelectorAll('.content, .page-hero')) union(host.children, 30, 26);
      // A reading column (projects, experience, blog): the full height of the screen, because it scrolls
      for (const column of document.querySelectorAll('.page')) {
        const box = column.getBoundingClientRect();
        if (box.width) this.avoid.push({ l: box.left - 8, t: -1e6, r: box.right + 8, b: 1e6 });
      }
      union(document.querySelectorAll('.back-link'), 16, 12);
      if (this.panel) union([this.panel], 14, 12);

      // How much of the screen is left. Too little: run behind the text instead, dimmed.
      let free = 0, total = 0;
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 12; j++) {
          total++;
          if (!this.inAvoid((i + 0.5) * this.width / 16, (j + 0.5) * this.height / 12, 12)) free++;
        }
      }
      this.freeShare = free / total;
      this.quiet = this.freeShare < 0.2;
      if (this.quiet) { this.avoid = []; this.freeShare = 1; }
    }

    inAvoid(x, y, pad) {
      for (const a of this.avoid) {
        if (x > a.l - pad && x < a.r + pad && y > a.t - pad && y < a.b + pad) return true;
      }
      return false;
    }

    // Does the straight line from p to o pass through text? Then p does not chase o across it.
    crossesText(p, o) {
      for (const a of this.avoid) {
        let t0 = 0, t1 = 1;
        const dx = o.x - p.x, dy = o.y - p.y;
        const edges = [[-dx, p.x - a.l], [dx, a.r - p.x], [-dy, p.y - a.t], [dy, a.b - p.y]];
        let hit = true;
        for (const [d, q] of edges) {
          if (d === 0) { if (q < 0) { hit = false; break; } continue; }
          const t = q / d;
          if (d < 0) { if (t > t1) { hit = false; break; } if (t > t0) t0 = t; }
          else { if (t < t0) { hit = false; break; } if (t < t1) t1 = t; }
        }
        if (hit && t0 < t1) return true;
      }
      return false;
    }

    // A point that has wandered onto text is eased out by the nearest edge.
    pushOut(p, dt) {
      for (const a of this.avoid) {
        const pad = 6;
        if (p.x <= a.l - pad || p.x >= a.r + pad || p.y <= a.t - pad || p.y >= a.b + pad) continue;
        const exits = [
          [p.x - (a.l - pad), -1, 0], [(a.r + pad) - p.x, 1, 0],
          [p.y - (a.t - pad), 0, -1], [(a.b + pad) - p.y, 0, 1],
        ].filter((e) => isFinite(e[0])).sort((m, n) => m[0] - n[0]);
        const [, ex, ey] = exits[0];
        p.x += ex * 60 * dt; p.y += ey * 60 * dt;
        if (ex) p.vx = 0; else p.vy = 0;
      }
    }

    // ----------------------------------------
    // A tap adds a light
    // ----------------------------------------

    listenForTaps() {
      let downX = 0, downY = 0, downId = null;
      document.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) { downId = null; return; }
        downX = e.clientX; downY = e.clientY; downId = e.pointerId;
      });
      document.addEventListener('pointerup', (e) => {
        if (downId !== e.pointerId) return;
        downId = null;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;         // a drag, not a tap
        if (e.target.closest && e.target.closest('a, button, .society-panel, .society-card')) return;
        const selection = window.getSelection && window.getSelection();
        if (selection && selection.toString().length) return;
        if (this.inAvoid(e.clientX, e.clientY, 0)) return;
        if (this.world.points.length < this.world.cfg.cap + 8) this.world.birth(e.clientX, e.clientY);
      });
    }

    // ----------------------------------------
    // Stepping: the world, plus what only the drawing needs
    // ----------------------------------------

    step(dt) {
      const world = this.world;
      world.step(dt);

      for (const ev of world.events) {
        if (ev.type === 'birth') { ev.point.seen = 0; ev.point.pop = 1; }
        else {
          const p = ev.point;
          this.ghosts.push({ x: p.x, y: p.y, colour: p.colour || TERRACOTTA, radius: this.radius(p), fade: (p.seen || 0) });
          this.lifetime = this.lifetime ? this.lifetime * 0.96 + p.age * 0.04 : p.age;
        }
      }
      for (const p of world.points) {
        p.seen = Math.min(1, (p.seen || 0) + dt / 0.9);
        p.pop = Math.max(0, (p.pop || 0) - dt / 0.9);
        const g = LightWorld.generosity(p);
        p.shown = p.shown === undefined ? g : p.shown + (g - p.shown) * Math.min(1, dt * 1.5);
        p.colour = colourOf(p.shown);
      }
      for (const g of this.ghosts) g.fade -= dt / 1.3;
      this.ghosts = this.ghosts.filter((g) => g.fade > 0);

      // Giving: a link while light flows, and pulses along it
      const active = new Set();
      for (const f of world.flows) {
        const key = f.from.id + '>' + f.to.id;
        active.add(key);
        let link = this.links.get(key);
        if (!link) { link = { from: f.from, to: f.to, strength: 0, clock: 0 }; this.links.set(key, link); }
        link.strength = Math.min(1, link.strength + dt * 2.5);
        link.clock -= dt;
        if (link.clock <= 0) {
          link.clock = 0.42;
          this.pulses.push({ from: f.from, to: f.to, t: 0 });
        }
      }
      for (const [key, link] of this.links) {
        if (!active.has(key)) link.strength -= dt * 1.8;
        if (link.strength <= 0 || link.from.light <= world.cfg.dark || link.to.light <= world.cfg.dark) this.links.delete(key);
      }
      for (const pulse of this.pulses) pulse.t += dt / 0.95;
      this.pulses = this.pulses.filter((q) => q.t < 1 && q.from.light > world.cfg.dark && q.to.light > world.cfg.dark);
    }

    radius(p) {
      return (2.3 + 6.4 * Math.sqrt(clamp(p.light, 0, 1))) * (p.seen === undefined ? 1 : p.seen);
    }

    // ----------------------------------------
    // Drawing
    // ----------------------------------------

    draw() {
      const ctx = this.ctx, world = this.world, pts = world.points;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.lineCap = 'round';

      // Company: a faint line between points within reach
      const reach = world.cfg.reach;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d >= reach) continue;
          const alpha = 0.2 * (1 - d / reach * 0.6) * Math.min(a.seen, b.seen) * this.dim;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = css(mix(a.colour, b.colour, 0.5), alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Giving: a line, and pulses moving the way the light flows
      for (const link of this.links.values()) {
        const colour = mix(link.from.colour, link.to.colour, 0.4);
        const alpha = 0.5 * link.strength * this.dim;
        ctx.beginPath();
        ctx.moveTo(link.from.x, link.from.y);
        ctx.lineTo(link.to.x, link.to.y);
        ctx.strokeStyle = css(colour, alpha * 0.35);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(link.from.x, link.from.y);
        ctx.lineTo(link.to.x, link.to.y);
        ctx.strokeStyle = css(colour, alpha);
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      for (const pulse of this.pulses) {
        const x = lerp(pulse.from.x, pulse.to.x, pulse.t), y = lerp(pulse.from.y, pulse.to.y, pulse.t);
        const alpha = Math.sin(Math.PI * pulse.t) * 0.9 * this.dim;
        ctx.beginPath();
        ctx.arc(x, y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = css(pulse.from.colour, alpha * 0.25);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        ctx.fillStyle = css(pulse.from.colour, alpha);
        ctx.fill();
      }

      for (const g of this.ghosts) this.drawSpark(g.x, g.y, g.radius * g.fade, g.colour, 0.2, g.fade * 0.7);
      for (const p of pts) {
        const shine = Math.sqrt(clamp(p.light, 0, 1));
        this.drawSpark(p.x, p.y, this.radius(p), p.colour, shine, (0.55 + 0.45 * shine) * p.seen);
        if (p.pop > 0.01) {                       // birth
          ctx.beginPath();
          ctx.arc(p.x, p.y, this.radius(p) + 4 + easeOut(1 - p.pop) * 18, 0, Math.PI * 2);
          ctx.strokeStyle = css(p.colour, 0.5 * p.pop);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      if (this.panel) this.panel.update(world, this.lifetime);
    }

    drawSpark(x, y, radius, colour, shine, alpha) {
      if (alpha < 0.01 || radius < 0.4) return;
      const ctx = this.ctx;
      const boost = shine * shine;
      const glowRadius = radius * 5.2 * (0.8 + 0.6 * boost);
      const glow = 0.3 + 0.5 * boost;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
      g.addColorStop(0, css(colour, alpha * glow));
      g.addColorStop(0.2, css(colour, alpha * glow * 0.5));
      g.addColorStop(0.5, css(colour, alpha * glow * 0.15));
      g.addColorStop(1, css(colour, 0));
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = css(colour, alpha * (0.55 + 0.4 * boost));
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.3 + 0.3 * boost), 0, Math.PI * 2);
      ctx.fillStyle = css([255, 255, 255], alpha * (0.5 + 0.5 * boost));
      ctx.fill();
    }

    // ----------------------------------------
    // Running
    // ----------------------------------------

    start() {
      const world = this.world;
      if (window.LIGHT_START) world.load(window.LIGHT_START.points);
      for (let t = 0; t < 30; t += 1 / 20) this.step(1 / 20);      // let the groups form before the first frame
      for (const p of world.points) { p.seen = 1; p.pop = 0; }
      this.ghosts = [];

      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.draw();                                               // no motion wanted: one still frame
        window.addEventListener('resize', () => this.draw());
        return;
      }
      let last = performance.now();
      const frame = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        this.step(dt);
        this.draw();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  // ============================================
  // The corner panel (home page): what the society believes, and the "?" card
  // ============================================

  function buildPanel() {
    const panel = document.createElement('aside');
    panel.className = 'society-panel';
    panel.setAttribute('aria-label', 'What the points have learned');
    panel.innerHTML = `
      <div class="society-head"><span>what they have learned</span><button type="button" class="society-ask" aria-label="What am I looking at?">?</button></div>
      <table>
        <tr><th></th><th>drift</th><th>approach</th></tr>
        <tr><td>in company</td><td><i data-cell="0"></i></td><td><i data-cell="1"></i></td></tr>
        <tr><td>alone</td><td><i data-cell="2"></i></td><td><i data-cell="3"></i></td></tr>
        <tr><th></th><th>keep</th><th>give</th></tr>
        <tr><td>light is fine</td><td><i data-cell="4"></i></td><td><i data-cell="5"></i></td></tr>
        <tr><td>light is low</td><td><i data-cell="6"></i></td><td><i data-cell="7"></i></td></tr>
      </table>
      <div class="society-tally"></div>
      <div class="society-more"></div>`;
    document.body.appendChild(panel);

    const backdrop = document.createElement('div');
    backdrop.className = 'society-backdrop';
    backdrop.hidden = true;
    const card = document.createElement('aside');
    card.className = 'society-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'About the background');
    card.hidden = true;
    card.innerHTML = `
      <button type="button" class="society-close" aria-label="Close">&times;</button>
      <h2>what you're looking at</h2>
      <ul>
        <li><b>points of light</b> &mdash; each one fades all the time. a brighter one burns faster, and one with nobody near burns fastest.</li>
        <li><b>what they learn</b> &mdash; two things, from their own lives: whether to move toward another light, and whether to pass light to a dimmer neighbour. each keeps a tiny notebook (a Q-table) of what worked.</li>
        <li><b>why it is hard</b> &mdash; giving costs light now. the payoff, a neighbour who stays lit beside you, comes later.</li>
        <li><b>inheritance</b> &mdash; a newborn copies the notebook of the nearest light. colour shows it: gold gives, purple keeps.</li>
        <li><b>you</b> &mdash; click or tap anywhere to add a light.</li>
      </ul>`;
    document.body.append(backdrop, card);

    const open = () => { card.hidden = false; backdrop.hidden = false; card.querySelector('.society-close').focus(); };
    const close = () => { card.hidden = true; backdrop.hidden = true; };
    panel.querySelector('.society-ask').addEventListener('click', open);
    card.querySelector('.society-close').addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) close(); });

    const cells = Array.from(panel.querySelectorAll('[data-cell]'));
    const tally = panel.querySelector('.society-tally');
    const more = panel.querySelector('.society-more');
    const baseline = window.LIGHT_START && window.LIGHT_START.withoutLearning;
    let clock = 0;
    panel.update = (world, lifetime) => {
      if (++clock % 20 !== 1) return;                 // a few times a second is plenty
      const b = world.beliefs();
      const share = [1 - b.approachCompany, b.approachCompany, 1 - b.approachAlone, b.approachAlone,
        1 - b.giveFine, b.giveFine, 1 - b.giveLow, b.giveLow];
      cells.forEach((cell, k) => { cell.style.opacity = (0.1 + 0.9 * share[k]).toFixed(2); });
      // The learning rate shown is each point's own step size: 1 for a first experience, then alpha
      const cfg = world.cfg;
      let rate = 0;
      for (const p of world.points) for (let k = 0; k < 8; k++) rate += p.n[k] ? Math.max(cfg.alpha, 1 / p.n[k]) : 1;
      rate /= Math.max(1, world.points.length * 8);
      tally.innerHTML = `${b.alive} alight · average life ${Math.round(lifetime)} s<span class="society-short"> · α ${cfg.alpha}</span>`;
      more.innerHTML = (baseline ? `without learning ${baseline} s<br>` : '')
        + `learning rate α ${cfg.alpha} · now ${rate.toFixed(2)}<br>discount γ ${cfg.gamma} · explore ε ${cfg.explore}`;
    };
    return panel;
  }

  // ============================================
  // Initialize on DOM ready
  // ============================================

  const init = () => {
    const canvas = document.getElementById('nn-canvas');
    if (!canvas || typeof LightWorld === 'undefined') return;
    const field = new Field(canvas);
    field.start();
    // Web fonts change the size of the text block once they load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => field.layout());
    window.__society = field;      // for poking at it from the console
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
