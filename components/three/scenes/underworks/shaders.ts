import { hashGLSL, outputGLSL } from "../../glsl";

/** Number of bulbs and arcs that light the scene at once (the nearest ones). */
export const MAX_BULB_LIGHTS = 6;
export const MAX_ARC_LIGHTS = 3;
/** Emitter slots for sparks, and slots for drawn electric arcs. */
export const MAX_EMITTERS = 12;
export const MAX_ARCS = 4;

/* ------------------------------------------------------------------ */
/* Shared chunks                                                       */
/* ------------------------------------------------------------------ */

/** Piece animation. Keep in sync with the JS mirrors in power.ts. */
const motionGLSL = /* glsl */ `
vec2 rotate2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float crusherHeight(float u) {
  if (u < 0.45) { float k = u / 0.45; return k * k * (3.0 - 2.0 * k); }
  if (u < 0.7) return 1.0;
  if (u < 0.74) { float k = (u - 0.7) / 0.04; return 1.0 - k * k; }
  return 0.0;
}

// A lift that hasn't been serviced in years: parked, lurches, drops, winches back up
float liftOffset(float u) {
  if (u < 0.55) return 0.0;
  if (u < 0.6) { float k = (u - 0.55) / 0.05; return -0.35 * k * k * (3.0 - 2.0 * k); }
  if (u < 0.68) return -0.35;
  if (u < 0.7) { float k = (u - 0.68) / 0.02; return -0.35 - 0.65 * k * k; }
  if (u < 0.8) return -1.0;
  float k = (u - 0.8) / 0.2;
  return -1.0 + k * k * (3.0 - 2.0 * k);
}

void applyMotion(inout vec3 p, inout vec3 n, vec3 pivot, vec4 motion, float t) {
  float type = motion.x;
  if (type < 0.5) return;
  float speed = motion.y;
  float phase = motion.z;
  float amp = motion.w;
  if (type < 1.5) {
    float a = phase + speed * t;
    p.xy = pivot.xy + rotate2(p.xy - pivot.xy, a);
    n.xy = rotate2(n.xy, a);
  } else if (type < 2.5) {
    float c = t * speed + phase;
    float f = fract(c);
    float judder = sin(t * 31.0) * 0.006 * step(0.18, f) * (1.0 - smoothstep(0.18, 0.4, f));
    float a = (floor(c) + smoothstep(0.0, 0.18, f)) * amp + judder;
    p.xy = pivot.xy + rotate2(p.xy - pivot.xy, a);
    n.xy = rotate2(n.xy, a);
  } else if (type < 3.5) {
    float a = amp * sin(speed * t + phase);
    p.xy = pivot.xy + rotate2(p.xy - pivot.xy, a);
    n.xy = rotate2(n.xy, a);
  } else if (type < 4.5) {
    p.y += amp * crusherHeight(fract(t * speed + phase));
  } else if (type < 5.5) {
    p.y += amp * liftOffset(fract(t * speed + phase));
  } else {
    p.y -= mod(phase + speed * t, amp);
  }
}
`;

/** Smog color by height: cold at the grates, brown in the middle, red near the furnace. */
const hazeGLSL = /* glsl */ `
uniform vec3 uHaze[4];
uniform float uDepth;
uniform float uHazeDensity;
uniform float uFurnaceY;
uniform vec3 uFurnace;
uniform float uTopY;
uniform vec3 uSkyLight;

vec3 hazeColor(float y) {
  float f = -y / uDepth;
  vec3 c = mix(uHaze[0], uHaze[1], smoothstep(-0.12, 0.3, f));
  c = mix(c, uHaze[2], smoothstep(0.3, 0.78, f));
  return mix(c, uHaze[3], smoothstep(0.78, 1.08, f));
}

float hazeAmount(float dist) {
  float x = dist * uHazeDensity;
  return 1.0 - exp(-x * x);
}
`;

