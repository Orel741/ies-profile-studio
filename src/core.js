'use strict';
/* ===== Core: photometry model, generators, IES writer/parser, zip ===== */
const N = 181;                 // vertical samples, one per degree, 0 = nadir
const DEG = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// map[q] = which stored plane array drives the half-plane at C = 90*q
const MODES = {
  // Directions around the fixture: Front = C0, Left = C90, Back = C180, Right = C270 in the IES file
  rot:  { label: 'Round',     map: [0, 0, 0, 0], tabs: ['All around'],
          desc: 'One curve, the same in every direction. Spots, downlights, bulbs.' },
  bi:   { label: 'Oval',      map: [0, 1, 0, 1], tabs: ['Front & back', 'Sides'],
          desc: 'Front matches back and left matches right. Elliptical beams, linear fixtures.' },
  mir:  { label: 'One-sided', map: [0, 1, 2, 1], tabs: ['Front', 'Sides', 'Back'],
          desc: 'Left matches right, front and back differ. Wall washers, sconces, lights that throw forward.' },
  asym: { label: 'Free-form', map: [0, 1, 2, 3], tabs: ['Front', 'Left', 'Back', 'Right'],
          desc: 'Every side has its own curve. Streetlights and anything lopsided.' }
};

/* ---------- generators (return Float32Array(N), relative 0..1) ---------- */
function makeGen(spec) {
  const aim = spec.aim || 0;
  if (spec.type === 'cos') {
    const n = spec.n == null ? 1 : spec.n;
    return g => { const d = Math.abs(g - aim); return d >= 90 ? 0 : Math.pow(Math.cos(d * DEG), n); };
  }
  if (spec.type === 'bat') {
    const hw = Math.max(0.5, spec.width / 2), c = spec.center == null ? 0.5 : spec.center;
    return g => c + (1 - c) * Math.exp(-Math.LN2 * Math.pow((g - spec.peak) / hw, 2));
  }
  // beam: generalised gaussian hitting exactly 50% at beam/2 and 10% at field/2
  const hb = Math.max(0.25, spec.beam / 2);
  const ratio = Math.max(spec.field, spec.beam) / Math.max(spec.beam, 0.5);
  const k = ratio <= 1.0001 ? 16 : clamp(Math.log(Math.log(10) / Math.log(2)) / Math.log(ratio), 0.4, 16);
  return g => Math.exp(-Math.LN2 * Math.pow(Math.abs(g - aim) / hb, k));
}
function genArray(spec) {
  const f = makeGen(spec), cut = spec.cutoff == null ? 180 : spec.cutoff;
  const out = new Float32Array(N);
  for (let g = 0; g < N; g++) {
    let v = f(g);
    if (cut < 180) v *= 1 - smooth01(cut - 3, cut, g);
    out[g] = clamp(v, 0, 1);
  }
  return out;
}

/* ---------- sculpting helpers ---------- */
function brushW(d, R) { const a = Math.abs(d); return a >= R ? 0 : 0.5 * (1 + Math.cos(Math.PI * a / R)); }
function sculptDraw(arr, c, val, R) {
  const lo = Math.max(0, Math.ceil(c - R)), hi = Math.min(180, Math.floor(c + R));
  for (let i = lo; i <= hi; i++) arr[i] = clamp(arr[i] + (val - arr[i]) * brushW(i - c, R), 0, 1);
}
function sculptPush(arr, base, c, dv, R) {
  for (let i = 0; i < N; i++) arr[i] = clamp(base[i] + dv * brushW(i - c, R), 0, 1);
}
// k is how strongly each pass pulls the curve toward its local average (0..1)
function sculptSmooth(arr, c, R, k) {
  k = k == null ? 0.7 : k;
  const src = arr.slice();
  const at = i => src[clamp(i, 0, 180)];
  const lo = Math.max(0, Math.ceil(c - R)), hi = Math.min(180, Math.floor(c + R));
  for (let i = lo; i <= hi; i++) {
    const avg = (at(i - 2) + 2 * at(i - 1) + 3 * at(i) + 2 * at(i + 1) + at(i + 2)) / 9;
    arr[i] += (avg - arr[i]) * brushW(i - c, R) * k;
  }
}
function smoothAll(arr, passes) {
  for (let p = 0; p < passes; p++) {
    const s = arr.slice();
    for (let i = 0; i < N; i++) arr[i] = (s[Math.max(0, i - 1)] + 2 * s[i] + s[Math.min(180, i + 1)]) / 4;
  }
}
function mirrorUp(arr) { for (let i = 91; i < N; i++) arr[i] = arr[180 - i]; }
function zeroUp(arr) { for (let i = 91; i < N; i++) arr[i] = 0; }

/* ---------- evaluation ---------- */
function sampleArr(arr, g) {
  g = clamp(g, 0, 180);
  const i = Math.floor(g);
  if (i >= 180) return arr[180];
  const f = g - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}
