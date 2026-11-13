// Tiny Earth (working title) – revision 1.3 (art pass: lighting, shadows, strata board, water depth, forests)
// A living Earth on your real table, played with your hands. Fresh code written in the competition window (Nov 2026).
// Characters: Dino (land/volcano zone), Sea Turtle (ocean zone), Jet (sky zone).
import * as THREE from 'three';
import { audio, sfx, setMuted, isMuted } from './audio.js?v=1.3';
import { Card, Button, Panel, GhostHand } from './ui.js?v=1.3';

const VERSION = '1.3';

// =====================================================================
// Renderer / scene
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
const QS = new URLSearchParams(location.search);
const LOWFX = QS.has('lowfx'); // performance fallback: no real-time shadows
const SHOW_FPS = QS.has('fps'); // add ?fps to the URL to see frame rate in the HUD
let fpsN = 0, fpsT = 0, fpsVal = 0;
renderer.shadowMap.enabled = !LOWFX;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xcfe8ff);
scene.background = SKY;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);

scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6b5638, 1.15));

// =====================================================================
// The board — everything inside is in board-local meters (board radius 28 cm)
// =====================================================================
const board = new THREE.Group();
board.position.set(0, 0.74, -0.45);
scene.add(board);
// warm key light lives inside the board so its soft shadows follow the board wherever it is placed
const sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
sun.position.set(0.32, 0.62, 0.38);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -0.33, right: 0.33, top: 0.33, bottom: -0.33, near: 0.2, far: 1.4 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.0015; sun.shadow.radius = 3;
board.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xbfdcff, 0.45); fill.position.set(-0.5, 0.35, -0.3); board.add(fill, fill.target);
const shadowAll = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

const R = 0.28;
const g = (d, s) => Math.exp(-(d * d) / (2 * s * s));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dist = (x, z, cx, cz) => Math.hypot(x - cx, z - cz);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// tiny value-noise for baked colour variation (deterministic)
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const fbm2 = (x, z) => 0.5 * vnoise(x, z) + 0.25 * vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) + 0.125 * vnoise(x * 4.3 + 9.1, z * 4.3 + 7.7);

const MOUNT = [-0.075, -0.07];
const VOLC = [0.1, -0.05];
const LAKE = [-0.075, 0.06];
const LAVA = [0.095, 0.085];
const LAVA_R = 0.045;
const START = [-0.02, 0.15];
const GOAL = [0.152, 0.09];
const TRACK_R = 0.197;

function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const island = sstep(0.255, 0.2, r);
  const dm = dist(x, z, MOUNT[0], MOUNT[1]);
  const dv = dist(x, z, VOLC[0], VOLC[1]);
  const dl = dist(x, z, LAKE[0], LAKE[1]);
  const dz = dist(x, z, LAVA[0], LAVA[1]);
  const mount = 0.118 * g(dm, 0.048) + 0.02 * g(dist(x, z, -0.02, -0.11), 0.03);
  const volc = 0.072 * g(dv, 0.045) - 0.03 * g(dv, 0.013);
  const lake = -0.034 * g(dl, 0.034);
  const lavaPit = -0.012 * sstep(LAVA_R + 0.01, LAVA_R - 0.01, dz);
  const hills = 0.004 * Math.sin(x * 47 + 1.3) * Math.cos(z * 39) + 0.002 * Math.sin(x * 120) * Math.sin(z * 110);
  return island * (0.013 + mount + volc + lake + lavaPit + hills) + (1 - island) * -0.016;
}
let lavaRise = 0;
const lavaLevel = () => 0.006 + lavaRise;

// ---------- terrain ----------
const terrain = (() => {
  const rings = 110, segs = 200;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const C = {
    sand: new THREE.Color(0xf4dca4), wetSand: new THREE.Color(0xc9a46a), grass: new THREE.Color(0x6ccf4f), grass2: new THREE.Color(0x2f8f3c),
    meadow: new THREE.Color(0xa6e25a), rock: new THREE.Color(0x9a8f80), rock2: new THREE.Color(0x6d6358), snow: new THREE.Color(0xfbfdff),
    basalt: new THREE.Color(0x352a27), seabed: new THREE.Color(0x1f86b0), reef: new THREE.Color(0x3fc7b5), scorched: new THREE.Color(0x4a2216),
    flowers: [new THREE.Color(0xffd84d), new THREE.Color(0xff7fb6), new THREE.Color(0xffffff)]
  };
  const tmp = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const rr = (i / rings) * (R - 0.004);
    const n = i === 0 ? 1 : segs;
    for (let j = 0; j < n; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const h = heightAt(x, z);
      pos.push(x, h, z);
      const e = 0.002;
      const slope = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const dv = dist(x, z, VOLC[0], VOLC[1]), dm = dist(x, z, MOUNT[0], MOUNT[1]), dz = dist(x, z, LAVA[0], LAVA[1]);
      const nz = fbm2(x * 60, z * 60), nz2 = fbm2(x * 180 + 3, z * 180 - 7);
      if (h < 0) {
        c.copy(C.seabed).lerp(C.reef, sstep(-0.01, -0.002, h) * (0.5 + nz * 0.6)).lerp(C.wetSand, sstep(-0.004, 0, h));
      } else if (h < 0.0028) c.copy(C.wetSand).lerp(C.sand, sstep(0.0004, 0.0024, h + nz2 * 0.0008));
      else {
        // grass: two tones broken up by noise, lighter meadow on gentle highs, darker in hollows
        c.copy(C.grass).lerp(C.grass2, sstep(0.35, 0.75, nz));
        c.lerp(C.meadow, sstep(0.55, 0.85, nz2) * 0.35);
        if (h < 0.006) c.lerp(C.sand, sstep(0.006, 0.0028, h));
        if (dist(x, z, START[0], START[1]) < 0.055 && nz2 > 0.72) c.copy(C.flowers[Math.floor(hash2(x * 900, z * 900) * 3)]);
        // rock on steep faces with banded strata on the mountain
        if (slope > 0.75) {
          tmp.copy(C.rock).lerp(C.rock2, sstep(0.3, 0.7, 0.5 + 0.5 * Math.sin(h * 320 + nz * 3)));
          c.lerp(tmp, Math.min(1, (slope - 0.75) * 1.2));
        }
        if (dv < 0.065) c.lerp(C.basalt, sstep(0.065, 0.028, dv) * (0.75 + nz * 0.4));
        if (dz < LAVA_R + 0.022) c.lerp(C.scorched, sstep(LAVA_R + 0.022, LAVA_R, dz));
        if (h > 0.112 && dm < 0.05) c.lerp(C.snow, sstep(0.112, 0.126, h + nz2 * 0.006));
      }
      c.multiplyScalar(0.9 + nz2 * 0.2);
      const ao = 1 - Math.min(0.25, slope * 0.08); // baked "ambient occlusion"
      col.push(c.r * ao, c.g * ao, c.b * ao);
    }
  }
  const ringStart = i => (i === 0 ? 0 : 1 + (i - 1) * segs);
  for (let j = 0; j < segs; j++) idx.push(0, ringStart(1) + ((j + 1) % segs), ringStart(1) + j);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = ringStart(i) + j, b = ringStart(i) + ((j + 1) % segs), c2 = ringStart(i + 1) + j, d = ringStart(i + 1) + ((j + 1) % segs);
    idx.push(a, b, c2, b, d, c2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
})();
board.add(terrain);

// ---------- the board is a cut-away slice of the planet: soil, rock strata, glowing mantle ----------
const STRATA_TOP = -0.0178, STRATA_H = 0.062;
const strata = (() => {
  const geo = new THREE.CylinderGeometry(R + 0.004, R - 0.03, STRATA_H, 160, 28, false);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const bands = [[0.0, 0x6b4a2e], [0.1, 0x9a6a3c], [0.22, 0xd2a86e], [0.34, 0xa39383], [0.46, 0xe0bf8a], [0.58, 0x8a7d72], [0.7, 0x6a5a52], [0.82, 0x4e3a33], [0.92, 0x7a2a10]];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    let d = (STRATA_H / 2 - y) / STRATA_H; // 0 top .. 1 bottom
    d += (vnoise(a * 6 + 2, d * 3) - 0.5) * 0.08 + Math.sin(a * 3 + 1) * 0.02; // wavy, tilted layers
    let k = 0; while (k + 1 < bands.length && d > bands[k + 1][0]) k++;
    c.set(bands[k][1]);
    const grain = 0.82 + vnoise(a * 90, y * 900) * 0.3; c.multiplyScalar(grain);
    if (Math.abs(y - STRATA_H / 2) < 1e-6) c.set(0x1a6f96); // top cap sits under the sea floor
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.position.y = STRATA_TOP - STRATA_H / 2; m.receiveShadow = true;
  return m;
})();
board.add(strata);
const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.003, 8, 160), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }));
rim.rotation.x = Math.PI / 2; rim.position.y = STRATA_TOP + 0.001; board.add(rim); // soil lip around the sea