/** The nearest bulbs and arcs, plus the furnace below and the grates above. */
const lightsGLSL = /* glsl */ `
uniform vec3 uBulbPos[${MAX_BULB_LIGHTS}];
uniform vec4 uBulbCol[${MAX_BULB_LIGHTS}];
uniform vec3 uArcPos[${MAX_ARC_LIGHTS}];
uniform vec4 uArcCol[${MAX_ARC_LIGHTS}];

vec3 pointLights(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${MAX_BULB_LIGHTS}; i++) {
    vec3 L = uBulbPos[i] - p;
    float d2 = dot(L, L);
    float w = max(0.0, 1.0 - d2 * uBulbCol[i].w);
    float facing = 0.3 + 0.7 * max(dot(n, L) * inversesqrt(d2 + 0.01), 0.0);
    sum += uBulbCol[i].rgb * (w * w * facing);
  }
  for (int i = 0; i < ${MAX_ARC_LIGHTS}; i++) {
    vec3 L = uArcPos[i] - p;
    float d2 = dot(L, L);
    float w = max(0.0, 1.0 - d2 * uArcCol[i].w);
    float facing = 0.25 + 0.75 * max(dot(n, L) * inversesqrt(d2 + 0.01), 0.0);
    sum += uArcCol[i].rgb * (w * w * facing);
  }
  return sum;
}

vec3 shade(vec3 albedo, vec3 p, vec3 n, vec3 haze, float fog) {
  float rim = 1.0 - abs(n.z);
  vec3 col = albedo * (haze * 0.9 + 0.012);
  // Edges turned away from the camera pick up the glow of the smog behind them
  col += haze * rim * rim * 0.55;
  // Far away the smog hides everything, so skip the lights there
  if (fog < 0.7) col += albedo * pointLights(p, n);
  // Furnace light, from below
  float above = max(p.y - uFurnaceY, 0.0);
  float furnace = exp(-above * 0.032) * (0.35 + 0.65 * max(-n.y, 0.0) + 0.45 * rim);
  col += uFurnace * furnace * (albedo + 0.03);
  // Cold daylight leaking through the grates at the top
  float below = max(uTopY - p.y, 0.0);
  col += uSkyLight * exp(-below * 0.045) * (0.3 + 0.7 * max(n.y, 0.0) + 0.3 * rim) * albedo;
  return col;
}
`;

/* ------------------------------------------------------------------ */
/* Structures: everything solid, in one draw call                      */
/* ------------------------------------------------------------------ */

