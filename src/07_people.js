const SKIN = '#e0b090';
function part(parent, geo, mat, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.position.y = geo.parameters ? 0 : 0;
  g.add(m);
  parent.add(g);
  g.userData.mesh = m;
  return g;
}
function capsuleY(r, len, mat) {
  const g = gCapsule(r, len, 3, 6);
  g.translate(0, len / 2 + r, 0);
  return new THREE.Mesh(g, mat);
}

class Character {
  constructor(opts) {
    this.name = opts.name;
    this.pos = new THREE.Vector3(opts.x, 0, opts.z);
    this.yaw = opts.yaw || 0;
    this.vel = new THREE.Vector3();
    this.health = 100;
    this.armor = opts.armor || 0;
    this.stamina = 100;
    this.alive = true;
    this.weapon = 0;
    this.ammo = WEAPONS.map(w => ({ mag: w.mag || 0, res: w.reserve || 0 }));
    this.vehicle = null;
    this.aim = 0;
    this.phase = Math.random() * 6;
    this.grounded = true;
    this.swim = false;
    this.panic = 0;
    this.seat = null;
    this.team = opts.team || 'civ';
    this.female = !!opts.female;
    this.radius = 0.38;
    this.height = 1.75;
    this.group = new THREE.Group();
    this.skin = new THREE.MeshStandardMaterial({ color: opts.skin || SKIN, roughness: 0.7 });
    this.shirt = new THREE.MeshStandardMaterial({ color: opts.shirt || '#f4f4f4', roughness: 0.8 });
    this.pants = new THREE.MeshStandardMaterial({ color: opts.pants || '#2a3344', roughness: 0.85 });
    this.shoe = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 });
    this.hairM = new THREE.MeshStandardMaterial({ color: opts.hair || '#2a1a12', roughness: 0.8 });
    this.build();
    G.scene.add(this.group);
    this.group.userData.actor = this;
  }
  build() {
    const hips = this.hips = new THREE.Group();
    hips.position.y = 0.92;
    this.group.add(hips);
    const torso = this.torso = part(hips, gBox(0.42, 0.48, 0.24), this.shirt, 0, 0.28, 0);
    torso.userData.mesh.position.y = 0.24;
    const head = this.head = part(torso, gSphere(0.15, 10, 8), this.skin, 0, 0.62, 0);
    head.userData.mesh.position.y = 0.08;
    const hair = new THREE.Mesh(gSphere(this.female ? 0.17 : 0.155, 8, 6), this.hairM);
    hair.scale.set(1, this.female ? 1.15 : 0.7, 1.05);
    hair.position.y = this.female ? 0.12 : 0.16;
    head.add(hair);
    const arm = (side) => {
      const u = part(torso, gCapsule(0.07, 0.26, 2, 6), this.shirt, side * 0.28, 0.42, 0);
      u.userData.mesh.position.y = -0.2;
      const l = part(u, gCapsule(0.06, 0.24, 2, 6), this.skin, 0, -0.42, 0);
      l.userData.mesh.position.y = -0.18;
      return { u, l };
    };
    this.armL = arm(-1); this.armR = arm(1);
    const leg = (side) => {
      const u = part(hips, gCapsule(0.08, 0.32, 2, 6), this.pants, side * 0.11, -0.02, 0);
      u.userData.mesh.position.y = -0.22;
      const l = part(u, gCapsule(0.07, 0.32, 2, 6), this.pants, 0, -0.46, 0);
      l.userData.mesh.position.y = -0.22;
      const foot = new THREE.Mesh(gBox(0.1, 0.06, 0.22), this.shoe);
      foot.position.set(0, -0.42, 0.04);
      l.add(foot);
      return { u, l };
    };
    this.legL = leg(-1); this.legR = leg(1);
    this.gunMount = new THREE.Group();
    this.armR.l.add(this.gunMount);
    this.gunMount.position.set(0, -0.36, 0.08);
  }
  setWeaponVisual(id) {
    if (this.gunObj) { this.gunMount.remove(this.gunObj); this.gunObj = null; }
    if (id === 'fists') return;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: id === 'rpg' ? '#4a5a3a' : '#2a2c30', roughness: 0.4, metalness: 0.6 });
    const len = { pistol: 0.28, smg: 0.38, rifle: 0.72, sniper: 0.9, rpg: 0.85 }[id] || 0.4;
    const body = new THREE.Mesh(gBox(0.06, 0.08, len), metal);
    body.position.z = len * 0.35;
    g.add(body);
    if (id === 'rpg') { const t = new THREE.Mesh(gCyl(0.045, 0.045, len, 8), metal); t.rotation.x = Math.PI / 2; t.position.z = len * 0.2; g.add(t); }
    this.gunMount.add(g);
    this.gunObj = g;
  }
  place(x, y, z, yaw) { this.pos.set(x, y, z); if (yaw !== undefined) this.yaw = yaw; this.vel.set(0, 0, 0); this.sync(); }
  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.group.visible = !this.vehicle;
  }
  damage(amount, from) {
    if (!this.alive) return;
    let left = amount;
    if (this.armor > 0) { const a = Math.min(this.armor, left); this.armor -= a; left -= a; }
    this.health -= left;
    this.hitFlash = 0.25;
    if (this.health <= 0) this.die(from);
    else if (this.team === 'civ') { this.panic = 4; if (G.audio && Math.random() < 0.4) G.audio.scream(this.pos); }
  }
  die(from) {
    this.alive = false;
    this.health = 0;
    this.vel.y = 3;
    if (this.vehicle) exitVehicle(this, true);
    if (G.fx) G.fx.burst(this.pos.clone().setY(this.pos.y + 1), '#ff4455', 8, 3, 0.3, 0.12, -6);
  }
  animate(dt, moving, sprint) {
    this.phase += dt * (this.swim ? 6 : sprint ? 11 : moving ? 8 : 2);
    const a = this.swim ? 0.6 : moving ? (sprint ? 0.9 : 0.65) : 0;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const aim = this.aim;
    this.legL.u.rotation.x = s * a;
    this.legR.u.rotation.x = -s * a;
    this.legL.l.rotation.x = Math.max(0, -s) * a * 0.9;
    this.legR.l.rotation.x = Math.max(0, s) * a * 0.9;
    this.armL.u.rotation.x = (-s * a * 0.7) * (1 - aim) + aim * -1.1;
    this.armR.u.rotation.x = (s * a * 0.7) * (1 - aim) + aim * -1.35;
    this.armL.u.rotation.z = 0.12 + aim * 0.2;
    this.armR.u.rotation.z = -0.12 - aim * 0.15;
    this.armR.l.rotation.x = aim ? -0.3 : 0;
    this.torso.rotation.x = aim ? 0.25 : moving ? 0.08 : 0;
    this.hips.position.y = 0.92 + (moving ? Math.abs(c) * 0.05 : 0) + (this.vehicle ? -0.35 : 0);
    if (this.vehicle) {
      this.legL.u.rotation.x = -1.3; this.legR.u.rotation.x = -1.3;
      this.legL.l.rotation.x = 1.4; this.legR.l.rotation.x = 1.4;
      this.hips.position.y = 0.55;
    }
    this.head.rotation.x = aim ? -0.15 : 0;
    if (!this.alive) { this.torso.rotation.x = 1.2; this.hips.position.y = 0.35; }
  }
  updateBody(dt) {
    if (this.vehicle) { this.syncToSeat(); this.animate(dt, false, false); return; }
    if (!this.alive) { this.vel.y -= GRAVITY * dt; this.pos.y += this.vel.y * dt; const g = G.world.surfaceH(this.pos.x, this.pos.z, this.pos.y); if (this.pos.y < g) { this.pos.y = g; this.vel.y = 0; } this.sync(); return; }
    const info = {};
    G.world.groundInfo(this.pos.x, this.pos.z, this.pos.y + 0.2, 0.45, info);
    const water = G.ocean ? G.ocean.heightAt(this.pos.x, this.pos.z) : WATER_Y;
    this.swim = info.h < WATER_Y - 0.15 && this.pos.y < water + 0.2;
    if (this.swim) {
      this.vel.y = damp(this.vel.y, 0, 4, dt);
      this.pos.y = damp(this.pos.y, water - 0.15, 6, dt);
      this.stamina = Math.max(0, this.stamina - dt * 6);
      this.grounded = true;
    } else {
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= info.h) { if (this.vel.y < -8 && G.fx) G.fx.burst(this.pos, '#fff', 6, 2, 0.2, 0.08, -2); this.pos.y = info.h; this.vel.y = 0; this.grounded = true; }
      else this.grounded = false;
    }
    const out = {};
    G.world.collideCircle(this.pos.x, this.pos.z, this.radius, this.pos.y, this.pos.y + this.height, out, 0.4);
    this.pos.x = out.x; this.pos.z = out.z;
    if (out.hit && out.col && out.col.knockable && this.vel.length() > 4) G.world.knock(out.col);
    this.pos.x = clamp(this.pos.x, -1980, 1980);
    this.pos.z = clamp(this.pos.z, -1980, 1980);
    this.sync();
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.6;
    this.animate(dt, moving, this.sprinting);
    if (this.hitFlash) this.hitFlash -= dt;
  }
  syncToSeat() {
    const v = this.vehicle;
    if (!v) return;
    const seat = v.seatPos(this.seat || 0);
    this.pos.copy(seat);
    this.yaw = v.yaw;
    this.group.visible = !v.enclosed || this === G.player;
    this.group.position.copy(seat);
    this.group.rotation.y = v.yaw + (this.seat ? Math.PI : 0);
    this.animate(0.016, false, false);
  }
}

