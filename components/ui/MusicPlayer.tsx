"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { music as track } from "@/lib/content";
import { localize } from "@/lib/i18n";
import { musicStore, readMusicPreference, saveMusicPreference } from "@/lib/music";
import { world } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { PauseIcon, PlayIcon } from "./Icons";

const FADE_IN = 2.5; // seconds
const FADE_OUT = 0.6; // seconds

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

// Down in the Underworks the music sounds like it comes through the walls
const OPEN_HZ = 20000;
const MUFFLED_HZ = 1500;
let muffled = false;

// Input that can give a page permission to play sound. Phones only grant it
// when the finger lifts, so listening to pointerdown alone isn't enough.
const GESTURES = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

type Graph = {
  context: AudioContext;
  gain: GainNode;
  filter: BiquadFilterNode;
  analyser: AnalyserNode;
  data: Uint8Array<ArrayBuffer>;
  /** First and last analyser bin of each equalizer band */
  bands: (readonly [number, number])[];
};

// An <audio> element can only ever be connected to one Web Audio graph,
// so keep it per element and reuse it if the component re-mounts.
const graphs = new WeakMap<HTMLAudioElement, Graph>();

function getGraph(audio: HTMLAudioElement): Graph | null {
  const existing = graphs.get(audio);
  if (existing) return existing;
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  let context: AudioContext | null = null;
  try {
    context = new AudioContextClass();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    gain.gain.value = 0;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -22;
    analyser.smoothingTimeConstant = 0.7;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    filter.frequency.value = muffled ? MUFFLED_HZ : OPEN_HZ;
    // The analyser passes the sound through unchanged, so placing it first
    // measures the track itself, whatever the volume or the filter.
    source.connect(analyser);
    analyser.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    const binHz = context.sampleRate / analyser.fftSize;
    const last = analyser.frequencyBinCount - 1;
    const bands = BANDS.map(([low, high]) => {
      const start = Math.min(last, Math.max(1, Math.floor(low / binHz)));
      return [start, Math.min(last, Math.max(start, Math.ceil(high / binHz)))] as const;
    });
    const graph = {
      context,
      gain,
      filter,
      analyser,
      data: new Uint8Array(analyser.frequencyBinCount),
      bands,
    };
    graphs.set(audio, graph);
    return graph;
  } catch {
    context?.close().catch(() => {});
    return null;
  }
}

/**
 * Looping background music with a now-playing credit and a live equalizer.
 * Browsers block sound until the visitor interacts, so it starts on the first
 * click, tap or key press, fades in, and remembers if the visitor mutes it.
 */
export function MusicPlayer() {
  const { t, lang, theme } = useExperience();
  const status = useSyncExternalStore(
    musicStore.subscribe,
    musicStore.getSnapshot,
    musicStore.getServerSnapshot,
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track.src) {
      musicStore.setStatus("unavailable");
      return;
    }

    const bars = Array.from(barsRef.current?.children ?? []) as HTMLElement[];
    const probe = new AbortController();
    let graph: Graph | null = null;
    let meterFrame = 0;
    let pauseTimer = 0;
    let request = 0; // the latest play or pause call wins
    let resumeOnShow = false;
    let level = 0;
    let lastFrame = 0;
    const peaks = BANDS.map(() => 0.6);
    const floors = BANDS.map(() => 0.3);

    const rampTo = (value: number, seconds: number) => {
      if (graph) {
        const { context, gain } = graph;
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(value, now + seconds);
      } else {
        audio.volume = Math.min(1, Math.max(0, value));
      }
    };

    const meter = (now: number) => {
      const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      if (graph) {
        const { analyser, data, bands, gain } = graph;
        analyser.getByteFrequencyData(data);
        // Follow the fades, so the bars rise and fall with what you hear
        const audible = Math.min(1, gain.gain.value / Math.max(0.01, track.volume));
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
          if (bar) bar.style.transform = `scaleY(${Math.max(0.12, height).toFixed(3)})`;
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
      graph = graph ?? getGraph(audio);
      // With Web Audio the gain node sets the volume; otherwise the element does
      if (graph) {
        audio.volume = 1;
        graph.context.resume().catch(() => {});
      }
      audio.play().then(
        () => {
          if (id !== request) return;
          stopWaiting();
          rampTo(track.volume, FADE_IN);
          musicStore.setStatus("playing");
          cancelAnimationFrame(meterFrame);
          meterFrame = requestAnimationFrame(meter);
        },
        () => {
          if (id !== request || musicStore.getSnapshot() === "unavailable") return;
          // Still blocked by the browser: try again on the visitor's next click
          musicStore.setStatus("ready");
          waitForGesture();
        },
      );
    };

    const pause = () => {
      request++;
      rampTo(0, FADE_OUT);
      window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => audio.pause(), FADE_OUT * 1000);
      musicStore.setStatus("paused");
      stopMeter();
    };

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
      const wanted = readMusicPreference() === "on";
      musicStore.setStatus(wanted ? "ready" : "paused");
      if (wanted) waitForGesture();
    };
    const onError = () => {
      request++;
      stopWaiting();
      stopMeter();
      musicStore.setStatus("unavailable");
    };

    // Pause while the tab is in the background, fade back in on return
    const onVisibility = () => {
      if (document.hidden) {
        resumeOnShow = musicStore.getSnapshot() === "playing";
        if (!resumeOnShow) return;
        request++;
        window.clearTimeout(pauseTimer);
        rampTo(0, 0.05);
        audio.pause();
        graph?.context.suspend().catch(() => {});
        stopMeter();
      } else if (resumeOnShow) {
        resumeOnShow = false;
        play();
      }
    };

    audio.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onVisibility);

    // Check that the track exists before showing the player. The song itself
    // only downloads once it starts playing.
    fetch(track.src, { method: "HEAD", signal: probe.signal })
      .then((response) => (response.ok ? onReady() : onError()))
      .catch(() => {
        if (!probe.signal.aborted) onError();
      });

    return () => {
      probe.abort();
      request++;
      stopWaiting();
      audio.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(pauseTimer);
      stopMeter();
      audio.pause();
      musicStore.register(null);
      musicStore.setStatus("loading");
    };
  }, []);

  // Muffle the music underground, open it up again on the surface
  useEffect(() => {
    muffled = theme === "underworks";
    const audio = audioRef.current;
    const graph = audio ? graphs.get(audio) : undefined;
    if (!graph) return;
    graph.filter.frequency.setTargetAtTime(
      muffled ? MUFFLED_HZ : OPEN_HZ,
      graph.context.currentTime,
      0.35,
    );
  }, [theme]);

  const playing = status === "playing";
  const label = playing ? t.music.nowPlaying : status === "ready" ? t.music.ready : t.music.paused;
  const name = localize(track.title, lang);
  const artist = localize(track.artist, lang);
  const title = track.link ? (
    <a href={track.link} target="_blank" rel="noreferrer">
      {name}
    </a>
  ) : (
    name
  );

  return (
    <>
      <audio ref={audioRef} src={track.src || undefined} loop preload="none" />
      <aside
        className="music"
        data-status={status}
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
          <span className="music__title">{title}</span>
          {artist && <span className="music__artist">{artist}</span>}
        </span>
      </aside>
    </>
  );
}
