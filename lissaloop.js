/* ============================================================
   lissaloop.js — LissaLoop, vector oscilloscope live coding library
   License: MIT — see LICENSE (p5.js and p5.sound in lib/ keep their own LGPL-2.1)
   Requires: p5.js + p5.sound + audio.js
   A beam is a point of light that draws a figure many times per second
   and leaves a glow on the phosphor of the screen.
   Quick start:
     b = beam()                  // a beam with a random Lissajous figure and color
     b.draw()                    // inside live()
   Figures (choose one):
     b.lissa(3, 2)               // Lissajous x:y = 3:2 (phase in turns: .phase(0.25))
     b.lissa(3, 2, 5)            // 3D Lissajous: z turns 5 times (flat until you turn it)
     b.tilt(0.1).orbit(0.25)     // 3D view: lean towards you · keep turning (turns per bar)
     b.flat()                    // always flat 2D, whatever it was before
     b.rose(5)                   // flower with 5 petals (.rose(5, 3) = 5/3)
     b.poly(5, 2)                // star polygon {5/2} (.poly(4) = square)
     b.ring()                    // a circle bent by the sound wave
     b.wave()                    // classic scope: the sound wave, with trigger
     b.xy()                      // X-Y mode: the wave against itself, delayed
     b.wave().raw()              // the wave as it comes: real volume, no trigger
     b.fn(t => [sin(3*t), cos(2*t)]) // your own figure, t = 0..TAU
     b.fn((t, u, p) => [sin(p.a*t), cos(p.b*t)]).r('a', bass, 2, 8) // p = settings
   Look and motion (everything chainable, numbers or signals):
     b.size(0.6).at(0, 0)        // size (1 = fills the screen) · center (-1..1)
     b.stretch(1.5, 1)           // stretch x, y
     b.rot(0.125).spin(1)        // angle in turns · turns per bar (follows the tempo)
     b.drift(0.1)                // the figure slowly changes its phase (turns per bar)
     b.col('#7dff9a').width(2).glow(0.8)
     b.form('tri')               // waves of the Lissajous: 'sin' 'tri' 'sqr' 'saw'
     b.wob(0.3)                  // the sound wave shakes the figure
     b.fuzz(0.2)                 // noise on the beam
     b.echo(4, 0.8, 0.05)        // copies: how many, scale, turn
     b.loops(2)                  // trace the figure twice (0.5 = only half of it)
     b.dots()                    // draw dots instead of a line
     b.r('size', bass, 1.5)      // sound reactions, like flocks.js
   Screen: trail(0.1) · grid(0.3) · crt(0.5)
   ============================================================ */

