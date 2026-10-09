/**
 * Background music state, shared by the player widget and the terminal.
 * The player registers its play/pause functions here; anything else can
 * read the status or ask it to toggle.
 */

export type MusicStatus =
  /** Checking whether the track file exists */
  | "loading"
  /** No track (file missing or failed to load): the player hides itself */
  | "unavailable"
  /** Ready, waiting for the visitor's first click or key press */
  | "ready"
  | "playing"
  | "paused";

type Controls = { play: () => void; pause: () => void };

let status: MusicStatus = "loading";
let controls: Controls | null = null;
const listeners = new Set<() => void>();

export const MUSIC_STORAGE_KEY = "bp-music";

export const musicStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): MusicStatus {
    return status;
  },
  getServerSnapshot(): MusicStatus {
    return "loading";
  },
  setStatus(next: MusicStatus) {
    if (next === status) return;
    status = next;
    listeners.forEach((listener) => listener());
  },
  register(next: Controls | null) {
    controls = next;
  },
  play() {
    controls?.play();
  },
  pause() {
    controls?.pause();
  },
  /** Returns true if the music will be playing after the call. */
  toggle(): boolean {
    if (!controls || status === "unavailable" || status === "loading") return false;
    if (status === "playing") {
      controls.pause();
      return false;
    }
    controls.play();
    return true;
  },
};

/** Whether the visitor turned the music off on a previous visit. */
export function readMusicPreference(): "on" | "off" {
  try {
    return localStorage.getItem(MUSIC_STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    return "on";
  }
}

export function saveMusicPreference(value: "on" | "off") {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, value);
  } catch {
    // Storage unavailable (private mode): the choice still applies for this visit.
  }
}
