class Marker {
  constructor() {
    this.group = new THREE.Group();
    const cone = new THREE.Mesh(gCone(0.85, 1.7, 5), new THREE.MeshBasicMaterial({ color: '#ffe14a' }));
    cone.rotation.x = Math.PI;
    this.cone = cone;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 0.16, 8, 28), new THREE.MeshBasicMaterial({ color: '#ffe14a' }));
    ring.rotation.x = Math.PI / 2;
    this.ring = ring;
    this.group.add(cone, ring);
    this.group.visible = false;
    G.scene.add(this.group);
  }
  set(x, z) {
    const y = G.world.surfaceH(x, z, 40);
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.cone.position.y = 4.2 + Math.sin(G.time * 3) * 0.4;
    this.ring.rotation.z = G.time * 0.8;
  }
  hide() { this.group.visible = false; }
}

const RACE_POINTS = [[1180, -1100], [1180, -400], [1180, 200], [460, 200], [0, 200], [0, 800], [-400, 800], [-400, 1200], [200, 1200]];

class Missions {
  constructor() {
    this.active = null;
    this.done = {};
    this.list = [
      { id: 'race', name: 'Midnight Vice', sub: 'Street race down the strip', reward: 5000, blurb: 'Hit every checkpoint before the clock dies.' },
      { id: 'heist', name: 'High-Value Heist', sub: 'Starfish Island', reward: 25000, blurb: 'Steal the guarded VIP hypercar and survive a 4-star lockdown.' },
      { id: 'cartel', name: 'Port Cartel Takedown', sub: 'Port of Leonida', reward: 12000, blurb: 'Wipe the dock crew and their iron.' }
    ];
  }
  snap(x, z) {
    const ne = G.world.nearestEdge(x, z, 80, e => !e.deck);
    return ne ? { x: ne.x, z: ne.z } : { x, z };
  }
  start(id) {
    if (this.active) { if (G.phone) G.phone.toast('A contract is already live'); return; }
    if (id === 'race') this.startRace();
    else if (id === 'heist') this.startHeist();
    else if (id === 'cartel') this.startCartel();
  }
  startRace() {
    clearMissionNpcs();
    const cps = RACE_POINTS.map(p => this.snap(p[0], p[1]));
    this.active = { id: 'race', name: 'Midnight Vice', cps, index: 0, time: 150, reward: 5000 };
    G.navTarget = cps[0];
    G.objective = 'Reach the <em>start line</em> on the Vice strip';
    if (G.hud) { G.hud.title('MIDNIGHT VICE', 'Street race'); G.hud.big('GO', '150 seconds'); }
    if (G.audio) G.audio.ui('go');
    if (G.phone) G.phone.close();
  }
  startHeist() {
    clearMissionNpcs();
    const spot = findLand(760, -640);
    const vip = spawnVehicle('vip', spot.x, spot.z, Math.random() * TAU);
    vip.parked = true;
    vip.mission = 'heist';
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU;
      spawnFighter(spot.x + Math.cos(a) * 7, spot.z + Math.sin(a) * 7, { mission: 'heist', weapon: i % 2 ? 2 : 1, shirt: '#1c1c1c', name: 'Security', aggro: 38 });
    }
    this.active = { id: 'heist', name: 'High-Value Heist', phase: 'steal', vip, drop: this.snap(-200, -500), reward: 25000 };
    G.navTarget = { x: spot.x, z: spot.z };
    G.objective = 'Steal the <em>VIP Cheetah</em> on Starfish Island';
    if (G.hud) G.hud.title('HIGH-VALUE HEIST', 'Starfish Island');
    if (G.audio) G.audio.ui('go');
    if (G.phone) G.phone.close();
  }
  startCartel() {
    clearMissionNpcs();
    const base = findLand(G.world.cartel ? G.world.cartel.x : -500, G.world.cartel ? G.world.cartel.z : 1200);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      spawnFighter(base.x + Math.cos(a) * (6 + (i % 3)), base.z + Math.sin(a) * (6 + (i % 3)), { mission: 'cartel', weapon: i % 3 === 0 ? 3 : 2, shirt: '#6b2d3c', name: 'Cartel', aggro: 50 });
    }
    const v1 = spawnVehicle('sentinel', base.x + 8, base.z + 4, 0.6, { color: '#111' });
    const v2 = spawnVehicle('phoenix', base.x - 6, base.z + 8, 1.2, { color: '#3a0a0a' });
    v1.parked = v2.parked = true;
    v1.mission = v2.mission = 'cartel';
    v1.health = v2.health = 70;
    this.active = { id: 'cartel', name: 'Port Cartel Takedown', base, cars: [v1, v2], reward: 12000 };
    G.navTarget = { x: base.x, z: base.z };
    G.objective = 'Eliminate the <strong>cartel</strong> at the port';
    if (G.hud) G.hud.title('CARTEL TAKEDOWN', 'Port of Leonida');
    if (G.audio) G.audio.ui('go');
    if (G.phone) G.phone.close();
  }
  complete(bonus) {
    const m = this.active;
    if (!m) return;
    const pay = m.reward + (bonus || 0);
    this.done[m.id] = (this.done[m.id] || 0) + 1;
    this.active = null;
    G.navTarget = null;
    G.gps = null;
    G.objective = '';
    giveCash(pay);
    if (G.hud) { G.hud.big('PASSED', m.name); G.hud.title(m.name.toUpperCase(), 'Contract complete'); G.hud.note('Paid <b>' + fmtMoney(pay) + '</b>.'); }
    if (G.audio) G.audio.ui('checkpoint');
    if (G.marker) G.marker.hide();
  }
  fail(reason) {
    const m = this.active;
    if (!m) return;
    this.active = null;
    G.navTarget = null;
    G.gps = null;
    G.objective = '';
    if (m.vip && !m.vip.dead) { m.vip.mission = null; }
    if (G.hud) { G.hud.big('FAILED', reason || m.name); G.hud.note(reason || 'Contract failed.'); }
    if (G.audio) G.audio.ui('fail');
    if (G.marker) G.marker.hide();
  }
  update(dt) {
    const m = this.active;
    if (!m || !G.player) return;
    const p = G.player;
    if (m.id === 'race') {
      m.time -= dt;
      const cp = m.cps[m.index];
      G.navTarget = cp;
      G.objective = 'Checkpoint <em>' + (m.index + 1) + '/' + m.cps.length + '</em> · <u>' + Math.max(0, m.time).toFixed(0) + 's</u>';
      if (m.time <= 0) { this.fail('Time ran out'); return; }
      if (dist2D(p.pos.x, p.pos.z, cp.x, cp.z) < 16) {
        m.index++;
        if (G.audio) G.audio.ui('checkpoint');
        if (m.index >= m.cps.length) this.complete(Math.floor(m.time) * 20);
        else if (G.hud) G.hud.note('Checkpoint <b>' + m.index + '</b>');
      }
    } else if (m.id === 'heist') {
      if (!m.vip || m.vip.dead) { this.fail('The hypercar is gone'); return; }
      if (m.phase === 'steal') {
        G.navTarget = { x: m.vip.pos.x, z: m.vip.pos.z };
        G.objective = 'Steal the <em>VIP Cheetah</em>';
        if (p.vehicle === m.vip) {
          m.phase = 'escape';
          G.wanted.setStars(4);
          if (G.hud) { G.hud.big('LOCKDOWN', '4 stars'); G.hud.note('Get the car to the drop.'); }
          if (G.audio) G.audio.ui('star');
        }
      } else {
        G.navTarget = m.drop;
        const inCar = p.vehicle === m.vip;
        G.objective = inCar ? 'Deliver the car to the <em>drop</em>' : 'Get back in the <strong>VIP Cheetah</strong>';
        if (inCar && dist2D(p.pos.x, p.pos.z, m.drop.x, m.drop.z) < 16) {
          G.wanted.clear();
          this.complete(0);
        }
      }
    } else if (m.id === 'cartel') {
      G.navTarget = m.base;
      const crew = G.npcs.filter(n => n.ai && n.ai.mission === 'cartel' && n.alive);
      const cars = (m.cars || []).filter(v => v && !v.dead);
      G.objective = 'Cartel gunmen left <strong>' + crew.length + '</strong>';
      if (!crew.length) this.complete(cars.length ? 0 : 2500);
    }
  }
}

