// Collision against the world's "collision" triangles: a uniform grid over X/Z,
// sphere push-out (closest point on triangle) and ray casts. Units are feet.

const CELL = 12;

export class CollisionWorld {
  constructor(positions, index) {
    const nt = index.length / 3;
    this.n = nt;
    const tri = new Float32Array(nt * 9);
    const nrm = new Float32Array(nt * 3);
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const v = index[t * 3 + k] * 3;
        tri[t * 9 + k * 3] = positions[v];
        tri[t * 9 + k * 3 + 1] = positions[v + 1];
        tri[t * 9 + k * 3 + 2] = positions[v + 2];
      }
      const o = t * 9;
      const e1x = tri[o + 3] - tri[o], e1y = tri[o + 4] - tri[o + 1], e1z = tri[o + 5] - tri[o + 2];
      const e2x = tri[o + 6] - tri[o], e2y = tri[o + 7] - tri[o + 1], e2z = tri[o + 8] - tri[o + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm[t * 3] = nx / l; nrm[t * 3 + 1] = ny / l; nrm[t * 3 + 2] = nz / l;
      for (let k = 0; k < 3; k++) {
        const x = tri[o + k * 3], z = tri[o + k * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    this.tri = tri; this.nrm = nrm;
    this.x0 = minX - 1; this.z0 = minZ - 1;
    this.nx = Math.ceil((maxX - minX + 2) / CELL);
    this.nz = Math.ceil((maxZ - minZ + 2) / CELL);
    // counting sort of triangles into cells
    const counts = new Uint32Array(this.nx * this.nz + 1);
    const span = (t, f) => {
      const o = t * 9;
      const ax = Math.min(tri[o], tri[o + 3], tri[o + 6]), bx = Math.max(tri[o], tri[o + 3], tri[o + 6]);
      const az = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), bz = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
      const i0 = Math.floor((ax - this.x0) / CELL), i1 = Math.floor((bx - this.x0) / CELL);
      const j0 = Math.floor((az - this.z0) / CELL), j1 = Math.floor((bz - this.z0) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * this.nx + i);
    };
    for (let t = 0; t < nt; t++) span(t, (c) => counts[c + 1]++);
    for (let c = 0; c < this.nx * this.nz; c++) counts[c + 1] += counts[c];
    const start = counts.slice();
    const items = new Uint32Array(counts[this.nx * this.nz]);
    for (let t = 0; t < nt; t++) span(t, (c) => { items[start[c]++] = t; });
    this.cellStart = counts; this.items = items;
    this.stamp = new Uint32Array(nt); this.stampN = 1;
    this.tmp = { x: 0, y: 0, z: 0 };
  }

  // Calls f(t) once for every triangle in cells overlapping the X/Z box.
  each(ax, az, bx, bz, f) {
    const s = ++this.stampN;
    const i0 = Math.max(0, Math.floor((ax - this.x0) / CELL)), i1 = Math.min(this.nx - 1, Math.floor((bx - this.x0) / CELL));
    const j0 = Math.max(0, Math.floor((az - this.z0) / CELL)), j1 = Math.min(this.nz - 1, Math.floor((bz - this.z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * this.nx + i;
      for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
        const t = this.items[k];
        if (this.stamp[t] === s) continue;
        this.stamp[t] = s;
        f(t);
      }
    }
  }

  // Closest point on triangle t to p (Ericson, Real-Time Collision Detection 5.1.5) -> this.tmp
  closest(t, px, py, pz) {
    const T = this.tri, o = t * 9, r = this.tmp;
    const ax = T[o], ay = T[o + 1], az = T[o + 2];
    const abx = T[o + 3] - ax, aby = T[o + 4] - ay, abz = T[o + 5] - az;
    const acx = T[o + 6] - ax, acy = T[o + 7] - ay, acz = T[o + 8] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) { r.x = ax; r.y = ay; r.z = az; return r; }
    const bpx = px - T[o + 3], bpy = py - T[o + 4], bpz = pz - T[o + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { r.x = T[o + 3]; r.y = T[o + 4]; r.z = T[o + 5]; return r; }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3); r.x = ax + abx * v; r.y = ay + aby * v; r.z = az + abz * v; return r;
    }
    const cpx = px - T[o + 6], cpy = py - T[o + 7], cpz = pz - T[o + 8];
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) { r.x = T[o + 6]; r.y = T[o + 7]; r.z = T[o + 8]; return r; }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6); r.x = ax + acx * w; r.y = ay + acy * w; r.z = az + acz * w; return r;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      r.x = T[o + 3] + (T[o + 6] - T[o + 3]) * w; r.y = T[o + 4] + (T[o + 7] - T[o + 4]) * w; r.z = T[o + 5] + (T[o + 8] - T[o + 5]) * w;
      return r;
    }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    r.x = ax + abx * v + acx * w; r.y = ay + aby * v + acy * w; r.z = az + abz * v + acz * w;
    return r;
  }

  // Push a sphere out of the triangles. pos is {x,y,z} (modified). Returns contact info:
  // { hit, floorY (max up-normal y), wall: [nx, nz] summed horizontal normal, ceiling }
  pushSphere(pos, rad, iters = 3) {
    const out = { hit: false, up: -1, nx: 0, ny: 0, nz: 0, ceiling: false };
    for (let it = 0; it < iters; it++) {
      let moved = false;
      this.each(pos.x - rad, pos.z - rad, pos.x + rad, pos.z + rad, (t) => {
        const c = this.closest(t, pos.x, pos.y, pos.z);
        let dx = pos.x - c.x, dy = pos.y - c.y, dz = pos.z - c.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= rad * rad) return;
        let d = Math.sqrt(d2);
        if (d < 1e-5) { dx = this.nrm[t * 3]; dy = this.nrm[t * 3 + 1]; dz = this.nrm[t * 3 + 2]; d = 1; }
        else { dx /= d; dy /= d; dz /= d; }
        // wall-like contacts (edges of wall quads, band seams) push straight out sideways,
        // so brushing a wall never lifts or sinks the body
        if (dy > -0.5 && dy < 0.5) {
          const h = Math.hypot(dx, dz);
          if (h > 1e-4) { dx /= h; dz /= h; dy = 0; }
        }
        const push = rad - (d < 1e-5 ? 0 : d);
        pos.x += dx * push; pos.y += dy * push; pos.z += dz * push;
        out.hit = true; moved = true;
        out.nx += dx; out.ny += dy; out.nz += dz;
        if (dy > out.up) out.up = dy;
        if (dy < -0.6) out.ceiling = true;
      });
      if (!moved) break;
    }
    return out;
  }

  // Ray cast from o along unit d up to maxD. Returns {t, nx, ny, nz} or null.
  ray(ox, oy, oz, dx, dy, dz, maxD) {
    const ex = ox + dx * maxD, ez = oz + dz * maxD;
    let best = maxD, bn = -1;
    const T = this.tri;
    const test = (t) => {
      const o = t * 9;
      const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
      const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) return;
      const inv = 1 / det;
      const sx = ox - T[o], sy = oy - T[o + 1], sz = oz - T[o + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) return;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) return;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt > 0 && tt < best) { best = tt; bn = t; }
    };
    // walk the cells along the ray in short steps (segments here are short: ground probes, camera)
    const len = Math.hypot(ex - ox, ez - oz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    for (let k = 0; k < steps; k++) {
      const x0 = ox + (ex - ox) * k / steps, z0 = oz + (ez - oz) * k / steps;
      const x1 = ox + (ex - ox) * (k + 1) / steps, z1 = oz + (ez - oz) * (k + 1) / steps;
      this.each(Math.min(x0, x1) - 0.01, Math.min(z0, z1) - 0.01, Math.max(x0, x1) + 0.01, Math.max(z0, z1) + 0.01, test);
      if (bn >= 0 && best <= maxD * (k + 1) / steps) break;
    }
    if (bn < 0) return null;
    let nx = this.nrm[bn * 3], ny = this.nrm[bn * 3 + 1], nz = this.nrm[bn * 3 + 2];
    if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
    return { t: best, nx, ny, nz };
  }
}
