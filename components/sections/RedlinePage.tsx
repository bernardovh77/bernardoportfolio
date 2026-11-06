"use client";

import { useEffect, useRef } from "react";
import { revBench } from "@/lib/content";
import { REDLINE_SECTION_IDS } from "@/lib/redline";
import { scrollToTarget } from "@/lib/scroll";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { world } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CodeIcon, ExitIcon, FlagIcon } from "@/components/ui/Icons";

/*
 * Redline has its own page: one lap of the night circuit behind it. The
 * grid, the project on the dyno and the chequered flag, each one a stop
 * where the camera slows down.
 */

/** Tells the 3D camera where each section sits on the page, so it stops there. */
function useCameraStops() {
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const knots = [0];
      for (const id of REDLINE_SECTION_IDS.slice(1, -1)) {
        const el = document.getElementById(id);
        if (!el || max <= 0) {
          world.stopKnots = [];
          return;
        }
        const rect = el.getBoundingClientRect();
        const center = rect.top + window.scrollY + rect.height / 2 - window.innerHeight / 2;
        knots.push(Math.min(1, Math.max(0, center / max)));
      }
      knots.push(1);
      world.stopKnots = knots;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      world.stopKnots = [];
    };
  }, []);
}

/** The five red lights of a race start: one more each second, then lights out. */
function StartLights() {
  return (
    <span className="rl-lights" aria-hidden="true">
      <span className="rl-lights__off">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="rl-lights__on">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function Grid() {
  const { t } = useExperience();
  return (
    <section id="rl-start" className="rl-start" aria-labelledby="rl-title">
      <div className="container rl-start__inner">
        <p className="rl-kicker">
          <StartLights />
          {t.redline.kicker}
        </p>
        <h1 id="rl-title" className="rl-title">
          {t.redline.title}
        </h1>
        <p className="rl-lead">{t.redline.lead}</p>
        <div className="rl-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => scrollToTarget(`#${REDLINE_SECTION_IDS[1]}`)}
          >
            <FlagIcon size={16} />
            <span>{t.redline.start}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function useReveal() {
  const ref = useRef<HTMLElement>(null);
  useInViewOnce(ref, 0.25);
  return ref;
}

const LEDS = 24;
const SECTORS = "ABCDEFG";

function Dyno() {
  const { t, lang } = useExperience();
  const ref = useReveal();
  const { done, total } = revBench.stages;
  const lit = Math.round((done / total) * LEDS);
  const percent = Math.round((done / total) * 100);
  const d = t.redline.dyno;

  return (
    <section
      id="rl-dyno"
      ref={ref}
      className="rl-section rl-section--wide"
      data-side="left"
      aria-labelledby="rl-dyno-title"
    >
      <div className="rl-section__inner">
        <article className="rl-card rl-dyno">
          <p className="rl-card__kicker">{d.kicker}</p>
          <p className="rl-dyno__eyebrow">{d.title}</p>
          <h2 id="rl-dyno-title" className="rl-dyno__title">
            {revBench.title}
          </h2>
          <p className="rl-status">
            <span className="rl-status__light" aria-hidden="true" />
            <span>{revBench.status[lang]}</span>
            <span className="rl-status__date">
              {d.updated} {revBench.updated[lang]}
            </span>
          </p>
          <p className="rl-dyno__summary">{revBench.summary[lang]}</p>

          <div className="rl-progress">
            <span className="rl-progress__label">{d.stages(done, total)}</span>
            <span
              className="rl-leds"
              role="progressbar"
              aria-label={d.stages(done, total)}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
            >
              {Array.from({ length: LEDS }, (_, i) => (
                <i
                  key={i}
                  data-on={i < lit || undefined}
                  data-zone={i >= LEDS * 0.85 ? "red" : i >= LEDS * 0.6 ? "amber" : undefined}
                />
              ))}
            </span>
            <span className="rl-progress__percent">{percent}%</span>
          </div>
          <p className="rl-dyno__next">{revBench.next[lang]}</p>

          <h3 className="rl-card__sub">{d.roadmap}</h3>
          <ol className="rl-sectors">
            {revBench.phases.map((phase, i) => (
              <li
                key={phase.en}
                data-state={
                  i < revBench.current ? "done" : i === revBench.current ? "now" : "ahead"
                }
              >
                <span className="rl-sectors__letter">{SECTORS[i]}</span>
                <span className="rl-sectors__name">{phase[lang]}</span>
                {i === revBench.current && <em className="rl-sectors__now">{d.now}</em>}
              </li>
            ))}
          </ol>

          <div className="rl-dyno__grid">
            <div>
              <h3 className="rl-card__sub">{d.today}</h3>
              <ul className="rl-today">
                {revBench.today.map((line) => (
                  <li key={line.en}>{line[lang]}</li>
                ))}
              </ul>
            </div>
            <div className="rl-sheet">
              <h3 className="rl-card__sub">{d.sheet}</h3>
              <p className="rl-sheet__intro">{d.sheetIntro}</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{d.engine}</th>
                    <th scope="col">
                      {d.torque} <span>N·m</span>
                    </th>
                    <th scope="col">
                      {d.power} <span>kW</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {revBench.dyno.map((row) => (
                    <tr key={row.real}>
                      <th scope="row">
                        {row.engine[lang]}
                        <span>{row.real}</span>
                      </th>
                      <td>
                        <strong>{row.torque[0]}</strong>
                        <span> / {row.torque[1]}</span>
                      </td>
                      <td>
                        <strong>{row.power[0]}</strong>
                        <span> / {row.power[1]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="rl-sheet__legend">{d.legend}</p>
            </div>
          </div>

          <footer className="rl-dyno__foot">
            <ul className="rl-stack" aria-label={d.stack}>
              {revBench.stack.map((tech) => (
                <li key={tech}>{tech}</li>
              ))}
            </ul>
            <a
              className="btn btn--primary btn--small"
              href={revBench.repo}
              target="_blank"
              rel="noreferrer"
            >
              <CodeIcon size={16} />
              <span>{d.code}</span>
            </a>
          </footer>
        </article>
      </div>
    </section>
  );
}

function Finish() {
  const { t, leaveTrack, traveling } = useExperience();
  return (
    <section id="rl-finish" className="rl-finish" aria-labelledby="rl-finish-title">
      <div className="rl-finish__inner">
        <span className="rl-finish__flag" aria-hidden="true" />
        <p className="rl-card__kicker">{t.redline.finish.kicker}</p>
        <h2 id="rl-finish-title" className="rl-finish__title">
          {t.redline.finish.title}
        </h2>
        <p className="rl-finish__text">{t.redline.finish.text}</p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={leaveTrack}
          disabled={Boolean(traveling)}
        >
          <ExitIcon size={16} />
          <span>{t.redline.leave}</span>
        </button>
      </div>
    </section>
  );
}

export function RedlinePage() {
  useCameraStops();
  return (
    <main id="main" tabIndex={-1} className="rl">
      <Grid />
      <Dyno />
      <Finish />
    </main>
  );
}
