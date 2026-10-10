// Gera versões de arquivo único (HTML com JS e CSS embutidos):
//  - release/MinaEngrenada.html  -> abre com dois cliques no Edge/Chrome, offline
//  - release/artifact.html        -> versão publicada como página (sem doctype; o host adiciona)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const root = new URL('..', import.meta.url).pathname;
const r = await build({ entryPoints: [root + 'src/main.js'], bundle: true, format: 'iife', target: 'chrome110', minify: true, write: false, logLevel: 'warning' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(root + 'src/style.css', 'utf8');
let html = readFileSync(root + 'src/index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();
const head = `<title>Mina Engrenada</title>\n<style>\n:root{color-scheme:dark}\n${css}\n</style>\n`;
const script = `<script>\n${js}\n</script>`;
mkdirSync(root + 'release', { recursive: true });
writeFileSync(root + 'release/MinaEngrenada.html', `<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${head}</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`);
writeFileSync(root + 'release/artifact.html', `${head}${body}\n${script}\n`);
console.log('ok', (js.length / 1024).toFixed(0) + ' KB de JS');
