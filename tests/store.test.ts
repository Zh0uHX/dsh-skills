import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { SkillStore } from '../src/store.js';
import type { CatalogSkill, InstalledSkill, SkillBundle, SkillsSource } from '../src/types.js';
import { SkillError } from '../src/types.js';

const skill: CatalogSkill = {
  id: 'example/project/writing', skillId: 'writing', name: 'Writing',
  source: 'example/project', installs: 42, url: 'https://skills.sh/example/project/writing',
};

class FakeSource implements SkillsSource {
  files = [{ path: 'SKILL.md', contents: '# Writing\nWrite clearly.\n' },
    { path: 'references/checklist.md', contents: '- Use concrete words.\n' }];
  hash = 'upstream-v1';
  failure?: Error;
  downloads = 0;
  onDownload?: () => Promise<void>;
  async search() { return [skill]; }
  async details(value: CatalogSkill) { return value; }
  async download(value: CatalogSkill): Promise<SkillBundle> {
    this.downloads++;
    if (this.failure) throw this.failure;
    await this.onDownload?.();
    return { skill: value, files: this.files, upstreamHash: this.hash };
  }
}

async function fixture(t: TestContext) {
  const base = await mkdtemp(path.join(await realpath(tmpdir()), 'dsh-store-'));
  const root = path.join(base, 'skills');
  await mkdir(root);
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = new FakeSource();
  return { base, root, source, store: new SkillStore(root, source) };
}

function code(expected: string) {
  return (error: unknown): boolean => error instanceof SkillError && error.code === expected;
}

test('installs a complete discoverable skill and persists its record', async (t) => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'dsh-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = new FakeSource();
  const store = new SkillStore(root, source);
  const installed = await store.install(skill);
  assert.equal(path.dirname(installed.directory), root);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), source.files[0]!.contents);
  assert.equal(await readFile(path.join(installed.directory, 'references/checklist.md'), 'utf8'), source.files[1]!.contents);
  assert.deepEqual(await new SkillStore(root, source).list(), [installed]);
});

