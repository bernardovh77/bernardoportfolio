import { createRandom } from "@/lib/random";
import type { Project, WipProject } from "@/lib/content";

/**
 * Generated cover art for each project card. It uses the district colors,
 * so every cover changes with the theme. Replace with screenshots later
 * (put images in /public and use next/image).
 */
export function ShardArt({ variant, id }: { variant: Project["art"]; id: string }) {
  const gid = `art-${id}`;
  return (
    <svg
      className="shard__art"
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--void)" />
          <stop offset="1" stopColor="var(--abyss)" />
        </linearGradient>
        <linearGradient id={`${gid}-glow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--b)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--b)" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${gid}-sky)`} />
      {variant === "skyline" && <Skyline gid={gid} />}
      {variant === "grid" && <Grid />}
      {variant === "orbit" && <Orbit />}
      {variant === "wave" && <Wave />}
      <rect width="400" height="240" fill="url(#scanlines)" opacity="0.5" />
    </svg>
  );
}

function Skyline({ gid }: { gid: string }) {
  const rnd = createRandom(3);
  const buildings = [];
  let x = -10;
  while (x < 410) {
    const w = rnd.range(18, 42);
    const h = rnd.range(40, 150);
    buildings.push({ x, w, h, lit: rnd.next() });
    x += w + rnd.range(1, 5);
  }
  return (
    <g>
      <rect y="120" width="400" height="80" fill={`url(#${gid}-glow)`} />
      <circle cx="292" cy="78" r="34" fill="var(--b)" opacity="0.85" />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={200 - b.h}
            width={b.w}
            height={b.h}
            fill="var(--void)"
            stroke="var(--a)"
            strokeOpacity="0.4"
            strokeWidth="0.8"
          />
          {b.lit > 0.45 && (
            <rect x={b.x + 3} y={200 - b.h + 6} width={b.w - 6} height="2" fill="var(--a)" />
          )}
        </g>
      ))}
      <rect y="199" width="400" height="2" fill="var(--a)" />
      <rect y="201" width="400" height="39" fill="var(--a)" opacity="0.06" />
    </g>
  );
}

function Grid() {
  const rnd = createRandom(8);
  const bars = Array.from({ length: 9 }, () => rnd.range(24, 92));
  return (
    <g>
      {Array.from({ length: 13 }, (_, i) => {
        const x = -200 + i * 66;
        return (
          <line
            key={`v${i}`}
            x1="200"
            y1="110"
            x2={x}
            y2="260"
            stroke="var(--a)"
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
        );
      })}
      {Array.from({ length: 7 }, (_, i) => {
        const y = 110 + Math.pow(i / 6, 1.8) * 130;
        return (
          <line
            key={`h${i}`}
            x1="0"
            y1={y}
            x2="400"
            y2={y}
            stroke="var(--a)"
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
        );
      })}
      <line x1="0" y1="110" x2="400" y2="110" stroke="var(--b)" strokeWidth="1.5" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={70 + i * 30}
          y={104 - h}
          width="16"
          height={h}
          fill="var(--b)"
          opacity={0.35 + (i % 3) * 0.2}
        />
      ))}
      <polyline
        points={bars.map((h, i) => `${78 + i * 30},${100 - h}`).join(" ")}
        fill="none"
        stroke="var(--signal)"
        strokeWidth="2"
      />
    </g>
  );
}

function Orbit() {
  const rnd = createRandom(15);
  const nodes = Array.from({ length: 14 }, (_, i) => {
    const ring = 1 + (i % 3);
    const angle = rnd.range(0, Math.PI * 2);
    return { x: 200 + Math.cos(angle) * ring * 52, y: 120 + Math.sin(angle) * ring * 26, ring };
  });
  return (
    <g>
      {[1, 2, 3].map((ring) => (
        <ellipse
          key={ring}
          cx="200"
          cy="120"
          rx={ring * 52}
          ry={ring * 26}
          fill="none"
          stroke="var(--a)"
          strokeOpacity="0.45"
          strokeDasharray={ring === 2 ? "4 6" : undefined}
        />
      ))}
      {nodes.map((node, i) =>
        i > 0 && i % 2 === 0 ? (
          <line
            key={`l${i}`}
            x1={node.x}
            y1={node.y}
            x2={nodes[i - 1].x}
            y2={nodes[i - 1].y}
            stroke="var(--b)"
            strokeOpacity="0.5"
          />
        ) : null,
      )}
      {nodes.map((node, i) => (
        <circle
          key={i}
          cx={node.x}
          cy={node.y}
          r={node.ring === 1 ? 4 : 3}
          fill={i % 4 === 0 ? "var(--signal)" : "var(--a)"}
        />
      ))}
      <circle cx="200" cy="120" r="14" fill="var(--b)" />
      <circle cx="200" cy="120" r="22" fill="none" stroke="var(--b)" strokeOpacity="0.5" />
    </g>
  );
}

