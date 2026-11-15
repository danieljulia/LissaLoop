/* ============================================================
   audio.js — sound signals for LissaLoop
   The same audio engine as flocks.js (https://github.com/danieljulia/flocks):
   microphone + FFT, adaptive noise gate, signals and tempo detection.
   Adds: pitch (dominant frequency), wav(t) (the raw waveform) and _wave().
   Loud music: raw microphone (no browser gain/noise processing), spectrum in
   float dB (no -30 dB ceiling), bands measured against their own history and
   whitened onsets, so the signals keep moving when the sound is very loud.
   License: MIT. Requires p5.js + p5.sound
   ============================================================ */

// ---------- AMBIENT AUDIO (built-in) ----------
let _au = null;

function audioStart() {
  if (_au) return _au;
  if (typeof _NO_SOUND !== 'undefined' && _NO_SOUND) return null; // insecure page: no p5.sound
  try {
    if (typeof userStartAudio === 'function') userStartAudio();
    const mic = new p5.AudioIn();
    mic.start(
      () => console.log('[lissaloop] mic on'),
      err => console.warn('[lissaloop] mic failed:', err)
    );
    const fft = new p5.FFT(0.8, 1024);
    fft.setInput(mic);
    _au = { mic, fft };
  } catch (e) {
    console.error('[lissaloop] could not start audio:', e);
  }
  return _au;
}

// starts on the first user gesture without overriding the sketch's
// own handlers (native listeners always fire)
window.addEventListener('mousedown', audioStart);
window.addEventListener('touchstart', audioStart);
window.addEventListener('keydown', audioStart);

// ---------- 1. CLEAN INPUT ----------
// By default browsers process the microphone for video calls: automatic gain
// (squashes the dynamics of the music), noise suppression (eats sustained
// notes) and echo cancellation. p5.sound only turns off the last one, so every
// microphone request made from this page asks for the raw signal.
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const _gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = c => {
    if (c && c.audio) {
      if (c.audio === true) c.audio = {};
      Object.assign(c.audio, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    }
    return _gum(c);
  };
}

// ---------- 2. SPECTRUM IN DECIBELS ----------
// fft.analyze() returns bytes clamped between -100 and -30 dB: with loud music
// most bins sit at 255 and the bands stop moving. Float decibels have no
// ceiling (0 dB = full scale), so the spectrum keeps its shape at any volume.
const _DB_MIN = -120;
let _specFrame = -1, _spec = null;
function _spectrum() {
  if (frameCount !== _specFrame) {
    _specFrame = frameCount;
    const an = _au.fft.analyser;
    if (!_spec) _spec = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(_spec);
    for (let i = 0; i < _spec.length; i++) {
      const v = _spec[i];
      _spec[i] = v > _DB_MIN ? Math.min(0, v) : _DB_MIN; // also catches -Infinity / NaN
    }
  }
  return _spec;
}

// Every band is measured against its OWN recent history, in dB:
//   floor  room noise: falls fast, rises very slowly (minutes)
//   lo     recent minimum (~1 s)  ·  hi  recent maximum (~1.5 s)
//   top    long-term maximum (~10 s)
// value = 65% contrast (where the level sits between lo and hi, at least 9 dB
// apart) + 35% presence (between floor and top), gated near the noise floor.
// So a kick still jumps out of loud, compressed or saturated music, and a
// steady loud sound reads as "present" without pinning the signal at 1.
const _np = {};
for (const e of ['bass', 'mid', 'treble', 'amp']) _np[e] = null;

