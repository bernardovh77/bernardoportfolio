import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { createRandom } from "@/lib/random";
import { PartBuilder } from "../../vehicle/builder";

/**
 * Traffic on the desert highway, shared by the light trails seen from the page,
 * the cars around you while you ride, and the view in the car's mirrors.
 *
 * The road: |x| < 7, a dashed center line at 0, lane lines at ±3.35 and edge lines
 * at ±6.7, so each side has two lanes 3.35 wide. Our side is x > 0.
 */

export const LANE_LINE = 3.35;

const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** [x, speed, direction]: direction 1 drives our way (toward the sun), -1 comes toward us. */
export const LANES: [number, number, number][] = [
  [-5.0, 70, -1],
  [-1.7, 58, -1],
  // Left lane of our side: the car you ride in drives here
  [1.7, 14, 1],
  [5.0, 22, 1],
];

/** Length of the loop every car drives around. */
export const TRAFFIC_SPAN = 600;

/** Per car: x, lane speed, direction, phase along the loop. */
export function trafficData(perLane: number) {
  const rnd = createRandom(31);
  const data = new Float32Array(LANES.length * perLane * 4);
  let k = 0;
  for (const [x, speed, direction] of LANES) {
    for (let j = 0; j < perLane; j++) {
      data.set([x, speed, direction, (j / perLane) * TRAFFIC_SPAN + rnd.range(0, 30)], k * 4);
      k++;
    }
  }
  return data;
}

/**
 * Where a car is on the road: returns its z and a 0..1 fade for the ends of its loop.
 * Seen from the page the cars are light trails pulling away; while you ride
 * (uDrive = 1) your lane cruises at your speed, so nobody drives through you.
 */
export const trafficGLSL = /* glsl */ `
uniform float uTravel;
uniform float uTime;
uniform float uDrive;
uniform float uCarZ;

vec2 trafficPlace(vec4 car) {
  const float span = ${TRAFFIC_SPAN.toFixed(1)};
  float offset;
  if (car.z < 0.0) {
    // Oncoming traffic rushes toward us (at believable highway speeds while riding)
    float rate = uDrive > 0.5 ? 26.0 : car.y;
    offset = mod(car.w + uTravel + uTime * rate, span);
    return vec2(-540.0 + offset, smoothstep(0.0, 60.0, offset) * (1.0 - smoothstep(span - 40.0, span, offset)));
  }
  if (uDrive < 0.5) {
    // Our way, seen from the page: light trails pulling away toward the sun
    offset = mod(car.w - (uTravel * 0.25 + uTime * car.y * 0.2), span);
    return vec2(-540.0 + offset, smoothstep(0.0, 60.0, offset) * (1.0 - smoothstep(span - 40.0, span, offset)));
  }
  if (car.x < ${LANE_LINE.toFixed(2)}) {
    // Our lane: everyone cruises at our speed, a convoy that keeps its gaps
    float ahead = car.w > 560.0 ? -26.0 : 32.0 + car.w * 0.75;
    float z = uCarZ - ahead + sin(uTime * 0.3 + car.w) * 0.9;
    return vec2(z, 1.0 - smoothstep(380.0, 470.0, ahead));
  }
  // The right lane is a bit slower: we overtake those cars one by one
  offset = mod(car.w + uTime * 5.0, span);
  return vec2(uCarZ - 400.0 + offset, smoothstep(0.0, 80.0, offset) * (1.0 - smoothstep(span - 60.0, span, offset)));
}
`;

/** Parts of a traffic car, decoded by its shader. */
export const CAR_PART = { body: 0, glass: 1, tail: 2, head: 3, tire: 4 } as const;

/**
 * A low-poly sports car, 4.5 long and 1.8 wide, nose toward -z.
 * Oncoming cars are the same model turned around in the shader.
 */
export function buildTrafficCar() {
  const b = new PartBuilder();
  const BODY = "#120a1d";
  // Lower body, side profile [z, y] going around: nose, hood, deck, tail, belly
  b.paint(BODY, CAR_PART.body).extrude(
    [
      [-2.1, 0.22],
      [-2.25, 0.48],
      [-2.02, 0.68],
      [-0.95, 0.8],
      [1.45, 0.84],
      [2.2, 0.8],
      [2.24, 0.32],
      [2.1, 0.22],
      [-2.1, 0.22],
    ],
    -0.9,
    0.9,
  );
  // Greenhouse (glass all around) and the roof on top
  b.paint("#06030c", CAR_PART.glass).extrude(
    [
      [-0.95, 0.8],
      [-0.25, 1.2],
      [0.6, 1.2],
      [1.45, 0.84],
      [-0.95, 0.8],
    ],
    -0.74,
    0.74,
  );
  b.paint(BODY, CAR_PART.body).extrude(
    [
      [-0.27, 1.19],
      [-0.2, 1.215],
      [0.55, 1.215],
      [0.62, 1.19],
    ],
    -0.72,
    0.72,
  );
  // A full-width light bar at the back, slim headlights at the front
  b.paint("#ff2340", CAR_PART.tail).box(v3(0, 0.68, 2.215), 1.62, 0.07, 0.05);
  b.paint("#fff1d6", CAR_PART.head);
  b.box(v3(-0.62, 0.52, -2.2), 0.36, 0.06, 0.06);
  b.box(v3(0.62, 0.52, -2.2), 0.36, 0.06, 0.06);
  // Wheels
  b.paint("#040208", CAR_PART.tire);
  for (const x of [-1, 1]) {
    for (const z of [-1.38, 1.38]) {
      b.cylinder(v3(x * 0.76, 0.32, z), v3(x * 0.95, 0.32, z), 0.32, 12);
    }
  }
  return b.build();
}

/** A patch of road under each car for its glow: underglow, and the light its lamps throw. */
export function buildTrafficGlow() {
  const g = new BufferGeometry();
  // x from -1.7 to 1.7, z from -9 (ahead of the nose) to 5 (behind the tail)
  const corners = [-1.7, 0.03, -9, 1.7, 0.03, -9, 1.7, 0.03, 5, -1.7, 0.03, 5];
  g.setAttribute("position", new BufferAttribute(new Float32Array(corners), 3));
  g.setIndex([0, 3, 2, 0, 2, 1]);
  return g;
}
