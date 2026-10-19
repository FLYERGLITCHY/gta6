function dummyDriver(v) {
  return {
    alive: true, isDummy: true, team: v.police ? 'cop' : 'civ', panic: 0, health: 40,
    pos: new THREE.Vector3().copy(v.pos), vehicle: v, seat: 0, group: null, vel: new THREE.Vector3(),
    damage() { this.alive = false; this.health = 0; }
  };
}
function lanePose(edge, s, lane, dir) {
  const p = G.world.edgePointAt(edge, clamp(s, 0, edge.len));
  const fx = p.dx * dir, fz = p.dz * dir;
  const rx = fz, rz = -fx;
  const ln = clamp(lane, 0, Math.max(0, edge.lanes - 1));
  const off = G.world.laneOffset(edge, ln);
  return { x: p.x + rx * off, y: p.y, z: p.z + rz * off, fx, fz, rx, rz };
}
function sidewalkPoint(edge, s, side) {
  const p = G.world.edgePointAt(edge, clamp(s, 0, edge.len));
  const off = edge.hw + 2.5;
  return { x: p.x + p.dz * off * side, y: p.y, z: p.z - p.dx * off * side, dx: p.dx, dz: p.dz };
}
function placeOnSidewalk(actor, x, z, yaw) {
  const ne = G.world.nearestEdge(x, z, 80, e => !e.deck);
  if (!ne) { actor.place(x, G.world.surfaceH(x, z, 6), z, yaw || 0); return; }
  const side = 1;
  const px = ne.x + ne.dz * (ne.edge.hw + 2.3) * side;
  const pz = ne.z - ne.dx * (ne.edge.hw + 2.3) * side;
  actor.place(px, G.world.surfaceH(px, pz, 6), pz, yaw !== undefined ? yaw : Math.atan2(ne.dx, ne.dz));
}
function findLand(x, z) {
  if (!G.world.isWater(x, z) && G.world.terrainH(x, z) > WATER_Y) return { x, z };
  for (let r = 8; r <= 220; r += 12) {
    for (let a = 0; a < 10; a++) {
      const xx = x + Math.cos(a / 10 * TAU + r) * r, zz = z + Math.sin(a / 10 * TAU) * r;
      if (!G.world.isWater(xx, zz) && G.world.terrainH(xx, zz) > -0.2) return { x: xx, z: zz };
    }
  }
  return { x, z };
}
function spawnFighter(x, z, opts = {}) {
  const spot = findLand(x, z);
  const c = new Character({
    name: opts.name || 'Gunman', x: spot.x, z: spot.z,
    shirt: opts.shirt || '#24262e', pants: opts.pants || '#14161c', hair: '#1a120e',
    team: opts.team || 'hostile', female: !!opts.female
  });
  c.place(spot.x, G.world.surfaceH(spot.x, spot.z, 8), spot.z, opts.yaw || Math.random() * TAU);
  c.weapon = opts.weapon == null ? 2 : opts.weapon;
  c.setWeaponVisual(WEAPONS[c.weapon].id);
  c.ai = { ambient: false, hostile: true, aggro: opts.aggro || 46, fireT: rand(0.2, 1), homeX: spot.x, homeZ: spot.z, mission: opts.mission || '', team: c.team };
  c.group.traverse(o => { o.castShadow = false; });
  G.npcs.push(c);
  return c;
}
function clearMissionNpcs() {
  G.npcs = G.npcs.filter(n => {
    if (n.ai && n.ai.mission) { G.scene.remove(n.group); return false; }
    return true;
  });
}

