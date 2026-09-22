import assert from 'node:assert/strict';
import { test } from 'node:test';
import { skillsPageUrl } from '../src/client.js';

test('catalog links preserve both Skills.sh hostnames and detail paths', () => {
  for (const host of ['skills.sh', 'www.skills.sh']) {
    const value = `https://${host}/vercel-labs/skills/find-skills`;
    assert.equal(skillsPageUrl(value), value);
  }
});

test('catalog links never navigate to arbitrary origins or executable schemes', () => {
  for (const value of ['javascript:alert(1)', 'https://skills.sh.evil.test/x', 'http://skills.sh/x', 'https://evil.test', 'https://user@skills.sh/x', 'not a URL']) {
    assert.equal(skillsPageUrl(value), 'https://www.skills.sh');
  }
});