// g: degrees from nadir (0..180), C: azimuth degrees. Quarter-turn blend with sin^2 weights.
function intensityAt(planes, map, g, C) {
  C = ((C % 360) + 360) % 360;
  const q = Math.floor(C / 90) % 4;
  const s = Math.sin((C - q * 90) * DEG), w = s * s;
  const a = sampleArr(planes[map[q]], g);
  if (w < 1e-9) return a;
  return a * (1 - w) + sampleArr(planes[map[(q + 1) % 4]], g) * w;
}
function usedPlanes(map) { return Array.from(new Set(map)); }
function relMax(planes, map) {
  let m = 0;
  for (const k of usedPlanes(map)) { const a = planes[k]; for (let i = 0; i < N; i++) if (a[i] > m) m = a[i]; }
  return m;
}
function fluxParts(planes, map) {
  const dC = 5; let s = 0, up = 0;
  for (let C = dC / 2; C < 360; C += dC)
    for (let g = 1; g < 180; g++) {
      const v = intensityAt(planes, map, g, C) * Math.sin(g * DEG);
      s += v; if (g > 90) up += v; else if (g === 90) up += v / 2;
    }
  const k = DEG * dC * DEG;
  return { total: s * k, up: up * k };
}
function fluxRel(planes, map) { return fluxParts(planes, map).total; }

