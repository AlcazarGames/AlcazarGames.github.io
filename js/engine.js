/* Alcazar engine runtime: scenes, 2D + 3D rendering, physics, audio, script interpreter.
 * Used by the IDE (edit + play) and by exported games. Depends on lang.js. */
(function alcazarEngine(G) {
  'use strict';
  const A = G.Alcazar;
  (A._mods = A._mods || {}).engine = alcazarEngine;
  const DEG = Math.PI / 180;
  const num = A.num, truthy = A.truthy;

  // ================================================================== math
  const M4 = {
    ident: function () { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul: function (a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    persp: function (fovy, aspect, n, f) {
      const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
      m[0] = t / aspect; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
      return m;
    },
    ortho: function (l, r, b, t, n, f) {
      const m = new Float32Array(16);
      m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
      m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
      return m;
    },
    lookAt: function (e, t, u) {
      let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
      let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      const m = new Float32Array(16);
      m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy; m[8] = xz; m[9] = yz; m[10] = zz;
      m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
      m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
      m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
      m[15] = 1;
      return m;
    },
    // T * Ry * Rx * Rz * S
    trs: function (x, y, z, rx, ry, rz, sx, sy, sz) {
      const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
      // R = Ry*Rx*Rz
      const r00 = cy * cz + syr * sxr * szr, r01 = -cy * szr + syr * sxr * cz, r02 = syr * cx;
      const r10 = cx * szr, r11 = cx * cz, r12 = -sxr;
      const r20 = -syr * cz + cy * sxr * szr, r21 = syr * szr + cy * sxr * cz, r22 = cy * cx;
      const m = new Float32Array(16);
      m[0] = r00 * sx; m[1] = r10 * sx; m[2] = r20 * sx;
      m[4] = r01 * sy; m[5] = r11 * sy; m[6] = r21 * sy;
      m[8] = r02 * sz; m[9] = r12 * sz; m[10] = r22 * sz;
      m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
      return m;
    },
    normal3: function (m) {
      // inverse-transpose of upper 3x3
      const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
      const A0 = e * i - f * h, B0 = -(d * i - f * g), C0 = d * h - e * g;
      let det = a * A0 + b * B0 + c * C0; det = det ? 1 / det : 0;
      const o = new Float32Array(9);
      o[0] = A0 * det; o[1] = B0 * det; o[2] = C0 * det;
      o[3] = -(b * i - c * h) * det; o[4] = (a * i - c * g) * det; o[5] = -(a * h - b * g) * det;
      o[6] = (b * f - c * e) * det; o[7] = -(a * f - c * d) * det; o[8] = (a * e - b * d) * det;
      return o;
    },
    xform: function (m, x, y, z) {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
    },
    invert: function (m) {
      const inv = new Float32Array(16);
      inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
      inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
      inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
      inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
      inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
      inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
      inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
      inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
      inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
      inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
      inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
      inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
      inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
      inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
      inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
      inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      if (!det) return M4.ident();
      det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det;
      return inv;
    }
  };
  A.M4 = M4;

  const colorCache = {};
  function rgb(c) {
    c = String(c || '#ffffff');
    let v = colorCache[c];
    if (v) return v;
    let m = /^#?([0-9a-f]{6})$/i.exec(c), r = 1, g = 1, b = 1;
    if (m) { const n = parseInt(m[1], 16); r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255; }
    else if ((m = /^#?([0-9a-f]{3})$/i.exec(c))) { const s = m[1]; r = parseInt(s[0] + s[0], 16) / 255; g = parseInt(s[1] + s[1], 16) / 255; b = parseInt(s[2] + s[2], 16) / 255; }
    else {
      const named = { red: '#ff4d4d', green: '#3ccf5a', blue: '#4c7dff', yellow: '#ffd84d', orange: '#ff9a2e', purple: '#9b5cf6', pink: '#ff6fb5', white: '#ffffff', black: '#111111', gray: '#888888', grey: '#888888', brown: '#8b5a2b', cyan: '#3dd6e0' };
      if (named[c.toLowerCase()]) return rgb(named[c.toLowerCase()]);
    }
    v = colorCache[c] = [r, g, b];
    return v;
  }
  A.rgb = rgb;

  // ================================================================== meshes
  function meshCube() {
    const P = [], I = [];
    const faces = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
    faces.forEach(function (n) {
      const u = n[1] !== 0 ? [1, 0, 0] : [0, 1, 0];
      const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const b = P.length / 6;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        P.push(0.5 * (n[0] + q[0] * u[0] + q[1] * v[0]), 0.5 * (n[1] + q[0] * u[1] + q[1] * v[1]), 0.5 * (n[2] + q[0] * u[2] + q[1] * v[2]), n[0], n[1], n[2]);
      });
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return { P: P, I: I };
  }
  function meshSphere() {
    const P = [], I = [], LAT = 18, LON = 28;
    for (let i = 0; i <= LAT; i++) {
      const th = i * Math.PI / LAT;
      for (let j = 0; j <= LON; j++) {
        const ph = j * 2 * Math.PI / LON;
        const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
        P.push(x * 0.5, y * 0.5, z * 0.5, x, y, z);
      }
    }
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
      const a = i * (LON + 1) + j, b = a + LON + 1;
      I.push(a, a + 1, b, b, a + 1, b + 1);
    }
    return { P: P, I: I };
  }
  function meshCylinder(cone) {
    const P = [], I = [], S = 28;
    for (let j = 0; j <= S; j++) {
      const a = j / S * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const ny = cone ? 0.5 : 0, l = Math.hypot(1, ny);
      P.push(c * 0.5, -0.5, s * 0.5, c / l, ny / l, s / l);
      P.push(cone ? 0 : c * 0.5, 0.5, cone ? 0 : s * 0.5, c / l, ny / l, s / l);
    }
    for (let j = 0; j < S; j++) { const a = j * 2; I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const caps = cone ? [-0.5] : [-0.5, 0.5];
    caps.forEach(function (y) {
      const ny = y < 0 ? -1 : 1, c0 = P.length / 6;
      P.push(0, y, 0, 0, ny, 0);
      for (let j = 0; j <= S; j++) { const a = j / S * Math.PI * 2; P.push(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5, 0, ny, 0); }
      for (let j = 0; j < S; j++) I.push(c0, c0 + 1 + j, c0 + 2 + j);
    });
    return { P: P, I: I };
  }
  function meshPlane() {
    return { P: [-0.5, 0, -0.5, 0, 1, 0, 0.5, 0, -0.5, 0, 1, 0, 0.5, 0, 0.5, 0, 1, 0, -0.5, 0, 0.5, 0, 1, 0], I: [0, 2, 1, 0, 3, 2] };
  }
  // ---- nature meshes: low-poly, flat-shaded, vertex-coloured. Same 1-unit box as the other shapes (base at y = -0.5).
  function nb() {
    const pos = [], col = [], idx = [];
    let rs = 12345;
    function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
    function hc(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
    function v(x, y, z, c) { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; }
    const B = {
      rnd: rnd, hc: hc,
      cone: function (cx, y0, cz, r, h, seg, c, rot) {
        c = hc(c); const tip = v(cx, y0 + h, cz, c), ring = [];
        for (let k = 0; k < seg; k++) { const a = (k / seg + (rot || 0)) * Math.PI * 2, rr = r * (0.85 + rnd() * 0.3); ring.push(v(cx + Math.cos(a) * rr, y0 + (rnd() - 0.5) * h * 0.08, cz + Math.sin(a) * rr, [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82])); }
        const mid = v(cx, y0 + h * 0.05, cz, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
        for (let k = 0; k < seg; k++) { idx.push(tip, ring[(k + 1) % seg], ring[k]); idx.push(mid, ring[k], ring[(k + 1) % seg]); }
      },
      cyl: function (cx, y0, cz, r, h, seg, c) {
        c = hc(c);
        for (let k = 0; k < seg; k++) {
          const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
          const p0 = v(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r, c), p1 = v(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r, c);
          const p2 = v(cx + Math.cos(a1) * r * 0.8, y0 + h, cz + Math.sin(a1) * r * 0.8, c), p3 = v(cx + Math.cos(a0) * r * 0.8, y0 + h, cz + Math.sin(a0) * r * 0.8, c);
          idx.push(p0, p2, p1, p0, p3, p2);
        }
      },
      blob: function (cx, cy, cz, rx, ry, rz, lat, lon, c, jit) {
        const cc = hc(c), grid = [];
        for (let i = 0; i <= lat; i++) {
          const row = [], th = i / lat * Math.PI;
          for (let j = 0; j < lon; j++) {
            const ph = j / lon * Math.PI * 2, k = 1 + (i > 0 && i < lat ? (rnd() - 0.5) * jit : 0);
            const shade = 0.75 + 0.35 * (1 - i / lat);
            row.push(v(cx + Math.sin(th) * Math.cos(ph) * rx * k, cy + Math.cos(th) * ry * k, cz + Math.sin(th) * Math.sin(ph) * rz * k, [cc[0] * shade, cc[1] * shade, cc[2] * shade]));
          }
          grid.push(row);
        }
        for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
          const a = grid[i][j], b = grid[i][(j + 1) % lon], c2 = grid[i + 1][j], d = grid[i + 1][(j + 1) % lon];
          idx.push(a, b, c2, b, d, c2);
        }
      },
      blade: function (x, z, h, lean, w, c0, c1) {
        const a = rnd() * Math.PI, dx = Math.cos(a) * w, dz = Math.sin(a) * w, lx = Math.cos(a + 1.57) * lean, lz = Math.sin(a + 1.57) * lean;
        const p0 = v(x - dx, -0.5, z - dz, hc(c0)), p1 = v(x + dx, -0.5, z + dz, hc(c0)), p2 = v(x + lx, -0.5 + h, z + lz, hc(c1));
        idx.push(p0, p1, p2);
      },
      // flat-shaded output: every triangle gets its own vertices and face normal
      build: function () {
        const P = [], C = [], I = [];
        for (let t = 0; t < idx.length; t += 3) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
          const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          [a, b, c].forEach(function (k) { P.push(pos[k], pos[k + 1], pos[k + 2], nx, ny, nz); C.push(col[k], col[k + 1], col[k + 2]); I.push(I.length); });
        }
        return { P: P, I: I, C: C };
      }
    };
    return B;
  }
  function meshPine() {
    const b = nb();
    // tall trunk so explorers can walk under the branches
    b.cyl(0, -0.5, 0, 0.045, 0.42, 6, '#5a3d28');
    b.cone(0, -0.16, 0, 0.34, 0.36, 8, '#2c6338', 0);
    b.cone(0, 0.03, 0, 0.26, 0.32, 8, '#337240', 0.06);
    b.cone(0, 0.2, 0, 0.17, 0.3, 7, '#3b8048', 0.12);
    return b.build();
  }
  function meshTree() {
    const b = nb();
    b.cyl(0, -0.5, 0, 0.055, 0.56, 6, '#6b4a2f');
    b.blob(0, 0.2, 0, 0.36, 0.26, 0.36, 4, 7, '#4e8f37', 0.25);
    b.blob(0.16, 0.3, 0.06, 0.22, 0.18, 0.22, 3, 6, '#5fa23f', 0.2);
    b.blob(-0.15, 0.27, -0.08, 0.24, 0.19, 0.24, 3, 6, '#579a3b', 0.2);
    return b.build();
  }
  function meshBush() {
    const b = nb();
    b.blob(0, -0.2, 0, 0.42, 0.3, 0.42, 3, 7, '#3f7a33', 0.3);
    b.blob(0.2, -0.12, 0.1, 0.26, 0.24, 0.26, 3, 6, '#4b8a3a', 0.25);
    b.blob(-0.18, -0.16, -0.12, 0.24, 0.22, 0.24, 3, 6, '#46843a', 0.25);
    return b.build();
  }
  function meshRock() {
    const b = nb();
    b.blob(0, -0.12, 0, 0.5, 0.38, 0.44, 4, 7, '#8b857c', 0.35);
    return b.build();
  }
  function meshGrass() {
    const b = nb();
    for (let i = 0; i < 7; i++) b.blade((b.rnd() - 0.5) * 0.6, (b.rnd() - 0.5) * 0.6, 0.6 + b.rnd() * 0.4, (b.rnd() - 0.5) * 0.3, 0.05, '#3d6b2a', '#9acd5a');
    return b.build();
  }
  const MESHES = { cube: meshCube, sphere: meshSphere, cylinder: function () { return meshCylinder(false); }, cone: function () { return meshCylinder(true); }, plane: meshPlane,
    pine: meshPine, tree: meshTree, bush: meshBush, rock: meshRock, grass: meshGrass };
  A.MESH_TYPES = Object.keys(MESHES);
  A.NATURE_MESHES = ['pine', 'tree', 'bush', 'rock', 'grass'];

  // Build a small .glb model out of coloured boxes: parts = [{ color: '#rrggbb', glow?, boxes: [[cx, cy, cz, sx, sy, sz], ...] }]
  // Returns a data URL that can be stored as a 'model' asset.
  A.boxModel = function (parts) {
    const chunks = [], views = [], accessors = [], materials = [], prims = [];
    let offset = 0;
    function view(t, target) {
      const b = new Uint8Array(t.buffer, t.byteOffset, t.byteLength), pad = (4 - b.length % 4) % 4;
      chunks.push(b); if (pad) chunks.push(new Uint8Array(pad));
      views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target: target }); offset += b.length + pad;
      return views.length - 1;
    }
    parts.forEach(function (p) {
      const P = [], N = [], I = [];
      p.boxes.forEach(function (bx) {
        [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].forEach(function (n) {
          const u = n[1] !== 0 ? [1, 0, 0] : [0, 1, 0], v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]], base = P.length / 3;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { for (let k = 0; k < 3; k++) P.push(bx[k] + 0.5 * bx[k + 3] * (n[k] + q[0] * u[k] + q[1] * v[k])); N.push(n[0], n[1], n[2]); });
          I.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });
      });
      const pos = new Float32Array(P), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
      const c = rgb(p.color);
      accessors.push({ bufferView: view(pos, 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min: mn, max: mx });
      accessors.push({ bufferView: view(new Float32Array(N), 34962), componentType: 5126, count: N.length / 3, type: 'VEC3' });
      accessors.push({ bufferView: view(new Uint16Array(I), 34963), componentType: 5123, count: I.length, type: 'SCALAR' });
      materials.push({ pbrMetallicRoughness: { baseColorFactor: [c[0], c[1], c[2], 1], metallicFactor: 0, roughnessFactor: 0.8 }, emissiveFactor: p.glow ? [1, 1, 1] : [0, 0, 0] });
      const a = accessors.length;
      prims.push({ attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1, material: materials.length - 1 });
    });
    const json = { asset: { version: '2.0', generator: 'Alcazar' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: prims }], materials: materials, accessors: accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
    const jb = new TextEncoder().encode(JSON.stringify(json)), jl = jb.length + (4 - jb.length % 4) % 4;
    const total = 28 + jl + offset, out = new Uint8Array(total), dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); out.fill(0x20, 20, 20 + jl); out.set(jb, 20);
    dv.setUint32(20 + jl, offset, true); dv.setUint32(24 + jl, 0x004E4942, true);
    let pp = 28 + jl; chunks.forEach(function (ch) { out.set(ch, pp); pp += ch.length; });
    let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return 'data:model/gltf-binary;base64,' + btoa(s);
  };

  // ================================================================== 3D model assets (glTF 2.0 / GLB, OBJ)
  // Models are normalised: centred on their bounding box and scaled so the largest side is 1 unit,
  // which makes them behave exactly like the built-in shapes (size = sx, sy, sz).
  const modelCache = {};
  const modelByAsset = new WeakMap(); // asset object -> model, so lookups never re-compare big data strings
  let modelVer = 0;
  A.Models = {
    get: function (project, name) {
      const a = project && project.assets && project.assets[name];
      if (!a || a.type !== 'model') return null;
      let m = modelByAsset.get(a);
      if (m) return m;
      // big models live in a file next to the project ("file"); small ones are embedded ("data")
      const src = a.file ? 'file:' + a.file : a.data;
      m = modelCache[name];
      if (!m || m.src.length !== src.length || m.src !== src) {
        m = modelCache[name] = { src: src, status: 'loading', parts: [], half: [0.5, 0.5, 0.5], maxDim: 1, ver: ++modelVer, error: null };
        loadModel(a, m);
      }
      modelByAsset.set(a, m);
      return m;
    },
    // parse an ArrayBuffer directly (used by tools and tests)
    parse: function (buf) { const m = { parts: [], half: [0.5, 0.5, 0.5] }; return parseModelBuffer(buf, m).then(function () { return m; }); }
  };
  function dataUrlToBuffer(url) {
    const i = url.indexOf(','), meta = url.slice(5, i), body = url.slice(i + 1);
    if (/;base64/i.test(meta)) {
      const bin = atob(body), b = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k);
      return b.buffer;
    }
    return new TextEncoder().encode(decodeURIComponent(body)).buffer;
  }
  // where model files are served from: the IDE sets this; exported games use paths relative to the page
  A.fileBase = A.fileBase || '';
  function loadModel(a, m) {
    let p;
    if (a.file) {
      const url = A.fileBase + a.file;
      p = fetch(url).catch(function (e) { throw new Error(e.message + ' (' + url + ')'); }).then(function (r) {
        if (!r.ok) throw new Error('model file not found: ' + url + ' [' + r.status + ']');
        return r.arrayBuffer();
      });
    } else {
      try { p = Promise.resolve(dataUrlToBuffer(a.data)); } catch (e) { m.status = 'error'; m.error = 'unreadable file'; return; }
    }
    p.then(function (buf) { return parseModelBuffer(buf, m); })
      .then(function () { m.status = 'ready'; m.ver = ++modelVer; })
      .catch(function (e) { m.status = 'error'; m.error = e.message; if (G.console) console.warn('Model failed to load:', e); });
  }
  function parseModelBuffer(buf, m) {
    try {
      const u8 = new Uint8Array(buf);
      if (u8[0] === 0x67 && u8[1] === 0x6C && u8[2] === 0x54 && u8[3] === 0x46) return parseGLB(buf, m);
      const text = new TextDecoder().decode(u8);
      if (/^\s*\{/.test(text)) return parseGLTF(JSON.parse(text), null, m);
      parseOBJ(text, m);
      return Promise.resolve();
    } catch (e) { return Promise.reject(e); }
  }
  function parseGLB(buf, m) {
    const dv = new DataView(buf);
    let off = 12, json = null, bin = null;
    while (off + 8 <= dv.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), chunk = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004E4942) bin = chunk;
      off += 8 + len;
    }
    if (!json) throw new Error('this .glb file has no scene data');
    return parseGLTF(json, bin, m);
  }
  function trsQuat(t, q, s) {
    const x = q[0], y = q[1], z = q[2], w = q[3], m = new Float32Array(16);
    m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
    m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
    m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
    return m;
  }
  function computeNormals(pos, idx) {
    const nor = new Float32Array(pos.length);
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      [a, b, c].forEach(function (k) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; });
    }
    for (let i = 0; i < nor.length; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
    return nor;
  }
  function finishModel(parts, m) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    parts.forEach(function (p) { for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.pos[i + k]); hi[k] = Math.max(hi[k], p.pos[i + k]); } });
    const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const k = 1 / (Math.max(size[0], size[1], size[2]) || 1);
    parts.forEach(function (p) { for (let i = 0; i < p.pos.length; i += 3) for (let j = 0; j < 3; j++) p.pos[i + j] = (p.pos[i + j] - c[j]) * k; });
    m.parts = parts;
    m.half = [Math.max(0.02, size[0] * k / 2), Math.max(0.02, size[1] * k / 2), Math.max(0.02, size[2] * k / 2)];
    m.maxDim = 1 / k; // the model's real size, for "keep real size"
    m.triangles = parts.reduce(function (n, p) { return n + p.idx.length / 3; }, 0);
  }
  function parseGLTF(g, bin, m) {
    const buffers = (g.buffers || []).map(function (b) {
      if (b.uri) {
        if (!/^data:/.test(b.uri)) throw new Error('this .gltf uses a separate .bin file. Export as a single .glb instead.');
        return dataUrlToBuffer(b.uri);
      }
      return bin;
    });
    const COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const SIZE = { 5126: 4, 5125: 4, 5123: 2, 5122: 2, 5121: 1, 5120: 1 };
    function read(ai) {
      const a = g.accessors[ai], n = COMP[a.type];
      if (a.bufferView == null) return new Float32Array(a.count * n);
      const bv = g.bufferViews[a.bufferView], buf = buffers[bv.buffer], size = SIZE[a.componentType];
      const stride = bv.byteStride || size * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
      // fast path: tightly packed floats (most real-world files) are copied in one go
      if (a.componentType === 5126 && stride === 4 * n && base % 4 === 0) return new Float32Array(buf, base, a.count * n).slice();
      const out = new Float32Array(a.count * n), dv = new DataView(buf);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) {
        const p = base + i * stride + c * size;
        let v;
        switch (a.componentType) {
          case 5126: v = dv.getFloat32(p, true); break;
          case 5125: v = dv.getUint32(p, true); break;
          case 5123: v = dv.getUint16(p, true); if (a.normalized) v /= 65535; break;
          case 5122: v = dv.getInt16(p, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
          case 5121: v = dv.getUint8(p); if (a.normalized) v /= 255; break;
          default: v = dv.getInt8(p); if (a.normalized) v = Math.max(v / 127, -1);
        }
        out[i * n + c] = v;
      }
      return out;
    }
    // decode pictures on a background thread (createImageBitmap) so big maps don't freeze the first frame
    function loadImg(src, blob) {
      const h = { _ready: false, bitmap: null };
      function done(b) { h.bitmap = b; h._ready = true; }
      function viaImage() { const im = new Image(); im.onload = function () { done(im); }; im.onerror = function () { done(null); }; im.src = src || URL.createObjectURL(blob); }
      if (typeof createImageBitmap === 'function') {
        (blob ? Promise.resolve(blob) : fetch(src).then(function (r) { return r.blob(); }))
          .then(function (b) { return createImageBitmap(b); }).then(done).catch(viaImage);
      } else viaImage();
      return h;
    }
    const images = (g.images || []).map(function (im) {
      if (im.bufferView != null) {
        const bv = g.bufferViews[im.bufferView];
        return loadImg(null, new Blob([new Uint8Array(buffers[bv.buffer], bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType || 'image/png' }));
      }
      return im.uri && /^data:/.test(im.uri) ? loadImg(im.uri) : null;
    });
    function texImage(info) {
      if (!info || !g.textures) return null;
      const t = g.textures[info.index];
      return t && t.source != null ? images[t.source] : null;
    }
    const parts = [];
    function visit(ni, parent) {
      const nd = g.nodes[ni];
      const local = nd.matrix ? new Float32Array(nd.matrix) : trsQuat(nd.translation || [0, 0, 0], nd.rotation || [0, 0, 0, 1], nd.scale || [1, 1, 1]);
      const world = parent ? M4.mul(parent, local) : local;
      if (nd.mesh != null) {
        const nm = M4.normal3(world);
        g.meshes[nd.mesh].primitives.forEach(function (pr) {
          if ((pr.mode != null && pr.mode !== 4) || pr.attributes.POSITION == null) return;
          const pos = read(pr.attributes.POSITION), cnt = pos.length / 3;
          let nor = pr.attributes.NORMAL != null ? read(pr.attributes.NORMAL) : null;
          const uv = pr.attributes.TEXCOORD_0 != null ? read(pr.attributes.TEXCOORD_0) : new Float32Array(cnt * 2);
          let idx;
          if (pr.indices != null) {
            const ia = g.accessors[pr.indices], ibv = ia.bufferView != null ? g.bufferViews[ia.bufferView] : null;
            const ib = ibv ? (ibv.byteOffset || 0) + (ia.byteOffset || 0) : 0;
            // fast path for packed 16/32-bit indices
            if (ibv && ia.componentType === 5125 && (!ibv.byteStride || ibv.byteStride === 4) && ib % 4 === 0) idx = new Uint32Array(buffers[ibv.buffer], ib, ia.count).slice();
            else if (ibv && ia.componentType === 5123 && (!ibv.byteStride || ibv.byteStride === 2) && ib % 2 === 0) idx = new Uint32Array(new Uint16Array(buffers[ibv.buffer], ib, ia.count));
            else { const f = read(pr.indices); idx = new Uint32Array(f.length); for (let i = 0; i < f.length; i++) idx[i] = f[i]; }
          }
          else { idx = new Uint32Array(cnt); for (let i = 0; i < cnt; i++) idx[i] = i; }
          const w = world;
          for (let i = 0; i < cnt * 3; i += 3) {
            const x = pos[i], y = pos[i + 1], z = pos[i + 2];
            pos[i] = w[0] * x + w[4] * y + w[8] * z + w[12]; pos[i + 1] = w[1] * x + w[5] * y + w[9] * z + w[13]; pos[i + 2] = w[2] * x + w[6] * y + w[10] * z + w[14];
          }
          if (!nor) nor = computeNormals(pos, idx);
          else for (let i = 0; i < cnt; i++) {
            const x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2];
            const a = nm[0] * x + nm[3] * y + nm[6] * z, b = nm[1] * x + nm[4] * y + nm[7] * z, c = nm[2] * x + nm[5] * y + nm[8] * z;
            const l = Math.hypot(a, b, c) || 1;
            nor[i * 3] = a / l; nor[i * 3 + 1] = b / l; nor[i * 3 + 2] = c / l;
          }
          const mat = pr.material != null && g.materials ? g.materials[pr.material] : null;
          const pbr = (mat && mat.pbrMetallicRoughness) || {};
          // older files (many game rips) use the specular-glossiness material format
          const sg = mat && mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness;
          const em = mat && mat.emissiveFactor && (mat.emissiveFactor[0] + mat.emissiveFactor[1] + mat.emissiveFactor[2]) > 0.3;
          const unlit = mat && mat.extensions && mat.extensions.KHR_materials_unlit;
          const color = pbr.baseColorFactor || (sg && sg.diffuseFactor) || [1, 1, 1, 1];
          const image = texImage(pbr.baseColorTexture || (sg && sg.diffuseTexture));
          const blend = !!(mat && mat.alphaMode === 'BLEND');
          // fully transparent untextured pieces are invisible volumes (triggers, kill zones): leave them out
          if (blend && !image && (color[3] == null ? 1 : color[3]) < 0.02) return;
          parts.push({ pos: pos, nor: nor, uv: uv, idx: idx, color: color, image: image, emissive: em || unlit ? 1 : 0, blend: blend });
        });
      }
      (nd.children || []).forEach(function (c) { visit(c, world); });
    }
    const roots = g.scenes && g.scenes.length ? g.scenes[g.scene || 0].nodes : (g.nodes || []).map(function (_, i) { return i; });
    roots.forEach(function (n) { visit(n, null); });
    if (!parts.length) throw new Error('no triangles found in this model');
    finishModel(parts, m);
    return Promise.resolve();
  }
  function parseOBJ(text, m) {
    const v = [], vt = [], vn = [], P = [], N = [], U = [];
    let missingN = false;
    text.split(/\r?\n/).forEach(function (line) {
      const t = line.trim().split(/\s+/);
      if (t[0] === 'v') v.push([+t[1], +t[2], +t[3]]);
      else if (t[0] === 'vt') vt.push([+t[1], +(t[2] || 0)]);
      else if (t[0] === 'vn') vn.push([+t[1], +t[2], +t[3]]);
      else if (t[0] === 'f') {
        const c = t.slice(1).map(function (s) {
          const r = s.split('/'), f = function (k, arr) { const n = parseInt(r[k], 10); return isNaN(n) ? -1 : (n < 0 ? arr.length + n : n - 1); };
          return [f(0, v), f(1, vt), f(2, vn)];
        });
        for (let i = 1; i + 1 < c.length; i++) [c[0], c[i], c[i + 1]].forEach(function (k) {
          const p = v[k[0]] || [0, 0, 0]; P.push(p[0], p[1], p[2]);
          const uv = vt[k[1]]; U.push(uv ? uv[0] : 0, uv ? 1 - uv[1] : 0);
          const n = vn[k[2]]; if (n) N.push(n[0], n[1], n[2]); else { missingN = true; N.push(0, 0, 0); }
        });
      }
    });
    if (!P.length) throw new Error('no faces found in this .obj file');
    const pos = new Float32Array(P), idx = new Uint32Array(P.length / 3);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    finishModel([{ pos: pos, nor: missingN ? computeNormals(pos, idx) : new Float32Array(N), uv: new Float32Array(U), idx: idx, color: [1, 1, 1, 1], image: null, emissive: 0 }], m);
  }

  // ================================================================== walkable level models (mesh collision)
  // A model with "meshCollision" becomes real geometry: floors hold you up, walls push you back.
  // Its triangles are bucketed in a 3D grid so each check only looks at nearby triangles.
  function modelMul(o, md) { return o.realSize && md ? md.maxDim : 1; }
  function meshCollider(o, W) {
    const md = A.Models.get(W.project, o.model);
    if (!md || md.status !== 'ready') return null;
    const k = modelMul(o, md), key = [o.x, o.y, o.z, o.rx, o.ry, o.rz, o.sx, o.sy, o.sz, k, md.ver].join(',');
    if (o._mc && o._mc.key === key) return o._mc;
    const M = M4.trs(o.x, o.y, o.z, o.rx * DEG, o.ry * DEG, o.rz * DEG, o.sx * k, o.sy * k, o.sz * k);
    let nv = 0, nt = 0;
    md.parts.forEach(function (p) { nv += p.pos.length / 3; nt += p.idx.length / 3; });
    const V = new Float32Array(nv * 3), T = new Uint32Array(nt * 3);
    let vo = 0, to = 0;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    md.parts.forEach(function (p) {
      const base = vo / 3, P = p.pos;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
        V[vo++] = wx; V[vo++] = wy; V[vo++] = wz;
        if (wx < lo[0]) lo[0] = wx; if (wy < lo[1]) lo[1] = wy; if (wz < lo[2]) lo[2] = wz;
        if (wx > hi[0]) hi[0] = wx; if (wy > hi[1]) hi[1] = wy; if (wz > hi[2]) hi[2] = wz;
      }
      for (let i = 0; i < p.idx.length; i++) T[to++] = base + p.idx[i];
    });
    let cs = Math.max(0.5, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 90), nx, ny, nz;
    for (;;) {
      nx = Math.ceil((hi[0] - lo[0]) / cs) + 1; ny = Math.ceil((hi[1] - lo[1]) / cs) + 1; nz = Math.ceil((hi[2] - lo[2]) / cs) + 1;
      if (nx * ny * nz <= 2500000) break;
      cs *= 1.25;
    }
    const cells = nx * ny * nz, count = new Uint32Array(cells + 1);
    const ci = function (v, a) { return Math.floor((v - lo[a]) / cs); };
    function each(t, fn) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const x0 = ci(Math.min(V[a], V[b], V[c]), 0), x1 = ci(Math.max(V[a], V[b], V[c]), 0);
      const y0 = ci(Math.min(V[a + 1], V[b + 1], V[c + 1]), 1), y1 = ci(Math.max(V[a + 1], V[b + 1], V[c + 1]), 1);
      const z0 = ci(Math.min(V[a + 2], V[b + 2], V[c + 2]), 2), z1 = ci(Math.max(V[a + 2], V[b + 2], V[c + 2]), 2);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) fn((x * ny + y) * nz + z);
    }
    for (let t = 0; t < T.length; t += 3) each(t, function (cell) { count[cell + 1]++; });
    for (let i = 1; i <= cells; i++) count[i] += count[i - 1];
    const items = new Uint32Array(count[cells]), fill = count.slice(0, cells);
    for (let t = 0; t < T.length; t += 3) each(t, function (cell) { items[fill[cell]++] = t; });
    o._mc = { key: key, V: V, T: T, lo: lo, cs: cs, nx: nx, ny: ny, nz: nz, start: count, items: items, stamp: new Uint32Array(nt), mark: 0 };
    return o._mc;
  }
  // call fn(t) once for every triangle in the cells covering a box
  function mcEach(mc, x0, y0, z0, x1, y1, z1, fn) {
    const cs = mc.cs, lo = mc.lo;
    const ax = Math.max(0, Math.floor((x0 - lo[0]) / cs)), bx = Math.min(mc.nx - 1, Math.floor((x1 - lo[0]) / cs));
    const ay = Math.max(0, Math.floor((y0 - lo[1]) / cs)), by = Math.min(mc.ny - 1, Math.floor((y1 - lo[1]) / cs));
    const az = Math.max(0, Math.floor((z0 - lo[2]) / cs)), bz = Math.min(mc.nz - 1, Math.floor((z1 - lo[2]) / cs));
    if (ax > bx || ay > by || az > bz) return;
    mc.mark = (mc.mark + 1) >>> 0 || 1;
    for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) {
      const cell = (x * mc.ny + y) * mc.nz + z;
      for (let i = mc.start[cell]; i < mc.start[cell + 1]; i++) {
        const t = mc.items[i], s = t / 3;
        if (mc.stamp[s] === mc.mark) continue;
        mc.stamp[s] = mc.mark;
        fn(t);
      }
    }
  }
  // highest walkable surface under (x,z) between y - down and y + up
  function mcFloor(mc, x, y, z, up, down) {
    const V = mc.V, T = mc.T;
    let best = null;
    mcEach(mc, x, y - down, z, x, y + up, z, function (t) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const ax = V[a], az = V[a + 2], bx = V[b], bz = V[b + 2], cx = V[c], cz = V[c + 2];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-9) return;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) return;
      // walkable only: skip steep faces
      const ux = bx - ax, uy = V[b + 1] - V[a + 1], uz = bz - az, vx = cx - ax, vy = V[c + 1] - V[a + 1], vz = cz - az;
      const ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx) || 1;
      if (Math.abs(ny / nl) < 0.45) return;
      const h = u * V[a + 1] + v * V[b + 1] + w * V[c + 1];
      if (h >= y - down && h <= y + up && (best == null || h > best)) best = h;
    });
    return best;
  }
  // push a sphere out of steep faces (walls), sideways only
  function mcWalls(mc, px, py, pz, r) {
    const V = mc.V, T = mc.T;
    let ox = 0, oz = 0;
    mcEach(mc, px - r, py - r, pz - r, px + r, py + r, pz + r, function (t) {
      const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
      const q = closestOnTri(px + ox, py, pz + oz, V[a], V[a + 1], V[a + 2], V[b], V[b + 1], V[b + 2], V[c], V[c + 1], V[c + 2]);
      let dx = px + ox - q[0], dy = py - q[1], dz = pz + oz - q[2];
      const d = Math.hypot(dx, dy, dz);
      if (d >= r || d < 1e-6) return;
      const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      const nyy = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, nyy, ux * vy - uy * vx) || 1;
      if (Math.abs(nyy / nl) > 0.7) return; // floors and ceilings are handled elsewhere
      const hl = Math.hypot(dx, dz);
      if (hl < 1e-6) return;
      const push = r - d;
      ox += dx / hl * push; oz += dz / hl * push;
    });
    return [ox, oz];
  }
  function closestOnTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [ax + abx * v, ay + aby * v, az + abz * v]; }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [ax + acx * w, ay + acy * w, az + acz * w]; }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [bx + (cx - bx) * w, by + (cy - by) * w, bz + (cz - bz) * w]; }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
  }
  // distance along a ray to the first triangle (camera and aiming), or null
  function mcRay(mc, o, d, maxT) {
    const V = mc.V, T = mc.T;
    let best = null;
    const stepLen = mc.cs * 0.9;
    for (let s = 0; s <= maxT + stepLen; s += stepLen) {
      const t0 = Math.min(s, maxT), t1 = Math.min(s + stepLen, maxT);
      const x0 = o[0] + d[0] * t0, y0 = o[1] + d[1] * t0, z0 = o[2] + d[2] * t0, x1 = o[0] + d[0] * t1, y1 = o[1] + d[1] * t1, z1 = o[2] + d[2] * t1;
      mcEach(mc, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), function (t) {
        const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
        const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2], e2x = V[c] - V[a], e2y = V[c + 1] - V[a + 1], e2z = V[c + 2] - V[a + 2];
        const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-9) return;
        const inv = 1 / det, tx = o[0] - V[a], ty = o[1] - V[a + 1], tz = o[2] - V[a + 2];
        const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) return;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > 0 && tt <= maxT && (best == null || tt < best)) best = tt;
      });
      if (best != null && best <= t1) return best;
      if (t1 >= maxT) break;
    }
    return best;
  }
  A.meshCollider = meshCollider;

  // ================================================================== nature: noise, terrain, scatter, sky
  function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 101); norm += amp; f *= 2.03; amp *= 0.5; }
    return sum / norm;
  }
  function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  A.noise = vnoise; A.fbm = fbm;

  // ---- terrain: a procedural island. Height is in world units relative to the terrain object's y.
  function terrainParams(o) {
    return { w: Math.abs(o.sx) || 400, d: Math.abs(o.sz) || 400, h: Math.abs(o.sy) || 60, seed: Math.floor(num(o.tseed == null ? 1 : o.tseed)),
      rough: num(o.trough == null ? 1 : o.trough), feature: num(o.tfeature == null ? 1 : o.tfeature) || 1, island: o.tisland !== false,
      res: Math.max(32, Math.min(320, Math.floor(num(o.tres || 200)))) };
  }
  function terrainShape(p, x, z) {
    const s = p.seed, k = 1 / (160 * p.feature);
    const u = x / p.w * 2, v = z / p.d * 2, dist = Math.sqrt(u * u + v * v);
    const fall = p.island ? smooth(1.0, 0.6, dist + (fbm(x * k * 3, z * k * 3, s + 51, 2) - 0.5) * 0.25) : 1;
    const c = fbm(x * k, z * k, s, 4);
    const ridge = 1 - Math.abs(fbm(x * k * 2.1 + 31.7, z * k * 2.1 - 17.3, s + 7, 5) * 2 - 1);
    const mountains = Math.pow(ridge, 2.4) * smooth(0.44, 0.7, c);
    const hills = (fbm(x * k * 6, z * k * 6, s + 3, 3) - 0.5) * 0.1 * p.rough;
    // a gentle dome keeps the middle of an island above the sea whatever the seed
    let e = c * 0.5 + mountains * 0.8 + hills + (p.island ? Math.max(0, 1 - dist) * 0.2 : 0);
    e = e * fall - (1 - fall) * 0.3;
    return (e - 0.24) * p.h;
  }
  const terrainCache = new Map();
  function terrainData(o) {
    const p = terrainParams(o), key = JSON.stringify(p);
    let t = terrainCache.get(key);
    if (t) return t;
    const N = p.res, n1 = N + 1, hs = new Float32Array(n1 * n1), cw = p.w / N, cd = p.d / N;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) hs[j * n1 + i] = terrainShape(p, (i / N - 0.5) * p.w, (j / N - 0.5) * p.d);
    const pos = new Float32Array(n1 * n1 * 3), nor = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3);
    const SAND = [0.85, 0.77, 0.56], WET = [0.55, 0.5, 0.37], G1 = [0.34, 0.56, 0.2], G2 = [0.5, 0.66, 0.24], FOREST = [0.24, 0.4, 0.17], DRY = [0.6, 0.6, 0.32], ROCK = [0.47, 0.44, 0.41], ROCK2 = [0.36, 0.34, 0.33], SNOW = [0.95, 0.96, 0.98];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const q = j * n1 + i, x = (i / N - 0.5) * p.w, z = (j / N - 0.5) * p.d, h = hs[q];
      const hl = hs[j * n1 + Math.max(0, i - 1)], hr = hs[j * n1 + Math.min(N, i + 1)], hd = hs[Math.max(0, j - 1) * n1 + i], hu = hs[Math.min(N, j + 1) * n1 + i];
      let nx = (hl - hr) / (2 * cw), nz = (hd - hu) / (2 * cd), ny = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      pos[q * 3] = x; pos[q * 3 + 1] = h; pos[q * 3 + 2] = z;
      nor[q * 3] = nx; nor[q * 3 + 1] = ny; nor[q * 3 + 2] = nz;
      const hr01 = h / p.h, slope = 1 - ny, n = fbm(x * 0.04, z * 0.04, p.seed + 11, 3), n2 = fbm(x * 0.012, z * 0.012, p.seed + 19, 2);
      let c = mix3(G1, G2, smooth(0.35, 0.7, n));
      c = mix3(c, DRY, smooth(0.6, 0.75, n2) * 0.6);
      c = mix3(c, FOREST, smooth(0.1, 0.3, hr01) * 0.7);
      c = mix3(SAND, c, smooth(0.012, 0.035, hr01 + (n - 0.5) * 0.02));
      if (hr01 < 0) c = mix3(WET, SAND, smooth(-0.05, 0, hr01));
      c = mix3(c, mix3(ROCK, ROCK2, n), Math.max(smooth(0.3, 0.5, slope), smooth(0.42, 0.56, hr01) * 0.85));
      c = mix3(c, SNOW, smooth(0.54, 0.62, hr01 + (n - 0.5) * 0.04) * (1 - smooth(0.4, 0.6, slope)));
      col[q * 3] = c[0]; col[q * 3 + 1] = c[1]; col[q * 3 + 2] = c[2];
    }
    const idx = new Uint32Array(N * N * 6);
    let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    t = { key: key, p: p, N: N, hs: hs, pos: pos, nor: nor, col: col, idx: idx };
    if (terrainCache.size > 8) terrainCache.delete(terrainCache.keys().next().value);
    terrainCache.set(key, t);
    return t;
  }
  // height of a terrain object at world x,z (null when outside it)
  function terrainHeightAt(o, wx, wz) {
    const t = terrainData(o), p = t.p, N = t.N, n1 = N + 1;
    const u = ((wx - o.x) / p.w + 0.5) * N, v = ((wz - o.z) / p.d + 0.5) * N;
    if (u < 0 || v < 0 || u > N || v > N) return null;
    const i = Math.min(N - 1, Math.floor(u)), j = Math.min(N - 1, Math.floor(v)), fu = u - i, fv = v - j;
    const h00 = t.hs[j * n1 + i], h10 = t.hs[j * n1 + i + 1], h01 = t.hs[(j + 1) * n1 + i], h11 = t.hs[(j + 1) * n1 + i + 1];
    return o.y + (fu + fv <= 1 ? h00 + (h10 - h00) * fu + (h01 - h00) * fv : h11 + (h01 - h11) * (1 - fu) + (h10 - h11) * (1 - fv));
  }
  A.terrainHeightAt = terrainHeightAt;

  // ---- scatter: many copies of a nature mesh spread over the terrain (drawn with GPU instancing)
  function scatterParams(o) {
    return { mesh: o.smesh || 'pine', count: Math.max(1, Math.min(20000, Math.floor(num(o.scount || 300)))), seed: Math.floor(num(o.sseed == null ? 1 : o.sseed)),
      size: num(o.ssize || 6), vary: num(o.svar == null ? 0.35 : o.svar), hmin: num(o.shmin == null ? 0.6 : o.shmin), hmax: num(o.shmax == null ? 9999 : o.shmax),
      slope: num(o.sslope == null ? 0.45 : o.sslope), clump: num(o.sclump || 0), w: Math.abs(o.sx), d: Math.abs(o.sz), x: o.x, y: o.y, z: o.z, sink: num(o.ssink == null ? 0.08 : o.ssink),
      clear: Array.isArray(o.sclear) ? o.sclear : [] }; // clearings: [[x, z, radius], ...] where nothing grows
  }
  const scatterCache = new Map();
  function scatterData(o, W) {
    const p = scatterParams(o), terrains = W.objs.filter(function (t) { return t.type === 'terrain' && t.alive !== false; });
    const key = JSON.stringify(p) + '|' + terrains.map(function (t) { return terrainData(t).key + t.x + ',' + t.y + ',' + t.z; }).join(';');
    let sd = scatterCache.get(key);
    if (sd) return sd;
    let rs = (p.seed * 9301 + 49297) % 233280 || 1;
    function rnd() { rs = (rs * 16807) % 2147483647; return rs / 2147483647; }
    function ground(x, z) { let best = null; terrains.forEach(function (t) { const h = terrainHeightAt(t, x, z); if (h != null && (best == null || h > best)) best = h; }); return best; }
    const mats = [], tints = [], cols = [];
    let tries = 0;
    while (mats.length / 16 < p.count && tries < p.count * 12) {
      tries++;
      const x = p.x + (rnd() - 0.5) * p.w, z = p.z + (rnd() - 0.5) * p.d;
      if (p.clump > 0 && fbm(x * 0.012, z * 0.012, p.seed + 5, 3) < p.clump * 0.62 + rnd() * 0.08) continue;
      if (p.clear.some(function (c) { const dx = x - c[0], dz = z - c[1]; return dx * dx + dz * dz < c[2] * c[2]; })) continue;
      let y = terrains.length ? ground(x, z) : p.y;
      if (y == null || y < p.hmin || y > p.hmax) continue;
      if (terrains.length) {
        const e = 1.5, hx = ground(x + e, z), hz = ground(x, z + e);
        if (hx == null || hz == null) continue;
        const ny = 1 / Math.hypot((hx - y) / e, 1, (hz - y) / e);
        if (1 - ny > p.slope) continue;
      }
      const s = p.size * (1 - p.vary + rnd() * p.vary * 2), sy = s * (0.85 + rnd() * 0.3), a = rnd() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // column-major T * Ry * S, mesh base (-0.5) sits on the ground, sunk a little
      mats.push(ca * s, 0, -sa * s, 0, 0, sy, 0, 0, sa * s, 0, ca * s, 0, x, y + sy * (0.5 - p.sink), z, 1);
      const tv = 0.85 + rnd() * 0.3;
      tints.push(tv * (0.95 + rnd() * 0.1), tv, tv * (0.92 + rnd() * 0.12));
      cols.push(x, z, s, y);
    }
    sd = { key: key, p: p, mats: new Float32Array(mats), tints: new Float32Array(tints), n: mats.length / 16, cols: cols, grid: null };
    // spatial grid for trunk collisions
    sd.grid = new Map();
    for (let i = 0; i < cols.length; i += 4) {
      const gk = Math.floor(cols[i] / 8) + ',' + Math.floor(cols[i + 1] / 8);
      if (!sd.grid.has(gk)) sd.grid.set(gk, []);
      sd.grid.get(gk).push(i / 4);
    }
    if (scatterCache.size > 40) scatterCache.delete(scatterCache.keys().next().value);
    scatterCache.set(key, sd);
    return sd;
  }
  // how wide the solid part of each nature mesh is, as a fraction of its size
  const TRUNK = { pine: 0.07, tree: 0.08, rock: 0.42, bush: 0, grass: 0 };

  // ---- sky: colours and sun position from the time of day (hours, 0-24)
  function hexl(h) { const c = rgb(h); return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)]; }
  const SKY_KEYS = [ // elevation (deg): display colours for zenith/horizon/ground, linear sun + ambient
    { el: -12, zen: '#0b1633', hor: '#22335e', gnd: '#0d1220', sun: [0.32, 0.4, 0.62], amb: [0.1, 0.13, 0.22] },
    { el: -2, zen: '#1d2b5c', hor: '#c46a52', gnd: '#1c1620', sun: [0.75, 0.42, 0.32], amb: [0.15, 0.14, 0.2] },
    { el: 6, zen: '#2d4689', hor: '#ffa36b', gnd: '#3a2b26', sun: [2.6, 1.35, 0.65], amb: [0.26, 0.22, 0.28] },
    { el: 18, zen: '#3a68b4', hor: '#ffd3a3', gnd: '#4d4438', sun: [2.7, 2.0, 1.35], amb: [0.28, 0.31, 0.4] },
    { el: 40, zen: '#2f6dd0', hor: '#bcd9f4', gnd: '#5d5c52', sun: [2.55, 2.42, 2.18], amb: [0.29, 0.34, 0.46] }
  ];
  function skyState(hours, clouds) {
    const th = ((hours - 6) / 12) * Math.PI;
    let sun = [-Math.cos(th), Math.sin(th) * 0.92, 0.38];
    const l = Math.hypot(sun[0], sun[1], sun[2]); sun = [sun[0] / l, sun[1] / l, sun[2] / l];
    const el = Math.asin(sun[1]) / DEG;
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1], t = 0;
    for (let i = 0; i < SKY_KEYS.length - 1; i++) if (el >= SKY_KEYS[i].el && el <= SKY_KEYS[i + 1].el) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; t = (el - a.el) / (b.el - a.el); break; }
    if (el < SKY_KEYS[0].el) { a = b = SKY_KEYS[0]; } else if (el > SKY_KEYS[SKY_KEYS.length - 1].el) { a = b = SKY_KEYS[SKY_KEYS.length - 1]; }
    const zen = mix3(rgb(a.zen), rgb(b.zen), t), hor = mix3(rgb(a.hor), rgb(b.hor), t), gnd = mix3(rgb(a.gnd), rgb(b.gnd), t);
    const night = smooth(-2, -10, el);
    const lightDir = el > -4 ? [-sun[0], -sun[1], -sun[2]] : [sun[0], sun[1], sun[2]]; // the moon lights the night
    const cloudDim = 1 - (clouds || 0) * 0.25;
    return {
      sunDir: sun, el: el, night: night, zenith: zen, horizon: hor, ground: gnd,
      sunCol: mix3(a.sun, b.sun, t).map(function (v) { return v * cloudDim; }), amb: mix3(a.amb, b.amb, t),
      lightDir: lightDir, sunGlow: mix3([1.0, 0.75, 0.5], [1.0, 0.95, 0.85], smooth(5, 30, el))
    };
  }
  A.skyState = skyState;

  // ================================================================== ragdolls: active verlet characters
  // 15 points held in a standing pose by "muscles". Knocked down = muscles off, the body collapses, then gets up.
  // The object itself is an invisible 0.7 x 1.9 x 0.6 collider (the "root") that walks like any dynamic body.
  const RD_REST = [
    [0, 0.02, 0], [0, 0.42, 0], [0, 0.8, 0],             // 0 pelvis, 1 chest, 2 head
    [-0.25, 0.5, 0], [0.25, 0.5, 0],                      // 3, 4 shoulders
    [-0.3, 0.2, 0.02], [0.3, 0.2, 0.02],                  // 5, 6 elbows
    [-0.32, -0.08, 0], [0.32, -0.08, 0],                  // 7, 8 hands
    [-0.12, -0.06, 0], [0.12, -0.06, 0],                  // 9, 10 hips
    [-0.13, -0.5, -0.02], [0.13, -0.5, -0.02],            // 11, 12 knees
    [-0.13, -0.9, 0], [0.13, -0.9, 0]                     // 13, 14 feet
  ];
  const RD_STICKS = [[0, 1], [1, 2], [1, 3], [1, 4], [3, 4], [3, 5], [5, 7], [4, 6], [6, 8], [0, 9], [0, 10], [9, 10], [9, 11], [11, 13], [10, 12], [12, 14],
    [3, 9], [4, 10], [3, 10], [4, 9], [2, 3], [2, 4]];
  const RD_K = [0.5, 0.45, 0.32, 0.4, 0.4, 0.13, 0.13, 0.15, 0.15, 0.45, 0.45, 0.22, 0.22, 0.32, 0.32];
  const RD_BONES = [[0, 1, 0.44, 0.28, 'shirt'], [3, 5, 0.15, 0.15, 'shirt'], [4, 6, 0.15, 0.15, 'shirt'], [5, 7, 0.13, 0.13, 'skin'], [6, 8, 0.13, 0.13, 'skin'],
    [9, 11, 0.18, 0.18, 'pants'], [10, 12, 0.18, 0.18, 'pants'], [11, 13, 0.16, 0.16, 'pants'], [12, 14, 0.16, 0.16, 'pants']];
  const RD_DEF = { shirt: '#e04a3a', pants: '#2f3f6b', skin: '#f1c27d' };
  function rdTarget(o, rd, i) {
    const r = RD_REST[i];
    let x = r[0], y = r[1], z = r[2];
    const s = rd.walk, ph = rd.phase, sc = Math.abs(o.sy) || 1;
    // walk cycle: legs step, arms swing the other way, body leans into the run
    if (i === 11 || i === 13) { z += Math.sin(ph) * (i === 13 ? 0.34 : 0.2) * s; if (i === 13) y += Math.max(0, Math.cos(ph)) * 0.16 * s; }
    if (i === 12 || i === 14) { z += Math.sin(ph + Math.PI) * (i === 14 ? 0.34 : 0.2) * s; if (i === 14) y += Math.max(0, Math.cos(ph + Math.PI)) * 0.16 * s; }
    if (i === 5 || i === 7) z -= Math.sin(ph) * (i === 7 ? 0.26 : 0.14) * s;
    if (i === 6 || i === 8) z += Math.sin(ph) * (i === 8 ? 0.26 : 0.14) * s;
    if (i <= 4) z -= 0.1 * s * (r[1] + 0.1);
    if (rd.hold && i >= 5 && i <= 8) { // carry pose: both hands out in front
      if (i <= 6) { y = 0.3; z = -0.22; } else { x = i === 7 ? -0.15 : 0.15; y = 0.28; z = -0.5; }
    }
    if (!o.onGround && !rd.hold && (i === 7 || i === 8)) { y += 0.5; x *= 1.4; } // flail in the air
    const c = Math.cos(o.ry * DEG), sn = Math.sin(o.ry * DEG);
    x *= sc; y *= sc; z *= sc;
    return [o.x + x * c + z * sn, o.y + y, o.z - x * sn + z * c];
  }
  function rdInit(o) {
    const rd = { p: [], q: [], walk: 0, phase: 0, downUntil: -1, str: 1, hold: false, want: 0 };
    o._rd = rd;
    for (let i = 0; i < RD_REST.length; i++) { const t = rdTarget(o, rd, i); rd.p.push(t.slice()); rd.q.push(t.slice()); }
    rd.len = RD_STICKS.map(function (s) { const a = RD_REST[s[0]], b = RD_REST[s[1]]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * (Math.abs(o.sy) || 1); });
    return rd;
  }
  // one physics step for a ragdoll (after the normal physics has moved its root)
  World.prototype.ragdollStep = function (o, dt, solids) {
    const rd = o._rd || rdInit(o), W = this;
    const down = this.time < rd.downUntil;
    if (down) { o.x = rd.p[0][0]; o.z = rd.p[0][2]; o.vx = 0; o.vz = 0; }
    const speed = Math.hypot(o.vx, o.vz);
    rd.walk += (Math.min(1, speed / 6) - rd.walk) * Math.min(1, dt * 8);
    if (rd.walk > 0.03) rd.phase += dt * (5 + speed * 1.3);
    rd.hold = !!(o.held && o.held.alive);
    rd.str += ((down ? 0 : 1) - rd.str) * Math.min(1, dt * (down ? 30 : 2.2));
    const g = this.gravity * dt * dt, kScale = Math.min(1, dt * 60);
    for (let i = 0; i < rd.p.length; i++) {
      const p = rd.p[i], q = rd.q[i];
      const vx = (p[0] - q[0]) * 0.98, vy = (p[1] - q[1]) * 0.98, vz = (p[2] - q[2]) * 0.98;
      q[0] = p[0]; q[1] = p[1]; q[2] = p[2];
      p[0] += vx; p[1] += vy - g; p[2] += vz;
      if (rd.str > 0.01) {
        const t = rdTarget(o, rd, i), k = RD_K[i] * rd.str * kScale;
        p[0] += (t[0] - p[0]) * k; p[1] += (t[1] - p[1]) * k; p[2] += (t[2] - p[2]) * k;
      }
    }
    for (let it = 0; it < 5; it++) {
      for (let s = 0; s < RD_STICKS.length; s++) {
        const a = rd.p[RD_STICKS[s][0]], b = rd.p[RD_STICKS[s][1]];
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - rd.len[s]) / d * 0.5;
        a[0] += dx * f; a[1] += dy * f; a[2] += dz * f; b[0] -= dx * f; b[1] -= dy * f; b[2] -= dz * f;
      }
      // keep points out of the floor, terrain and solid objects
      for (let i = 0; i < rd.p.length; i++) {
        const p = rd.p[i], q = rd.q[i], r = 0.07;
        const gh = W.groundAt(p[0], p[2]);
        if (gh != null && p[1] < gh + r) { p[1] = gh + r; q[0] += (p[0] - q[0]) * 0.3; q[2] += (p[2] - q[2]) * 0.3; }
        if (W._meshes) for (let m = 0; m < W._meshes.length; m++) {
          const fl = mcFloor(W._meshes[m], p[0], p[1], p[2], 0.3, 0.3);
          if (fl != null && p[1] < fl + r) { p[1] = fl + r; q[0] += (p[0] - q[0]) * 0.3; q[2] += (p[2] - q[2]) * 0.3; }
        }
        for (let j = 0; j < solids.length; j++) {
          const sd = solids[j];
          if (sd === o || sd.heldBy || sd.type === 'ragdoll') continue;
          const e = sd._ext || extents(sd, true);
          const ox = e[0] + r - Math.abs(p[0] - sd.x), oy = e[1] + r - Math.abs(p[1] - sd.y), oz = e[2] + r - Math.abs(p[2] - sd.z);
          if (ox <= 0 || oy <= 0 || oz <= 0) continue;
          if (oy <= ox && oy <= oz) { p[1] = sd.y + (p[1] > sd.y ? 1 : -1) * (e[1] + r); if (p[1] > sd.y) { q[0] += (p[0] - q[0]) * 0.3; q[2] += (p[2] - q[2]) * 0.3; } }
          else if (ox <= oz) p[0] = sd.x + (p[0] > sd.x ? 1 : -1) * (e[0] + r);
          else p[2] = sd.z + (p[2] > sd.z ? 1 : -1) * (e[2] + r);
        }
      }
    }
    // sprinting into a wall knocks you over
    if (!down && o.stumble !== false && rd.want > 7.5 && o.onGround && o.px != null && Math.hypot(o.x - o.px, o.z - o.pz) / dt < rd.want * 0.3) this.knockDown(o, 1.4, 4);
    // carried item follows the hands
    if (o.held) {
      const h = o.held;
      if (!h.alive) { o.held = null; }
      else {
        const a = rd.p[7], b = rd.p[8], f = 0.12;
        h.x = (a[0] + b[0]) / 2 - Math.sin(o.ry * DEG) * f; h.y = (a[1] + b[1]) / 2 + extents(h, true)[1] * 0.6; h.z = (a[2] + b[2]) / 2 - Math.cos(o.ry * DEG) * f;
        h.vx = h.vy = h.vz = 0; h.ry = o.ry;
      }
    }
  };
  World.prototype.knockDown = function (o, secs, push) {
    if (o.type !== 'ragdoll') return;
    const rd = o._rd || rdInit(o);
    rd.downUntil = this.time + secs;
    // tumble: kick the upper body backwards and the feet forwards
    const fx = -Math.sin(o.ry * DEG), fz = -Math.cos(o.ry * DEG), k = (push || 3) * 0.016;
    rd.p.forEach(function (p, i) { const up = i <= 8 ? -1 : 1; rd.q[i][0] = p[0] - fx * k * up; rd.q[i][2] = p[2] - fz * k * up; rd.q[i][1] = p[1] - k * 0.5; });
    if (o.held && o.held.alive) { const h = o.held; h.heldBy = null; o.held = null; h.vx = fx * 4; h.vy = 4; h.vz = fz * 4; }
  };
  World.prototype.hold = function (o, item) {
    if (!item || !item.alive || item.heldBy) return;
    if (o.held && o.held.alive) return;
    o.held = item; item.heldBy = o;
  };
  // world matrices for drawing a ragdoll: [{m, color, mesh}]
  function rdBones(o) {
    const rd = o._rd || rdInit(o), out = [], yaw = o.ry * DEG, ref = [-Math.sin(yaw), 0, -Math.cos(yaw)];
    const col = { shirt: o.shirt || RD_DEF.shirt, pants: o.pants || RD_DEF.pants, skin: o.skin || RD_DEF.skin };
    const sc = Math.abs(o.sy) || 1;
    function bone(a, b, w, d, color, mesh) {
      let y = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len = Math.hypot(y[0], y[1], y[2]) || 1e-4; y = [y[0] / len, y[1] / len, y[2] / len];
      let x = [y[1] * ref[2] - y[2] * ref[1], y[2] * ref[0] - y[0] * ref[2], y[0] * ref[1] - y[1] * ref[0]];
      let xl = Math.hypot(x[0], x[1], x[2]);
      if (xl < 1e-3) { x = [Math.cos(yaw), 0, -Math.sin(yaw)]; xl = 1; }
      x = [x[0] / xl, x[1] / xl, x[2] / xl];
      const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
      const m = new Float32Array(16);
      m[0] = x[0] * w; m[1] = x[1] * w; m[2] = x[2] * w; m[4] = y[0] * len; m[5] = y[1] * len; m[6] = y[2] * len;
      m[8] = z[0] * d; m[9] = z[1] * d; m[10] = z[2] * d; m[12] = (a[0] + b[0]) / 2; m[13] = (a[1] + b[1]) / 2; m[14] = (a[2] + b[2]) / 2; m[15] = 1;
      out.push({ m: m, color: color, mesh: mesh || 'cube' });
    }
    RD_BONES.forEach(function (b) { bone(rd.p[b[0]], rd.p[b[1]], b[2] * sc, b[3] * sc, col[b[4]]); });
    // head (sphere along the neck), eyes and an optional hat
    const ch = rd.p[1], hd = rd.p[2], nx = hd[0] - ch[0], ny = hd[1] - ch[1], nz = hd[2] - ch[2], nl = Math.hypot(nx, ny, nz) || 1;
    const hc = [hd[0] + nx / nl * 0.06 * sc, hd[1] + ny / nl * 0.06 * sc, hd[2] + nz / nl * 0.06 * sc];
    bone([hc[0] - nx / nl * 0.19 * sc, hc[1] - ny / nl * 0.19 * sc, hc[2] - nz / nl * 0.19 * sc], [hc[0] + nx / nl * 0.19 * sc, hc[1] + ny / nl * 0.19 * sc, hc[2] + nz / nl * 0.19 * sc], 0.36 * sc, 0.34 * sc, col.skin, 'sphere');
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    [-1, 1].forEach(function (sd) {
      const e = [hc[0] + ref[0] * 0.16 * sc + rx * sd * 0.07 * sc, hc[1] + 0.03 * sc, hc[2] + ref[2] * 0.16 * sc + rz * sd * 0.07 * sc];
      bone([e[0], e[1] - 0.03 * sc, e[2]], [e[0], e[1] + 0.03 * sc, e[2]], 0.06 * sc, 0.06 * sc, '#1b1b22', 'sphere');
    });
    if (o.hat) {
      const top = [hc[0] + nx / nl * 0.17 * sc, hc[1] + ny / nl * 0.17 * sc, hc[2] + nz / nl * 0.17 * sc];
      bone(top, [top[0] + nx / nl * 0.12 * sc, top[1] + ny / nl * 0.12 * sc, top[2] + nz / nl * 0.12 * sc], 0.38 * sc, 0.38 * sc, o.hat, 'cylinder');
    }
    return out;
  }

  // ================================================================== 3D renderer
  // Vertex shader: per-object matrix or per-instance matrix (forests), optional wind sway and vertex colours.
  const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV; layout(location=3) in vec3 aCol;
