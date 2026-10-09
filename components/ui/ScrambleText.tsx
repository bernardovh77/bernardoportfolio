"use client";

import { useEffect, useRef } from "react";
import { onBooted } from "@/lib/world";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/[]{}=+*#$%&@";

type ScrambleTextProps = {
  text: string;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div";
  className?: string;
  /** "view": when scrolled into view. "mount": right away. "boot": when the intro finishes */
  trigger?: "view" | "mount" | "boot";
  duration?: number;
  delay?: number;
  id?: string;
};

/**
 * Text that "decodes" from random glyphs into the real words.
 * The real text is always in the HTML (and announced to screen readers);
 * only the visible characters are animated.
 */
export function ScrambleText({
  text,
  as: Tag = "span",
  className,
  trigger = "view",
  duration = 650,
  delay = 0,
  id,
}: ScrambleTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      node = document.createTextNode(text);
      el.replaceChildren(node);
    }
    const textNode = node as Text;
    textNode.nodeValue = text;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const chars = Array.from(text);
    let frame = 0;
    let timeout = 0;

    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - start) / duration);
        let out = "";
        for (let i = 0; i < chars.length; i++) {
          const char = chars[i];
          const revealAt = (i / Math.max(1, chars.length)) * 0.65 + 0.25;
          if (char === " " || progress >= revealAt) out += char;
          else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        textNode.nodeValue = out;
        if (progress < 1) frame = requestAnimationFrame(step);
        else textNode.nodeValue = text;
      };
      frame = requestAnimationFrame(step);
    };

    let observer: IntersectionObserver | null = null;
    let stopWaiting = () => {};
    if (trigger === "boot") {
      stopWaiting = onBooted(() => {
        timeout = window.setTimeout(run, delay);
      });
    } else if (trigger === "view") {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            timeout = window.setTimeout(run, delay);
          }
        },
        { threshold: 0.4 },
      );
      observer.observe(el);
    } else {
      timeout = window.setTimeout(run, delay);
    }

    return () => {
      stopWaiting();
      observer?.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
      textNode.nodeValue = text;
    };
  }, [text, trigger, duration, delay]);

  return (
    <Tag className={className} id={id}>
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true" className="scramble">
        {text}
      </span>
    </Tag>
  );
}
