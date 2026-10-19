const FS_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

class PostPipeline {
  constructor(renderer) {
    this.r = renderer;
    this.scale = 1;
    this.minScale = 0.55;
    this.maxScale = 1;
    this.frameTimes = [];
    this.adaptTimer = 0;
    const canFloat = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const type = canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdr = canFloat;
    const samples = Math.min(4, renderer.capabilities.maxSamples || 0);
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type, samples, depthBuffer: true, stencilBuffer: false });
    this.mips = [];
    this.ups = [];
    for (let i = 0; i < 5; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
    for (let i = 0; i < 4; i++) this.ups.push(new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: false }));
    for (const rt of [...this.mips, ...this.ups]) { rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false; }
    this.qscene = new THREE.Scene();
    this.qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qscene.add(this.quad);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.brightMat = mk(`
      uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float knee; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tSrc, vUv + texel * vec2(-0.5,-0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5,-0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(-0.5,0.5)).rgb + texture2D(tSrc, vUv + texel * vec2(0.5,0.5)).rgb;
        c = min(c * 0.25, vec3(60.0));
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 1e-4);
        float contrib = max(soft, br - threshold) / max(br, 1e-4);
        gl_FragColor = vec4(c * contrib, 1.0);
      }`, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.05 }, knee: { value: 0.55 } });
    this.downMat = mk(`
      uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
      void main(){
        vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
        s += texture2D(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0,-1.0)).rgb;
        s += texture2D(tSrc, vUv + texel * vec2(-1.0,1.0)).rgb + texture2D(tSrc, vUv + texel * vec2(1.0,1.0)).rgb;
        gl_FragColor = vec4(s / 8.0, 1.0);
      }`, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    this.upMat = mk(`
      uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 texel; varying vec2 vUv;
      void main(){
        vec2 o = texel;
        vec3 s = texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
        s += texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb * 2.0 + texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv + vec2(o.x, 0.0)).rgb * 2.0;
        s += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y)).rgb * 2.0 + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(s / 16.0 + texture2D(tAdd, vUv).rgb, 1.0);
      }`, { tSrc: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() } });
    this.compMat = mk(`
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform float bloomStrength; uniform float exposure; uniform float saturation; uniform float contrast;
      uniform vec3 tint; uniform float vignette; uniform float time; uniform float grain; uniform float aberration; uniform float gray; uniform float lift; uniform vec3 shadowTint; uniform float flash;
      varying vec2 vUv;
      vec3 fit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 color){
        const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
        const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
        color = IM * color; color = fit(color); return clamp(OM * color, 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        vec3 col = aberration > 0.0 ? vec3(texture2D(tScene, vUv + d * aberration * 0.012).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - d * aberration * 0.012).b) : texture2D(tScene, vUv).rgb;
        col += texture2D(tBloom, vUv).rgb * bloomStrength;
        col *= exposure / 0.6;
        col = aces(col);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, saturation);
        col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
        col = mix(col * shadowTint, col, smoothstep(0.0, 0.45, l));
        col = col * tint + lift;
        float vig = smoothstep(0.95, 0.28, length(d * vec2(1.0, 0.85)) * 1.25);
        col *= mix(1.0, vig, vignette);
        col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(1.0, 0.97, 0.94), gray);
        col = mix(col, vec3(1.0), flash);
        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (h12(vUv * 900.0 + time) - 0.5) * grain;
        gl_FragColor = vec4(col, 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null }, bloomStrength: { value: 0.85 }, exposure: { value: 1.0 }, saturation: { value: 1.12 }, contrast: { value: 1.05 },
      tint: { value: new THREE.Color(1, 1, 1) }, vignette: { value: 0.5 }, time: { value: 0 }, grain: { value: 0.02 }, aberration: { value: 0 }, gray: { value: 0 },
      lift: { value: 0 }, shadowTint: { value: new THREE.Color(1, 1, 1) }, flash: { value: 0 }
    });
    this.grade = this.compMat.uniforms;
    this.w = 4; this.h = 4;
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    const sw = Math.max(4, Math.floor(w * this.scale)), sh = Math.max(4, Math.floor(h * this.scale));
    this.sceneRT.setSize(sw, sh);
    let mw = Math.max(2, sw >> 1), mh = Math.max(2, sh >> 1);
    for (let i = 0; i < 5; i++) {
      this.mips[i].setSize(mw, mh);
      if (i < 4) this.ups[i].setSize(mw, mh);
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    }
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qscene, this.qcam); }
  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const b = this.brightMat.uniforms;
    b.tSrc.value = this.sceneRT.texture;
    b.texel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    this.pass(this.brightMat, this.mips[0]);
    for (let i = 1; i < 5; i++) {
      const u = this.downMat.uniforms;
      u.tSrc.value = this.mips[i - 1].texture;
      u.texel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this.pass(this.downMat, this.mips[i]);
    }
    let src = this.mips[4];
    for (let i = 3; i >= 0; i--) {
      const u = this.upMat.uniforms;
      u.tSrc.value = src.texture;
      u.tAdd.value = this.mips[i].texture;
      u.texel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.upMat, this.ups[i]);
      src = this.ups[i];
    }
    const c = this.compMat.uniforms;
    c.tScene.value = this.sceneRT.texture;
    c.tBloom.value = this.ups[0].texture;
    c.time.value = (performance.now() * 0.001) % 100;
    this.pass(this.compMat, null);
  }
  adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 45) this.frameTimes.shift();
    this.adaptTimer += dt;
    if (this.adaptTimer < 1.4 || this.frameTimes.length < 20) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    let changed = false;
    if (avg > 1 / 48 && this.scale > this.minScale) { this.scale = Math.max(this.minScale, +(this.scale - 0.1).toFixed(2)); changed = true; }
    else if (avg < 1 / 58 && this.scale < this.maxScale) { this.scale = Math.min(this.maxScale, +(this.scale + 0.05).toFixed(2)); changed = true; }
    if (changed) { this.adaptTimer = 0; this.setSize(this.w, this.h); }
    else this.adaptTimer = 0.9;
  }
}
