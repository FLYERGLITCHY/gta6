function showError(e) {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent = (e && e.stack) || String(e);
  window.__err = el.textContent;
  G.crashed = true;
}
window.addEventListener('error', e => showError(e.error || e.message));
window.addEventListener('unhandledrejection', e => showError(e.reason));

function applyAtmosphere(S) {
  const w = G.weather, u = G.sky.uniforms, scene = G.scene;
  u.uTop.value.copy(S.top); u.uMid.value.copy(S.mid); u.uHorizon.value.copy(S.hor);
  u.uSunDir.value.copy(S.sunDir); u.uMoonDir.value.copy(S.moonDir); u.uSunColor.value.copy(S.sun);
  u.uCloudColor.value.copy(S.cloud); u.uNight.value = S.night; u.uRain.value = w.rain; u.uFog.value = w.fog; u.uFlash.value = w.flash;
  u.uCloud.value = 0.28 + w.rain * 0.45 + w.fog * 0.25;
  scene.fog.color.copy(S.fog); u.uFogColor.value.copy(S.fog);
  scene.fog.near = lerp(420, 36, Math.max(w.rain, w.fog));
  scene.fog.far = lerp(2400, w.fog ? 260 : 820, Math.max(w.rain * 0.65, w.fog));
  const o = G.ocean.uniforms;
  o.uSunDir.value.copy(S.sunDir); o.uSunColor.value.copy(S.sun); o.uSkyTop.value.copy(S.top); o.uSkyHor.value.copy(S.hor);
  o.uFogColor.value.copy(S.fog); o.uFogNear.value = scene.fog.near; o.uFogFar.value = scene.fog.far;
  o.uLight.value = 0.15 + S.daylight * 0.9; o.uNight.value = S.night; o.uRain.value = w.rain; o.uMoonDir.value.copy(S.moonDir);
  G.post.grade.exposure.value = S.exp; G.post.grade.saturation.value = S.sat; G.post.grade.tint.value.copy(S.tint);
  G.post.grade.vignette.value = 0.42 + w.fog * 0.15;
}
function streetLights() {
  const night = (G.tod.state && G.tod.state.night) || 0;
  const lights = G.lights.street;
  if (night < 0.22 || !G.world.lamps) { for (const l of lights) l.intensity = 0; return; }
  const cam = G.camera.position, best = [];
  for (const lamp of G.world.lamps) {
    const d = (lamp.x - cam.x) ** 2 + (lamp.z - cam.z) ** 2;
    if (d > 140 * 140) continue;
    best.push({ d, lamp });
  }
  best.sort((a, b) => a.d - b.d);
  for (let i = 0; i < lights.length; i++) {
    if (!best[i]) { lights[i].intensity = 0; continue; }
    lights[i].position.set(best[i].lamp.x, best[i].lamp.y, best[i].lamp.z);
    lights[i].intensity = 2.6 * night;
  }
}
function vehicleLights() {
  const v = G.player && G.player.vehicle;
  const night = G.tod.state && G.tod.state.night > 0.3;
  const on = !!(v && !v.dead && night && v.spec.cls !== 'boat' && v.spec.cls !== 'heli');
  G.lights.headL.intensity = on ? 55 : 0;
  G.lights.headR.intensity = on ? 55 : 0;
  if (on && v.mesh.userData.headL) {
    v.mesh.userData.headL.getWorldPosition(G.lights.headL.position);
    v.mesh.userData.headR.getWorldPosition(G.lights.headR.position);
    const f = v.forward(_v1);
    G.lights.headL.target.position.copy(G.lights.headL.position).addScaledVector(f, 26);
    G.lights.headL.target.position.y -= 1.4;
    G.lights.headR.target.position.copy(G.lights.headR.position).addScaledVector(f, 26);
    G.lights.headR.target.position.y -= 1.4;
  }
  let hi = 0;
  for (const h of G.vehicles) {
    if (hi > 1) break;
    if (h.dead || !h.ai || h.ai.role !== 'heli') continue;
    const spot = G.lights.heli[hi++];
    spot.intensity = 120;
    spot.position.set(h.pos.x, h.pos.y - 0.2, h.pos.z);
    spot.target.position.set(G.player.pos.x, G.player.pos.y + 0.5, G.player.pos.z);
  }
  for (; hi < G.lights.heli.length; hi++) G.lights.heli[hi].intensity = 0;
}
function updateActors(dt, allow, input) {
  for (const pr of G.protagonists) {
    if (pr === G.player) {
      if (allow) G.control.update(dt, input, pr);
      pr.updateBody(dt);
    } else if (!pr.alive || pr.vehicle) pr.updateBody(dt);
    else {
      pr.vel.x = damp(pr.vel.x, 0, 3, dt);
      pr.vel.z = damp(pr.vel.z, 0, 3, dt);
      pr.pos.x += pr.vel.x * dt;
      pr.pos.z += pr.vel.z * dt;
      pr.updateBody(dt);
    }
  }
}
function respawn() {
  const p = G.player;
  let best = G.world.hospitals[0], bd = 1e18;
  for (const h of G.world.hospitals) { const d = h.distanceToSquared(p.pos); if (d < bd) { bd = d; best = h; } }
  placeOnSidewalk(p, best.x, best.z, 0);
  p.alive = true; p.health = 100; p.armor = 0; p.stamina = 100; p.panic = 0;
  p.group.visible = true;
  const loss = Math.min(G.cash, 1000);
  G.cash -= loss;
  if (G.wanted) G.wanted.clear();
  if (G.missions && G.missions.active) G.missions.fail('You went down');
  for (const o of G.protagonists) if (o !== p && !o.alive) { o.alive = true; o.health = 60; placeOnSidewalk(o, o.pos.x, o.pos.z, o.yaw); }
  G.wasted = false;
  G.wastedT = 0;
  G.post.grade.gray.value = 0;
  G.hud.big('');
  G.hud.note('Woke up outside the hospital. Lost <b>' + fmtMoney(loss) + '</b>.');
  G.hud.cashDelta(-loss);
  if (G.input.wantLock && !G.paused && !G.phoneOpen) G.input.lock();
}
function pauseGame() {
  G.paused = true;
  document.getElementById('pause').classList.remove('hidden');
  G.input.unlock();
}
function resumeGame() {
  G.paused = false;
  document.getElementById('pause').classList.add('hidden');
  if (G.input.wantLock) G.input.lock();
}
function begin() {
  if (!window.__ready || G.started) return;
  try { G.audio.init(); } catch (e) { console.warn(e); }
  G.started = true;
  G.paused = false;
  G.input.wantLock = true;
  try { G.input.lock(); } catch (e) {}
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('game').focus();
  G.hud.help('Click the street to look around. <b>F</b> takes the nearest car. <b>P</b> is your phone.');
  G.hud.note('Welcome to <b>Vice City</b>, Leonida.');
  window.__started = true;
}

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
if (THREE.LinearSRGBColorSpace) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
G.renderer = renderer;
const scene = new THREE.Scene();
G.scene = scene;
scene.fog = new THREE.Fog(0xbfe2ff, 420, 2400);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.35, 4200);
G.camera = camera;
G.tod = new TimeOfDay();
G.tod.sample();
G.weather = new Weather(scene);
G.sky = new Sky(scene);
G.lights = new LightRig(scene);
G.post = new PostPipeline(renderer);
G.post.setSize(innerWidth, innerHeight);
G.audio = new AudioEngine();
G.input = new Input(canvas);
G.fx = new Fx(scene);
G.world = new World(scene);
G.radio = G.audio.stations ? 3 : 3;

