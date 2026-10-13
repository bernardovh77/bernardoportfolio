"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { music as surfaceTrack, type Track, underworksMusic } from "@/lib/content";
import { localize } from "@/lib/i18n";
import { musicStore, readMusicPreference, saveMusicPreference } from "@/lib/music";
import type { ThemeId } from "@/lib/themes";
import { world } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { PauseIcon, PlayIcon } from "./Icons";

const FADE_IN = 2.5; // seconds
const FADE_OUT = 0.6; // seconds
/** How long the two songs overlap when you travel to or from the Underworks */
const CROSSFADE = 3; // seconds

// Equalizer bands in Hz, from bass to treble, one per bar
const BANDS = [
  [40, 140],
  [140, 450],
  [450, 1400],
  [1400, 4500],
  [4500, 14000],
] as const;
// How fast each bar re-adapts to its band's loudest and quietest moments (per second)
const ADAPT = 0.15;
// The Underworks equalizer is a stepped meter with this many segments
const SEGMENTS = 8;

// Input that can give a page permission to play sound. Phones only grant it
// when the finger lifts, so listening to pointerdown alone isn't enough.
const GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

type Slot = "surface" | "underworks";
const TRACKS: Record<Slot, Track> = { surface: surfaceTrack, underworks: underworksMusic };
const SLOTS = Object.keys(TRACKS) as Slot[];
const slotFor = (theme: ThemeId): Slot => (theme === "underworks" ? "underworks" : "surface");

type Graph = {
  context: AudioContext;
  /** Fades the music in and out when it is played or paused */
  master: GainNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  /** First and last analyser bin of each equalizer band */
  bands: (readonly [number, number])[];
  /** Each song has its own volume, used for the cross-fade */
  inputs: Map<HTMLAudioElement, GainNode>;
};

// One audio graph for the whole page (an <audio> element can only ever be
// connected once), reused if the player re-mounts.
let shared: Graph | null = null;

function getGraph(): Graph | null {
  if (shared) return shared;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContextClass();
    const master = context.createGain();
    master.gain.value = 0;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -22;
    analyser.smoothingTimeConstant = 0.7;
    // The analyser sits before the master gain, so it measures the songs
    // themselves (already mixed by the cross-fade), whatever the volume.
    analyser.connect(master);
    master.connect(context.destination);
    const binHz = context.sampleRate / analyser.fftSize;
    const last = analyser.frequencyBinCount - 1;
    const bands = BANDS.map(([low, high]) => {
      const start = Math.min(last, Math.max(1, Math.floor(low / binHz)));
      return [start, Math.min(last, Math.max(start, Math.ceil(high / binHz)))] as const;
    });
    shared = {
      context,
      master,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
      bands,
      inputs: new Map(),
    };
    return shared;
  } catch {
    context?.close().catch(() => {});
    return null;
  }
}

/** The gain node a song plays through, connecting it the first time. */
function inputFor(graph: Graph, audio: HTMLAudioElement): GainNode | null {
  const existing = graph.inputs.get(audio);
  if (existing) return existing;
  try {
    const source = graph.context.createMediaElementSource(audio);
    const gain = graph.context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(graph.analyser);
    graph.inputs.set(audio, gain);
    return gain;
  } catch {
    return null;
  }
}

/**
 * Resolves true once the audio graph is running, false if the browser keeps it
 * suspended (some only let it start after the visitor's first click).
 */
