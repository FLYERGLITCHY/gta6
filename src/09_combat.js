const WEAPONS = [
  { id: 'fists', name: 'Fists', melee: true, dmg: 22, range: 2.1, rate: 2.4, spread: 0, mag: 0, reserve: 0, recoil: 0, scope: false, driveby: false, rocket: false, auto: false },
  { id: 'pistol', name: 'Pistol', melee: false, dmg: 24, range: 80, rate: 4.5, spread: 0.018, mag: 12, reserve: 90, recoil: 0.02, scope: false, driveby: true, rocket: false, auto: false },
  { id: 'smg', name: 'Micro SMG', melee: false, dmg: 13, range: 55, rate: 13, spread: 0.045, mag: 32, reserve: 220, recoil: 0.012, scope: false, driveby: true, rocket: false, auto: true },
  { id: 'rifle', name: 'Assault Rifle', melee: false, dmg: 28, range: 130, rate: 9, spread: 0.02, mag: 30, reserve: 180, recoil: 0.016, scope: false, driveby: false, rocket: false, auto: true },
  { id: 'sniper', name: 'Sniper', melee: false, dmg: 100, range: 320, rate: 0.85, spread: 0.002, mag: 6, reserve: 36, recoil: 0.045, scope: true, driveby: false, rocket: false, auto: false },
  { id: 'rpg', name: 'RPG', melee: false, dmg: 160, range: 220, rate: 0.45, spread: 0.01, mag: 1, reserve: 8, recoil: 0.05, scope: false, driveby: false, rocket: true, auto: false }
];

class Rocket {
  constructor(pos, dir, owner) {
    this.pos = pos.clone();
    this.prev = pos.clone();
    this.vel = dir.clone().normalize().multiplyScalar(76);
    this.owner = owner;
    this.life = 4.5;
    this.mesh = new THREE.Mesh(gBox(0.14, 0.14, 0.75), new THREE.MeshStandardMaterial({ color: '#5d6a48', roughness: 0.5, metalness: 0.4 }));
    const flame = new THREE.Mesh(gBox(0.08, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: '#ffb15a' }));
    flame.position.z = -0.45;
    this.mesh.add(flame);
    G.scene.add(this.mesh);
    this.alive = true;
  }
  update(dt) {
    if (!this.alive) return false;
    this.prev.copy(this.pos);
    this.vel.y -= 5.5 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.life -= dt;
    if (G.fx) G.fx.emit(this.pos, _v1.copy(this.vel).multiplyScalar(-0.04), Math.random() < 0.5 ? '#ffd27a' : '#ff7a2a', 0.22, 0.28, 0.4, 1);
    if (this.life <= 0 || this.hitSomething()) { this.boom(); return false; }
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(this.pos.x - this.vel.x, this.pos.y - this.vel.y, this.pos.z - this.vel.z);
    return true;
  }
  hitSomething() {
    const dx = this.pos.x - this.prev.x, dy = this.pos.y - this.prev.y, dz = this.pos.z - this.prev.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return false;
    const hit = G.world.raycast(this.prev.x, this.prev.y, this.prev.z, dx / len, dy / len, dz / len, len + 0.2, { water: true });
    let best = hit ? hit.t : 1e9;
    const consider = (obj, rad, yoff) => {
      if (!obj || obj === this.owner || obj.dead || obj.alive === false) return;
      const px = obj.pos.x, py = obj.pos.y + yoff, pz = obj.pos.z;
      const t = clamp(((px - this.prev.x) * dx + (py - this.prev.y) * dy + (pz - this.prev.z) * dz) / (len * len), 0, 1);
      const qx = this.prev.x + dx * t, qy = this.prev.y + dy * t, qz = this.prev.z + dz * t;
      if (t * len < best && Math.hypot(qx - px, qy - py, qz - pz) < rad) best = t * len;
    };
    const ownCar = this.owner && this.owner.vehicle;
    for (const v of G.vehicles) if (v !== ownCar) consider(v, Math.max(1.2, v.spec.L * 0.65), v.spec.H * 0.4);
    for (const n of G.npcs) consider(n, 0.7, 0.9);
    for (const n of G.protagonists) consider(n, 0.7, 0.9);
    if (best < 1e8) {
      this.pos.set(this.prev.x + dx / len * best, this.prev.y + dy / len * best, this.prev.z + dz / len * best);
      return true;
    }
    return false;
  }
  boom() {
    if (!this.alive) return;
    this.alive = false;
    G.scene.remove(this.mesh);
    if (G.fx) G.fx.explosion(this.pos, 1.2);
    blast(this.pos, 9.5, 150, null);
    if (G.player && this.owner === G.player && G.wanted) G.wanted.blip('boom', 2);
    if (this.pos.y < WATER_Y + 0.6 && G.audio) G.audio.splash(this.pos);
  }
}

