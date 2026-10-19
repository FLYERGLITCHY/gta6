const VEH_SPECS = {
  inferno: { name: 'Infernus', cls: 'super', price: 2500, L: 2.35, W: 1.05, H: 0.55, y: 0.45, accel: 32, brake: 22, top: 82, grip: 1.15, steer: 1.7, mass: 1400, drive: 'awd', nitro: true, camH: 1.1, color: '#ff2a3a', engine: { idle: 55, max: 210, vol: 0.4, drive: 6 } },
  cheetah: { name: 'Cheetah', cls: 'super', price: 3200, L: 2.3, W: 1.08, H: 0.5, y: 0.42, accel: 36, brake: 24, top: 88, grip: 1.05, steer: 1.6, mass: 1350, drive: 'rwd', nitro: true, camH: 1.05, color: '#f5f5f5', engine: { idle: 62, max: 240, vol: 0.42, drive: 7 } },
  phoenix: { name: 'Phoenix', cls: 'muscle', price: 800, L: 2.5, W: 1.05, H: 0.62, y: 0.5, accel: 24, brake: 14, top: 62, grip: 0.72, steer: 1.45, mass: 1700, drive: 'rwd', nitro: false, camH: 1.25, color: '#1a3a8a', engine: { idle: 38, max: 130, vol: 0.5, drive: 8, wave: 'sawtooth' } },
  sentinel: { name: 'Sentinel', cls: 'sedan', price: 400, L: 2.4, W: 1.0, H: 0.7, y: 0.55, accel: 16, brake: 16, top: 48, grip: 0.95, steer: 1.5, mass: 1550, drive: 'fwd', nitro: false, camH: 1.3, color: '#cfd6de', engine: { idle: 32, max: 110, vol: 0.22, drive: 3 } },
  sanchez: { name: 'Sanchez', cls: 'bike', price: 300, L: 1.15, W: 0.32, H: 0.55, y: 0.48, accel: 26, brake: 16, top: 58, grip: 1.0, steer: 2.1, mass: 220, drive: 'rwd', nitro: false, wheelie: true, camH: 1.15, color: '#ff8a1e', engine: { idle: 70, max: 260, vol: 0.28, drive: 4, wave: 'square' } },
  speeder: { name: 'Speeder', cls: 'boat', price: 1500, L: 3.3, W: 1.25, H: 0.7, y: 0.35, accel: 18, brake: 8, top: 42, grip: 0.45, steer: 1.1, mass: 900, drive: 'awd', nitro: false, camH: 1.6, color: '#f4f7fb', engine: { idle: 30, max: 90, vol: 0.2, drive: 2 } },
  maverick: { name: 'Maverick', cls: 'heli', price: 5000, L: 3.2, W: 1.2, H: 1.3, y: 1.1, accel: 16, brake: 10, top: 55, grip: 1, steer: 1.3, mass: 1200, drive: 'awd', nitro: false, camH: 1.6, color: '#d8dde4', engine: { idle: 20, max: 40, vol: 0.15, drive: 1 } },
  police: { name: 'Cruiser', cls: 'sedan', price: 0, L: 2.45, W: 1.02, H: 0.72, y: 0.55, accel: 20, brake: 18, top: 58, grip: 0.9, steer: 1.55, mass: 1700, drive: 'awd', nitro: false, camH: 1.35, color: '#f4f4f4', police: true, engine: { idle: 36, max: 140, vol: 0.28, drive: 4 } },
  enforcer: { name: 'Enforcer', cls: 'truck', price: 0, L: 3.1, W: 1.25, H: 1.35, y: 0.85, accel: 12, brake: 14, top: 40, grip: 0.8, steer: 1.1, mass: 4500, drive: 'awd', nitro: false, camH: 2.1, color: '#1c2430', police: true, armored: true, engine: { idle: 28, max: 80, vol: 0.4, drive: 5 } },
  vip: { name: 'VIP Cheetah', cls: 'super', price: 0, L: 2.35, W: 1.08, H: 0.5, y: 0.42, accel: 34, brake: 22, top: 84, grip: 1.1, steer: 1.6, mass: 1400, drive: 'awd', nitro: true, camH: 1.05, color: '#d4af37', engine: { idle: 60, max: 220, vol: 0.4, drive: 6 } }
};

