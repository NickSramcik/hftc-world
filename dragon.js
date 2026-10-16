// A small low-poly dragon in the PS1 platformer mould: big head and eyes, short body,
// four stubby legs, little wings, a long tail with an arrowhead tip. Orange, with a
// cream belly and curly ram horns. Built from vertex-coloured parts on a simple rig
// (groups for head, jaw, legs, wings and tail segments) and animated procedurally.
// Units are feet; the root sits on the ground between the feet, facing +Z.
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
const ORANGE = C('#f27a1a'), ORANGE_DK = C('#c4521a'), CREAM = C('#ffe08c'), CREAM_DK = C('#f0b95a');
const HORN = C('#f7ecd2'), HORN_DK = C('#c9b48a'), WING = C('#ffb43a'), WING_DK = C('#ef8a22');
const WHITE = C('#ffffff'), PUPIL = C('#1b5e63'), DARK = C('#3a1a10'), SPIKE = C('#ffd23a');

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const MAT2 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

function colorize(geo, fn) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const col = fn(v);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Ellipsoid with low segment counts; `shape(v)` may push vertices around (unit sphere space).
function ellipsoid(rx, ry, rz, ws, hs, fn, shape) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (shape) shape(v);
    p.setXYZ(i, v.x * rx, v.y * ry, v.z * rz);
  }
  return colorize(g.toNonIndexed(), fn);
}