function _norm(e, db) {
  let p = _np[e];
  if (!p) p = _np[e] = { floor: db, lo: db, hi: db + 12, top: db + 12 };
  // followers: jump to a new extreme at once, drift back exponentially
  // (so they adapt in seconds, whatever the distance: silence → loud music)
  p.floor += (db - p.floor) * (db < p.floor ? 0.05 : 0.0005);
  p.lo  = db < p.lo  ? db : p.lo  + (db - p.lo)  * 0.015;
  p.hi  = db > p.hi  ? db : p.hi  + (db - p.hi)  * 0.01;
  p.top = db > p.top ? db : p.top + (db - p.top) * 0.0015;
  p.lo  = Math.max(p.lo, p.floor);
  p.hi  = Math.max(p.hi, p.lo + 9);
  p.top = Math.max(p.top, p.floor + 12);
  const contrast = (db - p.lo) / (p.hi - p.lo);
  const presence = (db - p.floor) / (p.top - p.floor);
  const gate = _clamp01((db - p.floor - 3) / 6);             // silence → 0
  return _clamp01(0.65 * _clamp01(contrast) + 0.35 * _clamp01(presence)) * gate;
}
const _clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// frequency ranges (Hz). p5's 'bass' is only 20-140, too narrow
// for small speakers/mics → bass goes from 20 to 800 (covers the
// fundamentals and harmonics of kicks and bass lines)
const _RANGES = { bass: [20, 800], mid: [800, 2600], treble: [2600, 14000] };

// band level (dB) = power mean of the loudest 20% of bins in the range
// (a plain mean dilutes narrow peaks like a kick fundamental among empty bins)
function _bandDb(lo, hi) {
  const s = _spectrum();
  const nyq = getAudioContext().sampleRate / 2;
  const i0 = Math.max(0, Math.floor((lo / nyq) * s.length));
  const i1 = Math.min(s.length - 1, Math.ceil((hi / nyq) * s.length));
  const slice = Array.from(s.slice(i0, i1 + 1)).sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(slice.length * 0.2));
  let sum = 0;                                   // power mean: the strongest bins
  for (let i = 0; i < k; i++) sum += Math.pow(10, slice[i] / 10); // dominate (a kick
  return 10 * Math.log10(sum / k + 1e-12);       // isn't diluted by quieter bins)
}

// overall level (dB) = RMS of the waveform
function _ampDb() {
  const w = _wave();
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i] * w[i];
  return Math.max(_DB_MIN, 20 * Math.log10(Math.sqrt(s / w.length) + 1e-9));
}

function _band(e) {
  if (!_au) return 0;
  const [lo, hi] = _RANGES[e];
  return _norm(e, _bandDb(lo, hi));
}

// ---------- SIGNALS ----------
// sig(fn) turns any function into a signal: computed once per frame
// (so calling it from many flocks doesn't change the result) and with
// two helpers that return new signals:
//   .smooth(k)        exponential smoothing, k 0..1 (higher = smoother)
//   .beat(thr, decay) 1 when the signal jumps over thr, then fades out
function sig(fn) {
  let fr = -1, v = 0;
  const s = () => {
    if (frameCount !== fr) { fr = frameCount; v = fn(); }
    return v;
  };
  s.smooth = (k = 0.8) => {
    let a = 0;
    return sig(() => (a += (s() - a) * (1 - k)));
  };
  s.beat = (thr = 0.6, decay = 0.85) => {
    let p = 0, armed = true;
    return sig(() => {
      const x = s();
      p *= decay;
      if (armed && x > thr) { p = 1; armed = false; }
      else if (x < thr * 0.7) armed = true; // re-arm once it drops
      return p;
    });
  };
  return s;
}

