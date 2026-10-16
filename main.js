// HFTC campus world with a small orange dragon, controlled like a PS1 dragon platformer:
// run, jump, glide, hover, charge, flame, headbash, sidestep roll, camera rotate,
// first-person look, plus flight-level style free flight. See ../README.md.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CollisionWorld } from './collide.js';
import { Input } from './input.js';
import { Dragon } from './dragon.js';

const Q = new URLSearchParams(location.search);
const PS1 = Q.get('ps1') === '1';
const RECORD = Q.has('record');
const FREECAM = Q.get('cam');      // "x,y,z,tx,ty,tz": fixed camera for screenshots

// ---------------------------------------------------------------- tuning (feet, seconds)
const T = {
  run: 22, charge: 40, accel: 160, turn: 16, chargeTurn: 2.6,
  jumpV: 28, gravity: 62, maxFall: 70, airAccel: 50,
  glideSpeed: 28, glideSink: 8, glideTurn: 2.2,
  hoverV: 17, hoverTime: 0.42, bashV: 55,
  rollTime: 0.38, rollSpeed: 26,
  flySpeed: 45, flyBoost: 78, flySlow: 22, flyYaw: 1.7, flyPitch: 1.3,
  float: 1.1, radius: 1.5,           // body sphere bottom sits `float` ft above the feet
  camDist: 13, camHeight: 5.0,
};
const CENTRE_H = T.float + T.radius;

// ---------------------------------------------------------------- renderer, scene
const renderer = new THREE.WebGLRenderer({ antialias: !PS1, powerPreference: 'high-performance' });
renderer.setPixelRatio(PS1 ? Math.min(1, 240 / innerHeight) : Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
if (PS1) renderer.domElement.style.imageRendering = 'pixelated';
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 6000);
addEventListener('resize', () => {
  renderer.setPixelRatio(PS1 ? Math.min(1, 240 / innerHeight) : Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const FOG = new THREE.Color('#cfe6f2');
const FOG_SRGB = [0xcf / 255, 0xe6 / 255, 0xf2 / 255];
scene.fog = new THREE.Fog(FOG, 500, 2200);
scene.add(new THREE.HemisphereLight('#dfeeff', '#8a7a55', 1.7));
const sunLight = new THREE.DirectionalLight('#fff1d6', 2.0);
scene.add(sunLight);

// Unlit vertex colours (the lighting is baked into them), fog, optional PS1 vertex snap.
// The GLB colours are already display (sRGB) values, so they go to the screen as they are.
function worldMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    uniforms: {
      fogColor: { value: new THREE.Vector3(...FOG_SRGB) }, fogNear: { value: 500 }, fogFar: { value: 2200 },
      snap: { value: PS1 ? new THREE.Vector2(320, 240) : new THREE.Vector2(0, 0) },
      useFog: { value: opts.fog === false ? 0 : 1 },
    },
    vertexShader: `
      uniform vec2 snap; varying vec3 vCol; varying float vDepth;
      void main() {
        vCol = color.rgb;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        if (snap.x > 0.0) gl_Position.xy = floor(gl_Position.xy / gl_Position.w * snap + 0.5) / snap * gl_Position.w;
      }`,
    fragmentShader: `
      uniform vec3 fogColor; uniform float fogNear, fogFar, useFog; varying vec3 vCol; varying float vDepth;
      void main() {
        float f = useFog * smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(mix(vCol, fogColor, f), 1.0);
      }`,
    ...opts.mat,
  });
}

// ---------------------------------------------------------------- sky dome (vertex coloured)
function makeSky() {
  const g = new THREE.SphereGeometry(4500, 64, 32);
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  const zen = [0.23, 0.48, 0.86], hor = [0.80, 0.91, 0.96], low = [0.72, 0.86, 0.80];
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), cc = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const e = y / 4500;                         // sin(elevation)
    const az = Math.atan2(z, x);
    let col;
    if (e < 0) col = low.map((v, k) => v + (hor[k] - v) * Math.max(0, 1 + e * 8));
    else { const t = Math.pow(e, 0.55); col = hor.map((v, k) => v + (zen[k] - v) * t); }
    // cloud band: puffy noise between ~4 and ~35 degrees up
    const band = Math.max(0, Math.min(1, (e - 0.06) / 0.08)) * Math.max(0, Math.min(1, (0.6 - e) / 0.25));
    const n = noise(az * 5 + 10, e * 9) * 0.65 + noise(az * 11, e * 20) * 0.35;
    const cl = Math.max(0, (n - 0.52) * 3.2) * band;
    col = col.map((v) => v + (1.0 - v) * Math.min(1, cl));
    c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, worldMaterial({ fog: false, mat: { side: THREE.BackSide, depthWrite: false } }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}
