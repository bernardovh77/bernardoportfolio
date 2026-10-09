"use client";

import { type CSSProperties, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { journey } from "@/lib/content";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ScrambleText } from "@/components/ui/ScrambleText";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function Journey() {
  const { t, lang } = useExperience();
  const listRef = useRef<HTMLOListElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  // The rail fills as you scroll, and each entry lights up when the fill reaches it
  useGSAP(
    () => {
      const list = listRef.current;
      const fill = fillRef.current;
      if (!list || !fill) return;
      gsap.fromTo(
        fill,
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: list, start: "top 65%", end: "bottom 65%", scrub: 0.4 },
        },
      );
      gsap.utils.toArray<HTMLElement>(".log-entry", list).forEach((entry) => {
        ScrollTrigger.create({
          trigger: entry,
          start: "top 65%",
          onEnter: () => entry.setAttribute("data-reached", "true"),
          onLeaveBack: () => entry.removeAttribute("data-reached"),
        });
      });
    },
    { scope: listRef },
  );

  return (
    <section id="journey" className="section journey" aria-labelledby="journey-title">
      <div className="container journey__grid">
        <header className="section-head journey__head">
          <ScrambleText
            as="h2"
            id="journey-title"
            className="section-title"
            text={t.journey.title}
          />
          <p className="section-intro">{t.journey.intro}</p>
        </header>

        <div className="log">
          <span className="log__rail" aria-hidden="true">
            <span ref={fillRef} className="log__fill" />
          </span>
          <ol ref={listRef} className="log__list">
            {journey.map((entry, index) => (
              <li
                key={entry.id}
                className="log-entry"
                data-upcoming={entry.upcoming || undefined}
                style={{ "--i": index } as CSSProperties}
              >
                <span className="log-entry__node" aria-hidden="true" />
                <p className="log-entry__year">
                  {entry.upcoming ? (
                    <span className="log-entry__next">{t.journey.next}</span>
                  ) : null}
                  {entry.year}
                </p>
                <h3 className="log-entry__title">{entry.title[lang]}</h3>
                <p className="log-entry__text">{entry.text[lang]}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