// ---------- CLOCK (BPM) ----------
// The clock FOLLOWS THE MUSIC by itself (tempo detection, see below).
// bpm(128) fixes the tempo by hand, bpm('auto') goes back to listening.
// tap() = tap tempo: call it on every beat and the clock locks to your taps.
// Signals (0..1):
//   phase    ramp that grows 0 → 1 on every beat
//   bar      ramp 0 → 1 every 4 beats
//   tick     pulse: 1 on the beat, fading to 0 before the next
//   lfo(n)   smooth wave 0 → 1 → 0 over n beats (default 4)
//   tempo    the speed of the music: 60 bpm = 0 … 180 bpm = 1
let _bpm = 120, _beat0 = 0, _beatBase = 0, _taps = [];
function _beats() { _tempoStep(); return _beatBase + ((millis() - _beat0) * _bpm) / 60000; }
function _setBpm(x) { _beatBase = _beats(); _beat0 = millis(); _bpm = x; } // phase keeps going
function bpm(x) {
  if (x === 'auto') { _tAuto = true; _tLock = false; _tCand = 0; return _bpm; }
  if (Number.isFinite(x) && x >= 20 && x <= 400) { _tAuto = false; _setBpm(x); }
  else _tempoStep();
  return _bpm;
}
function tap() {
  _tAuto = false;
  const now = millis();
  if (_taps.length && now - _taps[_taps.length - 1] > 2000) _taps = [];
  _taps.push(now);
  _taps = _taps.slice(-5);
  const b = Math.round(_beats()); // the tap is a downbeat
  if (_taps.length > 1) {
    const iv = (_taps[_taps.length - 1] - _taps[0]) / (_taps.length - 1);
    _bpm = Math.min(400, Math.max(20, 60000 / iv));
  }
  _beatBase = b; _beat0 = now;
  return _bpm;
}

// ---------- TEMPO DETECTION ----------
// 1. onset strength = positive spectral flux (how much new energy per frame),
//    kept in 10 ms slots for the last 8 seconds
// 2. every 0.5 s: autocorrelation of that curve → the repeating period → bpm
//    (tempos near 115 bpm are preferred, to avoid half/double mistakes)
// 3. the clock phase is nudged so its beats fall on the strongest onsets
const _TS = 10, _TN = 800, _TLAG = 50; // slot ms · slots · audio latency ms
let _tAuto = true, _tLock = false, _tConf = 0;
const _tBuf = new Float32Array(_TN);
let _tSlot = -1, _tFrame = -1, _tNext = 0, _tCand = 0, _tMax = 30, _tFilled = 0;

// ---------- 3. WHITENED ONSETS ----------
// Onset strength = how much NEW energy appears in this frame, summed over the
// bins up to ~3 kHz (bass counts double). Each bin is first "whitened":
//   mx  its recent maximum (falls 6 dB/s) · nf  its noise floor
// and its level is kept between nf + 6 dB and mx - 40 dB before comparing with
// the last frame. Measured in dB, a hit counts the same in quiet or loud music,
// noise below the floor adds nothing, and a bin that is always loud (saturated)
// stops counting until it really changes.
const _FB = 150;
const _fPrev = new Float32Array(_FB), _fMx = new Float32Array(_FB).fill(-60), _fNf = new Float32Array(_FB).fill(-60);
let _fInit = false, _fFrame = -1, _fAll = 0, _fLow = 0;
function _flux() {                       // once per frame; also sets _fLow (bass only)
  if (frameCount === _fFrame) return _fAll;
  _fFrame = frameCount;
  const sp = _spectrum();
  let f = 0, fl = 0;
  for (let i = 1; i < _FB; i++) {
    const v = sp[i];
    _fMx[i] = Math.max(v, _fMx[i] - 0.1);
    _fNf[i] += (v - _fNf[i]) * (v < _fNf[i] ? 0.05 : 0.001);
    const w = Math.max(v, _fNf[i] + 6, _fMx[i] - 40);
    if (_fInit) {
      const d = w - _fPrev[i];
      if (d > 0) { if (i < 40) { f += d * 2; fl += d; } else f += d; }
    }
    _fPrev[i] = w;
  }
  _fInit = true;
  _fAll = f; _fLow = fl;
  return f;
}

function _tempoStep() {
  if (frameCount === _tFrame) return;       // once per frame
  _tFrame = frameCount;
  if (!_au || !_tAuto) return;
  const f = _flux();
  _tMax = Math.max(_tMax * 0.995, f, 30);   // quiet rooms don't get amplified
  const v = f / _tMax;
  const slot = Math.floor(millis() / _TS);
  if (_tSlot < 0 || slot - _tSlot > _TN) _tSlot = slot - 1;
  for (let k = _tSlot + 1; k <= slot; k++) { _tBuf[k % _TN] = v; _tFilled = Math.min(_TN, _tFilled + 1); }
  _tSlot = slot;
  if (millis() >= _tNext) { _tNext = millis() + 500; _tEstimate(slot); }
}

