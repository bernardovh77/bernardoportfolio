import type { Vehicle } from "@/lib/drive";

/**
 * The signs that offer a ride: EXIT 77 by the desert highway (the car) and the
 * SKY TAXI board on a Megacity tower (the ship). Each sign lives in its 3D scene;
 * the page listens to the pointer (components/drive/HitchSign.tsx).
 * These small stores connect the two.
 */
export type RideSign = {
  /** The pointer is over the page's background (not a link, a button or the terminal) */
  pointerFree: boolean;
  /** The pointer is over the sign right now (kept up to date by the 3D sign) */
  hover: boolean;
  /** Does a pointer at these normalized device coordinates (-1..1) land on the sign? */
  pick: ((x: number, y: number) => boolean) | null;
  /** Called by the 3D sign when `hover` changes (the page shows a label and locks the cursor) */
  onHover: ((hover: boolean) => void) | null;
};

function createRideSign(): RideSign {
  return { pointerFree: false, hover: false, pick: null, onHover: null };
}

export const rideSigns: Record<Vehicle, RideSign> = {
  car: createRideSign(),
  ship: createRideSign(),
};
