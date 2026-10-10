// Teste real: abre o executável Electron, captura telas e erros do console.
const { _electron: electron } = require('playwright-core');
const path = require('path');
(async () => {
  const out = process.env.SHOTS || '/tmp/claude-0/shots';
  require('fs').mkdirSync(out, { recursive: true });
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..', '..'), '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], env: { ...process.env, ME_TEST: '1' } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await win.setViewportSize({ width: 1600, height: 900 }).catch(() => {});
  await win.waitForTimeout(6000);
  await win.screenshot({ path: out + '/01-menu.png' });
  console.log('ERRORS:', errors.slice(0, 20).join('\n'));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
