import { createRandom } from "@/lib/random";
import type { Project } from "@/lib/content";

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
