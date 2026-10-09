// 시드 데이터용 샘플 그림을 SVG 로 절차적으로 생성한다. (저작권 문제가 없는 추상/풍경 그림)

export type ArtStyle =
  | "sunset"
  | "city"
  | "pastel"
  | "spheres"
  | "waves"
  | "pixel"
  | "ink"
  | "lowpoly"
  | "blossom"
  | "aurora";

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    int: (min: number, max: number) => Math.floor(min + (max - min + 1) * next()),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof rng>;

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${((h % 360) + 360) % 360.0} ${s}% ${l}% / ${a})`;

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function gradientStops(colors: string[]): string {
  return colors.map((c, i) => `<stop offset="${(i / (colors.length - 1)) * 100}%" stop-color="${c}"/>`).join("");
}

function ridge(r: Rng, w: number, h: number, baseY: number, amp: number, steps: number, smooth = true): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) pts.push([(w * i) / steps, baseY - r.range(0.15, 1) * amp]);
  let d = `M0 ${h} L0 ${pts[0][1].toFixed(1)}`;
  if (smooth) {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const mx = (x0 + x1) / 2;
      d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
    }
    d += ` L${w} ${pts[pts.length - 1][1].toFixed(1)}`;
  } else {
    for (const [x, y] of pts) d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L${w} ${h} Z`;
}

function stars(r: Rng, w: number, h: number, count: number, maxY: number): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    s += `<circle cx="${r.range(0, w).toFixed(1)}" cy="${r.range(0, maxY).toFixed(1)}" r="${r.range(0.4, 1.8).toFixed(2)}" fill="#fff" opacity="${r.range(0.3, 1).toFixed(2)}"/>`;
  }
  return s;
}

