import assert from 'node:assert/strict';
import test from 'node:test';
import { SkillsShSource } from '../src/catalog.js';
import { SkillError, type CatalogSkill } from '../src/types.js';

const skill: CatalogSkill = {
  id: 'vercel-labs/skills/find-skills',
  skillId: 'find-skills',
  name: 'find-skills',
  source: 'vercel-labs/skills',
  installs: 42,
  url: 'https://www.skills.sh/vercel-labs/skills/find-skills',
};
const markdown = '---\nname: find-skills\ndescription: Find skills\n---\n# Find skills\n';
const snapshot = {
  hash: 'a'.repeat(64),
  files: [{ path: 'SKILL.md', contents: markdown }, { path: 'scripts/check.py', contents: 'print("ok")\n' }],
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const mockFetch = (handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) =>
  (async (input: string | URL | Request, init?: RequestInit) => handler(new URL(String(input)), init)) as typeof fetch;

test('search uses the live public response contract and enriches descriptions', async () => {
  const calls: URL[] = [];
  const source = new SkillsShSource(mockFetch((url, init) => {
    calls.push(url);
    assert.equal(init?.redirect, 'manual');
    if (url.pathname === '/api/search') {
      assert.equal(url.searchParams.get('q'), 'react native');
      assert.equal(url.searchParams.get('limit'), '20');
      return json({ skills: [skill] });
    }
    return new Response('<script type="application/ld+json">{"@type":"SoftwareApplication","description":"Find relevant skills & tools."}</script>');
  }));
  const result = await source.search('  react native  ');
  assert.equal(result[0]!.description, 'Find relevant skills & tools.');
  assert.equal(result[0]!.installs, 42);
  assert.equal(result[0]!.url, skill.url);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((url) => url.origin === 'https://www.skills.sh'));
});

test('description failure does not hide search results; invalid catalog rows are discarded', async () => {
  const source = new SkillsShSource(mockFetch((url) => url.pathname === '/api/search'
    ? json({ skills: [skill, { ...skill, id: '../../escape' }, { ...skill, installs: -1 }] })
    : new Response('temporarily unavailable', { status: 503 })));
  const result = await source.search('find');
  assert.equal(result.length, 1);
  assert.equal(result[0]!.description, '暂无简介');
});

