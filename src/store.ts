import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseDocument } from 'yaml';
import { SkillError } from './types.js';
import type { CatalogSkill, InstalledSkill, SkillBundle, SkillsSource, UpdateCheck } from './types.js';

const PRIVATE_DIR = '.dsh-skills';
const OWNER_FILE = '.dsh-skills-managed.json';
const MAX_FILES = 256;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_RECORDS = 1000;
type FileEntry = SkillBundle['files'][number];

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function unsafe(message: string): never {
  throw new SkillError('UNSAFE_PATH', message);
}

async function statIfExists(file: string): Promise<Stats | undefined> {
  try { return await lstat(file); }
  catch (error) { if (hasCode(error, 'ENOENT')) return undefined; throw error; }
}

function validatePath(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 1024 ||
      /[\\:\u0000-\u001f\u007f]/u.test(value) || path.posix.isAbsolute(value)) {
    unsafe('技能包含不安全的文件路径。');
  }
  const segments = value.split('/');
  if (segments.length > 16 || segments.some(segment => !segment || segment === '.' || segment === '..' ||
      /[. ]$/u.test(segment) || Buffer.byteLength(segment) > 255 ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment))) {
    unsafe(`不支持的技能文件路径：${value}`);
  }
  if (value.normalize('NFC').toLowerCase() === OWNER_FILE) unsafe('技能使用了插件保留的文件名。');
}

function validateFiles(value: unknown): FileEntry[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_FILES) {
    throw new SkillError('INVALID_BUNDLE', `技能必须包含 1–${MAX_FILES} 个文件。`);
  }
  const names = new Set<string>();
  let total = 0;
  const files = value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('path' in entry) || !('contents' in entry)) {
      throw new SkillError('INVALID_BUNDLE', '技能文件格式错误。');
    }
    validatePath(entry.path);
    if (typeof entry.contents !== 'string') throw new SkillError('INVALID_BUNDLE', '仅支持文本技能文件。');
    const size = Buffer.byteLength(entry.contents);
    total += size;
    if (size > MAX_FILE_BYTES || total > MAX_TOTAL_BYTES) {
      throw new SkillError('BUNDLE_TOO_LARGE', '技能超过文件大小限制。', 413);
    }
    // Also reject aliases on case-insensitive and Unicode-normalizing filesystems.
    const key = entry.path.normalize('NFC').toLowerCase();
    if (names.has(key)) unsafe('技能包含重复文件路径。');
    names.add(key);
    return { path: entry.path, contents: entry.contents };
  });
  for (const name of names) {
    const parts = name.split('/');
    while (parts.length > 1) {
      parts.pop();
      if (names.has(parts.join('/'))) unsafe('技能文件和目录路径冲突。');
    }
  }
  if (!files.some(file => file.path === 'SKILL.md')) {
    throw new SkillError('INVALID_BUNDLE', '技能根目录缺少 SKILL.md。');
  }
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function hashFiles(files: FileEntry[]): string {
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}

function frontmatterName(contents: string): string | undefined {
  const yaml = contents.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1];
  if (yaml === undefined) return undefined;
  try {
    if (Buffer.byteLength(yaml) > 100_000) throw new Error('frontmatter too large');
    const document = parseDocument(yaml, { schema: 'core', uniqueKeys: true });
    if (document.errors.length) throw new Error('invalid YAML');
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    if (!value || typeof value !== 'object' || !('name' in value)) return undefined;
    return typeof value.name === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.name) ? value.name : undefined;
  } catch {
    throw new SkillError('NAME_CHECK_FAILED', '无法安全解析技能的 YAML 名称；请检查 SKILL.md 后重试。', 409);
  }
}

function serializeRecords(records: InstalledSkill[]): string {
  if (records.length > MAX_RECORDS) {
    throw new SkillError('STORE_CAPACITY', `安装记录最多支持 ${MAX_RECORDS} 个技能，请先卸载不再使用的技能。`, 409);
  }
  const serialized = JSON.stringify({ version: 1, records }, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) {
    throw new SkillError('STORE_CAPACITY', '安装记录超过 1 MiB，操作未提交；请先卸载不再使用的技能。', 409);
  }
  return serialized;
}

