function tileNoise(size, seed) {
  const rng = new RNG(seed), g = new Float32Array(64);
  for (let i = 0; i < 64; i++) g[i] = rng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size * 8, fy = y / size * 8, ix = fx | 0, iy = fy | 0;
    const tx = fx - ix, ty = fy - iy, u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
    const a = g[(iy % 8) * 8 + (ix % 8)], b = g[(iy % 8) * 8 + ((ix + 1) % 8)], c = g[((iy + 1) % 8) * 8 + (ix % 8)], d = g[((iy + 1) % 8) * 8 + ((ix + 1) % 8)];
    out[y * size + x] = lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  return out;
}
function grayTex(size, seed, lo, hi) {
  const N = tileNoise(size, seed);
  return canvasTex(size, size, ctx => {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) { const v = lo + N[i] * (hi - lo) + (Math.random() - 0.5) * 12; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = clamp(v, 0, 255); img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  });
}

class InstBatch {
  constructor(world, geo, mat, opts = {}) {
    this.world = world; this.geo = geo; this.mat = mat; this.opts = opts; this.data = new Map();
    world.batches.push(this);
  }
  add(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, color = null, style = null) {
    const ci = this.world.chunkIndex(x, z);
    let d = this.data.get(ci);
    if (!d) { d = { m: [], c: [], s: [] }; this.data.set(ci, d); }
    _e.set(0, ry, 0); _q.setFromEuler(_e);
    _m4.compose(_v1.set(x, y, z), _q, _s.set(sx, sy, sz));
    for (let k = 0; k < 16; k++) d.m.push(_m4.elements[k]);
    if (this.opts.color) { const c = color || _col.set(0xffffff); d.c.push(c.r, c.g, c.b); }
    if (this.opts.style && style) d.s.push(style[0], style[1], style[2], style[3]);
    return { b: this, ci, i: d.m.length / 16 - 1 };
  }
  build() {
    for (const [ci, d] of this.data) {
      const count = d.m.length / 16; if (!count) continue;
      let geo = this.geo;
      if (this.opts.style) { geo = this.geo.clone(); geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(d.s), 4)); }
      const mesh = new THREE.InstancedMesh(geo, this.mat, count);
      mesh.instanceMatrix.array.set(d.m);
      if (this.opts.color) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(d.c), 3);
      mesh.castShadow = !!this.opts.cast; mesh.receiveShadow = !!this.opts.receive;
      mesh.computeBoundingSphere(); mesh.frustumCulled = true;
      this.world.scene.add(mesh);
      this.world.chunks[ci].groups.push({ mesh, minD: this.opts.minD || 0, maxD: this.opts.maxD || 2400, night: !!this.opts.night });
      d.mesh = mesh; d.m = null;
    }
  }
  hide(h) { const m = this.data.get(h.ci).mesh; if (!m) return; _m4.makeScale(0, 0, 0); m.setMatrixAt(h.i, _m4); m.instanceMatrix.needsUpdate = true; }
  setColor(h, c) { const m = this.data.get(h.ci).mesh; if (!m || !m.instanceColor) return; m.instanceColor.setXYZ(h.i, c.r, c.g, c.b); m.instanceColor.needsUpdate = true; }
}

const BUILD_GLSL = `
float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void buildingShade(inout vec3 albedo, inout float rough, inout float metal, inout vec3 emit){
  vec3 n = normalize(vN);
  if (abs(n.y) > 0.6) { albedo *= n.y > 0.0 ? 0.55 : 0.3; rough = 0.9; return; }
  float u = abs(n.x) > abs(n.z) ? vWp.z : vWp.x;
  float v = vWp.y;
  float style = vSt.x;
  vec2 cell = vec2(3.4, style < 0.5 ? 4.2 : 3.5);
  vec2 fr = fract(vec2(u, v) / cell);
  float win = step(0.16, fr.x) * step(fr.x, 0.84) * step(0.14, fr.y) * step(fr.y, 0.78);
  if (style > 2.5 && style < 3.5) win *= step(7.0, v) * step(v, 10.0);
  vec3 glass = vec3(0.05, 0.08, 0.12);
  float slab = style < 0.5 ? step(0.9, fr.y) : 0.0;
  albedo = mix(albedo * (style < 0.5 ? 0.72 : 1.0), glass, win * (1.0 - slab));
  rough = mix(style < 0.5 ? 0.35 : 0.8, 0.08, win);
  metal = mix(style < 0.5 ? 0.45 : 0.0, 0.7, win);
  float rnd = bh(floor(vec2(u, v) / cell) + vSt.y);
  float lit = step(rnd, vSt.z) * win * uNight;
  vec3 lc = mix(vec3(1.0, 0.72, 0.42), vec3(0.62, 0.82, 1.0), step(0.7, bh(floor(vec2(u, v) / cell) + 4.0)));
  emit += lc * lit * (1.2 + rnd);
  if (v < 4.2 && vSt.w > 0.5 && v > 0.6) {
    float shop = step(0.06, fract(u / 7.0)) * step(fract(u / 7.0), 0.94);
    albedo = mix(albedo, vec3(0.04, 0.05, 0.06), shop * 0.85);
    emit += vec3(1.0, 0.82, 0.55) * shop * (0.25 + uNight * 2.2) * step(0.35, bh(vec2(floor(u / 7.0), vSt.y)));
  }
  rough *= 1.0 - uWet * 0.4;
}`;

