// Synthesized sound effects (no audio files). Tiny Earth rev 1.2
let actx = null;
let muted = false;

export function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone(freq, dur = 0.4, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
  const a = audio(); if (!a || muted) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur = 0.5, vol = 0.2, freq = 400, type = 'lowpass') {
  const a = audio(); if (!a || muted) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start();
}

export const sfx = {
  step: () => tone(520 + Math.random() * 140, 0.06, 'triangle', 0.05),
  paddle: () => noise(0.12, 0.06, 1800, 'bandpass'),
  hop: () => tone(380, 0.18, 'sine', 0.12, 2.2),
  bell: () => { tone(1318, 1.2, 'sine', 0.13); tone(1975, 0.9, 'sine', 0.06); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, 0, i * 0.11)),
  star: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, 'sine', 0.09, 0, i * 0.08)),
  collect: () => { tone(1175, 0.15, 'triangle', 0.08); tone(1568, 0.25, 'triangle', 0.07, 0, 0.07); },
  thud: () => { tone(110, 0.25, 'sine', 0.2, 0.5); noise(0.15, 0.12, 300); },
  click: () => tone(900, 0.05, 'square', 0.04),
  press: () => { tone(660, 0.07, 'triangle', 0.08); tone(990, 0.08, 'triangle', 0.05, 0, 0.05); },
  splash: () => noise(0.6, 0.18, 2200),
  rumble: () => { noise(1.4, 0.35, 140); tone(55, 1.2, 'sawtooth', 0.08, 0.6); },
  sizzle: () => { noise(0.5, 0.15, 3000); tone(300, 0.4, 'square', 0.04, 0.3); },
  toot: () => { tone(392, 0.25, 'square', 0.05); tone(523, 0.35, 'square', 0.05, 0, 0.2); },
  whoosh: () => noise(0.35, 0.1, 900, 'bandpass'),
  ring: () => { tone(880, 0.2, 'sine', 0.09, 1.5); tone(1320, 0.3, 'sine', 0.06, 0, 0.08); }
};
