// Generates a guilloche security seal that is unique to a string (a document ID). The same ID always draws the
// same seal, so a seal can be recognised the way a banknote pattern is. Pure geometry, no network, no randomness.

const NS = 'http://www.w3.org/2000/svg';

function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}
function rng(seed) {
  let a = seed[0], b = seed[1], c = seed[2], d = seed[3];
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const f = (n) => n.toFixed(2);

function hypotrochoid(R, r, d, rot = 0, steps = 1400) {
  const turns = r / gcd(R, r);
  const k = 176 / ((R - r) + d); // keep every pattern inside the outer ring
  let out = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    const cx = (x * Math.cos(rot) - y * Math.sin(rot)) * k;
    const cy = (x * Math.sin(rot) + y * Math.cos(rot)) * k;
    out += `${i ? 'L' : 'M'}${f(cx)} ${f(cy)}`;
  }
  return out + 'Z';
}
function wave(rad, amp, n, phase, steps = 720) {
  let out = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = rad + amp * Math.sin(n * t + phase);
    out += `${i ? 'L' : 'M'}${f(r * Math.cos(t))} ${f(r * Math.sin(t))}`;
  }
  return out + 'Z';
}

/**
 * @param {string} seed  document ID (or any stable string)
 * @param {{ initials?: string, caption?: string, size?: number, sealed?: boolean }} opts
 */
export function seal(seed, { initials = '', caption = '', size = 320, sealed = true } = {}) {
  const rnd = rng(hash128(String(seed || 'unsealed')));
  const pick = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const uid = 's' + (hash128(String(seed))[0] % 1e6).toString(36);

  const R1 = 150, r1 = pick(5, 13), d1 = pick(52, 96);
  let R2 = 132, r2 = pick(4, 11); if (r2 === r1) r2 += 1;
  const d2 = pick(40, 84);
  const n = pick(9, 29), amp = 3 + rnd() * 4;
  const rot = rnd() * Math.PI;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-200 -200 400 400');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'seal' + (sealed ? '' : ' seal-unsealed'));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', sealed ? 'Security seal, unique to this verified document' : 'Seal placeholder, this CV is not certified yet');

  const path = (d, cls, extra = {}) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', cls); p.setAttribute('pathLength', '1'); p.setAttribute('fill', 'none');
    for (const k in extra) p.setAttribute(k, extra[k]);
    return p;
  };
  const circle = (r, cls) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', r); c.setAttribute('class', cls); c.setAttribute('fill', 'none'); return c; };

  const g = document.createElementNS(NS, 'g');
  g.append(circle(194, 'seal-ring'), circle(189, 'seal-ring seal-thin'));
  g.append(path(hypotrochoid(R1, r1, d1, rot), 'seal-line seal-a', { style: '--d:0s' }));
  g.append(path(hypotrochoid(R2, r2, d2, -rot * 0.6, 1400), 'seal-line seal-b', { style: '--d:.5s' }));
  g.append(path(wave(86, amp, n, rnd() * 6), 'seal-line seal-c', { style: '--d:1s' }));
  g.append(path(wave(78, amp * 0.6, n + 3, rnd() * 6), 'seal-line seal-c seal-thin', { style: '--d:1.2s' }));
  g.append(circle(64, 'seal-core'));
  svg.append(g);

  // Micro-text ring: readable under zoom, impossible to miss when a fake is compared against the original.
  const defs = document.createElementNS(NS, 'defs');
  const ring = document.createElementNS(NS, 'path');
  ring.setAttribute('id', `${uid}-r`); ring.setAttribute('d', 'M0 -178 A178 178 0 1 1 -0.01 -178');
  defs.append(ring); svg.append(defs);
  const tx = document.createElementNS(NS, 'text'); tx.setAttribute('class', 'seal-micro');
  const tp = document.createElementNS(NS, 'textPath'); tp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${uid}-r`); tp.setAttribute('href', `#${uid}-r`);
  const label = caption || (sealed ? String(seed) : 'NOT YET CERTIFIED');
  tp.textContent = (`CV-CERTIFY  ${label}  `).repeat(Math.ceil(120 / (label.length + 12)));
  tx.append(tp); svg.append(tx);

  if (initials) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'seal-initials'); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central'); t.setAttribute('y', '2');
    t.textContent = initials.slice(0, 3);
    svg.append(t);
  }
  return svg;
}
