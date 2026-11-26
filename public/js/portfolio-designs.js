// Portfolio design system. A page's look is three independent choices: a layout (design), a colour palette and a typeface
// pairing, plus light or dark mode. 10 x 14 x 12 x 2 = 3,360 distinct looks. Pure data and functions, no DOM,
// so the same file is unit tested in Node (tests/designs.test.mjs).

/** `sketch` is a tiny wireframe: [x, y, w, h, tone] on a 60x40 board; tone 0 = ink, 1 = accent, 2 = faint. */
export const DESIGNS = [
  { id: 'atelier', name: 'Atelier', desc: 'Editorial. A huge name beside your security seal, quiet labelled sections.', sketch: [[4, 5, 30, 8, 0], [4, 15, 20, 2, 2], [40, 4, 16, 16, 1], [4, 26, 10, 2, 2], [18, 26, 38, 2, 0], [18, 31, 34, 2, 2], [18, 35, 28, 2, 2]] },
  { id: 'rail', name: 'Rail', desc: 'Your identity stays pinned on the left while the story scrolls on the right.', sketch: [[3, 4, 16, 5, 0], [3, 11, 12, 2, 2], [3, 28, 10, 10, 1], [26, 5, 30, 2, 2], [26, 11, 28, 3, 0], [26, 18, 24, 2, 2], [26, 25, 28, 3, 0], [26, 32, 22, 2, 2]] },
  { id: 'monolith', name: 'Monolith', desc: 'A solid block of colour with an oversized name. Loud, confident, memorable.', sketch: [[3, 3, 54, 18, 1], [6, 8, 30, 7, 0], [4, 26, 52, 2, 0], [4, 31, 36, 2, 2], [4, 35, 44, 2, 2]] },
  { id: 'bento', name: 'Bento', desc: 'Rounded cards in a mosaic. Everything visible at a glance.', sketch: [[3, 3, 54, 10, 1], [3, 15, 33, 10, 2], [38, 15, 19, 10, 2], [3, 27, 19, 10, 2], [24, 27, 33, 10, 2]] },
  { id: 'timeline', name: 'Timeline', desc: 'A vertical line tells your career in order. Ideal for a strong work history.', sketch: [[4, 4, 28, 7, 0], [8, 16, 1, 22, 1], [6, 17, 5, 5, 1], [14, 17, 30, 3, 0], [14, 22, 24, 2, 2], [6, 28, 5, 5, 1], [14, 28, 28, 3, 0], [14, 33, 20, 2, 2]] },
  { id: 'magazine', name: 'Magazine', desc: 'Centred masthead, a drop-cap introduction and two-column experience.', sketch: [[3, 3, 54, 1, 0], [14, 7, 32, 7, 0], [3, 17, 54, 1, 0], [4, 22, 24, 2, 0], [4, 27, 24, 2, 2], [32, 22, 24, 2, 0], [32, 27, 24, 2, 2], [4, 33, 52, 2, 2]] },
  { id: 'terminal', name: 'Terminal', desc: 'A command-line window. Made for developers and engineers.', sketch: [[3, 3, 54, 34, 2], [3, 3, 54, 4, 0], [7, 11, 26, 5, 1], [7, 20, 40, 2, 0], [7, 25, 34, 2, 2], [7, 30, 38, 2, 2]] },
  { id: 'spotlight', name: 'Spotlight', desc: 'A glowing centred hero and floating cards with pill-shaped skills.', sketch: [[22, 3, 16, 12, 1], [16, 18, 28, 4, 0], [10, 25, 40, 4, 2], [10, 31, 40, 6, 2]] },
  { id: 'swiss', name: 'Swiss', desc: 'Hard grid, thick rules and flat colour. Precise and modern.', sketch: [[3, 3, 54, 3, 1], [3, 8, 36, 9, 0], [3, 20, 54, 1, 0], [3, 24, 12, 2, 0], [20, 24, 36, 2, 2], [3, 30, 54, 1, 0], [3, 34, 12, 2, 0], [20, 34, 30, 2, 2]] },
  { id: 'classic', name: 'Classic', desc: 'A calm, centred single column with ornamental dividers. Timeless and formal.', sketch: [[22, 3, 16, 8, 1], [14, 14, 32, 4, 0], [20, 21, 20, 1, 2], [12, 25, 36, 2, 2], [12, 30, 36, 2, 2], [12, 35, 30, 2, 2]] },
];

