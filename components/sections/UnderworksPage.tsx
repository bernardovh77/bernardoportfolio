"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { type WipProject, wipProjects } from "@/lib/content";
import { createRandom } from "@/lib/random";
import { scrollToTarget } from "@/lib/scroll";
import {
  BOTTOM_METERS,
  cardSide,
  SITE_COUNT,
  SITE_SECTION_IDS,
  siteDepthMeters,
  siteSectionId,
} from "@/lib/underworks";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { world } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { ArrowDownIcon, ArrowUpIcon, CodeIcon } from "@/components/ui/Icons";
import { BlueprintArt } from "./ShardArt";

/*
 * The Underworks has its own page: no name, no bio, only the projects that
 * are still being built. Each one is a work order pinned next to its
 * construction site in the 3D shaft behind it.
 */

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/** Tells the 3D camera where each site's card sits on the page, so it stops there. */
function useCameraStops() {
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const knots = [0];
      for (const id of SITE_SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el || max <= 0) {
          world.siteKnots = [];
          return;
        }
        const rect = el.getBoundingClientRect();
        const center = rect.top + window.scrollY + rect.height / 2 - window.innerHeight / 2;
        knots.push(Math.min(1, Math.max(0, center / max)));
      }
      knots.push(1);
      world.siteKnots = knots;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      world.siteKnots = [];
    };
  }, []);
}

type Letter = { char: string; state: "on" | "dim" | "dead" | "flicker" | "hang"; delay: number };

/** A sign with missing bulbs: one letter dead, one hanging loose, a few stuttering. */
function signLetters(text: string): Letter[][] {
  const rnd = createRandom(4040);
  const words = text.toUpperCase().split(/\s+/);
  const longest = words.reduce((best, word, i) => (word.length > words[best].length ? i : best), 0);
  return words.map((word, w) =>
    Array.from(word).map((char, i) => {
      let state: Letter["state"] = "on";
      if (w === longest && i === 3) state = "hang";
      else if (w === longest && i === word.length - 3) state = "dead";
      else if (i > 0 && rnd.chance(0.22)) state = "flicker";
      else if (rnd.chance(0.12)) state = "dim";
      return { char, state, delay: rnd.range(0, 5) };
    }),
  );
}

function SignTitle({ id, text }: { id: string; text: string }) {
  const words = signLetters(text);
  return (
    <h1 id={id} className="uw-title">
      <span className="sr-only">{text}</span>
      {words.map((word, w) => (
        <span key={w} className="uw-title__word" aria-hidden="true">
          {word.map((letter, i) => (
            <span
              key={i}
              className="uw-title__letter"
              data-state={letter.state}
              style={{ "--d": `${letter.delay.toFixed(2)}s` } as CSSProperties}
            >
              {letter.char}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

function Entrance() {
  const { t } = useExperience();
  const tape = Array.from({ length: 6 }, () => t.underworks.tape);
  return (
    <section id="uw-entrance" className="uw-entrance" aria-labelledby="uw-title">
      <div className="container uw-entrance__inner">
        <p className="uw-kicker">
          <span className="uw-kicker__light" aria-hidden="true" />
          {t.underworks.kicker}
        </p>
        <SignTitle id="uw-title" text={t.underworks.title} />
        <p className="uw-lead">{t.underworks.lead}</p>
        <p className="uw-meta">
          <span>{t.underworks.sites(SITE_COUNT)}</span>
          <span>
            {t.underworks.depth} {BOTTOM_METERS} m
          </span>
        </p>
        <button
          type="button"
          className="btn btn--primary uw-descend"
          onClick={() => scrollToTarget(SITE_COUNT > 0 ? `#${SITE_SECTION_IDS[0]}` : "#uw-end")}
        >
          <ArrowDownIcon size={16} />
          <span>{t.underworks.descend}</span>
        </button>
      </div>
      <div className="uw-tape" aria-hidden="true">
        <div className="uw-tape__track">
          {[...tape, ...tape].map((text, i) => (
            <span key={i}>{text}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

const SEGMENTS = 20;

function WorkOrder({ project, index }: { project: WipProject; index: number }) {
  const { t, lang } = useExperience();
  const ref = useRef<HTMLElement>(null);
  useInViewOnce(ref, 0.3);
  const filled = Math.round((project.progress / 100) * SEGMENTS);
  const titleId = `uw-${project.id}`;

  return (
    <section
      id={siteSectionId(project)}
      ref={ref}
      className="uw-site"
      data-side={cardSide(index)}
      aria-labelledby={titleId}
    >
      <div className="uw-site__inner">
        <div className="uw-order-wrap">
          <article className="uw-order" data-status={project.status}>
            <p className="uw-order__tape" aria-hidden="true">
              <span>
                {t.underworks.order} · {pad(index + 1)}
              </span>
            </p>
            <div className="uw-order__top">
              <div className="uw-order__plan">
                <BlueprintArt kind={project.art} id={project.id} progress={project.progress} />
              </div>
              <div className="uw-order__id">
                <p className="uw-order__site">
                  {t.underworks.site} <strong>{pad(index + 1)}</strong>
                </p>
                <p className="uw-order__depth">
                  <span className="sr-only">{t.underworks.depth}: </span>−
                  {pad(siteDepthMeters(index), 3)} m
                </p>
                <p className="uw-order__status" data-status={project.status}>
                  {t.underworks.status[project.status]}
                </p>
              </div>
            </div>
            <h2 id={titleId} className="uw-order__title">
              {project.title}
            </h2>
            <p className="uw-order__summary">{project.summary[lang]}</p>
            <div className="uw-order__progress">
              <span>{t.underworks.progress}</span>
              <span
                className="uw-meter"
                role="progressbar"
                aria-label={`${t.underworks.progress}: ${project.title}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={project.progress}
              >
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <i
                    key={i}
                    data-on={i < filled || undefined}
                    data-front={(i === filled - 1 && filled < SEGMENTS) || undefined}
                  />
                ))}
              </span>
              <span className="uw-order__percent">{project.progress}%</span>
            </div>
            <dl className="uw-order__facts">
              <div>
                <dt>{t.underworks.eta}</dt>
                <dd>{project.eta[lang]}</dd>
              </div>
              <div>
                <dt>{t.underworks.stack}</dt>
                <dd>
                  <ul>
                    {project.stack.map((tech) => (
                      <li key={tech}>{tech}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
            {project.repo && (
              <a
                className="btn btn--small uw-order__link"
                href={project.repo}
                target="_blank"
                rel="noreferrer"
              >
                <CodeIcon size={16} />
                <span>{t.underworks.code}</span>
              </a>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

function EndOfTheLine() {
  const { t, returnToSurface, traveling } = useExperience();
  return (
    <section id="uw-end" className="uw-end" aria-labelledby="uw-end-title">
      <div className="uw-end__inner">
        <p className="uw-end__depth">−{BOTTOM_METERS} m</p>
        <h2 id="uw-end-title" className="uw-end__title">
          {t.underworks.endTitle}
        </h2>
        <p className="uw-end__text">{SITE_COUNT > 0 ? t.underworks.endText : t.underworks.empty}</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={returnToSurface}
          disabled={Boolean(traveling)}
        >
          <ArrowUpIcon size={16} />
          <span>{t.underworks.surface}</span>
        </button>
      </div>
    </section>
  );
}

export function UnderworksPage() {
  useCameraStops();
  return (
    <main id="main" tabIndex={-1} className="uw">
      <Entrance />
      {wipProjects.map((project, index) => (
        <WorkOrder key={project.id} project={project} index={index} />
      ))}
      <EndOfTheLine />
    </main>
  );
}
