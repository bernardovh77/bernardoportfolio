import { Vector3 } from "three";
import { type CabinLayout, screenAxes, type VehicleMotion } from "./cabin";

/**
 * The sky taxi of the Megacity: a small ship flying in the traffic lanes over the avenue.
 * Same conventions as the car (./cabin.ts): ship space, x right, y up, z toward the back.
 */

/**
 * Where the ship flies: over the left half of the avenue, about 19 m up,
 * in the lane the sky traffic shares with it (see components/three/scenes/city/flow.ts).
 */
export const SHIP_POSITION = new Vector3(-2.4, 19, -20);

/** The pilot's eyes, in the middle of the cockpit. */
export const SHIP_EYE = new Vector3(0, 1.2, 0.34);

/** Console screen in the middle of the instrument panel, tilted toward the pilot. */
export const SHIP_SCREEN_CENTER = new Vector3(0, 0.73, -0.38);
export const SHIP_SCREEN_WIDTH = 0.36;
export const SHIP_SCREEN_HEIGHT = 0.225;
const SCREEN = screenAxes(SHIP_SCREEN_CENTER, new Vector3(0, 1.1, 0.3));
export const SHIP_SCREEN_NORMAL = SCREEN.normal;
export const SHIP_SCREEN_UP = SCREEN.up;
export const SHIP_SCREEN_RIGHT = SCREEN.right;

/** Small displays either side of the screen (radar on the left, ship systems on the right). */
export const SHIP_AUX_OFFSET = 0.355;
export const SHIP_AUX_WIDTH = 0.2;
export const SHIP_AUX_HEIGHT = 0.13;

/** Holographic head-up display, about a meter ahead of the pilot, right on the line of sight. */
export const SHIP_HUD_CENTER = SHIP_EYE.clone().add(new Vector3(0, -Math.sin(0.03), -Math.cos(0.03)).multiplyScalar(1.05));
export const SHIP_HUD_WIDTH = 0.6;
export const SHIP_HUD_HEIGHT = 0.3;

/** Flight stick (right hand) pivots here, at the floor between the knees. */
export const SHIP_STICK_PIVOT = new Vector3(0.19, 0.44, -0.05);

/** Hovering: a slow bob, drifting a little in the lane and banking into the drift. */
export function shipMotion(time: number, reduced: boolean, out: VehicleMotion) {
  if (reduced) {
    out.x = 0;
    out.y = 0;
    out.pitch = 0;
    out.yaw = 0;
    out.roll = 0;
    return out;
  }
  const drift = Math.sin(time * 0.31) * 0.7 + Math.sin(time * 0.13 + 2) * 0.3;
  out.x = drift * 0.32;
  out.y = Math.sin(time * 0.83) * 0.055 + Math.sin(time * 2.1 + 1) * 0.008 + Math.sin(time * 13.7) * 0.0012;
  // Lean into the drift: the bank follows the sideways velocity
  out.roll = -(Math.cos(time * 0.31) * 0.7 * 0.31 + Math.cos(time * 0.13 + 2) * 0.3 * 0.13) * 0.16 + Math.sin(time * 1.6) * 0.002;
  out.pitch = Math.sin(time * 0.83 + 1.2) * 0.006;
  out.yaw = -drift * 0.006;
  return out;
}

/** A cockpit view is a bit wider than the car's (a canopy all around). */
export function cockpitFov(aspect: number) {
  return Math.min(100, Math.max(70, 72 + (1 - aspect) * 52));
}

export const SHIP_CABIN: CabinLayout = {
  position: SHIP_POSITION,
  eye: SHIP_EYE,
  screenCenter: SHIP_SCREEN_CENTER,
  screenNormal: SHIP_SCREEN_NORMAL,
  screenUp: SHIP_SCREEN_UP,
  screenRight: SHIP_SCREEN_RIGHT,
  screenWidth: SHIP_SCREEN_WIDTH,
  screenHeight: SHIP_SCREEN_HEIGHT,
  viewDistance: 0.46,
  aimRaise: 0.04,
  lookPitch: -0.05,
  // A glance down at the instruments and the stick
  settlePitch: -0.3,
  settleYaw: -0.12,
  outsideFov: cockpitFov,
  motion: shipMotion,
};