function giveCash(n) {
  G.cash += n;
  if (G.hud) G.hud.cashDelta(n);
  if (G.audio && n > 0) G.audio.ui('money');
}
function trySpend(n) {
  if (G.cash < n) {
    if (G.phone) G.phone.toast('Not enough cash');
    if (G.audio) G.audio.ui('fail');
    return false;
  }
  G.cash -= n;
  if (G.hud) G.hud.cashDelta(-n);
  return true;
}
function updateNav(dt) {
  G._navT = (G._navT || 0) - dt;
  if (!G.navTarget || !G.player) { G.gps = null; if (G.marker) G.marker.hide(); return; }
  if (G.marker) G.marker.set(G.navTarget.x, G.navTarget.z);
  if (G._navT <= 0) {
    G._navT = 1.4;
    G.gps = G.world.gpsRoute(G.player.pos.x, G.player.pos.z, G.navTarget.x, G.navTarget.z);
  }
}
function updateDelivery() {
  if (!G.delivery || !G.player) return;
  if (G.delivery.dead) { G.delivery = null; if (!G.missions || !G.missions.active) { G.navTarget = null; G.objective = ''; } return; }
  if (G.missions && G.missions.active) return;
  G.navTarget = { x: G.delivery.pos.x, z: G.delivery.pos.z };
  G.objective = 'Your delivery is marked on the <em>GPS</em>';
  if (G.player.vehicle === G.delivery || G.player.pos.distanceTo(G.delivery) < 5) {
    G.delivery = null;
    G.navTarget = null;
    G.objective = '';
    if (G.hud) G.hud.note('Vehicle picked up.');
  }
}
