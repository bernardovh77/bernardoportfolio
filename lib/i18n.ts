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

/** Text that is either the same in both languages or written in each. */
export function localize(value: string | Localized, lang: Lang): string {
  return typeof value === "string" ? value : value[lang];
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
  redline: {
    kicker: "Sector D-04 · Night session",
    title: "Redline",
    lead: "Outside of code, I'm a car person: turbos, ECUs, engine sound, and how it all comes together on the road. This lap is where that side takes the wheel.",
    start: "Start the lap",
    dyno: {
      kicker: "Sector 1 · On the dyno",
      title: "The project I'm building",
      stages: (done: number, total: number) => `${done} of ${total} stages done`,
      updated: "Updated",
      roadmap: "The lap ahead",
      now: "Now",
      today: "What works today",
      sheet: "Dyno sheet",
      sheetIntro: "Its engines against the real ones' published peaks",
      engine: "Engine",
      real: "Real engine",
      legend: "First number: REV-BENCH. Second: the real engine.",
      torque: "Torque",
      power: "Power",
      stack: "Stack",
      code: "Source code",
    },
    finish: {
      kicker: "Chequered flag",
      title: "Lap complete",
      text: "That's the lap. Thanks for riding along.",
    },
    leave: "Leave the track",
    leaveShort: "Exit",
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
      "travel city|desert|ocean|redline ... switch district",
      "lang en|pt ....... switch language",
      "music ............ play or pause the music",
      "clear ............ clear the screen",
    ],
    notFound: (cmd: string) => `command not found: ${cmd}. Type help.`,
    opening: (what: string) => `opening ${what}...`,
    travel: (name: string) => `traveling to ${name}...`,
    travelUsage: "usage: travel city | desert | ocean | redline",
    langUsage: "usage: lang en | pt",
    langSet: "language set to English",
    hire: "permission granted. Bernardo is excited to talk. Run: email",
    musicOn: (track: string) => `now playing: ${track}`,
    musicOff: "music paused",
    musicMissing: "no track loaded",
  },
  hud: {
    district: "District",
    localTime: "Local time",
    travel: "Travel",
    depth: "Depth",
    shortcut: "Press 1 to 4",
    traveling: "Traveling to",
    toTrack: "Heading to the track",
    fromTrack: "Leaving the track for",
    lap: "Lap",
  },
  music: {
    nowPlaying: "Now playing",
    ready: "Starts on your first click",
    paused: "Music paused",
    play: "Play music",
    pause: "Pause music",
  },
  themes: {
    city: { name: "Megacity", tagline: "Rain, towers and endless traffic" },
    desert: { name: "Synth Desert", tagline: "A neon highway into the sunset" },
    ocean: { name: "Data Ocean", tagline: "Glowing tides under a holo-moon" },
    redline: { name: "Redline", tagline: "A night circuit, and the project on the dyno" },
  },
  drive: {
    /** What each ride is called, per vehicle (the desert car, the Megacity's sky taxi) */
    vehicles: {
      car: {
        name: "NV-77",
        signTip: "Hitch a ride",
        leave: "Leave car",
        lookOut: "Look at the road",
        view: "Road view",
        menu: "Car menu",
        terminalGo: "unlocking the car on lane 2... hold on",
      },
      ship: {
        name: "SKY-77",
        signTip: "Hail a sky taxi",
        leave: "Leave ship",
        lookOut: "Look outside",
        view: "Look outside",
        menu: "Ship menu",
        terminalGo: "hailing a sky taxi on lane 7... doors opening",
      },
    },
    /** The little photo in each vehicle, zoomed in */
    photo: { label: "Photo", alt: "Bernardo with someone special", close: "Close" },
    linking: "Linking to vehicle",
    unlinking: "Back to the site",
    autopilot: "Autopilot",
    lookScreen: "Look at the screen",
    controls: "Controls",
    /** The V (view) and ` (menu) hints are added per vehicle */
    hints: {
      boot: [["", "Booting the console…"]],
      menu: [
        ["← ↑ ↓ →", "Choose"],
        ["Enter", "Play"],
        ["Esc", "Leave"],
      ],
      racer: [
        ["← →", "Change lanes"],
        ["↑ ↓", "Boost / brake"],
        ["Esc", "Menu"],
      ],
      snake: [
        ["← ↑ ↓ →", "Steer"],
        ["Esc", "Menu"],
      ],
      breaker: [
        ["← → / mouse", "Move"],
        ["Space", "Launch"],
        ["Esc", "Menu"],
      ],
      doom: [
        ["W A S D", "Move"],
        ["← →", "Turn"],
        ["F / Click", "Fire"],
        ["E / Space", "Use"],
        ["Shift", "Run"],
        ["1–7", "Weapons"],
      ],
      doomLoading: [["Esc", "Back"]],
    } as Record<string, [string, string][]>,
    touch: { fire: "Fire", use: "Use", ok: "OK", back: "Back", menu: "Menu" },
    doomCredit: "DOOM © 1993 id Software · free shareware episode · engine GPL-2.0",
    doomSource: "Source & credits",
    terminalNoRoad: "no highway or sky lanes in this district. try: travel desert · travel city",
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
  redline: {
    kicker: "Setor D-04 · Sessão noturna",
    title: "Redline",
    lead: "Fora do código, sou apaixonado por carro: turbo, ECU, som de motor e como tudo isso se junta na estrada. Nesta volta, esse lado assume o volante.",
    start: "Começar a volta",
    dyno: {
      kicker: "Setor 1 · No dinamômetro",
      title: "O projeto que estou construindo",
      stages: (done: number, total: number) => `${done} de ${total} etapas concluídas`,
      updated: "Atualizado em",
      roadmap: "A volta pela frente",
      now: "Agora",
      today: "O que já funciona",
      sheet: "Ficha do dinamômetro",
      sheetIntro: "Os motores dele contra os picos publicados dos motores reais",
      engine: "Motor",
      real: "Motor real",
      legend: "Primeiro número: REV-BENCH. Segundo: o motor real.",
      torque: "Torque",
      power: "Potência",
      stack: "Tecnologias",
      code: "Código-fonte",
    },
    finish: {
      kicker: "Bandeira quadriculada",
      title: "Volta completa",
      text: "Essa foi a volta. Valeu por vir junto.",
    },
    leave: "Sair da pista",
    leaveShort: "Sair",
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
      "travel city|desert|ocean|redline ... troca de distrito",
      "lang en|pt ....... troca o idioma",
      "music ............ toca ou pausa a música",
      "clear ............ limpa a tela",
    ],
    notFound: (cmd: string) => `comando não encontrado: ${cmd}. Digite help.`,
    opening: (what: string) => `abrindo ${what}...`,
    travel: (name: string) => `viajando para ${name}...`,
    travelUsage: "uso: travel city | desert | ocean | redline",
    langUsage: "uso: lang en | pt",
    langSet: "idioma alterado para português",
    hire: "permissão concedida. O Bernardo adoraria conversar. Rode: email",
    musicOn: (track: string) => `tocando agora: ${track}`,
    musicOff: "música pausada",
    musicMissing: "nenhuma faixa carregada",
  },
  hud: {
    district: "Distrito",
    localTime: "Hora local",
    travel: "Viajar",
    depth: "Profundidade",
    shortcut: "Aperte de 1 a 4",
    traveling: "Viajando para",
    toTrack: "Indo para a pista",
    fromTrack: "Saindo da pista para",
    lap: "Volta",
  },
  music: {
    nowPlaying: "Tocando agora",
    ready: "Começa no seu primeiro clique",
    paused: "Música pausada",
    play: "Tocar música",
    pause: "Pausar música",
  },
  themes: {
    city: { name: "Megacidade", tagline: "Chuva, arranha-céus e tráfego sem fim" },
    desert: { name: "Deserto Synth", tagline: "Uma estrada neon rumo ao pôr do sol" },
    ocean: { name: "Oceano de Dados", tagline: "Marés luminosas sob uma lua holográfica" },
    redline: { name: "Redline", tagline: "Um circuito noturno e o projeto no dinamômetro" },
  },
  drive: {
    vehicles: {
      car: {
        name: "NV-77",
        signTip: "Pegar carona",
        leave: "Sair do carro",
        lookOut: "Olhar a estrada",
        view: "Ver a estrada",
        menu: "Menu do carro",
        terminalGo: "destrancando o carro da faixa 2... segura aí",
      },
      ship: {
        name: "SKY-77",
        signTip: "Chamar um táxi aéreo",
        leave: "Sair da nave",
        lookOut: "Olhar lá fora",
        view: "Olhar lá fora",
        menu: "Menu da nave",
        terminalGo: "chamando um táxi aéreo na faixa 7... abrindo as portas",
      },
    },
    photo: { label: "Foto", alt: "Bernardo com alguém especial", close: "Fechar" },
    linking: "Conectando ao veículo",
    unlinking: "Voltando ao site",
    autopilot: "Piloto automático",
    lookScreen: "Olhar a tela",
    controls: "Controles",
    hints: {
      boot: [["", "Ligando o painel…"]],
      menu: [
        ["← ↑ ↓ →", "Escolher"],
        ["Enter", "Jogar"],
        ["Esc", "Sair"],
      ],
      racer: [
        ["← →", "Trocar de faixa"],
        ["↑ ↓", "Acelerar / frear"],
        ["Esc", "Menu"],
      ],
      snake: [
        ["← ↑ ↓ →", "Guiar"],
        ["Esc", "Menu"],
      ],
      breaker: [
        ["← → / mouse", "Mover"],
        ["Espaço", "Lançar"],
        ["Esc", "Menu"],
      ],
      doom: [
        ["W A S D", "Andar"],
        ["← →", "Virar"],
        ["F / Clique", "Atirar"],
        ["E / Espaço", "Usar"],
        ["Shift", "Correr"],
        ["1–7", "Armas"],
      ],
      doomLoading: [["Esc", "Voltar"]],
    },
    touch: { fire: "Atirar", use: "Usar", ok: "OK", back: "Voltar", menu: "Menu" },
    doomCredit: "DOOM © 1993 id Software · episódio shareware gratuito · motor GPL-2.0",
    doomSource: "Código e créditos",
    terminalNoRoad:
      "não tem estrada nem rota aérea neste distrito. tente: travel desert · travel city",
  },
  footer: {
    built: "Feito com Next.js, Three.js e muito neon.",
    top: "Voltar ao topo",
  },
};

export const ui: Record<Lang, UiStrings> = { en, pt };
