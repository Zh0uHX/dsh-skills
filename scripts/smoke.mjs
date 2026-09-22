import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

if (!process.env.DSH_URL) {
  throw new Error('Set DSH_URL to an isolated DSH WebUI URL, including its login token.');
}

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(process.env.DSH_URL, { waitUntil: 'networkidle' });
  // DSH defers its welcome notice and model setup until after hydration.
  await page.waitForTimeout(1000);
  for (const name of ['继续', '稍后配置']) {
    const button = page.getByRole('button', { name, exact: true });
    if (await button.isVisible()) await button.click();
    await page.waitForTimeout(500);
  }

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: 'Skills', exact: true }).click();
  // Refuse to run against an environment that already has managed skills.
  await page.getByRole('button', { name: '已安装 0', exact: true }).waitFor();
  await page.getByLabel('搜索关键词').fill('find-skills');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.locator('.dsh-skills-item').first().waitFor({ timeout: 90_000 });

  const card = page.locator('.dsh-skills-item').filter({
    has: page.locator('.dsh-skills-source', { hasText: 'vercel-labs/skills' }),
  }).first();
  await card.getByRole('button', { name: '安装', exact: true }).click();
  await card.getByText('安装完成，可在 DSH 对话中使用。').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: /^已安装 / }).click();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await page.getByText('已是最新内容', { exact: false }).waitFor({ timeout: 60_000 });

  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '更新', exact: true }).click();
  await page.getByRole('button', { name: '确认替换', exact: true }).click();
  await page.getByText('已更新，后续技能加载将使用新文件。').waitFor({ timeout: 60_000 });

  await page.getByRole('button', { name: '卸载', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('.dsh-skills-item').count(), 1);
  await page.getByRole('button', { name: '卸载', exact: true }).click();
  await page.getByRole('button', { name: '确认卸载', exact: true }).click();
  await page.getByText('还没有安装技能', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('LIFECYCLE_OK, browser errors: 0');
} finally {
  await browser.close();
}
