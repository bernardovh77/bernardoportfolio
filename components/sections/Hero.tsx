"use client";

import type { CSSProperties } from "react";
import { profile } from "@/lib/content";
import { createRandom } from "@/lib/random";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ArrowDownIcon } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";

// Each letter of the name lights up like a neon tube, with its own timing
const rnd = createRandom(11);
const LETTERS = Array.from(profile.name.toUpperCase()).map((char, index) => ({
  char,
  delay: 0.15 + index * 0.07 + rnd.range(0, 0.35),
  flicker: rnd.chance(0.25),
}));

export function Hero() {
  const { t, lang } = useExperience();

  return (
    <section id="top" className="hero" aria-labelledby="hero-title">
      <div className="hero__inner">
        <p className="hero__status">
          <span className="pulse-dot" aria-hidden="true" />
          {profile.status[lang]}
        </p>

        <h1 id="hero-title" className="hero__name">
          <span className="sr-only">{profile.name}</span>
          <span className="neon-word" aria-hidden="true">
            {LETTERS.map((letter, index) => (
              <span
                key={index}
                className="neon-letter"
                data-flicker={letter.flicker || undefined}
                style={{ "--delay": `${letter.delay}s` } as CSSProperties}
              >
                {letter.char}
              </span>
            ))}
          </span>
        </h1>

        <ScrambleText
          as="p"
          className="hero__role"
          text={profile.role[lang]}
          trigger="boot"
          delay={700}
          duration={900}
        />
        <p className="hero__intro">{profile.intro[lang]}</p>

        <div className="hero__actions">
          <a className="btn btn--primary" href="#work">
            <span>{t.hero.primaryCta}</span>
          </a>
          <a className="btn btn--ghost" href="#contact">
            <span>{t.hero.secondaryCta}</span>
          </a>
        </div>
      </div>

      <a className="hero__scroll" href="#about">
        <ArrowDownIcon size={16} />
        <span>{t.hero.scroll}</span>
      </a>
    </section>
  );
}
