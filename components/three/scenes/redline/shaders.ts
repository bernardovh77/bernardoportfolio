import { fogGLSL, hashGLSL, outputGLSL } from "../../glsl";
import { BARRIER, HALF_WIDTH, KERB_WIDTH, START_S, trackGLSL } from "./track";

/*
 * Shaders for Redline. Every pow() base is clamped and every normalize() is
 * guarded: a NaN on one pixel (Direct3D and Metal give NaN where SwiftShader
 * doesn't) gets spread by the bloom until the screen goes black.
 */

const f = (n: number) => n.toFixed(3);

const CONSTANTS = /* glsl */ `
const float HALF = ${f(HALF_WIDTH)};
const float KERB = ${f(KERB_WIDTH)};
const float BARRIER = ${f(BARRIER)};
const float START = ${f(START_S)};
`;

/** Anti-aliased band: 1 where a < x < b. */
const bandGLSL = /* glsl */ `
float band(float x, float a, float b) {
  float w = max(fwidth(x), 1e-4);
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}
float gridLine(vec2 p, float scale) {
  vec2 q = p / scale;
  vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
  return 1.0 - min(min(d.x, d.y), 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

export const groundVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const groundFragment = /* glsl */ `
uniform vec3 uRed;
varying vec3 vWorld;
${fogGLSL}
${bandGLSL}
void main() {
  float dist = length(vWorld - cameraPosition);
  float grid = gridLine(vWorld.xz, 14.0) * (1.0 - smoothstep(90.0, 280.0, dist));
  vec3 col = vec3(0.011, 0.005, 0.011) + uRed * grid * 0.13;
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* The track: asphalt, edge lines, kerbs, the grid and the run-off      */
/* ------------------------------------------------------------------ */

export const ribbonVertex = /* glsl */ `
attribute vec2 aTrack;
attribute float aKerb;
varying vec2 vTrack;
varying float vKerb;
varying vec3 vWorld;
void main() {
  vTrack = aTrack;
  vKerb = aKerb;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const ribbonFragment = /* glsl */ `
uniform vec3 uRed;
uniform vec3 uWarm;
uniform float uTowerSpacing;
uniform float uTowerOffset;
varying vec2 vTrack;
varying float vKerb;
varying vec3 vWorld;
${CONSTANTS}
${hashGLSL}
${fogGLSL}
${bandGLSL}

// Light pooled on the asphalt under the floodlights (towers alternate sides)
float pools(float s, float side) {
  float k = floor((s - uTowerOffset) / uTowerSpacing + 0.5);
  float light = 0.0;
  for (int i = -1; i <= 1; i++) {
    float kk = k + float(i);
    float ds = s - (uTowerOffset + kk * uTowerSpacing);
    float towerSide = mod(kk, 2.0) < 0.5 ? 1.0 : -1.0;
    float dl = side - towerSide * 2.0;
    light += exp(-ds * ds / 560.0) * exp(-dl * dl / 150.0);
  }
  return light;
}

void main() {
  float s = vTrack.x;
  float side = vTrack.y;
  float a = abs(side);
  float dist = length(vWorld - cameraPosition);
  float grain = hash12(floor(vWorld.xz * 4.0));
  float light = pools(s, side);
  vec3 col;
  // A damp track: it catches the red glow of the sky at grazing angles
  vec3 view = (cameraPosition - vWorld) / max(dist, 1e-3);
  float graze = 1.0 - clamp(view.y, 0.0, 1.0);
  graze *= graze;
  graze *= graze;
  if (a < HALF) {
    col = vec3(0.034, 0.029, 0.038) * (0.75 + 0.5 * grain) + uWarm * light * 0.22 * (0.85 + 0.3 * grain);
    col += uRed * graze * 0.09;
    // White lines along both edges
    col = mix(col, vec3(0.85, 0.82, 0.8) * (0.7 + light * 0.6), band(a, HALF - 0.6, HALF - 0.25));
    float ds = s - START;
    // The start/finish line, a checkered band across the track
    if (abs(ds) < 1.2) {
      float cx = floor((side + HALF) / 0.7);
      float cy = floor((ds + 1.2) / 0.6);
      col = mix(vec3(0.02), vec3(0.82, 0.8, 0.78), step(1.0, mod(cx + cy, 2.0)));
    }
    // Grid boxes behind it, staggered left and right
    if (ds < -4.0 && ds > -68.0) {
      float k = floor((-ds - 4.0) / 8.0);
      float local = -ds - 4.0 - k * 8.0;
      float slotSide = mod(k, 2.0) < 0.5 ? -2.6 : 2.6;
      float dx = abs(side - slotSide);
      float mark = step(local, 0.35) * step(dx, 1.9) + step(local, 2.2) * step(abs(dx - 1.9), 0.16);
      col = mix(col, vec3(0.7, 0.68, 0.66), min(mark, 1.0) * 0.85);
    }
  } else {
    // Run-off with the district's grid
    float grid = gridLine(vWorld.xz, 14.0) * (1.0 - smoothstep(90.0, 280.0, dist));
    col = vec3(0.016, 0.009, 0.015) + uRed * grid * 0.13 + uWarm * light * 0.05;
    // Red and white kerbs through the corners
    float kerb = band(a, HALF, HALF + KERB) * vKerb;
    float stripe = step(0.5, fract(s / 3.0));
    vec3 kerbColor = mix(vec3(0.8, 0.78, 0.76), uRed * 0.95, stripe) * (0.8 + light * 0.6);
    col = mix(col, kerbColor, kerb);
  }
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Barriers                                                            */
/* ------------------------------------------------------------------ */

export const barrierVertex = /* glsl */ `
attribute vec2 aTrack;
attribute vec2 aWall;
varying vec2 vTrack;
varying vec2 vWall;
varying vec3 vWorld;
void main() {
  vTrack = aTrack;
  vWall = aWall;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const barrierFragment = /* glsl */ `
uniform vec3 uRed;
varying vec2 vTrack;
varying vec2 vWall;
varying vec3 vWorld;
${fogGLSL}
void main() {
  float h = vWall.x;
  float corner = vWall.y;
  vec3 col = vec3(0.03, 0.024, 0.034);
  // In the corners the wall wears red and white covers
  float panel = step(0.5, fract(vTrack.x / 4.0));
  col = mix(col, mix(vec3(0.45), uRed * 0.55, panel), corner * step(h, 0.78));
  // A neon strip along the top
  float strip = smoothstep(0.8, 0.86, h) * (1.0 - smoothstep(0.94, 1.0, h));
  col += uRed * strip * 2.2;
  gl_FragColor = vec4(applyFog(col, length(vWorld - cameraPosition)), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Structures: towers, grandstand, pit building, gantry                 */
/* ------------------------------------------------------------------ */

export const structureVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aKind;
varying vec3 vColor;
varying float vKind;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vColor = aColor;
  vKind = aKind;
  vNormal = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const structureFragment = /* glsl */ `
uniform float uTime;
varying vec3 vColor;
varying float vKind;
varying vec3 vNormal;
varying vec3 vWorld;
${hashGLSL}
${fogGLSL}
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  int kind = int(floor(vKind + 0.001));
  vec3 col;
  if (kind == 1) {
    // Neon and lamps
    col = vColor;
  } else if (kind == 3) {
    // Warning lights, each blinking on its own phase
    float phase = fract(vKind) / 0.4;
    col = vColor * (0.12 + step(0.6, fract(uTime * 0.7 + phase)));
  } else if (kind == 5) {
    // Lit garages: brighter under the ceiling lights, each its own shade
    float bay = hash12(floor(vWorld.xz / 6.0));
    float h = clamp(vWorld.y / 5.2, 0.0, 1.0);
    col = vColor * (0.35 + 0.35 * bay) * (0.6 + 0.6 * h * h);
  } else {
    float light = 0.05 + 0.24 * max(n.y, 0.0) + 0.05 * max(-n.y, 0.0) + 0.04 * abs(n.x);
    col = vColor * light * 1.8;
    if (kind == 4) {
      // Rows of seats
      float row = fract(vWorld.y / 1.25);
      col *= 0.5 + 0.7 * step(0.35, row);
    } else if (kind == 2) {
      col += vec3(0.035, 0.028, 0.045) * max(n.y, 0.0);
    }
  }
  gl_FragColor = vec4(applyFog(col, length(vWorld - cameraPosition)), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Glows (lamps, start lights, warning lights)                          */
/* ------------------------------------------------------------------ */

export const glowVertex = /* glsl */ `
uniform float uTime;
attribute vec4 aCenter;
attribute vec4 aGlow;
varying vec2 vCorner;
varying vec3 vColor;
varying float vFade;
${fogGLSL}
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float mode = aGlow.w;
  float strength = 1.0;
  if (mode >= 10.0) {
    strength = 0.08 + step(0.6, fract(uTime * 0.7 + (mode - 10.0)));
  } else if (mode >= 1.0) {
    // The start: one more pair of red lights every second, then lights out
    float t = mod(uTime, 9.0);
    strength = max(step(mode, t) * step(t, 6.4), 0.03);
  }
  vec3 w = aCenter.xyz + (right * position.x + up * position.y) * aCenter.w;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vCorner = position.xy;
  vColor = aGlow.rgb * strength;
  vFade = 1.0 - fogAmount(-mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

export const glowFragment = /* glsl */ `
varying vec2 vCorner;
varying vec3 vColor;
varying float vFade;
void main() {
  float r = dot(vCorner, vCorner);
  float glow = exp(-r * 6.0) * 1.2 + exp(-r * 1.8) * 0.16;
  gl_FragColor = vec4(vColor * glow * vFade, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Floodlight beams                                                    */
/* ------------------------------------------------------------------ */

export const beamVertex = /* glsl */ `
attribute float aAlong;
varying float vAlong;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vAlong = aAlong;
  vNormal = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const beamFragment = /* glsl */ `
uniform vec3 uWarm;
varying float vAlong;
varying vec3 vNormal;
varying vec3 vWorld;
${fogGLSL}
void main() {
  vec3 toCamera = cameraPosition - vWorld;
  float dist = length(toCamera);
  vec3 n = vNormal / max(length(vNormal), 1e-5);
  // Fades at the cone's silhouette, so it reads as a soft shaft of light
  float facing = abs(dot(n, toCamera / max(dist, 1e-3)));
  float along = 1.0 - clamp(vAlong, 0.0, 1.0);
  float strength = (along * along * 0.7 + 0.06) * facing * facing;
  gl_FragColor = vec4(uWarm * strength * 0.085 * (1.0 - fogAmount(dist)), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* LED boards                                                          */
/* ------------------------------------------------------------------ */

export const boardVertex = /* glsl */ `
attribute float aCell;
attribute vec3 aColor;
varying vec2 vUv;
varying float vCell;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vCell = aCell;
  vColor = aColor;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const boardFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
varying vec2 vUv;
varying float vCell;
varying vec3 vColor;
varying vec3 vWorld;
${fogGLSL}
void main() {
  float cell = floor(vCell + 0.5);
  float column = mod(cell, 2.0);
  float row = floor(cell / 2.0);
  vec2 uv = vec2((column + vUv.x) * 0.5, 1.0 - (row + 1.0 - vUv.y) * 0.25);
  float ink = texture2D(uAtlas, uv).r;
  float dist = length(vWorld - cameraPosition);
  // Up close the letters are made of LEDs
  vec2 cellUv = fract(vUv * vec2(150.0, 36.0)) - 0.5;
  float led = 1.0 - smoothstep(0.24, 0.46, length(cellUv));
  led = mix(led, 0.75, smoothstep(25.0, 80.0, dist));
  vec3 col = vec3(0.02, 0.014, 0.024) + vColor * ink * (0.3 + 0.7 * led);
  col *= 0.94 + 0.06 * sin(uTime * 2.3 + vCell * 1.7);
  gl_FragColor = vec4(applyFog(col, dist), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Crowd: phone screens and camera flashes                              */
/* ------------------------------------------------------------------ */

export const crowdVertex = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSeed;
varying float vFlash;
varying float vSeed;
varying float vFade;
${fogGLSL}
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1.0);
  float cycle = fract(uTime * (0.06 + aSeed * 0.08) + aSeed * 17.0);
  vFlash = step(0.988, cycle);
  vSeed = aSeed;
  vFade = 1.0 - fogAmount(dist);
  gl_PointSize = mix(1.5, 7.0, vFlash) * clamp(140.0 / dist, 0.6, 2.6) * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
`;

export const crowdFragment = /* glsl */ `
varying float vFlash;
varying float vSeed;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.1, 0.5, d);
  vec3 phone = mix(vec3(0.45, 0.55, 1.0), vec3(1.0, 0.75, 0.55), step(0.5, fract(vSeed * 7.0))) * 0.4;
  vec3 col = mix(phone, vec3(3.2), vFlash) * a * vFade;
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* The city on the horizon                                             */
/* ------------------------------------------------------------------ */

export const skylineVertex = /* glsl */ `
attribute vec2 aCoord;
varying vec2 vCoord;
varying float vHeight;
void main() {
  vCoord = aCoord;
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export const skylineFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uHaze;
uniform vec3 uRed;
varying vec2 vCoord;
varying float vHeight;
${hashGLSL}
void main() {
  float around = vCoord.x * 720.0;
  float tower = floor(around);
  float rnd = hash11(tower * 1.7 + 3.0);
  // Denser, taller downtowns in a few directions
  float downtown = max(0.0, sin(vCoord.x * 18.85 + 1.3) * sin(vCoord.x * 43.98));
  float height = 0.05 + rnd * rnd * 0.4 + downtown * 0.42;
  float y = vCoord.y;
  if (y > height) discard;
  // Windows: a few lit, warm or cold
  float wx = fract(around * 3.0);
  float wy = fract(vHeight / 4.0);
  float lit = step(0.74, hash12(vec2(floor(around * 3.0), floor(vHeight / 4.0))));
  float window = step(0.3, wx) * step(wx, 0.7) * step(0.35, wy) * step(wy, 0.75);
  vec3 tint = mix(vec3(1.0, 0.72, 0.48), vec3(0.6, 0.72, 1.0), hash11(tower + 9.0));
  vec3 col = vec3(0.012, 0.008, 0.016) + tint * window * lit * 0.28;
  // A red light on top of the tall ones
  float roof = step(0.42, height) * step(height - 0.012, y) * step(0.5, fract(uTime * 0.45 + rnd * 5.0));
  col += uRed * roof * 2.0;
  // Haze toward the ground
  col = mix(col, uHaze, (1.0 - smoothstep(0.0, 0.32, y)) * 0.8);
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Light trails: the cars, in long exposure                             */
/* ------------------------------------------------------------------ */

export const trailVertex = /* glsl */ `
uniform float uTime;
uniform vec3 uTail;
uniform vec3 uHead;
attribute vec3 aStreak;
attribute vec4 aCar;
varying float vU;
varying float vEdge;
varying vec3 vColor;
varying float vFade;
${CONSTANTS}
${trackGLSL}
${fogGLSL}
void main() {
  float speed = aCar.y;
  float head = aCar.x + speed * uTime;
  // Close to half a second of exposure behind each light
  float s = head - aStreak.x * speed * 0.42;
  vec2 t;
  vec3 c = trackAt(s, t);
  vec3 right = vec3(-t.y, 0.0, t.x);
  float lane = clamp(aCar.z + sin(uTime * 0.21 + aCar.w * 40.0) * 1.6, -HALF + 1.4, HALF - 1.4);
  vec3 p = c + right * (lane + aStreak.z * 0.62);
  p.y = 0.62;
  vec3 forward = vec3(t.x, 0.0, t.y);
  vec3 toCamera = cameraPosition - p;
  float dist = length(toCamera);
  vec3 view = toCamera / max(dist, 1e-3);
  vec3 across = cross(forward, view);
  float len = length(across);
  across = len > 1e-4 ? across / len : vec3(0.0, 1.0, 0.0);
  float width = mix(0.11, 0.035, aStreak.x) * max(1.0, dist / 70.0);
  p += across * aStreak.y * width;
  // Headlights when the car comes toward us, tail lights when it drives away
  vColor = mix(uTail, uHead, smoothstep(-0.15, 0.25, dot(forward, view)));
  vU = aStreak.x;
  vEdge = aStreak.y;
  vFade = (1.0 - fogAmount(dist)) * smoothstep(2.0, 7.0, dist);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const trailFragment = /* glsl */ `
varying float vU;
varying float vEdge;
varying vec3 vColor;
varying float vFade;
void main() {
  float core = 1.0 - abs(vEdge);
  float along = 1.0 - clamp(vU, 0.0, 1.0);
  float glow = along * along * (0.35 + core * core * 1.6) + smoothstep(0.93, 1.0, along) * core * 2.2;
  gl_FragColor = vec4(vColor * glow * vFade, 1.0);
  ${outputGLSL}
}
`;