function sunset(r: Rng, w: number, h: number) {
  const palettes = [
    ["#2b1055", "#7597de", "#ffb88c"],
    ["#ff7e5f", "#feb47b", "#ffe29f"],
    ["#355c7d", "#c06c84", "#f8b195"],
    ["#0f2027", "#2c5364", "#f0c27b"],
    ["#41295a", "#d76d77", "#ffaf7b"],
  ];
  const p = r.pick(palettes);
  const sunX = w * r.range(0.25, 0.75);
  const sunY = h * r.range(0.3, 0.5);
  const sunR = Math.min(w, h) * r.range(0.07, 0.14);
  let layers = "";
  const dark = r.pick(["#1b1035", "#0d1b2a", "#2d132c", "#10172a"]);
  for (let i = 0; i < 5; i++) {
    const base = h * (0.52 + i * 0.1);
    layers += `<path d="${ridge(r, w, h, base, h * (0.16 - i * 0.02), r.int(6, 12))}" fill="${lerpHex(p[2], dark, 0.35 + i * 0.16)}"/>`;
  }
  let birds = "";
  if (r.chance(0.6)) {
    for (let i = 0; i < r.int(3, 7); i++) {
      const bx = r.range(w * 0.1, w * 0.9);
      const by = r.range(h * 0.12, h * 0.35);
      const s = r.range(5, 11);
      birds += `<path d="M${bx - s} ${by} q${s / 2} -${s / 2} ${s} 0 q${s / 2} -${s / 2} ${s} 0" stroke="${dark}" stroke-width="1.6" fill="none" opacity=".7"/>`;
    }
  }
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${gradientStops(p)}</linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${sunR * 0.6}"/></filter></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    <circle cx="${sunX}" cy="${sunY}" r="${sunR * 1.8}" fill="#fff3d1" opacity=".55" filter="url(#glow)"/>
    <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="#fff6e0"/>${birds}${layers}`;
}

function city(r: Rng, w: number, h: number) {
  const hue = r.pick([260, 280, 220, 320, 200]);
  const neon = [r.pick(["#ff2e88", "#ff4ecd", "#ff6b3d"]), r.pick(["#22d3ee", "#4ade80", "#60a5fa"])];
  let rows = "";
  for (let row = 0; row < 3; row++) {
    const shade = hsl(hue, 35, 8 + row * 4);
    let x = -r.range(0, 30);
    while (x < w) {
      const bw = r.range(w * 0.05, w * 0.13);
      const bh = r.range(h * 0.18, h * 0.5) * (1 - row * 0.18);
      const top = h * (0.88 - row * 0.02) - bh;
      rows += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(h - top).toFixed(1)}" fill="${shade}"/>`;
      if (row > 0) {
        const cols = Math.max(2, Math.floor(bw / 9));
        const lines = Math.floor(bh / 12);
        for (let cy = 0; cy < lines; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            if (!r.chance(0.35)) continue;
            const c = r.pick(["#ffd68a", "#ffe8b0", neon[1], neon[0]]);
            rows += `<rect x="${(x + 3 + cx * (bw - 6) / cols).toFixed(1)}" y="${(top + 6 + cy * 12).toFixed(1)}" width="${((bw - 6) / cols - 3).toFixed(1)}" height="6" fill="${c}" opacity="${r.range(0.4, 0.95).toFixed(2)}"/>`;
          }
        }
      }
      x += bw + r.range(0, 6);
    }
  }
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${gradientStops([hsl(hue, 60, 6), hsl(hue, 55, 18), hsl(hue + 40, 60, 32)])}</linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${neon[0]}" stop-opacity="0"/><stop offset="1" stop-color="${neon[0]}" stop-opacity=".45"/></linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="6"/></filter></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>${stars(r, w, h, 70, h * 0.5)}
    <circle cx="${w * r.range(0.15, 0.85)}" cy="${h * r.range(0.1, 0.25)}" r="${Math.min(w, h) * 0.05}" fill="#f1f5ff" opacity=".9"/>
    <rect y="${h * 0.55}" width="${w}" height="${h * 0.45}" fill="url(#haze)"/>${rows}
    <rect y="${h * 0.9}" width="${w}" height="3" fill="${neon[1]}" filter="url(#blur)"/>
    <rect y="${h * 0.9}" width="${w}" height="${h * 0.1}" fill="${hsl(hue, 40, 5)}"/>
    <rect y="${h * 0.93}" width="${w}" height="2" fill="${neon[0]}" opacity=".6" filter="url(#blur)"/>`;
}

function sparkle(x: number, y: number, s: number, op: number) {
  return `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z" fill="#fff" opacity="${op.toFixed(2)}"/>`;
}

function pastel(r: Rng, w: number, h: number) {
  const base = r.range(0, 360);
  let blobs = "";
  for (let i = 0; i < 7; i++) {
    blobs += `<circle cx="${r.range(0, w).toFixed(0)}" cy="${r.range(0, h).toFixed(0)}" r="${r.range(0.18, 0.4) * Math.max(w, h)}" fill="${hsl(base + r.range(-60, 80), 90, r.range(72, 85))}" opacity=".75"/>`;
  }
  let sp = "";
  for (let i = 0; i < 28; i++) sp += sparkle(r.range(0, w), r.range(0, h), r.range(3, 14), r.range(0.4, 0.95));
  const ringR = Math.min(w, h) * r.range(0.22, 0.32);
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${gradientStops([hsl(base, 80, 86), hsl(base + 50, 70, 80), hsl(base + 110, 75, 84)])}</linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.max(w, h) * 0.06}"/></filter></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/><g filter="url(#soft)">${blobs}</g>
    <circle cx="${w / 2}" cy="${h * 0.45}" r="${ringR}" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
    <circle cx="${w / 2}" cy="${h * 0.45}" r="${ringR * 1.15}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2 9" opacity=".6"/>${sp}`;
}

function spheres(r: Rng, w: number, h: number) {
  const studio = r.chance(0.5);
  const floorY = h * r.range(0.6, 0.7);
  const hue = r.range(0, 360);
  let defs = "";
  let body = "";
  const n = r.int(3, 6);
  const items = Array.from({ length: n }, (_, i) => ({ i, rad: Math.min(w, h) * r.range(0.07, 0.18), x: r.range(0.12, 0.88) * w }));
  items.sort((a, b) => b.rad - a.rad);
  for (const s of items) {
    const c = hsl(hue + r.range(-50, 120), r.range(55, 85), r.range(45, 62));
    defs += `<radialGradient id="s${s.i}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".18" stop-color="${c}"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></radialGradient>`;
    const cy = floorY - s.rad + r.range(0, h * 0.12);
    body += `<ellipse cx="${s.x + s.rad * 0.25}" cy="${cy + s.rad * 0.95}" rx="${s.rad * 1.1}" ry="${s.rad * 0.25}" fill="#000" opacity=".45" filter="url(#sh)"/>`;
    body += `<circle cx="${s.x}" cy="${cy}" r="${s.rad}" fill="url(#s${s.i})"/>`;
  }
  const bg = studio ? ["#e9e4dc", "#cfc6b8"] : [hsl(hue, 40, 14), hsl(hue + 30, 45, 6)];
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${gradientStops(bg)}</linearGradient>
    <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">${gradientStops(studio ? ["#d8d0c4", "#bfb5a6"] : [hsl(hue, 30, 18), hsl(hue, 30, 9)])}</linearGradient>
    <filter id="sh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>${defs}</defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/><rect y="${floorY}" width="${w}" height="${h - floorY}" fill="url(#fl)"/>${body}`;
}