const sky = makeSky();
scene.add(sky);

// ---------------------------------------------------------------- HUD
const $ = (id) => document.getElementById(id);
const hud = { gems: $('gems'), gemN: $('gemn'), banner: $('banner'), bname: $('bname'), bsub: $('bsub'), mode: $('mode'),
  help: $('help') };
let gemShowT = 0, bannerT = 0, currentBuilding = null;
function showBanner(title, sub) {
  hud.bname.textContent = title; hud.bsub.textContent = sub || '';
  hud.banner.classList.add('show'); bannerT = 3.2;
}

// ---------------------------------------------------------------- particles
class Particles {
  constructor(n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.kind = new Uint8Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: innerHeight / 2 } },
      vertexShader: `
        attribute vec4 pcol; attribute float psize; uniform float scale; varying vec4 vC;
        void main() { vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec4 vC;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - r * r)); }`,
    });
    this.mat = m;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn(p, v, life, s0, s1, kind) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.kind[i] = kind;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const k = this.kind[i];
      const drag = k === 0 ? 2.2 : k === 2 ? 1.2 : 3;
      for (let a = 0; a < 3; a++) {
        this.vel[i * 3 + a] *= Math.exp(-drag * dt);
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      }
      if (k === 0) this.vel[i * 3 + 1] += 14 * dt;        // flame rises
      if (k === 2) this.vel[i * 3 + 1] += 4 * dt;         // smoke
      if (k === 3) this.vel[i * 3 + 1] -= 30 * dt;        // sparkle falls
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      let r, g, b, a;
      if (k === 0) {         // flame: yellow -> orange -> red, fading
        r = 1; g = Math.max(0.12, 0.78 - t * 1.0); b = Math.max(0, 0.25 - t * 1.5); a = (1 - t) * 0.55;
      } else if (k === 1) {  // dust
        r = 0.78; g = 0.74; b = 0.66; a = (1 - t) * 0.55;
      } else if (k === 2) {  // smoke
        r = g = b = 0.25 + 0.2 * t; a = (1 - t) * 0.35 * Math.min(1, t * 5);
      } else {               // sparkle
        r = 1; g = 1; b = 0.85; a = 1 - t;
      }
      this.col.set([r, g, b, a], i * 4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcol.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
  }
}
const fx = new Particles(900, true), fxDust = new Particles(500, false);
scene.add(fx.points, fxDust.points);

// ---------------------------------------------------------------- blob shadow
const shadow = (() => {
  const g = new THREE.CircleGeometry(1, 16);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { alpha: { value: 0.5 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float alpha; varying vec2 vP; void main(){ float r = length(vP); gl_FragColor = vec4(0.05,0.04,0.08, alpha * (1.0 - smoothstep(0.55, 1.0, r))); }',
  });
  const s = new THREE.Mesh(g, m);
  s.renderOrder = 4;
  return s;
})();
scene.add(shadow);

// ---------------------------------------------------------------- gems
const GEM_COL = { 1: '#ff2d2d', 2: '#2fe04a', 5: '#2f7bff', 10: '#ffcc1a', 25: '#e03cff' };
function gemGeometry() {
  // brilliant-ish cut: pointed pavilion, crown, flat table; 6 facets around
  const pts = [new THREE.Vector2(0, -1.1), new THREE.Vector2(0.75, 0), new THREE.Vector2(0.48, 0.42), new THREE.Vector2(0, 0.42)];
  const g = new THREE.LatheGeometry(pts, 6);
  return g.toNonIndexed();
}
const gemGeo = gemGeometry();
const gemSets = {};
let gems = [], gemTotal = 0, gemGot = 0;

// ---------------------------------------------------------------- world load
const loader = new GLTFLoader();
let world = null, col = null, info = null;
const dragon = new Dragon();
scene.add(dragon.root);

const P = {    // player state
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.PI, speed: 0,
  mode: 'ground', grounded: true, groundN: new THREE.Vector3(0, 1, 0),
  charging: false, glided: false, hovered: false, hoverT: 0, bash: false,
  rollT: 0, rollDir: 1, flameT: 0, flyPitch: 0, flyBank: 0, flySpeed: T.flySpeed,
  look: false, lookYaw: 0, lookPitch: 0, airT: 0, inSun: 1,
};
const cam = { yaw: Math.PI, pitch: 0.3, dist: T.camDist, manualT: 0, pos: new THREE.Vector3(), shake: 0, inited: false };
const input = new Input();
input.bindTouch(document.getElementById('touch'));

