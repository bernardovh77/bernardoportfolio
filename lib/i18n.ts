/**
 * Interface text in both languages.
 * Your personal content (bio, projects, skills, journey) lives in lib/content.ts.
 */

export const LANGS = ["en", "pt"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

/** A piece of text written in both languages. */
export type Localized = Record<Lang, string>;

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "pt";
}

const en = {
  skipToContent: "Skip to content",
  boot: {
    skip: "Skip intro",
  },
  nav: {
    about: "About",
    skills: "Skills",
    work: "Work",
    journey: "Journey",
    contact: "Contact",
    menu: "Menu",
    close: "Close",
    language: "Language",
  },
  hero: {
    primaryCta: "See my work",
    secondaryCta: "Get in touch",
    scroll: "Scroll to explore",
  },
  about: {
    title: "Who's behind the screen",
    card: {
      name: "Name",
      role: "Role",
      base: "Base",
      languages: "Languages",
      focus: "Focus",
      id: "ID",
    },
  },
  skills: {
    title: "Loadout",
    intro: "The tools I reach for, and how well I know each one.",
    tiers: ["Learning", "Comfortable", "Daily driver"],
    legend: "Tier",
  },
  work: {
    title: "Selected work",
    intro: "A few things I've built recently, from side projects to coursework.",
    code: "Code",
    live: "Live site",
    of: "of",
  },
  journey: {
    title: "Journey",
    intro: "How I got here, one step at a time.",
    next: "Next",
  },
  contact: {
    title: "Let's build something",
    intro:
      "Have an internship, a project or just a question? Send a message. The terminal works too.",
    email: "Email",
    copy: "Copy email",
    copied: "Copied",
  },
  terminal: {
    label: "Interactive terminal",
    placeholder: "type help and press Enter",
    welcome: "Bernardo OS ready. Type help to see the commands.",
    help: [
      "help ............. list commands",
      "whoami ........... who I am",
      "email ............ show my email",
      "github ........... open my GitHub",
      "linkedin ......... open my LinkedIn",
      "travel city|desert|ocean ... switch district",
      "lang en|pt ....... switch language",
      "clear ............ clear the screen",
    ],
    notFound: (cmd: string) => `command not found: ${cmd}. Type help.`,
    opening: (what: string) => `opening ${what}...`,
    travel: (name: string) => `traveling to ${name}...`,
    travelUsage: "usage: travel city | desert | ocean",
    langUsage: "usage: lang en | pt",
    langSet: "language set to English",
    hire: "permission granted. Bernardo is excited to talk. Run: email",
  },
  hud: {
    district: "District",
    localTime: "Local time",
    travel: "Travel",
    depth: "Depth",
    shortcut: "Press 1, 2 or 3",
    traveling: "Traveling to",
  },
  themes: {
    city: { name: "Megacity", tagline: "Rain, towers and endless traffic" },
    desert: { name: "Synth Desert", tagline: "A neon highway into the sunset" },
    ocean: { name: "Data Ocean", tagline: "Glowing tides under a holo-moon" },
  },
  footer: {
    built: "Built with Next.js, Three.js and a lot of neon.",
    top: "Back to top",
  },
};

export type UiStrings = typeof en;

const pt: UiStrings = {
  skipToContent: "Pular para o conteúdo",
  boot: {
    skip: "Pular intro",
  },
  nav: {
    about: "Sobre",
    skills: "Habilidades",
    work: "Projetos",
    journey: "Trajetória",
    contact: "Contato",
    menu: "Menu",
    close: "Fechar",
    language: "Idioma",
  },
  hero: {
    primaryCta: "Ver projetos",
    secondaryCta: "Fale comigo",
    scroll: "Role para explorar",
  },
  about: {
    title: "Quem está por trás da tela",
    card: {
      name: "Nome",
      role: "Função",
      base: "Base",
      languages: "Idiomas",
      focus: "Foco",
      id: "ID",
    },
  },
  skills: {
    title: "Arsenal",
    intro: "As ferramentas que eu uso e o quanto domino cada uma.",
    tiers: ["Aprendendo", "Confortável", "Uso diário"],
    legend: "Nível",
  },
  work: {
    title: "Projetos em destaque",
    intro:
      "Algumas coisas que construí recentemente, de projetos pessoais a trabalhos da faculdade.",
    code: "Código",
    live: "Ver online",
    of: "de",
  },
  journey: {
    title: "Trajetória",
    intro: "Como cheguei até aqui, um passo de cada vez.",
    next: "Próximo",
  },
  contact: {
    title: "Vamos construir algo",
    intro:
      "Tem um estágio, um projeto ou só uma pergunta? Mande uma mensagem. O terminal também funciona.",
    email: "E-mail",
    copy: "Copiar e-mail",
    copied: "Copiado",
  },
  terminal: {
    label: "Terminal interativo",
    placeholder: "digite help e aperte Enter",
    welcome: "Bernardo OS pronto. Digite help para ver os comandos.",
    help: [
      "help ............. lista os comandos",
      "whoami ........... quem eu sou",
      "email ............ mostra meu e-mail",
      "github ........... abre meu GitHub",
      "linkedin ......... abre meu LinkedIn",
      "travel city|desert|ocean ... troca de distrito",
      "lang en|pt ....... troca o idioma",
      "clear ............ limpa a tela",
    ],
    notFound: (cmd: string) => `comando não encontrado: ${cmd}. Digite help.`,
    opening: (what: string) => `abrindo ${what}...`,
    travel: (name: string) => `viajando para ${name}...`,
    travelUsage: "uso: travel city | desert | ocean",
    langUsage: "uso: lang en | pt",
    langSet: "idioma alterado para português",
    hire: "permissão concedida. O Bernardo adoraria conversar. Rode: email",
  },
  hud: {
    district: "Distrito",
    localTime: "Hora local",
    travel: "Viajar",
    depth: "Profundidade",
    shortcut: "Aperte 1, 2 ou 3",
    traveling: "Viajando para",
  },
  themes: {
    city: { name: "Megacidade", tagline: "Chuva, arranha-céus e tráfego sem fim" },
    desert: { name: "Deserto Synth", tagline: "Uma estrada neon rumo ao pôr do sol" },
    ocean: { name: "Oceano de Dados", tagline: "Marés luminosas sob uma lua holográfica" },
  },
  footer: {
    built: "Feito com Next.js, Three.js e muito neon.",
    top: "Voltar ao topo",
  },
};

export const ui: Record<Lang, UiStrings> = { en, pt };
