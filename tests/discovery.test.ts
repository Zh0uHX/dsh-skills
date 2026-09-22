import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import SkillRegistry from '@deepseek-ai/dsh-skill';
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { publishSkillObservation } from '../src/index.js';
import { SkillStore } from '../src/store.js';
import type { CatalogSkill, SkillsSource } from '../src/types.js';

test('published DSH discovers and refreshes skills through the host mutation notification', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-skills-discovery-')));
  const dshHome = join(directory, '.dsh');
  const root = join(dshHome, 'skills');
  const cwd = join(directory, 'workspace');
  await mkdir(root, { recursive: true });
  await mkdir(cwd);

  const skill: CatalogSkill = {
    id: 'test/discovery/dsh-discovery-check', source: 'test/discovery',
    skillId: 'dsh-discovery-check', name: 'dsh-discovery-check', installs: 1,
    url: 'https://www.skills.sh/test/discovery/dsh-discovery-check',
  };
  let revision = 1;
  const source: SkillsSource = {
    search: async () => [skill],
    details: async () => skill,
    download: async () => ({
      skill, upstreamHash: String(revision).repeat(64),
      files: [{
        path: 'SKILL.md',
        contents: `---\nname: ${skill.skillId}\ndescription: Discovery revision ${revision}\n---\n\nBody revision ${revision}.\n`,
      }, { path: 'references/check.txt', contents: 'A bundled resource.' }],
    }),
  };
  const store = new SkillStore(root, source);
  const ctx = new Context();
  const localFs = await ctx.plugin(LocalFileSystem);
  const registry = await ctx.plugin(SkillRegistry);
  const filesystem = await ctx.plugin(SkillFilesystem, {
    dshHome, agentsHome: join(directory, '.agents'), watch: false,
  });
  try {
    assert.equal((await ctx.skills.list({ cwd })).some(item => item.name === skill.skillId), false);

    const installed = await store.install(skill);
    await publishSkillObservation(ctx, installed.directory);
    const discovered = await ctx.skills.list({ cwd });
    assert.equal(discovered.find(item => item.name === skill.skillId)?.source, 'user-dsh');
    const loaded = await ctx.skills.get(skill.skillId, { cwd });
    assert.equal(loaded?.content, 'Body revision 1.');
    assert.equal(loaded?.path, join(installed.directory, 'SKILL.md'));
    assert.deepEqual(loaded?.resourceBase, { kind: 'directory', path: installed.directory });
    assert.deepEqual(loaded?.invocation, { modelInvocable: true, userInvocable: true });

    revision = 2;
    await store.update(skill.id, true);
    await publishSkillObservation(ctx, installed.directory);
    assert.equal((await ctx.skills.list({ cwd })).find(item => item.name === skill.skillId)?.description, 'Discovery revision 2');
    assert.equal((await ctx.skills.get(skill.skillId, { cwd }))?.content, 'Body revision 2.');

    await store.uninstall(skill.id, true);
    await publishSkillObservation(ctx, installed.directory);
    assert.equal((await ctx.skills.list({ cwd })).some(item => item.name === skill.skillId), false);
    assert.equal(await ctx.skills.get(skill.skillId, { cwd }), undefined);
  } finally {
    await filesystem.dispose();
    await registry.dispose();
    await localFs.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
