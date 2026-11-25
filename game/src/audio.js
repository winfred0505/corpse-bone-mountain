// Web Audio API Pentatonic Ink-Wash Soundtrack + Layered Combat SFX
// Supports optional external MP3 drop-ins: assets/music/{explore,battle,boss}.mp3
// Respects ?mute URL param and browser autoplay gesture unlock.

const PENTATONIC = [220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25]; // A minor pentatonic (羽調式)

export function createAudioSystem({ muted = false } = {}) {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let reverbSend = null;
  let isMuted = muted;
  let unlocked = false;
  let musicState = 'explore'; // explore | battle | boss
  let ducked = false;
  let seqTimer = 0;
  let stepIdx = 0;
  let noiseBuf = null;

  // Optional external MP3 audio elements (gracefully falls back to procedural pentatonic synth)
  const extTracks = { explore: null, battle: null, boss: null };
  let useExternal = false;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended' && !isMuted) ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.14;

    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted ? 0 : 0.96;
    comp.connect(masterGain);
    masterGain.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 1.0;
    sfxGain.connect(comp);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.40;
    musicGain.connect(comp);

    // Procedural dark cathedral reverb impulse (1.6s stereo tail) for huge orchestral choir & brass depth!
    const revLen = Math.floor(ctx.sampleRate * 1.6);
    const revBuf = ctx.createBuffer(2, revLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = revBuf.getChannelData(ch);
      for (let i = 0; i < revLen; i++) {
        const env = Math.pow(1 - i / revLen, 2.6);
        d[i] = (Math.random() * 2 - 1) * env;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = revBuf;
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.42;
    convolver.connect(reverbSend);
    reverbSend.connect(comp);
    musicGain.connect(convolver);

    // Pre-generate 2s filtered white noise buffer for whip whooshes & wind
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Probe optional external MP3 tracks (check bundled window.__A first; skip fetch on file://)
    ['explore', 'battle', 'boss'].forEach((k) => {
      const key = `assets/music/${k}.mp3`;
      if (window.__A && window.__A[key]) {
        const a = new Audio(window.__A[key]);
        a.loop = true;
        a.volume = 0;
        extTracks[k] = a;
        useExternal = true;
        return;
      }
      if (location.protocol === 'file:') return;
      fetch(`./${key}`, { method: 'HEAD' })
        .then((r) => {
          if (r.ok) {
            const a = new Audio(`./${key}`);
            a.loop = true;
            a.volume = 0;
            extTracks[k] = a;
            useExternal = true;
          }
        })
        .catch(() => {});
    });

    unlocked = true;
    return ctx;
  }

  function unlock() {
    if (!isMuted) ensureContext();
  }

  function targetMusicVol() {
    const base = (musicState === 'boss' || musicState === 'boss_p2') ? 0.78
      : musicState === 'battle' ? 0.54 : 0.38;
    return ducked ? base * 0.58 : base;
  }

  function setMuted(m) {
    isMuted = m;
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.96, ctx.currentTime, 0.04);
    }
    Object.values(extTracks).forEach((a) => { if (a) a.muted = isMuted; });
  }

  function setDucked(d) {
    ducked = d;
    if (musicGain && ctx) {
      musicGain.gain.setTargetAtTime(targetMusicVol(), ctx.currentTime, 0.14);
    }
  }

  function setMusicState(st) {
    if (musicState === st) return;
    musicState = st;
    seqTimer = 0;
    stepIdx = 0;
    if (musicGain && ctx) {
      musicGain.gain.setTargetAtTime(targetMusicVol(), ctx.currentTime, 0.12);
    }
    if (reverbSend && ctx) {
      reverbSend.gain.setTargetAtTime(0.42, ctx.currentTime, 0.1);
    }
    if (useExternal) {
      const key = st === 'boss_p2' ? 'boss' : st;
      Object.entries(extTracks).forEach(([k, a]) => {
        if (!a) return;
        if (k === key) { a.play().catch(() => {}); a.volume = isMuted ? 0 : targetMusicVol(); }
        else { a.volume = 0; }
      });
    }
  }

  const jitter = (pct = 0.06) => 1 + (Math.random() * 2 - 1) * pct;

  // Plucked Guzheng-like note (for procedural pentatonic soundtrack)
  function playGuzheng(freq, dur = 1.4, vol = 0.22) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(freq * 5.2, now);
    filt.frequency.exponentialRampToValueAtTime(freq * 1.3, now + dur * 0.7);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(g);
    g.connect(musicGain);

    osc.start(now); osc2.start(now);
    osc.stop(now + dur + 0.05); osc2.stop(now + dur + 0.05);
  }

  // Thunderous Dual-Layer Taiko / War Drum (sub-bass chest punch + drum-skin crack)
  function playDrum(pitch = 62, vol = 0.72) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch * 2.1, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(32, pitch * 0.55), now + 0.28);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(g); g.connect(musicGain);
    osc.start(now); osc.stop(now + 0.38);

    // Drum skin slap transient
    if (noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.value = pitch * 5.5;
      lp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.55, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      src.connect(lp); lp.connect(ng); ng.connect(musicGain);
      src.start(now, Math.random() * 0.5, 0.1);
    }
  }

  // Resonant Bronze War Gong + Cymbal Snap
  function playPercSnap(vol = 0.32, isGong = false) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    if (isGong) {
      // Multi-partial bronze war gong boom
      [112, 168, 251, 389, 542].forEach((f, idx) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = idx % 2 === 0 ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 0.96, now + 1.35);
        g.gain.setValueAtTime(vol * (0.48 / (1 + idx * 0.35)), now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
        o.connect(g); g.connect(musicGain);
        o.start(now); o.stop(now + 1.45);
      });
    }
    if (noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = isGong ? 'bandpass' : 'highpass';
      filt.frequency.value = isGong ? 1900 : 3200;
      filt.Q.value = isGong ? 1.8 : 1.0;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * (isGong ? 0.85 : 0.65), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + (isGong ? 0.95 : 0.075));
      src.connect(filt); filt.connect(g); g.connect(musicGain);
      src.start(now, Math.random() * 0.6, isGong ? 1.0 : 0.09);
    }
  }

  // Epic Detuned Low Brass / Dark Strings Power Chord (huge cinematic dread!)
  function playEpicBrass(rootFreq, dur = 0.95, vol = 0.36) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(280, now);
    filt.frequency.exponentialRampToValueAtTime(1750, now + 0.14);
    filt.frequency.exponentialRampToValueAtTime(520, now + dur);
    filt.Q.value = 2.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.05);
    g.gain.setValueAtTime(vol * 0.82, now + dur * 0.65);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    filt.connect(g); g.connect(musicGain);

    // Root + Detuned Root + Power Fifth
    [rootFreq * 0.996, rootFreq * 1.004, rootFreq * 1.498].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, now);
      o.connect(filt);
      o.start(now);
      o.stop(now + dur + 0.05);
    });
  }

  // Urgent piercing bowed-string / suona tension lead for Boss battles
  function playBossLead(freq, dur = 0.38, vol = 0.36) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    vib.frequency.value = 6.5;
    vibG.gain.value = freq * 0.016;
    vib.connect(vibG);
    vibG.connect(osc.frequency);

    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq * 2.4, now);
    filt.Q.value = 1.9;

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.025);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(musicGain);
    osc.start(now); osc2.start(now); vib.start(now);
    osc.stop(now + dur + 0.04); osc2.stop(now + dur + 0.04); vib.stop(now + dur + 0.04);
  }

  // Dark Latin Choir Pad (parallel vowel-formant bandpass filters: "AH" / "OH" / "AW" / "OO")
  const CHOIR_VOWELS = [
    [730, 1090], // "AH"
    [570, 840],  // "OH"
    [440, 1020], // "AW"
    [320, 870],  // "OO"
  ];
  function playDarkChoir(chordFreqs, vowelIdx = 0, dur = 1.15, vol = 0.28) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const [f1, f2] = CHOIR_VOWELS[vowelIdx % CHOIR_VOWELS.length];

    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.001, now);
    bus.gain.linearRampToValueAtTime(vol, now + 0.14);
    bus.gain.setValueAtTime(vol * 0.85, now + dur * 0.72);
    bus.gain.exponentialRampToValueAtTime(0.001, now + dur);

    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass'; bp1.frequency.value = f1; bp1.Q.value = 4.2;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = f2; bp2.Q.value = 5.0;

    bus.connect(bp1); bus.connect(bp2);
    bp1.connect(musicGain); bp2.connect(musicGain);

    for (const freq of chordFreqs) {
      [-0.006, 0.006].forEach((det) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(freq * (1 + det), now);
        o.connect(bus);
        o.start(now);
        o.stop(now + dur + 0.06);
      });
    }
  }

  // Aggressive Spiccato Orchestral Strings (rapid biting 16th-note ostinato)
  function playAggressiveString(freq, dur = 0.14, vol = 0.26) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(freq, now);
    o2.type = 'sawtooth'; o2.frequency.setValueAtTime(freq * 1.005, now);

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(Math.min(3400, freq * 3.8), now);
    filt.Q.value = 1.3;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);

    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(musicGain);
    o1.start(now); o2.start(now);
    o1.stop(now + dur + 0.03); o2.stop(now + dur + 0.03);
  }

  // Procedural Pentatonic (Explore/Battle) + Epic Orchestral Boss Sequencer (D minor Dies Irae feel)
  const MEL_EXPLORE = [0, -1, 2, 4, -1, 3, 2, -1, 5, -1, 4, 2, -1, 0, -1, -1];
  const MEL_BATTLE  = [0, 3, 4, 2, 5, 4, 3, 2, 0, 4, 6, 5, 4, 3, 2, 0];

  // D Minor Epic Orchestral Boss Progression: Dm -> Bb -> Gm -> A7
  const BOSS_BARS = [
    { root: 73.42, choir: [293.66, 349.23, 440.0],  ost: [146.83, 146.83, 174.61, 146.83, 220.0, 146.83, 174.61, 164.81] },
    { root: 58.27, choir: [233.08, 293.66, 349.23], ost: [116.54, 116.54, 146.83, 116.54, 174.61, 116.54, 146.83, 130.81] },
    { root: 98.00, choir: [293.66, 392.00, 466.16], ost: [196.00, 196.00, 233.08, 196.00, 293.66, 196.00, 233.08, 220.00] },
    { root: 110.0, choir: [277.18, 329.63, 440.00], ost: [220.00, 220.00, 261.63, 277.18, 329.63, 277.18, 261.63, 220.00] },
  ];
  const BOSS_LEAD_NOTES = [
    587.33, -1, 554.37, 587.33, 659.25, -1, 698.46, 587.33,
    466.16, -1, 523.25, 587.33, 659.25, 587.33, 554.37, -1,
  ];

  function update(dt) {
    if (!unlocked || !ctx || isMuted || useExternal) return;
    const isBoss = musicState === 'boss' || musicState === 'boss_p2';
    const isP2 = musicState === 'boss_p2';
    const stepDur = isP2 ? 0.095 : isBoss ? 0.112 : musicState === 'battle' ? 0.25 : 0.50;
    seqTimer += dt;
    if (seqTimer >= stepDur) {
      seqTimer -= stepDur;
      const s = stepIdx % 16;

      if (isBoss) {
        const barIdx = Math.floor(stepIdx / 8) % BOSS_BARS.length;
        const bar = BOSS_BARS[barIdx];

        if (s === 0 || s === 8) {
          playEpicBrass(bar.root, stepDur * 7.5, isP2 ? 0.56 : 0.46);
          playDarkChoir(bar.choir, barIdx, stepDur * 8.2, isP2 ? 0.42 : 0.34);
        }
        if (s === 6 || s === 14) {
          playEpicBrass(bar.root * 2, stepDur * 2.2, 0.32);
        }

        const strNote = bar.ost[s % 8];
        playAggressiveString(strNote * (isP2 ? 2.0 : 1.0), stepDur * 1.15, isP2 ? 0.32 : 0.26);
        if (s % 2 === 0) playAggressiveString(strNote * 2.0, stepDur * 0.9, 0.18);

        const ld = BOSS_LEAD_NOTES[s];
        if (ld > 0) {
          playBossLead(ld, stepDur * 2.8, isP2 ? 0.36 : 0.28);
        }

        if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14 || (isP2 && (s === 4 || s === 12))) {
          const isDownbeat = (s === 0 || s === 8);
          playDrum(isDownbeat ? 50 : 74, isDownbeat ? 0.95 : 0.68);
        }
        if (s === 4 || s === 12 || (isP2 && s % 2 === 1)) {
          playPercSnap(0.26, false);
        }
        if (s === 0 && stepIdx % 16 === 0) {
          playPercSnap(0.55, true);
        }
      } else {
        const pattern = musicState === 'battle' ? MEL_BATTLE : MEL_EXPLORE;
        const note = pattern[s];
        if (note >= 0) {
          const oct = musicState === 'explore' && s % 4 === 0 ? 0.5 : 1.0;
          playGuzheng(PENTATONIC[note] * oct, musicState === 'explore' ? 1.8 : 0.72, 0.30);
        }
        if (musicState === 'battle' && (s % 4 === 0 || s === 14)) playDrum(68, 0.55);
      }
      stepIdx++;
    }
  }

  // ============================================================================
  // Layered Combat SFX
  // ============================================================================
  function playWhip(heavy = false) {
    if (!ctx || isMuted || !noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.Q.value = heavy ? 1.8 : 2.6;
    filt.frequency.setValueAtTime((heavy ? 750 : 1250) * jitter(), now);
    filt.frequency.exponentialRampToValueAtTime(heavy ? 180 : 320, now + (heavy ? 0.24 : 0.15));

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(heavy ? 0.42 : 0.28, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.26 : 0.17));

    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(now, Math.random() * 0.8, 0.3);
  }

  function playHit(heavy = false) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    // Layer 1: Low-end thud
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime((heavy ? 140 : 190) * jitter(), now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (heavy ? 0.18 : 0.11));
    g.gain.setValueAtTime(heavy ? 0.55 : 0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.20 : 0.13));
    osc.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.22);

    // Layer 2: Crisp crack
    if (noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = heavy ? 1100 : 1800;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(heavy ? 0.32 : 0.2, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      src.connect(hp); hp.connect(ng); ng.connect(sfxGain);
      src.start(now, Math.random(), 0.1);
    }
  }

  // Loudest, crispest metallic bell-clash confirmation (vfx-ui-audio.md)
  function playParry() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const freqs = [1180, 1785, 2860];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f * jitter(0.03), now);
      g.gain.setValueAtTime(idx === 0 ? 0.45 : 0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + (0.48 - idx * 0.08));
      osc.connect(g); g.connect(sfxGain);
      osc.start(now); osc.stop(now + 0.52);
    });
  }

  function playGuard() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(340 * jitter(), now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(lp); lp.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.16);
  }

  function playDodge() {
    if (!ctx || isMuted || !noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(220, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    src.connect(lp); lp.connect(g); g.connect(sfxGain);
    src.start(now, Math.random(), 0.22);
  }

  function playDecoction() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    [220, 330, 440, 660].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.045);
      g.gain.setValueAtTime(0.001, now + i * 0.045);
      g.gain.linearRampToValueAtTime(0.22, now + i * 0.045 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.55);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now + i * 0.045); osc.stop(now + i * 0.045 + 0.6);
    });
  }

  function playUlt() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    [146.8, 220, 440, 587.3, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0.28 / (1 + i * 0.25), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now); osc.stop(now + 1.4);
    });
  }

  function playAntidote() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.07);
      g.gain.setValueAtTime(0.22, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.42);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now + i * 0.07); osc.stop(now + i * 0.07 + 0.45);
    });
  }

  // Bell-chime loot drop ping graded by toxicity tier (vfx-ui-audio.md)
  function playLoot(tier = '良方') {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const base = tier === '大毒' ? 880 : tier === '有毒' ? 659.25 : 587.33;
    const dur = tier === '大毒' ? 0.95 : 0.55;
    [1, 2.0, 2.75].forEach((mul, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * mul, now);
      g.gain.setValueAtTime(0.26 / (idx + 1), now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g); g.connect(sfxGain);
      osc.start(now); osc.stop(now + dur + 0.05);
    });
  }

  function playAlert(isDanger = true) {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isDanger ? 210 : 392, now);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = isDanger ? 650 : 1200;
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(lp); lp.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.38);
  }

  function playPlayerHit() {
    if (!ctx || isMuted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(98, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g); g.connect(sfxGain);
    osc.start(now); osc.stop(now + 0.28);
  }

  return {
    unlock,
    setMuted,
    isMuted: () => isMuted,
    setDucked,
    setMusicState,
    update,
    playWhip,
    playHit,
    playParry,
    playGuard,
    playDodge,
    playDecoction,
    playUlt,
    playAntidote,
    playLoot,
    playAlert,
    playPlayerHit,
  };
}