function buildingMat(U) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.9 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uNight = U.uNight; sh.uniforms.uWet = U.uWet;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aStyle;\nvarying vec4 vSt;\nvarying vec3 vWp;\nvarying vec3 vN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSt = aStyle;\nvWp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\nvN = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uWet; varying vec4 vSt; varying vec3 vWp; varying vec3 vN;\n' + BUILD_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\nvec3 _emit = vec3(0.0); float _r = roughness; float _m = metalness; buildingShade(diffuseColor.rgb, _r, _m, _emit);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = _r;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = _m;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += _emit;');
  };
  mat.customProgramCacheKey = () => 'bldg-v1';
  return mat;
}

World.prototype.chunkIndex = function (x, z) {
  return clamp(Math.floor((z + WORLD_HALF) / 500), 0, 7) * 8 + clamp(Math.floor((x + WORLD_HALF) / 500), 0, 7);
};

World.prototype.generate = async function (progress) {
  const P = async (v, t) => { progress(v, t); await nextFrame(); };
  this.U = { uNight: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 }, uWind: { value: 1 } };
  this.chunks = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) this.chunks.push({ x0: -2000 + i * 500, z0: -2000 + j * 500, x1: -1500 + i * 500, z1: -1500 + j * 500, groups: [] });
  this.batches = [];
  this.rng = new RNG(1337);
  await P(0.05, 'Shaping the Leonida coastline');
  this.bakeTerrain();
  await P(0.18, 'Laying out Vice City');
  this.buildRoads();
  this.makeMaterials();
  await P(0.3, 'Raising the terrain');
  this.buildTerrainMesh();
  await P(0.4, 'Paving roads and sidewalks');
  this.buildRoadMeshes();
  await P(0.5, 'Pouring the expressway and bridges');
  this.buildDecks();
  this.makeBatches();
  await P(0.62, 'Raising Downtown Vice');
  this.fillCity();
  await P(0.74, 'Lighting Ocean Drive');
  this.fillBeach();
  await P(0.82, 'Working the port');
  this.fillPort();
  this.fillOutskirts();
  await P(0.9, 'Planting palms and streetlights');
  this.streetFurniture();
  this.billboards();
  for (const b of this.batches) b.build();
  await P(0.96, 'Drawing the radar map');
  this.bakeMinimap();
};

World.prototype.makeMaterials = function () {
  const T = this.tex = {};
  T.detail = grayTex(128, 3, 140, 255); T.detail.repeat.set(300, 300);
  T.asphalt = grayTex(128, 9, 38, 62);
  T.side = grayTex(128, 5, 168, 210);
  T.concrete = grayTex(128, 13, 150, 200);
  const roadTex = type => canvasTex(128, 256, (ctx, w, h) => {
    const def = ROAD_DEF[type];
    ctx.fillStyle = '#3a3c40'; ctx.fillRect(0, 0, w, h);
    const px = o => 64 + (o / def.hw) * 62;
    const line = (off, dashed, col, ww) => { ctx.fillStyle = col; const x = px(off) - ww / 2; if (dashed) { ctx.fillRect(x, 20, ww, 90); ctx.fillRect(x, 150, ww, 90); } else ctx.fillRect(x, 0, ww, h); };
    if (def.median) { line(-def.median * 0.4, false, '#e6b423', 3); line(def.median * 0.4, false, '#e6b423', 3); }
    else line(0, true, '#e6b423', 3);
    const edge = def.hw - def.shoulder - 0.3;
    line(-edge, false, '#eee', 3); line(edge, false, '#eee', 3);
    for (let l = 1; l < def.lanes; l++) for (const s of [-1, 1]) line(s * (def.median + def.laneW * l), true, '#ddd', 2);
  });
  const M = this.mats = {};
  M.roads = {};
  for (const t of Object.keys(ROAD_DEF)) M.roads[t] = new THREE.MeshStandardMaterial({ map: roadTex(t), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  M.asphalt = new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.94, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  M.side = new THREE.MeshStandardMaterial({ map: T.side, roughness: 0.9 });
  M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.detail, roughness: 0.96 });
  M.concrete = new THREE.MeshStandardMaterial({ map: T.concrete, color: 0xd6d2ca, roughness: 0.9 });
  M.barrier = new THREE.MeshStandardMaterial({ color: 0xcfcbc4, roughness: 0.85 });
  M.metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.45, metalness: 0.7 });
  M.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  M.building = buildingMat(this.U);
  M.palm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  M.lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  M.pool = new THREE.MeshBasicMaterial({ color: 0x3ec8e0 });
  M.neon = {}; this.neonBase = {};
  for (const [k, hex] of Object.entries({ pink: '#ff2fa8', cyan: '#18e8ff', purple: '#b44dff', mint: '#2dffa8', yellow: '#ffd23a', orange: '#ff7a2a', white: '#fff', red: '#ff3040' })) {
    M.neon[k] = new THREE.MeshBasicMaterial({ color: hex }); this.neonBase[k] = new THREE.Color(hex);
  }
  M.stripes = new THREE.MeshStandardMaterial({ color: 0xf0c020, roughness: 0.6 });
  M.beacon = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  M.sign = [];
};