class Combat {
  constructor() {
    this.cool = 0;
    this.reloadT = 0;
    this.reloading = false;
    this.wheeling = false;
    this.ang = 0;
    this.hover = 0;
    this.aimedEnemy = false;
    G.projectiles = [];
  }
  equip(index) {
    const p = G.player;
    if (!p) return;
    p.weapon = clamp(index, 0, WEAPONS.length - 1);
    p.setWeaponVisual(WEAPONS[p.weapon].id);
    this.reloading = false;
    this.reloadT = 0;
    if (G.hud) G.hud.weaponChanged();
  }
  reload() {
    const p = G.player;
    if (!p || p.vehicle) return;
    const w = WEAPONS[p.weapon];
    if (!w.mag) return;
    const a = p.ammo[p.weapon];
    if (a.mag >= w.mag || a.res <= 0 || this.reloading) return;
    this.reloading = true;
    this.reloadT = w.id === 'rpg' ? 1.6 : 1.15;
    if (G.audio) G.audio.reload();
  }
  finishReload() {
    const p = G.player;
    const w = WEAPONS[p.weapon];
    const a = p.ammo[p.weapon];
    const need = w.mag - a.mag;
    const take = Math.min(need, a.res);
    a.mag += take;
    a.res -= take;
    this.reloading = false;
    if (G.hud) G.hud.weaponChanged();
  }
  originAndDir(p, spread) {
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3();
    if (p.vehicle) {
      origin.copy(p.vehicle.pos);
      origin.y += 1.35;
      if (G.cam) G.cam.lookDir(dir);
      else p.vehicle.forward(dir);
    } else if (G.cam) {
      origin.copy(p.pos);
      origin.y += 1.45;
      G.cam.lookDir(dir);
      origin.addScaledVector(dir, 0.45);
    } else {
      origin.set(p.pos.x, p.pos.y + 1.45, p.pos.z);
      dir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    }
    if (spread > 0) {
      dir.x += rand(-spread, spread);
      dir.y += rand(-spread, spread) * 0.6;
      dir.z += rand(-spread, spread);
      dir.normalize();
    }
    return { origin, dir };
  }
  attack(p) {
    const w = WEAPONS[p.weapon];
    if (this.cool > 0 || this.reloading) return;
    if (p.vehicle && !w.driveby && !w.melee) return;
    if (w.melee) { this.melee(p); this.cool = 1 / w.rate; return; }
    const a = p.ammo[p.weapon];
    if (w.mag && a.mag <= 0) {
      if (a.res > 0) this.reload();
      else if (G.audio) G.audio.empty();
      this.cool = 0.25;
      return;
    }
    const spread = w.spread * (p.aim > 0.5 ? 0.35 : 1) * (w.scope && G.input.rmb ? 0.15 : 1) * (p.vehicle ? 1.6 : 1);
    const aim = this.originAndDir(p, spread);
    if (w.mag) a.mag--;
    this.cool = 1 / w.rate;
    if (G.cam) G.cam.pitch += w.recoil * (0.6 + Math.random() * 0.5);
    if (w.rocket) {
      G.projectiles.push(new Rocket(aim.origin, aim.dir, p));
      if (G.audio) G.audio.gun('rpg', aim.origin);
      if (G.fx) G.fx.muzzle(aim.origin, aim.dir);
      if (G.lights) G.lights.flashMuzzle(aim.origin);
      if (G.wanted) G.wanted.blip('shot', 8);
      G.shotAt = { x: p.pos.x, z: p.pos.z, t: G.time };
      return;
    }
    this.shot(p, aim.origin, aim.dir, w, false, 1);
    if (G.wanted && w.id !== 'fists') G.wanted.blip('shot', 8);
    G.shotAt = { x: aim.origin.x, z: aim.origin.z, t: G.time };
  }
  shot(attacker, origin, dir, weapon, hostile, scale) {
    const d = dir.clone().normalize();
    const range = weapon.range;
    const worldHit = G.world.raycast(origin.x, origin.y, origin.z, d.x, d.y, d.z, range, {});
    let best = worldHit ? worldHit.t : range;
    let victim = null;
    const ownCar = attacker && attacker.vehicle;
    const consider = (obj, rad, yoff) => {
      if (!obj || obj === attacker || obj.dead || obj.alive === false) return;
      if (ownCar && obj === ownCar) return;
      const px = obj.pos.x, py = obj.pos.y + yoff, pz = obj.pos.z;
      const t = (px - origin.x) * d.x + (py - origin.y) * d.y + (pz - origin.z) * d.z;
      if (t < 0 || t > best) return;
      const qx = origin.x + d.x * t, qy = origin.y + d.y * t, qz = origin.z + d.z * t;
      if (Math.hypot(qx - px, qy - py, qz - pz) <= rad) { best = t; victim = obj; }
    };
    for (const v of G.vehicles) consider(v, Math.max(1.05, v.spec.W + 0.4), v.spec.H * 0.45);
    for (const n of G.npcs) consider(n, 0.55, 0.95);
    for (const n of G.protagonists) if (!hostile || n === G.player) consider(n, 0.5, 0.95);
    const hitPos = origin.clone().addScaledVector(d, Math.min(best, range));
    if (G.fx) {
      G.fx.muzzle(origin, d);
      if (!victim) G.fx.sparks(hitPos, d.clone().multiplyScalar(-1), 5);
    }
    if (G.lights) G.lights.flashMuzzle(origin);
    if (G.audio) G.audio.gun(weapon.id, origin);
    if (victim && victim.damage) {
      const amt = weapon.dmg * (scale || 1) * (victim.spec ? 0.85 : 1);
      const before = victim.health;
      victim.damage(amt, hitPos);
      const killed = victim.alive === false || victim.dead || (before > 0 && victim.health <= 0);
      if (!hostile && G.hud) G.hud.hit(!!killed);
      if (!hostile && G.wanted) {
        if (victim.police || victim.team === 'cop' || victim.team === 'hostile') G.wanted.blip('cop', 3);
        else if (victim.team === 'civ' || victim.ai) G.wanted.blip('civ', 2);
      }
      if (G.audio && !victim.spec) G.audio.hit(hitPos);
    }
    G.shotAt = { x: origin.x, z: origin.z, t: G.time };
  }
  melee(p) {
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let any = false, killed = false;
    const strike = (obj, rad) => {
      const dx = obj.pos.x - p.pos.x, dz = obj.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > rad || dx * fx + dz * fz < 0.15) return;
      const before = obj.health;
      obj.damage(WEAPONS[0].dmg, p.pos);
      any = true;
      if (obj.alive === false || obj.health <= 0 || obj.dead) killed = true;
      if (obj.team === 'civ' && G.wanted) G.wanted.blip('civ', 3);
    };
    for (const n of G.npcs) if (n.alive) strike(n, 1.7);
    for (const o of G.protagonists) if (o !== p && o.alive) strike(o, 1.7);
    for (const v of G.vehicles) if (!v.dead) strike(v, 2.5);
    if (G.audio) G.audio.punch();
    if (G.hud && any) G.hud.hit(killed);
    p.armR.u.rotation.x = -1.4;
  }
  aimProbe() {
    const p = G.player;
    this.aimedEnemy = false;
    if (!p || !G.cam || p.weapon === 0) return;
    const aim = this.originAndDir(p, 0);
    const d = aim.dir;
    let best = 80;
    const consider = (obj, rad, yoff) => {
      if (!obj || obj.dead || obj.alive === false) return;
      const px = obj.pos.x, py = obj.pos.y + yoff, pz = obj.pos.z;
      const t = (px - aim.origin.x) * d.x + (py - aim.origin.y) * d.y + (pz - aim.origin.z) * d.z;
      if (t < 1 || t > best) return;
      const qx = aim.origin.x + d.x * t, qy = aim.origin.y + d.y * t, qz = aim.origin.z + d.z * t;
      if (Math.hypot(qx - px, qy - py, qz - pz) < rad) best = t;
    };
    for (const n of G.npcs) if (n.team !== 'civ' || (G.wanted && G.wanted.stars > 0)) consider(n, 0.7, 0.9);
    for (const v of G.vehicles) if (v.police || (v.ai && v.ai.hostile)) consider(v, 1.4, 0.6);
    this.aimedEnemy = best < 80;
  }
  update(dt, input) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0 && G.player) this.finishReload();
    }
    for (let i = G.projectiles.length - 1; i >= 0; i--) if (!G.projectiles[i].update(dt)) G.projectiles.splice(i, 1);
    const p = G.player;
    if (!p || !p.alive || G.phoneOpen || G.paused || G.switching || G.wasted) {
      if (G.hud) G.hud.wheel(false);
      return;
    }
    for (let i = 0; i < WEAPONS.length; i++) if (input.hit('Digit' + (i + 1))) this.equip(i);
    if (input.down('KeyQ')) {
      this.wheeling = true;
      this.ang += input.mdx * 0.01 + input.wheel * 0.35;
      this.hover = ((Math.round(this.ang / (Math.PI / 3)) % 6) + 6) % 6;
      if (G.hud) G.hud.wheel(true, this.hover);
    } else if (this.wheeling) {
      this.wheeling = false;
      this.equip(this.hover);
      if (G.hud) G.hud.wheel(false);
    }
    if (!p.vehicle && input.hit('KeyR')) this.reload();
    const w = WEAPONS[p.weapon];
    const want = this.wheeling ? false : w.auto ? input.lmb : input.lmbHit;
    if (want) this.attack(p);
    if ((G.frame & 2) === 0) this.aimProbe();
  }
}
