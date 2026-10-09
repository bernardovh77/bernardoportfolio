"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { links, music, profile } from "@/lib/content";
import { musicStore } from "@/lib/music";
import { isLang, localize, ui } from "@/lib/i18n";
import { scrollToTarget } from "@/lib/scroll";
import { isThemeId } from "@/lib/themes";
import { useExperience } from "@/components/experience/ExperienceProvider";
import { SECTION_IDS } from "@/components/ui/TopBar";

type Line = { id: number; kind: "input" | "output" | "error"; text: string };

const PROMPT = "guest@bernardo:~$";

/** A small working shell. Visitors can type commands to explore the site. */
export function Terminal() {
  const { t, lang, travelTo, setLang } = useExperience();
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const nextId = useRef(1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [lines]);

  const print = (entries: { kind: Line["kind"]; text: string }[]) => {
    setLines((current) =>
      [...current, ...entries.map((entry) => ({ ...entry, id: nextId.current++ }))].slice(-80),
    );
  };

  const run = (raw: string) => {
    const input = raw.trim();
    if (!input) return;
    history.current = [input, ...history.current].slice(0, 30);
    historyIndex.current = -1;
    const [command, ...args] = input.split(/\s+/);
    const arg = args.join(" ").toLowerCase();
    const echo = { kind: "input" as const, text: input };
    const out = (text: string) => ({ kind: "output" as const, text });
    const err = (text: string) => ({ kind: "error" as const, text });

    switch (command.toLowerCase()) {
      case "help":
        print([echo, ...t.terminal.help.map(out)]);
        break;
      case "clear":
        setLines([]);
        break;
      case "whoami":
        print([echo, out(`${profile.name}. ${profile.role[lang]}.`), out(profile.intro[lang])]);
        break;
      case "email":
      case "contact":
        print([echo, out(links.email)]);
        break;
      case "github":
        window.open(links.github, "_blank", "noopener,noreferrer");
        print([echo, out(t.terminal.opening("GitHub"))]);
        break;
      case "linkedin":
        window.open(links.linkedin, "_blank", "noopener,noreferrer");
        print([echo, out(t.terminal.opening("LinkedIn"))]);
        break;
      case "travel":
      case "theme":
        if (isThemeId(arg)) {
          print([echo, out(t.terminal.travel(t.themes[arg].name))]);
          travelTo(arg);
        } else {
          print([echo, err(t.terminal.travelUsage)]);
        }
        break;
      case "lang":
        if (isLang(arg)) {
          setLang(arg);
          print([echo, out(ui[arg].terminal.langSet)]);
        } else {
          print([echo, err(t.terminal.langUsage)]);
        }
        break;
      case "music": {
        if (musicStore.getSnapshot() === "unavailable") {
          print([echo, err(t.terminal.musicMissing)]);
          break;
        }
        const wantsOn = arg === "on" ? true : arg === "off" ? false : null;
        const isPlaying = musicStore.getSnapshot() === "playing";
        let nowPlaying = isPlaying;
        if (wantsOn === null) nowPlaying = musicStore.toggle();
        else if (wantsOn && !isPlaying) {
          musicStore.play();
          nowPlaying = true;
        } else if (!wantsOn && isPlaying) {
          musicStore.pause();
          nowPlaying = false;
        }
        const credit = [music.title, music.artist]
          .map((part) => localize(part, lang))
          .filter(Boolean)
          .join(" · ");
        print([echo, out(nowPlaying ? t.terminal.musicOn(credit) : t.terminal.musicOff)]);
        break;
      }
      case "ls":
        print([echo, out(SECTION_IDS.join("   "))]);
        break;
      case "cd":
        if ((SECTION_IDS as readonly string[]).includes(arg)) {
          print([echo]);
          scrollToTarget(`#${arg}`);
        } else {
          print([echo, err(`cd: ${arg || "?"}: ${SECTION_IDS.join(" | ")}`)]);
        }
        break;
      case "date":
        print([echo, out(new Date().toLocaleString(lang === "pt" ? "pt-BR" : "en-US"))]);
        break;
      case "echo":
        print([echo, out(args.join(" "))]);
        break;
      case "sudo":
      case "hire":
        print([echo, out(t.terminal.hire)]);
        break;
      default:
        print([echo, err(t.terminal.notFound(command))]);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    run(value);
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(history.current.length - 1, historyIndex.current + 1);
      if (next >= 0) {
        historyIndex.current = next;
        setValue(history.current[next]);
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = historyIndex.current - 1;
      historyIndex.current = Math.max(-1, next);
      setValue(next >= 0 ? history.current[next] : "");
    }
  };

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal__bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <p>bernardo/os — shell</p>
      </div>
      <div
        ref={outputRef}
        className="terminal__output"
        data-lenis-prevent
        role="log"
        aria-live="polite"
      >
        <p className="terminal__line terminal__line--system">{t.terminal.welcome}</p>
        {lines.map((line) => (
          <p key={line.id} className={`terminal__line terminal__line--${line.kind}`}>
            {line.kind === "input" && <span className="terminal__prompt">{PROMPT} </span>}
            {line.text}
          </p>
        ))}
      </div>
      <form className="terminal__form" onSubmit={onSubmit}>
        <label htmlFor="terminal-input" className="terminal__prompt">
          {PROMPT}
        </label>
        <input
          ref={inputRef}
          id="terminal-input"
          className="terminal__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t.terminal.placeholder}
          aria-label={t.terminal.label}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
        />
      </form>
    </div>
  );
}
