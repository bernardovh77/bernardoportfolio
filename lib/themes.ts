/**
 * The "districts" (sub-themes) the visitor can travel between.
 * Colors here drive both the 3D scenes and the CSS accents
 * (the CSS copies of these values live in app/globals.css).
 */

export const THEME_IDS = ["city", "desert", "ocean", "underworks"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "city";

export type ThemePalette = {
  /** Main neon accent */
  a: string;
  /** Secondary neon accent */
  b: string;
  /** Small highlights (status dots, warnings) */
  signal: string;
  /** Background / sky color at the zenith */
  sky: string;
  /** Fog and horizon color */
  fog: string;
};

export type ThemeConfig = {
  id: ThemeId;
  /** Short district code shown in the HUD */
  code: string;
  /** Made-up coordinates shown in the HUD */
  coords: string;
  palette: ThemePalette;
  /** Exponential fog density for the 3D scene */
  fogDensity: number;
  /** Bloom strength for the 3D scene */
  bloom: number;
};

export const THEMES: Record<ThemeId, ThemeConfig> = {
  city: {
    id: "city",
    code: "D-01",
    coords: "35.6895N 139.6917E",
    palette: {
      a: "#19f3ff",
      b: "#ff2bd1",
      signal: "#ffe94a",
      sky: "#04060f",
      fog: "#0d0b26",
    },
    fogDensity: 0.0055,
    bloom: 1.35,
  },
  desert: {
    id: "desert",
    code: "D-02",
    coords: "36.1147N 115.1728W",
    palette: {
      a: "#ff3f8e",
      b: "#ffa62b",
      signal: "#9a5cff",
      sky: "#06030f",
      fog: "#2a0b35",
    },
    fogDensity: 0.0028,
    bloom: 1.25,
  },
  ocean: {
    id: "ocean",
    code: "D-03",
    coords: "00.0000N 160.0000W",
    palette: {
      a: "#2bffd5",
      b: "#3d7dff",
      signal: "#c9b8ff",
      sky: "#020711",
      fog: "#04142a",
    },
    fogDensity: 0.0062,
    bloom: 1.45,
  },
  // Beneath the Megacity: where unfinished projects are still being built
  underworks: {
    id: "underworks",
    code: "B-04",
    coords: "35.6895N 139.6917E -128M",
    palette: {
      a: "#ffb21f",
      b: "#ff3347",
      signal: "#5ad7ff",
      sky: "#030202",
      fog: "#120c08",
    },
    fogDensity: 0.0105,
    bloom: 1.55,
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export const STORAGE_KEYS = {
  theme: "bp-theme",
  lang: "bp-lang",
  booted: "bp-booted",
} as const;