// ---------- shaders ----------
const uTime = { value: 0 };
const NOISE_GLSL = `
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int k=0;k<4;k++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }`;
// depth map baked from the terrain so the sea shows turquoise shallows, deep blue and animated shore foam
const depthTex = (() => {
  const N = 192, data = new Uint8Array(N * N * 4);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const x = ((u + 0.5) / N - 0.5) * 2 * R, z = -((v + 0.5) / N - 0.5) * 2 * R; // circle lies in XY, rotated -90° about X
    const d = Math.min(1, Math.max(0, -heightAt(x, z) / 0.03));
    const i = (v * N + u) * 4; data[i] = d * 255; data[i + 1] = heightAt(x, z) > 0 ? 255 : 0; data[i + 2] = 0; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.002, 128), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { uTime, uDepth: { value: depthTex }, uR: { value: R } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; uniform sampler2D uDepth; uniform float uR; varying vec2 vP; ${NOISE_GLSL}
    void main(){
      vec2 uv = vP/(2.*uR) + .5;
      vec4 dm = texture2D(uDepth, uv);
      float depth = dm.r, land = dm.g;
      float n = fbm(vP*90. + vec2(uTime*.25, -uTime*.18));
      float n2 = fbm(vP*220. - vec2(uTime*.4, uTime*.3));
      vec3 shallow = vec3(.36,.93,.86), mid = vec3(.08,.62,.82), deep = vec3(.02,.28,.6);
      vec3 c = mix(shallow, mid, smoothstep(.05,.35,depth));
      c = mix(c, deep, smoothstep(.35,.95,depth));
      c *= .9 + n*.25;
      // caustic sparkle in the shallows, glints everywhere
      float caus = smoothstep(.6,.9, n2) * (1.-smoothstep(.1,.45,depth));
      float sp = smoothstep(.94,1., sin(vP.x*170.+n*9.+uTime*1.6)*sin(vP.y*150.-n*7.-uTime*1.2));
      c += caus*.25 + sp*.35;
      // breaking foam where water meets land (two moving bands)
      float shore = 1. - smoothstep(0., .14, depth + land*.0);
      float wave = .5 + .5*sin(depth*60. - uTime*2.2 + n*6.);
      float foam = shore * smoothstep(.55,.95, wave*.7 + n2*.5);
      foam = max(foam, smoothstep(.06,.0,depth) * .9);
      c = mix(c, vec3(1.), clamp(foam,0.,1.)*.85);
      float alpha = mix(.55, .92, smoothstep(.0,.5,depth));
      gl_FragColor = vec4(c, max(alpha, foam*.9));
    }`
}));
water.rotation.x = -Math.PI / 2; board.add(water);

const lavaMat = new THREE.ShaderMaterial({
  uniforms: { uTime, uHeat: { value: 0 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; uniform float uHeat; varying vec2 vP; ${NOISE_GLSL}
    void main(){
      vec2 p = vP*140.;
      vec2 q = vec2(fbm(p+uTime*.15), fbm(p-vec2(uTime*.12,4.1)));
      float f = fbm(p + 2.5*q + uTime*.1);
      vec3 c = mix(vec3(.35,.03,.0), vec3(1.,.42,.03), smoothstep(.35,.7,f));
      c = mix(c, vec3(1.,.9,.45), smoothstep(.68,.85,f));
      gl_FragColor = vec4(c*(1.+uHeat*.7),1.);
    }`
});
// glowing mantle band at the bottom of the planet slice
const mantle = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.022, R - 0.031, 0.008, 160, 1, true), new THREE.ShaderMaterial({
  uniforms: { uTime },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; varying vec3 vP; ${NOISE_GLSL}
    void main(){
      float a = atan(vP.z, vP.x);
      float f = fbm(vec2(a*14. + uTime*.2, vP.y*400. - uTime*.5));
      vec3 c = mix(vec3(.55,.06,.0), vec3(1.,.5,.05), smoothstep(.3,.75,f));
      c = mix(c, vec3(1.,.92,.55), smoothstep(.72,.9,f));
      gl_FragColor = vec4(c,1.);
    }`
}));
mantle.position.y = STRATA_TOP - STRATA_H + 0.0035; board.add(mantle);
const lavaPool = new THREE.Mesh(new THREE.CircleGeometry(LAVA_R + 0.004, 64), lavaMat);
lavaPool.rotation.x = -Math.PI / 2; lavaPool.position.set(LAVA[0], lavaLevel(), LAVA[1]); board.add(lavaPool);
const crater = new THREE.Mesh(new THREE.CircleGeometry(0.011, 32), lavaMat);
crater.rotation.x = -Math.PI / 2; crater.position.set(VOLC[0], heightAt(VOLC[0], VOLC[1]) + 0.004, VOLC[1]); board.add(crater);
const craterLight = new THREE.PointLight(0xff6a1a, 0.25, 0.09, 2);
craterLight.position.set(VOLC[0], heightAt(VOLC[0], VOLC[1]) + 0.03, VOLC[1]); board.add(craterLight);

const wfTop = new THREE.Vector3(-0.072, heightAt(-0.072, 0.012) + 0.002, 0.012);
const wfBot = new THREE.Vector3(-0.072, 0.0, 0.04);
const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(0.016, wfTop.distanceTo(wfBot), 1, 8), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    void main(){
      float s = sin(vUv.y*60. + uTime*14. + sin(vUv.x*20.)*2.);
      vec3 c = mix(vec3(.55,.85,1.), vec3(1.), smoothstep(.3,1.,s));
      gl_FragColor = vec4(c, .85*smoothstep(0.,.25,vUv.x)*smoothstep(1.,.75,vUv.x));
    }`
}));
waterfall.position.copy(wfTop).add(wfBot).multiplyScalar(0.5);
waterfall.rotation.set(-Math.atan2(wfBot.z - wfTop.z, wfTop.y - wfBot.y), 0, 0);
board.add(waterfall);

// ---------- forests, rocks, grass tufts (all built from code, instanced for Quest) ----------
{
  const rng = mulberry(7);
  const N = 120;
  const trunkGeo = new THREE.CylinderGeometry(0.0011, 0.0017, 0.009, 6);
  const pineGeo = (() => { // two stacked cones merged into one geometry
    const g1 = new THREE.ConeGeometry(0.0072, 0.013, 7); g1.translate(0, 0.0125, 0);
    const g2 = new THREE.ConeGeometry(0.0054, 0.011, 7); g2.translate(0, 0.0195, 0);
    const pos = [...g1.toNonIndexed().attributes.position.array, ...g2.toNonIndexed().attributes.position.array];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  })();
  const puffGeo = new THREE.IcosahedronGeometry(0.0078, 1); puffGeo.translate(0, 0.0145, 0);
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4423 }), N);
  const pines = new THREE.InstancedMesh(pineGeo, leafMat, N);
  const puffs = new THREE.InstancedMesh(puffGeo, leafMat.clone(), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  let k = 0, kp = 0, kb = 0;
  for (let tries = 0; tries < 6000 && k < N; tries++) {
    const x = (rng() * 2 - 1) * 0.22, z = (rng() * 2 - 1) * 0.22;
    const h = heightAt(x, z), r = Math.hypot(x, z);
    if (h < 0.008 || h > 0.075 || r > 0.19) continue;
    if (dist(x, z, VOLC[0], VOLC[1]) < 0.07 || dist(x, z, LAVA[0], LAVA[1]) < LAVA_R + 0.02) continue;
    if (dist(x, z, START[0], START[1]) < 0.04 || dist(x, z, -0.02, -0.04) < 0.035 || dist(x, z, GOAL[0], GOAL[1]) < 0.03) continue;
    if (Math.abs(Math.hypot(x, z) - TRACK_R) < 0.012) continue; // keep the rails clear
    if (fbm2(x * 40, z * 40) < 0.38) continue; // clustered groves instead of an even sprinkle
    const s = 0.7 + rng() * 0.7, pine = h > 0.035 || rng() < 0.45;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    m.compose(new THREE.Vector3(x, h + 0.0035 * s, z), q, new THREE.Vector3(s, s, s)); trunks.setMatrixAt(k, m);
    m.compose(new THREE.Vector3(x, h - 0.002 * s, z), q, new THREE.Vector3(s, s * (0.9 + rng() * 0.3), s));
    if (pine) { pines.setMatrixAt(kp, m); pines.setColorAt(kp++, col.setHSL(0.36 + rng() * 0.04, 0.55, 0.22 + rng() * 0.08)); }
    else { puffs.setMatrixAt(kb, m); puffs.setColorAt(kb++, col.setHSL(0.24 + rng() * 0.08, 0.6, 0.38 + rng() * 0.1)); }
    k++;
  }
  trunks.count = k; pines.count = kp; puffs.count = kb;
  [trunks, pines, puffs].forEach(o => { o.castShadow = true; o.receiveShadow = true; board.add(o); });

  // scattered boulders and pebbles
  const rockGeo = new THREE.DodecahedronGeometry(0.004, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 60);
  let kr = 0;
  for (let tries = 0; tries < 3000 && kr < 60; tries++) {
    const x = (rng() * 2 - 1) * 0.23, z = (rng() * 2 - 1) * 0.23, h = heightAt(x, z);
    if (h < 0.001 || Math.hypot(x, z) > 0.215 || dist(x, z, LAVA[0], LAVA[1]) < LAVA_R + 0.005) continue;
    if (Math.abs(Math.hypot(x, z) - TRACK_R) < 0.01 || dist(x, z, START[0], START[1]) < 0.03) continue;
    const s = 0.4 + rng() * 1.1;
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    m.compose(new THREE.Vector3(x, h + 0.0015 * s, z), q, new THREE.Vector3(s, s * 0.7, s)); rocks.setMatrixAt(kr, m);
    rocks.setColorAt(kr++, col.setHSL(0.08, 0.08, 0.4 + rng() * 0.2));
  }
  rocks.count = kr; rocks.castShadow = rocks.receiveShadow = true; board.add(rocks);

  // grass tufts (three crossed blades)
  const tuftGeo = new THREE.ConeGeometry(0.0016, 0.006, 3); tuftGeo.translate(0, 0.003, 0);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshLambertMaterial(), 220);
  let kt = 0;
  for (let tries = 0; tries < 4000 && kt < 220; tries++) {
    const x = (rng() * 2 - 1) * 0.21, z = (rng() * 2 - 1) * 0.21, h = heightAt(x, z);
    if (h < 0.004 || h > 0.05 || dist(x, z, VOLC[0], VOLC[1]) < 0.065 || dist(x, z, LAVA[0], LAVA[1]) < LAVA_R + 0.015) continue;
    if (Math.abs(Math.hypot(x, z) - TRACK_R) < 0.008) continue;
    const s = 0.6 + rng() * 0.8;
    q.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.4));
    m.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(s, s, s)); tufts.setMatrixAt(kt, m);
    tufts.setColorAt(kt++, col.setHSL(0.27 + rng() * 0.05, 0.6, 0.35 + rng() * 0.15));
  }
  tufts.count = kt; tufts.userData.noShadow = true; board.add(tufts);
}

// ---------- lava stepping stones + goal flag ----------
const stones = [];
{
  const geo = new THREE.CylinderGeometry(0.0075, 0.009, 0.01, 9);
  const mat = new THREE.MeshLambertMaterial({ color: 0x6e6660 });
  [[0.062, 0.088], [0.08, 0.074], [0.098, 0.094], [0.116, 0.078], [0.133, 0.092]].forEach(([x, z], i) => {
    const s = new THREE.Mesh(geo, mat);
    s.position.set(x, lavaLevel() + 0.003, z);
    s.userData = { phase: i * 1.7, sinks: i === 1 || i === 3 };
    board.add(s); stones.push(s);
  });
}
const flag = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.035, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  pole.position.y = 0.0175; flag.add(pole);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.011), new THREE.MeshLambertMaterial({ color: 0xff2d6f, side: THREE.DoubleSide }));
  cloth.position.set(0.008, 0.029, 0); flag.add(cloth); flag.userData.cloth = cloth;
  flag.position.set(GOAL[0], heightAt(GOAL[0], GOAL[1]), GOAL[1]); board.add(flag);
}