async function load() {
  const [gltf, wj] = await Promise.all([
    loader.loadAsync('assets/hftc_world.glb'),
    fetch('assets/world.json').then((r) => r.json()),
  ]);
  info = wj;
  let colMesh = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'collision') colMesh = o;
    else if (o.name === 'decals') o.material = worldMaterial({ mat: { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 } });
    else o.material = worldMaterial();
    o.frustumCulled = false;
  });
  colMesh.parent.remove(colMesh);
  col = new CollisionWorld(colMesh.geometry.attributes.position.array, colMesh.geometry.index.array);
  world = gltf.scene;
  scene.add(world);

  // gems: one instanced mesh per value
  for (const v of Object.keys(GEM_COL)) {
    const c = new THREE.Color(GEM_COL[v]);
    const m = new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.45), flatShading: true });
    const list = wj.gems.filter((g) => g[3] === +v);
    const im = new THREE.InstancedMesh(gemGeo, m, Math.max(1, list.length));
    im.count = list.length;
    im.frustumCulled = false;
    scene.add(im);
    gemSets[v] = im;
  }
  const idx = {};
  gems = wj.gems.map(([x, y, z, v]) => {
    idx[v] = (idx[v] || 0);
    return { home: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x, y, z), v, got: false, pull: false, i: idx[v]++ };
  });
  gemTotal = gems.reduce((s, g) => s + g.v, 0);
  hud.gemN.textContent = `0 / ${gemTotal}`;

  // spawn
  const sp = Q.get('pos') ? Q.get('pos').split(',').map(Number) : null;
  if (sp) {
    P.pos.set(sp[0], 300, sp[1]);
    const h = col.ray(sp[0], 300, sp[1], 0, -1, 0, 600);
    P.pos.y = h ? 300 - h.t : 0;
    if (sp.length > 2) P.yaw = sp[2] * Math.PI / 180;
  } else P.pos.set(...wj.spawn);
  cam.yaw = P.yaw;
  if (Q.get('fly') === '1') startFly();

  const s = new THREE.Vector3(...wj.sun).normalize();
  sunLight.position.copy(s).multiplyScalar(100);
  document.title = JSON.stringify({ ok: true, tris: wj.counts.world_tris, collision: wj.counts.collision_tris, gems: gems.length,
    gemValue: gemTotal });
  $('loading').remove();
  const t = parseFloat(Q.get('t') || '0');
  for (let k = 0; k < t * 60; k++) step(1 / 60);
  if (!RECORD) requestAnimationFrame(frame);
  else render();
}

// ---------------------------------------------------------------- helpers
const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (a, b, d) => (a < b ? Math.min(b, a + d) : Math.max(b, a - d));
const turnTo = (a, b, rate) => a + THREE.MathUtils.clamp(wrap(b - a), -rate, rate);
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

function stickWorld() {
  // left stick -> world direction relative to the camera, magnitude 0..1
  const s = input.stick;
  const m = Math.min(1, Math.hypot(s.x, s.y));
  if (m < 0.12) return null;
  const f = fwd(cam.yaw, V1), r = V2.set(-f.z, 0, f.x);
  const d = new THREE.Vector3().addScaledVector(f, s.y).addScaledVector(r, s.x).normalize();
  d.m = m;
  return d;
}

function startFly() {
  // pitch > 0 is nose down; taking off from the ground starts in a climb
  P.flyPitch = P.mode === 'ground' ? -0.4 : THREE.MathUtils.clamp(-P.vel.y / 60, -0.4, 0.3);
  P.mode = 'fly'; P.grounded = false; P.charging = false; P.bash = false; P.hoverT = 0;
  P.flySpeed = T.flySpeed;
  setMode('FLIGHT');
}
function setMode(t) { hud.mode.textContent = t; }

function land() {
  const hard = P.bash || P.vel.y < -45;
  P.mode = 'ground'; P.grounded = true; P.glided = false; P.hovered = false; P.airT = 0;
  if (hard) {
    cam.shake = 0.35;
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      fxDust.spawn(V1.copy(P.pos).add(V2.set(Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2)), V3.set(Math.cos(a) * 16, 2, Math.sin(a) * 16), 0.6, 1.2, 3.5, 1);
    }
  } else if (P.vel.y < -20) {
    for (let k = 0; k < 6; k++) fxDust.spawn(V1.copy(P.pos).add(V2.set(0, 0.3, 0)), V3.set((Math.random() - 0.5) * 10, 2, (Math.random() - 0.5) * 10), 0.45, 0.8, 2.2, 1);
  }
  P.bash = false;
  P.vel.y = 0;
  setMode('');
}