class Traffic {
  constructor() { this.colors = ['#e7e9ee', '#1b1d22', '#c0392b', '#2471a3', '#f4d03f', '#7d3c98', '#d35400', '#148f77', '#f5f6fa', '#922b21']; }
  spawnOne(x, z) {
    const ne = G.world.randomRoadPoint(x, z, 0, 30, e => !e.deck && e.type !== 'ramp');
    if (!ne) return null;
    const id = Math.random() < 0.08 ? 'inferno' : Math.random() < 0.12 ? 'phoenix' : 'sentinel';
    const v = spawnVehicle(id, ne.x, ne.z, Math.atan2(ne.dx, ne.dz), { color: pick(this.colors) });
    const lane = randInt(0, Math.max(0, ne.edge.lanes - 1));
    const pose = lanePose(ne.edge, ne.s, lane, 1);
    v.pos.x = pose.x; v.pos.z = pose.z;
    v.settle();
    v.ai = { role: 'traffic', edge: ne.edge, s: ne.s, dir: Math.random() < 0.5 ? 1 : -1, lane, stuck: 0, horn: rand(4, 18) };
    if (Math.random() < 0.75) v.driver = dummyDriver(v);
    return v;
  }
  fill() {
    const spots = [[-200, -400], [0, -800], [200, 200], [-800, -200], [-400, 400], [1180, -600], [1180, 200], [-1000, 800], [0, 900], [-600, -1100], [460, -400], [-200, 1100], [1060, 400], [-1200, 0], [200, -1400], [-400, -200], [0, 0], [1180, -1200], [-800, 200], [300, 600], [-1400, -600], [1320, -200]];
    for (const [x, z] of spots) this.spawnOne(x, z);
  }
  pickNext(edge, dir) {
    const w = G.world;
    const node = w.nodes[dir > 0 ? edge.b : edge.a];
    const p = w.edgePointAt(edge, dir > 0 ? Math.max(0, edge.len - 1) : 1);
    const fx = p.dx * dir, fz = p.dz * dir;
    let best = null, score = -1e9;
    for (const id of node.edges) {
      const e = w.edges[id];
      if (e === edge) continue;
      const nd = e.a === node.id ? 1 : -1;
      const q = w.edgePointAt(e, nd > 0 ? Math.min(6, e.len * 0.4) : Math.max(0, e.len - 6));
      const dot = q.dx * nd * fx + q.dz * nd * fz;
      const sc = dot + (e.type === edge.type ? 0.2 : 0);
      if (sc > score) { score = sc; best = { edge: e, dir: nd, s: nd > 0 ? 3 : e.len - 3 }; }
    }
    if (!best) return { edge, dir: -dir, s: dir > 0 ? Math.max(2, edge.len - 4) : 4 };
    best.s = clamp(best.s, 1, Math.max(1, best.edge.len - 1));
    best.lane = 0;
    return best;
  }
  update(dt) {
    for (const v of G.vehicles) {
      const ai = v.ai;
      if (!ai || ai.role !== 'traffic' || v.dead || v.driver === G.player) continue;
      const pose = lanePose(ai.edge, ai.s, ai.lane, ai.dir);
      const node = G.world.nodes[ai.dir > 0 ? ai.edge.b : ai.edge.a];
      const distNode = ai.dir > 0 ? ai.edge.len - ai.s : ai.s;
      let stop = false;
      if (node && node.signal && distNode < 16 && distNode > 4) {
        if (G.world.signalState(node, ai.edge.axis) !== 'g') stop = true;
      }
      let avoid = 0;
      for (const o of G.vehicles) {
        if (o === v || o.dead) continue;
        const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
        const along = dx * pose.fx + dz * pose.fz;
        const lat = dx * pose.rx + dz * pose.rz;
        if (along > 0 && along < 14 && Math.abs(lat) < 2.3) {
          if (along < 7.5) stop = true;
          avoid += lat >= 0 ? -0.8 : 0.8;
        }
      }
      const target = stop ? 0 : ai.edge.speed * (0.72 + Math.random() * 0.02);
      v.input.throttle = v.speed < target - 0.4 ? 1 : 0;
      v.input.brake = stop || v.speed > target + 3 ? 1 : 0;
      v.input.handbrake = 0;
      const desired = Math.atan2(pose.x + pose.fx * 7 - v.pos.x, pose.z + pose.fz * 7 - v.pos.z);
      v.input.steer = clamp(wrapAngle(desired - v.yaw) * 2.1 + avoid, -1, 1);
      ai.s += ai.dir * Math.max(0, v.speed) * dt;
      if (v.input.throttle && v.speed < 0.8) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
      if (distNode < 3.2 || ai.stuck > 2.8) {
        const nx = this.pickNext(ai.edge, ai.dir);
        ai.edge = nx.edge; ai.dir = nx.dir; ai.s = nx.s; ai.lane = Math.min(ai.lane, nx.edge.lanes - 1); ai.stuck = 0;
      }
      ai.horn -= dt;
      if (ai.horn <= 0) { ai.horn = rand(6, 20); if (G.audio && v.pos.distanceToSquared(G.player.pos) < 40 * 40 && Math.random() < 0.35) G.audio.horn(v.pos); }
    }
  }
}