// ---------- boulder → dominoes → log → lake bell ----------
const boulderR = 0.009;
const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(boulderR, 1), new THREE.MeshLambertMaterial({ color: 0x9a8f86, flatShading: true }));
const boulderPath = [[-0.02, -0.112], [-0.012, -0.085], [-0.016, -0.055], [-0.02, -0.03]].map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + boulderR, z));
boulder.position.copy(boulderPath[0]); board.add(boulder);
// a little landslide follows the big boulder down the mountain
const cascade = [[0.006, 0.11, 0.0055], [-0.007, 0.2, 0.0045], [0.003, 0.3, 0.004], [-0.004, 0.38, 0.0035]].map(([off, lag, r], i) => {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), new THREE.MeshLambertMaterial({ color: [0x8f857c, 0xa39787, 0x7d746c, 0x9a8f86][i], flatShading: true }));
  m.userData = { off, lag, r }; const p0 = boulderPath[0];
  m.position.set(p0.x + off, heightAt(p0.x + off, p0.z - 0.006 * (i + 1)) + r, p0.z - 0.006 * (i + 1)); m.userData.home = m.position.clone();
  board.add(m); return m;
});
const dominoes = [];
{
  const geo = new THREE.BoxGeometry(0.009, 0.014, 0.0035);
  const mat = new THREE.MeshLambertMaterial({ color: 0xc9b9a6 });
  for (let i = 0; i < 6; i++) {
    const x = -0.024 - i * 0.0085, z = -0.018 + i * 0.006;
    const pivot = new THREE.Group(); pivot.position.set(x, heightAt(x, z), z); pivot.rotation.y = Math.atan2(-0.0085, 0.006);
    const d = new THREE.Mesh(geo, mat); d.position.y = 0.007; pivot.add(d);
    pivot.userData = { fallT: -1 }; board.add(pivot); dominoes.push(pivot);
  }
}
const log = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.022, 8), new THREE.MeshLambertMaterial({ color: 0x7a4b25 }));
const logHome = new THREE.Vector3(-0.077, heightAt(-0.077, 0.018) + 0.0035, 0.018);
log.position.copy(logHome); log.rotation.z = Math.PI / 2; board.add(log);
const buoy = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 8), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.006, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xe0a800, side: THREE.DoubleSide }));
  bell.position.y = 0.008; buoy.add(b, bell); buoy.position.set(LAKE[0], 0.002, LAKE[1] + 0.012); board.add(buoy);
}

// ---------- train around the island ----------
const trackCurve = new THREE.CatmullRomCurve3(Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2, r = TRACK_R + 0.003 * Math.sin(a * 5);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  return new THREE.Vector3(x, Math.max(0.0035, heightAt(x, z)) + 0.0015, z);
}), true);
{
  const railMat = new THREE.MeshLambertMaterial({ color: 0x5b5b66 });
  [-0.0028, 0.0028].forEach(off => {
    const c = new THREE.CatmullRomCurve3(trackCurve.points.map(p => { const r = Math.hypot(p.x, p.z); return new THREE.Vector3(p.x * (r + off) / r, p.y + 0.0006, p.z * (r + off) / r); }), true);
    board.add(new THREE.Mesh(new THREE.TubeGeometry(c, 240, 0.0007, 4, true), railMat));
  });
  const N = 120;
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0085, 0.0012, 0.0022), new THREE.MeshLambertMaterial({ color: 0x7a5232 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const p = trackCurve.getPointAt(i / N), tng = trackCurve.getTangentAt(i / N);
    q.setFromAxisAngle(up, Math.atan2(tng.x, tng.z));
    m.compose(p, q, new THREE.Vector3(1, 1, 1)); sleepers.setMatrixAt(i, m);
  }
  board.add(sleepers);
}
const trainCars = [];
{
  const mk = (color, engine) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.0075, 0.0065, 0.014), new THREE.MeshLambertMaterial({ color }));
    body.position.y = 0.0055; grp.add(body);
    if (engine) {
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.009, 10), new THREE.MeshLambertMaterial({ color: 0x222831 }));
      boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 0.0065, 0.004); grp.add(boiler);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.005, 8), new THREE.MeshLambertMaterial({ color: 0x222831 }));
      stack.position.set(0, 0.011, 0.007); grp.add(stack);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.005), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
      cab.position.set(0, 0.011, -0.004); grp.add(cab);
    } else {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.0078, 0.0012, 0.0145), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      top.position.y = 0.0092; grp.add(top);
    }
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [-0.004, 0.004].forEach(z => [-0.0042, 0.0042].forEach(x => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.0019, 0.0012, 10), wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(x, 0.0019, z); grp.add(w);
    }));
    board.add(grp); return grp;
  };
  trainCars.push(mk(0xe63946, true), mk(0x3a86ff, false), mk(0x2ec4b6, false));
}
let trainU = 0.12, trainTootT = 4;

// ---------- birds + clouds ----------
const birds = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.0006, 0.0032), mat); wl.position.x = -0.0045;
    const wr = wl.clone(); wr.position.x = 0.0045;
    const pl = new THREE.Group(); pl.add(wl); const pr = new THREE.Group(); pr.add(wr);
    b.add(pl, pr); b.userData = { pl, pr, r: 0.17 + i * 0.025, h: 0.2 + i * 0.018, sp: 0.35 + i * 0.07, ph: i * 1.6 };
    board.add(b); birds.push(b);
  }
}
const clouds = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.93 });
  const rng = mulberry(11);
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.012 + rng() * 0.01, 12, 8), mat);
      s.position.set((k - 1.5) * 0.014, rng() * 0.006, (rng() - 0.5) * 0.01); s.scale.y = 0.75; c.add(s);
    }
    c.userData = { a: i * Math.PI / 2 + 0.4, r: 0.14 + rng() * 0.08, h: 0.34 + rng() * 0.05 }; c.scale.setScalar(0.8);
    board.add(c); clouds.push(c);
  }
}

// =====================================================================
// Collectibles: crystals (dino), pearls (turtle), sky rings (jet)
// =====================================================================
const crystalSpots = [[-0.13, 0.09], [0.005, 0.0], [-0.03, -0.135], [0.05, 0.17], [0.16, 0.03]];
const pearlAngles = [0.35, 1.6, 2.75, 3.9, 5.2];
const ringSpots = [[0.12, 0.1, 0.0], [0.0, 0.14, -0.13], [-0.13, 0.12, -0.02], [-0.05, 0.17, 0.12], [0.08, 0.2, 0.08]];
const crystals = [], pearls = [], rings = [];
{
  const cm = [new THREE.MeshLambertMaterial({ color: 0xff4fd8, emissive: 0x7a1060 }), new THREE.MeshLambertMaterial({ color: 0x4ff2ff, emissive: 0x0d5b66 })];
  crystalSpots.forEach(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.0058), cm[i % 2]);
    m.scale.y = 1.6; m.userData = { base: new THREE.Vector3(x, heightAt(x, z) + 0.012, z), got: false };
    m.position.copy(m.userData.base); board.add(m); crystals.push(m);
  });
  const pm = new THREE.MeshLambertMaterial({ color: 0xfff6ea, emissive: 0x554433 });
  const shellM = new THREE.MeshLambertMaterial({ color: 0xff9db0, side: THREE.DoubleSide });
  pearlAngles.forEach(a => {
    const grp = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), shellM);
    shell.rotation.x = Math.PI; shell.scale.y = 0.45; grp.add(shell);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), pm); p.position.y = 0.0022; grp.add(p);
    const x = Math.cos(a) * 0.243, z = Math.sin(a) * 0.243;
    grp.userData = { base: new THREE.Vector3(x, 0.001, z), got: false };
    grp.position.copy(grp.userData.base); board.add(grp); pearls.push(grp);
  });
  const rm = new THREE.MeshLambertMaterial({ color: 0xffc83d, emissive: 0x6b4a00 });
  ringSpots.forEach((p, i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0024, 8, 32), rm);
    r.position.set(...p);
    const nxt = new THREE.Vector3(...ringSpots[(i + 1) % ringSpots.length]);
    r.lookAt(board.localToWorld(nxt.clone())); // rough; fixed after board placement in faceRings()
    r.userData = { got: false, base: r.position.clone() };
    board.add(r); rings.push(r);
  });
}
function faceRings() {
  rings.forEach((r, i) => { const nxt = rings[(i + 1) % rings.length].position; const m = new THREE.Matrix4().lookAt(r.position, nxt, new THREE.Vector3(0, 1, 0)); r.quaternion.setFromRotationMatrix(m); });
}
faceRings();

