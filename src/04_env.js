const GLSL_NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += vnoise(p) * a; p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
`;
const OCEAN_WAVES = [[1, 0.3, 62, 0.42], [-0.45, 1, 37, 0.24], [0.7, -0.7, 19, 0.12], [-0.9, -0.25, 9.5, 0.06]].map(([dx, dz, L, A]) => {
  const l = Math.hypot(dx, dz), k = TAU / L; return { dx: dx / l, dz: dz / l, k, w: Math.sqrt(9.8 * k), A };
});
function oceanHeight(x, z, t, amp) {
  let h = 0;
  for (const w of OCEAN_WAVES) h += w.A * amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t);
  return WATER_Y + h;
}

class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uCloudColor: { value: new THREE.Color() }, uFogColor: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: { value: 0 },
      uCloud: { value: 0.3 }, uRain: { value: 0 }, uFog: { value: 0 }, uFlash: { value: 0 }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = (projectionMatrix * modelViewMatrix * vec4(position, 1.0)).xyww; }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor, uMoonDir, uCloudColor, uFogColor;
        uniform float uNight, uTime, uCloud, uRain, uFog, uFlash; varying vec3 vDir; ${GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uTop, smoothstep(0.16, 0.8, h));
          if (h < 0.0) col = mix(uHorizon, uHorizon * 0.45, smoothstep(0.0, -0.3, h));
          float sd = max(dot(d, uSunDir), 0.0), sunVis = smoothstep(-0.12, 0.04, uSunDir.y), clear = (1.0 - uRain * 0.85) * (1.0 - uFog * 0.65);
          col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.8) * sunVis * clear;
          col += uSunColor * smoothstep(0.9992, 0.9997, sd) * 28.0 * sunVis * clear * step(0.0, h + 0.02);
          float md = dot(d, uMoonDir);
          col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.99965, md) * 4.5 * uNight * clear;
          if (h > 0.02) {
            float s = fract(sin(dot(floor(d * 380.0), vec3(12.9, 78.2, 45.1))) * 43758.5);
            col += step(0.9972, s) * (0.5 + 0.5 * sin(uTime * 2.2 + s * 40.0)) * uNight * clear * (1.0 - uCloud) * 1.6;
            vec2 uv = d.xz / (h + 0.1) * 1.1 + vec2(uTime * 0.004, uTime * 0.001);
            float n = fbm3(uv * 1.6), n2 = fbm3(uv * 3.7 + 4.0);
            float cover = mix(0.62, 0.18, uCloud);
            float a = smoothstep(cover, cover + 0.2, n * 0.75 + n2 * 0.25) * smoothstep(0.0, 0.16, h);
            vec3 cc = uCloudColor * (0.65 + 0.5 * pow(sd, 3.0)) + uSunColor * pow(sd, 10.0) * sunVis * clear;
            col = mix(col, cc, a * 0.9);
          }
          col = mix(col, uFogColor, clamp(uFog * smoothstep(0.4, 0.0, abs(h)) + uRain * 0.22 * smoothstep(0.25, 0.0, abs(h)), 0.0, 1.0));
          col += vec3(0.7, 0.78, 1.0) * uFlash * smoothstep(-0.05, 0.4, h);
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 20), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }
  update(camera, time) { this.mesh.position.copy(camera.position); this.uniforms.uTime.value = time; }
}

const TOD_KEYS = [
  { h: 0, top: '#02040e', mid: '#0a0b26', hor: '#2c1744', sun: '#000', sunI: 0, moonI: 0.35, amb: '#2a2c60', ambI: 0.55, gnd: '#140b1c', fog: '#1b1132', cloud: '#2c2444', exp: 1.25, sat: 1.15, tint: '#e8e2ff', neon: 1 },
  { h: 5.6, top: '#1d2c5c', mid: '#6b4b80', hor: '#ff9468', sun: '#ff8650', sunI: 0.4, moonI: 0.05, amb: '#6a5a8c', ambI: 0.62, gnd: '#3a2a2c', fog: '#c78a84', cloud: '#ff9a8c', exp: 1.12, sat: 1.15, tint: '#fff0ea', neon: 0.5 },
  { h: 7.2, top: '#3a6cba', mid: '#8eb2d8', hor: '#ffc68e', sun: '#ffbe7a', sunI: 2.1, moonI: 0, amb: '#93a6cc', ambI: 0.82, gnd: '#5a4a3c', fog: '#f0c9a2', cloud: '#ffe2c4', exp: 1.0, sat: 1.1, tint: '#fff4e6', neon: 0.05 },
  { h: 12, top: '#1d6ae8', mid: '#55a6f6', hor: '#b2dfff', sun: '#fff6e4', sunI: 3.4, moonI: 0, amb: '#a8ccf6', ambI: 0.95, gnd: '#6e6652', fog: '#bfe2ff', cloud: '#fff', exp: 0.92, sat: 1.1, tint: '#fff', neon: 0 },
  { h: 17.2, top: '#2a68d8', mid: '#72a8e8', hor: '#ffdeb4', sun: '#ffe0ac', sunI: 2.6, moonI: 0, amb: '#b0bcd8', ambI: 0.86, gnd: '#6e5e4a', fog: '#f1dcc0', cloud: '#fff2e2', exp: 0.96, sat: 1.12, tint: '#fff6ec', neon: 0.05 },
  { h: 18.7, top: '#2b1a70', mid: '#ba338c', hor: '#ff6e4e', sun: '#ff6648', sunI: 1.15, moonI: 0, amb: '#8c4c9c', ambI: 0.72, gnd: '#4a2a3a', fog: '#cc5a8c', cloud: '#ff6aa0', exp: 1.06, sat: 1.25, tint: '#ffe6f4', neon: 0.55 },
  { h: 19.7, top: '#150d42', mid: '#5c1f72', hor: '#c4407c', sun: '#ff485c', sunI: 0.15, moonI: 0.08, amb: '#5c3c8e', ambI: 0.6, gnd: '#2a1828', fog: '#6c2a6c', cloud: '#a43c7c', exp: 1.18, sat: 1.22, tint: '#f6e4ff', neon: 0.9 },
  { h: 21.2, top: '#05061c', mid: '#120f36', hor: '#3c1b54', sun: '#000', sunI: 0, moonI: 0.32, amb: '#30306a', ambI: 0.55, gnd: '#160c1e', fog: '#1f1338', cloud: '#2f294a', exp: 1.28, sat: 1.16, tint: '#ebe4ff', neon: 1 }
].map(k => ({ ...k, c: Object.fromEntries(['top', 'mid', 'hor', 'sun', 'amb', 'gnd', 'fog', 'cloud', 'tint'].map(n => [n, new THREE.Color(k[n])])) }));

class TimeOfDay {
  constructor() { this.hour = 18.4; this.speed = 1 / 90; this.paused = false; this.state = this.blank(); this.lastEnv = -99; }
  blank() {
    const o = { sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), lightDir: new THREE.Vector3() };
    for (const n of ['top', 'mid', 'hor', 'sun', 'amb', 'gnd', 'fog', 'cloud', 'tint']) o[n] = new THREE.Color();
    return o;
  }
  setHour(h) { this.hour = ((h % 24) + 24) % 24; this.lastEnv = -99; }
  timeString() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
  sample() {
    const h = this.hour, K = TOD_KEYS, S = this.state;
    let i = 0; while (i < K.length - 1 && K[i + 1].h <= h) i++;
    const a = K[i], b = K[(i + 1) % K.length];
    const span = ((b.h - a.h) + 24) % 24 || 24;
    const t = smoothstep(0, 1, (((h - a.h) + 24) % 24) / span);
    for (const key of ['top', 'mid', 'hor', 'sun', 'amb', 'gnd', 'fog', 'cloud', 'tint']) S[key].copy(a.c[key]).lerp(b.c[key], t);
    for (const key of ['sunI', 'moonI', 'ambI', 'exp', 'sat', 'neon']) S[key] = lerp(a[key], b[key], t);
    const th = (h - 6.2) / 13.2 * Math.PI;
    S.sunDir.set(Math.cos(th), Math.sin(th) * 0.92, Math.sin(th) * 0.35 + 0.1).normalize();
    const nt = ((h - 19.5 + 24) % 24) / 10.5;
    S.moonDir.set(nt <= 1 ? -Math.cos(nt * Math.PI) : 0.2, nt <= 1 ? Math.sin(nt * Math.PI) * 0.85 : -0.4, -0.25).normalize();
    S.night = S.neon; S.daylight = clamp(S.sunI / 3.2, 0, 1);
    S.lightDir.copy(S.sunDir.y > 0 ? S.sunDir : S.moonDir);
    return S;
  }
  update(dt) { if (!this.paused) this.hour = (this.hour + dt * this.speed) % 24; return this.sample(); }
}

class Rain {
  constructor(scene, count = 7000) {
    const pos = new Float32Array(count * 6), end = new Float32Array(count * 2), spd = new Float32Array(count * 2);
    this.box = new THREE.Vector3(80, 42, 80);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.box.x, y = Math.random() * this.box.y, z = Math.random() * this.box.z, s = rand(24, 34);
      for (let k = 0; k < 2; k++) { const j = i * 2 + k; pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z; end[j] = k; spd[j] = s; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: this.box }, uOpacity: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `attribute float aEnd; attribute float aSpeed; uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; varying float vA;
        void main(){ vec3 vel = vec3(2.5, -aSpeed, 1.2); vec3 p = mod(position + vel * uTime - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5; p -= normalize(vel) * 1.15 * aEnd; vA = 1.0 - aEnd * 0.75; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(0.75, 0.82, 0.95, uOpacity * vA); }`
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(dt, cam, amount) { this.mesh.visible = amount > 0.02; this.uniforms.uTime.value += dt; this.uniforms.uCam.value.copy(cam.position); this.uniforms.uOpacity.value = amount * 0.4; }
}

class Weather {
  constructor(scene) { this.mode = 'clear'; this.rain = 0; this.fog = 0; this.wet = 0; this.flash = 0; this.nextLightning = 9; this.rainFx = new Rain(scene); }
  set(mode) { this.mode = mode; }
  update(dt) {
    this.rain = damp(this.rain, this.mode === 'rain' ? 1 : 0, 0.55, dt);
    this.fog = damp(this.fog, this.mode === 'fog' ? 1 : 0, 0.45, dt);
    this.wet = damp(this.wet, this.mode === 'rain' ? 1 : 0, this.mode === 'rain' ? 0.2 : 0.05, dt);
    this.flash = Math.max(0, this.flash - dt * 3.5);
    if (this.rain > 0.55) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) { this.nextLightning = rand(8, 22); this.flash = 1; if (G.audio) G.audio.thunder(rand(0.5, 2.4), rand(0.5, 1)); }
    }
    this.rainFx.update(dt, G.camera, this.rain);
    if (G.audio) G.audio.setLoop('rain', this.rain * 0.2);
  }
}

class Ocean {
  constructor(scene) {
    this.amp = 1;
    const N = 160, R = 4800, a = 0.06;
    const verts = new Float32Array((N + 1) * (N + 1) * 3);
    const map = u => Math.sign(u) * R * (a * Math.abs(u) + (1 - a) * Math.pow(Math.abs(u), 3));
    let k = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { verts[k++] = map(i / N * 2 - 1); verts[k++] = 0; verts[k++] = map(j / N * 2 - 1); }
    const idx = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = j * (N + 1) + i; idx.push(p, p + N + 1, p + 1, p + 1, p + N + 1, p + N + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    this.step = R * a * 2 / N;
    const waves = OCEAN_WAVES.map(w => `h += wv(wp.xz, vec2(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}), ${w.k.toFixed(5)}, ${w.w.toFixed(5)}, ${(w.A).toFixed(3)} * uAmp, n);`).join('\n');
    this.uniforms = {
      uTime: { value: 0 }, uAmp: { value: 1 }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
      uFogColor: { value: new THREE.Color() }, uFogNear: { value: 400 }, uFogFar: { value: 2400 }, uLight: { value: 1 }, uRain: { value: 0 }, uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3() }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, toneMapped: false,
      vertexShader: `uniform float uTime; uniform float uAmp; uniform vec3 uCamPos; varying vec3 vW; varying vec3 vN; varying float vH; varying float vFog;
        float wv(vec2 p, vec2 dir, float k, float w, float A, inout vec3 n){ float c = cos(k * dot(dir, p) - w * uTime); n.xz -= dir * k * A * c; return A * sin(k * dot(dir, p) - w * uTime); }
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = vec3(0.0, 1.0, 0.0); float h = 0.0; ${waves}
          float fade = 1.0 - smoothstep(600.0, 2400.0, distance(wp.xz, uCamPos.xz)); h *= fade; n.xz *= fade; wp.y = -1.0 + h; vH = h; vW = wp.xyz; vN = normalize(n);
          vec4 mv = viewMatrix * wp; vFog = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform float uAmp; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uLight; uniform float uRain; uniform float uNight; uniform vec3 uMoonDir; varying vec3 vW; varying vec3 vN; varying float vH; varying float vFog; ${GLSL_NOISE}
        void main(){ vec3 V = normalize(uCamPos - vW); float dist = length(uCamPos - vW);
          vec2 q = vW.xz * 0.15; float n0 = vnoise(q + uTime * vec2(0.3, 0.18)); float nx = vnoise(q + vec2(0.5, 0.0) + uTime * vec2(0.3, 0.18)); float nz = vnoise(q + vec2(0.0, 0.5) + uTime * vec2(0.3, 0.18));
          vec3 N = normalize(vN + vec3(n0 - nx, 0.0, n0 - nz) * (0.45 + uRain * 0.4) * (1.0 - smoothstep(60.0, 500.0, dist)));
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N); R.y = abs(R.y);
          vec3 sky = mix(uSkyHor, uSkyTop, smoothstep(0.0, 0.5, R.y));
          float sd = max(dot(R, uSunDir), 0.0), sunUp = smoothstep(-0.04, 0.06, uSunDir.y);
          float spec = (pow(sd, 380.0) * 18.0 + pow(sd, 50.0) * 0.5) * sunUp * (1.0 - uRain * 0.8);
          spec += pow(max(dot(R, uMoonDir), 0.0), 260.0) * 5.0 * uNight;
          float depth = clamp(2.2 - vW.y * 0.0, 0.0, 1.0);
          vec3 body = mix(vec3(0.12, 0.55, 0.62), vec3(0.02, 0.12, 0.28), 0.65) * (0.25 + uLight);
          vec3 col = mix(body, sky, fres) + uSunColor * spec;
          float foam = smoothstep(0.55, 0.95, vH / max(uAmp * 0.8, 0.05)) * vnoise(vW.xz * 0.4 + uTime);
          col = mix(col, vec3(0.9, 0.95, 1.0) * (0.3 + uLight), foam * 0.5);
          float f = smoothstep(uFogNear, uFogFar, vFog);
          gl_FragColor = vec4(mix(col, uFogColor, f), mix(0.82, 1.0, f)); }`
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  heightAt(x, z) { return oceanHeight(x, z, this.uniforms.uTime.value, this.amp); }
  update(dt, cam) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uCamPos.value.copy(cam.position);
    const s = this.step;
    this.mesh.position.set(Math.round(cam.position.x / s) * s, 0, Math.round(cam.position.z / s) * s);
    this.amp = 1 + (G.weather ? G.weather.rain * 0.6 : 0);
    this.uniforms.uAmp.value = this.amp;
  }
}

class CloudLayer {
  constructor(scene) {
    this.uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 1) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec2 vP; ${GLSL_NOISE}
        void main(){ float n = fbm3(vP * 0.002 + vec2(uTime * 0.01, 0.0)); float a = smoothstep(0.42, 0.7, n); gl_FragColor = vec4(uColor, a * uOpacity); }`
    });
    this.meshes = [360, 560, 780].map((y, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.frustumCulled = false; m.visible = false; scene.add(m); return m;
    });
    this.opacity = 0; this.target = 0;
  }
  update(dt, cam, tod) {
    this.opacity = damp(this.opacity, Math.max(this.target, smoothstep(260, 430, cam.position.y) * 0.85), 2.5, dt);
    this.uniforms.uOpacity.value = this.opacity;
    this.uniforms.uTime.value += dt;
    this.uniforms.uColor.value.copy(tod.cloud).multiplyScalar(0.35 + tod.daylight * 0.8);
    for (const m of this.meshes) { m.visible = this.opacity > 0.02; m.position.x = cam.position.x; m.position.z = cam.position.z; }
  }
}

