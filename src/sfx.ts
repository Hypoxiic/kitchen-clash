// Tiny synthesized sound effects (no audio files). Browsers only allow audio
// after a user gesture, so the context is created on the first tap.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sizzleGain: GainNode | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, vol: number, q = 1) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  unlock() {
    ac();
  },
  setMuted(m: boolean) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  },
  get muted() {
    return muted;
  },
  tap() {
    tone(660, 0.06, 'sine', 0.08);
  },
  pickup() {
    tone(520, 0.12, 'triangle', 0.18, 880);
  },
  place() {
    tone(220, 0.12, 'sine', 0.25, 140);
    noise(0.05, 1800, 0.08);
  },
  chop() {
    noise(0.07, 2600, 0.35, 0.8);
    tone(180, 0.06, 'square', 0.06, 90);
  },
  torch() {
    noise(0.2, 900, 0.12, 0.6);
  },
  ding() {
    tone(1318, 1.2, 'sine', 0.22);
    tone(1975, 0.8, 'sine', 0.08);
  },
  tick() {
    tone(880, 0.08, 'square', 0.06);
  },
  go() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, undefined, i * 0.07));
  },
  bin() {
    tone(300, 0.25, 'sawtooth', 0.06, 80);
  },
  reveal() {
    tone(440, 0.09, 'triangle', 0.12, 660);
  },
  fanfare() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.8 : 0.18, 'triangle', 0.18, undefined, i * 0.13));
  },
  aww() {
    tone(392, 0.5, 'triangle', 0.12, 294);
  },
  /** Continuous frying sound; level 0 is silent. */
  sizzle(level: number) {
    const c = ac();
    if (!c || !master) return;
    if (!sizzleGain) {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c, 2);
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 3500;
      sizzleGain = c.createGain();
      sizzleGain.gain.value = 0;
      src.connect(f).connect(sizzleGain).connect(master);
      src.start();
    }
    sizzleGain.gain.setTargetAtTime(Math.min(level, 2) * 0.05, c.currentTime, 0.2);
  },
};