/** Each palette gives a light and a dark mode: background, text, accent and a secondary accent. Other tones are mixed from these. */
export const PALETTES = [
  { id: 'forest', name: 'Forest', light: { bg: '#eef1ec', ink: '#10201b', accent: '#0b6f61', accent2: '#8a6414' }, dark: { bg: '#0c1613', ink: '#e8efe9', accent: '#5fd3bd', accent2: '#d9ac52' } },
  { id: 'cobalt', name: 'Cobalt', light: { bg: '#f0f3fa', ink: '#0f1630', accent: '#2540d9', accent2: '#a34a00' }, dark: { bg: '#0a0f20', ink: '#e6eafc', accent: '#93a7ff', accent2: '#ffb26b' } },
  { id: 'saffron', name: 'Saffron', light: { bg: '#fbf6e8', ink: '#1d1a10', accent: '#8a5300', accent2: '#2c5d4a' }, dark: { bg: '#16130a', ink: '#f3ecd4', accent: '#f2b92f', accent2: '#7ed1b0' } },
  { id: 'violet', name: 'Violet', light: { bg: '#f5f1fb', ink: '#1b1230', accent: '#6a2fd0', accent2: '#b3361f' }, dark: { bg: '#120c1f', ink: '#ece6fb', accent: '#bba0ff', accent2: '#ff9d8a' } },
  { id: 'rose', name: 'Rose', light: { bg: '#fbf0f2', ink: '#2a1118', accent: '#c21d4b', accent2: '#1d5c70' }, dark: { bg: '#1c0d12', ink: '#fbe9ee', accent: '#ff86a4', accent2: '#7fd0e6' } },
  { id: 'slate', name: 'Slate', light: { bg: '#eef0f2', ink: '#14181d', accent: '#0b5cad', accent2: '#8a4b12' }, dark: { bg: '#0d1014', ink: '#e6e9ed', accent: '#79b9f5', accent2: '#e0b277' } },
  { id: 'mint', name: 'Mint', light: { bg: '#e8f6ef', ink: '#0b2119', accent: '#08704a', accent2: '#8a2f6a' }, dark: { bg: '#08140f', ink: '#e4f5ec', accent: '#4be39a', accent2: '#f19ad0' } },
  { id: 'sand', name: 'Sand', light: { bg: '#f3efe6', ink: '#25211a', accent: '#6b5424', accent2: '#2a5f7a' }, dark: { bg: '#16130d', ink: '#efe9da', accent: '#dcc482', accent2: '#8cc4de' } },
  { id: 'indigo', name: 'Indigo', light: { bg: '#e9ebf6', ink: '#0d1226', accent: '#4338ca', accent2: '#9a4a00' }, dark: { bg: '#070a17', ink: '#e8ebf8', accent: '#9aa5ff', accent2: '#ffc27a' } },
  { id: 'citrus', name: 'Citrus', light: { bg: '#f4f7e2', ink: '#1b2008', accent: '#566f00', accent2: '#a0302a' }, dark: { bg: '#11150a', ink: '#f0f5d8', accent: '#c6ef3c', accent2: '#ff9a8d' } },
  { id: 'ocean', name: 'Ocean', light: { bg: '#e7f5f7', ink: '#08242b', accent: '#006f80', accent2: '#a6471a' }, dark: { bg: '#07161a', ink: '#dff3f6', accent: '#3dd6e8', accent2: '#ffae85' } },
  { id: 'crimson', name: 'Crimson', light: { bg: '#f7eeed', ink: '#220d0d', accent: '#b3121f', accent2: '#1f5d5a' }, dark: { bg: '#1a0a0b', ink: '#f8e6e5', accent: '#ff7b7b', accent2: '#7edbd5' } },
  { id: 'plum', name: 'Plum', light: { bg: '#f6edf3', ink: '#2a1024', accent: '#8f1f6f', accent2: '#2c6a3a' }, dark: { bg: '#1a0a16', ink: '#f6e4f0', accent: '#ff8fd8', accent2: '#9ae2a8' } },
  { id: 'graphite', name: 'Graphite', light: { bg: '#f3f3f2', ink: '#121212', accent: '#262626', accent2: '#8a5a00' }, dark: { bg: '#0d0d0d', ink: '#f1f1f0', accent: '#ffffff', accent2: '#e6b450' } },
];