class PedCrowd {
  constructor() { this.shirts = ['#f2f2f2', '#ff4f8a', '#3d5a80', '#e9c46a', '#2a9d8f', '#e76f51', '#264653', '#f4a261', '#6d597a', '#b5838d']; }
  spawnOne(x, z) {
    const ne = G.world.randomRoadPoint(x, z, 0, 20, e => !e.deck);
    if (!ne) return;
    const side = Math.random() < 0.5 ? 1 : -1;
    const pt = sidewalkPoint(ne.edge, ne.s, side);
    if (G.world.isWater(pt.x, pt.z)) return;
    const fem = Math.random() < 0.45;
    const c = new Character({
      name: 'Local', x: pt.x, z: pt.z, shirt: pick(this.shirts), pants: fem ? '#f4f4f4' : '#2c3344',
      hair: fem ? '#1a120e' : '#3a2418', female: fem, team: 'civ'
    });
    c.place(pt.x, G.world.surfaceH(pt.x, pt.z, 5), pt.z, Math.atan2(pt.dx, pt.dz));
    c.ai = { ambient: true, edge: ne.edge, s: ne.s, dir: Math.random() < 0.5 ? 1 : -1, side, stuck: 0 };
    c.group.traverse(o => { o.castShadow = false; });
    G.npcs.push(c);
  }
  fill() {
    const spots = [[-180, -180], [40, -40], [-400, -600], [200, 80], [1180, -200], [1100, 100], [-800, 200], [0, 700], [-500, 1100], [460, -300], [-1200, -400], [1280, 80], [-200, 400], [600, -200], [0, -1000], [-600, 100], [200, -600], [1060, -800]];
    for (const s of spots) this.spawnOne(s[0], s[1]);
  }
  separate(n) {
    const list = G.npcs;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === n || !o.alive) continue;
      const dx = n.pos.x - o.pos.x, dz = n.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.85) { n.pos.x += dx / d * 0.03; n.pos.z += dz / d * 0.03; }
    }
    if (G.player && G.player.alive && !G.player.vehicle) {
      const dx = n.pos.x - G.player.pos.x, dz = n.pos.z - G.player.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.9) { n.pos.x += dx / d * 0.04; n.pos.z += dz / d * 0.04; }
    }
  }
  updateHostile(n, dt) {
    const ai = n.ai;
    const p = G.player;
    const dx = p.pos.x - n.pos.x, dz = p.pos.z - n.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const see = p.alive && dist < ai.aggro && G.world.los(n.pos.x, n.pos.y + 1.5, n.pos.z, p.pos.x, p.pos.y + 1.1, p.pos.z);
    if (see) {
      n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 9, dt);
      n.aim = damp(n.aim, 1, 8, dt);
      const spd = dist > 14 ? 4.6 : dist > 7 ? 2.2 : 0;
      n.sprinting = dist > 16;
      n.vel.x = Math.sin(n.yaw) * spd;
      n.vel.z = Math.cos(n.yaw) * spd;
      ai.fireT -= dt;
      if (ai.fireT <= 0 && dist < ai.aggro) {
        ai.fireT = rand(0.28, 0.7);
        const origin = n.pos.clone(); origin.y += 1.4;
        const dir = p.pos.clone(); dir.y += 1.05; dir.sub(origin).normalize();
        dir.x += rand(-0.045, 0.045); dir.y += rand(-0.02, 0.02); dir.z += rand(-0.045, 0.045);
        G.combat.shot(n, origin, dir.normalize(), WEAPONS[n.weapon] || WEAPONS[2], true, 0.55);
      }
    } else {
      n.aim = damp(n.aim, 0, 6, dt);
      const hx = ai.homeX - n.pos.x, hz = ai.homeZ - n.pos.z;
      if (Math.hypot(hx, hz) > 8) {
        n.yaw = dampAngle(n.yaw, Math.atan2(hx, hz), 6, dt);
        n.vel.x = Math.sin(n.yaw) * 1.4;
        n.vel.z = Math.cos(n.yaw) * 1.4;
      } else { n.vel.x = damp(n.vel.x, 0, 4, dt); n.vel.z = damp(n.vel.z, 0, 4, dt); }
    }
    n.pos.x += n.vel.x * dt; n.pos.z += n.vel.z * dt;
    this.separate(n);
    n.updateBody(dt);
  }
  updateAmbient(n, dt) {
    const ai = n.ai;
    if (!n.alive) {
      n._deadT = (n._deadT || 0) + dt;
      n.updateBody(dt);
      if (n._deadT > 8) {
        n.alive = true; n.health = 100; n.panic = 0; n._deadT = 0; n._screamed = false;
        const ne = G.world.randomRoadPoint(n.pos.x + rand(-80, 80), n.pos.z + rand(-80, 80), 10, 80, e => !e.deck);
        if (ne) {
          ai.edge = ne.edge; ai.s = ne.s;
          const pt = sidewalkPoint(ne.edge, ne.s, ai.side || 1);
          if (!G.world.isWater(pt.x, pt.z)) n.place(pt.x, G.world.surfaceH(pt.x, pt.z, 5), pt.z, Math.atan2(pt.dx, pt.dz));
        }
      }
      return;
    }
    const scary = n.panic > 0 || (G.shotAt && G.time - G.shotAt.t < 2.2 && dist2D(n.pos.x, n.pos.z, G.shotAt.x, G.shotAt.z) < 34) || (G.wanted && G.wanted.stars > 1 && n.pos.distanceToSquared(G.player.pos) < 18 * 18);
    if (scary) {
      if (!n._screamed) { n._screamed = true; if (G.audio && Math.random() < 0.55) G.audio.scream(n.pos); }
      let sx = n.pos.x - G.player.pos.x, sz = n.pos.z - G.player.pos.z;
      if (G.shotAt && G.time - G.shotAt.t < 2) { sx = n.pos.x - G.shotAt.x; sz = n.pos.z - G.shotAt.z; }
      const l = Math.hypot(sx, sz) || 1;
      n.vel.x = sx / l * 6.4; n.vel.z = sz / l * 6.4;
      n.sprinting = true;
      n.yaw = Math.atan2(n.vel.x, n.vel.z);
      n.panic = Math.max(0, n.panic - dt);
      n.pos.x += n.vel.x * dt; n.pos.z += n.vel.z * dt;
      if (n.panic <= 0 && (!G.shotAt || G.time - G.shotAt.t > 2.4)) n._screamed = false;
    } else if (n.swim) {
      ai.dir *= -1;
      n.panic = 1.5;
    } else {
      const pt = sidewalkPoint(ai.edge, ai.s, ai.side);
      const dx = pt.x - n.pos.x, dz = pt.z - n.pos.z;
      n.yaw = dampAngle(n.yaw, Math.atan2(ai.dir * pt.dx, ai.dir * pt.dz), 8, dt);
      n.vel.x = Math.sin(n.yaw) * 1.45;
      n.vel.z = Math.cos(n.yaw) * 1.45;
      n.sprinting = false;
      if (Math.hypot(dx, dz) > 3) { n.vel.x += dx * 0.4; n.vel.z += dz * 0.4; }
      n.pos.x += n.vel.x * dt; n.pos.z += n.vel.z * dt;
      const before = ai.s;
      ai.s += ai.dir * 1.45 * dt;
      if (ai.s < 1 || ai.s > ai.edge.len - 1) { ai.dir *= -1; ai.s = clamp(ai.s, 1, ai.edge.len - 1); }
      if (Math.hypot(n.vel.x, n.vel.z) > 0 && Math.abs(ai.s - before) < 0.001) ai.stuck += dt; else ai.stuck = 0;
      if (ai.stuck > 1.4) { ai.dir *= -1; ai.stuck = 0; }
    }
    this.separate(n);
    n.updateBody(dt);
  }
  update(dt) {
    for (const n of G.npcs) {
      if (!n.alive) {
        if (n.ai && n.ai.ambient) this.updateAmbient(n, dt);
        else n.updateBody(dt);
        continue;
      }
      if (n.ai && n.ai.hostile) this.updateHostile(n, dt);
      else if (n.ai && n.ai.ambient) this.updateAmbient(n, dt);
      else n.updateBody(dt);
    }
  }
}