function onResize() {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  G.post.setSize(innerWidth, innerHeight);
}
window.addEventListener('resize', onResize);

let probe = null;
let probeHour = -99;
let last = performance.now();

function tick(now) {
  requestAnimationFrame(tick);
  if (G.crashed || !window.__ready) return;
  const raw = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  const dt = raw * (G.slowmo > 0 ? 0.4 : 1);
  if (G.slowmo > 0) G.slowmo = Math.max(0, G.slowmo - raw);
  G.dt = dt;
  G.time += G.paused ? 0 : dt;
  G.frame++;
  const input = G.input;
  if (G.started) {
    if (G.phoneOpen) {
      if (input.hit('KeyP') || input.hit('Escape') || input.hit('Backspace')) G.phone.close();
      else G.phone.keys(input);
    } else if (G.paused) {
      if (input.hit('Escape') || input.hit('Enter')) resumeGame();
    } else if (!G.wasted) {
      if (input.hit('Escape')) pauseGame();
      else if (input.hit('KeyP')) G.phone.open();
      else if (input.hit('KeyC') && !G.switching) G.switcher.start();
      else if (input.hit('Backquote')) G.showFps = !G.showFps;
    }
  }
  const live = !G.paused;
  if (live && G.audio && G.audio.ready) { G.audio.setLoop('screech', 0); G.audio.setLoop('wake', 0); }
  if (G.traffic) G.traffic.update(dt);
  if (G.wanted && G.started) G.wanted.update(dt);
  for (const v of G.vehicles) v.update(dt);
  const allow = G.started && live && !G.phoneOpen && !G.switching && !G.wasted && G.player.alive;
  updateActors(dt, allow, input);
  if (G.peds) G.peds.update(dt);
  if (G.started && live && G.combat) G.combat.update(dt, input);
  if (G.started && live && G.missions) { G.missions.update(dt); updateDelivery(); updateNav(dt); }
  if (G.started && G.player && !G.player.alive && !G.wasted) {
    G.wasted = true; G.wastedT = 0;
    if (G.audio) G.audio.ui('wasted');
    G.hud.big('WASTED', 'Bleeding out', 5000);
    G.input.unlock();
  }
  if (G.wasted) { G.wastedT += dt; G.post.grade.gray.value = clamp(G.wastedT / 1.5, 0, 0.92); if (G.wastedT > 3.2) respawn(); }
  if (G.switching && live) G.switcher.update(dt);
  if (!G.started) {
    const t = G.time + now * 0.001;
    camera.position.set(-60 + Math.sin(t * 0.05) * 24, 52, -340);
    camera.lookAt(80, 22, -40);
  } else if (!G.switching) {
    G.cam.update(dt, input, G.player);
    G.focus.copy(G.player.vehicle ? G.player.vehicle.pos : G.player.pos);
  }
  const S = G.tod.update(G.paused ? 0 : dt);
  G.weather.update(G.paused ? 0 : dt);
  applyAtmosphere(S);
  G.world.update(dt, S, G.weather, camera);
  G.world.updateChunks(camera);
  G.sky.update(camera, G.time);
  G.ocean.update(dt, camera);
  G.clouds.update(dt, camera, S);
  G.lights.update(dt, G.focus, S, G.weather);
  streetLights();
  vehicleLights();
  if (probe && Math.abs(G.tod.hour - probeHour) > 1.2) {
    probeHour = G.tod.hour;
    try { scene.environment = probe.update(S.gnd); } catch (e) { probe = null; }
  }
  if (G.fx) G.fx.update(dt, camera);
  if (G.audio && G.audio.ready && G.player) {
    const vel = G.player.vehicle ? G.player.vehicle.vel : G.player.vel;
    G.audio.updateListener(camera, vel);
    G.audio.updateSirens(G.vehicles);
    G.audio.updateRadio(dt);
    const h = G.world.terrainH(G.player.pos.x, G.player.pos.z);
    G.audio.setLoop('ocean', h < 1.5 ? 0.18 : 0.035);
    G.audio.setLoop('city', 0.045 + S.night * 0.03);
    const spd = G.player.vehicle ? Math.abs(G.player.vehicle.speed) : Math.hypot(G.player.vel.x, G.player.vel.z);
    G.audio.setLoop('wind', clamp(spd / 90, 0, 0.22));
  }
  if (G.started && G.hud) G.hud.update(dt);
  if ((G.frame % 30) === 0) G.post.adapt(dt);
  G.post.render(scene, camera);
  if (G.frame === 12) {
    const err = renderer.getContext().getError();
    if (err) console.warn('gl error', err);
    window.__gl = err;
  }
  input.endFrame();
  window.__frame = G.frame;
}