// ---------- HELPERS ----------
function _num(x, d = 0) {
  if (typeof x === 'function') x = x();
  return Number.isFinite(x) ? x : d;
}
const _clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function _rgb2hsb(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, mx ? (d / mx) * 100 : 0, mx * 100];
}
function _hsb2rgb(h, s, v) {
  s /= 100; v /= 100;
  const f = n => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

// ---------- SCREEN (phosphor) ----------
// Beams draw on an offscreen layer (the phosphor) that fades a little every
// frame. show() puts it on the canvas over the grid and under the CRT glass.
let _scr = null, _trail = 40, _grid = 0, _crt = 0.5, _crtL = null;

// a: 0..1 (fraction) or 0..255 (alpha). trail(0) = endless, trail(1) = none
function trail(a) { _trail = a <= 1 ? a * 255 : a; }
// graticule of a real scope, 0..1 (0 = off)
function grid(a = 0.3) { _grid = a; }
// CRT glass: scanlines + dark corners, 0..1 (0 = off)
function crt(a = 0.5) { if (a !== _crt) _crtL = null; _crt = a; }

function _screen() {
  // no size yet (hidden tab, window still opening): skip the frame instead of
  // making a 0×0 layer, which makes drawImage throw and stops the draw loop
  if (typeof width === 'undefined' || width < 1 || height < 1) return null;
  if (!_scr || _scr.width !== width || _scr.height !== height) {
    if (_scr) _scr.remove();
    _scr = createGraphics(width, height);
    _scr.pixelDensity(Math.min(2, pixelDensity()));
    _scr.background(0);
    _crtL = null;
  }
  return _scr;
}

// fades the phosphor. Same trick as flocks.js: a long trail paints a stronger
// fade every few frames, so 8-bit rounding doesn't leave a gray ghost
function phosphor() {
  const g = _screen();
  if (!g) return;
  const ctx = g.drawingContext;
  ctx.globalCompositeOperation = 'source-over';
  if (_trail > 0) {
    if (_trail >= 14) g.background(0, _trail);
    else {
      const k = Math.ceil(14 / _trail);
      if (frameCount % k === 0) g.background(0, Math.min(255, _trail * k));
    }
  }
  ctx.globalCompositeOperation = 'lighter'; // light adds up, like on a real tube
}

function show() {
  const g = _screen();
  if (!g) return;
  background(0);
  if (_grid > 0) _drawGrid();
  drawingContext.globalCompositeOperation = 'lighter';
  image(g, 0, 0, width, height);
  drawingContext.globalCompositeOperation = 'source-over';
  if (_crt > 0) {
    if (!_crtL) _crtL = _mkCrt();
    image(_crtL, 0, 0, width, height);
  }
}

function _drawGrid() {
  const D = Math.min(width, height) / 8, cx = width / 2, cy = height / 2;
  push();
  stroke(120, 255, 170, 90 * _grid);
  strokeWeight(1);
  for (let x = cx % D; x < width; x += D) line(x, 0, x, height);
  for (let y = cy % D; y < height; y += D) line(0, y, width, y);
  stroke(120, 255, 170, 160 * _grid);
  line(cx, 0, cx, height); line(0, cy, width, cy);
  for (let x = cx % (D / 5); x < width; x += D / 5) line(x, cy - 4, x, cy + 4);
  for (let y = cy % (D / 5); y < height; y += D / 5) line(cx - 4, y, cx + 4, y);
  pop();
}

function _mkCrt() {
  const g = createGraphics(width, height);
  g.pixelDensity(1);
  g.noStroke();
  g.fill(0, 90 * _crt);
  for (let y = 0; y < height; y += 3) g.rect(0, y, width, 1);
  const ctx = g.drawingContext;
  const r = Math.hypot(width, height) / 2;
  const grd = ctx.createRadialGradient(width / 2, height / 2, r * 0.45, width / 2, height / 2, r);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, `rgba(0,0,0,${0.85 * _crt})`);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);
  return g;
}

// ---------- SOUND WAVE, NORMALIZED ----------
// 512 samples starting at the trigger, divided by the recent peak
// (automatic gain), so quiet and loud music draw figures of the same size
let _wnFrame = -1, _wpk = 0.05;
const _wn = new Float32Array(512);
function _waveN() {
  if (frameCount === _wnFrame) return _wn;
  _wnFrame = frameCount;
  const w = _wave();
  let m = 0;
  for (let i = 0; i < w.length; i++) m = Math.max(m, Math.abs(w[i]));
  _wpk = Math.max(_wpk * 0.98, m, 0.05);
  const t = _trigger(w, w.length - 512);
  for (let i = 0; i < 512; i++) _wn[i] = w[t + i] / _wpk;
  return _wn;
}
function _samp(W, u) {
  const x = _clamp(u, 0, 1) * (W.length - 1), i = Math.floor(x), f = x - i;
  return W[i] * (1 - f) + W[Math.min(W.length - 1, i + 1)] * f;
}