World.prototype.buildTerrainMesh = function () {
  const SEG = 280;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const C = { sand: [[0.86, 0.78, 0.58], [0.78, 0.68, 0.48]], grass: [[0.28, 0.46, 0.22], [0.42, 0.58, 0.28]], city: [[0.42, 0.43, 0.4], [0.52, 0.52, 0.48]], water: [[0.55, 0.62, 0.48], [0.4, 0.5, 0.42]] };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = this.terrainH(x, z);
    p.setY(i, h);
    const zn = this.zoneAt(x, z);
    let pair = C.grass;
    if (h < WATER_Y) pair = C.water;
    else if (h < -0.15 || (zn && (zn.name === 'Ocean Drive' || zn.name === 'Leonida Keys') && this.landEdge(x, z))) pair = C.sand;
    else if (zn && (zn.name.includes('Downtown') || zn.name.includes('Overtown') || zn.name.includes('Wynwood') || zn.name.includes('Havana') || zn.name.includes('Port') || zn.name.includes('Beach') || zn.name === 'Bayside')) pair = C.city;
    const n = fbm(x * 0.01, z * 0.01, 2);
    col[i * 3] = lerp(pair[0][0], pair[1][0], n); col[i * 3 + 1] = lerp(pair[0][1], pair[1][1], n); col[i * 3 + 2] = lerp(pair[0][2], pair[1][2], n);
    if (h < -2) { const k = clamp((-h - 2) / 10, 0, 0.6); col[i * 3] *= 1 - k; col[i * 3 + 1] *= 1 - k * 0.7; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, this.mats.terrain);
  mesh.receiveShadow = true;
  this.scene.add(mesh);
};
World.prototype.landEdge = function (x, z) { return this.terrainH(x + 18, z) < -0.4 || this.terrainH(x - 18, z) < -0.4 || this.terrainH(x, z + 18) < -0.4 || this.terrainH(x, z - 18) < -0.4; };

World.prototype.buildRoadMeshes = function () {
  const groups = {}, sw = { pos: [], nrm: [], uv: [], idx: [] };
  const G = k => groups[k] || (groups[k] = { pos: [], nrm: [], uv: [], idx: [] });
  const quad = (g, a, b, c, d, u0, u1, v0, v1) => {
    const o = g.pos.length / 3;
    const V = [a, b, c, d], U = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];
    for (let i = 0; i < 4; i++) { g.pos.push(V[i][0], V[i][1], V[i][2]); g.nrm.push(0, 1, 0); g.uv.push(U[i][0], U[i][1]); }
    g.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  };
  const Y = 0.04;
  for (const e of this.edges) {
    if (e.deck) continue;
    const A = this.nodes[e.a], B = this.nodes[e.b];
    const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, nx = -dz, nz = dx;
    const insetA = (e.axis === 'ns' ? A.hz : A.hx), insetB = (e.axis === 'ns' ? B.hz : B.hx);
    const s0 = insetA, s1 = e.len - insetB;
    if (s1 - s0 < 1) continue;
    const P = (s, l) => [A.x + dx * s + nx * l, Y, A.z + dz * s + nz * l];
    quad(G(e.type), P(s0, -e.hw), P(s0, e.hw), P(s1, -e.hw), P(s1, e.hw), 0, 1, s0 / 14, s1 / 14);
    for (const side of [-1, 1]) {
      const l0 = side * e.hw, l1 = side * (e.hw + SIDEWALK);
      const p0 = P(s0, l0), p1 = P(s1, l1);
      const x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), z0 = Math.min(p0[2], p1[2]), z1 = Math.max(p0[2], p1[2]);
      if (this.terrainH((x0 + x1) / 2, (z0 + z1) / 2) < -0.5) continue;
      const o = sw.pos.length / 3;
      const top = [[x0, 0.18, z0], [x1, 0.18, z0], [x0, 0.18, z1], [x1, 0.18, z1]];
      for (const v of top) { sw.pos.push(...v); sw.nrm.push(0, 1, 0); sw.uv.push(v[0] / 8, v[2] / 8); }
      sw.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      this.addBox(x0, x1, z0, z1, -0.4, 0.18, 'sidewalk');
    }
  }
  for (const n of this.nodes) {
    if (n.deck || !n.hx) continue;
    quad(G('asphalt'), [n.x - n.hx, Y + 0.01, n.z - n.hz], [n.x + n.hx, Y + 0.01, n.z - n.hz], [n.x - n.hx, Y + 0.01, n.z + n.hz], [n.x + n.hx, Y + 0.01, n.z + n.hz], 0, 1, 0, 1);
  }
  const mk = (g, mat) => {
    if (!g.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; this.scene.add(m);
  };
  for (const t of Object.keys(ROAD_DEF)) if (groups[t]) mk(groups[t], this.mats.roads[t]);
  if (groups.asphalt) mk(groups.asphalt, this.mats.asphalt);
  mk(sw, this.mats.side);
};