function waves(r: Rng, w: number, h: number) {
  const night = r.chance(0.4);
  const sky = night ? ["#0b1026", "#1c2a5a", "#3b4f8a"] : ["#8ec5fc", "#c9e4ff", "#fbe3c3"];
  let layers = "";
  const n = 7;
  for (let i = 0; i < n; i++) {
    const y0 = h * (0.5 + i * 0.075);
    const amp = h * r.range(0.01, 0.025) * (1 + i * 0.3);
    const freq = r.range(1.5, 3.5);
    const phase = r.range(0, Math.PI * 2);
    let d = `M0 ${h} L0 ${y0}`;
    for (let x = 0; x <= w; x += w / 60) d += ` L${x.toFixed(1)} ${(y0 + Math.sin((x / w) * Math.PI * 2 * freq + phase) * amp).toFixed(1)}`;
    d += ` L${w} ${h} Z`;
    const col = night ? hsl(225, 55, 30 - i * 3.5) : hsl(205, 70, 55 - i * 5);
    layers += `<path d="${d}" fill="${col}"/><path d="${d.replace(/ L\d+ \d+ Z$/, "")}" fill="none" stroke="#fff" stroke-opacity="${0.12 + i * 0.03}" stroke-width="1.2"/>`;
  }
  const orb = night ? "#f4f1de" : "#fff7e0";
  const orbX = w * r.range(0.2, 0.8);
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${gradientStops(sky)}</linearGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="20"/></filter></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>${night ? stars(r, w, h, 60, h * 0.45) : ""}
    <circle cx="${orbX}" cy="${h * 0.36}" r="${Math.min(w, h) * 0.12}" fill="${orb}" opacity=".6" filter="url(#glow)"/>
    <circle cx="${orbX}" cy="${h * 0.36}" r="${Math.min(w, h) * 0.065}" fill="${orb}"/>${layers}`;
}

function pixel(r: Rng, w: number, h: number) {
  const cell = Math.round(w / 48);
  const cols = Math.ceil(w / cell);
  const rowsN = Math.ceil(h / cell);
  const skies = [
    ["#2e2157", "#553c8b", "#9a4f9e", "#f28c8c"],
    ["#5dade2", "#85c1e9", "#aed6f1", "#d6eaf8"],
    ["#1b2631", "#283747", "#2e4053", "#566573"],
  ];
  const sky = r.pick(skies);
  let s = "";
  const band = Math.ceil(rowsN * 0.6 / sky.length);
  sky.forEach((c, i) => (s += `<rect x="0" y="${i * band * cell}" width="${w}" height="${band * cell + cell}" fill="${c}"/>`));
  // 해 (블록 원)
  const sx = r.int(8, cols - 8);
  const sy = r.int(5, Math.floor(rowsN * 0.3));
  const sr = r.int(3, 5);
  for (let y = -sr; y <= sr; y++)
    for (let x = -sr; x <= sr; x++)
      if (x * x + y * y <= sr * sr) s += `<rect x="${(sx + x) * cell}" y="${(sy + y) * cell}" width="${cell}" height="${cell}" fill="#ffe29a"/>`;
  // 구름
  for (let c = 0; c < 3; c++) {
    const cx = r.int(0, cols), cy = r.int(3, Math.floor(rowsN * 0.35)), len = r.int(4, 9);
    s += `<rect x="${cx * cell}" y="${cy * cell}" width="${len * cell}" height="${cell * 2}" fill="#fff" opacity=".85"/><rect x="${(cx + 1) * cell}" y="${(cy - 1) * cell}" width="${(len - 3) * cell}" height="${cell}" fill="#fff" opacity=".85"/>`;
  }
  // 산 두 겹 + 땅
  const layers = [
    { base: 0.62, amp: 0.25, color: "#4a3f6b" },
    { base: 0.72, amp: 0.16, color: "#2f6b4f" },
  ];
  for (const L of layers) {
    let height = r.range(0.3, 1);
    for (let x = 0; x < cols; x++) {
      height = Math.min(1, Math.max(0.1, height + r.range(-0.12, 0.12)));
      const top = Math.round(rowsN * (L.base - L.amp * height));
      s += `<rect x="${x * cell}" y="${top * cell}" width="${cell}" height="${h}" fill="${L.color}"/>`;
    }
  }
  const ground = Math.round(rowsN * 0.82);
  s += `<rect x="0" y="${ground * cell}" width="${w}" height="${h}" fill="#3e8e41"/><rect x="0" y="${(ground + 2) * cell}" width="${w}" height="${h}" fill="#7a5230"/>`;
  for (let t = 0; t < r.int(2, 4); t++) {
    const tx = r.int(2, cols - 4);
    s += `<rect x="${(tx + 1) * cell}" y="${(ground - 3) * cell}" width="${cell}" height="${3 * cell}" fill="#5d4037"/>`;
    s += `<rect x="${tx * cell}" y="${(ground - 6) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#1b5e20"/><rect x="${(tx + 1) * cell}" y="${(ground - 7) * cell}" width="${cell}" height="${cell}" fill="#1b5e20"/>`;
  }
  return `<g shape-rendering="crispEdges">${s}</g>`;
}

function ink(r: Rng, w: number, h: number) {
  let defs = "";
  let layers = "";
  for (let i = 0; i < 4; i++) {
    const base = h * (0.45 + i * 0.13);
    const grey = 70 - i * 14;
    defs += `<linearGradient id="m${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(30 8% ${grey - 30}%)" stop-opacity="${0.55 + i * 0.12}"/><stop offset=".55" stop-color="hsl(30 8% ${grey}%)" stop-opacity=".15"/><stop offset="1" stop-color="#efe6d2" stop-opacity="0"/></linearGradient>`;
    layers += `<path d="${ridge(r, w, h, base, h * (0.3 - i * 0.05), r.int(4, 8))}" fill="url(#m${i})" filter="url(#ink)"/>`;
  }
  const sealX = w * r.range(0.72, 0.84);
  const sealY = h * r.range(0.08, 0.16);
  const ss = Math.min(w, h) * 0.06;
  const boatX = w * r.range(0.2, 0.7);
  const boatY = h * 0.86;
  return `<defs>${defs}<filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${r.int(1, 99)}"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 .18 0"/></filter>
    <filter id="ink" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
    <rect width="${w}" height="${h}" fill="#efe6d2"/><rect width="${w}" height="${h}" filter="url(#paper)"/>
    <circle cx="${w * r.range(0.2, 0.5)}" cy="${h * r.range(0.18, 0.3)}" r="${Math.min(w, h) * 0.07}" fill="#c0392b" opacity=".8"/>${layers}
    <path d="M${boatX} ${boatY} q${ss * 0.9} ${ss * 0.35} ${ss * 1.8} 0 z" fill="#3b3a36"/><line x1="${boatX + ss * 0.9}" y1="${boatY}" x2="${boatX + ss * 0.9}" y2="${boatY - ss * 0.9}" stroke="#3b3a36" stroke-width="1.5"/>
    <rect x="${sealX}" y="${sealY}" width="${ss}" height="${ss * 1.3}" fill="#b03a2e" rx="3"/>
    <path d="M${sealX + ss * 0.25} ${sealY + ss * 0.25} h${ss * 0.5} M${sealX + ss * 0.5} ${sealY + ss * 0.25} v${ss * 0.8} M${sealX + ss * 0.25} ${sealY + ss * 0.7} h${ss * 0.5}" stroke="#f5e6d3" stroke-width="2.4" fill="none"/>`;
}

function lowpoly(r: Rng, w: number, h: number) {
  const cols = 9;
  const rowsN = Math.round((cols * h) / w);
  const pts: [number, number][][] = [];
  for (let y = 0; y <= rowsN; y++) {
    const row: [number, number][] = [];
    for (let x = 0; x <= cols; x++) {
      const jx = x > 0 && x < cols ? r.range(-0.4, 0.4) : 0;
      const jy = y > 0 && y < rowsN ? r.range(-0.4, 0.4) : 0;
      row.push([((x + jx) * w) / cols, ((y + jy) * h) / rowsN]);
    }
    pts.push(row);
  }
  const palettes = [
    ["#0f0c29", "#302b63", "#24c6dc"],
    ["#fc466b", "#3f5efb", "#1fddff"],
    ["#11998e", "#38ef7d", "#f9d423"],
    ["#ff512f", "#dd2476", "#2b1055"],
  ];
  const p = r.pick(palettes);
  const colorAt = (x: number, y: number) => {
    const t = Math.min(1, Math.max(0, (x / w) * 0.4 + (y / h) * 0.6 + r.range(-0.06, 0.06)));
    return t < 0.5 ? lerpHex(p[0], p[1], t * 2) : lerpHex(p[1], p[2], (t - 0.5) * 2);
  };
  let s = "";
  for (let y = 0; y < rowsN; y++) {
    for (let x = 0; x < cols; x++) {
      const a = pts[y][x], b = pts[y][x + 1], c = pts[y + 1][x], d = pts[y + 1][x + 1];
      const tris = r.chance(0.5) ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]];
      for (const t of tris) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        s += `<polygon points="${t.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${colorAt(cx, cy)}" stroke="${colorAt(cx, cy)}" stroke-width=".6"/>`;
      }
    }
  }
  return s;
}

function blossom(r: Rng, w: number, h: number) {
  const fromLeft = r.chance(0.5);
  const sx = fromLeft ? -20 : w + 20;
  const dir = fromLeft ? 1 : -1;
  let branches = "";
  let flowers = "";
  const flower = (x: number, y: number, s: number) => {
    let f = "";
    const col = r.pick(["#ffc0d3", "#ffd6e2", "#ffb3c8", "#fff0f5"]);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r.range(0, 0.4);
      f += `<ellipse cx="${(x + Math.cos(a) * s * 0.55).toFixed(1)}" cy="${(y + Math.sin(a) * s * 0.55).toFixed(1)}" rx="${(s * 0.5).toFixed(1)}" ry="${(s * 0.36).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${(x + Math.cos(a) * s * 0.55).toFixed(1)} ${(y + Math.sin(a) * s * 0.55).toFixed(1)})" fill="${col}"/>`;
    }
    return `${f}<circle cx="${x}" cy="${y}" r="${s * 0.18}" fill="#e75480"/>`;
  };
  for (let b = 0; b < 3; b++) {
    let x = sx;
    let y = h * r.range(0.15, 0.6);
    let width = r.range(10, 18);
    let d = `M${x} ${y}`;
    for (let seg = 0; seg < 6; seg++) {
      const nx = x + dir * r.range(w * 0.08, w * 0.16);
      const ny = y + r.range(-h * 0.06, h * 0.05);
      d += ` Q${((x + nx) / 2 + r.range(-15, 15)).toFixed(1)} ${(ny + r.range(-20, 20)).toFixed(1)} ${nx.toFixed(1)} ${ny.toFixed(1)}`;
      for (let k = 0; k < r.int(2, 4); k++) flowers += flower(nx + r.range(-24, 24), ny + r.range(-20, 20), r.range(8, 15));
      x = nx;
      y = ny;
    }
    branches += `<path d="${d}" stroke="#4a2c2a" stroke-width="${width.toFixed(1)}" fill="none" stroke-linecap="round"/>`;
    width *= 0.7;
  }
  let petals = "";
  for (let i = 0; i < 40; i++) {
    const px = r.range(0, w), py = r.range(0, h);
    petals += `<ellipse cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" rx="${r.range(3, 6).toFixed(1)}" ry="${r.range(1.5, 3).toFixed(1)}" transform="rotate(${r.int(0, 180)} ${px.toFixed(0)} ${py.toFixed(0)})" fill="#ffc6d6" opacity="${r.range(0.5, 0.95).toFixed(2)}"/>`;
  }
  const bg = r.pick([
    ["#bde0fe", "#ffd6e7"],
    ["#fde2e4", "#e2ece9"],
    ["#a2d2ff", "#fff1f5"],
  ]);
  return `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">${gradientStops(bg)}</linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>${branches}${flowers}${petals}`;
}