function carMesh(spec) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.6, envMapIntensity: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#14161a', roughness: 0.4, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd0e8', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 });
  const L = spec.L, W = spec.W, H = spec.H;
  const body = new THREE.Mesh(gBox(W * 2, H, L * 2), paint);
  body.position.y = spec.y;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (spec.cls !== 'bike' && spec.cls !== 'boat' && spec.cls !== 'heli') {
    const cabH = H * 0.55, cabL = L * 0.9;
    const cab = new THREE.Mesh(gBox(W * 1.7, cabH, cabL), glass);
    cab.position.set(0, spec.y + H * 0.55, -L * 0.15);
    g.add(cab);
    if (spec.cls === 'super' || spec.cls === 'muscle') {
      const sp = new THREE.Mesh(gBox(W * 1.9, 0.08, 0.35), paint);
      sp.position.set(0, spec.y + H * 0.7, -L + 0.1);
      g.add(sp);
    }
    if (spec.nitro || spec.cls === 'super') {
      const ug = new THREE.Mesh(gBox(W * 1.5, 0.05, L * 1.4), new THREE.MeshBasicMaterial({ color: spec.cls === 'super' ? '#2ee6ff' : '#ff2fa8' }));
      ug.position.y = 0.12;
      g.add(ug);
      g.userData.underglow = ug;
    }
  }
  if (spec.cls === 'bike') {
    body.scale.set(0.7, 0.45, 1);
    const tank = new THREE.Mesh(gBox(0.28, 0.22, 0.7), paint);
    tank.position.set(0, spec.y + 0.15, 0.15);
    g.add(tank);
  }
  if (spec.cls === 'boat') {
    body.geometry = gBox(W * 2, H * 0.6, L * 2);
    const bow = new THREE.Mesh(gBox(W * 1.2, H * 0.4, 0.8), paint);
    bow.position.set(0, spec.y, L * 0.85);
    g.add(bow);
    const wind = new THREE.Mesh(gBox(W * 1.6, 0.45, 0.08), glass);
    wind.position.set(0, spec.y + 0.55, L * 0.2);
    g.add(wind);
  }
  if (spec.cls === 'heli') {
    body.scale.set(1, 0.7, 1.1);
    const tail = new THREE.Mesh(gBox(0.18, 0.18, 2.4), paint);
    tail.position.set(0, spec.y + 0.15, -L * 0.9);
    g.add(tail);
    const rotor = new THREE.Mesh(gBox(0.12, 0.05, 6.4), dark);
    rotor.position.y = spec.y + H * 0.7;
    g.add(rotor);
    const tailR = new THREE.Mesh(gBox(1.3, 0.04, 0.1), dark);
    tailR.position.set(0.15, spec.y + 0.2, -L * 0.9 - 1.1);
    g.add(tailR);
    g.userData.rotor = rotor; g.userData.tailRotor = tailR;
    const skid = new THREE.Mesh(gBox(1.3, 0.06, 2.2), dark);
    skid.position.y = 0.15; g.add(skid);
  }
  if (spec.police) {
    const bar = new THREE.Mesh(gBox(0.7, 0.12, 0.28), dark);
    bar.position.set(0, spec.y + H + 0.15, -0.1);
    const r = new THREE.Mesh(gBox(0.22, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: '#ff2030' }));
    const b = new THREE.Mesh(gBox(0.22, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: '#2060ff' }));
    r.position.set(-0.2, 0.02, 0); b.position.set(0.2, 0.02, 0); bar.add(r); bar.add(b);
    g.add(bar); g.userData.lightR = r.material; g.userData.lightB = b.material;
  }
  const wheels = [];
  if (spec.cls !== 'boat' && spec.cls !== 'heli') {
    const wr = spec.cls === 'bike' ? 0.34 : 0.36;
    const ww = spec.cls === 'bike' ? 0.12 : 0.22;
    const geo = new THREE.CylinderGeometry(wr, wr, ww, 12);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.7 });
    const spots = spec.cls === 'bike' ? [[0, L * 0.65], [0, -L * 0.7]] : [[W * 0.92, L * 0.62], [-W * 0.92, L * 0.62], [W * 0.92, -L * 0.62], [-W * 0.92, -L * 0.62]];
    for (const [x, z] of spots) {
      const pivot = new THREE.Group();
      pivot.position.set(x, wr, z);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      wheels.push({ pivot, front: z > 0, radius: wr });
    }
  }
  const hl = new THREE.Mesh(gBox(0.28, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: '#fff4d2' }));
  hl.position.set(W * 0.55, spec.y, L * 0.98);
  const hr = hl.clone(); hr.position.x *= -1;
  g.add(hl); g.add(hr);
  g.userData.headL = hl; g.userData.headR = hr;
  return g;
}

