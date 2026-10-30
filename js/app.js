/* Retro Board — main UI */
(() => {
  const COLS = 3;
  const ROWS = 4;
  const PAD_COUNT = COLS * ROWS;

  const COLORS = [
    '#c45c26', '#e8912a', '#d4a017', '#3a9e6e',
    '#2f6fed', '#6b5ce7', '#c44d7a', '#8b7355',
    '#4a5568', '#b33a3a', '#1a9e9e', '#7a8a3a'
  ];

  const DEFAULT_PADS = () =>
    Array.from({ length: PAD_COUNT }, (_, i) => {
      const tones = RBAudio.STARTERS.filter((s) => !s.file);
      const starter = i === PAD_COUNT - 1
        ? RBAudio.STARTERS.find((s) => s.id === 'airhorn')
        : tones[i % tones.length];
      return {
        id: `pad-${i}`,
        label: starter.label,
        color: COLORS[i % COLORS.length],
        starterId: starter.id,
        hasCustom: false
      };
    });

  const state = {
    mode: 'play', // play | edit
    pads: DEFAULT_PADS(),
    volume: 0.85,
    editingId: null,
    bufferCache: new Map(), // padId -> AudioBuffer
    recording: false,
    mediaRecorder: null,
    recChunks: [],
    pendingBlob: null,
    pendingMime: null
  };

  const $ = (sel) => document.querySelector(sel);
  const board = $('#board');
  const toastEl = $('#toast');
  let toastTimer = null;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
  }

  async function loadState() {
    try {
      await RB_DB.open();
      const pads = await RB_DB.getMeta('pads', null);
      const vol = await RB_DB.getMeta('volume', 0.85);
      if (pads && Array.isArray(pads) && pads.length === PAD_COUNT) {
        state.pads = pads;
      }
      // migration: make sure a DJ air horn pad exists
      if (!state.pads.some((p) => p.starterId === 'airhorn')) {
        const free = [...state.pads].reverse().find((p) => !p.hasCustom) || state.pads[PAD_COUNT - 1];
        free.starterId = 'airhorn';
        free.label = 'DJ air horn';
        free.hasCustom = false;
        await savePads();
      }
      // migration: rename old RJ pad to DJ air horn (same slot)
      let renamed = false;
      for (const p of state.pads) {
        if (p.starterId === 'airhorn' && /^RJ/i.test(p.label || '')) { p.label = 'DJ air horn'; renamed = true; }
      }
      if (renamed) await savePads();
      state.volume = typeof vol === 'number' ? vol : 0.85;
      RBAudio.setVolume(state.volume);
      $('#vol').value = Math.round(state.volume * 100);

      // warm custom buffers
      for (const p of state.pads) {
        if (p.hasCustom) {
          try {
            const row = await RB_DB.getSound(p.id);
            if (row && row.blob) {
              const buf = await RBAudio.decodeBlob(row.blob);
              state.bufferCache.set(p.id, buf);
            } else {
              p.hasCustom = false;
            }
          } catch (e) {
            console.warn('decode fail', p.id, e);
            p.hasCustom = false;
          }
        }
      }
    } catch (e) {
      console.warn('db load', e);
      toast('Storage unavailable — pads won’t persist');
    }
  }

  async function savePads() {
    try {
      await RB_DB.setMeta('pads', state.pads);
    } catch (e) {
      console.warn(e);
      toast('Could not save pads');
    }
  }

  async function saveVolume() {
    try {
      await RB_DB.setMeta('volume', state.volume);
    } catch (_) {}
  }

  function renderBoard() {
    board.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    board.innerHTML = '';
    state.pads.forEach((pad) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pad' + (pad.hasCustom || pad.starterId ? '' : ' empty-sound');
      if (!pad.hasCustom && !pad.starterId) btn.classList.add('empty-sound');
      btn.dataset.id = pad.id;
      btn.style.setProperty('--pad-color', pad.color);
      btn.innerHTML =
        `<span class="pad-label"></span>` +
        (pad.hasCustom ? `<span class="pad-badge">REC</span>` : '');
      btn.querySelector('.pad-label').textContent = pad.label || 'Pad';
      bindPad(btn, pad);
      board.appendChild(btn);
    });
  }

  function bindPad(el, pad) {
    const press = (e) => {
      e.preventDefault();
      el.classList.add('pressed');
      if (state.mode === 'play') {
        playPad(pad);
        haptic();
      }
    };
    const release = () => el.classList.remove('pressed');
    const activate = (e) => {
      e.preventDefault();
      if (state.mode === 'edit') {
        openEdit(pad.id);
      }
    };

    el.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      press(e);
      if (state.mode === 'edit') {
        // edit opens on release/click to avoid accidental opens while scrolling
      }
    });
    el.addEventListener('pointerup', (e) => {
      release();
      if (state.mode === 'edit') activate(e);
    });
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', (e) => {
      if (!el.hasPointerCapture?.(e.pointerId)) release();
    });
    // prevent context menu on long-press
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  async function playPad(pad) {
    RBAudio.unlock();
    if (pad.hasCustom) {
      let buf = state.bufferCache.get(pad.id);
      if (!buf) {
        try {
          const row = await RB_DB.getSound(pad.id);
          if (row && row.blob) {
            buf = await RBAudio.decodeBlob(row.blob);
            state.bufferCache.set(pad.id, buf);
          }
        } catch (e) {
          console.warn(e);
        }
      }
      if (buf) {
        RBAudio.playBuffer(buf);
        return;
      }
    }
    if (pad.starterId) RBAudio.playStarter(pad.starterId);
  }

  function setMode(mode) {
    state.mode = mode;
    document.body.classList.toggle('edit-mode', mode === 'edit');
    $('#btnPlayMode').classList.toggle('active', mode === 'play');
    $('#btnEditMode').classList.toggle('active', mode === 'edit');
    $('#btnPlayMode').setAttribute('aria-pressed', mode === 'play' ? 'true' : 'false');
    $('#btnEditMode').setAttribute('aria-pressed', mode === 'edit' ? 'true' : 'false');
    $('#editHint').classList.toggle('hidden', mode !== 'edit');
  }

  /* —— Edit panel —— */
  function openEdit(padId) {
    const pad = state.pads.find((p) => p.id === padId);
    if (!pad) return;
    state.editingId = padId;
    state.pendingBlob = null;
    state.pendingMime = null;
    stopRecording(false);

    $('#padLabel').value = pad.label || '';
    renderSwatches(pad.color);
    updateSoundMeta(pad);
    $('#recStatus').textContent = '';
    $('#recStatus').classList.remove('live');
    $('#panelEdit').classList.add('open');
  }

  function closeEdit() {
    stopRecording(false);
    state.editingId = null;
    state.pendingBlob = null;
    $('#panelEdit').classList.remove('open');
  }

  function updateSoundMeta(pad) {
    const meta = $('#soundMeta');
    if (state.pendingBlob) {
      const kb = Math.round(state.pendingBlob.size / 1024);
      meta.textContent = `New sound ready (${kb} KB) — tap Save.`;
    } else if (pad.hasCustom) {
      meta.textContent = 'Custom sound assigned (on this device).';
    } else if (pad.starterId) {
      meta.textContent = `Starter tone: ${pad.starterId}. Record or import to replace.`;
    } else {
      meta.textContent = 'No sound — record or import.';
    }
  }

  function renderSwatches(selected) {
    const box = $('#swatches');
    box.innerHTML = '';
    COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (c === selected ? ' selected' : '');
      b.style.background = c;
      b.dataset.color = c;
      b.setAttribute('aria-label', c);
      b.addEventListener('click', () => {
        box.querySelectorAll('.swatch').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
      });
      box.appendChild(b);
    });
  }

  function selectedColor() {
    const s = $('#swatches .swatch.selected');
    return s ? s.dataset.color : COLORS[0];
  }

  async function saveEdit() {
    const pad = state.pads.find((p) => p.id === state.editingId);
    if (!pad) return;
    pad.label = ($('#padLabel').value || 'Pad').trim().slice(0, 32);
    pad.color = selectedColor();

    if (state.pendingBlob) {
      try {
        await RB_DB.putSound(pad.id, state.pendingBlob, state.pendingMime);
        const buf = await RBAudio.decodeBlob(state.pendingBlob);
        state.bufferCache.set(pad.id, buf);
        pad.hasCustom = true;
        pad.starterId = null;
      } catch (e) {
        console.warn(e);
        toast('Could not save audio');
        return;
      }
    }

    await savePads();
    renderBoard();
    closeEdit();
    toast('Pad saved');
  }

  async function clearSound() {
    const pad = state.pads.find((p) => p.id === state.editingId);
    if (!pad) return;
    state.pendingBlob = null;
    try {
      await RB_DB.deleteSound(pad.id);
    } catch (_) {}
    state.bufferCache.delete(pad.id);
    pad.hasCustom = false;
    // restore a starter so pad still makes a sound
    const starter = RBAudio.STARTERS[state.pads.indexOf(pad) % RBAudio.STARTERS.length];
    pad.starterId = starter.id;
    if (!pad.label || pad.label === 'Pad') pad.label = starter.label;
    updateSoundMeta(pad);
    await savePads();
    toast('Custom sound cleared');
  }

  async function previewEdit() {
    const pad = state.pads.find((p) => p.id === state.editingId);
    if (!pad) return;
    RBAudio.ensure();
    if (state.pendingBlob) {
      try {
        const buf = await RBAudio.decodeBlob(state.pendingBlob);
        RBAudio.playBuffer(buf);
        return;
      } catch (e) {
        toast('Could not decode audio');
        return;
      }
    }
    await playPad(pad);
  }

  /* —— Recording —— */
  async function toggleRecord() {
    if (state.recording) {
      stopRecording(true);
      return;
    }
    try {
      RBAudio.ensure();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = [
        'audio/mp4',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus'
      ];
      let mime = '';
      for (const m of mimeCandidates) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      }
      const opts = mime ? { mimeType: mime } : undefined;
      const mr = new MediaRecorder(stream, opts);
      state.recChunks = [];
      state.mediaRecorder = mr;
      state.recording = true;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) state.recChunks.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const usedMime = mr.mimeType || mime || 'audio/webm';
        const blob = new Blob(state.recChunks, { type: usedMime });
        state.recChunks = [];
        if (blob.size < 200) {
          toast('Recording too short');
          $('#recStatus').textContent = '';
          $('#recStatus').classList.remove('live');
          $('#btnRecord').textContent = '● Record';
          $('#btnRecord').classList.remove('recording');
          return;
        }
        state.pendingBlob = blob;
        state.pendingMime = usedMime;
        const pad = state.pads.find((p) => p.id === state.editingId);
        if (pad) updateSoundMeta(pad);
        $('#recStatus').textContent = 'Recorded — tap Save to keep.';
        $('#recStatus').classList.remove('live');
        $('#btnRecord').textContent = '● Record';
        $('#btnRecord').classList.remove('recording');
        toast('Recording captured');
      };
      mr.start(100);
      $('#btnRecord').textContent = '■ Stop';
      $('#btnRecord').classList.add('recording');
      $('#recStatus').textContent = 'Recording… tap Stop when done';
      $('#recStatus').classList.add('live');
    } catch (e) {
      console.warn(e);
      toast('Mic blocked — allow microphone in Safari settings');
      state.recording = false;
    }
  }

  function stopRecording(keep) {
    const mr = state.mediaRecorder;
    if (mr && state.recording) {
      try {
        if (mr.state !== 'inactive') mr.stop();
      } catch (_) {}
    } else if (!keep && state.mediaRecorder) {
      try {
        state.mediaRecorder.stream?.getTracks?.().forEach((t) => t.stop());
      } catch (_) {}
    }
    state.recording = false;
    state.mediaRecorder = null;
    $('#btnRecord').textContent = '● Record';
    $('#btnRecord').classList.remove('recording');
  }

  function importFile(file) {
    if (!file) return;
    const ok =
      /^audio\//.test(file.type) ||
      /\.(m4a|mp3|wav|ogg|aac|caf|webm)$/i.test(file.name);
    if (!ok) {
      toast('Pick an audio file (m4a / mp3 / wav / ogg)');
      return;
    }
    state.pendingBlob = file;
    state.pendingMime = file.type || 'audio/mpeg';
    const pad = state.pads.find((p) => p.id === state.editingId);
    if (pad) {
      if (!pad.label || RBAudio.STARTERS.some((s) => s.label === pad.label)) {
        const base = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
        if (base) $('#padLabel').value = base;
      }
      updateSoundMeta(pad);
    }
    toast('File ready — tap Save');
  }

  /* —— Wire UI —— */
  function wire() {
    $('#btnPlayMode').addEventListener('click', () => setMode('play'));
    $('#btnEditMode').addEventListener('click', () => setMode('edit'));
    $('#btnStopAll').addEventListener('click', () => {
      RBAudio.stopAll();
      haptic();
    });
    $('#vol').addEventListener('input', (e) => {
      state.volume = Number(e.target.value) / 100;
      RBAudio.setVolume(state.volume);
    });
    $('#vol').addEventListener('change', () => saveVolume());

    $('#btnHelp').addEventListener('click', () => $('#panelHelp').classList.add('open'));
    $('#btnCloseHelp').addEventListener('click', () => $('#panelHelp').classList.remove('open'));
    $('#btnCloseHelp2').addEventListener('click', () => $('#panelHelp').classList.remove('open'));

    $('#btnCloseEdit').addEventListener('click', closeEdit);
    $('#panelEdit').addEventListener('click', (e) => {
      if (e.target === $('#panelEdit')) closeEdit();
    });
    $('#panelHelp').addEventListener('click', (e) => {
      if (e.target === $('#panelHelp')) $('#panelHelp').classList.remove('open');
    });

    $('#btnSavePad').addEventListener('click', () => saveEdit());
    $('#btnClearSound').addEventListener('click', () => clearSound());
    $('#btnPreview').addEventListener('click', () => previewEdit());
    $('#btnRecord').addEventListener('click', () => toggleRecord());
    $('#btnImport').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      importFile(f);
      e.target.value = '';
    });

    // unlock audio on first gesture
    const unlock = () => {
      RBAudio.unlock();
      ['pointerdown', 'touchend', 'click'].forEach((t) => document.removeEventListener(t, unlock, true));
    };
    ['pointerdown', 'touchend', 'click'].forEach((t) => document.addEventListener(t, unlock, true));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((r) => r.update()).catch((e) => console.warn('sw', e));
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true; location.reload();
      });
    }
  }

  async function init() {
    wire();
    await loadState();
    renderBoard();
    setMode('play');
  }

  init();
})();