/* ---------- control points: monotone cubic (Fritsch-Carlson) ---------- */
function splineEval(knots) {
  const out = new Float32Array(N), n = knots.length;
  if (!n) return out;
  if (n === 1) { out.fill(clamp(knots[0][1], 0, 1)); return out; }
  const xs = knots.map(p => p[0]), ys = knots.map(p => p[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s2 = a * a + b * b;
    if (s2 > 9) { const t = 3 / Math.sqrt(s2); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let j = 0;
  for (let g = 0; g < N; g++) {
    if (g <= xs[0]) { out[g] = ys[0]; continue; }
    if (g >= xs[n - 1]) { out[g] = ys[n - 1]; continue; }
    while (j < n - 2 && g > xs[j + 1]) j++;
    const h = xs[j + 1] - xs[j], t = (g - xs[j]) / h, t2 = t * t, t3 = t2 * t;
    out[g] = clamp((2 * t3 - 3 * t2 + 1) * ys[j] + (t3 - 2 * t2 + t) * h * m[j] + (-2 * t3 + 3 * t2) * ys[j + 1] + (t3 - t2) * h * m[j + 1], 0, 1);
  }
  return out;
}
// Greedy fit: add a knot where the spline misses the curve most, until it is within tol.
function fitKnots(arr, tol, maxK) {
  tol = tol == null ? 0.008 : tol; maxK = maxK || 24;
  const ks = [[0, arr[0]], [180, arr[180]]];
  while (ks.length < maxK) {
    const f = splineEval(ks);
    let wi = -1, we = tol;
    for (let i = 1; i < 180; i++) {
      const e = Math.abs(f[i] - arr[i]);
      if (e > we && !ks.some(p => p[0] === i)) { we = e; wi = i; }
    }
    if (wi < 0) break;
    ks.push([wi, arr[wi]]); ks.sort((a, b) => a[0] - b[0]);
  }
  return ks.map(p => [p[0], +(+p[1]).toFixed(5)]);
}
// Real fixtures have one intensity straight down (and straight up): blend each plane toward the average there.
function poleSpread(planes, used, g) {
  let lo = Infinity, hi = -Infinity;
  for (const k of used) { lo = Math.min(lo, planes[k][g]); hi = Math.max(hi, planes[k][g]); }
  return hi - lo;
}
function matchPole(planes, used, g, feather) {
  feather = feather || 10;
  let t = 0; for (const k of used) t += planes[k][g]; t /= used.length;
  for (const k of used) {
    const a = planes[k], dv = t - a[g];
    for (let i = 0; i < N; i++) {
      const dist = Math.abs(i - g);
      if (dist <= feather) a[i] = clamp(a[i] + dv * (1 - smooth01(0, feather, dist)), 0, 1);
    }
    a[g] = t;
  }
}
// Outer edge of the lobe: angle from nadir where intensity last falls below thr. 0 if the peak is above the horizon.
function crossing(arr, thr) {
  if (!(thr > 0)) return 0;
  let pk = 0;
  for (let i = 1; i < N; i++) if (arr[i] > arr[pk]) pk = i;
  if (arr[pk] < thr || pk > 90) return 0;
  for (let i = N - 1; i > pk; i--) {
    if (arr[i] >= thr) {
      if (i === N - 1) return 180;
      const a = arr[i], b = arr[i + 1];
      return i + (a - thr) / (a - b);
    }
  }
  return pk;
}
function computeStats(S) {
  const map = MODES[S.mode].map, P = S.planes;
  const rmax = relMax(P, map), fp = fluxParts(P, map), fr = fp.total;
  const scale = S.scaleMode === 'flux' ? (fr > 0 ? S.fluxLm / fr : 0) : (rmax > 0 ? S.peakCd / rmax : 0);
  // a profile whose peak points above the horizon gets its beam measured from straight up
  let pkV = -1, pkG = 0;
  for (const k of usedPlanes(map)) for (let i = 0; i < N; i++) if (P[k][i] > pkV) { pkV = P[k][i]; pkG = i; }
  const up = pkG > 90;
  const src = q => { const a = P[map[q]]; if (!up) return a; const r = new Float32Array(N); for (let i = 0; i < N; i++) r[i] = a[180 - i]; return r; };
  const h50 = [0, 1, 2, 3].map(q => crossing(src(q), 0.5 * rmax));
  const h10 = [0, 1, 2, 3].map(q => crossing(src(q), 0.1 * rmax));
  let gmax = 0;
  for (const k of usedPlanes(map)) for (let i = N - 1; i >= 0; i--) if (P[k][i] >= 0.02 * rmax && rmax > 0) { if (i > gmax) gmax = i; break; }
  return {
    rmax, fluxRel: fr, scale, peakCd: rmax * scale, flux: fr * scale,
    h50, h10, beamA: h50[0] + h50[2], beamB: h50[1] + h50[3], fieldA: h10[0] + h10[2], fieldB: h10[1] + h10[3],
    gmax, centerCd: intensityAt(P, map, 0, 0) * scale, up, upFrac: fr > 0 ? fp.up / fr : 0
  };
}

/* ---------- angular warp: move a plane's edges, keep 0 deg and the horizon fixed ---------- */
function pwl(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  for (let i = 0; i < xs.length - 1; i++) if (x <= xs[i + 1]) { const t = (x - xs[i]) / (xs[i + 1] - xs[i] || 1); return ys[i] + (ys[i + 1] - ys[i]) * t; }
  return ys[ys.length - 1];
}
// src/dst: increasing anchor angles, both starting at 0 and ending at 90
function warpPlane(base, src, dst) {
  const out = new Float32Array(N);
  for (let g = 0; g < N; g++) out[g] = g <= 90 ? sampleArr(base, pwl(g, dst, src)) : base[g];
  return out;
}
function warpKnots(knots, src, dst) { return knots.map(p => [p[0] <= 90 ? +pwl(p[0], src, dst).toFixed(2) : p[0], p[1]]); }

/* ---------- full-sphere field: NC azimuth columns x N vertical samples ---------- */
const CSTEP = 1, NC = 360;
function makeField() { return new Float32Array(NC * N); }
// bilinear lookup; g in degrees from straight down, C azimuth in degrees (0 Front, 90 Left, ...)
function fieldAt(F, g, C) {
  g = clamp(g, 0, 180); C = ((C % 360) + 360) % 360;
  const cf = C / CSTEP, c0 = Math.floor(cf) % NC, c1 = (c0 + 1) % NC, tc = cf - Math.floor(cf);
  const g0 = Math.min(179, Math.floor(g)), tg = g - g0;
  const a = F[c0 * N + g0] * (1 - tg) + F[c0 * N + g0 + 1] * tg, b = F[c1 * N + g0] * (1 - tg) + F[c1 * N + g0 + 1] * tg;
  return a * (1 - tc) + b * tc;
}
function fieldSlice(F, C) { const out = new Float32Array(N); for (let g = 0; g < N; g++) out[g] = fieldAt(F, g, C); return out; }
function fieldMax(F) { let m = 0; for (let i = 0; i < F.length; i++) if (F[i] > m) m = F[i]; return m; }

/* ---------- 3D value noise sampled on the sphere of directions, so it has no seam and no pole artefact ---------- */
function hash3(x, y, z, s) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct, s) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < oct; o++) { sum += amp * (vnoise(x * f, y * f, z * f, s + o * 17) * 2 - 1); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/* ---------- modifiers: each one reshapes a layer's field in place ---------- */
const MOD_TYPES = {
  noise: { label: 'Noise', defaults: { amount: 0.35, size: 20, detail: 2, seed: 1 } },
  rays: { label: 'Rays', defaults: { count: 12, depth: 0.5, sharp: 0.3, phase: 0, from: 10 } },
  rings: { label: 'Rings', defaults: { count: 6, depth: 0.3, offset: 0 } },
  blur: { label: 'Blur', defaults: { vert: 4, around: 8 } },
  cut: { label: 'Cut above angle', defaults: { angle: 90, soft: 4 } },
  contrast: { label: 'Contrast', defaults: { gamma: 1.5 } },
  transform: { label: 'Transform', defaults: { tilt: 20, rotate: 0, wideF: 1, wideS: 1, mirror: 0 } },
  doors: { label: 'Barn doors', defaults: { front: 20, back: 20, left: 90, right: 90, soft: 3, turn: 0 } },
  gobo: { label: 'Gobo image', defaults: { size: 30, rotate: 0, level: 0, invert: 0, img: '' } },
  shapes: { label: 'Shape array', defaults: { shape: 0, layout: 0, count: 5, size: 0.6, spread: 30, soft: 0.15, rotate: 0, level: 0 } }
};
// modifiers that break round symmetry, so the export needs every direction at fine steps
const FINE_MODS = new Set(['noise', 'rays', 'transform', 'doors', 'gobo', 'shapes']);
function blur1(arr, n, stride, count, radius, wrap) {
  if (radius < 0.5) return;
  const r = Math.ceil(radius * 2), w = [];
  let ws = 0; for (let k = -r; k <= r; k++) { const v = Math.exp(-0.5 * (k / radius) ** 2); w.push(v); ws += v; }
  const tmp = new Float32Array(n);
  for (let line = 0; line < count; line++) {
    const base = line * (stride === 1 ? n : 1);
    for (let i = 0; i < n; i++) tmp[i] = arr[base + i * stride];
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) { let j = i + k; if (wrap) j = ((j % n) + n) % n; else j = clamp(j, 0, n - 1); s += tmp[j] * w[k + r]; }
      arr[base + i * stride] = s / ws;
    }
  }
}
// noise and rays are multiplicative masks that depend only on their own settings, so each one is built once and reused
const MASKS = new Map();
function modMask(type, p) {
  const key = type + JSON.stringify(p);
  let M = MASKS.get(key);
  if (M) { MASKS.delete(key); MASKS.set(key, M); return M; }
  M = new Float32Array(NC * N);
  if (type === 'noise') {
    const k = 60 / Math.max(2, p.size), oct = clamp(Math.round(p.detail), 1, 5), seed = Math.round(p.seed) | 0;
    for (let c = 0; c < NC; c++) {
      const C = c * CSTEP * DEG, cc = Math.cos(C), sc = Math.sin(C);
      for (let g = 0; g < N; g++) {
        const sg = Math.sin(g * DEG), x = sg * cc * k, y = sg * sc * k, z = -Math.cos(g * DEG) * k;
        M[c * N + g] = Math.max(0, 1 + p.amount * fbm(x + 11.3, y + 7.1, z + 3.7, oct, seed));
      }
    }
  } else if (type === 'gobo') goboMask(M, p);
  else if (type === 'shapes') shapesMask(M, p);
  else if (type === 'doors') doorsMask(M, p);
  else {
    const pw = 1 + p.sharp * 10;
    for (let c = 0; c < NC; c++) {
      const f = Math.pow(0.5 * (1 + Math.cos(p.count * (c * CSTEP + p.phase) * DEG)), pw);
      for (let g = 0; g < N; g++) M[c * N + g] = 1 - p.depth * (1 - f) * smooth01(0, Math.max(0.5, p.from), g) * smooth01(0, Math.max(0.5, p.from), 180 - g);
    }
  }
  MASKS.set(key, M);
  if (MASKS.size > 24) MASKS.delete(MASKS.keys().next().value);
  return M;
}
// ---- projected patterns (gobo image, shape array): a flat slide in front of the light.
// u points to the light's Right, v to its Front; (±1, ±1) are the slide corners at `size` degrees off the axis.
function eachProjected(M, sizeDeg, rotDeg, level, f) {
  const T = Math.tan(clamp(sizeDeg, 1, 85) * DEG), cr = Math.cos(rotDeg * DEG), sr = Math.sin(rotDeg * DEG);
  for (let c = 0; c < NC; c++) {
    const C = c * CSTEP * DEG, cc = Math.cos(C), sc = Math.sin(C);
    for (let g = 0; g < N; g++) {
      let v = level;
      if (g < 89.5) {
        const t = Math.tan(g * DEG) / T, x = -sc * t, y = cc * t;     // Right, Front
        const u = x * cr + y * sr, w = -x * sr + y * cr;
        if (Math.abs(u) <= 1 && Math.abs(w) <= 1) v = level + (1 - level) * f(u, w);
      }
      M[c * N + g] = v;
    }
  }
}
// greyscale slides arrive as "w:h:base64"; decoded once and shrunk to about the detail the 1° grid can hold
const GOBO_IMG = new Map();
function b64bytes(b) {
  if (typeof atob === 'function') { const s = atob(b), o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; }
  return new Uint8Array(Buffer.from(b, 'base64'));
}
function goboImage(str, res) {
  const key = str.length + ':' + str.slice(-64) + ':' + res;
  let im = GOBO_IMG.get(key); if (im) return im;
  let w = 0, h = 0, px = null;
  const m = /^(\d+):(\d+):(.+)$/.exec(str || '');
  if (m) { w = +m[1]; h = +m[2]; px = b64bytes(m[3]); if (px.length !== w * h) px = null; }
  if (!px) { // built-in slide: a four-pane window
    w = h = 128; px = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const fx = Math.abs(x + 0.5 - 64), fy = Math.abs(y + 0.5 - 64); px[y * w + x] = fx < 5 || fy < 5 || fx > 58 || fy > 58 ? 0 : 255; }
  }
  // box-filter down to res × res (the slide is square; non-square images were letterboxed when loaded)
  const out = new Float32Array(res * res);
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const x0 = Math.floor(x * w / res), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / res)), y0 = Math.floor(y * h / res), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / res));
    let s = 0; for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += px[yy * w + xx];
    out[y * res + x] = s / ((x1 - x0) * (y1 - y0) * 255);
  }
  im = { res, d: out }; GOBO_IMG.set(key, im); if (GOBO_IMG.size > 8) GOBO_IMG.delete(GOBO_IMG.keys().next().value);
  return im;
}
function goboMask(M, p) {
  const res = clamp(Math.round(p.size * 2.5), 12, 128), im = goboImage(p.img, res), inv = p.invert >= 0.5;
  eachProjected(M, p.size, p.rotate, p.level, (u, w) => {
    const fx = clamp((u + 1) / 2 * res - 0.5, 0, res - 1), fy = clamp((1 - w) / 2 * res - 0.5, 0, res - 1);   // image top = Front
    const x0 = Math.min(res - 2, Math.floor(fx)), y0 = Math.min(res - 2, Math.floor(fy)), tx = fx - x0, ty = fy - y0, d = im.d;
    const a = d[y0 * res + x0] * (1 - tx) + d[y0 * res + x0 + 1] * tx, b = d[(y0 + 1) * res + x0] * (1 - tx) + d[(y0 + 1) * res + x0 + 1] * tx;
    const v = a * (1 - ty) + b * ty; return inv ? 1 - v : v;
  });
}
function shapeDist(shape, x, y) { // < 0 inside a shape of radius 1
  const ax = Math.abs(x), ay = Math.abs(y);
  return shape === 1 ? Math.max(ax, ay) - 1 : shape === 2 ? (ax + ay) / 1.25 - 1 : Math.hypot(x, y) - 1;
}
function shapesMask(M, p) {
  const n = clamp(Math.round(p.count), 1, 24), shape = Math.round(p.shape), ring = Math.round(p.layout) === 1;
  const sz = clamp(p.size, 0.05, 1), soft = Math.max(0.02, p.soft);
  const ins = d => 1 - smooth01(-soft, soft, d);
  if (!ring) {
    const cell = 2 / n;                                   // n × n grid filling the slide
    eachProjected(M, p.spread, p.rotate, p.level, (u, w) => {
      const gx = (u + 1) / cell, gy = (w + 1) / cell, lx = (gx - Math.min(n - 1, Math.floor(gx)) - 0.5) * 2, ly = (gy - Math.min(n - 1, Math.floor(gy)) - 0.5) * 2;
      return ins(shapeDist(shape, lx / sz, ly / sz) * sz);
    });
  } else {
    const d = 1 / (n - 0.5 + 0.0001);                     // rings of shapes: one in the middle, then about 6 per ring step
    eachProjected(M, p.spread, p.rotate, p.level, (u, w) => {
      const r = Math.hypot(u, w); if (r > 1) return 0;
      let best = Infinity;
      for (const k of [Math.floor(r / d), Math.ceil(r / d)]) {
        if (k < 0 || k >= n) continue;
        const cnt = k === 0 ? 1 : Math.round(2 * Math.PI * k), step = 2 * Math.PI / cnt, a = Math.atan2(w, u);
        const ca = k === 0 ? 0 : Math.round(a / step) * step, cx = k * d * Math.cos(ca), cy = k * d * Math.sin(ca);
        const lx = (u - cx) / (d / 2), ly = (w - cy) / (d / 2);
        const cs = Math.cos(ca), sn = Math.sin(ca);       // shapes face outwards
        best = Math.min(best, shapeDist(shape, (lx * cs + ly * sn) / sz, (-lx * sn + ly * cs) / sz) * sz);
      }
      return ins(best);
    });
  }
}
// Transform, in this order: mirror, widen (front-back and sideways separately), tilt toward Front, then rotate the
// result around the vertical axis. Each output direction is traced back through the inverse steps to the source.
function transformField(F, p) {
  const tl = p.tilt * DEG, ct = Math.cos(tl), st = Math.sin(tl), rot = p.rotate * DEG, cr = Math.cos(rot), sr = Math.sin(rot);
  const wf = Math.max(0.05, p.wideF), ws = Math.max(0.05, p.wideS), mir = Math.round(p.mirror), src = Float32Array.from(F);
  for (let c = 0; c < NC; c++) {
    const C = c * CSTEP * DEG, cc = Math.cos(C), sc = Math.sin(C);
    for (let g = 0; g < N; g++) {
      const sg = Math.sin(g * DEG);
      let x = sg * cc, y = sg * sc, z = Math.cos(g * DEG);              // x Front, y Left, z down
      { const X = x * cr + y * sr, Y = -x * sr + y * cr; x = X; y = Y; }  // undo the rotation
      { const X = x * ct - z * st, Z = x * st + z * ct; x = X; z = Z; }   // undo the tilt toward Front
      let gs = Math.acos(clamp(z, -1, 1)) / DEG, cs = Math.atan2(y, x);
      if (wf !== 1 || ws !== 1) {                                          // undo the widening, in angle-from-down space
        const ax = gs * Math.cos(cs) / wf, ay = gs * Math.sin(cs) / ws;
        gs = Math.hypot(ax, ay); cs = Math.atan2(ay, ax);
        if (gs > 180) { F[c * N + g] = 0; continue; }
      }
      let Cs = cs / DEG;
      if (mir === 1) Cs = -Cs; else if (mir === 2) Cs = 180 - Cs;          // Left↔Right, Front↔Back
      F[c * N + g] = fieldAt(src, gs, Cs);
    }
  }
}
function doorsMask(M, p) {
  const doors = [[p.front, 1, 0], [p.back, -1, 0], [p.left, 0, 1], [p.right, 0, -1]].filter(d => d[0] < 89.95), soft = Math.max(0.01, p.soft);
  for (let c = 0; c < NC; c++) {
    const C = (c * CSTEP - p.turn) * DEG, cc = Math.cos(C), sc = Math.sin(C);
    for (let g = 0; g < N; g++) {
      const sg = Math.sin(g * DEG), x = sg * cc, y = sg * sc, z = Math.cos(g * DEG);
      let k = 1;
      for (const [ang, fx, fy] of doors) { const t = Math.atan2(fx * x + fy * y, z) / DEG; k *= 1 - smooth01(ang - soft, ang, t); }
      M[c * N + g] = k;
    }
  }
}
function applyMod(F, m) {
  const p = Object.assign({}, MOD_TYPES[m.type].defaults, m.p);
  if (m.type === 'noise' || m.type === 'rays' || m.type === 'gobo' || m.type === 'shapes' || m.type === 'doors') {
    const M = modMask(m.type, p);
    for (let i = 0; i < F.length; i++) F[i] *= M[i];
  } else if (m.type === 'rings') {
    for (let g = 0; g < N; g++) {
      const k = 1 - p.depth * 0.5 * (1 - Math.cos(2 * Math.PI * p.count * g / 90 + p.offset * DEG));
      for (let c = 0; c < NC; c++) F[c * N + g] *= k;
    }
  } else if (m.type === 'blur') {
    blur1(F, N, 1, NC, p.vert, false);                 // along the vertical angle
    blur1(F, NC, N, N, p.around / CSTEP, true);        // around the axis
  } else if (m.type === 'cut') {
    for (let g = 0; g < N; g++) {
      const k = 1 - smooth01(p.angle - Math.max(0.01, p.soft), p.angle, g);
      for (let c = 0; c < NC; c++) F[c * N + g] *= k;
    }
  } else if (m.type === 'contrast') {
    const pk = fieldMax(F) || 1;
    for (let i = 0; i < F.length; i++) F[i] = pk * Math.pow(F[i] / pk, p.gamma);
  } else if (m.type === 'transform') { if (p.tilt || p.rotate || p.wideF !== 1 || p.wideS !== 1 || Math.round(p.mirror)) transformField(F, p); }
}

