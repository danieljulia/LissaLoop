/* editor.js — tiny live coding environment on top of lissaloop.js (LissaLoop)
   (the same editor as flocks.js, adapted)
   The user code is shown over the canvas and is editable:
     auto-run     → the code runs by itself as you type
     Ctrl/Cmd+Enter → run the changes right now (no restart)
     Ctrl/Cmd+E     → hide/show the editor
   User code conventions:
     init() → runs once on every "run" (create/modify beams)
     live() → runs every frame inside draw()
   Do NOT use let/const at the top level: use plain globals
   (b = beam(...)) so re-running doesn't throw. */

const DEMO_CODE = `// LissaLoop
// 1. press Ctrl/Cmd+Enter to run (it also runs as you type)
// 2. remove the // in front of a line, see what changes

function init() {
  b = beam()                 // a beam: random figure and color
    .lissa(3, 2)             // Lissajous 3:2
  // .rose(5)                // flower with 5 petals
  // .poly(5, 2)             // star
  // .ring()                 // circle bent by the sound
  // .col('#ffb347')         // amber phosphor
  // .spin(1)                // one turn per bar
  // .echo(4, 0.8, 0.03)     // copies inside copies
  // .r('size', bass, 1.6)   // the bass makes it bigger
  // .r('wob', mid, 0, 0.6)  // the mids shake it
}
// a new figure morphs from the old one

function live() {
  trail(0.15)                // 0 = endless glow ... 1 = none
  grid(0.25)                 // scope graticule
  b.draw()
}
`;

const HELP_TEXT = `LISSALOOP — QUICK REFERENCE
─────────────────────────────
Ctrl/Cmd+Enter   run the code (it also
                 auto-runs as you type)
Ctrl/Cmd+E       hide/show the code
h                hide/show this help

▸ YOUR CODE HAS TWO PARTS
  init()   runs once each time you run
           → create beams here
  live()   runs every frame
           → draw beams here

▸ START
  b = beam()           a beam, random figure + color
  b = beam('a')        named: survives reordering
  b.draw()             inside live()

▸ FIGURES  (a new one morphs from the old)
  .lissa(3, 2)         Lissajous x:y (phase: 3rd arg,
                       in turns; 0.25 = round)
  .rose(5)             flower · .rose(5, 3) = 5/3
  .poly(5, 2)          star {5/2} · .poly(4) square
  .ring(1)             circle bent by the sound wave
  .wave(1)             the sound wave (classic scope)
  .xy(1)               X-Y: the wave vs itself delayed
                       (.xy(1, 20) = 20 samples delay)
  .fn(t => [sin(3*t), cos(2*t)])   your own, t 0..TAU
  .form('tri')         lissa waves: sin tri sqr saw

▸ LOOK & MOTION  (numbers or signals)
  .size(0.6)           1 = fills the screen
  .at(0.5, 0)          center, -1..1
  .stretch(1.5, 1)     stretch x, y
  .rot(0.125)          angle in turns
  .spin(1)             turns per bar (follows tempo)
  .drift(0.1)          phase moves (turns per bar)
  .col('#7dff9a')      phosphor color
  .width(2) .glow(0.8) beam width (px), halo 0..2
  .wob(0.3)            the sound wave shakes it
  .fuzz(0.2)           noise on the beam
  .echo(4, 0.8, 0.05)  copies: n, scale, turn
  .dots()              dots instead of a line
  .pts(900)            points of the figure
  .glide(0.9)          changes arrive smoothly

▸ SOUND  (signals 0..1)
  bass() mid() treble() amp()
  beat()               pulse on every bass hit
  onset                new bass energy (the change,
                       not the level; good when loud)
  pitch                main note, 60Hz=0 … 2kHz=1
  note                 note name: C=0 … B=11/12
  bass.smooth(0.9)     smoother
  mid.beat(0.5)        pulse when mid goes over 0.5
  wav(t)               the raw wave at t (0..1)
  .r('size', bass, 2)      ×1 silence → ×2 loud
  .r('a', pitch, 1, 6)     range: 1 → 6
  .r('hue', mid, 120, 200) color: hue sat bri alpha
     also: x y sx sy rot spin width glow a b
     phase→ph drift fuzz wob gain echo scale turn
  .calm()              no reactions (a new beam
                       pulses with the bass until
                       your first .r())

▸ TEMPO  (detected: ● locked · ○ listening)
  ♩ button / key t     tap tempo
  bpm(128)             fix it · bpm('auto') listen
  phase bar tick lfo(8) tempo

▸ SCREEN  (call in live())
  trail(0.1)           0 = endless glow, 1 = none
  grid(0.3)            graticule (0 = off)
  crt(0.5)             scanlines + dark corners

▸ KEYS (outside the editor, on the last beam)
  c  random color
`;