class Vehicle {
  constructor(id, x, z, yaw) {
    this.spec = VEH_SPECS[id];
    this.id = id;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw || 0;
    this.pitch = 0; this.roll = 0;
    this.vel = new THREE.Vector3();
    this.speed = 0;
    this.rpm = 0.15;
    this.gear = 1;
    this.health = 100;
    this.dead = false;
    this.nitro = this.spec.nitro ? 1 : 0;
    this.nitroOn = false;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false, pitch: 0, roll: 0 };
    this.mesh = carMesh(this.spec);
    this.mesh.userData.vehicle = this;
    G.scene.add(this.mesh);
    this.driver = null;
    this.ai = null;
    this.siren = false;
    this.police = !!this.spec.police;
    this.enclosed = this.spec.cls !== 'bike' && this.spec.cls !== 'boat';
    this.smokeT = 0; this.fireT = 0;
    this.wheelSpin = 0;
    this.rotor = 0;
    this.air = 0;
    this.voice = null;
    this.parked = false;
    this._skid = null;
    this.settle();
  }
  settle() {
    if (this.spec.cls === 'boat') this.pos.y = (G.ocean ? G.ocean.heightAt(this.pos.x, this.pos.z) : WATER_Y) + 0.2;
    else if (this.spec.cls === 'heli') this.pos.y = Math.max(this.pos.y, G.world.surfaceH(this.pos.x, this.pos.z) + 1);
    else this.pos.y = G.world.surfaceH(this.pos.x, this.pos.z, this.pos.y + 4, 2) + this.spec.y * 0.15;
  }
  get speedMph() { return Math.abs(this.speed) * MPS_TO_MPH; }
  forward(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  seatPos(i) {
    const f = this.forward(_v1);
    const r = _v2.set(f.z, 0, -f.x);
    const sit = this.spec.cls === 'bike' ? 0.42 : this.spec.cls === 'heli' ? 0.7 : this.spec.cls === 'boat' ? 0.35 : 0.02;
    const fwd = this.spec.cls === 'bike' ? 0.15 : -0.05;
    return this.pos.clone().addScaledVector(f, fwd).addScaledVector(r, i ? 0.32 : -0.32).setY(this.pos.y + sit);
  }
  damage(amount, pos) {
    if (this.dead) return;
    this.health -= this.spec.armored ? amount * 0.35 : amount;
    if (G.fx && pos) G.fx.sparks(pos, _v1.set(rand(-1, 1), 0.5, rand(-1, 1)), 6);
    if (this.health <= 0) this.explode();
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    this.health = 0;
    if (this.driver) {
      const d = this.driver;
      exitVehicle(d, true);
      d.damage(70);
    }
    if (G.fx) G.fx.explosion(this.pos.clone().setY(this.pos.y + 1), this.spec.cls === 'heli' ? 1.3 : 1);
    this.vel.y = rand(6, 12);
    this.mesh.traverse(o => { if (o.material && o.material.color) o.material.color.multiplyScalar(0.3); });
    blast(this.pos, 8, 80, this);
    if (G.wanted && this.police) G.wanted.add(1);
  }
  update(dt) {
    if (this.dead) { this.pos.addScaledVector(this.vel, dt); this.vel.y -= GRAVITY * dt; this.mesh.position.copy(this.pos); this.mesh.rotation.z += dt * 2; return; }
    if (this.parked && this.driver !== G.player) { this.vel.multiplyScalar(Math.exp(-4 * dt)); this.input.throttle = 0; this.input.brake = 1; }
    if (this.spec.cls === 'heli') this.updateHeli(dt);
    else if (this.spec.cls === 'boat') this.updateBoat(dt);
    else this.updateCar(dt);
    this.effects(dt);
    if (this.voice && G.audio) G.audio.updateEngine(this.voice, this.rpm, this.input.throttle, this.driver === G.player ? null : this.pos);
  }
  updateCar(dt) {
    const s = this.spec;
    const fwd = this.forward(_v1);
    const right = _v2.set(fwd.z, 0, -fwd.x);
    let spd = this.vel.dot(fwd);
    let lat = this.vel.dot(right);
    const info = {};
    G.world.groundInfo(this.pos.x, this.pos.z, this.pos.y + 1, 1.2, info);
    const deep = info.kind === 'terrain' && info.h < WATER_Y - 0.8;
    let accel = this.input.throttle * s.accel * (1 - Math.max(0, spd) / s.top);
    if (spd < 0) accel = this.input.throttle * s.accel * 0.4;
    if (this.input.brake) accel -= s.brake * Math.sign(spd || 1);
    this.nitroOn = !!(this.input.nitro && this.nitro > 0.02 && s.nitro);
    if (this.nitroOn) { accel *= 1.65; this.nitro = Math.max(0, this.nitro - dt * 0.18); }
    else if (s.nitro) this.nitro = Math.min(1, this.nitro + dt * 0.04);
    if (deep) accel *= 0.15;
    spd += accel * dt;
    spd *= 1 - dt * 0.15;
    const drift = this.input.handbrake || (s.drive === 'rwd' && this.input.throttle && Math.abs(this.input.steer) > 0.4 && spd > 12);
    const grip = s.grip * (drift ? 0.28 : 1) * (info.kind === 'terrain' && info.h > -0.2 ? 0.65 : 1) * (G.weather.wet ? 0.8 : 1);
    lat *= Math.exp(-grip * 7 * dt);
    const wheelie = s.wheelie && this.input.throttle > 0 && spd > 8 && this.input.handbrake;
    const steer = this.input.steer * s.steer * clamp(Math.abs(spd) / 10, 0.15, 1) * Math.sign(spd || 1);
    this.yaw += steer * dt * (drift ? 1.45 : 1);
    this.vel.copy(fwd).multiplyScalar(spd).addScaledVector(right, lat);
    this.pos.addScaledVector(this.vel, dt);
    const targetY = (deep ? info.h - 0.4 : info.h) + 0.02;
    const fall = this.pos.y > targetY + 0.35;
    if (fall) { this.vel.y -= GRAVITY * dt; this.pos.y += this.vel.y * dt; this.air += dt; }
    else { if (this.air > 0.25) { this.damage(this.air * 40); if (G.fx) G.fx.burst(this.pos, '#bbb', 8, 3, 0.3, 0.15, -3); if (G.audio) G.audio.impact(this.pos, Math.min(1, this.air)); } this.air = 0; this.pos.y = targetY; this.vel.y = 0; }
    const slope = info.deck ? (info.deck.y1 - info.deck.y0) / info.deck.len : 0;
    this.pitch = wheelie ? damp(this.pitch, -0.62, 4, dt) : damp(this.pitch, fall ? this.pitch : -accel * 0.004 + slope, 5, dt);
    this.roll = damp(this.roll, s.cls === 'bike' ? -this.input.steer * clamp(spd / 30, 0, 1) * 0.5 : -this.input.steer * clamp(spd / 40, 0, 1) * 0.18, 6, dt);
    this.collide(dt, spd);
    this.speed = spd;
    const gears = [0, 0.18, 0.38, 0.6, 0.82, 1];
    const ratio = clamp(Math.abs(spd) / s.top, 0, 1);
    let gear = 1; while (gear < 5 && ratio > gears[gear]) gear++;
    if (gear !== this.gear) this.gear = gear;
    this.rpm = clamp(0.15 + ((ratio - gears[gear - 1]) / ((gears[gear] || 1) - gears[gear - 1] + 0.001)) * 0.8 + this.input.throttle * 0.1, 0.1, 1);
    this.wheelSpin += spd * dt / 0.36;
    const mesh = this.mesh;
    mesh.position.copy(this.pos);
    mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const wheels = [];
    mesh.traverse(o => { if (o.userData && o === mesh) return; });
    const kids = mesh.children;
    for (const ch of kids) {
      if (ch.children[0] && ch.children[0].geometry && ch.children[0].geometry.type === 'CylinderGeometry') {
        ch.rotation.y = ch.position.z > 0 ? this.input.steer * 0.4 : 0;
        ch.children[0].rotation.x = this.wheelSpin;
      }
    }
    if (drift && Math.abs(spd) > 8 && G.fx) {
      const smokeAt = this.pos.clone().addScaledVector(right, s.W);
      G.fx.tire(smokeAt, Math.sign(lat || this.input.steer));
      if (this._skid) G.fx.skid(this._skid, this.pos.clone());
      this._skid = this.pos.clone();
      if (G.audio && this.driver === G.player) G.audio.setLoop('screech', Math.min(0.25, Math.abs(lat) * 0.02 + (this.input.handbrake ? 0.12 : 0)));
    } else this._skid = null;
    const rail = {};
    G.world.railPush(this.pos.x, this.pos.z, this.pos.y, 0.6, rail);
    if (rail.hit && this.speed > 8 && Math.random() < 0.2) this.damage(4);
  }
  updateBoat(dt) {
    const s = this.spec;
    const fwd = this.forward(_v1);
    let spd = this.vel.dot(fwd);
    spd += (this.input.throttle * s.accel - this.input.brake * s.brake - spd * 0.4) * dt;
    this.yaw += this.input.steer * s.steer * clamp(Math.abs(spd) / 8, 0.2, 1) * dt * Math.sign(spd || 1);
    this.vel.copy(fwd).multiplyScalar(spd);
    this.pos.addScaledVector(this.vel, dt);
    const wh = G.ocean ? G.ocean.heightAt(this.pos.x, this.pos.z) : WATER_Y;
    const shore = G.world.terrainH(this.pos.x, this.pos.z);
    if (shore > wh - 0.3) { this.pos.x -= this.vel.x * dt * 1.2; this.pos.z -= this.vel.z * dt * 1.2; spd *= 0.9; this.damage(dt * 8); }
    this.pos.y = damp(this.pos.y, wh + 0.15, 4, dt);
    this.pitch = damp(this.pitch, Math.sin(G.time * 1.6 + this.pos.x * 0.02) * 0.05 - spd * 0.004, 3, dt);
    this.roll = damp(this.roll, -this.input.steer * 0.12, 3, dt);
    this.speed = spd;
    this.rpm = clamp(Math.abs(spd) / s.top, 0.1, 1);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    if (Math.abs(spd) > 6 && G.fx && (G.frame & 1) === 0) G.fx.water(this.pos.clone().addScaledVector(fwd, -s.L), fwd.clone().multiplyScalar(-spd * 0.15).setY(2), 3);
    if (G.audio) G.audio.setLoop('wake', this.driver === G.player ? clamp(Math.abs(spd) / 40, 0, 0.25) : 0);
  }
  updateHeli(dt) {
    const s = this.spec;
    const collective = this.input.throttle - this.input.brake;
    this.vel.y += (collective * 22 - 2.5) * dt;
    this.vel.y *= Math.exp(-0.6 * dt);
    this.yaw += this.input.steer * s.steer * dt;
    const fwd = this.forward(_v1);
    const right = _v2.set(fwd.z, 0, -fwd.x);
    this.vel.addScaledVector(fwd, -this.input.pitch * s.accel * dt);
    this.vel.addScaledVector(right, this.input.roll * s.accel * dt);
    this.vel.x *= Math.exp(-0.35 * dt); this.vel.z *= Math.exp(-0.35 * dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > s.top) { this.vel.x *= s.top / sp; this.vel.z *= s.top / sp; }
    this.pos.addScaledVector(this.vel, dt);
    const ground = G.world.surfaceH(this.pos.x, this.pos.z, this.pos.y, 3);
    if (this.pos.y < ground + 1.2) { this.pos.y = ground + 1.2; if (this.vel.y < -2) this.damage(Math.abs(this.vel.y) * 4); this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > 420) { this.pos.y = 420; this.vel.y = 0; }
    this.pitch = damp(this.pitch, this.input.pitch * 0.35, 3, dt);
    this.roll = damp(this.roll, -this.input.roll * 0.4, 3, dt);
    this.speed = sp;
    this.rpm = clamp(0.4 + Math.abs(collective) * 0.4 + sp / s.top * 0.2, 0, 1);
    this.rotor += dt * (18 + this.rpm * 40);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    const rotor = this.mesh.userData.rotor, tail = this.mesh.userData.tailRotor;
    if (rotor) rotor.rotation.y = this.rotor;
    if (tail) tail.rotation.x = this.rotor * 1.6;
    this.collide(dt, sp);
  }
  collide(dt, spd) {
    const s = this.spec;
    const hits = [];
    G.world.collideOBB(this.pos.x, this.pos.z, this.yaw, s.L * 0.9, s.W * 0.9, this.pos.y, this.pos.y + s.H + 0.5, hits, 0.8);
    for (const h of hits) {
      this.pos.x += h.nx * h.depth;
      this.pos.z += h.nz * h.depth;
      const into = this.vel.x * h.nx + this.vel.z * h.nz;
      if (into < 0) {
        this.vel.x -= h.nx * into * 1.3;
        this.vel.z -= h.nz * into * 1.3;
        if (-into > 6) { this.damage((-into - 6) * 1.6); if (G.fx) G.fx.sparks(_v3.set(this.pos.x, this.pos.y + 0.5, this.pos.z), _v1.set(h.nx, 0.4, h.nz), 8); if (G.audio) G.audio.impact(this.pos, clamp(-into / 20, 0.2, 1)); }
      }
      if (h.col && h.col.knockable && Math.abs(spd) > 5) G.world.knock(h.col);
    }
    for (const o of G.vehicles) {
      if (o === this || o.dead) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      const min = (s.L + o.spec.L) * 0.55;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.01 && Math.abs(o.pos.y - this.pos.y) < 2) {
        const nx = dx / d, nz = dz / d, pen = min - d;
        const push = o.spec.mass / (s.mass + o.spec.mass);
        this.pos.x -= nx * pen * push; this.pos.z -= nz * pen * push;
        o.pos.x += nx * pen * (1 - push); o.pos.z += nz * pen * (1 - push);
        const rv = (this.vel.x - o.vel.x) * nx + (this.vel.z - o.vel.z) * nz;
        if (rv > 0) {
          const j = rv * 0.8;
          this.vel.x -= nx * j * (1 - push); this.vel.z -= nz * j * (1 - push);
          o.vel.x += nx * j * push; o.vel.z += nz * j * push;
          if (rv > 7) { this.damage((rv - 7) * 0.8); o.damage((rv - 7) * 0.8); if (G.audio && Math.random() < 0.5) G.audio.impact(this.pos, 0.5); }
        }
      }
    }
  }
  effects(dt) {
    if (this.health < 55) { this.smokeT += dt; if (this.smokeT > 0.12) { this.smokeT = 0; if (G.fx) G.fx.smoke(this.pos.clone().setY(this.pos.y + this.spec.H), this.health < 30); } }
    if (this.health < 25 && this.health > 0) {
      this.fireT += dt;
      if (this.fireT > 0.08) { this.fireT = 0; if (G.fx) G.fx.fire(this.pos.clone().setY(this.pos.y + this.spec.H * 0.6)); }
      this.health -= dt * (this.spec.armored ? 2 : 6);
      if (this.health <= 0) this.explode();
    }
    if (this.nitroOn && G.fx && (G.frame & 1) === 0) {
      const tail = this.forward(_v3).multiplyScalar(-this.spec.L);
      const fp = this.pos.clone().add(tail); fp.y += 0.25;
      G.fx.fire(fp);
      G.fx.emit(fp, tail.multiplyScalar(0.4), '#7ecbff', 0.18, 0.22, 0.2, 1);
    }
    const headsOn = G.tod.state && G.tod.state.night > 0.35 && this.driver && this.spec.cls !== 'boat';
    const matL = this.mesh.userData.headL.material;
    matL.color.setScalar(headsOn ? 4 : 0.4);
    this.mesh.userData.headR.material.color.copy(matL.color);
    if (this.police && this.mesh.userData.lightR) {
      const f = this.siren ? (Math.sin(G.time * 14) > 0) : false;
      this.mesh.userData.lightR.color.set(f ? '#ff3048' : '#400810');
      this.mesh.userData.lightB.color.set(!f && this.siren ? '#3060ff' : '#081040');
    }
  }
}

function blast(pos, radius, dmg, ignore) {
  for (const v of G.vehicles) if (v !== ignore && !v.dead && v.pos.distanceTo(pos) < radius) v.damage(dmg * (1 - v.pos.distanceTo(pos) / radius), v.pos);
  const actors = G.npcs.concat(G.protagonists);
  for (const n of actors) if (n && n.alive && n.pos && n.pos.distanceTo && n.pos.distanceTo(pos) < radius && n.damage) n.damage(dmg * 0.55 * (1 - n.pos.distanceTo(pos) / radius));
}

function spawnVehicle(id, x, z, yaw, opts = {}) {
  const v = new Vehicle(id, x, z, yaw || 0);
  if (opts.color) v.mesh.traverse(o => { if (o.material && o.material.color && o.material.roughness !== undefined && o.material.metalness > 0.4) o.material.color.set(opts.color); });
  G.vehicles.push(v);
  return v;
}
function nearestVehicle(p, max = 4) {
  let b = null, bd = max * max;
  for (const v of G.vehicles) { if (v.dead) continue; const d = v.pos.distanceToSquared(p); if (d < bd) { bd = d; b = v; } }
  return b;
}
