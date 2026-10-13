"use client";

import { type RefObject, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  Color,
  type Group,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import { drive, type Vehicle } from "@/lib/drive";
import { KIND, PartBuilder } from "./builder";

/**
 * The little photo you find in each vehicle: a pendant hanging from the car's
 * rear-view mirror and a frame standing on the ship's dash. Clicking either one
 * zooms into the photo (components/drive/DriveOverlay.tsx).
 */

/** Square crop of the photo, for the 3D keepsakes (the zoomed view uses the full one). */
export const KEEPSAKE_TEXTURE = "/images/keepsake-small.jpg";

let texture: Texture | null = null;
function keepsakeTexture() {
  if (!texture) {
    texture = new TextureLoader().load(KEEPSAKE_TEXTURE);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
  }
  return texture;
}

/** The photo itself: unlit, a little dimmed so it sits in the cabin's light instead of glowing. */
export function createPhotoMaterial() {
  return new MeshBasicMaterial({ map: keepsakeTexture(), color: new Color(0.8, 0.78, 0.82), fog: false });
}

/** Invisible, a bit larger than the keepsake: an easier target for the pointer. */
export function createHitMaterial() {
  return new MeshBasicMaterial({ visible: false });
}

export function photoGeometry(size: number) {
  return new PlaneGeometry(size, size);
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const FORWARD = v(0, 0, 1);

/* ------------------------------------------------------------------ */
/* The car's pendant                                                   */
/* ------------------------------------------------------------------ */

/** Length of the cord, from the mirror down to the top of the locket. */
export const PENDANT_CORD = 0.075;
/** The locket: a rounded square frame, the photo inside. */
export const PENDANT_SIZE = 0.06;
export const PENDANT_PHOTO = 0.046;
/** Center of the locket, below the anchor (pendant space: hanging down -y, facing +z). */
export const PENDANT_CENTER = v(0, -PENDANT_CORD - 0.008 - PENDANT_SIZE / 2, 0);

/** Cord, a glowing bead, the ring and the locket's frame, in pendant space. */
export function buildPendant() {
  const b = new PartBuilder();
  // Cord with a bead halfway
  b.paint("#2a1630").beam(v(0, 0, 0), v(0, -PENDANT_CORD, 0), 0.0028, 0.0028, FORWARD);
  b.paint("#ff3f8e", KIND.neon, 2.2).box(v(0, -PENDANT_CORD * 0.55, 0), 0.007, 0.009, 0.007);
  // Ring the cord goes through
  b.paint("#d8b46a", KIND.gloss).ring(v(0, -PENDANT_CORD - 0.004, 0), v(0, 0, 1), 0.005, 0.0013, 16, 6);
  // Gold frame, a pink neon line just inside it
  b.paint("#c99c4a", KIND.gloss).roundedSlab(
    PENDANT_CENTER.clone().add(v(0, 0, 0.003)),
    v(1, 0, 0),
    v(0, 1, 0),
    PENDANT_SIZE,
    PENDANT_SIZE,
    0.006,
    0.012,
    5,
  );
  const inner = PENDANT_PHOTO / 2 + 0.0022;
  b.paint("#ff3f8e", KIND.neon, 1.8);
  for (const [x, y, w, h] of [
    [0, inner, inner * 2, 0.0012],
    [0, -inner, inner * 2, 0.0012],
    [inner, 0, 0.0012, inner * 2],
    [-inner, 0, 0.0012, inner * 2],
  ]) {
    b.box(PENDANT_CENTER.clone().add(v(x, y, 0.0034)), w, h, 0.0008);
  }
  return b.build();
}

/* ------------------------------------------------------------------ */
/* The ship's frame                                                    */
/* ------------------------------------------------------------------ */

export const FRAME_SIZE = 0.084;
export const FRAME_PHOTO = 0.064;
/** Center of the frame's face (frame space: standing on y = 0, facing +z). */
export const FRAME_CENTER = v(0, 0.012 + FRAME_SIZE / 2, 0);

/** A chunky little frame on a stand, in the cockpit's paint, in frame space. */
export function buildFrame() {
  const b = new PartBuilder();
  // Foot on the dash
  b.paint("#283041").box(v(0, 0.005, -0.012), FRAME_SIZE * 0.8, 0.01, 0.04);
  // Body: cream border on a gunmetal back
  b.paint("#283041", KIND.gloss).roundedSlab(FRAME_CENTER.clone().add(v(0, 0, -0.002)), v(1, 0, 0), v(0, 1, 0), FRAME_SIZE, FRAME_SIZE, 0.012, 0.008, 3);
  b.paint("#b8ae98", KIND.gloss).roundedSlab(FRAME_CENTER.clone().add(v(0, 0, 0.0015)), v(1, 0, 0), v(0, 1, 0), FRAME_SIZE - 0.004, FRAME_SIZE - 0.004, 0.0035, 0.007, 3);
  // Magenta neon around the photo, and a kickstand behind
  const inner = FRAME_PHOTO / 2 + 0.002;
  b.paint("#ff2bd1", KIND.neon, 1.8);
  for (const [x, y, w, h] of [
    [0, inner, inner * 2 + 0.0016, 0.0016],
    [0, -inner, inner * 2 + 0.0016, 0.0016],
    [inner, 0, 0.0016, inner * 2],
    [-inner, 0, 0.0016, inner * 2],
  ]) {
    b.box(FRAME_CENTER.clone().add(v(x, y, 0.0018)), w, h, 0.001);
  }
  b.paint("#1a1f2b").beam(FRAME_CENTER.clone().add(v(0, 0.01, -0.008)), v(0, 0.004, -0.05), 0.012, 0.004);
  return b.build();
}

/* ------------------------------------------------------------------ */
/* Pointing at it                                                      */
/* ------------------------------------------------------------------ */

/** Registers the hit test for a vehicle's keepsake (anything under `targetRef`). */
export function useKeepsakePick(vehicle: Vehicle, targetRef: RefObject<Object3D | Group | null>) {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    drive.keepsakes[vehicle] = (x, y) => {
      const target = targetRef.current;
      if (!target || drive.vehicle !== vehicle) return false;
      ndc.set(x, y);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target, true).length > 0;
    };
    return () => {
      delete drive.keepsakes[vehicle];
    };
  }, [vehicle, camera, targetRef]);
}