// =====================================================================
// Characters
// =====================================================================
function makeDino() {
  const grp = new THREE.Group(); const legs = [];
  const green = new THREE.MeshLambertMaterial({ color: 0x39d353 }), belly = new THREE.MeshLambertMaterial({ color: 0xc8f7a8 }), orange = new THREE.MeshLambertMaterial({ color: 0xff8a1f });
  const add = (geo, mat, p, s, r) => { const m = new THREE.Mesh(geo, mat); if (p) m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); grp.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 16, 12);
  add(sph, green, [0, 0.011, 0], [0.0085, 0.0075, 0.013]);
  add(sph, belly, [0, 0.0085, 0.001], [0.0065, 0.005, 0.01]);
  add(new THREE.CylinderGeometry(0.0035, 0.0045, 0.01, 8), green, [0, 0.0175, 0.01], null, [0.5, 0, 0]);
  add(sph, green, [0, 0.023, 0.0145], [0.0055, 0.005, 0.0068]);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyeB = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyes = [];
  [-1, 1].forEach(sd => { eyes.push(add(new THREE.SphereGeometry(0.0019, 8, 6), eyeW, [sd * 0.0037, 0.0255, 0.0175])); eyes.push(add(new THREE.SphereGeometry(0.001, 6, 4), eyeB, [sd * 0.0043, 0.0258, 0.019])); });
  const cheek = new THREE.MeshLambertMaterial({ color: 0xff9fb0 });
  [-1, 1].forEach(sd => add(new THREE.SphereGeometry(0.0011, 6, 4), cheek, [sd * 0.0043, 0.0222, 0.0182], [1, 0.6, 0.4]));
  add(new THREE.ConeGeometry(0.0045, 0.018, 8), green, [0, 0.0095, -0.017], null, [-Math.PI / 2 - 0.25, 0, 0]);
  for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.0018, 0.0045, 5), orange, [0, 0.0185 - i * 0.0012, 0.004 - i * 0.0055], null, [-0.25, 0, 0]);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.0052, 0.0075, sz * 0.0065);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0023, 0.0075, 6), green); leg.position.y = -0.0038; hip.add(leg);
    hip.userData.phase = (i === 0 || i === 3) ? 0 : Math.PI; grp.add(hip); legs.push(hip);
  });
  return { group: grp, legs, eyes, headY: 0.024 };
}
function makeTurtle() {
  const grp = new THREE.Group(); const legs = [];
  const shellMat = new THREE.MeshLambertMaterial({ color: 0x2f8f5b }), skin = new THREE.MeshLambertMaterial({ color: 0x9be08a }), spot = new THREE.MeshLambertMaterial({ color: 0x1d5e3a });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  shell.scale.set(1, 0.6, 1.15); shell.position.y = 0.002; grp.add(shell);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.002, 16), skin); under.scale.z = 1.15; under.position.y = 0.002; grp.add(under);
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 6), spot); const a = (i / 6) * Math.PI * 2; s.position.set(Math.cos(a) * 0.0065, 0.0075, Math.sin(a) * 0.0075); s.lookAt(s.position.clone().multiplyScalar(2).setY(0.03)); grp.add(s); }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 8), skin); head.position.set(0, 0.004, 0.016); head.scale.z = 1.25; grp.add(head);
  const eyeB = new THREE.MeshBasicMaterial({ color: 0x111111 });
  [-1, 1].forEach(sd => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.0009, 6, 4), eyeB); e.position.set(sd * 0.0025, 0.0058, 0.0195); grp.add(e); });
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
    const piv = new THREE.Group(); piv.position.set(sx * 0.0105, 0.002, sz * 0.008);
    const f = new THREE.Mesh(new THREE.BoxGeometry(sz > 0 ? 0.011 : 0.007, 0.0012, 0.0045), skin); f.position.x = sx * (sz > 0 ? 0.005 : 0.0032); piv.add(f);
    piv.userData = { phase: i % 2 ? Math.PI : 0, side: sx }; grp.add(piv); legs.push(piv);
  });
  return { group: grp, legs, headY: 0.01 };
}
function makeJet() {
  const grp = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0xffffff }), accent = new THREE.MeshLambertMaterial({ color: 0xff3d68 }), glass = new THREE.MeshLambertMaterial({ color: 0x4ad7ff, emissive: 0x0a3d55 });
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.0042, 0.03, 4, 12), body); fus.rotation.x = Math.PI / 2; grp.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.0042, 0.008, 12), accent); nose.rotation.x = Math.PI / 2; nose.position.z = 0.022; grp.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), glass); cockpit.scale.set(0.9, 0.8, 1.6); cockpit.position.set(0, 0.0035, 0.009); grp.add(cockpit);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0012, 0.011), accent); wing.position.set(0, -0.0005, 0.0); grp.add(wing);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.001, 0.006), accent); tailW.position.set(0, 0.0005, -0.016); grp.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.009, 0.007), accent); fin.position.set(0, 0.005, -0.016); grp.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.01, 10), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2; flame.position.z = -0.026; grp.add(flame);
  return { group: grp, legs: [], flame, headY: 0.006 };
}

const chars = {
  dino: { ...makeDino(), kind: 'walker', medium: 'land', home: START.slice(), label: 'Dino' },
  turtle: { ...makeTurtle(), kind: 'walker', medium: 'water', home: [Math.cos(1.05) * 0.24, Math.sin(1.05) * 0.24], label: 'Sea Turtle' },
  jet: { ...makeJet(), kind: 'flyer', medium: 'air', home: [0, 0.16], label: 'Jet' }
};
Object.values(chars).forEach(c => {
  c.st = { x: c.home[0], z: c.home[1], y: 0.12, tx: c.home[0], tz: c.home[1], ty: 0.12, yaw: Math.PI, walkPhase: 0, carried: false, lift: 0, hop: 0, melt: 0, roll: 0, lastSteer: -10, auto: 0 };
  board.add(c.group); c.group.visible = false;
});
let active = 'dino';
chars.dino.group.visible = true;
// everything solid casts soft shadows (shader surfaces, terrain and the planet slice are handled separately)
board.traverse(o => { if (o.isMesh && !o.material.isShaderMaterial && !o.userData.noShadow && o !== terrain && o !== strata) { o.castShadow = true; o.receiveShadow = true; } });

// fingertip markers
const tipMat = [new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }), new THREE.MeshBasicMaterial({ color: 0x2ee88a })];
const tipMarkers = [];
for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), tipMat[0]); m.visible = false; scene.add(m); tipMarkers.push(m); }

// =====================================================================
// Particles
// =====================================================================
const PMAX = 700;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pVel = Array.from({ length: PMAX }, () => new THREE.Vector3());
const pGrav = new Uint8Array(PMAX), pLife = new Float32Array(PMAX);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.0045, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
particles.frustumCulled = false; board.add(particles);
let pHead = 0;
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -9;
const _c = new THREE.Color();
function emit(x, y, z, n, color, speed, up, life = 1, gravity = true) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = pHead; pHead = (pHead + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
    pVel[i].set(Math.cos(a) * s, up * (0.6 + Math.random() * 0.8), Math.sin(a) * s);
    pGrav[i] = gravity ? 1 : 0; pLife[i] = life * (0.6 + Math.random() * 0.6);
    pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pGrav[i]) pVel[i].y -= 0.35 * dt;
    pPos[i * 3] += pVel[i].x * dt; pPos[i * 3 + 1] += pVel[i].y * dt; pPos[i * 3 + 2] += pVel[i].z * dt;
    pCol[i * 3] *= 0.995; pCol[i * 3 + 1] *= 0.99; pCol[i * 3 + 2] *= 0.99;
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -9;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// =====================================================================
// Progress, stars, saving
// =====================================================================
const STAR_KEYS = { crystals: 'All crystals', lava: 'Crossed the lava', pearls: 'All pearls', rings: 'All sky rings', chain: 'Chain reaction', volcano: 'Woke the volcano' };
let progress = { stars: {}, tutorialDone: false, easy: false, muted: false };
try { const s = JSON.parse(localStorage.getItem('tinyearth-progress-v1') || 'null'); if (s) progress = { ...progress, ...s }; } catch (e) { /* storage blocked */ }
function save() { try { localStorage.setItem('tinyearth-progress-v1', JSON.stringify(progress)); } catch (e) { /* ignore */ } }
setMuted(!!progress.muted);
const starCount = () => Object.keys(STAR_KEYS).filter(k => progress.stars[k]).length;
function award(key) {
  if (progress.stars[key]) return;
  progress.stars[key] = true; save();
  sfx.star(); say(`★ Star! ${STAR_KEYS[key]}`, 3.5);
  updateHud();
  if (starCount() === Object.keys(STAR_KEYS).length) setTimeout(celebrate, 2200);
}

function celebrate() {
  say('★ 6/6 — You brought the whole world to life!', 6); sfx.win();
  const cols = [0xff4fd8, 0x4ff2ff, 0xffd23f, 0x7dff6a, 0xff7a1a];
  for (let i = 0; i < 9; i++) setTimeout(() => {
    const a = Math.random() * 6.28, r = Math.random() * 0.15;
    emit(Math.cos(a) * r, 0.2 + Math.random() * 0.12, Math.sin(a) * r, 70, cols[i % cols.length], 0.14, 0.06, 1.6);
    sfx.ring();
  }, i * 380);
}

// =====================================================================
// In-world UI: message card, HUD, start panel, menu, menu token, ghost hand
// =====================================================================
const ui = new THREE.Group(); board.add(ui);
const msg = new Card(0.24, 0.042, { size: 0.042 * 2600 * 0.42 });
msg.mesh.position.set(0, 0.17, -0.2); ui.add(msg.mesh);
let msgTimer = 0, msgText = '';
function say(text, secs = 3) { msgText = text; msgTimer = secs; msg.set(text); msg.mesh.visible = true; }

const hud = new Card(0.13, 0.03, { bg: 'rgba(8,40,30,0.85)', fg: '#ffffff', size: 0.03 * 2600 * 0.36 });
hud.mesh.position.set(-0.17, 0.09, -0.23); ui.add(hud.mesh);
function goalLine() {
  if (active === 'dino') return `Crystals ${crystals.filter(c => c.userData.got).length}/5`;
  if (active === 'turtle') return `Pearls ${pearls.filter(c => c.userData.got).length}/5`;
  return `Sky rings ${rings.filter(c => c.userData.got).length}/5`;
}
function updateHud() { hud.set([`★ ${starCount()}/6` + (SHOW_FPS ? `   ${fpsVal} fps` : ''), `${chars[active].label}: ${goalLine()}`]); }

// start panel
let gameState = 'title';
const startPanel = new Panel('Tiny Earth', 0.2, 0.12);
startPanel.group.position.set(0, 0.12, 0.05); startPanel.group.rotation.x = -0.35; ui.add(startPanel.group);
const sub = new Card(0.18, 0.016, { bg: 'rgba(0,0,0,0)', fg: '#bff7d8', size: 0.016 * 2600 * 0.6 });
sub.set('A living world on your table'); sub.mesh.position.set(0, 0.031, 0); startPanel.group.add(sub.mesh);
const bPlay = startPanel.add(new Button('▶  Play', 0.12, 0.032, () => startGame()), 0, 0.0);
const bEasyStart = startPanel.add(new Button('', 0.085, 0.022, () => toggleEasy(), { bg: '#d9fff0' }), -0.046, -0.036);
const bHowStart = startPanel.add(new Button('How to play', 0.085, 0.022, () => { startGame(true); }, { bg: '#d9fff0' }), 0.046, -0.036);

