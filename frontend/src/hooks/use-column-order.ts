import { useState, useEffect } from "react";
import type { ColumnDef } from "@/components/common/ColumnVisibilityDropdown";

/**
 * Ordered + visible columns with localStorage persistence. New columns added
 * to `defaults` later are appended; removed keys are dropped on load.
 * Storage access is guarded — cross-site iframes may block it.
 */
export function useColumnOrder(storageKey: string, defaults: ColumnDef[], pinFirstKey?: string) {
  const pin = (list: ColumnDef[]): ColumnDef[] => {
    if (!pinFirstKey) return list;
    const idx = list.findIndex((c) => c.key === pinFirstKey);
    if (idx <= 0) return list;
    const next = [...list];
    const [pinned] = next.splice(idx, 1);
    next.unshift(pinned);
    return next;
  };
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return pin(defaults);
      const saved = JSON.parse(raw) as Array<Pick<ColumnDef, "key" | "visible">>;
      const byKey = new Map(defaults.map((c) => [c.key, c]));
      const ordered: ColumnDef[] = [];
      for (const s of saved) {
        const d = byKey.get(s.key);
        if (d) {
          ordered.push({ ...d, visible: s.visible ?? true });
          byKey.delete(s.key);
        }
      }
      for (const d of byKey.values()) ordered.push(d);
      return pin(ordered);
    } catch {
      return pin(defaults);
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify(columns.map(({ key, visible }) => ({ key, visible })))
      );
    } catch {
      // storage blocked (e.g. third-party iframe) — order just won't persist
    }
  }, [columns, storageKey]);

  const moveColumn = (fromKey: string, toKey: string) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    if (pinFirstKey && (fromKey === pinFirstKey || toKey === pinFirstKey)) return;
    setColumns((prev) => {
      const from = prev.findIndex((c) => c.key === fromKey);
      const to = prev.findIndex((c) => c.key === toKey);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      // Never displace the pinned column from index 0.
      const clampedTo = pinFirstKey ? Math.max(to, 1) : to;
      next.splice(clampedTo, 0, moved);
      return next;
    });
  };

  return { columns, setColumns, moveColumn };
}