// ---------- SYNTAX HIGHLIGHT (Strudel-like colors) ----------
const _HL_KEYWORDS = new Set(['function','const','let','var','return','if','else','for','while',
  'of','in','new','true','false','null','undefined','this','break','continue','switch','case','typeof']);
const _HL_LIB = new Set(['beam','bass','mid','treble','amp','beat','onset','pitch','note','hz','wav','sig','trail','grid','crt',
  'soundMeter','init','live','audioStart','color','random','noise','width','height','mouseX','mouseY',
  'bpm','tap','phase','bar','tick','lfo','tempo','PI','TAU','HALF_PI','QUARTER_PI','sin','cos','tan','abs','min','max',
  'map','constrain','frameCount','floor','round','sqrt','pow']);
const _HL_METHODS = new Set(['lissa','rose','poly','ring','wave','xy','fn','form','size','at','stretch',
  'rot','spin','drift','phase','width','glow','fuzz','wob','gain','pts','echo','dots','glide','col','r','calm','draw','smooth','beat']);
const _hlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function highlight(code) {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|(\b\d+\.?\d*\b|\B\.\d+\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;
  let out = '', m, prev = '';
  while ((m = re.exec(code))) {
    const [t, com, str, num, id] = m;
    if (com) out += `<span class="hc">${_hlEsc(t)}</span>`;
    else if (str) out += `<span class="hs">${_hlEsc(t)}</span>`;
    else if (num) out += `<span class="hn">${t}</span>`;
    else if (id) {
      const after = code[re.lastIndex];
      let cls = '';
      if (_HL_KEYWORDS.has(t)) cls = 'hk';
      else if (prev === '.' && _HL_METHODS.has(t)) cls = 'hm';
      else if (prev !== '.' && _HL_LIB.has(t)) cls = 'hl';
      else if (after === '(' ) cls = 'hf';
      out += cls ? `<span class="${cls}">${t}</span>` : t;
    } else out += _hlEsc(t);
    if (!/\s/.test(t)) prev = t;
  }
  return out;
}
const _HL_CSS = `
.hc{color:#7d8799;font-style:italic} .hs{color:#c3e88d} .hn{color:#f78c6c}
.hk{color:#c792ea} .hl{color:#ffcb6b} .hm{color:#82aaff} .hf{color:#89ddff}`;

let _err = null;     // error of the last run (syntax / init)
let _liveErr = null; // error of live() this frame
let _goodLive = null; // last live() that ran without errors (fallback)
let _ta = null;
let _gutter = null;
let _help = null;
let _hlPre = null;
let _bpmBtn = null;
let _autoBtn = null;

function runCode(code) {
  try {
    _newRun(); // beams of this run reuse the ones of the last run
    (0, eval)(code); // indirect eval → global scope
    _err = null;
    if (typeof init === 'function') init();
  } catch (e) {
    _err = e.message;
    console.error('[editor]', e);
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // --- editor overlay: whole window, with line numbers ---
  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'fixed', top: '64px', left: '12px', right: '12px',
    height: 'calc(100vh - 106px)', zIndex: 10,
    display: 'flex', overflow: 'hidden',
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px',
  });
  document.body.appendChild(wrap);

  // line numbers: 00 01 02 ... (scroll synced with the editor)
  _gutter = document.createElement('pre');
  Object.assign(_gutter.style, {
    margin: 0, padding: '12px 8px', textAlign: 'right', flexShrink: 0,
    color: 'rgba(255,255,255,0.35)', font: '18px/1.45 monospace',
    userSelect: 'none', overflow: 'hidden',
  });
  wrap.appendChild(_gutter);

  // colored copy of the code (behind) + transparent textarea (in front)
  const st = document.createElement('style');
  st.textContent = _HL_CSS;
  document.head.appendChild(st);
  const box = document.createElement('div');
  Object.assign(box.style, { flex: 1, position: 'relative', minWidth: 0 });
  wrap.appendChild(box);
  const layer = {
    position: 'absolute', inset: 0, margin: 0, boxSizing: 'border-box',
    font: '18px/1.45 monospace', padding: '12px', border: 'none',
    whiteSpace: 'pre', tabSize: 2,
  };
  _hlPre = document.createElement('pre');
  Object.assign(_hlPre.style, layer, { color: '#e6e6e6', overflow: 'hidden', pointerEvents: 'none' });
  box.appendChild(_hlPre);

  _ta = document.createElement('textarea');
  _ta.value = DEMO_CODE;
  _ta.spellcheck = false;
  Object.assign(_ta.style, layer, {
    background: 'transparent', color: 'transparent', caretColor: '#fff',
    outline: 'none', resize: 'none', overflow: 'auto',
  });
  box.appendChild(_ta);

  const updateGutter = () => {
    const n = _ta.value.split('\n').length;
    let s = '';
    for (let i = 0; i < n; i++) s += String(i).padStart(2, '0') + '\n';
    _gutter.textContent = s;
    _hlPre.innerHTML = highlight(_ta.value) + '\n';
    _gutter.scrollTop = _ta.scrollTop;
  };
  updateGutter();

  // auto-run shortly after you stop typing: if the code had an error,
  // fixing it is enough — the sketch recovers by itself
  let _runTimer = null;
  _ta.addEventListener('input', () => {
    updateGutter();
    clearTimeout(_runTimer);
    _runTimer = setTimeout(() => runCode(_ta.value), 800);
  });
  _ta.addEventListener('scroll', () => {
    _gutter.scrollTop = _ta.scrollTop;
    _hlPre.scrollTop = _ta.scrollTop; _hlPre.scrollLeft = _ta.scrollLeft;
  });

  _ta.addEventListener('keydown', (e) => {
    e.stopPropagation(); // p5 must not get keys while editing
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(_runTimer);
      runCode(_ta.value);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleEditor();
    }
  });

  // hint above the bottom buttons
  const hint = document.createElement('div');
  hint.textContent = 'auto-run on edit · Ctrl/Cmd+Enter: run now · Ctrl/Cmd+E: hide · h: help · t: tap tempo';
  Object.assign(hint.style, {
    position: 'fixed', left: '14px', bottom: '14px', zIndex: 10,
    color: 'rgba(255,255,255,0.6)', font: '14px monospace',
    pointerEvents: 'none',
  });
  hint.id = 'editorHint';
  document.body.appendChild(hint);

  // --- help panel (quick reference) ---
  _help = document.createElement('pre');
  _help.textContent = HELP_TEXT;
  Object.assign(_help.style, {
    position: 'fixed', right: '12px', top: '64px', zIndex: 10,
    maxWidth: 'min(460px, 42vw)', maxHeight: 'calc(100vh - 80px)', overflow: 'auto',
    margin: 0, background: 'rgba(0,0,0,0.7)', color: '#eee',
    font: '14px/1.5 monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '6px', padding: '12px', display: 'none',
  });
  document.body.appendChild(_help);

  // top bar: title, buttons, and (right) the sound meter drawn on the canvas
  const bar = document.createElement('div');
  Object.assign(bar.style, {
    position: 'fixed', left: 0, right: 0, top: 0, height: '52px', zIndex: 11,
    display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px',
    boxSizing: 'border-box', background: 'rgba(0,0,0,0.55)',
    borderBottom: '1px solid rgba(255,255,255,0.2)',
  });
  document.body.appendChild(bar);
  const title = document.createElement('span');
  title.textContent = 'LissaLoop';
  Object.assign(title.style, {
    color: '#fff', font: 'bold 18px monospace', marginRight: '12px',
  });
  bar.appendChild(title);
  const mkBtn = (txt, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    Object.assign(b.style, {
      background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.75)',
      font: '14px monospace', border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '4px', padding: '5px 12px', cursor: 'pointer',
    });
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  mkBtn('▶ run', () => runCode(_ta.value));
  mkBtn('code', toggleEditor);
  mkBtn('help', toggleHelp);
  // tap tempo: click on every beat (shows the current bpm)
  // examples menu
  const sel = document.createElement('select');
  Object.assign(sel.style, {
    background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)',
    font: '14px monospace', border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '4px', padding: '5px 8px', cursor: 'pointer',
  });
  sel.add(new Option('examples ▾', ''));
  PRESETS.forEach((p, i) => sel.add(new Option(p.name, i)));
  sel.onchange = () => {
    if (sel.value === '') return;
    _ta.value = PRESETS[+sel.value].code;
    if (_scr) _scr.background(0); // clean start (long trails of the previous one)
    updateGutter();
    runCode(_ta.value);
    sel.blur();
  };
  bar.appendChild(sel);
  _bpmBtn = mkBtn('♩ 120', () => tap());
  _bpmBtn.title = 'tempo (detected from the music). Click on every beat to tap it by hand';
  _autoBtn = mkBtn('auto', () => bpm('auto'));
  _autoBtn.title = 'listen to the music and follow its tempo';
  mkBtn('github', () => window.open('https://github.com/danieljulia/LissaLoop', '_blank'));

  function toggleEditor() {
    const hidden = wrap.style.display === 'none';
    wrap.style.display = hidden ? 'flex' : 'none';
    hint.style.display = hidden ? 'block' : 'none';
    if (!hidden) _ta.blur();
  }

  runCode(DEMO_CODE);
}

