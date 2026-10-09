// 로컬 백엔드: appdeploy/backend/index.ts 의 handler 를 Lambda 이벤트처럼 호출한다.
// 실행: npx tsx --tsconfig appdeploy-dev/tsconfig.json appdeploy-dev/server.ts

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { handler } from '../appdeploy/backend/index';
import { STORAGE_DIR, stats } from './mock-sdk';

const PORT = Number(process.env.MOCK_API_PORT ?? 8787);
const MAX_BODY = 6 * 1024 * 1024; // Lambda 동기 호출 한도

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname.startsWith('/__storage/')) {
      const rel = decodeURIComponent(url.pathname.slice('/__storage/'.length));
      const f = path.join(STORAGE_DIR, rel);
      if (rel.includes('..') || !fs.existsSync(f)) {
        res.writeHead(404).end();
        return;
      }
      const type = fs.existsSync(`${f}.__type`) ? fs.readFileSync(`${f}.__type`, 'utf8') : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' });
      fs.createReadStream(f).pipe(res);
      return;
    }
    if (url.pathname === '/__stats') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(stats));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      chunks.push(c as Buffer);
    }
    if (size > MAX_BODY) {
      res.writeHead(413, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Request Entity Too Large' }));
      return;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k.toLowerCase()] = v;
    const event = {
      rawPath: url.pathname,
      rawQueryString: url.search.slice(1),
      headers,
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      body: size ? Buffer.concat(chunks).toString('utf8') : undefined,
      isBase64Encoded: false,
      requestContext: { http: { method: req.method, path: url.pathname } },
    };
    const t0 = Date.now();
    try {
      const out = await handler(event);
      res.writeHead(out.statusCode, out.headers).end(out.body);
      if (process.env.MOCK_LOG) console.log(req.method, url.pathname + url.search, out.statusCode, `${Date.now() - t0}ms`);
    } catch (e) {
      console.error('handler crashed', e);
      res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Internal Server Error' }));
    }
  })
  .listen(PORT, () => console.log(`mock AppDeploy backend on http://localhost:${PORT}`));