test('duplicate installation needs confirmation before downloading or writing', async (t) => {
  const { source, store } = await fixture(t);
  const first = await store.install(skill);
  source.files[0]!.contents = '# New contents';
  await assert.rejects(store.install(skill), code('CONFIRMATION_REQUIRED'));
  assert.equal(source.downloads, 1);
  assert.equal(await readFile(path.join(first.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
  const replacement = await store.install(skill, true);
  assert.equal(replacement.directory, first.directory);
  assert.equal(replacement.installedAt, first.installedAt);
  assert.notEqual(replacement.contentHash, first.contentHash);
  assert.equal((await store.list()).length, 1);
});

test('directory identity does not depend on display names or unsafe id characters', async (t) => {
  const { root, store } = await fixture(t);
  const first = await store.install({ ...skill, name: '../../outside' });
  const second = await store.install({ ...skill, id: '../../outside', name: '../../outside' });
  assert.notEqual(first.directory, second.directory);
  assert.equal(path.dirname(first.directory), root);
  assert.equal(path.dirname(second.directory), root);
  assert.match(path.basename(second.directory), /^skill-[a-f0-9]{32}$/);
});

test('updates compare complete content, require confirmation, and replace obsolete files', async (t) => {
  const { source, store } = await fixture(t);
  const first = await store.install(skill);
  assert.deepEqual(await store.checkUpdates(), [{ id: skill.id, status: 'current' }]);
  source.files = [{ path: 'SKILL.md', contents: '# Writing v2' }, { path: 'scripts/check.sh', contents: 'echo checked\n' }];
  assert.deepEqual(await store.checkUpdates(), [{ id: skill.id, status: 'available' }]);
  await assert.rejects(store.update(skill.id), code('CONFIRMATION_REQUIRED'));
  const updated = await store.update(skill.id, true);
  assert.equal(updated.installedAt, first.installedAt);
  assert.notEqual(updated.contentHash, first.contentHash);
  assert.equal(await readFile(path.join(updated.directory, 'SKILL.md'), 'utf8'), '# Writing v2');
  await assert.rejects(lstat(path.join(updated.directory, 'references/checklist.md')), { code: 'ENOENT' });
  assert.equal((await lstat(path.join(updated.directory, 'scripts/check.sh'))).mode & 0o111, 0);
  assert.deepEqual(await store.checkUpdates(), [{ id: skill.id, status: 'current' }]);
});

test('local modifications are detected and survive an unconfirmed update', async (t) => {
  const { store } = await fixture(t);
  const installed = await store.install(skill);
  await writeFile(path.join(installed.directory, 'SKILL.md'), '# My local changes');
  const [result] = await store.checkUpdates();
  assert.equal(result?.status, 'current');
  assert.match(result?.message ?? '', /本地文件有改动/u);
  await assert.rejects(store.update(skill.id), code('CONFIRMATION_REQUIRED'));
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# My local changes');
  await store.update(skill.id, true);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
});

test('download errors preserve installed files and return a per-skill check error', async (t) => {
  const { source, store } = await fixture(t);
  const installed = await store.install(skill);
  source.failure = new Error('offline');
  assert.deepEqual(await store.checkUpdates(), [{ id: skill.id, status: 'error', message: 'offline' }]);
  await assert.rejects(store.update(skill.id, true), /offline/);
  assert.deepEqual(await store.list(), [installed]);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
});

test('invalid replacement downloads leave the active directory and record intact', async (t) => {
  const { source, store } = await fixture(t);
  const installed = await store.install(skill);
  source.files.push({ path: '../escape', contents: 'invalid' });
  await assert.rejects(store.update(skill.id, true), code('UNSAFE_PATH'));
  assert.deepEqual(await store.list(), [installed]);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
});

test('a failed record commit restores the previous active directory', async (t) => {
  const { root, source, store } = await fixture(t);
  const installed = await store.install(skill);
  const state = path.join(root, '.dsh-skills/state.json');
  const originalState = await readFile(state, 'utf8');
  source.files[0]!.contents = '# Replacement must roll back';
  source.onDownload = async () => { await unlink(state); await mkdir(state); };
  await assert.rejects(store.update(skill.id, true), code('UNSAFE_PATH'));
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
  assert.deepEqual((await readdir(path.join(root, '.dsh-skills'))).sort(), ['state.json']);
  await rmdir(state);
  await writeFile(state, originalState);
  assert.deepEqual(await store.list(), [installed]);
});

test('a failed first-install record commit removes the staged installation', async (t) => {
  const { root, source, store } = await fixture(t);
  source.onDownload = async () => { await mkdir(path.join(root, '.dsh-skills/state.json')); };
  await assert.rejects(store.install(skill), code('UNSAFE_PATH'));
  assert.deepEqual(await readdir(root), ['.dsh-skills']);
  assert.deepEqual(await readdir(path.join(root, '.dsh-skills')), ['state.json']);
});

test('uninstall requires a known record and confirmation, preserving unrelated skills', async (t) => {
  const { root, store } = await fixture(t);
  const foreign = path.join(root, 'manual-skill');
  await mkdir(foreign);
  await writeFile(path.join(foreign, 'SKILL.md'), '# Installed manually');
  const installed = await store.install(skill);
  await assert.rejects(store.uninstall(skill.id), code('CONFIRMATION_REQUIRED'));
  await assert.rejects(store.uninstall('unknown', true), code('NOT_INSTALLED'));
  await assert.rejects(store.update('unknown', true), code('NOT_INSTALLED'));
  await store.uninstall(skill.id, true);
  await assert.rejects(lstat(installed.directory), { code: 'ENOENT' });
  assert.deepEqual(await store.list(), []);
  assert.equal(await readFile(path.join(foreign, 'SKILL.md'), 'utf8'), '# Installed manually');
});

test('path traversal, platform aliases, reserved files and prefix conflicts are rejected', async (t) => {
  const { base, root, source, store } = await fixture(t);
  const sentinel = path.join(base, 'outside');
  await writeFile(sentinel, 'keep');
  for (const attack of ['../outside', '/tmp/outside', 'a/../../outside', 'a\\..\\outside', 'C:/outside',
    'name\0suffix', './outside', 'a//outside', 'name.', 'CON.txt', 'aux', 'a/name ', '.dsh-skills-managed.json']) {
    source.files = [{ path: 'SKILL.md', contents: '# Safe' }, { path: attack, contents: 'overwrite' }];
    await assert.rejects(store.install(skill), code('UNSAFE_PATH'), attack);
  }
  for (const names of [['SKILL.md', 'skill.md'], ['a', 'a/b'], ['é.md', 'e\u0301.md']]) {
    source.files = [{ path: 'SKILL.md', contents: '# Safe' }, ...names.map(name => ({ path: name, contents: 'data' }))];
    await assert.rejects(store.install(skill), code('UNSAFE_PATH'));
  }
  assert.equal(await readFile(sentinel, 'utf8'), 'keep');
  assert.deepEqual(await readdir(root), ['.dsh-skills']);
});

test('missing entrypoints and oversized bundles fail before installation', async (t) => {
  const { root, source, store } = await fixture(t);
  source.files = [{ path: 'README.md', contents: 'not a skill' }];
  await assert.rejects(store.install(skill), code('INVALID_BUNDLE'));
  source.files = [{ path: 'SKILL.md', contents: 'x'.repeat(2 * 1024 * 1024 + 1) }];
  await assert.rejects(store.install(skill), code('BUNDLE_TOO_LARGE'));
  source.files = Array.from({ length: 257 }, (_, index) => ({ path: index ? `${index}.md` : 'SKILL.md', contents: 'x' }));
  await assert.rejects(store.install(skill), code('INVALID_BUNDLE'));
  source.files = Array.from({ length: 5 }, (_, index) => ({ path: index ? `${index}.md` : 'SKILL.md', contents: 'x'.repeat(2 * 1024 * 1024) }));
  await assert.rejects(store.install(skill), code('BUNDLE_TOO_LARGE'));
  assert.deepEqual(await readdir(root), ['.dsh-skills']);
});

test('symlinked root and ancestors are rejected without writing through them', async (t) => {
  const { base, source } = await fixture(t);
  const outside = path.join(base, 'outside');
  await mkdir(outside);
  const alias = path.join(base, 'alias');
  await symlink(outside, alias);
  await assert.rejects(new SkillStore(alias, source).install(skill), code('UNSAFE_PATH'));
  await assert.rejects(new SkillStore(path.join(alias, 'nested'), source).install(skill), code('UNSAFE_PATH'));
  assert.deepEqual(await readdir(outside), []);
});

test('symlinked private metadata and lock locations are rejected', async (t) => {
  const { base, root, source } = await fixture(t);
  const outside = path.join(base, 'outside');
  await mkdir(outside);
  const privateDirectory = path.join(root, '.dsh-skills');
  await symlink(outside, privateDirectory);
  await assert.rejects(new SkillStore(root, source).install(skill), code('UNSAFE_PATH'));
  await unlink(privateDirectory);
  await mkdir(privateDirectory);
  await symlink(outside, path.join(privateDirectory, 'lock'));
  await assert.rejects(new SkillStore(root, source).install(skill), code('UNSAFE_PATH'));
  assert.deepEqual(await readdir(outside), []);
});

test('symlinked installed files block mutation and leave the outside target intact', async (t) => {
  const { base, store } = await fixture(t);
  const installed = await store.install(skill);
  const outside = path.join(base, 'outside');
  await writeFile(outside, 'must survive');
  const entrypoint = path.join(installed.directory, 'SKILL.md');
  await unlink(entrypoint);
  await symlink(outside, entrypoint);
  await assert.rejects(store.update(skill.id, true), code('UNSAFE_PATH'));
  await assert.rejects(store.uninstall(skill.id, true), code('UNSAFE_PATH'));
  await assert.rejects(store.list(), code('UNSAFE_PATH'));
  assert.equal((await store.checkUpdates())[0]?.status, 'error');
  assert.equal(await readFile(outside, 'utf8'), 'must survive');
  assert.equal((await lstat(entrypoint)).isSymbolicLink(), true);
});

test('hardlinked installed files are replaced atomically without modifying other links', async (t) => {
  const { base, source, store } = await fixture(t);
  const installed = await store.install(skill);
  const outside = path.join(base, 'outside');
  await link(path.join(installed.directory, 'SKILL.md'), outside);
  source.files[0]!.contents = '# Updated';
  await store.update(skill.id, true);
  assert.equal(await readFile(outside, 'utf8'), '# Writing\nWrite clearly.\n');
  await store.uninstall(skill.id, true);
  assert.equal(await readFile(outside, 'utf8'), '# Writing\nWrite clearly.\n');
});

test('existing unrecorded directories and missing ownership markers are never overwritten', async (t) => {
  const { root, store } = await fixture(t);
  const installed = await store.install(skill);
  await store.uninstall(skill.id, true);
  await mkdir(installed.directory);
  await writeFile(path.join(installed.directory, 'SKILL.md'), '# Other installer');
  await assert.rejects(store.install(skill, true), code('UNMANAGED_DIRECTORY'));
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Other installer');
  await rm(installed.directory, { recursive: true });
  const owned = await store.install(skill);
  await unlink(path.join(owned.directory, '.dsh-skills-managed.json'));
  await assert.rejects(store.update(skill.id, true), code('UNMANAGED_DIRECTORY'));
  await assert.rejects(store.uninstall(skill.id, true), code('UNMANAGED_DIRECTORY'));
  assert.equal(path.dirname(owned.directory), root);
});

test('tampered records cannot redirect deletion outside the configured root', async (t) => {
  const { base, root, store } = await fixture(t);
  await store.install(skill);
  const stateFile = path.join(root, '.dsh-skills/state.json');
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  const outside = path.join(base, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'SKILL.md'), '# Keep');
  state.records[0].directory = outside;
  await writeFile(stateFile, JSON.stringify(state));
  await assert.rejects(store.uninstall(skill.id, true), code('INVALID_STATE'));
  assert.equal(await readFile(path.join(outside, 'SKILL.md'), 'utf8'), '# Keep');
});

test('symlinked state files cannot make the store read or replace outside metadata', async (t) => {
  const { base, root, store } = await fixture(t);
  await store.install(skill);
  const stateFile = path.join(root, '.dsh-skills/state.json');
  const outside = path.join(base, 'outside-state.json');
  await rename(stateFile, outside);
  const original = await readFile(outside, 'utf8');
  await symlink(outside, stateFile);
  await assert.rejects(store.list(), code('UNSAFE_PATH'));
  await assert.rejects(store.uninstall(skill.id, true), code('UNSAFE_PATH'));
  assert.equal(await readFile(outside, 'utf8'), original);
});

test('root replacement is detected before a subsequent operation', async (t) => {
  const { root, store } = await fixture(t);
  const installed = await store.install(skill);
  await rename(root, `${root}-original`);
  await mkdir(root);
  await assert.rejects(store.install({ ...skill, id: 'second' }), code('UNSAFE_PATH'));
  assert.deepEqual(await readdir(root), []);
  assert.equal(await readFile(path.join(`${root}-original`, path.basename(installed.directory), 'SKILL.md'), 'utf8'),
    '# Writing\nWrite clearly.\n');
});

test('multiple instances serialize state changes under the same root', async (t) => {
  const { root, source, store } = await fixture(t);
  const second = new SkillStore(root, source);
  const third = new SkillStore(root, source);
  const skills = [skill, { ...skill, id: 'other/project/writing' }, { ...skill, id: 'third/project/writing' }];
  await Promise.all([store.install(skills[0]!), second.install(skills[1]!), third.install(skills[2]!)]);
  assert.deepEqual((await store.list()).map(item => item.id).sort(), skills.map(item => item.id).sort());
  await Promise.all([store.uninstall(skills[0]!.id, true), second.uninstall(skills[1]!.id, true)]);
  assert.deepEqual((await third.list()).map(item => item.id), [skills[2]!.id]);
});

test('distinct sources cannot install the same DSH frontmatter name', async (t) => {
  const { root, source, store } = await fixture(t);
  source.files[0]!.contents = '---\nname: writing\ndescription: Write clearly.\n---\nFirst skill';
  const installed = await store.install(skill);
  const before = await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8');
  await assert.rejects(store.install({ ...skill, id: 'another/project/writing', source: 'another/project' }), code('SKILL_NAME_CONFLICT'));
  assert.deepEqual(await store.list(), [installed]);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), before);
  assert.equal((await readdir(root)).filter(name => name.startsWith('skill-')).length, 1);
});