class LightRig {
  constructor(scene) {
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    this.shadowSize = 130;
    sc.left = sc.bottom = -this.shadowSize; sc.right = sc.top = this.shadowSize;
    sc.near = 10; sc.far = 1200;
    this.sun.shadow.bias = -0.00035; this.sun.shadow.normalBias = 0.4;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xa8ccf6, 0x6e6652, 0.9);
    scene.add(this.hemi);
    const spot = (color, angle, dist) => { const l = new THREE.SpotLight(color, 0, dist, angle, 0.45, 1.5); scene.add(l); scene.add(l.target); return l; };
    this.headL = spot(0xfff2dd, 0.52, 85);
    this.headR = spot(0xfff2dd, 0.52, 85);
    this.heli = [spot(0xf2f6ff, 0.2, 240), spot(0xf2f6ff, 0.2, 240)];
    this.muzzle = new THREE.PointLight(0xffc070, 0, 12, 2); scene.add(this.muzzle);
    this.booms = [0, 1].map(() => { const l = new THREE.PointLight(0xff7020, 0, 80, 1.6); scene.add(l); return l; });
    this.street = [0, 1, 2, 3, 4, 5].map(() => { const l = new THREE.PointLight(0xffc78a, 0, 22, 1.8); scene.add(l); return l; });
    this.muzzleT = 0; this.boomT = [0, 0]; this.boomIdx = 0;
  }
  flashMuzzle(p) { this.muzzle.position.copy(p); this.muzzleT = 0.045; }
  flashBoom(p, power = 1) { const i = this.boomIdx = 1 - this.boomIdx; this.booms[i].position.copy(p); this.boomT[i] = 0.85 * power; }
  update(dt, focus, tod, weather) {
    const isSun = tod.sunDir.y > 0;
    const vis = (isSun ? tod.sunI : tod.moonI * 0.7) * (1 - weather.rain * 0.7) * (1 - weather.fog * 0.5);
    this.sun.intensity = vis;
    if (isSun) this.sun.color.copy(tod.sun); else this.sun.color.setRGB(0.6, 0.68, 1);
    const texel = (this.shadowSize * 2) / 2048;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    const ld = tod.lightDir;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + ld.x * 500, focus.y + Math.max(0.1, ld.y) * 500, fz + ld.z * 500);
    this.sun.castShadow = vis > 0.04;
    this.hemi.color.copy(tod.amb); this.hemi.groundColor.copy(tod.gnd);
    this.hemi.intensity = tod.ambI * (1 - weather.rain * 0.3) + weather.flash * 1.4;
    this.muzzleT -= dt; this.muzzle.intensity = this.muzzleT > 0 ? 180 : 0;
    for (let i = 0; i < 2; i++) { this.boomT[i] = Math.max(0, this.boomT[i] - dt); this.booms[i].intensity = this.boomT[i] > 0 ? 7000 * this.boomT[i] * this.boomT[i] : 0; }
  }
}

class EnvProbe {
  constructor(renderer, skyMat) {
    this.renderer = renderer;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(1, 4000, this.cubeRT);
    this.scene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 24, 12), skyMat);
    sky.renderOrder = -1;
    this.scene.add(sky);
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, toneMapped: false });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1600, 24), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -30;
    this.scene.add(ground);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.rt = null;
  }
  update(groundColor) {
    this.groundMat.color.copy(groundColor);
    this.cubeCam.update(this.renderer, this.scene);
    this.rt = this.pmrem.fromCubemap(this.cubeRT.texture, this.rt);
    return this.rt.texture;
  }
}
