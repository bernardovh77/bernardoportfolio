/**
 * Ride mode: the secret rides hidden in two districts. A car on the Synth Desert
 * highway (EXIT 77) and a sky taxi in the Megacity (the SKY TAXI board).
 *
 * A small mutable store, like `world`: the 3D camera reads it every frame,
 * and the interface subscribes to the few fields that change rarely
 * (phase, view, vehicle) through `driveStore`.
 */

import { lockScroll } from "@/lib/scroll";
import type { ThemeId } from "@/lib/themes";
import { TRAVEL_DURATION, world } from "@/lib/world";

export type Vehicle = "car" | "ship";

/** The district each vehicle rides in. */
export const VEHICLE_DISTRICT: Record<Vehicle, ThemeId> = { car: "desert", ship: "city" };

/** The vehicle you can catch in a district (null where there is none). */
export function vehicleIn(theme: ThemeId): Vehicle | null {
  if (theme === "desert") return "car";
  if (theme === "city") return "ship";
  return null;
}

export type DrivePhase =
  /** Not riding */
  | "off"
  /** Transport effect running, about to land in the seat */
  | "entering"
  /** Sitting in the vehicle */
  | "inside"
  /** Transport effect running, about to land back on the page */
  | "leaving";

/** Where the rider is looking: out at the road (or the sky lanes), or down at the console screen. */
export type DriveView = "road" | "screen";

/** Whole transport effect (same length as the district travel, so it reuses its warp). */
export const TRANSPORT_MS = TRAVEL_DURATION;
/** Fraction of the effect when the camera jumps (the overlay is opaque then). */
export const SWAP_AT = 0.45;
/** Sitting down: a glance at the controls, then eyes up and out. */
export const SETTLE_MS = 1900;
/** How long the rider takes in the cabin and the view before turning to the console. */
export const ROAD_HOLD_MS = 3600;
/** The first, unhurried turn toward the console... */
export const FIRST_TURN_MS = 2300;
/** ...and the quicker turns when the visitor switches views. */
export const TURN_MS = 1300;

type ScreenPick = (ndcX: number, ndcY: number) => { x: number; y: number } | null;

export const drive = {
  phase: "off" as DrivePhase,
  vehicle: "car" as Vehicle,
  /** True while the camera is in the vehicle (between the two swaps) */
  inside: false,
  /** performance.now() when the camera landed in the seat */
  arrivedAt: 0,
  view: "road" as DriveView,
  /** View blend (0 outside, 1 screen) when the current turn started */
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
   * Turn a pointer position (normalized device coordinates) into a point on
   * each vehicle's console screen, in screen pixels. Registered by the 3D cabins.
   */
  picks: {} as Partial<Record<Vehicle, ScreenPick>>,
};

/** Sitting in this vehicle right now (the camera is in its seat). */
export function ridingIn(vehicle: Vehicle) {
  return drive.inside && drive.vehicle === vehicle;
}

/** Where a pointer lands on the console screen of the vehicle you are in (null when it misses). */
export function pickScreen(ndcX: number, ndcY: number) {
  return drive.picks[drive.vehicle]?.(ndcX, ndcY) ?? null;
}

type Snapshot = {
  phase: DrivePhase;
  view: DriveView;
  vehicle: Vehicle;
  /** Someone rode in the car at least once (its 3D cabin is only built then) */
  carVisited: boolean;
  /** Same for the ship */
  shipVisited: boolean;
};

const SERVER_SNAPSHOT: Snapshot = { phase: "off", view: "road", vehicle: "car", carVisited: false, shipVisited: false };
let snapshot: Snapshot = SERVER_SNAPSHOT;
const visited: Record<Vehicle, boolean> = { car: false, ship: false };
const listeners = new Set<() => void>();
let timers: number[] = [];

function emit() {
  const next: Snapshot = {
    phase: drive.phase,
    view: drive.view,
    vehicle: drive.vehicle,
    carVisited: visited.car,
    shipVisited: visited.ship,
  };
  if (
    next.phase === snapshot.phase &&
    next.view === snapshot.view &&
    next.vehicle === snapshot.vehicle &&
    next.carVisited === snapshot.carVisited &&
    next.shipVisited === snapshot.shipVisited
  ) {
    return;
  }
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

/** 0 = looking outside, 1 = looking at the screen (eased, mid-turn values in between). */
export function viewAmount(now: number) {
  const target = drive.view === "screen" ? 1 : 0;
  const duration = world.reducedMotion ? 1 : drive.turnMs;
  const k = Math.min(1, Math.max(0, (now - drive.viewStart) / duration));
  const shape = drive.turnMs === FIRST_TURN_MS ? easeSine(k) : ease(k);
  return drive.viewFrom + (target - drive.viewFrom) * shape;
}

/** 1 right after sitting down (eyes on the controls), easing to 0 (eyes out front). */
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

function landInSeat() {
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

/** Jumps into a vehicle. The caller checks that its district is the one on screen. */
export function enterRide(vehicle: Vehicle) {
  if (drive.phase !== "off") return false;
  clearTimers();
  drive.vehicle = vehicle;
  visited[vehicle] = true;
  setPhase("entering");
  const reduced = world.reducedMotion;
  const swapAt = reduced ? 0 : TRANSPORT_MS * SWAP_AT;
  if (!reduced) world.travelStart = performance.now();
  later(swapAt, landInSeat);
  later(reduced ? 300 : TRANSPORT_MS, () => setPhase("inside"));
  later(swapAt + ROAD_HOLD_MS, () => {
    if (drive.inside && !drive.manualView) setView("screen", false, FIRST_TURN_MS);
  });
  return true;
}

/** Back to the page, with the same transport effect. */
export function leaveRide() {
  if (drive.phase !== "inside" && drive.phase !== "entering") return;
  clearTimers();
  setPhase("leaving");
  const reduced = world.reducedMotion;
  if (!reduced) world.travelStart = performance.now();
  later(reduced ? 0 : TRANSPORT_MS * SWAP_AT, landOnPage);
  later(reduced ? 300 : TRANSPORT_MS, () => setPhase("off"));
}

/** Drops out of the vehicle at once (the district changed, or the page is going away). */
export function forceLeaveRide() {
  if (drive.phase === "off") return;
  clearTimers();
  if (drive.inside) landOnPage();
  setPhase("off");
}