test('unmanaged directory and standalone Markdown names block conflicting installation', async (t) => {
  const { root, source, store } = await fixture(t);
  source.files[0]!.contents = '---\nname: writing\ndescription: Write clearly.\n---\nIncoming';
  const unmanaged = path.join(root, 'manual');
  await mkdir(unmanaged);
  const existing = '---\nname: "writing"\ndescription: Keep this skill.\n---\nLocal content';
  await writeFile(path.join(unmanaged, 'SKILL.md'), existing);
  await assert.rejects(store.install(skill, true), code('SKILL_NAME_CONFLICT'));
  assert.equal(await readFile(path.join(unmanaged, 'SKILL.md'), 'utf8'), existing);
  await rename(path.join(unmanaged, 'SKILL.md'), path.join(root, 'manual.md'));
  await rmdir(unmanaged);
  await assert.rejects(store.install(skill, true), code('SKILL_NAME_CONFLICT'));
  assert.equal(await readFile(path.join(root, 'manual.md'), 'utf8'), existing);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await readdir(path.join(root, '.dsh-skills')), []);
});

test('a conflicting update preserves the current skill and its record', async (t) => {
  const { root, source, store } = await fixture(t);
  source.files[0]!.contents = '---\nname: original\ndescription: Original.\n---\nKeep';
  const installed = await store.install(skill);
  const original = await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8');
  const manual = path.join(root, 'manual');
  await mkdir(manual);
  await writeFile(path.join(manual, 'SKILL.md'), '---\nname: writing\ndescription: Local.\n---\nManual');
  source.files[0]!.contents = '---\nname: writing\ndescription: New.\n---\nOverwrite';
  await assert.rejects(store.update(skill.id, true), code('SKILL_NAME_CONFLICT'));
  assert.deepEqual(await store.list(), [installed]);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), original);
  assert.deepEqual(await readdir(path.join(root, '.dsh-skills')), ['state.json']);
});

