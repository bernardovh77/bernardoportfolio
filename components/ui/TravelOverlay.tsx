"use client";

import type { CSSProperties } from "react";
import { createRandom } from "@/lib/random";
import { THEMES } from "@/lib/themes";
import { TRAVEL_DURATION } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ScrambleText } from "./ScrambleText";

// Fixed glitch bands so the overlay renders the same on server and client
const rnd = createRandom(99);
const BANDS = Array.from({ length: 9 }, (_, i) => ({
  top: i * 11 + rnd.range(-2, 2),
  height: rnd.range(4, 13),
  shift: rnd.range(-14, 14),
  delay: rnd.range(0, 0.25),
}));

/** The full-screen glitch shown while travelling between districts. */
export function TravelOverlay() {
  const { traveling, travelOrigin, t } = useExperience();
  if (!traveling) return null;
  const info = t.themes[traveling];
  const config = THEMES[traveling];
  // Going down into the Underworks, or climbing back out of it
  const label =
    traveling === "underworks"
      ? t.hud.descending
      : travelOrigin === "underworks"
        ? t.hud.surfacing
        : t.hud.traveling;

  return (
    <div
      className="travel"
      data-district={traveling}
      style={{ "--travel-duration": `${TRAVEL_DURATION}ms` } as CSSProperties}
      role="status"
      aria-live="assertive"
    >
      <div className="travel__bands" aria-hidden="true">
        {BANDS.map((band, i) => (
          <span
            key={i}
            style={
              {
                "--top": `${band.top}%`,
                "--h": `${band.height}%`,
                "--shift": `${band.shift}vw`,
                "--delay": `${band.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="travel__center">
        <p className="travel__label">
          {label} <span className="travel__code">{config.code}</span>
        </p>
        <ScrambleText
          as="p"
          className="travel__name"
          text={info.name}
          trigger="mount"
          duration={420}
        />
        <p className="travel__tagline">{info.tagline}</p>
        <div className="travel__progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