class SpikeStrip {
  constructor(x, z, yaw) {
    this.pos = new THREE.Vector3(x, 0.08, z);
    this.yaw = yaw;
    this.cool = 0;
    this.alive = true;
    const g = new THREE.Group();
    const base = new THREE.Mesh(gBox(3.2, 0.06, 0.7), new THREE.MeshStandardMaterial({ color: '#222' }));
    g.add(base);
    for (let i = -4; i <= 4; i++) {
      const s = new THREE.Mesh(gCone(0.08, 0.28, 4), new THREE.MeshStandardMaterial({ color: '#d7d7d7', metalness: 0.8, roughness: 0.3 }));
      s.position.set(i * 0.32, 0.16, 0);
      g.add(s);
    }
    g.position.copy(this.pos);
    g.rotation.y = yaw;
    this.mesh = g;
    G.scene.add(g);
  }
  update(dt) {
    this.cool -= dt;
    const p = G.player;
    if (!p || !p.vehicle || p.vehicle.spec.cls === 'heli' || p.vehicle.spec.cls === 'boat') return;
    const dx = p.vehicle.pos.x - this.pos.x, dz = p.vehicle.pos.z - this.pos.z;
    if (Math.hypot(dx, dz) < 2.6 && Math.abs(p.vehicle.pos.y - this.pos.y) < 1.5 && this.cool <= 0) {
      this.cool = 0.45;
      p.vehicle.vel.multiplyScalar(0.35);
      p.vehicle.speed *= 0.35;
      p.vehicle.damage(14);
      if (G.hud) G.hud.note('Spike strip.');
    }
  }
  remove() { this.alive = false; G.scene.remove(this.mesh); }
}

