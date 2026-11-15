# LissaLoop

LissaLoop is a small live coding library for a **vector oscilloscope** that reacts to sound and follows the
tempo of the music, built on [p5.js](https://p5js.org) + p5.sound. It is the sister of
[flocks.js](https://github.com/danieljulia/flocks): same editor, same sound signals, same way of
working: type a little, the figure changes right away without a restart.

**Try it live: <https://danieljulia.github.io/LissaLoop/>** (click once to turn on the mic)

Code: <https://github.com/danieljulia/LissaLoop>

A *beam* is a point of light that draws a figure many times per second and leaves a glow on the
phosphor of the screen. Like on a real tube, the beam is brighter where it moves slowly (corners,
turning points) and fainter where it jumps.

```js
function init() {
  b = beam()
    .lissa(3, 2)             // Lissajous 3:2
    .col('#7dff9a')
    .spin(1)                 // one turn per bar
    .r('size', bass, 1.6)    // bigger with the bass
}

function live() {
  trail(0.15)
  grid(0.25)
  b.draw()
}
```

## Running it

Everything is in the repo, including p5.js and p5.sound in `lib/`, so it **works offline**.

```bash
python3 -m http.server 8000
```

Go to <http://localhost:8000> and click once to turn on the microphone.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Entry point |
| `audio.js` | Sound: microphone, FFT, signals, tempo detection (the engine of flocks.js) + waveform and pitch |
| `lissaloop.js` | The library: beams, figures, phosphor screen |
| `presets.js` | The examples of the editor menu (add yours) |
| `editor.js` | Mini live coding editor over the canvas |
| `lib/` | p5.js 1.11.3 and p5.sound, bundled for offline use |

## The editor

Two functions: `init()` runs once every time you run the code (create beams here), `live()` runs
every frame (draw them here). The code runs by itself shortly after you stop typing; a broken
`live()` keeps the last one that worked running.

| Key | Action |
| --- | --- |
| Ctrl/Cmd+Enter | run the code now |
| Ctrl/Cmd+E | hide/show the code |
| h | hide/show the quick reference |
| t | tap tempo (or click the ♩ button) |
| c | random color on the last beam |

Use plain globals (`b = beam()`), not `let`/`const`. Running again **reuses** each beam (by order,
or by name with `beam('a')`): its rotation goes on, settings glide to the new values, and a new
figure **morphs** from the old one instead of jumping.

## API

### Figures

| Call | Figure |
| --- | --- |
| `.lissa(a, b, ph)` | Lissajous `x = sin(a·t + ph)`, `y = sin(b·t)`. Phase in turns (0.25 = round) |
| `.form(f)` | the waves of the Lissajous: `'sin'` `'tri'` `'sqr'` `'saw'` |
| `.rose(n, d)` | rhodonea flower with `n/d` petals |
| `.poly(n, m)` | star polygon {n/m}. The beam slows at the corners, so vertices glow |
| `.ring(gain)` | a circle bent by the sound wave |
| `.wave(gain)` | the classic scope: the sound wave, with trigger so tones stand still |
| `.raw()` | with `wave`, `ring` or `xy`: the sound exactly as it comes. Real volume (no automatic gain, so quiet music draws small and ±1 is full scale) and, for `wave`, no trigger and the whole buffer (~23 ms), so it rolls like the raw signal |
| `.xy(gain, d)` | X-Y mode: the wave against itself `d` samples later. Without `d`, the delay is a quarter period of the main note, so a pure tone is a circle and every harmonic adds a loop |
| `.fn(t => [x, y])` | your own figure, `t` from 0 to TAU (2nd argument: 0..1). The 3rd argument has this frame's settings: `.fn((t, u, p) => [sin(p.a * t), tan(p.b * t)]).r('a', bass, 8, 32)` |

Ratios can glide: `.r('a', lfo(16), 1, 4)` passes through every figure between 1:b and 4:b.

### Look and motion

| Call | Effect |
| --- | --- |
| `.size(s)` | 1 = fills the screen |
| `.at(x, y)` | center, -1..1 |
| `.stretch(sx, sy)` | stretch |
| `.rot(a)` `.spin(s)` | angle in turns · turns per bar (follows the tempo) |
| `.drift(d)` `.phase(p)` | the phase moves (turns per bar) · fixed phase |
| `.col(c)` `.width(px)` `.glow(g)` | color, beam width, halo 0..2 |
| `.wob(x)` | the sound wave shakes the figure |
| `.fuzz(x)` | noise on the beam |
| `.echo(n, scale, turn)` | copies of the figure, smaller and turned |
| `.dots()` | dots instead of a line |
| `.loops(n)` | how many times the figure is traced (lissa, rose, poly, fn). `.lissa(3.5, 2).loops(2)` closes a fractional ratio; below 1 only a part is drawn: `.r('loops', bass, 0.1, 1)` writes the figure with the bass. Points grow with the loops |
| `.pts(n)` `.glide(g)` | points of the figure · how smoothly changes arrive |

Every setting can be a number or a signal.

### Sound

The same signals as flocks.js (normalized 0..1, adaptive noise gate): `bass` `mid` `treble` `amp`
`beat`, `.smooth(k)`, `.beat(thr)`, `sig(fn)`, and the tempo signals `phase` `bar` `tick` `lfo(n)`
`tempo`, with `bpm()` and `tap()`. New here:

| Call | Effect |
| --- | --- |
| `onset` | new energy in the bass, 0..1: reacts to the change, not the level. `beat` is a pulse made from it |
| `pitch` | main note, 60 Hz = 0 … 2 kHz = 1 (log). Holds the last note in silence |
| `note` | the note name: C = 0, C# = 1/12 … B = 11/12. `.r('a', note, 2, 9)`: each note has its own petals |
| `hz()` | the main frequency in Hz |
| `wav(t)` | the raw sound wave at `t` (0..1), for `.fn()` figures |
| `.r(prop, signal, x)` | multiply: ×1 in silence → ×x at full signal (`hue`: + x degrees) |
| `.r(prop, signal, min, max)` | range: min in silence → max at full signal |
| `.calm()` | no reactions. A new beam pulses with the bass until your first `.r()` |

Props for `r()`: `size x y sx sy rot spin width glow hue sat bri alpha a b ph drift fuzz wob gain d
pts echo scale turn loops`.

### Screen

| Call | Effect |
| --- | --- |
| `trail(a)` | phosphor persistence: 0 = endless glow, 1 = none |
| `grid(a)` | graticule of a real scope (0 = off) |
| `crt(a)` | scanlines and dark corners (0 = off) |

## How it works

- Each frame a beam computes its figure as N points in unit space, morphs it from the last
  figure if it changed, adds the sound (`wob`) and noise (`fuzz`), and transforms it (stretch,
  rotation, size, position, echo copies).
- The brightness of every segment depends on its length, like the dwell time of a real beam.
  Segments are grouped in 5 brightness levels and each level is stroked three times (wide halo,
  narrow halo, whitish core) with additive blending.
- Beams draw on an offscreen phosphor layer that fades a little every frame; the canvas shows
  the grid, then the phosphor (added), then the CRT glass.
- The waveform is normalized by its recent peak (automatic gain), and the wave and ring modes
  start at a rising zero crossing, like the trigger of a real scope.
- `spin` and `drift` are counted in bars, so the figures turn with the music.

## Loud music

A very loud or saturated input used to pin every band at 1 (the analyser's bytes stop at -30 dB),
and the signals stopped moving. Three layers keep them useful:

1. **Raw input.** The microphone is requested without the browser's automatic gain, noise
   suppression and echo cancellation, which are made for voice calls and squash music.
2. **Decibels without a ceiling.** The spectrum is read as float dB (0 dB = full scale). Each band
   is the power mean of its loudest bins and is measured against its own recent history: 65%
   contrast (between the recent minimum and maximum, at least 9 dB apart) + 35% presence (above the
   room noise), gated near the noise floor. A kick still jumps out of a wall of sound, and a steady
   loud sound reads as present without pinning the signal.
3. **Whitened onsets.** Every bin up to ~3 kHz is kept between its noise floor + 6 dB and its recent
   maximum - 40 dB, and the frame-to-frame rise is summed in dB. This drives `onset`, `beat` and
   the tempo detection: a hit counts the same in quiet or loud music, and a bin that is always
   saturated stops counting until it really changes.

Tested with a synthetic kick + saw + noise: clean, ×10 and hard-clipped, very quiet and silence.
`beat` caught every kick in all of them (8/8, 8/8, 6/6) and nothing in silence; the old pipeline
caught 1 and had `bass` stuck at 1.00 when clipped. Not tested yet with a real microphone at a gig.

## License

MIT (see [`LICENSE`](LICENSE)). The libraries in `lib/` keep their own license (LGPL 2.1).