// ---------- DRAWING A BEAM ----------
// A real beam is brighter where it moves slowly and fainter where it jumps.
// Each segment gets a brightness from its length; segments are grouped in a
// few brightness levels, and each level is stroked 3 times: wide faint halo,
// narrow halo, and a whitish core.
const _LV = 5;
function _render(ctx, P, n, closed, rgb, alpha, w, glow, dots, D) {
  if (alpha <= 0.002 || n < 2) return;
  const segs = closed ? n : n - 1;
  let tot = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    tot += Math.hypot(P[2 * j] - P[2 * i], P[2 * j + 1] - P[2 * i + 1]);
  }
  const ref = (tot / segs) * 0.6 + 0.001;
  const paths = [];
  for (let k = 0; k < _LV; k++) paths.push(new Path2D());
  let prevLv = -1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const x0 = P[2 * i], y0 = P[2 * i + 1], x1 = P[2 * j], y1 = P[2 * j + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    let b = _clamp(Math.pow(ref / (L + 0.001), 0.6), 0.04, 1);
    if (D) b *= (D[i] + D[j]) / 2;          // 3D: the far side is dimmer
    const lv = Math.min(_LV - 1, Math.floor(b * _LV));
    const p = paths[lv];
    if (dots) { p.moveTo(x0 + w, y0); p.arc(x0, y0, w, 0, TAU); continue; }
    if (lv !== prevLv) p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    prevLv = lv;
  }
  const [r, g, bl] = rgb;
  const core = `${Math.round(r + (255 - r) * 0.55)},${Math.round(g + (255 - g) * 0.55)},${Math.round(bl + (255 - bl) * 0.55)}`;
  const col = `${Math.round(r)},${Math.round(g)},${Math.round(bl)}`;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < _LV; k++) {
    const a = ((k + 1) / _LV) * alpha;
    const p = paths[k];
    if (dots) {
      if (glow > 0) {
        ctx.strokeStyle = `rgba(${col},${0.25 * glow * a})`; ctx.lineWidth = w * 3; ctx.stroke(p);
      }
      ctx.fillStyle = `rgba(${core},${0.95 * a})`; ctx.fill(p);
      continue;
    }
    if (glow > 0) {
      ctx.strokeStyle = `rgba(${col},${0.04 * glow * a})`; ctx.lineWidth = w * 9; ctx.stroke(p);
      ctx.strokeStyle = `rgba(${col},${0.14 * glow * a})`; ctx.lineWidth = w * 3.5; ctx.stroke(p);
    }
    ctx.strokeStyle = `rgba(${core},${0.9 * a})`; ctx.lineWidth = w; ctx.stroke(p);
  }
}

// ---------- BEAM ----------
const _PAL = ['#7dff9a', '#7dff9a', '#ffb347', '#5cd6ff', '#ff5c8a', '#d9e4ff'];
const _FORMS = {
  sin: Math.sin,
  tri: t => (2 / Math.PI) * Math.asin(Math.sin(t)),
  sqr: t => Math.tanh(6 * Math.sin(t)) / Math.tanh(6),
  saw: t => { const x = t / TAU; return 2 * (x - Math.floor(x + 0.5)); },
};
const _PROPS = ['size', 'x', 'y', 'sx', 'sy', 'rot', 'spin', 'width', 'glow', 'hue', 'sat', 'bri',
  'alpha', 'a', 'b', 'ph', 'drift', 'fuzz', 'wob', 'gain', 'd', 'pts', 'echo', 'scale', 'turn', 'loops', 'c', 'yaw', 'tilt', 'orbit', 'persp'];
const _isInt = x => Math.abs(x - Math.round(x)) < 0.001;
let _lastBeam = null;
let _warn = null; // last warning of the library (reset on every run)

class Beam {
  constructor() {
    const a = random([1, 2, 3, 3, 4, 5]);
    let b = random([1, 2, 2, 3, 4]);
    if (b === a) b = a + 1;
    this._roll = { col: random(_PAL), a, b }; // random start, kept on re-runs
    this._st = {};          // glided values of the settings
    this._ang = 0;          // rotation turned by spin()
    this._dph = 0;          // phase moved by drift()
    this._lastB = null;     // beat count of the last frame
    this._last = null;      // last figure (for morphing)
    this._snap = null; this._m = 0; this._drawn = null;
    this._orb = 0;          // 3D turn made by orbit()
    this._Z = null; this._lastZ = null; this._snapZ = null; // depth of the figure (3D)
    this._reset();
  }

  // every setting back to its default (constructor and every re-run)
  _reset() {
    this._p = {
      size: 0.6, x: 0, y: 0, sx: 1, sy: 1, rot: 0, spin: 0, width: 1.6, glow: 0.7,
      a: this._roll.a, b: this._roll.b, ph: 0.25, drift: 0.05, fuzz: 0, wob: 0,
      gain: 1, d: null, pts: 900, echo: 0, scale: 0.8, turn: 0, loops: 1,
      c: null, yaw: 0, tilt: 0, orbit: 0, persp: 1,
    };
    this.col(this._roll.col);
    this._mode = 'lissa'; this._form = 'sin'; this._fn = null;
    this._dots = false; this._glide = 0.9; this._raw = false; this._flat = false;
    this._rx = [{ prop: 'size', fn: bass, a: 1.3 }]; // until your first r()
    this._rxAuto = true;
    _lastBeam = this;
    return this;
  }