(async function boot() {
  const bar = document.querySelector('#loadbar i');
  const label = document.getElementById('loadtxt');
  try {
    await G.world.generate((v, t) => { if (bar) bar.style.width = (v * 100) + '%'; if (label) label.textContent = t; });
    G.ocean = new Ocean(scene);
    G.clouds = new CloudLayer(scene);
    try { probe = new EnvProbe(renderer, G.sky.material); } catch (e) { console.warn(e); }
    makeProtagonists();
    placeOnSidewalk(G.player, -180, -220, 0.2);
    placeOnSidewalk(G.protagonists[1], 1280, 40, Math.PI);
    G.cam = new CameraRig(camera);
    G.cam.yaw = G.player.yaw + Math.PI;
    G.control = new PlayerControl();
    G.switcher = new Switcher();
    G.combat = new Combat();
    G.marker = new Marker();
    G.missions = new Missions();
    populateWorld();
    G.hud = new Hud();
    G.phone = new Phone();
    const legend = document.querySelector('#splash .legend');
    if (legend) document.getElementById('pause-legend').innerHTML = legend.innerHTML;
    document.getElementById('resume').addEventListener('click', resumeGame);
    document.getElementById('play').disabled = false;
    document.getElementById('play').addEventListener('click', begin);
    if (label) label.textContent = 'Ready — PLAY LEONIDA';
    if (bar) bar.style.width = '100%';
    const S = G.tod.sample();
    applyAtmosphere(S);
    try { if (probe) scene.environment = probe.update(S.gnd); probeHour = G.tod.hour; } catch (e) { probe = null; }
    window.__ready = true;
    window.__info = { nodes: G.world.nodes.length, edges: G.world.edges.length, buildings: G.world.buildings.length, vehicles: G.vehicles.length, npcs: G.npcs.length };
    requestAnimationFrame(tick);
  } catch (e) { showError(e); }
})();