World.prototype.buildDecks = function () {
  const top = {}, conc = { pos: [], nrm: [], idx: [] }, barr = { pos: [], nrm: [], idx: [] };
  const push = (g, v, n) => { const o = g.pos.length / 3; for (const p of v) { g.pos.push(...p); g.nrm.push(...n); } g.idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); };
  const pillars = [];
  for (const e of this.edges) {
    if (!e.deck) continue;
    const pts = e.pts, n = pts.length, g = top[e.type] || (top[e.type] = { pos: [], nrm: [], idx: [] });
    const L = [], R = [], thick = e.type === 'bridge' ? 1.6 : 1.2;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      L.push([pts[i].x - tz * e.hw, pts[i].y + 0.08, pts[i].z + tx * e.hw]);
      R.push([pts[i].x + tz * e.hw, pts[i].y + 0.08, pts[i].z - tx * e.hw]);
    }
    for (let i = 1; i < n; i++) {
      push(g, [R[i - 1], L[i - 1], R[i], L[i]], [0, 1, 0]);
      const dn = p => [p[0], p[1] - thick, p[2]];
      push(conc, [dn(L[i - 1]), dn(R[i - 1]), dn(L[i]), dn(R[i])], [0, -1, 0]);
      const up = (p, h) => [p[0], p[1] + h, p[2]];
      push(barr, [L[i - 1], L[i], up(L[i - 1], 0.9), up(L[i], 0.9)], [0, 0, 1]);
      push(barr, [R[i], R[i - 1], up(R[i], 0.9), up(R[i - 1], 0.9)], [0, 0, 1]);
    }
    const len = e.len;
    for (let s = 24; s < len - 16; s += e.type === 'causeway' ? 22 : 36) {
      const p = this.edgePointAt(e, s);
      if (p.y < 2.2) continue;
      const ne = this.nearestEdge(p.x, p.z, 24, ed => !ed.deck);
      if (ne && ne.dist < ne.edge.hw + 4) continue;
      const base = this.terrainH(p.x, p.z);
      if (p.y - base > 1.5) { pillars.push([p.x, base, p.z, p.y - thick - base]); this.addCircle(p.x, p.z, 1.4, base, p.y, 'pillar'); }
    }
  }
  const mk = (g, mat) => {
    if (!g.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nrm, 3));
    geo.setIndex(g.idx); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; this.scene.add(m);
  };
  for (const [t, g] of Object.entries(top)) mk(g, this.mats.roads[t]);
  mk(conc, this.mats.concrete); mk(barr, this.mats.barrier);
  if (pillars.length) {
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.3, 1, 8), this.mats.concrete, pillars.length);
    pillars.forEach(([x, y, z, h], i) => { _m4.compose(_v1.set(x, y + h / 2, z), _q.identity(), _s.set(1, h, 1)); pm.setMatrixAt(i, _m4); });
    pm.castShadow = true; pm.computeBoundingSphere(); this.scene.add(pm);
  }
  const parts = [];
  for (const r of this.ramps) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), ang = Math.atan2(r.x1 - r.x0, r.z1 - r.z0);
    const lo = Math.min(r.y0, r.y1), hi = Math.max(r.y0, r.y1);
    let geo = gWedge(r.hw * 2, Math.max(0.4, hi - lo), len);
    if (r.y1 < r.y0) geo.rotateY(Math.PI);
    xf(geo, (r.x0 + r.x1) / 2, lo, (r.z0 + r.z1) / 2, 0, ang, 0);
    parts.push(geo);
    if (lo > 0.2) parts.push(xf(gBox(r.hw * 2, lo, len), (r.x0 + r.x1) / 2, lo / 2, (r.z0 + r.z1) / 2, 0, ang, 0));
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeos(parts), this.mats.stripes); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
  this.bridgeDress();
};

World.prototype.bridgeDress = function () {
  for (const e of this.edges) {
    if (e.type !== 'bridge') continue;
    const a = this.edgePointAt(e, e.len * 0.32), b = this.edgePointAt(e, e.len * 0.68);
    for (const p of [a, b]) {
      const nx = -p.dz, nz = p.dx, top = p.y + 48, base = Math.min(this.terrainH(p.x, p.z), -1);
      const parts = [];
      for (const s of [-1, 1]) {
        parts.push(xf(gBox(2.4, top - base, 2.6), p.x + nx * s * (e.hw + 2), (top + base) / 2, p.z + nz * s * (e.hw + 2)));
        this.addBox(p.x + nx * s * (e.hw + 2) - 1.4, p.x + nx * s * (e.hw + 2) + 1.4, p.z + nz * s * (e.hw + 2) - 1.4, p.z + nz * s * (e.hw + 2) + 1.4, base, top, 'building');
      }
      parts.push(xf(gBox(e.hw * 2 + 6, 2, 2.2), p.x, top - 1, p.z, 0, Math.atan2(p.dx, p.dz), 0));
      const m = new THREE.Mesh(mergeGeos(parts), this.mats.concrete); m.castShadow = true; this.scene.add(m);
      const beacon = new THREE.Mesh(gSphere(0.7, 8, 6), this.mats.beacon);
      beacon.position.set(p.x, top + 1, p.z); this.scene.add(beacon);
    }
  }
};

World.prototype.makeBatches = function () {
  const box = gBox(1, 1, 1); box.translate(0, 0.5, 0);
  const B = this.B = {};
  B.b = new InstBatch(this, box, this.mats.building, { color: true, style: true, cast: true, receive: true, maxD: 2200 });
  B.prop = new InstBatch(this, box, this.mats.vc, { color: true, cast: true, receive: true, maxD: 500 });
  for (const k of Object.keys(this.mats.neon)) B['n' + k] = new InstBatch(this, box, this.mats.neon[k], { maxD: 1400 });
  const trunk = paint(xf(gCyl(0.32, 0.22, 11, 6), 0, 5.5, 0), '#7a6248');
  const crownParts = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    crownParts.push(paint(xf(gBox(0.35, 0.12, 4.6), Math.sin(a) * 2.1, 10.6, Math.cos(a) * 2.1, 0.5, a, 0.15), i % 2 ? '#3e7a28' : '#6aaa3a'));
  }
  B.trunk = new InstBatch(this, trunk, this.mats.palm, { cast: true, maxD: 900 });
  B.crown = new InstBatch(this, mergeGeos(crownParts), this.mats.palm, { cast: true, maxD: 900 });
  const pole = mergeGeos([paint(xf(gCyl(0.1, 0.16, 8, 5), 0, 4, 0), '#2c2e32'), paint(xf(gBox(0.12, 0.12, 2.2), 0, 7.9, 1), '#2c2e32')]);
  B.pole = new InstBatch(this, pole, this.mats.vc, { cast: true, maxD: 600 });
  B.head = new InstBatch(this, xf(gBox(0.4, 0.12, 0.7), 0, 7.75, 2), this.mats.lamp, { maxD: 800 });
  const cont = new THREE.BoxGeometry(12, 2.6, 2.4); cont.translate(0, 1.3, 0);
  B.cont = new InstBatch(this, cont, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.35 }), { color: true, cast: true, receive: true, maxD: 1200 });
  B.pool = new InstBatch(this, xf(gBox(1, 0.15, 1), 0, 0.08, 0), this.mats.pool, { maxD: 700 });
  const tree = mergeGeos([paint(xf(gCyl(0.25, 0.35, 3.2, 5), 0, 1.6, 0), '#5a4030'), paint(xf(gSphere(1.7, 7, 5), 0, 4.2, 0), '#3f7a32')]);
  B.tree = new InstBatch(this, tree, this.mats.palm, { cast: true, maxD: 800 });
};