class Wanted {
  constructor() {
    this.stars = 0;
    this.hidden = 0;
    this.coolShot = 0;
    this.coolCiv = 0;
    this.coolCop = 0;
    this.spawnT = 0;
    this.blocks = [];
    this.spikes = [];
    this.blockLive = false;
  }
  blip(kind, gap) {
    const key = kind === 'civ' ? 'coolCiv' : kind === 'cop' || kind === 'boom' ? 'coolCop' : 'coolShot';
    if (this[key] > 0) return;
    this[key] = gap;
    if (kind === 'boom') this.add(2);
    else this.add(1);
  }
  add(n) {
    const prev = this.stars;
    this.stars = clamp(this.stars + n, 0, 5);
    this.hidden = 0;
    if (this.stars > prev) {
      if (G.audio) G.audio.ui('star');
      if (G.hud) G.hud.note(this.stars === 1 ? 'The heat is on.' : 'Wanted level <b>' + this.stars + '</b>.');
    }
  }
  setStars(n) {
    const prev = this.stars;
    this.stars = clamp(n, 0, 5);
    this.hidden = 0;
    if (this.stars > prev && G.audio) G.audio.ui('star');
    if (G.hud && this.stars > prev) G.hud.note('Wanted level <b>' + this.stars + '</b>.');
  }
  clear() {
    this.stars = 0;
    this.hidden = 0;
    this.clearBlock();
    for (const v of G.vehicles) {
      if (!v.ai || (v.ai.role !== 'chase' && v.ai.role !== 'heli' && v.ai.role !== 'block')) continue;
      if (v.driver === G.player) { v.siren = false; v.ai = null; continue; }
      this.removeUnit(v);
    }
  }
  removeUnit(v) {
    if (v.driver && v.driver !== G.player) exitVehicle(v.driver, true);
    G.scene.remove(v.mesh);
    const i = G.vehicles.indexOf(v);
    if (i >= 0) G.vehicles.splice(i, 1);
    v.dead = true;
  }
  quota() {
    const s = this.stars;
    if (s <= 0) return { police: 0, enforcer: 0, heli: 0 };
    if (s === 1) return { police: 1, enforcer: 0, heli: 0 };
    if (s === 2) return { police: 2, enforcer: 0, heli: 0 };
    if (s === 3) return { police: 3, enforcer: 0, heli: 1 };
    if (s === 4) return { police: 3, enforcer: 2, heli: 2 };
    return { police: 3, enforcer: 2, heli: 2 };
  }
  counts() {
    const c = { police: 0, enforcer: 0, heli: 0 };
    for (const v of G.vehicles) {
      if (v.dead || !v.ai) continue;
      if (v.ai.role === 'heli') c.heli++;
      else if (v.ai.role === 'chase' && v.id === 'enforcer') c.enforcer++;
      else if (v.ai.role === 'chase') c.police++;
    }
    return c;
  }
  spawnUnit(kind) {
    const p = G.player.pos;
    if (kind === 'heli') {
      const v = spawnVehicle('maverick', p.x + rand(-90, 90), p.z + rand(-90, 90), Math.random() * TAU);
      v.pos.y = Math.max(32, G.world.surfaceH(v.pos.x, v.pos.z, 40) + 28);
      v.police = true; v.siren = true;
      v.ai = { role: 'heli', fireT: rand(0.2, 1), idx: Math.random() * TAU };
      return v;
    }
    const ang = Math.random() * TAU;
    const ne = G.world.randomRoadPoint(p.x + Math.cos(ang) * 100, p.z + Math.sin(ang) * 100, 15, 45, e => !e.deck);
    if (!ne || dist2D(ne.x, ne.z, p.x, p.z) < 28) return null;
    const id = kind === 'enforcer' ? 'enforcer' : 'police';
    const v = spawnVehicle(id, ne.x, ne.z, Math.atan2(ne.dx, ne.dz));
    v.police = true; v.siren = true;
    v.driver = dummyDriver(v);
    v.ai = { role: 'chase', path: null, pathT: 0, fireT: rand(0.3, 1.1) };
    return v;
  }
  makeBlock() {
    this.clearBlock();
    const p = G.player.pos;
    const yaw = G.cam ? G.cam.yaw : G.player.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ne = G.world.nearestEdge(p.x + fx * 75, p.z + fz * 75, 50, e => !e.deck);
    if (!ne) return;
    const rx = ne.dz, rz = -ne.dx;
    for (const side of [-1, 1]) {
      const v = spawnVehicle('police', ne.x + rx * side * 2.1, ne.z + rz * side * 2.1, Math.atan2(rx, rz));
      v.police = true; v.siren = true;
      v.ai = { role: 'block' };
      this.blocks.push(v);
    }
    const sp = new SpikeStrip(ne.x - fx * 8, ne.z - fz * 8, Math.atan2(fx, fz));
    this.spikes.push(sp);
    this.blockLive = true;
    if (G.hud) G.hud.note('Roadblock ahead.');
  }
  clearBlock() {
    for (const v of this.blocks) if (v && !v.dead && v.driver !== G.player) this.removeUnit(v);
    this.blocks = [];
    for (const s of this.spikes) s.remove();
    this.spikes = [];
    this.blockLive = false;
  }
  seen() {
    const p = G.player;
    for (const v of G.vehicles) {
      if (v.dead || !v.police || !v.ai || v.driver === p) continue;
      const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
      const dist = Math.hypot(dx, dz);
      const reach = v.spec.cls === 'heli' ? 150 : 78;
      if (dist > reach || dist < 0.1) continue;
      const fwd = Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz;
      if (fwd / dist < 0.45 && v.spec.cls !== 'heli') continue;
      const y = v.spec.cls === 'heli' ? v.pos.y : v.pos.y + 1.6;
      if (G.world.los(v.pos.x, y, v.pos.z, p.pos.x, p.pos.y + 1.2, p.pos.z)) return true;
    }
    return false;
  }
  driveToward(v, tx, tz, accel) {
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    const diff = wrapAngle(Math.atan2(dx, dz) - v.yaw);
    v.input.steer = clamp(diff * 2.3, -1, 1);
    v.input.throttle = Math.abs(diff) < 1.35 ? accel : 0.45;
    v.input.brake = Math.abs(diff) > 1.9 ? 1 : 0;
    v.input.handbrake = 0;
  }
  updateChase(v, dt) {
    const ai = v.ai;
    const p = G.player;
    const target = p.vehicle || p;
    ai.pathT -= dt;
    const elevated = target.pos.y > 6;
    if (!ai.path || ai.pathT <= 0) {
      ai.pathT = 1.3 + Math.random() * 0.4;
      const nodes = G.world.findPath(v.pos.x, v.pos.z, target.pos.x, target.pos.z, elevated ? null : e => !e.deck);
      ai.path = nodes ? G.world.pathPoints(nodes) : null;
      ai.pathI = 0;
    }
    let tx = target.pos.x, tz = target.pos.z;
    if (ai.path && ai.path.length) {
      while (ai.pathI < ai.path.length - 1 && dist2D(v.pos.x, v.pos.z, ai.path[ai.pathI].x, ai.path[ai.pathI].z) < 9) ai.pathI++;
      tx = ai.path[ai.pathI].x; tz = ai.path[ai.pathI].z;
    }
    if (this.stars <= 2 && p.vehicle && v.pos.distanceTo(p.vehicle.pos) < 14) {
      const pv = p.vehicle;
      tx = pv.pos.x + Math.cos(pv.yaw) * 1.8;
      tz = pv.pos.z - Math.sin(pv.yaw) * 1.8;
    }
    const ram = this.stars >= 4 ? 1 : 0.85;
    this.driveToward(v, tx, tz, ram);
    const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, dist = Math.hypot(dx, dz);
    const cone = dist > 0.1 ? (Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz) / dist : 0;
    if (this.stars >= 3 && dist < 52 && cone > 0.35 && G.world.los(v.pos.x, v.pos.y + 1.5, v.pos.z, p.pos.x, p.pos.y + 1.1, p.pos.z)) {
      ai.fireT -= dt;
      if (ai.fireT <= 0) {
        ai.fireT = this.stars >= 5 ? 0.16 : this.stars >= 4 ? 0.28 : 0.5;
        const origin = v.pos.clone(); origin.y += 1.45;
        const dir = p.pos.clone(); dir.y += 1.05; dir.sub(origin).normalize();
        dir.x += rand(-0.04, 0.04); dir.z += rand(-0.04, 0.04);
        const gun = this.stars >= 4 ? WEAPONS[3] : WEAPONS[1];
        G.combat.shot(v, origin, dir, gun, true, this.stars >= 5 ? 0.5 : 0.32);
      }
    }
  }
  updateHeli(v, dt) {
    const ai = v.ai;
    const p = G.player.pos;
    const ox = Math.cos(G.time * 0.25 + ai.idx) * 16;
    const oz = Math.sin(G.time * 0.25 + ai.idx) * 16;
    const tx = p.x + ox, tz = p.z + oz, ty = Math.max(p.y + 24, 22);
    v.input.throttle = v.pos.y < ty ? 1 : 0;
    v.input.brake = v.pos.y > ty + 5 ? 1 : 0;
    const dx = tx - v.pos.x, dz = tz - v.pos.z;
    v.input.steer = clamp(wrapAngle(Math.atan2(p.x - v.pos.x, p.z - v.pos.z) - v.yaw) * 1.4, -1, 1);
    const fwd = v.forward(_v1);
    const right = _v2.set(fwd.z, 0, -fwd.x);
    v.input.pitch = clamp(-(dx * fwd.x + dz * fwd.z) / 26, -1, 1);
    v.input.roll = clamp((dx * right.x + dz * right.z) / 26, -1, 1);
    v.input.handbrake = 0;
    const dist = Math.hypot(p.x - v.pos.x, p.z - v.pos.z);
    if (this.stars >= 3 && dist < 90 && G.world.los(v.pos.x, v.pos.y, v.pos.z, G.player.pos.x, G.player.pos.y + 1, G.player.pos.z)) {
      ai.fireT -= dt;
      if (ai.fireT <= 0) {
        ai.fireT = this.stars >= 5 ? 0.22 : 0.45;
        const origin = v.pos.clone(); origin.y -= 0.4;
        const dir = G.player.pos.clone(); dir.y += 1; dir.sub(origin).normalize();
        dir.x += rand(-0.03, 0.03); dir.z += rand(-0.03, 0.03);
        G.combat.shot(v, origin, dir, WEAPONS[2], true, 0.4);
      }
    }
  }
  update(dt) {
    this.coolShot = Math.max(0, this.coolShot - dt);
    this.coolCiv = Math.max(0, this.coolCiv - dt);
    this.coolCop = Math.max(0, this.coolCop - dt);
    for (const s of this.spikes) s.update(dt);
    if (this.stars <= 0) return;
    if (this.seen()) this.hidden = 0;
    else this.hidden += dt;
    if (this.hidden > 9 + this.stars * 2.2) {
      this.stars--;
      this.hidden = 0;
      if (G.hud) G.hud.note(this.stars ? 'They lost sight. <b>' + this.stars + '</b> stars.' : 'You shook them.');
      if (G.audio && this.stars === 0) G.audio.ui('checkpoint');
      if (this.stars === 0) { this.clear(); return; }
    }
    if (this.stars >= 3 && !this.blockLive) this.makeBlock();
    if (this.stars < 3 && this.blockLive) this.clearBlock();
    const q = this.quota();
    const c = this.counts();
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.2;
      if (c.heli < q.heli) this.spawnUnit('heli');
      else if (c.enforcer < q.enforcer) this.spawnUnit('enforcer');
      else if (c.police < q.police) this.spawnUnit('police');
    }
    if (c.police + c.enforcer + c.heli > q.police + q.enforcer + q.heli + 1) {
      let far = null, fd = 0;
      for (const v of G.vehicles) {
        if (!v.ai || v.dead || v.driver === G.player || (v.ai.role !== 'chase' && v.ai.role !== 'heli')) continue;
        const d = v.pos.distanceToSquared(G.player.pos);
        if (d > fd) { fd = d; far = v; }
      }
      if (far && fd > 200 * 200) this.removeUnit(far);
    }
    for (const v of G.vehicles) {
      if (v.dead || !v.ai || v.driver === G.player) continue;
      if (v.ai.role === 'chase') this.updateChase(v, dt);
      else if (v.ai.role === 'heli') this.updateHeli(v, dt);
      else if (v.ai.role === 'block') {
        if (this.stars >= 4 && v.pos.distanceTo(G.player.pos) < 24) v.ai.role = 'chase';
        else { v.input.throttle = 0; v.input.brake = 1; v.input.handbrake = 1; v.input.steer = 0; }
      }
    }
  }
}

function populateWorld() {
  G.traffic = new Traffic();
  G.peds = new PedCrowd();
  G.wanted = new Wanted();
  G.traffic.fill();
  G.peds.fill();
  const park = (id, x, z) => {
    const ne = G.world.nearestEdge(x, z, 70, e => !e.deck);
    if (!ne) return null;
    const pose = lanePose(ne.edge, ne.s, 0, 1);
    const v = spawnVehicle(id, pose.x + pose.fx * 4, pose.z + pose.fz * 4, Math.atan2(pose.fx, pose.fz));
    v.parked = true;
    return v;
  };
  park('inferno', -180, -220);
  park('sanchez', -150, -180);
  park('phoenix', 40, -80);
  if (G.world.piers && G.world.piers.length) {
    const pier = G.world.piers[0];
    const boat = spawnVehicle('speeder', pier.x + 6, (pier.z0 + pier.z1) * 0.5, Math.PI / 2);
    boat.parked = true;
  }
  if (G.world.airSpot) {
    const h = spawnVehicle('maverick', G.world.airSpot.x, G.world.airSpot.z, 0.4);
    h.parked = true;
  }
}
