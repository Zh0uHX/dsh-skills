import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-fs';
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths';
import z from '@deepseek-ai/schemastery';
import { SkillsShSource } from './catalog.js';
import { SkillStore } from './store.js';
import { SkillError, type CatalogSkill } from './types.js';

export const name = 'dsh-skills';
export const inject = ['webServer', 'connection', 'fs'];
export interface Config { dshHome?: string }
export const Config: z<Config> = z.object({ dshHome: z.string() });
const ROUTE = '/api/dsh-skills';

interface ConnectionTrust {
  requestRejection(request: { headers: IncomingMessage['headers'] }): 401 | 403 | undefined;
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (String(req.headers['content-type']).split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new SkillError('CONTENT_TYPE', '请求需要使用 JSON 格式。', 415);
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 64 * 1024) {
      req.resume();
      throw new SkillError('BODY_TOO_LARGE', '请求内容过大。', 413);
    }
    chunks.push(bytes);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SkillError('INVALID_JSON', '请求不是有效的 JSON。'); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new SkillError('INVALID_BODY', '请求需要包含一个 JSON 对象。');
  }
  return body as Record<string, unknown>;
}

function skillOf(value: unknown): CatalogSkill {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SkillError('INVALID_SKILL', '技能信息不完整，请重新搜索。');
  }
  const item = value as Record<string, unknown>;
  for (const key of ['id', 'skillId', 'name', 'source', 'url']) {
    if (typeof item[key] !== 'string' || item[key].length === 0 || item[key].length > 1024) {
      throw new SkillError('INVALID_SKILL', '技能信息不完整，请重新搜索。');
    }
  }
  if (!Number.isFinite(item.installs) || Number(item.installs) < 0) {
    throw new SkillError('INVALID_SKILL', '技能安装次数无效，请重新搜索。');
  }
  return {
    id: item.id as string, skillId: item.skillId as string, name: item.name as string,
    source: item.source as string, url: item.url as string, installs: Number(item.installs),
    ...(typeof item.description === 'string' ? { description: item.description.slice(0, 8000) } : {}),
  };
}

function idOf(body: Record<string, unknown>): string {
  if (typeof body.id !== 'string' || body.id.length === 0 || body.id.length > 1024) {
    throw new SkillError('INVALID_ID', '技能标识无效，请刷新列表。');
  }
  return body.id;
}

/** Directory swaps can be coalesced by file watchers; publish the committed entrypoint state. */
export async function publishSkillObservation(ctx: Context, directory: string): Promise<void> {
  const target = await ctx.fs.resolve(join(directory, 'SKILL.md'));
  const info = await ctx.fs.stat(target);
  ctx.emit('fs/observed', target, info ? { kind: 'present', version: info.version } : { kind: 'absent' }, {
    name: 'write', source: 'dsh-skills',
  });
}

/** The default root is the same user-dsh root scanned by dsh-skill-filesystem. */
export function apply(ctx: Context, config: Config = {}): void {
  const root = join(resolveDshHome(config.dshHome), 'skills');
  const source = new SkillsShSource();
  const store = new SkillStore(root, source);
  const connection = Reflect.get(ctx, 'connection') as ConnectionTrust;

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: ROUTE,
    handler: async (req, res) => {
      const rejection = connection.requestRejection(req);
      if (rejection !== undefined) {
        reply(res, rejection, { error: { code: 'ACCESS_DENIED', message: '连接已失效，请刷新 DSH 页面后重试。' } });
        return;
      }
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const action = url.pathname.slice(ROUTE.length);
        const get = action === '/search' || action === '/installed';
        const post = ['/details', '/install', '/check-updates', '/update', '/uninstall'].includes(action);
        if (!get && !post) throw new SkillError('NOT_FOUND', '接口不存在。', 404);
        if (req.method !== (get ? 'GET' : 'POST')) {
          res.setHeader('allow', get ? 'GET' : 'POST');
          throw new SkillError('METHOD_NOT_ALLOWED', '请求方法不支持。', 405);
        }
        if (action === '/search') {
          reply(res, 200, { skills: await source.search(url.searchParams.get('q') ?? '') });
          return;
        }
        if (action === '/installed') {
          reply(res, 200, { skills: await store.list(), root });
          return;
        }
        const body = await readBody(req);
        const confirmed = body.confirmed === true;
        switch (action) {
          case '/details': reply(res, 200, { skill: await source.details(skillOf(body.skill)) }); break;
          case '/install': {
            const skill = await store.install(skillOf(body.skill), confirmed);
            await publishSkillObservation(ctx, skill.directory);
            reply(res, 200, { skill });
            break;
          }
          case '/check-updates': reply(res, 200, { updates: await store.checkUpdates() }); break;
          case '/update': {
            const skill = await store.update(idOf(body), confirmed);
            await publishSkillObservation(ctx, skill.directory);
            reply(res, 200, { skill });
            break;
          }
          case '/uninstall': {
            const id = idOf(body);
            const skill = (await store.list()).find(item => item.id === id);
            await store.uninstall(id, confirmed);
            if (skill) await publishSkillObservation(ctx, skill.directory);
            reply(res, 200, { ok: true });
            break;
          }
        }
      } catch (error) {
        if (error instanceof SkillError) reply(res, error.status, { error: { code: error.code, message: error.message } });
        else {
          ctx.logger.warn('Skill request failed: %s', error instanceof Error ? error.message : String(error));
          reply(res, 500, { error: { code: 'INTERNAL_ERROR', message: '操作未完成，请重试；若问题持续，请检查 DSH 日志。' } });
        }
      }
    },
  }), 'dsh-skills: authenticated routes');
}
