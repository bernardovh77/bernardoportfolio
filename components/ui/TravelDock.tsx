"use client";

import { THEME_IDS, THEMES } from "@/lib/themes";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { DistrictIcon } from "./Icons";

/** The district switcher. Each button travels to a different 3D landscape. */
export function TravelDock() {
  const { theme, traveling, travelTo, t } = useExperience();
  const target = traveling ?? theme;

  return (
    <nav className="dock" aria-label={t.hud.travel}>
      <p className="dock__label" id="dock-label">
        {t.hud.travel}
        <span className="dock__hint">{t.hud.shortcut}</span>
      </p>
      <ul className="dock__list" aria-labelledby="dock-label">
        {THEME_IDS.map((id, index) => {
          const info = t.themes[id];
          const selected = target === id;
          return (
            <li key={id}>
              <button
                type="button"
                className="dock__item"
                data-district={id}
                aria-pressed={selected}
                disabled={Boolean(traveling)}
                onClick={() => travelTo(id)}
              >
                <span className="dock__icon">
                  <DistrictIcon theme={id} size={20} />
                </span>
                <span className="dock__text">
                  <span className="dock__name">{info.name}</span>
                  <span className="dock__code">
                    {THEMES[id].code}
                    <kbd>{index + 1}</kbd>
                  </span>
                </span>
                <span className="dock__tooltip" role="presentation">
                  {info.tagline}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
