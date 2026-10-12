/**
 * Everything electrical in the Underworks: failing bulbs, the unstable mains,
 * and the schedules of sparks and arcs. All of it is a pure function of time,
 * so it costs nothing to evaluate and needs no state.
 *
 * Safety: lights that cover a large area never change more than about three
 * times per second. Only small things (arcs, sparks) move faster.
 */

export type Profile = "steady" | "buzz" | "stutter" | "failing" | "dying" | "dead";

export function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/** Brightness of a bulb with the given profile at time t (0..1). */
export function flicker(profile: Profile, seed: number, t: number): number {
  switch (profile) {
    case "steady":
      return hash(Math.floor(t * 3) + seed * 977) < 0.015 ? 0.4 : 1;
    case "buzz": {
      const hum = 0.86 + 0.14 * noise1(t * 2.6 + seed * 50);
      return hash(Math.floor(t * 3) + seed * 131) < 0.05 ? hum * 0.35 : hum;
    }
    case "stutter": {
      // Fine for a while, then catches a few times before settling
      const cycle = 6 + hash(seed * 7) * 6;
      const local = (((t + seed * 37) % cycle) + cycle) % cycle;
      if (local < cycle - 1.3) return 1;
      return hash(Math.floor(t * 3) + seed * 71) < 0.5 ? 0.08 : 1;
    }
    case "failing":
      if (hash(Math.floor(t * 1.2) + seed * 53) > 0.45) return 0.05;
      return hash(Math.floor(t * 3) + seed * 17) < 0.3 ? 0.3 : 0.95;
    case "dying":
      return hash(Math.floor(t * 2) + seed * 29) < 0.1 ? 0.7 : 0.03;
    case "dead":
      return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Mains power: every so often the whole level browns out              */
/* ------------------------------------------------------------------ */

export const BROWNOUT_PERIOD = 21;

function brownoutWindow(k: number) {
  const start = k * BROWNOUT_PERIOD + 8 + hash(k * 3.17) * 8;
  return { start, end: start + 1.3 + hash(k * 5.71) * 1.1 };
}

/** Multiplier for every bulb on the mains (1 = normal). */
export function mainsPower(t: number): number {
  const k = Math.floor(t / BROWNOUT_PERIOD);
  const { start, end } = brownoutWindow(k);
  if (t < start || t > end) return 1;
  const x = t - start;
  const fall = Math.min(1, x / 0.2);
  const rise = Math.min(1, (end - t) / 0.45);
  const level = 1 - 0.78 * Math.min(fall, rise);
  // The supply catches once or twice on the way back
  return hash(Math.floor(x * 3) + k * 13.3) < 0.3 ? Math.min(1, level + 0.4) : level;
}

/** Time of the most recent moment the power came back (for the surge of arcs). */
export function lastRecovery(t: number): number {
  const k = Math.floor(t / BROWNOUT_PERIOD);
  for (let j = k; j >= k - 1; j--) {
    const { end } = brownoutWindow(j);
    if (t >= end) return end;
  }
  return -1e6;
}

/* ------------------------------------------------------------------ */
/* Bursts: welding, arcs, sparking cables                              */
/* ------------------------------------------------------------------ */

export type BurstSpec = {
  /** Length of a scheduling slot; at most one burst per slot */
  slot: number;
  minDuration: number;
  maxDuration: number;
  /** Chance that a slot stays quiet */
  quiet: number;
  seed: number;
};

/** Sparks live at most this long, so bursts never start closer than that. */
export const SPARK_TAIL = 1.5;

export type Burst = { start: number; duration: number };

/** The burst happening now, or the last one (start is far in the past if none). */
export function currentBurst(spec: BurstSpec, t: number, out: Burst): Burst {
  const k = Math.floor(t / spec.slot);
  for (let j = k; j >= k - 1; j--) {
    if (hash(j * 5.3 + spec.seed * 2.1) < spec.quiet) continue;
    const room = Math.max(0, spec.slot - spec.maxDuration - SPARK_TAIL);
    const start = j * spec.slot + hash(j * 7.13 + spec.seed) * room;
    if (t < start) continue;
    out.start = start;
    out.duration =
      spec.minDuration + hash(j * 3.71 + spec.seed * 1.3) * (spec.maxDuration - spec.minDuration);
    return out;
  }
  out.start = -1e6;
  out.duration = 0;
  return out;
}

/* ------------------------------------------------------------------ */
/* Machines (mirrored in the vertex shader, keep both in sync)         */
/* ------------------------------------------------------------------ */

/** Crusher head height (0 = down on the anvil, 1 = fully raised) over one cycle. */
export function crusherHeight(u: number) {
  if (u < 0.45) {
    const k = u / 0.45;
    return k * k * (3 - 2 * k);
  }
  if (u < 0.7) return 1;
  if (u < 0.74) {
    const k = (u - 0.7) / 0.04;
    return 1 - k * k;
  }
  return 0;
}

/** Moment the crusher hits the anvil (the cycle position where it lands). */
export const CRUSHER_IMPACT = 0.74;
