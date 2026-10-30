import { useEffect, useRef, useState } from "react";

/** Below this scroll position the header always shows. */
const TOP_ZONE_PX = 120;
/** Scroll this far in one direction before the header hides or returns. */
const DIRECTION_PX = 12;

/**
 * True while the reader is scrolling down the page, false when they scroll
 * back up or are near the top. The header slides out of view with a
 * transform, so hiding it never moves the page content.
 */
export default function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    const apply = (next) => {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setHidden(next);
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < TOP_ZONE_PX) {
        apply(false);
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

  return hidden;
}
