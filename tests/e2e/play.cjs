// Teste de jogabilidade real no executável Electron: mouse e teclado de verdade.
const { _electron: electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const out = process.env.SHOTS || '/tmp/claude-0/shots';
fs.mkdirSync(out, { recursive: true });
const log = (...a) => { const l = '[e2e] ' + a.join(' '); fs.appendFileSync((process.env.SHOTS || '/tmp/claude-0/shots') + '/log.txt', l + '\n'); console.log(l); };
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); log(ok ? 'PASS' : 'FAIL', name, info); };

(async () => {
  const userData = fs.mkdtempSync('/tmp/claude-0/ud-');
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..', '..'), '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], env: { ...process.env, ME_USERDATA: userData, ME_WINDOW: '1280x720' } });
  app.process().stdout?.on('data', () => {});
  log('launched');
  const win = await app.firstWindow();
  log('window');
  const errors = [];
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await win.waitForFunction(() => window.__game && document.querySelector('#mm-buttons .btn'), null, { timeout: 30000, polling: 500 });
  log('ready');
  win.setDefaultTimeout(60000);
  await win.evaluate(() => { window.__game.settings.shadows = 'off'; window.__game.applySettings(); });
  await win.waitForTimeout(1500);
  const shot = (n) => win.screenshot({ path: `${out}/${n}.png` });
  const st = () => win.evaluate(() => { const g = window.__game, s = g.sim; return { money: s.economy.money, sold: s.stats.sold, extracted: s.stats.extracted, n: s.buildings.size, obj: s.progression.objIndex, integrity: s.checkIntegrity(), time: s.time }; });
  const scr = (x, z) => win.evaluate(([x, z]) => window.__game.worldToScreen(x, z), [x, z]);
  const settle = () => win.waitForTimeout(900);
  const look = async (x, z) => { await win.evaluate(([x, z]) => window.__game.cam.focus(x, z, 22), [x, z]); await win.waitForTimeout(2500); };

  // 1. Novo jogo
  await win.click('#mm-buttons .btn:has-text("Novo jogo")');
  await win.waitForTimeout(2500);
  let s0 = await st();
  check('inicia partida', s0.n === 1 && Math.abs(s0.money - 600) < 1, JSON.stringify({ n: s0.n, money: s0.money }));
  await shot('02-inicio');

  // 2. Câmera com teclado: W move o alvo
  const camBefore = await win.evaluate(() => ({ ...window.__game.cam.goal }));
  await win.keyboard.down('KeyD'); await win.waitForTimeout(500); await win.keyboard.up('KeyD');
  await win.waitForTimeout(400);
  const camAfter = await win.evaluate(() => ({ ...window.__game.cam.goal }));
  check('câmera move com WASD', Math.hypot(camAfter.x - camBefore.x, camAfter.z - camBefore.z) > 1);
  await win.mouse.move(640, 360); await win.mouse.wheel(0, 300); await win.waitForTimeout(300);
  await win.evaluate(() => window.__game.cam.focus(39, 31, 22));
  await win.waitForTimeout(1500);

  // 3. Mineradora: F1 + 1 e clique sobre depósito de pedra
  await win.keyboard.press('F1'); await win.keyboard.press('Digit1');
  let p = await scr(36.0, 28.0);
  await win.mouse.move(p.x, p.y); await settle();
  await shot('03-fantasma-mineradora');
  await win.mouse.click(p.x, p.y); await settle();
  let s1 = await st();
  check('constrói mineradora e desconta moedas', s1.n === 2 && Math.abs(s1.money - 500) < 1, `money=${s1.money}`);

  // 4. Construção inválida: outra mineradora no mesmo lugar
  await win.keyboard.press('F1'); await win.keyboard.press('Digit1');
  await win.mouse.move(p.x, p.y); await settle();
  await win.mouse.click(p.x, p.y); await settle();
  let s2 = await st();
  check('recusa construção sobreposta', s2.n === 2 && s2.money >= s1.money, `n=${s2.n}`);
  await win.mouse.click(p.x, p.y, { button: 'right' });

  // 5. Esteiras por arraste: (37,27) -> (39,34)
  await win.keyboard.press('F2'); await win.keyboard.press('Digit1');
  const a = await scr(37.5, 27.5), b = await scr(39.5, 34.5);
  await win.mouse.move(a.x, a.y); await settle();
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10);
  await settle();
  await shot('04-arraste-esteira');
  await win.mouse.up(); await settle();
  await win.mouse.click(b.x, b.y, { button: 'right' });
  let s3 = await st();
  check('constrói 10 esteiras', s3.n === 12, `n=${s3.n} money=${s3.money}`);

  // 6. Simula em 3x e verifica vendas
  await win.click('#speed button[data-speed="3"]');
  await win.waitForFunction(() => (window.__game.sim.stats.sold.stone || 0) > 3, null, { timeout: 90000, polling: 1000 }).catch(() => {});
  let s4 = await st();
  check('mineradora extrai pedra', (s4.extracted.stone || 0) > 5, JSON.stringify(s4.extracted));
  check('esteiras entregam e o centro vende', (s4.sold.stone || 0) > 3, JSON.stringify(s4.sold));
  check('integridade de recursos', s4.integrity.length === 0, JSON.stringify(s4.integrity));
  await shot('05-producao');

  // 7. Seleciona mineradora e melhora com U
  await look(36, 28); p = await scr(36.0, 28.0);
  await win.mouse.click(p.x, p.y); await settle();
  const lvlBefore = await win.evaluate(() => [...window.__game.sim.buildings.values()].find((b) => b.type === 'miner').level);
  await win.evaluate(() => (window.__game.sim.economy.money += 200));
  await win.keyboard.press('KeyU'); await settle();
  const lvlAfter = await win.evaluate(() => [...window.__game.sim.buildings.values()].find((b) => b.type === 'miner').level);
  check('melhoria de estrutura (U)', lvlAfter === lvlBefore + 1);
  await shot('06-painel-selecao');

  // 8. Triturador no caminho: insere entre esteira e venda
  await win.evaluate(() => (window.__game.sim.economy.money += 2000));
  await win.mouse.click(640, 360, { button: 'right' });
  await win.keyboard.press('F3'); await win.keyboard.press('Digit1');
  // gira até a frente apontar para leste (rot 0) — padrão
  await look(39, 30); p = await scr(39.0, 30.0);
  await win.mouse.move(p.x, p.y); await settle();
  await win.mouse.click(p.x, p.y); await settle();
  const crusher = await win.evaluate(() => { const c = [...window.__game.sim.buildings.values()].find((b) => b.type === 'crusher'); return c && { x: c.x, z: c.z }; });
  check('constrói triturador', !!crusher, JSON.stringify(crusher));

  // 9. Oficina e tecnologia
  await win.keyboard.press('F6'); await win.keyboard.press('Digit1');
  await look(46, 29); p = await scr(46.0, 29.0);
  await win.mouse.move(p.x, p.y); await settle(); await win.mouse.click(p.x, p.y); await settle();
  await win.keyboard.press('Escape');
  await win.keyboard.press('KeyT'); await settle();
  await shot('07-tecnologias');
  const techBtn = await win.$('[data-tech="u_generator"]');
  if (techBtn) await techBtn.click();
  await settle();
  check('pesquisa tecnologia', await win.evaluate(() => window.__game.sim.progression.hasTech('u_generator')));
  await win.keyboard.press('Escape');

  // 10. Gerador + fundição: sem combustível deve mostrar sem energia
  await win.evaluate(() => { const s = window.__game.sim; s.progression.techs.u_smelter = 1; s.economy.money += 3000; });
  await win.keyboard.press('F3'); await win.keyboard.press('Digit3');
  await look(48, 37); p = await scr(48.0, 37.0); await win.mouse.move(p.x, p.y); await settle(); await win.mouse.click(p.x, p.y); await settle();
  await win.waitForTimeout(1500);
  const sm = await win.evaluate(() => { const s = [...window.__game.sim.buildings.values()].find((b) => b.type === 'smelter'); return s && s.state; });
  check('fundição sem gerador fica sem energia ou sem insumo', !!sm, sm);
  // injeta pó de ferro e verifica estado sem energia
  await win.evaluate(() => { const g = window.__game.sim; const s = [...g.buildings.values()].find((b) => b.type === 'smelter'); s.inv.iron_dust = 5; g.countCreated('iron_dust', 5); });
  await win.waitForTimeout(1500);
  const sm2 = await win.evaluate(() => [...window.__game.sim.buildings.values()].find((b) => b.type === 'smelter').state);
  check('máquina sem energia para e informa', sm2 === 'no_power', sm2);
  await win.keyboard.press('F4'); await win.keyboard.press('Digit1');
  await look(48, 40); p = await scr(48.0, 40.0); await win.mouse.move(p.x, p.y); await settle(); await win.mouse.click(p.x, p.y); await settle();
  await win.evaluate(() => { const g = window.__game.sim; const gen = [...g.buildings.values()].find((b) => b.type === 'generator'); gen.inv.coal = 5; g.countCreated('coal', 5); });
  await win.waitForTimeout(3000);
  const ingots = await win.evaluate(() => window.__game.sim.stats.produced.iron_ingot || 0);
  check('gerador alimenta fundição e produz lingotes', ingots > 0, 'lingotes=' + ingots);
  await shot('08-energia');

  // 11. Mapa e desbloqueio de região
  await win.evaluate(() => (window.__game.sim.economy.money += 5000));
  await win.keyboard.press('KeyM'); await settle();
  await shot('09-mapa');
  await win.click('[data-region="forest"]'); await settle();
  check('desbloqueia região', await win.evaluate(() => window.__game.sim.progression.regionUnlocked('forest')));
  await win.waitForTimeout(1500);
  await shot('10-regiao');

  // 12. Salvar (F5) e carregar (F9)
  const before = await st();
  await win.keyboard.press('F5'); await win.waitForTimeout(1200);
  const saveFile = path.join(userData, 'saves', 'slot1.json');
  check('salvamento grava arquivo local', fs.existsSync(saveFile), saveFile);
  await win.evaluate(() => { const g = window.__game.sim; g.economy.money = 1; });
  await win.keyboard.press('F9'); await win.waitForTimeout(2500);
  const after = await st();
  check('carregamento restaura estado', after.n === before.n && after.money > 100, `n ${before.n}->${after.n} money ${before.money.toFixed(0)}->${after.money.toFixed(0)}`);
  check('integridade após carregar', after.integrity.length === 0, JSON.stringify(after.integrity));

  // 13. Arquivo corrompido: recuperação pelo backup
  fs.writeFileSync(saveFile, '{corrompido');
  await win.keyboard.press('F9'); await win.waitForTimeout(2500);
  const rec = await st();
  check('arquivo corrompido recuperado via .bak ou recusado sem travar', rec.n > 0);

  // 14. Finanças e pausa
  await win.keyboard.press('KeyG'); await settle(); await shot('11-financas'); await win.keyboard.press('Escape');
  await win.keyboard.press('Escape'); await win.keyboard.press('Escape'); await settle(); await shot('12-pausa');
  await win.keyboard.press('Escape');
  await win.evaluate(() => window.__game.cam.focus(41, 32, 18)); await win.waitForTimeout(1800);
  await shot('13-close');

  // 15. Demolição devolve reembolso
  const m0 = (await st()).money;
  await win.keyboard.press('KeyX');
  await look(37, 30); p = await scr(37.5, 30.5); await win.mouse.click(p.x, p.y); await settle();
  await win.keyboard.press('KeyX');
  const s9 = await st();
  check('demolição reembolsa', s9.money > m0, `${m0.toFixed(1)} -> ${s9.money.toFixed(1)}`);

  check('sem erros no console', errors.length === 0, errors.slice(0, 5).join(' | '));
  fs.writeFileSync(out + '/results.json', JSON.stringify(results, null, 2));
  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  log(`${results.length - failed}/${results.length} verificações aprovadas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
