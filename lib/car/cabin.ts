import { Euler, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Where everything sits inside the car, in car space:
 * x to the right, y up, z toward the back (the car drives toward -z).
 * One unit is about one meter, like the rest of the desert.
 *
 * Shared by the 3D cabin and the camera so they always agree.
 */

/** The car on the highway: right side, between the two lanes of light trails. */
export const CAR_POSITION = new Vector3(3.35, 0, 14);

/** Driver's eyes (left-hand drive, like in Brazil). */
export const EYE = new Vector3(-0.36, 1.17, 0.32);

/** The console screen in the middle of the dashboard, angled toward the driver. */
export const SCREEN_CENTER = new Vector3(0, 0.83, -0.1);
export const SCREEN_WIDTH = 0.36;
export const SCREEN_HEIGHT = 0.225;
/** The point the screen faces (the driver leaning toward the console). */
const SCREEN_TARGET = new Vector3(-0.14, 1.1, 0.3);
export const SCREEN_NORMAL = SCREEN_TARGET.clone().sub(SCREEN_CENTER).normalize();
/** Screen axes (right and up as seen by someone facing it). */
export const SCREEN_UP = new Vector3(0, 1, 0)
  .addScaledVector(SCREEN_NORMAL, -SCREEN_NORMAL.y)
  .normalize();
export const SCREEN_RIGHT = new Vector3().crossVectors(SCREEN_UP, SCREEN_NORMAL).normalize();
/** How far the eyes end up from the screen once the driver leans in. */
const SCREEN_VIEW_DISTANCE = 0.46;

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

/** Body motion of the car on the road (suspension and tyre buzz). */
export type CarMotion = { y: number; pitch: number; roll: number };

export function carMotion(time: number, reduced: boolean, out: CarMotion) {
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

const _m = new Matrix4();
const _euler = new Euler(0, 0, 0, "YXZ");
const _qRoad = new Quaternion();
const _qScreen = new Quaternion();
const _screenEye = new Vector3();
const _roadEye = new Vector3();
const UP = new Vector3(0, 1, 0);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Field of view (vertical, degrees) looking out at the road. Narrow screens get a wider view. */
export function roadFov(aspect: number) {
  return Math.min(96, Math.max(66, 68 + (1 - aspect) * 52));
}

/** Field of view that frames the console screen: about two thirds of a wide window, almost all of a phone. */
export function screenFov(aspect: number) {
  const halfW = SCREEN_WIDTH / 2 / SCREEN_VIEW_DISTANCE;
  const halfH = SCREEN_HEIGHT / 2 / SCREEN_VIEW_DISTANCE;
  const widthShare = aspect >= 1.2 ? 0.64 : aspect >= 0.9 ? 0.8 : 0.92;
  const tanHalf = Math.max(halfW / widthShare / aspect, halfH / 0.74);
  return Math.min(92, Math.max(24, (2 * Math.atan(tanHalf) * 180) / Math.PI));
}

/**
 * Camera inside the car, in car space.
 * `amount` blends from the road view (0) to the screen view (1);
 * `lookX/lookY` (-1..1) turn the head a little toward the pointer.
 * Returns the vertical field of view.
 */
export function cabinCamera(
  amount: number,
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

  const free = 1 - amount;
  const breathe = reduced ? 0 : Math.sin(time * 0.9) * 0.004;
  _roadEye.set(
    EYE.x + lookX * 0.03 * free,
    EYE.y + breathe + lookY * 0.015 * free,
    EYE.z,
  );
  _euler.set(-0.05 + lookY * 0.16, -lookX * 0.32, 0, "YXZ");
  _qRoad.setFromEuler(_euler);

  _screenEye.copy(SCREEN_CENTER).addScaledVector(SCREEN_NORMAL, SCREEN_VIEW_DISTANCE);
  _screenEye.x += lookX * 0.006;
  _screenEye.y += lookY * 0.004 + breathe * 0.25;
  _m.lookAt(_screenEye, SCREEN_CENTER, UP);
  _qScreen.setFromRotationMatrix(_m);

  outPos.copy(_roadEye).lerp(_screenEye, lean);
  outQuat.copy(_qRoad).slerp(_qScreen, turn);
  return roadFov(aspect) + (screenFov(aspect) - roadFov(aspect)) * zoom;
}
