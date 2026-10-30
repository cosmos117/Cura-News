import { useEffect, useRef, useState } from "react";

/** Below this scroll position the header is always shown in full. */
const TOP_ZONE_PX = 120;
/** Scroll this far in one direction before the header changes. */
const DIRECTION_PX = 12;
/** Matches the header transition; scroll changes caused by the resize are ignored. */
const SETTLE_MS = 320;

/**
 * True while the reader is scrolling down the page, false when they scroll
 * back up or are near the top.
 *
 * Shrinking a sticky header moves the content below it, and the browser's
 * scroll anchoring can answer with a small scroll of its own. Without the
 * settle window that scroll would read as a direction change and the header
 * would flicker between sizes.
 */
export default function useCompactOnScroll() {
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let settleUntil = 0;
    let frame = 0;

    const apply = (next) => {
      if (compactRef.current === next) return;
      compactRef.current = next;
      settleUntil = performance.now() + SETTLE_MS;
      setCompact(next);
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < TOP_ZONE_PX) {
        apply(false);
        lastY = y;
        return;
      }
      if (performance.now() < settleUntil) {
        lastY = y;
        return;
      }
      const delta = y - lastY;
      if (Math.abs(delta) < DIRECTION_PX) return;
      apply(delta > 0);
      lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return compact;
}
