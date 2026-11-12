// A little generative soundtrack: a soft pad, chimes for shooting stars, and a
// music-box "Happy Birthday" for the finale. No audio files — it is all synthesised.

let ctx = null;
let master = null;
let wet = null;
let pad = null;
let muted = false;

function impulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

/** Must be called from a tap. */
export function startAudio() {
  if (ctx) {
    ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(3.2);
  wet = ctx.createGain();
  wet.gain.value = 0.55;
  wet.connect(verb);
  verb.connect(master);

  // pad: an open D chord, slowly breathing
  pad = ctx.createGain();
  pad.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  pad.connect(lp);
  lp.connect(master);
  lp.connect(wet);
  for (const [f, g] of [[73.42, 0.5], [146.83, 0.4], [220, 0.3], [293.66, 0.22], [369.99, 0.14], [440, 0.1]]) {
    for (const det of [-4, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = g * 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.12;
      const lg = ctx.createGain();
      lg.gain.value = g * 0.25;
      lfo.connect(lg);
      lg.connect(og.gain);
      o.connect(og);
      og.connect(pad);
      o.start();
      lfo.start();
    }
  }
  pad.gain.linearRampToValueAtTime(0.11, ctx.currentTime + 6);
  decodeVoice();
}

// ── recorded narration ──
const raw = {};   // line → encoded file, as fetched
const clips = {}; // line → decoded audio
function decodeVoice() {
  if (!ctx) return;
  for (const key of Object.keys(raw)) {
    const data = raw[key];
    delete raw[key];
    ctx.decodeAudioData(data, (buf) => { clips[key] = buf; }, () => {});
  }
}
/** Fetches voice/<lang>/01.<ext>, 02.<ext>, … for the given lines. Missing files are simply skipped. */
export async function loadVoice(lang, ext, lines) {
  await Promise.all(lines.map(async (key, i) => {
    try {
      const r = await fetch(`voice/${lang}/${String(i + 1).padStart(2, '0')}.${ext}`);
      if (r.ok) raw[key] = await r.arrayBuffer();
    } catch (e) { /* no recording for this line */ }
  }));
  decodeVoice();
}
/** Plays the recording for a line, if there is one. Returns its length in seconds (0 if none). */
export function speak(key) {
  const buf = clips[key];
  if (!ctx || !buf) return 0;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const dry = ctx.createGain();
  dry.gain.value = 1;
  src.connect(dry);
  dry.connect(master);
  const air = ctx.createGain();
  air.gain.value = 0.07;
  src.connect(air);
  air.connect(wet);
  // let the music step back while the voice is speaking
  pad.gain.cancelScheduledValues(t);
  pad.gain.setTargetAtTime(0.045, t, 0.25);
  pad.gain.setTargetAtTime(0.11, t + buf.duration + 0.3, 0.8);
  src.start(t + 0.05);
  speaking = src;
  return buf.duration;
}
let speaking = null;
/** Cuts off a line that is still being spoken (when the story is skipped). */
export function stopVoice() {
  try {
    if (speaking) speaking.stop();
  } catch (e) { /* already finished */ }
  speaking = null;
}
export const hasVoice = () => Object.keys(clips).length + Object.keys(raw).length > 0;

export function setMuted(m) {
  muted = m;
  if (master) master.gain.linearRampToValueAtTime(m ? 0 : 0.9, ctx.currentTime + 0.3);
}
export const isMuted = () => muted;

/** A music-box / glass bell note. */
export function bell(freq, when = 0, gain = 0.2, decay = 2.2) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(gain, t + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  out.connect(master);
  out.connect(wet);
  for (const [mult, g, d] of [[1, 1, 1], [2, 0.3, 0.6], [3.01, 0.12, 0.35], [5.4, 0.05, 0.2]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const og = ctx.createGain();
    og.gain.setValueAtTime(g, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + decay * d);
    o.connect(og);
    og.connect(out);
    o.start(t);
    o.stop(t + decay + 0.1);
  }
}

const SCALE = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51, 1479.98, 1760];
export function chime(gain = 0.1) {
  bell(SCALE[Math.floor(Math.random() * SCALE.length)], 0, gain, 2.6);
}

// "Happy Birthday to You" in D, as [semitones above A4, beats]
const TUNE = [
  [0, 0.75], [0, 0.25], [2, 1], [0, 1], [5, 1], [4, 2],
  [0, 0.75], [0, 0.25], [2, 1], [0, 1], [7, 1], [5, 2],
  [0, 0.75], [0, 0.25], [12, 1], [9, 1], [5, 1], [4, 1], [2, 2],
  [10, 0.75], [10, 0.25], [9, 1], [5, 1], [7, 1], [5, 3],
];
/** Plays the tune; returns its length in seconds. */
export function happyBirthday(beat = 0.5) {
  let t = 0.1;
  const k = hasVoice() ? 0.6 : 1; // quieter under a spoken greeting
  for (const [semi, beats] of TUNE) {
    const f = 880 * Math.pow(2, semi / 12);
    bell(f, t, 0.16 * k, 1.2 + beats * 0.9);
    if (beats >= 1) bell(f / 2, t, 0.05 * k, 1.6);
    t += beats * beat;
  }
  return t;
}
