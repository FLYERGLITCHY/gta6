function drawGun(ctx, w, h, id) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w * 0.12, h * 0.55);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#f4f4f4';
  ctx.lineWidth = Math.max(2, w * 0.02);
  ctx.lineJoin = 'round';
  const u = h * 0.34;
  ctx.beginPath();
  if (id === 'fists') {
    ctx.translate(w * 0.28, 0);
    ctx.arc(0, 0, u * 0.7, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(u * 1.5, 0, u * 0.7, 0, TAU);
    ctx.fill();
  } else if (id === 'rpg') {
    ctx.fillRect(0, -u * 0.45, w * 0.7, u * 0.7);
    ctx.beginPath();
    ctx.moveTo(w * 0.7, -u * 0.28);
    ctx.lineTo(w * 0.82, 0);
    ctx.lineTo(w * 0.7, u * 0.28);
    ctx.fill();
  } else if (id === 'sniper') {
    ctx.fillRect(0, -u * 0.18, w * 0.78, u * 0.28);
    ctx.fillRect(w * 0.18, -u * 0.55, w * 0.22, u * 0.4);
    ctx.fillRect(w * 0.55, u * 0.05, u * 0.16, u * 0.7);
  } else if (id === 'smg') {
    ctx.fillRect(0, -u * 0.22, w * 0.55, u * 0.36);
    ctx.fillRect(w * 0.16, u * 0.05, u * 0.22, u * 0.55);
    ctx.fillRect(w * 0.48, -u * 0.12, w * 0.16, u * 0.18);
  } else if (id === 'rifle') {
    ctx.fillRect(0, -u * 0.16, w * 0.74, u * 0.26);
    ctx.fillRect(w * 0.2, u * 0.05, u * 0.16, u * 0.62);
    ctx.fillRect(w * 0.62, -u * 0.28, w * 0.12, u * 0.2);
  } else {
    ctx.fillRect(0, -u * 0.18, w * 0.42, u * 0.3);
    ctx.fillRect(w * 0.12, u * 0.05, u * 0.2, u * 0.5);
  }
  ctx.restore();
}

