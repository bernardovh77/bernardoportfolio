/**
 * Drive mode: the secret ride inside one of the cars on the desert highway.
 *
 * A small mutable store, like `world`: the 3D camera reads it every frame,
 * and the interface subscribes to the few fields that change rarely
 * (phase and view) through `driveStore`.
 */

import { lockScroll } from "@/lib/scroll";
import { TRAVEL_DURATION, world } from "@/lib/world";

export type DrivePhase =
  /** Not in the car */
  | "off"
  /** Transport effect running, about to land in the car */
  | "entering"
  /** Sitting in the car */
  | "inside"
  /** Transport effect running, about to land back on the page */
  | "leaving";

/** Where the driver is looking: out at the road, or down at the console screen. */
export type DriveView = "road" | "screen";

/** Whole transport effect (same length as the district travel, so it reuses its warp). */
export const TRANSPORT_MS = TRAVEL_DURATION;
/** Fraction of the effect when the camera jumps (the overlay is opaque then). */
export const SWAP_AT = 0.45;
/** Sitting down: a glance at the wheel and the dashboard, then eyes up on the road. */
export const SETTLE_MS = 1900;
/** How long the driver takes in the cockpit and the road before turning to the console. */
export const ROAD_HOLD_MS = 3600;
/** The first, unhurried turn toward the console... */
export const FIRST_TURN_MS = 2300;
/** ...and the quicker turns when the visitor switches views. */
export const TURN_MS = 1300;

export const drive = {
  phase: "off" as DrivePhase,
  /** True while the camera is in the car (between the two swaps) */
  inside: false,
  /** performance.now() when the camera landed in the car */
  arrivedAt: 0,
  view: "road" as DriveView,
  /** View blend (0 road, 1 screen) when the current turn started */
  viewFrom: 0,
  /** performance.now() when the current turn started */
  viewStart: 0,
  /** Length of the current turn, ms */
  turnMs: TURN_MS,
  /** The visitor picked a view themselves, so the automatic turn is skipped */
  manualView: false,
  /** Speed shown on the dashboard, km/h (written by the scene) */
  speed: 0,
  /**
   * Turns a pointer position (normalized device coordinates) into a point on
   * the console screen, in screen pixels. Registered by the 3D car.
   */
  pick: null as ((ndcX: number, ndcY: number) => { x: number; y: number } | null) | null,
};

type Snapshot = {
  phase: DrivePhase;
  view: DriveView;
  /** Someone got in at least once (the 3D car is only built then) */
  visited: boolean;
};

const SERVER_SNAPSHOT: Snapshot = { phase: "off", view: "road", visited: false };
let snapshot: Snapshot = SERVER_SNAPSHOT;
let visited = false;
const listeners = new Set<() => void>();
let timers: number[] = [];

function emit() {
  const next = { phase: drive.phase, view: drive.view, visited };
  if (next.phase === snapshot.phase && next.view === snapshot.view && next.visited === snapshot.visited) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export const driveStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): Snapshot {
    return snapshot;
  },
  getServerSnapshot(): Snapshot {
    return SERVER_SNAPSHOT;
  },
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const easeSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/** 0 = looking at the road, 1 = looking at the screen (eased, mid-turn values in between). */
export function viewAmount(now: number) {
  const target = drive.view === "screen" ? 1 : 0;
  const duration = world.reducedMotion ? 1 : drive.turnMs;
  const k = Math.min(1, Math.max(0, (now - drive.viewStart) / duration));
  const shape = drive.turnMs === FIRST_TURN_MS ? easeSine(k) : ease(k);
  return drive.viewFrom + (target - drive.viewFrom) * shape;
}

/** 1 right after sitting down (eyes on the wheel and the dashboard), easing to 0 (eyes on the road). */
export function settleAmount(now: number) {
  if (world.reducedMotion || !drive.inside) return 0;
  const k = Math.min(1, Math.max(0, (now - drive.arrivedAt) / SETTLE_MS));
  return 1 - ease(k);
}

export function setView(view: DriveView, manual = false, duration = TURN_MS) {
  if (!drive.inside) return;
  if (manual) drive.manualView = true;
  if (view === drive.view) return;
  const now = performance.now();
  drive.viewFrom = viewAmount(now);
  drive.viewStart = now;
  drive.turnMs = duration;
  drive.view = view;
  emit();
}

export function toggleView() {
  setView(drive.view === "screen" ? "road" : "screen", true);
}

function later(ms: number, run: () => void) {
  timers.push(window.setTimeout(run, ms));
}

function clearTimers() {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

function setPhase(phase: DrivePhase) {
  drive.phase = phase;
  emit();
}

function landInCar() {
  drive.inside = true;
  drive.arrivedAt = performance.now();
  drive.view = "road";
  drive.viewFrom = 0;
  drive.viewStart = drive.arrivedAt;
  drive.manualView = false;
  // Whatever had focus on the page (a button, the terminal) is hidden now
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.documentElement.classList.add("is-driving");
  lockScroll(true);
  emit();
}

function landOnPage() {
  drive.inside = false;
  drive.view = "road";
  document.documentElement.classList.remove("is-driving");
  lockScroll(false);
  emit();
}

/** Jumps into the car. Only works in the Synth Desert (the caller checks the district). */
export function enterCar() {
  if (drive.phase !== "off") return false;
  clearTimers();
  visited = true;
  setPhase("entering");
  const reduced = world.reducedMotion;
  const swapAt = reduced ? 0 : TRANSPORT_MS * SWAP_AT;
  if (!reduced) world.travelStart = performance.now();
  later(swapAt, landInCar);
  later(reduced ? 300 : TRANSPORT_MS, () => setPhase("inside"));
  later(swapAt + ROAD_HOLD_MS, () => {
    if (drive.inside && !drive.manualView) setView("screen", false, FIRST_TURN_MS);
  });
  return true;
}

/** Back to the page, with the same transport effect. */
export function leaveCar() {
  if (drive.phase !== "inside" && drive.phase !== "entering") return;
  clearTimers();
  setPhase("leaving");
  const reduced = world.reducedMotion;
  if (!reduced) world.travelStart = performance.now();
  later(reduced ? 0 : TRANSPORT_MS * SWAP_AT, landOnPage);
  later(reduced ? 300 : TRANSPORT_MS, () => setPhase("off"));
}

/** Drops out of the car at once (the district changed, or the page is going away). */
export function forceLeaveCar() {
  if (drive.phase === "off") return;
  clearTimers();
  if (drive.inside) landOnPage();
  setPhase("off");
}