World.prototype.clearAt = function (x, z, rad) {
  if (this.terrainH(x, z) < -0.2) return false;
  const ne = this.nearestEdge(x, z, rad + 18);
  if (ne && ne.dist < ne.edge.hw + (ne.edge.deck ? 2 : SIDEWALK) + rad * 0.35) return false;
  const ci = this.cell(x, z, this.CG, this.cgN);
  if (ci >= 0 && this.dgrid[ci]) for (const s of this.dgrid[ci]) {
    const rx = x - s.x0, rz = z - s.z0, t = (rx * s.dx + rz * s.dz) / s.len;
    if (t > -0.05 && t < 1.05 && Math.abs(rx * s.nx + rz * s.nz) < s.hw + rad) return false;
  }
  return true;
};
World.prototype.addBuilding = function (x, z, w, d, h, style, color, opts = {}) {
  if (!this.clearAt(x, z, Math.max(w, d) * 0.45)) return 0;
  const y0 = opts.y0 || 0;
  this.B.b.add(x, y0, z, opts.ry || 0, w, h, d, new THREE.Color(color), [style, this.rng.range(0, 90), opts.lit ?? 0.45, opts.shops ? 1 : 0]);
  this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, y0 + h, 'building');
  this.buildings.push({ x, z, w, d, h: y0 + h, style });
  if (h > 40 && this.rng.chance(0.4)) this.neonRing(this.rng.pick(['cyan', 'pink', 'purple', 'white']), x, z, w, d, y0 + h - 1);
  return y0 + h;
};
World.prototype.neonRing = function (c, x, z, w, d, y) {
  const t = 0.28;
  this.B['n' + c].add(x, y, z - d / 2, 0, w, t, t);
  this.B['n' + c].add(x, y, z + d / 2, 0, w, t, t);
  this.B['n' + c].add(x - w / 2, y, z, 0, t, t, d);
  this.B['n' + c].add(x + w / 2, y, z, 0, t, t, d);
};
World.prototype.palm = function (x, z, s = 1) {
  if (this.terrainH(x, z) < -0.15) return;
  const y = Math.max(0, this.terrainH(x, z)), ry = this.rng.range(0, TAU);
  this.B.trunk.add(x, y, z, ry, s, s, s);
  this.B.crown.add(x, y, z, ry, s, s, s);
  this.addCircle(x, z, 0.35 * s, -1, y + 10, 'palm');
};
World.prototype.container = function (x, z, ry, stack, color) {
  for (let i = 0; i < stack; i++) this.B.cont.add(x, i * 2.6, z, ry, 1, 1, 1, new THREE.Color(color || this.rng.pick(['#c0392b', '#2471a3', '#1e8449', '#d35400', '#ecf0f1', '#8e44ad', '#b9770e'])));
  const hx = Math.abs(Math.cos(ry)) * 6 + Math.abs(Math.sin(ry)) * 1.3, hz = Math.abs(Math.sin(ry)) * 6 + Math.abs(Math.cos(ry)) * 1.3;
  this.addBox(x - hx, x + hx, z - hz, z + hz, 0, stack * 2.6, 'container');
};

World.prototype.fillCity = function () {
  const r = this.rng;
  const glass = ['#7ea6c4', '#9ec0d4', '#6f94b0', '#b7c6d4', '#5f88aa'];
  const earth = ['#e4d7c4', '#d2c2a8', '#efe6d4', '#cbb89e', '#f3eee4', '#b7c4cc'];
  const pastel = ['#ffd0e0', '#c8f0e4', '#d8ecff', '#ffe6b8', '#f7f2ea', '#e6d0ff'];
  for (let x = -1450; x < 250; x += 100) for (let z = -1250; z < 550; z += 100) {
    const cx = x + 50, cz = z + 50;
    const zn = this.zoneAt(cx, cz);
    if (!zn) continue;
    const down = zn.name === 'Downtown Vice';
    const mid = zn.name === 'Wynwood' || zn.name === 'Overtown' || zn.name === 'Little Havana';
    if (!down && !mid) continue;
    const lots = 2;
    for (let a = 0; a < lots; a++) for (let b = 0; b < lots; b++) {
      const lx = x + 18 + a * 34, lz = z + 18 + b * 34;
      const w = r.range(22, 32), d = r.range(22, 32);
      const dist = Math.hypot(lx + 180, lz + 400) / 700;
      const h = down ? r.range(28, 70) + (1 - clamp(dist, 0, 1)) * r.range(40, 180) : r.range(8, 24);
      this.addBuilding(lx, lz, w, d, h, down && r.chance(0.7) ? 0 : 1, r.pick(down ? glass : r.chance(0.4) ? pastel : earth), { shops: !down || h < 40, lit: r.range(0.3, 0.6) });
    }
  }
  for (let z = -1000; z < 250; z += 22) { this.palm(330 + (Math.round(z) % 2 ? 8 : 0), z, r.range(0.9, 1.2)); this.palm(430, z + 10, 1); }
  this.pedZones.push({ x0: 310, x1: 450, z0: -1050, z1: 280, kind: 'park' });
};