class Hud {
  constructor() {
    this.radar = document.getElementById('radar');
    this.rctx = this.radar.getContext('2d');
    this.icon = document.getElementById('weapon-icon');
    this.ictx = this.icon.getContext('2d');
    this.rpm = document.getElementById('rpm');
    this.rpmctx = this.rpm.getContext('2d');
    this.helpT = 0;
    this.hitT = 0;
    this.area = '';
    this.weaponId = '';
    this.fpsS = 0;
    this.fpsN = 0;
    const wheel = document.getElementById('weapon-wheel');
    for (let i = 0; i < WEAPONS.length; i++) {
      const a = -Math.PI / 2 + i * (TAU / 6);
      const slot = document.createElement('div');
      slot.className = 'ws';
      slot.style.left = (50 + Math.cos(a) * 36) + '%';
      slot.style.top = (50 + Math.sin(a) * 36) + '%';
      const c = document.createElement('canvas');
      c.width = 200; c.height = 72;
      drawGun(c.getContext('2d'), 200, 72, WEAPONS[i].id);
      const lab = document.createElement('div');
      lab.textContent = (i + 1) + ' ' + WEAPONS[i].name;
      slot.appendChild(c); slot.appendChild(lab);
      slot.addEventListener('mousedown', ev => { ev.stopPropagation(); if (G.combat) G.combat.equip(i); });
      wheel.appendChild(slot);
    }
    this.weaponChanged();
  }
  weaponChanged() {
    const p = G.player;
    if (!p) return;
    const w = WEAPONS[p.weapon];
    this.weaponId = w.id;
    drawGun(this.ictx, this.icon.width, this.icon.height, w.id);
  }
  help(html) {
    const el = document.getElementById('help');
    el.innerHTML = html;
    el.classList.add('on');
    this.helpT = 7;
  }
  note(html) {
    const f = document.getElementById('feed');
    const d = document.createElement('div');
    d.className = 'note';
    d.innerHTML = html;
    f.appendChild(d);
    while (f.children.length > 4) f.removeChild(f.firstChild);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 420); }, 4200);
  }
  cashDelta(n) {
    const d = document.getElementById('cash-delta');
    d.textContent = (n > 0 ? '+' : '−') + fmtMoney(Math.abs(n));
    d.classList.toggle('neg', n < 0);
    d.style.opacity = '1';
    clearTimeout(this._ct);
    this._ct = setTimeout(() => { d.style.opacity = '0'; }, 1400);
    const c = document.getElementById('cash');
    c.classList.add('bump');
    setTimeout(() => c.classList.remove('bump'), 180);
  }
  big(t, s, hold) {
    const el = document.getElementById('bigtext');
    clearTimeout(this._big);
    if (!t) { el.classList.remove('on'); el.innerHTML = ''; return; }
    el.innerHTML = t + (s ? '<small>' + s + '</small>' : '');
    el.classList.add('on');
    this._big = setTimeout(() => { if (!G.wasted) el.classList.remove('on'); }, hold || 2200);
  }
  title(h1, h2) {
    const el = document.getElementById('mission-title');
    el.querySelector('h1').textContent = h1;
    el.querySelector('h2').textContent = h2 || '';
    el.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => el.classList.remove('on'), 3400);
  }
  radioBanner() {
    const el = document.getElementById('radio-name');
    const on = G.audio && G.audio.stations && G.radio < G.audio.stations.length;
    const st = on ? G.audio.stations[G.radio] : null;
    el.querySelector('.rn').textContent = st ? st.name : 'Radio Off';
    el.querySelector('.rn').style.color = st ? st.color : '#fff';
    el.querySelector('.rs').textContent = st ? st.freq + ' FM · ' + st.tag : 'Silence on the strip';
    el.classList.add('on');
    clearTimeout(this._rt);
    this._rt = setTimeout(() => el.classList.remove('on'), 2600);
  }
  hit(kill) {
    const el = document.getElementById('hitmarker');
    el.classList.add('on');
    el.classList.toggle('kill', !!kill);
    this.hitT = 0.12;
  }
  wheel(on, idx) {
    const el = document.getElementById('weapon-wheel');
    el.classList.toggle('on', !!on);
    el.querySelectorAll('.ws').forEach((s, i) => s.classList.toggle('sel', i === idx));
    const w = WEAPONS[idx || 0];
    el.querySelector('.wc').textContent = on && w ? w.name : '';
  }
  drawRadar() {
    const ctx = this.rctx;
    const w = this.radar.width, h = this.radar.height;
    const p = G.player;
    if (!p || !G.world.minimap) return;
    const heading = G.cam ? G.cam.yaw : p.yaw;
    const zoom = 2.15;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07131c';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(4, 4, w - 8, h - 8);
    ctx.clip();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(heading);
    const map = G.world.minimap;
    const k = G.world.mmScale;
    const scale = zoom / k;
    const sx = (p.pos.x + WORLD_HALF) * k;
    const sy = (p.pos.z + WORLD_HALF) * k;
    ctx.drawImage(map, -sx * scale, -sy * scale, map.width * scale, map.height * scale);
    if (G.gps && G.gps.length) {
      ctx.beginPath();
      ctx.strokeStyle = '#ffe14a';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      for (let i = 0; i < G.gps.length; i++) {
        const x = (G.gps[i].x - p.pos.x) * zoom, y = (G.gps[i].z - p.pos.z) * zoom;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    if (G.navTarget) {
      ctx.fillStyle = '#ffe14a';
      ctx.beginPath();
      ctx.arc((G.navTarget.x - p.pos.x) * zoom, (G.navTarget.z - p.pos.z) * zoom, 7, 0, TAU);
      ctx.fill();
    }
    for (const o of G.protagonists) {
      if (o === p) continue;
      ctx.fillStyle = '#2ee6ff';
      ctx.fillRect((o.pos.x - p.pos.x) * zoom - 4, (o.pos.z - p.pos.z) * zoom - 4, 8, 8);
    }
    for (const n of G.npcs) {
      if (!n.alive) continue;
      const x = (n.pos.x - p.pos.x) * zoom, y = (n.pos.z - p.pos.z) * zoom;
      if (x * x + y * y > 280 * 280) continue;
      ctx.fillStyle = n.ai && n.ai.hostile ? '#ff4d6a' : 'rgba(255,255,255,0.55)';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const v of G.vehicles) {
      if (v.dead) continue;
      const x = (v.pos.x - p.pos.x) * zoom, y = (v.pos.z - p.pos.z) * zoom;
      if (v.police && v.ai) {
        ctx.fillStyle = 'rgba(255,40,70,0.22)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        const len = (v.spec.cls === 'heli' ? 70 : 42) * zoom;
        const sp = v.spec.cls === 'heli' ? 0.7 : 0.42;
        ctx.lineTo(x + Math.sin(v.yaw - sp) * len, y + Math.cos(v.yaw - sp) * len);
        ctx.lineTo(x + Math.sin(v.yaw + sp) * len, y + Math.cos(v.yaw + sp) * len);
        ctx.fill();
      }
      ctx.fillStyle = v.police ? (Math.sin(G.time * 10) > 0 ? '#ff3048' : '#3d7bff') : (v === (p.vehicle) ? '#7dff8f' : 'rgba(230,230,230,0.8)');
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 12);
    ctx.lineTo(w / 2 + 8, h / 2 + 10);
    ctx.lineTo(w / 2 - 8, h / 2 + 10);
    ctx.fill();
  }
  drawRpm(v) {
    const ctx = this.rpmctx, w = this.rpm.width, h = this.rpm.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.62, cy = h * 0.78, R = 150;
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI * 0.85, Math.PI * 2.15);
    ctx.stroke();
    const a0 = Math.PI * 0.85, a1 = Math.PI * 2.15;
    ctx.strokeStyle = v.nitroOn ? '#7ecbff' : '#ff3d9a';
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * clamp(v.rpm, 0, 1));
    ctx.stroke();
  }
  update(dt) {
    const p = G.player;
    if (!p) return;
    document.getElementById('clock').textContent = G.tod.timeString();
    document.getElementById('ph-time').textContent = G.tod.timeString();
    const big = document.getElementById('ph-bigclock');
    if (big) big.textContent = G.tod.timeString();
    const pc = document.getElementById('ph-cash');
    if (pc) pc.textContent = fmtMoney(G.cash);
    document.getElementById('cash').textContent = fmtMoney(G.cash);
    const hb = document.querySelector('#hb i');
    const ab = document.querySelector('#ab i');
    const sb = document.querySelector('#sb i');
    hb.style.width = clamp(p.health, 0, 100) + '%';
    ab.style.width = clamp(p.armor, 0, 100) + '%';
    sb.style.width = clamp(p.stamina, 0, 100) + '%';
    document.getElementById('hb').classList.toggle('low', p.health < 30);
    const stars = G.wanted ? G.wanted.stars : 0;
    const se = document.getElementById('stars');
    se.classList.toggle('flash', stars > 0);
    se.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < stars));
    const frame = document.getElementById('radar-frame');
    const blink = Math.sin(G.time * 8) > 0;
    frame.classList.toggle('wanted-a', stars > 0 && blink);
    frame.classList.toggle('wanted-b', stars > 0 && !blink);
    const w = WEAPONS[p.weapon];
    if (w.id !== this.weaponId) this.weaponChanged();
    const ammo = document.getElementById('ammo');
    if (!w.mag) ammo.textContent = '';
    else if (G.combat && G.combat.reloading) ammo.textContent = 'REL';
    else ammo.innerHTML = p.ammo[p.weapon].mag + '<small> / ' + p.ammo[p.weapon].res + '</small>';
    const v = p.vehicle;
    document.getElementById('speedo').classList.toggle('on', !!v);
    if (v) {
      document.getElementById('mph').textContent = String(Math.round(Math.abs(v.speedMph)));
      let gear = String(v.gear);
      if (v.spec.cls === 'heli') gear = 'H';
      else if (v.spec.cls === 'boat') gear = v.speed > 1 ? 'F' : 'N';
      else if (v.speed < -1) gear = 'R';
      else if (Math.abs(v.speed) < 1) gear = 'N';
      document.getElementById('gear').textContent = gear;
      document.querySelector('#nitro i').style.width = ((v.spec.nitro ? v.nitro : 0) * 100) + '%';
      document.querySelector('#vhealth i').style.width = clamp(v.health, 0, 100) + '%';
      const on = G.audio && G.radio < G.audio.stations.length;
      document.getElementById('station').textContent = on ? G.audio.stations[G.radio].freq + '  ' + G.audio.stations[G.radio].name : 'RADIO OFF';
      this.drawRpm(v);
    }
    const scope = w.scope && G.input.rmb && p.aim > 0.55 && !p.vehicle;
    document.getElementById('scope').classList.toggle('on', !!scope);
    const ch = document.getElementById('crosshair');
    ch.classList.toggle('on', !scope && w.id !== 'fists' && !G.phoneOpen && !G.paused);
    ch.classList.toggle('enemy', !!(G.combat && G.combat.aimedEnemy));
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) document.getElementById('hitmarker').classList.remove('on'); }
    if (this.helpT > 0) { this.helpT -= dt; if (this.helpT <= 0) document.getElementById('help').classList.remove('on'); }
    const obj = document.getElementById('objective');
    obj.classList.toggle('on', !!G.objective);
    if (obj.innerHTML !== (G.objective || '')) obj.innerHTML = G.objective || '';
    const mh = document.getElementById('mission-hud');
    const mn = G.missions && G.missions.active;
    const line = mn ? '<div class="mh"><span>CONTRACT</span>' + mn.name + '</div>' : '';
    if (mh.innerHTML !== line) mh.innerHTML = line;
    const zn = G.world.zoneAt(p.pos.x, p.pos.z);
    const name = zn ? zn.name : 'Open Water';
    if (name !== this.area) {
      this.area = name;
      const el = document.getElementById('area-name');
      el.innerHTML = name + '<small>' + (zn ? zn.sub : 'State of Leonida') + '</small>';
      el.classList.add('on');
      clearTimeout(this._at);
      this._at = setTimeout(() => el.classList.remove('on'), 3400);
    }
    document.getElementById('damage-vignette').style.opacity = String(clamp((p.hitFlash || 0) * 1.4 + (p.health < 30 ? 0.25 : 0), 0, 0.85));
    if (G.fx) G.post.grade.flash.value = Math.max(G.fx.flash * 0.55, 0);
    if (!G.wasted) G.post.grade.gray.value = damp(G.post.grade.gray.value, 0, 3, dt);
    if ((G.frame & 1) === 0) this.drawRadar();
    this.fpsN++;
    this.fpsS += dt;
    if (this.fpsS >= 0.4) {
      const fps = document.getElementById('fps');
      fps.classList.toggle('on', !!G.showFps);
      fps.textContent = Math.round(this.fpsN / this.fpsS) + ' FPS';
      this.fpsN = 0; this.fpsS = 0;
    }
  }
}

