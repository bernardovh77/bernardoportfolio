"use client";

import { enterCar } from "@/lib/drive";
import { useExperience } from "@/components/experience/ExperienceProvider";

/**
 * A small highway sign by the road in the Synth Desert.
 * Easy to miss on purpose: clicking it puts you in one of the cars.
 */
export function HitchSign() {
  const { t, theme, traveling } = useExperience();
  if (theme !== "desert") return null;

  return (
    <button
      type="button"
      className="hitch"
      onClick={() => enterCar()}
      disabled={traveling !== null}
      aria-label={t.drive.signLabel}
    >
      <span className="hitch__plate">
        <span className="hitch__exit">{t.drive.sign}</span>
        <svg className="hitch__icon" viewBox="0 0 40 12" aria-hidden="true">
          <path d="M3 9.5h2.2a2 2 0 0 1 3.6 0h9.4a2 2 0 0 1 3.6 0H23v-3l-2.6-.6-2.8-2.6H9.4L6.6 5.9 3 6.6z" />
          <path d="M27 6.5h9m-3-3 3 3-3 3" fill="none" />
        </svg>
      </span>
      <span className="hitch__posts" aria-hidden="true" />
      <span className="hitch__tip" aria-hidden="true">
        {t.drive.signTip}
      </span>
    </button>
  );
}