window.G = G;
window.__api = {
  start: begin,
  teleport(x, y, z) {
    const yy = y == null ? G.world.surfaceH(x, z, 20) : y;
    G.player.place(x, yy, z, G.player.yaw);
    return { x: G.player.pos.x, y: G.player.pos.y, z: G.player.pos.z };
  },
  spawn(id, x, z, yaw) {
    const v = spawnVehicle(id, x, z, yaw || 0);
    v.parked = true;
    G.lastSpawn = v;
    return { id, x: v.pos.x, y: v.pos.y, z: v.pos.z, health: v.health };
  },
  enter() { if (G.lastSpawn && !G.lastSpawn.dead) enterVehicle(G.player, G.lastSpawn); else tryEnter(G.player); return !!(G.player.vehicle); },
  exit() { exitVehicle(G.player, false); },
  drive(o) { G.debugDrive = o; },
  move(o) { G.debugMove = o; },
  hour(h) { G.tod.setHour(h); },
  weather(m) { G.weather.set(m); if (m === 'rain') G.weather.rain = 1; if (m === 'fog') G.weather.fog = 1; if (m === 'clear') { G.weather.rain = 0; G.weather.fog = 0; } },
  stars(n) { G.wanted.setStars(n); },
  weapon(i) { G.combat.equip(i); },
  fire() { G.combat.attack(G.player); },
  yaw(y) { if (G.cam) G.cam.yaw = y; },
  state() {
    const p = G.player;
    return {
      ready: !!window.__ready, started: !!G.started, frame: G.frame || 0, cash: G.cash,
      stars: G.wanted ? G.wanted.stars : 0,
      health: p ? p.health : 0, armor: p ? p.armor : 0, alive: !!(p && p.alive),
      x: p ? +p.pos.x.toFixed(2) : 0, y: p ? +p.pos.y.toFixed(2) : 0, z: p ? +p.pos.z.toFixed(2) : 0,
      vehicle: p && p.vehicle ? p.vehicle.id : null,
      speed: p && p.vehicle ? +p.vehicle.speed.toFixed(2) : 0,
      hour: G.tod ? +G.tod.hour.toFixed(2) : 0,
      weather: G.weather ? G.weather.mode : '',
      npcs: G.npcs.length, vehicles: G.vehicles.length,
      weapon: p ? WEAPONS[p.weapon].id : '',
      mission: G.missions && G.missions.active ? G.missions.active.id : '',
      gl: window.__gl || 0,
      err: window.__err || ''
    };
  }
};
