import { Euler, Matrix4, Quaternion, Vector3 } from "three";

/**
 * The seat you ride in: where the eyes are, where the console screen is,
 * how the vehicle moves under you and how the camera turns from the view
 * outside to the screen. The desert car is described here; the Megacity's
 * ship lives in ./ship.ts. Shared by the 3D cabins and the camera so they always agree.
 *
 * Vehicle space: x to the right, y up, z toward the back (vehicles move toward -z).
 * One unit is about one meter.
 */

/** Body motion of the vehicle under you, in vehicle space. */
export type VehicleMotion = { x: number; y: number; pitch: number; yaw: number; roll: number };

export type CabinLayout = {
  /** Where the vehicle sits in the world (the world moves past it) */
  position: Vector3;
  /** The rider's eyes */
  eye: Vector3;
  /** Console screen: center, axes (as seen by someone facing it) and size */
  screenCenter: Vector3;
  screenNormal: Vector3;
  screenUp: Vector3;
  screenRight: Vector3;
  screenWidth: number;
  screenHeight: number;
  /** How far the eyes end up from the screen once the rider leans in */
  viewDistance: number;
  /** The eyes aim this far above the screen's center, so some of the outside shows over the dashboard */
  aimRaise: number;
  /** Head pitch while looking out (radians, negative looks down) */
  lookPitch: number;
  /** Sitting down: where the eyes glance first (pitch and yaw, radians) before looking out */
  settlePitch: number;
  settleYaw: number;
  /** Vertical field of view looking out, for a window aspect ratio */
  outsideFov: (aspect: number) => number;
  motion: (time: number, reduced: boolean, out: VehicleMotion) => VehicleMotion;
};

/** A screen facing `target`, with its up and right axes. */
export function screenAxes(center: Vector3, target: Vector3) {
  const normal = target.clone().sub(center).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  return { normal, up, right };
}

/* ------------------------------------------------------------------ */
/* The desert car                                                      */
/* ------------------------------------------------------------------ */

/**
 * The car on the highway: the left lane of the right-hand side (lanes are 3.35 wide,
 * see components/three/scenes/desert/traffic.ts), where the camera of the desert sits.
 */
export const CAR_POSITION = new Vector3(1.7, 0, 14);

/** Driver's eyes (left-hand drive, like in Brazil). */
export const EYE = new Vector3(-0.36, 1.17, 0.32);

/** The console screen in the middle of the dashboard, angled toward the driver. */
export const SCREEN_CENTER = new Vector3(0, 0.83, -0.1);
export const SCREEN_WIDTH = 0.36;
export const SCREEN_HEIGHT = 0.225;
/** The screen faces the point where the driver's head ends up when leaning toward the console. */
const CAR_SCREEN = screenAxes(SCREEN_CENTER, new Vector3(-0.14, 1.1, 0.3));
export const SCREEN_NORMAL = CAR_SCREEN.normal;
export const SCREEN_UP = CAR_SCREEN.up;
export const SCREEN_RIGHT = CAR_SCREEN.right;

export const STEERING_CENTER = new Vector3(-0.38, 0.83, -0.05);
export const STEERING_RADIUS = 0.175;
/** Steering column direction (from the dashboard toward the driver). */
export const STEERING_AXIS = new Vector3(0, 0.4, 1).normalize();

/**
 * Head-up display: speed and autopilot projected on the windshield,
 * floating over the hood about 1.25 m ahead of the driver, a little below the horizon.
 */
export const HUD_CENTER = EYE.clone().add(new Vector3(0, -Math.sin(0.15), -Math.cos(0.15)).multiplyScalar(1.25));
export const HUD_WIDTH = 0.42;
export const HUD_HEIGHT = 0.14;

/** Suspension and tyre buzz. */
export function carMotion(time: number, reduced: boolean, out: VehicleMotion) {
  out.x = 0;
  out.yaw = 0;
  if (reduced) {
    out.y = 0;
    out.pitch = 0;
    out.roll = 0;
    return out;
  }
  out.y =
    Math.sin(time * 1.9) * 0.006 +
    Math.sin(time * 17.3) * 0.0012 +
    Math.sin(time * 23.7 + 1.3) * 0.0009;
  out.pitch = Math.sin(time * 1.3 + 0.5) * 0.0024 + Math.sin(time * 9.1) * 0.0004;
  out.roll = Math.sin(time * 0.8 + 1.1) * 0.0035;
  return out;
}