  _set(k, v) { this._p[k] = v; return this; }

  // --- figures ---
  // lissa(a, b) is flat; lissa(a, b, c) adds depth z = cos(c·t). Figures are seen
  // flat by default: the depth shows when you turn them (.tilt() .orbit() .yaw())
  lissa(a = 3, b = 2, c = null) {
    this._mode = 'lissa'; this._p.a = a; this._p.b = b; this._p.ph = 0.25; this._p.c = c;
    return this;
  }
  rose(n = 5, d = 1, ph = 0)     { this._mode = 'rose';  this._p.a = n; this._p.b = d; this._p.ph = ph; return this; }
  poly(n = 5, m = 1, ph = 0.25)  { this._mode = 'poly';  this._p.a = n; this._p.b = m; this._p.ph = ph; return this; }
  ring(gain = 1)  { this._mode = 'ring'; this._p.gain = gain; this._p.ph = 0; return this; }
  wave(gain = 1)  { this._mode = 'wave'; this._p.gain = gain; return this; }
  xy(gain = 1, d = null) { this._mode = 'xy'; this._p.gain = gain; this._p.d = d; return this; }
  fn(f) { if (typeof f === 'function') { this._mode = 'fn'; this._fn = f; } return this; }
  // wave / ring / xy with the sound exactly as it comes: real volume (no automatic
  // gain: quiet music draws small) and, for wave(), no trigger and the whole buffer
  raw(on = true) { this._raw = on; return this; }
  form(f) { if (_FORMS[f]) this._form = f; return this; }

  // --- look and motion ---
  size(s)         { return this._set('size', s); }
  at(x, y = 0)    { this._p.x = x; this._p.y = y; return this; }
  stretch(sx, sy = sx) { this._p.sx = sx; this._p.sy = sy; return this; }
  rot(a)          { return this._set('rot', a); }
  spin(s)         { return this._set('spin', s); }
  drift(d)        { return this._set('drift', d); }
  phase(p)        { return this._set('ph', p); }
  width(w)        { return this._set('width', w); }
  glow(g)         { return this._set('glow', g); }
  fuzz(f)         { return this._set('fuzz', f); }
  wob(w)          { return this._set('wob', w); }
  gain(g)         { return this._set('gain', g); }
  pts(n)          { return this._set('pts', n); }
  loops(n)        { return this._set('loops', n); } // how many times the figure is traced (< 1 = only a part)
  // --- 3D (any figure can turn in space; lissa(a, b, c) and fn → [x, y, z] have depth) ---
  tilt(t)         { return this._set('tilt', t); }   // lean towards you, in turns (0.25 = seen from above)
  yaw(y)          { return this._set('yaw', y); }    // turn around the vertical axis, in turns
  orbit(o)        { return this._set('orbit', o); }  // keep turning around the vertical axis, turns per bar
  persp(p)        { return this._set('persp', p); }  // perspective: 0 flat … 1 normal … 2 strong
  flat(on = true) { this._flat = on; return this; }  // always 2D: no depth, no 3D turns (spin still works)
  echo(n = 3, scale = 0.8, turn = 0) { this._p.echo = n; this._p.scale = scale; this._p.turn = turn; return this; }
  dots(on = true) { this._dots = on; return this; }
  glide(g)        { this._glide = _clamp(_num(g, 0.9), 0, 0.99); return this; }
  col(c) {
    if (typeof c === 'function') c = c();
    const l = color(c).levels;
    const [h, s, b] = _rgb2hsb(l[0], l[1], l[2]);
    this._p.hue = h; this._p.sat = s; this._p.bri = b; this._p.alpha = l[3];
    return this;
  }