class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.25; this.dist = 6.2;
    this.look = new THREE.Vector3();
    this.fov = 68;
    this.shakeT = 0;
  }
  update(dt, input, subject) {
    if (input.locked && !G.phoneOpen) {
      this.yaw -= input.mdx * 0.0022;
      this.pitch -= input.mdy * 0.0018;
      this.pitch = clamp(this.pitch, -0.6, 1.15);
    }
    this.dist = clamp(this.dist + input.wheel * 0.6, 2.2, 12);
    const aim = subject.aim || 0;
    const dist = lerp(this.dist, 2.1, aim);
    const pivot = subject.vehicle ? subject.vehicle.pos.clone().add(new THREE.Vector3(0, subject.vehicle.spec.camH || 1.3, 0)) : subject.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    if (subject.vehicle && subject.vehicle.spec.cls === 'heli') pivot.y += 1.2;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let desired = pivot.clone().addScaledVector(back, dist);
    const dir = desired.clone().sub(pivot);
    const len = dir.length() || 1;
    const hit = G.world.raycast(pivot.x, pivot.y, pivot.z, dir.x / len, dir.y / len, dir.z / len, len - 0.2, {});
    if (hit && hit.kind !== 'water') desired.copy(pivot).addScaledVector(dir.normalize(), Math.max(0.7, hit.t - 0.35));
    this.cam.position.lerp(desired, 1 - Math.exp(-10 * dt));
    const lookAt = pivot.clone();
    if (aim > 0.2 && !subject.vehicle) lookAt.add(new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(8));
    this.look.lerp(lookAt, 1 - Math.exp(-12 * dt));
    if (G.fx && G.fx.shake > 0) {
      this.cam.position.x += (Math.random() - 0.5) * G.fx.shake * 0.8;
      this.cam.position.y += (Math.random() - 0.5) * G.fx.shake * 0.5;
    }
    this.cam.lookAt(this.look);
    const spd = subject.vehicle ? subject.vehicle.speed : 0;
    const fov = 68 + clamp(spd / 80, 0, 1) * 16 + (subject.vehicle && subject.vehicle.nitroOn ? 6 : 0) - aim * 28 * (WEAPONS[subject.weapon] && WEAPONS[subject.weapon].scope && input.rmb ? 0 : 1);
    const scope = aim > 0.6 && WEAPONS[subject.weapon] && WEAPONS[subject.weapon].scope && input.rmb;
    this.cam.fov = damp(this.cam.fov, scope ? 12 : fov, 6, dt);
    this.cam.updateProjectionMatrix();
    this.aimYaw = this.yaw;
  }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  lookDir(out) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, -sp, -Math.cos(this.yaw) * cp).normalize();
  }
}

