import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ROW_OVERSCAN } from "./constants";

export interface RowWindow {
  /** Index of the first row to render (inclusive). */
  startIndex: number;
  /** Index past the last row to render (exclusive). */
  endIndex: number;
  /** Total scrollable height for all rows, used to size the spacer. */
  totalHeight: number;
}

/**
 * Fixed-height row windowing for the timeline. The names column and the track
 * column each scroll vertically in lock-step, so a single shared scrollTop +
 * viewport height is enough to decide which rows are on screen. Only rows in the
 * returned window (plus an overscan margin) need to be rendered to the DOM,
 * which keeps render cost flat as the node count grows into the thousands.
 */
export function useRowVirtualizer(rowCount: number, rowHeight: number) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // The scroll container we measure. Vertical scroll between the two columns is
  // synced elsewhere, so we only need to observe one of them.
  const scrollElRef = useRef<HTMLElement | null>(null);

  const measure = useCallback((el: HTMLElement | null) => {
    scrollElRef.current = el;
    if (el) setViewportHeight(el.clientHeight);
  }, []);

  useLayoutEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback((nextScrollTop: number) => {
    setScrollTop(nextScrollTop);
  }, []);

  const totalHeight = rowCount * rowHeight;
  // When the viewport hasn't been measured yet, fall back to rendering nothing
  // extra beyond a small slice so first paint is cheap; the resize observer
  // fills it in on the next frame.
  const effectiveViewport = viewportHeight || 0;

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - ROW_OVERSCAN);
  const visibleCount = Math.ceil(effectiveViewport / rowHeight) + ROW_OVERSCAN * 2;
  const endIndex = Math.min(rowCount, startIndex + visibleCount + 1);

  const window: RowWindow = { startIndex, endIndex, totalHeight };

  return { window, measure, onScroll };
}