  // --- sound ---
  // r(prop, signal, x)        multiply: ×1 in silence → ×x at full signal (hue: + x degrees)
  // r(prop, signal, min, max) range: min in silence → max at full signal
  r(prop, fn, a, b) {
    if (!_PROPS.includes(prop)) {
      // shown on screen by the editor (the code keeps running)
      const fig = { lissa: 'a, b', rose: 'a (petals), b', poly: 'a (corners), b (step)', ring: 'gain', wave: 'gain', xy: 'gain, d', phase: 'ph' }[prop];
      _warn = fig
        ? `r('${prop}'): the numbers of .${prop}() are ${fig} → .r('${fig.split(/[ ,]/)[0]}', ...)`
        : `r('${prop}'): unknown setting. Use: ${_PROPS.join(' ')}`;
      console.warn('[lissaloop]', _warn);
      return this;
    }
    if (this._rxAuto) { this._rx = []; this._rxAuto = false; }
    this._rx.push({ prop, fn, a: _num(a, 1), b: b === undefined ? undefined : _num(b, 0) });
    return this;
  }
  calm() { this._rx = []; this._rxAuto = false; return this; }

  // value of a setting this frame: glided base, then range reactions, then multipliers
  _v(k) {
    const tgt = _num(this._p[k], 0);
    const c0 = this._st[k];
    const c = c0 === undefined ? tgt : c0 + (tgt - c0) * (1 - this._glide);
    this._st[k] = c;
    let v = c;
    for (const r of this._rx) if (r.prop === k && r.b !== undefined) v = r.a + (r.b - r.a) * _num(r.fn, 0);
    for (const r of this._rx) {
      if (r.prop !== k || r.b !== undefined) continue;
      v = k === 'hue' ? v + r.a * _num(r.fn, 0) : v * (1 + (r.a - 1) * _num(r.fn, 0));
    }
    return v;
  }

