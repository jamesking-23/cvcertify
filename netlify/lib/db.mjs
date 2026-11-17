// Tiny document store with two backends:
//   1. Postgres over HTTP (Netlify DB / Neon) when NETLIFY_DATABASE_URL is set
//   2. A JSON file under .data/ for local development
// Everything is stored in one table: kv(col, id, owner, data jsonb).

import { promises as fs } from 'node:fs';
import path from 'node:path';

const dbUrl = () => process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || '';

/* ---------- Postgres over HTTP (Neon SQL-over-HTTP endpoint) ---------- */

async function sql(query, params = []) {
  const url = dbUrl();
  const host = new URL(url).hostname;
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Neon-Connection-String': url },
    body: JSON.stringify({ query, params }),
  });
  if (!res.ok) throw new Error(`Database error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

let schemaPromise;
function ensureSchema() {
  schemaPromise ||= (async () => {
    await sql(
      `CREATE TABLE IF NOT EXISTS kv (
         col text NOT NULL,
         id text NOT NULL,
         owner text,
         data jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (col, id)
       )`,
    );
    await sql('CREATE INDEX IF NOT EXISTS kv_owner_idx ON kv (col, owner)');
  })().catch((e) => {
    schemaPromise = undefined;
    throw e;
  });
  return schemaPromise;
}

const parse = (d) => (typeof d === 'string' ? JSON.parse(d) : d);

const pg = {
  mode: 'postgres',
  async get(col, id) {
    await ensureSchema();
    const r = await sql('SELECT data FROM kv WHERE col = $1 AND id = $2', [col, id]);
    return r.rows?.[0] ? parse(r.rows[0].data) : null;
  },
  async put(col, id, data, owner = null) {
    await ensureSchema();
    await sql(
      `INSERT INTO kv (col, id, owner, data) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (col, id) DO UPDATE SET data = EXCLUDED.data, owner = EXCLUDED.owner, updated_at = now()`,
      [col, id, owner, JSON.stringify(data)],
    );
    return data;
  },
  async del(col, id) {
    await ensureSchema();
    await sql('DELETE FROM kv WHERE col = $1 AND id = $2', [col, id]);
  },
  async list(col, owner) {
    await ensureSchema();
    const r = await sql('SELECT data FROM kv WHERE col = $1 AND owner = $2 ORDER BY updated_at DESC', [col, owner]);
    return (r.rows || []).map((row) => parse(row.data));
  },
};

/* ---------- JSON file (local development only) ---------- */

const FILE = process.env.CVC_DB_FILE || path.join(process.cwd(), '.data', 'db.json');
let cache;
let writing = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(cache));
  });
  return writing;
}

const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

const file = {
  mode: 'file',
  async get(col, id) {
    const db = await load();
    return clone(db[col]?.[id]?.data ?? null);
  },
  async put(col, id, data, owner = null) {
    const db = await load();
    (db[col] ||= {})[id] = { owner, data: clone(data), at: Date.now() };
    await persist();
    return data;
  },
  async del(col, id) {
    const db = await load();
    if (db[col]) delete db[col][id];
    await persist();
  },
  async list(col, owner) {
    const db = await load();
    return Object.values(db[col] || {})
      .filter((r) => r.owner === owner)
      .sort((a, b) => b.at - a.at)
      .map((r) => clone(r.data));
  },
};

export const db = new Proxy(
  {},
  {
    get(_, key) {
      const impl = dbUrl() ? pg : file;
      return impl[key];
    },
  },
);