test('query length is validated before making requests', async () => {
  const source = new SkillsShSource(mockFetch(() => { throw new Error('unexpected request'); }));
  for (const query of ['a', ' '.repeat(4), 'x'.repeat(101)]) {
    await assert.rejects(source.search(query), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_QUERY');
  }
});

test('detail falls back to decoded HTML metadata, regardless of attribute order', async () => {
  const source = new SkillsShSource(mockFetch(() => new Response('<meta content="A &amp; B &#x27;tool&#39;" name="description">')));
  assert.equal((await source.details(skill)).description, "A & B 'tool'");
});

test('download preserves the complete text snapshot and canonical source metadata', async () => {
  const source = new SkillsShSource(mockFetch((url) => {
    assert.equal(url.pathname, '/api/download/vercel-labs/skills/find-skills');
    return json(snapshot);
  }));
  const bundle = await source.download(skill);
  assert.deepEqual(bundle.files, snapshot.files);
  assert.equal(bundle.upstreamHash, snapshot.hash);
  assert.equal(bundle.skill.id, skill.id);
});

test('download rejects traversal, duplicate paths, missing entrypoint and mismatched skill names', async () => {
  const cases = [
    { ...snapshot, files: [...snapshot.files, { path: '../secret', contents: '' }] },
    { ...snapshot, files: [...snapshot.files, { path: '/absolute', contents: '' }] },
    { ...snapshot, files: [...snapshot.files, { path: 'a\\b', contents: '' }] },
    { ...snapshot, files: [...snapshot.files, { path: 'SKILL.md', contents: '' }] },
    { ...snapshot, files: [{ path: 'README.md', contents: markdown }] },
    { ...snapshot, files: [{ path: 'SKILL.md', contents: markdown.replace('name: find-skills', 'name: different') }] },
  ];
  for (const payload of cases) {
    const source = new SkillsShSource(mockFetch(() => json(payload)));
    await assert.rejects(source.download(skill), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_SNAPSHOT');
  }
});

test('download rejects conflicting catalog identity without network access', async () => {
  const source = new SkillsShSource(mockFetch(() => { throw new Error('unexpected request'); }));
  await assert.rejects(source.download({ ...skill, source: 'someone/else' }), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_SKILL');
});

test('download rejects names that Skills.sh can slugify but DSH cannot discover', async () => {
  for (const name of ['Find Skills', 'find_skills', 'find--skills', '-find-skills']) {
    const source = new SkillsShSource(mockFetch(() => json({
      ...snapshot, files: [{ path: 'SKILL.md', contents: markdown.replace('name: find-skills', `name: ${name}`) }],
    })));
    await assert.rejects(source.download(skill), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_SNAPSHOT', name);
  }
});

test('download rejects frontmatter types, BOM and invocation fields rejected by DSH', async () => {
  const contents = [
    '\uFEFF' + markdown,
    markdown.replace('description: Find skills', 'description: true'),
    ...['user-invocable: maybe', 'disable-model-invocation: []', 'userInvocable: true',
      'disableModelInvocation: false', 'modelInvocable: true'].map(line => markdown.replace('description: Find skills', `description: Find skills\n${line}`)),
  ];
  for (const content of contents) {
    const source = new SkillsShSource(mockFetch(() => json({ ...snapshot, files: [{ path: 'SKILL.md', contents: content }] })));
    await assert.rejects(source.download(skill), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_SNAPSHOT');
  }
});

test('download preserves DSH-compatible invocation fields without rewriting upstream files', async () => {
  for (const value of ['true', 'false', '1', '0', '"yes"', '"NO"', '"on"', '"off"']) {
    const contents = markdown.replace('description: Find skills', `description: Find skills\nuser-invocable: ${value}\ndisable-model-invocation: ${value}`);
    const source = new SkillsShSource(mockFetch(() => json({ ...snapshot, files: [{ path: 'SKILL.md', contents }] })));
    assert.equal((await source.download(skill)).files[0]?.contents, contents);
  }
});

test('download rejects files whose paths are also used as parent directories', async () => {
  const source = new SkillsShSource(mockFetch(() => json({
    ...snapshot,
    files: [...snapshot.files, { path: 'scripts', contents: 'not a directory' }],
  })));
  await assert.rejects(source.download(skill), (error: unknown) => error instanceof SkillError && error.code === 'INVALID_SNAPSHOT');
});

test('requests never follow redirects outside skills.sh', async () => {
  let requests = 0;
  const source = new SkillsShSource(mockFetch(() => {
    requests++;
    return new Response(null, { status: 302, headers: { location: 'https://example.org/private' } });
  }));
  await assert.rejects(source.search('find'), (error: unknown) => error instanceof SkillError && error.code === 'UNSAFE_REDIRECT');
  assert.equal(requests, 1);
});

test('redirect loops terminate after a bounded number of requests', async () => {
  let requests = 0;
  const source = new SkillsShSource(mockFetch(() => {
    requests++;
    return new Response(null, { status: 302, headers: { location: '/api/search?q=find' } });
  }));
  await assert.rejects(source.search('find'), (error: unknown) => error instanceof SkillError && error.code === 'TOO_MANY_REDIRECTS');
  assert.ok(requests <= 4);
});

test('domain skills stay discoverable but fail explicitly when no snapshot endpoint exists', async () => {
  const source = new SkillsShSource(mockFetch(() => { throw new Error('unexpected request'); }));
  await assert.rejects(source.download({ ...skill, id: 'open.feishu.cn/lark-doc', source: 'open.feishu.cn', skillId: 'lark-doc' }),
    (error: unknown) => error instanceof SkillError && error.code === 'UNSUPPORTED_SOURCE');
});

test('oversized responses and rate limits have actionable errors', async () => {
  const oversized = new SkillsShSource(mockFetch(() => new Response('{}', { headers: { 'content-length': '999999999' } })));
  await assert.rejects(oversized.search('find'), (error: unknown) => error instanceof SkillError && error.code === 'RESPONSE_TOO_LARGE');
  const limited = new SkillsShSource(mockFetch(() => new Response('', { status: 429 })));
  await assert.rejects(limited.search('find'), (error: unknown) => error instanceof SkillError && error.code === 'RATE_LIMITED');
});