class PlayerControl {
  constructor() { this.helpT = 8; }
  update(dt, input, p) {
    if (!p.alive) return;
    if (p.vehicle) { this.drive(dt, input, p.vehicle); return; }
    const cam = G.cam;
    const fwd = cam.forward(_v1), right = _v2.set(fwd.z, 0, -fwd.x);
    let x = input.axis('KeyA', 'KeyD'), z = input.axis('KeyS', 'KeyW');
    const mag = Math.hypot(x, z) || 1;
    x /= mag; z /= mag;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    p.sprinting = sprint && p.stamina > 0 && (x || z);
    const speed = p.swim ? 4.2 : p.sprinting ? 8.4 : 4.6;
    if (p.sprinting) p.stamina = Math.max(0, p.stamina - dt * 12);
    else p.stamina = Math.min(100, p.stamina + dt * 8);
    const wish = _v3.set(0, 0, 0).addScaledVector(right, x).addScaledVector(fwd, z);
    if (x || z) {
      p.vel.x = damp(p.vel.x, wish.x * speed, 10, dt);
      p.vel.z = damp(p.vel.z, wish.z * speed, 10, dt);
      const face = Math.atan2(wish.x, wish.z);
      p.yaw = dampAngle(p.yaw, p.aim > 0.4 ? cam.yaw + Math.PI : face, 12, dt);
      if ((G.frame & 7) === 0 && p.grounded && !p.swim && G.audio) G.audio.foot();
    } else { p.vel.x = damp(p.vel.x, 0, 8, dt); p.vel.z = damp(p.vel.z, 0, 8, dt); }
    if ((input.hit('Space')) && p.grounded && !p.swim) { p.vel.y = 7.2; p.grounded = false; if (G.audio) G.audio.punch(); }
    p.aim = damp(p.aim, input.rmb ? 1 : 0, 10, dt);
    if (input.rmb) p.yaw = dampAngle(p.yaw, cam.yaw + Math.PI, 14, dt);
    if (G.debugMove) {
      p.vel.x = G.debugMove.x || 0; p.vel.z = G.debugMove.z || 0;
      if (G.debugMove.yaw !== undefined) p.yaw = G.debugMove.yaw;
    }
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    if (input.hit('KeyF') || input.hit('KeyE')) tryEnter(p);
  }
  drive(dt, input, v) {
    v.input.throttle = input.down('KeyW') ? 1 : 0;
    v.input.brake = input.down('KeyS') ? 1 : 0;
    v.input.steer = input.axis('KeyA', 'KeyD');
    if (v.spec.cls === 'heli') {
      v.input.pitch = (input.down('ArrowUp') ? -1 : 0) + (input.down('ArrowDown') ? 1 : 0);
      v.input.roll = (input.down('ArrowLeft') ? 1 : 0) + (input.down('ArrowRight') ? -1 : 0);
      if (input.locked) { v.input.pitch += clamp(-input.mdy * 0.02, -1, 1); v.input.roll += clamp(-input.mdx * 0.02, -1, 1); }
    }
    v.input.handbrake = input.down('Space') ? 1 : 0;
    v.input.nitro = (input.down('ShiftLeft') || input.down('ShiftRight')) && v.nitro > 0;
    if (input.hit('KeyF') || input.hit('KeyE')) exitVehicle(v.driver);
    if (input.hit('KeyH') && G.audio) G.audio.horn(v.pos);
    if (input.hit('KeyL') && v.police) v.siren = !v.siren;
    if (input.hit('KeyR')) {
      G.radio = (G.radio + 1) % (G.audio.stations.length + 1);
      const on = G.radio < G.audio.stations.length;
      G.audio.setRadio(on, on ? G.radio : 0);
      if (G.hud) G.hud.radioBanner();
    }
    if (G.debugDrive) {
      const d = G.debugDrive;
      if (d.throttle !== undefined) v.input.throttle = d.throttle;
      if (d.brake !== undefined) v.input.brake = d.brake;
      if (d.steer !== undefined) v.input.steer = d.steer;
      if (d.pitch !== undefined) v.input.pitch = d.pitch;
      if (d.roll !== undefined) v.input.roll = d.roll;
      if (d.handbrake !== undefined) v.input.handbrake = d.handbrake;
      if (d.nitro !== undefined) v.input.nitro = d.nitro;
    }
  }
}

