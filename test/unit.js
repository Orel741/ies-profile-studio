const C = require('../src/core.js');
const fs = require('fs');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const mk = (mode, specs, extra = {}) => {
  const planes = [0, 1, 2, 3].map(k => C.genArray(specs[Math.min(k, specs.length - 1)]));
  return Object.assign({ mode, planes, scaleMode: 'peak', peakCd: 1000, fluxLm: 1000, meta: { name: 'Test 30°×', manufac: 'Jan', watts: 12 }, lumensMode: 'flux', vstep: 1, hstep: 15 }, extra);
};

// Lambertian flux = pi * I0
{
  const S = mk('rot', [{ type: 'cos', n: 1 }]);
  const st = C.computeStats(S);
  assert(Math.abs(st.fluxRel - Math.PI) < 0.02, 'lambertian flux ' + st.fluxRel);
  assert(Math.abs(st.scale - 1000) < 1e-6, 'peak scale');
}
// beam angle exactness
{
  const S = mk('rot', [{ type: 'beam', beam: 30, field: 50 }]);
  const st = C.computeStats(S);
  console.log('beam/field', st.beamA.toFixed(2), st.fieldA.toFixed(2));
  assert(Math.abs(st.beamA - 30) < 0.3, 'beam 30');
  assert(Math.abs(st.fieldA - 50) < 0.5, 'field 50');
  // flux mode
  S.scaleMode = 'flux'; S.fluxLm = 800;
  const st2 = C.computeStats(S);
  assert(Math.abs(st2.flux - 800) < 0.01, 'flux mode');
}
// bilateral symmetry in file + roundtrip
for (const mode of ['rot', 'bi', 'mir', 'asym']) {
  const specs = [{ type: 'beam', beam: 40, field: 80, aim: 10 }, { type: 'beam', beam: 70, field: 120 }, { type: 'bat', peak: 40, width: 40, center: .4, cutoff: 85 }, { type: 'beam', beam: 25, field: 40 }];
  const S = mk(mode, specs.slice(0, { rot: 1, bi: 2, mir: 3, asym: 4 }[mode]));
  const st = C.computeStats(S);
  const txt = C.buildIES(S, st, '2026-10-20');
  const lines = txt.split('\r\n');
  assert(lines.every(l => l.length <= 132), mode + ' line length');
  const hdr = lines.find(l => /^1 -?\d+ 1 /.test(l));
  console.log(mode, hdr, 'lines', lines.length, 'bytes', txt.length);
  const r = C.parseIES(txt);
  assert(!r.error, mode + ' parse: ' + (r.error || 'fine'));
  assert(r.mode === mode || (mode === 'mir' && r.mode === 'mir'), mode + ' detected as ' + r.mode);
  // compare planes
  const map = C.MODES[mode].map;
  let maxd = 0;
  for (let q = 0; q < 4; q++) for (let g = 0; g < 181; g++) { const a = S.planes[map[q]][g] / st.rmax, b = r.planes[q][g]; maxd = Math.max(maxd, Math.abs(a - b)); }
  assert(maxd < 1e-3, mode + ' roundtrip max diff ' + maxd.toExponential(2));
  assert(Math.abs(r.peakCd - 1000) < 0.5, mode + ' peak cd ' + r.peakCd);
  assert(r.name.startsWith('Test 30deg'), 'name ' + r.name);
  if (mode === 'asym') fs.writeFileSync(require('path').join(require('os').tmpdir(), 'ies-sample.ies'), txt);
}
// parse downlight-style 0..90 file
{
  const f = ['IESNA:LM-63-2002', '[TEST] x', 'TILT=NONE', '1 1000 1 4 2 1 2 0 0 0', '1 1 10', '0 30 60 90', '0 90', '100 80 40 0', '100 60 20 0'].join('\n');
  const r = C.parseIES(f);
  assert(!r.error && r.mode === 'bi', 'hand file: ' + (r.error || r.mode));
  assert(r.planes[0][30] > 0.79 && r.planes[0][120] === 0, 'upper zero');
  assert(Math.abs(r.planes[1][30] - 0.6) < 1e-6, 'C90 plane');
  const bad = C.parseIES('hello');
  assert(bad.error, 'garbage rejected');
  const typeB = C.parseIES(['TILT=NONE', '1 1000 1 2 1 2 2 0 0 0', '1 1 0', '0 90', '0', '1 1'].join('\n'));
  assert(typeB.error, 'type B rejected');
}
// zip
{
  const z = C.makeZip('a b.ies', 'hello\r\nworld\r\n', new Date(2026, 9, 20, 11, 20, 0));
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'ies-test.zip'), z);
}
// sculpt
{
  const a = new Float32Array(181).fill(0.2);
  C.sculptDraw(a, 50, 1, 6);
  assert(Math.abs(a[50]-1)<1e-5 && Math.abs(a[44]-0.2)<1e-6 && a[47] > 0.2 && a[47] < 1, 'draw brush');
  const b = a.slice(); C.smoothAll(b, 3); assert(b[50] < 1, 'smooth');
}
// splines + fitting
{
  const ks = [[0, 1], [20, 0.8], [40, 0], [180, 0]];
  const f = C.splineEval(ks);
  assert(Math.abs(f[0] - 1) < 1e-6 && Math.abs(f[20] - 0.8) < 1e-6 && f[40] === 0 && f[100] === 0, 'spline passes through knots');
  let mono = true; for (let i = 1; i <= 40; i++) if (f[i] > f[i - 1] + 1e-7) mono = false;
  assert(mono, 'spline monotone, no overshoot');
  for (const spec of [{ type: 'beam', beam: 30, field: 50 }, { type: 'beam', beam: 12, field: 24 }, { type: 'bat', peak: 62, width: 60, center: 0.5, cutoff: 86 }, { type: 'cos', n: 1.5, aim: 180 }]) {
    const a = C.genArray(spec), k = C.fitKnots(a), g = C.splineEval(k);
    let e = 0; for (let i = 0; i < 181; i++) e = Math.max(e, Math.abs(g[i] - a[i]));
    console.log('   fit', spec.type, spec.beam || spec.peak || spec.n, 'knots', k.length, 'maxErr', e.toFixed(4));
    assert(e < 0.012 && k.length <= 24, 'fit within tolerance');
  }
}
// pole matching + stats extras
{
  const P = [C.genArray({ type: 'beam', beam: 40, field: 80 }), C.genArray({ type: 'beam', beam: 40, field: 80, aim: 30 }), C.genArray({ type: 'beam', beam: 40, field: 80 }), C.genArray({ type: 'beam', beam: 40, field: 80 })];
  const before = C.poleSpread(P, [0, 1, 2, 3], 0);
  C.matchPole(P, [0, 1, 2, 3], 0);
  assert(before > 0.2 && C.poleSpread(P, [0, 1, 2, 3], 0) < 1e-6, 'pole matched (' + before.toFixed(2) + ' -> 0)');
  const up = C.computeStats({ mode: 'rot', planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 40, field: 70, aim: 180 })), scaleMode: 'peak', peakCd: 100 });
  assert(up.up && Math.abs(up.beamA - 40) < 0.6 && up.upFrac > 0.99, 'uplight beam ' + up.beamA.toFixed(1) + ' up ' + up.upFrac.toFixed(3));
  const lam = C.computeStats({ mode: 'rot', planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'cos', n: 1 })), scaleMode: 'peak', peakCd: 100 });
  assert(lam.upFrac < 0.001, 'lambertian no uplight');
}
// warp moves edges exactly
{
  const S0 = { mode: 'rot', planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 30, field: 50 })), scaleMode: 'peak', peakCd: 100 };
  const st = C.computeStats(S0);
  const src = [0, st.h50[0], st.h10[0], 90], dst = [0, 25, 40, 90];
  const w = C.warpPlane(S0.planes[0], src, dst);
  const st2 = C.computeStats({ mode: 'rot', planes: [w, w, w, w], scaleMode: 'peak', peakCd: 100 });
  assert(Math.abs(st2.h50[0] - 25) < 0.3 && Math.abs(st2.h10[0] - 40) < 0.3, 'warp edges ' + st2.h50[0].toFixed(2) + ' / ' + st2.h10[0].toFixed(2));
  assert(Math.abs(w[0] - S0.planes[0][0]) < 1e-6, 'warp keeps nadir');
  const k = C.warpKnots([[0, 1], [15, 0.5], [25, 0.1], [180, 0]], [0, 15, 25, 90], [0, 30, 45, 90]);
  assert(k[1][0] === 30 && k[2][0] === 45 && k[3][0] === 180, 'warp knots');
}
// layers + modifiers
{
  const spot = { type: 'curve', mode: 'rot', planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 30, field: 50 })), on: true, blend: 'add', amount: 1, turn: 0, mods: [] };
  const F = C.layerField(spot), st0 = C.computeStats({ mode: 'rot', planes: spot.planes, scaleMode: 'peak', peakCd: 100 }), sf = C.fieldStats(F, { scaleMode: 'peak', peakCd: 100 });
  assert(Math.abs(sf.beamA - st0.beamA) < 0.3 && Math.abs(sf.fluxRel - st0.fluxRel) / st0.fluxRel < 0.01, 'field stats match plane stats (' + sf.beamA.toFixed(2) + ' vs ' + st0.beamA.toFixed(2) + ', flux ' + sf.fluxRel.toFixed(4) + ' vs ' + st0.fluxRel.toFixed(4) + ')');
  const two = C.compositeLayers([spot, Object.assign({}, spot, { amount: 0.5 })]);
  assert(Math.abs(C.fieldMax(two) - 1.5) < 1e-4, 'add blend sums');
  const oval = { type: 'curve', mode: 'bi', planes: [C.genArray({ type: 'beam', beam: 80, field: 120 }), C.genArray({ type: 'beam', beam: 20, field: 40 }), null, null], on: true, blend: 'add', amount: 1, turn: 90, mods: [] };
  oval.planes[2] = oval.planes[0]; oval.planes[3] = oval.planes[1];
  const Fo = C.layerField(oval);
  assert(Math.abs(C.fieldAt(Fo, 30, 90) - C.intensityAt(oval.planes, C.MODES.bi.map, 30, 0)) < 1e-4, 'turn rotates the layer');
  // modifiers keep one value straight down and do something elsewhere
  for (const type of Object.keys(C.MOD_TYPES).filter(t => t !== 'mirror')) {   // mirror leaves a round light unchanged; tested below
    const L = Object.assign({}, spot, { planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 60, field: 100 })), mods: [{ type, on: true, p: type === 'cut' ? { angle: 40 } : type === 'blur' ? { vert: 10, around: 10 } : type === 'shapes' ? { spread: 50 } : {} }] });
    const G = C.layerField(L);
    let lo = Infinity, hi = -Infinity; for (let c = 0; c < C.NC; c++) { lo = Math.min(lo, G[c * C.N]); hi = Math.max(hi, G[c * C.N]); }
    const base = C.layerField(Object.assign({}, L, { mods: [] }));
    let diff = 0; for (let i = 0; i < G.length; i++) diff = Math.max(diff, Math.abs(G[i] - base[i]));
    assert(hi - lo < 1e-4 && diff > 0.005, type + ': nadir spread ' + (hi - lo).toExponential(1) + ', max change ' + diff.toFixed(3));
  }
  { // tilt moves the hotspot toward the chosen side; barn doors cut one side only; a loaded slide is projected Front-up
    const L = Object.assign({}, spot, { planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 20, field: 40 })) });
    const T = C.layerField(Object.assign({}, L, { mods: [{ type: 'transform', on: true, p: { tilt: 30, rotate: 90 } }] }));
    assert(C.fieldAt(T, 30, 90) > 0.95 && C.fieldAt(T, 30, 270) < 0.05 && C.fieldAt(T, 0, 0) < 0.1, 'transform tilt 30° rotated 90°: peak at 30° Left ' + C.fieldAt(T, 30, 90).toFixed(2));
    const T0 = C.layerField(Object.assign({}, L, { mods: [{ type: 'transform', on: true, p: { tilt: 30, rotate: 0 } }] }));
    assert(C.fieldAt(T0, 30, 0) > 0.95, 'transform tilt with no rotation aims Front');
    const one = { type: 'curve', mode: 'mir', planes: [C.genArray({ type: 'beam', beam: 20, field: 40, aim: 25 }), C.genArray({ type: 'beam', beam: 20, field: 40 }), C.genArray({ type: 'beam', beam: 20, field: 40, aim: -25 })], on: true, blend: 'add', amount: 1, turn: 0, mods: [] };
    const base = C.layerField(one), Mi = C.layerField(Object.assign({}, one, { mods: [{ type: 'mirror', on: true, p: { mode: 1 } }] }));
    assert(Math.abs(C.fieldAt(Mi, 25, 180) - C.fieldAt(base, 25, 0)) < 1e-3 && Math.abs(C.fieldAt(Mi, 25, 0) - C.fieldAt(base, 25, 180)) < 1e-3, 'mirror Front↔Back swaps the sides');
    const Mc = C.layerField(Object.assign({}, one, { mods: [{ type: 'mirror', on: true, p: { mode: 4 } }] }));
    assert(Math.abs(C.fieldAt(Mc, 25, 180) - C.fieldAt(base, 25, 0)) < 1e-3 && Math.abs(C.fieldAt(Mc, 25, 0) - C.fieldAt(base, 25, 0)) < 1e-6, 'mirror copies Front onto Back');
    const Tn = C.layerField(Object.assign({}, L, { mods: [{ type: 'transform', on: true, p: { tilt: -30 } }] }));
    assert(C.fieldAt(Tn, 30, 180) > 0.95, 'negative tilt aims Back');
    const Wd = C.layerField(Object.assign({}, L, { mods: [{ type: 'transform', on: true, p: { tilt: 0, uniform: 0, wideF: 2, wideS: 1 } }] })), b0 = C.layerField(L);
    assert(Math.abs(C.fieldAt(Wd, 20, 0) - C.fieldAt(b0, 10, 0)) < 1e-3 && Math.abs(C.fieldAt(Wd, 10, 90) - C.fieldAt(b0, 10, 90)) < 1e-3, 'width front-back 200% doubles that spread only');
    const Wu = C.layerField(Object.assign({}, L, { mods: [{ type: 'transform', on: true, p: { tilt: 0, uniform: 1, wideF: 2, wideS: 1 } }] }));
    assert(Math.abs(C.fieldAt(Wu, 20, 90) - C.fieldAt(b0, 10, 90)) < 1e-3, 'uniform scale widens both ways');
    const D = C.layerField(Object.assign({}, L, { mods: [{ type: 'doors', on: true, p: { front: 5, back: 90, left: 90, right: 90, soft: 1 } }] }));
    assert(C.fieldAt(D, 10, 0) < 0.01 && Math.abs(C.fieldAt(D, 10, 180) - C.fieldAt(T.constructor === Float32Array ? C.layerField(L) : L, 10, 180)) < 1e-4, 'barn door closes the Front side only');
    const half = 'AAAA', w = 2, h = 2;   // 2×2 slide: top row black, bottom row white (top = Front)
    const img = w + ':' + h + ':' + Buffer.from([0, 0, 255, 255]).toString('base64');
    const G = C.layerField(Object.assign({}, L, { planes: [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 80, field: 120 })), mods: [{ type: 'gobo', on: true, p: { size: 30, img } }] }));
    assert(C.fieldAt(G, 20, 0) < 0.05 && C.fieldAt(G, 20, 180) > 0.5, 'gobo slide: Front dark, Back lit ' + C.fieldAt(G, 20, 0).toFixed(2) + '/' + C.fieldAt(G, 20, 180).toFixed(2));
    assert(C.fieldAt(G, 60, 180) < 1e-6, 'gobo blocks outside the slide');
    const wide = [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 80, field: 120 })), Lw = Object.assign({}, L, { planes: wide }), Bw = C.layerField(Lw);
    const img1 = v => '4:4:' + Buffer.from(new Array(16).fill(v)).toString('base64');
    const Cw = C.layerField(Object.assign({}, Lw, { mods: [{ type: 'shapes', on: true, p: { shape: 3, size: 1, spread: 40, img: img1(255) } }] }));
    const Cb = C.layerField(Object.assign({}, Lw, { mods: [{ type: 'shapes', on: true, p: { shape: 3, size: 1, spread: 40, img: img1(0) } }] }));
    assert(Math.abs(C.fieldAt(Cw, 12, 30) - C.fieldAt(Bw, 12, 30)) < 0.02 && C.fieldAt(Cb, 12, 30) < 1e-6, 'custom shape image: white passes, black blocks');
  }
  { // adjustment layers: modifiers over everything below, faded by mix; nothing below means no effect
    const flat = [0, 1, 2, 3].map(() => C.genArray({ type: 'beam', beam: 60, field: 100 }));
    const a = Object.assign({}, spot, { planes: flat, mods: [] }), b = Object.assign({}, spot, { planes: flat, mods: [], blend: 'add' });
    const adj = (mods, amount) => ({ type: 'adjust', on: true, blend: 'add', amount, turn: 0, mode: 'rot', planes: flat, mods });
    const cut = [{ type: 'cut', on: true, p: { angle: 20, soft: 1 } }];
    const F0 = C.compositeLayers([a, b]), F1 = C.compositeLayers([a, b, adj(cut, 1)]), Fh = C.compositeLayers([a, b, adj(cut, 0.5)]);
    assert(Math.abs(C.fieldAt(F1, 0, 0) - C.fieldAt(F0, 0, 0)) < 1e-5 && C.fieldAt(F1, 30, 0) < 1e-6 && C.fieldAt(F0, 30, 0) > 0.5, 'adjustment cut applies to both layers below');
    assert(Math.abs(C.fieldAt(Fh, 30, 0) - 0.5 * C.fieldAt(F0, 30, 0)) < 1e-4, 'adjustment mix 50% is halfway');
    const Fb = C.compositeLayers([adj(cut, 1), a]);
    assert(Math.abs(C.fieldAt(Fb, 30, 0) - C.fieldAt(C.compositeLayers([a]), 30, 0)) < 1e-6, 'adjustment at the bottom does nothing');
    const Fa = C.compositeLayers([a, adj(cut, 1), b]);
    assert(Math.abs(C.fieldAt(Fa, 30, 0) - C.fieldAt(C.compositeLayers([b]), 30, 0)) < 1e-5, 'adjustment leaves layers above it alone');
    assert(C.outModeFor([a, adj([{ type: 'contrast', on: true, p: {} }], 1)]) === 'rot' && C.outModeFor([a, adj([{ type: 'noise', on: true, p: {} }], 1)]) === 'asym', 'adjustment symmetry');
  }
  assert(C.outModeFor([spot]) === 'rot' && C.outModeFor([spot, oval]) === 'bi' && C.outModeFor([Object.assign({}, spot, { mods: [{ type: 'noise', p: {} }] })]) === 'asym', 'export symmetry from layers');
  // composite export round-trips through the parser at full detail
  const noisy = Object.assign({}, spot, { mods: [{ type: 'rays', p: { count: 8, depth: 0.8 } }] });
  const Fc = C.compositeLayers([noisy]), stc = C.fieldStats(Fc, { scaleMode: 'peak', peakCd: 1000 });
  const txt = C.buildIES({ mode: 'rot', planes: spot.planes, outMode: 'asym', sample: (v, H) => C.fieldAt(Fc, v, H), vstep: 1, hstep: 1, lumensMode: 'flux', meta: { name: 'rays' } }, stc, '2026-10-20');
  const r = C.parseIES(txt);
  let e = 0; for (let i = 0; i < Fc.length; i++) e = Math.max(e, Math.abs(r.grid[i] - Fc[i] / stc.rmax));
  assert(!r.error && e < 2e-3, 'rays export/import grid error ' + e.toExponential(2));
}
