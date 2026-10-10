import { useState, useEffect, useRef } from "react";

const SYNC_EVENT = "persisted-state-change";

function read<T>(storageKey: string, initial: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

/**
 * useState that survives unmounts and reloads via localStorage. List pages
 * use it for their filters, so opening a record and coming back (or
 * refreshing) keeps the view the operator set up.
 *
 * Every hook using the same key stays in sync — in this tab (a custom event)
 * and in other tabs (the storage event) — so a choice made in Settings
 * reaches components that are already mounted, like the dialer.
 */
export function usePersistedState<T>(storageKey: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(storageKey, initial));
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    try {
      const json = JSON.stringify(value);
      if (localStorage.getItem(storageKey) === json) return;
      localStorage.setItem(storageKey, json);
      lastWritten.current = json;
      window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: storageKey }));
    } catch {
      // storage blocked — the value just won't persist
    }
  }, [storageKey, value]);

  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null || raw === lastWritten.current) return;
        setValue((current) => (JSON.stringify(current) === raw ? current : (JSON.parse(raw) as T)));
      } catch {
        // unreadable: keep the current value
      }
    };
    const onLocal = (e: Event) => (e as CustomEvent<string>).detail === storageKey && refresh();
    const onStorage = (e: StorageEvent) => e.key === storageKey && refresh();
    window.addEventListener(SYNC_EVENT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [storageKey]);

  return [value, setValue] as const;
}