function tryEnter(p) {
  let best = null, bd = 42;
  for (const v of G.vehicles) {
    if (v.dead) continue;
    const d = v.pos.distanceToSquared(p.pos);
    if (d < bd && Math.abs(v.pos.y - p.pos.y) < 3) { bd = d; best = v; }
  }
  if (!best) return;
  if (best.driver && best.driver !== p) {
    const npc = best.driver;
    exitVehicle(npc, true);
    npc.panic = 5;
    if (G.wanted) G.wanted.add(1, 'carjack');
    if (G.audio) G.audio.scream(best.pos);
  }
  enterVehicle(p, best);
}
function enterVehicle(p, v) {
  p.vehicle = v;
  p.seat = 0;
  v.driver = p;
  v._wasParked = v.parked;
  v.parked = false;
  v.engineOn = true;
  if (!v.voice && G.audio && G.audio.ready && v.spec.cls !== 'boat') v.voice = G.audio.attachEngine(v.spec.engine || { idle: 40, max: 140, vol: 0.35, drive: 4 });
  if (G.hud) G.hud.help('Press <b>F</b> to exit' + (v.spec.nitro ? ' · <b>Shift</b> nitro' : '') + (v.spec.cls === 'heli' ? ' · <b>W/S</b> collective, mouse cyclic' : ' · <b>Space</b> handbrake'));
}
function exitVehicle(p, ejected) {
  if (!p || !p.vehicle) return;
  const v = p.vehicle;
  const side = _v1.set(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(ejected ? rand(-2, 2) : 2.2);
  if (p.pos && p.pos.copy) {
    p.pos.copy(v.pos).add(side);
    p.pos.y = G.world.surfaceH(p.pos.x, p.pos.z, v.pos.y + 2);
  }
  p.vehicle = null; p.seat = null;
  if (v.driver === p) {
    v.driver = null;
    if (v.ai && v.ai.role === 'traffic') v.ai.paused = false;
    else if (v._wasParked && !v.ai) v.parked = true;
  }
  if (p.group) p.group.visible = true;
  if (p === G.player && G.hud) { G.hud.helpT = 0; const help = document.getElementById('help'); if (help) help.classList.remove('on'); }
  if (ejected && p.vel) p.vel.y = 4;
  if (p.isDummy) p.alive = false;
}

class Switcher {
  constructor() { this.t = 0; this.active = false; }
  start() {
    if (this.active || !G.player.alive) return;
    const other = G.protagonists.find(p => p !== G.player);
    if (!other || !other.alive || other.vehicle) { if (!other.alive && G.hud) G.hud.note(other.name + ' is down.'); return; }
    this.active = true; this.t = 0; this.from = G.player.pos.clone(); this.to = other.pos.clone(); this.other = other;
    this.y0 = G.camera.position.y;
    G.switching = true;
    if (G.audio) G.audio.whoosh(true);
    const el = document.getElementById('switch-overlay'); el.classList.add('on'); el.querySelector('.who').textContent = other.name.toUpperCase();
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt / 2.6;
    const k = clamp(this.t, 0, 1);
    const up = k < 0.35 ? easeInOut(k / 0.35) : k > 0.65 ? 1 - easeInOut((k - 0.65) / 0.35) : 1;
    const pan = smoothstep(0.3, 0.7, k);
    const x = lerp(this.from.x, this.to.x, pan), z = lerp(this.from.z, this.to.z, pan);
    const y = lerp(this.y0, 380, up) + Math.sin(pan * Math.PI) * 40;
    G.camera.position.set(x + 30, y, z + 30);
    G.camera.lookAt(x, 20 + (1 - up) * 10, z);
    G.clouds.target = up;
    if (k >= 1) {
      this.active = false; G.switching = false;
      G.player = this.other;
      G.cam.yaw = this.other.yaw + Math.PI;
      document.getElementById('switch-overlay').classList.remove('on');
      if (G.hud) G.hud.note('Now playing as <b>' + G.player.name + '</b>');
      if (G.audio) G.audio.whoosh(false);
    }
  }
}

function makeProtagonists() {
  const jason = new Character({ name: 'Jason', x: -180, z: -220, shirt: '#f2f2f0', pants: '#243044', hair: '#3a2418', armor: 50 });
  const lucia = new Character({ name: 'Lucia', x: 1280, z: 40, shirt: '#ff4f8a', pants: '#f4f4f4', hair: '#1a120e', female: true, armor: 25 });
  jason.place(-180, 0, -220, 0);
  lucia.place(1280, 0, 40, Math.PI);
  G.protagonists = [jason, lucia];
  G.player = jason;
  G.npcs = [];
}