layout(location=4) in mat4 aInst; layout(location=8) in vec3 aTint;
uniform mat4 uModel, uVP, uLVP; uniform mat3 uNM; uniform float uInst, uWind, uTime, uVColor;
out vec3 vN; out vec3 vW; out vec4 vL; out vec2 vUV; out vec3 vCol;
void main() {
  mat4 M = uInst > .5 ? aInst : uModel;
  vec3 p = aPos;
  if (uWind > 0.) {
    float h = clamp(aPos.y + .5, 0., 1.); h *= h;
    vec3 o = (M * vec4(0., 0., 0., 1.)).xyz;
    p.x += sin(uTime * 1.7 + o.x * .31 + o.z * .17) * uWind * h;
    p.z += cos(uTime * 1.3 + o.z * .27 - o.x * .11) * uWind * .7 * h;
  }
  vec4 w = M * vec4(p, 1.);
  vW = w.xyz; vN = uInst > .5 ? mat3(M) * aNor : uNM * aNor; vL = uLVP * w; vUV = aUV;
  vCol = (uVColor > .5 ? aCol : vec3(1.)) * (uInst > .5 ? aTint : vec3(1.));
  gl_Position = uVP * w;
}`;
  const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vL; in vec2 vUV; in vec3 vCol;
uniform vec3 uColor0, uLightDir, uEye, uFog, uSky, uSunCol, uAmbTop, uAmbBot, uSunGlow, uZenith;
uniform float uAlpha0, uAmb, uFogNear, uFogFar, uUseShadow, uEmissive, uUseTex, uFancy, uWater, uTime, uFogDensity;
uniform sampler2DShadow uShadow; uniform sampler2D uTex;
out vec4 o;
float sh() {
  vec3 p = vL.xyz / vL.w * .5 + .5;
  if (p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1. || p.z > 1.) return 1.;
  float s = 0.; vec2 t = 1. / vec2(textureSize(uShadow, 0));
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) s += texture(uShadow, vec3(p.xy + vec2(x, y) * t, p.z - .0015));
  return s / 9.;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
void main() {
  vec3 base = uColor0 * vCol; float alpha = uAlpha0;
  if (uUseTex > .5) { vec4 tx = texture(uTex, vUV); if (tx.a < .35) discard; base *= tx.rgb; }
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(-uLightDir); vec3 V = normalize(uEye - vW);
  float s = uUseShadow > .5 ? sh() : 1.;
  if (uFancy < .5) {
    // classic look (games made before the sky existed keep this)
    float d = max(dot(n, L), 0.); vec3 H = normalize(L + V);
    float sp = pow(max(dot(n, H), 0.), 40.) * .25 * s * step(.001, d); float hemi = .5 + .5 * n.y;
    vec3 amb = mix(uFog * .6, uSky, hemi) * uAmb; vec3 c = base * (amb + vec3(d * s * (1. - uAmb * .5))) + vec3(sp); c = mix(c, base, uEmissive);
    float f = clamp((length(uEye - vW) - uFogNear) / (uFogFar - uFogNear), 0., 1.); c = mix(c, uFog, f * f);
    o = vec4(pow(c, vec3(.95)), alpha); return;
  }
  // atmospheric look: linear lighting, sky ambient, filmic tone mapping, sun-tinted fog
  vec3 alb = pow(base, vec3(2.2));
  float fres = 0.;
  if (uWater > .5) {
    vec2 q = vW.xz; float t = uTime;
    float dx = cos(q.x * .31 + t * 1.1) * .10 + cos((q.x + q.y) * .67 + t * 1.7) * .07 + cos(q.y * 1.37 - t * 2.1) * .035 + cos(q.x * 3.1 + q.y * 1.7 + t * 3.) * .02;
    float dz = cos(q.y * .37 + t * .9) * .10 + cos((q.x - q.y) * .59 + t * 1.4) * .07 + cos(q.x * 1.53 + t * 2.3) * .035 + cos(q.y * 2.9 - q.x * 1.3 + t * 2.7) * .02;
    // fine waves fade out with distance so the far sea doesn't shimmer into a pattern
    float detail = exp(-length(uEye - vW) * .012);
    n = normalize(vec3(-dx * detail, 1., -dz * detail));
    fres = .02 + .78 * pow(1. - max(dot(n, V), 0.), 5.);
  }
  float d = max(dot(n, L), 0.);
  vec3 H = normalize(L + V);
  float gloss = uWater > .5 ? 600. : 24.;
  float spec = pow(max(dot(n, H), 0.), gloss) * (uWater > .5 ? 6. : .08) * s * step(.001, d);
  vec3 amb = mix(uAmbBot, uAmbTop, .5 + .5 * n.y);
  float wrap = uWater > .5 ? d : max(dot(n, L) * .8 + .2, 0.);   // soft wrap lighting for foliage and terrain
  vec3 lit = alb * (amb + uSunCol * wrap * s) + uSunCol * spec;
  if (uWater > .5) {
    vec3 r = reflect(-V, n);
    vec3 refl = mix(uFog, uZenith, pow(clamp(r.y, 0., 1.), .45));   // reflect the sky gradient
    vec3 body = alb * (amb * 1.4 + uSunCol * d * s * .25);
    lit = mix(body, pow(refl, vec3(2.2)), fres) + uSunCol * spec;
    alpha = mix(.82, 1., fres);
  }
  lit = mix(lit, alb * 1.6, uEmissive);
  vec3 c = pow(aces(lit), vec3(1. / 2.2));
  float dist = length(uEye - vW);
  float f = 1. - exp(-dist * uFogDensity);
  f *= smoothstep(-40., 20., -(vW.y - uEye.y) + 20.) * .35 + .65;  // thinner fog up high
  float sunF = pow(max(dot(-V, L), 0.), 6.);
  vec3 fogC = mix(uFog, uSunGlow, sunF * .55);
  o = vec4(mix(c, fogC, clamp(f, 0., 1.)), alpha);
}`;
  const SVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=4) in mat4 aInst;
