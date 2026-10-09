import { DEFAULT_LANG, isLang, type Lang } from "./i18n";
import { DEFAULT_THEME, isThemeId, STORAGE_KEYS, type ThemeId } from "./themes";

/**
 * Visitor preferences (district + language) as a tiny external store.
 *
 * The inline script in app/layout.tsx applies the saved values to <html>
 * before the first paint. React reads them back through useSyncExternalStore,
 * which avoids both hydration errors and a flash of the wrong theme.
 */

export type Preferences = { theme: ThemeId; lang: Lang };

const SERVER_SNAPSHOT: Preferences = { theme: DEFAULT_THEME, lang: DEFAULT_LANG };

let current: Preferences | null = null;
const listeners = new Set<() => void>();

function readFromDocument(): Preferences {
  const root = document.documentElement;
  const theme = root.dataset.theme;
  const lang = root.dataset.lang;
  return {
    theme: isThemeId(theme) ? theme : DEFAULT_THEME,
    lang: isLang(lang) ? lang : DEFAULT_LANG,
  };
}

/** Writes the preferences onto <html> so CSS (and screen readers) pick them up. */
export function applyPreferencesToDocument(prefs: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.lang = prefs.lang;
  root.lang = prefs.lang === "pt" ? "pt-BR" : "en";
}

// Read the values the inline script applied as soon as this module loads in the
// browser, before React hydrates and before any effect can touch <html>.
if (typeof document !== "undefined") current = readFromDocument();

export const preferencesStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): Preferences {
    if (!current) current = readFromDocument();
    return current;
  },
  getServerSnapshot(): Preferences {
    return SERVER_SNAPSHOT;
  },
  set(partial: Partial<Preferences>) {
    const next = { ...preferencesStore.getSnapshot(), ...partial };
    current = next;
    applyPreferencesToDocument(next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next.theme);
      localStorage.setItem(STORAGE_KEYS.lang, next.lang);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
    listeners.forEach((listener) => listener());
  },
};

/** Inline script that runs before the first paint (see app/layout.tsx). */
export const preferencesInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("${STORAGE_KEYS.theme}");if(t==="city"||t==="desert"||t==="ocean"){d.dataset.theme=t}var l=localStorage.getItem("${STORAGE_KEYS.lang}");if(l!=="en"&&l!=="pt"){l=(navigator.language||"").toLowerCase().indexOf("pt")===0?"pt":"en"}d.dataset.lang=l;d.lang=l==="pt"?"pt-BR":"en";if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){d.dataset.motion="reduced"}}catch(e){}})();`;