function catalog(value: unknown): CatalogSkill {
  if (!value || typeof value !== 'object') throw new SkillError('INVALID_SKILL', '技能信息格式错误。');
  const input = value as Record<string, unknown>;
  for (const key of ['id', 'skillId', 'name', 'source', 'url']) {
    if (typeof input[key] !== 'string' || !input[key] || Buffer.byteLength(input[key]) > 2048 ||
        /[\u0000-\u001f\u007f]/u.test(input[key])) throw new SkillError('INVALID_SKILL', `技能字段无效：${key}`);
  }
  if (typeof input.installs !== 'number' || !Number.isFinite(input.installs) || input.installs < 0 ||
      (input.description !== undefined && (typeof input.description !== 'string' || input.description.length > 16000))) {
    throw new SkillError('INVALID_SKILL', '技能描述或安装次数无效。');
  }
  return { id: input.id as string, skillId: input.skillId as string, name: input.name as string,
    source: input.source as string, url: input.url as string, installs: input.installs,
    ...(input.description === undefined ? {} : { description: input.description as string }) };
}

/** Owns only recorded, marked skill directories. No downloaded content is executed. */
export class SkillStore {
  readonly root: string;
  private anchor?: { dev: number; ino: number };

  constructor(root: string, private readonly source: SkillsSource) {
    if (!root || root.includes('\0')) throw new SkillError('INVALID_ROOT', '技能根目录无效。');
    this.root = path.resolve(root);
  }

  async list(): Promise<InstalledSkill[]> {
    return this.locked(async () => {
      const records = await this.readRecords();
      for (const record of records) {
        if (!await this.assertPath(record.directory, true)) {
          record.problem = '技能目录已不存在；确认卸载可仅清理安装记录，然后重新安装。';
          continue;
        }
        await this.assertOwned(record);
      }
      return records;
    });
  }

  async install(input: CatalogSkill, confirmed = false): Promise<InstalledSkill> {
    const skill = catalog(input);
    return this.locked(async () => {
      const records = await this.readRecords();
      const previous = records.find(record => record.id === skill.id);
      if (previous && !confirmed) this.confirm('此技能已安装，重新安装会覆盖本地文件。');
      if (previous) await this.assertOwned(previous);
      else await this.assertVacant(this.directory(skill.id));
      return this.replace(records, skill, previous);
    });
  }

  async checkUpdates(): Promise<UpdateCheck[]> {
    return this.locked(async () => {
      const records = await this.readRecords();
      const results: UpdateCheck[] = [];
      for (const record of records) {
        try {
          await this.assertOwned(record);
          const bundle = await this.download(record.skill);
          const modified = hashFiles(await this.readSkillFiles(record.directory)) !== record.contentHash;
          const changed = hashFiles(bundle.files) !== record.contentHash;
          results.push({ id: record.id, status: changed ? 'available' : 'current',
            ...(modified ? { message: '本地文件有改动；更新会覆盖这些内容。' } : {}) });
        } catch (error) {
          results.push({ id: record.id, status: 'error', message: error instanceof Error ? error.message : '检查更新失败。' });
        }
      }
      return results;
    });
  }

  async update(id: string, confirmed = false): Promise<InstalledSkill> {
    return this.locked(async () => {
      const records = await this.readRecords();
      const previous = this.find(records, id);
      if (!confirmed) this.confirm('更新会替换整个技能目录，包括本地修改；请确认后继续。');
      await this.assertOwned(previous);
      return this.replace(records, previous.skill, previous);
    });
  }

  async uninstall(id: string, confirmed = false): Promise<void> {
    return this.locked(async () => {
      const records = await this.readRecords();
      const record = this.find(records, id);
      if (!confirmed) this.confirm('卸载会删除该技能目录及其本地修改；请确认后继续。');
      if (!await this.assertPath(record.directory, true)) {
        await this.saveRecords(records.filter(item => item.id !== id));
        return;
      }
      await this.assertOwned(record);
      await this.inspectTree(record.directory);
      const backup = this.privatePath(`removed-${randomUUID()}`);
      await this.move(record.directory, backup);
      try {
        await this.saveRecords(records.filter(item => item.id !== id));
      } catch (error) {
        await this.move(backup, record.directory);
        throw error;
      }
      await this.removeTree(backup);
    });
  }

  private directory(id: string): string {
    return path.join(this.root, `skill-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`);
  }

  private privatePath(name: string): string { return path.join(this.root, PRIVATE_DIR, name); }

  private confirm(message: string): never { throw new SkillError('CONFIRMATION_REQUIRED', message, 409); }

  private find(records: InstalledSkill[], id: string): InstalledSkill {
    const record = records.find(item => item.id === id);
    if (!record) throw new SkillError('NOT_INSTALLED', '此技能没有本插件的安装记录。', 404);
    return record;
  }