function toggleHelp() {
  if (!_help) return;
  _help.style.display = _help.style.display === 'none' ? 'block' : 'none';
}

function draw() {
  phosphor(); // the glow of the last frames fades (change it with trail(a))

  // a broken live() doesn't stop the show: the last one that worked
  // keeps running until the code is fixed
  if (typeof live === 'function') {
    push();
    try { live(); _goodLive = live; _liveErr = null; }
    catch (e) {
      _liveErr = e.message;
      pop(); push(); // drop styles left half-set by the failed frame
      if (_goodLive && _goodLive !== live) {
        try { _goodLive(); } catch (e2) { _goodLive = null; }
      }
    }
    pop();
  }
  show(); // phosphor + grid + CRT glass on the canvas

  const bt = '♩ ' + Math.round(bpm());
  if (_bpmBtn && _bpmBtn.textContent !== bt) _bpmBtn.textContent = bt;
  if (_autoBtn) { // ● locked on the music · ○ listening · manual (click to listen again)
    const at = !_tAuto ? 'manual' : _tLock ? '● auto' : '○ auto';
    if (_autoBtn.textContent !== at) _autoBtn.textContent = at;
    _autoBtn.style.color = _tAuto && _tLock ? '#7dffa0' : 'rgba(255,255,255,0.75)';
    _bpmBtn.style.color = _tAuto && _tLock ? '#7dffa0' : 'rgba(255,255,255,0.75)';
  }
  soundMeter(width - 150, 8, 130, 24); // sound bars, in the top bar

  const err = _err || _liveErr;
  if (err) {
    fill(255, 90, 90); noStroke();
    textAlign(LEFT, BOTTOM); textSize(16); textFont('monospace');
    text('error: ' + err, 12, height - 34); // above the hint
  }
  if (!_au) {
    fill(255); noStroke();
    textAlign(CENTER, CENTER); textSize(18);
    text(_NO_SOUND
      ? 'no sound here: open it with python3 -m http.server 8000 → http://localhost:8000'
      : 'click to turn on the sound', width / 2, height - 80);
  }
}

function keyPressed() {
  if (document.activeElement === _ta) return; // editing: leave it alone
  if (key === 'h' || key === 'H') toggleHelp();
  if (key === 't' || key === 'T') tap();
  // on-the-fly change to the most recently created beam
  if (_lastBeam && key === 'c') _lastBeam.col(random(_PAL));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
