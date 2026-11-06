"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import { carInterests, garage, revBench } from "@/lib/content";
import { engine, MAX_RPM, REDLINE_RPM, REDLINE_SECTION_IDS } from "@/lib/redline";
import { scrollToTarget } from "@/lib/scroll";
import { useInViewOnce } from "@/lib/useInViewOnce";
import { world } from "@/lib/world";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { CodeIcon, ExitIcon, FlagIcon } from "@/components/ui/Icons";

/*
 * Redline has its own page: one lap of the night circuit behind it. The
 * grid, the car in the garage, what I'm into, the project on the dyno and
 * the chequered flag, each one a stop where the camera slows down.
 */

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

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

/** The engine behind the tachometer in the sky: rpm, gear and speed, live. */
function LiveTelemetry() {
  const { t } = useExperience();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const rpmRef = useRef<HTMLElement>(null);
  const gearRef = useRef<HTMLElement>(null);
  const speedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let frame = 0;
    const last = { rpm: "", gear: "", speed: "", limiter: false, level: "" };
    const loop = () => {
      const rpm = String(Math.round(engine.rpm / 50) * 50);
      const gear = engine.gear === 0 ? "N" : String(engine.gear);
      const speed = pad(Math.round(engine.speed), 3);
      const level = Math.min(1, engine.rpm / MAX_RPM).toFixed(3);
      if (rpm !== last.rpm && rpmRef.current) rpmRef.current.textContent = last.rpm = rpm;
      if (gear !== last.gear && gearRef.current) gearRef.current.textContent = last.gear = gear;
      if (speed !== last.speed && speedRef.current)
        speedRef.current.textContent = last.speed = speed;
      if (level !== last.level && barRef.current) {
        barRef.current.style.transform = `scaleX(${level})`;
        last.level = level;
      }
      if (engine.limiter !== last.limiter) {
        rootRef.current?.toggleAttribute("data-limiter", engine.limiter);
        last.limiter = engine.limiter;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={rootRef}
      className="rl-live"
      aria-hidden="true"
      style={{ "--redline": REDLINE_RPM / MAX_RPM } as CSSProperties}
    >
      <span className="rl-live__bar">
        <span ref={barRef} />
      </span>
      <dl className="rl-live__readouts">
        <div>
          <dt>{t.redline.live.rpm}</dt>
          <dd ref={rpmRef}>900</dd>
        </div>
        <div>
          <dt>{t.redline.live.gear}</dt>
          <dd ref={gearRef} className="rl-live__gear">
            N
          </dd>
        </div>
        <div>
          <dt>{t.redline.live.speed}</dt>
          <dd ref={speedRef}>000</dd>
        </div>
      </dl>
      <p className="rl-live__hint">{t.redline.live.hint}</p>
    </div>
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
        <LiveTelemetry />
        <div className="rl-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => scrollToTarget(`#${REDLINE_SECTION_IDS[1]}`)}
          >
            <FlagIcon size={16} />
            <span>{t.redline.start}</span>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => scrollToTarget("#rl-dyno")}
          >
            <span>{t.redline.skip}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

/** A small hatchback drawn in neon lines (a generic one, no badges). */
function CarArt() {
  return (
    <svg className="rl-car" viewBox="0 0 400 150" aria-hidden="true">
      <path className="rl-car__ground" d="M8 137H392" />
      <path
        className="rl-car__body"
        d="M44 112 36 100V86Q38 70 50 60L78 44Q92 36 120 35H200Q224 35 240 46L272 64Q320 70 344 78Q356 84 356 96L354 108 344 112H314A30 30 0 0 0 254 112H130A30 30 0 0 0 70 112Z"
      />
      <path className="rl-car__glass" d="M86 48 118 40H196Q214 40 228 50L246 63H92Z" />
      <path
        className="rl-car__line"
        d="M159 40 157 63M54 76Q200 70 346 82M157 66 155 108M240 66 244 104"
      />
      <path className="rl-car__light rl-car__light--head" d="M328 76 350 83" />
      <path className="rl-car__light rl-car__light--tail" d="M39 74 46 63" />
      {[100, 284].map((x) => (
        <g key={x} className="rl-car__wheel">
          <circle cx={x} cy={112} r={24} />
          <circle cx={x} cy={112} r={14} />
          <circle cx={x} cy={112} r={3} />
        </g>
      ))}
      <g className="rl-car__tag">
        <path d="M300 74V52H330" />
        <circle cx={300} cy={74} r={3} />
        <text x={334} y={56}>
          1.0 TSI
        </text>
      </g>
      <rect className="rl-car__scan" x="0" y="20" width="4" height="122" />
    </svg>
  );
}

function useReveal() {
  const ref = useRef<HTMLElement>(null);
  useInViewOnce(ref, 0.25);
  return ref;
}

function Garage() {
  const { t, lang } = useExperience();
  const ref = useReveal();
  return (
    <section
      id="rl-garage"
      ref={ref}
      className="rl-section rl-section--wide"
      data-side="left"
      aria-labelledby="rl-garage-title"
    >
      <div className="rl-section__inner">
        <article className="rl-card rl-garage">
          <p className="rl-card__kicker">{t.redline.garage.kicker}</p>
          <h2 id="rl-garage-title" className="rl-card__title">
            {t.redline.garage.title}
          </h2>
          <div className="rl-garage__layout">
            <div className="rl-garage__car">
              <CarArt />
              <p className="rl-garage__name">
                <span>{garage.make}</span>
                <strong>{garage.model}</strong>
                <span>{garage.year}</span>
              </p>
              <p className="rl-garage__rule">{garage.rule[lang]}</p>
            </div>
            <div className="rl-garage__sheets">
              <div>
                <h3 className="rl-card__sub">{t.redline.garage.specs}</h3>
                <dl className="rl-specs">
                  {garage.specs.map((spec) => (
                    <div key={spec.label.en}>
                      <dt>{spec.label[lang]}</dt>
                      <dd>{spec.value[lang]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="rl-card__sub">{t.redline.garage.build}</h3>
                <ul className="rl-mods">
                  {garage.mods.map((mod) => (
                    <li key={mod.name.en} data-status={mod.status}>
                      <span className="rl-mods__tag">{t.redline.garage.mod[mod.status]}</span>
                      <span>{mod.name[lang]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function Telemetry() {
  const { t, lang } = useExperience();
  const ref = useReveal();
  return (
    <section
      id="rl-telemetry"
      ref={ref}
      className="rl-section rl-section--wide"
      data-side="right"
      aria-labelledby="rl-telemetry-title"
    >
      <div className="rl-section__inner">
        <article className="rl-card rl-telemetry">
          <p className="rl-card__kicker">{t.redline.telemetry.kicker}</p>
          <h2 id="rl-telemetry-title" className="rl-card__title">
            {t.redline.telemetry.title}
          </h2>
          <ul className="rl-interests">
            {carInterests.map((item, index) => (
              <li key={item.id} style={{ "--i": index } as CSSProperties}>
                <span className="rl-interests__code">T-{pad(index + 1)}</span>
                <h3>{item.title[lang]}</h3>
                <p>{item.text[lang]}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
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
      <Garage />
      <Telemetry />
      <Dyno />
      <Finish />
    </main>
  );
}
