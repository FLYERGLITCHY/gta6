const SIDEWALK = 4.5;
const ROAD_DEF = {
  street: { hw: 6, lanes: 1, median: 0, shoulder: 0, speed: 14 },
  blvd: { hw: 10, lanes: 2, median: 1, shoulder: 0, speed: 18 },
  hwy: { hw: 11, lanes: 2, median: 1, shoulder: 1, speed: 28 },
  ramp: { hw: 6.5, lanes: 1, median: 0, shoulder: 0.5, speed: 18 },
  bridge: { hw: 12, lanes: 2, median: 1, shoulder: 1.5, speed: 24 },
  causeway: { hw: 7, lanes: 1, median: 0, shoulder: 1, speed: 18 }
};
const LAND_SHAPES = [
  { cx: -665, cz: -265, hx: 1185, hz: 1585, r: 260, noise: 34, seed: 11 },
  { cx: 1260, cz: -300, hx: 300, hz: 1450, r: 170, noise: 20, seed: 23 },
  { cx: 750, cz: -640, hx: 80, hz: 60, r: 55, noise: 8, seed: 37 },
  { cx: 0, cz: 1760, hx: 450, hz: 120, r: 110, noise: 14, seed: 51 }
];
const CALM = [[520, -200], [960, -200], [520, -1100], [960, -1100], [0, 1320], [0, 1640], [300, -200]];
const ZONES = [
  { name: 'Ocean Drive', sub: 'Vice Beach', x0: 1268, x1: 1750, z0: -1900, z1: 1300 },
  { name: 'Vice Beach', sub: 'Washington Avenue', x0: 900, x1: 1268, z0: -1900, z1: 1300 },
  { name: 'Starfish Island', sub: 'Biscayne Bay', x0: 650, x1: 860, z0: -740, z1: -540 },
  { name: 'Downtown Vice', sub: 'Financial District', x0: -700, x1: 330, z0: -900, z1: 100 },
  { name: 'Bayside', sub: 'Waterfront', x0: 330, x1: 600, z0: -1150, z1: 380 },
  { name: 'Wynwood', sub: 'Arts District', x0: -700, x1: 330, z0: -1310, z1: -900 },
  { name: 'Overtown', sub: 'Vice City', x0: -700, x1: 330, z0: 100, z1: 620 },
  { name: 'Little Havana', sub: 'Vice City', x0: -1530, x1: -700, z0: -1310, z1: 620 },
  { name: 'Port of Leonida', sub: 'Industrial Docks', x0: -1350, x1: 380, z0: 620, z1: 1550 },
  { name: 'Everglade Heights', sub: 'Leonida', x0: -1900, x1: 600, z0: -1950, z1: -1310 },
  { name: 'Leonida Airfield', sub: 'West Leonida', x0: -1950, x1: -1530, z0: -1310, z1: 1400 },
  { name: 'Leonida Keys', sub: 'Southern Islands', x0: -520, x1: 520, z0: 1580, z1: 1960 }
];
function sdRoundBox(px, pz, hx, hz, r) {
  const qx = Math.abs(px) - hx + r, qz = Math.abs(pz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

class World {
  constructor(scene) {
    this.scene = scene;
    this.HM = 768;
    this.hmCell = WORLD_SIZE / this.HM;
    this.hm = new Float32Array((this.HM + 1) * (this.HM + 1));
    this.nodes = []; this.edges = []; this.nodeMap = new Map();
    this.decks = []; this.ramps = []; this.cols = [];
    this.CG = 40; this.cgN = Math.ceil(WORLD_SIZE / this.CG);
    this.cgrid = new Array(this.cgN * this.cgN);
    this.dgrid = new Array(this.cgN * this.cgN);
    this.EG = 120; this.egN = Math.ceil(WORLD_SIZE / this.EG);
    this.egrid = new Array(this.egN * this.egN);
    this.ngrid = new Array(this.egN * this.egN);
    this.stamp = 1;
    this.zones = ZONES;
    this.buildings = [];
    this.signals = [];
    this.pedZones = [];
    this.parkingSpots = [];
    this.hospitals = [new THREE.Vector3(-150, 0, -48), new THREE.Vector3(1150, 0, 308), new THREE.Vector3(-600, 0, 708)];
    this.policeStations = [new THREE.Vector3(-350, 0, -648), new THREE.Vector3(1120, 0, -908), new THREE.Vector3(-900, 0, 108)];
    this.night = 0; this.wet = 0; this.time = 0;
    this.piers = [];
  }
  noiseMask(x, z) {
    let m = 1;
    const qx = Math.max(-1300 - x, x - 340, 0), qz = Math.max(1150 - z, 0);
    m = Math.min(m, smoothstep(0, 90, Math.hypot(qx, qz)));
    for (const [px, pz] of CALM) m = Math.min(m, smoothstep(40, 130, Math.hypot(x - px, z - pz)));
    return m;
  }
  landSDF(x, z) {
    let d = 1e9;
    for (const s of LAND_SHAPES) {
      let sd = sdRoundBox(x - s.cx, z - s.cz, s.hx, s.hz, s.r);
      if (sd < 160) { const m = this.noiseMask(x, z); if (m > 0) sd += (fbm(x * 0.0045 + s.seed, z * 0.0045 - s.seed, 3) - 0.5) * 2 * s.noise * m; }
      if (sd < d) d = sd;
    }
    const lake = Math.hypot(x + 700, z + 1600) - 70 - (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 10;
    return Math.max(d, -lake);
  }
  heightFromD(x, z, d) {
    const din = -d;
    if (x > -1300 && x < 340 && z > 1180 && z < 1520) return din >= 0 ? 0 : din > -3 ? lerp(0, -8, -din / 3) : -8;
    if (din >= 28) return 0;
    if (din >= 0) return lerp(-1.2, 0, smoothstep(0, 28, din));
    const w = -din;
    return -1.2 - Math.min(12, w * 0.08 + w * w * 0.00035);
  }
  zoneAt(x, z) { for (const zn of ZONES) if (x >= zn.x0 && x < zn.x1 && z >= zn.z0 && z < zn.z1) return zn; return null; }
  bakeTerrain() {
    const N = this.HM + 1, c = this.hmCell;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + i * c, z = -WORLD_HALF + j * c;
      this.hm[j * N + i] = this.heightFromD(x, z, this.landSDF(x, z));
    }
  }
  terrainH(x, z) {
    const fx = (x + WORLD_HALF) / this.hmCell, fz = (z + WORLD_HALF) / this.hmCell;
    if (fx < 0 || fz < 0 || fx >= this.HM || fz >= this.HM) return -14;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, N = this.HM + 1, i = iz * N + ix, h = this.hm;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - tz) + (h[i + N] * (1 - tx) + h[i + N + 1] * tx) * tz;
  }
  isWater(x, z) { return this.terrainH(x, z) < WATER_Y - 0.5; }
  cell(x, z, cs, n) { const cx = Math.floor((x + WORLD_HALF) / cs), cz = Math.floor((z + WORLD_HALF) / cs); return (cx < 0 || cz < 0 || cx >= n || cz >= n) ? -1 : cz * n + cx; }
  gridInsert(grid, cs, n, minX, maxX, minZ, maxZ, item) {
    const i0 = clamp(Math.floor((minX + WORLD_HALF) / cs), 0, n - 1), i1 = clamp(Math.floor((maxX + WORLD_HALF) / cs), 0, n - 1);
    const j0 = clamp(Math.floor((minZ + WORLD_HALF) / cs), 0, n - 1), j1 = clamp(Math.floor((maxZ + WORLD_HALF) / cs), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * n + i; (grid[k] || (grid[k] = [])).push(item); }
  }
  addBox(minX, maxX, minZ, maxZ, minY, maxY, kind = 'building', extra) {
    const c = { t: 0, minX, maxX, minZ, maxZ, minY, maxY, kind };
    if (extra) Object.assign(c, extra);
    this.cols.push(c);
    this.gridInsert(this.cgrid, this.CG, this.cgN, minX, maxX, minZ, maxZ, c);
    return c;
  }
  addCircle(x, z, r, minY, maxY, kind = 'prop') {
    const c = { t: 1, x, z, r, minY, maxY, kind, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r };
    this.cols.push(c);
    this.gridInsert(this.cgrid, this.CG, this.cgN, x - r, x + r, z - r, z + r, c);
    return c;
  }
  getNode(x, z, y = 0) {
    const k = Math.round(x) + ',' + Math.round(z);
    let n = this.nodeMap.get(k);
    if (!n) {
      n = { id: this.nodes.length, x, z, y, edges: [], signal: false, phase: Math.random() * 20, hx: 0, hz: 0, deck: y > 0.5, heads: [] };
      this.nodes.push(n); this.nodeMap.set(k, n);
      this.gridInsert(this.ngrid, this.EG, this.egN, x, x, z, z, n);
    }
    return n;
  }
  addEdge(a, b, type, pts, deck = false) {
    const def = ROAD_DEF[type];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const e = { id: this.edges.length, a: a.id, b: b.id, type, pts, len, hw: def.hw, lanes: def.lanes, median: def.median, shoulder: def.shoulder, speed: def.speed, deck, laneW: (def.hw - def.median - def.shoulder) / def.lanes, axis: deck ? 'deck' : (Math.abs(pts[0].x - pts[pts.length - 1].x) < 1 ? 'ns' : 'ew') };
    this.edges.push(e);
    a.edges.push(e.id); b.edges.push(e.id);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    this.gridInsert(this.egrid, this.EG, this.egN, minX - def.hw, maxX + def.hw, minZ - def.hw, maxZ + def.hw, e);
    return e;
  }
  laneOffset(e, lane) { return e.median + e.laneW * (lane + 0.5); }
  addDeckSegment(x0, z0, y0, x1, z1, y1, hw, railed, kind) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 0.01;
    const s = { x0, z0, y0, x1, z1, y1, hw, railed, kind, len, dx: dx / len, dz: dz / len, nx: -dz / len, nz: dx / len };
    this.decks.push(s);
    this.gridInsert(this.dgrid, this.CG, this.cgN, Math.min(x0, x1) - hw, Math.max(x0, x1) + hw, Math.min(z0, z1) - hw, Math.max(z0, z1) + hw, s);
    return s;
  }
  addDeckRoad(type, raw, railed = true) {
    const pts = raw.map(p => ({ x: p[0], z: p[1], y: p[2] }));
    const a = this.getNode(pts[0].x, pts[0].z, pts[0].y), b = this.getNode(pts[pts.length - 1].x, pts[pts.length - 1].z, pts[pts.length - 1].y);
    const e = this.addEdge(a, b, type, pts, true);
    const hw = ROAD_DEF[type].hw;
    for (let i = 1; i < pts.length; i++) this.addDeckSegment(pts[i - 1].x, pts[i - 1].z, pts[i - 1].y, pts[i].x, pts[i].z, pts[i].y, hw, railed, type);
    return e;
  }
  addStuntRamp(x0, z0, y0, x1, z1, y1, hw) { this.addDeckSegment(x0, z0, y0, x1, z1, y1, hw, false, 'stunt'); this.ramps.push({ x0, z0, y0, x1, z1, y1, hw }); }
  arc(cx, cz, r, a0, a1, n, y) { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, y]); } return o; }
  buildRoads() {
    const lines = [];
    const ns = (x, z0, z1, type) => lines.push({ axis: 'ns', c: x, a: Math.min(z0, z1), b: Math.max(z0, z1), type, splits: new Set([z0, z1]) });
    const ew = (z, x0, x1, type) => lines.push({ axis: 'ew', c: z, a: Math.min(x0, x1), b: Math.max(x0, x1), type, splits: new Set([x0, x1]) });
    for (let x = -1500; x <= 300; x += 100) ns(x, -1300, 600, [-1100, -400, 0].includes(x) ? 'blvd' : 'street');
    for (const x of [-400, 0]) ns(x, -1700, -1300, 'blvd');
    for (const x of [-1000, 200]) ns(x, -1700, -1300, 'street');
    for (let z = -1300; z <= 600; z += 100) ew(z, z === -200 ? -1640 : -1500, [-1100, -800, -500, -100, 200, 300].includes(z) ? 460 : 300, [-600, -200].includes(z) ? 'blvd' : 'street');
    ew(-1500, -1500, 300, 'street');
    ew(-1700, -1000, 200, 'street');
    ns(460, -1100, 300, 'blvd');
    for (let x = -1200; x <= 200; x += 200) ns(x, 600, 1300, [-400, 0].includes(x) ? 'blvd' : 'street');
    for (const z of [800, 1000, 1200]) ew(z, -1200, 200, 'street');
    ns(1060, -1600, 1000, 'street'); ns(1180, -1600, 1000, 'blvd'); ns(1320, -1500, 1000, 'street');
    ew(-1600, 1060, 1180, 'street');
    for (let z = -1500; z <= 1000; z += 100) ew(z, z === -200 ? 1110 : z === -1100 ? 1000 : 1060, 1320, 'street');
    ns(0, 1700, 1760, 'street'); ew(1760, -400, 400, 'street');
    const nsL = lines.filter(l => l.axis === 'ns'), ewL = lines.filter(l => l.axis === 'ew');
    for (const A of nsL) for (const B of ewL) if (B.c >= A.a - 0.5 && B.c <= A.b + 0.5 && A.c >= B.a - 0.5 && A.c <= B.b + 0.5) { A.splits.add(B.c); B.splits.add(A.c); }
    const bay = nsL.find(l => l.c === 460);
    const e1100 = ewL.find(l => l.c === -1100), e300 = ewL.find(l => l.c === 300);
    e1100.splits.add(-750); e300.splits.add(-750); bay.splits.add(-950); bay.splits.add(150);
    for (const l of lines) {
      const s = [...l.splits].sort((p, q) => p - q);
      for (let i = 1; i < s.length; i++) {
        if (s[i] - s[i - 1] < 2) continue;
        const p0 = l.axis === 'ns' ? [l.c, s[i - 1]] : [s[i - 1], l.c];
        const p1 = l.axis === 'ns' ? [l.c, s[i]] : [s[i], l.c];
        this.addEdge(this.getNode(p0[0], p0[1]), this.getNode(p1[0], p1[1]), l.type, [{ x: p0[0], y: 0, z: p0[1] }, { x: p1[0], y: 0, z: p1[1] }]);
      }
    }
    const H = 12, corner = (cx, cz, a0, a1) => this.arc(cx, cz, 60, a0, a1, 6, H);
    this.addDeckRoad('hwy', [...corner(-690, -890, Math.PI, Math.PI * 1.5), [-200, -950, H], [290, -950, H]]);
    this.addDeckRoad('hwy', [...corner(290, -890, Math.PI * 1.5, TAU), [350, -400, H], ...corner(290, 90, 0, Math.PI / 2)]);
    this.addDeckRoad('hwy', [[290, 150, H], [-200, 150, H], ...corner(-690, 90, Math.PI / 2, Math.PI)]);
    this.addDeckRoad('hwy', [[-750, 90, H], [-750, -890, H]]);
    this.addDeckRoad('ramp', [[-750, -890, H], [-750, -995, 6], [-750, -1100, 0]]);
    this.addDeckRoad('ramp', [[-750, 90, H], [-750, 195, 6], [-750, 300, 0]]);
    this.addDeckRoad('ramp', [[290, -950, H], [375, -950, 6], [460, -950, 0]]);
    this.addDeckRoad('ramp', [[290, 150, H], [375, 150, 6], [460, 150, 0]]);
    this.addDeckRoad('bridge', [[300, -200, 0], [460, -200, 12], [740, -200, 16], [960, -200, 14], [1110, -200, 0]]);
    this.addDeckRoad('causeway', [[460, -1100, 0], [600, -1100, 4.5], [820, -1100, 4.5], [1000, -1100, 0]]);
    this.addDeckRoad('bridge', [[0, 1300, 0], [0, 1400, 12], [0, 1560, 14], [0, 1660, 4], [0, 1700, 0]]);
    this.addStuntRamp(-940, 975, 0, -940, 945, 7, 6);
    this.addStuntRamp(-940, 900, 5, -940, 850, 0, 6);
    this.addStuntRamp(-870, 820, 0, -870, 848, 2.8, 4);
    this.addStuntRamp(1460, 820, 0, 1460, 860, 4.5, 5);
    this.addStuntRamp(-1700, 200, 0, -1700, 150, 7, 7);
    for (const n of this.nodes) {
      let hx = 0, hz = 0, blvd = false, ground = 0;
      for (const id of n.edges) { const e = this.edges[id]; if (e.deck) continue; ground++; if (e.axis === 'ns') hx = Math.max(hx, e.hw); else hz = Math.max(hz, e.hw); if (e.type === 'blvd') blvd = true; }
      n.hx = hx || hz; n.hz = hz || hx;
      n.signal = blvd && ground >= 3 && !n.deck;
      if (n.signal) this.signals.push(n);
    }
  }
  signalState(n, axis) {
    if (!n || !n.signal) return 'g';
    const t = (this.time + n.phase) % 22;
    const ns = t < 9 ? 'g' : t < 11 ? 'y' : 'r';
    const ew = t < 11 ? 'r' : t < 20 ? 'g' : 'y';
    return axis === 'ns' ? ns : ew;
  }
  deckHeightAt(s, x, z) {
    const rx = x - s.x0, rz = z - s.z0, t = (rx * s.dx + rz * s.dz) / s.len;
    if (t < -0.02 || t > 1.02) return null;
    if (Math.abs(rx * s.nx + rz * s.nz) > s.hw) return null;
    return s.y0 + (s.y1 - s.y0) * clamp(t, 0, 1);
  }
  surfaceH(x, z, y = 1e5, stepUp = 0.6) {
    let best = this.terrainH(x, z);
    const ci = this.cell(x, z, this.CG, this.cgN);
    if (ci < 0) return best;
    const da = this.dgrid[ci];
    if (da) for (const s of da) { const h = this.deckHeightAt(s, x, z); if (h !== null && h <= y + stepUp && h > best) best = h; }
    const ca = this.cgrid[ci];
    if (ca) for (const c of ca) {
      if (c.maxY > y + stepUp || c.maxY <= best) continue;
      if (c.t === 0) { if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.kind !== 'building') best = c.maxY; }
      else if (c.walkTop && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) best = c.maxY;
    }
    return best;
  }
  groundInfo(x, z, y = 1e5, stepUp = 0.6, out = {}) {
    let best = this.terrainH(x, z), kind = 'terrain', deck = null;
    const ci = this.cell(x, z, this.CG, this.cgN);
    if (ci >= 0) {
      const da = this.dgrid[ci];
      if (da) for (const s of da) { const h = this.deckHeightAt(s, x, z); if (h !== null && h <= y + stepUp && h > best) { best = h; kind = 'deck'; deck = s; } }
      const ca = this.cgrid[ci];
      if (ca) for (const c of ca) if (c.t === 0 && c.kind !== 'building' && c.maxY <= y + stepUp && c.maxY > best && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) { best = c.maxY; kind = c.kind; deck = null; }
    }
    out.h = best; out.kind = kind; out.deck = deck;
    out.surf = kind === 'terrain' ? (best < WATER_Y - 0.05 ? 'water' : 'ground') : 'road';
    return out;
  }
  railPush(x, z, y, r, out) {
    out.hit = false;
    const ci = this.cell(x, z, this.CG, this.cgN);
    if (ci < 0) return out;
    const da = this.dgrid[ci];
    if (!da) return out;
    let inside = false, best = 0, nx = 0, nz = 0;
    for (const s of da) {
      if (!s.railed) continue;
      const rx = x - s.x0, rz = z - s.z0, t = (rx * s.dx + rz * s.dz) / s.len;
      if (t < -0.04 || t > 1.04) continue;
      const h = s.y0 + (s.y1 - s.y0) * clamp(t, 0, 1);
      if (h < 0.8 || Math.abs(y - h) > 1.7) continue;
      const lat = rx * s.nx + rz * s.nz, lim = s.hw - r;
      if (Math.abs(lat) <= lim) { inside = true; break; }
      if (Math.abs(lat) < s.hw + 5) { const pen = Math.abs(lat) - lim; if (!best || pen < best) { best = pen; const sg = lat > 0 ? -1 : 1; nx = s.nx * sg; nz = s.nz * sg; } }
    }
    if (!inside && best > 0) { out.hit = true; out.nx = nx; out.nz = nz; out.depth = best; }
    return out;
  }
  forColliders(minX, maxX, minZ, maxZ, fn) {
    const cs = this.CG, n = this.cgN, stamp = ++this.stamp;
    const i0 = clamp(Math.floor((minX + WORLD_HALF) / cs), 0, n - 1), i1 = clamp(Math.floor((maxX + WORLD_HALF) / cs), 0, n - 1);
    const j0 = clamp(Math.floor((minZ + WORLD_HALF) / cs), 0, n - 1), j1 = clamp(Math.floor((maxZ + WORLD_HALF) / cs), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const arr = this.cgrid[j * n + i]; if (!arr) continue;
      for (const c of arr) { if (c.s === stamp) continue; c.s = stamp; if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue; fn(c); }
    }
  }
  collideCircle(x, z, r, y0, y1, out, stepUp = 0.55) {
    out.x = x; out.z = z; out.hit = false; out.nx = 0; out.nz = 0; out.col = null;
    for (let iter = 0; iter < 2; iter++) this.forColliders(out.x - r, out.x + r, out.z - r, out.z + r, c => {
      if (c.maxY <= y0 + stepUp || c.minY >= y1 || c.noChar) return;
      if (c.t === 0) {
        const px = clamp(out.x, c.minX, c.maxX), pz = clamp(out.z, c.minZ, c.maxZ);
        let dx = out.x - px, dz = out.z - pz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); dx /= d; dz /= d; out.x += dx * (r - d); out.z += dz * (r - d); out.nx = dx; out.nz = dz; }
        else { const l = out.x - c.minX, rr = c.maxX - out.x, t = out.z - c.minZ, b = c.maxZ - out.z, m = Math.min(l, rr, t, b);
          if (m === l) { out.x = c.minX - r; out.nx = -1; } else if (m === rr) { out.x = c.maxX + r; out.nx = 1; } else if (m === t) { out.z = c.minZ - r; out.nz = -1; } else { out.z = c.maxZ + r; out.nz = 1; } }
        out.hit = true; out.col = c;
      } else {
        let dx = out.x - c.x, dz = out.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
        if (d >= m) return;
        if (d < 1e-5) { dx = 1; dz = 0; d = 1; }
        out.x = c.x + dx / d * m; out.z = c.z + dz / d * m; out.nx = dx / d; out.nz = dz / d; out.hit = true; out.col = c;
      }
    });
    return out;
  }
  collideOBB(cx, cz, yaw, hl, hw, y0, y1, contacts, stepUp = 0.6) {
    contacts.length = 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const ex = hl * Math.abs(fx) + hw * Math.abs(rx), ez = hl * Math.abs(fz) + hw * Math.abs(rz);
    this.forColliders(cx - ex, cx + ex, cz - ez, cz + ez, c => {
      if (c.maxY <= y0 + stepUp || c.minY >= y1 || c.noCar) return;
      if (c.t === 0) {
        const bx = (c.minX + c.maxX) / 2, bz = (c.minZ + c.maxZ) / 2, bex = (c.maxX - c.minX) / 2, bez = (c.maxZ - c.minZ) / 2;
        const dx = cx - bx, dz = cz - bz;
        let best = 1e9, nx = 0, nz = 0;
        const tests = [[bex + ex - Math.abs(dx), Math.sign(dx) || 1, 0], [bez + ez - Math.abs(dz), 0, Math.sign(dz) || 1]];
        const pf = dx * fx + dz * fz, pr = dx * rx + dz * rz;
        const of = hl + bex * Math.abs(fx) + bez * Math.abs(fz) - Math.abs(pf);
        const orr = hw + bex * Math.abs(rx) + bez * Math.abs(rz) - Math.abs(pr);
        tests.push([of, fx * (Math.sign(pf) || 1), fz * (Math.sign(pf) || 1)], [orr, rx * (Math.sign(pr) || 1), rz * (Math.sign(pr) || 1)]);
        for (const [pen, ax, az] of tests) { if (pen <= 0) return; if (pen < best) { best = pen; nx = ax; nz = az; } }
        contacts.push({ nx, nz, depth: best, px: cx, pz: cz, col: c });
      } else {
        const lx = (c.x - cx) * rx + (c.z - cz) * rz, lz = (c.x - cx) * fx + (c.z - cz) * fz;
        const qx = clamp(lx, -hw, hw), qz = clamp(lz, -hl, hl);
        const ddx = lx - qx, ddz = lz - qz, d = Math.hypot(ddx, ddz);
        if (d >= c.r) return;
        let wx, wz;
        if (d > 1e-4) { wx = -(ddx * rx + ddz * fx) / d; wz = -(ddx * rz + ddz * fz) / d; }
        else { const dd = Math.hypot(cx - c.x, cz - c.z) || 1; wx = (cx - c.x) / dd; wz = (cz - c.z) / dd; }
        contacts.push({ nx: wx, nz: wz, depth: c.r - d, px: c.x, pz: c.z, col: c });
      }
    });
    return contacts;
  }
  raycast(ox, oy, oz, dx, dy, dz, maxT, opts = {}) {
    let best = maxT, hit = null;
    const cs = this.CG, n = this.cgN, stamp = ++this.stamp;
    const test = ci => {
      const ca = this.cgrid[ci];
      if (ca) for (const c of ca) {
        if (c.s === stamp) continue; c.s = stamp;
        if (opts.noProps && c.kind !== 'building' && c.kind !== 'container') continue;
        if (c.t === 0) {
          let t0 = 0, t1 = best, axis = -1, sgn = 0, ok = true;
          const ax = [[ox, dx, c.minX, c.maxX, 0], [oy, dy, c.minY, c.maxY, 1], [oz, dz, c.minZ, c.maxZ, 2]];
          for (const [o, d, mn, mx, ai] of ax) {
            if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) ok = false; continue; }
            let ta = (mn - o) / d, tb = (mx - o) / d, s = -1;
            if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
            if (ta > t0) { t0 = ta; axis = ai; sgn = s; }
            if (tb < t1) t1 = tb;
            if (t0 > t1) { ok = false; break; }
          }
          if (ok && t0 >= 0 && t0 < best && axis >= 0) { best = t0; hit = { t: t0, nx: axis === 0 ? sgn : 0, ny: axis === 1 ? sgn : 0, nz: axis === 2 ? sgn : 0, kind: c.kind, col: c }; }
        } else {
          const px = ox - c.x, pz = oz - c.z, a = dx * dx + dz * dz;
          if (a < 1e-8) continue;
          const b = 2 * (px * dx + pz * dz), cc = px * px + pz * pz - c.r * c.r, disc = b * b - 4 * a * cc;
          if (disc < 0) continue;
          const t = (-b - Math.sqrt(disc)) / (2 * a);
          if (t < 0 || t >= best) continue;
          const y = oy + dy * t;
          if (y < c.minY || y > c.maxY) continue;
          const hx = px + dx * t, hz = pz + dz * t, l = Math.hypot(hx, hz) || 1;
          best = t; hit = { t, nx: hx / l, ny: 0, nz: hz / l, kind: c.kind, col: c };
        }
      }
    };
    let cx = Math.floor((ox + WORLD_HALF) / cs), cz = Math.floor((oz + WORLD_HALF) / cs);
    const stepX = dx >= 0 ? 1 : -1, stepZ = dz >= 0 ? 1 : -1;
    const tdx = Math.abs(dx) < 1e-8 ? 1e9 : Math.abs(cs / dx), tdz = Math.abs(dz) < 1e-8 ? 1e9 : Math.abs(cs / dz);
    let tmx = Math.abs(dx) < 1e-8 ? 1e9 : (((cx + (dx >= 0 ? 1 : 0)) * cs - WORLD_HALF) - ox) / dx;
    let tmz = Math.abs(dz) < 1e-8 ? 1e9 : (((cz + (dz >= 0 ? 1 : 0)) * cs - WORLD_HALF) - oz) / dz;
    let guard = 0, t = 0;
    while (t <= best && guard++ < 300) {
      if (cx >= 0 && cz >= 0 && cx < n && cz < n) test(cz * n + cx);
      if (tmx < tmz) { t = tmx; tmx += tdx; cx += stepX; } else { t = tmz; tmz += tdz; cz += stepZ; }
    }
    if (!opts.noTerrain) {
      for (let tt = 0; tt <= best; tt += 2.2) {
        const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt, h = Math.max(this.terrainH(x, z), opts.water ? WATER_Y : -1e9);
        if (y < h) {
          let a = Math.max(0, tt - 2.2), b = tt;
          for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (oy + dy * m < Math.max(this.terrainH(ox + dx * m, oz + dz * m), opts.water ? WATER_Y : -1e9)) b = m; else a = m; }
          if (b < best) { best = b; const water = oy + dy * b < WATER_Y + 0.1 && this.terrainH(ox + dx * b, oz + dz * b) < WATER_Y; hit = { t: b, nx: 0, ny: 1, nz: 0, kind: water ? 'water' : 'ground', col: null }; }
          break;
        }
      }
    }
    if (hit) { hit.x = ox + dx * hit.t; hit.y = oy + dy * hit.t; hit.z = oz + dz * hit.t; }
    return hit;
  }
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    return l < 0.2 || !this.raycast(ax, ay, az, dx / l, dy / l, dz / l, l - 0.4, { noProps: true });
  }
  nearestNode(x, z, filter) {
    let best = null, bd = 1e18;
    for (let r = 0; r < 5 && !best; r++) {
      const ci = Math.floor((x + WORLD_HALF) / this.EG), cj = Math.floor((z + WORLD_HALF) / this.EG);
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= this.egN || j >= this.egN) continue;
        const arr = this.ngrid[j * this.egN + i]; if (!arr) continue;
        for (const nd of arr) { if (filter && !filter(nd)) continue; const d = (nd.x - x) ** 2 + (nd.z - z) ** 2; if (d < bd) { bd = d; best = nd; } }
      }
    }
    return best;
  }
  nearestEdge(x, z, maxD = 50, filter) {
    let best = null, bd = maxD * maxD;
    const stamp = ++this.stamp, rr = Math.ceil(maxD / this.EG);
    const ci = Math.floor((x + WORLD_HALF) / this.EG), cj = Math.floor((z + WORLD_HALF) / this.EG);
    for (let j = cj - rr; j <= cj + rr; j++) for (let i = ci - rr; i <= ci + rr; i++) {
      if (i < 0 || j < 0 || i >= this.egN || j >= this.egN) continue;
      const arr = this.egrid[j * this.egN + i]; if (!arr) continue;
      for (const e of arr) {
        if (e.s === stamp) continue; e.s = stamp;
        if (filter && !filter(e)) continue;
        let acc = 0;
        for (let k = 1; k < e.pts.length; k++) {
          const p = e.pts[k - 1], q = e.pts[k], sx = q.x - p.x, sz = q.z - p.z, sl2 = sx * sx + sz * sz, sl = Math.sqrt(sl2);
          const u = clamp(((x - p.x) * sx + (z - p.z) * sz) / sl2, 0, 1);
          const px = p.x + sx * u, pz = p.z + sz * u, d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < bd) { bd = d; best = { edge: e, u, dist: Math.sqrt(d), x: px, z: pz, y: lerp(p.y, q.y, u), s: acc + sl * u, dx: sx / sl, dz: sz / sl }; }
          acc += sl;
        }
      }
    }
    return best;
  }
  edgePointAt(e, s) {
    let acc = 0;
    for (let k = 1; k < e.pts.length; k++) {
      const p = e.pts[k - 1], q = e.pts[k], sl = Math.hypot(q.x - p.x, q.z - p.z);
      if (acc + sl >= s || k === e.pts.length - 1) { const u = clamp((s - acc) / (sl || 1), 0, 1); return { x: lerp(p.x, q.x, u), y: lerp(p.y, q.y, u), z: lerp(p.z, q.z, u), dx: (q.x - p.x) / (sl || 1), dz: (q.z - p.z) / (sl || 1) }; }
      acc += sl;
    }
    const p = e.pts[0]; return { x: p.x, y: p.y, z: p.z, dx: 1, dz: 0 };
  }
  otherNode(e, id) { return this.nodes[e.a === id ? e.b : e.a]; }
  edgeBetween(a, b) { for (const id of a.edges) { const e = this.edges[id]; if (e.a === b.id || e.b === b.id) return e; } return null; }
  findPath(sx, sz, tx, tz, filter) {
    const s = this.nearestNode(sx, sz), g = this.nearestNode(tx, tz);
    if (!s || !g) return null;
    if (s === g) return [s];
    const open = new Map(), came = new Map(), gs = new Map();
    gs.set(s.id, 0); open.set(s.id, Math.hypot(s.x - g.x, s.z - g.z));
    let guard = 0;
    while (open.size && guard++ < 5000) {
      let cur = -1, cf = 1e18;
      for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
      if (cur === g.id) { const path = [g]; let c = g.id; while (came.has(c)) { c = came.get(c); path.unshift(this.nodes[c]); } return path; }
      open.delete(cur);
      const cn = this.nodes[cur];
      for (const eid of cn.edges) {
        const e = this.edges[eid];
        if (filter && !filter(e)) continue;
        const nb = this.otherNode(e, cur), ng = gs.get(cur) + e.len;
        if (ng < (gs.get(nb.id) ?? 1e18)) { gs.set(nb.id, ng); came.set(nb.id, cur); open.set(nb.id, ng + Math.hypot(nb.x - g.x, nb.z - g.z)); }
      }
    }
    return null;
  }
  pathPoints(nodes) {
    const out = [];
    if (!nodes || !nodes.length) return out;
    out.push({ x: nodes[0].x, y: nodes[0].y, z: nodes[0].z });
    for (let i = 1; i < nodes.length; i++) {
      const e = this.edgeBetween(nodes[i - 1], nodes[i]);
      if (!e) { out.push({ x: nodes[i].x, y: nodes[i].y, z: nodes[i].z }); continue; }
      const pts = e.a === nodes[i - 1].id ? e.pts : [...e.pts].reverse();
      for (let k = 1; k < pts.length; k++) out.push(pts[k]);
    }
    return out;
  }
  gpsRoute(sx, sz, tx, tz) {
    const pts = this.pathPoints(this.findPath(sx, sz, tx, tz));
    pts.unshift({ x: sx, y: 0, z: sz }); pts.push({ x: tx, y: 0, z: tz });
    return pts;
  }
  randomRoadPoint(cx, cz, r0, r1, filter) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * TAU, r = rand(r0, r1);
      const ne = this.nearestEdge(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 40, filter || (e => !e.deck));
      if (ne && Math.hypot(ne.x - cx, ne.z - cz) > r0 * 0.6) return ne;
    }
    return this.nearestEdge(cx, cz, 200, filter || (e => !e.deck));
  }
}
