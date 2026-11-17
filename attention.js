/**
 * Attention field: the background of every page.
 *
 * The idea is the one the spark field always had: sparks are born, give and receive energy, and die.
 * What changed is the rule for who gives to whom. It is scaled dot-product attention:
 *
 *     weights = softmax(Q·Kᵀ / √d_k)          output = weights · V
 *
 * Every spark is a token with a small embedding; its colour is read off that embedding, so sparks
 * that look alike are alike. A few heads each run an agent loop, one step every few seconds:
 *
 *   observe   look at the tokens inside the context window (the ring)
 *   attend    score each one with q·k / √d_k plus a distance bias, softmax the scores into weights
 *             (the lines; the numbers on them are the weights)
 *   act       receive energy and values along those weights, then emit the next token
 *
 * The new token's embedding is the residual sum x + Σ wᵢ·vᵢ, and a tiny feed-forward net turns the
 * attention output into the direction of the step. A token that keeps giving its energy away fades
 * and dies. The mouse pointer is a token too: move it near a head and the head attends to it.
 *
 * Heads and their lines keep to the space the page's text leaves free: around the centred block on
 * the home page, in the side margins of a reading column. Where the text leaves no room (a phone, a
 * narrow window) the field runs "quiet": anywhere, dimmed, without labels.
 */