World.prototype.fillBeach = function () {
  const r = this.rng;
  const names = ['CORAL REEF', 'FLAMINGO', 'OCEAN BREEZE', 'PARADISE', 'THE LEONIDA', 'STARLITE', 'TROPICANA', 'PALM COURT', 'NEON LAGOON', 'VICE PALACE'];
  let zi = 0;
  for (let z = -1450; z < 950; z += 78) {
    const hx = 1220, hz = z + 30, hd = r.range(36, 52), hw = r.range(28, 48), hh = r.range(14, 34);
    const top = this.addBuilding(hx, hz, hd, hw, hh, 2, r.pick(['#ffe0ea', '#fff6e4', '#d8fff2', '#e4f2ff', '#ffe8c8']), { shops: true, lit: 0.6 });
    if (top) {
      const col = r.pick(['pink', 'cyan', 'purple', 'mint', 'yellow']);
      this.neonRing(col, hx, hz, hd, hw, top - 0.4);
      this.addSign(names[zi++ % names.length], this.neonBase[col].getStyle(), hx + hd / 2 + 0.2, Math.min(12, top - 2), hz, Math.PI / 2, Math.min(hw * 0.7, 16), 2.4);
    }
    this.B.pool.add(1088, 0, hz, 0, 14, 1, 8);
    for (let k = 0; k < 3; k++) this.palm(1340 + r.range(-2, 4), z + k * 22, r.range(0.85, 1.3));
  }
  for (let z = -1500; z < 980; z += 90) {
    this.addBuilding(1110, z + 40, r.range(24, 36), r.range(20, 30), r.range(8, 18), 1, r.pick(['#ffd6e6', '#c8f4ff', '#ffe7a8', '#e6d4ff']), { shops: true, lit: 0.55 });
    if (r.chance(0.35)) this.addSign(r.pick(['CLUB MALIBU', 'VICE NIGHTS', 'POOLSIDE', 'ELECTRIC']), r.pick(['#ff2fa8', '#18e8ff', '#b44dff']), 1092, 6, z + 40, -Math.PI / 2, 12, 2.6);
  }
  for (let i = 0; i < 40; i++) {
    const x = r.range(1380, 1520), z = r.range(-1400, 950);
    if (this.terrainH(x, z) < -0.3) continue;
    this.B.prop.add(x, this.terrainH(x, z), z, r.range(0, 3), 2.6, 2.2, 2.6, new THREE.Color(r.pick(['#ff4f8a', '#2ee6ff', '#ffd23a', '#ff8a3a'])));
  }
  this.pedZones.push({ x0: 1360, x1: 1550, z0: -1450, z1: 980, kind: 'beach' });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU, x = 750 + Math.cos(a) * 40, z = -640 + Math.sin(a) * 28;
    this.addBuilding(x, z, 14, 12, r.range(6, 10), 4, '#f7f3ea', { lit: 0.6 });
    this.palm(x + 9, z + 6, 1);
  }
};

World.prototype.addSign = function (text, color, x, y, z, ry, w, h) {
  if (!this._signs) this._signs = new Map();
  let batch = this._signs.get(text + color);
  if (!batch) {
    const tex = canvasTex(512, 128, ctx => {
      ctx.fillStyle = '#120814'; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = color; ctx.font = '900 64px Impact, Arial Black, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.fillText(text, 256, 68);
    }, { clamp: true });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    this.mats.sign.push(mat);
    batch = new InstBatch(this, new THREE.PlaneGeometry(1, 1), mat, { maxD: 1100 });
    this._signs.set(text + color, batch);
  }
  batch.add(x, y, z, ry, w, h, 1);
};

World.prototype.fillPort = function () {
  const r = this.rng;
  for (let x = -1100; x < 150; x += 200) for (let z = 680; z < 1150; z += 200) {
    if (x > -1050 && x < -850 && z > 780 && z < 1000) continue;
    this.addBuilding(x + 70, z + 70, r.range(50, 90), r.range(36, 60), r.range(10, 16), 3, r.pick(['#9aabb8', '#c8bca4', '#a86848', '#d0d0c8']), { lit: 0.2 });
  }
  for (let x = -1180; x < 280; x += 16) {
    if (Math.abs(x) < 20) continue;
    for (const z of [1230, 1248, 1266]) if (r.chance(0.82)) this.container(x, z, 0, r.int(1, 4));
  }
  for (const x of [-1000, -700, -400, -100, 150]) this.crane(x, 1310);
  for (const x of [-1050, -650, -250]) this.pier(x);
  this.addSign('PORT OF LEONIDA', '#ffd23a', -200, 14, 760, 0, 28, 4);
  this.stuntSpot = { x: -940, z: 1000 };
  this.cartel = { x: -500, z: 1248 };
  this.heliSpots = [{ x: 80, z: 980 }, { x: 80, z: 860 }];
  this.B.pool.add(80, 0.2, 980, 0, 18, 1, 18);
  this.B.pool.add(80, 0.2, 860, 0, 18, 1, 18);
};
World.prototype.crane = function (x, z) {
  const red = '#c8321e', parts = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(paint(xf(gBox(1.1, 30, 1.1), a * 8, 15, b * 6), red));
  parts.push(paint(xf(gBox(18, 1.2, 14), 0, 30, 0), red));
  parts.push(paint(xf(gBox(2.4, 2, 60), 0, 33, 16), '#eee'));
  parts.push(paint(xf(gBox(2.2, 1.4, 2), 0, 16, 28), '#f2c230'));
  const m = new THREE.Mesh(mergeGeos(parts), this.mats.vc); m.position.set(x, 0, z); m.castShadow = true; this.scene.add(m);
  this.addBox(x - 9, x + 9, z - 7, z + 7, 29, 31, 'building');
};
World.prototype.pier = function (x) {
  const deck = new THREE.Mesh(xf(gBox(10, 0.5, 150), x, 0.1, 1370), new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 }));
  deck.receiveShadow = deck.castShadow = true; this.scene.add(deck);
  this.addBox(x - 5, x + 5, 1300, 1450, -8, 0.35, 'pier');
  this.piers.push({ x, z0: 1295, z1: 1450 });
};