function aurora(r: Rng, w: number, h: number) {
  let ribbons = "";
  for (let i = 0; i < 3; i++) {
    const y0 = h * r.range(0.15, 0.4);
    const amp = h * r.range(0.04, 0.1);
    const ph = r.range(0, 6);
    let top = `M0 ${y0}`;
    let bottom = "";
    for (let x = 0; x <= w; x += w / 30) {
      const y = y0 + Math.sin((x / w) * 4 + ph) * amp;
      top += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      bottom = ` L${x.toFixed(1)} ${(y + h * r.range(0.05, 0.1)).toFixed(1)}` + bottom;
    }
    ribbons += `<path d="${top}${bottom} Z" fill="url(#au${i % 2})" opacity="${r.range(0.45, 0.75).toFixed(2)}" filter="url(#ab)"/>`;
  }
  let trees = "";
  for (let i = 0; i < 26; i++) {
    const tx = r.range(0, w), base = h * r.range(0.8, 0.92), th = r.range(25, 70);
    trees += `<path d="M${tx.toFixed(0)} ${(base - th).toFixed(0)} L${(tx + th * 0.22).toFixed(0)} ${base.toFixed(0)} L${(tx - th * 0.22).toFixed(0)} ${base.toFixed(0)} Z" fill="#06121f"/>`;
  }
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${gradientStops(["#020617", "#0b1e3a", "#12355b"])}</linearGradient>
    <linearGradient id="au0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a855f7" stop-opacity="0"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#4ade80" stop-opacity="0"/></linearGradient>
    <linearGradient id="au1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4ade80"/><stop offset=".6" stop-color="#2dd4bf"/><stop offset="1" stop-color="#818cf8"/></linearGradient>
    <filter id="ab" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <rect width="${w}" height="${h}" fill="url(#sky)"/>${stars(r, w, h, 120, h * 0.7)}${ribbons}
    <path d="${ridge(r, w, h, h * 0.86, h * 0.08, 5)}" fill="#cfe3f5"/>${trees}
    <path d="${ridge(r, w, h, h * 0.95, h * 0.05, 4)}" fill="#e8f2fb"/>`;
}

const STYLES: Record<ArtStyle, (r: Rng, w: number, h: number) => string> = {
  sunset,
  city,
  pastel,
  spheres,
  waves,
  pixel,
  ink,
  lowpoly,
  blossom,
  aurora,
};

export function artSvg(style: ArtStyle, seed: number, w: number, h: number): string {
  const body = STYLES[style](rng(seed), w, h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
