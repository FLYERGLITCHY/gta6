const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  constructor() { this.ready = false; this.radioOn = false; this.station = 0; this.listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0), vel: new THREE.Vector3() }; }
  init() {
    if (this.ready) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.8; this.amb.connect(this.master);
    const n = c.sampleRate * 2;
    this.white = c.createBuffer(1, n, c.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, n, c.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.reverb = c.createConvolver();
    const ir = c.createBuffer(2, c.sampleRate * 2, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
    this.reverb.buffer = ir;
    this.revIn = c.createGain(); this.revOut = c.createGain(); this.revOut.gain.value = 0.35;
    this.revIn.connect(this.reverb); this.reverb.connect(this.revOut); this.revOut.connect(this.master);
    this.loops = {
      ocean: this.loop(this.brown, 'lowpass', 480, this.amb),
      city: this.loop(this.brown, 'lowpass', 240, this.amb),
      rain: this.loop(this.white, 'highpass', 1600, this.amb),
      wind: this.loop(this.white, 'bandpass', 500, this.sfx),
      screech: this.loop(this.white, 'bandpass', 2200, this.sfx),
      wake: this.loop(this.white, 'lowpass', 900, this.sfx)
    };
    this.loops.screech.f.Q.value = 4;
    this.engines = [];
    this.sirens = [0, 1, 2].map(() => this.makeSiren());
    this.stations = [
      { name: 'Vice Synthwave FM', freq: '88.7', tag: 'After dark on the strip', color: '#ff4fd8', bpm: 104, seed: 7, kind: 'wave' },
      { name: 'Leonida Bass 104.5', freq: '104.5', tag: 'Sub from the glades', color: '#3dffb0', bpm: 140, seed: 19, kind: 'bass' },
      { name: 'Neon Electro Club', freq: '97.3', tag: 'Until sunrise', color: '#2ee6ff', bpm: 124, seed: 31, kind: 'club' }
    ];
    this.radioGain = c.createGain(); this.radioGain.gain.value = 0;
    this.radioFilter = c.createBiquadFilter(); this.radioFilter.type = 'lowpass'; this.radioFilter.frequency.value = 9000;
    this.radioGain.connect(this.radioFilter); this.radioFilter.connect(this.music);
    this.stepTimer = 0; this.step = 0; this.rng = new RNG(7);
    this.ready = true;
  }
  loop(buf, type, freq, dest) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(dest); src.start();
    return { g, f };
  }
  setLoop(name, vol, freq) {
    if (!this.ready) return;
    const l = this.loops[name]; if (!l) return;
    l.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.15);
    if (freq) l.f.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }
  spatial(pos, ref = 12) {
    const L = this.listener.pos;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const d = Math.hypot(dx, dy, dz) || 0.001;
    const g = Math.min(1, ref / (ref + Math.max(0, d - ref)));
    const pan = clamp((dx * this.listener.right.x + dz * this.listener.right.z) / d, -1, 1) * 0.85;
    return { g, pan, d };
  }
  out(sp, vol, rev = 0.15) {
    const c = this.ctx, g = c.createGain(); g.gain.value = vol * (sp ? sp.g : 1);
    const p = c.createStereoPanner(); p.pan.value = sp ? sp.pan : 0;
    g.connect(p); p.connect(this.sfx);
    if (rev) { const s = c.createGain(); s.gain.value = rev * (sp ? sp.g : 1); g.connect(s); s.connect(this.revIn); }
    return g;
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  noise(t, dur, dest, buf) { const n = this.ctx.createBufferSource(); n.buffer = buf || this.white; n.connect(dest); n.start(t, Math.random()); n.stop(t + dur); }
  tone(t, f0, f1, dur, type, dest, vol) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.005, vol, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  gun(kind, pos) {
    if (!this.ready) return;
    const P = { pistol: [180, 60, 0.09, 0.7], smg: [220, 80, 0.05, 0.5], rifle: [140, 45, 0.14, 0.85], sniper: [90, 30, 0.32, 1], rpg: [70, 40, 0.4, 0.9] }[kind];
    if (!P) return;
    const sp = this.spatial(pos, 18); if (sp.g < 0.02) return;
    const t = this.ctx.currentTime, o = this.out(sp, P[3], 0.25);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, 1, P[2]); bp.connect(g); g.connect(o); this.noise(t, P[2] + 0.02, bp);
    this.tone(t, P[0], P[1], P[2] * 1.3, 'sine', o, 0.8);
  }
  explosion(pos, size = 1) {
    if (!this.ready) return;
    const sp = this.spatial(pos, 40); if (sp.g < 0.01) return;
    const t = this.ctx.currentTime, o = this.out(sp, 1.1 * size, 0.6);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.6);
    const g = this.ctx.createGain(); this.env(g, t, 0.01, 1.2, 1.8); lp.connect(g); g.connect(o); this.noise(t, 1.9, lp, this.brown);
    this.tone(t, 90, 28, 1.1, 'sine', o, 1);
  }
  impact(pos, k = 0.5) { if (!this.ready) return; const sp = this.spatial(pos, 14); if (sp.g < 0.03) return; const t = this.ctx.currentTime, o = this.out(sp, 0.4 + k * 0.5, 0.1); this.tone(t, 180, 50, 0.12 + k * 0.1, 'triangle', o, 1); }
  hit(pos) { if (!this.ready) return; const t = this.ctx.currentTime; this.tone(t, rand(1400, 2400), 400, 0.05, 'square', this.out(this.spatial(pos, 10), 0.2, 0), 0.4); }
  punch() { if (!this.ready) return; const t = this.ctx.currentTime; this.tone(t, 140, 50, 0.1, 'sine', this.out(null, 0.5, 0), 1); }
  horn(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.out(pos ? this.spatial(pos, 16) : null, 0.25, 0); this.tone(t, 392, 392, 0.35, 'square', o, 0.6); this.tone(t, 494, 494, 0.35, 'square', o, 0.4); }
  splash(pos) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.out(this.spatial(pos, 12), 0.35, 0.1); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const g = this.ctx.createGain(); this.env(g, t, 0.01, 1, 0.35); lp.connect(g); g.connect(o); this.noise(t, 0.4, lp); }
  scream(pos) { if (!this.ready) return; const sp = this.spatial(pos, 16); if (sp.g < 0.04) return; const t = this.ctx.currentTime, o = this.out(sp, 0.22, 0.2); this.tone(t, rand(380, 640), rand(240, 400), rand(0.4, 0.8), 'sawtooth', o, 0.5); }
  ui(kind) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.22, 0.05);
    const b = (f, tt, d) => this.tone(tt, f, f, d, 'square', o, 0.5);
    if (kind === 'money') [880, 1174, 1568].forEach((f, i) => b(f, t + i * 0.07, 0.2));
    else if (kind === 'fail') [392, 311, 233].forEach((f, i) => b(f, t + i * 0.14, 0.25));
    else if (kind === 'go') b(880, t, 0.4);
    else if (kind === 'count') b(660, t, 0.18);
    else if (kind === 'star') { b(520, t, 0.12); b(780, t + 0.1, 0.16); }
    else if (kind === 'checkpoint') { b(1046, t, 0.08); b(1568, t + 0.08, 0.16); }
    else if (kind === 'click') b(1200, t, 0.05);
    else if (kind === 'wasted') this.tone(t, 220, 55, 1.4, 'sawtooth', o, 0.8);
    else b(900, t, 0.08);
  }
  foot() { if (!this.ready) return; const t = this.ctx.currentTime; this.tone(t, 90, 40, 0.04, 'sine', this.out(null, 0.12, 0), 1); }
  reload() { if (!this.ready) return; const t = this.ctx.currentTime, o = this.out(null, 0.2, 0); this.tone(t, 1800, 900, 0.04, 'square', o, 0.3); this.tone(t + 0.18, 1400, 700, 0.05, 'square', o, 0.3); }
  empty() { if (!this.ready) return; this.tone(this.ctx.currentTime, 2000, 1500, 0.03, 'square', this.out(null, 0.15, 0), 0.4); }
  thunder() { if (!this.ready) return; const t = this.ctx.currentTime + rand(0.4, 2); const o = this.out(null, 0.7, 0.4); const g = this.ctx.createGain(); this.env(g, t, 0.05, 1, 2.2); const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(g); g.connect(o); this.noise(t, 2.4, lp, this.brown); }
  whoosh(up) { if (!this.ready) return; const t = this.ctx.currentTime, o = this.out(null, 0.3, 0.1); const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(up ? 200 : 2000, t); bp.frequency.exponentialRampToValueAtTime(up ? 2000 : 200, t + 0.7); const g = this.ctx.createGain(); this.env(g, t, 0.1, 0.8, 0.6); bp.connect(g); g.connect(o); this.noise(t, 0.8, bp); }
  attachEngine(spec) {
    if (!this.ready) return null;
    const c = this.ctx, g = c.createGain(); g.gain.value = 0;
    const p = c.createStereoPanner(); g.connect(p); p.connect(this.sfx);
    const o = c.createOscillator(); o.type = spec.wave || 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    const sh = c.createWaveShaper();
    const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * (spec.drive || 3)); }
    sh.curve = curve;
    o.connect(sh); o2.connect(sh); sh.connect(lp); lp.connect(g);
    o.start(); o2.start();
    const v = { o, o2, lp, g, p, spec, stop() { try { o.stop(); o2.stop(); } catch (e) {} } };
    return v;
  }
  updateEngine(v, rpm, throttle, pos) {
    if (!v || !this.ready) return;
    const f = v.spec.idle + rpm * (v.spec.max - v.spec.idle);
    const t = this.ctx.currentTime;
    v.o.frequency.setTargetAtTime(f, t, 0.04);
    v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    v.lp.frequency.setTargetAtTime(300 + rpm * 1800 + throttle * 900, t, 0.05);
    let vol = v.spec.vol * (0.35 + throttle * 0.4 + rpm * 0.3);
    let pan = 0;
    if (pos) { const sp = this.spatial(pos, 14); vol *= sp.g; pan = sp.pan; }
    v.g.gain.setTargetAtTime(vol, t, 0.08);
    v.p.pan.setTargetAtTime(pan, t, 0.08);
  }
  makeSiren() {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(p); p.connect(this.sfx); o.start();
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.55; lg.gain.value = 220; lfo.connect(lg); lg.connect(o.frequency); lfo.start();
    o.frequency.value = 780;
    return { o, g, p, lfo, on: false };
  }
  updateSirens(list) {
    if (!this.ready) return;
    const L = this.listener.pos;
    const near = list.filter(v => v.siren && !v.dead).sort((a, b) => a.pos.distanceToSquared(L) - b.pos.distanceToSquared(L)).slice(0, 3);
    this.sirens.forEach((s, i) => {
      const v = near[i];
      const t = this.ctx.currentTime;
      if (!v) { s.g.gain.setTargetAtTime(0, t, 0.1); return; }
      const sp = this.spatial(v.pos, 26);
      const dx = v.pos.x - L.x, dz = v.pos.z - L.z, d = Math.hypot(dx, dz) || 1;
      const closing = ((L.x - v.pos.x) * v.vel.x + (L.z - v.pos.z) * v.vel.z) / d;
      s.o.detune.setTargetAtTime(clamp(closing * 8, -400, 400), t, 0.1);
      s.g.gain.setTargetAtTime(0.18 * sp.g, t, 0.1);
      s.p.pan.setTargetAtTime(sp.pan, t, 0.1);
    });
  }
  setRadio(on, index) {
    if (!this.ready) return;
    if (index !== undefined) this.station = (index + this.stations.length) % this.stations.length;
    this.radioOn = on && this.station >= 0;
    this.radioGain.gain.setTargetAtTime(this.radioOn ? 0.9 : 0, this.ctx.currentTime, 0.08);
    this.rng = new RNG(this.stations[this.station].seed + (this.step | 0));
  }
  updateRadio(dt) {
    if (!this.ready || !this.radioOn) return;
    const st = this.stations[this.station];
    const stepDur = 60 / st.bpm / 4;
    this.stepTimer += dt;
    const now = this.ctx.currentTime;
    while (this.stepTimer >= stepDur) {
      this.stepTimer -= stepDur;
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16);
      this.playStep(st, s, bar, now + 0.05);
      this.step++;
    }
  }
  playStep(st, s, bar, t) {
    const o = this.radioGain;
    const root = [48, 43, 46, 41][bar % 4];
    const kick = () => { const osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(46, t + 0.12); this.env(g, t, 0.002, 0.8, 0.22); osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.25); };
    const hat = (open) => { const n = this.ctx.createBufferSource(); n.buffer = this.white; const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; const g = this.ctx.createGain(); this.env(g, t, 0.001, 0.12, open ? 0.18 : 0.03); n.connect(hp); hp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.2); };
    const bass = (note, dur) => { const osc = this.ctx.createOscillator(), lp = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = mtof(note); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur); this.env(g, t, 0.005, 0.35, dur); osc.connect(lp); lp.connect(g); g.connect(o); osc.start(t); osc.stop(t + dur + 0.02); };
    const lead = (note, dur) => { const osc = this.ctx.createOscillator(), g = this.ctx.createGain(); osc.type = st.kind === 'bass' ? 'triangle' : 'square'; osc.frequency.value = mtof(note); this.env(g, t, 0.01, 0.1, dur); osc.connect(g); g.connect(o); const s2 = this.ctx.createGain(); s2.gain.value = 0.2; g.connect(s2); s2.connect(this.revIn); osc.start(t); osc.stop(t + dur + 0.05); };
    if (st.kind !== 'bass' && (s % 4 === 0)) kick();
    if (st.kind === 'bass' && (s === 0 || s === 3 || s === 10)) kick();
    if (s === 4 || s === 12) { const n = this.ctx.createBufferSource(); n.buffer = this.white; const g = this.ctx.createGain(); this.env(g, t, 0.001, 0.35, 0.14); const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; n.connect(hp); hp.connect(g); g.connect(o); n.start(t); n.stop(t + 0.16); }
    if (s % 2 === 0) hat(s === 14);
    if (st.kind === 'club') { if (s % 4 === 2) bass(root - 24, 0.18); if (s % 4 === 0) bass(root - 12, 0.12); }
    else bass(root - 24 + ((s % 4 === 2) ? 12 : 0), st.kind === 'bass' ? 0.2 : 0.16);
    const scale = [0, 3, 5, 7, 10, 12];
    if (s % 2 === 0 && (bar % 4 < 3 || st.kind === 'wave')) lead(root + 12 + scale[(s / 2 + bar) % scale.length], 0.18);
    if (s === 0 && bar % 2 === 0) {
      for (const iv of [0, 3, 7]) { const osc = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter(); osc.type = 'sawtooth'; osc.frequency.value = mtof(root + iv); lp.type = 'lowpass'; lp.frequency.value = 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + 1.6); osc.connect(lp); lp.connect(g); g.connect(o); osc.start(t); osc.stop(t + 1.7); }
    }
  }
  updateListener(cam, vel) {
    if (!this.ready) return;
    this.listener.pos.copy(cam.position);
    cam.getWorldDirection(_v1);
    this.listener.right.set(_v1.z, 0, -_v1.x).normalize();
    if (vel) this.listener.vel.copy(vel);
  }
}
