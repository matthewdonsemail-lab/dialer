/**
 * The operator's outbound voicemail, kept in this browser (IndexedDB), since
 * the dialer plays it into the call from here. One recording per browser.
 */

export interface VoicemailRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  recordedAt: string;
}

const DB_NAME = "dialer-voicemail";
const STORE = "recordings";
const KEY = "outbound";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot store recordings."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the recording store."));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Recording store request failed."));
    });
  } finally {
    db.close();
  }
}

/** Fired after the recording is saved or deleted, so every Settings card shows the same state. */
const CHANGED = "dialer-voicemail-changed";

export function onVoicemailChanged(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}

export async function loadVoicemail(): Promise<VoicemailRecording | null> {
  const value = await run<VoicemailRecording | undefined>("readonly", (s) => s.get(KEY));
  return value?.blob ? value : null;
}

export async function saveVoicemail(recording: VoicemailRecording): Promise<void> {
  await run("readwrite", (s) => s.put(recording, KEY));
  window.dispatchEvent(new Event(CHANGED));
}

export async function deleteVoicemail(): Promise<void> {
  await run("readwrite", (s) => s.delete(KEY));
  window.dispatchEvent(new Event(CHANGED));
}
