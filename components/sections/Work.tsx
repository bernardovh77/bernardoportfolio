"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { projects } from "@/lib/content";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CodeIcon, ExternalIcon } from "@/components/ui/Icons";
import { ScrambleText } from "@/components/ui/ScrambleText";
import { ShardArt } from "./ShardArt";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const pad = (n: number) => String(n).padStart(2, "0");

export function Work() {
  const { t, lang } = useExperience();
  const count = projects.length;
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);

  // Desktop: pin the section and scroll the cards sideways
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 960px) and (prefers-reduced-motion: no-preference)", () => {
        const pin = pinRef.current;
        const track = trackRef.current;
        if (!pin || !track) return;
        // Distance until the last card sits fully in view, with the same margin as the first
        const distance = () => {
          const last = track.lastElementChild as HTMLElement | null;
          if (!last) return 0;
          const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
          return Math.max(0, last.offsetLeft + last.offsetWidth + pad - track.clientWidth);
        };

        const tween = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: pin,
            start: "top top",
            end: () => `+=${distance() + window.innerHeight * 0.35}`,
            pin: true,
            scrub: 0.7,
            invalidateOnRefresh: true,
            anticipatePin: 1,
            onUpdate: (self) => {
              if (barRef.current) barRef.current.style.transform = `scaleX(${self.progress})`;
              if (counterRef.current) {
                const index = Math.min(count, Math.floor(self.progress * count) + 1);
                counterRef.current.textContent = pad(index);
              }
            },
          },
        });

        // Tilt each card slightly as it travels across the screen
        const cards = gsap.utils.toArray<HTMLElement>(".shard", track);
        cards.forEach((card) => {
          gsap.fromTo(
            card,
            { rotateY: -14, opacity: 0.5, transformPerspective: 1200 },
            {
              rotateY: 0,
              opacity: 1,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                containerAnimation: tween,
                start: "left 100%",
                end: "left 62%",
                scrub: true,
              },
            },
          );
        });
      });
      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  // Text length changes with the language, so re-measure
  useEffect(() => {
    const id = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(id);
  }, [lang]);

  return (
    <section id="work" ref={sectionRef} className="section work" aria-labelledby="work-title">
      <div ref={pinRef} className="work__pin">
        <header className="container work__head">
          <div>
            <ScrambleText as="h2" id="work-title" className="section-title" text={t.work.title} />
            <p className="section-intro">{t.work.intro}</p>
          </div>
          <p className="work__counter" aria-hidden="true">
            <span ref={counterRef}>01</span>
            <span className="work__counter-sep">
              {t.work.of} {pad(count)}
            </span>
          </p>
        </header>

        <ol ref={trackRef} className="work__track">
          {projects.map((project, index) => (
            <li key={project.id} className="shard">
              <article className="shard__inner" aria-labelledby={`project-${project.id}`}>
                <div className="shard__cover">
                  <ShardArt variant={project.art} id={project.id} />
                  <span className="shard__index">{pad(index + 1)}</span>
                </div>
                <div className="shard__body">
                  <p className="shard__year">{project.year}</p>
                  <h3 id={`project-${project.id}`} className="shard__title">
                    {project.title}
                  </h3>
                  <p className="shard__summary">{project.summary[lang]}</p>
                  <ul className="shard__stack" aria-label="Stack">
                    {project.stack.map((tech) => (
                      <li key={tech}>{tech}</li>
                    ))}
                  </ul>
                  <div className="shard__links">
                    {project.repo && (
                      <a
                        className="btn btn--small"
                        href={project.repo}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <CodeIcon size={16} />
                        <span>{t.work.code}</span>
                      </a>
                    )}
                    {project.live && (
                      <a
                        className="btn btn--small btn--ghost"
                        href={project.live}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalIcon size={16} />
                        <span>{t.work.live}</span>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ol>

        <div className="container work__progress" aria-hidden="true">
          <span ref={barRef} />
        </div>
      </div>
    </section>
  );
}
