import * as THREE from 'three';

const WORLD_SIZE = 4000;
const WORLD_HALF = 2000;
const WATER_Y = -1.0;
const GRAVITY = 19.6;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MPS_TO_MPH = 2.23694;

const G = {
  scene: null, camera: null, renderer: null, post: null, world: null, audio: null, input: null, fx: null,
  tod: null, weather: null, ocean: null, sky: null, lights: null, crowd: null, wheels: null,
  vehicles: [], npcs: [], projectiles: [], protagonists: [], player: null, controller: null, camRig: null,
  traffic: null, peds: null, police: null, wanted: null, combat: null, missions: null, hud: null, phone: null,
  cash: 25000, time: 0, dt: 0, timeScale: 1, paused: true, started: false, frame: 0, focus: new THREE.Vector3(),
  events: [], switching: false, showFps: false, slowmo: 0
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const sign = v => (v < 0 ? -1 : 1);
const wrapAngle = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');

class RNG {
  constructor(seed = 1) { this.s = seed >>> 0 || 1; }
  next() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(a + this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += valueNoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

const _col = new THREE.Color();
function linCol(hex) { _col.set(hex); return [_col.r, _col.g, _col.b]; }
function hexLerp(a, b, t) { const ca = new THREE.Color(a), cb = new THREE.Color(b); return ca.lerp(cb, t); }

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _s = new THREE.Vector3();

function xf(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _m4.compose(_v1.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m4);
  return geo;
}
function paint(geo, hex) {
  const n = geo.attributes.position.count;
  const c = linCol(hex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function mergeGeos(list) {
  const geos = list.filter(Boolean);
  let vCount = 0, iCount = 0;
  const hasColor = geos.some(g => g.attributes.color);
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3), nrm = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const col = hasColor ? new Float32Array(vCount * 3) : null;
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    const pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      pos[(vo + i) * 3] = pa.getX(i); pos[(vo + i) * 3 + 1] = pa.getY(i); pos[(vo + i) * 3 + 2] = pa.getZ(i);
      nrm[(vo + i) * 3] = na.getX(i); nrm[(vo + i) * 3 + 1] = na.getY(i); nrm[(vo + i) * 3 + 2] = na.getZ(i);
    }
    if (g.attributes.uv) { const ua = g.attributes.uv; for (let i = 0; i < n; i++) { uv[(vo + i) * 2] = ua.getX(i); uv[(vo + i) * 2 + 1] = ua.getY(i); } }
    if (col) {
      if (g.attributes.color) { const ca = g.attributes.color; for (let i = 0; i < n; i++) { col[(vo + i) * 3] = ca.getX(i); col[(vo + i) * 3 + 1] = ca.getY(i); col[(vo + i) * 3 + 2] = ca.getZ(i); } }
      else col.fill(1, vo * 3, (vo + n) * 3);
    }
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io++] = ia[i] + vo; }
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}
const gBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const gCyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const gSphere = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const gCapsule = (r, len, cs = 3, rs = 8) => new THREE.CapsuleGeometry(r, len, cs, rs);
function gCone(r, h, seg = 10) { return new THREE.ConeGeometry(r, h, seg); }
function gWedge(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(d / 2, h); shape.lineTo(-d / 2, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(w, h, draw, opts = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opts.aniso || 8;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
function radialSprite(size, stops) {
  return canvasTex(size, size, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [o, c] of stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }, { clamp: true });
}

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.hits = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.lmb = false; this.rmb = false; this.lmbHit = false; this.rmbHit = false;
    this.locked = false;
    this.wantLock = false;
    this.onLockChange = null;
    const block = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backquote', 'KeyQ']);
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.hits.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    window.addEventListener('mousemove', e => { if (this.locked) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) { this.lmb = true; this.lmbHit = true; }
      if (e.button === 2) { this.rmb = true; this.rmbHit = true; }
      if (!this.locked && this.wantLock) this.lock();
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.lmb = false; this.rmb = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { } }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.hits.has(c); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }
  endFrame() { this.hits.clear(); this.mdx = 0; this.mdy = 0; this.wheel = 0; this.lmbHit = false; this.rmbHit = false; }
}

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }
