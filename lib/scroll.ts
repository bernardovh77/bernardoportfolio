import type Lenis from "lenis";

/**
 * Holds the Lenis smooth-scroll instance so any component can scroll
 * to a section, lock scrolling, or listen to scroll updates.
 */

let instance: Lenis | null = null;
type ScrollListener = (progress: number, velocity: number) => void;
const listeners = new Set<ScrollListener>();

export function setLenis(lenis: Lenis | null) {
  instance = lenis;
}

export function getLenis() {
  return instance;
}

export function emitScroll(progress: number, velocity: number) {
  listeners.forEach((listener) => listener(progress, velocity));
}

export function onScrollProgress(listener: ScrollListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const HEADER_OFFSET = -72;

/** Smoothly scrolls to a CSS selector, element or pixel position. */
export function scrollToTarget(target: string | HTMLElement | number, immediate = false) {
  if (instance) {
    instance.scrollTo(target, {
      offset: typeof target === "number" ? 0 : HEADER_OFFSET,
      immediate,
    });
    return;
  }
  if (typeof target === "number") {
    window.scrollTo({ top: target, behavior: immediate ? "auto" : "smooth" });
    return;
  }
  const element = typeof target === "string" ? document.querySelector(target) : target;
  element?.scrollIntoView({ behavior: immediate ? "auto" : "smooth" });
}

export function lockScroll(locked: boolean) {
  if (instance) {
    if (locked) instance.stop();
    else instance.start();
  }
  document.documentElement.classList.toggle("is-locked", locked);
}
