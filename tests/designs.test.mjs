import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, PALETTES, TYPEFACES, resolveStyle, randomStyle, contrast, mix, MIX, onColour, hashStr } from '../public/js/portfolio-designs.js';

test('ids are unique and URL safe', () => {
  for (const list of [DESIGNS, PALETTES, TYPEFACES]) {
    const ids = list.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9-]{1,24}$/);
  }
});

test('every palette is readable in light and dark', () => {
  for (const p of PALETTES) for (const mode of ['light', 'dark']) {
    const { bg, ink, accent, accent2 } = p[mode];
    const paper = mix(ink, bg, MIX.paper);
    const ink2 = mix(ink, bg, MIX.ink2), ink3 = mix(ink, bg, MIX.ink3);
    const tag = `${p.id}/${mode}`;
    assert.ok(contrast(ink, bg) >= 9, `${tag} ink on bg ${contrast(ink, bg).toFixed(1)}`);
    assert.ok(contrast(ink2, bg) >= 7, `${tag} ink2 ${contrast(ink2, bg).toFixed(1)}`);
    assert.ok(contrast(ink3, bg) >= 4.5 && contrast(ink3, paper) >= 4.5, `${tag} ink3 ${contrast(ink3, bg).toFixed(1)}`);
    assert.ok(contrast(accent, bg) >= 4.5 && contrast(accent, paper) >= 4.5, `${tag} accent on bg ${contrast(accent, bg).toFixed(1)}`);
    assert.ok(contrast(accent2, bg) >= 3, `${tag} accent2 ${contrast(accent2, bg).toFixed(1)}`);
    assert.ok(contrast(onColour(accent), accent) >= 4.5, `${tag} text on accent ${contrast(onColour(accent), accent).toFixed(1)}`);
  }
});

test('automatic styles are valid, stable and well spread', () => {
  const seen = { design: new Set(), palette: new Set(), typeface: new Set() };
  for (let i = 0; i < 400; i++) {
    const s = resolveStyle({ slug: 'person-' + i });
    assert.deepEqual(s, resolveStyle({ slug: 'person-' + i }));
    for (const k in seen) seen[k].add(s[k]);
  }
  assert.equal(seen.design.size, DESIGNS.length);
  assert.equal(seen.palette.size, PALETTES.length);
  assert.equal(seen.typeface.size, TYPEFACES.length);
});

test('explicit choices win; unknown ids fall back to automatic', () => {
  assert.deepEqual(resolveStyle({ slug: 'x', design: 'swiss', palette: 'plum', typeface: 'syne' }), { design: 'swiss', palette: 'plum', typeface: 'syne' });
  const auto = resolveStyle({ slug: 'x' });
  assert.deepEqual(resolveStyle({ slug: 'x', design: 'nope', palette: '<script>', typeface: '' }), auto);
  const r = randomStyle(() => 0.999);
  assert.ok(DESIGNS.some((d) => d.id === r.design));
  assert.ok(hashStr('a') !== hashStr('b'));
});