  /** Reject symlinks at every existing ancestor, including the configured root. */
  private async ensureRoot(): Promise<void> {
    const parsed = path.parse(this.root);
    let current = parsed.root;
    for (const component of this.root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      let stats = await statIfExists(current);
      if (!stats) {
        if (current !== this.root) throw new SkillError('INVALID_ROOT', '技能根目录的父目录必须已存在。');
        // Parent checks are deliberately repeated before creation; mkdir is never recursive.
        const parent = await lstat(path.dirname(current));
        if (!parent.isDirectory() || parent.isSymbolicLink()) unsafe('技能目录的父路径不安全。');
        try { await mkdir(current, { mode: 0o700 }); }
        catch (error) { if (!hasCode(error, 'EEXIST')) throw error; }
        stats = await lstat(current);
      }
      if (!stats.isDirectory() || stats.isSymbolicLink()) unsafe('技能目录及其父路径不能是符号链接。');
    }
    const stats = await lstat(this.root);
    if (await realpath(this.root) !== this.root ||
        (this.anchor && (stats.ino !== this.anchor.ino || stats.dev !== this.anchor.dev))) {
      unsafe('技能根目录发生变化，操作已中止。');
    }
    this.anchor ??= { ino: stats.ino, dev: stats.dev };
  }

  /** Checks containment and each component without following links. */
  private async assertPath(file: string, allowMissing = false): Promise<Stats | undefined> {
    await this.ensureRoot();
    const relative = path.relative(this.root, file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      unsafe('操作路径超出技能根目录。');
    }
    let current = this.root;
    const segments = relative.split(path.sep);
    for (let i = 0; i < segments.length; i++) {
      current = path.join(current, segments[i]!);
      const stats = await statIfExists(current);
      if (!stats) {
        if (allowMissing) return undefined;
        throw new SkillError('MISSING_PATH', '技能文件已被移动或删除。', 409);
      }
      if (stats.isSymbolicLink() || (!stats.isDirectory() && i < segments.length - 1)) {
        unsafe('技能路径包含符号链接或非目录节点。');
      }
      if (i === segments.length - 1) return stats;
    }
    return undefined;
  }

