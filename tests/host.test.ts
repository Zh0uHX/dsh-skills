import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { apply } from '../src/index.js';

async function setup(rejection?: 401 | 403) {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-skills-http-')));
  let route: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> } | undefined;
  let disposed = false;
  let dispose: (() => void) | undefined;
  const ctx = {
    connection: { requestRejection: () => rejection },
    webServer: { register: (value: typeof route) => { route = value; return () => { disposed = true; }; } },
    effect: (factory: () => () => void) => { dispose = factory(); },
    logger: { warn: () => undefined },
  } as unknown as Context;
  apply(ctx, { dshHome: home });
  return {
    home,
    async call(path: string, method = 'GET', body?: string, contentType = 'application/json') {
      const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
        url: `/api/dsh-skills${path}`, method, headers: { 'content-type': contentType },
      }) as IncomingMessage;
      let payload = '';
      const headers = new Map<string, string>();
      const res = { statusCode: 200, setHeader: (key: string, value: string) => headers.set(key, value), end: (value: string) => { payload = value; } };
      await route!.handler(req, res as unknown as ServerResponse);
      return { status: res.statusCode, headers, body: JSON.parse(payload) as Record<string, any> };
    },
    async close() { dispose?.(); assert.equal(disposed, true); await rm(home, { recursive: true, force: true }); },
  };
}

test('API applies the DSH trust fence before reads and mutations', async () => {
  for (const code of [401, 403] as const) {
    const host = await setup(code);
    try {
      for (const [path, method] of [['/installed', 'GET'], ['/install', 'POST']]) {
        const result = await host.call(path!, method!);
        assert.equal(result.status, code);
        assert.equal(result.body.error.code, 'ACCESS_DENIED');
      }
    } finally { await host.close(); }
  }
});

test('installed endpoint resolves the explicit DSH home, independent of cwd', async () => {
  const host = await setup();
  try {
    const result = await host.call('/installed');
    assert.equal(result.status, 200);
    assert.equal(result.body.root, join(host.home, 'skills'));
    assert.deepEqual(result.body.skills, []);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  } finally { await host.close(); }
});

test('API rejects unsupported methods, non-JSON and oversized bodies', async () => {
  const host = await setup();
  try {
    const wrongMethod = await host.call('/install');
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
    assert.equal((await host.call('/install', 'POST', '{}', 'text/plain')).status, 415);
    assert.equal((await host.call('/install', 'POST', '{')).status, 400);
    assert.equal((await host.call('/install', 'POST', JSON.stringify('x'.repeat(65_536)))).status, 413);
    assert.equal((await host.call('/unknown')).status, 404);
  } finally { await host.close(); }
});

test('API validates mutation arguments before reaching the store', async () => {
  const host = await setup();
  try {
    assert.equal((await host.call('/install', 'POST', '{}')).body.error.code, 'INVALID_SKILL');
    assert.equal((await host.call('/update', 'POST', JSON.stringify({ id: 7, confirmed: true }))).body.error.code, 'INVALID_ID');
  } finally { await host.close(); }
});