/** Field of view (vertical, degrees) looking out at the road. Narrow screens get a wider view. */
export function roadFov(aspect: number) {
  return Math.min(96, Math.max(66, 68 + (1 - aspect) * 52));
}

export const CAR_CABIN: CabinLayout = {
  position: CAR_POSITION,
  eye: EYE,
  screenCenter: SCREEN_CENTER,
  screenNormal: SCREEN_NORMAL,
  screenUp: SCREEN_UP,
  screenRight: SCREEN_RIGHT,
  screenWidth: SCREEN_WIDTH,
  screenHeight: SCREEN_HEIGHT,
  viewDistance: 0.46,
  aimRaise: 0.045,
  lookPitch: -0.05,
  // A glance down at the wheel and across the dashboard
  settlePitch: -0.26,
  settleYaw: -0.1,
  outsideFov: roadFov,
  motion: carMotion,
};

/* ------------------------------------------------------------------ */
/* The camera in the seat                                              */
/* ------------------------------------------------------------------ */

const _m = new Matrix4();
const _euler = new Euler(0, 0, 0, "YXZ");
const _qRoad = new Quaternion();
const _qScreen = new Quaternion();
const _screenEye = new Vector3();
const _screenAim = new Vector3();
const _roadEye = new Vector3();
const UP = new Vector3(0, 1, 0);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Field of view that frames the console screen. On wide windows it takes about half
 * the width, so the dashboard and the outside stay in view around it;
 * on a phone it takes almost all of it (the games need the room).
 */
export function screenFov(layout: CabinLayout, aspect: number) {
  const halfW = layout.screenWidth / 2 / layout.viewDistance;
  const halfH = layout.screenHeight / 2 / layout.viewDistance;
  const widthShare = aspect >= 1.2 ? 0.5 : aspect >= 0.9 ? 0.7 : 0.92;
  const tanHalf = Math.max(halfW / widthShare / aspect, (halfH + layout.aimRaise / layout.viewDistance) / 0.82);
  return Math.min(92, Math.max(24, (2 * Math.atan(tanHalf) * 180) / Math.PI));
}

/**
 * Camera inside the vehicle, in vehicle space.
 * `amount` blends from the view outside (0) to the screen view (1);
 * `settle` goes from 1 (just sat down: glancing at the controls) to 0 (eyes out front);
 * `lookX/lookY` (-1..1) turn the head a little toward the pointer.
 * Returns the vertical field of view.
 */
export function cabinCamera(
  layout: CabinLayout,
  amount: number,
  settle: number,
  aspect: number,
  lookX: number,
  lookY: number,
  time: number,
  reduced: boolean,
  outPos: Vector3,
  outQuat: Quaternion,
) {
  // The head turns first, then the body leans in and the eyes focus (zoom)
  const turn = smooth(0, 0.8, amount);
  const lean = smooth(0.15, 1, amount);
  const zoom = smooth(0.3, 1, amount);

  const free = (1 - amount) * (1 - settle);
  const breathe = reduced ? 0 : Math.sin(time * 0.9) * 0.004;
  const eye = layout.eye;
  _roadEye.set(
    eye.x + lookX * 0.03 * free,
    eye.y + breathe + lookY * 0.015 * free - settle * 0.02,
    eye.z + settle * 0.03,
  );
  // Settling in: a glance at the controls, then up and out
  _euler.set(
    layout.lookPitch + lookY * 0.16 * free + settle * layout.settlePitch,
    -lookX * 0.32 * free + settle * layout.settleYaw,
    0,
    "YXZ",
  );
  _qRoad.setFromEuler(_euler);

  _screenEye.copy(layout.screenCenter).addScaledVector(layout.screenNormal, layout.viewDistance);
  _screenEye.x += lookX * 0.006;
  _screenEye.y += lookY * 0.004 + breathe * 0.25;
  // Aim a little above the screen, so a strip of the outside still shows over the dashboard
  _screenAim.copy(layout.screenCenter).addScaledVector(layout.screenUp, layout.aimRaise);
  _m.lookAt(_screenEye, _screenAim, UP);
  _qScreen.setFromRotationMatrix(_m);

  outPos.copy(_roadEye).lerp(_screenEye, lean);
  outQuat.copy(_qRoad).slerp(_qScreen, turn);
  const outside = layout.outsideFov(aspect);
  return outside + (screenFov(layout, aspect) - outside) * zoom;
}
