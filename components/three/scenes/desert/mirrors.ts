import { BufferAttribute, BufferGeometry, Color, Matrix4, Quaternion, ShaderMaterial, Vector3 } from "three";
import { CAR_POSITION, EYE } from "@/lib/car/cabin";
import { THEMES } from "@/lib/themes";
import { fogGLSL, hashGLSL, outputGLSL } from "../../glsl";
import { type PartBuilder, KIND } from "../../vehicle/builder";
import { LANE_LINE, trafficGLSL } from "./traffic";

/**
 * The car's three mirrors. There is no world behind the camera to reflect
 * (the desert is built looking ahead), so each mirror works out what it would
 * show: it follows the reflected ray from your eye and draws the road, its lines
 * moving away, the grid, the mountains and the sky, the neon gates you just passed
 * and the lights of the cars behind (from the same traffic as the road ahead).
 */

type MirrorSpec = {
  center: Vector3;
  width: number;
  height: number;
  radius: number;
  /** 0 rear-view, 1 left, 2 right */
  kind: number;
  housing: { width: number; height: number; depth: number; radius: number };
};

const MIRRORS: MirrorSpec[] = [
  {
    center: new Vector3(0, 1.295, -0.205),
    width: 0.25,
    height: 0.068,
    radius: 0.022,
    kind: 0,
    housing: { width: 0.272, height: 0.088, depth: 0.03, radius: 0.032 },
  },
  {
    center: new Vector3(-1.0, 0.985, -0.5),
    width: 0.19,
    height: 0.105,
    radius: 0.036,
    kind: 1,
    housing: { width: 0.214, height: 0.13, depth: 0.085, radius: 0.048 },
  },
  {
    center: new Vector3(1.0, 0.985, -0.5),
    width: 0.19,
    height: 0.105,
    radius: 0.036,
    kind: 2,
    housing: { width: 0.214, height: 0.13, depth: 0.085, radius: 0.048 },
  },
];

/** Turns a mirror so the driver sees straight back down the road in it. */
function mirrorFrame(center: Vector3) {
  const toEye = EYE.clone().sub(center).normalize();
  const normal = toEye.add(new Vector3(0, 0, 1)).normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal).normalize();
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal));
  return { normal, up, right, rotation };
}

/** Housings and arms, added to the cabin mesh. */
export function addMirrorHousings(b: PartBuilder) {
  for (const spec of MIRRORS) {
    const f = mirrorFrame(spec.center);
    const h = spec.housing;
    b.paint("#0e0a16", KIND.gloss).roundedSlab(
      spec.center.clone().addScaledVector(f.normal, -0.001),
      f.right,
      f.up,
      h.width,
      h.height,
      h.depth,
      h.radius,
    );
    if (spec.kind === 0) {
      // Stem up to the roof
      b.paint("#0e0a16").beam(new Vector3(0, 1.405, -0.17), spec.center.clone().add(new Vector3(0, 0.02, 0.012)), 0.018, 0.018);
    } else {
      // Arm to the door, and a neon accent on top of the housing
      const side = spec.kind === 1 ? -1 : 1;
      b.paint("#0e0a16").beam(
        new Vector3(side * 0.79, 0.95, -0.56),
        spec.center.clone().add(new Vector3(-side * 0.06, -0.03, -0.03)),
        0.034,
        0.022,
      );
      b.paint(side < 0 ? "#ff3f8e" : "#19f3ff", KIND.neon, 1.8).beam(
        spec.center.clone().addScaledVector(f.up, h.height / 2 + 0.002).addScaledVector(f.right, -h.width * 0.32).addScaledVector(f.normal, -0.03),
        spec.center.clone().addScaledVector(f.up, h.height / 2 + 0.002).addScaledVector(f.right, h.width * 0.32).addScaledVector(f.normal, -0.03),
        0.004,
        0.004,
      );
    }
  }
}