function whenRunning(context: AudioContext, timeout = 800): Promise<boolean> {
  if (context.state === "running") return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(context.state === "running"), timeout);
    context.resume().then(
      () => {
        window.clearTimeout(timer);
        resolve(context.state === "running");
      },
      () => {
        window.clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

/**
 * Whether the page may start sound on its own. Only some browsers (Firefox) can
 * say so up front; the others answer when we try to play.
 */
function soundMayAutoplay() {
  const nav = navigator as Navigator & { getAutoplayPolicy?: (type: "mediaelement") => string };
  try {
    return typeof nav.getAutoplayPolicy !== "function" || nav.getAutoplayPolicy("mediaelement") === "allowed";
  } catch {
    return true;
  }
}

function rampParam(context: AudioContext, param: AudioParam, value: number, seconds: number) {
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

// Without Web Audio, fade the elements' own volume instead
const volumeFades = new WeakMap<HTMLAudioElement, number>();
function fadeVolume(audio: HTMLAudioElement, value: number, seconds: number) {
  cancelAnimationFrame(volumeFades.get(audio) ?? 0);
  const from = audio.volume;
  const start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / (seconds * 1000));
    audio.volume = Math.min(1, Math.max(0, from + (value - from) * k));
    if (k < 1) volumeFades.set(audio, requestAnimationFrame(step));
  };
  volumeFades.set(audio, requestAnimationFrame(step));
}

type Controller = { setSlot: (slot: Slot) => void };

/**
 * Looping background music with a now-playing credit and a live equalizer.
 * The surface and the Underworks each have their own song, which cross-fade
 * as soon as you start traveling. It starts as soon as the page opens where the
 * browser allows it; browsers that block sound until the visitor interacts get it
 * on the first click, tap or key press instead. It fades in, and remembers if the
 * visitor mutes it.
 */
export function MusicPlayer() {
  const { t, lang, theme, traveling } = useExperience();
  const status = useSyncExternalStore(
    musicStore.subscribe,
    musicStore.getSnapshot,
    musicStore.getServerSnapshot,
  );
  const surfaceRef = useRef<HTMLAudioElement>(null);
  const underworksRef = useRef<HTMLAudioElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const barsRef = useRef<HTMLSpanElement>(null);
  const controllerRef = useRef<Controller | null>(null);

  useEffect(() => {
    const elements: Record<Slot, HTMLAudioElement | null> = {
      surface: surfaceRef.current,
      underworks: underworksRef.current,
    };
    const main = elements.surface;
    if (!main || !surfaceTrack.src) {
      musicStore.setStatus("unavailable");
      return;
    }

    const bars = Array.from(barsRef.current?.children ?? []) as HTMLElement[];
    const probe = new AbortController();
    const available: Record<Slot, boolean> = {
      surface: true,
      underworks: Boolean(underworksMusic.src && elements.underworks),
    };
    let graph: Graph | null = null;
    let active: Slot = "surface";
    let meterFrame = 0;
    let pauseTimer = 0;
    let request = 0; // the latest play or pause call wins
    let swap = 0; // the latest cross-fade wins
    let resumeOnShow = false;
    let autoplayOnShow = false;
    let level = 0;
    let lastFrame = 0;
    const peaks = BANDS.map(() => 0.6);
    const floors = BANDS.map(() => 0.3);
    const switchTimers: number[] = [];

    const audioOf = (slot: Slot) => elements[slot] ?? main;
    const showCredit = () => {
      if (panelRef.current) panelRef.current.dataset.track = active;
    };

    // Sets a song's level: through its gain node, or its own volume as a fallback
    const setLevel = (slot: Slot, value: number, seconds: number) => {
      const audio = audioOf(slot);
      const input = graph ? inputFor(graph, audio) : null;
      if (graph && input) {
        rampParam(graph.context, input.gain, value, seconds);
      } else {
        fadeVolume(audio, value, seconds);
      }
    };
    const setMaster = (value: number, seconds: number) => {
      if (graph) {
        rampParam(graph.context, graph.master.gain, value, seconds);
      } else {
        // No Web Audio: the active song's volume is the master
        fadeVolume(audioOf(active), value * TRACKS[active].volume, seconds);
      }
    };

    const meter = (now: number) => {
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      if (graph) {
        const { analyser, data, bands, master } = graph;
        analyser.getByteFrequencyData(data);
        // Follow the fades, so the bars rise and fall with what you hear
        const audible = Math.min(1, master.gain.value);
        bands.forEach(([start, end], i) => {
          let sum = 0;
          for (let bin = start; bin <= end; bin++) sum += data[bin];
          const value = sum / ((end - start + 1) * 255);
          // Each bar scales to its own band's recent range, so bass-heavy
          // and bright tracks both use the full height
          peaks[i] = Math.max(value, peaks[i] - ADAPT * dt);
          floors[i] = Math.min(value, floors[i] + ADAPT * dt);
          const range = Math.max(0.12, peaks[i] - floors[i]);
          const height = Math.min(1, Math.max(0, (value - floors[i]) / range)) * audible;
          const bar = bars[i];
          if (bar) {
            bar.style.transform = `scaleY(${Math.max(0.12, height).toFixed(3)})`;
            // The stepped meter (Underworks) lights whole segments
            bar.style.setProperty("--level", String(Math.ceil(height * SEGMENTS) / SEGMENTS));
          }
          if (i === 0) {
            // The neon pulse jumps on a kick and fades out more slowly
            const kick = height * height;
            const rate = kick > level ? 30 : 5;
            level += (kick - level) * (1 - Math.exp(-rate * dt));
            world.audioLevel = level;
          }
        });
      }
      meterFrame = requestAnimationFrame(meter);
    };

    const stopMeter = () => {
      cancelAnimationFrame(meterFrame);
      lastFrame = 0;
      level = 0;
      world.audioLevel = 0;
      bars.forEach((bar) => {
        bar.style.transform = "";
        bar.style.removeProperty("--level");
      });
    };

    const onGesture = (event: Event) => {
      // The music button handles its own clicks
      if (event.target instanceof Element && event.target.closest("[data-music-toggle]")) return;
      if (readMusicPreference() === "off" || musicStore.getSnapshot() === "playing") {
        stopWaiting();
        return;
      }
      // Skip events the browser doesn't count as permission (a finger going down)
      if (navigator.userActivation && !navigator.userActivation.isActive) return;
      play();
    };
    const waitForGesture = () => {
      GESTURES.forEach((type) => window.addEventListener(type, onGesture, true));
    };
    const stopWaiting = () => {
      GESTURES.forEach((type) => window.removeEventListener(type, onGesture, true));
    };

    const play = () => {
      const id = ++request;
      window.clearTimeout(pauseTimer);
      graph = graph ?? getGraph();
      const slot = active;
      const audio = audioOf(slot);
      if (graph) {
        // With Web Audio the gain nodes set the volume; otherwise the element does
        SLOTS.forEach((s) => {
          const input = inputFor(graph as Graph, audioOf(s));
          if (input) audioOf(s).volume = 1;
          if (input && s !== slot) input.gain.value = 0;
        });
        graph.context.resume().catch(() => {});
      } else {
        audio.volume = 0;
      }
      // Still blocked by the browser: try again on the visitor's next click
      const blocked = () => {
        if (id !== request || musicStore.getSnapshot() === "unavailable") return;
        musicStore.setStatus("ready");
        waitForGesture();
      };
      audio
        .play()
        .then(() => (graph ? whenRunning(graph.context) : true))
        .then((running) => {
          if (id !== request) return;
          if (!running) {
            // The song started but the browser keeps the sound off until a click
            audio.pause();
            blocked();
            return;
          }
          stopWaiting();
          if (graph) setLevel(slot, TRACKS[slot].volume, 0.01);
          setMaster(1, FADE_IN);
          musicStore.setStatus("playing");
          cancelAnimationFrame(meterFrame);
          meterFrame = requestAnimationFrame(meter);
        }, blocked);
    };

    // Without a click yet: ask the browser first with the song silent and not wired
    // to Web Audio, so a refusal leaves nothing behind, and only then start it for real
    const autoplay = () => {
      if (!soundMayAutoplay()) {
        musicStore.setStatus("ready");
        return;
      }
      const id = ++request;
      const audio = audioOf(active);
      audio.volume = 0;
      audio.play().then(
        () => {
          if (id === request) play();
          // Paused in the meantime (from the terminal): don't leave the silent song running
          else if (musicStore.getSnapshot() === "paused") audio.pause();
        },
        () => {
          if (id !== request || musicStore.getSnapshot() === "unavailable") return;
          musicStore.setStatus("ready");
        },
      );
    };

    const pause = () => {
      request++;
      swap++;
      setMaster(0, FADE_OUT);
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => {
        SLOTS.forEach((s) => audioOf(s).pause());
      }, FADE_OUT * 1000);
      musicStore.setStatus("paused");
      stopMeter();
    };

    // Travel between the surface and the Underworks: cross-fade the two songs.
    // Each song keeps its place, so coming back picks up where it left off.
    const setSlot = (wanted: Slot) => {
      const next = available[wanted] ? wanted : "surface";
      if (next === active) return;
      const from = active;
      active = next;
      showCredit();
      if (musicStore.getSnapshot() !== "playing") return;
      const id = ++swap;
      const incoming = audioOf(next);
      const outgoing = audioOf(from);
      if (incoming === outgoing) return;
      if (graph) inputFor(graph, incoming);
      if (graph) incoming.volume = 1;
      else incoming.volume = 0;
      incoming.play().then(
        () => {
          if (id !== swap) return;
          setLevel(next, TRACKS[next].volume, CROSSFADE);
          setLevel(from, 0, CROSSFADE);
          switchTimers.push(
            window.setTimeout(
              () => {
                if (active !== from) outgoing.pause();
              },
              CROSSFADE * 1000 + 100,
            ),
          );
        },
        () => {
          // Could not start the new song: stay on the old one
          if (id !== swap) return;
          active = from;
          showCredit();
        },
      );
    };

    controllerRef.current = { setSlot };

    musicStore.register({
      play: () => {
        saveMusicPreference("on");
        play();
      },
      pause: () => {
        saveMusicPreference("off");
        pause();
      },
    });

    const onReady = () => {
      if (musicStore.getSnapshot() !== "loading") return;
      if (readMusicPreference() === "off") {
        musicStore.setStatus("paused");
        return;
      }
      // Start right away where the browser lets a page play sound on its own
      // (the player shows up once it plays), and otherwise on the visitor's
      // first click, tap or key press
      waitForGesture();
      if (document.hidden) {
        // Opened in a background tab: try once the visitor switches to it
        autoplayOnShow = true;
        musicStore.setStatus("ready");
      } else {
        autoplay();
      }
    };
    const onError = () => {
      request++;
      stopWaiting();
      stopMeter();
      musicStore.setStatus("unavailable");
    };
    // If the Underworks song is missing, the main song keeps playing down there
    const onUnderworksError = () => {
      available.underworks = false;
      if (active === "underworks") {
        active = "surface";
        showCredit();
        if (musicStore.getSnapshot() === "playing") play();
      }
    };

    // Pause while the tab is in the background, fade back in on return
    const onVisibility = () => {
      if (document.hidden) {
        resumeOnShow = musicStore.getSnapshot() === "playing";
        if (!resumeOnShow) return;
        request++;
        swap++;
        window.clearTimeout(pauseTimer);
        setMaster(0, 0.05);
        SLOTS.forEach((s) => audioOf(s).pause());
        graph?.context.suspend().catch(() => {});
        stopMeter();
      } else if (resumeOnShow) {
        resumeOnShow = false;
        play();
      } else if (autoplayOnShow) {
        autoplayOnShow = false;
        if (musicStore.getSnapshot() === "ready" && readMusicPreference() === "on") autoplay();
      }
    };

    main.addEventListener("error", onError);
    elements.underworks?.addEventListener("error", onUnderworksError);
    document.addEventListener("visibilitychange", onVisibility);

    // Check that the songs exist before showing the player. The songs
    // themselves only download once they start playing.
    fetch(surfaceTrack.src, { method: "HEAD", signal: probe.signal })
      .then((response) => (response.ok ? onReady() : onError()))
      .catch(() => {
        if (!probe.signal.aborted) onError();
      });
    if (available.underworks) {
      fetch(underworksMusic.src, { method: "HEAD", signal: probe.signal })
        .then((response) => {
          if (!response.ok) onUnderworksError();
        })
        .catch(() => {
          if (!probe.signal.aborted) onUnderworksError();
        });
    }

    return () => {
      probe.abort();
      request++;
      swap++;
      controllerRef.current = null;
      stopWaiting();
      main.removeEventListener("error", onError);
      elements.underworks?.removeEventListener("error", onUnderworksError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(pauseTimer);
      switchTimers.forEach((id) => window.clearTimeout(id));
      stopMeter();
      SLOTS.forEach((s) => audioOf(s).pause());
      musicStore.register(null);
      musicStore.setStatus("loading");
    };
  }, []);

  // The song follows the district, and changes as soon as a travel starts
  const wanted = slotFor(traveling ?? theme);
  useEffect(() => {
    controllerRef.current?.setSlot(wanted);
  }, [wanted]);

  const playing = status === "playing";
  const label = playing ? t.music.nowPlaying : status === "ready" ? t.music.ready : t.music.paused;

  return (
    <>
      <audio ref={surfaceRef} src={surfaceTrack.src || undefined} loop preload="none" />
      <audio ref={underworksRef} src={underworksMusic.src || undefined} loop preload="none" />
      <aside
        ref={panelRef}
        className="music"
        data-status={status}
        data-track="surface"
        hidden={status === "loading" || status === "unavailable"}
        aria-label={t.music.nowPlaying}
      >
        <button
          type="button"
          className="music__toggle"
          data-music-toggle
          onClick={() => musicStore.toggle()}
          aria-label={playing ? t.music.pause : t.music.play}
        >
          {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <span ref={barsRef} className="music__eq" aria-hidden="true">
          {BANDS.map((_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="music__meta">
          <span className="music__label">{label}</span>
          {SLOTS.map((slot) => {
            const track = TRACKS[slot];
            const name = localize(track.title, lang);
            const artist = localize(track.artist, lang);
            return (
              <span key={slot} className="music__credit" data-for={slot}>
                <span className="music__title">
                  {track.link ? (
                    <a href={track.link} target="_blank" rel="noreferrer">
                      {name}
                    </a>
                  ) : (
                    name
                  )}
                </span>
                {artist && <span className="music__artist">{artist}</span>}
              </span>
            );
          })}
        </span>
      </aside>
    </>
  );
}