export const structureVertex = /* glsl */ `
uniform float uTime;
attribute vec3 aPivot;
attribute vec4 aMotion;
attribute vec4 aTint;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vRest;
varying vec4 vTint;
${motionGLSL}
void main() {
  vec3 p = position;
  vec3 n = normal;
  applyMotion(p, n, aPivot, aMotion, uTime);
  vRest = position;
  vTint = aTint;
  vNormal = n;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const structureFragment = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vRest;
varying vec4 vTint;
${hashGLSL}
${hazeGLSL}
${lightsGLSL}
void main() {
  vec3 haze = hazeColor(vWorld.y);
  float fog = hazeAmount(distance(vWorld, cameraPosition));
  float pattern = vTint.a;
  vec3 col;

  if (pattern > 4.5) {
    // Things that glow by themselves: molten metal, the lava crust, hot iron
    if (pattern < 5.5) {
      vec2 uv = vec2(vRest.x * 0.13 + vRest.z * 0.05, vRest.y * 0.045 + uTime * 0.32);
      float a = texture2D(uNoise, uv).r;
      float b = texture2D(uNoise, uv * 2.3 + vec2(0.31, uTime * 0.21)).b;
      float heat = clamp(0.35 + 0.8 * (a * 0.6 + b * 0.4), 0.0, 1.0);
      col = mix(vec3(1.8, 0.32, 0.04), vec3(5.2, 2.6, 0.8), heat * heat);
    } else if (pattern < 6.5) {
      vec4 c = texture2D(uNoise, vRest.xz * 0.045 + vec2(uTime * 0.002, 0.0));
      vec4 m = texture2D(uNoise, vRest.xz * 0.011 + vec2(0.3, uTime * 0.001));
      // Wide molten patches where the crust has melted, thin seams elsewhere
      float melt = smoothstep(0.55, 0.85, m.r);
      float crack = 1.0 - smoothstep(0.015, 0.07 + melt * 0.25, c.g);
      float pulse = 0.7 + 0.3 * sin(uTime * 0.5 + m.b * 12.0);
      vec3 crust = vec3(0.02, 0.007, 0.004) + vec3(0.16, 0.03, 0.006) * c.b * c.b;
      vec3 hot = mix(vec3(1.6, 0.3, 0.04), vec3(3.2, 1.0, 0.16), melt) * pulse;
      col = mix(crust, hot, max(crack, melt * 0.85));
    } else {
      // Hot iron and the fire behind the furnace door, slowly rolling upward
      vec2 uv = vec2(vRest.x * 0.07 + vRest.z * 0.05, vRest.y * 0.06 - uTime * 0.11);
      float g = texture2D(uNoise, uv).r * 0.7 + texture2D(uNoise, uv * 2.7 + 0.4).b * 0.3;
      col = mix(vec3(0.45, 0.05, 0.01), vec3(2.8, 0.95, 0.16), g * g * 1.3);
    }
    col = mix(col, haze, fog * 0.5);
  } else {
    vec3 n = normalize(vNormal);
    vec4 nz = texture2D(uNoise, vRest.xy * 0.045 + vec2(vRest.z * 0.031, vRest.z * 0.017));
    vec3 albedo = vTint.rgb * (0.5 + 1.0 * nz.r);
    if (pattern > 0.5 && pattern < 1.5) {
      // Hazard stripes, half worn off
      float stripe = step(0.5, fract((vRest.x + vRest.y + vRest.z * 0.5) * 0.6));
      float worn = smoothstep(0.42, 0.62, nz.b * 0.6 + nz.g * 0.5);
      vec3 paint = vec3(0.34, 0.19, 0.02) * (0.6 + 0.6 * nz.r);
      albedo = mix(albedo, paint, stripe * (1.0 - worn));
    } else if (pattern > 1.5 && pattern < 2.5) {
      // Soot-stained bricks
      vec2 bp = vRest.xy / vec2(2.3, 0.95) + vec2(vRest.z * 0.4, 0.0);
      float row = floor(bp.y);
      bp.x += mod(row, 2.0) * 0.5;
      vec2 f = fract(bp);
      float mortar = max(step(f.y, 0.09), step(f.x, 0.05));
      float tone = hash12(vec2(floor(bp.x), row));
      albedo *= mix(0.65 + 0.7 * tone, 0.3, mortar);
    } else if (pattern > 2.5 && pattern < 3.5) {
      // Riveted plates
      vec2 f = fract(vRest.xy / 3.2 + vRest.z * 0.1);
      float seam = max(step(f.x, 0.025), step(f.y, 0.025));
      float rivet = 1.0 - smoothstep(0.035, 0.06, length(f - vec2(0.09)));
      albedo *= 1.0 - seam * 0.5 + rivet * 0.6;
    }
    col = shade(albedo, vWorld, n, haze, fog);
    col = mix(col, haze, fog);
  }
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Backdrop: the smog far away, full screen, drawn where nothing else is */
/* ------------------------------------------------------------------ */

export const backdropVertex = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

export const backdropFragment = /* glsl */ `
uniform float uTime;
uniform float uCamY;
uniform float uAspect;
uniform sampler2D uNoise;
varying vec2 vNdc;
${hazeGLSL}
void main() {
  float y = uCamY - 16.0 + vNdc.y * 85.0;
  vec3 col = hazeColor(y);
  vec2 uv = vec2(vNdc.x * uAspect * 0.32 + uTime * 0.0025, y * 0.0045);
  float smog = texture2D(uNoise, uv).r;
  float smog2 = texture2D(uNoise, uv * 2.4 + vec2(-uTime * 0.004, 0.37)).b;
  float s = smog * 0.65 + smog2 * 0.35;
  col *= 0.45 + 0.8 * s;
  // The furnace lights the smog from below
  float furnace = exp(-max(y - uFurnaceY, 0.0) * 0.016);
  col += uFurnace * furnace * (0.06 + 0.09 * s);
  // Daylight from the grates at the top
  col += uSkyLight * exp(-max(uTopY - y, 0.0) * 0.028) * (0.18 + 0.2 * s);
  // Darker toward the sides
  col *= 1.0 - 0.35 * vNdc.x * vNdc.x;
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Smog banks between the layers (they follow the camera down)          */
/* ------------------------------------------------------------------ */

export const smogVertex = /* glsl */ `
uniform float uCamY;
attribute vec4 aBank; // x: opacity, y: noise scale, z: drift speed, w: seed
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vBank;
void main() {
  vec3 p = position;
  p.y += uCamY;
  vUv = uv;
  vBank = aBank;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const smogFragment = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vBank;
${hazeGLSL}
void main() {
  vec2 uv = vWorld.xy * vBank.y + vec2(uTime * vBank.z + vBank.w, vBank.w * 0.37);
  vec4 n = texture2D(uNoise, uv);
  float density = smoothstep(0.36, 0.9, n.r * 0.75 + n.b * 0.4);
  float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y)
    * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec3 haze = hazeColor(vWorld.y);
  float furnace = exp(-max(vWorld.y - uFurnaceY, 0.0) * 0.03);
  vec3 col = haze * 1.4 + uFurnace * furnace * 0.1;
  gl_FragColor = vec4(col, density * edge * vBank.x);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Light shafts falling through the fan at the top                      */
/* ------------------------------------------------------------------ */

export const shaftVertex = /* glsl */ `
attribute vec2 aShaft; // x: phase, y: strength
varying vec2 vUv;
varying vec2 vShaft;
void main() {
  vUv = uv;
  vShaft = aShaft;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const shaftFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyLight;
varying vec2 vUv;
varying vec2 vShaft;
void main() {
  float across = vUv.x * 2.0 - 1.0;
  float body = exp(-across * across * 3.2);
  float along = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.06, vUv.y);
  // The fan's blades cut through the light (a slow, soft pulse)
  float blades = 0.62 + 0.38 * smoothstep(-0.3, 0.7, sin(uTime * 2.3 + vShaft.x));
  vec3 col = uSkyLight * body * along * blades * vShaft.y;
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Bulb glows (one instanced quad per bulb)                             */
/* ------------------------------------------------------------------ */

export const bulbVertex = /* glsl */ `
uniform float uTime;
attribute vec3 iPos;
attribute vec3 iPivot;
attribute vec4 iMotion;
attribute vec3 iColor;
attribute float iBright;
attribute float iSize;
varying vec2 vUv;
varying vec3 vColor;
varying float vCore;
${motionGLSL}
void main() {
  vec3 p = iPos;
  vec3 n = vec3(0.0, 0.0, 1.0);
  applyMotion(p, n, iPivot, iMotion, uTime);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * iSize;
  vUv = position.xy;
  vColor = iColor * iBright;
  vCore = iSize < 5.0 ? 1.0 : 0.0;
  gl_Position = iBright < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}
`;

export const bulbFragment = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
varying float vCore;
void main() {
  float r2 = dot(vUv, vUv);
  float core = exp(-r2 * 70.0) * 7.0 * vCore;
  float halo = exp(-r2 * (6.0 - 3.5 * (1.0 - vCore))) * (0.55 - 0.3 * (1.0 - vCore)) * max(0.0, 1.0 - r2);
  gl_FragColor = vec4(vColor * (core + halo), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Embers rising from the furnace, ash drifting everywhere              */
/* ------------------------------------------------------------------ */

export const dustVertex = /* glsl */ `
uniform float uTime;
uniform float uCamY;
uniform float uPixel;
attribute vec4 aSeed;
varying float vAlpha;
varying vec3 vColor;
${hazeGLSL}
void main() {
  vec3 p;
  float size;
  if (aSeed.w < 0.4) {
    // Ember: rises from the pool, swaying, cooling down
    float life = fract(aSeed.x * 7.31 + uTime * (0.045 + aSeed.y * 0.06));
    float sway = sin(uTime * (0.6 + aSeed.z) + aSeed.y * 40.0) * 3.0 * life;
    p = vec3((aSeed.x - 0.5) * 110.0 + sway, uFurnaceY + 2.0 + life * 85.0, -18.0 - aSeed.z * 70.0);
    vAlpha = smoothstep(0.0, 0.05, life) * (1.0 - life);
    vColor = mix(vec3(5.0, 1.5, 0.3), vec3(1.6, 0.18, 0.03), life);
    size = 0.32;
  } else {
    // Ash: falls slowly through the whole shaft, around the camera
    float range = 80.0;
    float y = uCamY + 40.0 - mod(aSeed.y * range + uTime * (0.5 + aSeed.x * 0.9), range);
    p = vec3(
      (aSeed.x - 0.5) * 100.0 + sin(uTime * 0.25 + aSeed.z * 20.0) * 2.0,
      y,
      14.0 - aSeed.z * 95.0
    );
    float glow = exp(-max(y - uFurnaceY, 0.0) * 0.03);
    vColor = hazeColor(y) * 2.2 + uFurnace * glow * 0.25 + vec3(0.02);
    vAlpha = 0.5 * smoothstep(0.0, 0.15, fract(aSeed.w * 9.1 + uTime * 0.05));
    size = 0.2;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uPixel * size / max(-mv.z, 1.0), 1.0, 7.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const dustFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.15, 0.5, d)) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Sparks: short streaks thrown by welders, arcs and the crusher        */
/* ------------------------------------------------------------------ */

export const sparkVertex = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform vec4 uEmit[${MAX_EMITTERS}];     // xyz position, w burst start
uniform vec4 uEmitInfo[${MAX_EMITTERS}]; // x duration, y kind, z strength, w direction
attribute vec4 aSeed;
attribute vec2 aCorner; // x: 0 tail / 1 head, y: side
attribute float aEmitter;
varying float vHeat;
varying float vSide;
void main() {
  int e = int(aEmitter + 0.5);
  vec4 E = uEmit[e];
  vec4 I = uEmitInfo[e];
  float kind = I.y;
  float spawn = E.w + aSeed.x * I.x;
  float life = (kind > 2.5 ? 0.5 : 0.35) + aSeed.y * 0.9;
  float age = uTime - spawn;
  vHeat = 0.0;
  vSide = aCorner.y;
  if (age < 0.0 || age > life || I.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float a = aSeed.z * 6.2831853;
  float r = aSeed.w;
  vec3 v;
  if (kind < 0.5) {
    // Welding: a fan of sparks pouring sideways and down
    v = vec3(cos(a) * (1.5 + 5.5 * r), 0.8 + 4.5 * r * r, sin(a) * (1.0 + 3.0 * r));
  } else if (kind < 1.5) {
    // Electric arc: bursts outward in every direction
    v = vec3(cos(a), sin(a) * 0.8 + 0.3, sin(a * 1.7) * 0.6) * (3.0 + 7.0 * r);
  } else if (kind < 2.5) {
    // Crusher impact: flies out flat along the anvil
    float s = aSeed.z < 0.5 ? -1.0 : 1.0;
    v = vec3(s * (4.0 + 8.0 * r), 1.0 + 4.0 * fract(aSeed.x * 13.7), (fract(aSeed.y * 7.1) - 0.5) * 4.0);
  } else {
    // Cut cable / molten spatter: drips and pops
    v = vec3(cos(a) * 1.8 * r, -0.5 + 2.0 * r, sin(a) * 1.2 * r);
  }
  v.x *= I.w;
  vec3 g = vec3(0.0, -21.0, 0.0);
  vec3 head = E.xyz + v * age + 0.5 * g * age * age;
  vec3 vel = v + g * age;
  // A streak: where the spark was a few hundredths of a second ago
  vec3 tail = head - vel * 0.045;
  vec4 ch = projectionMatrix * modelViewMatrix * vec4(head, 1.0);
  vec4 ct = projectionMatrix * modelViewMatrix * vec4(tail, 1.0);
  vec2 sh = ch.xy / ch.w * uResolution * 0.5;
  vec2 st = ct.xy / ct.w * uResolution * 0.5;
  vec2 dir = sh - st;
  float len = length(dir);
  dir = len > 0.01 ? dir / len : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  // At least a few pixels long, so slow sparks still read as streaks
  float minLen = 4.0 * uPixelRatio;
  if (len < minLen) st = sh - dir * minLen;
  bool isHead = aCorner.x > 0.5;
  vec2 px = (isHead ? sh + dir * 1.2 * uPixelRatio : st) + side * aCorner.y * (isHead ? 1.3 : 0.6) * uPixelRatio;
  vec4 c = isHead ? ch : ct;
  c.xy = px / (uResolution * 0.5) * c.w;
  gl_Position = c;
  vHeat = (1.0 - age / life) * I.z;
}
`;

export const sparkFragment = /* glsl */ `
varying float vHeat;
varying float vSide;
void main() {
  float h = clamp(vHeat, 0.0, 1.0);
  vec3 col = mix(vec3(1.4, 0.18, 0.02), vec3(3.0, 1.3, 0.35), smoothstep(0.2, 0.6, h));
  col = mix(col, vec3(5.0, 4.2, 3.0), smoothstep(0.75, 1.0, h));
  float edge = 1.0 - vSide * vSide;
  gl_FragColor = vec4(col * edge * smoothstep(0.0, 0.15, h), 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Electric arcs jumping out of broken junction boxes                   */
/* ------------------------------------------------------------------ */

export const arcVertex = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform vec4 uArcA[${MAX_ARCS}]; // xyz start, w burst start
uniform vec4 uArcB[${MAX_ARCS}]; // xyz end, w burst duration
attribute vec4 aArc; // x: position along (0..1), y: side, z: arc slot, w: strand
varying float vSide;
varying float vGlow;
${hashGLSL}

vec3 arcPoint(vec3 A, vec3 B, float s, float seed, float tick) {
  vec3 d = B - A;
  vec3 perp = normalize(vec3(-d.y, d.x, 0.0) + vec3(0.0001));
  vec3 perp2 = vec3(0.0, 0.0, 1.0);
  float env = sin(3.14159 * s);
  float j = sin(s * 8.0 + hash11(tick + seed) * 6.28) * 0.55
    + sin(s * 21.0 + hash11(tick * 1.7 + seed + 3.1) * 6.28) * 0.28
    + (hash11(floor(s * 11.0) + tick * 3.3 + seed) - 0.5) * 0.5;
  float k = (hash11(tick * 2.3 + seed + 7.7) - 0.5) * 0.6;
  float amp = length(d) * 0.22;
  return mix(A, B, s) + (perp * j + perp2 * k * env) * env * amp;
}

void main() {
  int i = int(aArc.z + 0.5);
  vec4 A = uArcA[i];
  vec4 B = uArcB[i];
  float age = uTime - A.w;
  float tick = floor(uTime * 22.0);
  float strand = aArc.w;
  float seed = aArc.z * 17.0 + strand * 5.3;
  float on = step(0.0, age) * step(age, B.w) * step(0.22 + strand * 0.25, hash11(tick * 0.77 + seed));
  vSide = aArc.y;
  vGlow = on * (strand > 0.5 ? 0.6 : 1.0);
  if (on < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float s = aArc.x;
  float ds = s < 0.98 ? 0.02 : -0.02;
  vec3 p = arcPoint(A.xyz, B.xyz, s, seed, tick);
  vec3 q = arcPoint(A.xyz, B.xyz, s + ds, seed, tick);
  vec4 cp = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vec4 cq = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
  vec2 dir = (cq.xy / cq.w - cp.xy / cp.w) * uResolution * sign(ds);
  dir = length(dir) > 0.001 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 side = vec2(-dir.y, dir.x);
  float width = (strand > 0.5 ? 1.8 : 3.4) * uPixelRatio;
  cp.xy += side * aArc.y * width / uResolution * cp.w;
  gl_Position = cp;
}
`;

export const arcFragment = /* glsl */ `
varying float vSide;
varying float vGlow;
void main() {
  float edge = 1.0 - vSide * vSide;
  vec3 col = mix(vec3(0.55, 0.75, 2.6), vec3(3.4, 3.8, 4.6), edge * edge);
  gl_FragColor = vec4(col * edge * vGlow, 1.0);
  ${outputGLSL}
}
`;

/* ------------------------------------------------------------------ */
/* Painted signs (stencils on metal plates)                            */
/* ------------------------------------------------------------------ */

export const signVertex = /* glsl */ `
uniform float uTime;
attribute vec3 aPivot;
attribute vec4 aMotion;
varying vec3 vWorld;
varying vec2 vUv;
${motionGLSL}
void main() {
  vec3 p = position;
  vec3 n = vec3(0.0, 0.0, 1.0);
  applyMotion(p, n, aPivot, aMotion, uTime);
  vUv = uv;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const signFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform sampler2D uNoise;
varying vec3 vWorld;
varying vec2 vUv;
${hazeGLSL}
${lightsGLSL}
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < 0.5) discard;
  float grime = texture2D(uNoise, vWorld.xy * 0.2).r;
  vec3 albedo = tex.rgb * (0.55 + 0.7 * grime);
  vec3 haze = hazeColor(vWorld.y);
  float fog = hazeAmount(distance(vWorld, cameraPosition));
  vec3 col = shade(albedo, vWorld, vec3(0.0, 0.0, 1.0), haze, fog);
  col = mix(col, haze, fog);
  gl_FragColor = vec4(col, 1.0);
  ${outputGLSL}
}
`;