(() => {
  'use strict';

  // ============================================
  // Configuration (tune these)
  // ============================================

  const CFG = {
    dim: 8,                 // d_k: the size of every embedding
    gain: 3.2,              // length of q and k; sets how sharp the softmax is
    contextRadius: 300,     // px: the context window a head can observe
    distanceScale: 150,     // px per logit: a relative-position bias, nearer tokens score higher
    topK: 5,                // strongest weights drawn per step
    minWeight: 0.05,        // weights below this are not drawn

    stepSeconds: 3.8,       // one observe → attend → act loop
    phase: { observe: 0.22, attend: 0.56, receive: 0.86 },  // where each phase ends, as a share of a step
    stepLength: [56, 80],   // px from one token of a chain to the next
    maxTurn: 0.85,          // rad: how far the feed-forward net can turn a head in one step

    give: 0.55,             // share of its energy a token gives at weight 1
    decayAmbient: 0.020,    // energy lost per second by a free token
    decayChain: 0.024,      // ... and by a token a head emitted
    energyFloor: 0.12,      // below this a token dies
    fadeSeconds: 1.4,

    ambientPerScreen: 44,   // free tokens on a 1440 × 900 screen
    warmupSeconds: 16,      // simulated before the first frame, so the page never opens empty
    maxDpr: 2,
  };

  // Warm base colours (sRGB), one per head and per kind of token
  const BASE_COLORS = [
    [235, 170, 60],   // warm gold
    [210, 100, 60],   // warm terracotta
    [150, 110, 190],  // soft purple
  ];

  const D = CFG.dim;
  const PHASE_NAMES = ['observe', 'attend', 'attend', 'act'];

  // ============================================
  // Utilities
  // ============================================

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  const randn = () => {
    const u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const dot = (a, b) => { let s = 0; for (let i = 0; i < D; i++) s += a[i] * b[i]; return s; };
  const unit = (v) => {
    const n = Math.sqrt(dot(v, v)) || 1;
    return v.map((x) => x / n);
  };

  // An embedding near one of the three anchors (the first three axes), plus noise
  const embed = (anchor, noise) => {
    const v = new Array(D);
    for (let i = 0; i < D; i++) v[i] = (i === anchor ? 1 : 0) + noise * randn();
    return unit(v);
  };

  // Gamma-correct colour mixing (sRGB ↔ linear)
  const GAMMA = 2.2;
  const toLinear = (c) => Math.pow(c / 255, GAMMA);
  const toSRGB = (c) => Math.round(Math.pow(clamp(c, 0, 1), 1 / GAMMA) * 255);
  const BASE_LINEAR = BASE_COLORS.map((c) => c.map(toLinear));

  // Colour is a readout of the embedding: a softmax over its first three axes mixes the base colours
  const colorOf = (e) => {
    const z = [Math.exp(5 * e[0]), Math.exp(5 * e[1]), Math.exp(5 * e[2])];
    const sum = z[0] + z[1] + z[2];
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[k] += (z[c] / sum) * BASE_LINEAR[c][k];
    return out.map(toSRGB);
  };

  const mixColors = (a, b, t) => [0, 1, 2].map((k) => toSRGB(lerp(toLinear(a[k]), toLinear(b[k]), t)));
  const css = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

  // ============================================
  // Feed-forward net: attention output → how far to turn
  // ============================================

  class FeedForward {
    constructor() {
      // D inputs → 6 hidden (tanh) → 1 output (tanh)
      this.w1 = Array.from({ length: 6 }, () => Array.from({ length: D }, () => randn() * 1.6 / Math.sqrt(D)));
      this.b1 = Array.from({ length: 6 }, () => randn() * 0.1);
      this.w2 = Array.from({ length: 6 }, () => randn() * 0.9);
    }

    forward(x) {
      let out = 0;
      for (let j = 0; j < 6; j++) {
        let h = this.b1[j];
        for (let i = 0; i < D; i++) h += this.w1[j][i] * x[i];
        out += this.w2[j] * Math.tanh(h);
      }
      return Math.tanh(out);   // −1 … 1
    }
  }

  // ============================================
  // Token (a spark)
  // ============================================

  let nextId = 0;

  class Token {
    constructor(x, y, e, energy, chain) {
      this.id = nextId++;
      this.x = x;
      this.y = y;
      this.e = e;                    // embedding: it is the key and the value this token offers
      this.color = colorOf(e);
      this.energy = energy;
      this.chain = chain;            // index of the head that emitted it, or −1 for a free token
      this.prev = null;              // the token before it in its chain
      this.isHead = false;

      this.seed = Math.random() * 100;
      this.baseRadius = lerp(2.0, 3.6, Math.random());
      const drift = chain < 0 ? lerp(2, 5, Math.random()) : 0;
      const heading = Math.random() * Math.PI * 2;
      this.vx = Math.cos(heading) * drift;
      this.vy = Math.sin(heading) * drift;

      this.fade = 0;
      this.dying = false;
      this.dead = false;
      this.pop = chain >= 0 ? 1 : 0; // birth ring of an emitted token
      this.seen = 0;                 // lit while inside a head's context window
    }

    update(dt, time, world) {
      // Slow drift with a little wobble; emitted tokens almost hold their place so chains keep their shape
      const wobble = this.chain < 0 ? 6 : 1.6;
      this.x += (this.vx + Math.sin(time * 0.35 + this.seed) * wobble) * dt;
      this.y += (this.vy + Math.cos(time * 0.29 + this.seed * 1.7) * wobble) * dt;

      // Energy decays; the token a head is standing on is kept alive by that head
      if (!this.isHead) {
        this.energy -= (this.chain < 0 ? CFG.decayAmbient : CFG.decayChain) * dt;
      }
      const m = 40;
      const outside = this.x < -m || this.y < -m || this.x > world.width + m || this.y > world.height + m;
      if (this.energy <= CFG.energyFloor || outside) this.dying = true;

      if (this.dying) {
        this.fade -= dt / CFG.fadeSeconds;
        if (this.fade <= 0) this.dead = true;
      } else {
        this.fade = Math.min(1, this.fade + dt / 0.9);
      }

      this.pop = Math.max(0, this.pop - dt / 0.8);
      this.seen *= Math.exp(-dt * 2.5);
    }

    get radius() {
      const e = clamp(this.energy, 0, 1);
      return this.baseRadius * (0.45 + 1.4 * e * e) * this.fade;
    }

    get alpha() {
      return clamp(0.3 + 0.7 * this.energy, 0, 1) * this.fade;
    }
  }

  // ============================================
  // Head: one agent running observe → attend → act
  // ============================================

  class Head {
    constructor(idx, world) {
      this.idx = idx;
      this.anchor = idx % 3;
      this.clock = (idx / world.headCount) * CFG.stepSeconds;  // stagger the heads
      this.stage = 0;          // 0 observe · 1 attend · 2 receive · 3 act
      this.targets = [];       // { tok, w, gift }
      this.out = null;         // attention output Σ wᵢ·vᵢ
      this.received = 0;
      this.from = null;        // the token the current lines start from
      this.lineAlpha = 0;
      this.ring = 0;           // radius of the observe ring
      this.ringAlpha = 0;
      this.respawn(world);
    }

    respawn(world) {
      const p = world.freePoint();
      const tok = new Token(p.x, p.y, embed(this.anchor, 0.25), 0.9, this.idx);
      tok.isHead = true;
      tok.pop = 1;
      world.tokens.push(tok);
      this.token = tok;
      this.dir = Math.random() * Math.PI * 2;
      this.targets = [];
      this.from = null;
    }

    update(dt, world) {
      this.clock += dt;
      const T = CFG.stepSeconds;
      const P = CFG.phase;
      if (this.clock >= T) {
        this.clock -= T;
        this.stage = 0;
        this.targets = [];
        this.from = null;
      }
      const p = this.clock / T;

      if (this.stage === 0) {
        // observe: the ring opens over the context window and lights what it passes
        const k = easeOut(p / P.observe);
        this.ring = k * world.contextRadius;
        this.ringAlpha = 0.34 * (1 - 0.74 * k);
        for (const tok of world.tokens) {
          if (tok === this.token || tok.dying) continue;
          if (Math.hypot(tok.x - this.token.x, tok.y - this.token.y) < this.ring) tok.seen = Math.max(tok.seen, 0.6);
        }
        if (p >= P.observe) { this.attend(world); this.stage = 1; }
      }

      if (this.stage === 1) {
        // attend: the lines grow out to the tokens with the largest weights
        this.lineAlpha = easeOut((p - P.observe) / (P.attend - P.observe));
        if (p >= P.attend) { this.stage = 2; this.sendPulses(world); }
      }

      if (this.stage === 2) {
        // receive: energy travels in along the weights; what is given is lost by the giver
        this.lineAlpha = 1;
        const share = dt / ((P.receive - P.attend) * T);
        for (const t of this.targets) {
          const delta = Math.min(t.gift * share, Math.max(0, t.tok.energy - CFG.energyFloor * 0.5));
          if (!t.tok.isPointer) t.tok.energy -= delta;
          this.received += delta;
        }
        if (p >= P.receive) { this.act(world); this.stage = 3; }
      }

      if (this.stage === 3) {
        const k = (p - P.receive) / (1 - P.receive);
        this.lineAlpha = 1 - easeInOut(k);
        this.ringAlpha = 0.088 * (1 - k);
      }
    }

    // softmax(q·k / √d_k + distance bias) over every token in the context window
    attend(world) {
      const here = this.token;
      const q = here.e.map((x) => x * CFG.gain);
      const cands = world.contextOf(here, q);
      this.from = here;
      this.received = 0;
      this.out = new Array(D).fill(0);
      this.targets = [];
      if (!cands.length) return;

      const scores = cands.map((c) => {
        const k = c.e.map((x) => x * CFG.gain);
        const relevance = c.tok.isPointer ? 0.62 : 1;   // the pointer is a strong token, not the only one
        return relevance * dot(q, k) / Math.sqrt(D) - c.dist / CFG.distanceScale;
      });
      const max = Math.max(...scores);
      const exps = scores.map((s) => Math.exp(s - max));
      const sum = exps.reduce((a, b) => a + b, 0);

      const weighted = cands.map((c, i) => ({ tok: c.tok, w: exps[i] / sum }));
      for (const { tok, w } of weighted) {
        for (let i = 0; i < D; i++) this.out[i] += w * tok.e[i];   // values are the embeddings
      }
      this.targets = weighted
        .sort((a, b) => b.w - a.w)
        .slice(0, world.topK)
        .filter((t) => t.w >= CFG.minWeight)
        .map((t) => ({ tok: t.tok, w: t.w, gift: t.w * CFG.give * (t.tok.isPointer ? 0.4 : t.tok.energy) }));
    }

    sendPulses(world) {
      const dur = (CFG.phase.receive - CFG.phase.attend) * CFG.stepSeconds;
      for (const t of this.targets) {
        const n = t.w > 0.3 ? 3 : t.w > 0.14 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          world.pulses.push({
            from: t.tok, to: this.from, t: -i * 0.22, speed: 1 / (dur * 0.72),
            color: mixColors(t.tok.color, this.from.color, 0.3), size: 1.3 + 2.2 * Math.sqrt(t.w),
          });
        }
      }
    }

    // Emit the next token: residual + attention output, then the feed-forward net picks the turn
    act(world) {
      const old = this.token;
      const x = new Array(D);
      for (let i = 0; i < D; i++) {
        x[i] = old.e[i] + 0.9 * this.out[i] + (i === this.anchor ? 0.3 : 0) + 0.14 * randn();
      }
      const e = unit(x);

      const turn = world.ff.forward(this.out) * CFG.maxTurn + randn() * 0.12;
      const length = lerp(CFG.stepLength[0], CFG.stepLength[1], Math.random()) * world.scale;
      const next = world.nextPosition(old, this.dir + turn, length, this);
      old.isHead = false;
      if (!next) {           // boxed in: let this chain fade and start another somewhere free
        this.respawn(world);
        return;
      }

      this.dir = next.angle;
      const tok = new Token(next.x, next.y, e, clamp(0.5 + this.received, 0.4, 1), this.idx);
      tok.prev = old;
      tok.isHead = true;
      world.tokens.push(tok);
      this.token = tok;
    }
  }

  // ============================================
  // World
  // ============================================

  class World {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.tokens = [];
      this.pulses = [];
      this.heads = [];
      this.ff = new FeedForward();
      this.time = 0;
      this.spawnDebt = 0;
      this.pointer = null;
      this.avoid = [];

      this.resize();
      for (let i = 0; i < this.headCount; i++) this.heads.push(new Head(i, this));

      window.addEventListener('resize', () => this.resize());
      window.addEventListener('pointermove', (ev) => {
        if (ev.pointerType !== 'mouse') return;
        if (!this.pointer) {
          this.pointer = { isPointer: true, e: null, energy: 1, fade: 1, dying: false, color: [120, 112, 104] };
        }
        this.pointer.x = ev.clientX;
        this.pointer.y = ev.clientY;
        this.pointer.at = this.time;
      }, { passive: true });
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.layout();
    }

    // Everything that depends on the size of the screen and on where the page's text is
    layout() {
      const small = this.width < 700;
      this.scale = small ? 0.72 : 1;
      this.contextRadius = CFG.contextRadius * (small ? 0.62 : 1);
      this.measureAvoid();
      this.headCount = small || this.freeShare < 0.3 ? 2 : 3;   // narrow margins hold two heads, not three

      this.topK = small || this.quiet ? 3 : CFG.topK;
      this.labels = this.width >= 900 && !this.quiet;   // weights and phase names need room
      this.dim = this.quiet ? 0.42 : 1;
      // Free tokens: as dense in the space the text leaves as they are around the home page's block
      const area = (this.width * this.height) / (1440 * 900);
      const room = clamp(this.freeShare / 0.7, 0.55, 1);
      this.ambientTarget = Math.round(clamp(CFG.ambientPerScreen * area * room, 14, 80));

      // A resize can change how many heads fit
      while (this.heads.length > this.headCount) this.heads.pop().token.isHead = false;
      while (this.heads.length && this.heads.length < this.headCount) this.heads.push(new Head(this.heads.length, this));
    }

    // Where the page's text is. Heads and their lines keep out of these boxes.
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
      for (const host of document.querySelectorAll('.content, .page-hero')) union(host.children, 34, 30);
      // A reading column (projects, experience, blog): the full height of the screen, because it scrolls
      for (const column of document.querySelectorAll('.page')) {
        const box = column.getBoundingClientRect();
        if (box.width) this.avoid.push({ l: box.left - 8, t: -1e6, r: box.right + 8, b: 1e6 });
      }
      union(document.querySelectorAll('.back-link'), 18, 14);
      union(document.querySelectorAll('.bg-note span'), 18, 12);

      // How much of the screen is left for the heads
      let free = 0, total = 0;
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 12; j++) {
          total++;
          if (this.valid((i + 0.5) * this.width / 16, (j + 0.5) * this.height / 12)) free++;
        }
      }
      this.freeShare = free / total;
      this.quiet = this.freeShare < 0.2;     // too little: run behind the text instead, dimmed
      if (this.quiet) {
        this.avoid = [];
        this.freeShare = 1;
      }
    }

    inAvoid(x, y, pad = 0) {
      for (const a of this.avoid) {
        if (x > a.l - pad && x < a.r + pad && y > a.t - pad && y < a.b + pad) return true;
      }
      return false;
    }

    valid(x, y) {
      const m = 30;
      return x > m && y > m && x < this.width - m && y < this.height - m && !this.inAvoid(x, y, 14);
    }

    freePoint() {
      const soft = Math.min(120, Math.min(this.width, this.height) * 0.13);
      let best = null;
      for (let i = 0; i < 80; i++) {
        const x = lerp(36, this.width - 36, Math.random());
        const y = lerp(36, this.height - 36, Math.random());
        if (!this.valid(x, y)) continue;
        let room = Math.min(x, y, this.width - x, this.height - y, soft * 1.5);
        let apart = 800;
        for (const h of this.heads) apart = Math.min(apart, Math.hypot(h.token.x - x, h.token.y - y));
        room += apart * 0.3;
        if (!best || room > best.room) best = { x, y, room };
      }
      return best || { x: this.width * 0.5, y: 50 };
    }

    // The heading nearest to `angle` whose step lands somewhere a head may stand, preferring room:
    // away from the screen edges and from the other heads
    nextPosition(tok, angle, length, self) {
      const soft = Math.min(120, Math.min(this.width, this.height) * 0.13);
      let best = null;
      for (let k = 0; k <= 14; k++) {
        const a = angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42;
        const x = tok.x + Math.cos(a) * length;
        const y = tok.y + Math.sin(a) * length;
        if (!this.valid(x, y)) continue;
        let cost = Math.ceil(k / 2) * 0.5;
        const edge = Math.min(x, y, this.width - x, this.height - y);
        if (edge < soft) cost += (1 - edge / soft) * 3.2;
        for (const h of this.heads) {
          if (h === self) continue;
          const d = Math.hypot(h.token.x - x, h.token.y - y);
          if (d < 380) cost += (1 - d / 380) * 2.6;
        }
        if (!best || cost < best.cost) best = { x, y, angle: a, cost };
      }
      return best;
    }

    // Everything a head can see from `here`: live tokens inside the context window, and the pointer
    contextOf(here, q) {
      const out = [];
      const R = this.contextRadius;
      for (const tok of this.tokens) {
        if (tok === here || tok === here.prev || tok.dying || tok.fade < 0.6 || this.inAvoid(tok.x, tok.y)) continue;
        const dist = Math.hypot(tok.x - here.x, tok.y - here.y);
        if (dist < R && dist > 14) out.push({ tok, e: tok.e, dist });
      }
      const ptr = this.pointer;
      if (ptr && this.time - ptr.at < 6 && !this.inAvoid(ptr.x, ptr.y)) {
        const dist = Math.hypot(ptr.x - here.x, ptr.y - here.y);
        if (dist < R && dist > 14) {
          ptr.e = unit(q);            // the pointer is the prompt: relevant to whoever looks at it
          out.push({ tok: ptr, e: ptr.e, dist });
        }
      }
      return out;
    }

    spawnAmbient() {
      let x, y;
      for (let i = 0; i < 8; i++) {
        x = Math.random() * this.width;
        y = Math.random() * this.height;
        if (!this.inAvoid(x, y)) break;       // free tokens mostly keep clear of the text too
      }
      const tok = new Token(x, y, embed(Math.floor(Math.random() * 3), 0.3), lerp(0.55, 1, Math.random()), -1);
      this.tokens.push(tok);
    }

    step(dt) {
      this.time += dt;

      const free = this.tokens.reduce((n, t) => n + (t.chain < 0 && !t.dying ? 1 : 0), 0);
      if (free < this.ambientTarget) {
        this.spawnDebt += dt * 1.6;
        while (this.spawnDebt >= 1) { this.spawnAmbient(); this.spawnDebt -= 1; }
      }

      for (const head of this.heads) head.update(dt, this);
      for (const tok of this.tokens) tok.update(dt, this.time, this);
      this.tokens = this.tokens.filter((t) => !t.dead);

      for (const p of this.pulses) p.t += p.speed * dt;
      this.pulses = this.pulses.filter((p) => p.t < 1 && !p.from.dead && !p.to.dead);
    }

    // ----------------------------------------
    // Drawing
    // ----------------------------------------

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.lineCap = 'round';

      // Chains: each emitted token is tied to the one it came from
      for (const tok of this.tokens) {
        const prev = tok.prev;
        if (!prev || prev.dead) continue;
        const alpha = 0.2 * Math.min(tok.fade, prev.fade) * clamp(0.35 + prev.energy, 0, 1);
        if (alpha < 0.01) continue;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(tok.x, tok.y);
        ctx.strokeStyle = css(mixColors(prev.color, tok.color, 0.5), alpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (const head of this.heads) this.drawAttention(head);

      // Energy in flight
      for (const p of this.pulses) {
        if (p.t <= 0) continue;
        const k = easeInOut(p.t);
        const x = lerp(p.from.x, p.to.x, k);
        const y = lerp(p.from.y, p.to.y, k);
        const alpha = Math.sin(Math.PI * p.t) * 0.85 * this.dim;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = css(p.color, alpha * 0.25);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = css(p.color, alpha);
        ctx.fill();
      }

      for (const tok of this.tokens) this.drawToken(tok);
      if (this.labels) {
        const placed = [];
        for (const head of this.heads) this.drawLabels(head, placed);
      }
    }

    drawAttention(head) {
      const ctx = this.ctx;
      const tok = head.from && !head.from.dead ? head.from : head.token;

      // The context window
      if (head.ringAlpha > 0.005) {
        ctx.beginPath();
        ctx.arc(tok.x, tok.y, Math.max(1, head.ring), 0, Math.PI * 2);
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = css(tok.color, head.ringAlpha * tok.fade * this.dim);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const from = head.from;
      if (!from || from.dead || head.lineAlpha <= 0.01) return;
      const grow = head.stage === 1 ? head.lineAlpha : 1;

      for (const t of head.targets) {
        if (t.tok.dead) continue;
        const fade = Math.min(from.fade, t.tok.fade);
        const alpha = (0.1 + 0.55 * t.w) * head.lineAlpha * fade * this.dim;
        if (alpha < 0.01) continue;
        const x = lerp(from.x, t.tok.x, grow);
        const y = lerp(from.y, t.tok.y, grow);
        const color = t.tok.isPointer ? t.tok.color : mixColors(from.color, t.tok.color, 0.5);
        const width = 0.7 + 3.4 * t.w;

        ctx.beginPath();           // soft halo
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = css(color, alpha * 0.3);
        ctx.lineWidth = width * 2.6;
        ctx.stroke();

        ctx.beginPath();           // core: width and opacity are the weight
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = css(color, alpha);
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }

    drawToken(tok) {
      const ctx = this.ctx;
      const radius = tok.radius;
      const alpha = tok.alpha;
      if (alpha < 0.01 || radius < 0.4) return;

      const boost = tok.energy * tok.energy;
      const glowRadius = radius * 6 * (0.8 + 0.6 * boost);
      const glow = 0.3 + 0.5 * boost;
      const g = ctx.createRadialGradient(tok.x, tok.y, 0, tok.x, tok.y, glowRadius);
      g.addColorStop(0, css(tok.color, alpha * glow));
      g.addColorStop(0.2, css(tok.color, alpha * glow * 0.5));
      g.addColorStop(0.5, css(tok.color, alpha * glow * 0.15));
      g.addColorStop(1, css(tok.color, 0));
      ctx.beginPath();
      ctx.arc(tok.x, tok.y, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(tok.x, tok.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = css(tok.color, alpha * (0.5 + 0.4 * boost));
      ctx.fill();

      ctx.beginPath();
      ctx.arc(tok.x, tok.y, radius * (0.3 + 0.3 * boost), 0, Math.PI * 2);
      ctx.fillStyle = css([255, 255, 255], alpha * (0.5 + 0.5 * boost));
      ctx.fill();

      // Lit while a head is looking at it
      if (tok.seen > 0.05 && !tok.isHead) {
        ctx.beginPath();
        ctx.arc(tok.x, tok.y, radius * 2.4, 0, Math.PI * 2);
        ctx.strokeStyle = css(tok.color, tok.seen * 0.5 * alpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // The token a head stands on
      if (tok.isHead) {
        ctx.beginPath();
        ctx.arc(tok.x, tok.y, radius + 5.5, 0, Math.PI * 2);
        ctx.strokeStyle = css(tok.color, 0.7 * tok.fade);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Birth
      if (tok.pop > 0.01) {
        const k = 1 - tok.pop;
        ctx.beginPath();
        ctx.arc(tok.x, tok.y, radius + 4 + easeOut(k) * 18, 0, Math.PI * 2);
        ctx.strokeStyle = css(tok.color, 0.55 * tok.pop * tok.fade);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    drawLabels(head, placed) {
      const ctx = this.ctx;
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const from = head.from;
      const lines = from && !from.dead && head.stage >= 1;

      // What the head is doing, on the side away from its lines
      const tok = head.token;
      let ox = 0, oy = -1;
      if (lines && head.stage < 3) {
        let mx = 0, my = 0;
        for (const t of head.targets) {
          const dx = t.tok.x - from.x, dy = t.tok.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          mx += t.w * dx / len; my += t.w * dy / len;
        }
        const m = Math.hypot(mx, my);
        if (m > 0.05) { ox = -mx / m; oy = -my / m; }
      }
      let px = tok.x + ox * 34, py = tok.y + oy * 22;
      const onText = (x, y) => this.inAvoid(x - 22, y, 4) || this.inAvoid(x + 22, y, 4);
      if (onText(px, py)) { px = tok.x; py = tok.y - 22; }          // above the head instead
      if (onText(px, py)) { px = tok.x; py = tok.y + 22; }          // or below it
      if (!onText(px, py)) {
        ctx.fillStyle = `rgba(74, 68, 62, ${0.6 * tok.fade})`;
        ctx.fillText(PHASE_NAMES[head.stage], px, py);
        placed.push({ x: px, y: py, w: 30 });
      }

      // The weight on each line
      if (!lines || head.lineAlpha <= 0.05) return;
      for (const t of head.targets) {
        if (t.w < 0.1 || t.tok.dead) continue;
        const dx = t.tok.x - from.x, dy = t.tok.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        if (len < 50) continue;
        const side = dx >= 0 ? 1 : -1;       // keep the number above the line
        const x = from.x + dx * 0.6 + (dy / len) * 10 * side;
        const y = from.y + dy * 0.6 - (dx / len) * 10 * side;
        if (this.inAvoid(x - 14, y, 4) || this.inAvoid(x + 14, y, 4)) continue;
        if (placed.some((p) => Math.abs(p.x - x) < p.w + 14 && Math.abs(p.y - y) < 13)) continue;
        placed.push({ x, y, w: 14 });
        ctx.fillStyle = `rgba(74, 68, 62, ${0.66 * head.lineAlpha * Math.min(from.fade, t.tok.fade)})`;
        ctx.fillText(t.w.toFixed(2), x, y);
      }
    }

    // ----------------------------------------
    // Running
    // ----------------------------------------

    start() {
      for (let i = 0; i < Math.round(this.ambientTarget * 0.8); i++) this.spawnAmbient();
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (let t = 0; t < CFG.warmupSeconds; t += 1 / 30) this.step(1 / 30);

      if (still) {             // no motion wanted: one frame, caught mid-thought
        this.draw();
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
  // Initialize on DOM ready
  // ============================================

  const init = () => {
    const canvas = document.getElementById('nn-canvas');
    if (!canvas) return;
    const world = new World(canvas);
    world.start();
    // Web fonts change the size of the text block once they load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => world.layout());
    window.__attention = world;   // for poking at it from the console
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