/* ---------- layers ---------- */
const BLENDS = {
  add: 'Add', lighten: 'Lighten', replace: 'Replace', mask: 'Mask', subtract: 'Subtract'
};
function layerField(L) {
  const F = makeField(), turn = L.turn || 0;
  if (L.type === 'ies' && L.grid) { for (let c = 0; c < NC; c++) for (let g = 0; g < N; g++) F[c * N + g] = fieldAt(L.grid, g, c * CSTEP - turn); }
  else { const map = MODES[L.mode].map; for (let c = 0; c < NC; c++) for (let g = 0; g < N; g++) F[c * N + g] = intensityAt(L.planes, map, g, c * CSTEP - turn); }
  for (const m of L.mods || []) if (m.on !== false && MOD_TYPES[m.type]) applyMod(F, m);
  return F;
}
// layers bottom to top; getField(L) may cache. The bottom visible layer starts the stack.
function compositeLayers(layers, getField) {
  const acc = makeField(); let first = true;
  for (const L of layers) {
    if (L.on === false) continue;
    const F = getField ? getField(L) : layerField(L), a = L.amount == null ? 1 : L.amount;
    const mode = first && (L.blend === 'mask' || L.blend === 'subtract') ? 'add' : L.blend || 'add';
    if (mode === 'mask') { const pk = fieldMax(F) || 1, s = clamp(a, 0, 1); for (let i = 0; i < acc.length; i++) acc[i] *= 1 - s + s * clamp(F[i] / pk, 0, 1); }
    else if (mode === 'subtract') { for (let i = 0; i < acc.length; i++) acc[i] = Math.max(0, acc[i] - a * F[i]); }
    else if (mode === 'lighten') { for (let i = 0; i < acc.length; i++) acc[i] = Math.max(acc[i], a * F[i]); }
    else if (mode === 'replace' && !first) { const s = clamp(a, 0, 1); for (let i = 0; i < acc.length; i++) acc[i] += (F[i] - acc[i]) * s; }
    else { for (let i = 0; i < acc.length; i++) acc[i] += a * F[i]; }
    first = false;
  }
  return acc;
}
// the symmetry the exported file needs: as compact as the visible layers allow
function outModeFor(layers) {
  const vis = layers.filter(L => L.on !== false);
  if (!vis.length) return 'rot';
  const rank = { rot: 0, bi: 1, mir: 2, asym: 3 };
  let r = 0;
  for (const L of vis) {
    if (L.type !== 'curve') return 'asym';
    if ((L.mods || []).some(m => m.on !== false && FINE_MODS.has(m.type))) return 'asym';
    const t = (((L.turn || 0) % 360) + 360) % 360;
    let lr = rank[L.mode];
    if (t) { if (L.mode === 'rot') lr = 0; else if (L.mode === 'bi' && t % 90 === 0) lr = 1; else if (L.mode === 'mir' && t === 180) lr = 2; else lr = 3; }
    r = Math.max(r, lr);
  }
  return ['rot', 'bi', 'mir', 'asym'][r];
}
// photometric summary of a field, same shape as computeStats()
function fieldStats(F, S) {
  const rmax = fieldMax(F);
  let tot = 0, up = 0;
  for (let c = 0; c < NC; c++) for (let g = 1; g < 180; g++) { const v = F[c * N + g] * Math.sin(g * DEG); tot += v; if (g > 90) up += v; else if (g === 90) up += v / 2; }
  const k = DEG * CSTEP * DEG; tot *= k; up *= k;
  const scale = S.scaleMode === 'flux' ? (tot > 0 ? S.fluxLm / tot : 0) : (rmax > 0 ? S.peakCd / rmax : 0);
  let pkV = -1, pkG = 0;
  for (let c = 0; c < NC; c++) for (let g = 0; g < N; g++) if (F[c * N + g] > pkV) { pkV = F[c * N + g]; pkG = g; }
  const isUp = pkG > 90;
  const sl = [0, 1, 2, 3].map(q => { const a = fieldSlice(F, q * 90); if (!isUp) return a; const r = new Float32Array(N); for (let i = 0; i < N; i++) r[i] = a[180 - i]; return r; });
  const h50 = sl.map(a => crossing(a, 0.5 * rmax)), h10 = sl.map(a => crossing(a, 0.1 * rmax));
  let gmax = 0;
  if (rmax > 0) for (let c = 0; c < NC; c++) for (let g = N - 1; g > gmax; g--) if (F[c * N + g] >= 0.02 * rmax) { gmax = g; break; }
  return {
    rmax, fluxRel: tot, scale, peakCd: rmax * scale, flux: tot * scale,
    h50, h10, beamA: h50[0] + h50[2], beamB: h50[1] + h50[3], fieldA: h10[0] + h10[2], fieldB: h10[1] + h10[3],
    gmax, centerCd: fieldAt(F, 0, 0) * scale, up: isUp, upFrac: tot > 0 ? up / tot : 0
  };
}