// game menu
const menu = new Panel('Menu', 0.19, 0.2);
menu.group.position.set(0, 0.12, 0.06); menu.group.rotation.x = -0.35; menu.group.visible = false; ui.add(menu.group);
const BW = 0.082, BH = 0.026, colX = [-0.043, 0.043];
const rowY = i => 0.058 - i * 0.033;
const mb = {};
mb.resume = menu.add(new Button('Resume', BW, BH, () => closeMenu()), colX[0], rowY(0));
mb.how = menu.add(new Button('How to play', BW, BH, () => { closeMenu(); select('dino'); startTutorial(); }, { bg: '#d9fff0' }), colX[1], rowY(0));
mb.dino = menu.add(new Button('Dino', BW, BH, () => { select('dino'); closeMenu(); }, { bg: '#c9ffbf' }), colX[0], rowY(1));
mb.turtle = menu.add(new Button('Sea Turtle', BW, BH, () => { select('turtle'); closeMenu(); }, { bg: '#bff1ff' }), colX[1], rowY(1));
mb.jet = menu.add(new Button('Jet', BW, BH, () => { select('jet'); closeMenu(); }, { bg: '#ffd6e0' }), colX[0], rowY(2));
mb.easy = menu.add(new Button('', BW, BH, () => toggleEasy(), { bg: '#fff3c4' }), colX[1], rowY(2));
mb.sound = menu.add(new Button('', BW, BH, () => toggleSound(), { bg: '#fff3c4' }), colX[0], rowY(3));
mb.reset = menu.add(new Button('Reset world', BW, BH, () => { resetWorld(); closeMenu(); say('Fresh new world!', 2); }, { bg: '#fff3c4' }), colX[1], rowY(3));
mb.move = menu.add(new Button('Move board', BW, BH, () => { closeMenu(); say('Pinch the wooden edge and drag', 4); ghost.show('pinch', new THREE.Vector3(0.0, 0.0, R - 0.01)); ghostTimer = 4; }, { bg: '#e6e6ff' }), colX[0], rowY(4));
mb.quit = menu.add(new Button('Quit', BW, BH, () => { const s = renderer.xr.getSession(); if (s) s.end(); else closeMenu(); }, { bg: '#ffd0d0', border: '#8a1c1c', fg: '#4a0b0b' }), colX[1], rowY(4));
function refreshToggles() {
  const easyTxt = `Easy mode: ${progress.easy ? 'ON' : 'OFF'}`;
  mb.easy.setLabel(easyTxt); bEasyStart.setLabel(easyTxt);
  mb.sound.setLabel(`Sound: ${isMuted() ? 'OFF' : 'ON'}`);
  ['dino', 'turtle', 'jet'].forEach(k => mb[k].setLabel((active === k ? '● ' : '') + chars[k].label));
}
refreshToggles();

// menu token on the rim (always reachable, no special gesture needed)
const menuToken = new Button('≡ Menu', 0.058, 0.024, () => openMenu(), { bg: '#ffffff', fg: '#0d3b23', border: '#2ee88a' });
menuToken.group.position.set(0.16, 0.012, R - 0.005); menuToken.group.rotation.x = -0.9; menuToken.group.visible = false; ui.add(menuToken.group);
const allButtons = [...startPanel.buttons, ...menu.buttons, menuToken];

function openMenu() { if (gameState !== 'play') return; refreshToggles(); menu.group.visible = true; menuToken.group.visible = false; sfx.press(); }
function closeMenu() { menu.group.visible = false; menuToken.group.visible = gameState === 'play'; }
function toggleEasy() { progress.easy = !progress.easy; save(); refreshToggles(); say(progress.easy ? 'Easy mode on: stones stay put' : 'Easy mode off', 2); }
function toggleSound() { progress.muted = !isMuted(); setMuted(progress.muted); save(); refreshToggles(); sfx.press(); }

// ghost hand tutor
const ghost = new GhostHand(); board.add(ghost.group);
let ghostTimer = 0;
const tut = { on: false, step: 0, t: 0, walked: 0, picked: false };
const TUT = [
  { mode: 'walk', text: 'Walk two fingers on the land', at: () => new THREE.Vector3(chars.dino.st.x + 0.035, heightAt(chars.dino.st.x, chars.dino.st.z) + 0.012, chars.dino.st.z), done: () => tut.walked > 0.05 },
  { mode: 'pinch', text: 'Pinch the dino to pick it up', at: () => new THREE.Vector3(chars.dino.st.x, heightAt(chars.dino.st.x, chars.dino.st.z) + 0.03, chars.dino.st.z), done: () => tut.picked },
  { mode: 'poke', text: 'Poke the boulder', at: () => boulder.position.clone().add(new THREE.Vector3(0, 0.01, 0)), done: () => chain.stage > 0 }
];
function startTutorial() { tut.on = true; tut.step = 0; tut.t = 0; tut.walked = 0; tut.picked = false; ghost.show(TUT[0].mode, TUT[0].at()); say(TUT[0].text, 99); }
function updateTutorial(dt) {
  if (!tut.on) { if (ghostTimer > 0) { ghostTimer -= dt; ghost.update(dt); if (ghostTimer <= 0) ghost.hide(); } return; }
  tut.t += dt; const s = TUT[tut.step];
  ghost.anchor = s.at(); ghost.update(dt);
  if (s.done() || tut.t > 16) {
    tut.step++; tut.t = 0;
    if (tut.step >= TUT.length) { tut.on = false; ghost.hide(); progress.tutorialDone = true; save(); say('Go explore! Find the crystals', 4); sfx.win(); return; }
    sfx.press(); const n = TUT[tut.step]; ghost.show(n.mode, n.at()); say(n.text, 99);
  }
}

function startGame(forceTutorial = false) {
  audio(); gameState = 'play'; startPanel.group.visible = false; menuToken.group.visible = true; sfx.win();
  updateHud();
  if (forceTutorial || !progress.tutorialDone) { select('dino'); startTutorial(); }
  else say('Welcome back! Pick up where you left off', 3);
}

// =====================================================================
// World logic
// =====================================================================
let chain = { stage: 0, t: 0, done: false, cooldown: 0 };
let volcano = { t: -1, cooldown: 0 };
let shake = 0, shaking = false;
const boardBase = new THREE.Vector3();
let lavaWinCooldown = 0, trainBumpCool = 0;

