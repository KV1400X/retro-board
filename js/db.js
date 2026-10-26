/* IndexedDB: pad metadata + audio blobs stay on device */
const RB_DB = (() => {
  const NAME = 'retro-board';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('sounds')) {
          db.createObjectStore('sounds', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(store, mode);
          const s = t.objectStore(store);
          const result = fn(s);
          t.oncomplete = () => resolve(result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error || new Error('aborted'));
        })
    );
  }

  async function getMeta(key, fallback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readonly');
      const req = t.objectStore('meta').get(key);
      req.onsuccess = () => {
        const row = req.result;
        resolve(row ? row.value : fallback);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function setMeta(key, value) {
    return tx('meta', 'readwrite', (s) => s.put({ key, value }));
  }

  async function getSound(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('sounds', 'readonly');
      const req = t.objectStore('sounds').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function putSound(id, blob, mime) {
    return tx('sounds', 'readwrite', (s) =>
      s.put({ id, blob, mime: mime || blob.type || 'audio/webm', updated: Date.now() })
    );
  }

  async function deleteSound(id) {
    return tx('sounds', 'readwrite', (s) => s.delete(id));
  }

  return { open, getMeta, setMeta, getSound, putSound, deleteSound };
})();