test('name collision scans never follow an unmanaged SKILL.md symlink', async (t) => {
  const { base, root, source, store } = await fixture(t);
  source.files[0]!.contents = '---\nname: writing\ndescription: Write clearly.\n---\nIncoming';
  const outside = path.join(base, 'outside.md');
  const original = '---\nname: writing\ndescription: Outside.\n---\nKeep';
  await writeFile(outside, original);
  const manual = path.join(root, 'manual');
  await mkdir(manual);
  await symlink(outside, path.join(manual, 'SKILL.md'));
  await assert.rejects(store.install(skill), code('UNSAFE_PATH'));
  assert.equal(await readFile(outside, 'utf8'), original);
  assert.deepEqual(await store.list(), []);
});

test('missing managed directories stay visible and confirmed cleanup preserves healthy skills', async (t) => {
  const { store } = await fixture(t);
  const missing = await store.install(skill);
  const healthy = await store.install({ ...skill, id: 'other/project/healthy', skillId: 'healthy' });
  await rm(missing.directory, { recursive: true });
  const rows = await store.list();
  assert.equal(rows.length, 2);
  assert.match(rows.find(row => row.id === missing.id)?.problem ?? '', /目录已不存在/u);
  assert.deepEqual(rows.find(row => row.id === healthy.id), healthy);
  await assert.rejects(store.uninstall(missing.id), code('CONFIRMATION_REQUIRED'));
  assert.equal((await store.list()).length, 2);
  await store.uninstall(missing.id, true);
  assert.deepEqual(await store.list(), [healthy]);
  assert.equal(await readFile(path.join(healthy.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
});

function serializeState(records: InstalledSkill[]): string {
  return JSON.stringify({ version: 1, records }, null, 2) + '\n';
}

function generatedRecord(template: InstalledSkill, root: string, index: number, description = ''): InstalledSkill {
  const id = `generated/project/item-${index}`;
  return { ...template, id, skill: { ...template.skill, id, skillId: `item-${index}`, description },
    directory: path.join(root, `skill-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`) };
}

test('UTF-8 metadata capacity is enforced before replacing an active skill', async (t) => {
  const { root, source, store } = await fixture(t);
  const installed = await store.install(skill);
  const records = [installed];
  const largeDescription = '中'.repeat(16000);
  for (let index = 0;; index++) {
    const next = generatedRecord(installed, root, index, largeDescription);
    if (Buffer.byteLength(serializeState([...records, next])) > 1024 * 1024) break;
    records.push(next);
  }
  const stateFile = path.join(root, '.dsh-skills/state.json');
  const saved = serializeState(records);
  await writeFile(stateFile, saved);
  source.files[0]!.contents = '---\nname: writing\ndescription: Updated.\n---\nReplacement';
  const normalDownload = source.download.bind(source);
  source.download = async (value) => {
    const bundle = await normalDownload(value);
    return { ...bundle, skill: { ...bundle.skill, description: largeDescription } };
  };
  await assert.rejects(store.update(skill.id, true), code('STORE_CAPACITY'));
  assert.equal(await readFile(stateFile, 'utf8'), saved);
  assert.equal(await readFile(path.join(installed.directory, 'SKILL.md'), 'utf8'), '# Writing\nWrite clearly.\n');
  assert.deepEqual(await readdir(path.join(root, '.dsh-skills')), ['state.json']);
});

test('a full record table rejects the next installation without corrupting readable state', async (t) => {
  const { root, source, store } = await fixture(t);
  const installed = await store.install(skill);
  const records = [installed, ...Array.from({ length: 999 }, (_, index) => generatedRecord(installed, root, index))];
  const stateFile = path.join(root, '.dsh-skills/state.json');
  const saved = serializeState(records);
  assert.ok(Buffer.byteLength(saved) < 1024 * 1024);
  await writeFile(stateFile, saved);
  source.files[0]!.contents = '---\nname: incoming\ndescription: New skill.\n---\nIncoming';
  await assert.rejects(store.install({ ...skill, id: 'new/project/incoming', skillId: 'incoming' }), code('STORE_CAPACITY'));
  assert.equal(await readFile(stateFile, 'utf8'), saved);
  assert.equal((await store.list()).length, 1000);
  assert.equal((await readdir(root)).filter(name => name.startsWith('skill-')).length, 1);
});
