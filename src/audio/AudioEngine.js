// Áudio 100% procedural (Web Audio): efeitos, ambiente de fábrica e música generativa.
// Nenhum arquivo externo: sem dependências de licença. Falhas de áudio nunca interrompem o jogo.
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      this.amb = this.ctx.createGain();
      this.sfx.connect(this.master); this.music.connect(this.master); this.amb.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.applyVolumes();
      this.startAmbience();
      this.startMusic();
    } catch (e) { console.warn('Áudio indisponível', e); this.ctx = null; }
  }

  resume() { try { this.ctx?.state === 'suspended' && this.ctx.resume(); } catch {} }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
    this.music.gain.value = s.musicVolume * 0.5;
    this.amb.gain.value = s.sfxVolume * 0.6;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, delay = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    const now = performance.now();
    const minGap = { coin: 90, error: 250, click: 40 }[name] ?? 60;
    if (now - (this.lastPlay[name] || 0) < minGap) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'click': this.tone(880, 0.06, { type: 'triangle', vol: 0.12 }); break;
      case 'place':
        this.noise(0.18, { vol: 0.35, freq: 400, q: 0.8 });
        this.tone(160, 0.2, { type: 'square', vol: 0.12, slide: -60 });
        this.tone(520, 0.1, { type: 'triangle', vol: 0.12, delay: 0.06 });
        break;
      case 'belt': this.noise(0.08, { vol: 0.15, freq: 900, q: 2 }); this.tone(300, 0.06, { type: 'triangle', vol: 0.06 }); break;
      case 'demolish': this.noise(0.4, { vol: 0.4, freq: 250, q: 0.6, type: 'lowpass' }); this.tone(120, 0.35, { type: 'sawtooth', vol: 0.1, slide: -70 }); break;
      case 'coin': this.tone(1318, 0.09, { type: 'square', vol: 0.05 }); this.tone(1760, 0.14, { type: 'square', vol: 0.05, delay: 0.06 }); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.15, delay: i * 0.07 })); break;
      case 'unlock': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', vol: 0.2, delay: i * 0.09 })); this.noise(0.8, { vol: 0.08, freq: 6000, q: 0.5, type: 'highpass' }); break;
      case 'objective': [659, 784, 988].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.1 })); break;
      case 'error': this.tone(220, 0.15, { type: 'square', vol: 0.08 }); this.tone(180, 0.2, { type: 'square', vol: 0.08, delay: 0.1 }); break;
      case 'alert': this.tone(880, 0.12, { type: 'sine', vol: 0.12 }); this.tone(660, 0.18, { type: 'sine', vol: 0.12, delay: 0.14 }); break;
      case 'save': this.tone(660, 0.1, { vol: 0.12 }); this.tone(990, 0.15, { vol: 0.12, delay: 0.08 }); break;
      case 'rotate': this.tone(600, 0.05, { type: 'triangle', vol: 0.08, slide: 200 }); break;
    }
  }

  // ambiente: zumbido de fábrica proporcional à atividade + vento
  startAmbience() {
    const c = this.ctx;
    const wind = c.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 500;
    const wg = c.createGain(); wg.gain.value = 0.05;
    wind.connect(wf); wf.connect(wg); wg.connect(this.amb); wind.start();
    // motores
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 55;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 180;
    this.humGain = c.createGain(); this.humGain.gain.value = 0;
    this.hum.connect(hf); hf.connect(this.humGain); this.humGain.connect(this.amb); this.hum.start();
    // esteiras (ruído rítmico)
    const belt = c.createBufferSource(); belt.buffer = this.noiseBuf; belt.loop = true;
    const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1500; bf.Q.value = 3;
    this.beltGain = c.createGain(); this.beltGain.gain.value = 0;
    belt.connect(bf); bf.connect(this.beltGain); this.beltGain.connect(this.amb); belt.start();
  }

  setActivity(machines, belts) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(Math.min(0.12, machines * 0.008), t, 0.5);
    this.beltGain.gain.setTargetAtTime(Math.min(0.05, belts * 0.0015), t, 0.5);
  }

  // música generativa calma (progressão de acordes com arpejo)
  startMusic() {
    const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      const ch = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) for (const f of ch) this.tone(f / 2, 3.6, { type: 'sine', vol: 0.06, attack: 0.8, dest: this.music });
      const f = ch[[0, 1, 2, 1, 0, 2, 1, 2][step % 8]] * 2;
      if (Math.random() < 0.75) this.tone(f, 0.6, { type: 'triangle', vol: 0.035, attack: 0.02, dest: this.music });
      step++;
    };
    this.musicTimer = setInterval(tick, 480);
  }
}