// ---------------------------------------------------------------- simulation step
// Checks only: steer the stick toward a waypoint (window.__game.auto = [x, y, z]).
function autopilot() {
  const a = window.__game?.auto;
  if (!a) return;
  const dx = a[0] - P.pos.x, dz = a[2] - P.pos.z;
  if (P.mode === 'fly') {
    const want = Math.atan2(dx, dz);
    input.stick.x = THREE.MathUtils.clamp(-wrap(want - P.yaw) * 1.6, -1, 1);
    const h = Math.hypot(dx, dz);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(a[1] - P.pos.y, Math.max(h, 30)), -0.7, 0.7);
    input.stick.y = THREE.MathUtils.clamp((pitch - P.flyPitch) * 3, -1, 1);
  } else {
    const l = Math.hypot(dx, dz) || 1;
    const f = fwd(cam.yaw, V1);
    input.stick.y = (dx * f.x + dz * f.z) / l;
    input.stick.x = (dx * -f.z + dz * f.x) / l;
  }
}

function step(dt) {
  input.poll();
  autopilot();
  const st = P;
  const dir = stickWorld();

  // camera buttons (L1/R1 rotate; both: snap behind), right stick
  if (st.mode !== 'fly' && !st.look) {
    const rot = (input.held('l1') ? 1 : 0) - (input.held('r1') ? 1 : 0) - input.look.x;
    if (input.held('l1') && input.held('r1')) { cam.yaw = turnTo(cam.yaw, st.yaw, 6 * dt); cam.manualT = 0.6; }
    else if (rot) { cam.yaw += rot * 2.3 * dt; cam.manualT = 1.5; }
    cam.pitch = THREE.MathUtils.clamp(cam.pitch - input.look.y * 1.2 * dt, 0.05, 1.0);
  }
  cam.manualT = Math.max(0, cam.manualT - dt);

  if (input.pressed('start')) hud.help.classList.toggle('show');

  // Select: toggle free flight
  if (input.pressed('select')) {
    if (st.mode === 'fly') { st.mode = 'glide'; st.glided = true; setMode('GLIDE'); }
    else startFly();
  }

  // Triangle on the ground, standing: first-person look (held)
  if (st.mode === 'ground' && input.held('triangle') && !dir && !st.charging) {
    if (!st.look) { st.look = true; st.lookYaw = st.yaw; st.lookPitch = 0; }
    st.lookYaw -= input.stick.x * 2.0 * dt + input.look.x * 2.0 * dt;
    st.lookPitch = THREE.MathUtils.clamp(st.lookPitch + (input.stick.y + input.look.y) * 1.5 * dt, -1.2, 1.2);
  } else if (st.look && !input.held('triangle')) st.look = false;

  // Circle: flame (short bursts; holding keeps breathing)
  if (input.pressed('circle') || (input.held('circle') && st.flameT <= 0)) st.flameT = 0.45;
  st.flameT = Math.max(0, st.flameT - dt);

  // L2 / R2: sidestep roll on the ground
  if (st.mode === 'ground' && st.rollT <= 0 && !st.charging && (input.pressed('l2') || input.pressed('r2'))) {
    st.rollT = T.rollTime; st.rollDir = input.pressed('l2') ? 1 : -1;
  }

  if (st.mode === 'ground' && !st.look) groundMove(dt, dir);
  else if (st.mode === 'ground' && st.look) { st.vel.x = st.vel.z = 0; st.speed = 0; }
  else if (st.mode === 'air') airMove(dt, dir);
  else if (st.mode === 'glide') glideMove(dt, dir);
  else if (st.mode === 'fly') flyMove(dt);
  st.rollT = Math.max(0, st.rollT - dt);

  integrate(dt);
  updateGems(dt);
  emitFx(dt);
  updateCamera(dt);
}

function groundMove(dt, dir) {
  const st = P;
  // Square: charge (held). Runs forward at speed, steering only.
  st.charging = input.held('square') && st.rollT <= 0;
  let target = 0;
  if (st.charging) {
    if (dir) st.yaw = turnTo(st.yaw, Math.atan2(dir.x, dir.z), T.chargeTurn * dt);
    target = T.charge;
  } else if (dir) {
    st.yaw = turnTo(st.yaw, Math.atan2(dir.x, dir.z), T.turn * dt);
    target = T.run * dir.m;
  }
  st.speed = approach(st.speed, target, T.accel * dt);
  const f = fwd(st.yaw, V1);
  st.vel.x = f.x * st.speed; st.vel.z = f.z * st.speed;
  if (st.rollT > 0) {
    const r = V2.set(f.z, 0, -f.x).multiplyScalar(st.rollDir * T.rollSpeed);   // +X side of the dragon
    st.vel.x = r.x + f.x * st.speed * 0.3; st.vel.z = r.z + f.z * st.speed * 0.3;
  }
  st.vel.y = 0;
  if (input.pressed('cross')) {
    st.mode = 'air'; st.grounded = false; st.vel.y = T.jumpV; st.airT = 0;
    st.glided = false; st.hovered = false;
    if (!st.charging) st.charging = false;
    for (let k = 0; k < 4; k++) fxDust.spawn(V1.copy(st.pos).add(V2.set(0, 0.2, 0)), V3.set((Math.random() - 0.5) * 8, 1, (Math.random() - 0.5) * 8), 0.35, 0.7, 1.6, 1);
  }
}

