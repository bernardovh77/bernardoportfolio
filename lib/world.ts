/**
 * A tiny mutable store shared between the page (DOM) and the 3D world.
 * It is written every frame (scroll, pointer), so it lives outside React
 * state on purpose: updating it never triggers a re-render.
 */

export type QualityTier = "high" | "low";

export const TRAVEL_DURATION = 1100; // ms, whole travel transition
export const TRAVEL_SWAP_AT = 0.45; // fraction of the transition when the district swaps

export const world = {
  /** Page scroll progress, 0 at the top and 1 at the bottom */
  scroll: 0,
  /** Scroll velocity reported by Lenis (pixels per frame, signed) */
  velocity: 0,
  /** Pointer position in normalized device coordinates (-1..1) */
  pointerX: 0,
  pointerY: 0,
  /** performance.now() when the last travel transition started */
  travelStart: -1e9,
  /** True when the visitor prefers reduced motion */
  reducedMotion: false,
  /** Set once the 3D world has compiled its shaders and drawn a frame */
  ready: false,
  /** Bass level of the background music (0..1), used to pulse the neon */
  audioLevel: 0,
  /**
   * Underworks only: scroll progress at which each part of the page is centered
   * (entrance, one per construction site, the bottom). The camera stops at each one.
   */
  siteKnots: [] as number[],
};

/** 0 → 1 → 0 envelope of the current travel transition. */
export function travelEnvelope(now: number): number {
  const t = (now - world.travelStart) / TRAVEL_DURATION;
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI);
}

const READY_EVENT = "bp:world-ready";

export function markWorldReady() {
  if (world.ready) return;
  world.ready = true;
  window.dispatchEvent(new Event(READY_EVENT));
}

export function onWorldReady(callback: () => void): () => void {
  if (world.ready) {
    callback();
    return () => {};
  }
  window.addEventListener(READY_EVENT, callback, { once: true });
  return () => window.removeEventListener(READY_EVENT, callback);
}

const BOOT_EVENT = "bp:booted";
let booted = false;

/** Called by the boot screen once the page is revealed. */
export function markBooted() {
  if (booted) return;
  booted = true;
  window.dispatchEvent(new Event(BOOT_EVENT));
}

export function onBooted(callback: () => void): () => void {
  if (booted) {
    callback();
    return () => {};
  }
  window.addEventListener(BOOT_EVENT, callback, { once: true });
  return () => window.removeEventListener(BOOT_EVENT, callback);
}

export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "high";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 640;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (coarse || small || cores <= 4 || memory <= 4) return "low";
  return "high";
}