function pushBoulder() { if (chain.stage !== 0 || chain.cooldown > 0) return; chain.stage = 1; chain.t = 0; sfx.thud(); sfx.rumble(); shake = 0.25; emit(boulder.position.x, boulder.position.y, boulder.position.z, 25, 0xc8b49a, 0.05, 0.08, 0.8); if (!tut.on) say('Landslide!', 2.5); }
function erupt() {
  if (volcano.cooldown > 0) return;
  volcano.t = 0; volcano.cooldown = 3.5; shake = 0.7; lavaRise = 0.004;
  sfx.rumble(); say('KABOOM! Earthquake!', 2.5);
  if (gameState === 'play') setTimeout(() => award('volcano'), 1600);
}
function resetChain() {
  chain = { stage: 0, t: 0, done: false, cooldown: 1 };
  boulder.position.copy(boulderPath[0]);
  cascade.forEach(r => r.position.copy(r.userData.home));
  dominoes.forEach(d => { d.rotation.x = 0; d.userData.fallT = -1; });
  log.position.copy(logHome); log.rotation.set(0, 0, Math.PI / 2);
}
function resetWorld() {
  resetChain();
  [...crystals, ...pearls, ...rings].forEach(o => { o.userData.got = false; o.visible = true; });
  Object.values(chars).forEach(c => Object.assign(c.st, { x: c.home[0], z: c.home[1], tx: c.home[0], tz: c.home[1], y: 0.12, ty: 0.12, carried: false, melt: 0 }));
  updateHud();
}
function updateChain(dt) {
  if (chain.cooldown > 0) chain.cooldown -= dt;
  if (chain.stage === 1) {
    chain.t += dt * 0.55;
    const segs = boulderPath.length - 1, u = Math.min(chain.t, 1) * segs, i = Math.min(segs - 1, Math.floor(u)), f = u - i;
    const p = boulderPath[i].clone().lerp(boulderPath[i + 1], f); p.y = heightAt(p.x, p.z) + boulderR;
    const prev = boulder.position.clone(); boulder.position.copy(p);
    const mv = p.clone().sub(prev); boulder.rotation.x += mv.z / boulderR; boulder.rotation.z -= mv.x / boulderR;
    if (Math.random() < 0.5) emit(p.x, p.y - boulderR, p.z, 2, 0xc8b49a, 0.035, 0.06, 0.6);
    boulder.position.y += Math.abs(Math.sin(chain.t * 22)) * 0.004 * (1 - chain.t); // bouncing tumble
    cascade.forEach(r => {
      const u2 = Math.min(1, Math.max(0, (chain.t - r.userData.lag) / (1 - r.userData.lag * 0.5)));
      if (u2 <= 0) return;
      const ui = Math.min(segs - 1, Math.floor(u2 * segs)), uf = u2 * segs - ui;
      const q = boulderPath[ui].clone().lerp(boulderPath[ui + 1], uf); q.x += r.userData.off;
      const prv = r.position.clone();
      r.position.set(q.x, heightAt(q.x, q.z) + r.userData.r + Math.abs(Math.sin(u2 * 30 + r.userData.off * 900)) * 0.005 * (1 - u2), q.z);
      const mv2 = r.position.clone().sub(prv); r.rotation.x += mv2.z / r.userData.r; r.rotation.z -= mv2.x / r.userData.r;
      if (Math.random() < 0.25) emit(r.position.x, r.position.y - r.userData.r, r.position.z, 1, 0xb8a58a, 0.03, 0.05, 0.5);
    });
    if (Math.random() < 0.08) sfx.thud();
    if (chain.t >= 1) { chain.stage = 2; chain.t = 0; dominoes[0].userData.fallT = 0; sfx.click(); }
  } else if (chain.stage === 2) {
    chain.t += dt;
    dominoes.forEach((d, i) => {
      if (d.userData.fallT < 0) return;
      d.userData.fallT += dt; d.rotation.x = Math.min(1.35, d.userData.fallT * 7);
      if (d.userData.fallT > 0.11 && i + 1 < dominoes.length && dominoes[i + 1].userData.fallT < 0) { dominoes[i + 1].userData.fallT = 0; sfx.click(); }
    });
    if (dominoes[dominoes.length - 1].userData.fallT > 0.25) { chain.stage = 3; chain.t = 0; }
  } else if (chain.stage === 3) {
    chain.t += dt; const k = Math.min(1, chain.t / 0.9);
    const x = THREE.MathUtils.lerp(logHome.x, LAKE[0] + 0.004, k), z = THREE.MathUtils.lerp(logHome.z, LAKE[1] - 0.006, k);
    log.position.set(x, Math.max(0.001, heightAt(x, z) + 0.0035), z); log.rotation.x += dt * 9;
    if (k >= 1) { chain.stage = 4; chain.t = 0; sfx.splash(); emit(log.position.x, 0.002, log.position.z, 45, 0x9fe6ff, 0.12, 0.25, 0.9); }
  } else if (chain.stage === 4) {
    chain.t += dt; log.position.y = 0.002 + Math.sin(chain.t * 5) * 0.001;
    if (chain.t > 0.35 && !chain.done) {
      chain.done = true; sfx.bell(); say('Chain reaction complete!', 3);
      emit(buoy.position.x, 0.02, buoy.position.z, 60, 0xffe066, 0.08, 0.3, 1.4);
      if (gameState === 'play') setTimeout(() => award('chain'), 900);
    }
    if (chain.t > 5) resetChain();
  }
  buoy.position.y = 0.002 + Math.sin(clockT * 2) * 0.001 + (chain.done ? Math.sin(chain.t * 30) * 0.0015 * Math.max(0, 1 - chain.t) : 0);
}
function updateVolcano(dt) {
  if (volcano.cooldown > 0) volcano.cooldown -= dt;
  lavaMat.uniforms.uHeat.value = Math.max(0, lavaMat.uniforms.uHeat.value - dt * 0.6);
  craterLight.intensity = 0.25 + lavaMat.uniforms.uHeat.value * 0.6 + Math.sin(clockT * 6) * 0.04;
  if (Math.random() < 0.04) emit(crater.position.x, crater.position.y + 0.006, crater.position.z, 1, 0x2a2a2a, 0.006, 0.03, 2.2, false); // idle smoke
  if (volcano.t >= 0) {
    volcano.t += dt;
    if (volcano.t < 1.4) emit(crater.position.x, crater.position.y + 0.004, crater.position.z, 4, Math.random() < 0.5 ? 0xff5a00 : 0xffc23a, 0.06, 0.32, 1.1);
    lavaMat.uniforms.uHeat.value = Math.min(1, lavaMat.uniforms.uHeat.value + dt * 2);
    if (volcano.t > 1.6) volcano.t = -1;
  }
  lavaRise = Math.max(0, lavaRise - dt * 0.0015);
  lavaPool.position.y = lavaLevel();
}
function updateStones(t) {
  for (const s of stones) {
    const u = s.userData, sink = (u.sinks && !progress.easy) ? Math.max(0, Math.sin(t * 0.9 + u.phase)) * 0.013 : 0;
    s.position.y = lavaLevel() + 0.003 - sink + Math.sin(t * 2 + u.phase) * 0.0006;
  }
}
function updateTrain(dt) {
  trainU = (trainU + dt * 0.035) % 1;
  trainCars.forEach((car, i) => {
    const u = (trainU - i * 0.0145 + 1) % 1;
    const p = trackCurve.getPointAt(u), tng = trackCurve.getTangentAt(u);
    car.position.copy(p); car.rotation.set(0, Math.atan2(tng.x, tng.z), 0);
  });
  const eng = trainCars[0];
  if (Math.random() < 0.08) emit(eng.position.x, eng.position.y + 0.014, eng.position.z, 1, 0x3a3a3a, 0.004, 0.03, 1.4, false);
  trainTootT -= dt;
  if (trainTootT < 0) { trainTootT = 14 + Math.random() * 6; sfx.toot(); emit(eng.position.x, eng.position.y + 0.016, eng.position.z, 6, 0x666666, 0.01, 0.05, 1.5, false); }
  trainBumpCool = Math.max(0, trainBumpCool - dt);
}
function updateSkyLife(dt, t) {
  birds.forEach(b => {
    const u = b.userData, a = t * u.sp + u.ph;
    b.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 1.3 + u.ph) * 0.01, Math.sin(a) * u.r);
    b.rotation.y = -a; const f = Math.sin(t * 12 + u.ph) * 0.5; u.pl.rotation.z = f; u.pr.rotation.z = -f;
  });
  clouds.forEach(c => { const u = c.userData; u.a += dt * 0.03; c.position.set(Math.cos(u.a) * u.r, u.h, Math.sin(u.a) * u.r); });
  // waterfall mist
  if (Math.random() < 0.35) emit(wfBot.x + (Math.random() - 0.5) * 0.01, 0.003, wfBot.z, 1, 0x9fdcff, 0.012, 0.02, 0.7, false);
}
function updateCollectibles(dt, t) {
  const st = chars[active].st;
  const rad = progress.easy ? 0.022 : 0.015;
  crystals.forEach((c, i) => {
    if (c.userData.got) return;
    c.rotation.y += dt * 1.6; c.position.y = c.userData.base.y + Math.sin(t * 2 + i) * 0.002;
    if (Math.random() < 0.02) emit(c.position.x, c.position.y, c.position.z, 1, i % 2 ? 0x4ff2ff : 0xff4fd8, 0.01, 0.02, 0.6, false);
    if (gameState === 'play' && active === 'dino' && !st.carried && dist(st.x, st.z, c.position.x, c.position.z) < rad) collect(c, i % 2 ? 0x4ff2ff : 0xff4fd8, crystals, 'crystals', 'Crystal');
  });
  pearls.forEach((p, i) => {
    if (p.userData.got) return;
    p.position.y = 0.0012 + Math.sin(t * 1.5 + i) * 0.0008; p.rotation.y += dt * 0.5;
    if (gameState === 'play' && active === 'turtle' && !st.carried && dist(st.x, st.z, p.position.x, p.position.z) < rad + 0.003) collect(p, 0xfff6ea, pearls, 'pearls', 'Pearl');
  });
  rings.forEach((r, i) => {
    if (r.userData.got) return;
    r.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.06);
    if (gameState === 'play' && active === 'jet' && clockT - st.lastSteer < 1.5) {
      const d = Math.hypot(st.x - r.position.x, st.y - r.position.y, st.z - r.position.z);
      if (d < rad + 0.006) collect(r, 0xffc83d, rings, 'rings', 'Sky ring');
    }
  });
}
function collect(obj, color, list, key, name) {
  obj.userData.got = true; obj.visible = false;
  sfx.collect(); emit(obj.position.x, obj.position.y, obj.position.z, 30, color, 0.06, 0.12, 0.9);
  const n = list.filter(o => o.userData.got).length;
  updateHud();
  if (n === list.length) award(key); else say(`${name} ${n}/${list.length}`, 1.6);
}

