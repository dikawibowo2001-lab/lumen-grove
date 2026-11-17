// Every sound the game makes, synthesized live with WebAudio: no audio files,
// no network. All effects are short oscillator blips through one master gain;
// the music is a slow two-oscillator drone with a wandering filter. Everything
// is a no-op until unlock() runs from a user gesture, and until then (or where
// there is no AudioContext at all) every call below is safe to make.

/** Make the audio engine. Nothing sounds until unlock() is called. */
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicNodes = [];
  let muted = false;
  let unlocked = false;

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  /** Start the AudioContext from a user gesture. Safe to call twice. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
    } catch {
      ctx = null;
    }
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
  }

  function isMuted() {
    return muted;
  }

  /** One short tone: frequency slides from `from` to `to` over `seconds`. */
  function blip(from, to, seconds, type, volume, when = 0) {
    if (!ctx || !master || muted) return;
    const t = now() + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + seconds);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** A soft noise burst (a filtered buffer, made once per call). */
  function noise(seconds, volume, frequency) {
    if (!ctx || !master || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  /** The ambient drone: two detuned sines under a slow filter sweep. */
  function startMusic() {
    if (!ctx || !musicGain || musicNodes.length > 0) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.connect(musicGain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    for (const frequency of [110, 164.81, 220]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = (Math.random() - 0.5) * 8;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      musicNodes.push(osc);
    }
    musicNodes.push(lfo);
    musicGain.gain.setTargetAtTime(0.6, ctx.currentTime, 2.0);
  }

  function stopMusic() {
    if (!ctx || !musicGain) return;
    musicGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
    const nodes = musicNodes;
    musicNodes = [];
    window.setTimeout(() => {
      for (const node of nodes) {
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      }
    }, 1500);
  }

  return {
    unlock,
    setMuted,
    isMuted,
    startMusic,
    stopMusic,
    click() {
      blip(660, 520, 0.07, 'triangle', 0.12);
    },
    shoot() {
      blip(880, 320, 0.09, 'square', 0.045);
    },
    hit() {
      blip(240, 120, 0.08, 'sawtooth', 0.06);
    },
    kill() {
      blip(520, 90, 0.16, 'sawtooth', 0.08);
      noise(0.12, 0.05, 900);
    },
    pickup() {
      blip(1180, 1760, 0.09, 'sine', 0.07);
    },
    heal() {
      blip(520, 780, 0.18, 'sine', 0.1);
      blip(780, 1040, 0.18, 'sine', 0.07, 0.09);
    },
    hurt() {
      blip(160, 60, 0.25, 'sawtooth', 0.16);
      noise(0.2, 0.1, 500);
    },
    dash() {
      noise(0.18, 0.08, 2400);
      blip(300, 700, 0.14, 'sine', 0.06);
    },
    levelup() {
      for (let i = 0; i < 4; i += 1) blip(523 + i * 131, 523 + i * 131, 0.16, 'triangle', 0.09, i * 0.08);
    },
    nova() {
      blip(180, 900, 0.3, 'sine', 0.12);
      noise(0.25, 0.07, 1200);
    },
    waveClear() {
      blip(660, 660, 0.12, 'triangle', 0.1);
      blip(880, 880, 0.2, 'triangle', 0.1, 0.12);
    },
    boss() {
      blip(90, 45, 0.7, 'sawtooth', 0.18);
      blip(135, 67, 0.7, 'sawtooth', 0.12, 0.1);
    },
    victory() {
      for (let i = 0; i < 6; i += 1) blip(523 * (1 + i * 0.125), 523 * (1 + i * 0.125), 0.22, 'triangle', 0.1, i * 0.11);
    },
    defeat() {
      blip(330, 110, 0.9, 'triangle', 0.14);
      blip(220, 82, 0.9, 'sine', 0.12, 0.15);
    },
  };
}
