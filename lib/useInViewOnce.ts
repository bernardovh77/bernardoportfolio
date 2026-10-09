"use client";

import { type RefObject, useEffect } from "react";

/**
 * Adds `data-inview="true"` to an element the first time it scrolls into view.
 * CSS uses the attribute to play one-time reveal animations.
 */
export function useInViewOnce(ref: RefObject<HTMLElement | null>, threshold = 0.25) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.inview = "true";
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
}
