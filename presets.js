/* presets.js — examples you can load from the menu of the editor
   Each one is plain editor code (init + live). Add yours here. */
const PRESETS = [

{ name: '3D knot', code: `// 3D knot
// lissa(a, b, c): a third axis turns c times, and the figure is seen in space.
// the near side is bigger and brighter. orbit = it keeps turning with the tempo
// bass = depth ratio writhes · mids = the camera leans · beat = a kick of size

function init() {
  k = beam()
    .lissa(3, 2, 5).col('#5cd6ff')
    .size(0.5).width(1.8).glow(0.9) // smaller: the near side grows with perspective
    .orbit(0.25)                  // a quarter turn in space per bar
    .r('c', bass, 5, 7)           // bass: the depth twists more
    .r('tilt', mid, 0.05, 0.2)    // mids: seen more from above
    .r('size', beat, 1.1)
  f = beam()
    .rose(5).col('#ff5c8a').size(0.3)
    .tilt(0.2).orbit(-0.5)        // a flat flower turning in space
}

function live() {
  trail(0.15)
  k.draw()
  f.draw()
}
` },

{ name: 'Lissajous drift', code: `// Lissajous drift
// the classic: a 3:2 figure that slowly turns on itself.
// bass = size · mids = the sound shakes the line · tempo = drift speed

function init() {
  b = beam()
    .lissa(3, 2).col('#7dff9a')
    .width(1.8).glow(0.9)
    .drift(0.25)                  // a quarter of a turn of phase per bar
    .r('size', bass, 0.55, 0.8)   // bass: bigger
    .r('wob', mid, 0, 0.35)       // mids: the line trembles
    .r('drift', tempo, 2)         // faster music → faster drift
}

function live() {
  trail(0.12)
  grid(0.25)
  b.draw()
}
` },

{ name: 'Classic scope', code: `// Classic scope
// what a real oscilloscope shows: the sound wave, with trigger.
// an X-Y figure of the same sound floats on the right

function init() {
  w = beam()
    .wave(1).col('#7dff9a').size(0.7).at(0, -0.2)
    .width(1.6).glow(1)
    .calm()
  x = beam()
    .xy(1).col('#5cd6ff').size(0.35).at(0.6, 0.45)
    .r('glow', amp, 0.3, 1.5)
}

function live() {
  trail(0.35)
  grid(0.35)
  crt(0.6)
  w.draw()
  x.draw()
}
` },

{ name: 'Note flower', code: `// Note flower
// the note that sounds decides the number of petals.
// beat = a flash of glow · treble = fuzz on the beam

function init() {
  f = beam()
    .rose(5).col('#ff5c8a')
    .spin(0.25).glide(0.94)
    .r('a', note, 2, 9)           // C = 2 petals … B = 9 petals
    .r('hue', pitch, 300, 420)    // higher note → warmer color
    .r('glow', beat, 1, 2)
    .r('fuzz', treble, 0, 0.5)
}

function live() {
  trail(0.08)
  f.draw()
}
` },

{ name: 'Star tunnel', code: `// Star tunnel
// a star with copies of itself inside, turning with the tempo.
// bass = more copies · mids = the turn between copies

function init() {
  s = beam()
    .poly(5, 2).col('#ffb347')
    .size(0.85).width(1.4)
    .echo(8, 0.78, 0.02)
    .spin(0.5)
    .r('echo', bass, 3, 12)
    .r('turn', mid, 0, 0.08)
    .r('size', tick, 1.08)        // a small kick on every beat
}

function live() {
  trail(0.2)
  s.draw()
}
` },

{ name: 'Breathing ring', code: `// Breathing ring
// a circle bent by the sound wave, three times, at three sizes.
// lfo(8) = slow breath · beat = the inner ring jumps

function init() {
  a = beam('a').ring(0.8).col('#5cd6ff').size(0.75)
    .r('size', lfo(8), 0.7, 0.85)
  b = beam('b').ring(1.2).col('#7dff9a').size(0.5).spin(-0.25)
    .r('gain', mid, 0.5, 2)
  c = beam('c').ring(1.5).col('#ff5c8a').size(0.25).spin(0.5)
    .r('size', beat, 1.6)
}

function live() {
  trail(0.1)
  a.draw(); b.draw(); c.draw()
}
` },

{ name: 'Square waves', code: `// Square waves
// a Lissajous made of square and triangle waves: boxes and diamonds.
// change form('sqr') to 'tri' or 'saw' while it plays

function init() {
  q = beam()
    .lissa(1, 2).form('sqr').col('#d9e4ff')
    .size(0.6).width(1.2).pts(1600)
    .drift(0.5)
    .r('a', lfo(16), 1, 4)        // the ratio glides between 1 and 4
    .r('glow', bass, 0.4, 1.6)
}

function live() {
  trail(0.25)
  grid(0.2)
  q.draw()
}
` },

{ name: 'Own formula', code: `// Own formula
// fn() draws any figure: return [x, y] for t = 0..TAU.
// its 3rd argument p has the settings of the beam, so .r() changes
// the formula itself with the music:
// bass = lobes (p.a) · mids = ripples (p.b) · highs = how deep they bend (p.gain)
// wav(u) bends the line with the sound wave · beat = a jolt

function init() {
  o = beam()
    .fn((t, u, p) => [
      sin(3 * t) * (1 - p.gain * 0.5 * (1 + cos(p.a * t))),
      cos(2 * t) * (1 - p.gain * 0.5 * (1 + sin(p.b * t))) + 0.15 * wav(u),
    ])
    .r('a', bass, 4, 12)          // bass: 4 → 12 lobes, writhing in between
    .r('b', mid, 3, 9)            // mids: ripples
    .r('gain', treble, 0.15, 0.5) // highs: deeper cuts
    .r('size', beat, 1.12)        // a jolt on every hit
    .col('#c792ea').size(0.75).spin(0.25)
    .glide(0.85)
}

function live() {
  trail(0.12)
  o.draw()
}
` },

{ name: 'Dots field', code: `// Dots field
// the beam blanks between points: a constellation that moves with the music

function init() {
  d = beam()
    .lissa(5, 4).dots().pts(240)
    .col('#7dff9a').width(1.6)
    .drift(1).spin(0.1)
    .r('pts', amp, 120, 600)
    .r('size', bass, 0.55, 0.85)
}

function live() {
  trail(0.3)
  crt(0.7)
  d.draw()
}
` },

];
