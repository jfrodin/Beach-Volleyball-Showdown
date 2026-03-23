// ============================================================
//  Beach Volleyball Showdown – Audio Engine
//  Miami Vice / Synthwave vibes via Web Audio API
// ============================================================

const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let playing = false;
  let nextBarTime = 0;
  let barCount = 0;
  let schedTimer = null;

  const BPM      = 100;
  const BEAT     = 60 / BPM;
  const BAR      = BEAT * 4;
  const LOOKAHEAD = BAR * 3;    // schedule 3 bars ahead
  const INTERVAL  = 200;        // ms between scheduler ticks

  // ── Helpers ────────────────────────────────────────────────
  function n(name, oct) {
    const S = { C:0, D:2, E:4, F:5, G:7, A:9, B:11, Eb:3, Ab:8, Bb:10, Db:1, Gb:6 };
    return 440 * Math.pow(2, ((S[name] || 0) + (oct + 1) * 12 - 69) / 12);
  }

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.38;

    // Reverb (impulse response)
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
    }
    rev.buffer = buf;
    const revGain = ctx.createGain();
    revGain.gain.value = 0.18;
    master.connect(revGain);
    revGain.connect(rev);
    rev.connect(ctx.destination);
    master.connect(ctx.destination);
  }

  // ── Primitive oscillator ───────────────────────────────────
  function osc(freq, start, dur, type = 'sawtooth', vol = 0.15, detune = 0, cutoff = 3000) {
    if (!ctx || !master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 1.5;
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.015);
    g.gain.setValueAtTime(vol, start + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, start + dur);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(start); o.stop(start + dur + 0.05);
  }

  // ── Drums ──────────────────────────────────────────────────
  function kick(t) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.25);
    g.gain.setValueAtTime(1.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.38);
  }

  function snare(t) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.18);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    const f   = ctx.createBiquadFilter();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  function hat(t, vol = 0.09) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    const f   = ctx.createBiquadFilter();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = 9000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  // ── Music: Cm – Ab – Bb – G (Miami Vice flavour) ──────────
  const PROG = [
    { bass: n('C',2),  chord: [n('C',4), n('Eb',4), n('G',4),  n('C',5)  ] },
    { bass: n('Ab',1), chord: [n('Ab',3),n('C',4),  n('Eb',4), n('Ab',4) ] },
    { bass: n('Bb',1), chord: [n('Bb',3),n('D',4),  n('F',4),  n('Bb',4) ] },
    { bass: n('G',1),  chord: [n('G',3), n('B',3),  n('D',4),  n('G',4)  ] },
  ];

  function scheduleBar(t, idx) {
    const { bass, chord } = PROG[idx % 4];

    // Drums
    kick(t);            kick(t + BEAT * 2);
    snare(t + BEAT);    snare(t + BEAT * 3);
    for (let i = 0; i < 8; i++) hat(t + i * BEAT * 0.5, i % 2 === 0 ? 0.09 : 0.05);

    // Bass (square, punchy)
    osc(bass, t,               BEAT * 0.85, 'square', 0.22, 0, 600);
    osc(bass, t + BEAT * 1.5,  BEAT * 0.4,  'square', 0.16, 0, 600);
    osc(bass, t + BEAT * 2,    BEAT * 0.85, 'square', 0.22, 0, 600);
    osc(bass, t + BEAT * 3.5,  BEAT * 0.4,  'square', 0.16, 0, 600);

    // Pad chords (sine layers)
    chord.forEach(nn => {
      osc(nn,       t, BAR * 0.97, 'sine', 0.038);
      osc(nn * 0.5, t, BAR * 0.97, 'sine', 0.025);
    });

    // Arp (sawtooth, detuned pair — classic 80s shimmer)
    const arpLen = chord.length;
    for (let i = 0; i < 16; i++) {
      const dir = (i < 8) ? i % arpLen : (arpLen - 1 - i % arpLen);
      const nn  = chord[dir];
      const at  = t + i * BEAT * 0.25;
      osc(nn, at, BEAT * 0.22, 'sawtooth', 0.055, -9,  4000);
      osc(nn, at, BEAT * 0.22, 'sawtooth', 0.045,  9,  4000);
    }

    // Lead melody (every 4 bars, adds feel)
    if (idx % 4 === 0) {
      const mel = [chord[2], chord[3], chord[2], chord[1], chord[0]];
      mel.forEach((nn, i) => osc(nn, t + i * BEAT * 0.8, BEAT * 0.7, 'sawtooth', 0.07, 0, 5000));
    }
  }

  function scheduler() {
    if (!ctx) return;
    while (nextBarTime < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(nextBarTime, barCount);
      nextBarTime += BAR;
      barCount++;
    }
    schedTimer = setTimeout(scheduler, INTERVAL);
  }

  // ── Sound effects ──────────────────────────────────────────
  function sfxHit() {
    init();
    const t = ctx.currentTime;
    osc(900, t, 0.07, 'square', 0.18, 0, 2000);
    osc(450, t, 0.06, 'square', 0.10, 0, 1000);
  }

  function sfxServe() {
    init();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(350, t);
    o.frequency.linearRampToValueAtTime(900, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.22);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
  }

  function sfxNet() {
    init();
    const t = ctx.currentTime;
    osc(250, t, 0.14, 'sawtooth', 0.14, 0, 800);
  }

  function sfxPoint() {
    init();
    const t = ctx.currentTime;
    [n('C',5), n('E',5), n('G',5), n('C',6)].forEach((nn, i) =>
      osc(nn, t + i * 0.1, 0.28, 'sawtooth', 0.14, 0, 5000)
    );
  }

  function sfxGameOver() {
    init();
    const t = ctx.currentTime;
    [n('C',5), n('G',4), n('E',4), n('C',4)].forEach((nn, i) =>
      osc(nn, t + i * 0.18, 0.35, 'sawtooth', 0.12, 0, 4000)
    );
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    start() {
      init();
      // Fade volume back in
      master.gain.setTargetAtTime(0.38, ctx.currentTime, 0.08);
      playing = true;
      // Start scheduler only if not already running
      if (!schedTimer) {
        nextBarTime = ctx.currentTime + 0.05;
        barCount    = 0;
        scheduler();
      }
    },
    stop() {
      // Fade out instead of killing the scheduler — prevents double-music on resume
      if (master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      playing = false;
    },
    toggle() { playing ? this.stop() : this.start(); },
    isPlaying() { return playing; },
    setVolume(v) { if (master) master.gain.value = Math.max(0, Math.min(1, v)); },
    sfxHit, sfxServe, sfxNet, sfxPoint, sfxGameOver,
  };
})();