// Tube through points with radii; fn(t, v) colours by curve parameter t (0..1).
function tube(pts, radii, sides, fn) {
  const pos = [], cols = [];
  const rings = [];
  const n = pts.length;
  // parallel-transport frame: each ring's axis `a` is the previous one with the
  // tangent component removed, so rings don't twist along the curve
  let a = null;
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3().subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
    if (!a) {
      const ref = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      a = new THREE.Vector3().crossVectors(t, ref).normalize();
    } else a = a.clone().addScaledVector(t, -a.dot(t)).normalize();
    const b = new THREE.Vector3().crossVectors(t, a).normalize();
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      ring.push(pts[i].clone().addScaledVector(a, Math.cos(ang) * radii[i]).addScaledVector(b, Math.sin(ang) * radii[i]));
    }
    rings.push(ring);
  }
  const push = (v, t) => { pos.push(v.x, v.y, v.z); const c = fn(t, v); cols.push(c.r, c.g, c.b); };
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const k = (j + 1) % sides, t0 = i / (n - 1), t1 = (i + 1) / (n - 1);
      push(rings[i][j], t0); push(rings[i + 1][j], t1); push(rings[i][k], t0);
      push(rings[i][k], t0); push(rings[i + 1][j], t1); push(rings[i + 1][k], t1);
    }
  }
  // end cap
  const last = rings[n - 1], c = pts[n - 1];
  for (let j = 0; j < sides; j++) { push(last[j], 1); push(c, 1); push(last[(j + 1) % sides], 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

function cone(r, h, sides, col) {
  const g = new THREE.ConeGeometry(r, h, sides, 1);
  g.translate(0, h / 2, 0);
  return colorize(g.toNonIndexed(), () => col);
}

function mesh(geo, mat = MAT) { const m = new THREE.Mesh(geo, mat); return m; }

export class Dragon {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();          // pitch / roll / bob
    this.root.add(this.body);
    this.t = 0; this.phase = 0; this.blinkT = 2; this.flap = 0;
    this.pose = { wingSpread: 0, legTuck: 0, headDown: 0, jaw: 0 };

    // torso: pear shaped, cream belly
    const torso = mesh(ellipsoid(0.62, 0.6, 1.0, 9, 7, (v) => {
      const belly = THREE.MathUtils.smoothstep(-v.y / 0.6 + v.z * 0.25, 0.05, 0.45);
      return ORANGE.clone().lerp(CREAM, belly);
    }, (v) => { v.y *= 1 + 0.12 * v.z; v.x *= 1 + 0.1 * v.z; }));
    torso.position.set(0, 1.22, 0);
    this.body.add(torso);

    // spine spikes
    for (const [z, y, s] of [[0.35, 1.84, 1], [-0.05, 1.86, 0.9], [-0.45, 1.76, 0.8], [-0.8, 1.55, 0.65]]) {
      const sp = mesh(cone(0.11 * s, 0.32 * s, 4, SPIKE));
      sp.position.set(0, y - 0.05, z); sp.rotation.x = -0.35;
      this.body.add(sp);
    }

    // neck
    this.body.add(mesh(tube([new THREE.Vector3(0, 1.45, 0.6), new THREE.Vector3(0, 1.8, 0.9), new THREE.Vector3(0, 2.0, 1.02)],
      [0.36, 0.32, 0.3], 7, (t, v) => ORANGE.clone().lerp(CREAM, THREE.MathUtils.smoothstep(-(v.y - 1.75) * 3 + (v.z - 0.8) * 2, 0.4, 1.2)))));

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, 2.05, 1.1);
    this.body.add(this.head);
    const cran = mesh(ellipsoid(0.56, 0.5, 0.6, 9, 7, (v) => ORANGE.clone().lerp(CREAM, THREE.MathUtils.smoothstep(-v.y, 0.25, 0.5)),
      (v) => { v.z *= 1 + 0.1 * v.y; }));
    cran.position.set(0, 0.22, 0.0);
    this.head.add(cran);
    const snout = mesh(ellipsoid(0.4, 0.32, 0.52, 8, 6, (v) => ORANGE.clone().lerp(CREAM, THREE.MathUtils.smoothstep(-v.y, 0.05, 0.25)),
      (v) => { v.x *= 1 - 0.15 * Math.max(0, v.z); }));
    snout.position.set(0, 0.04, 0.55);
    this.head.add(snout);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.12, 0.22);
    this.head.add(this.jaw);
    const jaw = mesh(ellipsoid(0.33, 0.13, 0.46, 8, 4, () => CREAM));
    jaw.position.set(0, -0.06, 0.36);
    this.jaw.add(jaw);
    const mouth = mesh(ellipsoid(0.26, 0.05, 0.36, 6, 3, () => C('#b0302a')));
    mouth.position.set(0, 0.02, 0.38);
    this.jaw.add(mouth);
    for (const s of [1, -1]) {
      const no = mesh(ellipsoid(0.05, 0.04, 0.03, 5, 3, () => DARK));
      no.position.set(0.13 * s, 0.17, 1.03);
      this.head.add(no);
      // eyes: big whites, teal pupils with a highlight
      const eye = new THREE.Group();
      eye.position.set(0.26 * s, 0.33, 0.36);
      eye.rotation.y = 0.32 * s;
      this.head.add(eye);
      eye.add(mesh(ellipsoid(0.16, 0.23, 0.12, 8, 6, () => WHITE)));
      const pu = mesh(ellipsoid(0.085, 0.14, 0.05, 6, 5, () => PUPIL));
      pu.position.set(0.0, 0.0, 0.09);
      eye.add(pu);
      const hl = mesh(ellipsoid(0.03, 0.04, 0.02, 4, 3, () => WHITE));
      hl.position.set(0.03 * s, 0.06, 0.13);
      eye.add(hl);
      (this.eyes ||= []).push(eye);
      const brow = mesh(ellipsoid(0.2, 0.07, 0.13, 6, 3, () => ORANGE_DK));
      brow.position.set(0.25 * s, 0.56, 0.33); brow.rotation.z = -0.25 * s;
      this.head.add(brow);
      // curly ram horn: up, back, down and round, shrinking as it curls, drifting outward
      const pts = [], rad = [];
      const R0 = 0.3, turns = 1.55;
      for (let i = 0; i <= 22; i++) {
        const u = i / 22, ph = u * turns * Math.PI * 2;
        const R = R0 * (1 - 0.55 * u);
        const z = -R + R * Math.cos(ph) - 0.02, y = R * Math.sin(ph);
        pts.push(new THREE.Vector3(s * (0.3 + 0.22 * u), 0.56 + y, -0.1 + z));
        rad.push(0.12 * (1 - 0.75 * u) + 0.015);
      }
      const horn = mesh(tube(pts, rad, 6, (t) => (Math.floor(t * 22) % 2 ? HORN : HORN.clone().lerp(HORN_DK, 0.55))));
      this.head.add(horn);
    }
    for (const [z, y, s] of [[-0.25, 0.66, 1], [-0.48, 0.52, 0.8]]) {
      const sp = mesh(cone(0.1 * s, 0.3 * s, 4, SPIKE));
      sp.position.set(0, y, z); sp.rotation.x = -0.7;
      this.head.add(sp);
    }

    // legs
    this.legs = [];
    for (const [x, z, front] of [[0.4, 0.55, true], [-0.4, 0.55, true], [0.44, -0.5, false], [-0.44, -0.5, false]]) {
      const g = new THREE.Group();
      g.position.set(x, 1.0, z);
      const leg = mesh(tube([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0, -0.45, front ? 0.04 : -0.08), new THREE.Vector3(0, -0.85, 0.06)],
        [0.24, 0.17, 0.14], 6, (t) => ORANGE.clone().lerp(ORANGE_DK, t * 0.4)));
      g.add(leg);
      const foot = mesh(ellipsoid(0.17, 0.1, 0.26, 6, 4, (v) => (v.z > 0.12 ? CREAM : ORANGE)));
      foot.position.set(0, -0.92, 0.14);
      g.add(foot);
      this.body.add(g);
      this.legs.push({ g, front, side: Math.sign(x) });
    }

    // wings: three finger bones and an amber membrane, spread along +X (left)
    this.wings = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(0.32 * s, 1.72, 0.25);
      const w = new THREE.Group();
      w.scale.x = s;
      g.add(w);
      const tips = [new THREE.Vector3(1.7, 0.55, -0.25), new THREE.Vector3(1.45, 0.2, -0.9), new THREE.Vector3(0.9, 0.0, -1.25)];
      const root = new THREE.Vector3(0, 0, 0), elbow = new THREE.Vector3(0.75, 0.35, 0.05);
      w.add(mesh(tube([root, elbow, tips[0]], [0.07, 0.06, 0.03], 4, () => ORANGE)));
      for (const tp of tips.slice(1)) w.add(mesh(tube([elbow, tp], [0.04, 0.02], 4, () => ORANGE)));
      const pos = [], col = [];
      const tri = (a, b, c, ca, cb, cc) => { for (const [v, k] of [[a, ca], [b, cb], [c, cc]]) { pos.push(v.x, v.y, v.z); col.push(k.r, k.g, k.b); } };
      const notch = (a, b) => a.clone().lerp(b, 0.5).add(new THREE.Vector3(-0.12, -0.05, 0.12));
      tri(root, elbow, tips[2], WING_DK, WING, WING);
      tri(elbow, tips[0], notch(tips[0], tips[1]), WING, WING, WING_DK);
      tri(elbow, notch(tips[0], tips[1]), tips[1], WING, WING_DK, WING);
      tri(elbow, tips[1], notch(tips[1], tips[2]), WING, WING, WING_DK);
      tri(elbow, notch(tips[1], tips[2]), tips[2], WING, WING_DK, WING);
      tri(root, tips[2], new THREE.Vector3(0.1, -0.05, -0.7), WING_DK, WING, WING_DK);
      const mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      w.add(mesh(mg, MAT2));
      this.body.add(g);
      this.wings.push({ g, s });
    }

    // tail: chain of segments, arrowhead tip
    this.tail = [];
    let parent = this.body;
    const segL = 0.5;
    const radii = [0.3, 0.24, 0.19, 0.14, 0.1, 0.07];
    for (let i = 0; i < radii.length; i++) {
      const g = new THREE.Group();
      if (i === 0) g.position.set(0, 1.12, -0.85); else g.position.set(0, 0, -segL);
      const r1 = radii[i + 1] ?? 0.05;
      g.add(mesh(tube([new THREE.Vector3(0, 0, 0.06), new THREE.Vector3(0, 0, -segL - 0.04)], [radii[i], r1], 6,
        (t, v) => ORANGE.clone().lerp(CREAM, THREE.MathUtils.smoothstep(-v.y / radii[i], 0.5, 0.9)))));
      parent.add(g);
      this.tail.push(g);
      parent = g;
    }
    const tip = new THREE.Group();
    tip.position.set(0, 0, -segL);
    parent.add(tip);
    const ag = new THREE.OctahedronGeometry(1, 0);
    ag.scale(0.28, 0.06, 0.42);
    ag.translate(0, 0, -0.3);
    tip.add(mesh(colorize(ag.toNonIndexed(), (v) => (v.z < -0.3 ? SPIKE : CREAM_DK))));

    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }

  mouthWorld(out) {
    return this.head.localToWorld(out.set(0, -0.05, 1.15));
  }

  // s: { mode, speed (ft/s, ground), vy, flame, rollT, rollDir, bank, flapRate }
  update(dt, s) {
    this.t += dt;
    const k = (rate) => 1 - Math.exp(-rate * dt);
    const P = this.pose;
    const air = ['jump', 'fall', 'glide', 'hover', 'bash', 'fly'].includes(s.mode);
    const spread = ['glide', 'hover', 'fly'].includes(s.mode) ? 1 : s.mode === 'jump' || s.mode === 'fall' ? 0.45 : 0;
    P.wingSpread += (spread - P.wingSpread) * k(10);
    P.legTuck += ((air ? 1 : 0) - P.legTuck) * k(12);
    P.headDown += ((s.mode === 'charge' ? 1 : 0) - P.headDown) * k(10);
    P.jaw += ((s.flame ? 1 : 0) - P.jaw) * k(25);

    // run cycle
    const moving = !air && s.speed > 0.5;
    this.phase += dt * (moving ? s.speed / 3.2 : 0.6) * Math.PI * 2 * (s.mode === 'charge' ? 0.8 : 1);
    const amp = moving ? Math.min(1, s.speed / 18) * (s.mode === 'charge' ? 1.1 : 0.85) : 0;
    for (const L of this.legs) {
      const off = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      const swing = Math.sin(this.phase + off) * amp;
      const tuck = L.front ? -0.9 : 1.0;
      const glideLegs = s.mode === 'glide' || s.mode === 'fly' ? (L.front ? -0.4 : 1.3) : tuck;
      L.g.rotation.x = swing * (1 - P.legTuck) + glideLegs * P.legTuck;
      L.g.position.y = 1.0 + Math.max(0, Math.cos(this.phase + off)) * 0.12 * amp * (1 - P.legTuck);
    }
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.09 * amp : Math.sin(this.t * 2.2) * 0.025;
    this.body.position.y = bob;

    // body pitch and roll
    let pitch = 0;
    if (s.mode === 'charge') pitch = 0.18;
    else if (s.mode === 'glide') pitch = 0.08;
    else if (s.mode === 'bash') pitch = 1.1;
    else if (s.mode === 'fly') pitch = -s.vy / 60;
    else if (air) pitch = THREE.MathUtils.clamp(-s.vy / 70, -0.35, 0.35);
    this.body.rotation.x += (pitch - this.body.rotation.x) * k(10);
    let roll = (s.bank || 0);
    if (s.rollT > 0) roll += (1 - s.rollT) * Math.PI * 2 * s.rollDir;
    this.body.rotation.z = roll;

    // head
    this.head.rotation.x = P.headDown * 0.55 + (moving ? Math.sin(this.phase * 2) * 0.04 : Math.sin(this.t * 1.3) * 0.03);
    this.head.position.z = 1.1 + P.headDown * 0.1;
    this.head.position.y = 2.05 - P.headDown * 0.25;
    this.jaw.rotation.x = P.jaw * 0.55;

    // blink
    this.blinkT -= dt;
    const shut = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = shut ? 0.15 : 1;

    // wings: folded along the back <-> spread; flapping when hovering or flying
    const rate = s.mode === 'hover' ? 16 : s.mode === 'fly' ? (s.flapRate || 7) : s.mode === 'glide' ? 2.2 : 3;
    this.flap += dt * rate;
    const flapAmp = s.mode === 'hover' ? 0.75 : s.mode === 'fly' ? 0.55 : s.mode === 'glide' ? 0.08 : s.mode === 'jump' ? 0.3 : 0;
    for (const W of this.wings) {
      const f = Math.sin(this.flap) * flapAmp;
      const foldY = 1.1, foldZ = 0.55;
      W.g.rotation.set(0, W.s * (foldY * (1 - P.wingSpread) + 0.12 * P.wingSpread), W.s * (foldZ * (1 - P.wingSpread) + (0.08 + f) * P.wingSpread));
    }

    // tail sway, trailing in the air
    for (let i = 0; i < this.tail.length; i++) {
      const g = this.tail[i];
      const sway = Math.sin(this.t * (moving ? 6 : 2) - i * 0.7) * (moving ? 0.12 : 0.1);
      g.rotation.y = sway;
      const lift = air ? (s.mode === 'bash' ? -0.25 : 0.02) : (i === 0 ? -0.15 : 0.06);
      g.rotation.x += (lift - g.rotation.x) * k(8);
    }
  }
}
