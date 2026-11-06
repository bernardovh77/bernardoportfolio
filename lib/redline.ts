import { world } from "./world";

/**
 * Shared layout of Redline, the racing district: its page is one lap of the
 * circuit. Each section of the page is a stop around the track, and the 3D
 * camera drives from one to the next as the page scrolls.
 */

/** The page's sections, in lap order: the grid, the project on the dyno, the finish. */
export const REDLINE_SECTION_IDS = ["rl-start", "rl-dyno", "rl-finish"] as const;

/** How far around the lap (0..1) the camera stops for each section. */
export const LAP_STOPS = [0, 0.5, 1] as const;

function usableKnots(knots: number[]) {
  if (knots.length !== LAP_STOPS.length) return null;
  for (let i = 1; i < knots.length; i++) if (!(knots[i] > knots[i - 1])) return null;
  return knots;
}

/**
 * Where the camera is on the lap for a page scroll progress (0..1).
 * Between two stops it eases in and out, so it slows down at each section
 * while it's on screen. `segment` and `t` say between which stops it is.
 */
export function lapPosition(scroll: number): { lap: number; segment: number; t: number } {
  const knots = usableKnots(world.stopKnots);
  const count = LAP_STOPS.length - 1;
  const s = Math.min(1, Math.max(0, scroll));
  let segment = count - 1;
  let t = 1;
  if (knots) {
    for (let i = 0; i < count; i++) {
      if (s <= knots[i + 1]) {
        segment = i;
        t = (s - knots[i]) / (knots[i + 1] - knots[i]);
        break;
      }
    }
  } else {
    const x = s * count;
    segment = Math.min(count - 1, Math.floor(x));
    t = x - segment;
  }
  t = Math.min(1, Math.max(0, t));
  const eased = t * t * (3 - 2 * t);
  const k = eased * 0.75 + t * 0.25;
  return {
    lap: LAP_STOPS[segment] + (LAP_STOPS[segment + 1] - LAP_STOPS[segment]) * k,
    segment,
    t: k,
  };
}
