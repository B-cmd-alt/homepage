/**
 * Neural Spark Network (Optimized)
 *
 * Performance-focused implementation:
 * - Spatial hash grid for O(N) neighbor queries
 * - Delta-time based updates
 * - Gamma-correct color mixing
 * - Polarity computed once at spawn
 * - Hard caps on interactions and particles
 */

(() => {
  'use strict';

  // ============================================
  // Configuration (tune these)
  // ============================================

  const CONFIG = {
    // Spark counts - balanced
    sparkCountDesktop: 120,
    sparkCountMobile: 55,

    // Interaction
    interactionRadius: 110,
    transferRatePerSec: 0.6,
    colorRatePerSec: 1.0,
    energyDecayPerSec: 0.018,
    energyFloor: 0.15,

    // Visuals - balanced visibility
    baseRadiusMin: 1.8,
    baseRadiusMax: 4.0,
    glowMultiplier: 6,
    lineAlphaMax: 0.25,

    // Flow particles
    maxFlowParticles: 100,
    flowParticleSpeed: 60,
    flowSpawnRate: 0.2,

    // Performance caps
    maxInteractionsPerFrame: 1200,
    maxDpr: 2,

    // Spawn area
    spawnPadding: 0,

    // Physics - moderate movement
    maxSpeed: 20,
    driftStrength: 10,
    damping: 0.97,

    // Lifetime
    lifetimeMin: 6000,
    lifetimeMax: 12000,
    spawnRatePerSec: 5,
  };

  // Base colors (sRGB) - warm and visible but not overpowering
  const BASE_COLORS = [
    [235, 170, 60],   // Warm gold
    [210, 100, 60],   // Warm terracotta
    [150, 110, 190],  // Soft purple
  ];

  // ============================================
  // Utility Functions
  // ============================================

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Gamma-correct color mixing (sRGB ↔ linear)
  const GAMMA = 2.2;
  const toLinear = (c) => Math.pow(c / 255, GAMMA);
  const toSRGB = (c) => Math.round(Math.pow(clamp(c, 0, 1), 1 / GAMMA) * 255);

  function mixColorsLinear(c1, c2, t) {
    // Convert to linear, mix, convert back
    const r = lerp(toLinear(c1[0]), toLinear(c2[0]), t);
    const g = lerp(toLinear(c1[1]), toLinear(c2[1]), t);
    const b = lerp(toLinear(c1[2]), toLinear(c2[2]), t);

    // Subtle pigment darkening (makes mixing feel more physical)
    const darken = 1 - t * (1 - t) * 0.15;

    return [
      toSRGB(r * darken),
      toSRGB(g * darken),
      toSRGB(b * darken)
    ];
  }

  function colorToCSS(rgb, alpha = 1) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  // ============================================
  // Minimal Neural Network
  // ============================================

  class TinyNN {
    constructor() {
      // 4 inputs → 6 hidden (tanh) → 1 output (sigmoid)
      const scale1 = Math.sqrt(2 / 10);
      const scale2 = Math.sqrt(2 / 7);

      this.w1 = Array.from({ length: 4 }, () =>
        Array.from({ length: 6 }, () => (Math.random() * 2 - 1) * scale1)
      );
      this.b1 = Array.from({ length: 6 }, () => (Math.random() - 0.5) * 0.1);
      this.w2 = Array.from({ length: 6 }, () => (Math.random() * 2 - 1) * scale2);
      this.b2 = (Math.random() - 0.5) * 0.1;
    }

    forward(inputs) {
      // Hidden layer
      const hidden = this.b1.map((b, j) => {
        let sum = b;
        for (let i = 0; i < 4; i++) sum += inputs[i] * this.w1[i][j];
        return Math.tanh(sum);
      });

      // Output
      let out = this.b2;
      for (let i = 0; i < 6; i++) out += hidden[i] * this.w2[i];
      return 1 / (1 + Math.exp(-out));
    }
  }

  // ============================================
  // Spatial Hash Grid
  // ============================================

  class SpatialGrid {
    constructor(cellSize, width, height) {
      this.cellSize = cellSize;
      this.cols = Math.ceil(width / cellSize);
      this.rows = Math.ceil(height / cellSize);
      this.cells = new Map();
    }

    clear() {
      this.cells.clear();
    }

    getKey(x, y) {
      const col = Math.floor(x / this.cellSize);
      const row = Math.floor(y / this.cellSize);
      return `${col},${row}`;
    }

    insert(spark) {
      const key = this.getKey(spark.x, spark.y);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(spark);
    }

    getNeighbors(spark) {
      const col = Math.floor(spark.x / this.cellSize);
      const row = Math.floor(spark.y / this.cellSize);
      const neighbors = [];

      // Check 3x3 grid of cells
      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const key = `${col + dc},${row + dr}`;
          const cell = this.cells.get(key);
          if (cell) {
            for (const other of cell) {
              if (other !== spark) neighbors.push(other);
            }
          }
        }
      }
      return neighbors;
    }
  }

  // ============================================
  // Flow Particle
  // ============================================

  class FlowParticle {
    constructor(giver, receiver, color) {
      this.giver = giver;
      this.receiver = receiver;
      this.t = 0;
      this.color = color;
      this.alpha = 0.8;
      this.size = 1.5 + Math.random();
    }

    update(dt) {
      const dist = Math.hypot(
        this.receiver.x - this.giver.x,
        this.receiver.y - this.giver.y
      );
      const speed = CONFIG.flowParticleSpeed / Math.max(dist, 1);
      this.t += speed * dt;
      this.alpha = 0.8 * (1 - this.t);
      return this.t < 1;
    }

    getPosition() {
      return {
        x: lerp(this.giver.x, this.receiver.x, this.t),
        y: lerp(this.giver.y, this.receiver.y, this.t)
      };
    }
  }

  // ============================================
  // Spark
  // ============================================

  let sparkIdCounter = 0;

  class Spark {
    constructor(x, y, w, h, nn) {
      this.id = sparkIdCounter++;
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;

      // Velocity
      this.vx = (Math.random() - 0.5) * CONFIG.maxSpeed * 0.5;
      this.vy = (Math.random() - 0.5) * CONFIG.maxSpeed * 0.5;

      // Properties
      this.baseRadius = lerp(CONFIG.baseRadiusMin, CONFIG.baseRadiusMax, Math.random());
      this.energy = 0.4 + Math.random() * 0.4;
      this.seedFeature = Math.random();

      // Color: bias toward one of 3 base colors
      const baseIdx = Math.floor(Math.random() * 3);
      const base = BASE_COLORS[baseIdx];
      const variation = 30;
      this.color = [
        clamp(base[0] + (Math.random() - 0.5) * variation, 0, 255),
        clamp(base[1] + (Math.random() - 0.5) * variation, 0, 255),
        clamp(base[2] + (Math.random() - 0.5) * variation, 0, 255)
      ];

      // Lifetime
      this.birth = performance.now();
      this.lifetime = lerp(CONFIG.lifetimeMin, CONFIG.lifetimeMax, Math.random());

      // Polarity: computed ONCE at spawn via NN
      const inputs = [
        (x / w) * 2 - 1,
        (y / h) * 2 - 1,
        0, // age = 0 at spawn
        this.seedFeature * 2 - 1
      ];
      this.polarity = nn.forward(inputs);

      // Visual state
      this.ringAlpha = 0;
    }

    update(dt, time) {
      const age = time - this.birth;
      const lifeRatio = age / this.lifetime;

      // Drift with noise
      const noiseX = Math.sin(time * 0.001 + this.seedFeature * 10) * CONFIG.driftStrength;
      const noiseY = Math.cos(time * 0.0012 + this.seedFeature * 7) * CONFIG.driftStrength;

      this.vx += noiseX * dt;
      this.vy += noiseY * dt;

      // Damping
      this.vx *= Math.pow(CONFIG.damping, dt * 60);
      this.vy *= Math.pow(CONFIG.damping, dt * 60);

      // Clamp speed
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > CONFIG.maxSpeed) {
        this.vx = (this.vx / speed) * CONFIG.maxSpeed;
        this.vy = (this.vy / speed) * CONFIG.maxSpeed;
      }

      // Move
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Wrap around (torus)
      if (this.x < 0) this.x += this.w;
      if (this.x > this.w) this.x -= this.w;
      if (this.y < 0) this.y += this.h;
      if (this.y > this.h) this.y -= this.h;

      // Energy decay
      this.energy *= Math.pow(1 - CONFIG.energyDecayPerSec, dt);
      this.energy = Math.max(CONFIG.energyFloor * 0.5, this.energy);

      // Fade ring alpha
      this.ringAlpha *= 0.9;

      // Fade in/out
      const fadeIn = clamp(age / 500, 0, 1);
      const fadeOut = lifeRatio > 0.75 ? 1 - (lifeRatio - 0.75) / 0.25 : 1;
      this.fade = fadeIn * fadeOut;

      return age < this.lifetime;
    }

    getRadius() {
      // High energy = much larger (0.4 to 2.0x base size)
      const energyScale = 0.4 + 1.6 * this.energy * this.energy;
      return this.baseRadius * energyScale * this.fade;
    }

    getAlpha() {
      // High energy = much brighter
      return clamp(0.3 + 0.7 * this.energy, 0, 1) * this.fade;
    }
  }

  // ============================================
  // Main Spark System
  // ============================================

  class SparkSystem {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      // Detect mobile
      this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                      window.innerWidth < 768;

      // Scale spark count based on screen area for consistent density
      const baseArea = 1920 * 1080; // Reference area
      const screenArea = window.innerWidth * window.innerHeight;
      const densityScale = screenArea / baseArea;

      const baseCount = this.isMobile ? CONFIG.sparkCountMobile : CONFIG.sparkCountDesktop;
      // Clamp between 30 and 300 to prevent extremes
      this.sparkCount = Math.round(Math.max(30, Math.min(300, baseCount * densityScale)));

      this.sparks = [];
      this.flowParticles = [];
      this.connections = new Map(); // Track connection strength for smooth fade
      this.nn = new TinyNN();
      this.grid = null;
      this.lastTime = performance.now();
      this.spawnAccumulator = 0;

      this.resize();
      window.addEventListener('resize', () => this.resize());

      // Log config
      console.log(`%c✦ Neural Sparks`, 'font-size: 16px; font-weight: bold; color: #e85d04;');
      console.log(`%c  ${this.sparkCount} sparks | Mobile: ${this.isMobile}`,
                  'font-size: 11px; color: #888;');
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
      this.width = window.innerWidth;
      this.height = window.innerHeight;

      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      this.canvas.style.width = this.width + 'px';
      this.canvas.style.height = this.height + 'px';

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rebuild spatial grid
      this.grid = new SpatialGrid(CONFIG.interactionRadius, this.width, this.height);

      // Recalculate spark count based on new screen area
      const baseArea = 1920 * 1080;
      const screenArea = this.width * this.height;
      const densityScale = screenArea / baseArea;
      const baseCount = this.isMobile ? CONFIG.sparkCountMobile : CONFIG.sparkCountDesktop;
      this.sparkCount = Math.round(Math.max(30, Math.min(300, baseCount * densityScale)));
    }

    spawnSpark() {
      if (this.sparks.length >= this.sparkCount) return;

      const pad = CONFIG.spawnPadding;
      const x = this.width * (pad + Math.random() * (1 - 2 * pad));
      const y = this.height * (pad + Math.random() * (1 - 2 * pad));

      this.sparks.push(new Spark(x, y, this.width, this.height, this.nn));
    }

    getConnectionKey(a, b) {
      // Use spark IDs for stable keys (IDs assigned at spawn)
      return a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    }

    processInteractions(dt) {
      // Rebuild spatial grid
      this.grid.clear();
      for (const spark of this.sparks) {
        this.grid.insert(spark);
      }

      let interactions = 0;
      const processed = new Set();
      const activeConnections = new Set();

      for (const spark of this.sparks) {
        if (interactions >= CONFIG.maxInteractionsPerFrame) break;

        const neighbors = this.grid.getNeighbors(spark);

        for (const other of neighbors) {
          const connKey = this.getConnectionKey(spark, other);
          if (processed.has(connKey)) continue;
          processed.add(connKey);

          const dx = other.x - spark.x;
          const dy = other.y - spark.y;
          const dist = Math.hypot(dx, dy);

          if (dist < CONFIG.interactionRadius && dist > 0) {
            interactions++;
            activeConnections.add(connKey);

            // Closeness weight (smoothstep: 1 when close, 0 when far)
            const targetW = smoothstep(CONFIG.interactionRadius, 0, dist);

            // Get or create connection state with smooth fade-in
            let conn = this.connections.get(connKey);
            if (!conn) {
              conn = { strength: 0, a: spark, b: other };
              this.connections.set(connKey, conn);
            }
            // Update references (sparks may have changed)
            conn.a = spark;
            conn.b = other;

            // Smooth fade-in (faster) and tracking of target
            const fadeSpeed = 3.0; // How fast connections fade in/out
            conn.strength += (targetW - conn.strength) * fadeSpeed * dt;
            conn.strength = clamp(conn.strength, 0, 1);

            const w = conn.strength;

            // Determine giver/receiver by polarity
            const giver = spark.polarity > other.polarity ? spark : other;
            const receiver = spark.polarity > other.polarity ? other : spark;

            // Energy transfer (only when connection is established)
            if (w > 0.1) {
              const transfer = clamp(w * CONFIG.transferRatePerSec * dt, 0, 1);
              const deltaEnergy = transfer * Math.max(0, giver.energy - CONFIG.energyFloor);

              giver.energy -= deltaEnergy;
              receiver.energy = Math.min(1, receiver.energy + deltaEnergy);

              // Visual feedback: giver ring
              giver.ringAlpha = Math.max(giver.ringAlpha, w * 0.5);

              // Color contamination (gamma-correct) - more dramatic
              const colorT = clamp(w * w * CONFIG.colorRatePerSec * dt, 0, 0.2);
              receiver.color = mixColorsLinear(receiver.color, giver.color, colorT);
              // Slight bidirectional tint for realism
              giver.color = mixColorsLinear(giver.color, receiver.color, colorT * 0.25);

              // Spawn flow particle (only when well-connected)
              if (w > 0.2 && this.flowParticles.length < CONFIG.maxFlowParticles) {
                if (Math.random() < w * CONFIG.flowSpawnRate * dt * 60) {
                  const mixedColor = mixColorsLinear(giver.color, receiver.color, 0.3);
                  this.flowParticles.push(new FlowParticle(giver, receiver, mixedColor));
                }
              }
            }
          }
        }
      }

      // Fade out connections that are no longer active (faster fade)
      for (const [key, conn] of this.connections) {
        if (!activeConnections.has(key)) {
          conn.strength -= 4.0 * dt; // Faster fade out
          if (conn.strength <= 0) {
            this.connections.delete(key);
          }
        }
      }
    }

    update(time) {
      const dt = Math.min((time - this.lastTime) / 1000, 0.1); // Cap dt to prevent jumps
      this.lastTime = time;

      // Spawn new sparks
      this.spawnAccumulator += CONFIG.spawnRatePerSec * dt;
      while (this.spawnAccumulator >= 1) {
        this.spawnSpark();
        this.spawnAccumulator--;
      }

      // Update sparks and track which are still alive
      const aliveIds = new Set();
      this.sparks = this.sparks.filter(s => {
        const alive = s.update(dt, time);
        if (alive) aliveIds.add(s.id);
        return alive;
      });

      // Clean up connections for dead sparks
      for (const [key, conn] of this.connections) {
        if (!aliveIds.has(conn.a.id) || !aliveIds.has(conn.b.id)) {
          this.connections.delete(key);
        }
      }

      // Process interactions
      this.processInteractions(dt);

      // Update flow particles
      this.flowParticles = this.flowParticles.filter(p => p.update(dt));
    }

    draw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      // Draw connections using tracked connection strengths (smooth fade)
      for (const [key, conn] of this.connections) {
        const { a, b, strength } = conn;
        if (strength < 0.02) continue;

        // Skip if sparks moved too far apart (max 1.3x interaction radius)
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const maxDrawDist = CONFIG.interactionRadius * 1.3;
        if (dist > maxDrawDist) continue;

        // Reduce alpha based on distance (fade faster when far)
        const distFactor = 1 - Math.max(0, (dist - CONFIG.interactionRadius) / (maxDrawDist - CONFIG.interactionRadius));
        const alpha = strength * distFactor * CONFIG.lineAlphaMax * Math.min(a.fade, b.fade);
        if (alpha < 0.01) continue;

        const mixedColor = mixColorsLinear(a.color, b.color, 0.5);

        // Draw connection line with glow
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = colorToCSS(mixedColor, alpha * 0.4);
        ctx.lineWidth = strength * distFactor * 4;
        ctx.stroke();

        // Core line
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = colorToCSS(mixedColor, alpha);
        ctx.lineWidth = strength * distFactor * 1.5;
        ctx.stroke();
      }

      // Draw flow particles - balanced
      for (const particle of this.flowParticles) {
        const pos = particle.getPosition();
        const alpha = particle.alpha * 0.6;

        if (alpha > 0.01) {
          // Small glow
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, particle.size * 2, 0, Math.PI * 2);
          ctx.fillStyle = colorToCSS(particle.color, alpha * 0.3);
          ctx.fill();

          // Core
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, particle.size, 0, Math.PI * 2);
          ctx.fillStyle = colorToCSS(particle.color, alpha);
          ctx.fill();
        }
      }

      // Draw sparks
      for (const spark of this.sparks) {
        const radius = spark.getRadius();
        const alpha = spark.getAlpha();

        if (alpha < 0.01 || radius < 0.5) continue;

        // Energy-based glow intensity
        const energyBoost = spark.energy * spark.energy; // Squared for dramatic difference
        const glowRadius = radius * CONFIG.glowMultiplier * (0.8 + 0.6 * energyBoost);

        const gradient = ctx.createRadialGradient(
          spark.x, spark.y, 0,
          spark.x, spark.y, glowRadius
        );
        // High energy = much stronger glow
        const glowIntensity = 0.3 + 0.5 * energyBoost;
        gradient.addColorStop(0, colorToCSS(spark.color, alpha * glowIntensity));
        gradient.addColorStop(0.2, colorToCSS(spark.color, alpha * glowIntensity * 0.5));
        gradient.addColorStop(0.5, colorToCSS(spark.color, alpha * glowIntensity * 0.15));
        gradient.addColorStop(1, colorToCSS(spark.color, 0));

        ctx.beginPath();
        ctx.arc(spark.x, spark.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core - brighter with energy
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = colorToCSS(spark.color, alpha * (0.5 + 0.4 * energyBoost));
        ctx.fill();

        // Center dot - more prominent with energy
        const dotSize = radius * (0.3 + 0.3 * energyBoost);
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = colorToCSS([255, 255, 255], alpha * (0.5 + 0.5 * energyBoost));
        ctx.fill();

        // Polarity ring (visible when giving)
        if (spark.ringAlpha > 0.05) {
          ctx.beginPath();
          ctx.arc(spark.x, spark.y, radius * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = colorToCSS(spark.color, spark.ringAlpha * alpha);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    animate(time) {
      this.update(time);
      this.draw();
      requestAnimationFrame(t => this.animate(t));
    }

    start() {
      // Initial sparks
      const initial = Math.floor(this.sparkCount * 0.4);
      for (let i = 0; i < initial; i++) {
        this.spawnSpark();
      }
      requestAnimationFrame(t => this.animate(t));
    }
  }

  // ============================================
  // Initialize on DOM ready
  // ============================================

  const init = () => {
    const canvas = document.getElementById('nn-canvas');
    if (canvas) {
      const system = new SparkSystem(canvas);
      system.start();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
