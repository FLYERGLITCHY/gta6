class Fx {
  constructor(scene) {
    this.scene = scene;
    this.max = 1800;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.extra = new Float32Array(this.max * 4);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.size = new Float32Array(this.max);
    this.drag = new Float32Array(this.max);
    this.alive = new Uint8Array(this.max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aExtra', new THREE.BufferAttribute(this.extra, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, vertexColors: true,
      uniforms: { uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec4 aExtra; varying vec4 vE; varying vec3 vC;
        void main(){ vE = aExtra; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aExtra.w * 900.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vE; varying vec3 vC;
        void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; float a = smoothstep(0.5, 0.05, d) * vE.x; gl_FragColor = vec4(vC, a); }`
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.shake = 0;
    this.flash = 0;
    this.decals = [];
    this.decalMesh = null;
  }
  emit(p, vel, color, life, size, grav = 0, drag = 0.5) {
    let i = this.cursor;
    for (let n = 0; n < 24 && this.alive[i]; n++) i = (i + 1) % this.max;
    this.cursor = (i + 1) % this.max;
    this.alive[i] = 1;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vel.x; this.vel[i * 3 + 1] = vel.y; this.vel[i * 3 + 2] = vel.z;
    const c = _col.set(color);
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(p, color, n, speed, life, size, grav = -4) {
    for (let i = 0; i < n; i++) {
      const v = _v1.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.3, speed));
      this.emit(p, v, color, life * rand(0.6, 1.2), size * rand(0.6, 1.3), grav, 1.2);
    }
  }
  smoke(p, dark, n = 2) { for (let i = 0; i < n; i++) this.emit(_v2.copy(p).add(_v3.set(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3))), _v1.set(rand(-0.4, 0.4), rand(1.2, 2.4), rand(-0.4, 0.4)), dark ? '#222' : '#ddd', rand(0.8, 1.6), dark ? rand(0.6, 1.2) : rand(0.3, 0.6), 0.2, 0.8); }
  sparks(p, dir, n = 12) { for (let i = 0; i < n; i++) { const v = _v1.copy(dir).add(_v3.set(rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6))).multiplyScalar(rand(4, 12)); this.emit(p, v, i % 3 ? '#ffd27a' : '#fff', rand(0.15, 0.4), 0.08, -12, 0.4); } }
  fire(p) { this.emit(p, _v1.set(rand(-0.3, 0.3), rand(1, 2.5), rand(-0.3, 0.3)), Math.random() < 0.5 ? '#ff6a1a' : '#ffd23a', rand(0.25, 0.5), rand(0.25, 0.5), 1, 1); }
  water(p, vel, n = 6) { for (let i = 0; i < n; i++) this.emit(p, _v1.copy(vel).add(_v3.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1))), '#d8fbff', rand(0.3, 0.7), rand(0.1, 0.25), -6, 1); }
  muzzle(p, dir) { this.emit(p, _v1.copy(dir).multiplyScalar(2), '#fff2c0', 0.05, 0.35, 0, 0); this.burst(p, '#ffb45a', 4, 3, 0.08, 0.12, 0); }
  explosion(p, power = 1) {
    this.burst(p, '#fff', 20, 10 * power, 0.35, 0.5 * power, -1);
    this.burst(p, '#ff7a20', 30, 7 * power, 0.6, 0.7 * power, -2);
    this.burst(p, '#222', 16, 4 * power, 1.4, 1.1 * power, 0.4);
    this.shake = Math.max(this.shake, 0.7 * power);
    this.flash = Math.max(this.flash, 0.65 * power);
    if (G.lights) G.lights.flashBoom(p, power);
    if (G.audio) G.audio.explosion(p, power);
  }
  tire(p, side) { this.emit(p, _v1.set(side * rand(0.5, 1.5), rand(0.2, 0.8), rand(-0.4, 0.4)), '#cccccc', 0.45, 0.28, 0.3, 1.5); }
  skid(a, b) {
    this.decals.push(a.x, a.y + 0.05, a.z, b.x, b.y + 0.05, b.z, 1);
    if (this.decals.length > 1800) this.decals.splice(0, 12);
  }
  rainSplash(x, y, z) { this.emit(_v1.set(x, y, z), _v2.set(rand(-0.4, 0.4), rand(0.6, 1.4), rand(-0.4, 0.4)), '#e8f4ff', 0.25, 0.08, -8, 0.2); }
  rebuildSkids() {
    if (!this.skidGeo) {
      this.skidGeo = new THREE.BufferGeometry();
      this.skidPos = new Float32Array(400 * 6);
      this.skidCol = new Float32Array(400 * 6);
      this.skidGeo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3));
      this.skidGeo.setAttribute('color', new THREE.BufferAttribute(this.skidCol, 3));
      this.skidMesh = new THREE.LineSegments(this.skidGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }));
      this.skidMesh.frustumCulled = false;
      this.scene.add(this.skidMesh);
    }
    const n = Math.min(400, this.decals.length / 7);
    const start = Math.max(0, this.decals.length / 7 - n);
    for (let i = 0; i < n; i++) {
      const d = this.decals;
      const k = (start + i) * 7;
      const fade = (i / n) * d[k + 6];
      for (let q = 0; q < 2; q++) {
        this.skidPos[(i * 2 + q) * 3] = d[k + q * 3];
        this.skidPos[(i * 2 + q) * 3 + 1] = d[k + q * 3 + 1];
        this.skidPos[(i * 2 + q) * 3 + 2] = d[k + q * 3 + 2];
        this.skidCol[(i * 2 + q) * 3] = this.skidCol[(i * 2 + q) * 3 + 1] = this.skidCol[(i * 2 + q) * 3 + 2] = fade * 0.15;
      }
    }
    this.skidGeo.setDrawRange(0, n * 2);
    this.skidGeo.attributes.position.needsUpdate = true;
    this.skidGeo.attributes.color.needsUpdate = true;
    for (let i = 6; i < this.decals.length; i += 7) this.decals[i] = Math.max(0, this.decals[i] - 0.0008);
  }
  update(dt, cam) {
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) { this.extra[i * 4] = 0; this.extra[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; this.extra[i * 4] = 0; continue; }
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const ground = G.world ? G.world.terrainH(this.pos[i * 3], this.pos[i * 3 + 2]) : -10;
      if (this.pos[i * 3 + 1] < ground + 0.05 && this.grav[i] < 0) { this.pos[i * 3 + 1] = ground + 0.05; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      const k = this.life[i] / this.maxLife[i];
      this.extra[i * 4] = k;
      this.extra[i * 4 + 3] = this.size[i] * (0.6 + (1 - k) * 0.8);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.aExtra.needsUpdate = true;
    if ((G.frame & 3) === 0) this.rebuildSkids();
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }
}