function airMove(dt, dir) {
  const st = P;
  st.airT += dt;
  if (!st.bash) {
    const h = Math.hypot(st.vel.x, st.vel.z);
    if (dir) {
      const maxS = Math.max(T.run * dir.m, st.charging ? T.charge : 0, Math.min(h, T.charge));
      st.vel.x = approach(st.vel.x, dir.x * maxS, T.airAccel * dt * Math.max(0.3, Math.abs(dir.x)));
      st.vel.z = approach(st.vel.z, dir.z * maxS, T.airAccel * dt * Math.max(0.3, Math.abs(dir.z)));
      st.yaw = turnTo(st.yaw, Math.atan2(dir.x, dir.z), 9 * dt);
    } else if (!st.charging) {
      st.vel.x = approach(st.vel.x, 0, 6 * dt); st.vel.z = approach(st.vel.z, 0, 6 * dt);
    }
    st.vel.y = Math.max(-T.maxFall, st.vel.y - T.gravity * dt);
    // Cross in the air: glide (once per jump)
    if (input.pressed('cross') && !st.glided) {
      st.mode = 'glide'; st.glided = true; st.speed = Math.max(T.glideSpeed, h); setMode('GLIDE');
    }
    // Triangle in the air: headbash straight down
    if (input.pressed('triangle')) { st.bash = true; st.vel.set(0, -T.bashV, 0); setMode(''); }
  } else {
    st.vel.y = Math.max(-T.maxFall, st.vel.y - T.gravity * dt);
  }
  if (st.hoverT > 0) { st.hoverT -= dt; st.vel.y = T.hoverV * (st.hoverT / T.hoverTime) + 4; }
}

function glideMove(dt, dir) {
  const st = P;
  if (dir) st.yaw = turnTo(st.yaw, Math.atan2(dir.x, dir.z), T.glideTurn * dt * dir.m);
  st.speed = approach(st.speed, T.glideSpeed, 12 * dt);
  const f = fwd(st.yaw, V1);
  st.vel.x = f.x * st.speed; st.vel.z = f.z * st.speed;
  st.vel.y = approach(st.vel.y, -T.glideSink, 60 * dt);
  // Cross again: hover (a short flapping lift that ends the glide)
  if (input.pressed('cross') && !st.hovered) {
    st.hovered = true; st.mode = 'air'; st.hoverT = T.hoverTime; setMode('');
  }
  if (input.pressed('triangle')) { st.mode = 'air'; st.bash = true; st.vel.set(0, -T.bashV, 0); setMode(''); }
}

function flyMove(dt) {
  const st = P;
  // flight-level controls: left/right yaw (with bank), up dives, down climbs; Cross faster, Square slower
  const sx = input.stick.x, sy = input.stick.y;
  st.yaw -= sx * T.flyYaw * dt;
  st.flyBank += (-sx * 0.7 - st.flyBank) * (1 - Math.exp(-6 * dt));
  if (Math.abs(sy) > 0.1) st.flyPitch = THREE.MathUtils.clamp(st.flyPitch + sy * T.flyPitch * dt, -1.1, 1.1);
  else st.flyPitch *= Math.exp(-0.8 * dt);
  const target = input.held('cross') ? T.flyBoost : input.held('square') ? T.flySlow : T.flySpeed;
  st.flySpeed = approach(st.flySpeed, target, 50 * dt);
  const cp = Math.cos(st.flyPitch);
  st.vel.set(Math.sin(st.yaw) * cp * st.flySpeed, -Math.sin(st.flyPitch) * st.flySpeed, Math.cos(st.yaw) * cp * st.flySpeed);
  // L2 / R2: barrel roll
  if (st.rollT <= 0 && (input.pressed('l2') || input.pressed('r2'))) { st.rollT = T.rollTime * 1.4; st.rollDir = input.pressed('l2') ? 1 : -1; }
}