/** `fonts` are Google Fonts family specs. `dw` is the display weight (some display faces only come in one weight). */
export const TYPEFACES = [
  { id: 'grotesk', name: 'Grotesk', display: '"Familjen Grotesk"', body: '"Newsreader"', ui: '"Inter"', dw: 600, fonts: ['Familjen+Grotesk:wght@500;600;700', 'Newsreader:wght@400;500', 'Inter:wght@400;500;600'] },
  { id: 'fraunces', name: 'Fraunces', display: '"Fraunces"', body: '"Inter"', ui: '"Inter"', dw: 600, fonts: ['Fraunces:wght@500;600;700', 'Inter:wght@400;500;600'] },
  { id: 'space', name: 'Space', display: '"Space Grotesk"', body: '"DM Sans"', ui: '"DM Sans"', dw: 600, fonts: ['Space+Grotesk:wght@500;600;700', 'DM+Sans:wght@400;500;600'] },
  { id: 'playfair', name: 'Playfair', display: '"Playfair Display"', body: '"Source Serif 4"', ui: '"Inter"', dw: 700, fonts: ['Playfair+Display:wght@600;700', 'Source+Serif+4:wght@400;500', 'Inter:wght@400;500;600'] },
  { id: 'syne', name: 'Syne', display: '"Syne"', body: '"Manrope"', ui: '"Manrope"', dw: 700, fonts: ['Syne:wght@600;700;800', 'Manrope:wght@400;500;600'] },
  { id: 'mono', name: 'Plex Mono', display: '"JetBrains Mono"', body: '"IBM Plex Sans"', ui: '"IBM Plex Sans"', dw: 600, fonts: ['JetBrains+Mono:wght@500;600', 'IBM+Plex+Sans:wght@400;500;600'] },
  { id: 'bricolage', name: 'Bricolage', display: '"Bricolage Grotesque"', body: '"Instrument Sans"', ui: '"Instrument Sans"', dw: 700, fonts: ['Bricolage+Grotesque:wght@500;600;700', 'Instrument+Sans:wght@400;500;600'] },
  { id: 'instrument', name: 'Instrument', display: '"Instrument Serif"', body: '"Inter Tight"', ui: '"Inter Tight"', dw: 400, fonts: ['Instrument+Serif', 'Inter+Tight:wght@400;500;600'] },
  { id: 'dmserif', name: 'DM Serif', display: '"DM Serif Display"', body: '"DM Sans"', ui: '"DM Sans"', dw: 400, fonts: ['DM+Serif+Display', 'DM+Sans:wght@400;500;600'] },
  { id: 'outfit', name: 'Outfit', display: '"Outfit"', body: '"Lora"', ui: '"Outfit"', dw: 600, fonts: ['Outfit:wght@500;600', 'Lora:wght@400;500'] },
  { id: 'unbounded', name: 'Unbounded', display: '"Unbounded"', body: '"Figtree"', ui: '"Figtree"', dw: 600, fonts: ['Unbounded:wght@500;600', 'Figtree:wght@400;500;600'] },
  { id: 'cormorant', name: 'Cormorant', display: '"Cormorant Garamond"', body: '"Jost"', ui: '"Jost"', dw: 600, fonts: ['Cormorant+Garamond:wght@500;600;700', 'Jost:wght@400;500;600'] },
];

const find = (list, id) => list.find((x) => x.id === id);
export const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

/** Valid ids for a page. Anything missing or unknown is chosen from the web address so two people rarely look alike. */
export function resolveStyle(d = {}) {
  const seed = String(d.slug || d.name || 'cv-certify');
  const h = hashStr(seed);
  const design = find(DESIGNS, d.design) || DESIGNS[h % DESIGNS.length];
  const palette = find(PALETTES, d.palette) || PALETTES[Math.floor(h / DESIGNS.length) % PALETTES.length];
  const typeface = find(TYPEFACES, d.typeface) || TYPEFACES[Math.floor(h / (DESIGNS.length * PALETTES.length)) % TYPEFACES.length];
  return { design: design.id, palette: palette.id, typeface: typeface.id };
}
export const randomStyle = (rnd = Math.random) => ({ design: DESIGNS[Math.floor(rnd() * DESIGNS.length)].id, palette: PALETTES[Math.floor(rnd() * PALETTES.length)].id, typeface: TYPEFACES[Math.floor(rnd() * TYPEFACES.length)].id });

/* ---------- colour maths (also used by the tests to prove every palette is readable) ---------- */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** Same as CSS color-mix(in srgb, a pct%, b). */
export const mix = (a, b, pct) => '#' + rgb(a).map((v, i) => Math.round((v * pct + rgb(b)[i] * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('');
export const MIX = { ink2: 80, ink3: 72, line: 16, paper: 5 }; // the same percentages the stylesheet uses
export const onColour = (hex) => (contrast('#ffffff', hex) >= contrast('#0a0a0a', hex) ? '#ffffff' : '#0a0a0a');

export function paletteVars(paletteId, mode) {
  const p = find(PALETTES, paletteId) || PALETTES[0];
  const c = p[mode === 'dark' ? 'dark' : 'light'];
  return { '--bg': c.bg, '--ink': c.ink, '--accent': c.accent, '--gold': c.accent2, '--accent-ink': onColour(c.accent), '--accent2-ink': onColour(c.accent2) };
}
export function fontVars(typefaceId) {
  const t = find(TYPEFACES, typefaceId) || TYPEFACES[0];
  return { '--display': `${t.display}, "Inter", system-ui, sans-serif`, '--body': `${t.body}, Georgia, serif`, '--ui': `${t.ui}, system-ui, sans-serif`, '--dw': String(t.dw) };
}
export const fontsHref = (typefaceId) => { const t = find(TYPEFACES, typefaceId) || TYPEFACES[0]; return `https://fonts.googleapis.com/css2?${t.fonts.map((f) => 'family=' + f).join('&')}&display=swap`; };