class Phone {
  constructor() {
    this.isOpen = false;
    this.page = 'home';
    this.sel = 0;
    this.root = document.getElementById('phone');
    this.root.addEventListener('mousedown', e => e.stopPropagation());
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('input', e => { if (e.target.id === 'ph-hour') G.tod.setHour(+e.target.value); });
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    this.isOpen = true;
    G.phoneOpen = true;
    this.page = 'home';
    this.sel = 0;
    this.root.classList.add('open');
    G.input.unlock();
    this.render();
    if (G.audio) G.audio.ui('click');
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    G.phoneOpen = false;
    this.root.classList.remove('open');
    if (G.started && !G.paused && G.input.wantLock) G.input.lock();
  }
  toast(msg) {
    const t = document.getElementById('ph-toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), 1600);
  }
  render() {
    const home = document.getElementById('pg-home');
    const pages = { garage: document.getElementById('pg-garage'), contracts: document.getElementById('pg-contracts'), director: document.getElementById('pg-director') };
    home.classList.toggle('on', this.page === 'home');
    for (const k of Object.keys(pages)) pages[k].classList.toggle('on', this.page === k);
    if (this.page === 'home') {
      home.innerHTML = '<div class="bigclock" id="ph-bigclock">' + G.tod.timeString() + '</div><div class="date">Leonida · Vice City</div><div id="ph-cash" style="text-align:center;font:800 18px var(--ui);margin-bottom:14px;color:#d8ffe2">' + fmtMoney(G.cash) + '</div><div class="apps" id="ph-apps"></div>';
      const apps = home.querySelector('#ph-apps');
      const list = [['garage', 'PG', 'Pegasus', '#ff3d9a'], ['contracts', 'CT', 'Contracts', '#ffb03b'], ['director', 'WD', 'Director', '#7a5cff']];
      for (const [id, ic, name, col] of list) {
        const b = document.createElement('div');
        b.className = 'app pick';
        b.dataset.app = id;
        b.innerHTML = '<div class="ic" style="background:' + col + '">' + ic + '</div>' + name;
        apps.appendChild(b);
      }
    } else if (this.page === 'garage') {
      let html = '<div class="back pick" data-go="home">‹ Home</div><h3>Pegasus</h3><div class="sub">Keys left in the ignition. GPS locked.</div>';
      for (const id of ['inferno', 'cheetah', 'phoenix', 'sentinel', 'sanchez', 'speeder', 'maverick']) {
        const s = VEH_SPECS[id];
        html += '<div class="item pick" data-buy="' + id + '"><div class="t">' + s.name + '<small>' + s.cls + '</small></div><div class="p">' + fmtMoney(s.price) + '</div></div>';
      }
      pages.garage.innerHTML = html;
    } else if (this.page === 'contracts') {
      let html = '<div class="back pick" data-go="home">‹ Home</div><h3>Contracts</h3><div class="sub">Replay any job from the street.</div>';
      for (const m of G.missions.list) {
        const times = G.missions.done[m.id] || 0;
        html += '<div class="item pick" data-job="' + m.id + '"><div class="t">' + m.name + '<small>' + m.blurb + (times ? ' · cleared ' + times + '×' : '') + '</small></div><div class="p">' + fmtMoney(m.reward) + '</div></div>';
      }
      pages.contracts.innerHTML = html;
    } else if (this.page === 'director') {
      const stars = G.wanted ? G.wanted.stars : 0;
      const cost = 1500 * Math.max(1, stars);
      pages.director.innerHTML = '<div class="back pick" data-go="home">‹ Home</div><h3>World Director</h3><div class="sub">The strip bends if you pay.</div>'
        + '<div class="lbl">Weather</div><div class="seg"><button class="pick" data-act="clear">Clear</button><button class="pick" data-act="rain">Rain</button><button class="pick" data-act="fog">Fog</button></div>'
        + '<div class="lbl">Time of day</div><input id="ph-hour" type="range" min="0" max="23.9" step="0.05" value="' + G.tod.hour.toFixed(2) + '">'
        + '<div class="item pick" data-act="stars"><div class="t">Clear wanted<small>Walk away clean</small></div><div class="p">' + (stars ? fmtMoney(cost) : 'Clean') + '</div></div>'
        + '<div class="item pick" data-act="heal"><div class="t">Refill health<small>Back to full</small></div><div class="p">' + fmtMoney(400) + '</div></div>'
        + '<div class="item pick" data-act="armor"><div class="t">Refill armor<small>Full vest</small></div><div class="p">' + fmtMoney(800) + '</div></div>'
        + '<div class="item pick" data-act="ammo"><div class="t">Refill ammo<small>Every magazine</small></div><div class="p">' + fmtMoney(500) + '</div></div>';
    }
  }
  onClick(e) {
    const t = e.target.closest('[data-app],[data-go],[data-buy],[data-job],[data-act]');
    if (!t) return;
    if (G.audio) G.audio.ui('click');
    if (t.dataset.app) { this.page = t.dataset.app; this.sel = 0; this.render(); return; }
    if (t.dataset.go) { this.page = t.dataset.go; this.sel = 0; this.render(); return; }
    if (t.dataset.buy) this.deliver(t.dataset.buy);
    if (t.dataset.job) G.missions.start(t.dataset.job);
    if (t.dataset.act) this.act(t.dataset.act);
  }
  deliver(id) {
    const spec = VEH_SPECS[id];
    if (!spec) return;
    if (G.vehicles.length > 52) { this.toast('The streets are full'); return; }
    if (!trySpend(spec.price)) return;
    const p = G.player.pos;
    let v = null;
    if (spec.cls === 'boat') {
      const pier = G.world.piers && G.world.piers[0];
      if (G.world.isWater(p.x + 10, p.z)) v = spawnVehicle(id, p.x + 10, p.z, 0);
      else if (pier) v = spawnVehicle(id, pier.x + 8, (pier.z0 + pier.z1) * 0.5, Math.PI / 2);
      else v = spawnVehicle(id, p.x + 14, p.z, 0);
    } else if (spec.cls === 'heli') {
      v = spawnVehicle(id, p.x + 16, p.z + 6, G.player.yaw);
      v.pos.y = G.world.surfaceH(v.pos.x, v.pos.z, 30) + 5;
    } else {
      const ne = G.world.randomRoadPoint(p.x, p.z, 16, 36, e => !e.deck) || G.world.nearestEdge(p.x, p.z, 80);
      if (ne) v = spawnVehicle(id, ne.x, ne.z, Math.atan2(ne.dx, ne.dz));
      else v = spawnVehicle(id, p.x + 8, p.z, 0);
    }
    if (!v) { giveCash(spec.price); this.toast('No drop point'); return; }
    v.parked = true;
    G.delivery = v;
    if (!(G.missions && G.missions.active)) {
      G.navTarget = { x: v.pos.x, z: v.pos.z };
      G.objective = 'Pick up the <em>' + spec.name + '</em>';
      G._navT = 0;
    }
    this.toast(spec.name + ' delivered');
    if (G.hud) G.hud.note('<b>' + spec.name + '</b> is waiting. Follow the GPS.');
    if (G.audio) G.audio.ui('go');
  }
  act(kind) {
    const p = G.player;
    if (kind === 'clear' || kind === 'rain' || kind === 'fog') { G.weather.set(kind === 'clear' ? 'clear' : kind); this.toast(kind === 'clear' ? 'Skies clearing' : kind === 'rain' ? 'Tropical rain' : 'Dense fog'); return; }
    if (kind === 'stars') {
      const stars = G.wanted ? G.wanted.stars : 0;
      if (!stars) { this.toast('Nobody is looking'); return; }
      if (!trySpend(1500 * stars)) return;
      G.wanted.clear();
      this.toast('Records wiped');
      this.render();
      return;
    }
    if (kind === 'heal') { if (!trySpend(400)) return; p.health = 100; this.toast('Health restored'); return; }
    if (kind === 'armor') { if (!trySpend(800)) return; p.armor = 100; this.toast('Armor plated'); return; }
    if (kind === 'ammo') {
      if (!trySpend(500)) return;
      for (const pr of G.protagonists) for (let i = 0; i < WEAPONS.length; i++) { pr.ammo[i].mag = WEAPONS[i].mag || 0; pr.ammo[i].res = WEAPONS[i].reserve || 0; }
      this.toast('Magazines full');
    }
  }
  keys(input) {
    if (document.activeElement && document.activeElement.id === 'ph-hour') return;
    const picks = [...document.querySelectorAll('#phone .page.on .pick')];
    if (!picks.length) return;
    if (this.sel >= picks.length) this.sel = 0;
    if (input.hit('ArrowDown')) this.sel = (this.sel + 1) % picks.length;
    if (input.hit('ArrowUp')) this.sel = (this.sel + picks.length - 1) % picks.length;
    picks.forEach((el, i) => el.classList.toggle('sel', i === this.sel));
    if (input.hit('Enter') || input.hit('Space')) picks[this.sel].click();
  }
}
