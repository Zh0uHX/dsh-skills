import { parseDocument } from 'yaml';
import { SkillError, type CatalogSkill, type SkillBundle, type SkillsSource } from './types.js';

const ORIGIN = 'https://www.skills.sh';
const ALLOWED_HOSTS = new Set(['skills.sh', 'www.skills.sh']);
const FALLBACK_DESCRIPTION = '暂无简介';
const MAX_FILES = 2_000;
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: string, limit: number): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function identity(id: unknown): { id: string; source: string; skillId: string; parts: string[] } {
  if (typeof id !== 'string') throw new SkillError('INVALID_SKILL', '技能标识无效，请重新搜索后选择。');
  const parts = id.split('/');
  if (![2, 3].includes(parts.length) || parts.some((part) => !SEGMENT.test(part))) {
    throw new SkillError('INVALID_SKILL', '技能标识无效，请重新搜索后选择。');
  }
  return { id, parts, source: parts.slice(0, -1).join('/'), skillId: parts.at(-1)! };
}

function canonicalSkill(value: unknown): CatalogSkill {
  if (!record(value)) throw new SkillError('INVALID_SKILL', '技能信息无效，请重新搜索后选择。');
  const { id, source, skillId, parts } = identity(value.id);
  if (value.source !== source || value.skillId !== skillId || typeof value.name !== 'string'
    || !text(value.name, 200) || !Number.isSafeInteger(value.installs) || (value.installs as number) < 0) {
    throw new SkillError('INVALID_SKILL', '技能信息与来源标识不一致，请重新搜索后选择。');
  }
  return {
    id, source, skillId, name: text(value.name, 200), installs: value.installs as number,
    url: `${ORIGIN}/${parts.map(encodeURIComponent).join('/')}`,
    ...(typeof value.description === 'string' ? { description: text(value.description, 2_000) } : {}),
  };
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match;
    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function structuredDescription(value: unknown, depth = 0): string | undefined {
  if (depth > 5) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = structuredDescription(item, depth + 1);
      if (result) return result;
    }
  }
  if (!record(value)) return undefined;
  const type = value['@type'];
  if ((type === 'SoftwareApplication' || (Array.isArray(type) && type.includes('SoftwareApplication')))
    && typeof value.description === 'string') return text(value.description, 2_000) || undefined;
  return structuredDescription(value['@graph'], depth + 1);
}

function descriptionFromPage(html: string): string {
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(script[1]!).type !== 'application/ld+json') continue;
    try {
      const description = structuredDescription(JSON.parse(script[2]!));
      if (description) return description;
    } catch { /* A broken structured-data block need not hide the page metadata. */ }
  }
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if ((attrs.name === 'description' || attrs.property === 'og:description') && attrs.content) {
      return text(attrs.content, 2_000) || FALLBACK_DESCRIPTION;
    }
  }
  return FALLBACK_DESCRIPTION;
}

function snapshotError(): SkillError {
  return new SkillError('INVALID_SNAPSHOT', '下载内容格式异常，未安装任何文件。请稍后重试或检查技能来源。', 502);
}

function safeFilePath(path: string): boolean {
  return path.length <= 512 && !/[\\\u0000-\u001f\u007f:]/.test(path)
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function validateDshMetadata(metadata: unknown, skillId: string): void {
  // DSH 0.1.7-alpha.1: dsh-skill isSkillName + skill-filesystem parseInvocationPolicy.
  if (!record(metadata) || typeof metadata.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)
    || metadata.name !== skillId || typeof metadata.description !== 'string' || !metadata.description.trim()) throw snapshotError();
  for (const legacy of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
    if (Object.hasOwn(metadata, legacy)) throw snapshotError();
  }
  for (const key of ['disable-model-invocation', 'user-invocable']) {
    if (!Object.hasOwn(metadata, key)) continue;
    const value = metadata[key];
    if (typeof value === 'boolean' || value === 0 || value === 1) continue;
    if (typeof value === 'string' && ['true', 'false', 'yes', 'no', 'on', 'off', '0', '1'].includes(value.toLowerCase())) continue;
    throw snapshotError();
  }
}

function validateSnapshot(payload: unknown, skill: CatalogSkill): SkillBundle {
  if (!record(payload) || typeof payload.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(payload.hash)
    || !Array.isArray(payload.files) || payload.files.length === 0 || payload.files.length > MAX_FILES) throw snapshotError();
  const files: SkillBundle['files'] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const file of payload.files) {
    if (!record(file) || typeof file.path !== 'string' || !safeFilePath(file.path)
      || typeof file.contents !== 'string' || seen.has(file.path.toLowerCase())) throw snapshotError();
    seen.add(file.path.toLowerCase());
    bytes += Buffer.byteLength(file.contents, 'utf8');
    if (bytes > MAX_BUNDLE_BYTES) throw snapshotError();
    files.push({ path: file.path, contents: file.contents });
  }
  for (const file of files) {
    const parts = file.path.toLowerCase().split('/');
    for (let count = 1; count < parts.length; count++) {
      if (seen.has(parts.slice(0, count).join('/'))) throw snapshotError();
    }
  }
  const entrypoint = files.find((file) => file.path === 'SKILL.md');
  const frontmatter = entrypoint?.contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter || frontmatter.length > 100_000) throw snapshotError();
  try {
    const document = parseDocument(frontmatter, { uniqueKeys: true });
    if (document.errors.length) throw snapshotError();
    const metadata: unknown = document.toJS({ maxAliasCount: 0 });
    validateDshMetadata(metadata, skill.skillId);
  } catch { throw snapshotError(); }
  return { skill, files, upstreamHash: payload.hash };
}

