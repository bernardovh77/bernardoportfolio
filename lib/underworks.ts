import { type WipProject, wipProjects } from "./content";
import { world } from "./world";

/**
 * Shared layout of the Underworks: a vertical shaft with one construction
 * site per project in development. The page (cards) and the 3D scene both
 * read from here, so a site always shows up next to its card.
 */

/** Vertical distance between two sites, in 3D units */
export const SITE_SPACING = 46;
export const SITE_COUNT = wipProjects.length;
/** The furnace at the bottom sits one spacing below the last site */
export const SHAFT_DEPTH = SITE_SPACING * (SITE_COUNT + 1);
/** Depth shown to the visitor at the very bottom */
export const BOTTOM_METERS = 128;

/** Height of a site's platform area (0 is the entrance, going down is negative). */
export function siteY(index: number) {
  return -SITE_SPACING * (index + 1);
}

/** Cards alternate sides of the screen: even ones on the left. */
export function cardSide(index: number): "left" | "right" {
  return index % 2 === 0 ? "left" : "right";
}

/** The site is built on the other side of the shaft, so the card never hides it. */
export function siteSide(index: number): 1 | -1 {
  return index % 2 === 0 ? 1 : -1;
}

/** Converts a 3D height into the depth in meters shown on the page. */
export function depthMeters(y: number) {
  return Math.max(0, Math.round((-y / SHAFT_DEPTH) * BOTTOM_METERS));
}

export function siteDepthMeters(index: number) {
  return depthMeters(siteY(index));
}

/** Id of the page section holding a project's work order. */
export function siteSectionId(project: WipProject) {
  return `site-${project.id}`;
}

export const SITE_SECTION_IDS = wipProjects.map(siteSectionId);

/** Heights the camera stops at: entrance, each site, the bottom. */
const STOPS = [0, ...wipProjects.map((_, i) => siteY(i)), -SHAFT_DEPTH];

function usableKnots(knots: number[]) {
  if (knots.length !== STOPS.length) return null;
  for (let i = 1; i < knots.length; i++) if (!(knots[i] > knots[i - 1])) return null;
  return knots;
}

/**
 * Where the camera is in the shaft for a page scroll progress (0..1).
 * Between two stops it eases in and out, so it lingers at each site
 * while its card is on screen.
 */
export function shaftPosition(scroll: number): { y: number; segment: number; t: number } {
  const knots = usableKnots(world.siteKnots);
  const count = STOPS.length - 1;
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
  const k = eased * 0.7 + t * 0.3;
  return { y: STOPS[segment] + (STOPS[segment + 1] - STOPS[segment]) * k, segment, t: k };
}
