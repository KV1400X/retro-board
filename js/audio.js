/* Web Audio engine: meme sound starters + multi-voice playback */
const RBAudio = (() => {
  let ctx = null;
  let master = null;
  let volume = 0.85;
  const active = new Set(); // { stop() }

  const STARTERS = [
    { id: 'vineboom', label: 'Vine boom', file: 'sounds/vine-boom.mp3' },
    { id: 'airhorn', label: 'DJ air horn', file: 'sounds/dj-airhorn.mp3' },
    { id: 'sadtrombone', label: 'Sad trombone', file: 'sounds/sad-trombone.mp3' },
    { id: 'rimshot', label: 'Ba-dum-tss', file: 'sounds/rimshot.mp3' },
    { id: 'crickets', label: 'Crickets', file: 'sounds/crickets.mp3' },
    { id: 'laugh', label: 'Laugh track', file: 'sounds/laugh-track.mp3' },
    { id: 'applause', label: 'Applause', file: 'sounds/applause.mp3' },
    { id: 'scratch', label: 'Record scratch', file: 'sounds/record-scratch.mp3' },
    { id: 'dun', label: 'Dun dun DUNNN', file: 'sounds/dun-dun-dunnn.mp3' },
    { id: 'windowswall', label: 'To the windows', file: 'sounds/to-the-windows.mp3' },
    { id: 'pipe', label: 'Metal pipe', file: 'sounds/metal-pipe.mp3' },
    { id: 'surprise', label: 'Surprise MF', file: 'sounds/surprise.mp3' },
    { id: 'error', label: 'Error ding', file: 'sounds/error-ding.mp3' },
    { id: 'explosion', label: 'Explosion', file: 'sounds/explosion.mp3' },
    { id: 'drumroll', label: 'Drum roll', file: 'sounds/drum-roll.mp3' },
    { id: 'chaching', label: 'Cha-ching', file: 'sounds/cha-ching.mp3' },
    { id: 'boing', label: 'Boing', file: 'sounds/boing.mp3' },
    { id: 'whip', label: 'Whip crack', file: 'sounds/whip.mp3' },
    { id: 'trainhorn', label: 'Train horn', file: 'sounds/train-horn.mp3' },
    { id: 'ninja', label: 'Wanna be a ninja', file: 'sounds/wanna-be-ninja.mp3' },
    { id: 'riser', label: 'Suspense', file: 'sounds/suspense-riser.mp3' },
    { id: 'pew', label: 'Pew pew', file: 'sounds/pew-pew.mp3' },
    { id: 'choppa', label: 'Get to the choppa', file: 'sounds/get-to-the-choppa.mp3' },
    { id: 'rickroll', label: 'Rick Roll', file: 'sounds/rick-roll.mp3' }
  ];

  // iOS 17+: route Web Audio as media playback so it is not muted by the ringer/silent switch
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}

  // File-based starters play through HTMLAudio (plays even with the silent switch on)
  const fileEls = new Map();
  function fileEl(src) {
    let a = fileEls.get(src);
    if (!a) { a = new Audio(src); a.preload = 'auto'; a.setAttribute('playsinline', ''); fileEls.set(src, a); }
    return a;
  }
  let unlocked = false;
  const SILENT = 'data:audio/mp4;base64,AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAAAAG1kYXQ=';
  /** Call synchronously inside a tap handler */
  function unlock() {
    const c = ensure();
    if (unlocked) return;
    unlocked = true;
    try { const a = new Audio(SILENT); a.setAttribute('playsinline', ''); a.play().catch(() => {}); } catch (_) {}
    try { const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (_) {}
    STARTERS.filter((d) => d.file).forEach((d) => fileEl(d.file).load());
  }
  function playFile(src) {
    const proto = fileEl(src);
    const a = proto.paused ? proto : proto.cloneNode();
    a.volume = volume;
    try { a.currentTime = 0; } catch (_) {}
    a.play().catch((e) => console.warn('play', e));
    const voice = { stop() { try { a.pause(); a.currentTime = 0; } catch (_) {} active.delete(voice); } };
    active.add(voice);
    a.onended = () => active.delete(voice);
    return voice;
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  function playStarter(starterId) {
    const def = STARTERS.find((s) => s.id === starterId);
    if (!def) { console.warn('unknown starter', starterId); return null; }
    if (def.file) return playFile(def.file);
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
    playFile,
    ensure,
    unlock,
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
