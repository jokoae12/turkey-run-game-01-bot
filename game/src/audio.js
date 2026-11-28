// All sound is synthesized with WebAudio: no audio files, no network. Every
// effect is a short oscillator/noise burst; the music is a tiny autumn loop
// scheduled a beat ahead, so it keeps time without a worker.

export function createAudio() {
  let context = null;
  let muted = false;
  let musicTimer = 0;
  let nextBeat = 0;
  let beatIndex = 0;

  // A cheerful little loop in C major, one note per beat, with a low root underneath.
  const MELODY = [523, 659, 784, 659, 880, 784, 659, 523, 587, 659, 784, 880, 784, 659, 587, 523];
  const BASS = [131, 131, 175, 131, 196, 175, 131, 131, 147, 131, 175, 196, 175, 131, 147, 131];
  // The loop quickens every stage — and again in the finale — so the music
  // itself tells the player the chase is heating up.
  const BEAT_SECONDS = [0.24, 0.22, 0.2];
  const FINALE_BEAT_SECONDS = 0.18;
  let beatSeconds = BEAT_SECONDS[0];

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, seconds, type, volume, when, slideTo) {
    const audio = ensure();
    if (!audio || muted) return;
    const start = when ?? audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, when, lowpass) {
    const audio = ensure();
    if (!audio || muted) return;
    const start = when ?? audio.currentTime;
    const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    let node = source;
    if (lowpass) {
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      source.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(audio.destination);
    source.start(start);
  }

  function scheduleBeat() {
    const audio = ensure();
    if (!audio || muted) return;
    while (nextBeat < audio.currentTime + 0.35) {
      const step = beatIndex % MELODY.length;
      tone(MELODY[step], 0.2, 'triangle', 0.05, nextBeat);
      if (step % 2 === 0) tone(BASS[step], 0.22, 'sine', 0.07, nextBeat);
      nextBeat += beatSeconds;
      beatIndex += 1;
    }
  }

  return {
    unlock() {
      ensure();
    },
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (muted) this.stopMusic();
      return muted;
    },
    startMusic() {
      const audio = ensure();
      if (!audio || musicTimer) return;
      nextBeat = audio.currentTime + 0.05;
      beatIndex = 0;
      musicTimer = window.setInterval(scheduleBeat, 120);
    },
    /** Quicken the loop as the stages (and the finale) heat up. */
    setStage(stageIndex, finale) {
      beatSeconds = finale ? FINALE_BEAT_SECONDS : BEAT_SECONDS[Math.min(stageIndex, BEAT_SECONDS.length - 1)];
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = 0;
      }
    },
    jump() {
      tone(320, 0.16, 'sine', 0.16, undefined, 640);
    },
    doubleJump() {
      tone(420, 0.14, 'sine', 0.14, undefined, 840);
      noise(0.08, 0.05);
    },
    slide() {
      noise(0.18, 0.1, undefined, 900);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.16);
      tone(1318, 0.14, 'sine', 0.14, undefined, undefined);
    },
    feather() {
      tone(1046, 0.1, 'triangle', 0.16);
      tone(1568, 0.18, 'triangle', 0.14);
    },
    hit() {
      tone(160, 0.25, 'sawtooth', 0.2, undefined, 60);
      noise(0.2, 0.18, undefined, 700);
    },
    hide() {
      noise(0.3, 0.08, undefined, 500);
      tone(520, 0.12, 'sine', 0.08, undefined, 780);
    },
    dash() {
      noise(0.22, 0.12, undefined, 1600);
    },
    gobble() {
      // Three quick low "gob-gob-gob" blurts.
      const audio = ensure();
      if (!audio || muted) return;
      const now = audio.currentTime;
      for (let i = 0; i < 3; i += 1) {
        tone(180, 0.09, 'square', 0.07, now + i * 0.11, 120);
      }
    },
    /** The farmer spots the turkey and shouts "THERE!" — two angry barks. */
    shout() {
      const audio = ensure();
      if (!audio || muted) return;
      const now = audio.currentTime;
      tone(220, 0.14, 'square', 0.12, now, 140);
      tone(262, 0.18, 'square', 0.12, now + 0.16, 180);
      noise(0.12, 0.06, now + 0.02, 1200);
    },
    /** A falling knife whistles down: a high slide that drops fast. */
    whistle() {
      tone(1900, 0.45, 'sine', 0.09, undefined, 320);
    },
    /** The finale begins: three rising notes, a call to run. */
    sting() {
      const audio = ensure();
      if (!audio || muted) return;
      const now = audio.currentTime;
      [392, 523, 784].forEach((freq, i) => tone(freq, 0.16, 'triangle', 0.14, now + i * 0.11));
    },
    /** The corn combo stepped up: two rising notes. */
    comboUp() {
      tone(1046, 0.09, 'triangle', 0.14);
      tone(1568, 0.16, 'triangle', 0.14, undefined, undefined);
    },
    caught() {
      tone(392, 0.22, 'sawtooth', 0.16, undefined, 370);
      tone(311, 0.22, 'sawtooth', 0.16);
      tone(233, 0.5, 'sawtooth', 0.18);
    },
    fanfare() {
      // The pardon jingle: a bright run up, then a held high note.
      const notes = [523, 659, 784, 1046, 880, 1046, 1318, 1568];
      const audio = ensure();
      if (!audio || muted) return;
      const now = audio.currentTime;
      notes.forEach((freq, i) => tone(freq, i === notes.length - 1 ? 0.5 : 0.2, 'triangle', 0.16, now + i * 0.12));
    },
  };
}