/* ---------- IES writer ---------- */
function hAngles(mode, hstep) {
  if (mode === 'rot') return [0];
  const max = mode === 'bi' ? 90 : mode === 'mir' ? 180 : 360;
  const a = [];
  for (let h = 0; h <= max + 1e-9; h += hstep) a.push(+h.toFixed(4));
  return a;
}
function vAngles(vstep) {
  const a = [];
  for (let v = 0; v <= 180 + 1e-9; v += vstep) a.push(+v.toFixed(4));
  return a;
}
function asciiClean(s) {
  return String(s == null ? '' : s).replace(/°/g, 'deg').replace(/×/g, 'x').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}
function fmtCd(x) { return x < 1e-4 ? '0' : String(+x.toPrecision(5)); }
function wrapNums(arr, per) {
  const lines = [];
  for (let i = 0; i < arr.length; i += per) lines.push(arr.slice(i, i + per).join(' '));
  return lines.join('\r\n');
}
// S.sample(v, H) and S.outMode let a composite of layers be written; otherwise the four planes are used
function buildIES(S, st, dateStr) {
  const map = MODES[S.mode].map, P = S.planes, sample = S.sample || ((v, H) => intensityAt(P, map, v, H));
  const vA = vAngles(S.vstep), hA = hAngles(S.outMode || S.mode, S.hstep);
  const lumens = S.lumensMode === 'abs' ? -1 : Math.max(1, Math.round(st.flux));
  const kw = (k, v) => ('[' + k + '] ' + asciiClean(v)).slice(0, 78);
  const name = asciiClean(S.meta.name) || 'Untitled profile';
  const watts = isFinite(S.meta.watts) && S.meta.watts > 0 ? +(+S.meta.watts).toFixed(2) : 0;
  const out = [
    'IESNA:LM-63-2002',
    kw('TEST', name),
    kw('TESTLAB', 'IES Profile Studio (synthetic distribution)'),
    kw('ISSUEDATE', dateStr),
    kw('MANUFAC', S.meta.manufac || 'n/a'),
    kw('LUMINAIRE', name),
    kw('OTHER', 'Peak ' + fmtCd(st.peakCd) + ' cd, flux ' + Math.round(st.flux) + ' lm'),
    'TILT=NONE',
    ['1', lumens, 1, vA.length, hA.length, 1, 2, 0, 0, 0].join(' '),
    ['1', 1, watts].join(' '),
    wrapNums(vA, 10),
    wrapNums(hA, 10)
  ];
  for (const H of hA) {
    const row = vA.map(v => fmtCd(sample(v, H) * st.scale));
    out.push(wrapNums(row, 10));
  }
  return out.join('\r\n') + '\r\n';
}

