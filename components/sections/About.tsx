"use client";

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { profile } from "@/lib/content";
import { THEMES } from "@/lib/themes";
import { useFinePointer, useReducedMotion } from "@/lib/hooks";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ScrambleText } from "@/components/ui/ScrambleText";

/** Placeholder portrait: a holographic bust. Swap it for a real photo later. */
function Avatar() {
  return (
    <svg className="id-card__avatar" viewBox="0 0 120 140" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="avatar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--a)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--b)" stopOpacity="0.15" />
        </linearGradient>
        <pattern id="avatar-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.4" fill="var(--void)" opacity="0.55" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="120" height="140" fill="var(--abyss)" />
      <path
        d="M60 26c13 0 22 10 22 24 0 11-5 20-11 24v6c14 3 29 12 33 30H16c4-18 19-27 33-30v-6c-6-4-11-13-11-24 0-14 9-24 22-24z"
        fill="url(#avatar-fill)"
        stroke="var(--a)"
        strokeWidth="1.2"
      />
      <path d="M38 50h44M40 58h40" stroke="var(--a)" strokeOpacity="0.35" strokeWidth="0.8" />
      <rect x="0" y="0" width="120" height="140" fill="url(#avatar-scan)" />
      <path
        d="M2 2h14M2 2v14M118 2h-14M118 2v14M2 138h14M2 138v-14M118 138h-14M118 138v-14"
        stroke="var(--a)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A cyberpunk ID card that tilts toward the cursor and shimmers like a hologram. */
function IdCard() {
  const { t, lang, theme } = useExperience();
  const cardRef = useRef<HTMLDivElement>(null);
  const finePointer = useFinePointer();
  const reduced = useReducedMotion();
  const interactive = finePointer && !reduced;

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || !interactive) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--mx", `${x * 100}%`);
    card.style.setProperty("--my", `${y * 100}%`);
    card.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    card.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
    card.dataset.hover = "true";
  };

  const onLeave = () => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
    delete card.dataset.hover;
  };

  const rows = [
    { label: t.about.card.name, value: profile.name },
    { label: t.about.card.role, value: profile.role[lang] },
    { label: t.about.card.base, value: profile.base[lang] },
    { label: t.about.card.languages, value: profile.languages[lang] },
  ];

  return (
    <div className="id-card-wrap">
      <div ref={cardRef} className="id-card" onPointerMove={onMove} onPointerLeave={onLeave}>
        <div className="id-card__header">
          <span className="id-card__title">{t.about.card.id}</span>
          <span className="id-card__code">{THEMES[theme].code}</span>
        </div>
        <div className="id-card__body">
          <Avatar />
          <dl className="id-card__fields">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="id-card__focus">
          <span>{t.about.card.focus}</span>
          <p>{profile.focus[lang]}</p>
        </div>
        <div className="id-card__footer">
          <span className="id-card__barcode" aria-hidden="true" />
          <span className="id-card__handle">@{profile.handle}</span>
        </div>
        <span className="id-card__foil" aria-hidden="true" />
        <span className="id-card__glare" aria-hidden="true" />
      </div>
    </div>
  );
}

export function About() {
  const { t, lang } = useExperience();
  return (
    <section id="about" className="section about" aria-labelledby="about-title">
      <div className="container about__grid">
        <IdCard />
        <div className="about__copy">
          <ScrambleText as="h2" id="about-title" className="section-title" text={t.about.title} />
          {profile.bio.map((paragraph, index) => (
            <p key={index} className="about__text">
              {paragraph[lang]}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
