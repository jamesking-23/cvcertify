// Input sanitisation for user-supplied documents. Anything that is not in the schema is dropped,
// strings are length-capped and arrays are size-capped so a client can never store arbitrary blobs.

import { COUNTRIES, TEMPLATES, emptyContent } from '../../public/js/shared/constants.js';
import { newId } from './util.mjs';

const str = (v, max = 500) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const text = (v, max = 5000) => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const ym = (v) => (typeof v === 'string' && /^\d{4}(-\d{2})?$/.test(v) ? (v.length === 4 ? `${v}-01` : v) : '');
const id = (v) => (typeof v === 'string' && /^[\w-]{3,40}$/.test(v) ? v : newId('i_'));

export function cleanContent(input) {
  const c = input && typeof input === 'object' ? input : {};
  const p = c.personal && typeof c.personal === 'object' ? c.personal : {};
  const base = emptyContent();
  const personal = {};
  for (const k of Object.keys(base.personal)) personal[k] = str(p[k], k === 'headline' ? 160 : 200);

  return {
    personal,
    summary: text(c.summary, 2000),
    experience: arr(c.experience, 30).map((e) => ({
      id: id(e?.id),
      role: str(e?.role, 160),
      company: str(e?.company, 160),
      location: str(e?.location, 120),
      start: ym(e?.start),
      end: ym(e?.end),
      current: !!e?.current,
      bullets: arr(e?.bullets, 15).map((b) => text(b, 500)).filter((b) => b.trim()),
    })),
    education: arr(c.education, 15).map((e) => ({
      id: id(e?.id),
      school: str(e?.school, 160),
      degree: str(e?.degree, 160),
      field: str(e?.field, 160),
      start: ym(e?.start),
      end: ym(e?.end),
      details: text(e?.details, 500),
    })),
    projects: arr(c.projects, 15).map((e) => ({
      id: id(e?.id),
      name: str(e?.name, 160),
      link: str(e?.link, 300),
      tech: str(e?.tech, 300),
      description: text(e?.description, 800),
    })),
    skills: arr(c.skills, 80).map((s) => str(s, 60)).filter(Boolean),
    certifications: arr(c.certifications, 20).map((e) => ({ id: id(e?.id), name: str(e?.name, 200), issuer: str(e?.issuer, 160), year: str(e?.year, 10) })),
    languages: arr(c.languages, 12).map((e) => ({ id: id(e?.id), name: str(e?.name, 60), level: str(e?.level, 40) })),
    referees: arr(c.referees, 4).map((e) => ({ id: id(e?.id), name: str(e?.name, 120), title: str(e?.title, 160), contact: str(e?.contact, 200) })),
  };
}

export const cleanJob = (j) => ({
  title: str(j?.title, 160),
  company: str(j?.company, 160),
  description: text(j?.description, 12000),
});

export const cleanTemplate = (t) => (TEMPLATES.some((x) => x.id === t) ? t : 'classic');
export const cleanCountry = (c) => (COUNTRIES[c] ? c : 'US');
export const cleanTitle = (t, fallback = 'Untitled') => str(t, 120) || fallback;
export const cleanSlug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
export { str, text };