/* ---------- IES parser (type C only) ---------- */
function reduceC(C, h0, hN, nh) {
  C = ((C % 360) + 360) % 360;
  if (nh === 1) return h0;
  if (h0 <= 1e-4 && hN <= 90.0001) { if (C > 270) C = 360 - C; else if (C > 180) C -= 180; else if (C > 90) C = 180 - C; }
  else if (h0 <= 1e-4 && hN <= 180.0001) { if (C > 180) C = 360 - C; }
  return C;
}
function interpV(vang, row, g) {
  const n = vang.length;
  if (g < vang[0] - 1e-6 || g > vang[n - 1] + 1e-6) return 0;
  for (let i = 0; i < n - 1; i++) {
    if (g <= vang[i + 1] + 1e-9) {
      const span = vang[i + 1] - vang[i], t = span > 0 ? (g - vang[i]) / span : 0;
      return row[i] * (1 - t) + row[i + 1] * t;
    }
  }
  return row[n - 1];
}
function parseIES(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  let ti = -1;
  for (let i = 0; i < lines.length; i++) if (/^\s*TILT\s*=/i.test(lines[i])) { ti = i; break; }
  if (ti < 0) return { error: 'No TILT line found, so this does not look like an LM-63 IES file.' };
  const meta = {};
  for (let i = 0; i < ti; i++) {
    const m = /^\s*\[([A-Z0-9_]+)\]\s*(.*)$/i.exec(lines[i]);
    if (m && !(m[1].toUpperCase() in meta)) meta[m[1].toUpperCase()] = m[2].trim();
  }
  const tilt = lines[ti].split('=')[1].trim().toUpperCase();
  const tok = lines.slice(ti + 1).join(' ').split(/[\s,]+/).filter(Boolean).map(Number);
  let p = 0;
  if (tilt.startsWith('INCLUDE')) { p += 1; const np = tok[p++]; p += np * 2; }
  if (tok.length - p < 13) return { error: 'The file ends before the photometric header is complete.' };
  const [nl, lum, mult, nv, nh, pt] = tok.slice(p, p + 6); p += 10;
  const watts = tok[p + 2]; p += 3;
  if ([nl, lum, mult, nv, nh, pt].some(x => !isFinite(x))) return { error: 'The photometric header contains non-numeric values.' };
  if (pt !== 1) return { error: 'Only photometric type C files can be imported (this file is type ' + pt + ').' };
  if (nv < 2 || nh < 1 || nv > 2000 || nh > 2000) return { error: 'The angle counts in the header are out of range.' };
  if (tok.length - p < nv + nh + nv * nh) return { error: 'The file has fewer values than its header announces.' };
  let vang = tok.slice(p, p + nv); p += nv;
  const hang = tok.slice(p, p + nh); p += nh;
  let rows = [];
  for (let j = 0; j < nh; j++) { rows.push(tok.slice(p, p + nv).map(x => x * mult)); p += nv; }
  if (vang.concat(hang).some(x => !isFinite(x)) || rows.some(r => r.some(x => !isFinite(x)))) return { error: 'The angle or candela table contains non-numeric values.' };
  if (vang[0] > vang[nv - 1]) { vang = vang.slice().reverse(); rows = rows.map(r => r.slice().reverse()); }
  const h0 = hang[0], hN = hang[nh - 1];
  const rowAt = C0 => {
    const C = reduceC(C0, h0, hN, nh);
    if (nh === 1 || C <= h0) return rows[0];
    if (C >= hN) return rows[nh - 1];
    let j = 0;
    while (j < nh - 2 && hang[j + 1] <= C) j++;
    const t = (C - hang[j]) / (hang[j + 1] - hang[j]), a = rows[j], b = rows[j + 1];
    return a.map((v, i) => v * (1 - t) + b[i] * t);
  };
  const planes = [0, 1, 2, 3].map(q => {
    const row = rowAt(90 * q), arr = new Float32Array(N);
    for (let g = 0; g < N; g++) arr[g] = Math.max(0, interpV(vang, row, g));
    return arr;
  });
  // full-detail grid as well, so an imported file keeps every horizontal angle
  const grid = makeField();
  for (let c = 0; c < NC; c++) { const row = rowAt(c * CSTEP); for (let g = 0; g < N; g++) grid[c * N + g] = Math.max(0, interpV(vang, row, g)); }
  let peak = 0;
  for (const a of planes) for (let i = 0; i < N; i++) if (a[i] > peak) peak = a[i];
  for (let i = 0; i < grid.length; i++) if (grid[i] > peak) peak = grid[i];
  if (!(peak > 0)) return { error: 'All candela values are zero.' };
  for (const a of planes) for (let i = 0; i < N; i++) a[i] /= peak;
  for (let i = 0; i < grid.length; i++) grid[i] /= peak;
  const eq = (a, b) => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m <= 0.002; };
  let mode = 'asym';
  if (eq(planes[0], planes[1]) && eq(planes[0], planes[2]) && eq(planes[0], planes[3])) mode = 'rot';
  else if (eq(planes[0], planes[2]) && eq(planes[1], planes[3])) mode = 'bi';
  else if (eq(planes[1], planes[3])) mode = 'mir';
  return {
    planes, grid, mode, peakCd: peak, watts: isFinite(watts) ? watts : 0,
    name: meta.LUMINAIRE || meta.TEST || meta.LUMCAT || '', manufac: meta.MANUFAC || '',
    info: { nv, nh, hMin: h0, hMax: hN }
  };
}

