function _djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash;
}

const AVATAR_COLORS = [
  "var(--color-red)",
  "var(--color-olive)",
  "var(--color-gold)",
  "var(--color-blue)",
  "var(--color-purple)",
  "var(--color-green)",
  "var(--color-beige)",
];

export function getAvatarBgVar(id) {
  if (!id) return AVATAR_COLORS[0];
  const i = Math.abs(_djb2(id)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

export function getFractalFromId(id) {
    if (!id) return "";
    const seed = _djb2(id);
    let cur = seed;
    const rnd = () => {
        const x = Math.sin(cur++) * 10000;
        return x - Math.floor(x);
    };

    const h1 = Math.abs(_djb2(id)) % 360;
    const h2 = (h1 + 40) % 360;

    const bg = `hsl(${h1}, 20%, 30%)`;
    const synapse = `hsl(${h2}, 80%, 80%)`;

    const nodes = [];
    for (let i = 0; i < 45; i++) {
        nodes.push({ x: rnd() * 400, y: rnd() * 100, r: 0.5 + rnd() * 1.0 });
    }

    const lines = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const d = Math.sqrt((nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2);
            if (d < 30) {
                const o = (1 - d / 30) * 0.6;
                lines.push(`<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}" stroke="${synapse}" stroke-width="0.3" stroke-opacity="${o.toFixed(2)}" />`);
            }
        }
    }

    const dots = nodes.map(n => `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${synapse}" fill-opacity="0.8" />`);

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice">
            <rect width="400" height="100" fill="${bg}" fill-opacity="0.15" />
            ${lines.join('')}
            ${dots.join('')}
        </svg>
    `.replace(/\s+/g, ' ').trim();

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