function integrate(dt) {
  const st = P;
  const n = Math.max(1, Math.ceil(st.vel.length() * dt / 0.7));
  const h = dt / n;
  const c = V3;
  for (let k = 0; k < n; k++) {
    st.pos.addScaledVector(st.vel, h);
    // body sphere: walls, ceilings
    c.set(st.pos.x, st.pos.y + CENTRE_H, st.pos.z);
    const before = c.clone();
    const hit = col.pushSphere(c, T.radius);
    if (hit.hit) {
      const d = c.clone().sub(before);
      st.pos.add(d);
      const l = Math.hypot(hit.nx, hit.ny, hit.nz) || 1;
      const nx = hit.nx / l, ny = hit.ny / l, nz = hit.nz / l;
      const vn = st.vel.x * nx + st.vel.y * ny + st.vel.z * nz;
      if (vn < 0) {
        st.vel.x -= nx * vn; st.vel.y -= ny * vn; st.vel.z -= nz * vn;
        if (st.mode === 'ground') {
          // charging head-first into a wall: bonk back
          if (st.charging && -vn > 25 && Math.abs(ny) < 0.5) { st.speed = -12; cam.shake = 0.2; }
          else st.speed = Math.hypot(st.vel.x, st.vel.z) * Math.sign(st.speed || 1);
        }
        if (st.mode === 'fly' && ny > 0.4) st.flyPitch = Math.min(st.flyPitch, -0.25);   // pull up off the ground
      }
      if (hit.ceiling && st.vel.y > 0) st.vel.y = 0;
    }
    // feet: ground probe
    const top = st.pos.y + CENTRE_H;
    const reach = st.mode === 'ground' ? CENTRE_H + 1.4 : CENTRE_H + Math.max(0, -st.vel.y * h) + 0.05;
    const g = col.ray(st.pos.x, top, st.pos.z, 0, -1, 0, reach);
    if (g) {
      const gy = top - g.t;
      st.groundN.set(g.nx, g.ny, g.nz);
      const walkable = g.ny > 0.55;
      if (st.mode === 'ground') {
        if (walkable) st.pos.y = gy;
        else { st.mode = 'air'; st.grounded = false; st.pos.y = Math.max(st.pos.y, gy); st.vel.x += g.nx * 8; st.vel.z += g.nz * 8; }
      } else if (st.mode === 'fly') {
        if (st.pos.y < gy + 0.2) { st.pos.y = gy + 0.2; st.flyPitch = Math.min(st.flyPitch, -0.3); }
      } else if (st.vel.y <= 0 && st.pos.y <= gy + 0.05) {
        st.pos.y = gy;
        if (walkable) land();
        else { st.vel.x += g.nx * 20 * h; st.vel.z += g.nz * 20 * h; st.vel.y = Math.max(st.vel.y, -8); }
      }
    } else if (st.mode === 'ground') {
      st.mode = 'air'; st.grounded = false; st.airT = 0; st.glided = false;
    }
  }
  // world edge: an invisible wall short of the hill rim; fell out: back to spawn
  const r = Math.hypot(st.pos.x, st.pos.z), lim = (info?.r_out || 1250) - 140;
  if (r > lim) { st.pos.x *= lim / r; st.pos.z *= lim / r; }
  if (st.pos.y < -60) { st.pos.set(...info.spawn); st.vel.set(0, 0, 0); st.mode = 'ground'; }
  if (st.pos.y > 600) { st.pos.y = 600; if (st.vel.y > 0) st.vel.y = 0; }
}

function updateGems(dt) {
  const t = performance.now() / 1000;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const centre = V1.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
  const dirty = {};
  for (const g of gems) {
    if (g.got) continue;
    const d = g.pos.distanceTo(centre);
    if (d < 9 && !g.pull) g.pull = true;           // gems fly to you when you're close
    if (g.pull) {
      const sp = Math.min(d, 55 * dt);
      g.pos.addScaledVector(V2.subVectors(centre, g.pos).normalize(), sp);
      if (d < 1.8) {
        g.got = true; gemGot += g.v;
        hud.gemN.textContent = `${gemGot} / ${gemTotal}`;
        hud.gems.classList.add('show'); gemShowT = 3;
        for (let k = 0; k < 10; k++) fx.spawn(g.pos, V3.set((Math.random() - 0.5) * 18, Math.random() * 14, (Math.random() - 0.5) * 18), 0.5, 0.9, 0.2, 3);
      }
    }
    const k = g.v;
    const sc = g.got ? 0 : (k >= 10 ? 1.25 : 1.0) * (g.pull ? Math.max(0.4, Math.min(1, d / 6)) : 1);
    q.setFromAxisAngle(V3.set(0, 1, 0), t * 2.4 + g.i);
    const bob = g.pull ? 0 : Math.sin(t * 2 + g.i * 0.7) * 0.25;
    m.compose(V3.set(g.pos.x, g.pos.y + bob, g.pos.z), q, s.set(sc, sc, sc));
    gemSets[k].setMatrixAt(g.i, m);
    dirty[k] = true;
  }
  for (const g of gems) if (g.got && !g.cleared) { gemSets[g.v].setMatrixAt(g.i, m.makeScale(0, 0, 0)); g.cleared = true; dirty[g.v] = true; }
  for (const k in dirty) gemSets[k].instanceMatrix.needsUpdate = true;
}

