/* Web Audio engine: starter tones + multi-voice playback */
const RBAudio = (() => {
  let ctx = null;
  let master = null;
  let volume = 0.85;
  const active = new Set(); // { stop() }

  const STARTERS = [
    { id: 'click', label: 'Click', freq: 1800, dur: 0.045, type: 'square', gain: 0.35 },
    { id: 'beep', label: 'Beep', freq: 880, dur: 0.12, type: 'sine', gain: 0.4 },
    { id: 'blip', label: 'Blip', freq: 520, dur: 0.08, type: 'triangle', gain: 0.45 },
    { id: 'thud', label: 'Thud', freq: 90, dur: 0.18, type: 'sine', gain: 0.55 }
  ];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  function playStarter(starterId) {
    const def = STARTERS.find((s) => s.id === starterId) || STARTERS[0];
    const c = ensure();
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq, t0);
    if (def.id === 'thud') {
      osc.frequency.exponentialRampToValueAtTime(40, t0 + def.dur);
    } else if (def.id === 'blip') {
      osc.frequency.exponentialRampToValueAtTime(def.freq * 1.6, t0 + def.dur * 0.5);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(def.gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + def.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + def.dur + 0.02);
    const voice = {
      stop() {
        try {
          g.gain.cancelScheduledValues(c.currentTime);
          g.gain.setTargetAtTime(0.0001, c.currentTime, 0.01);
          osc.stop(c.currentTime + 0.03);
        } catch (_) {}
        active.delete(voice);
      }
    };
    active.add(voice);
    osc.onended = () => active.delete(voice);
    return voice;
  }

  /** Decode blob → AudioBuffer (cached by caller) */
  async function decodeBlob(blob) {
    const c = ensure();
    const ab = await blob.arrayBuffer();
    return await c.decodeAudioData(ab.slice(0));
  }

  function playBuffer(buffer, whenOffset = 0) {
    const c = ensure();
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buffer;
    g.gain.value = 1;
    src.connect(g);
    g.connect(master);
    const t0 = c.currentTime + whenOffset;
    src.start(t0);
    const voice = {
      stop() {
        try {
          g.gain.setTargetAtTime(0.0001, c.currentTime, 0.015);
          src.stop(c.currentTime + 0.05);
        } catch (_) {}
        active.delete(voice);
      }
    };
    active.add(voice);
    src.onended = () => active.delete(voice);
    return voice;
  }

  function stopAll() {
    [...active].forEach((v) => v.stop());
    active.clear();
  }

  /** Tiny procedural WAV as Blob (fallback import demo) — unused; starters are synth */
  function synthWavBlob(freq, durSec) {
    const sr = 22050;
    const n = Math.floor(sr * durSec);
    const data = new ArrayBuffer(44 + n * 2);
    const view = new DataView(data);
    const w = (o, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    w(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    w(8, 'WAVE');
    w(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    w(36, 'data');
    view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 40) * Math.max(0, 1 - t / durSec);
      const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.5;
      view.setInt16(44 + i * 2, (sample * 32767) | 0, true);
    }
    return new Blob([data], { type: 'audio/wav' });
  }

  return {
    STARTERS,
    ensure,
    setVolume,
    playStarter,
    decodeBlob,
    playBuffer,
    stopAll,
    synthWavBlob,
    get context() {
      return ctx;
    }
  };
})();