World.prototype.fillOutskirts = function () {
  const r = this.rng;
  const rw = new THREE.Mesh(xf(new THREE.PlaneGeometry(50, 1100), -1700, 0.05, 80), new THREE.MeshStandardMaterial({ color: 0x2e3034, roughness: 0.9 }));
  rw.rotation.x = -Math.PI / 2; rw.receiveShadow = true; this.scene.add(rw);
  for (const z of [-300, 0, 300]) this.addBuilding(-1600, z, 40, 50, 14, 3, '#d8d4cc', { lit: 0.25 });
  this.addBuilding(-1600, 160, 14, 14, 22, 1, '#e8e8e8', { lit: 0.8 });
  const beacon = new THREE.Mesh(gSphere(0.8, 8, 6), this.mats.beacon); beacon.position.set(-1600, 24, 160); this.scene.add(beacon);
  this.airSpot = { x: -1640, z: 240 };
  for (let i = 0; i < 80; i++) {
    const x = r.range(-1400, 250), z = r.range(-1750, -1350);
    if (!this.clearAt(x, z, 8)) continue;
    if (r.chance(0.45)) this.addBuilding(x, z, r.range(10, 16), r.range(9, 13), r.range(4, 7), 4, r.pick(['#f6f1e8', '#ffe4cc', '#e4f0ff', '#ffe0ea']), { lit: 0.5 });
    else this.palm(x, z, r.range(0.8, 1.2));
  }
  for (let i = 0; i < 70; i++) {
    const x = r.range(-380, 380), z = r.range(1680, 1880);
    if (this.terrainH(x, z) < -0.4) continue;
    if (r.chance(0.3) && this.clearAt(x, z, 7)) this.addBuilding(x, z, 12, 10, r.range(4, 8), 4, '#fff', { lit: 0.55 });
    else this.palm(x, z, 1);
  }
  this.addBuilding(-180, 1820, 40, 24, 16, 2, '#ffe8f0', { shops: true, lit: 0.6 });
  this.addSign('LEONIDA KEYS', '#ff2fa8', -180, 12, 1836, 0, 16, 2.4);
  for (let i = 0; i < 50; i++) {
    const x = r.range(-1750, -1560), z = r.range(-1100, 1100);
    if (this.clearAt(x, z, 6)) this.B.tree.add(x, 0, z, 0, r.range(0.8, 1.4), r.range(0.8, 1.4), r.range(0.8, 1.4));
  }
};