// =====================================================================
// Characters: movement
// =====================================================================
function overLava(x, z) { return dist(x, z, LAVA[0], LAVA[1]) < LAVA_R - 0.002; }
function stoneUnder(x, z) { for (const s of stones) if (Math.hypot(x - s.position.x, z - s.position.z) < 0.0095 && s.position.y > lavaLevel()) return s; return null; }
function landOK(x, z) { return Math.hypot(x, z) < 0.215 && heightAt(x, z) > 0.0015; }
function waterOK(x, z) { return Math.hypot(x, z) < R - 0.01 && heightAt(x, z) < -0.0015; }
function surfaceAt(x, z) { return active === 'turtle' ? Math.max(heightAt(x, z), 0) : heightAt(x, z); }
function groundY(c, x, z) {
  if (c.medium === 'water') return 0.0006 + Math.sin(clockT * 2.2) * 0.0007;
  const s = stoneUnder(x, z); if (s) return s.position.y + 0.005;
  if (overLava(x, z)) return lavaLevel();
  return heightAt(x, z);
}
function select(key) {
  if (!chars[key]) return;
  Object.entries(chars).forEach(([k, c]) => (c.group.visible = k === key));
  active = key; const c = chars[key];
  if (key !== 'dino' && tut.on) { tut.on = false; ghost.hide(); }
  Object.assign(c.st, { x: c.home[0], z: c.home[1], tx: c.home[0], tz: c.home[1], carried: false, melt: 0, hop: 0.3 });
  sfx.hop(); refreshToggles(); updateHud();
  emit(c.st.x, 0.02, c.st.z, 25, 0xffffff, 0.05, 0.08, 0.7);
  if (gameState === 'play' && !tut.on) say(key === 'dino' ? 'Dino: walk two fingers on the land' : key === 'turtle' ? 'Turtle: paddle two fingers in the water' : 'Jet: pinch the air and fly through the rings', 4);
}
function updateWalker(c, dt) {
  const st = c.st;
  if (st.melt > 0) {
    st.melt -= dt; c.group.scale.setScalar(Math.max(0.05, st.melt));
    if (st.melt <= 0) { st.x = st.tx = c.home[0]; st.z = st.tz = c.home[1]; c.group.scale.setScalar(1); st.hop = 0.3; sfx.hop(); }
  } else if (!st.carried) {
    const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz);
    let moved = 0;
    if (d > 0.002) {
      const sp = Math.min(d * 9, c.medium === 'water' ? 0.16 : 0.22) * dt;
      // steer around obstacles (lake, sea, cliffs) instead of getting stuck: try the direct line, then angled detours
      const base = Math.atan2(dz, dx);
      for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const a = base + off, nx = st.x + Math.cos(a) * sp, nz = st.z + Math.sin(a) * sp;
        const ok = c.medium === 'water' ? waterOK(nx, nz) : (landOK(nx, nz) || overLava(nx, nz));
        if (ok) { moved = Math.hypot(nx - st.x, nz - st.z); st.x = nx; st.z = nz; break; }
      }
      const ty = Math.atan2(dx, dz); st.yaw += Math.atan2(Math.sin(ty - st.yaw), Math.cos(ty - st.yaw)) * Math.min(1, dt * 12);
    }
    st.walkPhase += moved * (c.medium === 'water' ? 500 : 900);
    if (tut.on && c === chars.dino) tut.walked += moved;
    if (c.medium === 'water' && moved > 0 && Math.random() < 0.25) emit(st.x, 0.002, st.z, 1, 0xd8f6ff, 0.015, 0.02, 0.5);
    if (c.medium === 'land') {
      if (overLava(st.x, st.z) && !stoneUnder(st.x, st.z)) {
        st.melt = 1; sfx.sizzle(); say(progress.easy ? 'Hot! Stones stay put in easy mode' : 'Too hot! Hop on the stones', 3);
        emit(st.x, lavaLevel() + 0.005, st.z, 40, 0xff7a00, 0.05, 0.12, 0.9);
      }
      lavaWinCooldown = Math.max(0, lavaWinCooldown - dt);
      if (lavaWinCooldown <= 0 && dist(st.x, st.z, GOAL[0], GOAL[1]) < 0.016 && st.crossedFrom) {
        lavaWinCooldown = 6; st.crossedFrom = false; sfx.win(); sfx.bell(); say('You crossed the lava!', 3);
        emit(GOAL[0], heightAt(GOAL[0], GOAL[1]) + 0.03, GOAL[1], 80, 0xff4fa3, 0.09, 0.3, 1.5);
        if (gameState === 'play') award('lava');
      }
      if (stoneUnder(st.x, st.z)) st.crossedFrom = true; // must actually use the stones
      // train bump
      for (const car of trainCars) {
        if (trainBumpCool <= 0 && dist(st.x, st.z, car.position.x, car.position.z) < 0.013) {
          trainBumpCool = 2.5; const r = Math.hypot(st.x, st.z) || 1; const push = r > TRACK_R ? 0.02 : -0.02;
          st.x = st.tx = st.x + (st.x / r) * push; st.z = st.tz = st.z + (st.z / r) * push; st.hop = 0.3;
          sfx.toot(); say('Toot toot! Watch out for the train', 2.5);
        }
      }
    }
  }
  const swing = st.carried ? 0.6 : 1;
  c.legs.forEach(l => {
    if (c.medium === 'water') l.rotation.y = Math.sin(st.walkPhase + l.userData.phase) * 0.5 * l.userData.side;
    else l.rotation.x = Math.sin(st.walkPhase + l.userData.phase) * 0.6 * swing;
  });
  if (st.hop > 0) st.hop = Math.max(0, st.hop - dt);
  const hopY = Math.sin((st.hop / 0.3) * Math.PI) * 0.012;
  c.group.position.set(st.x, st.carried ? st.lift : groundY(c, st.x, st.z) + hopY, st.z);
  if (st.melt <= 0) { const sq = st.hop > 0 ? Math.sin((st.hop / 0.3) * Math.PI) * 0.14 : 0; c.group.scale.set(1 - sq * 0.4, 1 + sq, 1 - sq * 0.4); }
  if (c.eyes) { const blink = (clockT % 3.7) < 0.12 ? 0.15 : 1; c.eyes.forEach(e => (e.scale.y = blink)); }
  c.group.rotation.set(0, st.yaw, st.carried ? Math.sin(clockT * 8) * 0.25 : 0);
}
function updateFlyer(c, dt) {
  const st = c.st;
  const steering = clockT - st.lastSteer < 0.4;
  if (!steering) { // autopilot: gentle loop over the island
    st.auto += dt * 0.55;
    st.tx = Math.cos(st.auto) * 0.15; st.tz = Math.sin(st.auto) * 0.15; st.ty = 0.12 + Math.sin(st.auto * 2) * 0.02;
  }
  const dx = st.tx - st.x, dy = st.ty - st.y, dz = st.tz - st.z, d = Math.hypot(dx, dy, dz);
  if (d > 0.001) {
    const sp = Math.min(d * 6, 0.35) * dt;
    st.x += (dx / d) * sp; st.y += (dy / d) * sp; st.z += (dz / d) * sp;
    const ty = Math.atan2(dx, dz); const turn = Math.atan2(Math.sin(ty - st.yaw), Math.cos(ty - st.yaw));
    st.yaw += turn * Math.min(1, dt * 5); st.roll = THREE.MathUtils.lerp(st.roll, -turn * 0.9, Math.min(1, dt * 4));
  }
  st.y = THREE.MathUtils.clamp(st.y, 0.04, 0.26);
  const r = Math.hypot(st.x, st.z); if (r > R + 0.04) { st.x *= (R + 0.04) / r; st.z *= (R + 0.04) / r; }
  c.group.position.set(st.x, st.y, st.z);
  c.group.rotation.set(THREE.MathUtils.clamp(-dy * 8, -0.5, 0.5), st.yaw, st.roll, 'YXZ');
  c.flame.scale.setScalar(0.8 + Math.random() * 0.5);
  if (Math.random() < 0.6) { const back = new THREE.Vector3(0, 0, -0.03).applyEuler(c.group.rotation).add(c.group.position); emit(back.x, back.y, back.z, 1, steering ? 0x66e0ff : 0x9fd8ff, 0.004, 0.0, 0.5, false); }
}

// =====================================================================
// XR hand input
// =====================================================================
const hands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
hands.forEach(h => scene.add(h));
const JOINTS = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip', 'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip', 'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip', 'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip', 'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];
// visible virtual hands (only in full VR, where you can't see your real hands)
const handViz = hands.map(() => { const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0062, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffd7b8 }), JOINTS.length); im.visible = false; im.frustumCulled = false; scene.add(im); return im; });
const handState = hands.map(() => ({ lowerTip: 0, lastSwitch: 0, contactT: -1, pinching: false, grab: null, grabOffset: new THREE.Vector3() }));

function jointWorld(hand, name, out) { const j = hand.joints && hand.joints[name]; if (!j || !hand.visible) return null; j.getWorldPosition(out); return out; }

function handleHands(dt, t) {
  let markerI = 0;
  tipMarkers.forEach(m => (m.visible = false));
  const c = chars[active];
  hands.forEach((hand, hi) => {
    const hs = handState[hi];
    const viz = handViz[hi];
    const wI = jointWorld(hand, 'index-finger-tip', new THREE.Vector3());
    const wM = jointWorld(hand, 'middle-finger-tip', new THREE.Vector3());
    const wT = jointWorld(hand, 'thumb-tip', new THREE.Vector3());
    if (!wI || !wM || !wT) { viz.visible = false; if (hs.grab) releaseGrab(hs); return; }

    if (sessionMode === 'immersive-vr') {
      viz.visible = true; const m = new THREE.Matrix4(), p = new THREE.Vector3();
      JOINTS.forEach((n, i) => { if (jointWorld(hand, n, p)) { m.makeTranslation(p.x, p.y, p.z); viz.setMatrixAt(i, m); } });
      viz.instanceMatrix.needsUpdate = true;
    }

    // UI buttons (poke with index tip)
    for (const b of allButtons) b.test(wI, dt, hi);

    const lI = board.worldToLocal(wI.clone()), lM = board.worldToLocal(wM.clone());
    [[wI, lI], [wM, lM]].forEach(([w, l]) => {
      const near = Math.hypot(l.x, l.z) < R + 0.04 && l.y < 0.15 && l.y > -0.03;
      if (near && markerI < tipMarkers.length) { const m = tipMarkers[markerI++]; m.visible = true; m.position.copy(w); m.material = (l.y - surfaceAt(l.x, l.z) < 0.02) ? tipMat[1] : tipMat[0]; }
    });
    if (menu.group.visible) { hs.pinching = false; return; }

    // pinch: carry walker / steer jet / drag board
    const pinchDist = wI.distanceTo(wT);
    const pinchNow = hs.pinching ? pinchDist < 0.035 : pinchDist < 0.02;
    const pinchW = wI.clone().add(wT).multiplyScalar(0.5);
    const pl = board.worldToLocal(pinchW.clone());
    if (pinchNow && !hs.pinching) {
      const rr = Math.hypot(pl.x, pl.z);
      const head = new THREE.Vector3(c.st.x, c.group.position.y + c.headY * 0.6, c.st.z);
      if (c.kind === 'walker' && pl.distanceTo(head) < 0.045 && c.st.melt <= 0) { hs.grab = 'char'; c.st.carried = true; sfx.hop(); if (tut.on) tut.picked = true; }
      else if (rr > R - 0.035 && rr < R + 0.06 && pl.y < 0.05 && pl.y > -0.07) { hs.grab = 'board'; hs.grabOffset.copy(board.position).sub(pinchW); sfx.click(); }
      else if (c.kind === 'flyer' && rr < R + 0.1 && pl.y > 0.01 && pl.y < 0.35) { hs.grab = 'steer'; sfx.whoosh(); }
    } else if (!pinchNow && hs.pinching) releaseGrab(hs);
    hs.pinching = pinchNow;
    if (hs.grab === 'char') { c.st.x = c.st.tx = THREE.MathUtils.clamp(pl.x, -R, R); c.st.z = c.st.tz = THREE.MathUtils.clamp(pl.z, -R, R); c.st.lift = pl.y - 0.022; return; }
    if (hs.grab === 'board') { board.position.copy(pinchW).add(hs.grabOffset); return; }
    if (hs.grab === 'steer') { c.st.tx = pl.x; c.st.ty = pl.y; c.st.tz = pl.z; c.st.lastSteer = t; return; }
    if (hs.pinching) return;

    // pokes (any character)
    if (lI.distanceTo(boulder.position) < boulderR + 0.012) pushBoulder();
    if (lI.distanceTo(crater.position) < 0.022) erupt();

    // finger-walk / paddle
    if (c.kind !== 'walker') return;
    const hI = lI.y - surfaceAt(lI.x, lI.z), hM = lM.y - surfaceAt(lM.x, lM.z);
    const touchI = hI < 0.018 && Math.hypot(lI.x, lI.z) < R, touchM = hM < 0.018 && Math.hypot(lM.x, lM.z) < R;
    if (touchI || touchM) {
      hs.contactT = t;
      const lower = hI < hM - 0.004 ? 1 : (hM < hI - 0.004 ? 2 : hs.lowerTip);
      if (lower !== hs.lowerTip && hs.lowerTip !== 0 && t - hs.lastSwitch > 0.08) {
        hs.lastSwitch = t; c.medium === 'water' ? sfx.paddle() : sfx.step();
        emit(c.st.x, groundY(c, c.st.x, c.st.z) + 0.001, c.st.z, 3, c.medium === 'water' ? 0xd8f6ff : 0xd8c7a2, 0.02, 0.03, 0.4);
      }
      hs.lowerTip = lower;
    }
    if (t - hs.contactT < 0.25) { c.st.tx = (lI.x + lM.x) / 2; c.st.tz = (lI.z + lM.z) / 2; }
  });
}
function releaseGrab(hs) {
  const c = chars[active];
  if (hs.grab === 'char') {
    c.st.carried = false; c.st.hop = 0.3; sfx.hop();
    const ok = c.medium === 'water' ? waterOK(c.st.x, c.st.z) : (landOK(c.st.x, c.st.z) || overLava(c.st.x, c.st.z));
    if (!ok) { c.st.x = c.st.tx = c.home[0]; c.st.z = c.st.tz = c.home[1]; say(c.medium === 'water' ? 'Turtles need water!' : 'Splash! Back to the meadow', 2.5); }
    emit(c.st.x, groundY(c, c.st.x, c.st.z) + 0.002, c.st.z, 10, 0xd8c7a2, 0.04, 0.05, 0.5);
  }
  if (hs.grab === 'board') snapBoardToTable();
  hs.grab = null;
}

