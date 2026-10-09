"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { lockScroll } from "@/lib/scroll";
import { STORAGE_KEYS, THEMES } from "@/lib/themes";
import { markBooted, onWorldReady } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { LogoMark } from "./Icons";

type Phase = "booting" | "leaving" | "done";

const MIN_FIRST_VISIT = 1900;
const MIN_RETURN_VISIT = 700;
const MAX_WAIT = 6000;
const EXIT_DURATION = 900;

/**
 * The opening sequence: a short boot log while the 3D world compiles,
 * then the screen powers on. Click or press any key to skip.
 */
export function BootScreen() {
  const { theme, t } = useExperience();
  const [phase, setPhase] = useState<Phase>("booting");
  const barRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const leave = useRef<() => void>(() => {});

  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let returning = false;
    try {
      returning = sessionStorage.getItem(STORAGE_KEYS.booted) === "1";
      sessionStorage.setItem(STORAGE_KEYS.booted, "1");
    } catch {
      // ignore storage errors
    }
    root.classList.toggle("is-quick-boot", returning || reduced);
    lockScroll(true);

    const minDuration = reduced ? 150 : returning ? MIN_RETURN_VISIT : MIN_FIRST_VISIT;
    const start = performance.now();
    let ready = false;
    let left = false;
    let frame = 0;
    const timers: number[] = [];

    const finish = () => {
      if (left) return;
      left = true;
      setPhase("leaving");
      root.classList.add("is-booted");
      markBooted();
      lockScroll(false);
      timers.push(window.setTimeout(() => setPhase("done"), reduced ? 200 : EXIT_DURATION));
    };
    leave.current = finish;

    // Progress bar: eases toward 90% until the world reports ready
    const tick = (now: number) => {
      const elapsed = now - start;
      const target = ready ? 1 : 0.9 * (1 - Math.exp(-elapsed / 900));
      const shown = Math.min(target, elapsed / minDuration);
      if (barRef.current) barRef.current.style.transform = `scaleX(${shown})`;
      if (percentRef.current) percentRef.current.textContent = `${Math.round(shown * 100)}%`;
      if (ready && elapsed >= minDuration) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const unsubscribe = onWorldReady(() => {
      ready = true;
    });
    timers.push(
      window.setTimeout(() => {
        ready = true;
      }, MAX_WAIT),
    );

    const skip = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        ["Tab", "Shift", "Alt", "Control", "Meta"].includes(event.key)
      )
        return;
      finish();
    };
    window.addEventListener("keydown", skip);

    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", skip);
      lockScroll(false);
    };
  }, []);

  if (phase === "done") return null;

  const district = THEMES[theme];

  return (
    <div
      className="boot"
      data-phase={phase}
      role="status"
      aria-live="polite"
      onClick={() => leave.current()}
    >
      <div className="boot__half boot__half--top" />
      <div className="boot__half boot__half--bottom" />
      <div className="boot__seam" />
      <div className="boot__panel">
        <div className="boot__brand">
          <LogoMark size={34} />
          <span>bernardo/os</span>
          <span className="boot__version">v2.6</span>
        </div>
        <ol className="boot__log" aria-hidden="true">
          <li style={{ "--line": 0 } as CSSProperties}>
            <span>init neural_link</span>
            <span className="boot__ok">ok</span>
          </li>
          <li style={{ "--line": 1 } as CSSProperties}>
            <span>mount district {district.code.toLowerCase()}</span>
            <span className="boot__ok">ok</span>
          </li>
          <li style={{ "--line": 2 } as CSSProperties}>
            <span>compile shaders</span>
            <span className="boot__ok">ok</span>
          </li>
          <li style={{ "--line": 3 } as CSSProperties}>
            <span>calibrate neon</span>
            <span className="boot__ok">ok</span>
          </li>
        </ol>
        <div className="boot__progress">
          <div className="boot__track">
            <div ref={barRef} className="boot__bar" />
          </div>
          <span ref={percentRef} className="boot__percent">
            0%
          </span>
        </div>
        <button type="button" className="boot__skip" onClick={() => leave.current()}>
          {t.boot.skip}
        </button>
      </div>
    </div>
  );
}