/** The three glass panes in one geometry (each knows which mirror it is). */
export function mirrorGlassGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const kinds: number[] = [];
  const rights: number[] = [];
  const ups: number[] = [];
  const indices: number[] = [];
  for (const spec of MIRRORS) {
    const f = mirrorFrame(spec.center);
    const base = positions.length / 3;
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [sx, sy] of corners) {
      const p = spec.center
        .clone()
        .addScaledVector(f.right, (sx * spec.width) / 2)
        .addScaledVector(f.up, (sy * spec.height) / 2)
        .addScaledVector(f.normal, 0.0015);
      positions.push(p.x, p.y, p.z);
      normals.push(f.normal.x, f.normal.y, f.normal.z);
      uvs.push((sx + 1) / 2, (sy + 1) / 2);
      kinds.push(spec.kind);
      rights.push(f.right.x, f.right.y, f.right.z);
      ups.push(f.up.x, f.up.y, f.up.z);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("aMirror", new BufferAttribute(new Float32Array(kinds), 1));
  g.setAttribute("aRight", new BufferAttribute(new Float32Array(rights), 3));
  g.setAttribute("aUp", new BufferAttribute(new Float32Array(ups), 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

const P = THEMES.desert.palette;

/** The mirror image: see the comment at the top of this file. */
export function createMirrorMaterial(cars: Float32Array) {
  const count = cars.length / 4;
  return new ShaderMaterial({
    uniforms: {
      uTravel: { value: 0 },
      uTime: { value: 0 },
      uDrive: { value: 1 },
      uCarZ: { value: CAR_POSITION.z },
      uCarX: { value: CAR_POSITION.x },
      uCars: { value: cars },
      uColA: { value: new Color(P.a) },
      uColB: { value: new Color(P.b) },
      uSkyTop: { value: new Color(P.sky) },
      uGlow: { value: new Color("#ff3f8e") },
      uFogColor: { value: new Color(P.fog) },
      uFogDensity: { value: THEMES.desert.fogDensity },
    },
    vertexShader: /* glsl */ `
      attribute float aMirror;
      attribute vec3 aRight;
      attribute vec3 aUp;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vRight;
      varying vec3 vUp;
      varying vec2 vUv;
      varying float vMirror;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        mat3 m = mat3(modelMatrix);
        vWorld = w.xyz;
        vNormal = normalize(m * normal);
        vRight = normalize(m * aRight);
        vUp = normalize(m * aUp);
        vUv = uv;
        vMirror = aMirror;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      #define CAR_COUNT ${count}
      ${trafficGLSL}
      ${fogGLSL}
      ${hashGLSL}
      uniform vec4 uCars[CAR_COUNT];
      uniform float uCarX;
      uniform vec3 uColA;
      uniform vec3 uColB;
      uniform vec3 uSkyTop;
      uniform vec3 uGlow;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vRight;
      varying vec3 vUp;
      varying vec2 vUv;
      varying float vMirror;

      // How close a ray passes to a glowing segment, as a soft 0..1 glow
      float segmentGlow(vec3 ro, vec3 rd, vec3 a, vec3 b, float halfWidth) {
        vec3 v = b - a;
        vec3 w0 = ro - a;
        float bv = dot(rd, v);
        float c = dot(v, v);
        float d = dot(rd, w0);
        float e = dot(v, w0);
        float s = clamp((e - d * bv) / max(c - bv * bv, 1e-6), 0.0, 1.0);
        vec3 p = a + v * s;
        float t = dot(p - ro, rd);
        if (t <= 0.5) return 0.0;
        float ang = length(ro + rd * t - p) / t;
        float size = halfWidth / t + 0.0022;
        return exp(-ang * ang / (size * size));
      }

      float pointGlow(vec3 ro, vec3 rd, vec3 p, float radius) {
        vec3 d = p - ro;
        float t = dot(d, rd);
        if (t <= 0.5) return 0.0;
        float ang = length(d - rd * t) / t;
        float size = radius / t + 0.0022;
        return exp(-ang * ang / (size * size));
      }

      // The road and the grid, like the terrain shader
      vec3 ground(vec3 p) {
        float ax = abs(p.x);
        float scrollZ = p.z - uTravel;
        vec2 g = vec2(p.x, scrollZ) / 5.0;
        vec2 fw = max(fwidth(g), vec2(1e-4));
        vec2 gl = abs(fract(g - 0.5) - 0.5) / fw;
        float line = 1.0 - min(min(gl.x, gl.y), 1.0);
        float dense = 1.0 - smoothstep(0.18, 0.7, max(fw.x, fw.y));
        vec3 col = vec3(0.016, 0.006, 0.03) + uColA * line * dense * 2.4 + uColA * (1.0 - dense) * 0.06;
        float road = 1.0 - smoothstep(7.0, 7.6, ax);
        float fx = fwidth(p.x) * 1.5;
        float edge = 1.0 - smoothstep(0.1, 0.1 + fx, abs(ax - 6.7));
        float lane = (1.0 - smoothstep(0.06, 0.06 + fx, abs(ax - ${LANE_LINE.toFixed(2)}))) * step(0.5, fract(scrollZ / 9.0));
        float center = (1.0 - smoothstep(0.08, 0.08 + fx, abs(p.x))) * step(0.45, fract(scrollZ / 5.0));
        vec3 roadCol = vec3(0.01, 0.006, 0.016) + uColB * edge * 3.2 + vec3(1.0, 0.85, 0.75) * lane * 0.7 + uColA * center * 1.8;
        return mix(col, roadCol, road);
      }

      vec3 sky(vec3 rd) {
        float h = rd.y;
        vec3 col = mix(uFogColor, uSkyTop, smoothstep(-0.02, 0.55, h));
        col += uGlow * exp(-abs(h) / 0.07) * 0.38;
        vec2 cell = floor(vec2(atan(rd.x, rd.z), h) * 150.0);
        float star = step(0.992, hash12(cell)) * smoothstep(0.06, 0.2, h);
        col += vec3(1.0, 0.85, 0.95) * star * (0.6 + 0.4 * sin(uTime * 2.0 + hash12(cell + 7.0) * 40.0));
        return col;
      }

      float softBox(vec2 p, vec2 halfSize, float blur) {
        vec2 d = abs(p) - halfSize;
        return 1.0 - smoothstep(-blur, blur, max(d.x, d.y));
      }

      void main() {
        float kind = vMirror;
        vec2 size = kind < 0.5 ? vec2(0.25, 0.068) : vec2(0.19, 0.105);
        float radius = kind < 0.5 ? 0.022 : 0.036;
        vec2 q = (vUv - 0.5) * size;
        vec2 dq = abs(q) - (size * 0.5 - radius);
        float sdf = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - radius;
        if (sdf > 0.0) discard;

        // Reflect the eye's ray off the (slightly convex) glass
        float bulge = kind < 0.5 ? 0.05 : 0.3;
        vec3 n = normalize(normalize(vNormal) + (vUv.x - 0.5) * bulge * vRight + (vUv.y - 0.5) * bulge * vUp);
        vec3 ro = vWorld;
        vec3 rd = reflect(normalize(vWorld - cameraPosition), n);

        // Ground (always computed: screen-space derivatives need every pixel)
        float down = min(rd.y, -1e-4);
        float t = -ro.y / down;
        vec3 hit = ro + rd * t;
        vec3 groundCol = applyFog(ground(hit), t);
        // Our own tail lights tint the road right behind us
        groundCol += vec3(1.0, 0.06, 0.12) * exp(-max(t - 2.0, 0.0) * 0.35) * exp(-(hit.x - uCarX) * (hit.x - uCarX) * 0.8) * 0.12;

        // Sky, and the mountains walling in the valley behind us
        vec3 skyCol = sky(rd);
        float az = atan(rd.x, rd.z);
        float a = abs(az);
        float wall = atan(0.45 * tan(min(a, 1.25))) * (0.8 + 0.2 * sin(az * 37.0 + 1.0) * sin(az * 11.0));
        float mountain = 1.0 - smoothstep(wall - 0.002, wall + 0.002, rd.y);
        float far = 70.0 / max(tan(a), 0.04);
        vec3 rock = applyFog(vec3(0.02, 0.008, 0.035), far);
        rock += mix(uColA, vec3(0.6, 0.36, 1.0), smoothstep(0.0, 0.3, a)) * exp(-abs(rd.y - wall) * 240.0) * (1.0 - fogAmount(far)) * 1.4;
        skyCol = mix(skyCol, rock, mountain);

        vec3 col = rd.y < 0.0 ? groundCol : skyCol;

        // Neon gates we already drove under
        for (int i = 0; i < 9; i++) {
          float offset = mod(float(i) * 70.0 + uTravel, 630.0);
          float z = -560.0 + offset;
          float behind = z - ro.z;
          if (behind < 1.0 || behind > 80.0) continue;
          float fade = 1.0 - smoothstep(590.0, 630.0, offset);
          vec3 tint = mod(float(i), 2.0) < 0.5 ? uColA : uColB;
          float pulse = 0.75 + 0.25 * sin(uTime * 3.0 + float(i) * 1.7);
          float g = segmentGlow(ro, rd, vec3(-9.0, 0.0, z), vec3(-9.0, 13.0, z), 0.16)
            + segmentGlow(ro, rd, vec3(9.0, 0.0, z), vec3(9.0, 13.0, z), 0.16)
            + segmentGlow(ro, rd, vec3(-9.16, 13.0, z), vec3(9.16, 13.0, z), 0.16)
            + segmentGlow(ro, rd, vec3(-7.0, 11.4, z), vec3(7.0, 11.4, z), 0.08);
          col += tint * g * 2.4 * pulse * fade * (1.0 - fogAmount(behind));
        }

        // The cars behind us: headlights of those following, tail lights of those we crossed
        for (int i = 0; i < CAR_COUNT; i++) {
          vec4 car = uCars[i];
          vec2 place = trafficPlace(car);
          float behind = place.x - ro.z;
          if (behind < 3.0 || behind > 260.0) continue;
          float fade = place.y * (1.0 - smoothstep(140.0, 260.0, behind));
          float zl = place.x - 2.25;
          if (car.z > 0.0) {
            float g = pointGlow(ro, rd, vec3(car.x - 0.62, 0.52, zl), 0.07)
              + pointGlow(ro, rd, vec3(car.x + 0.62, 0.52, zl), 0.07);
            col += vec3(1.0, 0.93, 0.82) * g * 2.6 * fade;
          } else {
            float g = segmentGlow(ro, rd, vec3(car.x - 0.78, 0.68, zl), vec3(car.x + 0.78, 0.68, zl), 0.03);
            col += vec3(1.0, 0.08, 0.15) * g * 2.2 * fade;
          }
        }

        if (kind < 0.5) {
          // Rear-view: the rear window, framed by the cabin and two headrests
          vec2 w = vUv - vec2(0.5, 0.56);
          float halfW = 0.44 - w.y * 0.3;
          float open = smoothstep(0.0, 0.03, halfW - abs(w.x)) * smoothstep(-0.36, -0.32, w.y) * smoothstep(0.37, 0.33, w.y);
          float rests = max(softBox(vUv - vec2(0.31, 0.25), vec2(0.07, 0.11), 0.012), softBox(vUv - vec2(0.69, 0.25), vec2(0.07, 0.11), 0.012));
          vec3 cabin = mix(vec3(0.006, 0.003, 0.012), vec3(0.028, 0.011, 0.04), vUv.y);
          col = mix(cabin, col, open * (1.0 - rests));
          // Neon line along the roof edge, reflected
          float rim = (vUv.y - 0.94) * 30.0;
          col += uColA * 0.35 * exp(-rim * rim);
        } else {
          // Side mirrors: our own car's flank along the inner edge
          float inner = kind < 1.5 ? vUv.x : 1.0 - vUv.x;
          float edgeLine = 0.8 + (vUv.y - 0.5) * 0.08;
          float body = smoothstep(edgeLine - 0.012, edgeLine + 0.012, inner);
          vec3 paint = mix(vec3(0.02, 0.008, 0.035), vec3(0.11, 0.045, 0.15), smoothstep(0.1, 0.9, vUv.y));
          vec3 stripe = (kind < 1.5 ? uColA : vec3(0.1, 0.95, 1.0)) * exp(-(vUv.y - 0.4) * (vUv.y - 0.4) * 1296.0) * 1.3;
          col = mix(col, paint + stripe, body);
        }

        // Glass: a touch darker and cooler, a dark rim at the edge
        col = col * 0.86 + vec3(0.006, 0.006, 0.014);
        col = mix(col, vec3(0.008, 0.004, 0.012), smoothstep(-0.0045, -0.0008, sdf));
        gl_FragColor = vec4(col, 1.0);
        ${outputGLSL}
      }
    `,
  });
}