function emitFx(dt) {
  if (P.flameT > 0) {
    const mouth = dragon.mouthWorld(V1);
    const f = fwd(P.yaw, V2);
    if (P.mode === 'fly') f.set(Math.sin(P.yaw) * Math.cos(P.flyPitch), -Math.sin(P.flyPitch), Math.cos(P.yaw) * Math.cos(P.flyPitch));
    for (let k = 0; k < 5; k++) {
      const v = V3.copy(f).multiplyScalar(36 + Math.random() * 14).add(P.vel)
        .add(new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.4) * 7, (Math.random() - 0.5) * 9));
      fx.spawn(mouth, v, 0.3 + Math.random() * 0.12, 0.5, 2.2, 0);
    }
    if (Math.random() < 0.4) fxDust.spawn(V3.copy(mouth).addScaledVector(f, 6), V2.set((Math.random() - 0.5) * 4, 6, (Math.random() - 0.5) * 4).addScaledVector(P.vel, 0.4), 1.4, 1.5, 6, 2);
  }
  if (P.charging && P.mode === 'ground' && Math.random() < 0.5) {
    fxDust.spawn(V1.copy(P.pos).add(V2.set((Math.random() - 0.5), 0.3, (Math.random() - 0.5))), V3.set((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4), 0.5, 0.7, 2.0, 1);
  }
}

// ---------------------------------------------------------------- camera
function updateCamera(dt) {
  const st = P;
  if (FREECAM) {
    const v = FREECAM.split(',').map(Number);
    camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
    return;
  }
  const head = V1.set(st.pos.x, st.pos.y + 2.6, st.pos.z);
  if (st.look) {
    camera.position.copy(head).addScaledVector(fwd(st.yaw), 1.2).add(V2.set(0, 0.3, 0));
    const d = V2.set(Math.sin(st.lookYaw) * Math.cos(st.lookPitch), Math.sin(st.lookPitch), Math.cos(st.lookYaw) * Math.cos(st.lookPitch));
    camera.lookAt(V3.copy(camera.position).add(d));
    dragon.root.visible = false;
    return;
  }
  dragon.root.visible = true;
  const moving = Math.hypot(st.vel.x, st.vel.z) > 3;
  let dist = T.camDist, height = T.camHeight, pitch = cam.pitch;
  if (st.mode === 'glide') { dist = 16; height = 6; }
  if (st.mode === 'fly') {
    // chase cam locked behind, following the dive / climb a little
    cam.yaw = turnTo(cam.yaw, st.yaw, 4 * dt);
    dist = 17 + (st.flySpeed - T.flySpeed) * 0.08;
    pitch = 0.22 + st.flyPitch * 0.45;
  } else if (moving && cam.manualT <= 0 && !st.look) {
    // follow: swing behind the dragon, but not when it runs toward the camera
    const diff = wrap(st.yaw - cam.yaw);
    if (Math.abs(diff) < 2.3) cam.yaw += diff * Math.min(1, dt * (st.mode === 'glide' ? 2.2 : 1.6));
  }
  cam.dist += (dist - cam.dist) * (1 - Math.exp(-3 * dt));
  const target = V2.copy(head).add(V3.set(0, 0.6, 0));
  const back = fwd(cam.yaw, new THREE.Vector3()).multiplyScalar(-1);
  const want = new THREE.Vector3().copy(target).addScaledVector(back, cam.dist * Math.cos(pitch)).add(new THREE.Vector3(0, height * 0.35 + cam.dist * Math.sin(pitch), 0));
  if (!cam.inited) { cam.pos.copy(want); cam.inited = true; }
  cam.pos.lerp(want, 1 - Math.exp(-(st.mode === 'fly' ? 7 : 9) * dt));
  // keep the camera out of walls and roofs: ray from the dragon's head to the camera
  const d = V3.subVectors(cam.pos, target);
  const L = d.length();
  d.divideScalar(L);
  const hit = col.ray(target.x, target.y, target.z, d.x, d.y, d.z, L + 0.8);
  const camPos = hit ? new THREE.Vector3().copy(target).addScaledVector(d, Math.max(2.0, hit.t - 0.8)) : cam.pos.clone();
  if (cam.shake > 0) {
    cam.shake -= dt;
    camPos.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(cam.shake * 2));
  }
  camera.position.copy(camPos);
  camera.lookAt(target.x + Math.sin(st.yaw) * 1.0, target.y - 0.4, target.z + Math.cos(st.yaw) * 1.0);
}