uniform mat4 uModel, uLVP; uniform float uInst;
void main() { mat4 M = uInst > .5 ? aInst : uModel; gl_Position = uLVP * M * vec4(aPos, 1.); }`;
  const SFS = '#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(1);}';
  // Sky: a full-screen pass that draws the gradient, sun, clouds and stars behind everything.
  const SKYVS = `#version 300 es
out vec2 vP;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2. - 1.; vP = p; gl_Position = vec4(p, .9999, 1.); }`;
  const SKYFS = `#version 300 es
precision highp float;
in vec2 vP; out vec4 o;
uniform mat4 uInvVP; uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunGlow; uniform float uTime, uClouds, uNight;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= .5; } return s; }
void main() {
  vec4 a = uInvVP * vec4(vP, -1., 1.), b = uInvVP * vec4(vP, 1., 1.);
  vec3 d = normalize(b.xyz / b.w - a.xyz / a.w);
  float y = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0., 1.), .5));
  col = mix(col, uGround, smoothstep(0., -.12, y));
  float sd = max(dot(d, uSunDir), 0.);
  float day = 1. - uNight;
  col += uSunGlow * (pow(sd, 1400.) * 6. * step(-.02, uSunDir.y) + pow(sd, 16.) * .35 + pow(sd, 4.) * .12) * day;
  col += vec3(.75, .8, .95) * pow(max(dot(d, -uSunDir), 0.), 2200.) * 2. * uNight;   // the moon
  if (y > 0.) {
    vec2 cp = d.xz / (y + .12) * 1.6 + vec2(uTime * .012, uTime * .005);
    float c = fb(cp) * .7 + fb(cp * 2.7 + 9.) * .3;
    float cover = smoothstep(1. - uClouds, 1.15 - uClouds * .7, c) * smoothstep(0., .18, y);
    vec3 lit = mix(mix(vec3(1.), uHorizon, .35), uSunGlow, pow(sd, 3.) * .6) * mix(1., .25, uNight);
    vec3 shade = mix(uZenith, uHorizon, .5) * .7;
    col = mix(col, mix(shade, lit, smoothstep(.3, .9, c)), cover * .92);
    float star = step(.997, h21(floor(d.xz / (y + .25) * 260.))) * uNight * (1. - cover);
    col += vec3(star) * smoothstep(0., .25, y);
  }
  o = vec4(col, 1.);
}`;
  const LVS = '#version 300 es\nlayout(location=0) in vec3 aPos;uniform mat4 uVP;void main(){gl_Position=uVP*vec4(aPos,1.);}';
  const LFS = '#version 300 es\nprecision highp float;uniform vec4 uColor;out vec4 o;void main(){o=uColor;}';

  function Renderer3D(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available on this computer.');
    this.gl = gl;
    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function prog(vs, fs) {
      const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p: p, u: u };
    }
    this.main = prog(VS, FS); this.shadow = prog(SVS, SFS); this.line = prog(LVS, LFS); this.sky = prog(SKYVS, SKYFS);
    this.skyVao = gl.createVertexArray();
    this.meshes = {};
    const self = this;
    Object.keys(MESHES).forEach(function (k) {
      const m = MESHES[k](), vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.P), gl.STATIC_DRAW);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.I), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      let cb = null;
      if (m.C) { cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.C), gl.STATIC_DRAW); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0); }
      self.meshes[k] = { vao: vao, n: m.I.length, vb: vb, ib: ib, cb: cb, vcol: !!m.C };
    });
    gl.bindVertexArray(null);
    this.terrainGPU = new Map(); this.scatterGPU = new Map();
    this.models = new Map();
    this.white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    // shadow map
    this.SM = 2048;
    this.depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.SM, this.SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lineBuf = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
  }
  Renderer3D.prototype.destroy = function () {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  };
  // upload a parsed model to this GL context (once per model version); textures upload when their image has loaded
  Renderer3D.prototype.modelGPU = function (md) {
    const gl = this.gl;
    let g = this.models.get(md);
    if (!g || g.ver !== md.ver) {
      g = { ver: md.ver, parts: md.parts.map(function (p) {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        [[p.pos, 0, 3], [p.nor, 1, 3], [p.uv, 2, 2]].forEach(function (a) {
          const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a[0], gl.STATIC_DRAW);
          gl.enableVertexAttribArray(a[1]); gl.vertexAttribPointer(a[1], a[2], gl.FLOAT, false, 0, 0);
        });
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        return { vao: vao, n: p.idx.length, src: p, tex: null };
      }) };
      this.models.set(md, g);
    }
    const R = this;
    g.parts.forEach(function (gp) {
      const im = gp.src.image;
      if (gp.tex || !im) return;
      if (im._ready && !im.bitmap) return; // picture failed to decode: leave it untextured
      if (!im._ready || R.texBudget <= 0) { R.texPending = true; return; }
      // stream textures: only a few uploads per frame so big maps never freeze the game
      R.texBudget--;
      gp.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, gp.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im.bitmap);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    });
    return g;
  };
  Renderer3D.prototype.terrainMesh = function (t) {
    const gl = this.gl;
    let g = this.terrainGPU.get(t.key);
    if (g) return g;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    [[t.pos, 0], [t.nor, 1], [t.col, 3]].forEach(function (a) {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a[0], gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a[1]); gl.vertexAttribPointer(a[1], 3, gl.FLOAT, false, 0, 0);
    });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    g = { vao: vao, n: t.idx.length };
    if (this.terrainGPU.size > 6) this.terrainGPU.clear();
    this.terrainGPU.set(t.key, g);
    return g;
  };
  Renderer3D.prototype.scatterMesh = function (sd) {
    const gl = this.gl, mesh = this.meshes[sd.p.mesh] || this.meshes.cube;
    let g = this.scatterGPU.get(sd.key);
    if (g) return g;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    if (mesh.cb) { gl.bindBuffer(gl.ARRAY_BUFFER, mesh.cb); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0); }
    const mb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mb); gl.bufferData(gl.ARRAY_BUFFER, sd.mats, gl.STATIC_DRAW);
    for (let c = 0; c < 4; c++) { gl.enableVertexAttribArray(4 + c); gl.vertexAttribPointer(4 + c, 4, gl.FLOAT, false, 64, c * 16); gl.vertexAttribDivisor(4 + c, 1); }
    const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, sd.tints, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(8, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.bindVertexArray(null);
    g = { vao: vao, n: mesh.n, count: sd.n, vcol: mesh.vcol, buffers: [mb, tb] };
    if (this.scatterGPU.size > 40) { this.scatterGPU.forEach(function (x) { x.buffers.forEach(function (b) { gl.deleteBuffer(b); }); gl.deleteVertexArray(x.vao); }); this.scatterGPU.clear(); }
    this.scatterGPU.set(sd.key, g);
    return g;
  };
  Renderer3D.prototype.lines = function (VP, pts, color) {
    const gl = this.gl;
    gl.useProgram(this.line.p);
    gl.uniformMatrix4fv(this.line.u.uVP, false, VP);
    gl.uniform4fv(this.line.u.uColor, color);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, pts.length / 3);
    gl.bindVertexArray(null);
  };
  // view: {w,h, eye, target, fov, bg, light:{dir, amb}, objs, grid, selected, fog}
  const IDENT = M4.ident();
  const WIND = { pine: 0.05, tree: 0.06, bush: 0.08, grass: 0.28, rock: 0 };
  // view: {w,h, eye, target, fov, bg, light:{dir, amb}, objs, grid, selected, fog, sky?, world, project}
  Renderer3D.prototype.render = function (view) {
    const gl = this.gl, R = this, sky = view.sky, st = sky && sky.state;
    this.texBudget = 2; this.texPending = false;
    const bg = st ? st.horizon : rgb(view.bg);
    const aspect = view.w / Math.max(1, view.h);
    const P = M4.persp((view.fov || 60) * DEG, aspect, 0.1, st ? 2500 : 1000);
    const V = M4.lookAt(view.eye, view.target, [0, 1, 0]);
    const VP = M4.mul(P, V);
    view.VP = VP;
    // light (follows the camera's target so shadows stay sharp near the player)
    let ld = st ? st.lightDir : view.light.dir; const ll = Math.hypot(ld[0], ld[1], ld[2]) || 1; ld = [ld[0] / ll, ld[1] / ll, ld[2] / ll];
    const S = view.shadowSize || 30, tc = view.target, back = S * 2 + 60;
    const lv = M4.lookAt([tc[0] - ld[0] * back, tc[1] - ld[1] * back, tc[2] - ld[2] * back], tc, Math.abs(ld[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]);
    const LVP = M4.mul(M4.ortho(-S, S, -S, S, 1, back * 2 + S * 2), lv);
    // every visible thing becomes one or more draw calls
    const items = [];
    view.objs.forEach(function (o) {
      if (!o.visible && !view.editor) return;
      if (o.type === 'terrain') {
        const g = R.terrainMesh(terrainData(o));
        items.push({ o: o, m: M4.trs(o.x, o.y, o.z, 0, 0, 0, 1, 1, 1), calls: [{ vao: g.vao, n: g.n, type: gl.UNSIGNED_INT, vcol: 1 }] });
        return;
      }
      if (o.type === 'scatter') {
        if (!view.world) return;
        const sd = scatterData(o, view.world);
        if (!sd.n) return;
        const g = R.scatterMesh(sd);
        const wind = o.swind != null ? num(o.swind) : (WIND[sd.p.mesh] || 0);
        items.push({ o: o, m: IDENT, calls: [{ vao: g.vao, n: g.n, type: gl.UNSIGNED_SHORT, vcol: g.vcol ? 1 : 0, inst: g.count, wind: wind }] });
        return;
      }
      if (o.type === 'ragdoll') {
        rdBones(o).forEach(function (b) { const mesh = R.meshes[b.mesh]; items.push({ o: o, m: b.m, color: b.color, calls: [{ vao: mesh.vao, n: mesh.n, type: gl.UNSIGNED_SHORT }] }); });
        return;
      }
      let calls;
      if (o.type === 'model') {
        const md = A.Models.get(view.project, o.model);
        if (!md || md.status !== 'ready') return;
        calls = R.modelGPU(md).parts.map(function (p) { return { vao: p.vao, n: p.n, type: gl.UNSIGNED_INT, part: p }; });
      } else {
        const mesh = R.meshes[o.type];
        if (!mesh) return;
        calls = [{ vao: mesh.vao, n: mesh.n, type: gl.UNSIGNED_SHORT, vcol: mesh.vcol ? 1 : 0, wind: o.swind != null ? num(o.swind) : 0 }];
      }
      const sy = o.type === 'plane' ? 1 : o.sy, km = o.type === 'model' ? modelMul(o, A.Models.get(view.project, o.model)) : 1;
      items.push({ o: o, m: M4.trs(o.x, o.y, o.z, o.rx * DEG, o.ry * DEG, o.rz * DEG, o.sx * km, sy * km, o.sz * km), calls: calls });
    });
    const time = view.time || 0;
    function issue(c) {
      gl.bindVertexArray(c.vao);
      if (c.inst) gl.drawElementsInstanced(gl.TRIANGLES, c.n, c.type, 0, c.inst);
      else gl.drawElements(gl.TRIANGLES, c.n, c.type, 0);
    }
    // shadow pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.SM, this.SM);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.shadow.p);
    gl.uniformMatrix4fv(this.shadow.u.uLVP, false, LVP);
    gl.disable(gl.CULL_FACE);
    const lightDown = ld[1] < -0.05;
    items.forEach(function (it) {
      if (!lightDown || it.o.alpha < 0.5 || it.o.castShadow === false || !it.o.visible || it.o.water) return;
      gl.uniformMatrix4fv(R.shadow.u.uModel, false, it.m);
      it.calls.forEach(function (c) { gl.uniform1f(R.shadow.u.uInst, c.inst ? 1 : 0); issue(c); });
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // main pass
    gl.viewport(0, 0, view.w, view.h);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (st) {
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      const k = this.sky.u;
      gl.useProgram(this.sky.p);
      gl.uniformMatrix4fv(k.uInvVP, false, M4.invert(VP));
      gl.uniform3fv(k.uSunDir, st.sunDir); gl.uniform3fv(k.uZenith, st.zenith); gl.uniform3fv(k.uHorizon, st.horizon); gl.uniform3fv(k.uGround, st.ground);
      gl.uniform3fv(k.uSunGlow, st.sunGlow); gl.uniform1f(k.uTime, time); gl.uniform1f(k.uClouds, sky.clouds); gl.uniform1f(k.uNight, st.night);
      gl.bindVertexArray(this.skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    }
    const u = this.main.u;
    gl.useProgram(this.main.p);
    gl.uniformMatrix4fv(u.uVP, false, VP);
    gl.uniformMatrix4fv(u.uLVP, false, LVP);
    gl.uniform3fv(u.uLightDir, ld);
    gl.uniform3fv(u.uEye, view.eye);
    gl.uniform3fv(u.uFog, bg);
    gl.uniform3fv(u.uSky, [Math.min(1, bg[0] * 0.6 + 0.4), Math.min(1, bg[1] * 0.6 + 0.4), Math.min(1, bg[2] * 0.6 + 0.4)]);
    gl.uniform1f(u.uAmb, view.light.amb != null ? view.light.amb : 0.45);
    gl.uniform1f(u.uFogNear, view.fog ? view.fog[0] : 60);
    gl.uniform1f(u.uFogFar, view.fog ? view.fog[1] : 250);
    gl.uniform1f(u.uUseShadow, lightDown ? 1 : 0);
    gl.uniform1f(u.uFancy, st ? 1 : 0);
    gl.uniform1f(u.uTime, time);
    if (st) {
      gl.uniform3fv(u.uSunCol, st.sunCol);
      gl.uniform3fv(u.uAmbTop, [st.amb[0] * 1.15, st.amb[1] * 1.15, st.amb[2] * 1.25]);
      gl.uniform3fv(u.uAmbBot, [st.amb[0] * 0.55, st.amb[1] * 0.5, st.amb[2] * 0.42]);
      gl.uniform3fv(u.uSunGlow, mix3(st.horizon, st.sunGlow, 0.7));
      gl.uniform3fv(u.uZenith, st.zenith);
      gl.uniform1f(u.uFogDensity, sky.fogDensity);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.depth); gl.uniform1i(u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.white); gl.uniform1i(u.uTex, 1);
    const opaque = items.filter(function (it) { return it.o.alpha >= 0.999 && !it.o.water; });
    const trans = items.filter(function (it) { return it.o.alpha < 0.999 || it.o.water; });
    // pass: 0 = everything, 1 = only solid parts, 2 = only see-through model parts
    function draw(it, pass) {
      const o = it.o, c = rgb(it.color || o.color), a = view.editor && !o.visible ? 0.25 : o.alpha;
      gl.uniformMatrix4fv(u.uModel, false, it.m);
      gl.uniformMatrix3fv(u.uNM, false, M4.normal3(it.m));
      gl.uniform1f(u.uWater, o.water && st ? 1 : 0);
      it.calls.forEach(function (call) {
        const part = call.part, pc = part ? part.src.color : null;
        const seeThrough = !!(part && part.src.blend && (pc[3] == null ? 1 : pc[3]) < 0.999);
        if ((pass === 1 && seeThrough) || (pass === 2 && !seeThrough)) return;
        gl.uniform3fv(u.uColor0, pc ? [c[0] * pc[0], c[1] * pc[1], c[2] * pc[2]] : c);
        gl.uniform1f(u.uAlpha0, pc ? a * (pc[3] == null ? 1 : pc[3]) : a);
        gl.uniform1f(u.uEmissive, o.glow || (part && part.src.emissive) ? 1 : 0);
        gl.uniform1f(u.uUseTex, part && part.tex ? 1 : 0);
        gl.uniform1f(u.uInst, call.inst ? 1 : 0);
        gl.uniform1f(u.uWind, call.wind || 0);
        gl.uniform1f(u.uVColor, call.vcol ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, part && part.tex ? part.tex : R.white);
        issue(call);
      });
    }
    opaque.forEach(function (it) { draw(it, 1); });
    const blendParts = opaque.filter(function (it) { return it.calls.some(function (c) { return c.part && c.part.src.blend; }); });
    if (trans.length || blendParts.length) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      blendParts.forEach(function (it) { draw(it, 2); });
      trans.forEach(function (it) { draw(it, 0); });
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
    if (view.grid) {
      const pts = [];
      for (let i = -20; i <= 20; i++) { pts.push(i, 0.001, -20, i, 0.001, 20, -20, 0.001, i, 20, 0.001, i); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.lines(VP, pts, [1, 1, 1, 0.12]);
      this.lines(VP, [-20, 0.002, 0, 20, 0.002, 0], [1, 0.3, 0.3, 0.6]);
      this.lines(VP, [0, 0.002, -20, 0, 0.002, 20], [0.3, 0.5, 1, 0.6]);
      gl.disable(gl.BLEND);
    }
    if (view.selected) {
      const o = view.selected, e = extents(o, true);
      const x0 = o.x - e[0], x1 = o.x + e[0], y0 = o.y - e[1], y1 = o.y + e[1], z0 = o.z - e[2], z1 = o.z + e[2];
      const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      const E = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7], pts = [];
      E.forEach(function (i) { pts.push(c[i][0], c[i][1], c[i][2]); });
      gl.disable(gl.DEPTH_TEST);
      this.lines(VP, pts, [1, 0.8, 0.2, 1]);
      // axis handles
      this.lines(VP, [o.x, o.y, o.z, o.x + e[0] + 1, o.y, o.z], [1, 0.3, 0.3, 1]);
      this.lines(VP, [o.x, o.y, o.z, o.x, o.y + e[1] + 1, o.z], [0.3, 1, 0.3, 1]);
      this.lines(VP, [o.x, o.y, o.z, o.x, o.y, o.z + e[2] + 1], [0.3, 0.5, 1, 1]);
      gl.enable(gl.DEPTH_TEST);
    }
    return VP;
  };

  // ================================================================== geometry helpers
  function is3dMesh(o) { return !!MESHES[o.type] || o.type === 'model' || o.type === 'terrain' || o.type === 'scatter' || o.type === 'ragdoll'; }
  function isLand(o) { return o.type === 'terrain' || o.type === 'scatter'; }
  function hasCollider(o) { return o.type === 'sprite' || (is3dMesh(o) && !isLand(o)); }
  // half extents
  function extents(o, mode3d) {
    if (o.type === 'terrain') { const p = terrainParams(o); return [p.w / 2, p.h / 2, p.d / 2]; }
    if (o.type === 'scatter') return [Math.abs(o.sx) / 2, 2, Math.abs(o.sz) / 2];
    if (o.type === 'ragdoll') { const s = Math.abs(o.sy) || 1; return [0.32 * s, 0.95 * s, 0.28 * s]; }
    if (o.type === 'model') {
      const md = o.W && A.Models.get(o.W.project, o.model), h = md ? md.half : [0.5, 0.5, 0.5];
      const km = modelMul(o, md);
      return [h[0] * Math.abs(o.sx) * km, h[1] * Math.abs(o.sy) * km, h[2] * Math.abs(o.sz) * km];
    }
    if (is3dMesh(o)) return [Math.abs(o.sx) / 2, o.type === 'plane' ? 0.05 : Math.abs(o.sy) / 2, Math.abs(o.sz) / 2];
    if (o.type === 'text') { const s = (o.fontSize || 24) * Math.abs(o.sx); return [String(o._shown || o.text || '').length * s * 0.28, s * 0.6, 0.5]; }
    return [Math.abs(o.w * o.sx) / 2, Math.abs(o.h * o.sy) / 2, mode3d ? Math.abs(o.sz) / 2 : 0.5];
  }
  function overlap(a, b, eps, d3) {
    const ea = extents(a, d3), eb = extents(b, d3);
    if (Math.abs(a.x - b.x) > ea[0] + eb[0] + eps) return false;
    if (Math.abs(a.y - b.y) > ea[1] + eb[1] + eps) return false;
    if (d3 && Math.abs(a.z - b.z) > ea[2] + eb[2] + eps) return false;
    return true;
  }
  A.extents = extents;

  // ================================================================== audio
  const Audio = {
    ctx: null, master: null, buffers: {}, playing: [],
    ensure: function () {
      if (!this.ctx) {
        const C = G.AudioContext || G.webkitAudioContext;
        if (!C) return null;
        this.ctx = new C();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    load: function (name, dataUrl) {
      const self = this;
      if (this.buffers[name] || !this.ensure()) return;
      this.buffers[name] = 'loading';
      fetch(dataUrl).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return self.ctx.decodeAudioData(b); })
        .then(function (buf) { self.buffers[name] = buf; }).catch(function () { self.buffers[name] = null; });
    },
    track: function (node, dur) {
      const self = this; this.playing.push(node);
      setTimeout(function () { const i = self.playing.indexOf(node); if (i >= 0) self.playing.splice(i, 1); }, dur * 1000 + 100);
    },
    tone: function (freq, secs, type, slideTo, vol) {
      const c = this.ensure(); if (!c) return;
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + secs);
      g.gain.setValueAtTime(vol || 0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + secs);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + secs + 0.02);
      this.track(o, secs);
    },
    noise: function (secs, vol, filter) {
      const c = this.ensure(); if (!c) return;
      const len = Math.floor(c.sampleRate * secs), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      s.buffer = b; f.type = 'lowpass'; f.frequency.value = filter || 2000; g.gain.value = vol || 0.4;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      this.track(s, secs);
    },
    play: function (name) {
      const self = this, c = this.ensure(); if (!c) return;
      const buf = this.buffers[name];
      if (buf && buf !== 'loading') {
        const s = c.createBufferSource(); s.buffer = buf; s.connect(this.master); s.start(); this.track(s, buf.duration); return;
      }
      switch (name) {
        case 'jump': this.tone(280, 0.18, 'square', 620, 0.18); break;
        case 'coin': this.tone(988, 0.08, 'square', 0, 0.15); setTimeout(function () { self.tone(1319, 0.25, 'square', 0, 0.15); }, 80); break;
        case 'hit': this.noise(0.15, 0.5, 1200); this.tone(160, 0.15, 'sawtooth', 60, 0.2); break;
        case 'explode': this.noise(0.6, 0.7, 900); break;
        case 'laser': this.tone(1400, 0.22, 'sawtooth', 180, 0.15); break;
        case 'powerup': [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { self.tone(f, 0.12, 'triangle', 0, 0.25); }, i * 70); }); break;
        case 'click': this.tone(1800, 0.03, 'square', 0, 0.1); break;
      }
    },
    stopAll: function () {
      this.playing.forEach(function (n) { try { n.stop(); } catch (e) { /* already stopped */ } });
      this.playing = [];
    }
  };
  A.Audio = Audio;

  // ================================================================== defaults
  A.OBJ_DEFAULTS = {
    name: 'Object', type: 'sprite', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, w: 48, h: 48,
    color: '#4c7dff', shape: 'rect', image: '', text: 'Text', fontSize: 28, font: 'Segoe UI', bold: true, italic: false, ui: false, visible: true, alpha: 1, pickable: true,
    body: 'none', bounce: 0, gravity: 1, friction: 0, stumble: true, tags: '', template: false, layer: 0, glow: false, castShadow: true, scripts: []
  };
  A.makeObject = function (props) {
    const o = Object.assign(JSON.parse(JSON.stringify(A.OBJ_DEFAULTS)), props || {});
    o.id = o.id || A.uid();
    return o;
  };

  // property get/set used by scripts
  const PGET = {
    x: function (o) { return o.x; }, y: function (o) { return o.y; }, z: function (o) { return o.z; },
    rx: function (o) { return o.rx; }, ry: function (o) { return o.ry; }, rz: function (o) { return o.rz; },
    rotation: function (o) { return o.W.d3 ? o.ry : o.rz; },
    scale: function (o) { return o.sx; }, sx: function (o) { return o.sx; }, sy: function (o) { return o.sy; }, sz: function (o) { return o.sz; },
    w: function (o) { return o.w; }, h: function (o) { return o.h; },
    vx: function (o) { return o.vx; }, vy: function (o) { return o.vy; }, vz: function (o) { return o.vz; },
    alpha: function (o) { return o.alpha; }, visible: function (o) { return o.visible; },
    color: function (o) { return o.color; }, text: function (o) { return o.text; }, name: function (o) { return o.name; },
    image: function (o) { return o.image; },
    font: function (o) { return o.font; },
    body: function (o) { return o.body; },
    pickable: function (o) { return o.pickable !== false; },
    fontSize: function (o) { return o.fontSize; },
    glow: function (o) { return !!o.glow; },
    shirt: function (o) { return o.shirt || ''; }, pants: function (o) { return o.pants || ''; },
    skin: function (o) { return o.skin || ''; }, hat: function (o) { return o.hat || ''; },
    bold: function (o) { return o.bold !== false; },
    pitch: function (o) { return o.W.fpPitch || 0; }
  };
  const PSET = {
    x: function (o, v) { o.x = num(v); }, y: function (o, v) { o.y = num(v); }, z: function (o, v) { o.z = num(v); },
    rx: function (o, v) { o.rx = num(v); }, ry: function (o, v) { o.ry = num(v); }, rz: function (o, v) { o.rz = num(v); },
    rotation: function (o, v) { if (o.W.d3) o.ry = num(v); else o.rz = num(v); },
    scale: function (o, v) { const s = num(v), b = o.base; o.sx = b.sx * s; o.sy = b.sy * s; o.sz = b.sz * s; },
    sx: function (o, v) { o.sx = num(v); }, sy: function (o, v) { o.sy = num(v); }, sz: function (o, v) { o.sz = num(v); },
    w: function (o, v) { o.w = num(v); }, h: function (o, v) { o.h = num(v); },
    vx: function (o, v) { o.vx = num(v); }, vy: function (o, v) { o.vy = num(v); }, vz: function (o, v) { o.vz = num(v); },
    alpha: function (o, v) { o.alpha = Math.max(0, Math.min(1, num(v))); }, visible: function (o, v) { o.visible = truthy(v); },
    color: function (o, v) { o.color = String(v); }, text: function (o, v) { o.text = String(v); }, name: function (o, v) { o.name = String(v); },
    image: function (o, v) { o.image = String(v); },
    font: function (o, v) { o.font = String(v); },
    body: function (o, v) {
      const b = String(v).toLowerCase();
      if (b !== 'none' && b !== 'solid' && b !== 'dynamic') throw new Error('body must be "none", "solid" or "dynamic"');
      o.body = b;
    },
    pickable: function (o, v) { o.pickable = truthy(v); },
    fontSize: function (o, v) { o.fontSize = Math.max(1, num(v)); },
    glow: function (o, v) { o.glow = truthy(v); },
    shirt: function (o, v) { o.shirt = String(v); }, pants: function (o, v) { o.pants = String(v); },
    skin: function (o, v) { o.skin = String(v); }, hat: function (o, v) { o.hat = String(v); },
    bold: function (o, v) { o.bold = truthy(v); },
    pitch: function (o, v) { o.W.fpPitch = Math.max(-85, Math.min(85, num(v))); }
  };

  // ---- fonts: Windows fonts that are always there, plus fonts imported as assets
  A.FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
    'Courier New', 'Georgia', 'Impact', 'Ink Free', 'Segoe Print', 'Segoe Script', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  const loadedFonts = {};
  A.loadFonts = function (project) {
    const as = (project && project.assets) || {};
    Object.keys(as).forEach(function (k) {
      const a = as[k];
      if (a.type !== 'font' || loadedFonts[k] === a.data || typeof FontFace === 'undefined') return;
      loadedFonts[k] = a.data;
      try {
        new FontFace(k, 'url(' + a.data + ')').load().then(function (f) { document.fonts.add(f); }).catch(function () { /* bad font file */ });
      } catch (e) { /* unsupported */ }
    });
  };
  function fontCss(o) {
    return (o.italic ? 'italic ' : '') + (o.bold === false ? '' : 'bold ') + (o.fontSize || 24) + 'px "' + String(o.font || 'Segoe UI').replace(/"/g, '') + '", "Segoe UI", system-ui, sans-serif';
  }

  // ================================================================== interpreter context
  function Ctx(W, obj) { this.W = W; this.obj = obj; this.stopped = false; this.wake = 0; }
  Ctx.prototype.get = function (name) {
    const o = this.obj, W = this.W;
    switch (name) {
      case 'dt': return W.dt;
      case 'time': return W.time;
      case 'pi': return Math.PI;
      case 'me': case 'self': return o;
    }
    const g = PGET[name];
    if (g) return g(o);
    if (Object.prototype.hasOwnProperty.call(o.vars, name)) return o.vars[name];
    if (Object.prototype.hasOwnProperty.call(W.globals, name)) return W.globals[name];
    const other = W.find(name);
    if (other) return other;
    return 0;
  };
  Ctx.prototype.ref = function (name) {
    if (name === 'me' || name === 'self') return this.obj;
    if (Object.prototype.hasOwnProperty.call(this.obj.vars, name) && this.obj.vars[name] && this.obj.vars[name].__inst) return this.obj.vars[name];
    return this.W.find(name);
  };
  Ctx.prototype.member = function (t, p) {
    if (!t || !t.__inst) return 0;
    const g = PGET[p];
    if (g) return g(t);
    return Object.prototype.hasOwnProperty.call(t.vars, p) ? t.vars[p] : 0;
  };
  Ctx.prototype.call = function (fn, args) {
    const f = REPORTERS[fn];
    if (!f) {
      if (A.ACTIONS[fn]) throw new Error(fn + '() is an action, it can\'t be used inside a value');
      throw new Error('unknown function ' + fn + '()');
    }
    return f(this, args);
  };
  Ctx.prototype.assign = function (target, op, value) {
    let obj = this.obj, name = target;
    const dot = target.indexOf('.');
    if (dot > 0) {
      obj = this.ref(target.slice(0, dot));
      name = target.slice(dot + 1);
      if (!obj) throw new Error('there is no object called "' + target.slice(0, dot) + '"');
    }
    const W = this.W;
    const setter = PSET[name];
    let store, cur;
    if (setter) cur = PGET[name](obj);
    else if (dot < 0 && !Object.prototype.hasOwnProperty.call(obj.vars, name) && Object.prototype.hasOwnProperty.call(W.globals, name)) { store = W.globals; cur = store[name]; }
    else { store = obj.vars; cur = store[name]; }
    let v = value;
    if (op === '+=') v = (typeof cur === 'string' && isNaN(Number(cur))) || (typeof value === 'string' && isNaN(Number(value))) ? String(cur == null ? '' : cur) + value : num(cur) + num(value);
    else if (op === '-=') v = num(cur) - num(value);
    else if (op === '*=') v = num(cur) * num(value);
    else if (op === '/=') v = num(value) === 0 ? 0 : num(cur) / num(value);
    if (setter) setter(obj, v); else store[name] = v;
  };
  function ev(src, C) { return A.compileExpr(src)(C); }
  function evNum(src, C, def) { return src == null || src === '' ? def : num(ev(src, C)); }

  function pick(C, name) {
    const o = C.W.find(String(name));
    return o;
  }
  const REPORTERS = {
    key_down: function (C, a) { return C.W.input.down(String(a[0])); },
    key_pressed: function (C, a) { return C.W.input.pressed(String(a[0])); },
    mouse_x: function (C) { return C.W.input.mx; },
    mouse_y: function (C) { return C.W.input.my; },
    mouse_down: function (C) { return C.W.input.mdown; },
    mouse_dx: function (C) { return C.W.input.dx; },
    mouse_dy: function (C) { return C.W.input.dy; },
    mouse_locked: function (C) { return C.W.input.locked(); },
    mouse_wheel: function (C) { return C.W.input.wheel; },
    time_of_day: function (C) { return C.W.timeOfDay; },
    held: function (C, a) { const t = a.length ? (a[0] && a[0].__inst ? a[0] : pick(C, a[0])) : C.obj; return t && t.held && t.held.alive ? t.held : 0; },
    holding: function (C, a) { const h = C.obj.held; return !!(h && h.alive && C.W.matches(h, String(a[0]))); },
    is_held: function (C) { return !!C.obj.heldBy; },
    is_down: function (C, a) { const t = a.length ? (a[0] && a[0].__inst ? a[0] : pick(C, a[0])) : C.obj; return !!(t && t._rd && C.W.time < t._rd.downUntil); },
    atan2: function (C, a) { return Math.atan2(num(a[0]), num(a[1])) / DEG; },
    ground_height: function (C, a) { const g = C.W.groundAt(num(a[0]), num(a[1])); return g == null ? 0 : g; },
    aim_target: function (C) { return C.W.pickCenter() || 0; },
    aiming_at: function (C, a) { const t = C.W.pickCenter(); return !!t && C.W.matches(t, String(a[0])); },
    touching: function (C, a) {
      const W = C.W, o = C.obj, n = String(a[0] == null ? 'any' : a[0]);
      for (let i = 0; i < W.objs.length; i++) {
        const b = W.objs[i];
        if (b === o || !b.alive || !hasCollider(b) || !b.visible) continue;
        if ((n === 'any' || W.matches(b, n)) && overlap(o, b, W.d3 ? 0.02 : 1, W.d3)) return true;
      }
      return false;
    },
    on_ground: function (C) { return !!C.obj.onGround; },
    distance_to: function (C, a) {
      const t = a[0] && a[0].__inst ? a[0] : pick(C, a[0]); const o = C.obj;
      if (!t) return 0;
      return Math.hypot(t.x - o.x, t.y - o.y, C.W.d3 ? t.z - o.z : 0);
    },
    angle_to: function (C, a) {
      const t = a[0] && a[0].__inst ? a[0] : pick(C, a[0]); const o = C.obj;
      if (!t) return 0;
      if (C.W.d3) return Math.atan2(-(t.x - o.x), -(t.z - o.z)) / DEG;
      return Math.atan2(t.y - o.y, t.x - o.x) / DEG;
    },
    exists: function (C, a) { return !!pick(C, a[0]); },
    count: function (C, a) { const n = String(a[0]); return C.W.objs.filter(function (o) { return o.alive && C.W.matches(o, n); }).length; },
    time: function (C) { return C.W.time; },
    paused: function (C) { return !!C.W.paused; },
    random: function (C, a) {
      const lo = num(a[0] == null ? 0 : a[0]), hi = num(a[1] == null ? 1 : a[1]);
      if (Number.isInteger(lo) && Number.isInteger(hi)) { const m = Math.min(lo, hi), M = Math.max(lo, hi); return m + Math.floor(Math.random() * (M - m + 1)); }
      return lo + Math.random() * (hi - lo);
    },
    abs: function (C, a) { return Math.abs(num(a[0])); },
    round: function (C, a) { const d = Math.pow(10, num(a[1] || 0)); return Math.round(num(a[0]) * d) / d; },
    floor: function (C, a) { return Math.floor(num(a[0])); },
    ceil: function (C, a) { return Math.ceil(num(a[0])); },
    sqrt: function (C, a) { return Math.sqrt(Math.max(0, num(a[0]))); },
    sin: function (C, a) { return Math.sin(num(a[0]) * DEG); },
    cos: function (C, a) { return Math.cos(num(a[0]) * DEG); },
    min: function (C, a) { return Math.min.apply(null, a.map(num)); },
    max: function (C, a) { return Math.max.apply(null, a.map(num)); },
    clamp: function (C, a) { return Math.max(num(a[1]), Math.min(num(a[2]), num(a[0]))); },
    lerp: function (C, a) { return num(a[0]) + (num(a[1]) - num(a[0])) * num(a[2]); },
    join: function (C, a) { return a.map(function (v) { return v && v.__inst ? v.name : String(v); }).join(''); },
    length: function (C, a) { return String(a[0] == null ? '' : a[0]).length; },
    obj: function (C, a) { return pick(C, a[0]) || 0; },
    str: function (C, a) { return String(a[0]); },
    number: function (C, a) { return num(a[0]); }
  };
  A.REPORTERS = REPORTERS;

  // ================================================================== actions
  // scripts started by start/update/every/collide follow game time (frozen while paused);
  // key, click and message scripts follow real time so pause menus keep working
  function clock(C) { return C.pausable ? C.W.time : C.W.realTime; }
  const PAUSABLE = { start: 1, update: 1, every: 1, collide: 1 };
  function* waitGen(C, secs) { C.wake = clock(C) + Math.max(0, secs); yield 1; }
  const ACTIONS = {
    move: function (C, a) { const o = C.obj; o.x += num(a[0] || 0); o.y += num(a[1] || 0); o.z += num(a[2] || 0); },
    move_forward: function (C, a) {
      const o = C.obj, d = num(a[0]);
      if (C.W.d3) { o.x += -Math.sin(o.ry * DEG) * d; o.z += -Math.cos(o.ry * DEG) * d; }
      else { o.x += Math.cos(o.rz * DEG) * d; o.y += Math.sin(o.rz * DEG) * d; }
    },
    go_to: function (C, a) { const o = C.obj; o.x = num(a[0]); o.y = num(a[1]); if (a.length > 2) o.z = num(a[2]); },
    go_to_object: function (C, a) { const t = pick(C, a[0]); if (t) { C.obj.x = t.x; C.obj.y = t.y; C.obj.z = t.z; } },
    glide_to: function* (C, a) {
      const o = C.obj, secs = Math.max(0.0001, num(a[0])), x0 = o.x, y0 = o.y, z0 = o.z;
      const x1 = num(a[1]), y1 = num(a[2]), z1 = a.length > 3 ? num(a[3]) : o.z, t0 = clock(C);
      for (;;) {
        const t = Math.min(1, (clock(C) - t0) / secs), e = t * t * (3 - 2 * t);
        o.x = x0 + (x1 - x0) * e; o.y = y0 + (y1 - y0) * e; o.z = z0 + (z1 - z0) * e;
        if (t >= 1) return;
        yield 1;
      }
    },
    walk: function (C, a) {
      const o = C.obj, f = num(a[0] || 0), r = num(a[1] || 0);
      if (C.W.d3) {
        const yaw = o.ry * DEG;
        o.vx = -Math.sin(yaw) * f + Math.cos(yaw) * r;
        o.vz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
      } else { o.vx = r; o.vy = o.body === 'dynamic' ? o.vy : f; }
    },
    first_person: function (C, a) {
      const W = C.W, t = pick(C, a[0] == null ? 'Player' : a[0]);
      if (!W.d3) throw new Error('first_person() needs a 3D scene');
      if (!t) throw new Error('first_person: no object called "' + a[0] + '"');
      W.fpObj = t; W.fpHeight = a.length > 1 ? num(a[1]) : 0.6; W.follow = null;
      if (W.input) W.input.wantLock = true;
    },
    third_person: function (C, a) {
      const W = C.W, t = pick(C, a[0] == null ? 'Player' : a[0]);
      if (!W.d3) throw new Error('third_person() needs a 3D scene');
      if (!t) throw new Error('third_person: no object called "' + a[0] + '"');
      W.tpObj = t; W.fpObj = null; W.follow = null;
      W.tpDist = a.length > 1 ? num(a[1]) : 6; W.tpHeight = a.length > 2 ? num(a[2]) : 1.6; W.tpSide = a.length > 3 ? num(a[3]) : 0.8;
      if (W.input) W.input.wantLock = true;
    },
    mouse_look: function (C, a) {
      const W = C.W, o = C.obj, s = a.length ? num(a[0]) : 0.12;
      if (!W.input || !W.input.locked()) return;
      o.ry -= W.input.dx * s;
      const lo = W.tpObj ? -50 : -85, hi = W.tpObj ? 65 : 85;
      W.fpPitch = Math.max(lo, Math.min(hi, (W.fpPitch || 0) - W.input.dy * s));
    },
    shoot: function (C, a) {
      const W = C.W, o = C.obj, tpl = String(a[0]), speed = num(a[1] == null ? 60 : a[1]), spread = num(a[2] || 0);
      const n = Math.max(1, Math.min(50, Math.floor(num(a[3] == null ? 1 : a[3]))));
      let from, target;
      if (W.d3) {
        const yaw = o.ry * DEG, e = extents(o, true), side = o === W.tpObj ? W.tpSide * 0.5 : 0;
        from = [o.x - Math.sin(yaw) * (e[2] + 0.3) + Math.cos(yaw) * side, o.y + e[1] * 0.35, o.z - Math.cos(yaw) * (e[2] + 0.3) - Math.sin(yaw) * side];
        target = o === W.tpObj || o === W.fpObj ? W.aimPoint(o) : [from[0] - Math.sin(yaw) * 50, from[1], from[2] - Math.cos(yaw) * 50];
      } else { from = [o.x, o.y, 0]; target = [W.input ? W.input.mx : o.x + 1, W.input ? W.input.my : o.y, 0]; }
      for (let i = 0; i < n; i++) W.launch(tpl, C.obj, from, target, speed, spread);
    },
    shoot_at: function (C, a) {
      const W = C.W, o = C.obj, t = a[1] && a[1].__inst ? a[1] : pick(C, a[1]);
      if (!t) return;
      W.launch(String(a[0]), o, [o.x, o.y, o.z], [t.x, t.y, t.z], num(a[2] == null ? 20 : a[2]), num(a[3] || 0));
    },
    damage_near: function (C, a) {
      const W = C.W, o = C.obj, tag = String(a[0]), r = num(a[1]), amt = num(a[2]);
      W.objs.forEach(function (x) {
        if (!x.alive || x === o || !W.matches(x, tag)) return;
        if (Math.hypot(x.x - o.x, x.y - o.y, W.d3 ? x.z - o.z : 0) <= r) x.vars.hp = num(x.vars.hp) - amt;
      });
    },
    set_font: function (C, a) { C.obj.font = String(a[0]); },
    grab: function (C, a) {
      const W = C.W, o = C.obj, tag = String(a[0] == null ? 'item' : a[0]), reach = num(a[1] == null ? 2 : a[1]);
      if (o.held && o.held.alive) return;
      if (o._rd && W.time < o._rd.downUntil) return;
      const fx = -Math.sin(o.ry * DEG), fz = -Math.cos(o.ry * DEG);
      let best = null, bd = Infinity;
      W.objs.forEach(function (x) {
        if (!x.alive || x === o || x.heldBy || !W.matches(x, tag)) return;
        const dx = x.x - o.x, dz = x.z - o.z, d = Math.hypot(dx, dz);
        if (d > reach || Math.abs(x.y - o.y) > 2.2) return;
        const score = d - (dx * fx + dz * fz) / (d || 1) * 0.6; // prefer things in front of you
        if (score < bd) { bd = score; best = x; }
      });
      if (best) W.hold(o, best);
    },
    drop: function (C) {
      const o = C.obj, h = o.held;
      if (!h || !h.alive) { o.held = null; return; }
      h.heldBy = null; o.held = null; h.vx = h.vy = h.vz = 0;
    },
    throw_held: function (C, a) {
      const o = C.obj, h = o.held, sp = num(a[0] == null ? 8 : a[0]);
      if (!h || !h.alive) { o.held = null; return; }
      h.heldBy = null; o.held = null;
      h.vx = -Math.sin(o.ry * DEG) * sp + o.vx * 0.5; h.vz = -Math.cos(o.ry * DEG) * sp + o.vz * 0.5; h.vy = sp * 0.45;
    },
    give_to: function (C, a) {
      const W = C.W, def = W.defs.find(function (d) { return d.name === String(a[0]); });
      if (!def) throw new Error('give_to: no object called "' + a[0] + '" in this scene');
      const t = a[1] && a[1].__inst ? a[1] : pick(C, a[1] == null ? 'Player' : a[1]);
      if (!t) return;
      const it = W.instantiate(def);
      it.x = t.x; it.y = t.y + 0.3; it.z = t.z;
      W.pendingStart.push(it);
      if (!(t.held && t.held.alive)) W.hold(t, it);
      else { it.x = t.x - Math.sin(t.ry * DEG) * 1.2; it.z = t.z - Math.cos(t.ry * DEG) * 1.2; it.y = t.y + 1; }
    },
    remove: function (C, a) {
      const t = a[0] && a[0].__inst ? a[0] : pick(C, a[0]);
      if (t && t !== C.obj) { t.alive = false; if (t.heldBy) t.heldBy.held = null; }
      else if (t === C.obj) { C.obj.alive = false; C.stopped = true; }
    },
    knock_down: function (C, a) {
      const t = a[0] && a[0].__inst ? a[0] : pick(C, a[0] == null ? 'Player' : a[0]);
      if (t) C.W.knockDown(t, num(a[1] == null ? 1.5 : a[1]), num(a[2] == null ? 4 : a[2]));
    },
    flop: function (C, a) { C.W.knockDown(C.obj, num(a[0] == null ? 1.5 : a[0]), 1); },
    set_time_of_day: function (C, a) { C.W.timeOfDay = ((num(a[0]) % 24) + 24) % 24; },
    set_clouds: function (C, a) { C.W.clouds = Math.max(0, Math.min(1, num(a[0]))); },
    turn: function (C, a) { const o = C.obj; if (C.W.d3) o.ry += num(a[0]); else o.rz += num(a[0]); },
    set_rotation: function (C, a) { const o = C.obj; if (C.W.d3) o.ry = num(a[0]); else o.rz = num(a[0]); },
    point_towards: function (C, a) { const t = pick(C, a[0]); if (!t) return; const ang = REPORTERS.angle_to(C, [t]); if (C.W.d3) C.obj.ry = ang; else C.obj.rz = ang; },
    keep_on_screen: function (C) {
      const W = C.W, o = C.obj; if (W.d3) return;
      const e = extents(o), hw = W.design.w / 2 / W.cam.zoom, hh = W.design.h / 2 / W.cam.zoom;
      o.x = Math.max(W.cam.x - hw + e[0], Math.min(W.cam.x + hw - e[0], o.x));
      o.y = Math.max(W.cam.y - hh + e[1], Math.min(W.cam.y + hh - e[1], o.y));
    },
    set_velocity: function (C, a) { const o = C.obj; o.vx = num(a[0]); o.vy = num(a[1]); if (a.length > 2) o.vz = num(a[2]); },
    push: function (C, a) { const o = C.obj; o.vx += num(a[0] || 0); o.vy += num(a[1] || 0); o.vz += num(a[2] || 0); },
    jump: function (C, a) {
      const o = C.obj;
      if (o._rd && C.W.time < o._rd.downUntil) return; // can't jump while lying on the floor
      if (o.body !== 'dynamic') {
        // without gravity a jump would rise forever, so explain instead
        if (!o.warnedJump) { o.warnedJump = true; C.W.error('jump() only works when Physics is "Dynamic". Select ' + o.name + ' and change Physics in the Inspector.', o); }
        return;
      }
      if (o.onGround) { o.vy = num(a[0]); o.onGround = false; }
    },
    set_gravity: function (C, a) { C.W.gravity = num(a[0]); },
    show: function (C) { C.obj.visible = true; },
    hide: function (C) { C.obj.visible = false; },
    set_color: function (C, a) { C.obj.color = String(a[0]); },
    set_alpha: function (C, a) { PSET.alpha(C.obj, a[0]); },
    set_scale: function (C, a) { PSET.scale(C.obj, a[0]); },
    set_text: function (C, a) { C.obj.text = a[0] && a[0].__inst ? a[0].name : String(a[0]); },
    set_image: function (C, a) { C.obj.image = String(a[0]); },
    say: function (C, a) { const s = a.length > 1 ? num(a[1]) : 2; C.obj.bubble = { text: String(a[0]), until: s > 0 ? C.W.time + s : Infinity }; },
    burst: function (C, a) { C.W.burst(C.obj, Math.min(500, num(a[0] == null ? 20 : a[0])), a[1] || C.obj.color); },
    set_background: function (C, a) { C.W.bg = String(a[0]); },
    play_sound: function (C, a) { Audio.play(String(a[0])); },
    tone: function (C, a) { Audio.tone(num(a[0]), Math.max(0.01, num(a[1] == null ? 0.2 : a[1])), 'square'); },
    stop_sounds: function () { Audio.stopAll(); },
    wait: function (C, a) { return waitGen(C, num(a[0] == null ? 1 : a[0])); },
    stop: function (C) { C.stopped = true; },
    broadcast: function (C, a) { C.W.broadcast(String(a[0])); },
    spawn: function (C, a) {
      const W = C.W, name = String(a[0]);
      const def = W.defs.find(function (d) { return d.name === name; });
      if (!def) throw new Error('spawn: no object called "' + name + '" in this scene');
      const o = W.instantiate(def);
      if (a.length > 1) o.x = num(a[1]);
      if (a.length > 2) o.y = num(a[2]);
      if (a.length > 3) o.z = num(a[3]);
      W.pendingStart.push(o);
    },
    destroy: function (C) { C.obj.alive = false; C.stopped = true; },
    pause_game: function (C) { C.W.paused = true; },
    resume_game: function (C) { C.W.paused = false; },
    go_to_scene: function (C, a) { C.W.requestScene(String(a[0])); C.stopped = true; },
    restart_scene: function (C) { C.W.requestScene(C.W.sceneName); C.stopped = true; },
    camera_follow: function (C, a) {
      const W = C.W, n = String(a[0] == null ? '' : a[0]);
      W.follow = n ? pick(C, n) : null;
      if (W.follow && W.d3) W.followOffset = [W.cam3.eye[0] - W.follow.x, W.cam3.eye[1] - W.follow.y, W.cam3.eye[2] - W.follow.z];
    },
    camera_shake: function (C, a) { C.W.shake = { power: num(a[0]), until: C.W.time + num(a[1] == null ? 0.3 : a[1]) }; },
    camera_zoom: function (C, a) { C.W.cam.zoom = Math.max(0.05, num(a[0])); },
    log: function (C, a) { C.W.log(a.map(function (v) { return v && v.__inst ? '[' + v.name + ']' : String(v); }).join(' '), C.obj); }
  };
  A.ACTION_IMPL = ACTIONS;

  function* execList(list, C) {
    const W = C.W;
    for (let i = 0; i < list.length; i++) {
      if (C.stopped || !C.obj.alive) return;
      const s = list[i];
      W.hits[s.id] = W.frame;
      C.cur = s;
      yield* execStmt(s, C);
    }
  }
  function* execStmt(s, C) {
    switch (s.t) {
      case 'call': {
        const f = ACTIONS[s.fn];
        if (!f) throw new Error('unknown action ' + s.fn + '()');
        const args = new Array(s.args.length);
        for (let i = 0; i < s.args.length; i++) args[i] = ev(s.args[i], C);
        const r = f(C, args);
        if (r && typeof r.next === 'function') yield* r;
        return;
      }
      case 'set': C.assign(s.target, s.op, ev(s.value, C)); return;
      case 'if':
        if (truthy(ev(s.cond, C))) yield* execList(s.then, C);
        else if (s.else && s.else.length) yield* execList(s.else, C);
        return;
      case 'repeat': {
        const n = Math.floor(evNum(s.count, C, 0));
        for (let i = 0; i < n; i++) {
          yield* execList(s.body, C);
          if (C.stopped || !C.obj.alive) return;
          yield 0;
        }
        return;
      }
      case 'while':
        while (truthy(ev(s.cond, C))) {
          yield* execList(s.body, C);
          if (C.stopped || !C.obj.alive) return;
          yield 0;
        }
        return;
      case 'forever':
        for (;;) {
          yield* execList(s.body, C);
          if (C.stopped || !C.obj.alive) return;
          yield 0;
        }
      case 'comment': return;
    }
  }

  // ================================================================== input
  function Input(el) {
    const self = this;
    this.keys = {}; this.just = {}; this.justUp = {}; this.mx = 0; this.my = 0; this.mdown = false; this.clicks = [];
    this.sx = 0; this.sy = 0; this.dx = 0; this.dy = 0; this.wheel = 0; this.wantLock = false;
    function keyName(e) {
      const c = e.code || '';
      if (c === 'Space') return 'space';
      if (c.indexOf('Arrow') === 0) return c.slice(5).toLowerCase();
      if (c.indexOf('Key') === 0) return c.slice(3).toLowerCase();
      if (c.indexOf('Digit') === 0) return c.slice(5);
      if (c.indexOf('Numpad') === 0 && /\d/.test(c.slice(6))) return c.slice(6);
      if (c === 'Enter' || c === 'NumpadEnter') return 'enter';
      if (c.indexOf('Shift') === 0) return 'shift';
      if (c === 'Escape') return 'escape';
      if (c.indexOf('Control') === 0) return 'ctrl';
      return (e.key || '').toLowerCase();
    }
    this.onKeyDown = function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      const k = keyName(e);
      if (!self.keys[k]) { self.just[k] = true; self.just.any = true; }
      self.keys[k] = true;
      if (['space', 'up', 'down', 'left', 'right'].indexOf(k) >= 0) e.preventDefault();
      Audio.ensure();
    };
    this.onKeyUp = function (e) { const k = keyName(e); self.keys[k] = false; self.justUp[k] = true; self.justUp.any = true; };
    this.onBlur = function () { self.keys = {}; };
    G.addEventListener('keydown', this.onKeyDown);
    G.addEventListener('keyup', this.onKeyUp);
    G.addEventListener('blur', this.onBlur);
    this.el = el;
    this.onMove = function (e) {
      if (self.locked()) { self.dx += e.movementX || 0; self.dy += e.movementY || 0; return; }
      const r = el.getBoundingClientRect(); self.sx = e.clientX - r.left; self.sy = e.clientY - r.top;
    };
    this.onDown = function (e) {
      if (!self.locked()) self.onMove(e);
      self.mdown = true; self.clicks.push([self.sx, self.sy, self.locked()]); Audio.ensure();
      if (self.wantLock && !self.locked() && el.requestPointerLock) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (err) { /* not allowed */ } }
    };
    this.onUp = function () { self.mdown = false; };
    el.addEventListener('mousemove', this.onMove);
    el.addEventListener('mousedown', this.onDown);
    this.onWheel = function (e) { if (self.locked()) { self.wheel += e.deltaY > 0 ? 1 : -1; e.preventDefault(); } };
    el.addEventListener('wheel', this.onWheel, { passive: false });
    G.addEventListener('mouseup', this.onUp);
  }
  Input.prototype.down = function (k) { k = String(k).toLowerCase(); if (k === 'any') return Object.keys(this.keys).some(function (x) { return this.keys[x]; }, this); return !!this.keys[k]; };
  Input.prototype.pressed = function (k) { return !!this.just[String(k).toLowerCase()]; };
  Input.prototype.endFrame = function () { this.just = {}; this.justUp = {}; this.clicks = []; this.dx = 0; this.dy = 0; this.wheel = 0; };
  Input.prototype.locked = function () { return document.pointerLockElement === this.el; };
  Input.prototype.destroy = function () {
    if (this.locked() && document.exitPointerLock) document.exitPointerLock();
    G.removeEventListener('keydown', this.onKeyDown); G.removeEventListener('keyup', this.onKeyUp); G.removeEventListener('blur', this.onBlur);
    this.el.removeEventListener('mousemove', this.onMove); this.el.removeEventListener('mousedown', this.onDown); this.el.removeEventListener('wheel', this.onWheel); G.removeEventListener('mouseup', this.onUp);
  };

  // ================================================================== images
  const images = {};
  function getImage(project, name) {
    if (!name) return null;
    let im = images[name];
    const asset = project.assets && project.assets[name];
    if (!asset) return null;
    if (!im || im._src !== asset.data) {
      im = new Image(); im._src = asset.data; im.src = asset.data; images[name] = im;
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  A.getImage = getImage;

  // ================================================================== World
  /* opts: { container, sceneName, edit:bool, onLog(msg, kind), onError(msg), onSceneChange(name), globals } */
  function World(project, opts) {
    this.project = project;
    this.opts = opts || {};
    this.edit = !!this.opts.edit;
    this.container = this.opts.container;
    this.design = { w: project.width || 960, h: project.height || 540 };
    this.globals = this.opts.globals || {};
    if (!this.opts.globals) (project.globals || []).forEach(function (g) { this.globals[g.name] = parseInitial(g.value); }, this);
    this.hits = {}; this.frame = 0; this.uidc = 0;
    this.running = false;
    this.root = document.createElement('div');
    this.root.className = 'alz-stage';
    this.root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;';
    this.c2 = document.createElement('canvas');
    this.c2.style.cssText = 'position:absolute;left:0;top:0;';
    this.root.appendChild(this.c2);
    this.container.appendChild(this.root);
    this.ctx = this.c2.getContext('2d');
    this.input = this.edit ? null : new Input(this.c2);
    this.editCam2 = { x: 0, y: 0, zoom: 0.8 };
    this.editCam3 = { yaw: -35, pitch: 28, dist: 22, target: [0, 0, 0] };
    this.load(this.opts.sceneName || project.startScene || (project.scenes[0] && project.scenes[0].name));
  }
  function parseInitial(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    const s = String(v == null ? '' : v);
    if (s.trim() !== '' && !isNaN(Number(s))) return Number(s);
    return s;
  }
  A.parseInitial = parseInitial;

  World.prototype.scene = function () {
    const n = this.sceneName;
    return this.project.scenes.find(function (s) { return s.name === n; }) || this.project.scenes[0];
  };
  World.prototype.load = function (name) {
    this.sceneName = name;
    A.loadFonts(this.project);
    this.fpObj = null; this.tpObj = null; this.fpPitch = 0;
    if (this.input) this.input.wantLock = false;
    const sc = this.scene();
    this.sceneName = sc.name;
    this.d3 = sc.mode === '3d';
    if (this.gl3 && !this.d3) { if (this.r3) this.r3.destroy(); this.gl3.remove(); this.gl3 = null; this.r3 = null; }
    if (this.d3 && !this.gl3) {
      this.gl3 = document.createElement('canvas');
      this.gl3.style.cssText = 'position:absolute;left:0;top:0;';
      this.root.insertBefore(this.gl3, this.c2);
      try { this.r3 = new Renderer3D(this.gl3); } catch (e) { this.error('3D renderer failed: ' + e.message); }
    }
    this.defs = sc.objects;
    this.bg = sc.bg || (this.d3 ? '#8fc6ff' : '#1d2433');
    this.gravity = sc.gravity != null ? num(sc.gravity) : (this.d3 ? 25 : 1400);
    const cam = sc.camera || {};
    this.cam = { x: num(cam.x || 0), y: num(cam.y || 0), zoom: num(cam.zoom || 1) || 1 };
    this.cam3 = {
      eye: [num(cam.ex != null ? cam.ex : 0), num(cam.ey != null ? cam.ey : 6), num(cam.ez != null ? cam.ez : 12)],
      target: [num(cam.tx || 0), num(cam.ty || 0), num(cam.tz || 0)], fov: num(cam.fov || 60)
    };
    this.light = { dir: [num(sc.lightX != null ? sc.lightX : -0.5), -1, num(sc.lightZ != null ? sc.lightZ : -0.35)], amb: sc.ambient != null ? num(sc.ambient) : 0.45 };
    // atmospheric sky (open worlds): sun, clouds, fog and time of day
    this.skyOn = !!sc.sky && this.d3;
    this.timeOfDay = sc.timeOfDay != null ? num(sc.timeOfDay) : 16.5;
    this.clouds = sc.clouds != null ? num(sc.clouds) : 0.45;
    this.fogDensity = sc.fogDensity != null ? num(sc.fogDensity) : 0.0035;
    this.shadowSize = sc.shadowSize != null ? num(sc.shadowSize) : 60;
    this.objs = []; this.threads = []; this.particles = []; this.pendingStart = []; this.follow = null; this.shake = null;
    this.time = 0; this.realTime = 0; this.dt = 1 / 60; this.paused = false;
    this.pendingScene = null;
    const self = this;
    this.compiled = new Map();
    this.defs.forEach(function (d) { if (!d.template || self.edit) self.instantiate(d); });
    // preload sounds
    if (!this.edit) {
      const assets = this.project.assets || {};
      Object.keys(assets).forEach(function (k) { if (assets[k].type === 'sound') Audio.load(k, assets[k].data); });
    }
    this.resize();
  };
  World.prototype.compiledFor = function (def) {
    let c = this.compiled.get(def);
    if (!c) {
      c = {};
      (def.scripts || []).forEach(function (s) { (c[s.event] = c[s.event] || []).push(s); });
      this.compiled.set(def, c);
    }
    return c;
  };
  World.prototype.instantiate = function (def) {
    const o = JSON.parse(JSON.stringify(Object.assign({}, A.OBJ_DEFAULTS, def, { scripts: [] })));
    o.def = def; o.__inst = true; o.uid = ++this.uidc; o.W = this;
    o.vx = 0; o.vy = 0; o.vz = 0; o.vars = {}; o.alive = true; o.onGround = false; o.contacts = new Set(); o.bubble = null; o.timers = {};
    o.base = { sx: o.sx, sy: o.sy, sz: o.sz };
    this.objs.push(o);
    return o;
  };
  World.prototype.find = function (name) {
    for (let i = 0; i < this.objs.length; i++) { const o = this.objs[i]; if (o.alive && o.name === name) return o; }
    return null;
  };
  World.prototype.matches = function (o, n) {
    if (o.name === n) return true;
    if (!o.tags) return false;
    return String(o.tags).split(/[,\s]+/).indexOf(n) >= 0;
  };
  World.prototype.log = function (msg, obj) { if (this.opts.onLog) this.opts.onLog(String(msg), 'log', obj && obj.name); };
  World.prototype.error = function (msg, obj) { if (this.opts.onLog) this.opts.onLog(String(msg), 'error', obj && obj.name); };
  World.prototype.requestScene = function (name) {
    if (!this.project.scenes.find(function (s) { return s.name === name; })) { this.error('There is no scene called "' + name + '"'); return; }
    this.pendingScene = name;
  };

  // ---- threads
  World.prototype.startScript = function (o, sc, restart) {
    for (let i = 0; i < this.threads.length; i++) {
      const t = this.threads[i];
      if (t.obj === o && t.script === sc && !t.done) {
        if (!restart) return;
        t.done = true;
      }
    }
    const C = new Ctx(this, o);
    C.pausable = !!PAUSABLE[sc.event];
    const th = { obj: o, script: sc, C: C, gen: execList(sc.body, C), done: false, ranFrame: this.frame };
    this.threads.push(th);
    this.runThread(th);
  };
  World.prototype.runThread = function (th) {
    if (th.done) return;
    const C = th.C;
    if (C.pausable && this.paused) return;
    if (C.wake > clock(C)) return;
    if (!th.obj.alive || C.stopped) { th.done = true; return; }
    try {
      const r = th.gen.next();
      if (r.done || C.stopped) th.done = true;
    } catch (e) {
      th.done = true;
      const where = C.cur ? ' (at "' + A.stmtLabel(C.cur) + '")' : '';
      this.error(e.message + where, th.obj);
    }
  };
  World.prototype.fire = function (o, event, param, restart) {
    const c = this.compiledFor(o.def)[event];
    if (!c) return;
    for (let i = 0; i < c.length; i++) {
      const sc = c[i];
      if (param !== undefined) {
        const p = String(sc.param == null ? '' : sc.param).toLowerCase();
        if (p !== 'any' && p !== '' && p !== String(param).toLowerCase()) continue;
      }
      this.startScript(o, sc, restart);
    }
  };
  World.prototype.fireMatch = function (o, event, other) {
    const c = this.compiledFor(o.def)[event];
    if (!c) return;
    for (let i = 0; i < c.length; i++) {
      const p = String(c[i].param == null ? '' : c[i].param);
      if (p === '' || p === 'any' || this.matches(other, p)) { o.vars.other = other; this.startScript(o, c[i], true); }
    }
  };
  World.prototype.broadcast = function (msg) {
    const objs = this.objs.slice();
    for (let i = 0; i < objs.length; i++) if (objs[i].alive) this.fire(objs[i], 'message', msg, true);
  };

  // ---- run loop
  World.prototype.start = function () {
    if (this.edit) return;
    this.running = true;
    const self = this;
    const objs = this.objs.slice();
    objs.forEach(function (o) { self.fire(o, 'start', undefined, true); });
    let last = performance.now();
    function frame(now) {
      if (!self.running) return;
      let dt = (now - last) / 1000; last = now;
      if (dt > 0.05) dt = 0.05; if (dt <= 0) dt = 1 / 60;
      try { self.step(dt); } catch (e) { self.error('Engine error: ' + e.message); console.error(e); }
      self.render();
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };
  World.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
    Audio.stopAll();
  };
  World.prototype.destroy = function () {
    this.stop();
    if (this.input) this.input.destroy();
    if (this.r3) this.r3.destroy();
    this.root.remove();
  };

  World.prototype.step = function (dt) {
    const self = this;
    this.dt = dt; this.realTime += dt; this.frame++;
    if (!this.paused) this.time += dt;
    const inp = this.input;
    this.updateMouse();
    // input events
    const objs = this.objs.slice();
    Object.keys(inp.just).forEach(function (k) { if (k !== 'any') objs.forEach(function (o) { if (o.alive) self.fire(o, 'key_pressed', k, true); }); });
    Object.keys(inp.justUp).forEach(function (k) { if (k !== 'any') objs.forEach(function (o) { if (o.alive) self.fire(o, 'key_released', k, true); }); });
    inp.clicks.forEach(function (c) {
      // with the mouse captured (first-person) clicks aim at the centre of the screen
      const o = c[2] ? self.pickCenter() : self.pick(c[0], c[1]);
      if (o) self.fire(o, 'clicked', undefined, true);
      objs.forEach(function (x) { if (x.alive) self.fire(x, 'mouse_click', undefined, true); });
    });
    // timers + every frame (frozen while paused)
    if (!this.paused) objs.forEach(function (o) {
      if (!o.alive) return;
      const comp = self.compiledFor(o.def);
      if (comp.every) comp.every.forEach(function (sc) {
        const period = Math.max(0.016, num(sc.param || 1));
        const next = o.timers[sc.id] != null ? o.timers[sc.id] : period;
        if (self.time >= next) { o.timers[sc.id] = next + period; self.startScript(o, sc, false); }
        else o.timers[sc.id] = next;
      });
      if (comp.update) comp.update.forEach(function (sc) { self.startScript(o, sc, false); });
    });
    // resume threads (new ones started this frame already ran their first slice)
    const ths = this.threads.slice();
    for (let i = 0; i < ths.length; i++) {
      const t = ths[i];
      if (t.ranFrame === this.frame) continue;
      t.ranFrame = this.frame;
      this.runThread(t);
    }
    if (!this.paused) { this.physics(dt); this.contacts(); }
    // particles
    for (let i = this.paused ? -1 : this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy -= (this.d3 ? 9 : 600) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    // camera
    if (this.follow && !this.paused) {
      if (!this.follow.alive) this.follow = null;
      else if (this.d3) {
        const f = this.follow, off = this.followOffset || [0, 6, 12], k = Math.min(1, dt * 6);
        const e = this.cam3.eye, t = this.cam3.target;
        e[0] += (f.x + off[0] - e[0]) * k; e[1] += (f.y + off[1] - e[1]) * k; e[2] += (f.z + off[2] - e[2]) * k;
        t[0] += (f.x - t[0]) * k; t[1] += (f.y - t[1]) * k; t[2] += (f.z - t[2]) * k;
      } else {
        const k = Math.min(1, dt * 7);
        this.cam.x += (this.follow.x - this.cam.x) * k; this.cam.y += (this.follow.y - this.cam.y) * k;
      }
    }
    // cleanup
    this.objs = this.objs.filter(function (o) { return o.alive; });
    this.threads = this.threads.filter(function (t) { return !t.done && t.obj.alive; });
    if (this.pendingStart.length) {
      const ps = this.pendingStart; this.pendingStart = [];
      ps.forEach(function (o) { self.fire(o, 'start', undefined, true); });
    }
    inp.endFrame();
    if (this.pendingScene) {
      const n = this.pendingScene;
      this.load(n);
      const objs2 = this.objs.slice();
      objs2.forEach(function (o) { self.fire(o, 'start', undefined, true); });
      if (this.opts.onSceneChange) this.opts.onSceneChange(n);
    }
  };

  World.prototype.physics = function (dt) {
    const d3 = this.d3, g = this.gravity;
    // carried items don't block anyone and don't fall
    const solids = this.objs.filter(function (o) { return o.alive && (o.body === 'solid' || o.body === 'dynamic') && hasCollider(o) && !o.heldBy && !o.meshCollision; });
    const W0 = this;
    const meshes = d3 ? this.objs.filter(function (o) { return o.alive && o.type === 'model' && o.meshCollision; }).map(function (o) { return meshCollider(o, W0); }).filter(Boolean) : [];
    this._meshes = meshes;
    const ragdolls = [];
    for (let i = 0; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (o.type !== 'ragdoll' || !o.alive) continue;
      const rd = o._rd || rdInit(o);
      if (this.time < rd.downUntil) { o.vx = 0; o.vz = 0; }
      rd.want = Math.hypot(o.vx, o.vz);
      ragdolls.push(o);
    }
    // collision boxes don't change size during physics, so measure each one once per frame
    for (let i = 0; i < solids.length; i++) solids[i]._ext = extents(solids[i], d3);
    const pe = d3 ? -0.0005 : -0.01;
    const lands = d3 ? this.objs.filter(function (o) { return o.alive && (o.type === 'terrain' || (o.type === 'scatter' && o.body === 'solid')); }) : [];
    const axes = d3 ? ['x', 'y', 'z'] : ['x', 'y'];
    const vel = { x: 'vx', y: 'vy', z: 'vz' };
    for (let i = 0; i < this.objs.length; i++) {
      const o = this.objs[i];
      if (!o.alive) continue;
      o.px = o.x; o.py = o.y; o.pz = o.z;
      if (o.heldBy) { if (!o.heldBy.alive) o.heldBy = null; else continue; }
      if (o.body !== 'dynamic') {
        if (o.vx || o.vy || o.vz) { o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; }
        continue;
      }
      o.vy -= g * num(o.gravity) * dt;
      const wasGround = o.onGround;
      o.onGround = false;
      for (let a = 0; a < axes.length; a++) {
        const ax = axes[a], vk = vel[ax], ai = a;
        const prev = o[ax];
        o[ax] += o[vk] * dt;
        const eo = o._ext || extents(o, d3);
        for (let j = 0; j < solids.length; j++) {
          const s = solids[j];
          if (s === o || !s.alive) continue;
          const es = s._ext;
          if (Math.abs(o.x - s.x) > eo[0] + es[0] + pe || Math.abs(o.y - s.y) > eo[1] + es[1] + pe || (d3 && Math.abs(o.z - s.z) > eo[2] + es[2] + pe)) continue;
          const sep = es[ai] + eo[ai];
          let dir;
          if (Math.abs(prev - s[ax]) >= sep - 1e-6) {
            // this axis's movement caused the overlap: undo it
            dir = prev < s[ax] ? 1 : -1;
          } else {
            // already inside (e.g. placed overlapping): push out along the shallowest axis only
            let best = ai, bestPen = Infinity;
            for (let k = 0; k < axes.length; k++) {
              const pen = es[k] + eo[k] - Math.abs(o[axes[k]] - s[axes[k]]);
              if (pen < bestPen) { bestPen = pen; best = k; }
            }
            if (best !== ai) continue;
            dir = o[ax] < s[ax] ? 1 : -1;
          }
          o[ax] = dir > 0 ? s[ax] - sep : s[ax] + sep;
          if (ax === 'y' && dir < 0) o.onGround = true;
          if ((dir > 0) !== (o[vk] > 0) && o[vk] !== 0) continue; // already moving away
          const b = Math.max(num(o.bounce), num(s.bounce));
          o[vk] = Math.abs(o[vk]) > (d3 ? 1 : 60) ? -o[vk] * b : 0;
          if (s.body === 'solid' && ax === 'y' && dir < 0 && (s.vx || s.vz)) { o.x += s.vx * dt; o.z += s.vz * dt; }
          // standing on a platform that moves down: sink with it so we stay grounded
          if (s.body === 'solid' && ax === 'y' && dir < 0 && s.vy < 0) o.vy = s.vy;
        }
      }
      if (lands.length) this.landPhysics(o, lands, wasGround);
      if (meshes.length) this.meshPhysics(o, meshes, wasGround, dt);
      if (o.onGround && o.friction) {
        const f = Math.max(0, 1 - num(o.friction) * dt * 10);
        o.vx *= f; if (d3) o.vz *= f;
      }
      if (!wasGround && o.onGround) o.landed = true;
      // fell out of the world
      if (o.y < (d3 ? -200 : -20000)) o.vy = 0;
    }
    for (let i = 0; i < ragdolls.length; i++) this.ragdollStep(ragdolls[i], dt, solids);
  };

  // walking inside level models: slide along walls, stand on floors, climb ramps and small steps
  World.prototype.meshPhysics = function (o, meshes, wasGround, dt) {
    const e = o._ext || extents(o, true), r = Math.max(0.15, Math.min(e[0], e[2]));
    const step = Math.max(0.3, e[1] * 0.45);
    for (let i = 0; i < meshes.length; i++) {
      const mc = meshes[i];
      // walls, checked at knee, waist and head height
      [-e[1] + step + r * 0.5, 0, e[1] - r].forEach(function (h) {
        const p = mcWalls(mc, o.x, o.y + h, o.z, r);
        if (p[0] || p[1]) {
          o.x += p[0]; o.z += p[1];
          const pl = Math.hypot(p[0], p[1]);
          const vn = (o.vx * p[0] + o.vz * p[1]) / pl; // remove speed going into the wall
          if (vn < 0) { o.vx -= p[0] / pl * vn; o.vz -= p[1] / pl * vn; }
        }
      });
      // floor: search a little above (steps) and below (how far we fell this frame)
      const bottom = o.y - e[1], fell = o.py != null ? Math.max(0, o.py - o.y) : 0;
      const f = mcFloor(mc, o.x, bottom, o.z, step + fell, wasGround ? 0.5 : 0.05);
      if (f != null && (bottom < f || (wasGround && o.vy <= 0 && bottom - f < 0.4))) {
        o.y = f + e[1];
        if (o.vy < 0) o.vy = 0;
        o.onGround = true;
      }
    }
  };
  // first hit along a ray against walkable level models (null if none)
  World.prototype.rayMeshes = function (origin, dir, maxT) {
    const list = this._meshes || [];
    let best = null;
    for (let i = 0; i < list.length; i++) { const t = mcRay(list[i], origin, dir, maxT); if (t != null && (best == null || t < best)) best = t; }
    return best;
  };
  // walking on terrain (snap to the ground, follow slopes) and bumping into scattered trunks and rocks
  World.prototype.landPhysics = function (o, lands, wasGround) {
    const e = o._ext || extents(o, true);
    let gh = null;
    for (let i = 0; i < lands.length; i++) {
      const L = lands[i];
      if (L.type === 'terrain') { const h = terrainHeightAt(L, o.x, o.z); if (h != null && (gh == null || h > gh)) gh = h; continue; }
      const sd = scatterData(L, this), frac = TRUNK[sd.p.mesh] || 0;
      if (!frac) continue;
      const r0 = Math.max(e[0], e[2]);
      const cx = Math.floor(o.x / 8), cz = Math.floor(o.z / 8);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const cell = sd.grid.get(gx + ',' + gz);
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const q = cell[k] * 4, tx = sd.cols[q], tz = sd.cols[q + 1], r = sd.cols[q + 2] * frac + r0;
          const dx = o.x - tx, dz = o.z - tz, dd = dx * dx + dz * dz;
          if (dd < r * r && dd > 1e-6) { const d = Math.sqrt(dd); o.x = tx + dx / d * r; o.z = tz + dz / d * r; }
        }
      }
    }
    if (gh == null) return;
    const bottom = o.y - e[1];
    // stick to the ground when walking downhill instead of bouncing off slopes
    if (bottom < gh || (wasGround && o.vy <= 0 && bottom - gh < 0.35)) {
      o.y = gh + e[1];
      if (o.vy < 0) o.vy = 0;
      o.onGround = true;
    }
  };
  // is a camera position inside a hill or a scattered tree/rock?
  const CANOPY = { pine: 0.32, tree: 0.4, bush: 0.42, rock: 0.42 };
  const CANOPY_LOW = { pine: 0.34, tree: 0.44, bush: 0, rock: 0 }; // fraction of the height where foliage starts
  World.prototype.viewBlocked = function (q) {
    const g = this.groundAt(q[0], q[2]);
    if (g != null && q[1] < g + 0.35) return true;
    for (let i = 0; i < this.objs.length; i++) {
      const L = this.objs[i];
      if (L.type !== 'scatter' || !L.visible) continue;
      const sd = scatterData(L, this), frac = CANOPY[sd.p.mesh];
      if (!frac) continue;
      const cx = Math.floor(q[0] / 8), cz = Math.floor(q[2] / 8);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const cell = sd.grid.get(gx + ',' + gz);
        if (!cell) continue;
        for (let k = 0; k < cell.length; k++) {
          const j = cell[k] * 4, s = sd.cols[j + 2], r = s * frac, dx = q[0] - sd.cols[j], dz = q[2] - sd.cols[j + 1];
          if (dx * dx + dz * dz < r * r && q[1] > sd.cols[j + 3] + s * (CANOPY_LOW[sd.p.mesh] || 0) - 0.5 && q[1] < sd.cols[j + 3] + s * 1.05) return true;
        }
      }
    }
    return false;
  };
  World.prototype.groundAt = function (x, z) {
    let gh = null;
    this.objs.forEach(function (t) { if (t.type === 'terrain' && t.alive) { const h = terrainHeightAt(t, x, z); if (h != null && (gh == null || h > gh)) gh = h; } });
    return gh;
  };
  // distance along a ray to the terrain surface (null if it misses)
  World.prototype.rayTerrain = function (ray, maxT) {
    const self = this;
    if (!this.objs.some(function (o) { return o.type === 'terrain'; })) return null;
    const at = function (t) { const x = ray.o[0] + ray.d[0] * t, z = ray.o[2] + ray.d[2] * t, g = self.groundAt(x, z); return g == null ? null : ray.o[1] + ray.d[1] * t - g; };
    let prev = 0, step = 1.5;
    for (let t = step; t < (maxT || 900); t += step) {
      const h = at(t);
      if (h != null && h <= 0) {
        let lo = prev, hi = t;
        for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2, hm = at(mid); if (hm != null && hm <= 0) hi = mid; else lo = mid; }
        return hi;
      }
      prev = t; step = Math.min(6, step * 1.04);
    }
    return null;
  };
  World.prototype.contacts = function () {
    const d3 = this.d3, eps = d3 ? 0.03 : 1.5;
    const list = this.objs.filter(function (o) { return o.alive && hasCollider(o) && o.visible; });
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const comp = this.compiledFor(o.def);
      if (!comp.collide) continue; // only objects with "when touching" scripts need contact tracking
      const now = new Set();
      // fast movers (bullets) are also tested at points along this frame's path so they can't skip through things
      const moved = o.px != null ? Math.hypot(o.x - o.px, o.y - o.py, d3 ? o.z - o.pz : 0) : 0;
      const sweep = comp.collide && moved > (d3 ? 0.35 : 12) ? Math.min(16, Math.ceil(moved / (d3 ? 0.35 : 12))) : 0;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (b === o) continue;
        let hit = overlap(o, b, eps, d3);
        if (!hit && sweep) {
          const x = o.x, y = o.y, z = o.z;
          for (let s = 1; s < sweep && !hit; s++) {
            const t = s / sweep;
            o.x = o.px + (x - o.px) * t; o.y = o.py + (y - o.py) * t; o.z = o.pz + (z - o.pz) * t;
            hit = overlap(o, b, eps, d3);
          }
          o.x = x; o.y = y; o.z = z;
        }
        if (hit) {
          now.add(b.uid);
          if (comp.collide && !o.contacts.has(b.uid)) this.fireMatch(o, 'collide', b);
        }
      }
      o.contacts = now;
    }
  };

  World.prototype.burst = function (o, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const sp = this.d3 ? 2 + Math.random() * 5 : 120 + Math.random() * 320;
      this.particles.push({
        x: o.x, y: o.y, z: o.z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + sp * 0.5, vz: this.d3 ? Math.sin(a) * Math.cos(b) * sp : 0,
        life: 0.5 + Math.random() * 0.6, max: 1.1, color: String(color), size: this.d3 ? 6 : 3 + Math.random() * 4
      });
    }
  };

  // ---- coordinate helpers
  World.prototype.resize = function () {
    const r = this.container.getBoundingClientRect();
    const dpr = Math.min(2, G.devicePixelRatio || 1);
    let w = r.width, h = r.height, x = 0, y = 0;
    if (!this.edit) {
      const ar = this.design.w / this.design.h;
      if (w / h > ar) { const nw = h * ar; x = (w - nw) / 2; w = nw; } else { const nh = w / ar; y = (h - nh) / 2; h = nh; }
    }
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    this.view = { x: x, y: y, w: w, h: h, dpr: dpr };
    [this.c2, this.gl3].forEach(function (c) {
      if (!c) return;
      c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.width = w + 'px'; c.style.height = h + 'px';
      if (c.width !== Math.floor(w * dpr)) c.width = Math.floor(w * dpr);
      if (c.height !== Math.floor(h * dpr)) c.height = Math.floor(h * dpr);
    });
  };
  // world units -> css px scale
  World.prototype.scale2 = function () {
    if (this.edit) return this.editCam2.zoom;
    return this.view.w / this.design.w * this.cam.zoom;
  };
  World.prototype.uiScale = function () { return this.edit ? this.editCam2.zoom / (this.d3 ? 1 : this.cam.zoom) : this.view.w / this.design.w; };
  // where screen-space (UI) coordinate 0,0 is drawn; in the 2D editor it follows the camera frame
  World.prototype.uiOrigin = function () {
    if (this.edit && !this.d3) return this.worldToScreen2(this.cam.x, this.cam.y);
    return [this.view.w / 2, this.view.h / 2];
  };
  World.prototype.camPos2 = function () { return this.edit ? this.editCam2 : this.cam; };
  World.prototype.worldToScreen2 = function (x, y) {
    const c = this.camPos2(), s = this.scale2();
    return [(x - c.x) * s + this.view.w / 2, this.view.h / 2 - (y - c.y) * s];
  };
  World.prototype.screenToWorld2 = function (sx, sy) {
    const c = this.camPos2(), s = this.scale2();
    return [(sx - this.view.w / 2) / s + c.x, (this.view.h / 2 - sy) / s + c.y];
  };
  World.prototype.screenToUi = function (sx, sy) {
    const s = this.uiScale(), o = this.uiOrigin();
    return [(sx - o[0]) / s, (o[1] - sy) / s];
  };
  World.prototype.updateMouse = function () {
    const inp = this.input;
    const lx = inp.sx - this.view.x, ly = inp.sy - this.view.y;
    if (this.d3) { const u = this.screenToUi(lx, ly); inp.mx = u[0]; inp.my = u[1]; }
    else { const p = this.screenToWorld2(lx, ly); inp.mx = p[0]; inp.my = p[1]; }
  };
  World.prototype.cam3View = function () {
    if (this.edit) {
      const c = this.editCam3, yaw = c.yaw * DEG, pit = c.pitch * DEG;
      const t = c.target;
      return { eye: [t[0] + Math.sin(yaw) * Math.cos(pit) * c.dist, t[1] + Math.sin(pit) * c.dist, t[2] + Math.cos(yaw) * Math.cos(pit) * c.dist], target: t.slice(), fov: 60 };
    }
    let e = this.cam3.eye.slice(), tg = this.cam3.target;
    const fp = this.fpObj;
    if (fp && fp.alive) {
      const yaw = fp.ry * DEG, pit = (this.fpPitch || 0) * DEG;
      e = [fp.x, fp.y + (this.fpHeight != null ? this.fpHeight : 0.6), fp.z];
      tg = [e[0] - Math.sin(yaw) * Math.cos(pit), e[1] + Math.sin(pit), e[2] - Math.cos(yaw) * Math.cos(pit)];
    }
    const tp = this.tpObj;
    if (tp && tp.alive) {
      // over-the-shoulder: orbit a pivot above the object, offset to the right
      const yaw = tp.ry * DEG, pit = (this.fpPitch || 0) * DEG;
      const d = [-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
      const r = [Math.cos(yaw), 0, -Math.sin(yaw)], side = this.tpSide || 0, dist = this.tpDist || 6;
      const pv = [tp.x + r[0] * side, tp.y + (this.tpHeight || 1.6), tp.z + r[2] * side];
      e = [pv[0] - d[0] * dist, Math.max(0.3, pv[1] - d[1] * dist), pv[2] - d[2] * dist];
      // camera collision with level models: stop just in front of the wall
      if (this._meshes && this._meshes.length) {
        const off = [e[0] - pv[0], e[1] - pv[1], e[2] - pv[2]], ol = Math.hypot(off[0], off[1], off[2]) || 1;
        const hit = this.rayMeshes(pv, [off[0] / ol, off[1] / ol, off[2] / ol], ol);
        if (hit != null) { const f = Math.max(0.15, (hit - 0.35) / ol); e = [pv[0] + off[0] * f, pv[1] + off[1] * f, pv[2] + off[2] * f]; }
      }
      // camera collision: if a hill, tree or rock is in the way, move the camera in front of it
      const self = this, steps = 14;
      for (let k = 1; k <= steps; k++) {
        const q = [pv[0] + (e[0] - pv[0]) * k / steps, pv[1] + (e[1] - pv[1]) * k / steps, pv[2] + (e[2] - pv[2]) * k / steps];
        if (self.viewBlocked(q)) { const f = Math.max(0.12, (k - 1.5) / steps); e = [pv[0] + (e[0] - pv[0]) * f, pv[1] + (e[1] - pv[1]) * f, pv[2] + (e[2] - pv[2]) * f]; break; }
      }
      const g = this.groundAt(e[0], e[2]);
      if (g != null && e[1] < g + 0.6) e[1] = g + 0.6;
      tg = [e[0] + d[0], e[1] + d[1], e[2] + d[2]];
    }
    if (this.shake && this.time < this.shake.until) { const p = this.shake.power * 0.01; e[0] += (Math.random() - 0.5) * p; e[1] += (Math.random() - 0.5) * p; }
    return { eye: e, target: tg, fov: this.cam3.fov };
  };
  // the 3D point under the crosshair (ignores the viewer, bullets and other non-pickable objects)
  World.prototype.aimPoint = function (exclude) {
    const cv = this.cam3View(), e = cv.eye;
    let d = [cv.target[0] - e[0], cv.target[1] - e[1], cv.target[2] - e[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / l, d[1] / l, d[2] / l];
    const ray = { o: e, d: d }, self = this;
    let best = 300;
    this.objs.forEach(function (o) {
      if (!o.alive || !o.visible || !is3dMesh(o) || isLand(o) || o === exclude || o === self.tpObj || o === self.fpObj || o.pickable === false) return;
      const t = rayBox(ray, o);
      if (t != null && t > 0.5 && t < best) best = t;
    });
    const tt = this.rayTerrain(ray, best);
    if (tt != null && tt > 0.5 && tt < best) best = tt;
    const tm = this.rayMeshes(e, d, best);
    if (tm != null && tm > 0.5 && tm < best) best = tm;
    return [e[0] + d[0] * best, e[1] + d[1] * best, e[2] + d[2] * best];
  };
  // spawn a copy of a template and send it from `from` toward `target`
  World.prototype.launch = function (tpl, shooter, from, target, speed, spread) {
    const def = this.defs.find(function (x) { return x.name === tpl; });
    if (!def) throw new Error('shoot: there is no object called "' + tpl + '" in this scene');
    let d = [target[0] - from[0], target[1] - from[1], this.d3 ? target[2] - from[2] : 0];
    let l = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / l, d[1] / l, d[2] / l];
    if (spread > 0) {
      const s = Math.tan(spread * DEG);
      d = [d[0] + (Math.random() * 2 - 1) * s, d[1] + (Math.random() * 2 - 1) * s, this.d3 ? d[2] + (Math.random() * 2 - 1) * s : 0];
      l = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / l, d[1] / l, d[2] / l];
    }
    const b = this.instantiate(def);
    b.x = from[0]; b.y = from[1]; b.z = this.d3 ? from[2] : b.z;
    b.vx = d[0] * speed; b.vy = d[1] * speed; b.vz = d[2] * speed;
    if (this.d3) { b.ry = Math.atan2(-d[0], -d[2]) / DEG; b.rx = Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG; }
    else b.rz = Math.atan2(d[1], d[0]) / DEG;
    b.vars.shooter = shooter;
    this.pendingStart.push(b);
    return b;
  };
  World.prototype.ray3 = function (sx, sy) {
    if (!this.lastVP) return null;
    const inv = M4.invert(this.lastVP);
    const nx = sx / this.view.w * 2 - 1, ny = 1 - sy / this.view.h * 2;
    const a = M4.xform(inv, nx, ny, -1), b = M4.xform(inv, nx, ny, 1);
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]);
    return { o: [a[0], a[1], a[2]], d: [d[0] / l, d[1] / l, d[2] / l] };
  };
  function rayBox(r, o) {
    const e = extents(o, true), c = [o.x, o.y, o.z];
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(r.d[i]) < 1e-9) { if (Math.abs(r.o[i] - c[i]) > e[i]) return null; continue; }
      let t1 = (c[i] - e[i] - r.o[i]) / r.d[i], t2 = (c[i] + e[i] - r.o[i]) / r.d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmax < 0 ? null : Math.max(0, tmin);
  }
  // local (css px inside the view) -> object
  World.prototype.pickLocal = function (lx, ly) {
    const self = this;
    // UI objects first (top-most = highest layer)
    const sorted = this.objs.filter(function (o) { return o.alive && (o.visible || self.edit); }).sort(function (a, b) { return (b.layer || 0) - (a.layer || 0); });
    for (let i = 0; i < sorted.length; i++) {
      const o = sorted[i];
      if (!(o.ui || (!this.d3 && !is3dMesh(o)))) continue;
      if (this.d3 && !o.ui) continue;
      // while playing, screen text without a "when clicked" script (scores, crosshairs) doesn't block clicks
      if (!this.edit && o.ui && !this.compiledFor(o.def).clicked) continue;
      const p = o.ui ? this.screenToUi(lx, ly) : this.screenToWorld2(lx, ly);
      const e = extents(o, false);
      if (Math.abs(p[0] - o.x) <= e[0] && Math.abs(p[1] - o.y) <= e[1]) return o;
    }
    if (this.d3) {
      const r = this.ray3(lx, ly);
      if (!r) return null;
      let best = null, bt = Infinity;
      this.objs.forEach(function (o) {
        if (!is3dMesh(o) || isLand(o) || !(o.visible || self.edit) || !o.alive || o === self.fpObj || o === self.tpObj || (!self.edit && o.pickable === false)) return;
        const t = rayBox(r, o);
        if (t != null && t < bt) { bt = t; best = o; }
      });
      // terrain is picked by its real surface, not its bounding box
      const tt = this.rayTerrain(r, bt === Infinity ? 900 : bt);
      if (tt != null && tt < bt) {
        const terr = this.objs.find(function (o) { return o.type === 'terrain' && o.alive && (o.visible || self.edit); });
        if (terr && (self.edit || terr.pickable !== false)) best = terr;
      }
      return best;
    }
    return null;
  };
  World.prototype.pick = function (sx, sy) { return this.pickLocal(sx - this.view.x, sy - this.view.y); };
  World.prototype.pickCenter = function () { return this.pickLocal(this.view.w / 2, this.view.h / 2); };

  // ================================================================== rendering
  const textTemplateCache = new Map();
  function renderTemplate(W, o) {
    const t = String(o.text == null ? '' : o.text);
    if (t.indexOf('{') < 0 || W.edit) return t;
    let parts = textTemplateCache.get(t);
    if (!parts) {
      parts = t.split(/(\{[^{}]+\})/).map(function (p) { return /^\{[^{}]+\}$/.test(p) ? A.compileExpr(p.slice(1, -1)) : p; });
      textTemplateCache.set(t, parts);
    }
    const C = new Ctx(W, o);
    try {
      return parts.map(function (p) {
        if (typeof p !== 'function') return p;
        const v = p(C);
        if (typeof v === 'number') return Math.round(v * 100) / 100;
        return v && v.__inst ? v.name : v;
      }).join('');
    } catch (e) { return t; }
  }

  World.prototype.render = function () {
    this.resize();
    const v = this.view, dpr = v.dpr, ctx = this.ctx, self = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sel = this.opts.selectedId ? this.objs.find(function (o) { return o.def.id === self.opts.selectedId; }) : null;
    if (this.d3) {
      ctx.clearRect(0, 0, v.w, v.h);
      if (this.r3) {
        const cv = this.cam3View();
        this.lastVP = this.r3.render({
          project: this.project, world: this, w: this.gl3.width, h: this.gl3.height, eye: cv.eye, target: cv.target, fov: cv.fov, bg: this.bg, light: this.light,
          objs: this.objs.filter(function (o) { return is3dMesh(o) && o !== self.fpObj; }), grid: this.edit && !this.skyOn, editor: this.edit,
          selected: sel && is3dMesh(sel) && sel.type !== 'scatter' ? sel : null,
          sky: this.skyOn ? { state: skyState(this.timeOfDay, this.clouds), clouds: this.clouds, fogDensity: this.fogDensity } : null,
          shadowSize: this.skyOn ? this.shadowSize : 30,
          time: this.edit ? performance.now() / 1000 : this.realTime
        });
        // particles + bubbles projected
        const VP = this.lastVP;
        this.particles.forEach(function (p) {
          const q = M4.xform(VP, p.x, p.y, p.z);
          if (q[3] <= 0) return;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc((q[0] + 1) / 2 * v.w, (1 - q[1]) / 2 * v.h, p.size * 3 / q[3] + 1, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        this.objs.forEach(function (o) {
          if (!o.bubble || !is3dMesh(o) || !o.visible) return;
          const q = M4.xform(VP, o.x, o.y + extents(o, true)[1], o.z);
          if (q[3] > 0) self.drawBubble(o, (q[0] + 1) / 2 * v.w, (1 - q[1]) / 2 * v.h);
        });
      }
    } else {
      ctx.fillStyle = this.bg; ctx.fillRect(0, 0, v.w, v.h);
      const c = this.camPos2();
      let shx = 0, shy = 0;
      if (this.shake && this.time < this.shake.until) { shx = (Math.random() - 0.5) * this.shake.power * 2; shy = (Math.random() - 0.5) * this.shake.power * 2; }
      const s = this.scale2();
      if (this.edit) this.drawGrid2();
      ctx.save();
      ctx.translate(v.w / 2 + shx, v.h / 2 + shy);
      ctx.scale(s, -s);
      ctx.translate(-c.x, -c.y);
      const list = this.objs.filter(function (o) { return !o.ui && !is3dMesh(o); }).sort(function (a, b) { return (a.layer || 0) - (b.layer || 0); });
      list.forEach(function (o) { self.drawObj2(o); });
      this.particles.forEach(function (p) {
        ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (sel && !sel.ui) this.drawSel2(sel, 1 / s);
      ctx.restore();
      list.forEach(function (o) {
        if (!o.bubble || !o.visible) return;
        const e = extents(o), p = self.worldToScreen2(o.x, o.y + e[1]);
        self.drawBubble(o, p[0], p[1]);
      });
      if (this.edit) {
        // camera frame
        const tl = this.worldToScreen2(this.cam.x - this.design.w / 2 / this.cam.zoom, this.cam.y + this.design.h / 2 / this.cam.zoom);
        const br = this.worldToScreen2(this.cam.x + this.design.w / 2 / this.cam.zoom, this.cam.y - this.design.h / 2 / this.cam.zoom);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
        ctx.strokeRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px system-ui'; ctx.fillText('camera', tl[0] + 4, tl[1] - 4);
      }
    }
    // UI layer
    const us = this.uiScale(), uo = this.uiOrigin();
    ctx.save();
    ctx.translate(uo[0], uo[1]);
    ctx.scale(us, -us);
    this.objs.filter(function (o) { return o.ui && !is3dMesh(o); }).sort(function (a, b) { return (a.layer || 0) - (b.layer || 0); })
      .forEach(function (o) { self.drawObj2(o); });
    if (sel && sel.ui) this.drawSel2(sel, 1 / us);
    ctx.restore();
    if (this.edit && this.d3 === false) { /* noop */ }
  };
  World.prototype.drawGrid2 = function () {
    const ctx = this.ctx, v = this.view, s = this.scale2();
    let step = 50;
    while (step * s < 18) step *= 2;
    const a = this.screenToWorld2(0, v.h), b = this.screenToWorld2(v.w, 0);
    ctx.lineWidth = 1;
    for (let x = Math.floor(a[0] / step) * step; x <= b[0]; x += step) {
      const p = this.worldToScreen2(x, 0);
      ctx.strokeStyle = x === 0 ? 'rgba(255,90,90,0.5)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(Math.round(p[0]) + 0.5, 0); ctx.lineTo(Math.round(p[0]) + 0.5, v.h); ctx.stroke();
    }
    for (let y = Math.floor(a[1] / step) * step; y <= b[1]; y += step) {
      const p = this.worldToScreen2(0, y);
      ctx.strokeStyle = y === 0 ? 'rgba(90,200,90,0.5)' : 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(0, Math.round(p[1]) + 0.5); ctx.lineTo(v.w, Math.round(p[1]) + 0.5); ctx.stroke();
    }
  };
  World.prototype.drawSel2 = function (o, px) {
    const ctx = this.ctx, e = extents(o);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.strokeStyle = '#ffc933'; ctx.lineWidth = 2 * px; ctx.setLineDash([5 * px, 3 * px]);
    ctx.strokeRect(-e[0] - 3 * px, -e[1] - 3 * px, e[0] * 2 + 6 * px, e[1] * 2 + 6 * px);
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffc933';
    ctx.fillRect(e[0] + 3 * px - 4 * px, -e[1] - 3 * px - 4 * px, 8 * px, 8 * px); // resize handle (bottom-right)
    ctx.restore();
  };
  World.prototype.drawObj2 = function (o) {
    const ctx = this.ctx;
    if (!o.visible && !this.edit) return;
    ctx.save();
    ctx.globalAlpha = (o.visible ? 1 : 0.3) * o.alpha;
    ctx.translate(o.x, o.y);
    if (o.rz) ctx.rotate(o.rz * DEG);
    if (o.type === 'text') {
      const txt = renderTemplate(this, o);
      o._shown = txt;
      ctx.scale(o.sx, -o.sy);
      ctx.fillStyle = o.color; ctx.font = fontCss(o);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = String(txt).split('\n'), lh = (o.fontSize || 24) * 1.2;
      lines.forEach(function (l, i) { ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh); });
      ctx.restore();
      return;
    }
    const w = o.w * o.sx, h = o.h * o.sy;
    const img = getImage(this.project, o.image);
    if (img) {
      ctx.scale(1, -1);
      ctx.imageSmoothingEnabled = !o.pixelArt;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = o.color;
      ctx.beginPath();
      switch (o.shape) {
        case 'circle': ctx.ellipse(0, 0, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2); break;
        case 'triangle': ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(0, h / 2); ctx.closePath(); break;
        case 'star': {
          for (let i = 0; i < 10; i++) {
            const r = i % 2 ? 0.4 : 1, a = Math.PI / 2 + i * Math.PI / 5;
            ctx.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r);
          }
          ctx.closePath(); break;
        }
        case 'rounded': {
          const r = Math.min(Math.abs(w), Math.abs(h)) * 0.2;
          ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, r) : ctx.rect(-w / 2, -h / 2, w, h); break;
        }
        default: ctx.rect(-w / 2, -h / 2, w, h);
      }
      ctx.fill();
      if (o.eyes) { // a little face makes placeholder characters friendlier
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-w * 0.18, h * 0.12, Math.abs(w) * 0.12, 0, Math.PI * 2); ctx.arc(w * 0.18, h * 0.12, Math.abs(w) * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(-w * 0.15, h * 0.12, Math.abs(w) * 0.06, 0, Math.PI * 2); ctx.arc(w * 0.21, h * 0.12, Math.abs(w) * 0.06, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };
  World.prototype.drawBubble = function (o, sx, sy) {
    if (!o.bubble || this.time > o.bubble.until) { o.bubble = null; return; }
    const ctx = this.ctx, t = o.bubble.text;
    ctx.save();
    ctx.setTransform(this.view.dpr, 0, 0, this.view.dpr, 0, 0);
    ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
    const w = Math.min(260, ctx.measureText(t).width + 18), h = 28, x = sx - w / 2, y = sy - h - 14;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
    ctx.moveTo(sx - 6, y + h); ctx.lineTo(sx, y + h + 9); ctx.lineTo(sx + 6, y + h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, sx, y + h / 2, w - 10);
    ctx.restore();
  };

  A.World = World;
  A.Renderer3D = Renderer3D;

  // ================================================================== standalone player boot (exported games)
  A.bootPlayer = function (project, container) {
    container = container || document.body;
    let world = null;
    const errors = document.createElement('div');
    errors.style.cssText = 'position:fixed;left:8px;bottom:8px;max-width:60%;font:12px monospace;color:#ffb4b4;pointer-events:none;';
    document.body.appendChild(errors);
    world = new World(project, {
      container: container,
      onLog: function (msg, kind, who) {
        console[kind === 'error' ? 'error' : 'log']((who ? who + ': ' : '') + msg);
        if (kind === 'error') { const d = document.createElement('div'); d.textContent = 'Error: ' + (who ? who + ': ' : '') + msg; errors.appendChild(d); setTimeout(function () { d.remove(); }, 6000); }
      }
    });
    world.start();
    G.addEventListener('resize', function () { world.resize(); });
    // F11 / Alt+Enter: fullscreen (native player window or browser)
    G.addEventListener('keydown', function (e) {
      if (e.key === 'F11' || (e.key === 'Enter' && e.altKey)) {
        e.preventDefault();
        const wv = G.chrome && G.chrome.webview;
        if (wv) wv.postMessage('fullscreen');
        else if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
        else document.exitFullscreen();
      }
    });
    return world;
  };
})(typeof window !== 'undefined' ? window : globalThis);
