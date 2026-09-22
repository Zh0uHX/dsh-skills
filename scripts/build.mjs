import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'], outfile: 'lib/index.cjs',
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  external: ['@deepseek-ai/*'],
});

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
await build({
  absWorkingDir: root,
  entryPoints: ['src/client.tsx'], outfile: 'lib/client.js',
  platform: 'browser', target: 'es2022', format: 'cjs', bundle: true,
  external: ['react', 'react/jsx-runtime'], jsx: 'automatic', minify: false,
  define: { __DSH_SKILLS_STYLES__: JSON.stringify(styles) },
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-skills", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
});