// =====================================================================
// Board placement in the room
// =====================================================================
let needPlace = false, lastFrame = null;
function placeBoardInFront() {
  const cam = renderer.xr.getCamera();
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  cam.getWorldPosition(p); cam.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q); fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  board.position.copy(p).addScaledVector(fwd, 0.42); board.position.y = p.y - 0.42;
  board.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  snapBoardToTable();
}
function snapBoardToTable() {
  const frame = lastFrame; if (!frame || !frame.detectedPlanes) return;
  const ref = renderer.xr.getReferenceSpace(); let best = null;
  frame.detectedPlanes.forEach(plane => {
    if (plane.orientation !== 'horizontal') return;
    const pose = frame.getPose(plane.planeSpace, ref); if (!pose) return;
    const { x: px, y: py, z: pz } = pose.transform.position;
    const dy = board.position.y - py;
    if (dy < -0.15 || dy > 0.35 || py < 0.3) return;
    const dxz = Math.hypot(board.position.x - px, board.position.z - pz);
    if (dxz > 0.9) return;
    if (!best || dxz < best.dxz) best = { py, dxz };
  });
  if (best) board.position.y = best.py + (STRATA_H - STRATA_TOP); // bottom of the planet slice rests on the table
}

// =====================================================================
// Enter XR
// =====================================================================
const btn = document.getElementById('enter');
let sessionMode = null;
(async () => {
  if (!navigator.xr) { btn.textContent = 'Desktop preview (no headset found)'; return; }
  if (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) sessionMode = 'immersive-ar';
  else if (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) sessionMode = 'immersive-vr';
  if (!sessionMode) { btn.textContent = 'Desktop preview (no headset found)'; return; }
  btn.disabled = false; btn.textContent = sessionMode === 'immersive-ar' ? 'Play in your room' : 'Play in VR';
})();
btn.addEventListener('click', async () => {
  audio();
  try {
    const session = await navigator.xr.requestSession(sessionMode, { optionalFeatures: ['local-floor', 'hand-tracking', 'plane-detection'] });
    if (sessionMode === 'immersive-ar') { scene.background = null; renderer.setClearColor(0x000000, 0); }
    renderer.xr.setFoveation(1);
    await renderer.xr.setSession(session);
    needPlace = true;
    session.addEventListener('end', () => {
      scene.background = SKY; board.position.set(0, 0.74, -0.45); board.rotation.set(0, 0, 0); applyOrbit();
      handViz.forEach(v => (v.visible = false));
    });
  } catch (e) { console.warn('XR start failed', e); btn.textContent = 'Could not start: ' + e.message; }
});

// =====================================================================
// Desktop preview (mouse = one fingertip) — used for QA and the desktop demo
// =====================================================================
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const orbit = { yaw: 0, pitch: 0.95, dist: 0.62, drag: false, lx: 0, ly: 0 };
let mouseMode = null; let mouseStepAcc = 0;
function applyOrbit() {
  const tg = new THREE.Vector3(0, 0.79, -0.45);
  camera.position.set(tg.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist, tg.y + Math.sin(orbit.pitch) * orbit.dist, tg.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist);
  camera.lookAt(tg);
}
applyOrbit();
function castFrom(e) { ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
const buttonFaces = () => allButtons.filter(b => isShown(b.group)).map(b => { b.card.mesh.userData.btn = b; return b.card.mesh; });
function isShown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
renderer.domElement.addEventListener('pointerdown', e => {
  if (renderer.xr.isPresenting) return;
  audio(); castFrom(e);
  const bh = ray.intersectObjects(buttonFaces(), false)[0];
  if (bh) return bh.object.userData.btn.click();
  if (menu.group.visible) return;
  const c = chars[active];
  if (c.kind === 'flyer') { mouseMode = 'steer'; steerFromRay(); return; }
  const hit = ray.intersectObjects([boulder, crater, terrain, lavaPool, water, ...stones], false)[0];
  if (hit && hit.object === boulder) return pushBoulder();
  if (hit) { const l = board.worldToLocal(hit.point.clone()); if (dist(l.x, l.z, VOLC[0], VOLC[1]) < 0.02) return erupt(); mouseMode = 'walk'; setWalkTarget(l); return; }
  orbit.drag = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
});
addEventListener('pointermove', e => {
  if (renderer.xr.isPresenting) return;
  castFrom(e);
  if (mouseMode === 'walk') { const hit = ray.intersectObjects([terrain, lavaPool, water, ...stones], false)[0]; if (hit) setWalkTarget(board.worldToLocal(hit.point.clone())); }
  else if (mouseMode === 'steer') steerFromRay();
  else if (orbit.drag) { orbit.yaw -= (e.clientX - orbit.lx) * 0.006; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + (e.clientY - orbit.ly) * 0.006, 0.15, 1.45); orbit.lx = e.clientX; orbit.ly = e.clientY; applyOrbit(); }
});
addEventListener('pointerup', () => { mouseMode = null; orbit.drag = false; });
addEventListener('wheel', e => { if (renderer.xr.isPresenting) return; orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.25, 1.5); applyOrbit(); }, { passive: true });
addEventListener('keydown', e => {
  if (e.key === '1') select('dino'); if (e.key === '2') select('turtle'); if (e.key === '3') select('jet');
  if (e.key === 'm' || e.key === 'M') menu.group.visible ? closeMenu() : openMenu();
});
function steerFromRay() {
  const planeW = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), board.localToWorld(new THREE.Vector3(0, 0.13, 0)));
  const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(planeW, p)) return;
  const l = board.worldToLocal(p); const st = chars.jet.st; st.tx = l.x; st.tz = l.z; st.ty = 0.13; st.lastSteer = clockT;
}
function setWalkTarget(l) { const st = chars[active].st; st.tx = l.x; st.tz = l.z; }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// =====================================================================
// Main loop
// =====================================================================
const clock = new THREE.Clock();
let clockT = 0;
renderer.setAnimationLoop((time, frame) => {
  const rawDt = clock.getDelta(), dt = Math.min(0.05, rawDt);
  fpsN++; fpsT += rawDt; if (fpsT >= 1) { fpsVal = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; if (SHOW_FPS) updateHud(); }
  clockT += dt; const t = clockT;
  lastFrame = frame || null; uTime.value = t;
  if (needPlace && renderer.xr.isPresenting && frame) { needPlace = false; placeBoardInFront(); }

  if (renderer.xr.isPresenting) handleHands(dt, t);
  else {
    for (const b of allButtons) b.cool = Math.max(0, b.cool - dt);
    if (mouseMode === 'walk' && chars[active].kind === 'walker') {
      mouseStepAcc += dt; const st = chars[active].st;
      if (mouseStepAcc > 0.22 && Math.hypot(st.tx - st.x, st.tz - st.z) > 0.004) { mouseStepAcc = 0; chars[active].medium === 'water' ? sfx.paddle() : sfx.step(); emit(st.x, groundY(chars[active], st.x, st.z) + 0.001, st.z, 3, 0xd8c7a2, 0.02, 0.03, 0.4); }
    }
  }
  const c = chars[active];
  if (c.kind === 'walker') updateWalker(c, dt); else updateFlyer(c, dt);
  updateChain(dt); updateVolcano(dt); updateStones(t); updateTrain(dt); updateSkyLife(dt, t); updateCollectibles(dt, t);
  updateTutorial(dt); updateParticles(dt);
  flag.userData.cloth.rotation.y = Math.sin(t * 3) * 0.3;

  if (shake > 0) {
    if (!shaking) { shaking = true; boardBase.copy(board.position); }
    shake -= dt;
    board.position.set(boardBase.x + (Math.random() - 0.5) * 0.003, boardBase.y + (Math.random() - 0.5) * 0.0015, boardBase.z + (Math.random() - 0.5) * 0.003);
    if (shake <= 0) { board.position.copy(boardBase); shaking = false; }
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msg.mesh.visible = false; }
  const eye = new THREE.Vector3();
  (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(eye);
  msg.mesh.lookAt(eye); hud.mesh.lookAt(eye);

  renderer.render(scene, camera);
});

updateHud();
say('Tiny Earth', 3);

// hooks for automated QA (harmless in production)
window.__game = {
  VERSION, pushBoulder, erupt, select, startGame, openMenu, closeMenu, resetWorld,
  walkTo: (x, z) => setWalkTarget({ x, z }),
  flyTo: (x, y, z) => { const st = chars.jet.st; st.tx = x; st.ty = y; st.tz = z; st.lastSteer = clockT + 30; },
  pokeSim: label => { const b = allButtons.find(b => b.label.includes(label) && isShown(b.group)); if (!b) return 'not shown'; b.cool = 0; b.prev = [null, null]; b.test(b.group.localToWorld(new THREE.Vector3(0, 0, 0.02)), 0.016, 1); return b.test(b.group.localToWorld(new THREE.Vector3(0.005, 0.002, -0.004)), 0.016, 1); },
  press: label => { const b = allButtons.find(b => b.label.includes(label) && isShown(b.group)); if (b) { b.click(); return true; } return false; },
  state: () => ({ active, gameState, stars: starCount(), msg: msgText, chain: chain.stage, tut: tut.on ? tut.step : -1, dino: { x: chars.dino.st.x, z: chars.dino.st.z }, jet: { x: chars.jet.st.x, y: chars.jet.st.y, z: chars.jet.st.z }, menu: menu.group.visible }),
  crystals: () => crystals.map(c => [c.position.x, c.position.z, c.userData.got]),
  rings: () => rings.map(r => [r.position.x, r.position.y, r.position.z, r.userData.got]),
  pearls: () => pearls.map(p => [p.position.x, p.position.z, p.userData.got])
};
