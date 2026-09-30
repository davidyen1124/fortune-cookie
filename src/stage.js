import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

export const LAYER_CAST = 1; // objects that darken the table in the contact-shadow pass

/**
 * Seamless studio backdrop drawn behind everything: the paper sweep of a product shot,
 * a touch brighter where the key light falls and falling off gently toward the corners.
 */
export function createBackdrop(color) {
  const uniforms = {
    color: { value: new THREE.Color(color) },
    aspect: { value: 1 },
    time: { value: 0 },
    grain: { value: 0.012 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.99999, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float aspect;
      uniform float time;
      uniform float grain;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 p = (vUv - vec2(0.42, 0.62)) * vec2(aspect, 1.0);
        float d = length(p);
        float light = 1.035 - 0.16 * smoothstep(0.15, 1.25, d) - 0.05 * vUv.y;
        vec3 c = color * light;
        c += (hash(gl_FragCoord.xy + fract(time) * 91.7) - 0.5) * grain;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, uniforms };
}

/**
 * Soft contact shadow under whatever sits on the table: render the casters from below
 * the floor as "closeness to the ground", blur, and lay it on the floor (the same idea
 * as drei's <ContactShadows>). Tinted, so it reads as shadow on a coloured backdrop.
 */
export class ContactShadows {
  constructor(renderer, { size = 0.4, res = 512, far = 0.03, blur = 1.2, opacity = 0.9, color = 0x2a1a0c }) {
    this.renderer = renderer;
    this.blur = blur;
    this.size = size;
    const rt = (this.rt = new THREE.WebGLRenderTarget(res, res));
    this.rtBlur = new THREE.WebGLRenderTarget(res, res);
    rt.texture.generateMipmaps = this.rtBlur.texture.generateMipmaps = false;
    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, far);
    this.cam.position.set(0, -0.0003, 0);
    this.cam.rotation.x = Math.PI / 2;
    this.cam.layers.set(LAYER_CAST);
    this.depthMat = new THREE.MeshDepthMaterial();
    this.depthMat.depthTest = this.depthMat.depthWrite = false;
    this.depthMat.side = THREE.DoubleSide;
    this.depthMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'float a = pow(1.0 - fragCoordZ, 3.0); gl_FragColor = vec4(vec3(0.0), a);'
      );
    };
    this.hBlur = new THREE.ShaderMaterial({ ...HorizontalBlurShader, depthTest: false });
    this.vBlur = new THREE.ShaderMaterial({ ...VerticalBlurShader, depthTest: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    const mat = (this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: rt.texture }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying vec2 vUv;
        void main(){ float a = texture2D(map, vUv).a; gl_FragColor = vec4(color, a * opacity); }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    const plane = (this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2), mat));
    plane.scale.y = -1;
    plane.position.set(0, 0.00005, 0);
    plane.renderOrder = 2;
  }

  #blurPass(amount) {
    const r = this.renderer;
    this.quad.material = this.hBlur;
    this.hBlur.uniforms.tDiffuse.value = this.rt.texture;
    this.hBlur.uniforms.h.value = amount / 256;
    r.setRenderTarget(this.rtBlur);
    r.render(this.quadScene, this.quadCam);
    this.quad.material = this.vBlur;
    this.vBlur.uniforms.tDiffuse.value = this.rtBlur.texture;
    this.vBlur.uniforms.v.value = amount / 256;
    r.setRenderTarget(this.rt);
    r.render(this.quadScene, this.quadCam);
  }

  update(scene) {
    const r = this.renderer;
    const prevOverride = scene.overrideMaterial, prevRT = r.getRenderTarget();
    const prevClear = r.getClearAlpha(), prevColor = r.getClearColor(new THREE.Color());
    const prevAuto = r.autoClear;
    r.autoClear = true;
    scene.overrideMaterial = this.depthMat;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, this.cam);
    scene.overrideMaterial = prevOverride;
    this.#blurPass(this.blur);
    this.#blurPass(this.blur * 0.5);
    r.setRenderTarget(prevRT);
    r.setClearColor(prevColor, prevClear);
    r.autoClear = prevAuto;
  }
}

