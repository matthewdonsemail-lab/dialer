import { useState, useEffect } from "react";

export const MIN_COLUMN_WIDTH = 80;

/**
 * Persisted per-column pixel widths. Applied as CSS variables on the table
 * element (`--col-<key>`); resize drags mutate the variable directly with
 * zero React re-renders and persist only on pointer-up.
 */
export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaults;
      const saved = JSON.parse(raw) as Record<string, number>;
      return { ...defaults, ...saved };
    } catch {
      return defaults;
    }
  });

  const setWidth = (key: string, px: number) => {
    setWidths((prev) => {
      const next = { ...prev, [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(px)) };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // storage blocked — width just won't persist
      }
      return next;
    });
  };

  useEffect(() => {
    // Gently adopt widths for columns added later without wiping saved ones.
    setWidths((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, v] of Object.entries(defaults)) {
        if (next[k] === undefined) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { widths, setWidth };
}
