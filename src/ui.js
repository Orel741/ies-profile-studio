/* ===== UI ===== */
(function () {
  const $ = id => document.getElementById(id);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const PCOL = ['--c0', '--c1', '--c2', '--c3'];
  const DIRN = ['Front', 'Left', 'Back', 'Right'];   // q = 0..3, IES C0, C90, C180, C270
  const KEY = 'ies-profile-studio-v1';

  const GEN_DEFAULT = { type: 'beam', beam: 30, field: 50, aim: 0, cutoff: 180, n: 1, peak: 40, width: 40, center: 0.45 };
  const PRESETS = [
    { id: 'spot', name: 'Spot 30°', mode: 'rot', peak: 4000, specs: [{ type: 'beam', beam: 30, field: 50 }] },
    { id: 'narrow', name: 'Narrow spot 12°', mode: 'rot', peak: 20000, specs: [{ type: 'beam', beam: 12, field: 24 }] },
    { id: 'flood', name: 'Flood 90°', mode: 'rot', peak: 900, specs: [{ type: 'beam', beam: 90, field: 130 }] },
    { id: 'lamb', name: 'Lambertian', mode: 'rot', peak: 500, specs: [{ type: 'cos', n: 1 }] },
    { id: 'bat', name: 'Batwing', mode: 'bi', peak: 1200, specs: [
      { type: 'bat', peak: 42, width: 46, center: 0.3, cutoff: 88 }, { type: 'bat', peak: 34, width: 40, center: 0.4, cutoff: 88 }] },
    { id: 'ell', name: 'Elliptical 80×20', mode: 'bi', peak: 2500, specs: [
      { type: 'beam', beam: 80, field: 120 }, { type: 'beam', beam: 20, field: 40 }] },
    { id: 'wash', name: 'Wall washer', mode: 'mir', peak: 1500, specs: [
      { type: 'beam', beam: 36, field: 76, aim: 52 }, { type: 'beam', beam: 70, field: 110 }, { type: 'beam', beam: 22, field: 40, cutoff: 50 }] },
    { id: 'test', name: 'Orientation test', mode: 'asym', peak: 3000, specs: [
      { type: 'beam', beam: 26, field: 44, aim: 50 }, { type: 'beam', beam: 2, field: 2, aim: 180, cutoff: 10 },
      { type: 'beam', beam: 2, field: 2, aim: 180, cutoff: 10 }, { type: 'beam', beam: 2, field: 2, aim: 180, cutoff: 10 }] },
    { id: 'up', name: 'Uplight', mode: 'rot', peak: 600, specs: [{ type: 'cos', n: 1.5, aim: 180 }] }
  ];
  const GEN_TYPES = [['beam', 'Beam'], ['cos', 'Cosine power'], ['bat', 'Batwing']];
  const CUT = ['cutoff', 'Cutoff angle', 10, 180, 1, '°'];
  const GEN_FIELDS = {
    beam: [['beam', 'Beam angle (50%)', 2, 160, 1, '°'], ['field', 'Field angle (10%)', 2, 180, 1, '°'], ['aim', 'Aim offset', 0, 180, 1, '°'], CUT],
    cos: [['n', 'Exponent n', 0, 40, 0.1, ''], ['aim', 'Aim offset', 0, 180, 1, '°'], CUT],
    bat: [['peak', 'Peak angle', 5, 85, 1, '°'], ['width', 'Peak width', 5, 90, 1, '°'], ['center', 'Centre level', 0, 1, 0.01, '%'], CUT]
  };
  const TOOLS = [['points', 'Points', 'P'], ['draw', 'Draw', 'D'], ['push', 'Push', 'U'], ['smooth', 'Smooth', 'S']];
  const HINTS = {
    points: 'Click on or near the curve to add a point, then drag it. Double-click or right-click a point to remove it. Shift-drag moves a point along one axis.',
    pointsSel: 'Arrow keys nudge the selected point (Shift for bigger steps). Delete removes it. Type exact values in the boxes.',
    draw: 'Drag across the plot to paint the curve. Hold Shift to paint a flat line at the height where you started. [ and ] resize the brush.',
    push: 'Press on the curve and drag up or down to lift or lower it around that angle.',
    smooth: 'Drag over bumps to soften them. Brush sets how wide an area is affected, Strength how hard each stroke smooths. Go over an area again to smooth it more.'
  };

  const S = {
    mode: 'rot', planes: [0, 1, 2, 3].map(() => new Float32Array(N)), knots: [null, null, null, null], sel: -1, active: 0, preset: null,
    scaleMode: 'peak', peakCd: 4000, fluxLm: 1000,
    meta: { name: 'Spot 30°', manufac: '', watts: 0 }, lumensMode: 'flux', vstep: 1, hstep: 15,
    tool: 'points', brush: 6, smoothStr: 0.6, gen: Object.assign({}, GEN_DEFAULT),
    xr: 'auto', ys: 'lin',
    handles: true, fit: true, floorH: 3, floorRange: 6, bands: false, wallD: 0.6, wallC: 0,
    layers: [], cur: 0,
    pvLook: 'heat', kelvin: 4000, ev: 0, amb: 0.15, hmode: 'points', surf: 'floor', ceilD: 1.2
  };
  const used = () => usedPlanes(MODES[S.mode].map);

  /* ---------- layers: S.mode / S.planes / S.knots always belong to the selected layer ---------- */
  let layerSeq = 1, revSeq = 1, modSeq = 1;
  const newLayer = o => Object.assign({ id: layerSeq++, name: 'Layer', type: 'curve', on: true, blend: 'add', amount: 1, turn: 0, mods: [],
    mode: 'rot', planes: [0, 1, 2, 3].map(() => new Float32Array(N)), knots: [null, null, null, null], grid: null, rev: revSeq++ }, o);
  const curLayer = () => S.layers[S.cur];
  const editable = () => !!curLayer() && curLayer().type === 'curve';
  function guardEdit() {
    if (editable()) return true;
    say('This layer is an imported file. Click Edit as curve in the Layers panel to reshape it.'); return false;
  }
  function bindCur() { const L = curLayer(); S.mode = L.mode; S.planes = L.planes; S.knots = L.knots; if (!MODES[S.mode].tabs[S.active]) S.active = 0; S.sel = -1; }
  function syncCur() { const L = curLayer(); if (!L) return; L.mode = S.mode; L.planes = S.planes; L.knots = S.knots; }
  function cloneLayer(L, fresh) {
    return Object.assign({}, L, { id: fresh ? layerSeq++ : L.id, rev: revSeq++, planes: L.planes.map(a => a.slice()), knots: L.knots.map(k => (k ? k.map(p => p.slice()) : null)),
      mods: L.mods.map(m => ({ id: fresh ? modSeq++ : m.id, type: m.type, on: m.on, p: Object.assign({}, m.p) })) });
  }
  // the combined light of every visible layer, with each layer's field cached until it changes
  const fieldCache = new Map();
  let compVer = 1, compCache = null, csCache = null;
  function layerF(L) { const c = fieldCache.get(L.id); if (c && c.rev === L.rev) return c.F; const F = layerField(L); fieldCache.set(L.id, { rev: L.rev, F }); return F; }
  function comp() { if (!compCache || compCache.ver !== compVer) compCache = { ver: compVer, F: compositeLayers(S.layers, layerF) }; return compCache.F; }
  function cstats() { if (!csCache) csCache = fieldStats(comp(), S); return csCache; }
  const fineDetail = () => S.layers.some(L => L.on !== false && ((L.type !== 'curve' && L.type !== 'adjust') || (L.type !== 'adjust' && (L.turn % 90) !== 0) || L.mods.some(m => m.on !== false && FINE_MODS.has(m.type))));

  /* ---------- formatting ---------- */
  function fmtShort(v) {
    if (!isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
    if (a >= 100) return String(Math.round(v));
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }
  function fmtNum(v, d) {
    if (!isFinite(v)) return '–';
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
    if (Math.abs(v) >= 100) return v.toFixed(0);
    return v.toFixed(d == null ? 1 : d);
  }
  const fmtPct = v => { const p = v * 100; return (p === 0 ? '0' : p < 1 ? p.toFixed(2) : p < 10 ? p.toFixed(1) : Math.round(p)) + '%'; };
  const deg0 = v => (v > 0.4 ? Math.round(v) + '°' : '–');
  const say = (msg, kind) => { const el = $('status'); el.textContent = msg; el.dataset.kind = kind || ''; };

  /* ---------- scheduling ---------- */
  const need = { ed: 0, polar: 0, pv: 0, read: 0, d3: 0 };
  let raf = 0, stCache = null, iesTimer = 0, saveT = 0;
  function stats() { if (!stCache) stCache = computeStats(S); return stCache; }
  function queue() {
    const ks = arguments.length ? Array.prototype.slice.call(arguments) : ['ed', 'polar', 'pv', 'read', 'd3'];
    ks.forEach(k => { need[k] = 1; if (k === 'pv') need.d3 = 1; });
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function dirty() { lastEdit = performance.now(); syncCur(); const L = curLayer(); if (L) L.rev = revSeq++; compVer++; stCache = null; csCache = null; queue(); scheduleText(); saveSoon(); }
  // visibility, order, blend and strength change the mix but not any layer's own shape
  function dirtyMix() { lastEdit = performance.now(); compVer++; csCache = null; queue(); scheduleText(); saveSoon(); }
  function frame() {
    raf = 0;
    const st = stats(), cs = cstats();
    st.cdScale = cs.scale * (curLayer().amount == null ? 1 : curLayer().amount);
    if (need.ed) { need.ed = 0; drawEditor(st); syncInspector(st); syncWarn(st); }
    if (need.polar) { need.polar = 0; drawPolar(cs); }
    if (need.pv) { need.pv = 0; drawPreview(st, cs); clearTimeout(hiT); if (busy()) hiT = setTimeout(() => queue('pv'), 200); }
    if (need.read) { need.read = 0; updateReadouts(cs); }
    if (need.d3) { need.d3 = 0; draw3D(); }
  }

  /* ---------- knots ---------- */
  function getKnots(k) { if (!S.knots[k]) S.knots[k] = fitKnots(S.planes[k]); return S.knots[k]; }
  function commitKnots(k) { S.planes[k] = splineEval(S.knots[k]); }
  function invalidate(k) { if (k == null) S.knots = [null, null, null, null]; else S.knots[k] = null; if (k == null || k === S.active) S.sel = -1; }
  const cloneKnots = ks => ks.map(a => (a ? a.map(p => p.slice()) : null));

  /* ---------- history ---------- */
  const hist = [], redoStack = [];
  let coKey = null, coT = 0;
  const snap = () => { syncCur(); return { layers: S.layers.map(L => cloneLayer(L)), cur: S.cur, active: S.active, sel: S.sel, peakCd: S.peakCd, fluxLm: S.fluxLm, scaleMode: S.scaleMode, name: S.meta.name }; };
  function restore(s) {
    S.layers = s.layers.map(L => cloneLayer(L)); S.cur = clamp(s.cur, 0, S.layers.length - 1); bindCur(); S.active = s.active; S.sel = s.sel;
    S.peakCd = s.peakCd; S.fluxLm = s.fluxLm; S.scaleMode = s.scaleMode; S.meta.name = s.name;
  }
  function syncHistButtons() { $('btnUndo').disabled = !hist.length; $('btnRedo').disabled = !redoStack.length; }
  function pushSnap(s) { hist.push(s); if (hist.length > 100) hist.shift(); redoStack.length = 0; if (S.preset) { S.preset = null; renderPresets(); } syncHistButtons(); }
  function pushHist() { coKey = null; pushSnap(snap()); }
  // consecutive nudges of the same point within a moment count as one undo step
  function pushHistCo(key) { const now = performance.now(); if (key === coKey && now - coT < 900) { coT = now; return; } pushHist(); coKey = key; coT = now; }
  function undo() { if (!hist.length) return; redoStack.push(snap()); restore(hist.pop()); coKey = null; afterRestore(); }
  function redo() { if (!redoStack.length) return; hist.push(snap()); restore(redoStack.pop()); coKey = null; afterRestore(); }
  function afterRestore() { syncHistButtons(); syncAll(); compVer++; dirty(); }

  /* ---------- controls ---------- */
  function mkSeg(host, items, isOn, onPick) {
    host.textContent = '';
    items.forEach(([id, label, key, title]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-pressed', String(isOn(id)));
      b.appendChild(document.createTextNode(label));
      if (key) { const k = document.createElement('kbd'); k.textContent = key; b.appendChild(k); }
      if (title) b.title = title;
      b.addEventListener('click', () => onPick(id));
      host.appendChild(b);
    });
  }
  function renderPresets() {
    const host = $('presetRow'); if (!host) return; host.textContent = '';
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = p.name; b.setAttribute('aria-pressed', String(S.preset === p.id));
      b.addEventListener('click', () => applyPreset(p));
      host.appendChild(b);
    });
  }
  function renderSym() { mkSeg($('symRow'), Object.keys(MODES).map(k => [k, MODES[k].label, '', MODES[k].desc]), k => k === S.mode, setMode); $('symDesc').textContent = MODES[S.mode].desc; }
  function setActive(k) { if (!MODES[S.mode].tabs[k] || k === S.active) return; S.active = k; S.sel = -1; renderTabs(); queue('ed'); }
  function renderTabs() {
    const host = $('tabRow'); host.textContent = '';
    const many = MODES[S.mode].tabs.length > 1;
    $('genApply').textContent = many ? 'Apply to ' + MODES[S.mode].tabs[S.active] : 'Apply';
    $('genAll').hidden = !many;
    MODES[S.mode].tabs.forEach((label, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tab'; b.setAttribute('aria-pressed', String(k === S.active));
      b.style.setProperty('--dot', 'var(' + PCOL[k] + ')');
      if (MODES[S.mode].tabs.length > 1) b.title = 'Shortcut: ' + (k + 1);
      const d = document.createElement('i'); d.className = 'dot'; b.appendChild(d);
      b.appendChild(document.createTextNode(label));
      b.addEventListener('click', () => setActive(k));
      host.appendChild(b);
    });
  }
  function setTool(k) { S.tool = k; if (k !== 'points') S.sel = -1; renderTools(); queue('ed'); saveSoon(); }
  function renderTools() {
    mkSeg($('toolRow'), TOOLS, k => k === S.tool, setTool);
    $('brushWrap').hidden = S.tool === 'points';
    $('smoothWrap').hidden = S.tool !== 'smooth';
    $('smoothStr').value = S.smoothStr; $('smoothStrVal').textContent = Math.round(S.smoothStr * 100) + '%';
    $('edCv').style.cursor = S.tool === 'points' ? 'default' : 'crosshair';
  }
  function renderView() {
    mkSeg($('rangeSeg'), [['auto', 'Fit', '', 'Zoom to where the light is'], ['90', '0–90°', '', 'Downward half only'], ['180', '0–180°', '', 'Full range, straight down to straight up']],
      k => k === S.xr, k => { S.xr = k; renderView(); queue('ed'); saveSoon(); });
    mkSeg($('yScaleSeg'), [['lin', 'Linear'], ['log', 'Log', '', 'Logarithmic intensity, shows faint spill and cutoffs']],
      k => k === S.ys, k => { S.ys = k; renderView(); queue('ed'); saveSoon(); });
  }
  function renderScale() {
    mkSeg($('scaleSeg'), [['peak', 'Peak intensity'], ['flux', 'Total flux']], k => k === S.scaleMode, k => { if (k !== S.scaleMode) { pushHist(); S.scaleMode = k; renderScale(); dirty(); } });
    const flux = S.scaleMode === 'flux';
    $('scaleLabel').textContent = flux ? 'Total flux (lm)' : 'Peak intensity (cd)';
    $('scaleIn').value = String(flux ? S.fluxLm : S.peakCd);
  }
  const genUI = {};
  function renderGen() {
    mkSeg($('genType'), GEN_TYPES, k => k === S.gen.type, k => { S.gen.type = k; renderGen(); queue('ed'); });
    const host = $('genFields'); host.textContent = '';
    for (const k in genUI) delete genUI[k];
    GEN_FIELDS[S.gen.type].forEach(([key, label, min, max, step, unit]) => {
      const wrap = document.createElement('label'); wrap.className = 'field';
      const cap = document.createElement('span'); cap.textContent = label;
      const line = document.createElement('span'); line.className = 'line';
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.id = 'gen-' + key;
      const out = document.createElement('output');
      const show = () => {
        const v = S.gen[key];
        out.textContent = key === 'cutoff' && v >= 180 ? 'off' : unit === '%' ? Math.round(v * 100) + '%' : (step < 1 ? v.toFixed(1) : Math.round(v)) + unit;
        inp.value = v;
      };
      inp.addEventListener('input', () => {
        S.gen[key] = parseFloat(inp.value);
        if (key === 'beam' && S.gen.field < S.gen.beam) S.gen.field = S.gen.beam;
        if (key === 'field' && S.gen.field < S.gen.beam) S.gen.beam = S.gen.field;
        Object.keys(genUI).forEach(k => genUI[k]());
        queue('ed'); saveSoon();
      });
      genUI[key] = show; show();
      line.appendChild(inp); line.appendChild(out); wrap.appendChild(cap); wrap.appendChild(line); host.appendChild(wrap);
    });
  }
  function syncMeta() {
    $('fName').value = S.meta.name; $('fManu').value = S.meta.manufac; $('fWatts').value = S.meta.watts ? String(S.meta.watts) : '';
    $('fLum').value = S.lumensMode; $('fV').value = String(S.vstep); $('fH').value = String(S.hstep);
    $('fH').disabled = S.mode === 'rot';
  }
  const KPRESETS = [[1900, 'Candle'], [2700, 'Warm'], [3000, 'Halogen'], [4000, 'Neutral'], [5600, 'Daylight'], [6500, 'Cool']];
  function syncLookCtl() {
    mkSeg($('lookSeg'), [['heat', 'Heat map'], ['lit', 'Grey surface']], k => k === S.pvLook, k => { S.pvLook = k; syncLookCtl(); queue('pv'); saveSoon(); });
    const lit = S.pvLook === 'lit';
    $('litCtl').hidden = !lit; $('lookHint').textContent = lit
      ? 'Light falling on an 18% grey (middle grey) surface in the colour of the chosen temperature. Exposure 0 EV puts the brightest spot near white; room light shows the unlit grey.'
      : 'False colour from dark blue to white shows relative brightness. Hover the maps for exact lux.';
    $('kelvin').value = Math.min(12000, S.kelvin); $('kelvinNum').value = S.kelvin;
    const c = kelvinRGB(S.kelvin), m = Math.max(c[0], c[1], c[2]) || 1, g = v => Math.round(255 * Math.pow(clamp(v / m, 0, 1), 1 / 2.2));
    $('kSw').style.background = 'rgb(' + g(c[0]) + ',' + g(c[1]) + ',' + g(c[2]) + ')';
    $('ev').value = S.ev; $('evVal').textContent = (S.ev > 0 ? '+' : '') + S.ev.toFixed(1) + ' EV';
    $('amb').value = S.amb; $('ambVal').textContent = Math.round(S.amb * 100) + '%';
    mkSeg($('kPre'), KPRESETS.map(([k, n]) => [k, n + ' ' + k]), k => k === S.kelvin, k => { S.kelvin = k; syncLookCtl(); queue('pv'); saveSoon(); });
    ['bandsChk', 'bandsChkW'].forEach(id => { $(id).disabled = lit; $(id).parentElement.title = lit ? 'Isolux bands apply to the heat map' : ''; });
  }
  function syncPreviewCtl() {
    syncLookCtl();
    mkSeg($('surfSeg'), [['floor', 'Floor'], ['ceil', 'Ceiling']], k => k === S.surf, k => { S.surf = k; kHot = null; pvHot = null; syncPreviewCtl(); queue('pv'); saveSoon(); });
    $('ceilWrap').hidden = S.surf !== 'ceil'; $('ceilD').value = S.ceilD; $('ceilDVal').textContent = S.ceilD.toFixed(1) + ' m';
    $('floorH').value = S.floorH; $('floorHVal').textContent = S.floorH.toFixed(1) + ' m';
    $('floorR').value = S.floorRange; $('floorR').disabled = S.fit;
    $('fitChk').checked = S.fit; $('bandsChk').checked = S.bands; $('bandsChkW').checked = S.bands;
    ['hmodeF', 'hmodeW'].forEach(id => mkSeg($(id), [['points', 'Points', '', 'Drag the curve\'s control points'], ['edges', 'Edges', '', 'Drag the beam and field edges'], ['off', 'Off']], k => k === S.hmode, k => { S.hmode = k; S.handles = k !== 'off'; pvHot = null; kHot = null; syncPreviewCtl(); queue('pv'); saveSoon(); }));
    $('wallD').value = S.wallD; $('wallDVal').textContent = S.wallD.toFixed(2) + ' m';
    mkSeg($('wallSeg'), [[0, 'In front'], [90, 'Left'], [180, 'Behind'], [270, 'Right']], k => k === S.wallC, k => { S.wallC = k; syncPreviewCtl(); queue('pv'); saveSoon(); });
  }
  function syncAll() {
    if (!MODES[S.mode].tabs[S.active]) S.active = 0;
    renderLayers(); renderPresets(); renderSym(); renderTabs(); renderTools(); renderView(); renderScale(); renderGen(); syncMeta(); syncPreviewCtl();
    $('brush').value = S.brush; $('brushVal').textContent = S.brush + '°';
    syncHistButtons();
  }

  function setMode(m) {
    if (m === S.mode || !guardEdit()) return;
    pushHist();
    const oldMap = MODES[S.mode].map, newMap = MODES[m].map, oldUsed = new Set(oldMap);
    for (let i = 0; i < 4; i++) if (!oldUsed.has(newMap[i])) {
      S.planes[newMap[i]] = S.planes[oldMap[i]].slice();
      S.knots[newMap[i]] = S.knots[oldMap[i]] ? S.knots[oldMap[i]].map(p => p.slice()) : null;
    }
    S.mode = m;
    if (!MODES[m].tabs[S.active]) { S.active = 0; S.sel = -1; }
    syncAll(); dirty();
  }
  function presetPlanes(p) { const arrs = p.specs.map(genArray); return [0, 1, 2, 3].map(k => (arrs[k] || arrs[0]).slice()); }
  function applyPreset(p) {
    pushHist();
    const L = curLayer();
    if (L.type !== 'curve') { L.type = 'curve'; L.grid = null; }
    if (/^Layer( \d+)?$/.test(L.name) || PRESETS.some(x => x.name === L.name)) { L.name = p.name; }
    S.mode = p.mode;
    const arrs = p.specs.map(genArray);
    S.planes = [0, 1, 2, 3].map(k => (arrs[k] || arrs[0]).slice());
    fixPoles();
    invalidate();
    S.active = 0;
    if (S.layers.length === 1) { S.scaleMode = 'peak'; S.peakCd = p.peak; S.meta.name = p.name; }
    S.gen = Object.assign({}, GEN_DEFAULT, p.specs[0]); S.preset = p.id;
    syncCur(); renderLayers(); syncAll(); dirty();
    say('Loaded ' + p.name + '. ' + (S.tool === 'points' ? 'Drag the points to reshape it.' : 'Paint on the curve to reshape it.'));
  }
  // presets built from per-plane generators must still agree straight down and straight up
  function fixPoles() { const u = used(); if (u.length < 2) return; [0, 180].forEach(g => { if (poleSpread(S.planes, u, g) > 0.002) matchPole(S.planes, u, g, 12); }); }
  let genCache = { key: '', arr: null };
  function genPreview() { const key = JSON.stringify(S.gen); if (genCache.key !== key) genCache = { key, arr: genArray(S.gen) }; return genCache.arr; }
  function applyGen(all) {
    if (!guardEdit()) return;
    pushHist();
    const arr = genArray(S.gen);
    if (all) { MODES[S.mode].tabs.forEach((_, k) => { S.planes[k] = arr.slice(); }); invalidate(); }
    else { S.planes[S.active] = arr; invalidate(S.active); }
    dirty();
  }
  function planeOp(fn) { if (!guardEdit()) return; pushHist(); fn(S.planes[S.active]); invalidate(S.active); dirty(); }

  /* ---------- layers panel ---------- */
  const pctF = v => Math.round(v * 100) + '%', degF = v => (+v.toFixed(1)) + '°', intF = v => String(Math.round(v));
  const MOD_FIELDS = {
    noise: [['amount', 'Strength', 0, 1, 0.01, pctF], ['size', 'Blob size', 3, 90, 1, degF], ['detail', 'Detail', 1, 5, 1, intF], ['seed', 'Pattern', 1, 99, 1, v => '#' + Math.round(v)]],
    rays: [['count', 'Number of rays', 2, 48, 1, intF], ['depth', 'Depth', 0, 1, 0.01, pctF], ['sharp', 'Sharpness', 0, 1, 0.01, pctF], ['phase', 'Turn', 0, 360, 1, degF], ['from', 'Fade in from centre', 0, 45, 1, degF]],
    rings: [['count', 'Rings per 90°', 1, 30, 1, intF], ['depth', 'Depth', 0, 1, 0.01, pctF], ['offset', 'Shift', 0, 360, 1, degF]],
    blur: [['vert', 'Up and down', 0, 20, 0.5, degF], ['around', 'Around the axis', 0, 45, 0.5, degF]],
    cut: [['angle', 'Cut above', 10, 180, 1, degF], ['soft', 'Softness', 0, 30, 0.5, degF]],
    contrast: [['gamma', 'Contrast', 0.3, 3, 0.05, v => v.toFixed(2) + '×']],
    transform: [['tilt', 'Tilt', 0, 90, 0.5, degF], ['rotate', 'Rotation', 0, 359, 1, v => Math.round(v) + '° ' + sideName(v)],
      ['wideF', 'Width front–back', 0.25, 3, 0.01, pctF], ['wideS', 'Width sideways', 0.25, 3, 0.01, pctF], ['mirror', 'Mirror', 0, 2, 1, null, ['Off', 'Left ↔ Right', 'Front ↔ Back']]],
    doors: [['front', 'Front door', 5, 90, 0.5, doorF], ['back', 'Back door', 5, 90, 0.5, doorF], ['left', 'Left door', 5, 90, 0.5, doorF], ['right', 'Right door', 5, 90, 0.5, doorF], ['soft', 'Softness', 0, 20, 0.5, degF], ['turn', 'Turn doors', 0, 90, 1, degF]],
    gobo: [['size', 'Slide size', 3, 80, 0.5, degF], ['rotate', 'Rotate', 0, 359, 1, degF], ['level', 'Light through dark parts', 0, 1, 0.01, pctF], ['invert', 'Invert', 0, 1, 1, null, ['Off', 'On']]],
    shapes: [['shape', 'Shape', 0, 2, 1, null, ['Circles', 'Squares', 'Diamonds']], ['layout', 'Layout', 0, 1, 1, null, ['Grid', 'Rings']], ['count', 'Count across', 1, 16, 1, intF], ['size', 'Shape size', 0.05, 1, 0.01, pctF],
      ['spread', 'Spread', 3, 80, 0.5, degF], ['soft', 'Edge softness', 0, 1, 0.01, pctF], ['rotate', 'Rotate', 0, 359, 1, degF], ['level', 'Light between shapes', 0, 1, 0.01, pctF]]
  };
  function sideName(v) { const a = ((Math.round(v) % 360) + 360) % 360; return ['Front', 'Left', 'Back', 'Right'][Math.round(a / 90) % 4] + (a % 90 ? '-ish' : ''); }
  function doorF(v) { return v >= 89.95 ? 'open' : (+v.toFixed(1)) + '°'; }
  const MOD_HELP = {
    noise: 'Random blotches across the beam, like an imperfect lens or a dirty reflector.',
    rays: 'Bright and dark spokes around the axis, like a faceted reflector or a gobo.',
    rings: 'Bright and dark bands from the centre outwards, typical of cheap reflectors.',
    blur: 'Softens detail up and down and around the light.',
    cut: 'Removes light above an angle, like a shield or a dark-sky cutoff.',
    contrast: 'Above 1× makes the hotspot punchier, below 1× flattens it.',
    transform: 'Tilt aims the light off its axis toward Front; Rotation then turns it around the vertical (90° aims it Left) without changing the tilt. The widths stretch or squeeze the beam in each direction, and Mirror flips it.',
    doors: 'Four flaps that cut the beam on each side, measured from straight down. 90° is fully open.',
    gobo: 'Projects a picture like a gobo slide: white lets light through, black blocks it. The top of the image faces Front. Without an image it uses a window pattern.',
    shapes: 'Projects a pattern of circles, squares or diamonds, in a grid or in rings, like a dot gobo or an LED array.'
  };
  const BLEND_HELP = {
    add: 'Adds this light on top, like a second bulb.',
    lighten: 'Keeps whichever is brighter in each direction.',
    replace: 'Paints over the layers below. Strength sets how much.',
    mask: 'Uses this layer as a stencil: light below survives where this layer is bright.',
    subtract: 'Takes this light away from the layers below.'
  };
  function el(tag, attrs, text) { const e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(k => { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  const bottomVisible = () => S.layers.findIndex(L => L.on !== false);
  const isAdj = L => !!L && L.type === 'adjust';
  function selectLayer(i) {
    if (i === S.cur) return;
    syncCur(); S.cur = i; bindCur(); renderLayers(); syncAll(); queue();
  }
  function renderLayers() {
    const list = $('layerList'); list.textContent = '';
    const base = bottomVisible();
    for (let i = S.layers.length - 1; i >= 0; i--) {
      const L = S.layers[i], li = el('li', { class: 'lyr' + (i === S.cur ? ' sel' : '') + (L.on === false ? ' off' : '') });
      const vis = el('input', { type: 'checkbox', 'aria-label': 'Show ' + L.name }); vis.checked = L.on !== false;
      vis.addEventListener('change', () => { pushHist(); L.on = vis.checked; renderLayers(); dirtyMix(); queue(); });
      const pick = el('button', { type: 'button', class: 'lname', 'aria-pressed': String(i === S.cur) });
      pick.appendChild(el('span', { class: 'n' }, L.name));
      const tags = [i === base ? 'Base' : BLENDS[L.blend]];
      if ((L.amount == null ? 1 : L.amount) !== 1) tags.push(Math.round(L.amount * 100) + '%');
      if (L.turn && L.type !== 'adjust') tags.push('turned ' + Math.round(L.turn) + '°');
      if (L.type === 'ies') tags.push('file');
      if (L.type === 'adjust') tags[0] = i === base ? 'Adjustment · nothing below' : 'Adjustment';
      pick.appendChild(el('span', { class: 't' }, tags.join(' · ')));
      pick.addEventListener('click', () => selectLayer(i));
      const grip = gripBtn('Move ' + L.name + '. Drag, or use the up and down arrow keys', d => moveLayer(i, -d));
      const del = el('button', { type: 'button', class: 'btn small icon', 'aria-label': 'Delete ' + L.name, title: 'Delete layer' }, '✕'); del.disabled = S.layers.length === 1;
      del.addEventListener('click', () => deleteLayer(i));
      const row = el('div', { class: 'lrow' });
      row.appendChild(grip); row.appendChild(vis); row.appendChild(pick); row.appendChild(del);
      li.appendChild(row);
      // the layer's modifiers, listed underneath like layer effects
      if (L.mods.length) {
        const fx = el('ul', { class: 'fxlist', 'aria-label': 'Modifiers on ' + L.name });
        L.mods.forEach((m, mi) => {
          const r = el('li', { class: 'fx' + (m.on === false ? ' off' : '') });
          r.appendChild(gripBtn('Move ' + MOD_TYPES[m.type].label + '. Drag, or use the up and down arrow keys', d => moveMod(L, mi, mi + d)));
          const cb = el('input', { type: 'checkbox', 'aria-label': 'Use ' + MOD_TYPES[m.type].label + ' on ' + L.name }); cb.checked = m.on !== false;
          cb.addEventListener('change', () => { pushHist(); m.on = cb.checked; L.rev = revSeq++; if (L === curLayer()) { renderMods(); dirty(); } else dirtyMix(); renderLayers(); });
          const b = el('button', { type: 'button', class: 'fxname', 'data-fx': m.id, title: 'Show the settings of ' + MOD_TYPES[m.type].label }, fxText(m));
          b.addEventListener('click', () => { const i2 = S.layers.indexOf(L); if (i2 !== S.cur) selectLayer(i2); setTimeout(() => focusMod(m.id), 0); });
          r.appendChild(cb); r.appendChild(b); fx.appendChild(r);
        });
        li.appendChild(fx);
        sortable(fx, '.fx', (a, b) => moveMod(L, a, b));
      }
      list.appendChild(li);
    }
    // the list is drawn top layer first, so screen order is reversed
    if (!list.dataset.sortable) { list.dataset.sortable = '1'; sortable(list, '.lyr', (a, b) => { const n = S.layers.length; moveLayer(n - 1 - a, a - b); }); }
    syncLayerProps(); renderMods();
  }
  // ---- drag to reorder (mouse, pen and touch). Rows drag from anywhere that isn't a control;
  // on touch only the grip starts a drag, so the page can still scroll.
  function gripBtn(label, step) {
    const g = el('button', { type: 'button', class: 'grip', 'aria-label': label, title: 'Drag to reorder' });
    g.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault(); const lab = label; step(e.key === 'ArrowUp' ? -1 : 1);
      const again = [...document.querySelectorAll('.grip')].find(x => x.getAttribute('aria-label') === lab); if (again) again.focus();
    });
    return g;
  }
  const DRAG_SKIP = 'input, select, textarea, label.field, .info, .infopop, .btn';
  function sortable(host, sel, onMove) {
    host.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      let item = e.target.closest(sel); while (item && item.parentElement !== host) item = item.parentElement && item.parentElement.closest(sel);
      if (!item) return;
      const onGrip = !!e.target.closest('.grip');
      if (!onGrip && (e.pointerType === 'touch' || e.target.closest(DRAG_SKIP))) return;
      if (host.dataset.dragHead && !onGrip && !e.target.closest(host.dataset.dragHead)) return;
      e.stopPropagation();
      const items = [...host.children].filter(x => x.matches(sel));
      if (items.length < 2) return;
      const from = items.indexOf(item), y0 = e.clientY, sy0 = scrollY;
      const tops = items.map(x => x.getBoundingClientRect().top + sy0), hs = items.map(x => x.offsetHeight);
      const gap = items.length > 1 ? Math.max(0, tops[1] - tops[0] - hs[0]) : 0, shift = hs[from] + gap;
      let started = false, to = from, raf = 0, lastY = y0;
      const update = () => {
        const dy = lastY + scrollY - (y0 + sy0);
        item.style.transform = 'translateY(' + dy + 'px)';
        const mid = tops[from] + dy + hs[from] / 2;
        to = 0; items.forEach((x, k) => { if (k !== from && tops[k] + hs[k] / 2 < mid) to++; });
        items.forEach((x, k) => { if (k === from) return; const o = from < to && k > from && k <= to ? -shift : from > to && k < from && k >= to ? shift : 0; x.style.transform = o ? 'translateY(' + o + 'px)' : ''; });
      };
      const tick = () => { // scroll the page while holding near its top or bottom edge
        raf = 0; if (!started) return;
        const edge = 48, v = lastY < edge ? -(edge - lastY) / 3 : lastY > innerHeight - edge ? (lastY - innerHeight + edge) / 3 : 0;
        if (v) { scrollBy(0, v); update(); raf = requestAnimationFrame(tick); }
      };
      const move = ev => {
        lastY = ev.clientY;
        if (!started) { if (Math.abs(lastY - y0) < 5) return; started = true; host.classList.add('sorting'); item.classList.add('dragging'); try { host.setPointerCapture(ev.pointerId); } catch (_) {} }
        ev.preventDefault(); update(); if (!raf) raf = requestAnimationFrame(tick);
      };
      const end = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
        if (raf) cancelAnimationFrame(raf);
        if (!started) return;
        // swallow the click that follows a drag so the row isn't also selected
        const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; addEventListener('click', stop, true); setTimeout(() => removeEventListener('click', stop, true), 0);
        host.classList.remove('sorting'); items.forEach(x => { x.style.transform = ''; x.classList.remove('dragging'); });
        if (to !== from) onMove(from, to);
      };
      addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', end); addEventListener('pointercancel', end);
    });
  }
  function moveMod(L, a, b) {
    if (b < 0 || b >= L.mods.length || a === b) return;
    pushHist(); L.mods.splice(b, 0, L.mods.splice(a, 1)[0]); L.rev = revSeq++;
    renderLayers(); if (L === curLayer()) dirty(); else dirtyMix();
  }
  // a short summary of a modifier's settings, shown under its layer
  // ---- hover tips: rest the pointer on a feature (its title, map or control) to read about it
  const TIP_EXTRA = { edInfo: ['#edCv'], lookInfo: ['#lookSeg'], floorInfo: ['#floorCv'], wallInfo: ['#wallCv'], polarInfo: ['#polarCv'], photoInfo: ['.readouts'], d3InfoPop: ['#d3Cv'], blendInfo: ['#lyBlend'] };
  function bindTips() {
    document.querySelectorAll('.infopop[id]').forEach(pop => {
      const box = pop.closest('.ipos') || pop.parentElement, id = pop.id;
      const heads = [box.querySelector('h2') || (box.matches('p') ? box : box.querySelector('label'))];
      (TIP_EXTRA[id] || []).forEach(q => heads.push(document.querySelector(q)));
      heads.forEach(h => { if (!h) return; h.dataset.tip = id; const d = h.getAttribute('aria-describedby'); if (!d || d.split(' ').indexOf(id) < 0) h.setAttribute('aria-describedby', ((d || '') + ' ' + id).trim()); });
    });
    const tip = $('tip'); let cur = null, timer = 0, shown = false, ax = 0, ay = 0, muted = null, hideT = 0;
    const big = t => t.offsetHeight > 90;
    const hide = () => { clearTimeout(timer); clearTimeout(hideT); timer = 0; if (shown) { tip.classList.remove('show'); shown = false; } tip.hidden = true; };
    const show = (t, x) => {
      const pop = $(t.dataset.tip); if (!pop) return;
      tip.innerHTML = pop.innerHTML; tip.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      tip.hidden = false; const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
      let left = big(t) ? (x == null ? r.left + 12 : x - 24) : r.left, top = r.bottom + 8;
      if (big(t)) top = r.top - h - 8;            // keep the tip off the map or graph you are looking at
      if (top + h > vh - 8) top = r.top - h - 8;
      if (top < 8) top = big(t) ? Math.min(vh - h - 8, r.top + 8) : r.bottom + 8;
      tip.style.left = Math.max(8, Math.min(vw - w - 8, left)) + 'px'; tip.style.top = Math.max(8, top) + 'px';
      void tip.offsetWidth; tip.classList.add('show'); shown = true;
    };
    const arm = (t, x, y, ms) => { clearTimeout(timer); ax = x; ay = y; timer = setTimeout(() => { timer = 0; if (cur === t) show(t, x); }, ms); };
    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (e.buttons || document.querySelector('.sorting')) { hide(); cur = t; muted = t; return; }
      if (t !== cur) { hide(); cur = t; if (muted && muted !== t) muted = null; if (t && t !== muted) arm(t, e.clientX, e.clientY, big(t) ? 900 : 450); return; }
      if (!t || t === muted) return;
      const moved = Math.hypot(e.clientX - ax, e.clientY - ay);
      if (big(t)) { if (shown && moved > 40) { hide(); arm(t, e.clientX, e.clientY, 900); } else if (!shown && moved > 6) arm(t, e.clientX, e.clientY, 900); }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { hide(); cur = null; });
    document.addEventListener('pointerdown', e => {
      const t = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (e.pointerType === 'touch' && t && !big(t) && !shown) { cur = t; show(t); hideT = setTimeout(hide, 5000); return; }
      hide(); muted = cur;                         // stay quiet until the pointer leaves what you clicked
    }, true);
    addEventListener('scroll', hide, { passive: true, capture: true }); addEventListener('wheel', hide, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { hide(); muted = cur; } });
    document.addEventListener('focusin', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t && e.target.matches(':focus-visible') && !big(t)) { cur = t; arm(t, null, null, 450); } });
    document.addEventListener('focusout', () => { if (!cur || !cur.matches(':hover')) hide(); });
  }
  // gobo slides: any image → square greyscale 128 × 128 (letterboxed in black), stored as "w:h:base64"
  function loadGobo(file, done) {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const R = 128, cv = document.createElement('canvas'); cv.width = cv.height = R; const cx = cv.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, R, R);
      const k = Math.min(R / img.naturalWidth, R / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
      cx.drawImage(img, (R - w) / 2, (R - h) / 2, w, h); URL.revokeObjectURL(url);
      const d = cx.getImageData(0, 0, R, R).data, g = new Uint8Array(R * R);
      for (let i = 0; i < R * R; i++) g[i] = Math.round(0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]);
      let b = ''; for (let i = 0; i < g.length; i++) b += String.fromCharCode(g[i]);
      done(R + ':' + R + ':' + btoa(b));
    };
    img.onerror = () => { URL.revokeObjectURL(url); say('That file could not be read as an image.'); };
    img.src = url;
  }
  function drawGoboThumb(cv, p) {
    const cx = cv.getContext('2d'), R = cv.width, id = cx.createImageData(R, R), m = /^(\d+):(\d+):(.+)$/.exec(p.img || '');
    let w = 128, h = 128, px = null;
    if (m) { w = +m[1]; h = +m[2]; const s = atob(m[3]); px = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) px[i] = s.charCodeAt(i); }
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
      let v; if (px) v = px[Math.floor(y * h / R) * w + Math.floor(x * w / R)]; else { const fx = Math.abs(x + 0.5 - R / 2) * 128 / R, fy = Math.abs(y + 0.5 - R / 2) * 128 / R; v = fx < 5 || fy < 5 || fx > 58 || fy > 58 ? 0 : 255; }
      if (p.invert >= 0.5) v = 255 - v; const o = (y * R + x) * 4; id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
    }
    cx.putImageData(id, 0, 0);
  }
  function fxText(m) {
    const p = Object.assign({}, MOD_TYPES[m.type].defaults, m.p), pc = v => Math.round(v * 100) + '%';
    return m.type === 'noise' ? 'Noise ' + pc(p.amount) + ' · ' + Math.round(p.size) + '°'
      : m.type === 'rays' ? 'Rays ' + Math.round(p.count) + ' × ' + pc(p.depth)
      : m.type === 'rings' ? 'Rings ' + Math.round(p.count) + ' × ' + pc(p.depth)
      : m.type === 'blur' ? 'Blur ' + (+p.vert.toFixed(1)) + '° / ' + (+p.around.toFixed(1)) + '°'
      : m.type === 'cut' ? 'Cut above ' + Math.round(p.angle) + '°'
      : m.type === 'contrast' ? 'Contrast ' + p.gamma.toFixed(2) + '×'
      : m.type === 'transform' ? 'Transform ' + ([p.tilt ? 'tilt ' + (+p.tilt.toFixed(1)) + '°' : '', p.rotate ? 'rotate ' + Math.round(p.rotate) + '°' : '',
          p.wideF !== 1 || p.wideS !== 1 ? (p.wideF === p.wideS ? 'width ' + pc(p.wideF) : 'width ' + pc(p.wideF) + ' × ' + pc(p.wideS)) : '',
          ['', 'mirror L↔R', 'mirror F↔B'][Math.round(p.mirror)]].filter(Boolean).join(' · ') || '(none)')
      : m.type === 'doors' ? 'Barn doors ' + (['front', 'back', 'left', 'right'].filter(k => p[k] < 89.95).map(k => k[0].toUpperCase() + ' ' + Math.round(p[k]) + '°').join(' · ') || 'open')
      : m.type === 'gobo' ? 'Gobo ' + (p.img ? 'image' : 'window') + ' · ' + Math.round(p.size) + '°' + (p.invert >= 0.5 ? ' · inverted' : '')
      : m.type === 'shapes' ? ['Circles', 'Squares', 'Diamonds'][Math.round(p.shape)] + (Math.round(p.layout) ? ' in ' + Math.round(p.count) + ' rings' : ' ' + Math.round(p.count) + ' × ' + Math.round(p.count)) + ' · ' + Math.round(p.spread) + '°'
      : MOD_TYPES[m.type].label;
  }
  function focusMod(id) {
    const box = document.querySelector('#modList .mod[data-mod="' + id + '"]'); if (!box) return;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  }
  function moveLayer(i, d) {
    const j = i + d; if (!d || j < 0 || j >= S.layers.length) return;
    pushHist(); syncCur();
    const sel = S.layers[S.cur];
    S.layers.splice(j, 0, S.layers.splice(i, 1)[0]);
    S.cur = S.layers.indexOf(sel);
    renderLayers(); dirtyMix();
  }
  function deleteLayer(i) {
    if (S.layers.length === 1) return;
    pushHist(); syncCur();
    const gone = S.layers.splice(i, 1)[0]; fieldCache.delete(gone.id);
    S.cur = clamp(S.cur > i ? S.cur - 1 : S.cur, 0, S.layers.length - 1); bindCur();
    renderLayers(); syncAll(); dirtyMix();
    say('Deleted the layer "' + gone.name + '". Undo brings it back.');
  }
  function addLayer(L) {
    pushHist(); syncCur();
    S.layers.splice(S.cur + 1, 0, L); S.cur = S.cur + 1; bindCur();
    renderLayers(); syncAll(); dirty();
  }
  function syncLayerProps() {
    const L = curLayer(); if (!L) return;
    const base = S.cur === bottomVisible();
    if (document.activeElement !== $('lyName')) $('lyName').value = L.name;
    $('lyBlend').value = L.blend; $('lyBlend').disabled = base || isAdj(L);
    $('lyBlend').closest('.field').hidden = isAdj(L); $('lyTurn').closest('.field').hidden = isAdj(L);
    $('lyAmt').closest('.field').firstElementChild.textContent = isAdj(L) ? 'Mix' : 'Strength';
    $('lyBlendHint').textContent = base ? 'The bottom visible layer is the base, so its blend mode has no effect.' : BLEND_HELP[L.blend];
    $('lyAmt').value = L.amount; $('lyAmtVal').textContent = Math.round(L.amount * 100) + '%';
    $('lyTurn').value = L.turn; $('lyTurnVal').textContent = Math.round(L.turn) + '°';
    $('lySrc').textContent = isAdj(L) ? 'Adjustment layer: no light of its own. Its modifiers change everything below it; Mix fades the effect.' : L.type === 'ies' ? 'Imported file, every direction kept. The curve editor shows it read-only.' : 'Curve layer, edited in the Light curve panel (' + MODES[L.mode].label + ').';
    $('lyToCurve').hidden = L.type !== 'ies';
    $('edLayerName').textContent = S.layers.length > 1 ? L.name : '';
  }
  function renderMods() {
    const L = curLayer(), host = $('modList'); host.textContent = '';
    if (!L.mods.length) host.appendChild(el('p', { class: 'hint' }, 'None yet.'));
    L.mods.forEach((m, i) => {
      const box = el('div', { class: 'mod' + (m.on === false ? ' off' : ''), 'data-mod': m.id }), head = el('div', { class: 'mhead' });
      const on = el('input', { type: 'checkbox', 'aria-label': 'Use ' + MOD_TYPES[m.type].label }); on.checked = m.on !== false;
      on.addEventListener('change', () => { pushHist(); m.on = on.checked; renderMods(); renderLayers(); dirty(); });
      head.className = 'mhead ipos';
      const pop = el('div', { class: 'infopop', id: 'modinfo-' + m.id }); pop.hidden = true; pop.appendChild(el('p', null, MOD_HELP[m.type]));
      head.appendChild(gripBtn('Move ' + MOD_TYPES[m.type].label + '. Drag, or use the up and down arrow keys', d => moveMod(L, i, i + d))); head.appendChild(on); head.appendChild(el('strong', { 'data-tip': 'modinfo-' + m.id, 'aria-describedby': 'modinfo-' + m.id }, MOD_TYPES[m.type].label)); head.appendChild(el('span', { class: 'spacer' })); head.appendChild(pop);
      const del = el('button', { type: 'button', class: 'btn small icon', 'aria-label': 'Remove ' + MOD_TYPES[m.type].label, title: 'Remove' }, '✕');
      del.addEventListener('click', () => { pushHist(); L.mods.splice(i, 1); renderMods(); renderLayers(); dirty(); });
      head.appendChild(del);
      box.appendChild(head);
      const liveFx = () => { const f = document.querySelector('#layerList [data-fx="' + m.id + '"]'); if (f) f.textContent = fxText(m); };
      MOD_FIELDS[m.type].forEach(([key, label, mn, mx, step, fmt, opts]) => {
        if (opts) { // a small switch instead of a slider
          const wrap = el('div', { class: 'field' }), seg = el('div', { class: 'seg', role: 'group', 'aria-label': label });
          const v0 = Math.round(m.p[key] == null ? MOD_TYPES[m.type].defaults[key] : m.p[key]);
          opts.forEach((o, k) => {
            const b = el('button', { type: 'button', 'aria-pressed': String(k === v0) }, o);
            b.addEventListener('click', () => { pushHist(); m.p[key] = k; seg.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === k))); liveFx(); dirty(); if (m.type === 'gobo') drawGoboThumb(box.querySelector('.gthumb'), m.p); });
            seg.appendChild(b);
          });
          wrap.appendChild(el('span', null, label)); wrap.appendChild(seg); box.appendChild(wrap); return;
        }
        const id = 'mod-' + m.id + '-' + key, wrap = el('label', { class: 'field', for: id });
        const line = el('span', { class: 'line' }), inp = el('input', { type: 'range', id, min: mn, max: mx, step }), out = el('output');
        const v0 = m.p[key] == null ? MOD_TYPES[m.type].defaults[key] : m.p[key];
        inp.value = v0; out.textContent = fmt(v0);
        inp.addEventListener('input', () => { pushHistCo('mod' + m.id + key); m.p[key] = parseFloat(inp.value); out.textContent = fmt(m.p[key]); liveFx(); dirty(); });
        wrap.appendChild(el('span', null, label)); line.appendChild(inp); line.appendChild(out); wrap.appendChild(line); box.appendChild(wrap);
      });
      if (m.type === 'gobo') {
        const row = el('div', { class: 'row gobo' }), th = el('canvas', { class: 'gthumb', width: 48, height: 48, 'aria-hidden': 'true' });
        const pick = el('button', { type: 'button', class: 'btn small' }, m.p.img ? 'Change image…' : 'Load image…');
        const clr = el('button', { type: 'button', class: 'btn small' }, 'Use window'); clr.hidden = !m.p.img;
        const fin = el('input', { type: 'file', accept: 'image/*', hidden: '' });
        pick.addEventListener('click', () => fin.click());
        fin.addEventListener('change', () => { const f = fin.files && fin.files[0]; if (f) loadGobo(f, s => { pushHist(); m.p.img = s; renderLayers(); dirty(); say('Loaded "' + f.name + '" as the gobo slide.'); }); });
        clr.addEventListener('click', () => { pushHist(); m.p.img = ''; renderLayers(); dirty(); });
        drawGoboThumb(th, m.p);
        row.appendChild(th); row.appendChild(pick); row.appendChild(clr); row.appendChild(fin); box.appendChild(row);
      }
      if (m.type === 'noise') {
        const b = el('button', { type: 'button', class: 'btn small' }, 'New random pattern');
        b.addEventListener('click', () => { pushHist(); m.p.seed = 1 + Math.floor(Math.random() * 99); renderMods(); dirty(); });
        box.appendChild(b);
      }
      host.appendChild(box);
    });
    host.dataset.dragHead = '.mhead';
    if (!host.dataset.sortable) { host.dataset.sortable = '1'; sortable(host, '.mod', (a, b) => moveMod(curLayer(), a, b)); }
  }
  function bindLayers() {
    const add = $('layerAdd'), pickC = $('layerCurve');
    PRESETS.forEach(p => pickC.appendChild(el('option', { value: 'p:' + p.id }, p.name)));
    const hidePick = () => { pickC.hidden = true; pickC.value = ''; };
    pickC.addEventListener('change', () => { const v = pickC.value; hidePick(); if (v) addFrom(v); });
    pickC.addEventListener('blur', () => setTimeout(() => { if (!pickC.value && document.activeElement !== pickC) hidePick(); }, 150));
    pickC.addEventListener('keydown', e => { if (e.key === 'Escape') { hidePick(); add.focus(); } });
    add.addEventListener('change', () => {
      const v = add.value; add.value = '';
      if (v === 'curve') { pickC.hidden = false; pickC.focus(); try { pickC.showPicker(); } catch (e) { /* not supported: the list is focused */ } return; }
      addFrom(v);
    });
    function addFrom(v) {
      if (v === 'dup') { const c = cloneLayer((syncCur(), curLayer()), true); c.name = (c.name + ' copy').slice(0, 40); addLayer(c); say('Duplicated the layer. Change its blend, strength or turn to layer the two.'); }
      else if (v === 'file') { $('fileIn').click(); }
      else if (v.startsWith('p:')) {
        const p = PRESETS.find(x => x.id === v.slice(2)); if (!p) return;
        const L = newLayer({ name: p.name, mode: p.mode, planes: presetPlanes(p) });
        const u = usedPlanes(MODES[p.mode].map); if (u.length > 1) [0, 180].forEach(g => { if (poleSpread(L.planes, u, g) > 0.002) matchPole(L.planes, u, g, 12); });
        addLayer(L); say('Added ' + p.name + ' as a new layer on top, added to the light below.');
      }
      else if (v === 'adjust') {
        const n = S.layers.filter(isAdj).length + 1;
        addLayer(newLayer({ name: 'Adjustment ' + n, type: 'adjust' }));
        say('Added an adjustment layer. Add modifiers to it to change every layer below.');
      }
    }
    const modAdd = $('modAdd');
    Object.keys(MOD_TYPES).forEach(k => modAdd.appendChild(el('option', { value: k }, MOD_TYPES[k].label)));
    modAdd.addEventListener('change', () => {
      const k = modAdd.value; modAdd.value = ''; if (!MOD_TYPES[k]) return;
      pushHist(); curLayer().mods.push({ id: modSeq++, type: k, on: true, p: Object.assign({}, MOD_TYPES[k].defaults) });
      renderMods(); renderLayers(); dirty(); say('Added ' + MOD_TYPES[k].label + ' to "' + curLayer().name + '".');
    });
    $('lyName').addEventListener('input', e => { curLayer().name = e.target.value.slice(0, 40) || 'Layer'; renderLayersSoon(); saveSoon(); });
    Object.keys(BLENDS).forEach(k => $('lyBlend').appendChild(el('option', { value: k }, BLENDS[k])));
    $('lyBlend').addEventListener('change', e => { pushHist(); curLayer().blend = e.target.value; renderLayers(); dirtyMix(); });
    $('lyAmt').addEventListener('input', e => { pushHistCo('amt' + curLayer().id); curLayer().amount = parseFloat(e.target.value); $('lyAmtVal').textContent = Math.round(curLayer().amount * 100) + '%'; renderLayersSoon(); dirtyMix(); });
    $('lyAmt').addEventListener('dblclick', () => { pushHist(); curLayer().amount = 1; syncLayerProps(); renderLayersSoon(); dirtyMix(); });
    $('lyTurn').addEventListener('input', e => { pushHistCo('turn' + curLayer().id); curLayer().turn = parseFloat(e.target.value); $('lyTurnVal').textContent = Math.round(curLayer().turn) + '°'; renderLayersSoon(); dirty(); });
    $('lyTurn').addEventListener('dblclick', () => { pushHist(); curLayer().turn = 0; syncLayerProps(); renderLayersSoon(); dirty(); });
    $('lyToCurve').addEventListener('click', () => {
      pushHist(); const L = curLayer(); L.type = 'curve'; L.grid = null; bindCur(); renderLayers(); syncAll(); dirty();
      say('"' + L.name + '" is now a curve layer: its front, left, back and right were kept and the directions between them are blended.');
    });
  }
  let rlT = 0;
  function renderLayersSoon() { clearTimeout(rlT); rlT = setTimeout(() => { const f = document.activeElement; const keep = f && f.id; renderLayers(); if (keep && $(keep)) $(keep).focus(); }, 250); }

  /* ---------- canvas helpers ---------- */
  function setupCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(10, cv.clientWidth), h = Math.max(10, cv.clientHeight);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  const MONO = '10.5px "JetBrains Mono", ui-monospace, monospace';
  function labelBox(ctx, text, x, y, align, fg, bg) {
    const tw = ctx.measureText(text).width, pad = 4;
    let x0 = align === 'right' ? x - tw - pad * 2 : align === 'center' ? x - tw / 2 - pad : x;
    ctx.fillStyle = bg; ctx.fillRect(x0, y - 8, tw + pad * 2, 16);
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + pad, y + 0.5);
  }

  /* ---------- editor geometry ---------- */
  const V = { lo: 0, hi: 180, L: 52, T: 12, pw: 100, ph: 100 };
  const yFwd = v => (S.ys === 'log' ? (v <= 1e-3 ? 0 : (Math.log10(v) + 3) / 3) : v);
  const yInv = t => { t = clamp(t, 0, 1); return S.ys === 'log' ? (t <= 0.004 ? 0 : Math.pow(10, 3 * t - 3)) : t; };
  const X = d => V.L + (d - V.lo) / (V.hi - V.lo) * V.pw;
  const Y = v => V.T + (1 - yFwd(v)) * V.ph;
  const Dx = px => clamp(V.lo + (px - V.L) / V.pw * (V.hi - V.lo), 0, 180);
  const Vy = py => yInv(1 - (py - V.T) / V.ph);
  let frozenRange = null;
  function viewRange(st) {
    if (frozenRange) return frozenRange;
    if (S.xr === '180') return [0, 180];
    if (S.xr === '90') return [0, 90];
    const thr = Math.max(st.rmax, 1e-6) * 0.004, arrs = used().map(k => S.planes[k]);
    if ($('genDet').open) arrs.push(genPreview());
    let first = 181, last = -1;
    for (const a of arrs) for (let i = 0; i < N; i++) if (a[i] > thr) { if (i < first) first = i; if (i > last) last = i; }
    if (last < 0) return [0, 90];
    let lo = Math.max(0, Math.floor((first - 20) / 15) * 15), hi = Math.min(180, Math.ceil((last + 20) / 15) * 15);
    if (lo <= 15) lo = 0;
    if (hi >= 165) hi = 180;
    if (hi - lo < 45) { hi = Math.min(180, lo + 45); lo = Math.max(0, hi - 45); }
    return [lo, hi];
  }
  let hover = null;   // {px, py}

  function drawEditor(st) {
    const cv = $('edCv'), { ctx, w, h } = setupCanvas(cv);
    const narrow = w < 480;
    V.L = narrow ? 40 : 52; V.T = 14; V.pw = w - V.L - 14; V.ph = h - V.T - 34;
    [V.lo, V.hi] = viewRange(st);
    const { L, T, pw, ph } = V, span = V.hi - V.lo;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = css('--plot'); ctx.fillRect(0, 0, w, h);
    if (V.hi > 90) { const x0 = X(Math.max(90, V.lo)); ctx.globalAlpha = 0.5; ctx.fillStyle = css('--grid'); ctx.fillRect(x0, T, L + pw - x0, ph); ctx.globalAlpha = 1; }
    ctx.font = MONO; ctx.lineWidth = 1;
    // y grid
    const yt = S.ys === 'log' ? [[0.001, '0.1%'], [0.01, '1%'], [0.1, '10%'], [1, '100%']] : [[0, '0%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']];
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yt.forEach(([v, lab], i) => {
      const y = S.ys === 'log' && v === 0.001 ? T + ph : Y(v);
      ctx.strokeStyle = i === 0 ? css('--grid-strong') : css('--grid');
      ctx.beginPath(); ctx.moveTo(L, Math.round(y) + 0.5); ctx.lineTo(L + pw, Math.round(y) + 0.5); ctx.stroke();
      ctx.fillStyle = css('--tick'); ctx.fillText(lab, L - 6, y);
    });
    // x grid with plain-language labels at the poles and horizon
    const step = span <= 60 ? 10 : span <= 120 ? 15 : 30;
    ctx.textBaseline = 'top';
    for (let d = Math.ceil(V.lo / step) * step; d <= V.hi + 1e-6; d += step) {
      const x = X(d);
      ctx.strokeStyle = d === 90 ? css('--grid-strong') : css('--grid');
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, T); ctx.lineTo(Math.round(x) + 0.5, T + ph); ctx.stroke();
      const lab = d === 0 ? (narrow ? '0°' : '0° down') : d === 90 ? (narrow ? '90°' : '90° horizon') : d === 180 ? (narrow ? '180°' : '180° up') : d + '°';
      ctx.fillStyle = css('--tick');
      ctx.textAlign = x - L < 24 ? 'left' : L + pw - x < 24 ? 'right' : 'center';
      ctx.fillText(lab, x, T + ph + 8);
    }
    const qa = MODES[S.mode].map.indexOf(S.active);
    // beam (50%) and field (10%) markers for the active plane
    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 4, pw, ph + 8); ctx.clip();
    if (st.rmax > 0) {
      [[0.5, st.h50[qa], 'beam'], [0.1, st.h10[qa], 'field']].forEach(([f, ang, nm], i) => {
        const yy = Y(f * st.rmax);
        ctx.setLineDash([2, 4]); ctx.strokeStyle = css('--grid-strong');
        ctx.beginPath(); ctx.moveTo(L, Math.round(yy) + 0.5); ctx.lineTo(L + pw, Math.round(yy) + 0.5); ctx.stroke();
        if (ang > 0.4) {
          const d = st.up ? 180 - ang : ang, x = X(d);
          if (d >= V.lo && d <= V.hi) {
            ctx.setLineDash([5, 4]); ctx.strokeStyle = css('--tick');
            ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, T); ctx.lineTo(Math.round(x) + 0.5, T + ph); ctx.stroke();
            ctx.setLineDash([]); ctx.font = MONO;
            const right = x < L + pw - (narrow ? 60 : 110);
            labelBox(ctx, (narrow ? (nm === 'beam' ? '50% ' : '10% ') : nm + ' edge ') + Math.round(ang) + '°', right ? x + 4 : x - 4, T + 10 + i * 18, right ? 'left' : 'right', css('--tick'), css('--plot'));
          }
        }
      });
    }
    ctx.setLineDash([]);
    const trace = arr => { ctx.beginPath(); const a = Math.max(0, Math.floor(V.lo)), b = Math.min(180, Math.ceil(V.hi)); for (let i = a; i <= b; i++) { const x = X(i), y = Y(arr[i]); if (i === a) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
    ctx.lineJoin = 'round';
    MODES[S.mode].tabs.forEach((_, k) => {
      if (k === S.active) return;
      trace(S.planes[k]); ctx.strokeStyle = css(PCOL[k]); ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    });
    if ($('genDet').open && editable()) { trace(genPreview()); ctx.setLineDash([6, 4]); ctx.strokeStyle = css('--ghost'); ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]); }
    // the combined result of every layer in this direction, scaled so its peak is 100%
    const showResult = S.layers.filter(x => x.on !== false).length > 1 || curLayer().mods.some(m => m.on !== false) || curLayer().on === false;
    $('edLegend').hidden = !showResult;
    if (showResult) {
      const qd = Math.max(0, MODES[S.mode].map.indexOf(S.active)), sl = fieldSlice(comp(), qd * 90 + (curLayer().turn || 0)), m = fieldMax(comp()) || 1;
      for (let i = 0; i < N; i++) sl[i] /= m;
      trace(sl); ctx.setLineDash([2, 3]); ctx.strokeStyle = css('--ink-2'); ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
    }
    const act = S.planes[S.active], col = css(PCOL[S.active]);
    trace(act); ctx.lineTo(X(Math.min(180, Math.ceil(V.hi))), T + ph); ctx.lineTo(X(Math.max(0, Math.floor(V.lo))), T + ph); ctx.closePath();
    ctx.globalAlpha = 0.13; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
    if (!isAdj(curLayer())) { trace(act); ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.stroke(); }   // an adjustment has no curve of its own
    ctx.restore();
    if (!editable()) {
      ctx.font = '600 12.5px ' + css('--f-body');
      labelBox(ctx, isAdj(curLayer()) ? 'Adjustment layer: shape it with modifiers in Layers' : 'Imported file: Edit as curve in Layers to reshape it', L + pw / 2, T + ph / 2, 'center', css('--ink'), css('--surface-2'));
    }

    if (S.tool === 'points' && editable()) {
      const ks = getKnots(S.active);
      ks.forEach((p, i) => {
        if (p[0] < V.lo - 0.01 || p[0] > V.hi + 0.01) return;
        const x = X(p[0]), y = Y(p[1]), sel = i === S.sel, end = i === 0 || i === ks.length - 1;
        ctx.beginPath();
        if (end) ctx.rect(x - (sel ? 6 : 4.5), y - (sel ? 6 : 4.5), sel ? 12 : 9, sel ? 12 : 9); else ctx.arc(x, y, sel ? 6.5 : 5, 0, 6.2832);
        ctx.fillStyle = sel ? css('--plot') : col; ctx.fill();
        ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? col : css('--plot'); ctx.stroke();
      });
    } else if (hover) {
      const d = Dx(hover.px), bx0 = X(clamp(d - S.brush, V.lo, V.hi)), bx1 = X(clamp(d + S.brush, V.lo, V.hi));
      ctx.globalAlpha = 0.08; ctx.fillStyle = css('--ink'); ctx.fillRect(bx0, T, bx1 - bx0, ph); ctx.globalAlpha = 1;
    }
    // cursor readout
    if (hover && hover.px >= L - 4 && hover.px <= L + pw + 4) {
      const showKnot = S.tool === 'points' && S.sel >= 0 && drag && drag.kind === 'knot';
      const ks = S.tool === 'points' ? getKnots(S.active) : null;
      const d = showKnot ? ks[S.sel][0] : Math.round(Dx(hover.px)), v = showKnot ? ks[S.sel][1] : act[d];
      const x = X(d), y = Y(v);
      ctx.strokeStyle = css('--tick'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, T); ctx.lineTo(Math.round(x) + 0.5, T + ph); ctx.stroke(); ctx.setLineDash([]);
      if (!showKnot) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.2832); ctx.fill(); }
      const txt = d + '°  ' + fmtPct(v) + '  ' + fmtShort(v * st.cdScale) + ' cd';
      ctx.font = MONO;
      const tw = ctx.measureText(txt).width + 12;
      let tx = x + 12, ty = y - 26;
      if (tx + tw > w - 4) tx = x - 12 - tw;
      if (ty < 4) ty = y + 12;
      ctx.fillStyle = css('--ink'); ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, ty, tw, 20, 5) : ctx.rect(tx, ty, tw, 20); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = css('--plot'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, tx + 6, ty + 10.5);
    }
  }

  /* ---------- inspector, hints, warnings ---------- */
  let inspFocus = false;
  function syncInspector(st) {
    const pts = S.tool === 'points';
    const ks = pts ? getKnots(S.active) : null;
    if (pts && S.sel >= ks.length) S.sel = ks.length - 1;
    const has = pts && S.sel >= 0;
    $('inspPts').hidden = !has;
    $('toolHint').textContent = has ? HINTS.pointsSel : HINTS[S.tool];
    if (!has) return;
    const p = ks[S.sel], end = S.sel === 0 || S.sel === ks.length - 1;
    $('kIdx').textContent = 'Point ' + (S.sel + 1) + ' of ' + ks.length;
    $('kPrev').disabled = S.sel === 0; $('kNext').disabled = S.sel === ks.length - 1;
    const dEl = $('kDeg'), vEl = $('kVal');
    dEl.disabled = end; dEl.title = end ? 'The end points stay at 0° and 180°' : '';
    if (document.activeElement !== dEl) dEl.value = String(+p[0].toFixed(1));
    if (document.activeElement !== vEl) vEl.value = String(+(p[1] * 100).toFixed(p[1] < 0.1 ? 2 : 1));
    $('kCd').textContent = '= ' + fmtNum(p[1] * st.cdScale, 1) + ' cd';
    $('kDel').disabled = end; $('kDel').title = end ? 'End points cannot be removed, but you can set them to 0%' : '';
  }
  let warnPole = 0;
  function syncWarn(st) {
    const u = used(), el = $('warn');
    if (u.length < 2 || !(st.rmax > 0)) { el.hidden = true; return; }
    const s0 = poleSpread(S.planes, u, 0) / st.rmax, s1 = poleSpread(S.planes, u, 180) / st.rmax;
    if (s0 > 0.02) { warnPole = 0; $('warnText').textContent = 'The directions disagree straight down (0°) by ' + Math.round(s0 * 100) + '% of peak. A real light has one brightness there, and Unreal shows a seam in the middle of the beam.'; }
    else if (s1 > 0.02) { warnPole = 180; $('warnText').textContent = 'The directions disagree straight up (180°) by ' + Math.round(s1 * 100) + '% of peak, which shows as a seam above the light.'; }
    else { el.hidden = true; return; }
    $('warnFix').textContent = 'Make them match at ' + warnPole + '°';
    el.hidden = false;
  }

  /* ---------- editor interaction ---------- */
  let drag = null;
  const isTouch = e => e.pointerType === 'touch' || e.pointerType === 'pen';
  function localXY(e) { const r = $('edCv').getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }
  function snapVal(py) {
    if (Y(0) - py < 7) return 0;
    if (py - Y(1) < 7) return 1;
    return +Vy(py).toFixed(4);
  }
  function hitKnot(px, py, rad) {
    const ks = getKnots(S.active); let best = -1, bd = rad * rad;
    ks.forEach((p, i) => {
      if (p[0] < V.lo - 0.01 || p[0] > V.hi + 0.01) return;
      const dx = X(p[0]) - px, dy = Y(p[1]) - py, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = i; }
    });
    return best;
  }
  function removeKnot(i) {
    const ks = getKnots(S.active);
    if (i <= 0 || i >= ks.length - 1) { say('The end points at 0° and 180° stay in place. Drag them to 0% instead.'); return; }
    pushHist(); ks.splice(i, 1); S.sel = Math.min(i, ks.length - 2); commitKnots(S.active); dirty();
  }
  function moveKnot(i, deg, val) {
    const ks = getKnots(S.active);
    if (i === 0) deg = 0; else if (i === ks.length - 1) deg = 180; else deg = clamp(deg, ks[i - 1][0] + 1, ks[i + 1][0] - 1);
    ks[i] = [deg, clamp(val, 0, 1)]; commitKnots(S.active); dirty();
  }
  function brushStroke(a, b) {
    const arr = S.planes[S.active];
    if (S.tool === 'push') {
      const dt = yFwd(clamp(Vy(b.py), 0, 1)) - drag.t0;
      for (let i = 0; i < N; i++) { const wgt = Math.abs(i - drag.c0) >= S.brush ? 0 : 0.5 * (1 + Math.cos(Math.PI * (i - drag.c0) / S.brush)); if (wgt) arr[i] = clamp(yInv(yFwd(drag.base[i]) + dt * wgt), 0, 1); else arr[i] = drag.base[i]; }
      return;
    }
    const da = Dx(a.px), db = Dx(b.px);
    const va = drag.flat != null ? drag.flat : Vy(a.py), vb = drag.flat != null ? drag.flat : Vy(b.py);
    const n = Math.max(1, Math.ceil(Math.abs(db - da) * 2));
    for (let s = 0; s <= n; s++) {
      const t = s / n, d = da + (db - da) * t, v = va + (vb - va) * t;
      if (S.tool === 'smooth') sculptSmooth(arr, d, S.brush, 0.9 * S.smoothStr * S.smoothStr); else sculptDraw(arr, d, v, S.brush);
    }
  }
  function bindEditor() {
    const cv = $('edCv');
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!guardEdit()) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (document.activeElement !== cv) cv.focus({ preventScroll: true });
      const p = localXY(e); hover = p;
      frozenRange = [V.lo, V.hi];
      if (S.tool === 'points') {
        const ks = getKnots(S.active);
        let i = hitKnot(p.px, p.py, isTouch(e) ? 22 : 11), pending = snap();
        if (i < 0) {
          const deg = Math.round(Dx(p.px)), ex = ks.findIndex(k => Math.abs(k[0] - deg) < 0.5);
          if (ex >= 0) i = ex;
          else {
            const cv0 = S.planes[S.active][deg], near = Math.abs(Y(cv0) - p.py) <= (isTouch(e) ? 22 : 14);
            pushHist(); pending = null;
            ks.push([deg, near ? cv0 : snapVal(p.py)]); ks.sort((a, b) => a[0] - b[0]);
            i = ks.findIndex(k => k[0] === deg); commitKnots(S.active); dirty();
          }
        }
        S.sel = i;
        drag = { kind: 'knot', idx: i, sx: p.px, sy: p.py, d0: ks[i][0], v0: ks[i][1], pending, moved: false };
        queue('ed');
      } else {
        pushHist();
        const v0 = Vy(p.py);
        drag = { kind: 'brush', last: p, c0: Dx(p.px), t0: yFwd(v0), flat: e.shiftKey ? v0 : null, base: S.planes[S.active].slice() };
        brushStroke(p, p); invalidate(S.active); dirty();
      }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = localXY(e); hover = p;
      if (!drag) {
        if (S.tool === 'points') cv.style.cursor = hitKnot(p.px, p.py, isTouch(e) ? 22 : 11) >= 0 ? 'grab' : 'copy';
        queue('ed'); return;
      }
      if (drag.kind === 'knot') {
        if (!drag.moved && Math.hypot(p.px - drag.sx, p.py - drag.sy) < 3) return;
        if (!drag.moved) { drag.moved = true; if (drag.pending) { pushSnap(drag.pending); coKey = null; drag.pending = null; } cv.style.cursor = 'grabbing'; }
        let deg = Math.round(Dx(p.px)), val = snapVal(p.py);
        if (e.shiftKey) { if (Math.abs(p.px - drag.sx) > Math.abs(p.py - drag.sy)) val = drag.v0; else deg = drag.d0; }
        moveKnot(drag.idx, deg, val);
      } else { brushStroke(drag.last, p); drag.last = p; dirty(); }
    });
    const end = () => { if (drag) { drag = null; frozenRange = null; if (S.tool === 'points') $('edCv').style.cursor = 'grab'; queue('ed'); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!drag) { hover = null; queue('ed'); } });
    const del = e => {
      if (S.tool !== 'points' || !editable()) return false;
      const p = localXY(e), i = hitKnot(p.px, p.py, 14);
      if (i < 0) return false;
      removeKnot(i); return true;
    };
    cv.addEventListener('dblclick', e => { del(e); });
    cv.addEventListener('contextmenu', e => { if (S.tool === 'points') { e.preventDefault(); del(e); } });
    cv.addEventListener('keydown', e => {
      if (!editable()) return;
      if (S.tool !== 'points') {
        if (e.key === '[' || e.key === ']') { S.brush = clamp(S.brush + (e.key === ']' ? 1 : -1), 1, 30); $('brush').value = S.brush; $('brushVal').textContent = S.brush + '°'; queue('ed'); e.preventDefault(); }
        return;
      }
      const ks = getKnots(S.active), big = e.shiftKey;
      if (e.key === ',' || e.key === '.') { S.sel = S.sel < 0 ? 0 : clamp(S.sel + (e.key === '.' ? 1 : -1), 0, ks.length - 1); queue('ed'); e.preventDefault(); return; }
      if (e.key === 'Escape') { S.sel = -1; queue('ed'); return; }
      if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        if (S.sel < 0) { S.sel = 0; queue('ed'); return; }
        const pt = ks[S.sel];
        pushHistCo('nudge' + S.active + ':' + S.sel);
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') moveKnot(S.sel, pt[0] + (e.key === 'ArrowRight' ? 1 : -1) * (big ? 5 : 1), pt[1]);
        else { const dt = (S.ys === 'log' ? 1 / 90 : 0.01) * (big ? 5 : 1) * (e.key === 'ArrowUp' ? 1 : -1); moveKnot(S.sel, pt[0], yInv(yFwd(pt[1]) + dt)); }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel >= 0) { e.preventDefault(); removeKnot(S.sel); }
    });
    // inspector
    $('kPrev').addEventListener('click', () => { S.sel = Math.max(0, S.sel - 1); queue('ed'); });
    $('kNext').addEventListener('click', () => { S.sel = Math.min(getKnots(S.active).length - 1, S.sel + 1); queue('ed'); });
    $('kDel').addEventListener('click', () => { if (guardEdit()) removeKnot(S.sel); });
    $('kDeg').addEventListener('input', e => {
      const v = parseFloat(e.target.value); if (!isFinite(v) || S.sel < 0 || !editable()) return;
      pushHistCo('deg' + S.active + ':' + S.sel); moveKnot(S.sel, v, getKnots(S.active)[S.sel][1]);
    });
    $('kVal').addEventListener('input', e => {
      const v = parseFloat(e.target.value); if (!isFinite(v) || S.sel < 0 || !editable()) return;
      pushHistCo('val' + S.active + ':' + S.sel); moveKnot(S.sel, getKnots(S.active)[S.sel][0], clamp(v, 0, 100) / 100);
    });
    ['kDeg', 'kVal'].forEach(id => $(id).addEventListener('change', () => queue('ed')));
  }

  /* ---------- polar ---------- */
  let PG = null;
  function drawPolar(st) {
    const cv = $('polarCv'), F = comp(), sl = [0, 1, 2, 3].map(q => fieldSlice(F, q * 90));
    const rmax = st.rmax || 1;
    let upMax = 0; for (let c = 0; c < NC; c++) for (let i = 95; i < N; i++) upMax = Math.max(upMax, F[c * N + i]);
    const half = upMax / rmax < 0.005;
    const ar = half ? '1.55 / 1' : '1 / 1';
    if (cv.style.aspectRatio !== ar) cv.style.aspectRatio = ar;
    const { ctx, w, h } = setupCanvas(cv);
    const cx = w / 2, cy = half ? 22 : h / 2, R = half ? Math.min(w / 2 - 34, h - cy - 24) : Math.min(w, h) / 2 - 26;
    PG = { cx, cy, R, half, rmax };
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = css('--plot'); ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1; ctx.font = MONO;
    const a1 = half ? Math.PI : 2 * Math.PI;
    for (const f of [0.25, 0.5, 0.75, 1]) {
      ctx.strokeStyle = f === 1 ? css('--grid-strong') : css('--grid');
      ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, a1); ctx.stroke();
    }
    ctx.fillStyle = css('--tick'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const spoke = half ? 15 : 30;
    for (let a = 0; a <= (half ? 90 : 180); a += spoke) {
      const s = Math.sin(a * DEG), c = Math.cos(a * DEG);
      ctx.strokeStyle = a === 90 ? css('--grid-strong') : css('--grid');
      ctx.beginPath(); ctx.moveTo(cx - R * s, cy + R * c); ctx.lineTo(cx + R * s, cy + R * c); ctx.stroke();
      if (half && a % 30) continue;
      ctx.fillStyle = css('--tick');
      if (a === 0 || a === 180) ctx.fillText(a + '°', cx, cy + (R + 13) * c);
      else { ctx.fillText(a + '°', cx + (R + 16) * s, cy + (R + 14) * c); ctx.fillText(a + '°', cx - (R + 16) * s, cy + (R + 14) * c); }
    }
    const same = (p, q) => { for (let i = 0; i < N; i++) if (Math.abs(p[i] - q[i]) > 0.003 * rmax) return false; return true; };
    const round = same(sl[0], sl[1]) && same(sl[0], sl[2]) && same(sl[0], sl[3]), sidesAsFB = same(sl[1], sl[0]) && same(sl[3], sl[2]);
    const halves = [[0, 1, false], [2, -1, false]];
    if (!sidesAsFB) halves.push([3, 1, true], [1, -1, true]);
    ctx.lineJoin = 'round';
    halves.forEach(([q, side, dashed]) => {
      const arr = sl[q], col = css(PCOL[q]);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      for (let g = 0; g < N; g++) { const r = arr[g] / rmax * R; ctx.lineTo(cx + side * r * Math.sin(g * DEG), cy + r * Math.cos(g * DEG)); }
      ctx.closePath();
      ctx.globalAlpha = dashed ? 0.05 : 0.1; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
      ctx.setLineDash(dashed ? [5, 3] : []); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    });
    for (const f of [0.5, 1]) {
      const a = (half ? 50 : 135) * DEG, lab = fmtShort(f * st.peakCd) + (f === 1 ? ' cd' : '');
      labelBox(ctx, lab, cx - R * f * Math.sin(a) + 2, cy + R * f * Math.cos(a), 'left', css('--tick'), css('--plot'));
    }
    const lg = $('polarLegend'); lg.textContent = '';
    const item = (q, text) => { const sp = document.createElement('span'); const d = document.createElement('i'); d.className = 'dot'; d.style.setProperty('--dot', 'var(' + PCOL[q] + ')'); sp.appendChild(d); sp.appendChild(document.createTextNode(text)); lg.appendChild(sp); };
    if (round) item(0, 'All around');
    else {
      item(0, 'Front (solid)'); if (!same(sl[0], sl[2])) item(2, 'Back (solid)');
      if (!sidesAsFB) { if (same(sl[1], sl[3])) item(3, 'Sides (dashed)'); else { item(3, 'Right (dashed)'); item(1, 'Left (dashed)'); } }
    }
  }
  function polarHover(e) {
    if (!PG) return;
    const r = $('polarCv').getBoundingClientRect(), dx = e.clientX - r.left - PG.cx, dy = e.clientY - r.top - PG.cy;
    const g = Math.round(Math.atan2(Math.abs(dx), dy) / DEG);
    if (Math.hypot(dx, dy) > PG.R * 1.08 || (PG.half && g > 90)) { $('polarHover').textContent = ' '; return; }
    const st = cstats(), F = comp(), right = dx >= 0;
    const qa = right ? 0 : 2, qb = right ? 3 : 1;
    let t = g + '° from straight down  ' + DIRN[qa] + ' ' + fmtNum(fieldAt(F, g, qa * 90) * st.scale, 0) + ' cd';
    t += '  ' + DIRN[qb] + ' ' + fmtNum(fieldAt(F, g, qb * 90) * st.scale, 0) + ' cd';
    $('polarHover').textContent = t;
  }

  /* ---------- floor and wall previews ---------- */
  // Each preview has its own offscreen image, so one window never shows the other's picture.
  // It is rendered at the canvas's real pixel size when idle, and at a lighter size while something is being dragged.
  const RES_LO = 200, RES_HI = 720;
  function heatBuf(res) { const c = document.createElement('canvas'); c.width = c.height = res; const x = c.getContext('2d'); return { res, c, x, img: x ? x.createImageData(res, res) : null }; }
  const HB = { floor: heatBuf(RES_LO), wall: heatBuf(RES_LO) };
  let ebuf = new Float32Array(RES_LO * RES_LO), lastEdit = 0, hiT = 0;
  const busy = () => !!drag || !!pvDrag || !!kDrag || performance.now() - lastEdit < 160;
  let heatCost = 0;   // milliseconds per pixel of map, measured as we go
  function resFor(w) {
    if (busy()) return Math.min(RES_LO, Math.round(w));
    const want = clamp(Math.round(w * Math.min(window.devicePixelRatio || 1, 2)), RES_LO, RES_HI);
    return heatCost ? Math.min(want, Math.max(RES_LO, Math.round(Math.sqrt(30 / heatCost)))) : want;
  }
  const LUT = (() => {
    const stops = [[0, 5, 6, 14], [0.18, 38, 12, 88], [0.42, 140, 30, 100], [0.68, 232, 94, 44], [0.88, 252, 196, 88], [1, 255, 244, 205]];
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      const a = stops[j], b = stops[j + 1], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
    }
    return out;
  })();
  function niceStep(range) { for (const s of [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100]) if (range / s <= 4) return s; return 100; }
  // relative illuminance at a floor point: x towards Front (C0), y towards Left (C90), floor H metres below
  function floorE(x, y, H) {
    const d2 = x * x + y * y + H * H, d = Math.sqrt(d2), cg = H / d;
    return fieldAt(comp(), Math.acos(cg) / DEG, Math.atan2(y, x) / DEG) * cg / d2;
  }
  // relative illuminance on a ceiling Hc metres above the fixture (x towards Front, y towards Left)
  function ceilE(x, y, Hc) {
    const d2 = x * x + y * y + Hc * Hc, d = Math.sqrt(d2), cz = Hc / d;
    return fieldAt(comp(), 180 - Math.acos(cz) / DEG, Math.atan2(y, x) / DEG) * cz / d2;
  }
  // how far from straight up the upward light reaches (2% of peak), for fitting the ceiling view
  let upSpreadCache = { ver: -1, v: 0 };
  function upSpread() {
    if (upSpreadCache.ver === compVer) return upSpreadCache.v;
    const F = comp(), m = fieldMax(F) * 0.02; let g0 = 181;
    for (let c = 0; c < NC; c++) for (let g = 91; g < g0; g++) if (F[c * N + g] >= m && m > 0) { g0 = g; break; }
    upSpreadCache = { ver: compVer, v: g0 > 180 ? 0 : 180 - g0 }; return upSpreadCache.v;
  }
  // relative illuminance on a wall D metres away in direction phi: s along the wall (right +), z up from fixture height
  function wallE(s, z, D, phi) {
    const c = Math.cos(phi * DEG), sn = Math.sin(phi * DEG);
    const vx = D * c + s * sn, vy = D * sn - s * c, r2 = D * D + s * s + z * z, r = Math.sqrt(r2);
    return fieldAt(comp(), Math.acos(clamp(-z / r, -1, 1)) / DEG, Math.atan2(vy, vx) / DEG) * (D / r) / r2;
  }
  // Colour of a black body at T kelvin, as linear sRGB with luminance 1 (Kim et al. Planckian locus fit)
  function kelvinRGB(T) {
    T = clamp(T, 1667, 25000);
    const t = 1e3 / T, t2 = t * t, t3 = t2 * t;
    const x = T <= 4000 ? -0.2661239 * t3 - 0.2343589 * t2 + 0.8776956 * t + 0.179910 : -3.0258469 * t3 + 2.1070379 * t2 + 0.2226347 * t + 0.240390;
    const x2 = x * x, x3 = x2 * x;
    const y = T <= 2222 ? -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683
      : T <= 4000 ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
      : 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
    const X = x / y, Z = (1 - x - y) / y;
    return [Math.max(0, 3.2406 * X - 1.5372 - 0.4986 * Z), Math.max(0, -0.9689 * X + 1.8758 + 0.0415 * Z), Math.max(0, 0.0557 * X - 0.2040 + 1.0570 * Z)];
  }
  // the Kelvin colour at full brightness, in display values, for the fixture's glow in the 3D view
  function lampColor() { const c = kelvinRGB(S.kelvin), m = Math.max(c[0], c[1], c[2]) || 1; return c.map(v => Math.pow(clamp(v / m, 0, 1), 1 / 2.2)); }
  // linear light -> display value: ACES filmic curve (Narkowicz fit), then the sRGB transfer curve, as a lookup table
  const TM_MAX = 16, TM_N = 4096;
  const TONE = (() => {
    const out = new Uint8ClampedArray(TM_N + 1);
    for (let i = 0; i <= TM_N; i++) {
      const v = i / TM_N * TM_MAX, a = clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), 0, 1);
      out[i] = Math.round(255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055));
    }
    return out;
  })();
  const toneIdx = v => (v >= TM_MAX ? TM_N : (v * (TM_N / TM_MAX)) | 0);
  const GREY = 0.18;   // middle grey albedo
  // fill the heatmap buffer with fn(u, v) over [-1,1]^2 and paint it; returns the max value
  function paintHeat(ctx, w, h, fn, key) {
    const RES = resFor(w), tStart = performance.now();
    if (HB[key].res !== RES) HB[key] = heatBuf(RES);
    const hb = HB[key];
    if (ebuf.length < RES * RES) ebuf = new Float32Array(RES * RES);
    let emax = 0;
    for (let j = 0; j < RES; j++) {
      const v = 1 - (j + 0.5) / RES * 2;
      for (let i = 0; i < RES; i++) { const e = fn((i + 0.5) / RES * 2 - 1, v); ebuf[j * RES + i] = e; if (e > emax) emax = e; }
    }
    const tPx = (performance.now() - tStart) / (RES * RES); heatCost = heatCost ? heatCost * 0.7 + tPx * 0.3 : tPx;
    const px = hb.img.data;
    if (S.pvLook === 'lit') {
      // grey surface: 18% albedo lit by the fixture in its colour plus a little neutral room light; peak exposed to near white at 0 EV
      const col = kelvinRGB(S.kelvin), k = emax > 0 ? 8 * Math.pow(2, S.ev) / emax : 0, amb = S.amb * 0.3;
      for (let i = 0; i < RES * RES; i++) {
        const e = ebuf[i] * k;
        px[i * 4] = TONE[toneIdx(GREY * (amb + e * col[0]))]; px[i * 4 + 1] = TONE[toneIdx(GREY * (amb + e * col[1]))]; px[i * 4 + 2] = TONE[toneIdx(GREY * (amb + e * col[2]))]; px[i * 4 + 3] = 255;
      }
      hb.x.putImageData(hb.img, 0, 0);
      ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(hb.c, 0, 0, w, h);
      // overlays stay readable on bright grey
      ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 3;
      return emax;
    }
    for (let k = 0; k < RES * RES; k++) {
      let t = emax > 0 ? ebuf[k] / emax : 0;
      t = S.bands ? Math.min(9, Math.floor(t * 10)) / 9 : Math.pow(t, 0.6);
      const li = Math.round(t * 255) * 3;
      px[k * 4] = LUT[li]; px[k * 4 + 1] = LUT[li + 1]; px[k * 4 + 2] = LUT[li + 2]; px[k * 4 + 3] = 255;
    }
    hb.x.putImageData(hb.img, 0, 0);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(hb.c, 0, 0, w, h);
    return emax;
  }
  function drawPreview(st, cs) { drawFloor(st, cs); drawWall(st, cs); }

  let PF = null, PW = null;
  function drawFloor(st, cs) {
    const cv = $('floorCv'), { ctx, w, h } = setupCanvas(cv);
    const ceil = S.surf === 'ceil', Hs = ceil ? S.ceilD : S.floorH;
    $('floorTitle').textContent = ceil ? 'Ceiling' : 'Floor';
    $('floorSub').textContent = ceil ? 'From below' : 'From above';
    let A;
    if (pvDrag) A = pvDrag.A;
    else {
      const spread = ceil ? (upSpread() || 45) : (cs.gmax || 20);
      A = S.fit ? clamp(Hs * Math.tan(Math.min(spread, 82) * DEG) * 1.12, Hs * 0.35, Hs * 6) : S.floorRange;
      $('floorRVal').textContent = (S.fit ? A.toFixed(1) : S.floorRange) + ' m';
    }
    PF = { A, w, h, handles: [], ceil, Hs };
    cv.style.touchAction = S.handles ? 'none' : 'auto';
    const emax = paintHeat(ctx, w, h, (u, v) => (ceil ? ceilE(v * A, -u * A, Hs) : floorE(v * A, -u * A, Hs)), 'floor');
    const s = niceStep(A), sx = v => w / 2 + v / A * (w / 2), sy = v => h / 2 - v / A * (h / 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = MONO;
    for (let m = s; m < A; m += s) for (const g of [1, -1]) {
      const x = Math.round(sx(g * m)) + 0.5, y = Math.round(sy(g * m)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let m = s; m < A; m += s) { const x = sx(m); if (w - x > 34) ctx.fillText(+m.toFixed(2) + ' m', x, h / 2 + 5); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('Front ↑', w / 2 + 18, 5);
    ctx.textBaseline = 'bottom'; ctx.fillText('Back', w / 2 + 18, h - 22);
    ctx.textBaseline = 'bottom'; ctx.fillText('Left', 6, h / 2 - 6);
    ctx.textAlign = 'right'; ctx.fillText('Right', w - 6, h / 2 - 16);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(fmtShort(emax * cs.scale) + ' lx max', 8, h - 7);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    if (S.hmode === 'edges') { if (!ceil) drawHandles(ctx, st, w, h, sx, sy); } else drawPoints(ctx, 'floor');
    syncFloorHint(st);
  }
  function drawWall(st, cs) {
    const cv = $('wallCv'), { ctx, w, h } = setupCanvas(cv);
    const A = clamp(2.4 * S.wallD + 1.2, 1.5, 14), top = 0.4 * A;
    PW = { A, top, w, h, handles: [] };
    cv.style.touchAction = S.handles ? 'none' : 'auto';
    const emax = paintHeat(ctx, w, h, (u, v) => wallE(u * A, top - (1 - v) * A, S.wallD, S.wallC), 'wall');
    const s = niceStep(A), sx = v => w / 2 + v / A * (w / 2), sy = v => (top - v) / (2 * A) * h;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.font = MONO;
    for (let m = s; m < A; m += s) for (const g of [1, -1]) { const x = Math.round(sx(g * m)) + 0.5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    const ys = []; for (let m = 0; m < 2 * A; m += s) ys.push(-m); for (let m = s; m < top; m += s) ys.push(m);
    ys.forEach(v => { const y = Math.round(sy(v)) + 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let m = s; m < 2 * A - top - s * 0.3; m += s) ctx.fillText('−' + (+m.toFixed(2)) + ' m', 6, sy(-m));
    const fy = sy(0);
    ctx.beginPath(); ctx.arc(w / 2, fy, 5, 0, 6.2832); ctx.fillStyle = '#ffd56a'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('fixture, ' + S.wallD.toFixed(2) + ' m out', w / 2 + 10, fy);
    ctx.textBaseline = 'bottom'; ctx.fillText(fmtShort(emax * cs.scale) + ' lx max', 8, h - 7);
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    if (S.hmode === 'edges') drawWallHandles(ctx, st, w, h, sx, sy); else drawPoints(ctx, 'wall');
    syncWallHint(st);
  }

  /* ---------- edge handles: drag the beam (50%) and field (10%) edge of a C-plane ---------- */
  let pvDrag = null, pvHot = null;   // {view: 'floor'|'wall', q, idx, ...}
  const edgeOK = a => a > 0.4 && a < 88;
  const turnOf = () => (((curLayer().turn || 0) % 360) + 360) % 360;
  const handlesLive = () => S.handles && editable() && curLayer().on !== false;
  const sameHandle = (a, b) => !!a && !!b && a.view === b.view && a.q === b.q && a.idx === b.idx;
  function anchorsFor(st, q) {
    const a = [0], kinds = [];
    if (edgeOK(st.h50[q])) { a.push(st.h50[q]); kinds.push('beam'); }
    if (edgeOK(st.h10[q]) && st.h10[q] > a[a.length - 1] + 0.5) { a.push(st.h10[q]); kinds.push('field'); }
    a.push(90);
    return { a, kinds };
  }
  // outer edge angle at azimuth C, for each C in the list
  function edgeContour(st, frac, cs) {
    const thr = frac * st.rmax, map = MODES[S.mode].map, tmp = new Float32Array(N);
    return cs.map(C => { for (let g = 0; g < N; g++) tmp[g] = intensityAt(S.planes, map, g, C); return [C, crossing(tmp, thr)]; });
  }
  function strokeContours(ctx, st, cs, toXY) {
    [[0.5, 0.75, [6, 4]], [0.1, 0.4, [2, 4]]].forEach(([f, alpha, dash]) => {
      ctx.beginPath(); let open = false;
      edgeContour(st, f, cs).forEach(([C, a]) => {
        const p = edgeOK(a) ? toXY(C, a) : null;
        if (!p) { open = false; return; }
        if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; }
      });
      ctx.setLineDash(dash); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,' + alpha + ')'; ctx.stroke(); ctx.setLineDash([]);
    });
  }
  // filled dot = beam edge, ring = field edge; an arrow on the border when the edge is off the map
  function paintHandle(ctx, hd, col, hot) {
    const rad = hot ? 8 : 6, x = hd.x, y = hd.y;
    if (hd.pinned) {
      const s2 = rad + 2, px2 = hd.dir[0], py2 = hd.dir[1];
      ctx.beginPath();
      ctx.moveTo(x + px2 * s2 * 1.3, y + py2 * s2 * 1.3);
      ctx.lineTo(x - px2 * s2 * 0.7 - py2 * s2, y - py2 * s2 * 0.7 + px2 * s2);
      ctx.lineTo(x - px2 * s2 * 0.7 + py2 * s2, y - py2 * s2 * 0.7 - px2 * s2);
      ctx.closePath();
      ctx.fillStyle = hd.kind === 'beam' ? col : 'rgba(5,7,11,0.85)'; ctx.fill();
      ctx.lineWidth = hd.kind === 'beam' ? 2 : 2.5; ctx.strokeStyle = hd.kind === 'beam' ? '#ffffff' : col; ctx.stroke();
      return;
    }
    ctx.beginPath(); ctx.arc(x, y, rad + 2.5, 0, 6.2832); ctx.fillStyle = 'rgba(5,7,11,0.75)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832);
    if (hd.kind === 'beam') { ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
    else { ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, rad + 1.5, 0, 6.2832); ctx.stroke(); }
  }
  function paintTip(ctx, w, hd, t) {
    ctx.font = MONO;
    const tw = ctx.measureText(t).width + 12;
    let tx = hd.x + 12, ty = hd.y - 30;
    if (tx + tw > w - 4) tx = hd.x - 12 - tw;
    if (tx < 4) tx = 4;
    if (ty < 4) ty = hd.y + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fillRect(tx, ty, tw, 20);
    ctx.fillStyle = '#0b0f16'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, tx + 6, ty + 10.5);
  }
  const dirName = q => (S.mode === 'rot' ? '' : DIRN[q] + ' ');
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const isHot = hd => pvDrag ? sameHandle(pvDrag, hd) : sameHandle(pvHot, hd);
  const fmtM = r => (r > 999 ? '>999' : r.toFixed(r < 10 ? 2 : 1)) + ' m';
  function drawHandles(ctx, st, w, h, sx, sy) {
    if (st.up || !(st.rmax > 0) || !handlesLive()) return;
    const H = S.floorH, map = MODES[S.mode].map, cs = [], T = turnOf();
    for (let C = 0; C <= 360; C += 3) cs.push(C);
    strokeContours(ctx, st, cs, (C, a) => { const r = H * Math.tan(a * DEG); return [sx(-r * Math.sin((C + T) * DEG)), sy(r * Math.cos((C + T) * DEG))]; });
    for (let q = 0; q < 4; q++) {
      const { a, kinds } = anchorsFor(st, q);
      kinds.forEach((kind, j) => {
        const ang = a[j + 1], r = H * Math.tan(ang * DEG), inset = 12 + j * 16, ux = -Math.sin((q * 90 + T) * DEG), uy = Math.cos((q * 90 + T) * DEG);
        let x = sx(r * ux), y = sy(r * uy);
        const pinned = x < inset || x > w - inset || y < inset || y > h - inset;
        if (pinned) { x = clamp(x, inset, w - inset); y = clamp(y, inset, h - inset); }
        const hd = { view: 'floor', q, kind, idx: j + 1, x, y, a: ang, r, pinned, dir: [ux, -uy] };
        PF.handles.push(hd);
        paintHandle(ctx, hd, css(PCOL[map[q]]), isHot(hd));
      });
    }
    const hd = PF.handles.find(isHot);
    if (hd) paintTip(ctx, w, hd, cap(dirName(hd.q) + hd.kind) + ' edge ' + hd.a.toFixed(1) + '° · ' + fmtM(hd.r) + (hd.pinned ? ', off the map' : ''));
  }
  // On the wall only the plane facing it reaches the centre line: an edge at angle a meets the wall D / tan(a) below the fixture.
  function drawWallHandles(ctx, st, w, h, sx, sy) {
    if (st.up || !(st.rmax > 0) || !handlesLive()) return;
    // the wall direction in the selected layer's own frame; handles need it to land on one of its four sides
    const D = S.wallD, phi = (((S.wallC - turnOf()) % 360) + 360) % 360, map = MODES[S.mode].map, cs = [];
    if (phi % 90) return;
    const q = phi / 90;
    for (let C = phi - 84; C <= phi + 84; C += 2) cs.push(C);
    strokeContours(ctx, st, cs, (C, a) => {
      const c = Math.cos((C - phi) * DEG); if (c <= 0.05) return null;
      return [sx(D * Math.tan((phi - C) * DEG)), sy(-D / (Math.tan(a * DEG) * c))];
    });
    const { a, kinds } = anchorsFor(st, q);
    kinds.forEach((kind, j) => {
      const ang = a[j + 1], below = D / Math.tan(ang * DEG), inset = 12 + j * 16;
      let y = sy(-below);
      const pinned = y > h - inset;
      if (pinned) y = h - inset;
      const hd = { view: 'wall', q, kind, idx: j + 1, x: w / 2, y, a: ang, r: below, pinned, dir: [0, 1] };
      PW.handles.push(hd);
      paintHandle(ctx, hd, css(PCOL[map[q]]), isHot(hd));
    });
    const hd = PW.handles.find(isHot);
    if (hd) paintTip(ctx, w, hd, cap(dirName(hd.q) + hd.kind) + ' edge ' + hd.a.toFixed(1) + '° · ' + fmtM(hd.r) + ' down' + (hd.pinned ? ', off the map' : ''));
  }
  const symNote = () => (S.mode === 'rot' ? ' With Round, every direction moves together.' : S.mode === 'bi' ? ' With Oval, front moves with back and left with right.' : S.mode === 'mir' ? ' With One-sided, left and right move together.' : '');
  function syncFloorHint(st) {
    const el = $('floorHint');
    if (S.surf === 'ceil') {
      el.textContent = upSpread() ? (S.hmode === 'points' && handlesLive() ? 'The coloured line is the upward part of the curve, laid out from the point straight above the fixture: the further from the dotted axis, the brighter. Drag points along it for angle, sideways for brightness.' : S.hmode === 'edges' ? 'Edge handles work on the floor. Use Points to shape the upward light here.' : 'Light reaching the ceiling above the fixture.')
        : 'No light goes above the horizon, so the ceiling stays dark. Drag curve points above 90° in the editor or on the wall to add some.';
      return;
    }
    if (S.hmode === 'points') {
      const d = ptsDir('floor'), nm = S.mode === 'rot' ? 'curve' : MODES[S.mode].tabs[S.active].toLowerCase() + ' curve';
      el.textContent = !handlesLive() ? 'Select a visible curve layer to drag its points here.'
        : 'The coloured line is the ' + nm + ' laid out along its direction: the further from the dotted axis, the brighter. Drag a point along the axis to change its angle, sideways to change its brightness. Click the line to add a point, double-click one to remove it.' + (S.mode === 'rot' ? '' : ' Switch direction with the tabs above the curve or keys 1–4.');
      return;
    }
    if (S.handles && !handlesLive()) { el.textContent = 'Select a visible curve layer to drag its beam edges here.'; return; }
    if (!S.handles) { el.textContent = 'Turn on Edge handles to reshape the beam by dragging on the map.'; return; }
    if (st.up) { el.textContent = 'This profile points upward, so there are no edges on the floor to drag.'; return; }
    el.textContent = 'Filled dots mark where the beam fades to half brightness, rings where it fades to 10%. Drag one to widen or narrow the light in that direction.' + symNote();
  }
  function syncWallHint(st) {
    const ph = (((S.wallC - (curLayer().turn || 0)) % 360) + 360) % 360, el = $('wallHint'), nm = S.mode === 'rot' ? 'the light' : ph % 90 ? 'this layer' : 'the ' + DIRN[ph / 90].toLowerCase() + ' side';
    if (S.hmode === 'points' && handlesLive() && !(ph % 90)) {
      el.textContent = 'The coloured line is the curve of ' + nm + ', the part of the light facing the wall, drawn down the wall\'s centre line: the further right, the brighter. Drag a point up or down to change its angle, sideways to change its brightness. Click the line to add a point, double-click one to remove it.';
      return;
    }
    if (S.handles && !handlesLive()) { el.textContent = 'Select a visible curve layer to drag its beam edges here.'; return; }
    if (S.handles && ph % 90) { el.textContent = 'This layer is turned, so none of its four sides faces the wall squarely. Use the floor map to drag its edges.'; return; }
    if (!S.handles) { el.textContent = 'Turn on Edge handles to reshape the beam by dragging on the wall.'; return; }
    if (st.up) { el.textContent = 'This profile points upward, so there are no edges on the wall to drag.'; return; }
    if (!PW || !PW.handles.length) { el.textContent = 'Not enough of ' + nm + "'s light reaches this wall to show a beam edge. Put the wall on another side."; return; }
    el.textContent = 'These handles shape ' + nm + ', the part of the light facing the wall. Drag up to widen the beam in that direction, down to narrow it.' + symNote();
  }
  function localOf(id, e) { const r = $(id).getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }
  function hitIn(list, p, rad) {
    if (S.hmode !== 'edges' || !list) return null;
    let best = null, bd = rad * rad;
    list.forEach(hd => { const d = (hd.x - p.px) ** 2 + (hd.y - p.py) ** 2; if (d <= bd) { bd = d; best = hd; } });
    return best;
  }
  function floorHover(p) {
    if (!PF) return;
    const st = cstats(), x = (p.px / PF.w * 2 - 1) * PF.A, y = (1 - p.py / PF.h * 2) * PF.A;
    $('floorHover').textContent = Math.abs(y).toFixed(2) + ' m ' + (y >= 0 ? 'in front' : 'behind') + ', ' + Math.abs(x).toFixed(2) + ' m ' + (x >= 0 ? 'right' : 'left') + '  ' + fmtNum((PF.ceil ? ceilE(y, -x, PF.Hs) : floorE(y, -x, PF.Hs)) * st.scale, 1) + ' lx';
  }
  function wallHover(p) {
    if (!PW) return;
    const st = cstats(), x = (p.px / PW.w * 2 - 1) * PW.A, z = PW.top - p.py / PW.h * 2 * PW.A;
    $('wallHover').textContent = (x >= 0 ? '+' : '') + x.toFixed(2) + ' m along, ' + (z >= 0 ? '+' : '') + z.toFixed(2) + ' m from fixture height  ' + fmtNum(wallE(x, z, S.wallD, S.wallC) * st.scale, 1) + ' lx';
  }
  // pointer position -> edge angle for the handle being dragged
  function dragAngle(p) {
    if (pvDrag.view === 'floor') {
      const A = pvDrag.A, x = (p.px / PF.w * 2 - 1) * A, y = (1 - p.py / PF.h * 2) * A;
      const a = (pvDrag.q * 90 + turnOf()) * DEG, r = Math.max(0, -x * Math.sin(a) + y * Math.cos(a));
      return Math.atan(r / S.floorH) / DEG;
    }
    const below = -(PW.top - p.py / PW.h * 2 * PW.A);
    return below <= 1e-3 ? 90 : Math.atan(S.wallD / below) / DEG;
  }
  function bindHandles(id, view) {
    const cv = $(id), geo = () => (view === 'floor' ? PF : PW), hover = view === 'floor' ? floorHover : wallHover, out = view === 'floor' ? 'floorHover' : 'wallHover';
    cv.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (S.hmode === 'points') { pointsDown(e, view, cv); return; }
      const g = geo(), hd = g && handlesLive() && hitIn(g.handles, localOf(id, e), isTouch(e) ? 24 : 12);
      if (!hd) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const st = stats(), k = MODES[S.mode].map[hd.q];
      pvDrag = { view, q: hd.q, idx: hd.idx, kind: hd.kind, plane: k, A: g.A, src: anchorsFor(st, hd.q).a, base: S.planes[k].slice(), baseKnots: S.knots[k] ? S.knots[k].map(p => p.slice()) : null, pending: snap(), moved: false };
      frozenRange = [V.lo, V.hi];
      if (S.active !== k) { S.active = k; S.sel = -1; renderTabs(); }
      cv.style.cursor = 'grabbing'; queue('pv', 'ed');
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = localOf(id, e);
      if (S.hmode === 'points' || kDrag) { if (!pointsMove(e, view, cv, out)) hover(p); return; }
      if (!pvDrag) {
        const g = geo(), hd = g && hitIn(g.handles, p, isTouch(e) ? 24 : 12), was = pvHot;
        pvHot = hd ? { view, q: hd.q, idx: hd.idx } : (pvHot && pvHot.view === view ? null : pvHot);
        cv.style.cursor = hd ? 'grab' : 'crosshair';
        if (!sameHandle(was, pvHot) && (was || pvHot)) queue('pv');
        hover(p); return;
      }
      if (pvDrag.view !== view) return;
      if (!pvDrag.moved) { pvDrag.moved = true; pushSnap(pvDrag.pending); coKey = null; }
      const dst = pvDrag.src.slice(), i = pvDrag.idx, last = dst.length - 1;
      dst[i] = clamp(dragAngle(p), i === 1 ? 0.5 : dst[i - 1] + 1, i + 1 === last ? 88 : dst[i + 1] - 1);
      const k = pvDrag.plane;
      if (pvDrag.baseKnots) { S.knots[k] = warpKnots(pvDrag.baseKnots, pvDrag.src, dst); commitKnots(k); }
      else S.planes[k] = warpPlane(pvDrag.base, pvDrag.src, dst);
      S.sel = -1; dirty();
      $(out).textContent = cap(dirName(pvDrag.q) + pvDrag.kind) + ' edge at ' + dst[i].toFixed(1) + '°, '
        + (view === 'floor' ? fmtM(S.floorH * Math.tan(dst[i] * DEG)) + ' out on the floor' : fmtM(S.wallD / Math.tan(dst[i] * DEG)) + ' below the fixture on the wall');
    });
    const end = () => {
      if (pointsEnd()) { cv.style.cursor = 'grab'; return; }
      if (!pvDrag || pvDrag.view !== view) return;
      if (pvDrag.moved) say('Moved the ' + (dirName(pvDrag.q) + pvDrag.kind).toLowerCase() + ' edge. Undo reverts it.');
      pvDrag = null; frozenRange = null; cv.style.cursor = 'grab'; queue();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!pvDrag && !kDrag) { $(out).textContent = ' '; if (pvHot && pvHot.view === view) { pvHot = null; queue('pv'); } if (kHot && kHot.view === view) { kHot = null; queue('pv'); } } });
    const delPt = e => {
      if (S.hmode !== 'points' || !ptsLive()) return false;
      const hit = hitPt(view, localOf(id, e), 14), d = ptsDir(view); if (!hit || !d) return false;
      if (S.active !== d.k) { S.active = d.k; renderTabs(); }
      removeKnot(hit.i); return true;
    };
    cv.addEventListener('dblclick', e => { delPt(e); });
    cv.addEventListener('contextmenu', e => { if (S.hmode === 'points' && hitPt(view, localOf(id, e), 14)) { e.preventDefault(); delPt(e); } });
  }
  /* ---------- curve points on the previews: the same control points as the editor, laid out in space ---------- */
  let kDrag = null, kHot = null;   // {view, idx}
  // floor shows the direction being edited; the wall shows the side of the selected layer that faces it
  function ptsDir(view) {
    const map = MODES[S.mode].map;
    if (view === 'floor') return { q: Math.max(0, map.indexOf(S.active)), k: S.active };
    const ph = (((S.wallC - turnOf()) % 360) + 360) % 360;
    if (ph % 90) return null;
    return { q: ph / 90, k: map[ph / 90] };
  }
  // angle a (degrees from straight down) and brightness v (0..1) <-> screen position.
  // The curve is drawn as a profile: along the axis is the angle, the sideways distance from the axis is brightness.
  function ptGeo(view) {
    const d = ptsDir(view); if (!d) return null;
    if (view === 'floor') {
      if (!PF) return null;
      const th = (d.q * 90 + turnOf()) * DEG, ux = -Math.sin(th), uy = Math.cos(th), px = Math.cos(th), py = Math.sin(th);
      const A = PF.A, W = 0.32 * A, H = PF.Hs;
      const toS = (mx, my) => [PF.w / 2 + mx / A * (PF.w / 2), PF.h / 2 - my / A * (PF.h / 2)];
      if (PF.ceil) return { d, lo: 91.5, hi: 180,
        fwd: (a, v) => { if (a <= 91) return null; const r = H * Math.tan((180 - a) * DEG), o = v * W; return toS(ux * r + px * o, uy * r + py * o); },
        inv: (x, y) => { const mx = (x / PF.w * 2 - 1) * A, my = (1 - y / PF.h * 2) * A, r = Math.max(0, mx * ux + my * uy); return [180 - Math.atan(r / H) / DEG, (mx * px + my * py) / W]; } };
      return { d, lo: 0, hi: 88.5,
        fwd: (a, v) => { if (a >= 89) return null; const r = H * Math.tan(a * DEG), o = v * W; return toS(ux * r + px * o, uy * r + py * o); },
        inv: (x, y) => { const mx = (x / PF.w * 2 - 1) * A, my = (1 - y / PF.h * 2) * A, r = Math.max(0, mx * ux + my * uy); return [Math.atan(r / H) / DEG, (mx * px + my * py) / W]; } };
    }
    if (!PW) return null;
    const A = PW.A, top = PW.top, W = 0.32 * A, D = S.wallD;
    const toS = (s, z) => [PW.w / 2 + s / A * (PW.w / 2), (top - z) / (2 * A) * PW.h];
    return { d, lo: 3, hi: 177,
      fwd: (a, v) => { if (a <= 1 || a >= 179) return null; return toS(v * W, -D / Math.tan(a * DEG)); },
      inv: (x, y) => { const s = (x / PW.w * 2 - 1) * A, z = top - y / PW.h * 2 * A; return [Math.acos(clamp(-z / Math.hypot(D, z), -1, 1)) / DEG, s / W]; } };
  }
  const ptsLive = () => S.hmode === 'points' && handlesLive();
  function drawPoints(ctx, view) {
    const geo = view === 'floor' ? PF : PW; geo.pts = [];
    if (!ptsLive()) return;
    const G = ptGeo(view); if (!G) return;
    const w = geo.w, h = geo.h, k = G.d.k, arr = S.planes[k], col = css(PCOL[k]);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const a0 = G.fwd(G.lo + 0.01, 0), a1 = G.fwd(G.hi, 0);
    if (a0 && a1) { ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke(); ctx.setLineDash([]); }
    ctx.beginPath(); let open = false;
    for (let g = G.lo; g <= G.hi; g += 0.5) {
      const p = G.fwd(g, sampleArr(arr, g));
      if (!p || Math.abs(p[0] - w / 2) > 3 * w || Math.abs(p[1] - h / 2) > 3 * h) { open = false; continue; }
      if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; }
    }
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,7,11,0.6)'; ctx.stroke(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    ctx.restore();
    const ks = getKnots(k);
    ks.forEach((kn, i) => {
      const p = G.fwd(kn[0], kn[1]);
      if (!p || p[0] < 3 || p[0] > w - 3 || p[1] < 3 || p[1] > h - 3) return;
      geo.pts.push({ i, x: p[0], y: p[1] });
      const hot = (kDrag && kDrag.view === view && kDrag.idx === i) || (!kDrag && kHot && kHot.view === view && kHot.idx === i);
      const sel = S.sel === i;
      ctx.beginPath(); ctx.arc(p[0], p[1], hot || sel ? 7 : 5.5, 0, 6.2832);
      ctx.fillStyle = hot || sel ? '#ffffff' : col; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = hot || sel ? col : '#ffffff'; ctx.stroke();
    });
    const ti = kDrag && kDrag.view === view ? kDrag.idx : kHot && kHot.view === view ? kHot.idx : -1, t = geo.pts.find(p => p.i === ti);
    if (t) { const kn = ks[ti], st = stats(); paintTip(ctx, w, t, cap(dirName(G.d.q)) + kn[0].toFixed(1) + '° · ' + fmtPct(kn[1]) + ' · ' + fmtShort(kn[1] * (st.cdScale || cstats().scale)) + ' cd'); }
  }
  function hitPt(view, p, rad) {
    const geo = view === 'floor' ? PF : PW; let best = null, bd = rad * rad;
    ((geo && geo.pts) || []).forEach(q => { const d = (q.x - p.px) ** 2 + (q.y - p.py) ** 2; if (d <= bd) { bd = d; best = q; } });
    return best;
  }
  function nearProfile(view, p, tol) {
    const G = ptGeo(view); if (!G) return -1;
    const [a] = G.inv(p.px, p.py), deg = Math.round(clamp(a, Math.max(1, G.lo), G.hi));
    const cp = G.fwd(deg, S.planes[G.d.k][deg]);
    return cp && Math.hypot(cp[0] - p.px, cp[1] - p.py) <= tol ? deg : -1;
  }
  function pointsDown(e, view, cv) {
    if (!ptsLive()) return;
    const G = ptGeo(view); if (!G) return;
    const p = localOf(cv.id, e), touch = isTouch(e), k = G.d.k;
    const hit = hitPt(view, p, touch ? 22 : 11);
    let idx, pending = snap();
    if (S.active !== k) { S.active = k; S.sel = -1; renderTabs(); }
    if (hit) idx = hit.i;
    else {
      const deg = nearProfile(view, p, touch ? 24 : 14); if (deg < 0) return;
      const ks = getKnots(k); if (ks.some(q => Math.abs(q[0] - deg) < 0.5)) return;
      pushHist(); pending = null;
      ks.push([deg, S.planes[k][deg]]); ks.sort((x, y) => x[0] - y[0]); idx = ks.findIndex(q => q[0] === deg); commitKnots(k); dirty();
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    S.sel = idx; kDrag = { view, idx, pending, moved: false, sx: p.px, sy: p.py };
    frozenRange = [V.lo, V.hi]; cv.style.cursor = 'grabbing'; queue('pv', 'ed'); e.preventDefault();
  }
  // returns true when it handled the move
  function pointsMove(e, view, cv, out) {
    const p = localOf(cv.id, e);
    if (!kDrag) {
      if (!ptsLive()) return false;
      const hit = hitPt(view, p, isTouch(e) ? 22 : 11), was = kHot;
      kHot = hit ? { view, idx: hit.i } : (kHot && kHot.view === view ? null : kHot);
      cv.style.cursor = hit ? 'grab' : nearProfile(view, p, 14) >= 0 ? 'copy' : 'crosshair';
      if ((was && was.view + was.idx) !== (kHot && kHot.view + kHot.idx)) queue('pv');
      return false;
    }
    if (kDrag.view !== view) return true;
    if (!kDrag.moved) { if (Math.hypot(p.px - kDrag.sx, p.py - kDrag.sy) < 3) return true; kDrag.moved = true; if (kDrag.pending) { pushSnap(kDrag.pending); coKey = null; } }
    const G = ptGeo(view); if (!G) return true;
    let [a, v] = G.inv(p.px, p.py);
    a = Math.round(a * 2) / 2; v = clamp(v, 0, 1);
    if (v < 0.015) v = 0;
    moveKnot(kDrag.idx, a, v);
    const kn = getKnots(S.active)[kDrag.idx];
    $(out).textContent = cap(dirName(G.d.q)) + 'point at ' + kn[0].toFixed(1) + '°, ' + fmtPct(kn[1]) + ' brightness';
    return true;
  }
  function pointsEnd() {
    if (!kDrag) return false;
    if (kDrag.moved) say('Moved a point on the ' + (dirName(ptsDir(kDrag.view) ? ptsDir(kDrag.view).q : 0) || '').toLowerCase() + 'curve. Undo reverts it.');
    kDrag = null; frozenRange = null; queue(); return true;
  }
  /* ---------- 3D view: a floor and a back wall, ray-cast per pixel on the GPU from the combined light ---------- */
  const V3 = { gl: null, prog: null, tex: null, lut: null, ver: -1, yaw: 32, pitch: 24, zoom: 1.2, emaxKey: '', emax: 1, U: {} };
  const V3_DEFAULT = { yaw: 32, pitch: 24, zoom: 1.2 };
  const VS = '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = `#version 300 es
precision highp float;
uniform sampler2D uI; uniform sampler2D uLut;
uniform vec2 uRes; uniform vec3 uCam, uFwd, uRight, uUp; uniform float uTan;
uniform float uH, uD, uWall, uExtX, uExtZ, uWallH, uK, uAmb, uLit, uGrid, uCeil; uniform vec3 uCol, uBg, uLamp;
out vec4 o;
float I(vec3 v) {
  float r = length(v);
  float g = degrees(acos(clamp(-v.y / r, -1.0, 1.0)));
  float C = degrees(atan(-v.x, -v.z)) + uWall;
  return texture(uI, vec2((C + 0.5) / 360.0, (g + 0.5) / 181.0)).r;
}
vec3 tone(vec3 x) {
  x = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  return mix(12.92 * x, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), x));
}
void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 dir = normalize(uFwd + ndc.x * uTan * (uRes.x / uRes.y) * uRight + ndc.y * uTan * uUp);
  float t = 1e9; vec3 n = vec3(0.0); int hit = 0;
  if (dir.y < -1e-5 && uCam.y > 0.0) {
    float tf = -uCam.y / dir.y; vec3 p = uCam + dir * tf;
    if (tf > 0.0 && abs(p.x) <= uExtX && p.z >= -uD && p.z <= uExtZ) { t = tf; n = vec3(0.0, 1.0, 0.0); hit = 1; }
  }
  if (abs(dir.z) > 1e-5 && uCam.z > -uD) {
    float tw = (-uD - uCam.z) / dir.z; vec3 p = uCam + dir * tw;
    if (tw > 0.0 && tw < t && abs(p.x) <= uExtX && p.y >= 0.0 && p.y <= uWallH) { t = tw; n = vec3(0.0, 0.0, 1.0); hit = 2; }
  }
  // ceiling, only when the light also points upward; seen from above it is left out so the room stays visible
  if (uCeil > 0.5 && dir.y > 1e-5 && uCam.y < uWallH) {
    float tc = (uWallH - uCam.y) / dir.y; vec3 p = uCam + dir * tc;
    if (tc > 0.0 && tc < t && abs(p.x) <= uExtX && p.z >= -uD && p.z <= uExtZ) { t = tc; n = vec3(0.0, -1.0, 0.0); hit = 3; }
  }
  vec3 L = vec3(0.0, uH, 0.0), c = uBg;
  if (hit > 0) {
    vec3 P = uCam + dir * t, v = P - L;
    float r2 = max(dot(v, v), 1e-4), cosI = max(0.0, dot(n, -v) / sqrt(r2));
    float E = I(v) * cosI / r2;
    if (uLit > 0.5) c = tone(0.18 * (uAmb + E * uK * uCol));
    else c = max(texture(uLut, vec2(pow(clamp(E * uK, 0.0, 1.0), 0.6), 0.5)).rgb, vec3(hit == 2 ? 0.075 : 0.045));
    vec2 gp = (hit == 2 ? P.xy : P.xz) / uGrid;
    vec2 f = abs(fract(gp - 0.5) - 0.5) / max(fwidth(gp), vec2(1e-4));
    float line = 1.0 - min(min(f.x, f.y), 1.0);
    c = mix(c, uLit > 0.5 ? c * 0.7 + 0.05 : c + 0.07, line * 0.45);
    if (hit != 2 && P.z < -uD + 0.02 * uGrid) c *= 0.55;   // a soft line where floor or ceiling meets the wall
  }
  // the fixture itself
  vec3 toL = L - uCam; float tl = dot(toL, dir);
  // a glow in the light's colour temperature with a small near-white hot core
  if (tl > 0.0 && tl < t + 1e-3) {
    float ang = length(cross(dir, toL)) / length(toL);
    c += uLamp * exp(-pow(ang / 0.016, 2.0)) + mix(uLamp, vec3(1.0), 0.6) * 0.6 * exp(-pow(ang / 0.006, 2.0));
  }
  o = vec4(c, 1.0);
}`;
  function v3Init() {
    const cv = $('d3Cv');
    const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) { $('d3Msg').hidden = false; $('d3Msg').textContent = 'The 3D view needs WebGL 2, which this browser does not provide.'; cv.hidden = true; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    try {
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      V3.prog = pr;
    } catch (err) { $('d3Msg').hidden = false; $('d3Msg').textContent = 'The 3D view could not start: ' + err.message; cv.hidden = true; return; }
    gl.useProgram(V3.prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(V3.prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uI', 'uLut', 'uRes', 'uCam', 'uFwd', 'uRight', 'uUp', 'uTan', 'uH', 'uD', 'uWall', 'uExtX', 'uExtZ', 'uWallH', 'uK', 'uAmb', 'uLit', 'uGrid', 'uCol', 'uBg', 'uCeil', 'uLamp'].forEach(n => { V3.U[n] = gl.getUniformLocation(V3.prog, n); });
    V3.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, V3.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    V3.lut = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, V3.lut);
    const lut = new Uint8Array(256 * 4); for (let i = 0; i < 256; i++) { lut[i * 4] = LUT[i * 3]; lut[i * 4 + 1] = LUT[i * 3 + 1]; lut[i * 4 + 2] = LUT[i * 3 + 2]; lut[i * 4 + 3] = 255; }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); V3.gl = null; $('d3Msg').hidden = false; $('d3Msg').textContent = 'The 3D view lost its graphics context. Reload the page to bring it back.'; });
    V3.gl = gl;
  }
  function v3Scene() {
    const H = S.floorH, D = S.wallD;
    const ext = Math.max(4, 3 * H, 3 * D), extZ = Math.max(4, 3 * H);
    const ceil = cstats().upFrac > 0.002 || S.surf === 'ceil';
    const wallH = ceil ? H + S.ceilD : Math.max(H * 1.6, H + 1.5);
    return { H, D, ext, extZ, wallH, ceil, grid: ext > 14 ? 2 : 1 };
  }
  // brightest point on the floor or wall, sampled coarsely, so exposure lands the peak near white
  function v3Emax(sc) {
    const F = comp(), key = compVer + '|' + sc.H + '|' + sc.D + '|' + S.wallC + '|' + sc.ceil + '|' + sc.wallH;
    if (key === V3.emaxKey) return V3.emax;
    let m = 0;
    const peak = fieldMax(F) || 1;
    const E = (px, py, pz, nx, ny, nz) => {
      const vx = px, vy = py - sc.H, vz = pz, r2 = vx * vx + vy * vy + vz * vz, r = Math.sqrt(r2);
      const cosI = Math.max(0, -(nx * vx + ny * vy + nz * vz) / r); if (!cosI) return 0;
      const g = Math.acos(clamp(-vy / r, -1, 1)) / DEG, C = Math.atan2(-vx, -vz) / DEG + S.wallC;
      return fieldAt(F, g, C) / peak * cosI / r2;
    };
    for (let i = 0; i <= 48; i++) for (let j = 0; j <= 48; j++) {
      const x = -sc.ext + 2 * sc.ext * i / 48;
      const zz = -sc.D + (sc.extZ + sc.D) * j / 48;
      m = Math.max(m, E(x, 0, zz, 0, 1, 0), E(x, sc.wallH * j / 48, -sc.D, 0, 0, 1), sc.ceil ? E(x, sc.wallH, zz, 0, -1, 0) : 0);
    }
    V3.emaxKey = key; V3.emax = m || 1; return V3.emax;
  }
  let v3Key = '', v3Last = 0, v3T = 0, v3Cost = 0, v3Visible = true, v3Orbit = false;
  // one timed render at a known size tells us roughly how many milliseconds the GPU needs per megapixel
  function v3Calibrate(gl) {
    const cv = $('d3Cv'); cv.width = 256; cv.height = 256; gl.viewport(0, 0, 256, 256);
    const px = new Uint8Array(4), t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    v3Cost = Math.max(0.5, (performance.now() - t0) / (256 * 256 / 1e6));
  }
  function draw3D() {
    const gl = V3.gl; if (!gl) return;
    const cv = $('d3Cv');
    if (!v3Visible) return;
    const interactive = v3Orbit || busy(), now = performance.now();
    const theme = document.documentElement.getAttribute('data-theme') || '';
    const key = [compVer, S.floorH, S.wallD, S.wallC, S.surf, S.ceilD, S.pvLook, S.kelvin, S.ev, S.amb, V3.yaw, V3.pitch, V3.zoom, cv.clientWidth, cv.clientHeight, interactive ? 'lo' : 'hi', theme].join('|');
    if (key === v3Key) return;
    // edits elsewhere refresh the 3D view a few times a second; orbiting it refreshes every frame
    clearTimeout(v3T);
    if (interactive && !v3Orbit && now - v3Last < 140) { v3T = setTimeout(() => queue('d3'), 140 - (now - v3Last)); return; }
    if (interactive) v3T = setTimeout(() => queue('d3'), 260);   // sharpen once things settle
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5), fullPx = cv.clientWidth * cv.clientHeight * dpr * dpr;
    if (!v3Cost) { V3.ver = -1; }
    const budgetMs = interactive ? 5 : 22, s3 = v3Cost ? clamp(Math.sqrt(budgetMs / (v3Cost * fullPx / 1e6)), interactive ? 0.2 : 0.35, 1) : 1;
    const W = Math.max(10, Math.round(cv.clientWidth * dpr * s3)), Hh = Math.max(10, Math.round(cv.clientHeight * dpr * s3));
    if (V3.ver !== compVer) {
      const F = comp(), m = fieldMax(F) || 1, d = new Float32Array(NC * N);
      for (let c = 0; c < NC; c++) for (let g = 0; g < N; g++) d[g * NC + c] = F[c * N + g] / m;
      gl.bindTexture(gl.TEXTURE_2D, V3.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, NC, N, 0, gl.RED, gl.FLOAT, d);
      V3.ver = compVer;
    }
    const sc = v3Scene(), emax = v3Emax(sc), U = V3.U;
    // orbit camera around a point between the fixture and the wall
    // orbit around the point halfway between the light and the floor; back off further when the wall is far away
    const tgt = [0, sc.H / 2, 0];
    const dist = (Math.max(sc.H * 2.2, sc.D * 2.6 + sc.H) + 2.5) * V3.zoom, yw = V3.yaw * DEG, pt = V3.pitch * DEG;
    const cam = [tgt[0] + dist * Math.sin(yw) * Math.cos(pt), tgt[1] + dist * Math.sin(pt), tgt[2] + dist * Math.cos(yw) * Math.cos(pt)];
    const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const fwd = nrm([tgt[0] - cam[0], tgt[1] - cam[1], tgt[2] - cam[2]]);
    const right = nrm([fwd[2] * 0 - fwd[1] * 0 + -fwd[2], 0, fwd[0]]);   // fwd x up(0,1,0)
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    gl.useProgram(V3.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, V3.tex); gl.uniform1i(U.uI, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, V3.lut); gl.uniform1i(U.uLut, 1);
    gl.uniform2f(U.uRes, W, Hh); gl.uniform3fv(U.uCam, cam); gl.uniform3fv(U.uFwd, fwd); gl.uniform3fv(U.uRight, right); gl.uniform3fv(U.uUp, up);
    gl.uniform1f(U.uTan, Math.tan(24 * DEG));
    gl.uniform1f(U.uH, sc.H); gl.uniform1f(U.uD, sc.D); gl.uniform1f(U.uWall, S.wallC); gl.uniform1f(U.uExtX, sc.ext); gl.uniform1f(U.uExtZ, sc.extZ); gl.uniform1f(U.uWallH, sc.wallH); gl.uniform1f(U.uCeil, sc.ceil ? 1 : 0);
    const lit = S.pvLook === 'lit';
    gl.uniform1f(U.uLit, lit ? 1 : 0); gl.uniform1f(U.uK, lit ? 8 * Math.pow(2, S.ev) / emax : 1 / emax);
    gl.uniform1f(U.uAmb, S.amb * 0.3); gl.uniform3fv(U.uCol, kelvinRGB(S.kelvin)); gl.uniform3fv(U.uLamp, lampColor()); gl.uniform1f(U.uGrid, sc.grid);
    gl.uniform3fv(U.uBg, document.documentElement.matches(':root[data-theme="dark"]') || (matchMedia('(prefers-color-scheme: dark)').matches && !document.documentElement.matches(':root[data-theme="light"]')) ? [0.02, 0.03, 0.045] : [0.06, 0.07, 0.09]);
    if (!v3Cost) v3Calibrate(gl);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    gl.viewport(0, 0, W, Hh); gl.uniform2f(U.uRes, W, Hh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    v3Key = key; v3Last = now;
    $('d3Info').textContent = sc.H.toFixed(1) + ' m high · wall ' + sc.D.toFixed(2) + ' m' + (sc.ceil ? ' · ceiling ' + sc.wallH.toFixed(1) + ' m' : '') + ' · grid ' + sc.grid + ' m';
  }
  function bindView3D() {
    const cv = $('d3Cv'), pts = new Map(); let pinch = 0;
    const redraw = () => { queue('d3'); saveSoon(); };
    if (window.IntersectionObserver) new IntersectionObserver(es => { v3Visible = es.some(x => x.isIntersecting); if (v3Visible) queue('d3'); }).observe(cv);
    cv.addEventListener('pointerdown', e => { v3Orbit = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } cv.style.cursor = 'grabbing'; e.preventDefault(); });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) V3.zoom = clamp(V3.zoom * pinch / d, 0.35, 3); pinch = d; redraw(); return; }
      V3.yaw -= (e.clientX - prev[0]) * 0.4; V3.pitch = clamp(V3.pitch + (e.clientY - prev[1]) * 0.3, -88, 88);
      V3.yaw = ((V3.yaw + 180) % 360 + 360) % 360 - 180; redraw();
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) { cv.style.cursor = 'grab'; v3Orbit = false; queue('d3'); } };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); V3.zoom = clamp(V3.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 3); redraw(); }, { passive: false });
    const reset = () => { Object.assign(V3, V3_DEFAULT); redraw(); };
    cv.addEventListener('dblclick', reset); $('d3Reset').addEventListener('click', reset);
    cv.addEventListener('keydown', e => {
      const k = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key];
      if (k) { e.preventDefault(); V3.yaw += k[0]; V3.pitch = clamp(V3.pitch + k[1], -88, 88); redraw(); }
      else if (e.key === '+' || e.key === '=') { V3.zoom = clamp(V3.zoom / 1.15, 0.35, 3); redraw(); }
      else if (e.key === '-') { V3.zoom = clamp(V3.zoom * 1.15, 0.35, 3); redraw(); }
    });
  }
  function bindPreview() { bindHandles('floorCv', 'floor'); bindHandles('wallCv', 'wall'); }

  /* ---------- readouts ---------- */
  function updateReadouts(st) {
    if (!(st.rmax > 0)) { ['rdPeak', 'rdFlux', 'rdBeam', 'rdField', 'rdCenter', 'rdFoot', 'rdUp'].forEach(i => { $(i).textContent = '–'; }); return; }
    const upTag = st.up ? ' <small>upward</small>' : '';
    $('rdPeak').innerHTML = fmtNum(st.peakCd, 1) + ' <small>cd</small>';
    $('rdFlux').innerHTML = fmtNum(st.flux, 0) + ' <small>lm</small>';
    $('rdBeam').innerHTML = deg0(st.beamA) + ' × ' + deg0(st.beamB) + upTag;
    $('rdField').innerHTML = deg0(st.fieldA) + ' × ' + deg0(st.fieldB) + upTag;
    $('rdCenter').innerHTML = fmtNum(st.centerCd / (S.floorH * S.floorH), 1) + ' <small>lx at ' + S.floorH.toFixed(1) + ' m</small>';
    const t = a => Math.tan(Math.min(a, 85) * DEG);
    const ok = !st.up && st.h50.every(v => v > 0.4 && v < 80);
    $('rdFoot').innerHTML = ok
      ? (S.floorH * (t(st.h50[0]) + t(st.h50[2]))).toFixed(1) + ' × ' + (S.floorH * (t(st.h50[1]) + t(st.h50[3]))).toFixed(1) + ' <small>m</small>'
      : '–';
    $('rdUp').innerHTML = (st.upFrac * 100).toFixed(st.upFrac < 0.1 ? 1 : 0) + ' <small>% of flux</small>';
    $('scaleHint').textContent = S.scaleMode === 'flux' ? 'Peak ' + fmtNum(st.peakCd, 0) + ' cd for this flux.' : 'About ' + fmtNum(st.flux, 0) + ' lm for this peak.';
  }

  /* ---------- file text, copy, save ---------- */
  const today = () => new Date().toISOString().slice(0, 10);
  const currentIES = () => {
    const F = comp(), full = fineDetail();
    return buildIES(Object.assign({}, S, { outMode: outModeFor(S.layers), sample: (v, H) => fieldAt(F, v, H), hstep: full ? Math.min(S.hstep, 2.5) : S.hstep }), cstats(), today());
  };
  function slug() { return (asciiClean(S.meta.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile').slice(0, 48); }
  function refreshText() {
    if (!$('fileDet').open) return;
    const t = currentIES();
    $('iesText').value = t;
    $('fileMeta').textContent = t.split('\r\n').length - 1 + ' lines · ' + (t.length / 1024).toFixed(1) + ' KB' + (outModeFor(S.layers) === 'asym' ? ' · all directions 0–360°' : '');
  }
  function scheduleText() { if (!$('fileDet').open) return; clearTimeout(iesTimer); iesTimer = setTimeout(refreshText, 250); }
  async function copyIES() {
    const t = currentIES();
    try { await navigator.clipboard.writeText(t); say('Copied ' + (t.split('\r\n').length - 1) + ' lines. Paste them into a text file and name it ' + slug() + '.ies.'); }
    catch (e) {
      $('fileDet').open = true; refreshText(); $('iesText').focus(); $('iesText').select();
      say('Copying was blocked in this view. The file text is selected below, so press Ctrl+C or ⌘C.');
    }
  }
  let dl = null;
  // outside Claude the browser can download any file type, so the .ies is saved directly
  function browserSave(name, data, type) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([data], { type }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function saveFile(kind) {
    const t = currentIES(), base = slug();
    if (!dl) { browserSave(base + '.ies', t, 'application/octet-stream'); say('Saved ' + base + '.ies. Drag it into the Unreal Content Browser.'); return; }
    try {
      if (kind === 'zip') await dl.save({ filename: base + '.zip', data: makeZip(base + '.ies', t) });
      else await dl.save({ filename: base + '.ies.txt', data: t });
      say(kind === 'zip' ? 'Saved ' + base + '.zip. Unpack it to get ' + base + '.ies.' : 'Saved ' + base + '.ies.txt. Rename it to end in .ies before importing.');
    } catch (e) {
      if (e && e.code === 'declined') say('Save cancelled.');
      else say('Saving is not available here (' + ((e && e.code) || 'error') + '). Use Copy file instead.', 'err');
    }
  }
  /* ---------- project files: a JSON file (.iesproj) with every layer, modifier and setting ---------- */
  const PROJ_FORMAT = 'ies-profile-studio-project';
  async function saveProject() {
    syncCur();
    const name = slug() + '.iesproj', text = JSON.stringify({ format: PROJ_FORMAT, version: 1, saved: new Date().toISOString(), state: stateObj() });
    try {
      if (dl) await dl.save({ filename: name, data: text });
      else browserSave(name, text, 'application/json');
      say('Saved the project as ' + name + '. Open it later with Open project to carry on editing.');
    } catch (e) {
      if (e && e.code === 'declined') say('Save cancelled.');
      else say('Saving is not available here (' + ((e && e.code) || 'error') + ').', 'err');
    }
  }
  function openProjectText(text, fname) {
    let j = null; try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
    if (!j || j.format !== PROJ_FORMAT || !j.state) { say('"' + fname + '" is not an IES Profile Studio project. To bring in an .ies file, use Import .ies.', 'err'); return; }
    pushHist(); syncCur();
    const keep = stateObj();
    if (!applyState(j.state)) { applyState(keep); say('"' + fname + '" could not be read. Nothing was changed.', 'err'); return; }
    fieldCache.clear(); renderLayers(); syncAll(); dirty(); queue(); saveSoon();
    say('Opened ' + fname + ' with ' + S.layers.length + (S.layers.length === 1 ? ' layer.' : ' layers.') + ' Undo goes back to what you had before.');
  }
  function importText(text, fname) {
    const r = parseIES(text);
    if (r.error) { say(r.error, 'err'); return; }
    pushHist(); syncCur();
    const nm = (r.name || fname.replace(/\.[^.]+$/, '')).slice(0, 40) || 'Imported';
    const L = newLayer({ name: nm, type: 'ies', mode: r.mode, planes: r.planes, grid: r.grid });
    const only = S.layers.length === 1 && S.layers[0].type === 'curve' && hist.length <= 1;
    if (only) S.layers = [L]; else S.layers.splice(S.cur + 1, 0, L);
    S.cur = S.layers.indexOf(L); bindCur();
    if (only) { S.scaleMode = 'peak'; S.peakCd = +r.peakCd.toPrecision(5); S.meta.name = nm; S.meta.manufac = (r.manufac || '').slice(0, 60); S.meta.watts = r.watts > 0 ? r.watts : 0; }
    S.preset = null;
    renderLayers(); syncAll(); dirty();
    say('Imported ' + r.info.nv + ' vertical × ' + r.info.nh + ' horizontal angles as the layer "' + nm + '", with every direction kept.' + (only ? '' : ' Its peak in the file is ' + fmtNum(r.peakCd, 0) + ' cd.'));
  }

  /* ---------- persistence ---------- */
  function saveSoon() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(stateObj())); } catch (e) { /* storage unavailable */ }
    }, 500);
  }
  // everything needed to carry on editing: the browser keeps one copy, project files carry the same object
  function stateObj() {
    return {
          v: 2, active: S.active, preset: S.preset, cur: S.cur,
          layers: (syncCur(), S.layers.map(L => ({ name: L.name, type: L.type, on: L.on, blend: L.blend, amount: L.amount, turn: L.turn, mods: L.mods.map(m => ({ type: m.type, on: m.on, p: m.p })),
            mode: L.mode, planes: L.planes.map(a => Array.from(a, v => +v.toFixed(4))), knots: L.knots, grid: L.grid ? Array.from(L.grid, v => +v.toFixed(4)) : null }))),
          scaleMode: S.scaleMode, peakCd: S.peakCd, fluxLm: S.fluxLm, meta: S.meta, lumensMode: S.lumensMode, vstep: S.vstep, hstep: S.hstep,
          tool: S.tool, brush: S.brush, smoothStr: S.smoothStr, gen: S.gen, xr: S.xr, ys: S.ys,
          hmode: S.hmode, surf: S.surf, ceilD: S.ceilD, cam3d: { yaw: V3.yaw, pitch: V3.pitch, zoom: V3.zoom }, fit: S.fit, floorH: S.floorH, floorRange: S.floorRange, bands: S.bands, wallD: S.wallD, wallC: S.wallC, pvLook: S.pvLook, kelvin: S.kelvin, ev: S.ev, amb: S.amb
    };
  }
  function validKnots(k) {
    if (!Array.isArray(k) || k.length < 2 || k.length > 64) return null;
    for (let i = 0; i < k.length; i++) {
      const p = k[i];
      if (!Array.isArray(p) || p.length !== 2 || !p.every(x => typeof x === 'number' && isFinite(x))) return null;
      if (p[1] < 0 || p[1] > 1 || (i && p[0] <= k[i - 1][0])) return null;
    }
    return k[0][0] === 0 && k[k.length - 1][0] === 180 ? k.map(p => [p[0], p[1]]) : null;
  }
  function loadSaved() {
    try { return applyState(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return false; }
  }
  function applyState(j) {
    try {
      if (!j || (j.v !== 1 && j.v !== 2)) return false;
      const num = (x, d, lo, hi) => (typeof x === 'number' && isFinite(x) ? clamp(x, lo, hi) : d);
      const okArr = (a, n) => Array.isArray(a) && a.length === n && a.every(x => typeof x === 'number' && isFinite(x));
      const readLayer = o => {
        if (!o || !MODES[o.mode] || !Array.isArray(o.planes) || o.planes.length !== 4 || !o.planes.every(a => okArr(a, N))) return null;
        const ies = o.type === 'ies' && okArr(o.grid, NC * N), adj = o.type === 'adjust';
        return newLayer({
          name: String(o.name || 'Layer').slice(0, 40), type: ies ? 'ies' : adj ? 'adjust' : 'curve', on: o.on !== false, blend: BLENDS[o.blend] ? o.blend : 'add',
          amount: num(o.amount, 1, 0, 2), turn: num(o.turn, 0, 0, 359), mode: o.mode, planes: o.planes.map(a => Float32Array.from(a, v => clamp(v, 0, 1))),
          knots: Array.isArray(o.knots) && o.knots.length === 4 ? o.knots.map(validKnots) : [null, null, null, null], grid: ies ? Float32Array.from(o.grid, v => Math.max(0, v)) : null,
          mods: Array.isArray(o.mods) ? o.mods.map(m => m && m.type === 'tilt' ? { type: 'transform', on: m.on, p: { tilt: m.p && m.p.angle, rotate: m.p && m.p.toward } } : m).filter(m => m && MOD_TYPES[m.type]).slice(0, 12).map(m => {
            const p = {}; (MOD_FIELDS[m.type] || []).forEach(([k, , mn, mx]) => { p[k] = num(m.p && m.p[k], MOD_TYPES[m.type].defaults[k], mn, mx); });
            if (m.type === 'gobo' && m.p && typeof m.p.img === 'string' && m.p.img.length < 60000 && /^\d+:\d+:[A-Za-z0-9+/=]+$/.test(m.p.img)) p.img = m.p.img;
            return { id: modSeq++, type: m.type, on: m.on !== false, p };
          }) : []
        });
      };
      const layers = j.v === 2 && Array.isArray(j.layers) ? j.layers.slice(0, 16).map(readLayer).filter(Boolean) : [readLayer({ name: j.meta && j.meta.name || 'Layer 1', mode: j.mode, planes: j.planes, knots: j.knots })].filter(Boolean);
      if (!layers.length) return false;
      S.layers = layers; S.cur = clamp(Math.round(num(j.cur, 0, 0, 99)), 0, layers.length - 1); bindCur();
      S.active = MODES[S.mode].tabs[j.active] ? j.active : 0; S.preset = PRESETS.some(p => p.id === j.preset) ? j.preset : null;
      S.scaleMode = j.scaleMode === 'flux' ? 'flux' : 'peak'; S.peakCd = num(j.peakCd, 4000, 0.01, 1e8); S.fluxLm = num(j.fluxLm, 1000, 0.01, 1e8);
      if (j.meta) { S.meta.name = String(j.meta.name || '').slice(0, 60); S.meta.manufac = String(j.meta.manufac || '').slice(0, 60); S.meta.watts = num(j.meta.watts, 0, 0, 1e6); }
      S.lumensMode = j.lumensMode === 'abs' ? 'abs' : 'flux';
      S.vstep = [1, 2, 2.5, 5].includes(j.vstep) ? j.vstep : 1; S.hstep = [1, 2.5, 5, 10, 15, 22.5, 30].includes(j.hstep) ? j.hstep : 15;
      S.tool = TOOLS.some(t => t[0] === j.tool) ? j.tool : 'points'; S.brush = num(j.brush, 6, 1, 30); S.smoothStr = num(j.smoothStr, 0.6, 0.02, 1);
      if (j.gen && GEN_FIELDS[j.gen.type]) { S.gen = Object.assign({}, GEN_DEFAULT); Object.keys(GEN_DEFAULT).forEach(k => { if (k !== 'type' && typeof j.gen[k] === 'number' && isFinite(j.gen[k])) S.gen[k] = j.gen[k]; }); S.gen.type = j.gen.type; }
      S.xr = ['auto', '90', '180'].includes(j.xr) ? j.xr : 'auto'; S.ys = j.ys === 'log' ? 'log' : 'lin';
      S.surf = j.surf === 'ceil' ? 'ceil' : 'floor'; S.ceilD = num(j.ceilD, 1.2, 0.1, 8);
      if (j.cam3d) { V3.yaw = num(j.cam3d.yaw, 32, -180, 180); V3.pitch = num(j.cam3d.pitch, 24, -88, 88); V3.zoom = num(j.cam3d.zoom, 1.2, 0.35, 3); }
      S.hmode = ['points', 'edges', 'off'].includes(j.hmode) ? j.hmode : j.handles === false ? 'off' : 'points'; S.handles = S.hmode !== 'off';
      S.fit = j.fit !== false; S.floorH = num(j.floorH, 3, 0.5, 12); S.floorRange = num(j.floorRange, 6, 0.5, 40); S.bands = !!j.bands;
      S.pvLook = j.pvLook === 'lit' ? 'lit' : 'heat'; S.kelvin = num(j.kelvin, 4000, 1000, 20000); S.ev = num(j.ev, 0, -4, 4); S.amb = num(j.amb, 0.15, 0, 1);
      S.wallD = num(j.wallD, 0.6, 0.1, 5); S.wallC = [0, 90, 180, 270].includes(j.wallC) ? j.wallC : 0;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('smoothStr').addEventListener('input', e => { S.smoothStr = parseFloat(e.target.value); $('smoothStrVal').textContent = Math.round(S.smoothStr * 100) + '%'; saveSoon(); });
    $('smoothStr').addEventListener('dblclick', () => { S.smoothStr = 0.6; renderTools(); saveSoon(); });
    $('brush').addEventListener('input', e => { S.brush = parseInt(e.target.value, 10); $('brushVal').textContent = S.brush + '°'; queue('ed'); saveSoon(); });
    $('btnUndo').addEventListener('click', undo); $('btnRedo').addEventListener('click', redo);
    $('btnSmooth').addEventListener('click', () => planeOp(a => smoothAll(a, 3)));
    $('btnMirror').addEventListener('click', () => planeOp(mirrorUp));
    $('btnZero').addEventListener('click', () => planeOp(zeroUp));
    $('btnAll').addEventListener('click', () => {
      if (!guardEdit()) return;
      pushHist(); const src = S.planes[S.active], sk = S.knots[S.active];
      MODES[S.mode].tabs.forEach((_, k) => { if (k !== S.active) { S.planes[k] = src.slice(); S.knots[k] = sk ? sk.map(p => p.slice()) : null; } });
      dirty(); say('Copied ' + MODES[S.mode].tabs[S.active] + ' to every direction.');
    });
    $('btnSimplify').addEventListener('click', () => {
      if (!guardEdit()) return;
      const before = getKnots(S.active).length;
      pushHist(); S.knots[S.active] = fitKnots(S.planes[S.active], 0.02, 12); commitKnots(S.active); S.sel = -1;
      if (S.tool !== 'points') setTool('points');
      dirty(); say('Refit with ' + S.knots[S.active].length + ' points (was ' + before + '). Undo if the shape changed too much.');
    });
    $('warnFix').addEventListener('click', () => {
      if (!guardEdit()) return;
      pushHist(); matchPole(S.planes, used(), warnPole); used().forEach(k => { S.knots[k] = null; }); S.sel = -1; dirty();
      say('All directions now match at ' + warnPole + '°, blended over the nearest 10°.');
    });
    $('genApply').addEventListener('click', () => applyGen(false)); $('genAll').addEventListener('click', () => applyGen(true));
    $('genDet').addEventListener('toggle', () => queue('ed'));
    $('scaleIn').addEventListener('input', e => {
      const v = parseFloat(e.target.value); if (!(v > 0)) return;
      if (S.scaleMode === 'flux') S.fluxLm = v; else S.peakCd = v;
      dirty();
    });
    $('fName').addEventListener('input', e => { S.meta.name = e.target.value; scheduleText(); saveSoon(); });
    $('fManu').addEventListener('input', e => { S.meta.manufac = e.target.value; scheduleText(); saveSoon(); });
    $('fWatts').addEventListener('input', e => { const v = parseFloat(e.target.value); S.meta.watts = v > 0 ? v : 0; scheduleText(); saveSoon(); });
    $('fLum').addEventListener('change', e => { S.lumensMode = e.target.value; scheduleText(); saveSoon(); });
    $('fV').addEventListener('change', e => { S.vstep = parseFloat(e.target.value); scheduleText(); saveSoon(); });
    $('fH').addEventListener('change', e => { S.hstep = parseFloat(e.target.value); scheduleText(); saveSoon(); });
    $('floorH').addEventListener('input', e => { S.floorH = parseFloat(e.target.value); $('floorHVal').textContent = S.floorH.toFixed(1) + ' m'; lastEdit = performance.now(); queue('pv', 'read'); saveSoon(); });
    $('floorR').addEventListener('input', e => { S.floorRange = parseFloat(e.target.value); lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('fitChk').addEventListener('change', e => { S.fit = e.target.checked; $('floorR').disabled = S.fit; queue('pv'); saveSoon(); });
    ['bandsChk', 'bandsChkW'].forEach(id => $(id).addEventListener('change', e => { S.bands = e.target.checked; $('bandsChk').checked = $('bandsChkW').checked = S.bands; queue('pv'); saveSoon(); }));
    $('ceilD').addEventListener('input', e => { S.ceilD = parseFloat(e.target.value); $('ceilDVal').textContent = S.ceilD.toFixed(1) + ' m'; lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('kelvin').addEventListener('input', e => { S.kelvin = parseFloat(e.target.value); syncLookCtl(); lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('kelvinNum').addEventListener('change', e => { const v = parseFloat(e.target.value); if (isFinite(v)) { S.kelvin = Math.round(clamp(v, 1000, 20000)); syncLookCtl(); queue('pv'); saveSoon(); } });
    $('ev').addEventListener('input', e => { S.ev = parseFloat(e.target.value); syncLookCtl(); lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('ev').addEventListener('dblclick', () => { S.ev = 0; syncLookCtl(); queue('pv'); saveSoon(); });
    $('amb').addEventListener('input', e => { S.amb = parseFloat(e.target.value); syncLookCtl(); lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('wallD').addEventListener('input', e => { S.wallD = parseFloat(e.target.value); $('wallDVal').textContent = S.wallD.toFixed(2) + ' m'; lastEdit = performance.now(); queue('pv'); saveSoon(); });
    $('polarCv').addEventListener('pointermove', polarHover);
    $('polarCv').addEventListener('pointerleave', () => { $('polarHover').textContent = ' '; });
    $('fileDet').addEventListener('toggle', () => { if ($('fileDet').open) refreshText(); });
    $('btnCopy').addEventListener('click', copyIES);
    $('btnZip').addEventListener('click', () => saveFile('zip')); $('btnTxt').addEventListener('click', () => saveFile('txt'));
    $('btnImport').addEventListener('click', () => $('fileIn').click());
    $('btnSaveProj').addEventListener('click', saveProject);
    $('btnOpenProj').addEventListener('click', () => $('projIn').click());
    $('projIn').addEventListener('change', () => {
      const f = $('projIn').files && $('projIn').files[0]; $('projIn').value = ''; if (!f) return;
      if (f.size > 32 * 1024 * 1024) { say('That file is too large to be a project.', 'err'); return; }
      const rd = new FileReader(); rd.onload = () => openProjectText(String(rd.result), f.name); rd.onerror = () => say('That file could not be read.', 'err'); rd.readAsText(f);
    });
    $('fileIn').addEventListener('change', () => {
      const f = $('fileIn').files && $('fileIn').files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { say('That file is larger than 8 MB, so it is probably not an IES profile.', 'err'); $('fileIn').value = ''; return; }
      const rd = new FileReader();
      rd.onload = () => importText(String(rd.result), f.name);
      rd.onerror = () => say('The file could not be read.', 'err');
      rd.readAsText(f); $('fileIn').value = '';
    });
    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      const t = TOOLS.find(x => x[2].toLowerCase() === e.key.toLowerCase());
      if (t) { setTool(t[0]); return; }
      if (/^[1-4]$/.test(e.key)) setActive(parseInt(e.key, 10) - 1);
    });
    bindEditor(); bindPreview(); bindLayers(); v3Init(); bindView3D();
    bindTips();
    const rq = () => queue();
    if (window.ResizeObserver) { const ro = new ResizeObserver(rq); ['edCv', 'polarCv', 'floorCv', 'wallCv', 'd3Cv'].forEach(i => ro.observe($(i))); }
    else window.addEventListener('resize', rq);
    try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rq); } catch (e) { /* old browsers */ }
    new MutationObserver(rq).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- boot ---------- */
  wire();
  if (!loadSaved()) {
    const p = PRESETS[0];
    S.layers = [newLayer({ name: p.name, mode: p.mode, planes: presetPlanes(p) })]; S.cur = 0; bindCur(); fixPoles(); syncCur();
    S.peakCd = p.peak; S.meta.name = p.name; S.gen = Object.assign({}, GEN_DEFAULT, p.specs[0]); S.preset = p.id;
  }
  renderLayers();
  if (window.matchMedia && window.matchMedia('(max-width: 700px)').matches) { $('genDet').open = false; $('expDet').open = false; }
  syncAll(); queue();
  say('Pick a starting point, then drag the points on the curve. Everything updates live.');
  (async () => {
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    // in Claude: .zip and .txt (the app can't save .ies directly); in a plain browser: one Save .ies button
    $('btnZip').hidden = false; $('btnTxt').hidden = !dl; if (!dl) $('btnZip').textContent = 'Save .ies';
  })();
})();
