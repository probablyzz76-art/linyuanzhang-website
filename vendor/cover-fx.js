// 项目封面微动效 — 轻量 Canvas 2D，跟随鼠标，统一风格、四主题各异
// 主题：mootain(情绪泡) / justice(节点网) / dashboard(迷你仪表) / blocks(体素方块)
(() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  class CoverFX {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.theme = canvas.dataset.fx || 'mootain';
      this.w = 0; this.h = 0; this.dpr = 1; this.sized = false;
      this.mouse = { x: 0, y: 0, tx: 0, ty: 0, active: false };
      this.parts = [];
      this.t = 0;
      const host = canvas.parentElement || canvas;
      host.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.tx = e.clientX - r.left; this.mouse.ty = e.clientY - r.top; this.mouse.active = true;
      });
      host.addEventListener('pointerleave', () => { this.mouse.active = false; });
      this.resize();
      if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); }
    }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) { this.sized = false; return; }
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(r.width * this.dpr);
      this.canvas.height = Math.round(r.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.w = r.width; this.h = r.height;
      this.mouse.x = this.w / 2; this.mouse.y = this.h / 2;
      this.mouse.tx = this.w / 2; this.mouse.ty = this.h / 2;
      this.sized = true; this.init();
    }
    init() {
      const { w, h } = this; this.parts = [];
      if (this.theme === 'mootain') {
        const cols = ['#f9a8d4', '#a5b4fc', '#bae6fd', '#fde68a', '#c4b5fd', '#fbcfe8'];
        for (let i = 0; i < 14; i++) this.parts.push({ x: rand(0, w), y: rand(0, h), r: rand(16, 46), vx: rand(-.18, .18), vy: rand(-.14, .14), ph: rand(0, 6.28), c: cols[i % cols.length] });
      } else if (this.theme === 'justice') {
        for (let i = 0; i < 14; i++) this.parts.push({ x: rand(0, w), y: rand(0, h), vx: rand(-.25, .25), vy: rand(-.25, .25) });
      } else if (this.theme === 'dashboard') {
        const n = Math.max(10, Math.floor(w / 26));
        for (let i = 0; i < n; i++) this.parts.push({ base: rand(.18, .55), amp: rand(.08, .28), sp: rand(.6, 1.6), ph: rand(0, 6.28) });
      } else if (this.theme === 'blocks') {
        for (let i = 0; i < 12; i++) this.parts.push({ x: rand(.12, .88) * w, y: rand(.18, .85) * h, s: rand(12, 22), ph: rand(0, 6.28), lift: 0 });
      }
    }
    step(dt) {
      if (!this.sized) return;
      const ctx = this.ctx, w = this.w, h = this.h;
      this.t += dt;
      this.mouse.x = lerp(this.mouse.x, this.mouse.tx, .12);
      this.mouse.y = lerp(this.mouse.y, this.mouse.ty, .12);
      ctx.clearRect(0, 0, w, h);
      const m = this.mouse;
      if (this.theme === 'mootain') {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.parts) {
          p.x += p.vx; p.y += p.vy; p.ph += .015;
          if (m.active) { const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) + .001; if (d < 120) { p.x += (dx / d) * (120 - d) * .03; p.y += (dy / d) * (120 - d) * .03; } }
          if (p.x < -60) p.x = w + 60; if (p.x > w + 60) p.x = -60; if (p.y < -60) p.y = h + 60; if (p.y > h + 60) p.y = -60;
          const r = p.r * (0.82 + 0.18 * Math.sin(p.ph));
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.c + 'cc'); g.addColorStop(1, p.c + '00');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (this.theme === 'justice') {
        for (const p of this.parts) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
          if (m.active) { const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) + .001; if (d < 140) { p.x += dx / d * .5; p.y += dy / d * .5; } }
        }
        for (let i = 0; i < this.parts.length; i++) for (let j = i + 1; j < this.parts.length; j++) {
          const a = this.parts[i], b = this.parts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 96) { ctx.strokeStyle = `rgba(0,240,255,${(1 - d / 96) * .45})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        for (const p of this.parts) {
          if (m.active) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < 150) { ctx.strokeStyle = `rgba(255,59,48,${(1 - d / 150) * .6})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } }
          ctx.fillStyle = '#ff5a4d'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, 6.2832); ctx.fill();
        }
      } else if (this.theme === 'dashboard') {
        const n = this.parts.length, gap = w / n, bw = gap * .56;
        for (let i = 0; i < n; i++) {
          const p = this.parts[i];
          let v = p.base + p.amp * (0.5 + 0.5 * Math.sin(this.t * .002 * p.sp + p.ph));
          if (m.active) { const bx = i * gap + gap / 2; const d = Math.abs(bx - m.x); if (d < 70) v += (1 - d / 70) * .25; }
          v = clamp(v, .05, .95);
          const bh = v * h * .82, bx = i * gap + (gap - bw) / 2, by = h - bh - 4;
          ctx.fillStyle = `rgba(94,122,104,${.28 + v * .35})`;
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = 'rgba(94,122,104,.5)'; ctx.fillRect(bx, by, bw, 2);
        }
        const scanY = (this.t * .03) % h;
        ctx.strokeStyle = 'rgba(94,122,104,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(w, scanY); ctx.stroke();
      } else if (this.theme === 'blocks') {
        const cube = (cx, cy, s) => {
          const k = .5;
          // top
          ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath();
          ctx.moveTo(cx, cy - s * k); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s * k); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
          // left
          ctx.fillStyle = 'rgba(205,238,233,.34)'; ctx.beginPath();
          ctx.moveTo(cx - s, cy); ctx.lineTo(cx, cy + s * k); ctx.lineTo(cx, cy + s * k + s); ctx.lineTo(cx - s, cy + s); ctx.closePath(); ctx.fill();
          // right
          ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath();
          ctx.moveTo(cx + s, cy); ctx.lineTo(cx, cy + s * k); ctx.lineTo(cx, cy + s * k + s); ctx.lineTo(cx + s, cy + s); ctx.closePath(); ctx.fill();
        };
        const sorted = this.parts.slice().sort((a, b) => a.y - b.y);
        for (const p of sorted) {
          p.ph += .02;
          let targetLift = 0;
          if (m.active) { const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < 90) targetLift = (1 - d / 90) * 14; }
          p.lift = lerp(p.lift, targetLift, .12);
          const bob = Math.sin(p.ph) * 2.5;
          cube(p.x, p.y - bob - p.lift, p.s);
        }
      }
    }
  }

  let instances = [];
  let last = 0;
  function loop(now) {
    const dt = Math.min(40, now - last || 16); last = now;
    for (const fx of instances) fx.step(dt);
    requestAnimationFrame(loop);
  }
  function start() {
    const canvases = document.querySelectorAll('canvas.cover-fx');
    if (!canvases.length) return;
    instances = Array.from(canvases).map(c => new CoverFX(c));
    requestAnimationFrame(loop);
  }
  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
