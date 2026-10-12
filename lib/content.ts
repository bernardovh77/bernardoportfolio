import type { Localized } from "./i18n";

/**
 * ─────────────────────────────────────────────────────────────
 *  YOUR CONTENT
 *  Everything below is placeholder text. Edit it here and the
 *  whole site updates. Each text has an English (en) and a
 *  Portuguese (pt) version.
 * ─────────────────────────────────────────────────────────────
 */

export const profile = {
  name: "Bernardo",
  handle: "bernardovh77",
  role: {
    en: "Fullstack developer",
    pt: "Desenvolvedor fullstack",
  } satisfies Localized,
  status: {
    en: "Open to internships",
    pt: "Aberto a estágios",
  } satisfies Localized,
  intro: {
    en: "I build web apps end to end, from the database to the last pixel. Computer Science student, looking for my first internship.",
    pt: "Construo aplicações web de ponta a ponta, do banco de dados ao último pixel. Estudante de Ciência da Computação em busca do primeiro estágio.",
  } satisfies Localized,
  bio: [
    {
      en: "I'm a Computer Science student who fell for the web the first time I saw my code show up in a browser. Since then I've been learning how every layer fits together: interfaces, APIs, databases and the deploy that puts it all online.",
      pt: "Sou estudante de Ciência da Computação e me apaixonei pela web na primeira vez que vi meu código aparecer no navegador. Desde então venho aprendendo como cada camada se encaixa: interfaces, APIs, bancos de dados e o deploy que coloca tudo no ar.",
    },
    {
      en: "Right now I'm focused on React, Next.js and TypeScript, and I'm exploring 3D on the web (this site is my playground). I like clean code, fast pages and projects that people actually use.",
      pt: "Hoje meu foco é React, Next.js e TypeScript, e estou explorando 3D na web (este site é meu laboratório). Gosto de código limpo, páginas rápidas e projetos que as pessoas realmente usam.",
    },
  ] satisfies Localized[],
  base: { en: "Brazil", pt: "Brasil" } satisfies Localized,
  languages: {
    en: "Portuguese, English",
    pt: "Português, inglês",
  } satisfies Localized,
  focus: {
    en: "Web apps, APIs, 3D on the web",
    pt: "Apps web, APIs, 3D na web",
  } satisfies Localized,
};

export const links = {
  email: "bernardovh77@gmail.com",
  github: "https://github.com/bernardovh77",
  linkedin: "https://www.linkedin.com/in/bernardo-vieira-de-souza-halabi/",
};

/**
 * Background music. Files live in public/music/ (change `src` to use
 * another one). If a file is missing, the player hides itself (or, for the
 * Underworks, keeps playing the main track).
 * Title and artist can be plain text, or { en, pt } to translate them.
 */
export type Track = {
  src: string;
  title: string | Localized;
  artist: string | Localized;
  /** Optional: link to the track page, shown on the title (some licenses require it) */
  link: string;
  /** Playback volume, from 0 to 1 */
  volume: number;
};

/** Plays on the surface districts. */
export const music: Track = {
  src: "/music/theme.mp3",
  title: "Night Transit",
  artist: { en: "Original soundtrack", pt: "Trilha sonora original" },
  link: "",
  volume: 0.35,
};

/** Plays only in the Underworks. The two cross-fade when you travel. */
export const underworksMusic: Track = {
  src: "/music/underworks.mp3",
  title: "Slag Engine",
  artist: { en: "Original soundtrack", pt: "Trilha sonora original" },
  link: "",
  volume: 0.35,
};

/** Skill tiers: 1 = learning, 2 = comfortable, 3 = daily driver */
export type Tier = 1 | 2 | 3;

export type SkillGroup = {
  id: string;
  title: Localized;
  skills: { name: string; tier: Tier }[];
};

export const skillGroups: SkillGroup[] = [
  {
    id: "frontend",
    title: { en: "Frontend", pt: "Frontend" },
    skills: [
      { name: "HTML & CSS", tier: 3 },
      { name: "JavaScript", tier: 3 },
      { name: "TypeScript", tier: 2 },
      { name: "React", tier: 2 },
      { name: "Next.js", tier: 2 },
      { name: "Tailwind CSS", tier: 2 },
      { name: "Three.js", tier: 1 },
    ],
  },
  {
    id: "backend",
    title: { en: "Backend", pt: "Backend" },
    skills: [
      { name: "Node.js", tier: 2 },
      { name: "REST APIs", tier: 2 },
      { name: "Python", tier: 2 },
      { name: "SQL", tier: 2 },
      { name: "PostgreSQL", tier: 1 },
      { name: "Prisma", tier: 1 },
    ],
  },
  {
    id: "tools",
    title: { en: "Tools", pt: "Ferramentas" },
    skills: [
      { name: "Git & GitHub", tier: 3 },
      { name: "VS Code", tier: 3 },
      { name: "Linux / WSL", tier: 2 },
      { name: "Vercel", tier: 2 },
      { name: "Figma", tier: 1 },
      { name: "Docker", tier: 1 },
    ],
  },
];

export type Project = {
  id: string;
  title: string;
  year: string;
  summary: Localized;
  stack: string[];
  /** Link to the source code (leave empty to hide the button) */
  repo?: string;
  /** Link to the live site (leave empty to hide the button) */
  live?: string;
  /** Which generated cover art to use */
  art: "skyline" | "orbit" | "wave" | "grid";
};

