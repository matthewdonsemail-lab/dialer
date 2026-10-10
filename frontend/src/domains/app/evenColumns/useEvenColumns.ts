import { useLayoutEffect, useState } from "react";

/**
 * Column count for a grid of `count` tiles that always fills whole rows:
 * the most columns that divide `count` evenly and still give each tile at
 * least `minWidth` px. Six tiles become 6 x 1, 3 x 2 or 2 x 3 (never 4 + 2),
 * measured from the space the grid actually gets (page, modal, table row).
 * `ref` is a callback ref, so grids that mount later (inside a tab) are
 * measured too.
 */
export function useEvenColumns(count: number, minWidth = 160, gap = 12) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(Math.min(count, 3));

  useLayoutEffect(() => {
    if (!el || count <= 0) return;
    const measure = () => {
      const fit = Math.max(1, Math.floor((el.clientWidth + gap) / (minWidth + gap)));
      let best = 1;
      for (let c = 1; c <= Math.min(fit, count); c++) if (count % c === 0) best = c;
      // A prime count (5, 7) only divides by 1 and itself: fall back to the most that fit.
      if (best === 1 && count > 1 && fit > 1) best = Math.min(fit, count);
      setColumns((prev) => (prev === best ? prev : best));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, count, minWidth, gap]);

  return { ref: setEl, style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } };
}