function Wave() {
  const rnd = createRandom(21);
  const bars = Array.from({ length: 24 }, () => rnd.range(10, 120));
  const sorted = bars.map((h, i) => (i < 12 ? [...bars.slice(0, 12)].sort((a, b) => a - b)[i] : h));
  const path = Array.from({ length: 41 }, (_, i) => {
    const x = i * 10;
    const y = 70 + Math.sin(i * 0.45) * 26;
    return `${i === 0 ? "M" : "L"}${x},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <g>
      {sorted.map((h, i) => (
        <rect
          key={i}
          x={20 + i * 15.5}
          y={220 - h}
          width="11"
          height={h}
          fill={i < 12 ? "var(--a)" : "var(--b)"}
          opacity={i < 12 ? 0.85 : 0.45}
        />
      ))}
      <path d={path} fill="none" stroke="var(--signal)" strokeWidth="2" />
      <rect x="200" y="60" width="2" height="170" fill="var(--signal)" opacity="0.8" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Blueprints for projects still being built                           */
/* ------------------------------------------------------------------ */

const GROUND = 214;

// Top and bottom of each drawing, used to place the "built up to here" line
const EXTENT: Record<WipProject["art"], [number, number]> = {
  tower: [30, GROUND],
  dome: [94, GROUND],
  gear: [46, 202],
};

const f = (n: number) => n.toFixed(1);

function towerPath() {
  const d: string[] = [];
  const [l, r, top, depthX, depthY] = [150, 240, 64, 36, 18];
  const floors = 8;
  d.push(`M${l} ${GROUND}V${top}H${r}V${GROUND}`);
  d.push(`M${r} ${top}l${depthX} ${-depthY}V${GROUND - depthY}L${r} ${GROUND}`);
  d.push(`M${l} ${top}l${depthX} ${-depthY}H${r + depthX}`);
  for (let i = 1; i < floors; i++) {
    const y = GROUND - ((GROUND - top) * i) / floors;
    d.push(`M${l} ${f(y)}H${r}l${depthX} ${-depthY}`);
  }
  for (let i = 0; i < floors; i++) {
    const y0 = GROUND - ((GROUND - top) * i) / floors;
    const y1 = GROUND - ((GROUND - top) * (i + 1)) / floors;
    d.push(i % 2 === 0 ? `M${l} ${f(y0)}L${r} ${f(y1)}` : `M${r} ${f(y0)}L${l} ${f(y1)}`);
  }
  // Crane on the roof
  d.push("M195 64V30M165 34H330M195 30L330 34M195 30L165 34M310 34V74M304 74h12v8h-12z");
  return d.join("");
}

function domePath() {
  const cx = 200;
  const radius = 120;
  const rings = [0, 22.5, 45, 67.5].map((deg) => (deg * Math.PI) / 180);
  const counts = [10, 8, 6, 3];
  const d: string[] = [
    `M${cx - radius} ${GROUND}A${radius} ${radius} 0 0 1 ${cx + radius} ${GROUND}`,
  ];
  const points = rings.map((e, k) => {
    const y = GROUND - radius * Math.sin(e);
    const hw = radius * Math.cos(e);
    return Array.from({ length: counts[k] + 1 }, (_, j) => {
      const a = (Math.PI * j) / counts[k];
      return [cx + hw * Math.cos(a), y] as const;
    });
  });
  points.forEach((ring) =>
    d.push(`M${f(ring[0][0])} ${f(ring[0][1])}H${f(ring[ring.length - 1][0])}`),
  );
  // Triangles between neighbouring rings
  for (let k = 0; k < points.length - 1; k++) {
    const lower = points[k];
    const upper = points[k + 1];
    lower.forEach(([x, y], j) => {
      const target = upper[Math.round((j / (lower.length - 1)) * (upper.length - 1))];
      d.push(`M${f(x)} ${f(y)}L${f(target[0])} ${f(target[1])}`);
    });
  }
  const apexY = GROUND - radius;
  points[points.length - 1].forEach(([x, y]) => d.push(`M${f(x)} ${f(y)}L${cx} ${apexY}`));
  return d.join("");
}

function gearPath() {
  const [cx, cy] = [200, 124];
  const teeth = 12;
  const outer = 78;
  const root = 64;
  const pts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const w = (Math.PI * 2) / teeth;
    for (const [da, r] of [
      [0, root],
      [w * 0.18, outer],
      [w * 0.5, outer],
      [w * 0.68, root],
    ] as const) {
      pts.push(`${f(cx + Math.cos(a + da) * r)} ${f(cy + Math.sin(a + da) * r)}`);
    }
  }
  const d = [`M${pts.join("L")}Z`];
  d.push(`M${cx + 20} ${cy}A20 20 0 1 0 ${cx - 20} ${cy}A20 20 0 1 0 ${cx + 20} ${cy}`);
  d.push(`M${cx + 54} ${cy}A54 54 0 1 0 ${cx - 54} ${cy}A54 54 0 1 0 ${cx + 54} ${cy}`);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    d.push(
      `M${f(cx + Math.cos(a) * 20)} ${f(cy + Math.sin(a) * 20)}L${f(cx + Math.cos(a) * 54)} ${f(cy + Math.sin(a) * 54)}`,
    );
  }
  d.push("M140 214L172 184M260 214L228 184");
  return d.join("");
}

const PATHS: Record<WipProject["art"], string> = {
  tower: towerPath(),
  dome: domePath(),
  gear: gearPath(),
};

/**
 * A blueprint drawing that is solid up to how far the project has got,
 * and dashed above it, like the holograms being built in the Underworks.
 */
export function BlueprintArt({
  kind,
  id,
  progress,
}: {
  kind: WipProject["art"];
  id: string;
  progress: number;
}) {
  const gid = `bp-${id}`;
  const [top, bottom] = EXTENT[kind];
  const front = bottom - (Math.min(100, Math.max(0, progress)) / 100) * (bottom - top);
  const path = PATHS[kind];
  return (
    <svg
      className="shard__art"
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${gid}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="var(--signal)" strokeOpacity="0.12" />
        </pattern>
        <pattern
          id={`${gid}-hazard`}
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="10" height="20" fill="var(--a)" />
        </pattern>
        <clipPath id={`${gid}-built`}>
          <rect y={front} width="400" height={240 - front} />
        </clipPath>
        <clipPath id={`${gid}-todo`}>
          <rect width="400" height={front} />
        </clipPath>
      </defs>
      <rect width="400" height="240" fill="var(--void)" />
      <rect width="400" height="240" fill={`url(#${gid}-grid)`} />
      <g fill="none" stroke="var(--signal)" strokeWidth="1.5" strokeLinejoin="round">
        <path d={path} clipPath={`url(#${gid}-todo)`} strokeOpacity="0.32" strokeDasharray="4 6" />
        <path d={path} clipPath={`url(#${gid}-built)`} />
      </g>
      <line
        x1="24"
        x2="376"
        y1={front}
        y2={front}
        stroke="var(--signal)"
        strokeWidth="6"
        strokeOpacity="0.18"
      />
      <line x1="24" x2="376" y1={front} y2={front} stroke="var(--signal)" strokeWidth="1.2" />
      <line x1="16" x2="384" y1={GROUND} y2={GROUND} stroke="var(--a)" strokeWidth="1.5" />
      <rect y="226" width="400" height="14" fill="var(--void)" />
      <rect y="226" width="400" height="14" fill={`url(#${gid}-hazard)`} opacity="0.75" />
      <rect width="400" height="240" fill="url(#scanlines)" opacity="0.45" />
    </svg>
  );
}