export class SkillsShSource implements SkillsSource {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async search(query: string): Promise<CatalogSkill[]> {
    const normalized = typeof query === 'string' ? query.trim() : '';
    if (normalized.length < 2 || normalized.length > 100) {
      throw new SkillError('INVALID_QUERY', '请输入 2–100 个字符进行搜索。');
    }
    const params = new URLSearchParams({ q: normalized, limit: '20' });
    const payload = await this.json(`/api/search?${params}`, MAX_PAGE_BYTES);
    if (!record(payload) || !Array.isArray(payload.skills)) {
      throw new SkillError('SOURCE_UNAVAILABLE', 'Skills.sh 返回了无法识别的搜索结果，请稍后重试。', 502);
    }
    const skills: CatalogSkill[] = [];
    const seen = new Set<string>();
    for (const row of payload.skills.slice(0, 100)) {
      try {
        const skill = canonicalSkill(row);
        if (!seen.has(skill.id)) { seen.add(skill.id); skills.push(skill); }
      } catch { /* Ignore individual malformed rows from the public catalog. */ }
      if (skills.length === 20) break;
    }
    const results = new Array<CatalogSkill>(skills.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, skills.length) }, async () => {
      while (next < skills.length) {
        const index = next++;
        const skill = skills[index]!;
        try { results[index] = await this.details(skill); }
        catch { results[index] = { ...skill, description: FALLBACK_DESCRIPTION }; }
      }
    }));
    return results;
  }

  async details(skill: CatalogSkill): Promise<CatalogSkill> {
    const canonical = canonicalSkill(skill);
    const html = await this.request(new URL(canonical.url), MAX_PAGE_BYTES);
    return { ...canonical, description: descriptionFromPage(html) };
  }

  async download(skill: CatalogSkill): Promise<SkillBundle> {
    const canonical = canonicalSkill(skill);
    const { parts } = identity(canonical.id);
    if (parts.length !== 3) {
      throw new SkillError('UNSUPPORTED_SOURCE', '此技能由外部站点托管，Skills.sh 暂未提供可用快照；当前版本仅安装 Skills.sh 提供的快照。');
    }
    const payload = await this.json(`/api/download/${parts.map(encodeURIComponent).join('/')}`, MAX_BUNDLE_BYTES);
    return validateSnapshot(payload, canonical);
  }

  private async json(path: string, limit: number): Promise<unknown> {
    const raw = await this.request(new URL(path, ORIGIN), limit);
    try { return JSON.parse(raw); }
    catch { throw new SkillError('SOURCE_UNAVAILABLE', 'Skills.sh 返回了无效数据，请稍后重试。', 502); }
  }

  private async request(initial: URL, limit: number): Promise<string> {
    let url = initial;
    const signal = AbortSignal.timeout(15_000);
    try {
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.port || url.username || url.password) {
          throw new SkillError('UNSAFE_REDIRECT', 'Skills.sh 请求跳转到了其他站点，已停止访问。', 502);
        }
        const response = await this.fetchImpl(url, { redirect: 'manual', signal, headers: { Accept: 'application/json, text/html', 'User-Agent': 'dsh-skills/0.1' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          const location = response.headers.get('location');
          if (!location) throw new SkillError('SOURCE_UNAVAILABLE', 'Skills.sh 返回了无效跳转，请稍后重试。', 502);
          if (redirects === 3) throw new SkillError('TOO_MANY_REDIRECTS', 'Skills.sh 跳转次数过多，请稍后重试。', 502);
          url = new URL(location, url);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) throw new SkillError('RATE_LIMITED', 'Skills.sh 请求过于频繁，请稍后重试。', 429);
          if (response.status === 404 && initial.pathname.startsWith('/api/download/')) {
            throw new SkillError('SNAPSHOT_UNAVAILABLE', 'Skills.sh 尚未提供此技能的下载快照，未安装任何文件。', 404);
          }
          throw new SkillError('SOURCE_UNAVAILABLE', `Skills.sh 暂不可用（HTTP ${response.status}），请稍后重试。`, 502);
        }
        if (Number(response.headers.get('content-length')) > limit) {
          await response.body?.cancel();
          throw new SkillError('RESPONSE_TOO_LARGE', 'Skills.sh 返回的数据过大，已停止下载。', 502);
        }
        const reader = response.body?.getReader();
        if (!reader) return '';
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > limit) {
            await reader.cancel();
            throw new SkillError('RESPONSE_TOO_LARGE', 'Skills.sh 返回的数据过大，已停止下载。', 502);
          }
          chunks.push(value);
        }
        return Buffer.concat(chunks).toString('utf8');
      }
      throw new SkillError('TOO_MANY_REDIRECTS', 'Skills.sh 跳转次数过多，请稍后重试。', 502);
    } catch (error) {
      if (error instanceof SkillError) throw error;
      if (signal.aborted) throw new SkillError('NETWORK_TIMEOUT', '连接 Skills.sh 超时，请检查网络后重试。', 504);
      throw new SkillError('NETWORK_ERROR', '无法连接 Skills.sh，请检查网络后重试。', 502);
    }
  }
}