  // the figure in unit space (-1..1), N points → Float32Array [x0, y0, x1, y1, ...]
  _shape(N, v) {
    const U = new Float32Array(2 * N), ph = TAU * (v.ph + this._dph);
    // loops: how many times t goes round (lissa, rose, poly, fn). A whole number of
    // loops can close the figure (the last point joins the first); otherwise the
    // path is open and its last point lands exactly at the end of the last loop
    const Lp = Math.max(0.001, v.loops);
    const cyc = (canClose) => (canClose ? N : N - 1);
    let closed = true;
    this._Z = null;
    switch (this._mode) {
      case 'lissa': {
        const F = _FORMS[this._form], a = v.a, b = v.b, c3 = this._p.c != null ? v.c : null;
        closed = _isInt(a * Lp) && _isInt(b * Lp) && (c3 === null || _isInt(c3 * Lp)) && Lp >= 0.999; // back at the start
        const den = cyc(closed);
        const Z = c3 === null ? null : (this._Z = new Float32Array(N));
        for (let i = 0; i < N; i++) {
          const th = (TAU * Lp * i) / den;
          U[2 * i] = F(a * th + ph); U[2 * i + 1] = F(b * th);
          if (Z) Z[i] = F(c3 * th + Math.PI / 2);
        }
        break;
      }
      case 'rose': {
        const d = Math.max(1, Math.round(v.b)), k = v.a / d, T = TAU * d * Lp;
        closed = _isInt(v.a) && _isInt(Lp);
        const den = cyc(closed);
        for (let i = 0; i < N; i++) {
          const th = (T * i) / den, r = Math.cos(k * th + ph);
          U[2 * i] = r * Math.cos(th); U[2 * i + 1] = r * Math.sin(th);
        }
        break;
      }
      case 'poly': {
        const n = Math.max(2, Math.round(v.a)), m = Math.max(1, Math.round(v.b));
        closed = _isInt(Lp);
        const den = cyc(closed);
        for (let i = 0; i < N; i++) {
          const t = (i / den) * n * Lp, e = Math.floor(t);
          let f = t - e;
          f = f * f * (3 - 2 * f); // the beam slows down at the corners → bright vertices
          const a0 = ph + (TAU * e * m) / n, a1 = ph + (TAU * (e + 1) * m) / n;
          U[2 * i] = Math.cos(a0) + (Math.cos(a1) - Math.cos(a0)) * f;
          U[2 * i + 1] = Math.sin(a0) + (Math.sin(a1) - Math.sin(a0)) * f;
        }
        break;
      }
      case 'ring': {
        const W = this._raw ? _wave() : _waveN();
        closed = false;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1), r = 1 + 0.4 * v.gain * _samp(W, u), th = TAU * u + ph;
          U[2 * i] = r * Math.cos(th); U[2 * i + 1] = r * Math.sin(th);
        }
        break;
      }
      case 'wave': {
        // raw: the whole buffer (~23 ms) as it arrives, real amplitude (±1 = full scale),
        // no trigger (it rolls). Otherwise: 512 samples from the trigger, automatic gain
        const W = this._raw ? _wave() : _waveN(), k = this._raw ? 1 : 0.8;
        const asp = width / Math.min(width, height) / Math.max(0.05, Math.abs(v.size));
        closed = false;
        for (let i = 0; i < N; i++) {
          const u = i / (N - 1);
          U[2 * i] = (2 * u - 1) * asp; U[2 * i + 1] = k * v.gain * _samp(W, u);
        }
        break;
      }
      case 'xy': {
        const w = _wave();
        _waveN(); // keeps the automatic gain updated
        const d = this._p.d == null
          ? _clamp(Math.round(getAudioContext().sampleRate / hz() / 4), 1, 300) // quarter period → a circle
          : _clamp(Math.round(v.d), 1, 300);
        const L = w.length - d - 1, g = this._raw ? v.gain : (0.8 * v.gain) / _wpk;
        closed = false;
        for (let i = 0; i < N; i++) {
          const x = (i / (N - 1)) * (L - 1), j = Math.floor(x), f = x - j;
          U[2 * i] = g * (w[j] * (1 - f) + w[j + 1] * f);
          U[2 * i + 1] = g * (w[j + d] * (1 - f) + w[j + d + 1] * f);
        }
        break;
      }
      case 'fn': {
        closed = _isInt(Lp);
        const den = cyc(closed);
        for (let i = 0; i < N; i++) {
          const p = this._fn((TAU * Lp * i) / den, i / den, v) || [0, 0]; // v: this frame's settings (v.a, v.b, ...)
          U[2 * i] = _num(p[0], 0); U[2 * i + 1] = _num(p[1], 0);
          if (p.length > 2) { if (!this._Z) this._Z = new Float32Array(N); this._Z[i] = _num(p[2], 0); } // [x, y, z]
        }
        break;
      }
    }
    this._closed = closed;
    return U;
  }

  draw() {
    const g = _screen();
    if (!g) return this;
    const v = {};
    for (const k of _PROPS) v[k] = this._v(k);

    // spin and drift follow the tempo: turns per bar (4 beats)
    const nb = _beats();
    const db = this._lastB === null ? 0 : _clamp(nb - this._lastB, 0, 1);
    this._lastB = nb;
    this._ang += (v.spin * db) / 4;
    this._dph += (v.drift * db) / 4;
    this._orb += (v.orbit * db) / 4;
    // no orbit any more: glide back to the nearest whole turn, so the figure
    // lies flat again instead of staying seen at an angle
    const orbitOff = !_num(this._p.orbit, 0) && !this._rx.some(r => r.prop === 'orbit'); // not in the code
    if (orbitOff && this._orb % 1) {
      const home = Math.round(this._orb);
      this._orb += (home - this._orb) * (1 - _clamp(this._glide, 0.8, 0.96));
      if (Math.abs(home - this._orb) < 1e-4) this._orb = 0;
    }

    // more loops = a longer path: the points grow with it so the line stays smooth
    const N = _clamp(Math.round(v.pts * Math.max(1, v.loops)), 16, 6000);
    const U = this._shape(N, v);

    // a new figure doesn't jump: it morphs from the last one
    const key = this._mode + ':' + this._form + ':' + (this._fn ? String(this._fn) : '');
    if (this._drawn !== null && key !== this._drawn && this._last) { this._snap = this._last; this._snapZ = this._lastZ; this._m = 1; }
    this._drawn = key;
    if (this._m > 0.002 && this._snap) {
      const e = this._m * this._m * (3 - 2 * this._m), S = this._snap, M = S.length / 2;
      const SZ = this._snapZ;
      if (SZ && !this._Z) this._Z = new Float32Array(N);  // 3D → flat: the depth melts away
      const Zm = this._Z;
      for (let i = 0; i < N; i++) {
        const j = Math.min(M - 1, Math.floor((i * M) / N));
        U[2 * i] += (S[2 * j] - U[2 * i]) * e;
        U[2 * i + 1] += (S[2 * j + 1] - U[2 * i + 1]) * e;
        if (Zm) Zm[i] += ((SZ && j < SZ.length ? SZ[j] : 0) - Zm[i]) * e;
      }
      this._m *= _clamp(this._glide, 0.8, 0.96);
      this._closed = false;
    } else this._snap = null;
    this._last = U.slice();
    this._lastZ = this._Z ? this._Z.slice() : null;

    // sound and noise on top of the figure
    if (v.wob) {
      const W = _waveN();
      for (let i = 0; i < N; i++) {
        const k = 1 + 0.5 * v.wob * _samp(W, i / N);
        U[2 * i] *= k; U[2 * i + 1] *= k;
        if (this._Z) this._Z[i] *= k;
      }
    }
    if (v.fuzz) {
      for (let i = 0; i < 2 * N; i++) U[i] += (Math.random() - 0.5) * 0.06 * v.fuzz;
      if (this._Z) for (let i = 0; i < N; i++) this._Z[i] += (Math.random() - 0.5) * 0.06 * v.fuzz;
    }

    // 3D: turn the figure in space (yaw + orbit around the vertical axis, then tilt
    // towards you) and project it with perspective. The near side is bigger and
    // brighter. Figures are seen flat (straight on, no perspective) until you turn them
    const Z = this._Z;
    const X = new Float32Array(N), Y = new Float32Array(N);
    let D = null;
    if (!this._flat && (v.tilt || v.yaw || (!orbitOff && v.orbit) || this._orb % 1)) {
      const A = TAU * (v.yaw + this._orb), B = TAU * v.tilt;
      const ca = Math.cos(A), sa = Math.sin(A), cb = Math.cos(B), sb = Math.sin(B);
      const k = _clamp(v.persp, 0, 3), dist = k > 0 ? 3 / k : 0;
      D = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = U[2 * i] * v.sx, y = U[2 * i + 1] * v.sy, z = Z ? Z[i] : 0;
        const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
        const y1 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;   // z2 > 0: towards you
        const f = dist ? dist / Math.max(0.3, dist - z2) : 1;
        X[i] = x1 * f; Y[i] = y1 * f;
        D[i] = _clamp(0.55 + 0.35 * z2, 0.15, 1);
      }
    } else {
      for (let i = 0; i < N; i++) { X[i] = U[2 * i] * v.sx; Y[i] = U[2 * i + 1] * v.sy; }
    }

    const R = (v.size * Math.min(width, height)) / 2;
    const cx = (width / 2) * (1 + v.x), cy = (height / 2) * (1 - v.y);
    const rgb = _hsb2rgb(((v.hue % 360) + 360) % 360, _clamp(v.sat, 0, 100), _clamp(v.bri, 0, 100));
    const E = _clamp(Math.round(v.echo), 0, 24);
    const P = new Float32Array(2 * N), ctx = g.drawingContext;
    const w = Math.max(0.3, v.width), glow = _clamp(v.glow, 0, 2);
    for (let e = 0; e <= E; e++) {
      const s = R * Math.pow(v.scale, e), an = TAU * (v.rot + this._ang + v.turn * e);
      const c = Math.cos(an), sn = Math.sin(an);
      for (let i = 0; i < N; i++) {
        const x = X[i], y = Y[i];
        P[2 * i] = cx + s * (x * c - y * sn);
        P[2 * i + 1] = cy - s * (x * sn + y * c);
      }
      _render(ctx, P, N, this._closed, rgb, (_clamp(v.alpha, 0, 255) / 255) * Math.pow(0.7, e), w, glow, this._dots, D);
    }
    return this;
  }
}

// ---------- FACTORY ----------
// Like flocks.js: beams created in init() are reused on every run, by order
// or by name, so re-running keeps their rotation and morphs the figure.
const _beams = new Map();
let _slot = 0, _inRun = false;
function _newRun() { _slot = 0; _inRun = true; }

function beam(name) {
  if (!_inRun) return new Beam();
  const key = typeof name === 'string' ? 'name:' + name : 'slot:' + _slot++;
  let b = _beams.get(key);
  if (b) b._reset();
  else { b = new Beam(); _beams.set(key, b); }
  return b;
}