function _tEstimate(slot) {
  if (_tFilled < 300) return;               // need at least 3 s of music
  const n = _TN, x = new Float32Array(n), xc = new Float32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) { x[i] = _tBuf[(((slot - n + 1 + i) % n) + n) % n]; m += x[i]; }
  m /= n;
  let r0 = 0;
  for (let i = 0; i < n; i++) { xc[i] = x[i] - m; r0 += xc[i] * xc[i]; }
  if (r0 < 1) { _tLock = false; _tConf = 0; return; }
  const rn = lag => { // normalized autocorrelation
    let r = 0;
    for (let i = lag; i < n; i++) r += xc[i] * xc[i - lag];
    return r / r0 / ((n - lag) / n);
  };
  let best = 0, bestScore = -1;
  for (let lag = 30; lag <= 100; lag++) {   // 200 … 60 bpm
    const b = 6000 / lag, r = rn(lag);
    const score = r * Math.exp(-0.5 * Math.pow(Math.log2(b / 115) / 0.55, 2));
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  const y0 = rn(best - 1), y1 = rn(best), y2 = rn(best + 1);
  const den = y0 - 2 * y1 + y2;
  const lagF = best + (den < 0 ? 0.5 * (y0 - y2) / den : 0); // parabolic peak
  _tConf = y1;
  if (_tConf < 0.1) { _tLock = false; return; }
  const est = 6000 / lagF;
  if (Math.abs(est / _bpm - 1) < 0.05) { _setBpm(_bpm + (est - _bpm) * 0.35); _tCand = 0; _tLock = true; }
  else if (_tCand && Math.abs(est / _tCand - 1) < 0.03) { _setBpm(est); _tCand = 0; _tLock = true; }
  else { _tCand = est; _tLock = false; return; }

  // phase: the comb of beats (period P slots) that catches the most onset energy
  const P = 6000 / _bpm;
  let bi = 0, bs = -1;
  for (let ph = 0; ph < P; ph++) {
    let sum = 0;
    for (let i = ph; i < n; i += P) sum += x[Math.round(i)] ?? 0;
    if (sum > bs) { bs = sum; bi = ph; }
  }
  let i0 = bi; while (i0 + P <= n - 1) i0 += P;       // last beat in the window
  const tb = (slot - (n - 1 - Math.round(i0))) * _TS - _TLAG; // when the beat really sounded
  const b = _beatBase + ((tb - _beat0) * _bpm) / 60000;
  const fr = b - Math.floor(b);
  _beatBase += (fr < 0.5 ? -fr : 1 - fr) * 0.3;        // gentle nudge, no jumps
}

const phase = sig(() => { const b = _beats(); return b - Math.floor(b); });
const bar   = sig(() => { const b = _beats() / 4; return b - Math.floor(b); });
const tick  = sig(() => Math.pow(1 - phase(), 3));
const lfo   = (n = 4) => sig(() => 0.5 - 0.5 * Math.cos((TAU * _beats()) / n));
const tempo = sig(() => { _tempoStep(); return Math.min(1, Math.max(0, (_bpm - 60) / 120)); });

const bass   = sig(() => _band('bass'));
const mid    = sig(() => _band('mid'));
const treble = sig(() => _band('treble'));
const amp    = sig(() => (_au ? _norm('amp', _ampDb()) : 0));
// onset: new energy in the bass (whitened, see 3.), 0..1 against its recent peak.
// It reacts to the CHANGE, not the level, so it still hits in loud/saturated music
let _oPk = 30;
const onset = sig(() => {
  if (!_au) return 0;
  _flux();
  _oPk = Math.max(_oPk * 0.995, _fLow, 20);
  return _clamp01(_fLow / _oPk);
});
const beat   = onset.beat(0.45); // pulse on every bass hit