/**
 * Shadow catcher for the key light's soft shadow, tinted like the contact shadow and faded
 * out with distance from the cookie so the plane never shows an edge.
 */
export function shadowCatcher(size = 1.2, opacity = 0.32, color = 0x3a2a1c, fade = [0.1, 0.24]) {
  const m = new THREE.ShadowMaterial({ opacity, color, transparent: true, depthWrite: false });
  const center = { value: new THREE.Vector2() };
  m.onBeforeCompile = (s) => {
    s.uniforms.center = center;
    s.vertexShader = 'varying vec3 vWP;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'varying vec3 vWP;\nuniform vec2 center;\n' + s.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      `float fade = 1.0 - smoothstep(${fade[0].toFixed(3)}, ${fade[1].toFixed(3)}, length(vWP.xz - center));
      gl_FragColor = vec4( color, opacity * fade * ( 1.0 - getShadowMask() ) );`);
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), m);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.userData.center = center.value;
  return mesh;
}

/**
 * Shallow depth of field for the moment the slip is up close: the table behind it (the
 * halves, the crumbs) goes soft, as it would through a macro lens focused on the paper.
 * The scene is drawn as usual, copied, blurred at half size and put back, then the slip
 * is drawn sharp on top. Works on the display-ready image, so no change to tone mapping.
 */
export class FocusBlur {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    this.copy = null;
    const rt = () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.a = rt(); this.b = rt();
    const vert = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.blur = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(src, vUv) * 0.2270270270;
          c += (texture2D(src, vUv + dir * 1.3846153846) + texture2D(src, vUv - dir * 1.3846153846)) * 0.3162162162;
          c += (texture2D(src, vUv + dir * 3.2307692308) + texture2D(src, vUv - dir * 3.2307692308)) * 0.0702702703;
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.out = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, sharp: { value: null }, amount: { value: 0 } },
      vertexShader: vert,
      fragmentShader: /* glsl */ `
        uniform sampler2D src; uniform sampler2D sharp; uniform float amount; varying vec2 vUv;
        void main() { gl_FragColor = mix(texture2D(sharp, vUv), texture2D(src, vUv), amount); }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo, this.blur);
    this.quad.frustumCulled = false;
    this.qScene = new THREE.Scene();
    this.qScene.add(this.quad);
    this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  #resize() {
    const r = this.renderer;
    r.getDrawingBufferSize(this.size);
    const w = this.size.x, h = this.size.y;
    if (this.copy && this.copy.image.width === w && this.copy.image.height === h) return;
    this.copy?.dispose();
    this.copy = new THREE.FramebufferTexture(w, h);
    this.a.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }

  /** blur what is on screen right now by `amount` (0..1); radius in drawing-buffer pixels */
  apply(amount, radius = 7) {
    const r = this.renderer;
    this.#resize();
    r.copyFramebufferToTexture(this.copy);
    const prevAuto = r.autoClear;
    r.autoClear = false;
    let src = this.copy;
    const w = this.a.width, h = this.a.height;
    this.quad.material = this.blur;
    for (let i = 0; i < 2; i++) {
      const s = (radius / 2) * (i ? 0.55 : 1);
      this.blur.uniforms.src.value = src;
      this.blur.uniforms.dir.value.set(s / w, 0);
      r.setRenderTarget(this.a); r.render(this.qScene, this.qCam);
      this.blur.uniforms.src.value = this.a.texture;
      this.blur.uniforms.dir.value.set(0, s / h);
      r.setRenderTarget(this.b); r.render(this.qScene, this.qCam);
      src = this.b.texture;
    }
    r.setRenderTarget(null);
    this.quad.material = this.out;
    this.out.uniforms.src.value = this.b.texture;
    this.out.uniforms.sharp.value = this.copy;
    this.out.uniforms.amount.value = amount;
    r.render(this.qScene, this.qCam);
    r.autoClear = prevAuto;
  }
}
