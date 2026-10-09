"use client";

import { useEffect, useRef } from "react";
import { onScrollProgress } from "@/lib/scroll";
import { THEMES } from "@/lib/themes";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { SECTION_IDS } from "./TopBar";

/** Bottom-left readout: current district, its coordinates and the visitor's local time. */
export function HudReadout() {
  const { theme, t, lang } = useExperience();
  const clockRef = useRef<HTMLTimeElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const config = THEMES[theme];

  // Live frame rate, averaged over half a second
  useEffect(() => {
    let frame = 0;
    let count = 0;
    let last = performance.now();
    const loop = (now: number) => {
      count++;
      if (now - last >= 500) {
        if (fpsRef.current)
          fpsRef.current.textContent = String(Math.round((count * 1000) / (now - last)));
        count = 0;
        last = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const el = clockRef.current;
    if (!el) return;
    const format = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const update = () => {
      const now = new Date();
      el.textContent = format.format(now);
      el.dateTime = now.toISOString();
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [lang]);

  return (
    <aside className="hud-readout" aria-label={t.hud.district}>
      <p className="hud-readout__district">
        <span className="hud-readout__code">{config.code}</span>
        <span className="hud-readout__name">{t.themes[theme].name}</span>
      </p>
      <p className="hud-readout__coords">{config.coords}</p>
      <p className="hud-readout__time">
        <span className="hud-readout__label">FPS</span>
        <span ref={fpsRef} className="hud-readout__fps">
          --
        </span>
        <span className="hud-readout__label">{t.hud.localTime}</span>
        <time ref={clockRef} suppressHydrationWarning>
          --:--:--
        </time>
      </p>
    </aside>
  );
}

/** Right-edge depth gauge showing how far down the page you are. */
export function DepthMeter() {
  const { t } = useExperience();
  const fillRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const ticksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = (progress: number) => {
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${progress})`;
      if (valueRef.current)
        valueRef.current.textContent = String(Math.round(progress * 100)).padStart(3, "0");
    };
    const placeTicks = () => {
      const container = ticksRef.current;
      if (!container) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      container.querySelectorAll<HTMLElement>("[data-tick]").forEach((tick) => {
        const section = document.getElementById(tick.dataset.tick ?? "");
        if (!section) return;
        const top = section.getBoundingClientRect().top + window.scrollY - 72;
        tick.style.top = `${Math.min(100, Math.max(0, (top / max) * 100))}%`;
      });
    };
    placeTicks();
    const resize = new ResizeObserver(placeTicks);
    resize.observe(document.body);
    const unsubscribe = onScrollProgress((progress) => update(progress));
    return () => {
      unsubscribe();
      resize.disconnect();
    };
  }, []);

  return (
    <div className="depth" aria-hidden="true">
      <span className="depth__label">{t.hud.depth}</span>
      <div className="depth__rail">
        <div ref={fillRef} className="depth__fill" />
        <div ref={ticksRef} className="depth__ticks">
          {SECTION_IDS.map((id) => (
            <span key={id} data-tick={id} className="depth__tick" />
          ))}
        </div>
      </div>
      <span ref={valueRef} className="depth__value">
        000
      </span>
    </div>
  );
}
