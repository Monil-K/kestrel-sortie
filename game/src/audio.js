// Sound, synthesized: a turboprop that changes pitch with RPM, wind that rises with airspeed,
// the cannon, gear clunks and the warning horn. No audio files, nothing to download.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.lastBeep = 0;
  }

  start() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);

    // ---- engine: two detuned saws through a lowpass, plus prop noise
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 900;
    engineFilter.Q.value = 3;
    this.engineGain.connect(engineFilter);
    engineFilter.connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = 60;
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc2.frequency.value = 90;
    const g1 = ctx.createGain();
    g1.gain.value = 0.35;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    this.osc1.connect(g1); g1.connect(this.engineGain);
    this.osc2.connect(g2); g2.connect(this.engineGain);
    this.osc1.start();
    this.osc2.start();

    // ---- prop wash and wind: filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.6 + white * 0.4;
      data[i] = last;
    }
    this.noiseBuf = buf;

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();

    this.ready = true;
    this.master.gain.setTargetAtTime(0.55, ctx.currentTime, 1.2);
  }

  update(ac, throttle, playing) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rpm = ac ? ac.rpm : 0.2;
    const speed = ac ? ac.airspeed : 0;
    const target1 = 42 + rpm * 118;
    this.osc1.frequency.setTargetAtTime(target1, t, 0.12);
    this.osc2.frequency.setTargetAtTime(target1 * 1.502, t, 0.12);
    this.engineGain.gain.setTargetAtTime(playing ? 0.10 + throttle * 0.14 : 0.02, t, 0.2);
    this.windGain.gain.setTargetAtTime(playing ? Math.min(0.16, speed * 0.0011) : 0.0, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(420 + speed * 5.2, t, 0.3);
  }

  blip(freq = 660, dur = 0.09, type = 'sine', gain = 0.12) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  gun() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1600;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 0.1);
    this.blip(120, 0.06, 'square', 0.1);
  }

  crash() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 1.2);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + 1.5);
  }

  chime(up = true) {
    this.blip(up ? 880 : 420, 0.16, 'sine', 0.1);
    setTimeout(() => this.blip(up ? 1320 : 320, 0.2, 'sine', 0.08), 90);
  }

  warn(now) {
    if (now - this.lastBeep < 0.55) return;
    this.lastBeep = now;
    this.blip(520, 0.08, 'square', 0.07);
  }

  clunk() {
    this.blip(160, 0.12, 'square', 0.1);
  }
}
