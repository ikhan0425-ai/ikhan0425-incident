// 로컬 테스트용 @appdeploy/sdk 모의 구현 (router, json, error, auth, requireAuth, db, storage).
// 실제 SDK 문서의 동작(레코드 통째 교체, list 의 post-read filter, 서명 URL 등)을 흉내 낸다.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA, 'db.json');
const STORAGE = path.join(DATA, 'storage');
fs.mkdirSync(STORAGE, { recursive: true });
export const STORAGE_DIR = STORAGE;
const PORT = Number(process.env.MOCK_API_PORT ?? 8787);

export interface AuthUser {
  userId: string;
  email?: string;
  name?: string;
  scope: string;
}
export interface RouterContext {
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  event: any;
  user?: AuthUser;
}
export interface RouterResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
export type RouterMiddleware = (ctx: RouterContext) => Promise<RouterResponse | void> | RouterResponse | void;

export function json(data: unknown, status = 200): RouterResponse {
  return { statusCode: status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) };
}
export function error(message: string, status = 400): RouterResponse {
  return json({ error: message }, status);
}

export function router(routes: Record<string, RouterMiddleware[]>) {
  const compiled = Object.entries(routes).map(([key, chain]) => {
    const [method, pattern] = key.split(' ');
    const names: string[] = [];
    const re = new RegExp(
      '^' + pattern.replace(/:[A-Za-z]+/g, (m) => (names.push(m.slice(1)), '([^/]+)')) + '$',
    );
    return { method, re, names, chain };
  });
  return async (event: any): Promise<RouterResponse> => {
    const method = event.requestContext.http.method;
    const p = event.rawPath;
    for (const r of compiled) {
      if (r.method !== method) continue;
      const m = r.re.exec(p);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      let body: unknown = event.body;
      if (typeof body === 'string' && body) {
        try {
          body = JSON.parse(body);
        } catch {
          // 그대로
        }
      }
      const ctx: RouterContext = { body: body ?? {}, query: event.queryStringParameters ?? {}, params, event };
      for (const mw of r.chain) {
        const res = await mw(ctx);
        if (res) return res;
      }
      return json({ error: 'No response' }, 500);
    }
    return json({ error: 'Not found' }, 404);
  };
}

export const auth = {
  async getUser(event: { headers?: Record<string, string | undefined> }): Promise<AuthUser | null> {
    const h = event.headers?.authorization ?? event.headers?.Authorization;
    const m = h && /^Bearer mock\.(.+)$/.exec(h);
    if (!m) return null;
    try {
      const u = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      return { userId: u.userId, name: u.name, email: u.email, scope: 'openid email profile' };
    } catch {
      return null;
    }
  },
  hasScope(user: AuthUser, scope: string) {
    return user.scope.split(' ').includes(scope);
  },
  requireScope(user: AuthUser, scope: string) {
    if (!this.hasScope(user, scope)) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  },
};

export function requireAuth(): RouterMiddleware {
  return async (ctx) => {
    const user = await auth.getUser(ctx.event);
    if (!user) return json({ message: 'Unauthorized' }, 401);
    ctx.user = user;
  };
}
export function withScopes(..._scopes: string[]): RouterMiddleware {
  return () => undefined;
}
export function requireAdminEmailAllowlist(_emails: string[]): RouterMiddleware {
  return () => undefined;
}

// ---------------------------------------------------------------- db
type Tables = Record<string, Record<string, Record<string, unknown>>>;
let tables: Tables = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : {};
const persist = () => fs.writeFileSync(DB_FILE, JSON.stringify(tables));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const stats = { reads: 0, writes: 0 };

function checkSize(records: unknown[]) {
  for (const r of records) {
    const n = Buffer.byteLength(JSON.stringify(r));
    if (n > 256 * 1024) throw new Error(`mock db: record too large (${n} bytes > 256KiB)`);
  }
  if (records.length > 500) throw new Error('mock db: more than 500 items');
}

export const db = {
  async add(table: string, records: Array<Record<string, unknown>>) {
    checkSize(records);
    stats.writes++;
    const t = (tables[table] ??= {});
    const ids = records.map((r) => {
      const id = randomUUID();
      t[id] = clone(r);
      return id;
    });
    persist();
    return ids;
  },
  async update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>) {
    checkSize(items.map((i) => i.record));
    stats.writes++;
    const t = (tables[table] ??= {});
    const res = items.map((i) => {
      if (!(i.id in t)) return false;
      const { id: _drop, ...rest } = i.record as Record<string, unknown>;
      void _drop;
      t[i.id] = clone(rest);
      return true;
    });
    persist();
    return res;
  },
  async get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>> {
    stats.reads++;
    const t = tables[table] ?? {};
    return ids.map((id) => (id in t ? (clone(t[id]) as T) : null));
  },
  async list<T = Record<string, any>>(table: string, options: { filter?: Record<string, unknown>; nextToken?: string; limit?: number } = {}) {
    stats.reads++;
    const all = Object.entries(tables[table] ?? {});
    const start = options.nextToken ? Number(options.nextToken) : 0;
    const limit = options.limit ?? 50;
    const slice = all.slice(start, start + limit);
    const items = slice
      .map(([id, rec]) => ({ ...clone(rec), id }) as Omit<T, 'id'> & { id: string })
      .filter((rec) => !options.filter || Object.entries(options.filter).every(([k, v]) => (rec as any)[k] === v));
    const next = start + limit < all.length ? String(start + limit) : undefined;
    return { items, nextToken: next };
  },
  async delete(table: string, ids: string[]) {
    stats.writes++;
    const t = tables[table] ?? {};
    const res = ids.map((id) => (id in t ? (delete t[id], true) : false));
    persist();
    return res;
  },
};

export function resetDb() {
  tables = {};
  persist();
}

// ---------------------------------------------------------------- storage
function safe(p: string) {
  if (p.startsWith('/') || p.includes('..')) throw new Error(`mock storage: bad path ${p}`);
  return path.join(STORAGE, p);
}

export const storage = {
  async write(items: Array<{ path: string; content: string; contentType: string }>) {
    return items.map((it) => {
      const f = safe(it.path);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.from(it.content, 'base64'));
      fs.writeFileSync(`${f}.__type`, it.contentType);
      return true;
    });
  },
  async read(paths: string[]) {
    return paths.map((p) => {
      const f = safe(p);
      return { path: p, content: fs.existsSync(f) ? fs.readFileSync(f).toString('base64') : null };
    });
  },
  async url(paths: string[]) {
    return paths.map((p) => ({ path: p, url: `http://localhost:${PORT}/__storage/${p}?sig=${Date.now()}` }));
  },
  async list(options: { prefix?: string; nextToken?: string; limit?: number } = {}) {
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r);
        else if (!e.name.endsWith('.__type')) out.push(r);
      }
    };
    walk(STORAGE, '');
    return { paths: out.filter((p) => !options.prefix || p.startsWith(options.prefix)).slice(0, options.limit ?? 100) };
  },
  async delete(paths: string[]) {
    return paths.map((p) => {
      const f = safe(p);
      const had = fs.existsSync(f);
      fs.rmSync(f, { force: true });
      fs.rmSync(`${f}.__type`, { force: true });
      return had;
    });
  },
};