/* ---------- minimal zip (one stored entry) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(filename, text, date) {
  const enc = new TextEncoder(), name = enc.encode(filename), data = enc.encode(text);
  const crc = crc32(data), d = date || new Date();
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const day = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const lh = new DataView(new ArrayBuffer(30));
  lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
  lh.setUint16(10, time, true); lh.setUint16(12, day, true); lh.setUint32(14, crc, true);
  lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
  const ch = new DataView(new ArrayBuffer(46));
  ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
  ch.setUint16(12, time, true); ch.setUint16(14, day, true); ch.setUint32(16, crc, true);
  ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
  ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, 0, true);
  const cdOffset = 30 + name.length + data.length, cdSize = 46 + name.length;
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true); eo.setUint16(4, 0, true); eo.setUint16(6, 0, true); eo.setUint16(8, 1, true); eo.setUint16(10, 1, true);
  eo.setUint32(12, cdSize, true); eo.setUint32(16, cdOffset, true); eo.setUint16(20, 0, true);
  const out = new Uint8Array(cdOffset + cdSize + 22);
  let o = 0;
  for (const part of [new Uint8Array(lh.buffer), name, data, new Uint8Array(ch.buffer), name, new Uint8Array(eo.buffer)]) { out.set(part, o); o += part.length; }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FINE_MODS, CSTEP, NC, makeField, fieldAt, fieldSlice, fieldMax, fbm, MOD_TYPES, applyMod, BLENDS, layerField, compositeLayers, outModeFor, fieldStats, warpPlane, warpKnots, pwl, N, DEG, MODES, splineEval, fitKnots, poleSpread, matchPole, fluxParts, usedPlanes, sampleArr, genArray, sculptDraw, sculptPush, sculptSmooth, smoothAll, mirrorUp, zeroUp, intensityAt, relMax, fluxRel, crossing, computeStats, buildIES, parseIES, makeZip, crc32, hAngles, vAngles };
}
