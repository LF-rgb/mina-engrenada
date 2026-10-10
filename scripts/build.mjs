// Gera dist/ (HTML + CSS + bundle JS único, sem dependências externas em tempo de execução)
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync } from 'fs';
const root = new URL('..', import.meta.url).pathname;
rmSync(root + 'dist', { recursive: true, force: true });
mkdirSync(root + 'dist', { recursive: true });
await build({
  entryPoints: [root + 'src/main.js'],
  bundle: true, format: 'esm', target: 'chrome120', minify: process.argv.includes('--min'),
  sourcemap: false, outfile: root + 'dist/main.js', logLevel: 'warning',
});
copyFileSync(root + 'src/index.html', root + 'dist/index.html');
copyFileSync(root + 'src/style.css', root + 'dist/style.css');
console.log('build ok → dist/');
