"use client";

import { type CSSProperties, useRef } from "react";
import { skillGroups, type Tier } from "@/lib/content";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ScrambleText } from "@/components/ui/ScrambleText";

function TierMeter({ tier }: { tier: Tier }) {
  return (
    <span className="tier" data-tier={tier} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Skills() {
  const { t, lang } = useExperience();
  const gridRef = useRef<HTMLDivElement>(null);
  useInViewOnce(gridRef, 0.15);

  return (
    <section id="skills" className="section loadout" aria-labelledby="skills-title">
      <div className="container">
        <header className="section-head">
          <ScrambleText as="h2" id="skills-title" className="section-title" text={t.skills.title} />
          <p className="section-intro">{t.skills.intro}</p>
          <ul className="tier-legend" aria-label={t.skills.legend}>
            {([3, 2, 1] as Tier[]).map((tier) => (
              <li key={tier}>
                <TierMeter tier={tier} />
                <span>{t.skills.tiers[tier - 1]}</span>
              </li>
            ))}
          </ul>
        </header>

        <div ref={gridRef} className="loadout__grid">
          {skillGroups.map((group) => (
            <div key={group.id} className="loadout__group">
              <h3 className="loadout__title">{group.title[lang]}</h3>
              <ul className="loadout__list">
                {group.skills.map((skill, index) => (
                  <li key={skill.name} className="slot" style={{ "--i": index } as CSSProperties}>
                    <span className="slot__name">{skill.name}</span>
                    <TierMeter tier={skill.tier} />
                    <span className="sr-only">
                      {t.skills.legend}: {t.skills.tiers[skill.tier - 1]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
