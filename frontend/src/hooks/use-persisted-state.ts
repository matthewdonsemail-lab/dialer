import { useState, useEffect } from "react";

/**
 * useState that survives unmounts and reloads via localStorage. List pages
 * use it for their filters, so opening a record and coming back (or
 * refreshing) keeps the view the operator set up.
 */
export function usePersistedState<T>(storageKey: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage blocked — the value just won't persist
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}