// ---------- SOUND METER (for testing) ----------
// bass / mid / treble / amp / beat bars (already normalized and gated).
// Call it in draw(), e.g. soundMeter()
function soundMeter(x = 12, y = 12, w = 130, h = 60) {
  const bands = [
    ['bass',   bass(),   '#ff5c8a'],
    ['mid',    mid(),    '#ffd25c'],
    ['treble', treble(), '#5cd6ff'],
    ['amp',    amp(),    '#cccccc'],
    ['beat',   beat(),   '#ffffff'],
  ];
  push();
  noStroke();
  const bw = w / bands.length;
  for (let i = 0; i < bands.length; i++) {
    const [name, v, c] = bands[i];
    fill(255, 25);                                   // bar background
    rect(x + i * bw, y, bw - 4, h);
    fill(c);                                         // level
    rect(x + i * bw, y + h * (1 - v), bw - 4, h * v);
    fill(255, 180);
    textSize(9);
    textAlign(CENTER, TOP);
    text(name, x + i * bw + (bw - 4) / 2, y + h + 4);
  }
  pop();
}

// ---------- WAVEFORM ----------
// the raw sound wave (-1..1), read once per frame. In silence it is flat.
// Read as floats straight from the analyser: p5's fft.waveform() uses 8-bit
// bytes (256 levels), so a moderate signal only takes a few levels and the
// wave is drawn as a staircase (worse once the automatic gain blows it up).
let _wvFrame = -1, _wv = new Float32Array(1024);
function _wave() {
  if (!_au) return _wv;
  if (frameCount !== _wvFrame) {
    _wvFrame = frameCount;
    const an = _au.fft.analyser;
    if (_wv.length !== an.frequencyBinCount) _wv = new Float32Array(an.frequencyBinCount); // 1024 ≈ 23 ms, as before
    an.getFloatTimeDomainData(_wv);
  }
  return _wv;
}
// wav(t): the wave at t (0..1 along the last ~23 ms of sound), for your own .fn() figures
function wav(t) {
  const w = _wave(), n = w.length;
  const x = (((t % 1) + 1) % 1) * (n - 1), i = Math.floor(x), f = x - i;
  return w[i] * (1 - f) + w[Math.min(n - 1, i + 1)] * f;
}
// like a real scope trigger: index of the first rising zero crossing,
// so a steady tone stands still on the screen instead of rolling
function _trigger(w, maxI) {
  for (let i = 1; i < maxI; i++) if (w[i - 1] < 0 && w[i] >= 0) return i;
  return 0;
}

// ---------- PITCH ----------
// dominant frequency between 60 Hz and 2 kHz. It holds the last note in silence.
//   pitch   0..1 on a log scale (60 Hz = 0 … 2 kHz = 1)
//   note    the note name as 0..1: C = 0, C# = 1/12 … B = 11/12
//   hz()    the frequency in Hz
let _hz = 220, _hzFrame = -1;
function hz() {
  if (!_au || frameCount === _hzFrame) return _hz;
  _hzFrame = frameCount;
  const s = _spectrum(), nyq = getAudioContext().sampleRate / 2, bw = nyq / s.length;
  const i0 = Math.max(2, Math.floor(60 / bw)), i1 = Math.min(s.length - 2, Math.ceil(2000 / bw));
  let bi = i0;
  for (let i = i0; i <= i1; i++) if (s[i] > s[bi]) bi = i;
  if (s[bi] < -75 || amp() < 0.15) return _hz;  // too quiet: keep the last note
  const y0 = s[bi - 1], y1 = s[bi], y2 = s[bi + 1], den = y0 - 2 * y1 + y2;
  const f = (bi + (den < 0 ? 0.5 * (y0 - y2) / den : 0)) * bw;
  _hz += (f - _hz) * 0.5;
  return _hz;
}
const pitch = sig(() => Math.min(1, Math.max(0, Math.log2(hz() / 60) / Math.log2(2000 / 60))));
const note  = sig(() => (((Math.round(12 * Math.log2(hz() / 440)) + 9) % 12 + 12) % 12) / 12);
