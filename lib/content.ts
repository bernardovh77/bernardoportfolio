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
 * another one). If the main file is missing, the player hides itself.
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

/**
 * Redline's own song. It has none for now, so the music fades out while you're
 * on the track and comes back when you leave. To give it one, put the file in
 * public/music/, set `src` and fill in the title and artist: the two songs
 * will cross-fade when you travel.
 */
export const redlineMusic: Track = {
  src: "",
  title: "",
  artist: "",
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
      { name: "JavaScript", tier: 2 },
      { name: "TypeScript", tier: 1 },
      { name: "React", tier: 1 },
      { name: "Next.js", tier: 1 },
      { name: "Tailwind CSS", tier: 1 },
      { name: "Three.js", tier: 1 },
    ],
  },
  {
    id: "backend",
    title: { en: "Backend", pt: "Backend" },
    skills: [
      { name: "Java", tier: 3 },
      { name: "C", tier: 3 },
      { name: "Node.js", tier: 2 },
      { name: "REST APIs", tier: 2 },
      { name: "Python", tier: 2 },
      { name: "SQL", tier: 2 },
    ],
  },
  {
    id: "tools",
    title: { en: "Tools", pt: "Ferramentas" },
    skills: [
      { name: "Git & GitHub", tier: 3 },
      { name: "Vim", tier: 3 },
      { name: "Linux / WSL", tier: 3 },
      { name: "VS Code", tier: 2 },
      { name: "Vercel", tier: 2 },
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

/* ─────────────────────────────────────────────────────────────
 *  REDLINE (the racing district)
 *  Its page is one lap of the circuit, with the project on the dyno.
 * ───────────────────────────────────────────────────────────── */

/**
 * The project on the dyno: the one you're building right now.
 * Update `stages` and `updated` as it moves along.
 */
export const revBench = {
  title: "REV-BENCH",
  repo: "https://github.com/bernardovh77/REV-BENCH",
  status: { en: "In development", pt: "Em desenvolvimento" } satisfies Localized,
  updated: { en: "November 2026", pt: "novembro de 2026" } satisfies Localized,
  summary: {
    en: "A combustion engine test bench in the browser. Pick an engine, change its displacement, compression, cams, headers and exhaust, and hear and see the difference in real time. The sound comes from a physics simulation of the gas moving through the engine, not from recordings.",
    pt: "Uma bancada de testes de motores a combustão no navegador. Escolha um motor, mude cilindrada, compressão, comandos, coletores e escape, e ouça e veja a diferença em tempo real. O som vem de uma simulação física do gás passando pelo motor, não de gravações.",
  } satisfies Localized,
  /** Roadmap stages done, out of the ones needed for the first release */
  stages: { done: 53, total: 109 },
  next: {
    en: "Next up: the engine running live in the browser",
    pt: "Próximo passo: o motor rodando ao vivo no navegador",
  } satisfies Localized,
  /** The roadmap's phases, in order; `current` is the one being worked on */
  phases: [
    { en: "Engine in the browser", pt: "Motor no navegador" },
    { en: "Real-engine sound", pt: "Som de motor real" },
    { en: "3D engine", pt: "Motor em 3D" },
    { en: "Turbo", pt: "Turbo" },
    { en: "Knock and limits", pt: "Detonação e limites" },
    { en: "More engines", pt: "Mais motores" },
    { en: "Release", pt: "Lançamento" },
  ] satisfies Localized[],
  current: 0,
  /** What already works */
  today: [
    {
      en: "Five preset engines: inline-4, inline-6, cross-plane and flat-plane V8, and a boxer four, each with a researched exhaust.",
      pt: "Cinco motores prontos: 4 em linha, 6 em linha, V8 cross-plane e flat-plane e um boxer de quatro, cada um com um escape pesquisado.",
    },
    {
      en: "The sound rendered the way a listener hears it: behind the car, beside it, or from the driver's seat.",
      pt: "O som renderizado como quem ouve: atrás do carro, ao lado dele ou no banco do motorista.",
    },
    {
      en: "Physics from the gas up: cams, valves, combustion, a rev limiter, and pressure waves running through the pipes.",
      pt: "Física a partir do gás: comandos, válvulas, combustão, corte de giro e ondas de pressão correndo pelos tubos.",
    },
    {
      en: "251 native tests and almost 5 million checks.",
      pt: "251 testes nativos e quase 5 milhões de verificações.",
    },
  ] satisfies Localized[],
  /** On the dyno: the simulation's peaks against the real engines' published ones */
  dyno: [
    {
      engine: { en: "2.0 L inline-4", pt: "2.0 L 4 em linha" },
      real: "Toyota 1AZ-FE",
      torque: [188, 190],
      power: [113, 108],
    },
    {
      engine: { en: "3.0 L inline-6", pt: "3.0 L 6 em linha" },
      real: "BMW M54B30",
      torque: [297, 300],
      power: [167, 170],
    },
    {
      engine: { en: "2.0 L flat-4", pt: "2.0 L boxer 4" },
      real: "Subaru FB20",
      torque: [188, 196],
      power: [112, 110],
    },
  ] satisfies {
    engine: Localized;
    real: string;
    torque: [number, number];
    power: [number, number];
  }[],
  stack: ["C11", "WebAssembly", "AudioWorklet", "TypeScript", "Vite"],
};

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
    year: "2024",
    title: { en: "First interactions with code", pt: "Primeiros contatos com código" },
    text: {
      en: "Tutorials, tiny experiments and a lot of trial and error.",
      pt: "Tutoriais, pequenos experimentos e muita tentativa e erro.",
    },
  },
  {
    id: "first-programs",
    year: "2025",
    title: { en: "First programs", pt: "Primeiros programas" },
    text: {
      en: "Small programs written from start to finish, bugs included.",
      pt: "Pequenos programas escritos do começo ao fim, com bugs e tudo.",
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
      en: "Algorithms, data structures and a lot of late nights.",
      pt: "Algoritmos, estruturas de dados e muitas noites viradas.",
    },
  },
  {
    id: "portfolio",
    year: "2026",
    title: { en: "Launched this portfolio", pt: "Lancei este portfólio" },
    text: {
      en: "My first serious 3D project on the web.",
      pt: "Meu primeiro projeto sério de 3D na web.",
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
