"use client";

import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { profile } from "@/lib/content";
import { THEMES } from "@/lib/themes";
import { useFinePointer, useReducedMotion } from "@/lib/hooks";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ScrambleText } from "@/components/ui/ScrambleText";

/** The ID photo, under the card's scanlines and corner marks. */
function Avatar({ name }: { name: string }) {
  return (
    <svg className="id-card__avatar" viewBox="0 0 120 140" role="img" aria-label={name}>
      <defs>
        <linearGradient id="avatar-tint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="var(--a)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--a)" stopOpacity="0.22" />
        </linearGradient>
        <pattern id="avatar-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1.2" fill="var(--void)" opacity="0.18" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="120" height="140" fill="var(--abyss)" />
      <image href="/images/profile.jpg" x="0" y="0" width="120" height="140" preserveAspectRatio="xMidYMid slice" />
      <rect x="0" y="0" width="120" height="140" fill="url(#avatar-tint)" />
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
          <Avatar name={profile.name} />
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