export const projects: Project[] = [
  {
    id: "portfolio",
    title: "Neon Portfolio",
    year: "2026",
    summary: {
      en: "This site. A 3D portfolio with four districts you can travel between, built with Next.js, React Three Fiber and custom shaders.",
      pt: "Este site. Um portfólio 3D com quatro distritos para visitar, feito com Next.js, React Three Fiber e shaders próprios.",
    },
    stack: ["Next.js", "Three.js", "GSAP", "TypeScript"],
    repo: "https://github.com/bernardovh77/bernardoportfolio",
    live: "https://bernardoportfolio-bay.vercel.app",
    art: "skyline",
  },
  {
    id: "ledger",
    title: "Pocket Ledger",
    year: "2026",
    summary: {
      en: "Placeholder project. A personal finance dashboard that turns bank exports into clear monthly charts.",
      pt: "Projeto de exemplo. Um painel de finanças pessoais que transforma extratos em gráficos mensais claros.",
    },
    stack: ["React", "Node.js", "PostgreSQL"],
    repo: "https://github.com/bernardovh77",
    art: "grid",
  },
  {
    id: "studygroup",
    title: "Study Sync",
    year: "2025",
    summary: {
      en: "Placeholder project. Helps classmates find study partners by course and schedule, with real-time chat.",
      pt: "Projeto de exemplo. Ajuda colegas a encontrar parceiros de estudo por matéria e horário, com chat em tempo real.",
    },
    stack: ["Next.js", "TypeScript", "Prisma"],
    repo: "https://github.com/bernardovh77",
    art: "orbit",
  },
  {
    id: "visualizer",
    title: "Algo Visualizer",
    year: "2025",
    summary: {
      en: "Placeholder project. Watch sorting and pathfinding algorithms run step by step, with adjustable speed.",
      pt: "Projeto de exemplo. Veja algoritmos de ordenação e busca de caminhos rodando passo a passo, com velocidade ajustável.",
    },
    stack: ["TypeScript", "Canvas API"],
    repo: "https://github.com/bernardovh77",
    art: "wave",
  },
];

export type WipStatus = "blueprint" | "building" | "testing";

export type WipProject = {
  id: string;
  title: string;
  summary: Localized;
  stack: string[];
  /** How far along it is, from 0 to 100 */
  progress: number;
  /** blueprint = still planning, building = coding it, testing = almost there */
  status: WipStatus;
  /** When you expect to finish it */
  eta: Localized;
  /** Link to the source code (leave empty to hide the button) */
  repo?: string;
  /** Which blueprint drawing to use on the card */
  art: "tower" | "dome" | "gear";
};

/**
 * Projects still under development. They live in the Underworks: each one
 * gets a work order on that page and a construction site in the 3D shaft,
 * built up to its progress.
 */
export const wipProjects: WipProject[] = [
  {
    id: "campus-map",
    title: "Campus Map",
    summary: {
      en: "Placeholder project. An interactive map of the university with class schedules and a room finder.",
      pt: "Projeto de exemplo. Um mapa interativo da universidade com horários de aula e busca de salas.",
    },
    stack: ["Next.js", "Leaflet", "PostgreSQL"],
    progress: 45,
    status: "building",
    eta: { en: "Early 2027", pt: "Início de 2027" },
    repo: "https://github.com/bernardovh77",
    art: "tower",
  },
  {
    id: "chat-relay",
    title: "Chat Relay",
    summary: {
      en: "Placeholder project. A real-time chat server with rooms, typing indicators and message history.",
      pt: "Projeto de exemplo. Um servidor de chat em tempo real com salas, indicador de digitação e histórico.",
    },
    stack: ["Node.js", "WebSockets", "Redis"],
    progress: 70,
    status: "testing",
    eta: { en: "Late 2026", pt: "Fim de 2026" },
    art: "dome",
  },
  {
    id: "habit-engine",
    title: "Habit Engine",
    summary: {
      en: "Placeholder project. A habit tracker with streaks, reminders and a small public API.",
      pt: "Projeto de exemplo. Um rastreador de hábitos com sequências, lembretes e uma pequena API pública.",
    },
    stack: ["React Native", "TypeScript", "Supabase"],
    progress: 15,
    status: "blueprint",
    eta: { en: "2027", pt: "2027" },
    art: "gear",
  },
];

export type JourneyEntry = {
  id: string;
  year: string;
  title: Localized;
  text: Localized;
  /** Marks the entry that is still ahead */
  upcoming?: boolean;
};

export const journey: JourneyEntry[] = [
  {
    id: "first-code",
    year: "2023",
    title: { en: "First lines of code", pt: "Primeiras linhas de código" },
    text: {
      en: "Placeholder. Built tiny games and pages just to see what would happen.",
      pt: "Exemplo. Fiz jogos e páginas pequenas só para ver o que acontecia.",
    },
  },
  {
    id: "first-site",
    year: "2025",
    title: { en: "First full website", pt: "Primeiro site completo" },
    text: {
      en: "Placeholder. Designed, built and deployed a site from scratch for a real person.",
      pt: "Exemplo. Projetei, construí e publiquei um site do zero para uma pessoa de verdade.",
    },
  },
  {
    id: "university",
    year: "2026",
    title: {
      en: "Started Computer Science",
      pt: "Comecei Ciência da Computação",
    },
    text: {
      en: "Placeholder. Algorithms, data structures and a lot of late nights.",
      pt: "Exemplo. Algoritmos, estruturas de dados e muitas noites viradas.",
    },
  },
  {
    id: "portfolio",
    year: "2026",
    title: { en: "Launched this portfolio", pt: "Lancei este portfólio" },
    text: {
      en: "Placeholder. My first serious 3D project on the web.",
      pt: "Exemplo. Meu primeiro projeto sério de 3D na web.",
    },
  },
  {
    id: "internship",
    year: "2027",
    title: { en: "First internship", pt: "Primeiro estágio" },
    text: {
      en: "Looking for a team where I can learn fast and ship real things.",
      pt: "Procurando um time onde eu possa aprender rápido e entregar coisas reais.",
    },
    upcoming: true,
  },
];