  private async makeDirectory(directory: string): Promise<void> {
    const stats = await this.assertPath(directory, true);
    if (stats) {
      if (!stats.isDirectory()) unsafe('插件目录被其他文件占用。');
      return;
    }
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) { if (!hasCode(error, 'EEXIST')) throw error; }
    const created = await this.assertPath(directory);
    if (!created?.isDirectory()) unsafe('插件目录创建失败。');
  }

  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureRoot();
    await this.makeDirectory(path.join(this.root, PRIVATE_DIR));
    const lock = this.privatePath('lock');
    const started = Date.now();
    let identity: Stats;
    while (true) {
      await this.assertPath(lock, true);
      try {
        await mkdir(lock, { mode: 0o700 });
        identity = await lstat(lock);
        break;
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
        const existing = await this.assertPath(lock, true);
        if (!existing) continue; // The previous holder can finish between mkdir and lstat.
        if (!existing.isDirectory()) unsafe('插件锁路径不安全。');
        if (Date.now() - started > 10_000) {
          throw new SkillError('STORE_BUSY', '另一项技能操作尚未完成；若进程异常退出，请检查插件锁。', 409);
        }
        await delay(25);
      }
    }
    try { return await operation(); }
    finally {
      const current = await this.assertPath(lock);
      if (current?.ino !== identity.ino || current.dev !== identity.dev) unsafe('插件锁在操作期间发生变化。');
      await rmdir(lock);
    }
  }

  private async readText(file: string, limit: number): Promise<string> {
    const stats = await this.assertPath(file);
    if (!stats?.isFile() || stats.size > limit) unsafe('技能文件不是普通文件或超过大小限制。');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== stats.ino || opened.dev !== stats.dev || opened.size > limit) {
        unsafe('读取时文件发生变化。');
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength > limit) unsafe('技能文件超过大小限制。');
      return bytes.toString('utf8');
    } finally { await handle.close(); }
  }

  private async readRecords(): Promise<InstalledSkill[]> {
    const file = this.privatePath('state.json');
    if (!await this.assertPath(file, true)) return [];
    try {
      const state: unknown = JSON.parse(await this.readText(file, MAX_STATE_BYTES));
      if (!state || typeof state !== 'object' || !('version' in state) || state.version !== 1 ||
          !('records' in state) || !Array.isArray(state.records) || state.records.length > MAX_RECORDS) throw new Error();
      const ids = new Set<string>();
      return state.records.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') throw new Error();
        const record = entry as InstalledSkill;
        const skill = catalog(record.skill);
        if (typeof record.id !== 'string' || record.id !== skill.id || ids.has(record.id) ||
            record.directory !== this.directory(record.id) || !/^[a-f0-9]{64}$/u.test(record.contentHash) ||
            typeof record.upstreamHash !== 'string' || record.upstreamHash.length > 256 ||
            typeof record.installedAt !== 'string' || !Number.isFinite(Date.parse(record.installedAt)) ||
            typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error();
        ids.add(record.id);
        return { id: record.id, skill, directory: record.directory, contentHash: record.contentHash,
          upstreamHash: record.upstreamHash, installedAt: record.installedAt, updatedAt: record.updatedAt };
      });
    } catch (error) {
      if (error instanceof SkillError && error.code === 'UNSAFE_PATH') throw error;
      throw new SkillError('INVALID_STATE', '安装记录损坏；为避免覆盖现有文件，操作已中止。', 409);
    }
  }

  private async writeNew(file: string, contents: string): Promise<void> {
    if (await this.assertPath(file, true)) unsafe('写入目标已存在。');
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(contents, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
  }

  private async saveRecords(records: InstalledSkill[]): Promise<void> {
    const serialized = serializeRecords(records);
    const target = this.privatePath('state.json');
    const stats = await this.assertPath(target, true);
    if (stats && !stats.isFile()) unsafe('安装记录路径被其他节点占用。');
    const temporary = this.privatePath(`state-${randomUUID()}.tmp`);
    try {
      await this.writeNew(temporary, serialized);
      await this.assertPath(target, true);
      await this.assertPath(temporary);
      await rename(temporary, target);
    } finally {
      if (await this.assertPath(temporary, true)) await unlink(temporary);
    }
  }

  private async assertVacant(directory: string): Promise<void> {
    if (await this.assertPath(directory, true)) {
      throw new SkillError('UNMANAGED_DIRECTORY', '目标目录已存在且不属于本插件，不能覆盖。', 409);
    }
  }

  private async assertOwned(record: InstalledSkill): Promise<void> {
    const stats = await this.assertPath(record.directory);
    if (!stats?.isDirectory()) unsafe('已安装技能路径不是目录。');
    const marker = path.join(record.directory, OWNER_FILE);
    if (!await this.assertPath(marker, true)) {
      throw new SkillError('UNMANAGED_DIRECTORY', '技能所有权标记缺失，不能修改该目录。', 409);
    }
    let owner: unknown;
    try { owner = JSON.parse(await this.readText(marker, 8192)); }
    catch (error) { if (error instanceof SkillError) throw error; }
    if (!owner || typeof owner !== 'object' || !('version' in owner) || owner.version !== 1 ||
        !('id' in owner) || owner.id !== record.id) {
      throw new SkillError('UNMANAGED_DIRECTORY', '技能所有权标记不匹配，不能修改该目录。', 409);
    }
    await this.inspectTree(record.directory);
  }

  private async download(skill: CatalogSkill): Promise<SkillBundle> {
    const bundle = await this.source.download(skill);
    const returned = catalog(bundle.skill);
    if (returned.id !== skill.id || returned.source !== skill.source || returned.skillId !== skill.skillId ||
        typeof bundle.upstreamHash !== 'string' || bundle.upstreamHash.length > 256) {
      throw new SkillError('INVALID_BUNDLE', '下载结果与请求的技能不一致。');
    }
    return { skill: returned, files: validateFiles(bundle.files), upstreamHash: bundle.upstreamHash };
  }

  private async assertNameAvailable(files: FileEntry[], ownDirectory: string): Promise<void> {
    const name = frontmatterName(files.find(file => file.path === 'SKILL.md')!.contents);
    // The source adapter validates installable frontmatter. DSH ignores files without a name.
    if (name === undefined) return;
    await this.ensureRoot();
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      const candidate = path.join(this.root, entry.name);
      if (entry.name === PRIVATE_DIR || candidate === ownDirectory) continue;
      const stats = await this.assertPath(candidate, true);
      if (!stats) continue;
      const entrypoint = stats.isDirectory() ? path.join(candidate, 'SKILL.md') :
        stats.isFile() && entry.name.endsWith('.md') ? candidate : undefined;
      if (!entrypoint || !await this.assertPath(entrypoint, true)) continue;
      let existingName: string | undefined;
      try { existingName = frontmatterName(await this.readText(entrypoint, MAX_FILE_BYTES)); }
      catch (error) {
        if (error instanceof SkillError && error.code === 'NAME_CHECK_FAILED') {
          throw new SkillError(error.code, `${error.message} 路径：${entrypoint}`, error.status);
        }
        throw error;
      }
      if (existingName === name) {
        throw new SkillError('SKILL_NAME_CONFLICT', `技能名称「${name}」已被 ${entry.name} 使用。DSH 按名称去重，请先处理同名技能。`, 409);
      }
    }
  }

  private async inspectTree(directory: string): Promise<string[]> {
    const files: string[] = [];
    let nodes = 0;
    const visit = async (current: string, depth: number): Promise<void> => {
      if (depth > 20 || files.length > 2000) unsafe('本地技能目录过大或过深，无法安全处理。');
      const stats = await this.assertPath(current);
      if (!stats?.isDirectory()) unsafe('技能目录类型无效。');
      for (const entry of await readdir(current, { withFileTypes: true })) {
        if (++nodes > 4000) unsafe('本地技能目录包含过多文件或目录。');
        const child = path.join(current, entry.name);
        const childStats = await this.assertPath(child);
        if (childStats?.isDirectory()) await visit(child, depth + 1);
        else if (childStats?.isFile()) files.push(child);
        else unsafe('技能目录包含符号链接或特殊文件。');
      }
    };
    await visit(directory, 0);
    return files;
  }

  private async readSkillFiles(directory: string): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    for (const file of await this.inspectTree(directory)) {
      const relative = path.relative(directory, file).split(path.sep).join('/');
      if (relative === OWNER_FILE) continue;
      files.push({ path: relative, contents: await this.readText(file, MAX_FILE_BYTES) });
    }
    return validateFiles(files);
  }

  private async move(from: string, to: string): Promise<void> {
    await this.assertPath(from);
    await this.assertVacant(to);
    await rename(from, to);
  }

  private async removeTree(directory: string): Promise<void> {
    await this.inspectTree(directory);
    const remove = async (current: string): Promise<void> => {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        const stats = await this.assertPath(child);
        if (stats?.isDirectory()) await remove(child);
        else if (stats?.isFile()) { await this.assertPath(child); await unlink(child); }
        else unsafe('清理目录包含不安全的文件。');
      }
      await this.assertPath(current);
      await rmdir(current);
    };
    await remove(directory);
  }

  private async replace(records: InstalledSkill[], skill: CatalogSkill, previous?: InstalledSkill): Promise<InstalledSkill> {
    // Download and validate everything before touching the active directory.
    const bundle = await this.download(skill);
    const stage = this.privatePath(`stage-${randomUUID()}`);
    const backup = this.privatePath(`backup-${randomUUID()}`);
    const directory = this.directory(skill.id);
    const now = new Date().toISOString();
    const record: InstalledSkill = { id: skill.id, skill: bundle.skill, directory,
      contentHash: hashFiles(bundle.files), upstreamHash: bundle.upstreamHash,
      installedAt: previous?.installedAt ?? now, updatedAt: now };
    const nextRecords = [...records.filter(item => item.id !== skill.id), record];
    serializeRecords(nextRecords);
    await this.assertNameAvailable(bundle.files, directory);
    let backedUp = false;
    let activated = false;
    let committed = false;
    try {
      await this.makeDirectory(stage);
      for (const file of bundle.files) {
        let parent = stage;
        for (const segment of file.path.split('/').slice(0, -1)) {
          parent = path.join(parent, segment);
          await this.makeDirectory(parent);
        }
        await this.writeNew(path.join(stage, ...file.path.split('/')), file.contents);
      }
      await this.writeNew(path.join(stage, OWNER_FILE), JSON.stringify({ version: 1, id: skill.id }) + '\n');
      await this.assertNameAvailable(bundle.files, directory);
      if (previous) {
        await this.assertOwned(previous);
        await this.move(directory, backup);
        backedUp = true;
      }
      await this.move(stage, directory);
      activated = true;
      await this.saveRecords(nextRecords);
      committed = true;
      return record;
    } catch (error) {
      if (activated && !committed) await this.move(directory, stage);
      if (backedUp && !committed) await this.move(backup, directory);
      throw error;
    } finally {
      if (await this.assertPath(stage, true)) await this.removeTree(stage);
      if (committed && await this.assertPath(backup, true)) await this.removeTree(backup);
    }
  }
}