World.prototype.streetFurniture = function () {
  const r = this.rng;
  this.lamps = [];
  for (const e of this.edges) {
    if (e.deck || e.len < 30) continue;
    const A = this.nodes[e.a], B = this.nodes[e.b];
    const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len, nx = -dz, nz = dx;
    let side = 1;
    for (let s = 16; s < e.len - 16; s += 36) {
      const off = e.hw + 1.2;
      const x = A.x + dx * s + nx * side * off, z = A.z + dz * s + nz * side * off;
      if (this.terrainH(x, z) > -0.3) {
        const ry = Math.atan2(-nx * side, -nz * side);
        const h1 = this.B.pole.add(x, 0.15, z, ry);
        const h2 = this.B.head.add(x, 0.15, z, ry);
        const c = this.addCircle(x, z, 0.25, -1, 8.2, 'pole');
        c.knock = [h1, h2]; c.knockable = true;
        this.lamps.push({ x: x - nx * side * 2, y: 7.9, z: z - nz * side * 2, col: c });
      }
      side = -side;
    }
  }
  const colors = { r: new THREE.Color(4, 0.15, 0.1), y: new THREE.Color(4, 2.6, 0.15), g: new THREE.Color(0.2, 4, 1.2), off: new THREE.Color(0.04, 0.04, 0.04) };
  this.tlColors = colors;
  const lampGeo = new THREE.SphereGeometry(0.16, 8, 6);
  this.B.tl = new InstBatch(this, lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), { color: true, maxD: 450 });
  for (const n of this.signals) {
    n.lamps = [];
    for (const id of n.edges) {
      const e = this.edges[id]; if (e.deck) continue;
      const o = this.otherNode(e, n.id);
      let dx = n.x - o.x, dz = n.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const along = (e.axis === 'ns' ? n.hz : n.hx) + 2;
      const px = n.x - dx * along, pz = n.z - dz * along;
      const pole = this.B.pole.add(px, 0.15, pz, Math.atan2(dx, dz));
      const lamps = [];
      for (let k = 0; k < 3; k++) lamps.push(this.B.tl.add(px - dx * 0.3, 6.4 - k * 0.45, pz - dz * 0.3, 0, 1, 1, 1, colors.off));
      n.lamps.push({ axis: e.axis, lamps, state: '' });
      const c = this.addCircle(px, pz, 0.25, -1, 7, 'pole'); c.knock = [pole, ...lamps]; c.knockable = true;
    }
  }
};
World.prototype.billboards = function () {
  const ads = [['VICE CITY', '#ff3d9a'], ['FIZZ COLA', '#18e8ff'], ['LEONIDA LOTTO', '#ffd23a'], ['CLUB MALIBU', '#b44dff'], ['PEGASUS AUTO', '#ff4040']];
  const tall = this.buildings.filter(b => b.h > 16 && b.h < 80).slice(0, 18);
  tall.forEach((b, i) => {
    const [t, c] = ads[i % ads.length];
    this.addSign(t, c, b.x, b.h + 5, b.z + b.d / 2 + 0.4, 0, 14, 6);
  });
};
World.prototype.bakeMinimap = function () {
  const S = 1024, k = S / WORLD_SIZE, c = makeCanvas(S, S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let j = 0; j < S; j += 2) for (let i = 0; i < S; i += 2) {
    const x = -WORLD_HALF + (i + 0.5) / k, z = -WORLD_HALF + (j + 0.5) / k, h = this.terrainH(x, z);
    let col = h < WATER_Y ? [46, 110, 150] : [92, 120, 78];
    const zn = this.zoneAt(x, z);
    if (h >= WATER_Y && zn && (zn.name.includes('Downtown') || zn.name.includes('Port') || zn.name.includes('Overtown'))) col = [78, 82, 88];
    if (h >= WATER_Y && h < 0.2 && (x > 1330 || z > 1650)) col = [196, 176, 120];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const q = ((j + b) * S + (i + a)) * 4; img.data[q] = col[0]; img.data[q + 1] = col[1]; img.data[q + 2] = col[2]; img.data[q + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  const X = v => (v + WORLD_HALF) * k;
  ctx.lineCap = 'round';
  for (const e of this.edges) {
    ctx.strokeStyle = e.deck ? '#e2c25c' : e.type === 'blvd' ? '#d8d8d8' : '#9a9c9e';
    ctx.lineWidth = Math.max(1.5, e.hw * 2 * k * (e.type === 'blvd' || e.deck ? 1 : 0.8));
    ctx.beginPath(); ctx.moveTo(X(e.pts[0].x), X(e.pts[0].z));
    for (let i = 1; i < e.pts.length; i++) ctx.lineTo(X(e.pts[i].x), X(e.pts[i].z));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(40,44,52,0.9)';
  for (const b of this.buildings) if (b.h > 8) ctx.fillRect(X(b.x - b.w / 2), X(b.z - b.d / 2), Math.max(1, b.w * k), Math.max(1, b.d * k));
  this.minimap = c; this.mmScale = k;
};
World.prototype.updateChunks = function (cam) {
  const x = cam.position.x, z = cam.position.z, y = cam.position.y;
  for (const ch of this.chunks) {
    const dx = Math.max(ch.x0 - x, 0, x - ch.x1), dz = Math.max(ch.z0 - z, 0, z - ch.z1);
    const d = Math.hypot(dx, dz) + Math.max(0, y - 120) * 0.4;
    for (const g of ch.groups) g.mesh.visible = d >= g.minD && d < g.maxD && (!g.night || this.night > 0.08);
  }
};
World.prototype.knock = function (col) {
  if (!col || col.dead || !col.knockable) return;
  col.dead = true; col.minY = -50; col.maxY = -40;
  for (const h of col.knock) h.b.hide(h);
  if (this.lamps) this.lamps = this.lamps.filter(l => l.col !== col);
};
World.prototype.update = function (dt, tod, weather, cam) {
  this.time += dt; this.night = tod.night; this.wet = weather.wet;
  this.U.uTime.value = this.time; this.U.uNight.value = tod.night; this.U.uWet.value = weather.wet;
  const nk = lerp(0.7, 4.2, tod.night);
  for (const [k, m] of Object.entries(this.mats.neon)) m.color.copy(this.neonBase[k]).multiplyScalar(nk);
  this.mats.lamp.color.setRGB(1, 0.86, 0.62).multiplyScalar(lerp(0.4, 5, tod.night));
  this.mats.beacon.color.setRGB(1, 0.12, 0.1).multiplyScalar(Math.sin(this.time * 3) > 0 ? 5 : 0.2);
  for (const m of this.mats.sign) m.color.setScalar(lerp(0.85, 3.2, tod.night));
  const rr = lerp(0.92, 0.25, weather.wet);
  for (const m of Object.values(this.mats.roads)) { m.roughness = rr; m.color.setScalar(1 - weather.wet * 0.3); }
  this.mats.asphalt.roughness = rr;
  if ((this._sigT = (this._sigT || 0) - dt) <= 0) {
    this._sigT = 0.3;
    const C = this.tlColors;
    for (const n of this.signals) {
      if (Math.abs(n.x - cam.position.x) > 380 || Math.abs(n.z - cam.position.z) > 380) continue;
      for (const h of n.lamps) {
        const st = this.signalState(n, h.axis);
        if (st === h.state) continue;
        h.state = st;
        h.lamps.forEach((l, i) => l.b.setColor(l, (i === 0 && st === 'r') || (i === 1 && st === 'y') || (i === 2 && st === 'g') ? C[st] : C.off));
      }
    }
  }
};