// ---------------------------------------------------------------- render
let sunCheckT = 0;
function render(dt = 1 / 60) {
  const st = P;
  dragon.root.position.copy(st.pos);
  dragon.root.rotation.set(0, st.yaw, 0);
  const hs = Math.hypot(st.vel.x, st.vel.z);
  const mode = st.mode === 'ground' ? (st.charging ? 'charge' : hs > 0.5 ? 'run' : 'idle')
    : st.mode === 'air' ? (st.bash ? 'bash' : st.hoverT > 0 ? 'hover' : st.vel.y > 0 ? 'jump' : 'fall')
      : st.mode;
  dragon.update(dt, { mode, speed: hs, vy: st.vel.y, flame: st.flameT > 0, rollT: st.rollT > 0 ? st.rollT / (st.mode === 'fly' ? T.rollTime * 1.4 : T.rollTime) : 0,
    rollDir: st.rollDir, bank: st.mode === 'fly' ? st.flyBank : 0,
    flapRate: st.mode === 'fly' ? (st.flySpeed > T.flySpeed + 5 ? 11 : st.flyPitch < -0.2 ? 9 : 5) : 0 });
  if (st.mode === 'fly') dragon.body.rotation.x = st.flyPitch * 0.8;

  // dragon in the building shadows? one ray toward the sun now and then dims its sun light
  sunCheckT -= dt;
  if (sunCheckT <= 0 && info) {
    sunCheckT = 0.15;
    const s = info.sun;
    const h = col.ray(st.pos.x, st.pos.y + 1.8, st.pos.z, s[0], s[1], s[2], 400);
    st.inSun = h ? 0 : 1;
  }
  sunLight.intensity += ((st.inSun ? 2.0 : 0.35) - sunLight.intensity) * 0.2;

  // blob shadow straight down
  const g = col.ray(st.pos.x, st.pos.y + CENTRE_H, st.pos.z, 0, -1, 0, 400);
  if (g) {
    const gy = st.pos.y + CENTRE_H - g.t;
    const hgt = st.pos.y - gy;
    shadow.visible = true;
    shadow.position.set(st.pos.x, gy + 0.06, st.pos.z);
    shadow.quaternion.setFromUnitVectors(V1.set(0, 1, 0), V2.set(g.nx, g.ny, g.nz));
    const sc = Math.max(0.5, 1.7 - hgt * 0.012);
    shadow.scale.set(sc, 1, sc);
    shadow.material.uniforms.alpha.value = Math.max(0.15, 0.55 - hgt * 0.004);
  } else shadow.visible = false;

  fx.update(dt); fxDust.update(dt);
  // point size in drawing-buffer pixels for a particle `psize` feet across at depth 1
  fx.mat.uniforms.scale.value = fxDust.mat.uniforms.scale.value = renderer.domElement.height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  sky.position.copy(camera.position);

  // HUD: gem counter and building names fade
  gemShowT -= dt; if (gemShowT < 0) hud.gems.classList.remove('show');
  bannerT -= dt; if (bannerT < 0) hud.banner.classList.remove('show');
  if (info) {
    let here = null;
    for (const b of info.buildings) {
      const [x0, z0, x1, z1] = b.box;
      if (st.pos.x > x0 - 12 && st.pos.x < x1 + 12 && st.pos.z > z0 - 12 && st.pos.z < z1 + 12) { here = b; break; }
    }
    if (here && here !== currentBuilding) showBanner(`${here.label} · ${here.map_name.split(';')[0].replace(/ \(B1\)$/, '')}`, here.bid_name);
    currentBuilding = here;
  }
  renderer.render(scene, camera);
}

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; acc += dt;
  let n = 0;
  while (acc >= 1 / 60 && n < 6) { step(1 / 60); acc -= 1 / 60; n++; }
  if (n === 6) acc = 0;
  render(dt);
  requestAnimationFrame(frame);
}

// help overlay (Start)
addEventListener('keydown', (e) => { if (e.code === 'KeyH') hud.help.classList.toggle('show'); });
document.getElementById('helpbtn')?.addEventListener('click', () => hud.help.classList.toggle('show'));
hud.help.addEventListener('click', () => hud.help.classList.remove('show'));
if ('ontouchstart' in window || Q.get('touch') === '1') document.body.classList.add('touch');

// hooks for headless checks
window.__game = {
  P, cam, input, T,
  step: (sec = 1 / 60) => { for (let k = 0; k < Math.round(sec * 60); k++) step(1 / 60); render(Math.max(1 / 60, sec)); },
  press: (buttons = [], stick = { x: 0, y: 0 }) => { input.inject = { buttons: new Set(buttons), stick }; },
  state: () => ({ mode: P.mode, pos: P.pos.toArray().map((v) => +v.toFixed(2)), vel: P.vel.toArray().map((v) => +v.toFixed(2)),
    yaw: +P.yaw.toFixed(3), gems: gemGot, bash: P.bash, charging: P.charging }),
};

load().catch((e) => { document.title = JSON.stringify({ ok: false, error: String(e) }); console.error(e); });
